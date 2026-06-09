# StashPass API — CLAUDE.md

**Stack:** Node.js · Fastify 4 · TypeScript 5 · PostgreSQL · Redis  
**Repo:** github.com/MysterWolf/stashpass-api  
**Phase:** 1+2 complete (Auth + Wallet + Operators)  
**Deployed:** https://stashpass-api-production.up.railway.app

---

## Project Overview

StashPass is a multi-operator loyalty wallet platform. Users accumulate and redeem points at participating operator locations. Circles enable social point-sharing between trusted users.

**Core entities:**
- `users` — consumers identified by phone or email
- `operators` — businesses (cannabis, coffee, barbershop, etc.)
- `locations` — physical sites under an operator
- `franchise_groups` — optional umbrella brand grouping operators
- `user_wallets` — one per (user, operator) pair; holds current balance
- `transactions` — immutable ledger of all earn/redeem/adjust/share events
- `circles` / `circle_members` / `circle_shares` — social sharing groups

---

## Architecture Invariants

### Database
- **Every balance mutation goes through `applyTransaction()`** in `wallet.service.ts`. Never write directly to `user_wallets.balance_points` from a route handler.
- `applyTransaction` runs at `ISOLATION LEVEL SERIALIZABLE` with a `FOR UPDATE` wallet row lock. Do not weaken this.
- `balance_points` has a `CHECK (balance_points >= 0)` constraint. The service layer enforces this before hitting the DB, but the constraint is the last line of defense.
- `transactions` is append-only. Never `UPDATE` or `DELETE` rows from it. Use `type = 'adjust'` with a positive/negative delta for corrections.
- `refresh_tokens.token_hash` stores SHA-256 of the raw token — never store the raw token.
- `_migrations` table tracks applied SQL files; add new ones as `002_*.sql`, `003_*.sql`, etc.

### Auth
- OTPs and magic-link tokens live in Redis only (keys `otp:<contact>` and `magic:<token>`). TTL is `OTP_TTL_SECONDS` (default 600 s). They are deleted on first successful use.
- Refresh token rotation: old token is revoked, new token is issued atomically in a single transaction. A revoked token must never issue a new pair — treat token reuse as a security event.
- Access tokens are short-lived JWTs (`JWT_ACCESS_TTL`, default 15 m). Do not extend this without security review.
- `_dev_otp` and `_dev_token` fields are only present when `NODE_ENV !== 'production'`. Never remove this guard.

### Wallet
- `points_per_dollar` and `redemption_rate` live on the `operators` row. If an operator changes their rate, historical transactions are unaffected (they record the delta at time of earn/redeem).
- `lifetime_earned` / `lifetime_spent` are maintained by `applyTransaction` — they are convenience denormalisations and must always equal the sum of positive/negative deltas in `transactions` for that wallet.
- Max history page size is 200. Pagination is cursor-based (`before` = ISO timestamp of the oldest row from the previous page).

### API Shape
- All routes return `{ error: string }` on failure and domain objects on success.
- Zod parses every request body/query at the route layer. Throw from Zod and the `errorHandler` converts it to a structured 400.
- `req.user` is the decoded JWT payload (`{ sub, role }`). Cast to `JwtPayload` from `src/types.ts`.

---

## Folder Structure

```
src/
  server.ts           — Fastify app + plugin registration
  types.ts            — Shared TypeScript interfaces
  routes/
    auth.ts           — /auth/* endpoints
    wallet.ts         — /wallet/* endpoints
    operators.ts      — /operators/* endpoints (Phase 2)
  services/
    auth.service.ts   — OTP, magic link, JWT, user upsert
    wallet.service.ts — earn, redeem, balance, history
    operator.service.ts — operator CRUD + Haversine geo search
    email.service.ts  — Resend OTP delivery (instantiated per-call, NOT at module level)
  db/
    client.ts         — pg Pool singleton
    redis.ts          — ioredis singleton
    migrate.ts        — CLI migration runner
    migrations/
      001_initial_schema.sql
  middleware/
    auth.middleware.ts  — requireAuth / requireRole hooks
    error.middleware.ts — Fastify error handler
```

---

## Environment Variables

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `NODE_ENV` | `development` | Set to `production` in prod |
| `DATABASE_URL` | — | Required. PostgreSQL connection string |
| `REDIS_URL` | — | Required. Redis connection string |
| `JWT_SECRET` | — | Required. Min 32 random bytes in prod |
| `JWT_ACCESS_TTL` | `15m` | jsonwebtoken duration string |
| `JWT_REFRESH_TTL` | `30d` | Not used for JWT signing — controls DB expiry |
| `OTP_TTL_SECONDS` | `600` | Redis TTL for OTP / magic token |
| `OTP_LENGTH` | `6` | Digit count for numeric OTP |
| `CORS_ORIGIN` | `*` | Lock down in production |
| `RESEND_API_KEY` | — | Required in prod for email OTP delivery |
| `FROM_EMAIL` | `noreply@stashpass.app` | Must be a verified Resend domain; use `onboarding@resend.dev` for testing |

---

## Deployment (Railway)

`railway.toml` is at the repo root. Start command: `node dist/db/migrate.js && node dist/server.js`.

**Invariants:**
- `PORT` is injected by Railway automatically — never hardcode it. Server binds `host: '0.0.0.0'`.
- Migration runner uses `path.join(process.cwd(), 'src/db/migrations')` — not `__dirname` — because after `tsc` the JS lands in `dist/db/` but SQL files remain under `src/db/migrations/`.
- `dotenv` is a runtime dependency (not devDependency) — it runs in the compiled `dist/` bundle.
- **Do NOT instantiate `new Resend(...)` at module load time.** It throws immediately when `RESEND_API_KEY` is undefined, crashing the process before `app.listen()`. Instantiate inside the function that uses it.
- **Do NOT put throw guards in `db/client.ts` or `db/redis.ts`.** TypeScript (CommonJS emit) hoists `require()` calls; a throw at the top of those modules crashes before `server.ts` startup logs run. `server.ts` owns env var validation.
- All startup log messages use `console.log` (stdout), not `console.error` (stderr). Railway Deploy Logs may not surface stderr in all views.
- Startup checkpoints are `[startup] N/6` — if a deploy is 502ing, the last visible checkpoint tells you where it crashed.

**Required Railway Variables:** `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `RESEND_API_KEY`, `FROM_EMAIL`, `NODE_ENV=production`

---

## Phase Roadmap

### Phase 1 — COMPLETE
- [x] Database schema (all 9 tables + triggers)
- [x] Auth service: OTP request/verify, magic link request/verify, JWT issue, refresh token rotation, logout
- [x] Wallet service: earn, redeem, balance, history
- [x] Routes: `/auth/*`, `/wallet/*`
- [x] Middleware: `requireAuth`, `requireRole`, error handler

### Phase 2 — Operators — COMPLETE
- [x] `GET /operators/search?lat&lng&radius&template` — Haversine geo search, collapses locations per operator
- [x] `GET /operators/:id` — public operator profile
- [x] `GET /operators/:id/locations` — all active locations
- [x] `POST /operators` — create operator (superadmin only)

> **Circles are NOT part of this API.** Circle / social sharing features will be built inside the CannaGuide app. The `circles`, `circle_members`, and `circle_shares` tables exist in the schema for future cross-app use but no API routes will be added here.

### Phase 3 — Operator Admin
- [ ] Operator-scoped auth (role: `operator_admin`)
- [ ] `POST /operators/:id/locations` — location management
- [ ] `GET /operators/:id/analytics` — earn/redeem aggregates by day/location
- [ ] Rate adjustment endpoint with effective-date support

### Phase 4 — Franchise / Multi-Tenant
- [ ] Franchise group management
- [ ] Cross-operator point portability rules
- [ ] Superadmin dashboard routes

---

## Running Locally

```bash
cp .env.example .env          # fill in DATABASE_URL and REDIS_URL
npm install
npm run migrate               # apply SQL migrations
npm run dev                   # tsx watch — hot reload
```

---

## Session Log

| Date | Work |
|------|------|
| 2026-06-08 | Phase 1 scaffolded — schema, auth service, wallet service, routes, CLAUDE.md |
| 2026-06-08 | Phase 2 complete — operator routes (profile, locations, create, geo search). Circles scoped out — belongs in CannaGuide. |
| 2026-06-08 | Railway deployment — railway.toml, .env.example, dotenv added to prod deps |
| 2026-06-08 | Resend email OTP — email.service.ts; instantiate per-call not at module level |
| 2026-06-08 | Startup crash fixes — removed module-level throws from db/client.ts + db/redis.ts; all startup logs on stdout; [startup] 1/6…6/6 checkpoints in server.ts |
