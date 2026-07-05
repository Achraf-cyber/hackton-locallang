import re

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

MODEL_NAME = "facebook/nllb-200-3.3B"

NLLB_LANG_CODES = {
    "fr": "fra_Latn",
    "dyu": "dyu_Latn",
    "mos": "mos_Latn",
}

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


class Translator:
    _instance = None

    def __init__(self) -> None:
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.nllb_tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.nllb_model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(self.device)
        self.nllb_model.eval()

    @classmethod
    def get_instance(cls) -> "Translator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _split_sentences(self, text: str) -> list[str]:
        sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text.strip()) if s.strip()]
        return sentences or [text.strip()]

    def _translate_batch(self, sentences: list[str], src: str, tgt: str) -> list[str]:
        self.nllb_tokenizer.src_lang = NLLB_LANG_CODES[src]
        inputs = self.nllb_tokenizer(sentences, return_tensors="pt", padding=True).to(self.device)
        forced_bos_token_id = self.nllb_tokenizer.convert_tokens_to_ids(NLLB_LANG_CODES[tgt])
        with torch.no_grad():
            generated = self.nllb_model.generate(
                **inputs,
                forced_bos_token_id=forced_bos_token_id,
                num_beams=4,
                max_length=256,
            )
        return self.nllb_tokenizer.batch_decode(generated, skip_special_tokens=True)

    def translate(self, text: str, src: str, tgt: str) -> str:
        if src not in ["fr", "dyu", "mos"] or tgt not in ["fr", "dyu", "mos"]:
            raise ValueError(f"Langue non supportee: src={src}, tgt={tgt}")

        sentences = self._split_sentences(text)
        translated = self._translate_batch(sentences, src, tgt)
        return " ".join(translated)


if __name__ == "__main__":
    translator = Translator.get_instance()
    example = "Bonjour. Comment allez-vous aujourd'hui ? J'espere que tout va bien."
    result = translator.translate(example, src="fr", tgt="dyu")
    print(f"FR: {example}")
    print(f"DYU: {result}")
