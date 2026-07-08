# download_goaicorp_models.py
#
# Télécharge et met en cache localement les modèles GO AI Corporation
# nécessaires à la migration (voir le prompt de migration, Étape 1).
#
# Modèles téléchargés :
#   goaicorp/mos-asr          (~3-4 Go, Whisper fine-tune Mooré)
#   goaicorp/dyu-asr          (~3-4 Go, Whisper fine-tune Dioula)
#   goaicorp/mos-translation  (~2.5 Go, NLLB/M2M100 fine-tune Mooré)
#   goaicorp/dyu-translation  (~2.5 Go, NLLB/M2M100 fine-tune Dioula)
#   goaicorp/mos-tts          (~taille inconnue, MMS-TTS/VITS probable)
#   -----------------------------------------------------------------------
#   NOTE : GO AI n'a PAS de modèle TTS pour le dioula. Le TTS dioula reste
#   sur facebook/mms-tts-dyu (déjà en cache via pre_download.py). Ne pas
#   chercher de goaicorp/dyu-tts -- il n'existe pas.
#   -----------------------------------------------------------------------
#
# Prérequis :
#   - Accès gated accordé sur le compte HF (username AchrafCyber) pour
#     CHACUN des 5 repos ci-dessus. Si l'accès n'est pas accordé, le script
#     s'arrête avec une erreur claire (401/403) -- ne pas contourner.
#   - HF_TOKEN dans .env (à la racine du projet) ou dans l'environnement système.
#   - huggingface_hub et python-dotenv installés :
#       pip install huggingface_hub python-dotenv
#
# Les anciens modèles (NLLB, MMS-TTS, MMS-ASR, OmniVoice, Omnilingual)
# ne sont NI supprimés, NI retéléchargés. Les deux stacks cohabitent pour
# permettre la comparaison à l'Étape 4.
#
# Pour lancer :
#   python download_goaicorp_models.py
#
# NE PAS lancer avant confirmation que les accès gated sont accordés.

import os
import time
import traceback

# Désactive le transfert Xet : gèle à 0 octet sur les gros fichiers sous
# Windows (même problème documenté dans pre_download.py et download_new_models.py).
os.environ.setdefault("HF_HUB_DISABLE_XET", "1")
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")

from dotenv import load_dotenv  # noqa: E402
load_dotenv()  # charge .env s'il existe ; n'écrase pas les variables système

from huggingface_hub import snapshot_download  # noqa: E402

HF_TOKEN = os.environ.get("HF_TOKEN")

if not HF_TOKEN:
    print(
        "⚠️  HF_TOKEN introuvable (ni dans .env, ni au niveau système).\n"
        "   Les repos gated (goaicorp/*) nécessitent un token authentifié.\n"
        "   Ajoutez HF_TOKEN=<votre_token> dans le fichier .env à la racine\n"
        "   du projet, ou exportez-le dans votre shell avant de relancer."
    )
else:
    print("✅ HF_TOKEN trouvé, téléchargements authentifiés activés.")

# ---------------------------------------------------------------------------
# Modèles à télécharger
# Format : (repo_id, description_humaine)
# ---------------------------------------------------------------------------
GOAICORP_MODELS = [
    ("goaicorp/mos-asr",         "ASR Mooré (GO AI)"),
    ("goaicorp/dyu-asr",         "ASR Dioula (GO AI)"),
    ("goaicorp/mos-translation", "Traduction fr<->Mooré (GO AI, NLLB/M2M100)"),
    ("goaicorp/dyu-translation", "Traduction fr<->Dioula (GO AI, NLLB/M2M100)"),
    ("goaicorp/mos-tts",         "TTS Mooré (GO AI)"),
]

MAX_RETRIES = 5
BASE_DELAY_SECONDS = 5


# ---------------------------------------------------------------------------
# Utilitaires
# ---------------------------------------------------------------------------

def human_size(num_bytes: float) -> str:
    for unit in ("o", "Ko", "Mo", "Go", "To"):
        if num_bytes < 1024:
            return f"{num_bytes:.1f} {unit}"
        num_bytes /= 1024
    return f"{num_bytes:.1f} Po"


def dir_size(path: str) -> int:
    total = 0
    for root, _dirs, files in os.walk(path):
        for name in files:
            file_path = os.path.join(root, name)
            if os.path.isfile(file_path):
                total += os.path.getsize(file_path)
    return total


def download_with_retry(repo_id: str) -> tuple[bool, str]:
    """Télécharge repo_id avec retry + backoff exponentiel.

    snapshot_download reprend automatiquement les fichiers partiellement
    téléchargés (cache huggingface_hub) : relancer après un échec ne
    repart pas de zéro.

    Un échec 401/403 (accès gated non accordé) est signalé clairement et
    n'est PAS retenté (inutile de réessayer 5 fois si le token est invalide
    ou si l'accès n'est pas accordé — ça ne changera pas entre les tentatives).
    """
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            local_dir = snapshot_download(
                repo_id=repo_id,
                token=HF_TOKEN,
                resume_download=True,
            )
            return True, local_dir
        except Exception as exc:  # noqa: BLE001
            error_str = str(exc)
            last_error = exc

            # Accès gated : 401 ou 403 → inutile de réessayer
            if any(code in error_str for code in ("401", "403", "gated", "restricted")):
                print(
                    f"  ❌ Accès refusé pour {repo_id} (erreur {exc!r}).\n"
                    f"     Vérifiez que le compte HF (AchrafCyber) a bien demandé\n"
                    f"     et obtenu l'accès à ce repo gated avant de relancer."
                )
                traceback.print_exception(exc)
                return False, f"Accès gated refusé : {exc}"

            if attempt < MAX_RETRIES:
                delay = BASE_DELAY_SECONDS * (2 ** (attempt - 1))
                print(
                    f"  ⚠️  Tentative {attempt}/{MAX_RETRIES} échouée "
                    f"({exc!r}), nouvelle tentative dans {delay}s..."
                )
                time.sleep(delay)
            else:
                print(f"  ❌ Tentative {attempt}/{MAX_RETRIES} échouée, abandon.")
                traceback.print_exception(exc)

    return False, str(last_error)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print(
        "\n"
        "=========================================================\n"
        " Téléchargement des modèles GO AI Corporation\n"
        " RAPPEL : accès gated requis sur le compte AchrafCyber\n"
        " avant de lancer ce script.\n"
        "=========================================================\n"
    )

    results: list[dict] = []

    for repo_id, description in GOAICORP_MODELS:
        print(f"\nTéléchargement {description} ({repo_id})...")
        ok, info = download_with_retry(repo_id)
        size_bytes = dir_size(info) if ok else 0
        results.append({
            "repo_id": repo_id,
            "description": description,
            "ok": ok,
            "path_or_error": info,
            "size_bytes": size_bytes,
        })
        if ok:
            print(f"  ✅ OK -> {info} ({human_size(size_bytes)})")
        else:
            print(f"  ❌ ÉCHEC : {info}")

    print("\n" + "=" * 65)
    print("RÉSUMÉ")
    print("=" * 65)
    total_size = 0
    all_ok = True
    for r in results:
        status = "✅" if r["ok"] else "❌"
        detail = human_size(r["size_bytes"]) if r["ok"] else r["path_or_error"]
        print(f"{status} {r['repo_id']:<45} {detail}")
        total_size += r["size_bytes"]
        all_ok = all_ok and r["ok"]

    print("-" * 65)
    print(f"Taille totale sur disque : {human_size(total_size)}")

    if all_ok:
        print(
            "\n✅ Tous les modèles GO AI sont en cache local.\n"
            "   Communiquez ce résultat à l'agent (Étape 2 validée)\n"
            "   pour passer à l'intégration dans l'app (Étape 3)."
        )
    else:
        print(
            "\n⚠️  Au moins un modèle a échoué (voir détail ci-dessus).\n"
            "   Si l'échec est lié à un accès gated non accordé :\n"
            "     1. Allez sur https://huggingface.co/<repo_id>\n"
            "     2. Cliquez sur 'Access repository' et attendez l'approbation\n"
            "     3. Relancez ce script (les modèles déjà téléchargés seront repris)\n"
            "   Communiquez le résultat exact à l'agent avant de continuer."
        )


if __name__ == "__main__":
    main()
