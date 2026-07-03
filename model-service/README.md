---
title: model-service
emoji: 🗣️
colorFrom: blue
colorTo: green
sdk: docker
app_port: 8000
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

Ce dossier peut etre pousse tel quel comme un Space Docker (le header YAML
ci-dessus est deja configure pour `sdk: docker` et `app_port: 8000`).
