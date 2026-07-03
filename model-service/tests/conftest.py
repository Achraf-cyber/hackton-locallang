import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from app.main import app
from app.services.asr import ASR
from app.services.translator import Translator
from app.services.tts import TTS

FIXED_TRANSCRIPT = "ceci est un texte fixe"
FIXED_TRANSLATION = "traduction fixe"


class FakeASR:
    def transcribe(self, audio_path: str, lang: str) -> str:
        return FIXED_TRANSCRIPT


class FakeTranslator:
    def translate(self, text: str, src: str, tgt: str) -> str:
        return FIXED_TRANSLATION


class FakeTTS:
    def speak(self, text: str, lang: str, output_path: str) -> str:
        silence = np.zeros(1, dtype=np.float32)
        sf.write(output_path, silence, 16_000)
        return output_path


@pytest.fixture(autouse=True)
def mock_heavy_services(request, monkeypatch):
    """Evite le chargement de vrais modeles pendant les tests rapides.

    Les tests marques @pytest.mark.slow veulent les vrais services : on ne
    patche rien pour eux.
    """
    if request.node.get_closest_marker("slow"):
        yield
        return

    monkeypatch.setattr(ASR, "get_instance", classmethod(lambda cls: FakeASR()))
    monkeypatch.setattr(Translator, "get_instance", classmethod(lambda cls: FakeTranslator()))
    monkeypatch.setattr(TTS, "get_instance", classmethod(lambda cls: FakeTTS()))
    yield


@pytest.fixture
def client():
    return TestClient(app)
