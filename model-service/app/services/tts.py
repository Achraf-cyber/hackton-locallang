"""Synthese vocale (text-to-speech) pour le Dioula et le Moore via les modeles
VITS facebook/mms-tts-dyu et facebook/mms-tts-mos."""

import re

import numpy as np
import soundfile as sf
import torch
from transformers import VitsModel, VitsTokenizer

MMS_TTS_MODEL_NAMES = {
    "dyu": "facebook/mms-tts-dyu",
    "mos": "facebook/mms-tts-mos",
}

MAX_CHARS_BEFORE_SPLIT = 500
SILENCE_SECONDS = 0.3
MIN_SEGMENT_LETTERS = 4

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
_LETTERS_RE = re.compile(r"[^a-zA-ZÀ-ÖØ-öø-ÿ]")
_SENTENCE_END_RE = re.compile(r"[.!?]+")

# EXPERIMENTAL : NLLB laisse a raison les noms propres francais/anglais tels
# quels (ex. "Jean Dupont", "Tetouan") -- mais le tokenizer VITS de
# mms-tts-{dyu,mos} ne connait que l'alphabet phonetique de sa langue, et
# SUPPRIME SILENCIEUSEMENT toute lettre absente de son vocabulaire (verifie
# par inspection directe : "Achraf" -> "araf" en moore, "c" et "h" n'existant
# pas dans le vocabulaire mos). On remplace donc chaque lettre absente par
# l'approximation phonetique la plus proche plutot que de la perdre.
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


class TTS:
    _instance = None

    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._models: dict[str, VitsModel] = {}
        self._tokenizers: dict[str, VitsTokenizer] = {}
        self._allowed_chars: dict[str, set[str]] = {}

    @classmethod
    def get_instance(cls) -> "TTS":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_model(self, lang: str) -> tuple[VitsModel, VitsTokenizer]:
        if lang not in MMS_TTS_MODEL_NAMES:
            raise ValueError(f"Langue non supportee: {lang}")
        if lang not in self._models:
            model_name = MMS_TTS_MODEL_NAMES[lang]
            self._tokenizers[lang] = VitsTokenizer.from_pretrained(model_name)
            model = VitsModel.from_pretrained(model_name).to(self.device)
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

    def speak(self, text: str, lang: str, output_path: str) -> str:
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
        sf.write(output_path, audio, sample_rate)
        return output_path


if __name__ == "__main__":
    tts = TTS.get_instance()
    out = tts.speak("I ni ce. An be here?", lang="dyu", output_path="demo_dyu.wav")
    print(f"Audio genere: {out}")
