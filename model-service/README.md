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

## Deploiement sur Hugging Face Spaces

Ce dossier alimente TROIS Spaces Docker separes (16 Go de RAM chacun),
synchronises automatiquement a chaque push sur `main` :

- **Traduction** (`AchrafCyber/model-service`, header YAML ci-dessus :
  `sdk: docker`, `app_port: 7860`, `Dockerfile`) : NLLB-200-3.3B seul
  (`/translate`, `/to-french`). Workflow :
  `.github/workflows/deploy-model-service.yml`.
- **ASR** (`AchrafCyber/asr-service`, `Dockerfile.asr`, point d'entree
  `app/main_asr.py`) : omniASR-LLM-7B (Meta Omnilingual ASR). Workflow :
  `.github/workflows/deploy-asr-service.yml`, qui renomme `Dockerfile.asr`
  en `Dockerfile` dans le Space cible (HF Spaces exige ce nom exact).
- **TTS** (`AchrafCyber/tts-service`, `Dockerfile.omnivoice`) : k2-fsa/OmniVoice
  pour le dioula + MMS-TTS pour le mooré (`/speak`). Workflow :
  `.github/workflows/deploy-tts-service.yml`, meme mecanisme de renommage.

Ces trois Spaces existent separement parce que NLLB-200-3.3B (~13 Go),
omniASR-LLM-7B (~29 Go) et OmniVoice charges ensemble dans un seul Space de
16 Go font crasher le conteneur (OOM) des qu'une requete declenche le
chargement de plusieurs modeles lourds a la fois.

Les trois workflows partagent le meme dossier source (`model-service/`) mais
poussent vers trois repos Space distincts avec un `Dockerfile` different.
Chaque Space lit ses propres "Secrets" (Settings > Variables and secrets du
Space : `ALLOWED_ORIGINS`, `HF_TOKEN`), pas ce repo. Cote backend, l'URL de
chaque Space se configure via `ASR_SERVICE_URL` / `TTS_SERVICE_URL` (voir
`backend/lib/env.ts`) ; si absentes, `/transcribe` et `/speak` retombent sur
`MODEL_SERVICE_URL` (mode "un seul Space", utile en local — c'est pour ce
mode que `/localize` combinant traduction+TTS est conserve cote FastAPI).
