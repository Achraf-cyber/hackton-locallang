import pytest

from app.services.translator import Translator


@pytest.mark.slow
def test_translate_fr_to_dyu_real():
    translator = Translator.get_instance()
    result = translator.translate("Bonjour, comment allez-vous ?", src="fr", tgt="dyu")
    assert isinstance(result, str)
    assert result.strip() != ""
