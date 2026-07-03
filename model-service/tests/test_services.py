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


def test_tts_packs_multiple_sentences_per_segment():
    """Regression : decouper phrase par phrase cree une coupure de prosodie
    audible (redemarrage) ENTRE CHAQUE phrase, pas seulement en fin de texte.
    On doit regrouper les phrases par paquets (<=500 caracteres chacun) et ne
    couper qu'en cas de depassement, pas a chaque point."""
    tts = TTS()
    sentence = "Ceci est une phrase de taille moyenne pour le test. "
    text = sentence * 12  # ~624 caracteres, 12 phrases identiques
    assert len(text) > 500

    segments = tts._split_text(text)

    # Avant le correctif : 12 segments (un par phrase). Le regroupement doit
    # produire beaucoup moins de segments que de phrases.
    assert len(segments) < 4, segments
    assert all(len(s) <= 500 + 60 for s in segments), segments  # marge : derniere phrase du paquet


def test_tts_softens_internal_sentence_ends_only():
    """Regression : VITS traite chaque ponctuation finale comme une fin de
    discours (intonation descendante + pause longue), meme au milieu d'un
    texte. On adoucit donc les points internes en virgule et on garde
    uniquement la ponctuation finale du segment."""
    tts = TTS()
    result = tts._soften_internal_sentence_ends("Phrase un. Phrase deux ! Phrase trois ?")
    assert result == "Phrase un, Phrase deux , Phrase trois ?"

    # Une seule phrase : rien a adoucir.
    assert tts._soften_internal_sentence_ends("Une seule phrase.") == "Une seule phrase."


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
