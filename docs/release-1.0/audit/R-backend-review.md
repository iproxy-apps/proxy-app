# R-BE — Second-pass review: backend (A1, A2, A3, A4 + X1 backend claims)

Reviewer: R-BE · Date: 2026-11-08 · Repo verified: `/Users/leandromartins/Documents/proxy-api` (HEAD `708e468`, working tree: only `CLAUDE.md` modified). All paths below are relative to that repo unless prefixed `app:` (= `/Users/leandromartins/Documents/proxy-app`) or `node_modules/`.

Method: every `### [Pn]` in A1–A4 was re-opened against the cited file and line; X1 was skimmed for backend-side claims only. Evidence I produced myself (allowed by the brief): `npx tsc --noEmit` (1 error, as stated), `npx tsc --noEmit --skipLibCheck false` (10 × `Cannot find name 'Decimal'` in `src/modules/tasks/types/index.d.ts`), a 15-line Node script against the generated Prisma client (`scratchpad/decimal-check.js`), and reads of the installed `@nestjs/throttler@6.5.0`, `@nestjs/passport`, `@nestjs/platform-express` and `stripe@20.2.0` sources/types. No e2e, Docker, Expo or dev server was run; facts from the brief (unit 37/153 green, e2e 21/22 with `delete-account` failing 204→409) are taken as given.

## Evidence settled up front (the six questions in my prompt)

1. **Throttler.** CONFIRMED, with one nuance the first pass missed. `src/app.module.ts:28-34` registers two named throttlers (`default` 100/min, `auth` 5/min). `node_modules/@nestjs/throttler/dist/throttler.guard.js:67-96` loops over **every** named throttler for every route; line 82 `limit = routeOrClassLimit || namedThrottler.limit`, so an undecorated route gets `auth`'s 5/min. The only `@SkipThrottle()` is `src/modules/stripe-webhook/controllers/stripe-webhook.controller.ts:18`; the two `@Throttle({ auth: ... })` decorators (`authenticate.controller.ts:21`, `create-account.controller.ts:33`) just restate 5. **An undecorated route IS limited to 5 req/min.** Nuance: `generateKey` (`throttler.guard.js:148-151`) hashes `${Class}-${handler}-${name}-${ip}`, so the 5/min bucket is **per route per IP**, not one shared bucket across the API. Six calls to the same endpoint in a minute (pull-to-refresh ×6, infinite scroll past page 5, polling `GET /tasks/:id` after `requires_action`) → 429 "ThrottlerException: Too Many Requests". Disabled only when `NODE_ENV=test` (line 33), so no test can see it.
2. **Decimal centavos.** CONFIRMED and reproduced with `Prisma.Decimal` from the generated client: `new Decimal('10.03') * 100 === 1002.9999999999999`, `'19.99' → 1998.9999999999998`, `'49.90' → 4990` (ok). Over every 2-decimal price in [10.00, 1000.00]: **9 040 / 99 001 = 9.13 %** non-integer. `Decimal.valueOf()` returns a **string**, so `*` goes string→float; `Decimal + 1` is string concatenation (`'10.031'`). Stripe's `amount` is an integer parameter; the SDK serialises `1002.9999999999999` verbatim and Stripe rejects it (`invalid_integer`). Also `JSON.stringify({ rating: new Decimal('4.5') })` → `{"rating":"4.5"}` (string claims confirmed).
3. **`payout.failed` source shape.** Settled by the SDK types — not UNVERIFIABLE after all. `node_modules/stripe/types/Transfers.d.ts:64-66` `destination_payment`: "If the destination is a Stripe account, this will be the ID of the **payment** that the destination account received for the transfer"; `Charges.d.ts:207-210` `source_transfer`: "The transfer ID which created this charge. Only present if the charge came from another Stripe account." So on the **connected account** ledger (`stripe.service.ts:107-112` lists with `{ stripeAccount }`) the incoming funds are a `payment` balance transaction whose `source` is a **Charge** (`object: 'charge'`, `py_…`) carrying `source_transfer: 'tr_…'`; `source.object === 'transfer'` (`handle-payout-failed.service.ts:34`) can never match there. Additionally `Payouts.d.ts:81-83` `failure_balance_transaction`: a failed payout "returns the funds from the failed payout back in your balance" — the money is not lost, so the whole claw-back design is wrong (A3-20 confirmed). Runtime payload still worth one `stripe trigger` check before relying on any fix.
4. **`/tasks/validate` payment check.** CONFIRMED absent. `src/modules/tasks/use-cases/validate-task.service.ts:1-103` never imports or reads anything from payments; the only gates are task status `verification_required` (28-31), ownership (36), mapping (40-45) and proxy readiness (47-52). `tasks.repository.ts` has no payments access either.
5. **JWT expiry.** CONFIRMED none. `src/modules/auth/auth.module.ts:48-52` `signOptions: { algorithm: 'RS256' }` only; the three `sign(` calls (`authenticate.service.ts:60`, `refresh-session.service.ts:22`, `update-profile.service.ts:50`) pass no options; `test/factories/user.factory.ts:83` likewise. `JwtStrategy.validate` (`jwt.strategy.ts:49-58`) checks only `isDeleted`. No `exp`, no revocation.
6. **`fetchActiveTasksForUser` owner-`available`.** Code (`tasks.repository.ts:194-204`) includes `available` for owners. Docs: api `CLAUDE.md:111` omits it; app `SPEC.md` §8.6 (line ~724) omits it, but §8.13's "Em andamento" tab (line ~991) explicitly lists `available` and is fed by `GET /tasks/active`, and `test/tasks/fetch-active-tasks.e2e-spec.ts:41-66` asserts it. §8.14 (line ~1031) describes the deletion error as "existem tarefas **em andamento**", and `test/auth/delete-account.e2e-spec.ts:103-114` expects an `available` task not to block. **Recommendation:** keep `available` in `/tasks/active` (the UI needs it; e2e + §8.13 agree) and stop reusing that query for deletion: give `DeleteAccountService` its own blocking set (`in_progress`, `verification_required` as owner or executor) and auto-cancel the user's `available` tasks (no payment exists for them) in the same transaction. Update `CLAUDE.md:111` and SPEC §8.6.

---

## 1. Verdict table

Severity key: original → final. Notes ≤ 1 line. "Collapses into" refers to §2 IDs.

### A1 — auth module + app core

| # | Orig | Title | Verdict | Final | Note |
|---|---|---|---|---|---|
| A1-01 | P0 | `auth` throttler applies to every route | CONFIRMED (PARTIAL on scope) | P0 | Bucket is per route+IP (`throttler.guard.js:148-151`), not global; still a main-path 429 on the 6th call to any endpoint. → BE-04 |
| A1-02 | P0 | `rating`/`walletBalance` claims are strings; Client Home crashes | PARTIAL | P1 | Strings confirmed. But only PROXIES are ever rated (`validate-task.service.ts:97 ratedId: executorId`); a CLIENT's rating stays `"0"`, `"0" > 0` is false → `'—'`. Crash reachable only via userType switch (A1-06) or mass-assigned `rating` (A1-04). → BE-16 |
| A1-03 | P1 | Tokens never expire / never invalidated | CONFIRMED | P1 | `auth.module.ts:49`; all 3 signers pass no options. → BE-13 |
| A1-04 | P1 | Mass assignment on sign-up; `termsAccepted: false` accepted | CONFIRMED | P1 | `create-account.controller.ts:17-22` + `create-account.service.ts:52-57` spread. → BE-12 |
| A1-05 | P1 | No password policy; reset min 6 vs SPEC 8 | CONFIRMED | P2 | Hardening, app enforces 8 client-side; not a main-flow bug. → BE-27 |
| A1-06 | P1 | Password change without current password; `userType` switchable | CONFIRMED | P1 | `update-profile.controller.ts:12-15`, `update-profile.service.ts:33,38-40`; also the only realistic trigger of A1-02. → BE-14 |
| A1-07 | P1 | Null `phoneNumber` → 500 on every protected route | CONFIRMED | P1 | `jwt.strategy.ts:15,50`; `@nestjs/passport/dist/passport/passport.strategy.js:20-22` → `done(err)`; `auth.guard.js:58-61` rethrows → `@Catch()` 500. → BE-15 |
| A1-08 | P1 | Account enumeration (404 vs 401; forgot-password 429/500) | CONFIRMED | P2 | Real, but low blast radius for MVP; e2e `authenticate.e2e-spec.ts` asserts the 404. → BE-26 |
| A1-09 | P1 | Money/role claims stale by design | CONFIRMED | P1 | Only refresh caller is `app:src/feature/wallet/hooks/useStripeOnboarding.ts:47`. → BE-16 |
| A1-10 | P1 | History recomputes fees, hides `payout_failed` | CONFIRMED | P2 | `fetch-transaction-history.service.ts:39-42`, `auth.repository.ts:116`; drift only if fees change; `payout_failed` is effectively unreachable today (BE-24). → BE-40 |
| A1-11 | P2 | Delete-account anonymisation partial | CONFIRMED | P2 | `auth.repository.ts:138-151`. → BE-30 |
| A1-12 | P2 | e2e asserts opposite of repository (`available` blocks deletion) | CONFIRMED | P1 | Now a confirmed red suite (brief). → BE-17 |
| A1-13 | P2 | Stripe Customer before DB insert; P2002 → 500 | CONFIRMED | P2 | `create-account.service.ts:39-57`; `@Catch()` turns Prisma errors into 500. → BE-29 / BE-33 |
| A1-14 | P2 | Merchant account: no PROXY check, name split, no country/capabilities | CONFIRMED (capabilities effect UNVERIFIABLE) | P2 | `create-merchant-account.service.ts:33-34`, `stripe.service.ts:116-138`. → BE-31 |
| A1-15 | P2 | Seven PrismaClient instances | CONFIRMED | P2 | `PrismaService` in providers of App, Auth, Tasks, Cards, Payments, Ratings, StripeWebhook modules; `prisma.service.ts:9` throwaway. → BE-36 |
| A1-16 | P2 | Reset code: no per-code attempt limit | CONFIRMED | P2 | `verify-reset-code.service.ts:35-39`. → BE-28 |
| A1-17 | P2 | English framework messages reach the user | CONFIRMED | P2 | `zod-validation.pipe.ts:13-17`, `http.exception.ts:38-45`. → BE-34 |
| A1-18 | P2 | Email not normalised | CONFIRMED | P2 | `z.email()` in 4 controllers; `auth.repository.ts:33-37`. → BE-29 |
| A1-19 | P2 | `update-profile` coerces null → `''` | CONFIRMED | P2 | `update-profile.service.ts:34-35`; repository type forces `string` (`auth/types/index.d.ts:44-50`). → BE-35 |
| A1-20 | P2 | Code persisted before SES send; failure = 500 + burnt attempt | CONFIRMED | P2 | `forgot-password.service.ts:46-64`. → BE-28 |
| A1-21 | P2 | Throttler on `req.ip`, no `trust proxy` | CONFIRMED (deployment-dependent) | P2 | `throttler.guard.js:141-143`; `main.ts` sets nothing. → BE-42 |
| A1-22 | P3 | bcrypt cost 8 | CONFIRMED | P3 | → BE-48 |
| A1-23 | P3 | Filter duplicate branches; `standard.statusCode` 400 | CONFIRMED | P3 | `http.exception.ts:27-46`. → BE-48 |
| A1-24 | P3 | Docs drift | CONFIRMED | P3 | → BE-47 |
| A1-25 | P3 | Unused `STRIPE_PUBLIC_KEY`, `sendSms`, `updateUserPassword` | CONFIRMED | P3 | → BE-46 |
| A1-26 | P3 | Unescaped name in email HTML; no shutdown hooks; `console.log` | CONFIRMED | P3 | `notification.service.ts:56`, `main.ts:16`. → BE-48 |
| A1-27 | P3 | Prisma query logs in development | CONFIRMED | P3 | `prisma.service.ts:13-16`. → BE-48 |

### A2 — tasks lifecycle, payments, ratings

| # | Orig | Title | Verdict | Final | Note |
|---|---|---|---|---|---|
| A2-01 | P0 | `validate` pays without checking payment | CONFIRMED | P0 | No payments read anywhere in `validate-task.service.ts`. → BE-01 |
| A2-02 | P0 | `offeredPrice * 100` non-integer for ~9 % of prices | CONFIRMED (reproduced 9.13 %) | P0 | `start-task.service.ts:60`; type hole `tasks/types/index.d.ts:67` + `tsconfig.json:19`. → BE-03 |
| A2-03 | P0 | `start` mutates before charge; no rollback | CONFIRMED | P0 | `start-task.service.ts:44-50` before `:52` card and `:58` Stripe. → BE-02 |
| A2-04 | P1 | 3DS `requires_action` dead end | CONFIRMED | P1 | `start-task.service.ts:87-92`; `stripe.service.ts:78-82` no `off_session`; app toasts only. Frequency for BR issuers UNVERIFIABLE. → BE-05 |
| A2-05 | P1 | Double validate → double transfer | CONFIRMED | P1 | No CAS (`tasks.repository.ts:250-258` unconditional), no idempotency key (`stripe.service.ts:95-100`). → BE-06 |
| A2-06 | P1 | `cancel` refunds blindly; `pending` refund = failure | CONFIRMED | P1 | `cancel-task.service.ts:54-67`; `payments.repository.ts:17` no status filter. → BE-07 |
| A2-07 | P1 | PII + PI id leak to any PROXY | CONFIRMED | P1 | Owner select incl. `email, phoneNumber, stripeCustomerId` in 4 places (`tasks.repository.ts:66-79,136-149,176-189,280-292`); `fetch-task-by-id.service.ts:39-41` gates CLIENT only. → BE-11 |
| A2-08 | P1 | Task persisted before card check; `cardDetails: {}` accepted | CONFIRMED | P2 | `create-task.service.ts:36-50`; `create-task.controller.ts:26-29`; e2e itself sends `cardDetails: {}` (`create-task.e2e-spec.ts:24`). Money impact only via BE-02. → BE-19 |
| A2-09 | P1 | No server-side price validation | CONFIRMED | P1 | `create-task.controller.ts:22-24`; sub-R$0,52 → negative transfer → task stuck in `verification_required` with no cancel path. → BE-09 |
| A2-10 | P1 | Transfer from available balance; no `source_transaction` | CONFIRMED mechanism (impact UNVERIFIABLE) | P1 | `TransfersResource.d.ts:36-39` documents exactly this. → BE-08 |
| A2-11 | P2 | `walletBalance` non-atomic RMW | CONFIRMED | P2 | `update-wallet-balance.service.ts:25-27`, `auth.repository.ts:72-80`. → BE-20 |
| A2-12 | P2 | `Payments` no uniqueness/index; `findFirst` unordered | CONFIRMED | P2 | `schema.prisma:143-158`; `payments.repository.ts:17`. → BE-21 |
| A2-13 | P2 | `cancel` writes stale payment row back | CONFIRMED | P2 | `cancel-task.service.ts:75-80`. → BE-21 |
| A2-14 | P2 | Two proxies start same task → 500, `startedAt` bumped | CONFIRMED | P2 | Mapping PK (`schema.prisma:131`) fails at `:50` **before** Stripe → no double charge (refutes A4-10 sub-claim). → BE-02 |
| A2-15 | P2 | `Decimal` undeclared; `skipLibCheck` hides it | CONFIRMED (10 errors) | P2 | `tasks/types/index.d.ts` has no import (auth's `:1-3` does). → BE-39 |
| A2-16 | P2 | Case-sensitive substring city filter; no pagination metadata | CONFIRMED | P2 | `tasks.repository.ts:84`. → BE-37 |
| A2-17 | P2 | Proof images on local disk, trusted MIME, sync writes | CONFIRMED | P1 | `finish-task.service.ts:54-58`, `fetch-task-proof.service.ts:45-50`; ephemeral disks on any PaaS lose every proof on deploy → §8.9 main flow. → BE-18 |
| A2-18 | P2 | `completedAt`/`canceledAt`/`transferId` never returned | CONFIRMED | P2 | All four selects. → BE-38 |
| A2-19 | P2 | PROXY can create tasks | CONFIRMED | P2 | No `userType` in controller/service. → BE-19 |
| A2-20 | P2 | No idempotency keys; `setup_future_usage` on attached PM | CONFIRMED | P1 | Merged with A3-07 (money). → BE-06 |
| A2-21 | P2 | PrismaService per module; `PaymentsModule` unused | CONFIRMED | P2 | `payments.module.ts:9-18` exports nothing. → BE-36 |
| A2-22 | P2 | Four post-transfer writes not transactional | CONFIRMED | P2 | `validate-task.service.ts:75-101`. → BE-06 |
| A2-23 | P3 | Dead code / stale dictionary entries | CONFIRMED | P3 | `finish-task.service.ts:26-28` unreachable, etc. → BE-46 |
| A2-24 | P3 | Docs drift | CONFIRMED | P3 | → BE-47 |
| A2-25 | P3 | `fetch-task-by-id` trusts JWT `userType` | CONFIRMED | P3 | `fetch-task-by-id.controller.ts:19`. → BE-11 |
| A2-26 | P3 | `String(stripeCustomerId)` → `"null"` | CONFIRMED | P3 | `start-task.service.ts:61`. → BE-46 |

### A3 — cards, webhooks, StripeService, schema

| # | Orig | Title | Verdict | Final | Note |
|---|---|---|---|---|---|
| A3-01 | P0 | 3DS to wrong party; card saved without SetupIntent | CONFIRMED | P1 | Same root as A2-04; P0 only in combination with BE-01 (which is already P0). Card-save-without-auth part → BE-32. → BE-05 |
| A3-02 | P0 | `start` mutates before card/charge | CONFIRMED | P0 | → BE-02 |
| A3-03 | P0 | `validate` without payment check | CONFIRMED | P0 | → BE-01 |
| A3-04 | P1 | One webhook secret; Connect events need a second endpoint | CONFIRMED on code; Stripe model standard but UNVERIFIABLE here | P1 | `stripe.module.ts:20-24`, `env.ts:13`; `account.updated`/`payout.failed` are Connect events. If unfixed no proxy ever becomes `stripeAccountReady` in prod. → BE-10 |
| A3-05 | P1 | `payout.failed` filter on `source.object === 'transfer'` never matches | CONFIRMED via SDK docs (`Transfers.d.ts:64-66`, `Charges.d.ts:207-210`) | P2 | Fails safe: does nothing, and "nothing" is financially correct per `Payouts.d.ts:81-83`. → BE-24 |
| A3-06 | P1 | Dedupe row written after handler, no transaction | CONFIRMED | P2 | `dispatch-stripe-event.service.ts:45-79`; only dispute/payout handlers are non-idempotent and both are rare. → BE-23 |
| A3-07 | P1 | No application idempotency keys | CONFIRMED | P1 | `stripe.service.ts:63-105`; SDK default `maxNetworkRetries` 2 (`cjs/stripe.core.js:74`) covers only its own retries. → BE-06 |
| A3-08 | P1 | Transfers without `source_transaction` | CONFIRMED | P1 | → BE-08 |
| A3-09 | P2 | `charge.refunded` nulls `refundId` | CONFIRMED (`Charges.d.ts:190` `refunds?:` optional) | P2 | `handle-charge-refunded.service.ts:18-23`. → BE-21 |
| A3-10 | P2 | One-active-card unenforced; old PM never detached | CONFIRMED | P2 | `create-user-payment-method.service.ts:31,74-79`; `cards.repository.ts:28-32`. → BE-32 |
| A3-11 | P2 | `payments.paymentIntent` not unique; `taskId` unindexed | CONFIRMED | P2 | → BE-21 |
| A3-12 | P2 | `payment_failed` reverts regardless of task status | CONFIRMED | P2 | `handle-payment-failed.service.ts:18-30`. → BE-22 |
| A3-13 | P2 | `payout.failed` partial failure; RMW; `limit` 10 | CONFIRMED | P2 | `handle-payout-failed.service.ts:48-69`; `stripe.service.ts:108-111` no pagination. → BE-24 |
| A3-14 | P2 | Dispute never reverses transfer, does not freeze task | CONFIRMED | P2 | `handle-charge-disputed.service.ts:40-64`. → BE-25 |
| A3-15 | P2 | `DELETE /card/:id` → 500 on non-UUID / detached PM | CONFIRMED | P2 | Generalised: every `:id` param and every `taskId` body is `z.string()`, not uuid. → BE-33 |
| A3-16 | P2 | Unindexed FK/lookup columns | CONFIRMED | P2 | `schema.prisma` has only 3 indexes. → BE-41 |
| A3-17 | P2 | No `city` column | CONFIRMED | P2 | → BE-37 |
| A3-18 | P2 | `customers.search` interpolates raw email | CONFIRMED | P2 | `stripe.service.ts:34-36`. → BE-29 |
| A3-19 | P2 | Connect account without `capabilities`/`country` | CONFIRMED code; effect UNVERIFIABLE | P2 | → BE-31 |
| A3-20 | P2 | `payout.failed` claw-back is the wrong model | CONFIRMED (`Payouts.d.ts:81-83`) | P2 | → BE-24 (product decision) |
| A3-21 | P2 | `DECIMAL(65,30)` + float math | CONFIRMED | P2 | `schema.prisma:51,54,82-83`. → BE-20 |
| A3-22 | P3 | Dead `savedCard` branch | CONFIRMED | P3 | Controller schema `create-user-payment-method.controller.ts:11-13` only accepts `token`; but `CreateTaskService:46-50` *does* pass `savedCard` — branch reachable via `/tasks/create`, not `/card/create`. → BE-46 |
| A3-23 | P3 | Hard-delete cascades | CONFIRMED | P3 | → BE-49 |
| A3-24 | P3 | `StripeEvents` unbounded, no payload | CONFIRMED | P3 | → BE-49 |
| A3-25 | P3 | Throwaway `PrismaClient` | CONFIRMED | P3 | → BE-36 |
| A3-26 | P3 | Build tooling in prod deps | CONFIRMED | P3 | `package.json:28,35-36,40-43,52-54`. → BE-49 |
| A3-27 | P3 | tsconfig/jest/bitnami nits | CONFIRMED | P3 | `tsconfig.json:23 noImplicitAny:false`. → BE-39 / BE-49 |
| A3-28 | P3 | Destructive / unnamed migrations | CONFIRMED | P3 | → BE-49 |
| A3-29 | P3 | Docs drift | CONFIRMED | P3 | → BE-47 |
| A3-30 | P3 | Webhook 400 → 3 days of retries | CONFIRMED | P3 | → BE-49 |

### A4 — test suites and CI

| # | Orig | Title | Verdict | Final | Note |
|---|---|---|---|---|---|
| A4-01 | P1 | e2e red; two specs encode opposite semantics | CONFIRMED | P1 | → BE-17 |
| A4-02 | P1 | `start` failure paths unobserved by tests | CONFIRMED | P0 (tests part of BE-02) | `start-task.service.spec.ts:202-254` never asserts `updateTaskStatus` not called. → BE-02 |
| A4-03 | P1 | `payout.failed` tests feed a shape Stripe does not emit | CONFIRMED via SDK docs | P2 | `handle-payout-failed.service.spec.ts:27-28`, `stripe-webhook.e2e-spec.ts:223-227`. → BE-24 |
| A4-04 | P2 | `test/.env.test` tracked and regenerated per run | CONFIRMED | P2 | `git ls-files` lists it; `global-setup.ts:7,49`. Working tree is clean now, so someone reverted after tonight's run. → BE-43 |
| A4-05 | P2 | `load-env.ts` no `override` → could TRUNCATE a dev DB | CONFIRMED | P2 | `load-env.ts:4`. → BE-43 |
| A4-06 | P2 | ts-jest transpile-only; factory drifted | CONFIRMED | P2 | `tsconfig.json:9 isolatedModules`; `user.factory.ts:64-81`. → BE-43 |
| A4-07 | P2 | Unrealistic Stripe mock defaults | CONFIRMED | P3 | `stripe.service.mock.ts:23,34`. → BE-45 |
| A4-08 | P2 | Seven validation tests assert only 4xx | CONFIRMED | P3 | → BE-45 |
| A4-09 | P2 | Time boundaries untested | CONFIRMED | P3 | → BE-45 |
| A4-10 | P2 | Untested concurrency; "owner may be charged twice" | PARTIAL | P2 | Race exists, but the mapping PK violation (`start-task.service.ts:50`) precedes any Stripe call → no double charge. → BE-02 / BE-44 |
| A4-11 | P2 | `update-profile` spec enshrines `''` | CONFIRMED | P2 | → BE-35 |
| A4-12 | P2 | No e2e for refresh / proof / dispute; no spec for proof | CONFIRMED | P2 | → BE-44 |
| A4-13 | P3 | Pass-through unit specs | CONFIRMED | P3 | → BE-45 |
| A4-14 | P3 | `toBeInstanceOf(AppException)` only | CONFIRMED | P3 | → BE-45 |
| A4-15 | P3 | Duplicated fixtures | CONFIRMED | P3 | → BE-45 |
| A4-16 | P3 | Fee formula duplicated in 4 files | CONFIRMED | P3 | → BE-40 |
| A4-17 | P3 | `evt_${Date.now()}` ids | CONFIRMED | P3 | → BE-45 |
| A4-18 | P3 | `lint` runs `--fix` | CONFIRMED | P3 | `package.json:18`. → BE-49 |
| A4-19 | P3 | Throwaway `PrismaClient` | CONFIRMED | P3 | → BE-36 |

### X1 — backend-side claims only

| # | Orig | Claim | Verdict | Final | Note |
|---|---|---|---|---|---|
| X1-a | P1 | Mass assignment on `/auth/create` | CONFIRMED | P1 | → BE-12 |
| X1-b | P2 | JWT `rating`/`walletBalance` strings | CONFIRMED | P1 | → BE-16 |
| X1-c | P2 | Zod/Nest/Multer bodies in English, no `errorCode` | CONFIRMED | P2 | Multer 413 via `platform-express/multer/multer.utils.js:12-13` `PayloadTooLargeException`. → BE-34 |
| X1-d | P2 | No `exp` | CONFIRMED | P1 | → BE-13 |
| X1-e | P2 | PII in task responses | CONFIRMED | P1 | → BE-11 |
| X1-f | P2 | Null phone → 500 | CONFIRMED | P1 | → BE-15 |
| X1-g | P2 | Task inserted before card | CONFIRMED | P2 | → BE-19 |
| X1-h | — | Decimal fields serialise as strings on REST | CONFIRMED | P3 | Contract fact, app already types them as strings except `/auth/transaction-history`. → BE-50 |

**Totals:** 102 first-pass findings + 8 X1 claims reviewed. CONFIRMED 95 · PARTIAL 4 (A1-01 scope, A1-02 crash reachability, A4-10 double-charge sub-claim, A3-22 reachability) · REFUTED 0 outright (one sub-claim) · UNVERIFIABLE-in-part 3 (A1-14/A3-19 capabilities effect, A3-04 Stripe endpoint model, A2-10/A3-08 balance impact — all confirmed at code level). Re-graded: 3 up (A1-12→P1, A2-17→P1, A2-20→P1), 11 down.

---

## 2. Canonical findings register

Ordered by severity, then blast radius. "Test" = the spec that should fail today and pass after the fix.

### P0

**BE-01 · P0 · `/tasks/validate` transfers platform money without any proof the client was charged**
Root cause: `Payments.status` is the only place webhook outcomes land, and nothing on the money path reads it. Any task that reached `verification_required` with a `pending`/`failed`/`disputed` (or missing) payment — 3DS dead end (BE-05), start failure after the status flip (BE-02), late/undelivered webhook, dispute before validation — still gets `transfers.create` from the platform's own balance when the owner taps "Validar".
Files: `src/modules/tasks/use-cases/validate-task.service.ts:28-73` (no payments read), `src/modules/stripe-webhook/use-cases/handle-charge-disputed.service.ts:45-50` (non-completed task only flagged).
Fix (proxy-api): inject `PaymentsRepository`; after the mapping check, load the latest payment for the task and `throw PAYMENT_NOT_CONFIRMED (409)` unless `status === 'succeeded'`; persist `chargeId`/`latest_charge` at `payment_intent.succeeded` and pass it as `source_transaction` (BE-08) so Stripe itself ties the transfer to a real charge; add the new code to `error-dictionary.ts` and SPEC §3.3; also refuse `finish` when `status === 'disputed'`.
Test: `test/tasks/validate-task.e2e-spec.ts` — seed `verification_required` + payment `pending` → 409, `createTransfer` not called, task unchanged; same with no payment row.
Collapses: A2-01, A3-03.

**BE-02 · P0 · `/tasks/start` flips status + inserts mapping before card/charge; every status transition is an unconditional `update where id`**
Root cause: `updateTaskStatus` (`tasks.repository.ts:92-103`) and `validateTaskCompletion` (`:246-259`) are not compare-and-set, and `start` orders DB writes before the money. Failure modes leaving `in_progress` + mapping + **no** `Payments` row (so `payment_failed` cannot revert): owner has no card (`:52`), PI create throws (incl. BE-03 integer bug), payment insert fails. Concurrency: two starts both pass the read, both bump `startedAt`; the loser dies on the mapping PK (`schema.prisma:131`) with a Prisma error → 500 `STANDARD_ERROR` (no double charge — the PK precedes Stripe). New (missed): `finish` vs `cancel` race — both read `in_progress`, cancel refunds and writes `canceled`, finish then overwrites with `verification_required` → task with a refunded payment that BE-01 would pay out.
Files: `src/modules/tasks/use-cases/start-task.service.ts:44-62,95-98`; `src/modules/tasks/repository/tasks.repository.ts:92-103,246-259`; `src/modules/tasks/use-cases/finish-task.service.ts:64-69`; `src/modules/tasks/use-cases/cancel-task.service.ts:69-73`.
Fix (proxy-api): (1) resolve owner card and create+confirm the PI **first**; (2) then `tasks.updateMany({ where: { id, status: 'available' }, data: {...} })` + mapping insert + payment row in one `$transaction`, aborting (and `paymentIntents.cancel`) if `count === 0`; (3) make every transition CAS on the expected `from` status (`finish` from `in_progress`, `cancel` from `available|in_progress`, `validate` from `verification_required`) and map `count === 0` / `P2002` to `TASK_NOT_AVAILABLE`; (4) on any Stripe error after PI creation, cancel the PI and mark the payment `failed`.
Test: `test/tasks/start-task.e2e-spec.ts` — owner without card → 404 and task still `available`, no mapping, no payment; `createPaymentIntent.mockRejectedValueOnce` → 402 with same assertions; `Promise.all([start, start])` → exactly one 200, one 4xx (not 500), one PI.
Collapses: A2-03, A3-02, A4-02, A2-14, A4-10.

**BE-03 · P0 · `offeredPrice * 100` on a Prisma `Decimal` yields non-integer centavos for 9.13 % of prices**
Root cause: `Decimal.valueOf()` is a string, so `*` goes through IEEE-754 (`10.03 → 1002.9999999999999`). Stripe rejects non-integer `amount`, the request lands in BE-02's catch as `PAYMENT_FAILED` with the task already flipped. Invisible to tsc because `Decimal` is undeclared in `tasks/types/index.d.ts` and `skipLibCheck: true` silences it (BE-39); invisible to tests because factories use plain numbers.
Files: `src/modules/tasks/use-cases/start-task.service.ts:60`; `src/modules/tasks/use-cases/validate-task.service.ts:55-57,62` (same float path, `Math.round` saves it); `src/modules/tasks/types/index.d.ts:65-69,83,96-99,136`; `tsconfig.json:19`.
Fix (proxy-api): `amount: new Prisma.Decimal(taskDetails.offeredPrice).mul(100).toDecimalPlaces(0).toNumber()`; compute fees in Decimal too (`price.mul('0.0399').plus('0.39')`, `.mul('0.2')`) and `toDecimalPlaces(2)` before persisting; `import type { Prisma } from '@prisma/client'; type Decimal = Prisma.Decimal` in the types file; make `task.factory.ts` build `new Prisma.Decimal(...)`.
Test: unit `start-task.service.spec.ts` with `offeredPrice: new Prisma.Decimal('10.03')` asserting `createPaymentIntent` called with `amount: 1003`; e2e start with `offeredPrice: 19.99`.
Collapses: A2-02 (+ root of A2-15).

**BE-04 · P0 · The `auth` named throttler limits every route to 5 req/min per IP (per route)**
Root cause: `@nestjs/throttler` v6 evaluates all named throttlers on all routes; without a per-route override the named limit applies. CLAUDE.md:12 and SPEC §3.4's "100/min default" are false outside `NODE_ENV=test`.
Files: `src/app.module.ts:28-34`; `node_modules/@nestjs/throttler/dist/throttler.guard.js:67,82,148-151`; `src/modules/auth/controllers/authenticate.controller.ts:21`, `create-account.controller.ts:33`.
Fix (proxy-api): keep a single unnamed throttler `{ ttl: 60_000, limit: 100 }` and put `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on the two auth handlers (also consider `/auth/forgot-password` and `/auth/verify-reset-code` for BE-28); map `ThrottlerException` to a PT message + `errorCode: 'TOO_MANY_REQUESTS'` in the filter (BE-34).
Test: new `test/app/throttle.e2e-spec.ts` that builds the app with `NODE_ENV` ≠ `test` (or overrides `skipIf`) and asserts the 6th `GET /tasks/active` is 200 and the 6th `POST /auth/session` is 429.
Collapses: A1-01.

### P1

**BE-05 · P1 · 3DS `requires_action` is a dead end: secret goes to the proxy, PI confirmed on-session, nothing rolls back**
Root cause: PI is created without `confirm`/`off_session` and confirmed on the **proxy's** request (`PaymentIntentsResource.d.ts:114-116`: `off_session` tells Stripe the customer cannot authenticate). Stripe may demand a cardholder challenge; the only device holding `clientSecret` is the proxy's, the app only toasts (`app:app/(app)/tasks/[id]/index.tsx:104-107`). Payment stays `pending`, task `in_progress` with mapping; no webhook fires until Stripe expires the PI. With BE-01 unfixed, validate then pays. Cards are attached with plain `attach` (no SetupIntent) so the issuer never authenticated the card at save time.
Files: `src/stripe/stripe.service.ts:63-82`; `src/modules/tasks/use-cases/start-task.service.ts:74-92`; `src/modules/cards/use-cases/create-user-payment-method.service.ts:56-60`.
Fix (proxy-api, owner decision in §5 Q2): default recommendation — `paymentIntents.create({ ..., confirm: true, off_session: true })` in one call; treat any non-`succeeded` status as failure → BE-02 rollback → `PAYMENT_FAILED` to the proxy with a PT message naming the client's card; drop `setup_future_usage`; save cards via SetupIntent (`usage: 'off_session'`, confirmed on-device with `confirmSetupIntent`) so 3DS happens once at card save. Remove the `requires_action` shape from `StartTaskResult`, CLAUDE.md §3DS and SPEC §7.3.
Test: `start-task.e2e-spec.ts` — `confirmPaymentIntent → { status: 'requires_action' }` → 402, task `available`, payment `failed`/absent; unit asserting `createPaymentIntent` called with `off_session: true, confirm: true`.
Collapses: A2-04, A3-01.

**BE-06 · P1 · `validate` is not idempotent: no CAS, no idempotency key, DB writes after Stripe and non-transactional**
Root cause: two concurrent/retried validates both read `verification_required`, both `transfers.create` (no `idempotencyKey`), second `update` dies on `transferId @unique` **after** two transfers left. A lost response after a successful transfer leaves the task `verification_required` and the next tap transfers again. Steps 2-4 after the transfer (counter, wallet, rating) are separate writes; a failure there returns 500 with the task already `completed` and the client unable to retry.
Files: `src/modules/tasks/use-cases/validate-task.service.ts:59-101`; `src/stripe/stripe.service.ts:90-105,84-88,63-82`; `src/modules/tasks/repository/tasks.repository.ts:246-259`.
Fix (proxy-api): CAS first (`updateMany where status: 'verification_required' → 'completed'` and abort on `count === 0`), then `transfers.create(params, { idempotencyKey: \`task:${taskId}:transfer\` })`, then `$transaction([persist transferId/fees, counter increment, wallet increment, rating upsert])`; on transfer failure revert the CAS. Add idempotency keys to `refunds.create` (`task:${taskId}:refund`), `paymentIntents.create` (`task:${taskId}:pi:${attempt}`), `transfers.createReversal`.
Test: `validate-task.e2e-spec.ts` — `Promise.all([validate, validate])` → one 200, one 404/409, `createTransfer` called once; `createTransfer.mockRejectedValueOnce` → 500 and task still `verification_required`, wallet 0.
Collapses: A2-05, A3-07, A2-20, A2-22.

**BE-07 · P1 · `cancel` refunds blindly; a `pending`/`failed` payment row (or a Stripe `pending` refund) makes cancel impossible (500)**
Root cause: `fetchPaymentRecord` ignores status and ordering; `refunds.create` on a PI with no successful charge is rejected → `REFUND_FAILED` 500. Hits exactly the states the client needs to escape (BE-05, a `failed` row left by the `payment_failed` revert, a re-started task with two rows). A Stripe refund in `pending` status is treated as failure although the refund exists.
Files: `src/modules/tasks/use-cases/cancel-task.service.ts:51-67`; `src/modules/payments/repository/payments.repository.ts:16-18`.
Fix (proxy-api): pick the latest row (`orderBy createdAt desc`); branch on `status`: `succeeded` → refund and accept `succeeded|pending`; `pending` → `paymentIntents.cancel(pi)`; `failed|refunded` → no Stripe call; write `{ status: 'refunded', refundId }` only (BE-21); still CAS the task (BE-02).
Test: `cancel-task.e2e-spec.ts` — payment `pending` → 200, `refundPayment` not called, PI cancelled; refund `{ status: 'pending' }` → 200 with `refundId` set.
Collapses: A2-06.

**BE-08 · P1 · Transfers use the platform's *available* balance; BRL card funds are pending for days/weeks**
Root cause: `transfers.create` without `source_transaction` (`TransfersResource.d.ts:36-39`: "transfer funds from a charge before they are added to your available balance"). With no float, the first validations fail with `balance_insufficient` → `TASK_TRANSFER_FAILED` 500 → client cannot complete. Impact depends on the account's payout schedule (UNVERIFIABLE here) but the code path is certain.
Files: `src/stripe/stripe.service.ts:90-101`; `src/modules/stripe-webhook/use-cases/handle-payment-succeeded.service.ts:10-15` (does not store `latest_charge`).
Fix (proxy-api): add `Payments.chargeId String?`; set it from `paymentIntent.latest_charge` in `payment_intent.succeeded` (and from the confirm response at start); pass `source_transaction: chargeId, transfer_group: taskId`. Alternative: destination charges (`transfer_data.destination` + `application_fee_amount`) at PI time — see §5 Q4.
Test: `validate-task.e2e-spec.ts` asserting `createTransfer` called with `source_transaction: 'ch_…'` from the seeded payment.
Collapses: A2-10, A3-08.

**BE-09 · P1 · No server-side validation of `offeredPrice` (or title/description)**
Root cause: `pricing.offeredPrice: z.number()` accepts 0, negatives, 3-decimal and huge values; `title`/`description` accept `''`. `0.50` → `proxyEarnings = -0.00995` → `Math.round(-0.995) = -1` → Stripe rejects → the task is stuck in `verification_required` forever (cancel forbids that status) with the client already charged. SPEC §8.8 promises ≥ R$ 10,00 client-side only.
Files: `src/modules/tasks/controllers/create-task.controller.ts:12-24`.
Fix (proxy-api): `offeredPrice: z.number().min(10).max(10_000).multipleOf(0.01)`, `title: z.string().trim().min(3).max(80)`, `description: z.string().trim().min(10).max(1000)`, lat/lng ranges; return the new 400 with a PT message (BE-34).
Test: `create-task.e2e-spec.ts` — `offeredPrice: 0`, `9.99`, `10.005` → 400 with `errorCode`; `10` → 201.
Collapses: A2-09.

**BE-10 · P1 · One webhook secret, but `account.updated`/`payout.failed` arrive via a Connect endpoint with its own secret**
Root cause: Stripe delivers connected-account events only to endpoints registered for "Connected accounts"; each Dashboard endpoint has its own `whsec_`. `StripeService` holds one. Locally `stripe listen` masks this. In production either the platform family (`payment_intent.*`, `charge.*`) or the Connect family (`account.updated` → `stripeAccountReady` never flips → no proxy can start a task) fails signature verification on every delivery.
Files: `src/stripe/stripe.module.ts:20-24`; `src/stripe/stripe.service.ts:25-31`; `src/env/env.ts:13`.
Fix (proxy-api): add `STRIPE_CONNECT_WEBHOOK_SECRET` (optional in dev); `constructWebhookEvent` tries platform then Connect secret (or expose `POST /stripe/webhook/connect`); document both endpoints in `CLAUDE.md` and `.env.example`; verify once in test mode with two registered endpoints.
Test: `stripe-webhook.e2e-spec.ts` — event signed with the second secret is accepted (mock `constructWebhookEvent` to reject the first).
Collapses: A3-04.

**BE-11 · P1 · Task responses leak owner `email`, `phoneNumber`, `stripeCustomerId` and the `paymentIntent` id; any PROXY can read any task**
Root cause: a single owner `select` reused in four repository methods; `fetch-task-by-id` gates only CLIENTs and trusts `userType` from the (never-expiring, possibly stale) JWT. `/tasks/fetch` has no role check at all.
Files: `src/modules/tasks/repository/tasks.repository.ts:66-79,136-149,176-189,280-292`; `src/modules/tasks/use-cases/fetch-task-by-id.service.ts:39-55`; `src/modules/tasks/controllers/fetch-task-by-id.controller.ts:17-20`.
Fix (proxy-api): one `publicOwnerSelect = { id, name, avatarUrl, isVerified, rating, totalTasksCreated }`; return `phoneNumber` only to the mapped executor while the task is `in_progress|verification_required`; embed `payment` only for the owner and strip `paymentIntent`; restrict PROXY reads of non-`available` tasks to the mapped executor; read `userType` from DB.
Test: `fetch-tasks.e2e-spec.ts` / `fetch-task-by-id.e2e-spec.ts` negative assertions: `body[0].ownerId` has no `email`/`phoneNumber`/`stripeCustomerId`; stranger PROXY on an `in_progress` task → 404.
Collapses: A2-07, A2-25, X1-e.

**BE-12 · P1 · Mass assignment on `POST /auth/create`; `termsAccepted: false` accepted**
Root cause: Zod schema includes server-owned fields and the service spreads the body into Prisma.
Files: `src/modules/auth/controllers/create-account.controller.ts:8-23`; `src/modules/auth/use-cases/create-account.service.ts:52-57`.
Fix (proxy-api): schema limited to `name,email,password,userType,phoneNumber,documentType,documentUrl,termsAccepted: z.literal(true)` with `.strict()`; build the Prisma `data` object explicitly.
Test: `create-account.e2e-spec.ts` — body with `isVerified: true, rating: 5, walletBalance: 1000` → 400 (strict) or stored row has defaults; `termsAccepted: false` → 400.
Collapses: A1-04, X1-a.

**BE-13 · P1 · JWTs never expire and are never revoked (logout, password reset/change, account deletion is the only check)**
Files: `src/modules/auth/auth.module.ts:48-52`; `src/modules/auth/utils/jwt.strategy.ts:49-58`; `reset-password.service.ts:46-50`; `update-profile.service.ts:38-40`.
Fix (proxy-api): `signOptions: { algorithm: 'RS256', expiresIn: '30d' }` (owner picks, §5 Q1); add `Users.tokenVersion Int @default(0)` (or `passwordChangedAt`), embed it in the payload, bump on password reset/change, reject in `validate` when it differs. App already calls `/auth/session/refresh`; make the app refresh on foreground.
Test: `test/auth/refresh-session.e2e-spec.ts` (new) decodes the token and asserts `exp`; `reset-password.e2e-spec.ts` asserts the old token is 401 after reset.
Collapses: A1-03, X1-d.

**BE-14 · P1 · `update-profile` changes the password without the current one and lets any user flip `userType`**
Root cause: body requires `userType`; service merges with `??`. A rated PROXY switching to CLIENT is the realistic trigger for the `session.rating.toFixed` crash (BE-16); role swap mid-lifecycle breaks `fetch-task-by-id` gating.
Files: `src/modules/auth/controllers/update-profile.controller.ts:11-17`; `src/modules/auth/use-cases/update-profile.service.ts:31-40`.
Fix (proxy-api): drop `userType` from the schema (SPEC §8.14: not MVP) or reject when it differs from DB; require `currentPassword` when `password` present and `compare()` it; `name: z.string().trim().min(2)`.
Test: `update-profile.e2e-spec.ts` — `userType` change → 400/403 and DB unchanged; `password` without `currentPassword` → 400.
Collapses: A1-06.

**BE-15 · P1 · A user created without `phoneNumber` gets a token that 500s on every protected route**
Root cause: `sessionPayloadSchema.phoneNumber: z.string()` rejects `null`; the ZodError escapes passport as a non-HTTP error → `@Catch()` 500 `STANDARD_ERROR`, so the app's 401 handler never fires. Hidden because the app always sends a phone and the e2e factory substitutes `''`.
Files: `src/modules/auth/utils/jwt.strategy.ts:15,50`; `src/modules/auth/controllers/create-account.controller.ts:13`; `test/factories/user.factory.ts:75`; `node_modules/@nestjs/passport/dist/auth.guard.js:58-61`.
Fix (proxy-api): `phoneNumber: z.string().nullable()`; wrap `parse` in `safeParse` → `UnauthorizedException`; fix the factory to pass `user.phoneNumber`.
Test: `refresh-session.e2e-spec.ts` with `createUser({ phoneNumber: null })` → 200.
Collapses: A1-07, X1-f.

**BE-16 · P1 · JWT carries mutable money/rating fields that are (a) serialised as strings and (b) stale by design; the app treats them as truth**
Root cause: `rating`/`walletBalance` are `Prisma.Decimal` → JSON strings in the token (`JSON.stringify` verified); the backend hides it with `z.coerce.number()`; the app decodes without coercion (`session.rating.toFixed` at `app:src/feature/home/components/ClientHome.tsx:63` crashes when non-zero — reachable via BE-14 or BE-12). `walletBalance` is credited in DB on validate but the proxy's token is refreshed only after Stripe onboarding, so "Saldo disponível" (`app:app/(app)/(tabs)/wallet.tsx:21`) and `ProxyHome.tsx:290` are frozen at last login. Note (missed by first pass): `walletBalance` only ever grows (validate credits; only disputes/payout-failed debit) — it is "total earned", not an available balance.
Files: `src/modules/auth/use-cases/authenticate.service.ts:44,52`, `refresh-session.service.ts:26,34`, `update-profile.service.ts:54,62`; `src/modules/auth/utils/jwt.strategy.ts:22-25`.
Fix (proxy-api): one `buildSessionPayload(user)` helper with `.toNumber()`; add `GET /auth/me` returning the fresh subset (or have the app call `/auth/session/refresh` on foreground and after task mutations); longer term drop `walletBalance`/`rating`/`stripeAccountReady` from the token.
Test: `authenticate.e2e-spec.ts` decodes the JWT and asserts `typeof rating === 'number'`; new `auth/me.e2e-spec.ts`.
Collapses: A1-02, A1-09, X1-b.

**BE-17 · P1 · e2e suite is red: `DELETE /auth/account` reuses `fetchActiveTasksForUser`, so an `available` listing blocks deletion while one spec expects 204**
Files: `test/auth/delete-account.e2e-spec.ts:103-114`; `test/tasks/fetch-active-tasks.e2e-spec.ts:41-66`; `src/modules/tasks/repository/tasks.repository.ts:194-204`; `src/modules/auth/use-cases/delete-account.service.ts:21-25`.
Fix (proxy-api): see "Evidence settled" §6 — keep `available` in `/tasks/active`; give deletion its own blocking statuses (`in_progress`, `verification_required`) and auto-cancel `available` owned tasks in the same transaction; rename the test to "cancels open listings and deletes".
Test: the existing failing test, extended to assert the `available` task is now `canceled`.
Collapses: A1-12, A4-01.

**BE-18 · P1 · Proof photos live on the API host's local disk under `process.cwd()/src/tmp`, MIME trusted from the client**
Root cause: `writeFileSync` to a gitignored folder relative to cwd; ephemeral disks (Render/Fly/Railway/containers) lose every proof on deploy/restart → `GET /tasks/:id/proof` 404 for the client (SPEC §8.9 main flow). `fileFilter` trusts `file.mimetype`; 10 MB sync write blocks the event loop.
Files: `src/modules/tasks/use-cases/finish-task.service.ts:49-61`; `src/modules/tasks/use-cases/fetch-task-proof.service.ts:45-54`; `src/pipes/multer-validation.pipe.ts:28-45`.
Fix (proxy-api): S3/R2 (or Supabase Storage) via presigned PUT from the app or server-side upload; store the object key in `proofImageUrl`; serve via short-lived signed URL; magic-byte check (`file-type`); until then at least `PROOF_DIR` env + `fs/promises`.
Test: `finish-task.e2e-spec.ts` with `.attach('file', …)` asserting `proofImageUrl` and the storage mock call; `fetch-task-proof.e2e-spec.ts` (new).
Collapses: A2-17.

### P2

**BE-19 · P2 · `/tasks/create`: task inserted before the card is validated; `cardDetails: {}` or `{token, savedCard}` silently accepted; PROXY may create tasks**
Files: `src/modules/tasks/use-cases/create-task.service.ts:36-57`; `src/modules/tasks/controllers/create-task.controller.ts:26-29`; `src/modules/cards/use-cases/create-user-payment-method.service.ts:86`.
Fix (proxy-api): `cardDetails: z.union([z.object({ savedCard: z.string() }).strict(), z.object({ token: z.string() }).strict()])`; validate/attach first, then `$transaction([task insert, counter increment])`; require DB `userType === 'CLIENT'` (403 `USER_NOT_CLIENT`).
Test: `create-task.e2e-spec.ts` — `cardDetails: {}` → 400; PROXY → 403; `retrievePaymentMethod` rejects → 400 and no task row.
Collapses: A2-08, A2-19, X1-g.

**BE-20 · P2 · Wallet ledger: non-atomic read-modify-write, JS float math, `DECIMAL(65,30)` columns**
Files: `src/modules/auth/use-cases/update-wallet-balance.service.ts:19-27`; `src/modules/auth/repository/auth.repository.ts:72-80`; `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:61-65`; `prisma/schema.prisma:51,54,82-83`.
Fix (proxy-api): `walletBalance: { increment: amount }` / `{ decrement }` everywhere (dispute handler already does); `walletBalance Decimal @db.Decimal(12,2)`, `rating @db.Decimal(3,2)`, lat/lng `@db.Decimal(9,6)`; compute `amount` as a 2-dp Decimal (BE-03).
Test: unit `update-wallet-balance.service.spec.ts` asserting the repository receives an increment, not an absolute value.
Collapses: A2-11, A3-21, part of A3-13.

**BE-21 · P2 · `Payments` bookkeeping: no `@@unique(paymentIntent)`/`@@index(taskId)`, unordered `findFirst`, cancel spreads the stale row, `charge.refunded` nulls `refundId`**
Files: `prisma/schema.prisma:143-158`; `src/modules/payments/repository/payments.repository.ts:16-28`; `src/modules/tasks/use-cases/cancel-task.service.ts:75-80`; `src/modules/stripe-webhook/use-cases/handle-charge-refunded.service.ts:18-23` (`Charges.d.ts:190` `refunds?` optional).
Fix (proxy-api): schema `@@unique([paymentIntent]) @@index([taskId])`; `fetchPaymentRecord` → latest by `createdAt desc`; `updatePaymentRecord` by `id` with `{ status: 'refunded', refundId }` only; refund handler `...(refundId && { refundId })` and `amount_refunded === amount` check.
Test: `cancel-task.e2e-spec.ts` seeds two rows (`failed` older, `succeeded` newer) and asserts the newer PI is refunded; webhook e2e: `charge.refunded` without `refunds` keeps the stored `refundId`.
Collapses: A2-12, A3-11, A2-13, A3-09.

**BE-22 · P2 · `payment_intent.payment_failed` reverts the task to `available` regardless of its current status**
Files: `src/modules/stripe-webhook/use-cases/handle-payment-failed.service.ts:11-30`.
Fix (proxy-api): `payments.updateMany({ where: { paymentIntent, status: 'pending' } })`; `tasks.updateMany({ where: { id, status: 'in_progress' } })`; log + flag otherwise.
Test: webhook e2e — task `verification_required` + `payment_failed` → unchanged.
Collapses: A3-12.

**BE-23 · P2 · Webhook dedupe row is written after the handler, outside a transaction**
Files: `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:45-79`; `src/modules/stripe-webhook/repository/stripe-events.repository.ts:9-20`.
Fix (proxy-api): insert `StripeEvents` first and treat `P2002` as "already processed"; or run handler + insert in one interactive `$transaction`; make the dispute handler idempotent (`status !== 'disputed'` guard).
Test: webhook e2e — same event delivered twice concurrently → wallet decremented once.
Collapses: A3-06.

**BE-24 · P2 · `payout.failed` handler: filter can never match on the connected ledger, claw-back is the wrong model, partial failures leave Stripe/DB inconsistent, only 10 rows read**
Root cause: see "Evidence settled" §3. Stripe returns failed-payout funds to the connected balance (`Payouts.d.ts:81-83`); reversing the platform transfer and marking `payout_failed` penalises the proxy for a bank-details problem. The unit/e2e fixtures encode the wrong `{ object: 'transfer' }` shape.
Files: `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:27-69`; `src/stripe/stripe.service.ts:107-112`; `handle-payout-failed.service.spec.ts:27-28`; `test/stripe-webhook/stripe-webhook.e2e-spec.ts:223-227`.
Fix (proxy-api, owner decision §5 Q5): recommended — treat `payout.failed` as a notification: log, set a `payoutIssue` flag / `stripeAccountReady=false`, surface "atualize seus dados bancários" in the wallet screen; remove reversal + `payout_failed` status. If the owner insists on claw-back: match `source.object === 'charge' && source.source_transfer`, `autoPagingEach`, `$transaction` with `decrement`, idempotent on `status`.
Test: replace the fixtures with `{ type: 'payment', source: { object: 'charge', id: 'py_1', source_transfer: 'tr_1' } }` and assert the chosen behaviour.
Collapses: A3-05, A3-13, A3-20, A4-03.

**BE-25 · P2 · Dispute handler only debits the internal wallet; transfer not reversed, task not frozen, dispute not persisted**
Files: `src/modules/stripe-webhook/use-cases/handle-charge-disputed.service.ts:40-64`.
Fix (proxy-api, owner decision §5 Q6): at minimum persist `disputeId`, block `finish`/`validate` when payment `disputed` (BE-01), and optionally `transfers.createReversal(task.transferId)` when set.
Test: webhook e2e for `charge.dispute.created` (none exists): completed task → payment `disputed`, wallet decremented once; `in_progress` task → subsequent validate 409.
Collapses: A3-14.

**BE-26 · P2 · Account enumeration via login (404 vs 401) and forgot-password (429/500 only for real emails); no timing equalisation**
Files: `src/modules/auth/use-cases/authenticate.service.ts:30-38`; `src/modules/auth/use-cases/forgot-password.service.ts:38-40,62-64`; `test/auth/authenticate.e2e-spec.ts` (asserts the 404).
Fix (proxy-api): 401 `USER_INVALID_CREDENTIALS` for both branches with a dummy `compare`; forgot-password returns the generic 200 on the rate-limit and send-failure branches (log them).
Test: update `authenticate.e2e-spec.ts` to expect 401 for unknown email.
Collapses: A1-08.

**BE-27 · P2 · No password policy server-side (create/update accept any string; reset min 6; SPEC says 8)**
Files: `create-account.controller.ts:11`, `update-profile.controller.ts:15`, `reset-password.controller.ts:10`.
Fix (proxy-api): shared `passwordSchema = z.string().min(8).max(72)`.
Test: `create-account.e2e-spec.ts` with `password: '1'` → 400.
Collapses: A1-05.

**BE-28 · P2 · Password-reset hardening: no per-code attempt limit; code persisted before SES send; SES failure is a 500 that burns an attempt; no dev fallback**
Files: `src/modules/auth/use-cases/verify-reset-code.service.ts:29-43`; `src/modules/auth/use-cases/forgot-password.service.ts:46-64`; `prisma/schema.prisma:193-205`.
Fix (proxy-api): `attempts Int @default(0)` on `PasswordResetCodes`, increment on mismatch, treat `>= 5` as expired; send first then persist (or delete on failure); in `development` log the code when AWS keys are placeholders; `randomInt(0, 1_000_000).toString().padStart(6,'0')`.
Test: `verify-reset-code.e2e-spec.ts` — 5 wrong guesses then the right code → 400.
Collapses: A1-16, A1-20.

**BE-29 · P2 · Identity plumbing: email not normalised; `customers.search` interpolates the raw email; sign-up creates the Stripe Customer before the row and turns the `P2002` race into a 500; a deleted user's Customer (with cards) is silently re-adopted**
Files: `create-account.controller.ts:10`, `authenticate.controller.ts:9`, `forgot-password.controller.ts:8`, `verify-reset-code.controller.ts:8`, `reset-password.controller.ts:8`; `src/modules/auth/repository/auth.repository.ts:33-37`; `src/stripe/stripe.service.ts:33-37`; `src/modules/auth/use-cases/create-account.service.ts:39-57`.
Fix (proxy-api): `email: z.email().trim().toLowerCase()` everywhere + one-off lowercase migration; drop `customers.search`, always `customers.create({ email, name, metadata: { userId } })` **after** the insert and update the row; catch `P2002` → `USER_EMAIL_EXISTS`.
Test: `create-account.e2e-spec.ts` — `Ana@X.com` then `ana@x.com` → 409; `o'neil@x.com` → 200.
Collapses: A1-13, A1-18, A3-18.

**BE-30 · P2 · Account deletion leaves cards, Stripe Customer/Connect account, password and balances in place**
Files: `src/modules/auth/repository/auth.repository.ts:138-151`; `src/modules/auth/use-cases/delete-account.service.ts:15-28`.
Fix (proxy-api, LGPD decision §5 Q7): same transaction soft-deletes `Cards` and detaches PMs; `customers.del` (or scrub email/name); null `stripeCustomerId`; set `password` to an unusable hash; leave Connect per Stripe guidance.
Test: `delete-account.e2e-spec.ts` asserts cards `isDeleted` and `detachPaymentMethod` called.
Collapses: A1-11.

**BE-31 · P2 · Connect onboarding: no PROXY check, naive name split, `phone: ''`, no `country`/`capabilities`, `return_url === refresh_url`**
Files: `src/modules/auth/use-cases/create-merchant-account.service.ts:32-34`; `src/stripe/stripe.service.ts:114-151`.
Fix (proxy-api): `userType !== 'PROXY' → USER_NOT_PROXY`; `lastName = parts.slice(1).join(' ') || undefined`; omit empty phone; `country: 'BR', default_currency: 'brl', capabilities: { transfers: { requested: true } }`; distinct `refresh_url` (`?refresh=1`). Verify `capabilities` on the existing test account (UNVERIFIABLE here).
Test: unit asserting `accounts.create` params; e2e CLIENT → 403.
Collapses: A1-14, A3-19.

**BE-32 · P2 · Cards: one-active-card rule unenforced (race → two rows), replaced PM never detached, no SetupIntent at save**
Files: `src/modules/cards/use-cases/create-user-payment-method.service.ts:31,56-79`; `src/modules/cards/repositories/cards.repository.ts:28-32`; `prisma/schema.prisma:112-128`.
Fix (proxy-api): partial unique index `cards(userId) WHERE "isDeleted" = false` (raw migration) + `P2002` handling; detach the previous `stripeCardId` after a successful attach; SetupIntent flow per BE-05.
Test: `create-card.e2e-spec.ts` — second create → one row, `detachPaymentMethod` called with the old pm.
Collapses: A3-10, card part of A3-01.

**BE-33 · P2 · Prisma/Postgres errors are never mapped: non-UUID `:id`/`taskId` → 500, `P2002`/`P2025` → 500, Stripe detach failure → 500 and the card is never removed**
Root cause (generalises A3-15, missed by the first pass): every `taskId` body is `z.string()` and every `:id` param is unvalidated; `@db.Uuid` columns make Postgres raise `22P02` (Prisma `P2023`) for `"abc"`, and `@Catch()` turns any non-`HttpException` into 500 `STANDARD_ERROR`. Affects `GET /tasks/:id`, `/tasks/:id/proof`, `POST /tasks/start|finish|validate|cancel`, `DELETE /card/:id`.
Files: `src/exception/http.exception.ts:48-59`; `src/modules/cards/controllers/delete-user-card.controller.ts:22`; `src/modules/tasks/controllers/{fetch-task-by-id,fetch-task-proof}.controller.ts`; all `taskId: z.string()` schemas; `src/modules/cards/use-cases/delete-user-card.service.ts:30`.
Fix (proxy-api): `z.uuid()` / `ParseUUIDPipe` on every id; in the filter map `PrismaClientKnownRequestError` `P2002→409`, `P2025→404`, `P2023→400` with PT messages; catch Stripe `resource_missing` on detach and still soft-delete.
Test: `fetch-task-by-id.e2e-spec.ts` — `GET /tasks/abc` → 400/404, not 500; `delete-card.e2e-spec.ts` — `detachPaymentMethod.mockRejectedValueOnce` → 204 and row `isDeleted`.
Collapses: A3-15 (+ parts of A1-13, A2-14).

**BE-34 · P2 · English framework messages reach the user (`Validation failed`, `ThrottlerException: Too Many Requests`, `Unauthorized`, `File too large`) with no `errorCode`**
Files: `src/pipes/zod-validation.pipe.ts:12-17`; `src/exception/http.exception.ts:38-45`; `node_modules/@nestjs/platform-express/multer/multer/multer.utils.js:12-13`.
Fix (proxy-api): pipe throws `AppException({ message: 'Dados inválidos.', errorCode: 'VALIDATION_FAILED', info })`; filter maps `ThrottlerException`, `UnauthorizedException`, `PayloadTooLargeException` to PT + codes; add them to SPEC §3.3.
Test: the seven `>= 400` e2e assertions become `toBe(400)` + `errorCode: 'VALIDATION_FAILED'`.
Collapses: A1-17, X1-c.

**BE-35 · P2 · `update-profile` coerces `null` avatar/phone to `''`; the spec locks it in**
Files: `src/modules/auth/use-cases/update-profile.service.ts:34-35`; `src/modules/auth/types/index.d.ts:44-50`; `update-profile.service.spec.ts:64-72`.
Fix (proxy-api): payload type `string | null`; pass through when the key is present, never substitute `''`.
Test: fix the unit expectation to `null`; e2e asserts `avatarUrl` stays `null`.
Collapses: A1-19, A4-11.

**BE-36 · P2 · Seven `PrismaClient` instances (one per module) plus a throwaway one; `PaymentsModule` is dead**
Files: `src/prisma/prisma.service.ts:7-18`; `providers` of `app.module.ts:19`, `auth.module.ts:61`, `tasks.module.ts:50`, `cards.module.ts:19`, `payments.module.ts:13`, `ratings.module.ts:8`, `stripe-webhook.module.ts:21`.
Fix (proxy-api): `@Global() PrismaModule` exporting one `PrismaService`; remove from every module; delete `prisma.service.ts:9`; make `PaymentsModule` export its services and import it from `TasksModule`.
Test: none needed; e2e suite proves wiring.
Collapses: A1-15, A2-21, A3-25, A4-19.

**BE-37 · P2 · City filter is a case-sensitive substring over the composed address; no `city` column; no pagination metadata**
Files: `src/modules/tasks/repository/tasks.repository.ts:81-88`; `src/modules/tasks/use-cases/create-task.service.ts:34`; `prisma/schema.prisma:75-110`.
Fix (proxy-api): add `city`, `state` columns (backfill from `locationAddress`), `@@index([city, status, createdAt])`, filter `equals` + `mode: 'insensitive'`; return `{ items, page, perPage, hasMore }` (coordinate with the app).
Test: `fetch-tasks.e2e-spec.ts` — `city=são paulo` matches "São Paulo"; 11 tasks → page 2 has 1 and `hasMore` false.
Collapses: A2-16, A3-17, X1 city claim.

**BE-38 · P2 · Task responses never include `completedAt`, `canceledAt`, `transferId`**
Files: `src/modules/tasks/repository/tasks.repository.ts:51-65,121-135,161-175,265-279`.
Fix (proxy-api): one shared `taskSelect` including them. Test: `fetch-task-by-id.e2e-spec.ts` asserts `completedAt` on a completed task.
Collapses: A2-18.

**BE-39 · P2 · Money types are effectively `any`: `Decimal` undeclared in `tasks/types/index.d.ts`, `skipLibCheck: true` silences it, `noImplicitAny: false`**
Files: `src/modules/tasks/types/index.d.ts:65-69,83,96-99,136`; `tsconfig.json:19,23`; `jest.config.ts:23-24`.
Fix (proxy-api): import `Prisma.Decimal` (or rename domain `.d.ts` files to `.ts`); turn `noImplicitAny` on and fix fallout; add `tsc --noEmit --skipLibCheck false` to CI once green.
Test: `npx tsc --noEmit --skipLibCheck false` → 0 errors.
Collapses: A2-15, part of A3-27.

**BE-40 · P2 · Transaction history recomputes fees with a hard-coded formula, hides `payout_failed`/`canceled` executor tasks, is unpaginated and ships `description`**
Files: `src/modules/auth/use-cases/fetch-transaction-history.service.ts:36-46`; `src/modules/auth/repository/auth.repository.ts:92-129`.
Fix (proxy-api): select `proxyEarnings, platformFee, transferId`; `netAmount = Number(task.proxyEarnings ?? computed)`; executor list `status in ('completed','payout_failed')`; `?page=`; return numbers.
Test: `transaction-history.e2e-spec.ts` seeds `proxyEarnings: 70` and asserts `netAmount === 70` (currently asserts the recomputed 75.62).
Collapses: A1-10, A4-16.

**BE-41 · P2 · No indexes beyond PKs, `users.email`, `ratings.taskId`, `tasks.transferId`**
Files: `prisma/schema.prisma` (whole).
Fix (proxy-api): `Tasks @@index([status, createdAt]) @@index([owner])`; `Cards @@index([userId])`; `Payments` (BE-21); `UserTaskMapping @@index([executorId])`; `Ratings @@index([ratedId])`; `PasswordResetCodes @@index([userId, createdAt])`; `Users @@index([stripeAccountId])`.
Test: migration applies in `global-setup` (`prisma migrate deploy`).
Collapses: A3-16.

**BE-42 · P2 · Throttler keyed on `req.ip` with no `trust proxy`; behind a PaaS all users share one bucket (or spoof it if enabled blindly)**
Files: `src/main.ts:8-17`; `throttler.guard.js:141-143`.
Fix (proxy-api): `app.getHttpAdapter().getInstance().set('trust proxy', 1)` only when deployed behind exactly one proxy (owner Q9).
Collapses: A1-21.

**BE-43 · P2 · Test infra: `test/.env.test` is git-tracked yet rewritten with fresh RSA keys every run; `load-env.ts` lets a shell `DATABASE_URL` win → `TRUNCATE` on a dev DB; ts-jest is transpile-only so the drifted factory (`stripeAccountReady` missing) only fails `tsc`**
Files: `test/setup/global-setup.ts:7,49`; `test/setup/load-env.ts:4`; `test/factories/user.factory.ts:64-81`; `tsconfig.json:9`; `jest.config.ts:11-30`.
Fix (proxy-api): `git rm --cached test/.env.test` + `.gitignore`; `config({ path, override: true })`; assert `DATABASE_URL` equals the container URI before `TRUNCATE`; add `stripeAccountReady: user.stripeAccountReady` to the factory payload; run `tsc --noEmit` in CI.
Test: `npx tsc --noEmit` → 0 errors.
Collapses: A4-04, A4-05, A4-06.

**BE-44 · P2 · Coverage gaps on money/auth paths: no e2e for `GET /auth/session/refresh`, `GET /tasks/:id/proof`, `charge.dispute.created`; no spec for `FetchTaskProofService`; no concurrency tests; no failure-path assertions on start/validate**
Files: `test/` (absent files); `src/modules/tasks/use-cases/fetch-task-proof.service.ts`.
Fix (proxy-api): the tests named under BE-01…BE-07, BE-13, BE-15, BE-18, BE-25 plus A4 §8 items 3, 4, 7, 12.
Collapses: A4-12, A4-10 (test part).

### P3

**BE-45 · P3 · Test hygiene** — unrealistic mock defaults (`refundPayment` no status, `constructWebhookEvent` returns `undefined`), seven `>= 400` range assertions, time boundaries untested, pass-through specs, `toBeInstanceOf(AppException)`, duplicated fixtures, `evt_${Date.now()}` ids. Files: `test/mocks/stripe.service.mock.ts:23,34`; the seven specs listed in A4-08; `stripe-webhook.e2e-spec.ts:25-29`. Fix: per A4 §8 item 16 + 11. Collapses: A4-07, A4-08, A4-09, A4-13, A4-14, A4-15, A4-17.

**BE-46 · P3 · Dead code / dictionary drift** — unreachable `finish-task.service.ts:26-28`; `TASK_STARTED_AT_NOT_VALID`, `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `payment.transferFailed` never thrown; `FILE_FORMAT_NOT_SUPPORTED` text omits HEIC/HEIF; `savedCard` branch reachable only via `/tasks/create`; `String(null)`; unused `STRIPE_PUBLIC_KEY`, `sendSms`, `updateUserPassword`; `AuthRepository.create` returns the input type. New: `start-task.service.ts:40-41` returns `USER_NOT_PROXY` ("não possui permissão de proxy") for a PROXY whose onboarding is merely incomplete — should be `PROXY_ACCOUNT_NOT_READY` (409) so the app can route to onboarding. Collapses: A2-23, A2-26, A3-22, A1-25.

**BE-47 · P3 · Docs drift (api `CLAUDE.md` + app `SPEC.md`)** — `CLAUDE.md:12` throttling, `:111` `/tasks/active` statuses and MIME list, `:128` deletion rule, `:142` "atomically", `:149` "safe against retries", `:156` "don't break the loop", `:159-168` 3DS flow; route maps omit `GET /auth/session/refresh` and `GET /tasks/:id/proof`; SPEC §3.3 codes/copy (`TRANSFER_FAILED` vs `TASK_TRANSFER_FAILED`, `USER_HAS_ACTIVE_TASKS`, `PROXY_ACCOUNT_NOT_READY`), §3.4 throttle table, §4.1 types and missing `stripeAccountReady`, §4.2 money as `number`, `completedAt`/`canceledAt`, missing `payout_failed`/`executor`/`payment`, §7.2 "até 1h", §7.3 "retido"/`confirmPayment`, §8.3 password 8 and document upload, §8.8 R$ 10 min, §8.10 field `photo` and mandatory file, §8.14 `userType`. Fix after the P0/P1 work lands. Collapses: A1-24, A2-24, A3-29, X1-i.

**BE-48 · P3 · Hardening/ops nits** — bcrypt cost 8 (`create-account.service.ts:34` etc.); `HttpExceptionFilter` duplicate branches and `standard.statusCode` 400 reused for 500 and for Stripe outages at sign-up (`http.exception.ts:27-46`, `create-account.service.ts:49`); unescaped `${userName}` in email HTML (`notification.service.ts:56`); no `enableShutdownHooks`, `console.log` in `main.ts:16`; query logging in dev (`prisma.service.ts:13-16`); `enableCors()` wildcard; new: `NODE_ENV` defaults to `development` (`env.ts:6-8`) so a prod deploy that forgets it uses `DEV_CALLBACK_URL` (localhost) for Connect onboarding and logs every query; new: no health-check route for a PaaS. Collapses: A1-22, A1-23, A1-26, A1-27.

**BE-49 · P3 · Schema/tooling nits** — `onDelete: Cascade` on `Tasks.ownerId`/`Payments.task` would wipe financial history on a hard delete; `StripeEvents` unbounded and payload-less; `@nestjs/cli`, `typescript`, `ts-node`, `@types/*`, `@nestjs/testing` in `dependencies` (`package.json:28,35-36,40-43,52-54`); `.env` twice in `.gitignore:39,60`; `bitnami/postgresql` untagged; nine unnamed/destructive migrations; `lint` runs `--fix` (`package.json:18`); webhook 400s retry for 3 days. Collapses: A3-23, A3-24, A3-26, A3-27, A3-28, A3-30, A4-18.

**BE-50 · P3 · Money fields serialise as strings on every REST response (`offeredPrice`, `proxyEarnings`, `platformFee`, `rating`, `payment.amount`, lat/lng)** — Prisma `Decimal` → JSON string. The app types them as strings except `TTransactionHistoryTask.offeredPrice: number`. Fix (proxy-api): a response serializer (`toNumber()` / `ClassSerializerInterceptor`-style map) or document the contract in SPEC §4.2 and fix the one app type. Collapses: X1-h, part of X1-i.

---

## 3. Missed by the first pass

**NEW-01 · (folded into BE-02) · `finish` ↔ `cancel` race yields a `verification_required` task whose payment was refunded**
Root cause: both transitions are unconditional `update where id`; within the 1 h window the client's cancel (refund + `canceled`) and the proxy's finish (`verification_required`) can interleave; finish wins the last write. BE-01 would then pay the proxy for a refunded charge.
Files: `src/modules/tasks/use-cases/finish-task.service.ts:64-69`; `src/modules/tasks/use-cases/cancel-task.service.ts:69-73`; `src/modules/tasks/repository/tasks.repository.ts:92-103`.
Fix: CAS on `from` status for every transition (BE-02 step 3).
Test: `finish-task.e2e-spec.ts` — task already `canceled` → 404 and status unchanged (today `fetchTaskById({status:'in_progress'})` already returns null for that case, so the test must simulate the interleaving at the repository level: call `updateTaskStatus` to `canceled` between read and write via a unit test with ordered mocks, asserting the repository method receives a conditional `where`).

**NEW-02 · (folded into BE-33) · Every unvalidated id turns into a 500**
`GET /tasks/abc`, `GET /tasks/abc/proof`, `POST /tasks/start { taskId: 'abc' }` etc. hit `@db.Uuid` columns with a non-UUID → Prisma error → `HttpExceptionFilter:48-59` → 500 `STANDARD_ERROR`. A1/A3 saw only `DELETE /card/:id`.

**NEW-03 · (folded into BE-04) · The 5/min bucket is per route per IP, not global**
`throttler.guard.js:148-151` hashes class + handler + throttler name + IP. Changes the user-facing symptom (6th call to the *same* endpoint) and the test to write.

**NEW-04 · (folded into BE-16/BE-14) · CLIENTs are never rated, so the `ClientHome` crash needs the `userType` switch or the mass-assigned `rating`**
`validate-task.service.ts:97` rates `taskMapping.executorId` only. A1's P0 is real as a type contract break but not a main-path crash on its own; it becomes one through BE-14 or BE-12. No screen renders a PROXY's own `session.rating`.

**NEW-05 · (refutes A4-10 sub-claim) · Double `/tasks/start` cannot double-charge today**
Order is `updateTaskStatus` → `insertTaskUserMapping` (PK on `taskId`, `schema.prisma:131`) → card → Stripe. The second request dies on the PK before any Stripe call. The symptom is a 500 instead of `TASK_NOT_AVAILABLE`, plus a bumped `startedAt`.

**NEW-06 · P3 · `walletBalance` is a running total of earnings, not an available balance**
Credited on validate (`validate-task.service.ts:88-91`), never debited by payouts (money goes straight to the proxy's Connect account and Stripe pays it out). SPEC §8.11 and `wallet.tsx` call it "Saldo disponível". Either rename to "Total recebido" or read the connected account's balance from Stripe. Owner decision (§5 Q8).

**NEW-07 · P3 · A completed task becomes unreadable for its executor once the owner deletes their account**
`fetchTaskById` filters `ownerId: { isDeleted: false }` (`tasks.repository.ts:151-155`), used by `GET /tasks/:id` and `/proof`; `transaction-history` still lists the task, so tapping it → 404.
Fix: drop the `isDeleted` filter from `fetchTaskById` (keep it in `fetchAllTasks`), or return the anonymised owner.

**NEW-08 · P3 · `USER_NOT_PROXY` returned for an un-onboarded PROXY**
`start-task.service.ts:40-41` collapses "not a proxy" and "proxy without `stripeAccountReady`" into one 403 whose copy says the user lacks proxy permission. SPEC §8.7 needs to route the second case to onboarding. Return `PROXY_ACCOUNT_NOT_READY` (409) for the second branch. Folded into BE-46.

**NEW-09 · P3 · Production misconfiguration risk from `NODE_ENV` default**
`env.ts:6-8` defaults to `development`; `create-merchant-account.service.ts:69-72` then uses `DEV_CALLBACK_URL` (`localhost:3000`) for Connect return/refresh URLs, and Prisma logs every query. Require `NODE_ENV` explicitly (no default) or fail fast when `NODE_ENV=production` and `PROD_CALLBACK_URL` is not https. Also confirm the owner controls the `PROD_CALLBACK_URL` host (it must serve the Stripe redirect page committed in `proxy-app` at `88b28f5`). Folded into BE-48.

**NEW-10 · P3 · No health endpoint, no graceful shutdown**
Any PaaS health check hits a throttled 404; `PrismaService.onModuleDestroy` never runs without `enableShutdownHooks()`. Folded into BE-48.

---

## 4. Settled questions (answerable from code/docs)

1. **Should `available` tasks block `DELETE /auth/account`?** (A1 Q2, A4 Q1) — Settled by SPEC: §8.14's error copy says "tarefas **em andamento**" and §8.13 treats `available` as a listing state the user controls. Recommendation: do not block; auto-cancel `available` owned tasks (no payment exists) and block only on `in_progress`/`verification_required`. Keep `available` in `/tasks/active` (SPEC §8.13 + e2e). → BE-17.
2. **Is `payout.failed` compensation ever exercised against Stripe?** (A4 Q3) — Settled by SDK types: the filter cannot match on the connected ledger, and failed-payout funds return to the connected balance. The handler must be redesigned, not fixed literally. → BE-24.
3. **Is there a time limit to `finish`?** (A4 Q2) — Settled by code history: commit `d20bae9` removed it and `finish-task.service.ts:41-44` documents the decision. Update SPEC §7.2 and delete `TASK_STARTED_AT_NOT_VALID`. → BE-46/47.
4. **May `userType` change after sign-up?** (A1 Q3) — Settled by SPEC §8.14 ("não está no MVP"): freeze it server-side. → BE-14.
5. **Minimum price?** (A2 Q7) — SPEC §8.8 says R$ 10,00; enforce `min(10)` server-side; a sensible `max(10_000)` until the owner says otherwise. → BE-09.
6. **One card or many?** (A3 Q6) — SPEC §8.12 says one card, replace on add; add the partial unique index. → BE-32.
7. **Two webhook endpoints in production?** (A3 Q5) — Not optional: Connect events are only delivered to a Connect-enabled endpoint. → BE-10.
8. **Is the proof photo mandatory?** (A2 Q4) — SPEC §8.10 says yes; backend accepts none. Recommend enforcing `file` required (400 `PROOF_PHOTO_REQUIRED`) — low-cost, matches the spec and gives the client something to validate.
9. **Which Stripe secret is unused?** — `STRIPE_PUBLIC_KEY` is read nowhere in `src/`; make it optional or remove (the app holds its own publishable key).

## 5. Open product decisions (owner only)

| # | Decision | Options | Recommended default |
|---|---|---|---|
| Q1 | Session lifetime and revocation (BE-13) | (a) `expiresIn` only; (b) + `tokenVersion` revocation on password change/reset/logout | (b) with `expiresIn: '30d'`; app refreshes on foreground |
| Q2 | Payment model for 3DS cards (BE-05) | (a) merchant-initiated `off_session: true` at start, fail fast on `requires_action`; (b) client-present authorisation at create with manual capture at start; (c) SetupIntent at card save + (a) | (c): 3DS once at card save, charges never need the client present |
| Q3 | Who absorbs the Stripe fee (A2 Q1) — on completion (today: proxy) and on a client cancel after charge (today: platform, fees not returned) | keep / move to client (`offeredPrice + fees` shown in §8.8 PriceBreakdown) / platform | Keep proxy-absorbs on completion; on cancel after start, charge the client a cancellation fee covering Stripe's fee |
| Q4 | Pending-funds strategy (BE-08) | (a) `source_transaction` transfers; (b) destination charges with `application_fee_amount`; (c) keep a BRL float | (b) if fee model is fixed; else (a) |
| Q5 | `payout.failed` policy (BE-24) | claw back transfer (today's intent) / notify proxy to fix bank details and leave funds on their balance | Notify; funds are already back on their Stripe balance |
| Q6 | Chargebacks after validation (BE-25) | platform absorbs (`losses.payments: 'application'`, wallet goes negative) / reverse transfer from the proxy / freeze and review | Freeze task + persist dispute; reverse transfer only after manual review |
| Q7 | Account deletion & Stripe/LGPD retention (BE-30) | delete Customer + detach cards now / keep for dispute window / scrub PII only | Detach cards + scrub Customer PII immediately; keep ids for 180 days |
| Q8 | What "Saldo disponível" means (NEW-06) | total earned (rename) / Stripe connected balance (new endpoint) | Rename to "Total recebido" for 1.0; add Stripe balance later |
| Q9 | Hosting topology (BE-42, NEW-09) | which proxy sits in front; is `proxy.com.br` owned and serving the redirect page | Needed before enabling `trust proxy` and before Connect onboarding works in prod |
| Q10 | Proof storage (BE-18) | S3 / R2 / Supabase Storage / keep disk with persistent volume | R2 or S3 with presigned URLs |
| Q11 | PII visible to proxies before acceptance (BE-11) | name+rating only / + neighbourhood / + phone after acceptance | Name, avatar, rating, neighbourhood; phone only to the mapped executor |
| Q12 | Document photo / CPF storage and `isVerified` (A1 Q5) | out of scope for 1.0 (hide badge) / presigned upload + manual review | Out of scope for 1.0; hide the "Verificado" badge and strip `isVerified` from the create body |
