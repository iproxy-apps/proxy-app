# Phase 2 — Auth & API hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make every auth and read endpoint of proxy-api safe (no mass assignment, expiring and
revocable sessions, no PII leaks, deterministic account deletion) and give the app the exact
response shapes Phase 3 consumes (`/auth/me`, paginated feed, city columns, history with real
earnings), backend only.

**Architecture:** all work lives in `proxy-api` (NestJS 11 / Prisma 7 / Zod 4) following the
existing module pattern (1 controller = 1 route, 1 service = 1 use case, repository per module,
Zod inline in controllers, `AppException` + `errorDictionary`). New cross-cutting helpers are tiny
files: `src/modules/auth/utils/{auth-schemas,password,session-payload}.ts`,
`src/common/served-cities.ts`, `src/modules/tasks/repository/task-select.ts`,
`src/modules/tasks/utils/task-response.ts`. Six Prisma migrations (named below) carry the schema
changes; every HTTP shape change names the app type file and the Phase 3 task that follows it.

**Tech stack:** NestJS 11, Prisma 7.3 (`@prisma/adapter-pg`), Zod 4.3, `@nestjs/jwt` 11
(jsonwebtoken RS256), `bcryptjs` 3, `stripe` 20, Jest 30 + ts-jest (unit), Testcontainers
PostgreSQL 16 + supertest (e2e).

**Spec:** ../PLAN.md §2 (Phase 2), ../DECISIONS.md D9–D16, D20, D21 (plus D5 `payoutIssue`, D12,
D13), SPEC.md §3.3, §3.4, §4.1, §4.2, §7.2, §7.3, §8.3, §8.7, §8.13, §8.14.

**Assumed done (Phase 0 + Phase 1).** This plan cites the files as they are today (commit
`708e468`). Where Phase 1 rewrote a file, locate the quoted code instead of trusting the line
number. Assumed in place: global `PrismaModule` (modules no longer list `PrismaService`), CAS
`TasksRepository.transition(id, from[], to, data)`, `src/common/money.ts`, `Tasks.stripeFee`,
`Tasks.chargedAmount`, `Payments.chargeId`/`disputeId`, `Users.payoutIssue Boolean @default(false)`,
`proxyEarnings`/`platformFee` persisted at create, `StartTaskResult = { status: 'succeeded' }`,
`z.uuid()` on every id param, Prisma error mapping (`P2002→409`, `P2025→404`), PT messages for
Zod/throttler, throttler 5/min on `/auth/session`, `/auth/create`, `/auth/forgot-password`,
`/auth/verify-reset-code`, `test/.env.test` untracked, `delete-account.e2e-spec.ts` marked `.todo`
with a pointer to this plan, `Prisma.Decimal` exported as `Decimal` from `src/modules/auth/types`.
`buildSessionPayload` does **not** exist yet (created in P2-T03).

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
- Never start the dev server. The owner commits; leave the tree with only the task's changes.
- Verification command for the repo (PLAN.md §3), run before claiming any task done:
  `cd /Users/leandromartins/Documents/proxy-api && npx prisma generate && npx tsc --noEmit && npx eslint "src/**/*.ts" "test/**/*.ts" && npx jest && npm run test:e2e`
  (`test:e2e` needs Docker running; `docker info >/dev/null 2>&1 && echo docker-up`).
- A single spec: `npx jest path/to/file.spec.ts`; a single e2e spec:
  `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/me.e2e-spec.ts`.

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P2-T01 | Strict sign-up schema, password policy, email normalisation | — | BE-12, BE-27, BE-29 (email), BE-48 (bcrypt 10) | `test/auth/create-account.e2e-spec.ts` |
| P2-T02 | Sign-up flow: row first, Stripe Customer after, P2002 → 409, lowercase migration | P2-T01 | BE-29, BE-46 (`AuthRepository.create` type) | `test/auth/create-account.e2e-spec.ts` |
| P2-T03 | `buildSessionPayload` with numeric claims, nullable phone, `safeParse` | — | BE-15, BE-16, CON-06 | `test/auth/refresh-session.e2e-spec.ts` (new) |
| P2-T04 | 30-day expiry + `tokenVersion` revocation | P2-T03 | BE-13, CON-05, D9 | `test/auth/refresh-session.e2e-spec.ts`, `test/auth/reset-password.e2e-spec.ts` |
| P2-T05 | `GET /auth/me` | P2-T04 | BE-16, D10 | `test/auth/me.e2e-spec.ts` (new) |
| P2-T06 | `update-profile`: no `userType`, `currentPassword`, bump `tokenVersion` | P2-T01, P2-T04 | BE-14, D11 | `test/auth/update-profile.e2e-spec.ts` |
| P2-T07 | Login returns 401 for unknown email (dummy compare) | P2-T03 | BE-26 (login) | `test/auth/authenticate.e2e-spec.ts` |
| P2-T08 | Password-reset hardening: attempts, send-then-persist, generic 200, dev log, HTML escape | P2-T01 | BE-26 (forgot), BE-28, BE-48 (escape) | `test/auth/forgot-password.e2e-spec.ts`, `test/auth/verify-reset-code.e2e-spec.ts` |
| P2-T09 | Account deletion per D13 (auto-cancel listings, cards, Stripe scrub, red e2e) | P2-T04 | BE-17, BE-30, D13, REL-04 | `test/auth/delete-account.e2e-spec.ts` |
| P2-T10 | Connect params, PROXY check, single `STRIPE_CONNECT_RETURN_URL`, env hardening | — | BE-31, BE-46 (`STRIPE_PUBLIC_KEY`), BE-48 (`NODE_ENV`, https), REL-17 | `src/env/env.spec.ts`, `src/stripe/stripe.service.spec.ts`, `test/auth/create-merchant-account.e2e-spec.ts` |
| P2-T11 | `SERVED_CITIES`, `Tasks.city`/`state` + backfill migration, insensitive match | — | BE-37 (columns), D16, CON-07 | `src/common/served-cities.spec.ts`, `test/tasks/create-task.e2e-spec.ts` |
| P2-T12 | `GET /tasks/fetch` → `{ items, page, perPage, hasMore }` | P2-T11 | BE-37 (pagination) | `test/tasks/fetch-tasks.e2e-spec.ts` |
| P2-T13 | Shared `taskSelect` + `publicUserSelect` + numeric `toTaskResponse` | P2-T12 | BE-11 (shape), BE-38, D21 | `test/tasks/fetch-tasks.e2e-spec.ts`, `test/tasks/fetch-task-by-id.e2e-spec.ts` |
| P2-T14 | `GET /tasks/:id` visibility: DB role, executor-only phone, owner-only payment, deleted owner | P2-T13, P2-T04 | BE-11 (rules), D21, NEW-07 | `test/tasks/fetch-task-by-id.e2e-spec.ts` |
| P2-T15 | Transaction history: all executor statuses, stored earnings, numbers, `?page=` | P2-T11 | BE-40, D20 | `test/auth/transaction-history.e2e-spec.ts` |
| P2-T16 | `PROXY_ACCOUNT_NOT_READY` on start, dead dictionary entries, dead code | — | BE-46, NEW-08 | `test/tasks/start-task.e2e-spec.ts`, `src/exception/error-dictionary.spec.ts` (new) |
| P2-T17 | Indexes, `Restrict` on financial FKs, `.gitignore` dup | P2-T11 | BE-41, BE-49 | `test/schema/schema-guards.e2e-spec.ts` (new) |
| P2-T18 | Docs sync: api `CLAUDE.md`, app `SPEC.md` | all above | BE-47 | route-map diff command (see task) |

## Review focus

Five inputs no task's happy path covers but a real user hits first; each has a test in the task named.

1. **Login with a differently-cased or padded email after the lowercase migration** — `' ANA@Test.io '`
   against a row `ana@test.io` → 200 session. Test: P2-T01 `authenticate.e2e-spec.ts` "accepts an
   email with different casing and surrounding spaces".
2. **Legacy JWT (no `exp`, no `tokenVersion`, string `rating`) from a tester's phone** → 401 (forces
   re-login), never 500. Test: P2-T04 `refresh-session.e2e-spec.ts` "rejects a legacy token without exp".
3. **Feed query for an unserved city** — `GET /tasks/fetch?city=Curitiba` → 200
   `{ items: [], page: 1, perPage: 10, hasMore: false }`, not 400. Test: P2-T12 "returns the empty
   page shape for an unserved city".
4. **Proxy opens a completed task whose client deleted the account** → 200 with
   `ownerId.name === 'Conta removida'`, no phone. Test: P2-T14 "lets the executor read a completed
   task whose owner deleted the account".
5. **Forgot-password for a real email while SES is down** → 200 generic message, no code row, no
   500 and no enumeration. Test: P2-T08 "returns the generic message and persists nothing when the
   email fails to send".

---

### Task P2-T01: Strict sign-up schema, password policy, email normalisation

**Files:**
- Create: `src/modules/auth/utils/auth-schemas.ts`
- Create: `src/modules/auth/utils/password.ts`
- Modify: `src/modules/auth/controllers/create-account.controller.ts:8-23` (schema), `:35-37` (handler)
- Modify: `src/modules/auth/controllers/authenticate.controller.ts:9`, `forgot-password.controller.ts:8`,
  `verify-reset-code.controller.ts:8`, `reset-password.controller.ts:8-10`, `update-profile.controller.ts:15`
- Modify: `src/modules/auth/use-cases/create-account.service.ts:25-26,34,52-57` (explicit input type,
  explicit Prisma `data`, `hashPassword`), `reset-password.service.ts:42`, `update-profile.service.ts:39`
- Test: `test/auth/create-account.e2e-spec.ts`, `test/auth/authenticate.e2e-spec.ts`

**Interfaces:**
- Produces `src/modules/auth/utils/auth-schemas.ts`:
  `export const emailSchema = z.string().trim().toLowerCase().pipe(z.email())` (trim/lowercase
  **before** the format check — `z.email().trim()` would validate the padded string first) and
  `export const passwordSchema = z.string().min(8).max(72)`.
- Produces `src/modules/auth/utils/password.ts`: `export const BCRYPT_COST = 10`,
  `export const hashPassword = (plain: string): Promise<string>` (bcryptjs `hash(plain, BCRYPT_COST)`),
  `export const DUMMY_PASSWORD_HASH: string` (a real bcrypt hash of a random string, cost 10, used by P2-T07).
- Produces `export type CreateAccountInput = { name: string; email: string; password: string; userType: UserType; phoneNumber?: string; documentType?: DocumentType; documentUrl?: string; termsAccepted: true }`
  in `src/modules/auth/types/index.d.ts`; `CreateAccountService.execute(data: CreateAccountInput)`.
- Consumes: `ZodValidationPipe` (`src/pipes/zod-validation.pipe.ts:5`), `errorDictionary.user.emailExists`.

- [ ] **Step 1: Write the failing tests** in `test/auth/create-account.e2e-spec.ts`:
  ```ts
  it('rejects server-owned fields (strict schema)', ...)      // body = { ...validPayload(), isVerified: true, rating: 5, walletBalance: 1000 } → 400
  it('rejects termsAccepted: false', ...)                      // → 400; prisma.users.count() === 0
  it('rejects passwords shorter than 8 characters', ...)       // password: '1234567' → 400
  it('normalises the email to lowercase and trims it', ...)    // email: '  Ana@Test.IO ' → 200; users.findUnique({ where: { email: 'ana@test.io' } }) not null
  it('hashes the password with bcrypt cost 10', ...)           // expect(user.password).toMatch(/^\$2[aby]\$10\$/)
  ```
  and in `test/auth/authenticate.e2e-spec.ts`:
  `it('accepts an email with different casing and surrounding spaces', ...)` — create `ana@test.io`
  / `password123`, POST `{ email: ' ANA@Test.io ', password: 'password123' }` → 200 with `session`.
- [ ] **Step 2: Run, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/create-account.e2e-spec.ts`
  → "expected 400, received 200" on the strict test and `/^\$2[aby]\$10\$/` mismatch (`$2a$08$`).
- [ ] **Step 3: Implement** — `auth-schemas.ts`, `password.ts`; replace the create schema with
  `z.object({ name: z.string().trim().min(2).max(80), email: emailSchema, password: passwordSchema, userType: z.enum(['CLIENT', 'PROXY']), phoneNumber: z.string().trim().min(8).max(20).optional(), documentType: z.enum(['RG', 'CPF', 'CNPJ']).optional(), documentUrl: z.url().optional(), termsAccepted: z.literal(true) }).strict()`;
  `email: emailSchema` in the four other public controllers; `newPassword: passwordSchema` in
  reset-password; `password: passwordSchema.optional()` in update-profile (full rewrite in P2-T06);
  in `create-account.service.ts` type the input as `CreateAccountInput`, call `hashPassword`, and
  build the Prisma `data` object field by field (no `...data`). Replace `hash(x, 8)` with
  `hashPassword(x)` in `reset-password.service.ts:42` and `update-profile.service.ts:39`.
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

### Task P2-T03: `buildSessionPayload`, numeric claims, nullable phone, `safeParse`

**Files:**
- Create: `src/modules/auth/utils/session-payload.ts`
- Modify: `src/modules/auth/utils/jwt.strategy.ts:10-30` (schema), `:49-59` (`validate`)
- Modify: `src/modules/auth/use-cases/authenticate.service.ts:40-60`, `refresh-session.service.ts:22-40`,
  `update-profile.service.ts:50-68` (replace the three inline payload objects)
- Modify: `test/factories/user.factory.ts:9-18,20-29,44,64-81` (`phoneNumber: string | null`, no `?? ''`)
- Test: `test/auth/refresh-session.e2e-spec.ts` (new), `test/auth/authenticate.e2e-spec.ts`

**Interfaces:**
- Produces `export const buildSessionPayload = (user: FindUserByEmailResult): SessionPayload`
  (`src/modules/auth/utils/session-payload.ts`) — `rating: user.rating.toNumber()`,
  `walletBalance: user.walletBalance.toNumber()`, `phoneNumber: user.phoneNumber` (nullable), all
  other current claims unchanged. P2-T04 adds `tokenVersion`.
- Produces `sessionPayloadSchema` with `phoneNumber: z.string().nullable()`, `rating: z.number()`,
  `totalTasksCompleted: z.number().int()`, `totalTasksCreated: z.number().int()`, `walletBalance: z.number()`
  (no `z.coerce`), `userType: z.enum(['CLIENT', 'PROXY'])`; `SessionPayload = z.infer<...>`.
- `JwtStrategy.validate(payload: unknown): Promise<SessionPayload>` — `safeParse`; failure → `UnauthorizedException`.
- Factory: `CreateUserOverrides.phoneNumber?: string | null`, `CreatedUser.phoneNumber: string | null`;
  default `'+5511999999999'` only when `overrides.phoneNumber === undefined`.

- [ ] **Step 1: Write the failing tests** — new `test/auth/refresh-session.e2e-spec.ts`
  (same skeleton as `authenticate.e2e-spec.ts:8-21`):
  ```ts
  it('rejects unauthenticated requests', ...)                         // GET /auth/session/refresh → 401
  it('returns a new session for a user without phone number', ...)    // createUser({ phoneNumber: null }) → 200; decoded.phoneNumber === null
  it('signs rating and walletBalance as numbers', ...)                // users.update({ rating: 4.5, walletBalance: 123.45 }) → decode via app.get(JwtService).decode → typeof number, === 4.5 / 123.45
  ```
  and in `authenticate.e2e-spec.ts`: `it('signs rating and walletBalance as numbers', ...)` (same decode).
- [ ] **Step 2: Run, expect failure** — today `createUser({ phoneNumber: null })` 500s on the
  guarded route (`ZodError` → `STANDARD_ERROR`); `typeof rating` is `'string'`.
- [ ] **Step 3: Implement** — `session-payload.ts`; the three services call
  `this.jwt.sign(buildSessionPayload(user))`; strategy schema + `safeParse`; factory signs
  `buildSessionPayload(user)` directly (import it) instead of the hand-built object at lines 64-81.
- [ ] **Step 4: Run, expect pass** — `npx jest --config test/jest-e2e.config.ts --runInBand test/auth/refresh-session.e2e-spec.ts test/auth/authenticate.e2e-spec.ts`.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth` (`authenticate.service.spec.ts`,
  `refresh-session.service.spec.ts`, `update-profile.service.spec.ts` assert `sign` was called with
  `expect.objectContaining({ rating: 0 })` as a number).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T03 buildSessionPayload with numeric claims and nullable phone`

---

### Task P2-T04: 30-day expiry + `tokenVersion` revocation

**Files:**
- Modify: `prisma/schema.prisma:40-73` (`Users.tokenVersion Int @default(0)`); migration `add_user_token_version`
- Modify: `src/modules/auth/auth.module.ts:49` → `signOptions: { algorithm: 'RS256', expiresIn: '30d' }`
- Modify: `src/modules/auth/utils/jwt.strategy.ts` (schema + `validate`), `src/modules/auth/utils/session-payload.ts`
- Modify: `src/modules/auth/types/index.d.ts:7-29` (`tokenVersion: number`), `src/modules/auth/test-utils/user.factory.ts:5-30` (`tokenVersion: 0`)
- Modify: `src/modules/auth/repository/auth.repository.ts:219-234` (`resetPasswordWithCode` bumps version)
- Modify: `package.json` devDependencies: `@types/jsonwebtoken` (jsonwebtoken itself is already a transitive dep of `@nestjs/jwt`)
- Test: `test/auth/refresh-session.e2e-spec.ts`, `test/auth/reset-password.e2e-spec.ts`

**Interfaces:**
- `sessionPayloadSchema` gains `tokenVersion: z.number().int()`; produces
  `export const jwtClaimsSchema = sessionPayloadSchema.extend({ iat: z.number(), exp: z.number() })`
  used by `validate` (tokens without `exp` or `tokenVersion` → 401).
- `JwtStrategy.validate`: `prisma.users.findUnique({ where: { id }, select: { isDeleted: true, tokenVersion: true, userType: true } })`;
  401 when missing, deleted, or `user.tokenVersion !== claims.tokenVersion`; returns
  `{ ...claims, userType: user.userType }` so `SessionPayload.userType` is always the DB role (P2-T14 relies on this).
- `buildSessionPayload` adds `tokenVersion: user.tokenVersion`.
- `AuthRepository.resetPasswordWithCode` users.update data: `{ password, tokenVersion: { increment: 1 } }`.

- [ ] **Step 1: Write the failing tests** — `refresh-session.e2e-spec.ts`:
  ```ts
  it('issues tokens that expire in 30 days', ...)              // decode(response.body.session): exp - iat === 2_592_000
  it('rejects a token whose tokenVersion is stale', ...)       // createUser → users.update({ tokenVersion: 1 }) → old token → 401
  it('rejects an expired token', ...)                          // app.get(JwtService).sign(buildSessionPayload(row), { expiresIn: '-10s' }) → 401
  it('rejects a legacy token without exp', ...)                // import jwt from 'jsonwebtoken'; jwt.sign(payloadWithoutTokenVersion, Buffer.from(process.env.JWT_PRIVATE_KEY!, 'base64'), { algorithm: 'RS256' }) → 401
  ```
  `reset-password.e2e-spec.ts`: `it('invalidates sessions issued before the reset', ...)` — after the
  200 reset, `GET /auth/session/refresh` with `user.token` → 401; a fresh `POST /auth/session` with
  the new password → 200.
- [ ] **Step 2: Run, expect failure** — `exp` undefined; stale token → 200.
- [ ] **Step 3: Implement** — schema + `npx prisma migrate dev --name add_user_token_version`
  (`ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0`), `npx prisma generate`;
  module `expiresIn`; strategy; payload; repository bump.
- [ ] **Step 4: Run, expect pass** — both specs green.
- [ ] **Step 5: Repo gate** — full `npm run test:e2e` (every spec signs through the factory, which
  now includes `tokenVersion`) + `npx tsc --noEmit`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(auth): P2-T04 30-day JWT expiry and tokenVersion revocation`

**Contract:** JWT claims change (`phoneNumber: string | null`, `tokenVersion`, `exp`, `iat`). App type
`src/apis/auth/auth-api-types.ts` → `TSessionPayload`; app updated in Phase 3, task P3-Txx:
"Session normalisation (Zod decode, exp check, refresh on focus)".

---

### Task P2-T05: `GET /auth/me`

**Files:**
- Create: `src/modules/auth/controllers/fetch-me.controller.ts` (`@Controller('/auth/me')`, `@UseGuards(JwtAuthGuard)`, `@Get()`)
- Create: `src/modules/auth/use-cases/fetch-me.service.ts`, `fetch-me.service.spec.ts`
- Modify: `src/modules/auth/types/index.d.ts` (`MeResponse`), `src/modules/auth/auth.module.ts:58-89`
- Test: `test/auth/me.e2e-spec.ts` (new)

**Interfaces:**
- Produces `export type MeResponse = { id: string; name: string; email: string; phoneNumber: string | null; avatarUrl: string | null; userType: UserType; rating: number; totalTasksCompleted: number; totalTasksCreated: number; walletBalance: number; stripeAccountId: string | null; stripeAccountReady: boolean; payoutIssue: boolean; isVerified: boolean; termsAccepted: boolean }`.
- `FetchMeService.execute(userId: string): Promise<MeResponse>` — `authRepository.fetchUserDetailsById`,
  `USER_NOT_FOUND` when null/deleted, Decimal → `.toNumber()`. Never returns `password`,
  `stripeCustomerId`, `tokenVersion`, `documentUrl`.

- [ ] **Step 1: Write the failing test** `test/auth/me.e2e-spec.ts`:
  ```ts
  it('rejects unauthenticated requests', ...)                                   // 401
  it('returns the fresh user subset with numeric money and rating', ...)         // users.update({ walletBalance: 250.5, rating: 4.25, payoutIssue: true }) → GET /auth/me with the OLD token → 200;
      // expect(Object.keys(body).sort()).toEqual(['avatarUrl','email','id','isVerified','name','payoutIssue','phoneNumber','rating','stripeAccountId','stripeAccountReady','termsAccepted','totalTasksCompleted','totalTasksCreated','userType','walletBalance'])
      // body.walletBalance === 250.5, body.rating === 4.25, body.payoutIssue === true
  it('never exposes secrets', ...)                                               // not.toHaveProperty('password' | 'stripeCustomerId' | 'tokenVersion')
  ```
- [ ] **Step 2: Run, expect failure** — 404 (route missing).
- [ ] **Step 3: Implement** service, controller, module registration; unit spec asserts `USER_NOT_FOUND` and the mapping.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/fetch-me.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(auth): P2-T05 GET /auth/me`

**Contract:** new response. App type file `src/apis/auth/auth-api-types.ts` → add `TMeResponse`;
`src/apis/auth/auth-apis.ts` → `me()`; app updated in Phase 3, task P3-Txx: "Session: `GET /auth/me`
as source of truth for wallet/rating".

---

### Task P2-T06: `update-profile` — no `userType`, `currentPassword`, bump `tokenVersion`

**Files:**
- Modify: `src/modules/auth/controllers/update-profile.controller.ts:11-17,33-36`
- Modify: `src/modules/auth/use-cases/update-profile.service.ts:22-48`
- Modify: `src/modules/auth/types/index.d.ts:31-38,44-50`; `src/modules/auth/repository/auth.repository.ts:131-136`
- Test: `test/auth/update-profile.e2e-spec.ts`, `src/modules/auth/use-cases/update-profile.service.spec.ts`

**Interfaces:**
- Body schema:
  ```ts
  z.object({
    name: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z.url().nullable().optional(),
    phoneNumber: z.string().trim().min(8).max(20).nullable().optional(),
    password: passwordSchema.optional(),
    currentPassword: z.string().optional(),
  }).strict().refine((b) => !b.password || !!b.currentPassword, { message: 'Informe a senha atual para alterar a senha.', path: ['currentPassword'] })
  ```
- `UpdateProfileInput = { userId: string; name?: string; avatarUrl?: string | null; phoneNumber?: string | null; password?: string; currentPassword?: string }`;
  `UpdateUserProfileRepositoryPayload = { name?: string; avatarUrl?: string | null; phoneNumber?: string | null; password?: string; tokenVersion?: { increment: number } }`
  (`userType` removed; `undefined` keys are skipped by Prisma, `null` clears — no more `?? ''`).
- Service: when `password` present → `compare(currentPassword, user.password)` false →
  `errorDictionary.user.invalidCredentials` (401); payload includes `tokenVersion: { increment: 1 }`;
  re-reads the user and returns `{ session: jwt.sign(buildSessionPayload(updated)) }`.

- [ ] **Step 1: Write the failing tests** (update-profile e2e; drop `userType` from existing bodies):
  ```ts
  it('rejects userType in the body', ...)                                  // { name: 'x', userType: 'PROXY' } → 400; DB userType unchanged
  it('rejects a password change without currentPassword', ...)             // { password: 'brand-new-pass' } → 400
  it('rejects a wrong currentPassword', ...)                                // { password: 'brand-new-pass', currentPassword: 'nope' } → 401 USER_INVALID_CREDENTIALS; old password still valid
  it('changes the password and invalidates earlier sessions', ...)         // 200; compare(new) true; old token on /auth/session/refresh → 401; body.session on /auth/session/refresh → 200
  it('clears phoneNumber when null is sent', ...)                           // { phoneNumber: null } → DB null (today becomes '')
  ```
- [ ] **Step 2: Run, expect failure** — 200 on the `userType` body; `''` instead of null.
- [ ] **Step 3: Implement** controller + service + types; `auth.repository.ts:131-136` signature follows the new payload type.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/update-profile.service.spec.ts` (rewrite the `userType` cases into the `currentPassword` cases).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T06 update-profile without userType, requires currentPassword`

**Contract:** request body changed (`userType` rejected, `currentPassword` added). No app caller
ships in 1.0 (D14: "Editar dados" removed); SPEC §8.14 updated in P2-T18. App type file
`src/apis/auth/auth-api-types.ts` gets `TUpdateProfilePayload` only if Phase 3 adds a caller.

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
(`src/apis/api-client.ts`) maps by `errorCode`; app updated in Phase 3, task P3-Txx: "Error
mapping (English/unknown codes, 401 vs 404)".

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
  (`notificationMock.sendResetCodeByEmail.mockRejectedValueOnce(new Error('ses'))` → 200, 0 rows).
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
  4. `tx.users.update({ where: { id: userId }, data: { isDeleted: true, deletedAt: now, name: 'Conta removida', email: \`deleted-${userId}@deleted.local\`, phoneNumber: null, avatarUrl: null, documentUrl: null, documentType: null, password: '!deleted', tokenVersion: { increment: 1 } } })`
     — `stripeCustomerId`/`stripeAccountId` are **kept** (D13: ids kept 180 days; purge job out of scope).
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
  `stored.deletedAt` not null, `stored.tokenVersion === 1`; extend `'soft-deletes the account and
  anonymizes PII'` with `expect(stored?.password).toBe('!deleted')`; add
  `it('still deletes when Stripe detach fails', ...)` (`detachPaymentMethod.mockRejectedValueOnce` → 204).
- [ ] **Step 2: Run, expect failure** — the renamed test is the known red (409 on `available`).
- [ ] **Step 3: Implement** — migration `npx prisma migrate dev --name add_user_deleted_at`
  (`ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3)`), repository, service, Stripe method, mock.
- [ ] **Step 4: Run, expect pass** — `test/auth/delete-account.e2e-spec.ts` green (22/22 suites again).
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

### Task P2-T11: `SERVED_CITIES`, `Tasks.city`/`state`, backfill migration, insensitive match

**Files:**
- Create: `src/common/served-cities.ts`, `src/common/served-cities.spec.ts`
- Modify: `prisma/schema.prisma:75-110` (`city String`, `state String`, `@@index([city, status, createdAt])`); migration `add_task_city_state` (create-only, then edit SQL)
- Modify: `src/modules/tasks/controllers/create-task.controller.ts:14-21`, `src/modules/tasks/use-cases/create-task.service.ts:34-44` (Phase 1 version), `src/modules/tasks/types/index.d.ts:27-35` (`InsertTaskData`), `src/modules/tasks/repository/tasks.repository.ts:22-43` (`create`), `:81-85` (`fetchAllTasks` where)
- Modify: `test/factories/task.factory.ts` (`city`, `state` overrides + defaults), every direct `prisma.tasks.create(` in `test/**` (`grep -rn "prisma.tasks.create(" test/` → add `city: 'São Paulo', state: 'SP'`), `test/tasks/fetch-tasks.e2e-spec.ts:57-63`
- Test: `src/common/served-cities.spec.ts`, `test/tasks/create-task.e2e-spec.ts`

**Interfaces:**
- ```ts
  export const SERVED_CITIES = [
    { city: 'São Paulo', state: 'SP' },
    { city: 'Rio de Janeiro', state: 'RJ' },
    { city: 'Belo Horizonte', state: 'MG' },
  ] as const
  export type ServedCity = (typeof SERVED_CITIES)[number]['city']
  export const SERVED_CITY_NAMES = SERVED_CITIES.map((c) => c.city) as [ServedCity, ...ServedCity[]]
  export const stateForCity = (city: ServedCity): string
  ```
  (the app mirrors this list in `src/common/served-cities.ts` of proxy-app in Phase 3).
- Create body: `address.city: z.enum(SERVED_CITY_NAMES)`; `address.state: z.string().optional()` is
  accepted and **ignored** until Phase 3 stops sending it; the service writes `state: stateForCity(city)`
  and composes `locationAddress = \`${street}, ${city} - ${state}, ${zipCode}\`` with the canonical state.
- `InsertTaskData` gains `city: string; state: string`; `TasksRepository.create` writes both.
- `fetchAllTasks` where: `city: { equals: city, mode: 'insensitive' }` replaces `locationAddress: { contains: city }`.
- Migration SQL (`prisma/migrations/<ts>_add_task_city_state/migration.sql`):
  ```sql
  ALTER TABLE "tasks" ADD COLUMN "city" TEXT, ADD COLUMN "state" TEXT;
  -- backfill from "<street>, <city> - <UF>, <zip>" (create-task.service.ts composition)
  UPDATE "tasks" SET
    "city"  = trim((regexp_match("locationAddress", ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,'))[1]),
    "state" = upper(trim((regexp_match("locationAddress", ',\s*([^,]+?)\s*-\s*([A-Za-z]{2})\s*,'))[2]));
  -- rows that never followed the pattern (pre-1.0 seeds): keep them readable, flag with empty state
  UPDATE "tasks" SET "city" = left(trim("locationAddress"), 120), "state" = '' WHERE "city" IS NULL;
  ALTER TABLE "tasks" ALTER COLUMN "city" SET NOT NULL, ALTER COLUMN "state" SET NOT NULL;
  CREATE INDEX "tasks_city_status_createdAt_idx" ON "tasks"("city", "status", "createdAt");
  ```
  After editing, `npx prisma migrate dev` applies it and `npx prisma generate`.

- [ ] **Step 1: Write the failing tests** — `served-cities.spec.ts`: `SERVED_CITY_NAMES` has length 3,
  `stateForCity('Belo Horizonte') === 'MG'`. create-task e2e:
  `it('rejects a city outside the served list', ...)` (`address.city: 'Curitiba'` → 400, no row);
  `it('stores the city and its canonical state', ...)` (`city: 'Belo Horizonte', state: 'XX'` → row
  `city === 'Belo Horizonte'`, `state === 'MG'`, `locationAddress` contains `'Belo Horizonte - MG'`).
  Adapt `fetch-tasks.e2e-spec.ts:57-63`: the Rio task is `createTask(..., { city: 'Rio de Janeiro', state: 'RJ' })`.
- [ ] **Step 2: Run, expect failure** — `Curitiba` accepted; `city` column unknown.
- [ ] **Step 3: Implement** constant, schema + migration, controller/service/repository/types, factories.
- [ ] **Step 4: Run, expect pass** — `npx jest src/common && npx jest --config test/jest-e2e.config.ts --runInBand test/tasks/create-task.e2e-spec.ts test/tasks/fetch-tasks.e2e-spec.ts`.
- [ ] **Step 5: Repo gate** — full `npm run test:e2e` (every task seed now has the two columns) + `npx tsc --noEmit`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P2-T11 served cities and city/state columns`

**Contract:** `POST /tasks/create` body `address.city` becomes an enum; task responses gain
`city`, `state`. App type file `src/apis/tasks/tasks-api-types.ts` (`TCreateTaskPayload`, `TTask`) +
app constant mirror; app updated in Phase 3, task P3-Txx: "City picker from shared constant (APP-07)".

---

### Task P2-T12: `GET /tasks/fetch` → `{ items, page, perPage, hasMore }`

**Files:**
- Modify: `src/modules/tasks/controllers/fetch-tasks.controller.ts:8-16` (query schema), `src/modules/tasks/use-cases/fetch-tasks.service.ts:11-23`, `src/modules/tasks/types/index.d.ts:37-46`
- Modify: `src/modules/tasks/repository/tasks.repository.ts:45-90` (`take` param)
- Test: `test/tasks/fetch-tasks.e2e-spec.ts`; adjust `test/tasks/fetch-task-by-id.e2e-spec.ts:94-103` and `test/tasks/fetch-active-tasks.e2e-spec.ts:99-103` (assert `Array.isArray(body.items)`)

**Interfaces:**
- Query: `z.object({ city: z.string().trim().min(1).max(60), page: z.coerce.number().int().min(1).default(1) })`.
- `export const TASKS_PER_PAGE = 10`; `FetchTasksQueryData = { city: string; skip: number; take: number }`;
  `FetchTasksResponse = { items: TaskRow[]; page: number; perPage: number; hasMore: boolean }`
  (`TaskRow` renamed/mapped to `TaskResponse` in P2-T13).
- `FetchTasksService.execute({ city, page })`: repository called with `take: TASKS_PER_PAGE + 1`;
  `hasMore = rows.length > TASKS_PER_PAGE`; `items = rows.slice(0, TASKS_PER_PAGE)`.

- [ ] **Step 1: Write the failing tests** (fetch-tasks e2e; rewrite existing assertions to `body.items`):
  ```ts
  it('returns the empty page shape for an unserved city', ...)   // ?city=Curitiba → 200 { items: [], page: 1, perPage: 10, hasMore: false }
  it('matches the city case-insensitively', ...)                  // ?city=são paulo → items[0].city === 'São Paulo'
  it('does not match by address substring', ...)                  // task { city: 'Rio de Janeiro', locationAddress: 'Rua São Paulo, Rio de Janeiro - RJ, 20000-000' }; ?city=São Paulo → items.length 0
  it('paginates 11 tasks into 10 + 1 with hasMore', ...)          // page 1: items 10, hasMore true, page 1; page 2: items 1, hasMore false
  it('rejects page=0', ...)                                       // → 400
  ```
- [ ] **Step 2: Run, expect failure** — body is an array.
- [ ] **Step 3: Implement** controller/service/repository/types.
- [ ] **Step 4: Run, expect pass** — the three affected e2e specs.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/tasks/use-cases/fetch-tasks.service.spec.ts` (assert `take: 11` and the slice).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P2-T12 paginated fetch response`

**Contract:** response shape changed. App type file `src/apis/tasks/tasks-api-types.ts` → add
`TPaginated<T> = { items: T[]; page: number; perPage: number; hasMore: boolean }`;
`src/apis/tasks/tasks-apis.ts:18-21` `fetchByCity` returns `TPaginated<TTask>`;
`src/apis/tasks/tasks-hooks.ts:44-48` `getNextPageParam = (last) => (last.hasMore ? last.page + 1 : undefined)`.
App updated in Phase 3, task P3-Txx: "Pagination shape for the Proxy feed".

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
`TTaskCounterpart`); app updated in Phase 3, task P3-Txx: "Money copy from backend numbers (APP-04)
and task contract types".

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
updated in Phase 3, task P3-Txx: "Task detail contract (counterpart phone, payment banner, 404 vs network)".

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
  it('uses the stored proxyEarnings as netAmount for executed tasks', ...)             // completed task offeredPrice 100, proxyEarnings 70 → tasksCompleted[0].netAmount === 70 (typeof number); no 'description' key
  it('includes canceled and payout_failed executor tasks', ...)                        // 3 mapped tasks (completed/canceled/payout_failed) → length 3; canceled netAmount === 0
  it('reports chargedAmount as netAmount for the client on completed tasks', ...)      // completed chargedAmount 124.38 → tasksCreated[0].netAmount === 124.38; a canceled one → 0
  it('paginates with page/perPage/hasMore', ...)                                       // 21 created tasks → page 1: 20 + hasMore true; ?page=2: 1 + hasMore false
  ```
- [ ] **Step 2: Run, expect failure** — `netAmount` 75.62 (recomputed), no `page`.
- [ ] **Step 3: Implement** repository, service, controller, dto; unit spec asserts the `netAmount` rule for the four status/role cells.
- [ ] **Step 4: Run, expect pass**.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx jest src/modules/auth/use-cases/fetch-transaction-history.service.spec.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P2-T15 history with stored earnings, all executor statuses, pagination`

**Contract:** response shape changed. App type file `src/apis/wallet/wallet-api-types.ts`
(`TTransactionHistoryTask`/`TCompletedTransactionTask` → `TTaskSummary`, `TTransactionHistoryResponse`
gains `page/perPage/hasMore`), `src/apis/wallet/wallet-apis.ts:11` adds `page`; app updated in
Phase 3, task P3-Txx: "History tab per SPEC §8.13 (APP-09)".

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
App updated in Phase 3, task P3-Txx: "Proxy accept gated by `stripeAccountReady` with CTA to Wallet (APP-18)".

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
- Modify: `/Users/leandromartins/Documents/proxy-api/CLAUDE.md` — Stack (`Authentication`: RS256, `expiresIn: '30d'`, `tokenVersion`, `JwtStrategy.validate` checks `isDeleted` + `tokenVersion` + DB `userType`; `Rate limiting` per Phase 0; `Notifications`: SES only), Route surface (add `GET /auth/me`, `GET /auth/session/refresh`, `GET /tasks/:id/proof`, `GET /tasks/price-preview`; `/tasks/fetch` shape `{ items, page, perPage, hasMore }` + served cities; `/tasks/active` statuses `available | in_progress | verification_required` for owners; `/auth/transaction-history?page=` shape; `DELETE /auth/account` rule per D13; `POST /auth/update-profile` body; `POST /auth/session` 401 for unknown email), Database models (`Users.tokenVersion`, `deletedAt`, `payoutIssue`; `Tasks.city/state`, `completedAt/canceledAt` exposed; `PasswordResetCodes.attempts`), Stripe Connect (BR params, single return URL, `?refresh=1`), 3DS section (already rewritten by Phase 1 — verify no `requires_action` left), Environment variables (`NODE_ENV` required, `STRIPE_CONNECT_RETURN_URL`, removed `STRIPE_PUBLIC_KEY`/`*_CALLBACK_URL`).
- Modify: `/Users/leandromartins/Documents/proxy-app/SPEC.md` — §3.3 codes/copy: remove `TASK_STARTED_AT_NOT_VALID`, `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `TRANSFER_FAILED`, `PASSWORD_RESET_TOO_MANY_REQUESTS`, `PASSWORD_RESET_SEND_FAILED`; add `SIGN_UP_UNAVAILABLE` 503, `TASK_TRANSFER_FAILED`, `PAYMENT_NOT_CONFIRMED`, `PROOF_PHOTO_REQUIRED` (Phase 1); fix `USER_HAS_ACTIVE_TASKS` and `PROXY_ACCOUNT_NOT_READY` texts to the dictionary strings; §3.4 table: add `GET /auth/me`, `GET /auth/session/refresh`, `GET /tasks/:id/proof`, `GET /tasks/price-preview`, throttle 5/min on the four public auth routes, keep "até 1h" on `/tasks/cancel` (D7 still bounds cancel), `/auth/session` note "401 for unknown email"; §4.1 `phoneNumber: string | null`, `tokenVersion`, `stripeAccountReady`, `exp`, and the `/auth/me` shape; §4.2 money as `number`, `city`, `state`, `completedAt`, `canceledAt`, `stripeFee`, `chargedAmount`, `ownerId` public shape, `payment` owner-only without `paymentIntent`, `executor`, optional phones, `payout_failed` in `TaskStatus`; §7.2 remove "até 1h" on finish, note `payout_failed` is no longer written (D5) and the 7-day auto-release (D18); §7.3 SetupIntent + off-session, no `requires_action`, fee model D1; §8.3 password ≥ 8, no document upload (D12); §8.7 served-city picker, paginated shape; §8.8 R$ 10 min; §8.10 `photo` field mandatory; §8.13 history endpoint shape and statuses; §8.14 no `userType` in update-profile, `currentPassword`, deletion auto-cancels `available` listings, "Editar perfil" row removed (D14).
- Modify: `../STATUS.md`

- [ ] **Step 1: Route-map check (the "failing test")** — run
  `cd /Users/leandromartins/Documents/proxy-api && grep -rhoE "@(Controller|Get|Post|Delete)\([^)]*\)" src/modules/*/controllers/*.ts | paste - - | sort`
  and diff the list against the Route surface section of `CLAUDE.md`; every controller must appear once.
- [ ] **Step 2: Expect mismatch** — `GET /auth/me`, `/auth/session/refresh`, `/tasks/:id/proof`, `/tasks/price-preview` missing from the docs.
- [ ] **Step 3: Write the docs** per the file list above; copy error strings from `src/exception/error-dictionary.ts` verbatim (SPEC §3.3 is pasted into toasts).
- [ ] **Step 4: Re-run the route-map check** — zero differences; `grep -n "requires_action\|searchCustomer\|DEV_CALLBACK_URL\|TASK_STARTED_AT_NOT_VALID" CLAUDE.md ../proxy-app/SPEC.md` → no hits.
- [ ] **Step 5: Repo gate** — final full verification command from Global constraints; e2e 100 % green (incl. the new `refresh-session`, `me`, `schema-guards` specs); `npx tsc --noEmit --skipLibCheck false` clean.
- [ ] **Step 6: Mark Phase 2 done in ../STATUS.md; commit message** `docs: P2-T18 sync CLAUDE.md and SPEC.md with Phase 2 contracts`
