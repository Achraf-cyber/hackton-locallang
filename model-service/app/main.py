"""model-service - FastAPI app.

Lancement local :
    uvicorn app.main:app --reload --port 8000
"""

import logging
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.deps import get_settings
from app.services.asr import (
    HF_API_MODEL_NAME,
    MODEL_NAME as ASR_LOCAL_MODEL_NAME,
    OMNILINGUAL_CTC_MODEL_CARD,
    OMNILINGUAL_LLM_MODEL_CARD,
    OMNILINGUAL_MODEL_CARD,
    ASR,
)
from app.services.translator import MODEL_NAME as NLLB_MODEL_NAME, Translator
from app.services.tts import MMS_TTS_MODEL_NAMES, TTS

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("model-service")

settings = get_settings()

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="model-service",
    description="Expose ASR, traduction et TTS pour le Dioula et le Mooré.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/media", StaticFiles(directory=str(MEDIA_DIR)), name="media")


class TranscribeResponse(BaseModel):
    text: str


class LocalizeRequest(BaseModel):
    text_fr: str
    lang: Literal["dyu", "mos"]


class LocalizeResponse(BaseModel):
    translated: str
    audio_url: str


class ToFrenchRequest(BaseModel):
    text: str
    lang: Literal["dyu", "mos"]


class ToFrenchResponse(BaseModel):
    text_fr: str


class SpeakRequest(BaseModel):
    text: str
    lang: Literal["dyu", "mos"]


class SpeakResponse(BaseModel):
    audio_url: str


_ASR_MODEL_NAMES = {
    "local": ASR_LOCAL_MODEL_NAME,
    "hf_api": HF_API_MODEL_NAME,
    "omnilingual": f"facebook/{OMNILINGUAL_MODEL_CARD}",
    "omnilingual_ctc": f"facebook/{OMNILINGUAL_CTC_MODEL_CARD}",
    "omnilingual_llm": f"facebook/{OMNILINGUAL_LLM_MODEL_CARD}",
}


def _dashboard_rows() -> list[tuple[str, str, str]]:
    """(composant, modele actif, etat de chargement) pour /."""
    asr_loaded = "chargé" if ASR._instance is not None else "pas encore chargé (lazy)"
    translator_loaded = "chargé" if Translator._instance is not None else "pas encore chargé (lazy)"
    tts_loaded = "chargé" if TTS._instance is not None else "pas encore chargé (lazy)"

    tts_dyu_model = "k2-fsa/OmniVoice" if settings.TTS_BACKEND_DYU == "omnivoice" else MMS_TTS_MODEL_NAMES["dyu"]

    return [
        ("ASR (dyu/mos/fra)", _ASR_MODEL_NAMES.get(settings.ASR_BACKEND, settings.ASR_BACKEND), asr_loaded),
        ("Traduction", NLLB_MODEL_NAME, translator_loaded),
        ("TTS — dyu", tts_dyu_model, tts_loaded),
        ("TTS — mos", MMS_TTS_MODEL_NAMES["mos"], tts_loaded),
    ]


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    rows = _dashboard_rows()
    rows_html = "\n".join(
        f"<tr><td>{component}</td><td><code>{model}</code></td><td>{status}</td></tr>"
        for component, model, status in rows
    )
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>model-service — état</title>
<style>
  body {{ font-family: system-ui, sans-serif; background: #0f172a; color: #e2e8f0; padding: 2rem; }}
  h1 {{ font-size: 1.25rem; }}
  table {{ border-collapse: collapse; width: 100%; max-width: 720px; margin-top: 1rem; }}
  td {{ padding: 0.5rem 0.75rem; border-bottom: 1px solid #334155; }}
  td:first-child {{ color: #94a3b8; white-space: nowrap; }}
  code {{ color: #7dd3fc; }}
  .ok {{ color: #4ade80; }}
</style>
</head>
<body>
  <h1>🩺 model-service — <span class="ok">en ligne</span></h1>
  <table>
    <tr><td>Composant</td><td>Modèle actif</td><td>État</td></tr>
    {rows_html}
  </table>
  <p style="color:#64748b; margin-top:1.5rem;">
    Config via variables d'env (ASR_BACKEND / TTS_BACKEND_DYU).
    Chaque modèle est chargé au premier appel (singleton paresseux), donc "pas encore chargé"
    juste après un redémarrage est normal.
  </p>
</body>
</html>"""


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(
    file: UploadFile = File(...),
    lang: Literal["dyu", "mos", "fra"] = Form(...),
) -> TranscribeResponse:
    start = time.perf_counter()

    suffix = Path(file.filename or "audio").suffix or ".wav"
    tmp_path = MEDIA_DIR / f"{uuid.uuid4()}{suffix}"
    contents = await file.read()
    tmp_path.write_bytes(contents)

    try:
        asr = ASR.get_instance()
        text = asr.transcribe(str(tmp_path), lang)
    finally:
        tmp_path.unlink(missing_ok=True)

    elapsed = time.perf_counter() - start
    logger.info("POST /transcribe lang=%s duration=%.3fs", lang, elapsed)

    return TranscribeResponse(text=text)


@app.post("/localize", response_model=LocalizeResponse)
def localize(payload: LocalizeRequest) -> LocalizeResponse:
    start = time.perf_counter()

    translator = Translator.get_instance()
    translated = translator.translate(payload.text_fr, src="fr", tgt=payload.lang)

    tts = TTS.get_instance()
    filename = f"{uuid.uuid4()}.wav"
    output_path = MEDIA_DIR / filename
    tts.speak(translated, lang=payload.lang, output_path=str(output_path))

    elapsed = time.perf_counter() - start
    logger.info("POST /localize lang=%s duration=%.3fs", payload.lang, elapsed)

    return LocalizeResponse(translated=translated, audio_url=f"/media/{filename}")


@app.post("/speak", response_model=SpeakResponse)
def speak(payload: SpeakRequest) -> SpeakResponse:
    """Synthese vocale PURE, sans traduction : pour du texte deja ecrit dans
    la langue cible (ex. messages d'interface fixes, ecrits/relus par un
    locuteur natif). Ne PAS utiliser /localize pour ce cas : /localize
    traduit systematiquement depuis le francais, ce qui produit un resultat
    incorrect si le texte d'entree est deja en dyu/mos."""
    start = time.perf_counter()

    tts = TTS.get_instance()
    filename = f"{uuid.uuid4()}.wav"
    output_path = MEDIA_DIR / filename
    tts.speak(payload.text, lang=payload.lang, output_path=str(output_path))

    elapsed = time.perf_counter() - start
    logger.info("POST /speak lang=%s duration=%.3fs", payload.lang, elapsed)

    return SpeakResponse(audio_url=f"/media/{filename}")


@app.post("/to-french", response_model=ToFrenchResponse)
def to_french(payload: ToFrenchRequest) -> ToFrenchResponse:
    start = time.perf_counter()

    translator = Translator.get_instance()
    text_fr = translator.translate(payload.text, src=payload.lang, tgt="fr")

    elapsed = time.perf_counter() - start
    logger.info("POST /to-french lang=%s duration=%.3fs", payload.lang, elapsed)

    return ToFrenchResponse(text_fr=text_fr)
