import pytest

from app.services.translator import Translator
from app.services.tts import TTS


@pytest.mark.slow
def test_translate_fr_to_dyu_real():
    translator = Translator.get_instance()
    result = translator.translate("Bonjour, comment allez-vous ?", src="fr", tgt="dyu")
    assert isinstance(result, str)
    assert result.strip() != ""


def test_tts_merges_bare_numbered_list_markers():
    """Regression : une liste numerotee ('1. Xxx. 2. Yyy.') donne des segments
    '1.'/'2.' de 2 caracteres apres decoupe par phrase ; VITS plante
    (narrow(): length must be non-negative) si on les synthetise seuls."""
    # Instanciation directe (pas get_instance()) : construire un TTS ne charge
    # aucun modele (lazy par langue), donc pas besoin du mock get_instance()
    # utilise pour les autres tests rapides.
    tts = TTS()
    text = (
        "1. " + ("Allez a la mairie avec vos papiers d identite. " * 6)
        + "2. " + ("Presentez votre demande au guichet. " * 6)
    )
    assert len(text) > 500  # declenche la decoupe en segments

    segments = tts._split_text(text)

    assert all(len(s) > 5 for s in segments), segments


@pytest.mark.slow
def test_tts_speak_numbered_list_real():
    """Reproduit le crash original avec une vraie synthese VITS."""
    tts = TTS.get_instance()
    text = (
        "1. Allez a la mairie avec vos papiers d identite et un justificatif de "
        "domicile recent, puis attendez votre tour dans la file d attente prevue "
        "a cet effet pour les demandes administratives courantes. "
        "2. Presentez votre demande au guichet approprie et attendez votre tour "
        "patiemment en respectant les horaires d ouverture affiches devant le "
        "batiment principal de la mairie. "
        "3. Payez les frais administratifs requis pour le traitement de votre "
        "dossier officiel aupres du caissier designe et conservez precieusement "
        "votre recu de paiement."
    )
    out = tts.speak(text, lang="dyu", output_path="test_numbered_list.wav")
    assert out == "test_numbered_list.wav"
