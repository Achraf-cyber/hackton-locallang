---
title: model-service
emoji: 🗣️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 7860
---

# model-service

Service Python FastAPI dont le seul role est d'exposer l'acces aux langues
Dioula et Moore : reconnaissance vocale (ASR), traduction et synthese vocale
(TTS). Aucune logique de LLM, de base de donnees ou de simplification n'est
geree ici.

## Structure

```
model-service/
├── app/
│   ├── main.py          # point d'entree FastAPI
│   ├── deps.py          # configuration (Settings)
│   └── services/
│       ├── asr.py       # reconnaissance vocale
│       ├── translation.py  # traduction
│       └── tts.py       # synthese vocale
└── tests/
```

## Developpement local

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## Modeles utilises

Deux stacks de traduction sont disponibles, selectionnees via la variable
d'env `MODEL_STACK` (voir `app/deps.py`) :

| Stack | Traduction FR<->local | Traduction locale<->locale | Licence |
|-------|------------------------|------------------------------|---------|
| `old` (defaut) | `facebook/nllb-200-3.3B` | via NLLB (paire directe) | MIT/CC (Meta) |
| `goaicorp` | `goaicorp/dyu-translation`, `goaicorp/mos-translation` | pivot par le francais (deux appels sequentiels via les deux modeles GO AI) | CC-BY-NC 4.0, non-commercial (Wendpanga Aristide Bandaogo, GO AI Corporation) |

`MODEL_STACK` vaut `"old"` par defaut : aucun changement en prod tant que la
variable n'est pas positionnee explicitement a `"goaicorp"` dans les secrets
du Space HF concerne.

ASR : par defaut `facebook/omniASR-LLM-7B` (Meta Omnilingual ASR, backend
`omnilingual_llm`), avec repli local sur `facebook/mms-1b-all` si le paquet
`omnilingual-asr` (Linux/WSL uniquement) est indisponible (`ASR_BACKEND`, voir
`app/deps.py`). Quand `MODEL_STACK=goaicorp`, tous ces backends sont ignores
au profit de `goaicorp/mos-asr` et `goaicorp/dyu-asr` (le francais reste sur
`openai/whisper-large-v3`, GO AI n'ayant pas de modele ASR francais dedie).

TTS : `facebook/mms-tts-dyu` (dioula) et `facebook/mms-tts-mos` (moore),
modeles VITS. Un backend `k2-fsa/OmniVoice` a ete teste pour le dioula
(`TTS_BACKEND_DYU=omnivoice`) puis desactive suite a des retours utilisateur
sur une articulation incorrecte de certains mots — `mms` reste le defaut de
`Settings`. GO AI n'a pas de modele TTS dioula, donc les deux stacks de
traduction utilisent le meme backend TTS. La sortie audio est encodee en
OGG/Opus (via pydub/ffmpeg, voir `_write_ogg_opus()` dans `tts.py`) : c'est
le seul format que l'API Telegram `sendVoice` accepte (le WAV brut ne
fonctionne avec aucune methode d'envoi audio de Telegram).

## Deploiement sur Hugging Face Spaces

Ce dossier alimente TROIS Spaces Docker separes (16 Go de RAM chacun),
synchronises automatiquement a chaque push sur `main` :

- **Traduction** (`AchrafCyber/model-service`, header YAML ci-dessus :
  `sdk: docker`, `app_port: 7860`, `Dockerfile`) : stack de traduction
  (`/translate`, `/to-french`, voir "Modeles utilises" ci-dessus). Workflow :
  `.github/workflows/deploy-model-service.yml`.
- **ASR** (`AchrafCyber/asr-service`, `Dockerfile.asr`, point d'entree
  `app/main_asr.py`) : omniASR-LLM-7B (Meta Omnilingual ASR). Workflow :
  `.github/workflows/deploy-asr-service.yml`, qui renomme `Dockerfile.asr`
  en `Dockerfile` dans le Space cible (HF Spaces exige ce nom exact).
- **TTS** (`AchrafCyber/tts-service`, `Dockerfile.omnivoice`) : MMS-TTS pour
  le dioula et le moore (`/speak`). Le nom du Dockerfile date de l'essai
  OmniVoice (voir ci-dessus) mais le backend actif par defaut est `mms`.
  Workflow : `.github/workflows/deploy-tts-service.yml`, meme mecanisme de
  renommage.

Un quatrieme Space (`automation-service`, automatisation Playwright du site
DEMO e-casier) existe dans le monorepo mais n'est **pas deploye actuellement**
— le workflow `.github/workflows/deploy-automation-service.yml` cible
`AchrafCyber/automation-service-disabled`, un nom placeholder, tant que ce
Space n'a pas ete cree manuellement sur huggingface.co/new-space.

Ces Spaces existent separement parce que NLLB-200-3.3B (~13 Go),
omniASR-LLM-7B (~29 Go) et un modele TTS charges ensemble dans un seul Space
de 16 Go font crasher le conteneur (OOM) des qu'une requete declenche le
chargement de plusieurs modeles lourds a la fois.

Les workflows partagent le meme dossier source (`model-service/`) mais
poussent vers des repos Space distincts avec un `Dockerfile` different.
Chaque Space lit ses propres "Secrets" (Settings > Variables and secrets du
Space : `ALLOWED_ORIGINS`, `HF_TOKEN`, `MODEL_STACK`), pas ce repo. Cote
backend, l'URL de chaque Space se configure via `ASR_SERVICE_URL` /
`TTS_SERVICE_URL` (voir `backend/lib/env.ts`) ; si absentes, `/transcribe` et
`/speak` retombent sur `MODEL_SERVICE_URL` (mode "un seul Space", utile en
local — c'est pour ce mode que `/localize` combinant traduction+TTS est
conserve cote FastAPI).
