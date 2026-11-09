# A1 — Backend audit: auth module + app core (proxy-api)

Auditor: A1 · Date: 2026-11-08 · Repo: `/Users/leandromartins/Documents/proxy-api` (branch state as found; read-only)

## 1. Scope

Every file below was opened in full and read line by line (line counts from `wc -l`). Paths are relative to `/Users/leandromartins/Documents/proxy-api/`.

| File | Lines |
| --- | ---: |
| `src/main.ts` | 20 |
| `src/app.module.ts` | 45 |
| `src/env/env.ts` / `env.module.ts` / `env.service.ts` | 22 / 9 / 13 |
| `src/exception/app.exception.ts` / `http.exception.ts` / `error-dictionary.ts` | 32 / 61 / 231 |
| `src/pipes/zod-validation.pipe.ts` / `multer-validation.pipe.ts` | 23 / 48 |
| `src/prisma/prisma.service.ts` | 27 |
| `src/notification/notification.module.ts` / `notification.service.ts` | 39 / 73 |
| `src/modules/auth/auth.module.ts` | 91 |
| `src/modules/auth/controllers/*` (11 controllers) | 27, 38, 22, 19, 21, 21, 23, 19, 29, 38, 27 |
| `src/modules/auth/use-cases/*.service.ts` (15 services) | 64, 64, 89, 35, 29, 50, 20, 66, 44, 54, 72, 27, 27, 29, 47 |
| `src/modules/auth/use-cases/*.service.spec.ts` (15 specs) | 105, 146, 183, 88, 75, 124, 43, 116, 59, 123, 127, 48, 48, 79, 108 |
| `src/modules/auth/repository/auth.repository.ts` | 245 |
| `src/modules/auth/dtos/auth-repository.dto.ts` | 40 |
| `src/modules/auth/types/index.d.ts` | 50 |
| `src/modules/auth/test-utils/user.factory.ts` | 30 |
| `src/modules/auth/utils/jwt.strategy.ts` / `jwt-auth.guard.ts` / `current-user-decorator.ts` | 60 / 3 / 7 |
| `src/stripe/stripe.module.ts` / `stripe.service.ts` / `types/index.d.ts` | 29 / 156 / 17 |
| `.env.example`, `test/.env.test`, `.env` — **key names only** (no values printed except `NODE_ENV`, `PORT`, `AWS_REGION`, and the hostnames of the two callback URLs) | — |

Read for context only (not audited, other slices): `test/auth/*.e2e-spec.ts` (10 files), `test/factories/user.factory.ts`, `test/factories/task.factory.ts`, `test/setup/test-app.factory.ts`, `test/mocks/*`, `prisma/schema.prisma` (Users / PasswordResetCodes / enums), `src/modules/tasks/repository/tasks.repository.ts:159-215`, `src/modules/tasks/use-cases/start-task.service.ts:30-45`, `validate-task.service.ts:54-62`, `finish-task.service.ts:40-70`, `src/modules/stripe-webhook/use-cases/handle-account-updated.service.ts`, `src/modules/cards/use-cases/create-user-payment-method.service.ts:18-30`, and on the app side `src/apis/api-client.ts`, `src/apis/auth/*`, `src/store/auth-store/auth-store.ts`, `src/shared/providers/SessionProvider.tsx`, `src/feature/home/components/ClientHome.tsx:50-70`, `ProxyHome.tsx:283-295`, `app/(app)/(tabs)/wallet.tsx:15-40`, `src/feature/wallet/hooks/useStripeOnboarding.ts`, `src/common/utils/format.ts:11-16`, `SPEC.md` §3, §4.1, §7.1, §7.4, §8.3, §8.11, §8.14, §9.

Also inspected the installed packages `@nestjs/throttler@6.5.0` (`dist/throttler.guard.js`), `@nestjs/passport` (`passport.strategy.js`, `auth.guard.js`), `stripe@20.2.0` (`types/AccountsResource.d.ts`, `types/apiVersion.d.ts`).

Empirical checks run (no source edited, no servers started): a Node one-liner for `Prisma.Decimal` → `jsonwebtoken` claim typing; a throwaway Nest app in the scratchpad (`/private/tmp/claude-501/-Users-leandromartins-Documents-proxy-app/62bc3886-5bc1-4f2f-bbad-80d3dc1f8e02/scratchpad/throttle-check.ts`) reproducing the exact `ThrottlerModule.forRoot` config with supertest. Nothing skipped.

## 2. How it works (as the code actually behaves)

**Bootstrap.** `main.ts` creates the app with `rawBody: true`, `enableCors()` with no options (`Access-Control-Allow-Origin: *`), registers `HttpExceptionFilter` globally and listens on `PORT` (Zod default 3333). No `enableShutdownHooks()`, so `PrismaService.onModuleDestroy` never runs on SIGTERM. `AppModule` validates `process.env` with `envSchema.parse` (fails fast at boot on any missing key — including `AWS_*`, so dev cannot start without AWS values), registers `ThrottlerGuard` as `APP_GUARD` with **two named throttlers** (`default` 100/min, `auth` 5/min) and `skipIf: NODE_ENV === 'test'`.

Critical behaviour of `@nestjs/throttler` v6 (verified in `throttler.guard.js:67-99` and reproduced): the guard loops over **every** named throttler for **every** route and applies `routeOrClassLimit || namedThrottler.limit`. The `auth` throttler therefore limits *all* routes to 5 req/min per IP; `@Throttle({ auth: {...} })` on `/auth/session` and `/auth/create` merely restates the same 5. The only `@SkipThrottle()` is on the webhook controller. This contradicts `CLAUDE.md` ("100 req/min default, 5 req/min on /auth/session and /auth/create") and SPEC §3.4. See F-01.

**Env.** `env.ts` requires `DATABASE_URL`, both JWT keys, three Stripe keys, both callback URLs, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SES_FROM_EMAIL`; `AWS_REGION` defaults to `us-east-1`, `NODE_ENV` to `development`. `.env.example`, `.env` and `test/.env.test` contain exactly the schema's key set (no drift). `STRIPE_PUBLIC_KEY` is required but never read anywhere in `src/`. `PrismaService` bypasses `EnvService` and reads `process.env.DATABASE_URL` directly.

**Errors.** `AppException` extends `HttpException` carrying `{ message, info?, errorCode }`. `HttpExceptionFilter` has two identical branches for `AppException` and other `HttpException`s (spreads the Nest response object, so Zod details, Passport and Throttler messages pass through verbatim, in English), and maps anything else to 500 with `errorDictionary.standard` (whose own `statusCode` says 400 and is ignored here). `ZodValidationPipe` throws `BadRequestException({ message: 'Validation failed', errors: fromZodError(error) })` — the app's `extractErrorMessage` shows `message` to the user, so validation failures surface as English "Validation failed".

**JWT.** `AuthModule` registers `JwtModule` globally with RS256 keys decoded from base64 and `signOptions: { algorithm: 'RS256' }` only — **no `expiresIn`**, tokens never expire (verified: signed token has no `exp`). `AuthenticateService`, `RefreshSessionService` and `UpdateProfileService` each build the same 17-claim payload by hand (`sub`, `name`, `email`, `rating`, `userType`, `avatarUrl`, `isVerified`, `phoneNumber`, `documentUrl`, `documentType`, `termsAccepted`, `walletBalance`, `stripeAccountId`, `stripeAccountReady`, `stripeCustomerId`, `totalTasksCreated`, `totalTasksCompleted`). `rating` and `walletBalance` are `Prisma.Decimal` and serialize to **JSON strings** (`"4.5"`, `"75.62"`). `JwtStrategy.validate` re-parses the payload with `sessionPayloadSchema` (`z.coerce.number()` hides the string issue server-side; `phoneNumber: z.string()` is non-nullable), then does one `users.findUnique({ select: { isDeleted } })` per request and rejects deleted users. Any Zod failure inside `validate` propagates through `@nestjs/passport` (`done(err)` → `handleRequest` throws `err`) as a non-HTTP error → 500 `STANDARD_ERROR`. Downstream modules mostly re-read the user from DB (`start-task`, `validate-task`, `cards`) and only `fetch-task-by-id` trusts `user.userType` from the token.

**Create account** (`POST /auth/create`, 200). Zod schema accepts `name`, `email`, `password` (any length), `userType`, optional `phoneNumber`/`avatarUrl`/`documentType`/`documentUrl`, **and** optional `isVerified`, `rating`, `totalTasksCompleted`, `totalTasksCreated`, `walletBalance`; `termsAccepted: z.boolean()` (false accepted). Service: `findByEmail` (exact, case-sensitive) → 409; bcrypt cost 8; Stripe `customers.search` by email (query string interpolation), else `customers.create`; any Stripe error → `errorDictionary.standard` (400); then `users.create({ ...data, stripeCustomerId, password: hash })` — the whole body is spread into Prisma; then re-runs `AuthenticateService` (second `findByEmail` + bcrypt compare) to mint the token. Stripe customer is created **before** the DB insert; a unique-violation race yields a Prisma error → 500 and an orphan customer. There is no document-upload endpoint anywhere in the backend; `documentUrl` is a client-supplied URL; `Users` has no column for the CPF/CNPJ *number* (only `documentType` + `documentUrl`).

**Login** (`POST /auth/session`): 404 `USER_NOT_FOUND` for unknown email vs 401 `USER_INVALID_CREDENTIALS` for wrong password (enumeration). No lockout beyond the throttler.

**Refresh** (`GET /auth/session/refresh`, guarded): re-reads the user and signs a fresh token. It is the only way the app gets new `walletBalance`/`stripeAccountReady`/`rating`; the app calls it only after Stripe onboarding (`useStripeOnboarding.ts:47`). Not listed in `CLAUDE.md` route map nor SPEC §3.4.

**Password reset.** `forgot-password`: unknown email → silent generic message; known email → count codes in last 15 min (≥3 → 429 `PASSWORD_RESET_TOO_MANY_REQUESTS`), `randomInt(100000, 999999)` 6-digit code, bcrypt(8) hash, 15-min expiry, row created **before** sending; SES failure → 500 `PASSWORD_RESET_SEND_FAILED` (row already counts toward the 3). `verify-reset-code`: loads the **latest** `pending` unexpired code only, bcrypt compare, flips to `verified`. `reset-password` (`newPassword` min 6): loads latest `verified` unexpired code, compares, then `$transaction([users.update(password), code.update(used)])`. All three return the same `PASSWORD_RESET_INVALID_CODE` for unknown users/mismatch. Previously issued JWTs stay valid after reset.

**Update profile** (`POST /auth/update-profile`): body requires `name` and `userType`; optional nullable `avatarUrl`, `password`, `phoneNumber`. Service merges with current values using `??` (so `null` keeps the old value and an empty string overwrites), coerces missing avatar/phone to `''`, hashes `password` if truthy (no current-password check, no length check), writes, re-reads, signs a new token. `userType` is freely switchable.

**Merchant (Connect).** `POST /auth/merchant-account`: no `userType` check; splits `name` on the first space (`[firstName, lastName]`), phone `?? ''`; if no `stripeAccountId`, `accounts.create({ email, business_type: 'individual', individual: {...}, controller: { stripe_dashboard: { type: 'express' }, fees: { payer: 'application' }, losses: { payments: 'application' } } })` — no `country`, no `capabilities`, no `default_currency`; stores id; then `accountLinks.create({ return_url: url, refresh_url: url, type: 'account_onboarding', collection_options: { fields: 'currently_due' } })` with `DEV_CALLBACK_URL` when `NODE_ENV === 'development'` else `PROD_CALLBACK_URL` (`.env`: localhost:3000 in dev, `https://proxy.com.br/...` in prod). Response `{ accountLinkUrl }` only (`stripeAccountId` in the type is never populated). `stripeAccountReady` is flipped exclusively by the `account.updated` webhook (`charges_enabled && payouts_enabled`). `GET /auth/merchant-dashboard` → `accounts.createLoginLink` (valid for Express).

**Transaction history** (`GET /auth/transaction-history`): two unpaginated `findMany`s — all tasks owned by the user (any status, newest first) and tasks where the user is executor **and** `status = 'completed'`; for the latter `netAmount` is recomputed from a hard-coded `price*0.0399+0.39` + `price*0.2` formula rather than read from `Tasks.proxyEarnings`. `offeredPrice` is a Decimal → JSON string; the app type says `number` (`formatBRL` tolerates strings).

**Delete account** (`DELETE /auth/account`, 204): 404 if missing/already deleted; 409 if `fetchActiveTasksForUser` returns anything (owner: `available|accepted|on_the_way|in_progress|verification_required`; executor: same minus `available`); then anonymizes `name`, `email` (`deleted-<id>@deleted.local`), `phoneNumber`, `avatarUrl`, `documentUrl`, `documentType` and sets `isDeleted`. Untouched: `password`, `stripeCustomerId`, `stripeAccountId`, `walletBalance`, `Cards` rows (not soft-deleted, PaymentMethods not detached), Stripe Customer and Connect account.

**Notification.** `NotificationService` builds SES + SNS clients from env credentials at construction; `sendResetCodeByEmail` sends HTML with `${userName}` and `${code}` interpolated unescaped; `sendSms`/`sendResetCodeBySms` exist but are unused. Nothing degrades gracefully without AWS — env validation refuses to boot without the keys, and with dummy keys every forgot-password call is a 500 that still consumes one of the three attempts.

**Prisma.** `PrismaService extends PrismaClient` with `PrismaPg` adapter; the constructor builds a throwaway `new PrismaClient({ adapter })` on line 9 before `super(...)`. `PrismaService` is listed in `providers` of `AppModule` and of all six feature modules → seven separate client instances/pools per process.

**Code vs docs disagreements found:** throttling (CLAUDE.md §Rate limiting, SPEC §3.4); `GET /auth/session/refresh` missing from both route maps; SPEC §4.1 declares `rating`/`walletBalance: number` (they are strings in the token) and omits `stripeAccountReady`; SPEC §8.3 "Senha mínimo 8" vs backend no minimum (create) / 6 (reset); SPEC §8.3 document photo "faz upload separado" — no such endpoint; SPEC §8.14 "trocar userType não está no MVP" vs backend requires and writes `userType` on every profile update; SPEC §3.3 `USER_HAS_ACTIVE_TASKS` message text differs from `error-dictionary.ts:59-60`; `multer-validation.pipe.ts` accepts HEIC/HEIF while `FILE_FORMAT_NOT_SUPPORTED` text says "JPG, PNG ou WEBP"; CLAUDE.md says `PasswordResetCodes` are "rate-limited (3 per 15 min)" — true, but the window is per *user*, with no per-IP or per-code attempt limit.

## 3. Findings

### [P0] The `auth` throttler (5 req/min per IP) applies to every route in the API
File: `src/app.module.ts:28-34`, `src/modules/auth/controllers/authenticate.controller.ts:21`, `src/modules/auth/controllers/create-account.controller.ts:33`
Evidence:
```ts
ThrottlerModule.forRoot({
  throttlers: [
    { name: 'default', ttl: 60_000, limit: 100 },
    { name: 'auth', ttl: 60_000, limit: 5 },
  ],
  skipIf: () => process.env.NODE_ENV === 'test',
}),
```
`node_modules/@nestjs/throttler/dist/throttler.guard.js:67,82`: `for (const namedThrottler of this.throttlers) { ... const limit = await this.resolveValue(context, routeOrClassLimit || namedThrottler.limit);`. Reproduced with the identical config on a controller with no `@Throttle`: 7 calls → `200,200,200,200,200,429,429`, every response carrying `x-ratelimit-limit-auth: 5`. The only `@SkipThrottle()` in `src/` is on the Stripe webhook controller.
Why it matters: outside `NODE_ENV=test`, a phone that makes more than five requests a minute to *any* endpoint (home screen = tasks + active tasks + cards + history; polling after `requires_action`) gets `429 "ThrottlerException: Too Many Requests"` (English) on the sixth. This is a main-path outage for every user and makes the documented "100/min default" false.
Suggested fix: keep a single throttler `{ ttl: 60_000, limit: 100 }` (no name) and put `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on the two auth controllers; or keep both names but add `@SkipThrottle({ auth: true })` at the class level of every non-auth controller. Add an e2e that runs with `skipIf` disabled and asserts the 6th `GET /tasks/active` is 200.
Confidence: high

### [P0] `rating` and `walletBalance` JWT claims are strings; Client Home crashes for any rated user
File: `src/modules/auth/use-cases/authenticate.service.ts:44,52` (same in `refresh-session.service.ts:26,34`, `update-profile.service.ts:54,62`); app: `src/feature/home/components/ClientHome.tsx:63`
Evidence:
```ts
rating: user.rating,          // Prisma.Decimal
walletBalance: user.walletBalance,
```
Verified: `jwt.sign({ rating: new Prisma.Decimal('4.5') })` → decoded `{"rating":"4.5"}` (`typeof === 'string'`). App: `session.rating > 0 ? session.rating.toFixed(1).replace('.', ',') : '—'` — `"4.5" > 0` is `true`, then `"4.5".toFixed` → `TypeError: ... .toFixed is not a function` (reproduced). `SPEC.md §4.1` and `src/apis/auth/auth-api-types.ts` both declare `rating: number`, `walletBalance: number`.
Why it matters: as soon as a client receives one rating (`RateProxyService` writes `Users.rating`), the Client Home render throws → red screen on the main tab after login. `walletBalance` only survives because `formatBRL` coerces strings. Server-side the `z.coerce.number()` in `jwt.strategy.ts:22-25` masks the bug so no backend test can catch it.
Suggested fix: in the three signers use `rating: user.rating.toNumber()`, `walletBalance: user.walletBalance.toNumber()` (or `Number(...)`); extract one `buildSessionPayload(user)` helper so the three copies cannot drift; app-side guard `Number(session.rating)` defensively.
Confidence: high

### [P1] Tokens never expire and are never invalidated (password reset, password change, logout)
File: `src/modules/auth/auth.module.ts:48-52`, `src/modules/auth/utils/jwt.strategy.ts:49-58`, `src/modules/auth/use-cases/reset-password.service.ts:46-50`
Evidence:
```ts
return {
  signOptions: { algorithm: 'RS256' },
  privateKey: Buffer.from(privateKey, 'base64'),
  publicKey: Buffer.from(publicKey, 'base64'),
}
```
`validate()` only checks `isDeleted`. Verified: a signed token has no `exp` claim.
Why it matters: a token copied from a lost phone, a log, or a proxy works forever; resetting the password via the 3-step flow does **not** lock the attacker out; "Sair" in the app only deletes the local copy. For an app that moves money (start-task charges the client's saved card) this is a real account-takeover persistence issue.
Suggested fix: set `signOptions: { algorithm: 'RS256', expiresIn: '7d' }` (or shorter + refresh); add `Users.passwordChangedAt` (or `tokenVersion`) and reject tokens with `iat < passwordChangedAt` in `JwtStrategy.validate`; bump it in `reset-password` and `update-profile` when a password is set.
Confidence: high

### [P1] Mass assignment on sign-up: client can set `isVerified`, `rating`, `walletBalance`, task counters; `termsAccepted: false` accepted
File: `src/modules/auth/controllers/create-account.controller.ts:17-22`, `src/modules/auth/use-cases/create-account.service.ts:52-57`
Evidence:
```ts
isVerified: z.boolean().optional(),
rating: z.number().min(0).max(5).optional(),
termsAccepted: z.boolean(),
totalTasksCompleted: z.number().optional(),
totalTasksCreated: z.number().optional(),
walletBalance: z.number().optional(),
...
await this.authRepository.create({ ...data, name, stripeCustomerId, password: hashedPassword })
```
Why it matters: anyone can register as a "Verificado" 5-star proxy with 999 completed tasks (the app renders `isVerified`/`rating` badges from these fields, `CounterpartCard.tsx:71`, `ClientHome.tsx:63`), and can seed `walletBalance` — the internal ledger that `payout.failed`/dispute handlers debit. `termsAccepted` is legally required to be true but `false` passes validation.
Suggested fix: strip the server-owned fields from the schema (`z.object({...}).strict()` with only `name,email,password,userType,phoneNumber,documentType,documentUrl,termsAccepted`), `termsAccepted: z.literal(true)`, and build the Prisma `data` object explicitly instead of spreading the body.
Confidence: high

### [P1] No password policy on sign-up / profile; reset uses min 6, SPEC says min 8
File: `src/modules/auth/controllers/create-account.controller.ts:11`, `update-profile.controller.ts:15`, `reset-password.controller.ts:10`
Evidence:
```ts
password: z.string(),                       // create
password: z.string().optional().nullable(), // update-profile
newPassword: z.string().min(6),             // reset
```
Why it matters: `"1"` is an accepted password at sign-up and via profile update; combined with eternal tokens and a 404/401 login oracle (below) this is weak. SPEC §8.3 promises "Mínimo 8 caracteres" and the app validates 8 client-side only.
Suggested fix: one shared `passwordSchema = z.string().min(8).max(72)` used by the three controllers (bcrypt truncates at 72 bytes).
Confidence: high

### [P1] `update-profile` changes password without the current password and lets any user flip `userType`
File: `src/modules/auth/controllers/update-profile.controller.ts:11-17`, `src/modules/auth/use-cases/update-profile.service.ts:31-40`
Evidence:
```ts
const updateProfileBodySchema = z.object({
  name: z.string(),
  userType: z.enum(['CLIENT', 'PROXY']),
  ...
  password: z.string().optional().nullable(),
```
```ts
userType: rest.userType ?? userDetails.userType,
...
if (newPassword) { payload.password = await hash(newPassword, 8) }
```
Why it matters: a stolen (non-expiring) token can set a new password silently; `name: ''` is accepted (`'' ?? old` keeps `''`). SPEC §8.14 says changing `userType` is out of MVP, yet the body *requires* it, so a CLIENT with an in-flight task can become PROXY (and vice-versa) mid-lifecycle; `fetch-task-by-id` then trusts the stale `userType` from the old token while the DB says otherwise.
Suggested fix: require `currentPassword` when `password` is present and `compare()` it; drop `userType` from the schema (or reject changes when `userDetails.userType !== body.userType`); `name: z.string().trim().min(2)`.
Confidence: high

### [P1] A user created without `phoneNumber` receives a token that 500s on every protected route
File: `src/modules/auth/controllers/create-account.controller.ts:13`, `src/modules/auth/use-cases/authenticate.service.ts:48`, `src/modules/auth/utils/jwt.strategy.ts:15,50`
Evidence:
```ts
phoneNumber: z.string().optional(),   // controller → null in DB
phoneNumber: user.phoneNumber,        // authenticate → null in token
phoneNumber: z.string(),              // strategy → z.string() rejects null (verified)
const session = sessionPayloadSchema.parse(payload)
```
`@nestjs/passport/dist/passport/passport.strategy.js:21-22` → `done(err, null)`; `auth.guard.js:58-60` → `throw err` (a ZodError, not an HttpException) → `HttpExceptionFilter` → 500 `STANDARD_ERROR`.
Why it matters: sign-up succeeds and returns a token that is unusable; every call afterwards is a 500 and the user is stuck (401 handler never fires). The mobile app currently always sends `phoneNumber` (`sign-up.tsx:86`, even `''`), which is why it has not been noticed; the e2e factory hides it too (`test/factories/user.factory.ts:75` `user.phoneNumber ?? ''`).
Suggested fix: make `phoneNumber: z.string().nullable()` in `sessionPayloadSchema` (matches SPEC §4.1 reality) **or** make it required on `/auth/create`; wrap `sessionPayloadSchema.parse` in `safeParse` and throw `UnauthorizedException` on failure.
Confidence: high

### [P1] Account enumeration via login (404 vs 401) and via forgot-password (429/500 only for existing emails)
File: `src/modules/auth/use-cases/authenticate.service.ts:30-38`, `src/modules/auth/use-cases/forgot-password.service.ts:27-39,62-64`
Evidence:
```ts
if (!user) { throw new AppException(errorDictionary.user.notFound) }        // 404
const passwordMatches = await compare(password, user.password)
if (!passwordMatches) { throw new AppException(errorDictionary.user.invalidCredentials) } // 401
```
```ts
if (recentCodes >= 3) { throw new AppException(errorDictionary.passwordReset.tooManyRequests) }
```
Why it matters: `/auth/session` tells an attacker exactly which emails have accounts (the e2e suite even asserts the 404). `/auth/forgot-password` is "silent" only for the first three calls: a fourth call returns 429 for real accounts and 200 for fake ones; a SES outage returns 500 vs 200 the same way. Also no bcrypt compare on the unknown-user path → timing difference.
Suggested fix: return `USER_INVALID_CREDENTIALS` (401) for both branches and compare against a dummy hash when the user is missing; in forgot-password return the generic 200 message on the rate-limit branch (log it) and on send failure.
Confidence: high

### [P1] `walletBalance`/`stripeAccountReady`/`rating` in the JWT are stale by design and the app treats them as the source of truth
File: `src/modules/auth/use-cases/refresh-session.service.ts:17-43` (only refresh path); app `ProxyHome.tsx:290`, `wallet.tsx:21`, `useStripeOnboarding.ts:47`; `SPEC.md §3.1, §8.11`
Evidence:
```ts
// app/(app)/(tabs)/wallet.tsx
const balance = session?.walletBalance ?? 0
```
`validate-task.service.ts:89` credits the proxy's `walletBalance` in the DB when the *client* validates; the proxy's token is untouched and the app calls `GET /auth/session/refresh` only inside the Stripe onboarding hop (`useRefreshSessionMutation` has a single caller).
Why it matters: a proxy's "Saldo disponível" shows the balance from their last login/onboarding forever; disputes and `payout.failed` debits are equally invisible. `stripeAccountReady` flipped by the webhook after the user closed the browser (the hook refreshes immediately and warns "confirmation in flight") is never re-checked. SPEC §8.11 itself says "atualizar localmente após validação de tarefas ou após refresh do token", which the proxy side cannot do.
Suggested fix: backend — add `GET /auth/me` returning the fresh `SessionPayload` subset (or have the app call `/auth/session/refresh` on app foreground and after any task mutation); better, stop putting mutable money/rating fields in the token at all and serve them from `/auth/me` / `/auth/transaction-history`.
Confidence: high (behaviour) / product decision on the fix

### [P1] Transaction history recomputes earnings with a hard-coded formula and hides `payout_failed` tasks
File: `src/modules/auth/use-cases/fetch-transaction-history.service.ts:36-46`, `src/modules/auth/repository/auth.repository.ts:110-129`
Evidence:
```ts
// offeredPrice - stripe fee (3.99% + R$ 0.39) - platform fee (20%)
const price = Number(task.offeredPrice)
const stripeFee = price * 0.0399 + 0.39
...
where: { userTaskMappings: { some: { executorId: userId } }, status: 'completed' },
```
Why it matters: `Tasks.proxyEarnings`/`platformFee` are persisted at validate time (`validate-task.service.ts:79-80`); if fees ever change, history silently disagrees with what was transferred. A task whose transfer was reversed (`payout_failed`, debiting the proxy's balance) disappears from the proxy's history entirely, so the user sees a lower balance with no explaining entry (SPEC §2.2 requires showing "Falha no repasse"). Canceled tasks a proxy worked on are also invisible. No pagination and `description` is shipped for every task.
Suggested fix: select `proxyEarnings, platformFee, transferId` and return `netAmount = Number(task.proxyEarnings ?? computed)`; include `status in ('completed','payout_failed')` for the executor list; add `?page=` like `/tasks/fetch`; convert Decimals to numbers in the response.
Confidence: high

### [P2] Delete-account anonymisation is partial: cards, Stripe objects, password and balances remain
File: `src/modules/auth/repository/auth.repository.ts:138-151`, `src/modules/auth/use-cases/delete-account.service.ts:15-28`
Evidence:
```ts
data: {
  isDeleted: true,
  name: 'Conta removida',
  email: `deleted-${userId}@deleted.local`,
  phoneNumber: null, avatarUrl: null, documentUrl: null, documentType: null,
},
```
Why it matters: `Cards` rows (brand/last4/`stripeCardId`) stay `isDeleted: false`, PaymentMethods stay attached to a live Stripe Customer, the Connect account keeps its KYC data, `stripeCustomerId`/`stripeAccountId`/`password`/`walletBalance` stay on the row. Re-registering with the same email creates a second Customer for the same person (the old one still exists under the old email in Stripe — `customers.search` will find it and reuse it, re-linking the *deleted* person's saved cards to the new account). LGPD-wise, PII still lives in Stripe.
Suggested fix: in the same transaction soft-delete `Cards` and detach their PaymentMethods, `customers.del(stripeCustomerId)` (or at least clear email/name on the Customer), null `stripeCustomerId`, and `accounts.reject`/leave Connect per Stripe guidance; clear `password` to an unusable value.
Confidence: high

### [P2] e2e test asserts the opposite of the repository: deletion with an `available` owned task
File: `test/auth/delete-account.e2e-spec.ts:103-114` vs `src/modules/tasks/repository/tasks.repository.ts:194-203`
Evidence:
```ts
await createTask(ctx.prisma, user.id, { status: 'available' })
...
expect(response.status).toBe(204)
```
```ts
{ owner: userId, status: { in: ['available', 'accepted', 'on_the_way', 'in_progress', 'verification_required'] } },
```
Why it matters: an owner with an `available` task gets 409 from the service, so this test fails whenever the e2e suite is actually run (it could not run tonight — Docker down). Either the product rule ("open listings block deletion") or the test is wrong; today nobody knows which.
Suggested fix: decide the rule; if `available` tasks should not block, remove `'available'` from the owner branch (or auto-cancel them on delete); otherwise fix the test to expect 409.
Confidence: high

### [P2] Sign-up ordering: Stripe Customer created before the DB insert; duplicate-email race → 500 + orphan customer
File: `src/modules/auth/use-cases/create-account.service.ts:28-57`, `src/stripe/stripe.service.ts:33-37`
Evidence:
```ts
const userExists = await this.authRepository.findByEmail(email)
...
const stripeCustomer = await this.stripeService.searchCustomer(email)   // query: `email:'${email}'`
...
await this.authRepository.create({ ...data, stripeCustomerId, ... })
```
Why it matters: two concurrent sign-ups (double-tap) pass `findByEmail`, both hit Stripe, the second `users.create` throws Prisma `P2002`, which is not an `HttpException` → 500 `STANDARD_ERROR` instead of 409, leaving an orphan Customer. Stripe Search is eventually consistent (up to ~1 min), so the "reuse existing customer" branch cannot be relied on to dedupe. The search query interpolates the raw email into Stripe's query language.
Suggested fix: catch `Prisma.PrismaClientKnownRequestError` code `P2002` → `emailExists`; create the Customer **after** the row with `stripeCustomerId: null` and update it (or use an idempotency key = email); lowercase/trim the email before both lookups.
Confidence: high

### [P2] Merchant account creation: no PROXY check, naive name split, no explicit `country`/`capabilities`
File: `src/modules/auth/use-cases/create-merchant-account.service.ts:32-44`, `src/stripe/stripe.service.ts:114-139`
Evidence:
```ts
const phoneNumber = userDetails.phoneNumber ?? ''
const [firstName, lastName] = userDetails.name.split(' ')
```
```ts
return await this.stripe.accounts.create({
  email, business_type: 'individual',
  individual: { first_name: firstName, last_name: lastName, phone: phoneNumber },
  controller: { stripe_dashboard: { type: 'express' }, fees: { payer: 'application' }, losses: { payments: 'application' } },
})
```
Why it matters: a CLIENT can open a Connect account (`errorDictionary.user.userNotProxy` exists but is unused here). "Maria da Silva" → `last_name: 'da'`; "Maria" → `last_name: undefined`; `phone: ''` is sent as an empty string. Country and `transfers` capability rely on the platform's dashboard defaults (SDK doc: `capabilities` is only *required* when dashboard type is `none`, so creation will not fail, but readiness depends on dashboard configuration that is not in the repo). `return_url === refresh_url`, so an expired link and a completed onboarding land on the same URL and the app cannot tell them apart.
Suggested fix: `if (userDetails.userType !== 'PROXY') throw userNotProxy`; `firstName = parts[0]; lastName = parts.slice(1).join(' ') || undefined`; omit `phone` when empty; pass `country: 'BR'`, `default_currency: 'brl'`, `capabilities: { transfers: { requested: true } }` explicitly; use distinct `refresh_url` (`...?refresh=1`).
Confidence: high (checks) / low (whether missing capabilities actually blocks readiness in this Stripe account)

### [P2] Seven PrismaClient instances per process (+ one throwaway)
File: `src/prisma/prisma.service.ts:7-18`, `src/app.module.ts:19`, `src/modules/auth/auth.module.ts:61` (and tasks/cards/payments/ratings/stripe-webhook modules)
Evidence:
```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
new PrismaClient({ adapter })   // result discarded
super({ adapter, ... })
```
Why it matters: each module that lists `PrismaService` in `providers` gets its own instance and connection pool (default pool ≈ 2×CPU+1 each). On a small managed Postgres (often 20–25 connections) this can exhaust connections under light load and makes `$transaction` + webhook writes run on different pools. Line 9 constructs a client that is never used.
Suggested fix: make `PrismaModule` `@Global()` exporting one `PrismaService`; remove `PrismaService` from every feature module's `providers`; delete line 9.
Confidence: high

### [P2] Reset-code verification has no per-code attempt limit (6 digits, 15 min)
File: `src/modules/auth/use-cases/verify-reset-code.service.ts:29-43`, `src/modules/auth/repository/auth.repository.ts:166-177`
Evidence:
```ts
const resetCode = await this.authRepository.findPendingResetCode(user.id)
...
const codeMatches = await compare(code, resetCode.code)
if (!codeMatches) { throw new AppException(errorDictionary.passwordReset.invalidOrExpiredCode) }
```
Why it matters: 900 000 possibilities, only the IP throttler stands in the way (currently 5/min because of F-01; 100/min once fixed → 1 500 guesses per code from one IP, unlimited from many). Nothing marks a code as burnt after N wrong guesses. Minor: `randomInt(100000, 999999)` is upper-exclusive, so `999999` is never issued.
Suggested fix: add `attempts Int @default(0)` to `PasswordResetCodes`, increment on mismatch and treat `attempts >= 5` as expired; `randomInt(0, 1_000_000).toString().padStart(6, '0')`.
Confidence: high

### [P2] English framework messages reach the user (`Validation failed`, `ThrottlerException: Too Many Requests`, Passport `Unauthorized`)
File: `src/pipes/zod-validation.pipe.ts:13-17`, `src/exception/http.exception.ts:38-45`
Evidence:
```ts
throw new BadRequestException({ message: 'Validation failed', statusCode: 400, errors: fromZodError(error) })
```
Why it matters: the app's `extractErrorMessage` displays `response.data.message` verbatim (SPEC §3.3 "Usar direto no toast"), so any malformed input or throttle hit shows English text in a pt-BR app; the Zod `errors` object also leaks field paths/shape.
Suggested fix: in the pipe throw `new AppException({ message: 'Dados inválidos.', errorCode: 'VALIDATION_FAILED', info: fromZodError(error).message })`; in the filter map `ThrottlerException` → Portuguese message + `errorCode: 'TOO_MANY_REQUESTS'` and `UnauthorizedException` → `'Sessão expirada.'`.
Confidence: high

### [P2] Email is not normalised (case/whitespace)
File: `src/modules/auth/controllers/create-account.controller.ts:10`, `authenticate.controller.ts:9`, `forgot-password.controller.ts:8`, `src/modules/auth/repository/auth.repository.ts:33-37`
Evidence:
```ts
email: z.email(),
...
return this.prisma.users.findUnique({ where: { email } })
```
Why it matters: `Ana@x.com` and `ana@x.com` are different accounts (`@unique` is case-sensitive in Postgres); autocapitalised keyboards on phones make "user not found" at login and silent no-ops on forgot-password likely; Stripe `customers.search` is also exact-match.
Suggested fix: `email: z.email().trim().toLowerCase()` in all four auth schemas (Zod 4 supports `.toLowerCase()`), plus a one-off migration lowering existing rows.
Confidence: high

### [P2] `update-profile` coerces null avatar/phone to `''` and cannot clear the avatar
File: `src/modules/auth/use-cases/update-profile.service.ts:31-36`, `src/modules/auth/types/index.d.ts:44-50`
Evidence:
```ts
avatarUrl: rest.avatarUrl ?? userDetails.avatarUrl ?? '',
phoneNumber: rest.phoneNumber ?? userDetails.phoneNumber ?? '',
```
Why it matters: the DB columns are nullable (`String?`) but the repository payload type forces `string`, so the first profile save turns `null` into `''`; the token then carries `avatarUrl: ''`, which the app will try to render as an image URI. Sending `avatarUrl: null` (the schema allows it) keeps the old value instead of clearing it.
Suggested fix: type the payload as `avatarUrl?: string | null`, pass `rest.avatarUrl` through when the key is present (`'avatarUrl' in rest`), and never substitute `''`.
Confidence: high

### [P2] forgot-password persists the code before sending; SES failure burns one of three attempts and is a hard 500 in dev
File: `src/modules/auth/use-cases/forgot-password.service.ts:46-64`, `src/notification/notification.service.ts:10-23`
Evidence:
```ts
await this.authRepository.createPasswordResetCode(user.id, hashedCode, expiresAt)
try { await this.notificationService.sendResetCodeByEmail(...) }
catch { throw new AppException(errorDictionary.passwordReset.sendFailed) }
```
Why it matters: with no/invalid AWS credentials (typical local dev; env validation forces placeholder values to exist) every request is a 500 and after three the user is locked for 15 minutes with codes that were never delivered. SES sandbox mode additionally only delivers to verified addresses. No dev fallback (e.g. log the code) exists.
Suggested fix: send first, persist on success (or delete the row on failure); in `development` log the code and skip SES when `AWS_ACCESS_KEY_ID` is a placeholder.
Confidence: high

### [P2] Throttler keyed on `req.ip` with no `trust proxy`
File: `src/main.ts:8-17`; `node_modules/@nestjs/throttler/dist/throttler.guard.js:141-143` (`return req.ip`)
Evidence:
```ts
const app = await NestFactory.create(AppModule, { rawBody: true })
app.enableCors()
```
Why it matters: behind any reverse proxy/load balancer (Render, Fly, Railway, nginx) Express reports the proxy's IP for every request, so all users share one 5-req/min login bucket and one 100-req/min bucket. Enabling `trust proxy` blindly, on the other hand, lets clients spoof `X-Forwarded-For`.
Suggested fix: `app.getHttpAdapter().getInstance().set('trust proxy', 1)` when deployed behind exactly one proxy; verify by logging `req.ip` in staging.
Confidence: medium (depends on the deployment topology, which is not in the repo)

### [P3] bcrypt cost factor 8 for passwords and reset codes
File: `src/modules/auth/use-cases/create-account.service.ts:34`, `reset-password.service.ts:42`, `update-profile.service.ts:39`, `forgot-password.service.ts:43`
Evidence: `const hashedPassword = await hash(password, 8)`
Why it matters: cost 8 is ~4× cheaper to brute-force than the commonly recommended 10–12; cheap to raise now, painful later (needs rehash-on-login).
Suggested fix: cost 10–12 for passwords (codes can stay low since they expire in 15 min).
Confidence: high

### [P3] `HttpExceptionFilter` duplicates branches and leaks framework responses; `errorDictionary.standard.statusCode` mismatch
File: `src/exception/http.exception.ts:27-46,53-59`, `src/exception/error-dictionary.ts:6-11`
Evidence: the `AppException` branch and the generic `HttpException` branch are byte-identical; the 500 path reuses `errorDictionary.standard` whose `statusCode: HttpStatus.BAD_REQUEST`, and `create-account` throws the same dictionary entry for Stripe failures (so a Stripe outage is reported as a 400 client error).
Suggested fix: collapse to one branch; add `errorDictionary.internal` with 500 and a separate `stripeUnavailable` (502/503) for upstream failures.
Confidence: high

### [P3] Docs drift (CLAUDE.md / SPEC vs code)
File: `proxy-api/CLAUDE.md:12,110`, `proxy-app/SPEC.md §3.3, §3.4, §4.1, §8.3, §8.14`, `src/pipes/multer-validation.pipe.ts:32-41`, `src/exception/error-dictionary.ts:217-223`
Evidence: route maps omit `GET /auth/session/refresh`; "5 req/min on /auth/session and /auth/create" is false (F-01); SPEC §4.1 types `rating`/`walletBalance` as `number` and omits `stripeAccountReady`; SPEC §3.3 `USER_HAS_ACTIVE_TASKS` text ≠ dictionary; `FILE_FORMAT_NOT_SUPPORTED` says "JPG, PNG ou WEBP" while HEIC/HEIF are accepted.
Suggested fix: update both docs after fixing F-01/F-02; align the multer message with the allow-list.
Confidence: high

### [P3] Unused / dead items: `STRIPE_PUBLIC_KEY` required but unused; `sendSms` unused; `updateUserPassword` unused; return type of `AuthRepository.create`
File: `src/env/env.ts:12`, `src/notification/notification.service.ts:38-45,69-72`, `src/modules/auth/repository/auth.repository.ts:236-244`, `src/modules/auth/dtos/auth-repository.dto.ts:8`
Evidence: `grep -rn STRIPE_PUBLIC_KEY src` → only `env.ts`; `create: (data: UsersCreateInput) => Promise<UsersCreateInput>` (returns the *input* type, not `Users`).
Suggested fix: drop or mark optional; delete dead methods; type `create` as `Promise<Users>`.
Confidence: high

### [P3] Reset-code email interpolates the user's name into HTML unescaped; no `enableShutdownHooks`; `console.log` in bootstrap
File: `src/notification/notification.service.ts:56`, `src/main.ts:16-17`
Evidence: `<p>Olá, <strong>${userName}</strong>!</p>`; `console.log('🚀 ~ Starting server on port ', port)`; no `app.enableShutdownHooks()`.
Why it matters: a name like `<img src=x onerror=...>` is self-inflicted but still lands in a transactional email from the platform's SES identity; without shutdown hooks Prisma never disconnects cleanly on SIGTERM.
Suggested fix: escape `userName`; `app.enableShutdownHooks()`; use Nest `Logger`.
Confidence: high

### [P3] `PrismaService` logs every query in development
File: `src/prisma/prisma.service.ts:13-16`
Evidence: `log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['warn', 'error']`
Why it matters: query logs include `users` writes (hashed passwords, reset-code hashes, emails) in the dev console; noise rather than a leak, since hashes are not secrets, but worth knowing before sharing logs.
Suggested fix: keep `['error']` by default and opt in with `PRISMA_LOG=query`.
Confidence: medium (whether params are printed depends on the Prisma 7 stdout logger; not verified)

## 4. Gaps vs MVP

- **SPEC §8.3 — document photo upload / document number.** No upload endpoint exists in the backend (the only file write is `finish-task` → `src/tmp` on local disk). `documentUrl` is any client-supplied URL and `Users` has no column for the CPF/CNPJ *number* the sign-up form collects (`sign-up.tsx` masks and validates it, backend drops it). Proxy verification (`isVerified`) therefore has no data to be based on — and is client-settable (F-04).
- **SPEC §8.3 — password ≥ 8** is client-side only (F-05).
- **SPEC §3.1 / §4.1 — "Claims úteis… usar para decidir UI sem chamar API"** is unsafe for `walletBalance`, `rating`, `stripeAccountReady`, `totalTasks*` (F-02, F-09). There is no `GET /auth/me`.
- **SPEC §8.11 — Wallet**: no endpoint exposes Stripe balance/payout state; "Saldo disponível" is the internal `walletBalance` mirror from the token, not what Stripe will pay out. `payout_failed` entries are missing from history (F-10).
- **SPEC §8.13 — History "Concluídas / Canceladas"** cannot be built for proxies from `/auth/transaction-history` (only `completed` executor tasks are returned).
- **SPEC §8.14 — Profile**: backend endpoints exist (`update-profile`, `DELETE /auth/account`) but the app has no caller for either (`grep` over `proxy-app/src` and `app/` finds none) — app-slice gap, noted for completeness. Also `userType` switching is explicitly *out* of MVP yet mandatory in the backend body (F-06).
- **SPEC §3.4 rate-limit table** (5/min only on two routes) is not what ships (F-01).
- **Logout / token revocation** is not implemented server-side at all (F-03).
- **SPEC §7.4 — reset flow** is implemented as specified; only hardening is missing (F-16).

## 5. Test coverage

Unit (`src/modules/auth/use-cases/*.spec.ts`, 15 suites, all passing per the brief):
- Well covered: happy path + each dictionary error for authenticate, create-account (incl. Stripe reuse/create/fail, hashing), merchant account (create/reuse/no-id/throw/link-fail, env-based callback), dashboard link, delete-account (not found / already deleted / active tasks / success), transaction history (netAmount math, rounding), forgot-password (silent, 429, 15-min expiry, hashed code, send failure persists code), refresh-session, reset-password (verified-only, atomic call), update-profile (merge, hash, no-password, disappearing user), verify-reset-code, counters, wallet balance (incl. negative and null fallback).
- **Not covered anywhere**: `JwtStrategy.validate` (null `phoneNumber` → 500, deleted-user rejection is only e2e), `ZodValidationPipe`, `HttpExceptionFilter`, `NotificationService`, `StripeService` params (`country`, `capabilities`, link URLs), controllers' Zod schemas (mass-assignment fields, `termsAccepted:false`, empty password/name), throttler configuration, claim *types* in the signed token (every unit test mocks `JwtService.sign`; the e2e only checks `split('.').length === 3`), email normalisation, concurrent sign-up race.
- **Tests that assert the wrong thing / encode a bug**: `test/auth/delete-account.e2e-spec.ts:103-114` expects 204 with an `available` owned task (repository returns 409) — would fail when run; `test/auth/authenticate.e2e-spec.ts:32-39` asserts the 404 `USER_NOT_FOUND` enumeration oracle as desired behaviour; `update-profile.service.spec.ts:64-72` asserts `avatarUrl: ''` is written for a user with `avatarUrl: null` (locks in F-19); `forgot-password.service.spec.ts:100-115` asserts the code is persisted even when sending fails (locks in F-20); `create-account.service.spec.ts` only passes the five legitimate fields so mass assignment is never exercised.
- **Factory drift**: `test/factories/user.factory.ts:64-81` omits `stripeAccountReady` (the one `tsc` error from the brief) and substitutes `phoneNumber ?? ''`, so e2e tokens never resemble a real null-phone token.
- E2E (`test/auth/*.e2e-spec.ts`, 10 files) cover 401s, validation 4xx, domain errors and DB side effects for every auth route **except** `GET /auth/session/refresh` (no e2e, no 401 test). The suite could not be executed tonight (Docker down).

## 6. Questions for the owner

1. Token lifetime: what session length do you want (7 d? 30 d?) and should "Sair" / password reset revoke other devices? (Drives F-03's design: `expiresIn` only vs `passwordChangedAt`/`tokenVersion`.)
2. Should an owner with *open* (`available`) listings be allowed to delete their account (auto-cancel them) or be blocked? The code blocks, the e2e expects success.
3. Is switching `userType` after sign-up ever a feature, or should the backend freeze it (SPEC §8.14 says it is not MVP)?
4. On account deletion, do you want the Stripe Customer deleted (cards gone for good) and the Connect account left alone, or both left for accounting/dispute windows? LGPD retention policy?
5. Where should document photos (and the CPF/CNPJ number) live — S3/R2 with a presigned-upload endpoint, or is proxy verification manual/out of scope for 1.0? Today nothing stores the number and `isVerified` is self-service.
6. Should `walletBalance`/`rating`/`stripeAccountReady` leave the JWT in favour of `GET /auth/me` (recommended), or do you want to keep the claims and have the app refresh on foreground?
7. Which hosting sits in front of the API in production (affects `trust proxy` and whether per-IP throttling is meaningful at all)?
