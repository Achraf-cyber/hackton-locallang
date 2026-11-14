# Farafina AI (hackton-locallang)

Sovereign AI for the local languages of Burkina Faso: **Dioula (Dyula)** and **Mooré**.
Translation, speech-to-text, text-to-speech and a small e-government assistant, reachable
from a web app and a Telegram bot. Built during a hackathon.

- Web app: <https://hackton-locallang.vercel.app>
- E-government demo: <https://hackton-locallang.vercel.app/demo>
- Telegram bot: [@Africalangbot](https://t.me/Africalangbot)
- All project links: [`presentation/LINKS.md`](presentation/LINKS.md)

> The hosted services (Vercel, Hugging Face Spaces) may be sleeping or offline. The code in
> this repository is the source of truth.

## The problem

Most administrative documents and public information in Burkina Faso are written in French,
while a large part of the population speaks Dioula or Mooré and may not read French. Few
tools offer machine translation, voice input and voice output for these languages.

## What it does

- **Translate and simplify**: a text is simplified by an LLM (Google Gemini via the Vercel AI
  SDK), translated to Dioula or Mooré, and returned as text plus an audio file (`/api/text`).
- **Voice in, voice out**: speech recorded in Dioula, Mooré or French is transcribed (ASR),
  answered, translated and read back with TTS (`/api/voice`).
- **Explain a document from a photo or PDF**: the LLM reads an image or PDF (max 15 MB) and
  explains it in the user's language (`/api/photo`).
- **Telegram bot**: language picker, free-text questions, document explanation, and a guided
  "casier judiciaire" (criminal record certificate) request, with pre-generated voice prompts
  in both languages (`backend/public/audio/`).
- **E-casier demo site**: a clone of a government request form (`/demo`) used to show the
  end-to-end flow, with receipt PDF generation. It is a demo, not a real government service.
- **Browser automation**: a Playwright service that fills the demo form. A guard refuses to
  run against the real government domain.
- **Usage model**: Prisma schema for users, organizations, payments and quotas. The payment
  endpoint is a **mock** (no real mobile-money integration yet) and the free daily quota is
  effectively disabled in code (`backend/lib/quota.ts`).

## Architecture

```
  Web app ─────┐
  Telegram ────┼──▶  backend/  (Next.js 16, Vercel)
  WhatsApp*    │      UI + API routes, Telegram bot (grammY), orchestrator,
               │      quotas, sessions, Prisma / PostgreSQL, Gemini LLM
               │
               ├── MODEL_SERVICE_URL ──▶ model-service  (translation)    ┐ FastAPI,
               ├── ASR_SERVICE_URL ────▶ asr-service    (speech-to-text) ├ Hugging Face
               ├── TTS_SERVICE_URL ────▶ tts-service    (text-to-speech) ┘ Spaces (Docker)
               └── AUTOMATION_SERVICE_URL ▶ automation-service (Playwright, optional)

  * WhatsApp via Twilio is a declared dependency only; no channel is implemented in the code yet.
```

`ASR_SERVICE_URL` and `TTS_SERVICE_URL` are optional: when unset, the backend falls back to
`MODEL_SERVICE_URL`, so a single `model-service` process is enough for local development.
The model services are split into separate Spaces because loading NLLB-200-3.3B, an ASR model and
a TTS model together exceeds 16 GB of RAM. See [`model-service/README.md`](model-service/README.md).

Deeper detail: [`presentation/TECH_STACK.md`](presentation/TECH_STACK.md).

## Tech stack

| Area | Technologies |
|------|--------------|
| Backend / web | Next.js 16 (App Router), React 19, TypeScript, Zod, Prisma 6, PostgreSQL, grammY, Vercel AI SDK + Gemini, pdf-lib, Vitest |
| Model services | Python, FastAPI, Uvicorn, Hugging Face Transformers, PyTorch, pydub, pytest |
| Models | NLLB-200-3.3B or GO AI Corp translation models (`MODEL_STACK`), Meta Omnilingual ASR, MMS-TTS (Dioula, Mooré) |
| Automation | Node.js, Express, Playwright |
| Infra / CI | Docker, Hugging Face Spaces, Vercel, GitHub Actions |

## Repository layout

```
backend/              Next.js app: web UI, /demo site, API routes, Telegram bot, Prisma schema, tests
model-service/        FastAPI app for translation, ASR and TTS (3 Dockerfiles, 3 Spaces)
automation-service/   Express + Playwright service that fills the demo form
automation/           Standalone Playwright script for local runs against the demo
presentation/         Pitch deck (generated from code), tech stack and links
.github/workflows/    CI and Hugging Face Spaces deploy workflows
*.py (root)           Helper scripts to pre-download Hugging Face models
```

## Getting started

Prerequisites: Node.js 20+, Python 3.11, a PostgreSQL database, a Gemini API key. Real model
inference needs several GB of disk and RAM (see the model-service README).

### 1. Model service (Python)

```bash
cd model-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

ffmpeg must be installed (audio is encoded to OGG/Opus). Models are downloaded from Hugging Face
on first use. Fast tests that use fake models:

```bash
python -m pytest -m "not slow"
```

### 2. Backend (Next.js)

```bash
cd backend
npm ci
cp .env.example .env.local      # then fill in the values
npx prisma migrate deploy       # applies the migrations to DATABASE_URL
npm run dev                     # http://localhost:3000
```

Other scripts: `npm test`, `npm run lint`, `npm run dev:bot` (run the Telegram bot locally),
`npm run pregenerate-audio` (regenerate the fixed bot voice prompts, needs the model service).

### 3. Automation service (optional)

```bash
cd automation-service
npm install
DEMO_BASE_URL=http://localhost:3000 npm start
```

## Environment variables

Each service has an example file:
[`backend/.env.example`](backend/.env.example),
[`model-service/.env.example`](model-service/.env.example),
[`automation-service/.env.example`](automation-service/.env.example).
Never commit real values.

## Tests and CI

`.github/workflows/ci.yml` runs on every push and pull request: TypeScript type-check and Vitest
for the backend, pytest (fast tests, no real models) for the model service, and a syntax check
for the automation service. ESLint is reported but does not block yet (known `any` usages).

## Deployment

The backend is deployed on Vercel. Each `deploy-*.yml` workflow syncs a folder to a Hugging
Face Space on push to `main` and needs the `HF_SPACE_TOKEN` repository secret. The automation
Space is not deployed: its workflow only runs when the repository variable
`AUTOMATION_SPACE_ENABLED` is `true` and `HF_SPACE` points to a real Space.

## Known limitations

- Payment is mocked; there is no real mobile-money provider.
- Anonymous web users are not quota-tracked (documented in `backend/app/api/text/route.ts`).
- The session cookie is signed with `GEMINI_API_KEY` as a hackathon shortcut.
- Dioula and Mooré UI strings are best-effort machine translations and need native review.
- The GO AI Corp models are licensed CC-BY-NC 4.0 (non-commercial).

## Roadmap

- Real mobile-money payments (Orange Money, Wave)
- WhatsApp channel
- Dedicated session secret and mandatory sign-up for quota tracking
- Native-speaker review of translations and voice prompts
- Deploy the automation Space

## Screenshots and demo

Placeholders, to be added by the authors:

- `docs/screenshots/web-app.png` (web translator)
- `docs/screenshots/telegram-bot.png` (bot conversation)
- Demo video: see `presentation/` (`media/` is git-ignored)

## Contributing and license

See [CONTRIBUTING.md](CONTRIBUTING.md). No license file is present yet: until the owner adds
one, all rights are reserved by default. Third-party models keep their own licenses.
