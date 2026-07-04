from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ALLOWED_ORIGINS: list[str] = ["*"]

    # Voir app/services/asr.py pour le detail des backends.
    ASR_BACKEND: Literal["local", "hf_api", "omnilingual", "omnilingual_ctc"] = "local"
    TRANSLATION_BACKEND: Literal["nllb", "afrimt5"] = "nllb"
    TTS_BACKEND_DYU: Literal["mms", "omnivoice"] = "mms"
    HF_TOKEN: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
