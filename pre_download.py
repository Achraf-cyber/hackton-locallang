# pre_download.py
import os

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

print("Téléchargement NLLB (traduction)...")
AutoTokenizer.from_pretrained("facebook/nllb-200-distilled-600M", token=HF_TOKEN)
AutoModelForSeq2SeqLM.from_pretrained("facebook/nllb-200-distilled-600M", token=HF_TOKEN)

print("Téléchargement TTS Dioula...")
VitsModel.from_pretrained("facebook/mms-tts-dyu", token=HF_TOKEN)
AutoTokenizer.from_pretrained("facebook/mms-tts-dyu", token=HF_TOKEN)

print("Téléchargement TTS Mooré...")
VitsModel.from_pretrained("facebook/mms-tts-mos", token=HF_TOKEN)
AutoTokenizer.from_pretrained("facebook/mms-tts-mos", token=HF_TOKEN)

print("Téléchargement ASR (MMS)...")
asr = Wav2Vec2ForCTC.from_pretrained("facebook/mms-1b-all", token=HF_TOKEN)
proc = AutoProcessor.from_pretrained("facebook/mms-1b-all", token=HF_TOKEN)
for lang in ["dyu", "mos", "fra"]:
    print(f"  -> adaptateur {lang}")
    proc.tokenizer.set_target_lang(lang)
    asr.load_adapter(lang, token=HF_TOKEN)

print("✅ Tous les modèles sont en cache local.")