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

Ce dossier alimente DEUX Spaces Docker separes (16 Go de RAM chacun),
synchronises automatiquement a chaque push sur `main` :

- **Traduction + TTS** (`AchrafCyber/model-service`, header YAML ci-dessus :
  `sdk: docker`, `app_port: 7860`, `Dockerfile`) : NLLB-200-3.3B + TTS
  dyu/mos. Workflow : `.github/workflows/deploy-model-service.yml`.
- **ASR** (`AchrafCyber/asr-service`, `Dockerfile.asr`, point d'entree
  `app/main_asr.py`) : omniASR-LLM-7B (Meta Omnilingual ASR). Workflow :
  `.github/workflows/deploy-asr-service.yml`, qui renomme `Dockerfile.asr`
  en `Dockerfile` dans le Space cible (HF Spaces exige ce nom exact).

Les deux workflows partagent le meme dossier source (`model-service/`) mais
poussent vers deux repos Space distincts avec un `Dockerfile` different.
Chaque Space lit ses propres "Secrets" (Settings > Variables and secrets du
Space : `ALLOWED_ORIGINS`, `HF_TOKEN`), pas ce repo. Cote backend, l'URL du
Space ASR se configure via `ASR_SERVICE_URL` (voir `backend/lib/env.ts`) ;
si absente, `/transcribe` retombe sur `MODEL_SERVICE_URL` (mode "un seul
Space", utile en local).
