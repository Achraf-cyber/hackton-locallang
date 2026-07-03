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
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.deps import get_settings
from app.services.asr import ASR
from app.services.translator import Translator
from app.services.tts import TTS

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


@app.post("/to-french", response_model=ToFrenchResponse)
def to_french(payload: ToFrenchRequest) -> ToFrenchResponse:
    start = time.perf_counter()

    translator = Translator.get_instance()
    text_fr = translator.translate(payload.text, src=payload.lang, tgt="fr")

    elapsed = time.perf_counter() - start
    logger.info("POST /to-french lang=%s duration=%.3fs", payload.lang, elapsed)

    return ToFrenchResponse(text_fr=text_fr)
