import logging
import re

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

from app.deps import get_settings

logger = logging.getLogger("model-service.translator")

# Stack "old" : un seul modele NLLB-3.3B couvrant dyu ET mos.
MODEL_NAME = "facebook/nllb-200-3.3B"

# Stack "goaicorp" : deux modeles specialises CC-BY-NC 4.0
# (Wendpanga Aristide Bandaogo, aristide@goaicorporation.org)
# Architecture M2M100ForConditionalGeneration = NLLB, memes codes de langue.
GOAICORP_MODEL_NAMES = {
    "mos": "goaicorp/mos-translation",
    "dyu": "goaicorp/dyu-translation",
}

NLLB_LANG_CODES = {
    "fr": "fra_Latn",
    "dyu": "dyu_Latn",
    "mos": "mos_Latn",
}

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


class Translator:
    _instance = None

    def __init__(self) -> None:
        settings = get_settings()
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._stack = settings.MODEL_STACK
        self._hf_token = settings.HF_TOKEN

        if self._stack == "goaicorp":
            # Chargement paresseux par langue (voir _get_goaicorp_model) :
            # on n'alloue pas la RAM pour les deux modeles si une seule
            # direction est utilisee, et on ne bloque pas le demarrage du
            # Space sur le premier modele si le second est encore en cours
            # de telechargement.
            self._goaicorp_models: dict[str, AutoModelForSeq2SeqLM] = {}
            self._goaicorp_tokenizers: dict[str, AutoTokenizer] = {}
            logger.info("Translator: stack=goaicorp (CC-BY-NC 4.0, GO AI Corporation)")
        else:
            self.nllb_tokenizer = AutoTokenizer.from_pretrained(
                MODEL_NAME, token=self._hf_token
            )
            self.nllb_model = AutoModelForSeq2SeqLM.from_pretrained(
                MODEL_NAME, token=self._hf_token
            ).to(self.device)
            self.nllb_model.eval()
            logger.info("Translator: stack=old (facebook/nllb-200-3.3B)")

    @classmethod
    def get_instance(cls) -> "Translator":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    # ------------------------------------------------------------------
    # Interne : chargement paresseux des modeles GO AI
    # ------------------------------------------------------------------

    def _get_goaicorp_model(
        self, lang: str
    ) -> tuple[AutoModelForSeq2SeqLM, AutoTokenizer]:
        """Charge et met en cache le modele GO AI pour la langue donnee.

        Les deux modeles (mos / dyu) ont la meme architecture NLLB/M2M100.
        Le token HF est necessaire pour les repos gated -- il doit etre
        configure dans les secrets du Space HF (variable HF_TOKEN).
        """
        if lang not in GOAICORP_MODEL_NAMES:
            raise ValueError(f"Langue non supportee par la stack goaicorp: {lang}")
        if lang not in self._goaicorp_models:
            repo_id = GOAICORP_MODEL_NAMES[lang]
            logger.info("Chargement du modele GO AI %s...", repo_id)
            tok = AutoTokenizer.from_pretrained(repo_id, token=self._hf_token)
            model = AutoModelForSeq2SeqLM.from_pretrained(
                repo_id, token=self._hf_token
            ).to(self.device)
            model.eval()
            self._goaicorp_tokenizers[lang] = tok
            self._goaicorp_models[lang] = model
            logger.info("Modele GO AI %s charge.", repo_id)
        return self._goaicorp_models[lang], self._goaicorp_tokenizers[lang]

    # ------------------------------------------------------------------
    # Traduction
    # ------------------------------------------------------------------

    def _split_sentences(self, text: str) -> list[str]:
        sentences = [s.strip() for s in _SENTENCE_SPLIT_RE.split(text.strip()) if s.strip()]
        return sentences or [text.strip()]

    def _translate_batch_nllb(
        self,
        sentences: list[str],
        src: str,
        tgt: str,
        tokenizer: AutoTokenizer,
        model: AutoModelForSeq2SeqLM,
    ) -> list[str]:
        tokenizer.src_lang = NLLB_LANG_CODES[src]
        inputs = tokenizer(sentences, return_tensors="pt", padding=True).to(self.device)
        forced_bos_token_id = tokenizer.convert_tokens_to_ids(NLLB_LANG_CODES[tgt])
        with torch.no_grad():
            generated = model.generate(
                **inputs,
                forced_bos_token_id=forced_bos_token_id,
                num_beams=4,
                max_length=256,
            )
        return tokenizer.batch_decode(generated, skip_special_tokens=True)

    def translate(self, text: str, src: str, tgt: str) -> str:
        if src not in ["fr", "dyu", "mos"] or tgt not in ["fr", "dyu", "mos"]:
            raise ValueError(f"Langue non supportee: src={src}, tgt={tgt}")

        sentences = self._split_sentences(text)

        if self._stack == "goaicorp":
            # Les modeles GO AI sont par paire (mos-translation, dyu-translation).
            # Pour fr->mos on utilise le modele mos ; pour fr->dyu le modele dyu ;
            # pour mos->dyu ou dyu->mos on passe par le français comme pivot :
            # mos->fr avec mos-translation, puis fr->dyu avec dyu-translation.
            if src == "fr":
                # Traduction directe fr -> langue locale
                model, tok = self._get_goaicorp_model(tgt)
                translated = self._translate_batch_nllb(sentences, src, tgt, tok, model)
            elif tgt == "fr":
                # Traduction directe langue locale -> fr
                model, tok = self._get_goaicorp_model(src)
                translated = self._translate_batch_nllb(sentences, src, tgt, tok, model)
            else:
                # Pivot fr : src->fr puis fr->tgt
                src_model, src_tok = self._get_goaicorp_model(src)
                fr_sentences = self._translate_batch_nllb(sentences, src, "fr", src_tok, src_model)
                tgt_model, tgt_tok = self._get_goaicorp_model(tgt)
                translated = self._translate_batch_nllb(fr_sentences, "fr", tgt, tgt_tok, tgt_model)
        else:
            translated = self._translate_batch_nllb(
                sentences, src, tgt, self.nllb_tokenizer, self.nllb_model
            )

        return " ".join(translated)


if __name__ == "__main__":
    translator = Translator.get_instance()
    example = "Bonjour. Comment allez-vous aujourd'hui ? J'espere que tout va bien."
    result = translator.translate(example, src="fr", tgt="dyu")
    print(f"FR: {example}")
    print(f"DYU: {result}")
