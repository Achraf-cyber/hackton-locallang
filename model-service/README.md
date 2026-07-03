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

Ce dossier est deploye comme un Space Docker (header YAML ci-dessus :
`sdk: docker`, `app_port: 7860`), automatiquement a chaque push sur `main`
via le workflow `.github/workflows/deploy-model-service.yml` (voir la racine
du monorepo). Le Space lit `ALLOWED_ORIGINS` et `HF_TOKEN` depuis ses propres
"Secrets" (Settings > Variables and secrets du Space), pas depuis ce repo.
