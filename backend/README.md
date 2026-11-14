# backend

Next.js 16 (App Router) application: web translator UI, the `/demo` e-casier site, all API
routes, and the Telegram bot webhook. Part of the [Farafina AI](../README.md) monorepo.

## Run locally

```bash
npm ci
cp .env.example .env.local     # fill in GEMINI_API_KEY, DATABASE_URL, MODEL_SERVICE_URL...
npx prisma migrate deploy
npm run dev                    # http://localhost:3000
```

Note: the Prisma CLI reads `.env`, not `.env.local`. Export `DATABASE_URL` in your shell (or copy
it to `.env`) before running Prisma commands.

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `build` / `start` | Next.js dev server, production build (runs `prisma generate`), start |
| `npm test` | Vitest unit tests (`tests/`) |
| `npm run lint` | ESLint |
| `npm run dev:bot` | Run the Telegram bot locally (needs `TELEGRAM_TOKEN`) |
| `npm run pregenerate-audio` | Regenerate the fixed bot voice prompts in `public/audio/` (needs the model service) |

## API routes (`app/api/`)

| Route | Purpose |
|-------|---------|
| `POST /api/text` | Simplify and translate text (`text`, `lang` = `dyu`/`mos`, `mode` = `answer`/`explain`) |
| `POST /api/voice` | Transcribe speech, answer, translate and synthesize audio |
| `POST /api/photo` | Explain an image or PDF (max 15 MB) |
| `POST /api/telegram` | Telegram webhook |
| `POST /api/register-email`, `GET /api/user-stats`, `GET /api/stats` | User registration and usage stats |
| `POST /api/pay` | Credit purchase (**mock** provider) |
| `GET /api/health` | Health check |
| `/api/demo/*` | Backend of the e-casier demo site |
| `/api/admin/organizations` | Organization management |

Request and response details live in each `route.ts` file (Zod schemas at the top).

## Key modules (`lib/`)

`orchestrator.ts` (LLM + model-service pipeline), `llm.ts` (Gemini), `modelService.ts` (HTTP
client), `quota.ts`, `identity.ts`, `session.ts`, `telegram/` (bot and casier state machine),
`demo/` and `demoAutomation.ts` (demo site and automation client), `env.ts` (validated env).

## Business model

The Prisma schema (`prisma/schema.prisma`) is ready for a commercial launch:

- **Organization**: enterprise or administration accounts with a plan, a brand config and a
  glossary. A `User` attached to an organization is never subject to the free quota.
- **Free quota** (`lib/quota.ts`): the counting and reset logic exists, but the daily limit is
  currently hard-coded to a value no real usage can reach, so it is effectively disabled.
- **Payment**: each credit purchase creates a `Payment` row. `app/api/pay/route.ts` is a **mock**
  that simulates an immediate confirmation. A real mobile-money integration (Orange Money, Wave,
  CinetPay...) is still missing.
