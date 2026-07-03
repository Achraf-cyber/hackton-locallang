from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ALLOWED_ORIGINS: list[str] = ["*"]

    # ASR temporaire via l'API d'inference Hugging Face pendant que
    # facebook/mms-1b-all finit de telecharger en local (voir asr.py).
    ASR_BACKEND: Literal["local", "hf_api"] = "local"
    HF_TOKEN: str | None = None


@lru_cache
def get_settings() -> Settings:
    return Settings()
