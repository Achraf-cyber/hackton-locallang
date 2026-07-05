"""Reconnaissance vocale (speech-to-text) pour le Dioula, le Moore et le francais
via facebook/mms-1b-all.

Quatre backends, choisis par Settings.ASR_BACKEND, et une stack GO AI distincte
contrôlee par Settings.MODEL_STACK :
- "local" (defaut) : Wav2Vec2ForCTC + AutoProcessor charges en local.
- "hf_api" : pont temporaire vers l'API d'inference Hugging Face, utile tant
  que le modele local (~3.86 Go) n'est pas entierement telecharge.
  ATTENTION : facebook/mms-1b-all n'est deploye sur AUCUN provider
  d'inference HF (verifie : liste de providers vide). Le backend "hf_api"
  utilise donc openai/whisper-large-v3 a la place, qui NE supporte PAS
  officiellement le Dioula ni le Moore (~99 langues entrainees, dyu/mos
  absentes) : fiable seulement pour lang="fra", best-effort pour dyu/mos.
- "omnilingual" / "omnilingual_ctc" / "omnilingual_llm" : Meta Omnilingual ASR
  (2025), couvre nativement dyu/mos (verifie via lang_ids.py du modele) --
  respectivement omniASR_CTC_300M_v2, omniASR_CTC_1B, omniASR_LLM_7B (le plus
  gros et le plus precis, utilise en prod -- voir model-service/Dockerfile).
  Necessite le paquet omnilingual-asr (fairseq2 + fairseq2n), qui n'a AUCUN
  wheel Windows -- fonctionne uniquement sous Linux/WSL. L'import est fait en
  lazy pour ne pas casser les backends "local"/"hf_api" sur une machine
  Windows sans ce paquet.

Quand Settings.MODEL_STACK == "goaicorp", tous les backends ci-dessus sont
ignores au profit des modeles GO AI Corporation (licence CC-BY-NC 4.0) :
  goaicorp/mos-asr  (Mooré)
  goaicorp/dyu-asr  (Dioula)
Charges via transformers pipeline("automatic-speech-recognition"), qui est
agnostique de l'architecture (Whisper, Wav2Vec2, etc.) et s'adapte
automatiquement au modele telecharge.
Le contrat de transcribe(audio_path, lang) est identique dans tous les cas.
"""

import logging

import numpy as np
import torch
from huggingface_hub import InferenceClient
from pydub import AudioSegment
from transformers import AutoProcessor, Wav2Vec2ForCTC

from app.deps import get_settings

logger = logging.getLogger("model-service.asr")

MODEL_NAME = "facebook/mms-1b-all"
HF_API_MODEL_NAME = "openai/whisper-large-v3"

# Stack GO AI (MODEL_STACK=goaicorp) — modeles specialises par langue
# Licence CC-BY-NC 4.0 (contact commercial : aristide@goaicorporation.org)
GOAICORP_ASR_MODEL_NAMES = {
    "mos": "goaicorp/mos-asr",
    "dyu": "goaicorp/dyu-asr",
    # Pas de modele GO AI pour le français : fallback sur Whisper (hf_api)
    "fra": "openai/whisper-large-v3",
}

MMS_LANG_CODES = {
    "dyu": "dyu",
    "mos": "mos",
    "fra": "fra",
}

OMNILINGUAL_MODEL_CARD = "omniASR_CTC_300M_v2"
OMNILINGUAL_CTC_MODEL_CARD = "omniASR_CTC_1B"
OMNILINGUAL_LLM_MODEL_CARD = "omniASR_LLM_7B"
OMNILINGUAL_LANG_CODES = {
    "dyu": "dyu_Latn",
    "mos": "mos_Latn",
    "fra": "fra_Latn",
}

TARGET_SAMPLE_RATE = 16_000
WINDOW_SECONDS = 30
OVERLAP_SECONDS = 2


class ASR:
    _instance = None

    def __init__(self) -> None:
        settings = get_settings()
        self.backend = settings.ASR_BACKEND
        self._stack = settings.MODEL_STACK
        self._hf_token = settings.HF_TOKEN

        # La stack goaicorp remplace tous les backends ASR_BACKEND par les
        # modeles GO AI, charges via pipeline() au premier appel (lazy).
        if self._stack == "goaicorp":
            self._goaicorp_pipelines: dict[str, object] = {}
            logger.info("ASR: stack=goaicorp (CC-BY-NC 4.0, GO AI Corporation)")
            return

        if self.backend == "hf_api":
            self._client = InferenceClient(model=HF_API_MODEL_NAME, token=settings.HF_TOKEN)
            return

        if self.backend in ("omnilingual", "omnilingual_ctc", "omnilingual_llm"):
            from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline

            model_card = {
                "omnilingual": OMNILINGUAL_MODEL_CARD,
                "omnilingual_ctc": OMNILINGUAL_CTC_MODEL_CARD,
                "omnilingual_llm": OMNILINGUAL_LLM_MODEL_CARD,
            }[self.backend]
            self._omni_pipeline = ASRInferencePipeline(model_card=model_card)
            return

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.processor = AutoProcessor.from_pretrained(MODEL_NAME)
        self.model = Wav2Vec2ForCTC.from_pretrained(MODEL_NAME).to(self.device)
        self.model.eval()
        self._current_lang: str | None = None

    @classmethod
    def get_instance(cls) -> "ASR":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _set_lang(self, lang: str) -> None:
        if lang not in MMS_LANG_CODES:
            raise ValueError(f"Langue non supportee: {lang}")
        target_lang = MMS_LANG_CODES[lang]
        if self._current_lang == target_lang:
            return
        self.processor.tokenizer.set_target_lang(target_lang)
        self.model.load_adapter(target_lang)
        self._current_lang = target_lang

    def _load_audio(self, audio_path: str) -> np.ndarray:
        audio = AudioSegment.from_file(audio_path)
        audio = audio.set_channels(1).set_frame_rate(TARGET_SAMPLE_RATE)
        samples = np.array(audio.get_array_of_samples()).astype(np.float32)
        max_val = float(1 << (8 * audio.sample_width - 1))
        samples /= max_val
        return samples

    def _transcribe_chunk(self, chunk: np.ndarray) -> str:
        inputs = self.processor(
            chunk, sampling_rate=TARGET_SAMPLE_RATE, return_tensors="pt"
        ).to(self.device)
        with torch.no_grad():
            logits = self.model(**inputs).logits
        ids = torch.argmax(logits, dim=-1)
        return self.processor.batch_decode(ids)[0]

    def _transcribe_hf_api(self, audio_path: str, lang: str) -> str:
        if lang not in MMS_LANG_CODES:
            raise ValueError(f"Langue non supportee: {lang}")
        if lang != "fra":
            logger.warning(
                "ASR hf_api (whisper-large-v3) ne supporte pas officiellement '%s' "
                "(dyu/mos absents des langues entrainees) : resultat best-effort.",
                lang,
            )
        output = self._client.automatic_speech_recognition(audio_path)
        return output.text.strip()

    def _transcribe_omnilingual(self, audio_path: str, lang: str) -> str:
        if lang not in OMNILINGUAL_LANG_CODES:
            raise ValueError(f"Langue non supportee: {lang}")
        result = self._omni_pipeline.transcribe(
            [audio_path], lang=[OMNILINGUAL_LANG_CODES[lang]], batch_size=1
        )
        return result[0].strip()

    def _get_goaicorp_pipeline(self, lang: str) -> object:
        """Charge et met en cache le pipeline ASR GO AI pour la langue donnee.

        pipeline("automatic-speech-recognition") est agnostique de
        l'architecture : fonctionne pour Whisper, Wav2Vec2, Conformer, etc.
        Le HF_TOKEN est necessaire pour les repos gated.
        """
        if lang not in self._goaicorp_pipelines:
            repo_id = GOAICORP_ASR_MODEL_NAMES.get(lang)
            if repo_id is None:
                raise ValueError(f"Langue non supportee par la stack goaicorp ASR: {lang}")
            from transformers import pipeline as hf_pipeline
            logger.info("Chargement pipeline GO AI ASR %s (lang=%s)...", repo_id, lang)
            device = 0 if torch.cuda.is_available() else -1
            self._goaicorp_pipelines[lang] = hf_pipeline(
                "automatic-speech-recognition",
                model=repo_id,
                token=self._hf_token,
                device=device,
            )
            logger.info("Pipeline GO AI ASR %s charge.", repo_id)
        return self._goaicorp_pipelines[lang]

    def _transcribe_goaicorp(self, audio_path: str, lang: str) -> str:
        pipe = self._get_goaicorp_pipeline(lang)
        result = pipe(audio_path, return_timestamps=False)
        return result["text"].strip() if isinstance(result, dict) else str(result).strip()

    def transcribe(self, audio_path: str, lang: str) -> str:
        if self._stack == "goaicorp":
            return self._transcribe_goaicorp(audio_path, lang)

        if self.backend == "hf_api":
            return self._transcribe_hf_api(audio_path, lang)

        if self.backend in ("omnilingual", "omnilingual_ctc", "omnilingual_llm"):
            return self._transcribe_omnilingual(audio_path, lang)

        self._set_lang(lang)
        samples = self._load_audio(audio_path)

        window_size = WINDOW_SECONDS * TARGET_SAMPLE_RATE
        overlap_size = OVERLAP_SECONDS * TARGET_SAMPLE_RATE
        step = window_size - overlap_size

        if len(samples) <= window_size:
            return self._transcribe_chunk(samples).strip()

        transcripts = []
        start = 0
        while start < len(samples):
            chunk = samples[start : start + window_size]
            if len(chunk) == 0:
                break
            transcripts.append(self._transcribe_chunk(chunk))
            start += step

        return " ".join(t.strip() for t in transcripts if t.strip())


if __name__ == "__main__":
    import sys

    asr = ASR.get_instance()
    path = sys.argv[1] if len(sys.argv) > 1 else "sample.wav"
    lang_arg = sys.argv[2] if len(sys.argv) > 2 else "dyu"
    text = asr.transcribe(path, lang_arg)
    print(f"Transcription ({lang_arg}): {text}")
