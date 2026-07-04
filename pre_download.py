# pre_download.py
import os
import time
import traceback

# Désactive le transfert Xet : le protocole binaire hf_xet gèle à 0 octet sur
# les gros fichiers sous Windows (ex. facebook/mms-1b-all, model.safetensors
# 3.86 Go, servi via cas-bridge.xethub.hf.co). On retombe sur le téléchargeur
# HTTPS standard de huggingface_hub, qui reprend (resume) un download partiel.
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")

from dotenv import load_dotenv
load_dotenv()  # charge le .env s'il existe (n'écrase pas une variable système déjà définie)

from transformers import (AutoModelForSeq2SeqLM, AutoTokenizer, VitsModel,
                          Wav2Vec2ForCTC, AutoProcessor)

HF_TOKEN = os.environ.get("HF_TOKEN")

if not HF_TOKEN:
    print("⚠️  HF_TOKEN introuvable (ni dans .env, ni au niveau système). "
          "Les téléchargements seront non authentifiés et plus lents.")
else:
    print("✅ HF_TOKEN trouvé, téléchargements authentifiés activés.")

MAX_RETRIES = 5
BASE_DELAY_SECONDS = 5


def retry_with_backoff(step_name: str, fn, *args, **kwargs):
    """Reessaie fn(*args, **kwargs) avec backoff exponentiel. Utile pour les
    gros fichiers (ex. mms-1b-all, 3.86 Go) ou une simple coupure reseau
    mi-telechargement (IncompleteRead/ChunkedEncodingError) fait echouer tout
    le script sans ca. huggingface_hub reprend (resume) automatiquement un
    fichier partiellement telecharge : reessayer ne repart pas de zero."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as exc:  # noqa: BLE001 - on veut retry sur toute erreur reseau/HTTP
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = BASE_DELAY_SECONDS * (2 ** (attempt - 1))
                print(f"  ⚠️  {step_name} : tentative {attempt}/{MAX_RETRIES} échouée "
                      f"({exc!r}), nouvelle tentative dans {delay}s...")
                time.sleep(delay)
            else:
                print(f"  ❌ {step_name} : tentative {attempt}/{MAX_RETRIES} échouée, abandon.")
                traceback.print_exception(exc)
    raise last_error


print("Téléchargement NLLB (traduction)...")
retry_with_backoff("NLLB tokenizer", AutoTokenizer.from_pretrained,
                    "facebook/nllb-200-distilled-600M", token=HF_TOKEN)
retry_with_backoff("NLLB modèle", AutoModelForSeq2SeqLM.from_pretrained,
                    "facebook/nllb-200-distilled-600M", token=HF_TOKEN)

print("Téléchargement TTS Dioula...")
retry_with_backoff("TTS dyu modèle", VitsModel.from_pretrained,
                    "facebook/mms-tts-dyu", token=HF_TOKEN)
retry_with_backoff("TTS dyu tokenizer", AutoTokenizer.from_pretrained,
                    "facebook/mms-tts-dyu", token=HF_TOKEN)

print("Téléchargement TTS Mooré...")
retry_with_backoff("TTS mos modèle", VitsModel.from_pretrained,
                    "facebook/mms-tts-mos", token=HF_TOKEN)
retry_with_backoff("TTS mos tokenizer", AutoTokenizer.from_pretrained,
                    "facebook/mms-tts-mos", token=HF_TOKEN)

print("Téléchargement ASR (MMS)...")
asr = retry_with_backoff("ASR mms-1b-all modèle (3.86 Go)", Wav2Vec2ForCTC.from_pretrained,
                          "facebook/mms-1b-all", token=HF_TOKEN)
proc = retry_with_backoff("ASR mms-1b-all processor", AutoProcessor.from_pretrained,
                           "facebook/mms-1b-all", token=HF_TOKEN)
for lang in ["dyu", "mos", "fra"]:
    print(f"  -> adaptateur {lang}")
    proc.tokenizer.set_target_lang(lang)
    retry_with_backoff(f"adaptateur {lang}", asr.load_adapter, lang, token=HF_TOKEN)

# NOUVEAUX MODÈLES DE LA MIGRATION
print("Téléchargement afrimt5_fr_bam_news (traduction Dioula/Bambara)...")
retry_with_backoff("afrimt5_fr_bam_news tokenizer", AutoTokenizer.from_pretrained,
                    "masakhane/afrimt5_fr_bam_news", token=HF_TOKEN)
retry_with_backoff("afrimt5_fr_bam_news modèle", AutoModelForSeq2SeqLM.from_pretrained,
                    "masakhane/afrimt5_fr_bam_news", token=HF_TOKEN)

print("Téléchargement afrimt5_fr_mos_news (traduction Mooré)...")
retry_with_backoff("afrimt5_fr_mos_news tokenizer", AutoTokenizer.from_pretrained,
                    "masakhane/afrimt5_fr_mos_news", token=HF_TOKEN)
retry_with_backoff("afrimt5_fr_mos_news modèle", AutoModelForSeq2SeqLM.from_pretrained,
                    "masakhane/afrimt5_fr_mos_news", token=HF_TOKEN)

print("Téléchargement OmniVoice (TTS)...")
from huggingface_hub import snapshot_download
retry_with_backoff("OmniVoice snapshot", snapshot_download,
                    repo_id="k2-fsa/OmniVoice", token=HF_TOKEN)

print("Téléchargement omniASR-CTC-1B...")
retry_with_backoff("omniASR-CTC-1B snapshot", snapshot_download,
                    repo_id="facebook/omniASR-CTC-1B", token=HF_TOKEN)

try:
    from omnilingual_asr.models.inference.pipeline import ASRInferencePipeline
except ImportError:
    print("ℹ️  omnilingual-asr non installé (normal sous Windows) : téléchargement pipeline ignoré.")
else:
    print("Téléchargement ASR (Omnilingual pipeline)...")
    retry_with_backoff("Omnilingual ASR (300M)", ASRInferencePipeline,
                        model_card="omniASR_CTC_300M_v2")
    retry_with_backoff("Omnilingual ASR (1B)", ASRInferencePipeline,
                        model_card="omniASR_CTC_1B")

print("✅ Tous les modèles (anciens et nouveaux) sont en cache local.")
