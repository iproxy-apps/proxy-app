# Phase 2 — Auth & API hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make every auth and read endpoint of proxy-api safe (no mass assignment, 30-minute access
tokens with rotating, revocable refresh tokens, no identity documents stored, no PII leaks,
deterministic account deletion) and give the app the exact response shapes Phase 3 consumes
(`/auth/me`, `/auth/refresh`, name/phone profile edit, paginated feed, served-city columns,
history with real earnings), backend only.

**Architecture:** all work lives in `proxy-api` (NestJS 11 / Prisma 7 / Zod 4) following the
existing module pattern (1 controller = 1 route, 1 service = 1 use case, repository per module,
Zod inline in controllers, `AppException` + `errorDictionary`). New cross-cutting helpers are tiny
files: `src/modules/auth/utils/{auth-schemas,password,session-payload,refresh-token}.ts`,
`src/modules/auth/repository/refresh-tokens.repository.ts`, `src/notification/mail/*` (mail port +
adapters), `src/common/served-cities.ts`, `src/modules/tasks/repository/task-select.ts`,
`src/modules/tasks/utils/task-response.ts`. Seven Prisma migrations (named below; the `cardActionRequired` column already exists from Phase 1's `phase1_card_action_required`) carry the schema changes; every HTTP shape change names the app type file and the Phase 3 task that follows it.

**Tech stack:** NestJS 11, Prisma 7.3 (`@prisma/adapter-pg`), Zod 4.3, `@nestjs/jwt` 11
(jsonwebtoken RS256), `bcryptjs` 3, `stripe` 20, Jest 30 + ts-jest (unit), Testcontainers
PostgreSQL 16 + supertest (e2e).

**Spec:** ../PLAN.md §2 (Phase 2), ../DECISIONS.md D9–D16, D20, D21, D25 (plus D1 price bounds,
D3 `cardActionRequired`, D5 `payoutIssue`), SPEC.md §3.3, §3.4, §4.1, §4.2, §7.2, §7.3, §8.3, §8.7, §8.13, §8.14.

**Assumed done (Phase 0 + Phase 1).** This plan cites the files as they are today (commit
`708e468`). Where Phase 1 rewrote a file, locate the quoted code instead of trusting the line
number. Assumed in place: global `PrismaModule` (modules no longer list `PrismaService`), CAS
`TasksRepository.transition(id, from[], to, data)`, `src/common/money.ts`, `Tasks.stripeFee`,
`Tasks.chargedAmount`, `Payments.chargeId`/`disputeId`, `Users.payoutIssue Boolean @default(false)`,
`Users.cardActionRequired Boolean @default(false)` (D3: set when `/tasks/start` cannot charge the
client's card, cleared by `POST /card/create`; created by Phase 1 P1-T05, which also owns the clear, while P1-T08 owns the set),
`proxyEarnings`/`platformFee`/`chargedAmount` persisted at create with the D1 model
(`chargedAmount = offeredPrice`, `proxyEarnings = 80 %`, `MIN_OFFERED_PRICE = 20`), charge at
`/tasks/start` with automatic capture (D3), `StartTaskResult = { status: 'succeeded' }`,
`z.uuid()` on every id param, Prisma error mapping (`P2002→409`, `P2025→404`), PT messages for
Zod/throttler, throttler 5/min on `/auth/session`, `/auth/create`, `/auth/forgot-password`,
`/auth/verify-reset-code`, `test/.env.test` untracked, `delete-account.e2e-spec.ts` marked `.todo`
with a pointer to this plan, `Prisma.Decimal` exported as `Decimal` from `src/modules/auth/types`.
`buildSessionPayload` does **not** exist yet (created in P2-T03).

## Amendments (2026-11-23 owner decision round)

`../DECISIONS.md` rows D1, D3, D9, D12, D14, D16 and D25 were rewritten on 2026-11-23 and are the
binding authority; this plan was amended the same day to match them. New tasks use **lettered
inserts** (`P2-T03b`, `P2-T08b`) so every existing task id, STATUS row and loop card keeps its
meaning; a lettered task sits right after the task it extends and, like every task, starts only
when everything in its "Depends on" column is done (P2-T08b waits for P2-T10).

**What changed**

- **D9 sessions.** The 30-day JWT + `Users.tokenVersion` design is gone. Access JWT `30m` +
  opaque rotating refresh token (32 random bytes, SHA-256 hash in `RefreshTokens`, 60 days,
  family revocation on reuse), `POST /auth/refresh`, `POST /auth/logout`. Password reset and
  account deletion revoke every refresh token of the user.
- **D12 documents.** Nothing about identity documents is collected or stored: sign-up stops
  accepting them (legacy keys tolerated and discarded), `documentType`/`documentUrl`/`isVerified`
  and the `DocumentType` enum are dropped by a migration, no document claims in the JWT.
- **D14 edit profile.** `POST /auth/update-profile` ships in 1.0 for `name` and `phoneNumber`
  only; the `currentPassword`/password-change/`tokenVersion` parts are removed.
- **D16 address search.** The app sends what Google Places Autocomplete (New) returned
  (`formattedAddress`, `city`, `state`, coordinates); the backend keeps `SERVED_CITIES` + the
  `Tasks.city`/`state` columns, matches case/accent-insensitively, rejects with `CITY_NOT_SERVED`
  and never calls Google.
- **D25 e-mail.** Mail goes through a `MailPort`; Resend is the default adapter, SES stays as the
  alternative adapter.
- **D1 / D3 (contract only).** History and fixtures use the D1 numbers (`chargedAmount =
  offeredPrice`, `proxyEarnings = 80 %`, min price 20); `/auth/me` and the JWT expose
  `cardActionRequired` so the app can tell the client "confirm your card" after a failed charge at
  start (Phase 1 created the column and owns the writer).

**Tasks touched / added**

| Task | Change |
|---|---|
| P2-T01 | Document keys removed from the create schema (legacy keys tolerated and discarded); update-profile no longer touched here |
| P2-T03 | Explicit claim list without document claims, with `payoutIssue` + `cardActionRequired` (read-only; the column comes from Phase 1) |
| **P2-T03b (new)** | Drop `documentType`/`documentUrl`/`isVerified` + `DocumentType` enum (D12) |
| P2-T04 | Rewritten: 30-minute access JWT + rotating refresh tokens, `/auth/refresh`, `/auth/logout` (D9) |
| P2-T05 | `MeResponse` without `isVerified`, with `cardActionRequired` |
| P2-T06 | Rewritten: name + phone only (D14) |
| P2-T08 | Copy only (mail provider wording) |
| **P2-T08b (new)** | `MailPort` + Resend adapter, SES adapter kept (D25) |
| P2-T09 | Deletion revokes refresh tokens instead of bumping `tokenVersion`; no document columns |
| P2-T11 | Rewritten: Places-shaped create body, `matchServedCity`, `CITY_NOT_SERVED` (D16) |
| P2-T12 | Feed canonicalises `?city=` through `matchServedCity` |
| P2-T15 | Test numbers moved to D1 |
| P2-T18 | Docs list follows all of the above |

**Rulings**

- Ruling: lettered inserts (`P2-T03b`, `P2-T08b`) instead of renumbering — STATUS rows, cards and cross-plan references keep pointing at the right task — cost if wrong: none beyond two new STATUS rows.
- Ruling: `RefreshTokens` gets a `familyId` column on top of the D9 columns (`userId`, `expiresAt`, `revokedAt`, `replacedById`) — family revocation is one indexed `UPDATE` instead of walking `replacedById` chains — cost if wrong: one unused uuid column.
- Ruling: refresh-token expiry slides (every rotation gets a fresh 60 days) — an active user is never forced to sign in again, an idle one is after 60 days — cost if wrong: copy the family's first `expiresAt` into each rotated row (one line in `RefreshAccessTokenService`).
- Ruling: a lost rotation race (the same refresh token used twice) is treated as reuse and revokes the family — the app's single-flight refresh (P3-T02) means this only happens on a real replay or a response lost after the server rotated — cost if wrong: a user on a flaky network is signed out once; a grace window can be added later.
- Ruling: no per-request token-version check — D9 replaces `tokenVersion`; password reset and deletion revoke refresh tokens and an issued access token lives at most 30 minutes (a deleted user is still rejected immediately by the `isDeleted` check in `JwtStrategy`) — cost if wrong: a stolen access token stays usable up to 30 minutes after a password reset.
- Ruling: `POST /auth/refresh` and `POST /auth/logout` take the refresh token in the JSON body, are not JWT-guarded (they must work with an expired access token) and are throttled 30/min and 10/min — cost if wrong: retune two `@Throttle` limits.
- Ruling: `GET /auth/session/refresh` and `POST /auth/update-profile` return `{ session }` (re-signed access token only) and never rotate the refresh token — the existing app callers (Stripe onboarding return) keep working unchanged — cost if wrong: none known.
- Ruling: `POST /auth/logout` revokes the family of the token it receives (this device), not every device — "sign out of all devices" is a password reset — cost if wrong: swap `revokeFamily` for `revokeAllForUser`.
- Ruling: the strict sign-up schema tolerates and discards legacy `documentType`/`documentUrl` keys until Phase 5 — the pre-P3-T09 app sends `documentType` for PROXY sign-ups and would otherwise get a 400 between Phase 2 and Phase 3 — cost if wrong: two tolerated keys for one phase.
- Ruling: the D12 migration drops the columns without a backfill or nulling step — `documentUrl` was never written by the app (sign-up sends only `documentType`) and P2-T03b checks the dev database for a non-null `documentUrl` before migrating — cost if wrong: a stored file pointer is lost; the check stops the task first.
- Ruling: the D3 client notification is a `Users.cardActionRequired` flag exposed in `/auth/me` and the JWT (no push, D29); Phase 1 created the column (P1-T05 migration `phase1_card_action_required`) and owns both writers (P1-T08 sets it on a definite charge failure, P1-T05 clears it on `POST /card/create`); P2-T03 only reads it into the claims and `/auth/me` — cost if wrong: none for Phase 2, it only reads an existing column.
- Ruling: `update-profile` rejects `avatarUrl` as well as `email`, `password` and `userType` — D14 lists name and phone only — cost if wrong: re-allow one key when avatars ship.
- Ruling: the D16 create body is `{ formattedAddress, complement?, city, state, locationLat, locationLng }`; legacy `street` + `zipCode` stay accepted until Phase 5 so the pre-P3-T14b app keeps publishing; `state` matches either the UF (`SP`) or the full state name; `CITY_NOT_SERVED` is a 400 raised before any card/Stripe call — cost if wrong: one schema to tighten in Phase 5.
- Ruling: the feed canonicalises `?city=` through the same `matchServedCity` (unserved → empty page, no query) — one matching rule on create and read — cost if wrong: none known.
- Ruling: the Resend adapter calls `https://api.resend.com/emails` with Node 22 `fetch` (no SDK dependency); `MAIL_PROVIDER` defaults to `resend`; the SES adapter keeps today's `@aws-sdk/client-ses` code — cost if wrong: swap the adapter body for the `resend` SDK, nothing else changes.

## Global constraints

- Prettier: no semicolons, single quotes, trailing commas. Run prettier only on files you create.
- Never run `npm run lint` (it is `eslint --fix`) or `npm run format` repo-wide. Lint with
  `npx eslint "src/**/*.ts" "test/**/*.ts"` (no `--fix`).
- All user-facing messages (`errorDictionary`, emails) in pt-BR. Code identifiers in English.
- `import type { ... }` for type-only imports. Path alias `src/*` (e.g. `import { X } from 'src/pipes/...'`).
- 1 controller = 1 route; Zod schemas inline in controllers (shared primitives may live in
  `src/modules/auth/utils/auth-schemas.ts`); `@Body(new ZodValidationPipe(schema))`;
  `throw new AppException(errorDictionary.x.y)`; repository implements its `dtos/` interface.
- Every schema change: edit `prisma/schema.prisma`, `npx prisma migrate dev --name <name>` (needs
  the local Docker Postgres: `docker compose up -d`), check the generated SQL, add raw SQL for
  backfills/partial indexes by hand, then `npx prisma generate`. Migrations are applied to the e2e
  container by `test/setup/global-setup.ts:51` (`prisma migrate deploy`).
- The loop may start the api/Docker (D28). The orchestrator commits one commit per task on `release-1.0` and pushes (D30); implementers leave the tree with only the task's changes.
- Verification command for the repo (PLAN.md §3), run before claiming any task done:
  `cd /Users/leandromartins/Documents/proxy-api && npx prisma generate && npx tsc --noEmit && npx eslint "src/**/*.ts" "test/**/*.ts" && npx jest && npm run test:e2e`
  (`test:e2e` needs Docker running; `docker info >/dev/null 2>&1 && echo docker-up`).
- A single spec: `npx jest path/to/file.spec.ts`; a single e2e spec:
  `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/me.e2e-spec.ts`.

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P2-T01 | Strict sign-up schema, password policy, email normalisation | — | BE-12, BE-27, BE-29 (email), BE-48 (bcrypt 10), D12 | `test/auth/create-account.e2e-spec.ts` |
| P2-T02 | Sign-up flow: row first, Stripe Customer after, P2002 → 409, lowercase migration | P2-T01 | BE-29, BE-46 (`AuthRepository.create` type) | `test/auth/create-account.e2e-spec.ts` |
| P2-T03 | `buildSessionPayload` with numeric claims, nullable phone, `safeParse`, no document claims | — | BE-15, BE-16, CON-06, D3, D12 | `test/auth/refresh-session.e2e-spec.ts` (new) |
| P2-T03b | Drop identity-document columns (`documentType`, `documentUrl`, `isVerified`) | P2-T01, P2-T03 | D12, APP-06 (backend half) | `test/auth/no-identity-documents.e2e-spec.ts` (new) |
| P2-T04 | 30-minute access JWT + rotating refresh tokens (`/auth/refresh`, `/auth/logout`) | P2-T03 | BE-13, CON-05, D9 | `test/auth/refresh-token.e2e-spec.ts` (new), `test/auth/logout.e2e-spec.ts` (new), `test/auth/reset-password.e2e-spec.ts` |
| P2-T05 | `GET /auth/me` | P2-T04, P2-T03b | BE-16, D10, D3 | `test/auth/me.e2e-spec.ts` (new) |
| P2-T06 | `update-profile`: name and phone only | P2-T03, P2-T04 | BE-14, D11, D14 | `test/auth/update-profile.e2e-spec.ts` |
| P2-T07 | Login returns 401 for unknown email (dummy compare) | P2-T03 | BE-26 (login) | `test/auth/authenticate.e2e-spec.ts` |
| P2-T08 | Password-reset hardening: attempts, send-then-persist, generic 200, dev log, HTML escape | P2-T01 | BE-26 (forgot), BE-28, BE-48 (escape) | `test/auth/forgot-password.e2e-spec.ts`, `test/auth/verify-reset-code.e2e-spec.ts` |
| P2-T08b | Mail provider port: Resend adapter (default), SES adapter kept | P2-T08, P2-T10 | D25, REL-10 | `src/notification/mail/resend-mail.adapter.spec.ts`, `src/env/env.spec.ts` |
| P2-T09 | Account deletion per D13 (auto-cancel listings, cards, Stripe scrub, refresh tokens, red e2e) | P2-T04, P2-T03b | BE-17, BE-30, D13, REL-04 | `test/auth/delete-account.e2e-spec.ts` |
| P2-T10 | Connect params, PROXY check, single `STRIPE_CONNECT_RETURN_URL`, env hardening | — | BE-31, BE-46 (`STRIPE_PUBLIC_KEY`), BE-48 (`NODE_ENV`, https), REL-17 | `src/env/env.spec.ts`, `src/stripe/stripe.service.spec.ts`, `test/auth/create-merchant-account.e2e-spec.ts` |
| P2-T11 | `SERVED_CITIES`, `Tasks.city`/`state` + backfill, Places-shaped create body, `CITY_NOT_SERVED` | — | BE-37 (columns), D16, CON-07 | `src/common/served-cities.spec.ts`, `test/tasks/create-task.e2e-spec.ts` |
| P2-T12 | `GET /tasks/fetch` → `{ items, page, perPage, hasMore }`, canonical served city | P2-T11 | BE-37 (pagination), D16 | `test/tasks/fetch-tasks.e2e-spec.ts` |
| P2-T13 | Shared `taskSelect` + `publicUserSelect` + numeric `toTaskResponse` | P2-T12 | BE-11 (shape), BE-38, D21 | `test/tasks/fetch-tasks.e2e-spec.ts`, `test/tasks/fetch-task-by-id.e2e-spec.ts` |
| P2-T14 | `GET /tasks/:id` visibility: DB role, executor-only phone, owner-only payment, deleted owner | P2-T13, P2-T04 | BE-11 (rules), D21, NEW-07 | `test/tasks/fetch-task-by-id.e2e-spec.ts` |
| P2-T15 | Transaction history: all executor statuses, stored earnings, numbers, `?page=` | P2-T11 | BE-40, D20, D1 | `test/auth/transaction-history.e2e-spec.ts` |
| P2-T16 | `PROXY_ACCOUNT_NOT_READY` on start, dead dictionary entries, dead code | — | BE-46, NEW-08 | `test/tasks/start-task.e2e-spec.ts`, `src/exception/error-dictionary.spec.ts` (new) |
| P2-T17 | Indexes, `Restrict` on financial FKs, `.gitignore` dup | P2-T11 | BE-41, BE-49 | `test/schema/schema-guards.e2e-spec.ts` (new) |
| P2-T18 | Docs sync: api `CLAUDE.md`, app `SPEC.md` | all above | BE-47 | route-map diff command (see task) |

## Review focus

Six inputs no task's happy path covers but a real user hits first; each has a test in the task named.

1. **Login with a differently-cased or padded email after the lowercase migration** — `' ANA@Test.io '`
   against a row `ana@test.io` → 200 session. Test: P2-T01 `authenticate.e2e-spec.ts` "accepts an
   email with different casing and surrounding spaces".
2. **Legacy JWT (no `exp`, string `rating`, document claims) from a tester's phone** → 401 (the
   pre-Phase-3 app has no refresh token, so it signs out), never 500. Test: P2-T04
   `refresh-token.e2e-spec.ts` "rejects a legacy token without exp".
3. **Feed query for an unserved city** — `GET /tasks/fetch?city=Curitiba` → 200
   `{ items: [], page: 1, perPage: 10, hasMore: false }`, not 400. Test: P2-T12 "returns the empty
   page shape for an unserved city".
4. **Proxy opens a completed task whose client deleted the account** → 200 with
   `ownerId.name === 'Conta removida'`, no phone. Test: P2-T14 "lets the executor read a completed
   task whose owner deleted the account".
5. **Forgot-password for a real email while the mail provider is down** → 200 generic message, no
   code row, no 500 and no enumeration. Test: P2-T08 "returns the generic message and persists
   nothing when the email fails to send".
6. **A refresh token replayed after it was rotated (copied token, or a retry after a lost
   response)** → 401 `SESSION_REFRESH_INVALID` and the legitimate device's current token is revoked
   too (family revocation). Test: P2-T04 "revokes the whole family when a rotated token is reused".

---

### Task P2-T01: Strict sign-up schema, password policy, email normalisation

**Files:**
- Create: `src/modules/auth/utils/auth-schemas.ts`
- Create: `src/modules/auth/utils/password.ts`
- Modify: `src/modules/auth/controllers/create-account.controller.ts:8-23` (schema), `:35-37` (handler)
- Modify: `src/modules/auth/controllers/authenticate.controller.ts:9`, `forgot-password.controller.ts:8`,
  `verify-reset-code.controller.ts:8`, `reset-password.controller.ts:8-10`
- Modify: `src/modules/auth/use-cases/create-account.service.ts:25-26,34,52-57` (explicit input type,
  explicit Prisma `data`, `hashPassword`), `reset-password.service.ts:42`
- Test: `test/auth/create-account.e2e-spec.ts`, `test/auth/authenticate.e2e-spec.ts`

**Interfaces:**
- Produces `src/modules/auth/utils/auth-schemas.ts`:
  `export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())` (trim/lowercase
  **before** the format check — `z.email().trim()` would validate the padded string first) and
  `export const passwordSchema = z.string().min(8).max(72)`.
- Produces `src/modules/auth/utils/password.ts`: `export const BCRYPT_COST = 10`,
  `export const hashPassword = (plain: string): Promise<string>` (bcryptjs `hash(plain, BCRYPT_COST)`),
  `export const DUMMY_PASSWORD_HASH: string` (a real bcrypt hash of a random string, cost 10, used by P2-T07).
- Produces `export type CreateAccountInput = { name: string; email: string; password: string; userType: UserType; phoneNumber?: string; termsAccepted: true }`
  (no document fields — D12; nothing about identity documents is stored)
  in `src/modules/auth/types/index.d.ts`; `CreateAccountService.execute(data: CreateAccountInput)`.
- Consumes: `ZodValidationPipe` (`src/pipes/zod-validation.pipe.ts:5`), `errorDictionary.user.emailExists`.

- [ ] **Step 1: Write the failing tests** in `test/auth/create-account.e2e-spec.ts`:
  ```ts
  it('rejects server-owned fields (strict schema)', ...)      // body = { ...validPayload(), isVerified: true, rating: 5, walletBalance: 1000 } → 400
  it('rejects termsAccepted: false', ...)                      // → 400; prisma.users.count() === 0
  it('rejects passwords shorter than 8 characters', ...)       // password: '1234567' → 400
  it('normalises the email to lowercase and trims it', ...)    // email: '  Ana@Test.IO ' → 200; users.findUnique({ where: { email: 'ana@test.io' } }) not null
  it('hashes the password with bcrypt cost 10', ...)           // expect(user.password).toMatch(/^\$2[aby]\$10\$/)
  it('accepts and discards the legacy document keys', ...)     // { ...validPayload(), userType: 'PROXY', documentType: 'CPF', documentUrl: 'https://x.test/doc.jpg' } → 200; users.count() === 1
  ```
  and in `test/auth/authenticate.e2e-spec.ts`:
  `it('accepts an email with different casing and surrounding spaces', ...)` — create `ana@test.io`
  / `password123`, POST `{ email: ' ANA@Test.io ', password: 'password123' }` → 200 with `session`.
- [ ] **Step 2: Run, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/create-account.e2e-spec.ts`
  → "expected 400, received 200" on the strict test and `/^\$2[aby]\$10\$/` mismatch (`$2a$08$`).
- [ ] **Step 3: Implement** — `auth-schemas.ts`, `password.ts`; replace the create schema with
  `z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema, userType: z.enum(['CLIENT', 'PROXY']), phoneNumber: z.string().trim().min(8).max(20).optional(), documentType: z.unknown().optional(), documentUrl: z.unknown().optional(), termsAccepted: z.literal(true) }).strict()`
  — `documentType`/`documentUrl` are legacy keys the pre-P3-T09 app still sends: accepted, never
  read, never stored (D12; removed in the Phase 5 cleanup);
  `email: emailSchema` in the four other public controllers; `newPassword: passwordSchema` in
  reset-password (update-profile loses its password field entirely in P2-T06);
  in `create-account.service.ts` type the input as `CreateAccountInput`, call `hashPassword`, and
  build the Prisma `data` object field by field (no `...data`). Replace `hash(x, 8)` with
  `hashPassword(x)` in `reset-password.service.ts:42`.
- [ ] **Step 4: Run, expect pass** — same command; all create-account and authenticate tests green.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth` (unit specs that pass
  `hash` expectations: `create-account.service.spec.ts` must now accept `BCRYPT_COST`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T01 strict sign-up schema, password policy, email normalisation`

---

### Task P2-T02: Sign-up flow — row first, Stripe Customer after, P2002 → 409, lowercase migration

**Files:**
- Modify: `src/modules/auth/use-cases/create-account.service.ts:28-62`
- Modify: `src/modules/auth/repository/auth.repository.ts:39-41` (`create`), add `updateStripeCustomerId`, `hardDeleteUser`
- Modify: `src/modules/auth/dtos/auth-repository.dto.ts:8`
- Modify: `src/stripe/stripe.service.ts:33-44` (remove `searchCustomer`, extend `createCustomer`)
- Modify: `src/exception/error-dictionary.ts:13-64` (add `user.signUpUnavailable`)
- Modify: `test/mocks/stripe.service.mock.ts:5-6`
- Create: `prisma/migrations/<ts>_lowercase_user_emails/migration.sql` (via `npx prisma migrate dev --create-only --name lowercase_user_emails`, then edit)
- Test: `test/auth/create-account.e2e-spec.ts`, `src/modules/auth/use-cases/create-account.service.spec.ts`

**Interfaces:**
- Produces `AuthRepository.create(data: Prisma.UsersCreateInput): Promise<{ id: string }>`,
  `AuthRepository.updateStripeCustomerId(userId: string, stripeCustomerId: string): Promise<void>`,
  `AuthRepository.hardDeleteUser(userId: string): Promise<void>` (only used to roll back a sign-up).
- Produces `StripeService.createCustomer(email: string, name: string, userId: string)` →
  `customers.create({ email, name, metadata: { userId } })`. `searchCustomer` deleted.
- Produces `errorDictionary.user.signUpUnavailable = { message: 'Não foi possível concluir o cadastro agora. Tente novamente em alguns minutos.', statusCode: HttpStatus.SERVICE_UNAVAILABLE, errorCode: 'SIGN_UP_UNAVAILABLE' }`.

- [ ] **Step 1: Write the failing tests** (create-account e2e). Delete `'reuses an existing Stripe
  customer when search returns a match'` and the `searchCustomer` assertion at line 57. Add:
  ```ts
  it('returns 409 when the same email differs only by case', ...)   // 'Ana@X.com' then 'ana@x.com' → 409 USER_EMAIL_EXISTS; users.count() === 1
  it("accepts an apostrophe in the local part", ...)                // "o'neil@x.com" → 200; createCustomer called with ("o'neil@x.com", 'New User', <uuid>)
  it('creates the Stripe customer after the row with the user id in metadata', ...) // createCustomer 3rd arg === stored user.id; user.stripeCustomerId === 'cus_test_123'
  it('rolls back the user when Stripe is unavailable', ...)         // createCustomer.mockRejectedValueOnce(new Error('down')) → 503 SIGN_UP_UNAVAILABLE; users.findUnique → null
  ```
- [ ] **Step 2: Run, expect failure** — `searchCustomer is not a function` / status mismatches.
- [ ] **Step 3: Implement** — service order: `findByEmail` → `emailExists` 409; `hashPassword`;
  `create` wrapped in `try/catch` mapping `Prisma.PrismaClientKnownRequestError` `code === 'P2002'`
  → `emailExists`; then `try { customer = createCustomer(email, name, id); updateStripeCustomerId } catch { logger.error; await hardDeleteUser(id); throw signUpUnavailable }`;
  finally `authenticateService.execute`. Migration SQL (hand-written, documented in the file):
  ```sql
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM "users" GROUP BY lower("email") HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'lowercase_user_emails: emails differing only by case exist; resolve manually';
    END IF;
  END $$;
  UPDATE "users" SET "email" = lower("email") WHERE "email" <> lower("email");
  ```
- [ ] **Step 4: Run, expect pass** — create-account e2e green; `npx prisma migrate dev` applies (local DB).
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/create-account.service.spec.ts` (mock `createCustomer` with 3 args, add `hardDeleteUser`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T02 create Stripe customer after insert, lowercase emails`

---

### Task P2-T03: `buildSessionPayload`, numeric claims, nullable phone, `safeParse`, no document claims

**Files:**
- Create: `src/modules/auth/utils/session-payload.ts`
- Modify: `src/modules/auth/utils/jwt.strategy.ts:10-30` (schema), `:49-59` (`validate`)
- Modify: `src/modules/auth/use-cases/authenticate.service.ts:40-60`, `refresh-session.service.ts:22-40`,
  `update-profile.service.ts:50-68` (replace the three inline payload objects)
- Modify: `test/factories/user.factory.ts:9-18,20-29,44,64-81` (`phoneNumber: string | null`, no `?? ''`)
- Test: `test/auth/refresh-session.e2e-spec.ts` (new), `test/auth/authenticate.e2e-spec.ts`

**Precondition (D3 client notification):** `Users.cardActionRequired Boolean @default(false)` already exists (Phase 1, P1-T05 migration `phase1_card_action_required`; P1-T05 clears it on `POST /card/create`, P1-T08 sets it on a failed charge at start). This task only reads it into the claims and `/auth/me`; it adds no column, no migration and no writer.

**Interfaces:**
- Produces `export const buildSessionPayload = (user: FindUserByEmailResult): SessionPayload`
  (`src/modules/auth/utils/session-payload.ts`) returning exactly these claims:
  `sub: user.id`, `name`, `email`, `userType`, `avatarUrl`, `phoneNumber` (nullable, no `?? ''`),
  `rating: user.rating.toNumber()`, `walletBalance: user.walletBalance.toNumber()`,
  `totalTasksCreated`, `totalTasksCompleted`, `termsAccepted`, `stripeAccountId`,
  `stripeAccountReady`, `stripeCustomerId`, `payoutIssue`, `cardActionRequired`.
  **No** `documentType`, `documentUrl` or `isVerified` claim (D12; the columns are dropped in P2-T03b).
  `FindUserByEmailResult` gains `payoutIssue: boolean; cardActionRequired: boolean` and the
  repository selects return them.
- Produces `sessionPayloadSchema` (same keys) with `phoneNumber: z.string().nullable()`,
  `avatarUrl: z.string().nullable()`, `stripeAccountId: z.string().nullable()`,
  `stripeCustomerId: z.string().nullable()`, `rating: z.number()`,
  `totalTasksCompleted: z.number().int()`, `totalTasksCreated: z.number().int()`,
  `walletBalance: z.number()` (no `z.coerce`), `userType: z.enum(['CLIENT', 'PROXY'])`,
  `stripeAccountReady: z.boolean()`, `payoutIssue: z.boolean()`, `cardActionRequired: z.boolean()`,
  `termsAccepted: z.boolean()`; `SessionPayload = z.infer<...>`. P2-T04 extends it with `iat`/`exp`.
- `JwtStrategy.validate(payload: unknown): Promise<SessionPayload>` — `safeParse`; failure → `UnauthorizedException`.
- Factory: `CreateUserOverrides.phoneNumber?: string | null`, `CreatedUser.phoneNumber: string | null`;
  default `'+5511999999999'` only when `overrides.phoneNumber === undefined`.

- [ ] **Step 1: Write the failing tests** — new `test/auth/refresh-session.e2e-spec.ts`
  (same skeleton as `authenticate.e2e-spec.ts:8-21`):
  ```ts
  it('rejects unauthenticated requests', ...)                         // GET /auth/session/refresh → 401
  it('returns a new session for a user without phone number', ...)    // createUser({ phoneNumber: null }) → 200; decoded.phoneNumber === null
  it('signs rating and walletBalance as numbers', ...)                // users.update({ rating: 4.5, walletBalance: 123.45 }) → decode via app.get(JwtService).decode → typeof number, === 4.5 / 123.45
  it('signs payoutIssue and cardActionRequired and no document claims', ...) // users.update({ cardActionRequired: true }) → decoded.cardActionRequired === true, decoded.payoutIssue === false;
      // expect(decoded).not.toHaveProperty('documentType'); not.toHaveProperty('documentUrl'); not.toHaveProperty('isVerified')
  ```
  and in `authenticate.e2e-spec.ts`: `it('signs rating and walletBalance as numbers', ...)` (same decode).
- [ ] **Step 2: Run, expect failure** — today `createUser({ phoneNumber: null })` 500s on the
  guarded route (`ZodError` → `STANDARD_ERROR`); `typeof rating` is `'string'`; `documentType` is
  present and `cardActionRequired` is absent in the decoded token.
- [ ] **Step 3: Implement** — precondition above; `session-payload.ts`; the three services call
  `this.jwt.sign(buildSessionPayload(user))`; strategy schema + `safeParse`; factory signs
  `buildSessionPayload(user)` directly (import it) instead of the hand-built object at lines 64-81.
- [ ] **Step 4: Run, expect pass** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/refresh-session.e2e-spec.ts test/auth/authenticate.e2e-spec.ts`.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth` (`authenticate.service.spec.ts`,
  `refresh-session.service.spec.ts`, `update-profile.service.spec.ts` assert `sign` was called with
  `expect.objectContaining({ rating: 0 })` as a number and without `documentType`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T03 buildSessionPayload with numeric claims and nullable phone`

---

### Task P2-T03b: Drop identity-document columns (D12)

**Files:**
- Modify: `prisma/schema.prisma:15-19` (delete `enum DocumentType`), `:48-50` (delete `documentType`, `documentUrl`, `isVerified` from `Users`); migration `drop_identity_document_columns`
- Modify: `src/modules/auth/types/index.d.ts:1,17-19` (drop the `DocumentType` import and the three fields of `FindUserByEmailResult`)
- Modify: `src/modules/auth/repository/auth.repository.ts:146-147` (the soft-delete no longer writes `documentUrl`/`documentType`; P2-T09 rewrites the method)
- Modify: `src/modules/auth/test-utils/user.factory.ts:12-17`, `src/modules/auth/use-cases/authenticate.service.spec.ts:20-24,97`
- Modify: `src/modules/tasks/repository/tasks.repository.ts:73,143,183,240,287` (drop `isVerified: true` from the owner/counterpart selects; P2-T13 replaces them with `publicUserSelect`), `src/modules/tasks/types/index.d.ts:86,139`, `src/modules/tasks/test-utils/task.factory.ts:27`, `src/modules/tasks/use-cases/fetch-task-by-id.service.spec.ts:94`, `src/modules/tasks/use-cases/start-task.service.spec.ts:44`
- Modify: `src/modules/test-hooks/use-cases/seed-user.service.ts:65` (drop `isVerified: true`)
- Modify: `test/factories/user.factory.ts:57` (drop `isVerified: true`), `test/auth/delete-account.e2e-spec.ts:85-86` (drop the two document assertions)
- Test: `test/auth/no-identity-documents.e2e-spec.ts` (new)

**Interfaces:**
- Schema: `Users` has no `documentType`, `documentUrl`, `isVerified`; `enum DocumentType` deleted.
  Nothing replaces them (D12: the proxy's CPF/ID is collected by Stripe during Connect onboarding
  and stays at Stripe; no encryption, no hash, nothing stored).
- Migration SQL (`prisma/migrations/<ts>_drop_identity_document_columns/migration.sql`, generated by
  Prisma, then checked by hand to read exactly):
  ```sql
  -- D12 (2026-11-23): identity documents are no longer collected or stored.
  ALTER TABLE "users" DROP COLUMN "documentType", DROP COLUMN "documentUrl", DROP COLUMN "isVerified";
  DROP TYPE "DocumentType";
  ```
- Create-account keeps tolerating the legacy `documentType`/`documentUrl` body keys from P2-T01
  (accepted and discarded; nothing to store them in).
- After this task `grep -rn "isVerified\|documentType\|documentUrl\|DocumentType" src test prisma/schema.prisma`
  returns only the two tolerated keys in `create-account.controller.ts` and the tests that send
  legacy keys on purpose (P2-T01 strict/legacy cases, this task's spec, P2-T04 legacy-token case).

- [ ] **Step 1: Data check (owner's local dev DB, Docker up)** —
  `docker exec proxy psql -U postgres -d proxy -tAc 'SELECT count(*) FROM users WHERE "documentUrl" IS NOT NULL'`
  → expect `0` (the app never uploaded a document; sign-up sent only `documentType`). If it prints
  anything else, stop: list the ids in the STATUS row and ask the owner to delete the referenced
  objects before the column is dropped.
- [ ] **Step 2: Write the failing test** `test/auth/no-identity-documents.e2e-spec.ts` (uses `createTestApp` for `ctx.prisma`):
  ```ts
  it('has no identity-document columns on users', ...)   // SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = current_schema()
      // → expect(names).not.toEqual(expect.arrayContaining(['documentType'])) and the same for 'documentUrl', 'isVerified'
  it('has no DocumentType enum', ...)                     // SELECT typname FROM pg_type WHERE typname = 'DocumentType' → 0 rows
  it('signs no document claims after a sign-up that sent documentType', ...) // POST /auth/create { ...validPayload(), userType: 'PROXY', documentType: 'CPF' } → 200;
      // app.get(JwtService).decode(body.session) has no 'documentType' | 'documentUrl' | 'isVerified' key
  ```
- [ ] **Step 3: Run, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/no-identity-documents.e2e-spec.ts`
  → the three column names and the enum are still present.
- [ ] **Step 4: Implement** — schema edit, `npx prisma migrate dev --name drop_identity_document_columns`,
  check the SQL against the block above, `npx prisma generate`; then fix every compile error
  `npx tsc --noEmit` reports in the files listed above (delete the fields, never re-add them as optional).
- [ ] **Step 5: Run, expect pass** — the new spec; then full `npm run test:e2e` (every spec seeds users
  through the factories) + `npx tsc --noEmit && npx jest`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(auth): P2-T03b drop identity-document columns (D12)`

**Contract:** JWT and every user-shaped response lose `documentType`, `documentUrl`, `isVerified`.
App files `src/apis/auth/auth-api-types.ts` (`TSessionPayload`, `TDocumentType`),
`src/apis/tasks/tasks-api-types.ts` (`TTaskOwner.isVerified`), `src/feature/tasks/components/CounterpartCard.tsx`
("Verificado" badge); app updated in Phase 3: P3-T01 (session schema), P3-T04 (types + badge
removal), P3-T09 (sign-up without document fields).

---

### Task P2-T04: 30-minute access JWT + rotating refresh tokens (`/auth/refresh`, `/auth/logout`)

**Files:**
- Modify: `prisma/schema.prisma` (new `RefreshTokens` model; `Users.refreshTokens RefreshTokens[]`); migration `add_refresh_tokens`
- Modify: `src/modules/test-hooks/truncate-tables.ts` (add `'refresh_tokens'`)
- Create: `src/modules/auth/utils/refresh-token.ts`, `src/modules/auth/utils/refresh-token.spec.ts`
- Create: `src/modules/auth/repository/refresh-tokens.repository.ts`, `src/modules/auth/dtos/refresh-tokens-repository.dto.ts`
- Create: `src/modules/auth/use-cases/issue-session.service.ts`, `src/modules/auth/use-cases/refresh-access-token.service.ts`, `src/modules/auth/use-cases/refresh-access-token.service.spec.ts`, `src/modules/auth/use-cases/logout.service.ts`
- Create: `src/modules/auth/controllers/refresh-access-token.controller.ts` (`@Controller('/auth/refresh')`, `@Post()`, `@HttpCode(200)`), `src/modules/auth/controllers/logout.controller.ts` (`@Controller('/auth/logout')`, `@Post()`, `@HttpCode(204)`)
- Modify: `src/modules/auth/auth.module.ts:49` → `signOptions: { algorithm: 'RS256', expiresIn: ACCESS_TOKEN_TTL }`; register the new repository, services and controllers
- Modify: `src/modules/auth/utils/jwt.strategy.ts` (claims schema + `validate`)
- Modify: `src/modules/auth/use-cases/authenticate.service.ts` (returns `issueSessionService.issue(user)`), `src/modules/auth/types/index.d.ts:40-42` (`AuthenticateServiceResponse`, new `AccessTokenResponse`)
- Modify: `src/modules/auth/use-cases/refresh-session.service.ts`, `src/modules/auth/use-cases/update-profile.service.ts` (return type `AccessTokenResponse`)
- Modify: `src/modules/auth/repository/auth.repository.ts:219-234` (`resetPasswordWithCode` revokes every refresh token in the same `$transaction`)
- Modify: `src/exception/error-dictionary.ts` (add `session.refreshInvalid`)
- Modify: `package.json` devDependencies: `@types/jsonwebtoken` (`npm i -D @types/jsonwebtoken`; `jsonwebtoken` itself is already a transitive dependency of `@nestjs/jwt`)
- Test: `test/auth/refresh-token.e2e-spec.ts` (new), `test/auth/logout.e2e-spec.ts` (new), `test/auth/refresh-session.e2e-spec.ts` (from P2-T03), `test/auth/reset-password.e2e-spec.ts`, `test/auth/create-account.e2e-spec.ts`

**Interfaces:**
- Prisma model:
  ```prisma
  model RefreshTokens {
    id           String    @id @default(uuid()) @db.Uuid
    userId       String    @db.Uuid
    familyId     String    @db.Uuid
    tokenHash    String    @unique
    expiresAt    DateTime
    revokedAt    DateTime?
    replacedById String?   @db.Uuid
    createdAt    DateTime  @default(now())

    user Users @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([userId])
    @@index([familyId])
    @@map("refresh_tokens")
  }
  ```
- `src/modules/auth/utils/refresh-token.ts`: `export const ACCESS_TOKEN_TTL = '30m'`,
  `export const ACCESS_TOKEN_TTL_SECONDS = 1800`, `export const REFRESH_TOKEN_TTL_DAYS = 60`,
  `export const hashRefreshToken = (token: string): string` (`createHash('sha256').update(token).digest('hex')`),
  `export const generateRefreshToken = (): { token: string; tokenHash: string }`
  (`randomBytes(32).toString('base64url')` → 43 characters; `tokenHash = hashRefreshToken(token)`),
  `export const refreshTokenExpiry = (from: Date): Date` (`from` + 60 days).
  Only the hash is stored; the raw token is returned to the client once.
- `RefreshTokensRepository` (implements `RefreshTokensRepositoryDto`):
  - `create(data: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }): Promise<{ id: string }>`
  - `findByHash(tokenHash: string): Promise<RefreshTokenRow | null>` with
    `RefreshTokenRow = { id: string; userId: string; familyId: string; expiresAt: Date; revokedAt: Date | null; replacedById: string | null }`
  - `rotate(currentId: string, next: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }): Promise<{ id: string } | null>`
    — one `prisma.$transaction(async (tx) => ...)`: create the next row, then
    `tx.refreshTokens.updateMany({ where: { id: currentId, revokedAt: null, replacedById: null }, data: { revokedAt: now, replacedById: created.id } })`;
    `count === 0` → throw a local `LostRotationError` inside the callback so the new row rolls back;
    the method catches it and returns `null`.
  - `revokeFamily(familyId: string): Promise<void>` — `updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: now } })`.
  - `revokeAllForUser(userId: string, tx?: Prisma.TransactionClient): Promise<void>` — same with `where: { userId, revokedAt: null }`.
- `IssueSessionService.issue(user: FindUserByEmailResult, familyId: string = randomUUID()): Promise<AuthenticateServiceResponse>`
  — `session = jwt.sign(buildSessionPayload(user))`; `{ token, tokenHash } = generateRefreshToken()`;
  `refreshTokensRepository.create({ userId: user.id, familyId, tokenHash, expiresAt: refreshTokenExpiry(new Date()) })`;
  returns `{ session, refreshToken: token }`. Every login and sign-up starts a new family (one per device).
- Types: `AuthenticateServiceResponse = { session: string; refreshToken: string }` (`POST /auth/session`;
  `POST /auth/create` returns it through `authenticateService.execute`);
  `AccessTokenResponse = { session: string }` (`GET /auth/session/refresh` and `POST /auth/update-profile`
  re-sign the access token with fresh claims and leave the refresh token untouched).
- `RefreshAccessTokenService.execute(refreshToken: string): Promise<AuthenticateServiceResponse>`:
  1. `row = findByHash(hashRefreshToken(refreshToken))`; `null` → `session.refreshInvalid`.
  2. `row.revokedAt || row.replacedById` → `revokeFamily(row.familyId)`, `logger.warn` with `{ userId, familyId }` (never the token), → `session.refreshInvalid` (reuse detected).
  3. `row.expiresAt <= now` → `session.refreshInvalid`.
  4. `user = authRepository.fetchUserDetailsById(row.userId)`; `null` or `isDeleted` → `revokeFamily(row.familyId)` → `session.refreshInvalid`.
  5. `next = generateRefreshToken()`; `rotated = rotate(row.id, { userId: row.userId, familyId: row.familyId, tokenHash: next.tokenHash, expiresAt: refreshTokenExpiry(now) })`;
     `null` (lost race) → `revokeFamily(row.familyId)` → `session.refreshInvalid`.
  6. return `{ session: jwt.sign(buildSessionPayload(user)), refreshToken: next.token }` (expiry slides 60 days per rotation).
- `LogoutService.execute(refreshToken: string): Promise<void>` — row found → `revokeFamily(row.familyId)`; not found → no-op (idempotent, no enumeration).
- Controllers (both **without** `JwtAuthGuard`: they must work with an expired access token): body
  `z.object({ refreshToken: z.string().min(20).max(200) }).strict()` via `ZodValidationPipe`;
  `@Throttle({ default: { limit: 30, ttl: 60_000 } })` on `/auth/refresh`,
  `@Throttle({ default: { limit: 10, ttl: 60_000 } })` on `/auth/logout`.
- `errorDictionary.session.refreshInvalid = { message: 'Sua sessão expirou. Entre novamente.', statusCode: HttpStatus.UNAUTHORIZED, errorCode: 'SESSION_REFRESH_INVALID' }`.
- `JwtStrategy`: `export const jwtClaimsSchema = sessionPayloadSchema.extend({ iat: z.number(), exp: z.number() })`;
  `validate(payload: unknown)` → `jwtClaimsSchema.safeParse` (a token without `exp` → 401; passport-jwt
  already rejects an `exp` in the past); `prisma.users.findUnique({ where: { id: claims.sub }, select: { isDeleted: true, userType: true } })`
  → 401 when missing or deleted; returns `{ ...claims, userType: user.userType }` so
  `SessionPayload.userType` is always the DB role (P2-T14 relies on this). There is no per-request
  token-version check: a password reset or account deletion revokes the refresh tokens, and an
  access token already issued lives at most 30 minutes.
- `AuthRepository.resetPasswordWithCode(userId, hashedPassword, codeId)`: the existing
  `$transaction([...])` array gains a third operation
  `this.prisma.refreshTokens.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })`.

- [ ] **Step 1: Write the failing tests** — new `test/auth/refresh-token.e2e-spec.ts` (same skeleton
  as `authenticate.e2e-spec.ts:8-21`; `sha256 = (t: string) => createHash('sha256').update(t).digest('hex')`):
  ```ts
  it('issues a 30-minute access token and an opaque refresh token on login', ...) // POST /auth/session → 200; decode(body.session): exp - iat === 1800;
      // body.refreshToken matches /^[A-Za-z0-9_-]{43}$/; row = refreshTokens.findFirst({ where: { userId } }); row.tokenHash === sha256(body.refreshToken); row.tokenHash !== body.refreshToken
  it('returns a refresh token on sign-up', ...)                     // POST /auth/create → 200; typeof body.refreshToken === 'string'; refreshTokens.count({ where: { userId } }) === 1
  it('rotates the refresh token', ...)                              // POST /auth/refresh { refreshToken: A } → 200 { session, refreshToken: B }, B !== A;
      // rowA.revokedAt not null, rowA.replacedById === rowB.id, rowB.familyId === rowA.familyId, |rowB.expiresAt - (now + 60 d)| < 60_000 ms
  it('revokes the whole family when a rotated token is reused', ...) // A → B; POST A again → 401 { errorCode: 'SESSION_REFRESH_INVALID' }; then POST B → 401
  it('keeps other devices signed in when one device rotates', ...)  // two logins (families F1, F2); rotate F1 twice → F2's token still → 200
  it('rejects an expired refresh token', ...)                       // refreshTokens.update({ expiresAt: new Date(Date.now() - 1000) }) → 401 SESSION_REFRESH_INVALID
  it('rejects an unknown refresh token', ...)                       // { refreshToken: 'x'.repeat(43) } → 401 SESSION_REFRESH_INVALID
  it('rejects a malformed body', ...)                               // {} → 400; { refreshToken: 'x'.repeat(43), extra: 1 } → 400
  it('rejects refresh for a deleted user', ...)                     // users.update({ isDeleted: true }) → 401
  it('rejects an expired access token', ...)                        // app.get(JwtService).sign(buildSessionPayload(row), { expiresIn: '-10s' }) → GET /auth/session/refresh → 401
  it('rejects a legacy token without exp', ...)                     // import jwt from 'jsonwebtoken'; jwt.sign({ ...legacyClaims, rating: '0', documentType: null }, Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64'), { algorithm: 'RS256' }) (no expiresIn → no exp) → GET /auth/session/refresh → 401
  ```
  New `test/auth/logout.e2e-spec.ts`:
  ```ts
  it('revokes the family and is idempotent', ...)   // login → POST /auth/logout { refreshToken } → 204; POST /auth/refresh with it → 401; logout again → 204
  it('returns 204 for an unknown token', ...)       // { refreshToken: 'y'.repeat(43) } → 204
  it('works without an access token', ...)          // no Authorization header → 204
  it('rejects a body without refreshToken', ...)    // {} → 400
  ```
  `reset-password.e2e-spec.ts`: `it('revokes every refresh token on reset', ...)` — two logins →
  reset 200 → both refresh tokens → 401; `refreshTokens.count({ where: { userId, revokedAt: null } }) === 0`;
  a fresh `POST /auth/session` with the new password → 200 with a new `refreshToken`.
  `refresh-session.e2e-spec.ts`: `it('re-signs the access token without issuing a refresh token', ...)`
  → `Object.keys(body)` equals `['session']`.
  `src/modules/auth/utils/refresh-token.spec.ts`: two `generateRefreshToken()` calls differ, token length 43,
  hash is 64 hex chars and equals `hashRefreshToken(token)`;
  `refreshTokenExpiry(new Date('2026-01-01T00:00:00Z')).toISOString() === '2026-03-02T00:00:00.000Z'`.
  `refresh-access-token.service.spec.ts`: reuse path and lost-race path (`rotate` → `null`) both call
  `revokeFamily` once and throw `SESSION_REFRESH_INVALID`.
- [ ] **Step 2: Run, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/refresh-token.e2e-spec.ts test/auth/logout.e2e-spec.ts`
  → `POST /auth/refresh` 404, `body.refreshToken` undefined, `exp` undefined (no `expiresIn` today).
- [ ] **Step 3: Implement** — schema + `npx prisma migrate dev --name add_refresh_tokens` (check the
  generated SQL creates `refresh_tokens` with the unique `tokenHash` and both indexes), `npx prisma generate`;
  `truncate-tables.ts`; utils, repository, services, controllers, module wiring; strategy;
  `resetPasswordWithCode`; dictionary entry.
- [ ] **Step 4: Run, expect pass** — the two new specs, `refresh-session.e2e-spec.ts`, `reset-password.e2e-spec.ts`,
  `create-account.e2e-spec.ts`, and `npx jest src/modules/auth/utils/refresh-token.spec.ts src/modules/auth/use-cases/refresh-access-token.service.spec.ts`.
- [ ] **Step 5: Repo gate** — full `npm run test:e2e` (every spec signs through the factory, whose
  tokens now expire in 30 minutes — longer than any e2e run) + `npx tsc --noEmit`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(auth): P2-T04 30-minute access JWT with rotating refresh tokens`

**Contract:** `POST /auth/session` and `POST /auth/create` → `{ session, refreshToken }`; new
`POST /auth/refresh { refreshToken }` → `{ session, refreshToken }` (401 `SESSION_REFRESH_INVALID`);
new `POST /auth/logout { refreshToken }` → 204; `GET /auth/session/refresh` and `POST /auth/update-profile`
→ `{ session }`. JWT claims: `exp` (30 minutes) + `iat`, `phoneNumber: string | null`, numbers,
`payoutIssue`, `cardActionRequired`, no document claims. App files `src/apis/auth/auth-api-types.ts`
(`TTokenPair`, `TSessionPayload`), `src/lib/secure-store.ts`, `src/store/auth-store/auth-store.ts`,
`src/apis/api-client.ts`; app updated in Phase 3: P3-T01 (session schema + refresh-token storage)
and P3-T02 (401 → single-flight refresh → retry once → sign out; logout).

---

### Task P2-T05: `GET /auth/me`

**Files:**
- Create: `src/modules/auth/controllers/fetch-me.controller.ts` (`@Controller('/auth/me')`, `@UseGuards(JwtAuthGuard)`, `@Get()`)
- Create: `src/modules/auth/use-cases/fetch-me.service.ts`, `fetch-me.service.spec.ts`
- Modify: `src/modules/auth/types/index.d.ts` (`MeResponse`), `src/modules/auth/auth.module.ts:58-89`
- Test: `test/auth/me.e2e-spec.ts` (new)

**Interfaces:**
- Produces `export type MeResponse = { id: string; name: string; email: string; phoneNumber: string | null; avatarUrl: string | null; userType: UserType; rating: number; totalTasksCompleted: number; totalTasksCreated: number; walletBalance: number; stripeAccountId: string | null; stripeAccountReady: boolean; payoutIssue: boolean; cardActionRequired: boolean; termsAccepted: boolean }`
  (no `isVerified` or document fields — D12; `cardActionRequired` is the D3 "confirme seu cartão" flag).
- `FetchMeService.execute(userId: string): Promise<MeResponse>` — `authRepository.fetchUserDetailsById`,
  `USER_NOT_FOUND` when null/deleted, Decimal → `.toNumber()`. Never returns `password`,
  `stripeCustomerId` or any refresh-token data.

- [ ] **Step 1: Write the failing test** `test/auth/me.e2e-spec.ts`:
  ```ts
  it('rejects unauthenticated requests', ...)                                   // 401
  it('returns the fresh user subset with numeric money and rating', ...)         // users.update({ walletBalance: 250.5, rating: 4.25, payoutIssue: true, cardActionRequired: true }) → GET /auth/me with the OLD token → 200;
      // expect(Object.keys(body).sort()).toEqual(['avatarUrl','cardActionRequired','email','id','name','payoutIssue','phoneNumber','rating','stripeAccountId','stripeAccountReady','termsAccepted','totalTasksCompleted','totalTasksCreated','userType','walletBalance'])
      // body.walletBalance === 250.5, body.rating === 4.25, body.payoutIssue === true, body.cardActionRequired === true
  it('never exposes secrets', ...)                                               // not.toHaveProperty('password' | 'stripeCustomerId' | 'refreshTokens')
  ```
- [ ] **Step 2: Run, expect failure** — 404 (route missing).
- [ ] **Step 3: Implement** service, controller, module registration; unit spec asserts `USER_NOT_FOUND` and the mapping.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/fetch-me.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(auth): P2-T05 GET /auth/me`

**Contract:** new response. App type file `src/apis/auth/auth-api-types.ts` → add `TMeResponse`;
`src/apis/auth/auth-apis.ts` → `me()`; app updated in Phase 3: P3-T04 (types + route), P3-T05
(`refreshMe` merges it into the session), P3-T10 (`cardActionRequired` banner).

---

### Task P2-T06: `update-profile` — name and phone only (D11, D14)

**Files:**
- Modify: `src/modules/auth/controllers/update-profile.controller.ts:11-17,33-36`
- Modify: `src/modules/auth/use-cases/update-profile.service.ts:22-48` (whole `execute`; the `bcryptjs` `hash` import is removed)
- Modify: `src/modules/auth/types/index.d.ts:31-38,44-50` (`UsersUpdateInput` → `UpdateProfileInput`, `UpdateUserProfileRepositoryPayload`); `src/modules/auth/repository/auth.repository.ts:131-136`, `src/modules/auth/dtos/auth-repository.dto.ts`
- Test: `test/auth/update-profile.e2e-spec.ts`, `src/modules/auth/use-cases/update-profile.service.spec.ts`

**Interfaces:**
- Body schema:
  ```ts
  const updateProfileBodySchema = z
    .object({
      name: z.string().trim().min(2).max(80).optional(),
      phoneNumber: z.string().trim().min(8).max(20).nullable().optional(),
    })
    .strict()
    .refine((b) => b.name !== undefined || b.phoneNumber !== undefined, {
      message: 'Informe o nome ou o telefone.',
    })
  ```
  Any other key (`email`, `password`, `avatarUrl`, `userType`, …) → 400 `VALIDATION_FAILED`.
  E-mail cannot be changed in 1.0 and the password changes only through forgot-password (D14);
  `userType` switching is out of 1.0 (D11).
- `UpdateProfileInput = { userId: string; name?: string; phoneNumber?: string | null }`;
  `UpdateUserProfileRepositoryPayload = { name?: string; phoneNumber?: string | null }`
  (`undefined` keys are skipped by Prisma, `null` clears the phone — no more `?? ''`).
- Service: `fetchUserDetailsById(userId)` → `USER_NOT_FOUND` when null/deleted;
  `updateUserDetailsById(userId, payload)`; re-reads the user and returns
  `AccessTokenResponse = { session: jwt.sign(buildSessionPayload(updated)) }` (P2-T03/P2-T04).
  Refresh tokens are not touched (nothing security-relevant changed).

- [ ] **Step 1: Write the failing tests** (rewrite `test/auth/update-profile.e2e-spec.ts`; drop `userType` and `password` from the existing bodies):
  ```ts
  it('updates name and phone and returns a re-signed access token', ...)  // { name: 'Ana Maria', phoneNumber: '11988887777' } → 200; DB row has both;
      // app.get(JwtService).decode(body.session).name === 'Ana Maria'; Object.keys(body) equals ['session']
  it('trims the name', ...)                                               // { name: '  Ana  ' } → DB name 'Ana'
  it('clears phoneNumber when null is sent', ...)                         // { phoneNumber: null } → DB null (today becomes '')
  it('rejects userType in the body', ...)                                 // { name: 'Ana', userType: 'PROXY' } → 400; DB userType unchanged
  it('rejects password, email and avatarUrl', ...)                        // each alone with a valid name → 400; stored password hash and email unchanged
  it('rejects an empty body', ...)                                        // {} → 400
  it('rejects a one-letter name', ...)                                    // { name: 'A' } → 400
  it('keeps the refresh token valid', ...)                                // login → update → POST /auth/refresh with the login refreshToken → 200
  ```
- [ ] **Step 2: Run, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/update-profile.e2e-spec.ts`
  → 400 on `{ name, phoneNumber }` (today `userType` is required), 200 on the `userType`/`password` bodies, `''` instead of null.
- [ ] **Step 3: Implement** controller + service + types; `auth.repository.ts:131-136` signature follows the new payload type.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/update-profile.service.spec.ts` (rewrite the `userType`/password cases into the name/phone cases above).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T06 update-profile edits name and phone only`

**Contract:** `POST /auth/update-profile` body `{ name?: string; phoneNumber?: string | null }`
(strict), response `{ session }`. The app caller ships in 1.0 (D14): app type file
`src/apis/auth/auth-api-types.ts` → `TUpdateProfilePayload`, `src/apis/auth/auth-apis.ts` →
`updateProfile(payload)`; app updated in Phase 3: P3-T04 (types + route) and P3-T08b (edit profile screen).
SPEC §8.14 updated in P2-T18.

---

### Task P2-T07: Login returns 401 for unknown email

**Files:**
- Modify: `src/modules/auth/use-cases/authenticate.service.ts:28-38`
- Test: `test/auth/authenticate.e2e-spec.ts:32-39`, `src/modules/auth/use-cases/authenticate.service.spec.ts`

**Interfaces:**
- Consumes `DUMMY_PASSWORD_HASH` from `src/modules/auth/utils/password.ts` (P2-T01).
- Behaviour: `user = findByEmail(email)`; `matches = await compare(password, user?.password ?? DUMMY_PASSWORD_HASH)`;
  `if (!user || !matches) throw invalidCredentials` — one branch, equalised timing.

- [ ] **Step 1: Write the failing test** — replace `'returns 404 when the user does not exist'` with
  `it('returns 401 when the user does not exist', ...)` → 401 `USER_INVALID_CREDENTIALS`. Unit spec:
  `compare` is called exactly once even when the user is missing.
- [ ] **Step 2: Run, expect failure** — 404 `USER_NOT_FOUND`.
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/authenticate.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T07 401 for unknown email on login`

**Contract:** `POST /auth/session` no longer returns 404. App `extractErrorMessage`
(`src/apis/api-client.ts`) maps by `errorCode`; app updated in Phase 3, task P3-T03 (PT error
mapping + classifiers, 401 vs 404).

---

### Task P2-T08: Password-reset hardening

**Files:**
- Modify: `prisma/schema.prisma:193-205` (`PasswordResetCodes.attempts Int @default(0)`); migration `add_password_reset_attempts`
- Modify: `src/modules/auth/use-cases/forgot-password.service.ts:22-65`, `verify-reset-code.service.ts:29-45`
- Modify: `src/modules/auth/repository/auth.repository.ts:166-178` (`findPendingResetCode` filters `attempts: { lt: 5 }`), add `incrementPasswordResetAttempts`
- Modify: `src/notification/notification.service.ts:1-23,38-45,56,69-72` (remove SNS client, `sendSms`, `sendResetCodeBySms`; escape `userName`); `test/mocks/notification.service.mock.ts`
- Create: `src/notification/escape-html.ts`, `src/notification/escape-html.spec.ts`
- Modify: `package.json` (remove `@aws-sdk/client-sns` via `npm uninstall @aws-sdk/client-sns`)
- Test: `test/auth/forgot-password.e2e-spec.ts`, `test/auth/verify-reset-code.e2e-spec.ts`

**Interfaces:**
- `export const MAX_RESET_CODE_ATTEMPTS = 5` in `src/modules/auth/utils/auth-schemas.ts`.
- `AuthRepository.incrementPasswordResetAttempts(codeId: string): Promise<void>`.
- `export const escapeHtml = (input: string): string` — replaces `& < > " '` with `&amp; &lt; &gt; &quot; &#39;`.
- `ForgotPasswordService` constructor gains `EnvService` (already a provider of `AuthModule`); flow:
  user missing → generic; `countRecentPasswordResetCodes >= 3` → `logger.warn` + generic (no send, no row);
  `code = randomInt(0, 1_000_000).toString().padStart(6, '0')`; `sendResetCodeByEmail` → on throw
  `logger.error` + generic (nothing persisted); then `createPasswordResetCode(hash(code, 8))`;
  when `env.get('NODE_ENV') === 'development'` → `logger.debug(\`Password reset code for ${email}: ${code}\`)`.
  Return value always `{ message: 'Se o email existir, um código de recuperação será enviado.' }`.
  `errorDictionary.passwordReset.tooManyRequests` and `.sendFailed` are deleted (no longer thrown).
- `VerifyResetCodeService`: on mismatch → `incrementPasswordResetAttempts(resetCode.id)` then
  `invalidOrExpiredCode`; a code with `attempts >= 5` is not returned by `findPendingResetCode`.

- [ ] **Step 1: Write the failing tests** — forgot-password e2e: replace `'returns 429 after 3
  requests...'` with `it('returns the generic message and sends nothing after 3 recent codes', ...)`
  (200, `sendResetCodeByEmail` not called, `passwordResetCodes.count() === 3`); add
  `it('returns the generic message and persists nothing when the email fails to send', ...)`
  (`notificationMock.sendResetCodeByEmail.mockRejectedValueOnce(new Error('mail provider down'))` → 200, 0 rows).
  verify-reset-code e2e: `it('invalidates the code after 5 wrong attempts', ...)` (5× `'000000'` →
  400 each; stored `attempts === 5`; then the right code → 400 `PASSWORD_RESET_INVALID_CODE`),
  `it('still accepts the right code after fewer than 5 wrong attempts', ...)` (2 wrong + right → 200, `state === 'verified'`).
  `escape-html.spec.ts`: `escapeHtml('<b>"O\'Neil" & co</b>')` → `'&lt;b&gt;&quot;O&#39;Neil&quot; &amp; co&lt;/b&gt;'`.
- [ ] **Step 2: Run, expect failure** — 429 / 500 today; `attempts` column missing.
- [ ] **Step 3: Implement** — `npx prisma migrate dev --name add_password_reset_attempts`
  (`ALTER TABLE "password_reset_codes" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0`), services,
  repository, notification cleanup, mock (`sendEmail`, `sendResetCodeByEmail` only).
- [ ] **Step 4: Run, expect pass** — the two e2e specs + `npx jest src/notification`.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/forgot-password.service.spec.ts src/modules/auth/use-cases/verify-reset-code.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T08 reset-code attempts, send-then-persist, generic responses`

---

### Task P2-T08b: Mail provider port — Resend adapter (default), SES adapter kept (D25)

**Files:**
- Create: `src/notification/mail/mail.port.ts`, `src/notification/mail/resend-mail.adapter.ts`, `src/notification/mail/resend-mail.adapter.spec.ts`, `src/notification/mail/ses-mail.adapter.ts`
- Create: `src/notification/notification.service.spec.ts`
- Modify: `src/notification/notification.service.ts` (whole: constructor takes `MailPort`, no AWS client left in this file), `src/notification/notification.module.ts` (whole: provider factory by `MAIL_PROVIDER`)
- Modify: `src/env/env.ts` (mail variables), `src/env/env.spec.ts` (from P2-T10), `test/setup/global-setup.ts:32-47`, `.env.example`
- Test: `src/notification/mail/resend-mail.adapter.spec.ts`, `src/notification/notification.service.spec.ts`, `src/env/env.spec.ts`

**Interfaces:**
- `src/notification/mail/mail.port.ts`:
  `export type MailMessage = { to: string; subject: string; html: string }`;
  `export abstract class MailPort { abstract send(message: MailMessage): Promise<void> }`
  (an abstract class so Nest can use it as the injection token).
- `ResendMailAdapter implements MailPort` — `constructor(private apiKey: string, private from: string)`;
  `send(message)` → `fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: \`Bearer ${this.apiKey}\`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, html: message.html }) })`;
  `!res.ok` → `throw new Error(\`Resend ${res.status}: ${await res.text()}\`)`. Node 22 global `fetch`; no new dependency.
- `SesMailAdapter implements MailPort` — today's `SESClient` + `SendEmailCommand` code moved verbatim;
  `constructor(region: string, accessKeyId: string, secretAccessKey: string, private from: string)`, `Source: this.from`.
- `NotificationService` — `constructor(private mail: MailPort)`; `sendEmail(to, subject, html)` →
  `this.mail.send({ to, subject, html })`; `sendResetCodeByEmail` keeps its P2-T08 body (escaped `userName`).
  The `@Inject('AWS_*')` string tokens disappear.
- `NotificationModule.forRoot()` providers: `NotificationService` and
  `{ provide: MailPort, inject: [EnvService], useFactory: (env: EnvService) => env.get('MAIL_PROVIDER') === 'ses' ? new SesMailAdapter(env.get('AWS_REGION'), env.get('AWS_ACCESS_KEY_ID')!, env.get('AWS_SECRET_ACCESS_KEY')!, env.get('MAIL_FROM')) : new ResendMailAdapter(env.get('RESEND_API_KEY')!, env.get('MAIL_FROM')) }`.
- `envSchema` additions: `MAIL_PROVIDER: z.enum(['resend', 'ses']).default('resend')`,
  `MAIL_FROM: z.string().min(3)` (replaces `AWS_SES_FROM_EMAIL`, e.g. `Proxy <no-reply@<owner domain>>`),
  `RESEND_API_KEY: z.string().startsWith('re_').optional()`. `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY` become `.optional()` **only if** `grep -rn "AWS_ACCESS_KEY_ID\|AWS_SECRET_ACCESS_KEY" src --include=*.ts`
  shows no reader besides the mailer (Phase 1's object storage may read them; then they stay required).
  The P2-T10 `superRefine` gains: `MAIL_PROVIDER === 'resend' && !RESEND_API_KEY` → issue on
  `['RESEND_API_KEY']`, message `'required when MAIL_PROVIDER=resend'`; `MAIL_PROVIDER === 'ses'`
  without both AWS keys → issue on `['AWS_ACCESS_KEY_ID']`, message `'required when MAIL_PROVIDER=ses'`.
- `test/setup/global-setup.ts`: replace the `AWS_SES_FROM_EMAIL=...` line with
  `MAIL_PROVIDER=resend`, `RESEND_API_KEY=re_test_dummy`, `MAIL_FROM=Proxy <test@example.com>`
  (e2e still overrides `NotificationService` with the mock, so nothing is sent). `.env.example`
  gets the same three keys with a comment: "Resend: sender domain verified in Resend; until the
  owner's domain (D24) is verified, `onboarding@resend.dev` only delivers to the Resend account's
  own address".

- [ ] **Step 1: Write the failing tests**
  ```ts
  // src/notification/mail/resend-mail.adapter.spec.ts
  const fetchMock = jest.spyOn(global, 'fetch')
  const msg = { to: 'ana@test.io', subject: 'Oi', html: '<p>x</p>' }
  it('posts to the Resend API with the key and sender', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 'em_1' }), { status: 200 }))
    await new ResendMailAdapter('re_test_123', 'Proxy <no-reply@proxy.test>').send(msg)
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer re_test_123' }) }))
    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ from: 'Proxy <no-reply@proxy.test>', to: ['ana@test.io'], subject: 'Oi', html: '<p>x</p>' })
  })
  it('throws on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"invalid from"}', { status: 422 }))
    await expect(new ResendMailAdapter('re_test_123', 'x <x@x.io>').send(msg)).rejects.toThrow('Resend 422')
  })
  // src/notification/notification.service.spec.ts
  it('sendResetCodeByEmail delegates to the MailPort with the escaped name', async () => {
    const mail = { send: jest.fn().mockResolvedValue(undefined) }
    await new NotificationService(mail).sendResetCodeByEmail('a@b.io', '123456', '<Ana>')
    expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.io', html: expect.stringContaining('&lt;Ana&gt;') }))
  })
  // src/env/env.spec.ts (fixture from P2-T10 plus MAIL_FROM)
  it('requires RESEND_API_KEY when MAIL_PROVIDER is resend', ...)     // fixture without RESEND_API_KEY → success false, issue path ['RESEND_API_KEY']
  it('requires the AWS keys when MAIL_PROVIDER is ses', ...)          // MAIL_PROVIDER: 'ses', no AWS keys → success false
  it('accepts ses with AWS keys and no Resend key', ...)              // → success true
  ```
- [ ] **Step 2: Run, expect failure** — `npx jest src/notification src/env` → `Cannot find module './mail/resend-mail.adapter'`; env parses without `MAIL_FROM`.
- [ ] **Step 3: Implement** port, both adapters, service, module, env, global-setup, `.env.example`.
  Keep `@aws-sdk/client-ses` in `package.json` (the SES adapter uses it).
- [ ] **Step 4: Run, expect pass** — `npx jest src/notification src/env`.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e` (app boots with the new env in the e2e container).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(notification): P2-T08b MailPort with Resend adapter, SES kept`

**Contract:** none (no HTTP change). Ops: the deploy sets `MAIL_PROVIDER=resend`, `RESEND_API_KEY`,
`MAIL_FROM` (Phase 5 deploy checklist; owner input: Resend account + verified sender domain).

---

### Task P2-T09: Account deletion per D13

**Files:**
- Modify: `prisma/schema.prisma:40-73` (`Users.deletedAt DateTime?`); migration `add_user_deleted_at`
- Modify: `src/modules/auth/use-cases/delete-account.service.ts:8-29` (inject `StripeService`, drop `TasksRepository`)
- Modify: `src/modules/auth/repository/auth.repository.ts:138-151` (replace `softDeleteUser` with `deleteAccount`)
- Modify: `src/stripe/stripe.service.ts` (add `scrubCustomer`), `test/mocks/stripe.service.mock.ts`
- Modify: `src/modules/auth/auth.module.ts:63` (remove `TasksRepository` provider if no longer needed)
- Test: `test/auth/delete-account.e2e-spec.ts` (remove the Phase 0 `.todo`), `src/modules/auth/use-cases/delete-account.service.spec.ts`

**Interfaces:**
- `export const DELETION_BLOCKING_STATUSES: TaskStatus[] = ['in_progress', 'verification_required']` in `src/modules/auth/types` or the repository.
- `AuthRepository.deleteAccount(userId: string): Promise<{ status: 'blocked' } | { status: 'deleted'; stripeCardIds: string[]; stripeCustomerId: string | null }>`
  — one interactive `prisma.$transaction(async (tx) => ...)`:
  1. `tx.tasks.count({ where: { status: { in: DELETION_BLOCKING_STATUSES }, OR: [{ owner: userId }, { userTaskMappings: { some: { executorId: userId } } }] } }) > 0` → return `{ status: 'blocked' }`.
  2. `tx.tasks.updateMany({ where: { owner: userId, status: 'available' }, data: { status: 'canceled', canceledAt: now } })`.
  3. `cards = tx.cards.findMany({ where: { userId, isDeleted: false }, select: { stripeCardId: true } })`; `tx.cards.updateMany({ where: { userId, isDeleted: false }, data: { isDeleted: true } })`.
  4. `tx.users.update({ where: { id: userId }, data: { isDeleted: true, deletedAt: now, name: 'Conta removida', email: \`deleted-${userId}@deleted.local\`, phoneNumber: null, avatarUrl: null, password: '!deleted' } })`
     — `stripeCustomerId`/`stripeAccountId` are **kept** (D13: ids kept 180 days; purge job out of scope).
     The identity-document columns no longer exist (P2-T03b).
  5. `tx.refreshTokens.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } })`
     (D9: deletion revokes every refresh token; access tokens are rejected at once by the `isDeleted` check in `JwtStrategy`).
- `StripeService.scrubCustomer(customerId: string)` → `customers.update(customerId, { name: 'Conta removida', email: '', phone: '', metadata: { deletedAt: new Date().toISOString() } })`.
- `DeleteAccountService.execute(userId)`: `fetchUserDetailsById` → `USER_NOT_FOUND`; `deleteAccount` →
  `blocked` → `cannotDeleteWithActiveTasks` (409); then, outside the transaction and each in its
  own try/catch with `logger.error` (never fails the request): `detachPaymentMethod(id)` per card,
  `scrubCustomer(stripeCustomerId)` when present.

- [ ] **Step 1: Write the failing tests** (delete-account e2e) — rename
  `'allows completed/canceled tasks (not blocking)'` → `'cancels open listings and deletes the account'`
  asserting 204 and the `available` task now `status: 'canceled'` with `canceledAt` not null, the
  completed/canceled tasks untouched; change the executor test's `status: 'on_the_way'` (line 56) to
  `'in_progress'`; add `it('blocks when the user executes a task in verification_required', ...)`;
  add `it('soft-deletes cards, detaches them on Stripe and scrubs the customer', ...)` — seed a card
  `pm_del_1` → 204, card `isDeleted === true`, `stripeMock.detachPaymentMethod` called with `'pm_del_1'`,
  `stripeMock.scrubCustomer` called with `'cus_test_default'`, `stored.stripeCustomerId === 'cus_test_default'`,
  `stored.deletedAt` not null; add `it('revokes every refresh token', ...)` — log in twice first →
  204 → `refreshTokens.count({ where: { userId, revokedAt: null } }) === 0` and `POST /auth/refresh`
  with either token → 401; extend `'soft-deletes the account and anonymizes PII'` with
  `expect(stored?.password).toBe('!deleted')`; add
  `it('still deletes when Stripe detach fails', ...)` (`detachPaymentMethod.mockRejectedValueOnce` → 204).
- [ ] **Step 2: Run, expect failure** — the renamed test is the known red (409 on `available`); refresh tokens stay active.
- [ ] **Step 3: Implement** — migration `npx prisma migrate dev --name add_user_deleted_at`
  (`ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3)`), repository, service, Stripe method, mock.
- [ ] **Step 4: Run, expect pass** — `test/auth/delete-account.e2e-spec.ts` green (every suite green again).
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/delete-account.service.spec.ts` (mocks: `deleteAccount`, `detachPaymentMethod`, `scrubCustomer`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T09 account deletion cancels listings, scrubs cards and Stripe customer`

---

### Task P2-T10: Connect params, PROXY check, single return URL, env hardening

**Files:**
- Modify: `src/env/env.ts:3-20`; create `src/env/env.spec.ts`
- Modify: `src/stripe/stripe.service.ts:114-151`, `src/stripe/types/index.d.ts:7-17`; create `src/stripe/stripe.service.spec.ts`
- Modify: `src/modules/auth/use-cases/create-merchant-account.service.ts:28-34,67-78`, `create-merchant-account.service.spec.ts`
- Modify: `test/setup/global-setup.ts:32-47`, `.env.example:8-13`
- Test: `test/auth/create-merchant-account.e2e-spec.ts`

**Interfaces:**
- `envSchema`: `NODE_ENV: z.enum(['development', 'production', 'test'])` (no default);
  `STRIPE_CONNECT_RETURN_URL: z.url()`; remove `STRIPE_PUBLIC_KEY`, `DEV_CALLBACK_URL`, `PROD_CALLBACK_URL`;
  `.superRefine((env, ctx) => { if (env.NODE_ENV === 'production' && !env.STRIPE_CONNECT_RETURN_URL.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['STRIPE_CONNECT_RETURN_URL'], message: 'must be https in production' }) })`.
  Keep whatever Phase 1 added (`S3_*`, `STRIPE_CONNECT_WEBHOOK_SECRET`).
- `CreateMerchantAccountData = { email: string; firstName: string; lastName?: string; phoneNumber?: string }`;
  `StripeService.createMerchantAccount` → `accounts.create({ country: 'BR', default_currency: 'brl', email, business_type: 'individual', business_profile: {...unchanged}, capabilities: { transfers: { requested: true } }, individual: { first_name, last_name, ...(phoneNumber ? { phone: phoneNumber } : {}) }, controller: {...unchanged} })`.
- `LinkMerchantAccountData = { account: string; returnUrl: string; refreshUrl: string }`;
  `linkMerchantAccount` → `accountLinks.create({ account, return_url: returnUrl, refresh_url: refreshUrl, type: 'account_onboarding', collection_options: { fields: 'currently_due' } })`.
- `CreateMerchantAccountService.execute`: `userType !== 'PROXY'` → `errorDictionary.user.userNotProxy` (403);
  `const [firstName, ...rest] = name.trim().split(/\s+/)`, `lastName = rest.join(' ') || undefined`,
  `phoneNumber = userDetails.phoneNumber || undefined`; `returnUrl = env.get('STRIPE_CONNECT_RETURN_URL')`,
  `refreshUrl = \`${returnUrl}${returnUrl.includes('?') ? '&' : '?'}refresh=1\``.

- [ ] **Step 1: Write the failing tests** — `src/env/env.spec.ts` (fixture built from the
  `global-setup.ts` list): missing `NODE_ENV` → `safeParse(...).success === false`; `NODE_ENV: 'production'`
  + `STRIPE_CONNECT_RETURN_URL: 'http://x.test'` → false; `'development'` + `http://localhost:3000/cb` → true.
  `src/stripe/stripe.service.spec.ts` with `jest.mock('stripe')`: `createMerchantAccount({ email: 'a@b.io', firstName: 'Ana', lastName: 'Maria da Silva' })`
  → `accounts.create` called with `expect.objectContaining({ country: 'BR', default_currency: 'brl', capabilities: { transfers: { requested: true } } })` and `individual` without a `phone` key;
  `linkMerchantAccount` passes distinct `return_url`/`refresh_url`. e2e create-merchant-account:
  `it('returns 403 for a CLIENT', ...)` (`USER_NOT_PROXY`, `createMerchantAccount` not called);
  `it('passes a distinct refresh_url', ...)` → `linkMerchantAccount` called with
  `{ account: 'acct_test_123', returnUrl: 'http://localhost:3000/callback', refreshUrl: 'http://localhost:3000/callback?refresh=1' }`;
  `it('sends a multi-word last name and omits the empty phone', ...)` (`name: 'Ana Maria da Silva'`,
  `phoneNumber: null` → call arg `lastName === 'Maria da Silva'`, `phoneNumber === undefined`).
  Update the existing assertion at lines 47-54 (`phoneNumber: user.phoneNumber` still valid).
- [ ] **Step 2: Run, expect failure** — env parses without `NODE_ENV`; CLIENT → 200.
- [ ] **Step 3: Implement** env, Stripe service, use case; `global-setup.ts`: delete the
  `STRIPE_PUBLIC_KEY`, `DEV_CALLBACK_URL`, `PROD_CALLBACK_URL` lines, add
  `STRIPE_CONNECT_RETURN_URL=http://localhost:3000/callback`; `.env.example` the same; add
  `NODE_ENV` to the owner's deploy checklist line in `CLAUDE.md` (P2-T18 finishes the docs).
- [ ] **Step 4: Run, expect pass** — the three specs.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest` (the `create-merchant-account.service.spec.ts`
  `makeEnvGet` fixture must switch to `STRIPE_CONNECT_RETURN_URL`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(stripe): P2-T10 Connect BR params, PROXY check, single return URL, strict env`

**Contract:** `POST /auth/merchant-account` response unchanged; new 403 for CLIENTs. Ops: deploy must
set `NODE_ENV=production` and `STRIPE_CONNECT_RETURN_URL=https://<static site>/stripe-redirect/`
(Phase 5 wires the host).

---

### Task P2-T11: `SERVED_CITIES`, `Tasks.city`/`state` + backfill, Places-shaped create body, `CITY_NOT_SERVED`

**Files:**
- Create: `src/common/served-cities.ts`, `src/common/served-cities.spec.ts`
- Modify: `prisma/schema.prisma:75-110` (`city String`, `state String`, `@@index([city, status, createdAt])`); migration `add_task_city_state` (create-only, then edit SQL)
- Modify: `src/modules/tasks/controllers/create-task.controller.ts:11-30` (address schema), `:47-60` (handler), `src/modules/tasks/use-cases/create-task.service.ts` (Phase 1 version; today `:20-44`), `src/modules/tasks/types/index.d.ts:27-35` (`InsertTaskData` + the service input type), `src/modules/tasks/repository/tasks.repository.ts:22-43` (`create`)
- Modify: `src/exception/error-dictionary.ts` (add `tasks.cityNotServed`)
- Modify: `test/factories/task.factory.ts` (`city`, `state` overrides + defaults `'São Paulo'`/`'SP'`), every direct `prisma.tasks.create(` in `test/**` (`grep -rn "prisma.tasks.create(" test/` → add `city: 'São Paulo', state: 'SP'`), `test/tasks/fetch-tasks.e2e-spec.ts:57-63`
- Test: `src/common/served-cities.spec.ts`, `test/tasks/create-task.e2e-spec.ts`

**Interfaces:**
- `src/common/served-cities.ts` (D16 launch scope; mirrored by proxy-app `src/common/constants/cities.ts` in P3-T14 — same entries, same matching rule):
  ```ts
  export const SERVED_CITIES = [
    { city: 'São Paulo', state: 'SP', stateName: 'São Paulo' },
    { city: 'Rio de Janeiro', state: 'RJ', stateName: 'Rio de Janeiro' },
    { city: 'Belo Horizonte', state: 'MG', stateName: 'Minas Gerais' },
  ] as const
  export type ServedCity = (typeof SERVED_CITIES)[number]
  export const foldPlaceName = (s: string): string =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
  export const matchServedCity = (city: string, state?: string): ServedCity | null
  ```
  `matchServedCity` returns the entry whose folded `city` equals the folded input; when `state` is
  given it must also fold-equal either the entry's UF (`'sp'`) or its `stateName`
  (`'sao paulo'`), otherwise `null`. Empty input → `null`.
- Create body `address` — the app sends what Google Places Autocomplete (New) returned (P3-T14b); the
  backend never calls Google:
  ```ts
  address: z
    .object({
      formattedAddress: z.string().trim().min(5).max(300).optional(),
      complement: z.string().trim().max(120).optional(),
      city: z.string().trim().min(1).max(80),
      state: z.string().trim().min(2).max(40),
      street: z.string().trim().min(1).max(200).optional(), // legacy body of the pre-P3-T14b app
      zipCode: z.string().trim().min(8).max(9).optional(),  // legacy
      locationLat: z.number().min(-90).max(90),
      locationLng: z.number().min(-180).max(180),
    })
    .strict()
    .refine((a) => !!a.formattedAddress || (!!a.street && !!a.zipCode), { message: 'Informe o endereço.' })
  ```
  The legacy `street`/`zipCode` keys stay accepted until the Phase 5 cleanup so the app keeps
  publishing between Phase 2 and P3-T14b.
- Service (first thing in `execute`, before any card/Stripe call):
  `served = matchServedCity(city, state)` → `null` → `throw new AppException(errorDictionary.tasks.cityNotServed)`;
  writes the canonical `city: served.city`, `state: served.state`;
  `locationAddress = formattedAddress ? (complement ? \`${formattedAddress} — ${complement}\` : formattedAddress) : \`${street}, ${served.city} - ${served.state}, ${zipCode}\``.
- `errorDictionary.tasks.cityNotServed = { message: 'Ainda não atendemos nessa cidade. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.', statusCode: HttpStatus.BAD_REQUEST, errorCode: 'CITY_NOT_SERVED' }`.
- `InsertTaskData` gains `city: string; state: string`; `TasksRepository.create` writes both.
  (The feed query switches to the column in P2-T12.)
- Migration SQL (`prisma/migrations/<ts>_add_task_city_state/migration.sql`):
  ```sql
  ALTER TABLE "tasks" ADD COLUMN "city" TEXT, ADD COLUMN "state" TEXT;
  -- backfill from "<street>, <city> - <UF>, <zip>" (create-task.service.ts composition before D16)
  UPDATE "tasks" SET
    "city"  = trim((regexp_match("locationAddress", ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,'))[1]),
    "state" = upper(trim((regexp_match("locationAddress", ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,'))[2]));
  -- rows that never followed the pattern (pre-1.0 seeds): keep them readable, flag with empty state
  UPDATE "tasks" SET "city" = left(trim("locationAddress"), 120), "state" = '' WHERE "city" IS NULL;
  ALTER TABLE "tasks" ALTER COLUMN "city" SET NOT NULL, ALTER COLUMN "state" SET NOT NULL;
  CREATE INDEX "tasks_city_status_createdAt_idx" ON "tasks"("city", "status", "createdAt");
  ```
  After editing, `npx prisma migrate dev` applies it and `npx prisma generate`.

- [ ] **Step 1: Write the failing tests** — `served-cities.spec.ts`:
  ```ts
  it.each([
    ['São Paulo', 'SP', 'São Paulo'], ['sao paulo', 'sp', 'São Paulo'], ['  SÃO   PAULO ', undefined, 'São Paulo'],
    ['Rio de Janeiro', 'Rio de Janeiro', 'Rio de Janeiro'], ['Belo Horizonte', 'minas gerais', 'Belo Horizonte'],
    ['São Paulo', 'RJ', null], ['Curitiba', 'PR', null], ['Niterói', 'RJ', null], ['', undefined, null],
  ])('matchServedCity(%p, %p) → %p', (city, state, expected) => expect(matchServedCity(city, state)?.city ?? null).toBe(expected))
  ```
  create-task e2e (`paulista = { formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil', city: 'São Paulo', state: 'SP', locationLat: -23.5614, locationLng: -46.6559 }`):
  ```ts
  it('stores the canonical city/state and the formatted address', ...)      // address: { ...paulista, city: 'sao paulo', state: 'sp' } → 201; row city 'São Paulo', state 'SP', locationAddress === paulista.formattedAddress
  it('appends the complement to the stored address', ...)                   // { ...paulista, complement: 'apto 42' } → locationAddress === `${paulista.formattedAddress} — apto 42`
  it('rejects a city outside the served list with CITY_NOT_SERVED', ...)    // { ...paulista, city: 'Curitiba', state: 'PR' } → 400 { errorCode: 'CITY_NOT_SERVED', message: 'Ainda não atendemos nessa cidade. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.' };
      // tasks.count() === 0; every stripeMock function has zero calls
  it('rejects a served city name with the wrong state', ...)                // { ...paulista, state: 'RJ' } → 400 CITY_NOT_SERVED
  it('still accepts the legacy street/zipCode body', ...)                   // { street: 'Rua A, 10', zipCode: '30130-005', city: 'Belo Horizonte', state: 'mg', locationLat: -19.92, locationLng: -43.94 } → 201;
      // locationAddress === 'Rua A, 10, Belo Horizonte - MG, 30130-005'
  it('rejects an address with neither formattedAddress nor street + zipCode', ...) // { city: 'São Paulo', state: 'SP', locationLat, locationLng } → 400
  it('rejects unknown address keys', ...)                                   // { ...paulista, placeId: 'ChIJ' } → 400
  ```
  Adapt `fetch-tasks.e2e-spec.ts:57-63`: the Rio task is `createTask(..., { city: 'Rio de Janeiro', state: 'RJ' })`.
- [ ] **Step 2: Run, expect failure** — `formattedAddress` bodies → 400 (`street`/`zipCode` required today); `Curitiba` → 201; `city` column unknown.
- [ ] **Step 3: Implement** constant, dictionary entry, schema + migration, controller/service/repository/types, factories.
- [ ] **Step 4: Run, expect pass** — `npx jest src/common && npx jest --config test/jest-e2e.config.ts --runInBand test/tasks/create-task.e2e-spec.ts test/tasks/fetch-tasks.e2e-spec.ts`.
- [ ] **Step 5: Repo gate** — full `npm run test:e2e` (every task seed now has the two columns) + `npx tsc --noEmit`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P2-T11 served cities, city/state columns, Places-shaped address`

**Contract:** `POST /tasks/create` body `address = { formattedAddress, complement?, city, state, locationLat, locationLng }`
(legacy `street` + `zipCode` still accepted until Phase 5); new 400 `CITY_NOT_SERVED`; task responses
gain `city`, `state`. App files `src/apis/tasks/tasks-api-types.ts` (`TCreateTaskPayload`, `TTask`),
`src/common/constants/cities.ts`; app updated in Phase 3: P3-T14 (served-city mirror + Places client)
and P3-T14b (Create Task address search).

---

### Task P2-T12: `GET /tasks/fetch` → `{ items, page, perPage, hasMore }`, canonical served city

**Files:**
- Modify: `src/modules/tasks/controllers/fetch-tasks.controller.ts:8-16` (query schema), `src/modules/tasks/use-cases/fetch-tasks.service.ts:11-23`, `src/modules/tasks/types/index.d.ts:37-46`
- Modify: `src/modules/tasks/repository/tasks.repository.ts:45-90` (`take` param; `:81-85` `fetchAllTasks` where)
- Test: `test/tasks/fetch-tasks.e2e-spec.ts`, `src/modules/tasks/use-cases/fetch-tasks.service.spec.ts`; adjust `test/tasks/fetch-task-by-id.e2e-spec.ts:94-103` and `test/tasks/fetch-active-tasks.e2e-spec.ts:99-103` (assert `Array.isArray(body.items)`)

**Interfaces:**
- Query: `z.object({ city: z.string().trim().min(1).max(60), page: z.coerce.number().int().min(1).default(1) })`.
- `export const TASKS_PER_PAGE = 10`; `FetchTasksQueryData = { city: string; skip: number; take: number }`;
  `FetchTasksResponse = { items: TaskRow[]; page: number; perPage: number; hasMore: boolean }`
  (`TaskRow` renamed/mapped to `TaskResponse` in P2-T13).
- `FetchTasksService.execute({ city, page })`: `served = matchServedCity(city)` (P2-T11, no state);
  `null` → return `{ items: [], page, perPage: TASKS_PER_PAGE, hasMore: false }` **without** calling
  the repository; otherwise the repository is called with `city: served.city`, `skip: (page - 1) * TASKS_PER_PAGE`,
  `take: TASKS_PER_PAGE + 1`; `hasMore = rows.length > TASKS_PER_PAGE`; `items = rows.slice(0, TASKS_PER_PAGE)`.
- `fetchAllTasks` where: `city: served.city` (exact match on the canonical column written by P2-T11)
  replaces `locationAddress: { contains: city }`.

- [ ] **Step 1: Write the failing tests** (fetch-tasks e2e; rewrite existing assertions to `body.items`):
  ```ts
  it('returns the empty page shape for an unserved city', ...)        // ?city=Curitiba → 200 { items: [], page: 1, perPage: 10, hasMore: false }
  it('matches the city case- and accent-insensitively', ...)          // ?city=sao paulo → items[0].city === 'São Paulo'
  it('does not match by address substring', ...)                      // task { city: 'Rio de Janeiro', locationAddress: 'Rua São Paulo, Rio de Janeiro - RJ, 20000-000' }; ?city=São Paulo → items.length 0
  it('paginates 11 tasks into 10 + 1 with hasMore', ...)              // page 1: items 10, hasMore true, page 1; page 2: items 1, hasMore false
  it('rejects page=0', ...)                                           // → 400
  ```
  Unit spec: `execute({ city: 'Curitiba', page: 1 })` → repository not called; `execute({ city: 'são paulo', page: 2 })` → called with `{ city: 'São Paulo', skip: 10, take: 11 }`.
- [ ] **Step 2: Run, expect failure** — body is an array.
- [ ] **Step 3: Implement** controller/service/repository/types.
- [ ] **Step 4: Run, expect pass** — the three affected e2e specs.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/tasks/use-cases/fetch-tasks.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P2-T12 paginated fetch response`

**Contract:** response shape changed. App type file `src/apis/tasks/tasks-api-types.ts` → add
`TPaginated<T> = { items: T[]; page: number; perPage: number; hasMore: boolean }`;
`src/apis/tasks/tasks-apis.ts:18-21` `fetchByCity` returns `TPaginated<TTask>`;
`src/apis/tasks/tasks-hooks.ts:44-48` `getNextPageParam = (last) => (last.hasMore ? last.page + 1 : undefined)`.
App updated in Phase 3, task P3-T04 (contract sync, pagination).

---

### Task P2-T13: Shared `taskSelect` + `publicUserSelect` + numeric `toTaskResponse`

**Files:**
- Create: `src/modules/tasks/repository/task-select.ts`, `src/modules/tasks/utils/task-response.ts`, `src/modules/tasks/utils/task-response.spec.ts`
- Modify: `src/modules/tasks/repository/tasks.repository.ts:51-80,121-150,161-190,231-244,265-294` (one `select: taskSelect`; `fetchTaskCounterpartById` uses `publicUserSelect`)
- Modify: `src/modules/tasks/types/index.d.ts:62-89,131-137` (`FetchTasksResult` → `TaskRow`, `TaskCounterpart` → `PublicUser`, add `TaskResponse`)
- Modify: `src/modules/tasks/use-cases/fetch-tasks.service.ts`, `fetch-active-tasks.service.ts`, `fetch-task-by-id.service.ts` (map rows through `toTaskResponse`)
- Modify: `src/modules/tasks/use-cases/start-task.service.ts` (Phase 1 version — replace `taskDetails.ownerId.stripeCustomerId` with `authRepository.findUserStripeCustomerId(taskDetails.owner)`; `AuthRepository` is already provided in `tasks.module.ts:51`)
- Modify: `src/modules/tasks/test-utils/task.factory.ts:3-33`
- Test: `test/tasks/fetch-tasks.e2e-spec.ts`, `test/tasks/fetch-active-tasks.e2e-spec.ts`, `test/tasks/fetch-task-by-id.e2e-spec.ts:61-64`

**Interfaces:**
- ```ts
  export const publicUserSelect = { id: true, name: true, avatarUrl: true, rating: true, totalTasksCreated: true } as const
  export const taskSelect = { id: true, title: true, description: true, city: true, state: true, locationAddress: true, locationLat: true, locationLng: true, offeredPrice: true, platformFee: true, stripeFee: true, chargedAmount: true, proxyEarnings: true, proofImageUrl: true, owner: true, status: true, createdAt: true, startedAt: true, completedAt: true, canceledAt: true, ownerId: { select: publicUserSelect } } as const
  export type TaskRow = Prisma.TasksGetPayload<{ select: typeof taskSelect }>
  export type PublicUser = Prisma.UsersGetPayload<{ select: typeof publicUserSelect }>
  ```
  `transferId` is deliberately **not** exposed (Stripe id, no consumer) — deviation from BE-38 recorded here.
- `export type TaskResponse = Omit<TaskRow, 'locationLat' | 'locationLng' | 'offeredPrice' | 'platformFee' | 'stripeFee' | 'chargedAmount' | 'proxyEarnings' | 'ownerId'> & { locationLat: number; locationLng: number; offeredPrice: number; platformFee: number | null; stripeFee: number | null; chargedAmount: number | null; proxyEarnings: number | null; ownerId: PublicUserResponse }`,
  `PublicUserResponse = Omit<PublicUser, 'rating'> & { rating: number }`.
- `export const toPublicUser = (u: PublicUser): PublicUserResponse`, `export const toTaskResponse = (row: TaskRow): TaskResponse` (`Decimal.toNumber()`, dates untouched).
- Repository method return types become `TaskRow`; `fetchTaskCounterpartById(userId): Promise<PublicUser | null>`.

- [ ] **Step 1: Write the failing tests** — `task-response.spec.ts`: a row with
  `offeredPrice: new Prisma.Decimal('10.03')` → `offeredPrice === 10.03` (number), `ownerId.rating` number.
  fetch-tasks e2e `it('exposes only the public owner fields and numeric money', ...)`:
  `Object.keys(items[0].ownerId).sort()` equals `['avatarUrl', 'id', 'name', 'rating', 'totalTasksCreated']`,
  `typeof items[0].offeredPrice === 'number'`, `typeof items[0].ownerId.rating === 'number'`.
  fetch-active e2e: same key assertion on `body[0].ownerId`. fetch-task-by-id e2e: replace lines
  61-64 with `toMatchObject({ id: owner.id, name: owner.name })` + `not.toHaveProperty('email')` +
  `not.toHaveProperty('stripeCustomerId')`; add `it('includes completedAt and canceledAt', ...)`
  (task `status: 'completed', completedAt: new Date('2026-11-01T10:00:00Z')` → body
  `completedAt === '2026-11-01T10:00:00.000Z'`, `canceledAt === null`).
- [ ] **Step 2: Run, expect failure** — `email`/`phoneNumber`/`stripeCustomerId` present; money is a string.
- [ ] **Step 3: Implement** select + mapper, repository, services, start-task customer lookup, unit factory.
- [ ] **Step 4: Run, expect pass** — the three e2e specs + `npx jest src/modules/tasks`.
- [ ] **Step 5: Repo gate** — full `npm run test:e2e` (start/validate/cancel still read `owner`, `offeredPrice`, etc.).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P2-T13 shared taskSelect, public owner shape, numeric task response`

**Contract:** every task response: `ownerId` is `{ id, name, avatarUrl, rating: number, totalTasksCreated }` (no `isVerified`, per D21/D12);
money/coords/rating are numbers; `completedAt`, `canceledAt`, `city`, `state`, `stripeFee`,
`chargedAmount` added. App type file `src/apis/tasks/tasks-api-types.ts` (`TTaskOwner`, `TTask`,
`TTaskCounterpart`); app updated in Phase 3, tasks P3-T04 (contract
types) and P3-T13 (money from backend numbers, APP-04).

---

### Task P2-T14: `GET /tasks/:id` visibility rules

**Files:**
- Modify: `src/modules/tasks/use-cases/fetch-task-by-id.service.ts:11-58`, `fetch-task-by-id.service.spec.ts`
- Modify: `src/modules/tasks/repository/tasks.repository.ts:151-156` (drop `ownerId: { isDeleted: false }` from `fetchTaskById` only — keep it in `fetchAllTasks`)
- Modify: `src/modules/auth/repository/auth.repository.ts` (add `fetchPhoneNumberById`), `src/modules/auth/dtos/auth-repository.dto.ts`
- Modify: `src/modules/tasks/types/index.d.ts` (`TaskDetailResponse`, `PaymentResponse`)
- Test: `test/tasks/fetch-task-by-id.e2e-spec.ts`

**Interfaces:**
- `AuthRepository.fetchPhoneNumberById(userId: string): Promise<string | null>`.
- `export type PaymentResponse = { id: string; taskId: string; amount: number; status: PaymentStatus; refundId: string | null; createdAt: Date; updatedAt: Date }`
  (`paymentIntent`, `chargeId`, `disputeId` stripped); `toPaymentResponse(record: PaymentRecord): PaymentResponse` in `src/modules/tasks/utils/task-response.ts`.
- `export type TaskDetailResponse = TaskResponse & { ownerId: PublicUserResponse & { phoneNumber?: string | null }; executorId: string | null; executor: (PublicUserResponse & { phoneNumber?: string | null }) | null; payment: PaymentResponse | null }`.
- `FetchTaskByIdService` constructor: `(tasksRepository, paymentsRepository, authRepository)`;
  `execute(taskId: string, requester: { userId: string; userType: UserType }): Promise<TaskDetailResponse>`:
  1. `task = fetchTaskById({ taskId })` → 404 `TASK_NOT_FOUND`.
  2. `mapping = fetchTaskMappingByTaskId(taskId)`; `isOwner = task.owner === userId`; `isExecutor = mapping?.executorId === userId`.
  3. `if (!isOwner && !isExecutor && !(requester.userType === 'PROXY' && task.status === 'available')) throw TASK_NOT_FOUND`.
  4. `executor = mapping ? toPublicUser(fetchTaskCounterpartById(mapping.executorId)) : null`.
  5. `phonesVisible = (isOwner || isExecutor) && (task.status === 'in_progress' || task.status === 'verification_required')`;
     owner gets `executor.phoneNumber`, executor gets `ownerId.phoneNumber` (via `fetchPhoneNumberById`); the key is **absent** otherwise.
  6. `payment = isOwner ? toPaymentResponse(record) : null`.
  `requester.userType` is the DB role (P2-T04 strategy).

- [ ] **Step 1: Write the failing tests** (fetch-task-by-id e2e):
  ```ts
  it('returns 404 to a stranger PROXY on a non-available task', ...)                 // in_progress, no mapping → 404 TASK_NOT_FOUND
  it('lets a PROXY view an available task they do not own', ...)                      // rename of the existing test; ownerId has no phoneNumber key
  it('lets the mapped executor read an in_progress task with the owner phone', ...)   // ownerId.phoneNumber === owner.phoneNumber; payment === null
  it('hides the owner phone from the executor once the task is completed', ...)       // completed → ownerId has no 'phoneNumber' key
  it('shows the executor phone to the owner only while in progress', ...)             // owner on in_progress → executor.phoneNumber === proxy.phoneNumber; on completed → key absent
  it('embeds the payment for the owner without paymentIntent', ...)                   // payment.status === 'pending', typeof payment.amount === 'number', not.toHaveProperty('paymentIntent')
  it('lets the executor read a completed task whose owner deleted the account', ...)  // users.update(owner, { isDeleted: true, name: 'Conta removida' }) → 200, ownerId.name === 'Conta removida'
  it('uses the role stored in the database, not the token', ...)                      // CLIENT stranger signs a token with userType: 'PROXY' via app.get(JwtService).sign({ ...buildSessionPayload(row), userType: 'PROXY' }) → available task → 404
  ```
  Keep `'returns the task details regardless of status'` (owner) and update its `payment` assertion (`toBeNull()` stays).
- [ ] **Step 2: Run, expect failure** — stranger PROXY → 200 today; `paymentIntent` present.
- [ ] **Step 3: Implement** service, repository filter, phone lookup, types; rewrite the unit spec
  around the rules (owner / executor / stranger PROXY available / stranger PROXY in_progress / phones).
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/tasks/use-cases/fetch-task-by-id.service.spec.ts && npm run test:e2e` (proof route `fetch-task-proof.service.ts:26` also reads `fetchTaskById`; owner/executor gate unchanged).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P2-T14 task detail visibility, counterpart phone, owner-only payment`

**Contract:** `GET /tasks/:id`: `payment` without `paymentIntent` and only for the owner; optional
`ownerId.phoneNumber` / `executor.phoneNumber`; 404 for strangers on non-available tasks. App type
file `src/apis/tasks/tasks-api-types.ts` (`TPayment`, `TTaskDetail`, `TTaskCounterpart`); app
updated in Phase 3, tasks P3-T04 (types), P3-T07 (404 vs network), P3-T11 (payment banner) and P3-T12 (counterpart phone).

---

### Task P2-T15: Transaction history — all executor statuses, stored earnings, numbers, `?page=`

**Files:**
- Modify: `src/modules/auth/controllers/fetch-transaction-history.controller.ts:16-20` (query schema), `src/modules/auth/use-cases/fetch-transaction-history.service.ts:10-49`, `fetch-transaction-history.service.spec.ts`
- Modify: `src/modules/auth/repository/auth.repository.ts:92-129`, `src/modules/auth/dtos/auth-repository.dto.ts:26-40`
- Test: `test/auth/transaction-history.e2e-spec.ts`

**Interfaces:**
- `export const HISTORY_PER_PAGE = 20`; `HistoryPage = { skip: number; take: number }`.
- `HistoryTaskRow = { id: string; title: string; status: TaskStatus; city: string; offeredPrice: Decimal; chargedAmount: Decimal | null; proxyEarnings: Decimal | null; createdAt: Date; completedAt: Date | null; canceledAt: Date | null }`
  (no `description`).
- `AuthRepository.fetchTasksCreatedByUser(userId: string, page: HistoryPage): Promise<HistoryTaskRow[]>` (`orderBy: { createdAt: 'desc' }`);
  `AuthRepository.fetchTasksExecutedByUser(userId: string, page: HistoryPage): Promise<HistoryTaskRow[]>`
  (renamed from `fetchTasksCompletedByUser`; where `userTaskMappings: { some: { executorId } }, status: { in: ['completed', 'canceled', 'payout_failed'] }`, `orderBy: { updatedAt: 'desc' }`).
- `export type TaskSummary = { id: string; title: string; status: TaskStatus; city: string; offeredPrice: number; netAmount: number; createdAt: Date; completedAt: Date | null; canceledAt: Date | null }`;
  `TransactionHistoryResponse = { tasksCreated: TaskSummary[]; tasksCompleted: TaskSummary[]; page: number; perPage: number; hasMore: boolean }`.
- `netAmount` rule (`toTaskSummary(row, role: 'owner' | 'executor')`): executor →
  `status === 'canceled' ? 0 : Number(row.proxyEarnings ?? 0)`; owner →
  `status === 'completed' ? Number(row.chargedAmount ?? row.offeredPrice) : 0` (what actually moved).
- Service `execute(userId: string, page: number)`: both lists fetched with `take: HISTORY_PER_PAGE + 1`,
  sliced, `hasMore = createdRows.length > perPage || executedRows.length > perPage`.
- Controller query: `z.object({ page: z.coerce.number().int().min(1).default(1) })`.

- [ ] **Step 1: Write the failing tests** (transaction-history e2e; seeds via `prisma.tasks.create`
  need `city`/`state`):
  ```ts
  it('returns the empty shape', ...)                                                   // { tasksCreated: [], tasksCompleted: [], page: 1, perPage: 20, hasMore: false }
  it('uses the stored proxyEarnings as netAmount for executed tasks', ...)             // completed task offeredPrice 100, proxyEarnings 80 (D1) → tasksCompleted[0].netAmount === 80 (typeof number); no 'description' key
  it('includes canceled and payout_failed executor tasks', ...)                        // 3 mapped tasks (completed/canceled/payout_failed) → length 3; canceled netAmount === 0
  it('reports chargedAmount as netAmount for the client on completed tasks', ...)      // completed offeredPrice 150 + chargedAmount 150 (D1: client pays exactly offeredPrice) → 150; completed pre-Phase-1 row with chargedAmount null + offeredPrice 80 → 80; a canceled one → 0
  it('paginates with page/perPage/hasMore', ...)                                       // 21 created tasks → page 1: 20 + hasMore true; ?page=2: 1 + hasMore false
  ```
- [ ] **Step 2: Run, expect failure** — `netAmount` 75.62 (recomputed), no `page`.
- [ ] **Step 3: Implement** repository, service, controller, dto; unit spec asserts the `netAmount` rule for the four status/role cells.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/fetch-transaction-history.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T15 history with stored earnings, all executor statuses, pagination`

**Contract:** response shape changed. App type file `src/apis/wallet/wallet-api-types.ts`
(`TTransactionHistoryTask` takes the `TaskSummary` fields, `TCompletedTransactionTask` deleted,
`TTransactionHistoryResponse` gains `page/perPage/hasMore`), `src/apis/wallet/wallet-apis.ts:11` adds
`page`; app updated in Phase 3, tasks P3-T04 (types) and P3-T18 (History tab per SPEC §8.13, APP-09).

---

### Task P2-T16: `PROXY_ACCOUNT_NOT_READY` on start, dead dictionary entries, dead code

**Files:**
- Modify: `src/modules/tasks/use-cases/start-task.service.ts` (Phase 1 version; today lines 39-42: `userType !== 'PROXY' || !stripeAccountReady`)
- Modify: `src/exception/error-dictionary.ts` (add `user.accountNotReadyToStart`; delete `tasks.taskStartedAtNotValid:123-128`, `tasks.taskNotAvailableForValidation:130-134`, `payment.transferFailed:169-173`; `file.formatNotSupported:220` message → `'Formato de arquivo não suportado. Envie uma imagem JPG, PNG, WEBP ou HEIC.'` if Phase 1 did not already)
- Create: `src/exception/error-dictionary.spec.ts`
- Modify: `src/modules/auth/repository/auth.repository.ts:236-244` (delete `updateUserPassword`), `src/modules/tasks/use-cases/finish-task.service.ts:26-28` (delete the unreachable `status !== 'in_progress'` branch if still present after Phase 1)
- Test: `test/tasks/start-task.e2e-spec.ts:57-94`, `src/exception/error-dictionary.spec.ts`

**Interfaces:**
- `errorDictionary.user.accountNotReadyToStart = { message: 'Conclua a configuração da sua conta na Carteira para aceitar tarefas.', statusCode: HttpStatus.CONFLICT, errorCode: 'PROXY_ACCOUNT_NOT_READY' }`
  (same code as `tasks.proxyAccountNotReady`, proxy-facing copy; the app routes on the code).
- Start-task check split: `userType !== 'PROXY'` → `user.userNotProxy` (403); `!stripeAccountReady` → `user.accountNotReadyToStart` (409).
- `error-dictionary.spec.ts`: flattens `errorDictionary` to dotted paths and asserts each path
  (function entries included) appears as `errorDictionary.<path>` in some file under `src/` other than
  the dictionary and `*.spec.ts` (synchronous `fs` walk) — fails on any future dead entry.

- [ ] **Step 1: Write the failing tests** — start-task e2e: the test at lines 76-94 expects 409 and
  `errorCode: 'PROXY_ACCOUNT_NOT_READY'`; lines 57-74 keep 403 `USER_NOT_PROXY`. Add the dictionary spec.
- [ ] **Step 2: Run, expect failure** — 403 `USER_NOT_PROXY` for the un-onboarded proxy; dictionary spec lists `tasks.taskStartedAtNotValid`, `tasks.taskNotAvailableForValidation`, `payment.transferFailed` as unreferenced.
- [ ] **Step 3: Implement** — split the check, dictionary edits, dead-code removals.
- [ ] **Step 4: Run, expect pass** — `npx jest src/exception && npx jest --config test/jest-e2e.config.ts --runInBand test/tasks/start-task.e2e-spec.ts`.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest` (start-task unit spec updated).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P2-T16 PROXY_ACCOUNT_NOT_READY on start, prune dead dictionary entries`

**Contract:** `POST /tasks/start` returns 409 `PROXY_ACCOUNT_NOT_READY` for an un-onboarded proxy.
App updated in Phase 3, task P3-T12 (proxy accept gated by `stripeAccountReady` with CTA to Wallet, APP-18).

---

### Task P2-T17: Indexes, `Restrict` on financial FKs, `.gitignore` dup

**Files:**
- Modify: `prisma/schema.prisma` — `Tasks`: `@@index([status, createdAt])`, `@@index([owner])`, `ownerId ... onDelete: Restrict` (line 103);
  `Payments`: `@@index([taskId])`, `task ... onDelete: Restrict` (line 155); `Cards @@index([userId])`;
  `UserTaskMapping @@index([executorId])`; `Ratings @@index([ratedId])`; `PasswordResetCodes @@index([userId, createdAt])`;
  `Users @@index([stripeAccountId])`. Cascade stays on `Cards`, `UserTaskMapping`, `Ratings`, `PasswordResetCodes`.
  Migration `add_indexes_restrict_financial_fks`.
- Modify: `.gitignore:60` (delete the duplicate `.env`)
- Test: `test/schema/schema-guards.e2e-spec.ts` (new)

**Interfaces:** none (schema only). `resetDatabase` (`test/setup/test-app.factory.ts:53-58`) uses
`TRUNCATE ... CASCADE`, which ignores FK `ON DELETE` actions — still works with `Restrict`.
`hardDeleteUser` (P2-T02) only runs on a user that has no tasks/payments.

- [ ] **Step 1: Write the failing test** `test/schema/schema-guards.e2e-spec.ts` (uses `createTestApp` for `ctx.prisma`):
  ```ts
  it('has the expected indexes', ...)   // SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() → contains
      // 'tasks_status_createdAt_idx', 'tasks_owner_idx', 'tasks_city_status_createdAt_idx', 'payments_taskId_idx', 'cards_userId_idx',
      // 'user_task_mapping_executorId_idx', 'ratings_ratedId_idx', 'password_reset_codes_userId_createdAt_idx', 'users_stripeAccountId_idx'
  it('restricts deletes through financial foreign keys', ...)   // SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('tasks_owner_fkey','payments_taskId_fkey') → both 'r'
  it('refuses to hard-delete a user who owns tasks', ...)       // createUser + createTask → prisma.users.delete → rejects (P2003)
  ```
- [ ] **Step 2: Run, expect failure** — indexes missing; `confdeltype === 'c'`.
- [ ] **Step 3: Implement** — schema edits, `npx prisma migrate dev --name add_indexes_restrict_financial_fks`, `npx prisma generate`, `.gitignore`.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — full `npm run test:e2e` (migration deploys in global-setup) + `npx tsc --noEmit`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(prisma): P2-T17 indexes and Restrict on financial foreign keys`

---

### Task P2-T18: Docs sync (`proxy-api/CLAUDE.md`, `proxy-app/SPEC.md`)

**Files:**
- Modify: `/Users/leandromartins/Documents/proxy-api/CLAUDE.md` — Stack (`Authentication`: RS256 access JWT `expiresIn: '30m'` + opaque rotating refresh tokens (SHA-256 hash in `refresh_tokens`, 60 days sliding, family revocation on reuse), `JwtStrategy.validate` requires `exp` and checks `isDeleted` + DB `userType`; password reset and account deletion revoke all refresh tokens; `Rate limiting` per Phase 0 plus 30/min on `/auth/refresh` and 10/min on `/auth/logout`; `Notifications`: `MailPort` with the Resend adapter (default) and the SES adapter), Route surface (add `GET /auth/me`, `GET /auth/session/refresh` (access token only), `POST /auth/refresh`, `POST /auth/logout`, `GET /tasks/:id/proof`, `GET /tasks/price-preview`; `POST /auth/session` / `POST /auth/create` return `{ session, refreshToken }`; `/tasks/fetch` shape `{ items, page, perPage, hasMore }` + served cities; `POST /tasks/create` address `{ formattedAddress, complement?, city, state, locationLat, locationLng }` + `CITY_NOT_SERVED` (legacy `street`/`zipCode` until Phase 5); `/tasks/active` statuses `available | in_progress | verification_required` for owners; `/auth/transaction-history?page=` shape; `DELETE /auth/account` rule per D13; `POST /auth/update-profile` body `{ name?, phoneNumber? }`; `POST /auth/session` 401 for unknown email), Database models (`RefreshTokens`; `Users.deletedAt`, `payoutIssue`, `cardActionRequired`, no `documentType`/`documentUrl`/`isVerified`, no `DocumentType` enum; `Tasks.city/state`, `completedAt/canceledAt` exposed; `PasswordResetCodes.attempts`), Stripe Connect (BR params, single return URL, `?refresh=1`), 3DS section (already rewritten by Phase 1 — verify no `requires_action`/`requires_capture` left), Environment variables (`NODE_ENV` required, `STRIPE_CONNECT_RETURN_URL`, `MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY`; removed `STRIPE_PUBLIC_KEY`/`*_CALLBACK_URL`/`AWS_SES_FROM_EMAIL`).
- Modify: `/Users/leandromartins/Documents/proxy-app/SPEC.md` — §3.3 codes/copy: remove `TASK_STARTED_AT_NOT_VALID`, `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `TRANSFER_FAILED`, `PASSWORD_RESET_TOO_MANY_REQUESTS`, `PASSWORD_RESET_SEND_FAILED`; add `SIGN_UP_UNAVAILABLE` 503, `SESSION_REFRESH_INVALID` 401, `CITY_NOT_SERVED` 400, `TASK_TRANSFER_FAILED`, `PAYMENT_NOT_CONFIRMED`, `PROOF_PHOTO_REQUIRED` (Phase 1); fix `USER_HAS_ACTIVE_TASKS` and `PROXY_ACCOUNT_NOT_READY` texts to the dictionary strings; §3.4 table: add `GET /auth/me`, `GET /auth/session/refresh`, `POST /auth/refresh`, `POST /auth/logout`, `GET /tasks/:id/proof`, `GET /tasks/price-preview`, throttle 5/min on the four public auth routes, keep "até 1h" on `/tasks/cancel` (D7 still bounds cancel), `/auth/session` note "401 for unknown email"; §4.1 `phoneNumber: string | null`, `stripeAccountReady`, `payoutIssue`, `cardActionRequired`, `exp` (30 minutes), no document claims, the `{ session, refreshToken }` login response and the `/auth/me` shape; §4.2 money as `number`, `city`, `state`, `completedAt`, `canceledAt`, `stripeFee`, `chargedAmount`, `ownerId` public shape, `payment` owner-only without `paymentIntent`, `executor`, optional phones, `payout_failed` in `TaskStatus`; §7.2 remove "até 1h" on finish, note `payout_failed` is no longer written (D5) and the 7-day auto-release (D18); §7.3 SetupIntent at card save + off-session charge with automatic capture at `/tasks/start`, no `requires_action`/`requires_capture`, fee model D1 (client pays exactly `offeredPrice`, proxy receives 80 %, platform keeps 20 % and pays Stripe); §8.3 password ≥ 8, no document type/number/photo (D12); §8.7 address search via Google Places (`country:br`) restricted to the served cities, `CITY_NOT_SERVED`, paginated shape; §8.8 R$ 20,00 minimum, R$ 10.000,00 maximum; §8.10 `photo` field mandatory; §8.13 history endpoint shape and statuses; §8.14 `update-profile` edits name and phone only ("Editar dados" screen, D14), deletion auto-cancels `available` listings.
- Modify: `../STATUS.md`

- [ ] **Step 1: Route-map check (the "failing test")** — run
  `cd /Users/leandromartins/Documents/proxy-api && grep -rhoE "@(Controller|Get|Post|Delete)\([^)]*\)" src/modules/*/controllers/*.ts | paste - - | sort`
  and diff the list against the Route surface section of `CLAUDE.md`; every controller must appear once.
- [ ] **Step 2: Expect mismatch** — `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`, `/auth/session/refresh`, `/tasks/:id/proof`, `/tasks/price-preview` missing from the docs.
- [ ] **Step 3: Write the docs** per the file list above; copy error strings from `src/exception/error-dictionary.ts` verbatim (SPEC §3.3 is pasted into toasts).
- [ ] **Step 4: Re-run the route-map check** — zero differences; `grep -n "requires_action\|requires_capture\|searchCustomer\|DEV_CALLBACK_URL\|TASK_STARTED_AT_NOT_VALID\|tokenVersion\|30d\|AWS_SES_FROM_EMAIL\|isVerified\|documentUrl" CLAUDE.md ../proxy-app/SPEC.md` → no hits.
- [ ] **Step 5: Repo gate** — final full verification command from Global constraints; e2e 100 % green (incl. the new `refresh-session`, `refresh-token`, `logout`, `me`, `no-identity-documents`, `schema-guards` specs); `npx tsc --noEmit --skipLibCheck false` clean.
- [ ] **Step 6: Mark Phase 2 done in ../STATUS.md; commit message** `docs: P2-T18 sync CLAUDE.md and SPEC.md with Phase 2 contracts`
