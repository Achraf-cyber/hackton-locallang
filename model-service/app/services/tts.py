"""Synthese vocale (text-to-speech) pour le Dioula et le Moore via les modeles
VITS facebook/mms-tts-dyu et facebook/mms-tts-mos.

Quand Settings.MODEL_STACK == "goaicorp", le TTS Mooré utilise
goaicorp/mos-tts (CC-BY-NC 4.0, GO AI Corporation) à la place de
facebook/mms-tts-mos. L'architecture est identique (VITS/MMS-TTS) : le
code de synthese est donc entierement reutilise, seul le repo_id change.

LE TTS DIOULA NE CHANGE PAS : GO AI n'a pas de modele TTS pour le dioula.
facebook/mms-tts-dyu est utilise dans les deux stacks."""

import io
import logging
import re

import numpy as np
import soundfile as sf
import torch
from pydub import AudioSegment
from transformers import VitsModel, VitsTokenizer

from app.deps import get_settings

logger = logging.getLogger("model-service.tts")

MMS_TTS_MODEL_NAMES = {
    "dyu": "facebook/mms-tts-dyu",
    "mos": "facebook/mms-tts-mos",
}

# Stack GO AI pour le TTS Mooré uniquement (CC-BY-NC 4.0).
# Le dioula utilise TOUJOURS facebook/mms-tts-dyu (pas de modele GO AI dyu).
GOAICORP_TTS_MODEL_NAMES = {
    "mos": "goaicorp/mos-tts",
    "dyu": "facebook/mms-tts-dyu",  # inchangé : GO AI n'a pas de modèle dyu TTS
}

MAX_CHARS_BEFORE_SPLIT = 500
SILENCE_SECONDS = 0.3
MIN_SEGMENT_LETTERS = 4

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_LETTERS_RE = re.compile(r"[^a-zA-ZÀ-ÖØ-öø-ÿ]")
_SENTENCE_END_RE = re.compile(r"[.!?]+")

_ACCENT_TRANSLATION = str.maketrans(
    {
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "à": "a", "â": "a", "ä": "a",
        "î": "i", "ï": "i",
        "ô": "o", "ö": "o",
        "ù": "u", "û": "u", "ü": "u",
        "ç": "s",
        "ñ": "n",
    }
)
_CONSONANT_FALLBACK = {"c": "k", "h": "", "j": "z", "q": "k", "x": "ks"}
_CH_DIGRAPH_RE = re.compile(r"ch", re.IGNORECASE)

# Convention administrative francophone : NOM en majuscules, Prenom en casse
# normale (ex. "SIMBRE Achraf"). VITS (mms-tts) traite un mot tout en
# majuscules comme une unite a part (sigle/acronyme) et marque une coupure
# audible avant le mot suivant -- un nom de famille se retrouve alors detache
# du prenom au lieu d'etre prononce comme un seul groupe. Les vrais sigles
# sont deja proscrits en amont (MT_FRIENDLY_RULE, backend/lib/llm.ts) donc on
# neutralise sans risque la casse de tout mot entierement en majuscules.
_ALLCAPS_WORD_RE = re.compile(r"\b[A-ZÀ-Ö]{2,}\b")


def _normalize_allcaps_names(text: str) -> str:
    return _ALLCAPS_WORD_RE.sub(lambda m: m.group(0).capitalize(), text)


class TTS:
    _instance = None

    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._models: dict[str, VitsModel] = {}
        self._tokenizers: dict[str, VitsTokenizer] = {}
        self._allowed_chars: dict[str, set[str]] = {}
        self._omnivoice_model = None
        # MODEL_STACK determine quel repo_id utiliser pour le TTS Mooré.
        # Le TTS dioula est toujours sur facebook/mms-tts-dyu (GO AI n'a
        # pas de modele dyu TTS).
        from app.deps import get_settings as _gs
        _s = _gs()
        self._tts_model_names = (
            GOAICORP_TTS_MODEL_NAMES if _s.MODEL_STACK == "goaicorp"
            else MMS_TTS_MODEL_NAMES
        )
        if _s.MODEL_STACK == "goaicorp":
            logger.info("TTS: stack=goaicorp pour Mooré (goaicorp/mos-tts, CC-BY-NC 4.0) ; "
                        "Dioula inchangé (facebook/mms-tts-dyu)")
        self._hf_token = _s.HF_TOKEN

    @classmethod
    def get_instance(cls) -> "TTS":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_model(self, lang: str) -> tuple[VitsModel, VitsTokenizer]:
        if lang not in self._tts_model_names:
            raise ValueError(f"Langue non supportee: {lang}")
        if lang not in self._models:
            model_name = self._tts_model_names[lang]
            self._tokenizers[lang] = VitsTokenizer.from_pretrained(
                model_name, token=self._hf_token
            )
            model = VitsModel.from_pretrained(
                model_name, token=self._hf_token
            ).to(self.device)
            model.eval()
            self._models[lang] = model
        return self._models[lang], self._tokenizers[lang]

    def _split_text(self, text: str) -> list[str]:
        text = text.strip()
        if len(text) <= MAX_CHARS_BEFORE_SPLIT:
            return [text]
        sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]
        packed = self._pack_sentences(sentences, MAX_CHARS_BEFORE_SPLIT)
        return self._merge_short_segments(packed)

    def _pack_sentences(self, sentences: list[str], max_chars: int) -> list[str]:
        """Regroupe les phrases par paquets (chacun <= max_chars) au lieu de
        creer un segment audio par phrase : synthetiser chaque phrase seule
        cree une coupure/redemarrage de prosodie audible entre CHAQUE phrase
        (VITS traite chaque appel comme un discours complet independant).
        En regroupant plusieurs phrases par appel (adouci ensuite par
        _soften_internal_sentence_ends), on ne cree une vraie coupure que la
        ou elle est necessaire (limite de longueur), pas a chaque point."""
        chunks: list[str] = []
        current = ""
        for sentence in sentences:
            candidate = f"{current} {sentence}".strip() if current else sentence
            if current and len(candidate) > max_chars:
                chunks.append(current)
                current = sentence
            else:
                current = candidate
        if current:
            chunks.append(current)
        return chunks

    def _merge_short_segments(self, segments: list[str]) -> list[str]:
        """Fusionne les fragments trop courts (ex. '1.' d'une liste numerotee)
        avec le fragment suivant : VITS plante (narrow(): length must be
        non-negative) sur une sequence phonemisee trop courte."""
        merged: list[str] = []
        buffer = ""
        for seg in segments:
            buffer = f"{buffer} {seg}".strip() if buffer else seg
            if len(_LETTERS_RE.sub("", buffer)) >= MIN_SEGMENT_LETTERS:
                merged.append(buffer)
                buffer = ""
        if buffer:
            if merged:
                merged[-1] = f"{merged[-1]} {buffer}".strip()
            else:
                merged.append(buffer)
        return merged

    def _get_allowed_chars(self, lang: str) -> set[str]:
        if lang not in self._allowed_chars:
            _, tokenizer = self._get_model(lang)
            vocab = tokenizer.get_vocab()
            self._allowed_chars[lang] = {k for k in vocab if len(k) == 1} | {" ", "'", "-"}
        return self._allowed_chars[lang]

    def _normalize_foreign_chars(self, text: str, lang: str) -> str:
        """Remplace chaque lettre absente du vocabulaire de la langue cible
        par l'approximation phonetique la plus proche (voir commentaire plus
        haut). Les mots deja ecrits dans l'alphabet de la langue cible ne
        contiennent, par construction, que des lettres deja autorisees : cette
        fonction ne les modifie donc pas."""
        allowed = self._get_allowed_chars(lang)

        # Digramme francais "ch" (/sh/) : a traiter comme une unite AVANT le
        # remplacement lettre par lettre, seulement si 'h' n'est pas dans
        # l'alphabet cible (sinon les deux lettres existent deja separement,
        # ex. dyu, et on les laisse telles quelles).
        if "h" not in allowed:
            text = _CH_DIGRAPH_RE.sub("s" if "s" in allowed else "", text)

        text = text.translate(_ACCENT_TRANSLATION)

        result = []
        for ch in text:
            if ch in allowed or ch.lower() in allowed:
                result.append(ch)
            else:
                result.append(_CONSONANT_FALLBACK.get(ch.lower(), ch))
        return "".join(result)

    def _soften_internal_sentence_ends(self, text: str) -> str:
        """VITS (MMS-TTS) est entraine phrase par phrase : il plaque une
        cadence "fin de discours" (intonation descendante + pause longue) sur
        CHAQUE ponctuation finale, meme au milieu d'un texte a lire d'une
        traite. On adoucit donc les points/! /? internes (tous sauf le
        dernier) en virgule, pour que seule la toute fin du segment sonne
        comme une fin ; les phrases intermediaires gardent juste une pause
        courte, plus naturelle a l'oreille."""
        matches = list(_SENTENCE_END_RE.finditer(text))
        if len(matches) <= 1:
            return text
        chars = list(text)
        for m in matches[:-1]:
            start, end = m.span()
            chars[start:end] = [","]
        return "".join(chars)

    def _synthesize_segment(self, text: str, lang: str) -> np.ndarray:
        model, tokenizer = self._get_model(lang)
        text = self._soften_internal_sentence_ends(text)
        text = self._normalize_foreign_chars(text, lang)
        inputs = tokenizer(text, return_tensors="pt").to(self.device)
        with torch.no_grad():
            output = model(**inputs).waveform
        return output.squeeze().cpu().numpy()

    def _get_omnivoice_model(self):
        if self._omnivoice_model is None:
            from omnivoice import OmniVoice
            # on utilise cuda si disponible, sinon cpu
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            # CPU est plus stable avec float32 pour l'inference
            dtype = torch.float32 if device == "cpu" else torch.float16
            self._omnivoice_model = OmniVoice.from_pretrained(
                "k2-fsa/OmniVoice",
                device_map=device,
                dtype=dtype
            )
        return self._omnivoice_model

    def _write_ogg_opus(self, audio: np.ndarray, sample_rate: int, output_path: str) -> None:
        """Encode la forme d'onde en OGG/Opus, le SEUL format que l'API Bot
        Telegram accepte de façon fiable pour un message vocal (sendVoice
        exige .ogg/OPUS ; sendAudio exige MP3/M4A -- ni l'un ni l'autre
        n'accepte du WAV brut, ce qu'on envoyait avant : Telegram acceptait
        l'upload mais le fichier restait illisible côté client, aussi bien
        dans l'appli que si l'usager le sauvegardait et l'ouvrait ailleurs).
        Passe par un WAV en mémoire (soundfile) puis pydub/ffmpeg pour
        l'encodage Opus (ffmpeg est déjà installé dans l'image Docker)."""
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, audio, sample_rate, format="WAV")
        wav_buffer.seek(0)
        segment = AudioSegment.from_file(wav_buffer, format="wav")
        segment.export(output_path, format="ogg", codec="libopus", bitrate="32k")

    def speak(self, text: str, lang: str, output_path: str) -> str:
        settings = get_settings()
        text = _normalize_allcaps_names(text)
        if lang == "dyu" and settings.TTS_BACKEND_DYU == "omnivoice":
            try:
                model = self._get_omnivoice_model()
                # Synthesiser l'audio avec Voice Design
                audio = model.generate(
                    text=text,
                    instruct="female, young adult, clear speech, neutral accent"
                )
                # OmniVoice retourne du 24 kHz
                self._write_ogg_opus(audio[0], 24000, output_path)
                return output_path
            except Exception as e:
                logger.warning("OmniVoice non disponible pour dyu, fallback sur MMS-TTS: %s", e)
                # Fallback sur MMS-TTS

        # TTS MMS
        model, _ = self._get_model(lang)
        sample_rate = model.config.sampling_rate

        segments = self._split_text(text)
        silence = np.zeros(int(SILENCE_SECONDS * sample_rate), dtype=np.float32)

        waveforms = []
        for i, segment in enumerate(segments):
            waveforms.append(self._synthesize_segment(segment, lang))
            if i < len(segments) - 1:
                waveforms.append(silence)

        audio = np.concatenate(waveforms) if len(waveforms) > 1 else waveforms[0]
        self._write_ogg_opus(audio, sample_rate, output_path)
        return output_path


if __name__ == "__main__":
    tts = TTS.get_instance()
    out = tts.speak("I ni ce. An be here?", lang="dyu", output_path="demo_dyu.ogg")
    print(f"Audio genere: {out}")
