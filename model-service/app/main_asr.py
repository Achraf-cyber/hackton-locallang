"""model-service-asr - FastAPI app dediee a l'ASR (Space separe du service de
traduction/TTS, voir model-service/Dockerfile.asr).

Lancement local :
    uvicorn app.main_asr:app --reload --port 8001
"""

import logging
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("model-service-asr")

settings = get_settings()

MEDIA_DIR = Path(__file__).resolve().parent.parent / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="model-service-asr",
    description="Expose l'ASR (dyu/mos/fra) - Space separe de la traduction/TTS.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TranscribeResponse(BaseModel):
    text: str


_ASR_MODEL_NAMES = {
    "local": ASR_LOCAL_MODEL_NAME,
    "hf_api": HF_API_MODEL_NAME,
    "omnilingual": f"facebook/{OMNILINGUAL_MODEL_CARD}",
    "omnilingual_ctc": f"facebook/{OMNILINGUAL_CTC_MODEL_CARD}",
    "omnilingual_llm": f"facebook/{OMNILINGUAL_LLM_MODEL_CARD}",
}


@app.get("/", response_class=HTMLResponse)
def dashboard() -> str:
    asr_loaded = "chargé" if ASR._instance is not None else "pas encore chargé (lazy)"
    model_name = _ASR_MODEL_NAMES.get(settings.ASR_BACKEND, settings.ASR_BACKEND)
    return f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>model-service-asr — état</title>
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
  <h1>🩺 model-service-asr — <span class="ok">en ligne</span></h1>
  <table>
    <tr><td>Composant</td><td>Modèle actif</td><td>État</td></tr>
    <tr><td>ASR (dyu/mos/fra)</td><td><code>{model_name}</code></td><td>{asr_loaded}</td></tr>
  </table>
  <p style="color:#64748b; margin-top:1.5rem;">
    Config via la variable d'env ASR_BACKEND. Le modèle est chargé au premier appel
    (singleton paresseux), donc "pas encore chargé" juste après un redémarrage est normal.
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
