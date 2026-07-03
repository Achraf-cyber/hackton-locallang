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


class TTS:
    _instance = None

    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._models: dict[str, VitsModel] = {}
        self._tokenizers: dict[str, VitsTokenizer] = {}

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
        raw_segments = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text) if s.strip()]
        return self._merge_short_segments(raw_segments)

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

    def _synthesize_segment(self, text: str, lang: str) -> np.ndarray:
        model, tokenizer = self._get_model(lang)
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
