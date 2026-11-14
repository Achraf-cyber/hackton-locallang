# Contributing

Thanks for your interest. This project started as a hackathon, so small, focused pull requests
are the easiest to review.

## Workflow

1. Fork the repository and create a branch from `main`
   (`feat/...`, `fix/...`, `docs/...`).
2. Make your change and run the checks below for the service you touched.
3. Open a pull request describing what changed and why.

## Checks

```bash
# backend
cd backend && npm ci && npx prisma generate && npx tsc --noEmit && npm test

# model-service
cd model-service && pip install -r requirements.txt && python -m pytest -m "not slow"

# automation-service
node --check automation-service/server.js
```

CI (`.github/workflows/ci.yml`) runs the same checks on every pull request.

## Conventions

- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Never commit secrets. Use the `.env.example` files as templates; real `.env` files are ignored.
- Add or update tests for behavior changes (Vitest in `backend/tests`, pytest in
  `model-service/tests`).
- Keep the Hugging Face Space deploy workflows working: they sync whole folders.
- Never point the automation service at a real government website.
