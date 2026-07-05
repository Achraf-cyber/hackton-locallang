from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    ALLOWED_ORIGINS: list[str] = ["*"]

    # Voir app/services/asr.py pour le detail des backends.
    ASR_BACKEND: Literal["local", "hf_api", "omnilingual", "omnilingual_ctc", "omnilingual_llm"] = "local"
    TTS_BACKEND_DYU: Literal["mms", "omnivoice"] = "mms"
    HF_TOKEN: str | None = None

    # Stack de modeles : "old" (facebook/nllb + mms) ou "goaicorp" (modeles
    # GO AI Corporation, licence CC-BY-NC 4.0, usage non-commercial). Defaut
    # "old" = aucun changement en prod tant que la variable n'est pas positionnee
    # explicitement a "goaicorp" dans les secrets du Space HF.
    # NB : pour le TTS dioula, GO AI n'a PAS de modele ; les deux stacks
    # utilisent donc facebook/mms-tts-dyu pour le dioula (voir tts.py).
    MODEL_STACK: Literal["old", "goaicorp"] = "old"


@lru_cache
def get_settings() -> Settings:
    return Settings()
