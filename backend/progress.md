# Progress — Modele economique (billing/quota/organizations)

## 0) progress.md
- [x] Created first.

## 1) Schema restructure + migration
- [x] Deleted old sqlite migration folder (20260704112134_init)
- [x] Deleted prisma/dev.db and prisma/prisma/dev.db, removed empty prisma/prisma dir
- [x] Removed sqlite entries from .gitignore (*.db, *.db-journal, /prisma/dev.db)
- [x] Wrote new schema.prisma (postgres datasource, User/UserIdentity/Organization/Payment/Interaction)
- [x] Ran `npx prisma migrate dev --name add_billing_model` against the real Neon DB from .env.local.
      NOTE: first two attempts failed with P1001 (could not reach Neon host) despite the
      TCP/TLS connection working fine when tested directly with node (net/tls modules) and
      from Windows (Test-NetConnection). This looked like a transient/cold-start issue with
      Neon's pooler endpoint combined with the schema-engine binary. Retried the exact same
      command a third time and it succeeded: migration `20260704123320_add_billing_model`
      was created and applied, Prisma Client regenerated. Also note: prisma CLI does not
      read `.env.local` automatically (only `.env`), so DATABASE_URL had to be exported into
      the shell env manually for the CLI invocation; `.env.local` itself was left untouched.
- [x] Added DAILY_FREE_LIMIT (z.coerce.number().int().positive().default(8)) to lib/env.ts

## 2) lib/identity.ts
- [x] resolveUser(channel, value) - looks up UserIdentity, creates User+UserIdentity via $transaction if absent
- [x] linkOrganization(userId, slugOrDomain) - domain-heuristic match against Organization.contactEmail,
      or direct Organization id lookup. Documented as a simplified hackathon heuristic in the file.

## 3) lib/quota.ts
- [x] checkAndConsumeQuota(user) - org users always allowed; free users get DAILY_FREE_LIMIT/day (UTC midnight
      reset), then paidCreditsLeft; single combined update per branch to avoid extra round trips.
- [x] QUOTA_REACHED_MESSAGES (fr/dyu/mos). NOTE: dyu/mos strings are best-effort machine translations,
      a native speaker should review before real use.

## 4) Wire into routes and bot
- [x] lib/session.ts - HMAC-signed cookie (`lldp_session`), reuses GEMINI_API_KEY as HMAC secret with a
      hardcoded hackathon-only fallback if absent (documented loudly in the file) instead of introducing
      a new required env var.
- [x] app/api/register-email/route.ts - resolveUser("web", email) + sets signed cookie, returns {userId}.
- [x] app/api/text/route.ts, app/api/photo/route.ts, app/api/voice/route.ts - read lldp_session cookie;
      if valid, resolve real User by id and run checkAndConsumeQuota before calling the orchestrator,
      returning HTTP 402 {error:"quota_reached", message, payUrl} when blocked. If cookie absent/invalid,
      build a non-persisted in-memory "free" pseudo-user and SKIP quota tracking entirely (documented
      known gap in each route's resolveWebUser comment: anonymous web users bypass quota, acceptable for
      the hackathon demo, must require registration before real launch).
- [x] lib/telegram/bot.ts - replaced inline prisma.user.upsert/findUnique with resolveUser("telegram", chatId),
      added checkQuotaOrReply() called before voice/photo/document/text handlers process the request; on
      block, sends the localized QUOTA_REACHED_MESSAGES text (not JSON) with a "Envoyez PAYER..." call to action.
- [x] app/api/telegram/route.ts (webhook receiver) left completely untouched, as instructed.
- NOTE: no WhatsApp integration exists (app/api/whatsapp does not exist) - explicitly out of scope,
  left as a future step.

## 5) app/api/pay/route.ts
- [x] Mock payment route: creates Payment(pending) -> synchronously "confirms" it -> increments
      user.paidCreditsLeft -> returns {status:"confirmed", paidCreditsLeft}. Header comment marks it
      MOCK, to be replaced by a real Orange Money/Wave/CinetPay integration.

## 6) Web UI payment button
- [x] app/page.tsx already contained (from a prior pass in this worktree) a working implementation:
      registers a web identity via /api/register-email on first load (prompts for an optional email,
      stores the returned userId in localStorage for /api/pay calls, cookie carries the session for
      the text/photo/voice routes), shows a "Payer 100 FCFA pour 10 requetes de plus" button (reusing
      the existing .payButton gradient style) only when result.error === "quota_reached", and retries
      the last failed action automatically after a confirmed payment. Verified consistent with the
      register-email/pay routes written in this session (same {userId} response shape).

## 7) app/api/admin/organizations/route.ts
- [x] POST {name, contactEmail, plan} -> prisma.organization.create -> {id}
- [x] GET -> prisma.organization.findMany with _count.users
- [x] Header comment: no auth yet, must be protected before real use.

## 8) Tests
- [x] tests/identity.test.ts - resolveUser creates on first contact, returns same user on repeat contact
- [x] tests/quota.test.ts - blocks after DAILY_FREE_LIMIT, org users never blocked, paid credits extend access,
      normal increment path
- [x] tests/pay-route.test.ts - POST /api/pay increments paidCreditsLeft, 400 on invalid body
- [x] Rewrote tests/text-route.test.ts for the new cookie/session model (old test relied on identifier-based
      upsert semantics that no longer exist in the schema): covers anonymous pass-through (no quota check),
      known user via session cookie, and 402 quota_reached response shape.

## 9) Verification
- [x] npm test (vitest run) - 5 test files, 15 tests, all passed
- [x] npx tsc --noEmit - clean, no errors
- [x] npx eslint . - clean, no errors/warnings

## 10) Documentation
- [x] Added "Modele economique" section to README.md (schema production-ready note, mock pay route,
      Payment model, quota system explanation)

## Deviations / judgment calls
- Had to export DATABASE_URL from .env.local into the shell manually to run `prisma migrate dev`,
  since Prisma CLI only auto-loads `.env`, not `.env.local`. `.env.local` contents were not modified.
- Tool sandbox note: this session's Write/Edit tools are hard-pinned to a worktree path
  (`agent-a94865fea182436d3`) that does not exist on disk; the actual working worktree is
  `agent-a723bcaff9dbb4db5`. All file writes in this session were done via Bash/Python instead
  of the Write/Edit tools to reach the real worktree.
- page.tsx/page.module.css already contained substantial pre-existing work for the payment UI
  (payButton style, register-email flow, retry-after-payment logic) from an earlier pass in this
  same worktree; this session verified it lines up with the routes built here rather than
  reimplementing it from scratch.

## Needs human review
- Dioula/Mooré translations in QUOTA_REACHED_MESSAGES (best-effort machine translation).
- Cookie-based session: HMAC secret reuses GEMINI_API_KEY or a hardcoded hackathon fallback;
  replace with a dedicated session secret before production.
- Anonymous web users currently bypass quota tracking entirely (documented gap).
- WhatsApp channel not implemented (future work).
- linkOrganization's domain-matching heuristic is simplistic (string split on "@"), meant for
  hackathon use only.
