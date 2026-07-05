---
title: automation-service
emoji: 🤖
colorFrom: gray
colorTo: blue
sdk: docker
app_port: 7860
---

# automation-service

Service Node/Express dédié à l'automatisation Playwright du site DEMO
"e-casier" (voir `backend/app/demo/*`). Appelé par
`backend/lib/demoAutomation.ts` via la variable d'env
`AUTOMATION_SERVICE_URL`.

## Pourquoi un Space séparé ?

Un navigateur headless (Chromium) a besoin d'un process Node persistant et
d'un binaire volumineux — incompatible avec une fonction serverless Vercel
standard (filesystem en lecture seule, limite de taille de déploiement,
timeout court). Même raisonnement que le split
`model-service`/`asr-service`/`tts-service` (voir `model-service/README.md`),
appliqué ici à une contrainte d'exécution plutôt que de RAM.

## API

```
POST /submit-casier
Body: {
  "formState": { "demandeur": {...}, "filiation": {...} },
  "documents": {
    "acteNaissance": { "base64": "...", "mimeType": "application/pdf", "fileName": "acte.pdf" },
    "pieceIdentite": { "base64": "...", "mimeType": "application/pdf", "fileName": "cnib.pdf" }
  },
  "demoBaseUrl": "https://<déploiement backend>"  // optionnel, sinon DEMO_BASE_URL (env)
}
-> { "referenceCode": "DEMO-2026-123456", "pdfBase64": "..." }

GET /health -> { "status": "ok" }
```

## Garde-fou

`assertNotRealGovSite()` refuse de lancer l'automatisation si `demoBaseUrl`/
`DEMO_BASE_URL` pointe vers `ecasier-judiciaire.gov.bf` (ou un sous-domaine).
Ce service ne doit JAMAIS automatiser un site gouvernemental réel — seulement
notre propre clone DEMO.

## Déploiement

Space Docker séparé (`AchrafCyber/automation-service`), synchronisé
automatiquement à chaque push sur `main` touchant ce dossier — voir
`.github/workflows/deploy-automation-service.yml`. Variable d'env à définir
dans les Secrets du Space : `DEMO_BASE_URL` (URL publique du déploiement
`backend`, PAS localhost).
