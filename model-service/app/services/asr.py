"""Reconnaissance vocale (speech-to-text) pour le Dioula, le Moore et le francais
via facebook/mms-1b-all.

Deux backends, choisis par Settings.ASR_BACKEND :
- "local" (defaut) : Wav2Vec2ForCTC + AutoProcessor charges en local.
- "hf_api" : pont temporaire vers l'API d'inference Hugging Face, utile tant
  que le modele local (~3.86 Go) n'est pas entierement telecharge.
  ATTENTION : facebook/mms-1b-all n'est deploye sur AUCUN provider
  d'inference HF (verifie : liste de providers vide). Le backend "hf_api"
  utilise donc openai/whisper-large-v3 a la place, qui NE supporte PAS
  officiellement le Dioula ni le Moore (~99 langues entrainees, dyu/mos
  absentes) : fiable seulement pour lang="fra", best-effort pour dyu/mos.
Le contrat de transcribe(audio_path, lang) est identique dans les deux cas.
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

MMS_LANG_CODES = {
    "dyu": "dyu",
    "mos": "mos",
    "fra": "fra",
}

TARGET_SAMPLE_RATE = 16_000
WINDOW_SECONDS = 30
OVERLAP_SECONDS = 2


class ASR:
    _instance = None

    def __init__(self) -> None:
        settings = get_settings()
        self.backend = settings.ASR_BACKEND

        if self.backend == "hf_api":
            self._client = InferenceClient(model=HF_API_MODEL_NAME, token=settings.HF_TOKEN)
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

    def transcribe(self, audio_path: str, lang: str) -> str:
        if self.backend == "hf_api":
            return self._transcribe_hf_api(audio_path, lang)

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
