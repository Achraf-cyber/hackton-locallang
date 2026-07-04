# download_new_models.py
#
# Etape 1 de la migration vers la nouvelle stack de modeles (voir le prompt
# de migration). Telecharge et met en cache localement les QUATRE nouveaux
# modeles, SANS toucher au cache des anciens modeles (les deux stacks
# cohabitent pour permettre la comparaison a l'etape 4).
#
# Installation prealable (dans le venv model-service deja existant) :
#   pip install huggingface_hub python-dotenv
#
# Pour integrer ensuite ces modeles dans l'app (etape 3, PAS ce script) :
#   - facebook/omniASR-CTC-1B : necessite le paquet `omnilingual-asr`
#     (fairseq2 + fairseq2n), LINUX UNIQUEMENT (aucun wheel Windows).
#     Voir model-service/requirements-omnilingual.txt et
#     model-service/setup_wsl_env.sh pour la procedure d'installation qui
#     fonctionne (torch doit matcher EXACTEMENT un wheel fairseq2 prebuild,
#     2.9.1 au moment de la redaction -- verifier
#     https://fair.pkg.atmeta.com/fairseq2/whl/pt<version>/cpu avant de
#     fixer une version differente).
#     NOTE : la variante LLM 7B (facebook/omniASR-LLM-7B, ~29 Go) a ete
#     ECARTEE -- inutilisable sur une machine a 16 Go de RAM (le fichier de
#     poids seul depasse la RAM disponible, sans meme compter l'overhead
#     d'inference). CTC-1B a le meme nombre de parametres que le
#     facebook/mms-1b-all actuellement utilise (comparaison a parametres
#     egaux a l'etape 4) et le decodage CTC (non-autoregressif) est plus
#     rapide en inference CPU qu'un decodeur LLM comme la variante 7B.
#   - masakhane/afrimt5_fr_{bam,mos}_news : mT5 fine-tune standard,
#     `pip install sentencepiece` si pas deja present (deja dans
#     model-service/requirements.txt). Chargement via
#     AutoModelForSeq2SeqLM + AutoTokenizer comme NLLB, mais verifier le
#     README du modele pour un eventuel prefixe de tache style T5.
#   - k2-fsa/OmniVoice : `pip install transformers` (deja present).
#     Backbone Qwen3-0.6B + un `audio_tokenizer/` (codec audio, ~805 Mo)
#     dans un sous-dossier separe du repo -- snapshot_download le recupere
#     automatiquement (contrairement a from_pretrained() seul sur la racine),
#     d'ou l'usage de snapshot_download ici plutot que from_pretrained.
#
# Tailles approximatives (verifiees via l'API HF au moment de la redaction) :
#   facebook/omniASR-CTC-1B               ~3.9 Go (un seul fichier .pt)
#   masakhane/afrimt5_fr_bam_news         ~2.2 Go
#   masakhane/afrimt5_fr_mos_news         ~2.2 Go
#   k2-fsa/OmniVoice (+ audio_tokenizer)  ~3.2 Go
#   TOTAL                                 ~11.5 Go -- toujours verifier
#   l'espace disque et la bande passante disponible avant de lancer.

import os
import time
import traceback

os.environ.setdefault("HF_HUB_DISABLE_XET", "1")  # cf. pre_download.py : Xet gele
                                                    # sur les gros fichiers sous Windows
os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "60")

from dotenv import load_dotenv
load_dotenv()

from huggingface_hub import snapshot_download

HF_TOKEN = os.environ.get("HF_TOKEN")

if not HF_TOKEN:
    print("⚠️  HF_TOKEN introuvable (ni dans .env, ni au niveau système). "
          "Les téléchargements seront non authentifiés et plus lents.")
else:
    print("✅ HF_TOKEN trouvé, téléchargements authentifiés activés.")

MODELS = [
    ("facebook/omniASR-CTC-1B", "ASR (Dioula + Moore)"),
    ("masakhane/afrimt5_fr_bam_news", "Traduction fr<->Dioula/Bambara"),
    ("masakhane/afrimt5_fr_mos_news", "Traduction fr<->Moore"),
    ("k2-fsa/OmniVoice", "TTS Dioula"),
]

MAX_RETRIES = 5
BASE_DELAY_SECONDS = 5


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
    """Telecharge repo_id avec retry + backoff exponentiel. snapshot_download
    reprend automatiquement les fichiers partiellement telecharges (cache
    huggingface_hub) : relancer apres un echec ne repart pas de zero."""
    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            local_dir = snapshot_download(repo_id=repo_id, token=HF_TOKEN)
            return True, local_dir
        except Exception as exc:  # noqa: BLE001 - on veut retry sur toute erreur reseau/HTTP
            last_error = exc
            if attempt < MAX_RETRIES:
                delay = BASE_DELAY_SECONDS * (2 ** (attempt - 1))
                print(f"  ⚠️  Tentative {attempt}/{MAX_RETRIES} échouée "
                      f"({exc!r}), nouvelle tentative dans {delay}s...")
                time.sleep(delay)
            else:
                print(f"  ❌ Tentative {attempt}/{MAX_RETRIES} échouée, abandon.")
                traceback.print_exception(exc)
    return False, str(last_error)


def main() -> None:
    results: list[dict] = []

    for repo_id, description in MODELS:
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

    print("\n" + "=" * 60)
    print("RÉSUMÉ")
    print("=" * 60)
    total_size = 0
    all_ok = True
    for r in results:
        status = "✅" if r["ok"] else "❌"
        detail = human_size(r["size_bytes"]) if r["ok"] else r["path_or_error"]
        print(f"{status} {r['repo_id']:<45} {detail}")
        total_size += r["size_bytes"]
        all_ok = all_ok and r["ok"]

    print("-" * 60)
    print(f"Taille totale sur disque : {human_size(total_size)}")
    print("Tous les modèles sont en cache local." if all_ok
          else "⚠️  Au moins un modèle a échoué, voir le détail ci-dessus.")


if __name__ == "__main__":
    main()
