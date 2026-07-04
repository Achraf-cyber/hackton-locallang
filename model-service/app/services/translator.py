import logging
import re

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from app.deps import get_settings

logger = logging.getLogger("model-service.translator")

MODEL_NAME = "facebook/nllb-200-distilled-600M"

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
        settings = get_settings()
        self.backend = settings.TRANSLATION_BACKEND

        # Lazy init for NLLB
        self.nllb_tokenizer = None
        self.nllb_model = None

        # Lazy init for AfriMT5
        self.afrimt5_models = {}
        self.afrimt5_tokenizers = {}

        if self.backend == "nllb":
            self._init_nllb()

    def _init_nllb(self) -> None:
        if self.nllb_model is None:
            self.nllb_tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            self.nllb_model = AutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME).to(self.device)
            self.nllb_model.eval()

    def _get_afrimt5_model(self, lang: str):
        if lang not in self.afrimt5_models:
            # masakhane/afrimt5_fr_bam_news pour dyu/bambara, masakhane/afrimt5_fr_mos_news pour mos
            hf_repo = "masakhane/afrimt5_fr_bam_news" if lang == "dyu" else "masakhane/afrimt5_fr_mos_news"
            self.afrimt5_tokenizers[lang] = AutoTokenizer.from_pretrained(hf_repo)
            model = AutoModelForSeq2SeqLM.from_pretrained(hf_repo).to(self.device)
            model.eval()
            self.afrimt5_models[lang] = model
        return self.afrimt5_models[lang], self.afrimt5_tokenizers[lang]

    @classmethod
    def get_instance(cls) -> "Translator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _split_sentences(self, text: str) -> list[str]:
        sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text.strip()) if s.strip()]
        return sentences or [text.strip()]

    def _translate_batch(self, sentences: list[str], src: str, tgt: str) -> list[str]:
        self._init_nllb()
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

        # Traduction fr -> local avec AfriMT5 (si active et si le modele est dispo)
        if self.backend == "afrimt5" and src == "fr":
            lang = "dyu" if tgt == "dyu" else "mos"
            try:
                model, tokenizer = self._get_afrimt5_model(lang)
                sentences = self._split_sentences(text)
                translated = []
                for sentence in sentences:
                    inputs = tokenizer(sentence, return_tensors="pt").to(self.device)
                    with torch.no_grad():
                        generated = model.generate(**inputs, max_length=256)
                    decoded = tokenizer.decode(generated[0], skip_special_tokens=True)
                    translated.append(decoded.strip())
                return " ".join(translated)
            except Exception as e:
                logger.warning("AfriMT5 non disponible pour %s, fallback sur NLLB: %s", lang, e)
                # Fallback sur NLLB

        # Traduction local -> fr (ou si afrimt5 non dispo/erreur) : toujours NLLB
        sentences = self._split_sentences(text)
        translated = self._translate_batch(sentences, src, tgt)
        return " ".join(translated)


if __name__ == "__main__":
    translator = Translator.get_instance()
    example = "Bonjour. Comment allez-vous aujourd'hui ? J'espere que tout va bien."
    result = translator.translate(example, src="fr", tgt="dyu")
    print(f"FR: {example}")
    print(f"DYU: {result}")
