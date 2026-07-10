# Farafina AI — Tech Stack

Sovereign AI for local languages of Burkina Faso (**Dioula / Dyula** and **Mooré**):
translation, speech-to-text, text-to-speech, and an e-government assistant — reachable
from the web, Telegram, and (planned) WhatsApp.

The system is a **Next.js backend + three separate model-serving Spaces + a dedicated
browser-automation Space**, kept apart on purpose so no single container has to hold
every heavy model at once.

---

## 1. Architecture at a glance

```
                ┌────────────────────────────────────────────┐
   Web app ─────▶                                              │
   Telegram ────▶   backend/  (Next.js 16 on Vercel)          │
   WhatsApp ────▶     • App Router UI + API routes             │
   (planned)          • Telegram bot (grammY)                  │
                      • Orchestrator, quotas, sessions         │
                      • Prisma / PostgreSQL                    │
                └───────┬───────────┬───────────┬─────────────┘
                        │           │           │
          MODEL_SERVICE │  ASR_SVC  │  TTS_SVC  │  AUTOMATION_SVC
                        ▼           ▼           ▼           ▼
                ┌───────────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐
                │ Translation│ │   ASR    │ │  TTS   │ │  Playwright  │
                │  (NLLB /   │ │(Omniling.│ │(MMS-TTS│ │  form-filler │
                │  GO AI)    │ │  ASR)    │ │ dyu/mos│ │  (e-casier)  │
                └───────────┘ └──────────┘ └────────┘ └──────────────┘
                 Hugging Face Spaces (Docker, ~16 GB each)
```

Each arrow is an independent HTTP service selected by an env var. Any of the model
Spaces can fall back to `MODEL_SERVICE_URL` when its own URL is unset, so a single
machine can run everything in local dev.

---

## 2. Backend / web app — `backend/`

| Layer | Choice | Notes |
|-------|--------|-------|
| Framework | **Next.js 16** (App Router) | UI **and** API routes in one deployment |
| Language | **TypeScript 5** | |
| UI | **React 19**, `lucide-react` icons | Web translator + the `/demo` e-casier site |
| Hosting | **Vercel** (serverless) | https://hackton-locallang.vercel.app |
| Database | **PostgreSQL** via **Prisma 6** | users, orgs, payments, quotas, casier sessions |
| Validation | **Zod 4** | env parsing (`lib/env.ts`) and schema validation |
| Bot framework | **grammY 1** | Telegram bot (`@Africalangbot`) |
| Messaging | **Twilio 6** | WhatsApp channel (scaffolded) |
| LLM SDK | **Vercel AI SDK** (`ai` v7) + `@ai-sdk/google` | Google **Gemini 2.5 Flash** |
| PDF | **pdf-lib** | generates the demo récépissé |
| Browser | **playwright-core** + `@sparticuz/chromium` | in-process fallback for automation |
| Tests | **Vitest 4** | |
| Dev tooling | **tsx** (bot dev runner), ESLint 9 | |

Key modules in `backend/lib/`: `orchestrator.ts` (routes a request through
translate/ASR/TTS), `modelService.ts` (HTTP client for the model Spaces),
`quota.ts` + `session.ts` (free-tier limits and conversational state),
`llm.ts` (Gemini document/identity extraction), `telegram/` (bot + the
`casierFlow` state machine), `demo/` + `demoAutomation.ts` (the e-casier demo).

---

## 3. Model services — `model-service/` (Python)

One FastAPI codebase, deployed as **three separate Hugging Face Spaces** (each ~16 GB
RAM) so heavy models never share a container and OOM-crash it.

| Service | Space | Model(s) | Dockerfile |
|---------|-------|----------|-----------|
| **Translation** | `AchrafCyber/model-service` | `facebook/nllb-200-3.3B` (~13 GB) — or the **GO AI Corporation** stack, selected by `MODEL_STACK` (`old` \| `goaicorp`) | `Dockerfile` |
| **ASR** (speech→text) | `AchrafCyber/asr-service` | Meta **Omnilingual ASR** (`omniASR-LLM-7B`) — native `dyu/mos/fra`, Linux-only (needs `fairseq2`) | `Dockerfile.asr` |
| **TTS** (text→speech) | `AchrafCyber/tts-service` | **`facebook/mms-tts-dyu`** (Dioula) + MMS-TTS Mooré | `Dockerfile.omnivoice` |

- **Python** stack: **FastAPI** + **Uvicorn**, **Hugging Face Transformers**, **PyTorch**,
  `accelerate`, `sentencepiece`, `soundfile` / `scipy` / `pydub` for audio, `pytest` for tests.
- `MODEL_STACK` toggles between the open `facebook/*` models (`old`) and the GO AI Corp
  models (`goaicorp`, CC-BY-NC, non-commercial).
- OmniVoice was trialled for Dioula TTS and dropped (mis-articulated some words); the live
  backend is `facebook/mms-tts-dyu`.

---

## 4. Automation service — `automation-service/` (Node)

A **standalone Express + Playwright** service that fills the **demo** e-casier
government form with a headless Chromium.

- Runs as its own Docker Space because a persistent Node process + a real Chromium binary
  don't fit a standard Vercel serverless function.
- Called by `backend/lib/demoAutomation.ts` via `AUTOMATION_SERVICE_URL`; if unset, the
  backend falls back to an in-process Playwright launch (dev only).
- **Only ever targets the local demo clone** — guarded by `assertNotRealGovSite()`
  (rejects `ecasier-judiciaire.gov.bf`). The real government site is never automated.
- **Deployment status:** built in code, **not yet deployed** — the workflow points at a
  placeholder Space (`AchrafCyber/automation-service-disabled`) until the Space is created.

---

## 5. Infrastructure & CI/CD

- **Vercel** — hosts the Next.js backend (web app + API + Telegram webhook).
- **Hugging Face Spaces** — host the four Docker model/automation services.
- **GitHub Actions** — one deploy workflow per Space (`.github/workflows/deploy-*.yml`);
  each rsyncs the relevant folder into that Space's git repo, swapping in the correct
  Dockerfile.
- **PostgreSQL** — managed Postgres via `DATABASE_URL` (Prisma).
- **Payments** — modelled in Prisma (`Payment`), currently a `mock` provider; Orange Money
  / Wave planned.

### Environment variables (from `backend/lib/env.ts`)

| Var | Purpose |
|-----|---------|
| `GEMINI_API_KEY`, `LLM_MODEL` | Google Gemini (default `google/gemini-2.5-flash`) |
| `MODEL_SERVICE_URL` | Translation Space (required; fallback for the others) |
| `ASR_SERVICE_URL` | Dedicated ASR Space (optional) |
| `TTS_SERVICE_URL` | Dedicated TTS Space (optional) |
| `AUTOMATION_SERVICE_URL` | Playwright automation Space (optional) |
| `DEMO_BASE_URL` | Public URL of this deployment (bot fetches the récépissé PDF) |
| `TELEGRAM_TOKEN` | Telegram bot |
| `DATABASE_URL` | PostgreSQL |

---

## 6. Presentation assets — `presentation/`

The pitch deck is **generated from code** for consistency:

- **`build_deck.js`** — deck content/layout, built with **pptxgenjs** (Node).
- **`rezip.py`** — recompresses the `.pptx` (Python).
- **`add_transitions.py`** — injects fade transitions (Python; pptxgenjs can't).

See [`README.md`](README.md) to rebuild the deck and [`LINKS.md`](LINKS.md) for all live URLs.

---

## Language / runtime summary

| Domain | Language | Runtime |
|--------|----------|---------|
| Web app, API, bots | TypeScript | Node.js / Next.js 16 (Vercel) |
| Model serving (MT/ASR/TTS) | Python | FastAPI / Uvicorn (HF Spaces, Docker) |
| Form automation | JavaScript | Node.js / Express + Playwright (HF Space, Docker) |
| Deck tooling | JS + Python | pptxgenjs, python-pptx zip tooling |
