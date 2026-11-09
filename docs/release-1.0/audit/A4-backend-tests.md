# A4 — Backend test suites (unit + e2e) and CI-readiness

Audit date: 2026-11-08. Repo: `/Users/leandromartins/Documents/proxy-api` (all paths below are relative to it unless absolute).

Run results on this machine (Docker Desktop daemon UP):

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **1 error** — `test/factories/user.factory.ts(64,9): error TS2741: Property 'stripeAccountReady' is missing in type '{ sub: string; name: string; ... }' but required in type '{ sub: string; email: string; ... stripeAccountReady: boolean; termsAccepted: boolean; }'` |
| `npx jest` (unit) | 37 suites / 153 tests passed, 1.26 s |
| `npm run test:e2e` (ran ONCE, Testcontainers `postgres:16-alpine`) | **22 suites: 21 passed, 1 failed. 103 tests: 102 passed, 1 failed.** 8.3 s. Exit code 1. |

The single e2e failure:

```
FAIL test/auth/delete-account.e2e-spec.ts
  ● DELETE /auth/account (e2e) › allows completed/canceled tasks (not blocking)
    expect(received).toBe(expected) // Object.is equality
    Expected: 204
    Received: 409
    > 113 |     expect(response.status).toBe(204)
      at Object.<anonymous> (test/auth/delete-account.e2e-spec.ts:113:29)
```

Side effect of the run that the owner must know about: `test/setup/global-setup.ts` rewrote the **git-tracked** file `test/.env.test` (`git status` now shows ` M test/.env.test`, 3 lines changed: `DATABASE_URL` port and both JWT keys). I did not revert it (read-only mandate); see finding P2-4.

---

## 1. Scope

Read in full, line by line (line counts from `wc -l`):

**Config / infra (8 files, 294 lines)**
- `jest.config.ts` (41), `test/jest-e2e.config.ts` (39), `package.json` (69)
- `test/setup/global-setup.ts` (60), `test/setup/global-teardown.ts` (9), `test/setup/load-env.ts` (4), `test/setup/test-app.factory.ts` (58)
- `test/mocks/stripe.service.mock.ts` (35), `test/mocks/notification.service.mock.ts` (10)
- `test/factories/user.factory.ts` (95), `test/factories/task.factory.ts` (42)
- `test/.env.test` — keys only: `PORT, NODE_ENV, AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, DATABASE_URL, JWT_PUBLIC_KEY, JWT_PRIVATE_KEY, STRIPE_SECRET_KEY, STRIPE_PUBLIC_KEY, STRIPE_WEBHOOK_SECRET, AWS_SES_FROM_EMAIL, DEV_CALLBACK_URL, PROD_CALLBACK_URL` (values not printed)

**E2E specs (22 files, 2 452 lines)**
- auth (10): `authenticate` 71, `create-account` 97, `create-merchant-account` 83, `delete-account` 115, `forgot-password` 90, `merchant-dashboard` 65, `reset-password` 144, `transaction-history` 99, `update-profile` 77, `verify-reset-code` 124
- cards (3): `create-card` 75, `delete-card` 117, `fetch-card` 63
- stripe-webhook (1): `stripe-webhook` 283
- tasks (8): `cancel-task` 168, `create-task` 112, `fetch-active-tasks` 110, `fetch-task-by-id` 149, `fetch-tasks` 76, `finish-task` 93, `start-task` 186, `validate-task` 191

**Unit specs (37 files, 3 821 lines)** — every `src/**/*.spec.ts`: auth (15), cards (3), payments (3), ratings (1), stripe-webhook (7), tasks (8). Plus unit fixtures `src/modules/auth/test-utils/user.factory.ts` (30) and `src/modules/tasks/test-utils/task.factory.ts` (43).

**Source skimmed to judge assertions** (not audited for their own bugs — that is A1–A3's job; I only cite them where a test contradicts them): all 24 controllers' decorators + Zod schemas, `error-dictionary.ts`, `stripe.service.ts`, `jwt.strategy.ts`, `app.module.ts`, `prisma.service.ts`, `http.exception.ts`, `zod-validation.pipe.ts`, `multer-validation.pipe.ts`, `tasks.repository.ts`, selected `auth.repository.ts` methods, services: `start-task`, `validate-task`, `cancel-task`, `finish-task`, `fetch-task-proof`, `fetch-task-by-id`, `delete-account`, `update-profile`, `update-wallet-balance`, `refresh-session`, all six webhook handlers + `dispatch-stripe-event`. `prisma/schema.prisma` model/`@@map` lines. SPEC.md §3.4, §7.2, §8.14.

Nothing in the slice was skipped.

---

## 2. How it works (as it actually behaves)

### Unit layer
`jest.config.ts` runs `.*\.spec\.ts$` under `src/` (ignores `/test/`), ts-jest with an **inline** tsconfig (`strict`, `noImplicitAny: false`), `clearMocks: true`. Every spec instantiates the service with `new Service(mockA as unknown as A, ...)`; mocks are `jest.Mocked<Pick<Repo, 'method'>>`. No Nest DI, no Prisma. Fixtures: `makeUser` (auth test-utils), `makeTaskDetails` / `makeTaskMapping` (tasks test-utils). The six webhook handlers that take `PrismaService` directly are tested with hand-built `{ payments: { updateMany }, $transaction }` objects and sentinel strings (`'payments-op'`) to assert transaction composition.

Important consequence: ts-jest is effectively **transpile-only** here. The root `tsconfig.json` has `"isolatedModules": true`; ts-jest ≥29.1 switches to transpilation without type-checking when that flag is on. Proof: `tsc --noEmit` fails on `test/factories/user.factory.ts:64` yet `npm run test:e2e` compiles and runs that same file without complaint (the e2e log contains zero `TS2741`). Type errors in tests never fail the test run.

### E2E layer
- `test/jest-e2e.config.ts`: `rootDir: '..'`, regex `.*\.e2e-spec\.ts$`, `setupFiles: load-env.ts`, `globalSetup/globalTeardown`, `testTimeout: 30000`, `maxWorkers: 1`, and `npm run test:e2e` adds `--runInBand`.
- `global-setup.ts` (runs once): starts `postgres:16-alpine` via `@testcontainers/postgresql`, generates a fresh 2048-bit RSA pair, **writes `test/.env.test`** with the container URI + dummy Stripe/AWS values, then `execSync('npx prisma migrate deploy')` against the container. Container handle stashed on `globalThis.__PG_CONTAINER__`; teardown stops it.
- `load-env.ts` (runs in every worker before each suite): `dotenv.config({ path: test/.env.test })` — **without `override`**, so pre-existing shell variables win.
- `test-app.factory.ts`: builds `AppModule` with `overrideProvider(StripeService)` → `createStripeServiceMock()` and `overrideProvider(NotificationService)` → mock; `createNestApplication({ logger: false, rawBody: true })`; adds `HttpExceptionFilter`. Each of the 22 suites builds its own app + PrismaClient in `beforeAll` and closes it in `afterAll`. `resetDatabase` = `TRUNCATE TABLE "cards","tasks","users","ratings","payments","stripe_events","user_task_mapping","password_reset_codes" RESTART IDENTITY CASCADE` in `beforeEach`. I checked the list against `schema.prisma` `@@map`s: all 8 models are covered, no table is missed.
- Throttling is disabled by `skipIf: () => process.env.NODE_ENV === 'test'` (`src/app.module.ts:33`), so the 5/min limits are never exercised.
- Factories: `createUser` inserts a user (default `stripeCustomerId: 'cus_test_default'`, `stripeAccountReady` defaults to `userType === 'PROXY'`, `isVerified/termsAccepted: true`) and signs a JWT with `JwtService` **omitting `stripeAccountReady`** (the tsc error). `createTask` inserts a task with `locationAddress: 'São Paulo'`, `offeredPrice: 50`, status override; its status union lacks `payout_failed`.
- Stripe mock defaults (what services actually read, in parentheses): `createPaymentIntent → {id, status:'requires_confirmation'}` (service reads `id` only ✔), `confirmPaymentIntent → {id, status:'succeeded'}` (reads `status`, `client_secret` ✔), `refundPayment → {id}` (**service reads `status`, requires `'succeeded'` — default makes every refund fail**), `createTransfer → {id}` ✔, `reverseTransfer → {id}` ✔, `listPayoutTransactions → {data: []}` (service reads `data[].source.object/id`), `retrievePaymentMethod → {id, card:{brand,last4}}` ✔, `constructWebhookEvent → jest.fn()` (**returns `undefined` → `event.id` TypeError → 500** unless a test primes it), `searchCustomer → {data: []}`, `createCustomer → {id}`, account/link/dashboard shapes ✔.

### Disagreements between code and `CLAUDE.md` / `SPEC.md` found through the tests
1. `CLAUDE.md` route map and SPEC §3.4 omit two live routes: `GET /auth/session/refresh` (`src/modules/auth/controllers/refresh-session.controller.ts:9-14`) and `GET /tasks/:id/proof` (`src/modules/tasks/controllers/fetch-task-proof.controller.ts:17-22`). Neither has an e2e test; proof has no unit test either.
2. `CLAUDE.md` says `/tasks/active` = owner-or-executor tasks with status ∈ `accepted | on_the_way | in_progress | verification_required`. The repository (`tasks.repository.ts:193-205`) also includes **`available`** for the owner. `test/tasks/fetch-active-tasks.e2e-spec.ts:41-66` asserts `available` IS included; `test/auth/delete-account.e2e-spec.ts:103-114` asserts an `available` task does NOT block deletion. Both call the same repository method → one of them must fail. It is the delete test that fails today.
3. `CLAUDE.md` §Testing: "Always test: 401 auth, validation errors, each domain error, happy path side effects in DB." Not followed — see matrix (§5): 7 validation tests assert only `4xx`, 23 domain error codes have no e2e.
4. `CLAUDE.md` says `/tasks/finish` accepts JPG/PNG/WEBP; `multer-validation.pipe.ts:32-38` also accepts `image/heic` and `image/heif`. No test uploads any file at all, so the whole multipart path (filter, 10 MB limit, disk write to `src/tmp`, `proofImageUrl`) is untested end-to-end.
5. SPEC §7.2 diagram says "Proxy envia foto de prova (até 1h)"; `finish-task.service.ts:41-44` explicitly has no time cutoff, and `finish-task.service.spec.ts:94-113` **asserts** there is none. The error `TASK_STARTED_AT_NOT_VALID` exists in the dictionary and SPEC §3.3 but is never thrown anywhere.
6. `CLAUDE.md` lists `pipes/multerOptions`; the file is `multer-validation.pipe.ts` (cosmetic).

---

## 3. Findings

### [P1] e2e suite is red on `main`: account deletion is blocked by `available` tasks, and two e2e specs encode opposite semantics
File: `test/auth/delete-account.e2e-spec.ts:103-114`, `test/tasks/fetch-active-tasks.e2e-spec.ts:41-66`, `src/modules/tasks/repository/tasks.repository.ts:193-205`, `src/modules/auth/use-cases/delete-account.service.ts:21-25`
Evidence:
```ts
// delete-account.e2e-spec.ts:105-113
await createTask(ctx.prisma, user.id, { status: 'completed' })
await createTask(ctx.prisma, user.id, { status: 'canceled' })
await createTask(ctx.prisma, user.id, { status: 'available' })
...
expect(response.status).toBe(204)        // actual: 409 USER_HAS_ACTIVE_TASKS
// tasks.repository.ts:195-204 (owner branch)
status: { in: ['available','accepted','on_the_way','in_progress','verification_required'] }
```
Why it matters: `npm run test:e2e` exits 1 today, so the suite cannot gate a release. Product-wise, a client with a posted-but-unaccepted task either can or cannot delete the account; the two specs disagree and the code picked "cannot". Deleting while an `available` task is live would leave an anonymized owner on a listed task (the fetch query already filters `ownerId.isDeleted: false`, so the task would just vanish from the feed — arguably fine, which is what the delete test assumes).
Suggested fix: decide the rule (I recommend: `available` tasks do NOT block deletion but get auto-canceled by `DeleteAccountService`); then either change the delete test to seed only terminal tasks or give `DeleteAccountService` its own "blocking statuses" query instead of reusing `fetchActiveTasksForUser`.
Confidence: high (reproduced).

### [P1] `/tasks/start` mutates task state before the card/payment steps and no test (unit or e2e) can observe the stuck-task outcome
File: `src/modules/tasks/use-cases/start-task.service.ts:44-53`, `src/modules/tasks/use-cases/start-task.service.spec.ts:202-254`, `test/tasks/start-task.e2e-spec.ts` (no failure-path test)
Evidence:
```ts
// start-task.service.ts:44-53
await this.tasksRepository.updateTaskStatus({ taskId, status: 'in_progress', startedAt: new Date() })
await this.tasksRepository.insertTaskUserMapping(taskId, userId)
const ownerCard = await this.fetchUserCardService.execute(taskDetails.owner) // throws NO_SAVED_CARD_FOUND
// start-task.service.spec.ts:247-253 — only asserts:
expect(createPaymentRecordService.execute).not.toHaveBeenCalled()
```
Why it matters: if the owner has no saved card, or `createPaymentIntent` throws, the request returns 404/402 **after** the task is already `in_progress` with a `UserTaskMapping` and **no `Payments` row** — so `payment_intent.payment_failed` can never revert it. The task is stuck; the proxy sees it in `/tasks/active` with no payment. The unit spec's three failure tests never assert `updateTaskStatus`/`insertTaskUserMapping` were not called (they were), and the e2e has zero failure-path tests, so the suite is green on a money-path bug.
Suggested fix (tests): add e2e "owner without card → 404 NO_SAVED_CARD_FOUND and task still `available`, no mapping" and "Stripe throws → 402 PAYMENT_FAILED, task still `available`"; both will fail until the service reorders (fetch card + create intent before `updateTaskStatus`) or wraps in a transaction. Fix for the service belongs to A2.
Confidence: high.

### [P1] `payout.failed` tests feed a balance-transaction shape Stripe does not emit on a connected account, so the compensation path is green but probably dead in production
File: `test/stripe-webhook/stripe-webhook.e2e-spec.ts:223-227`, `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.spec.ts:27-28,76-78`, `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:32-38`, `src/stripe/stripe.service.ts:107-112`
Evidence:
```ts
// e2e mock
data: [{ source: { object: 'transfer', id: 'tr_payout_1' } }]
// service
if (!source || typeof source === 'string' || source.object !== 'transfer') continue
const task = await this.tasksRepository.fetchTaskByTransferId(source.id)
// stripe.service.ts:107-111 — list is made ON the connected account
this.stripe.balanceTransactions.list({ payout, expand: ['data.source'] }, { stripeAccount: accountId })
```
Why it matters: `balanceTransactions.list(..., { stripeAccount })` returns the *connected account's* ledger. Funds arriving from a platform `transfer` appear there as a `payment` balance transaction whose `source` is a `py_…` Charge object (`object: 'charge'`, with `source_transfer: 'tr_…'`), not as a `Transfer` object; `object === 'transfer'` matches on the *platform* ledger only. Both the unit and e2e tests hard-code the service's assumption, so the test passes while, in production, every transaction would be skipped and no reversal/wallet debit would happen (the wallet keeps money that Stripe already clawed back).
Suggested fix: verify once in Stripe test mode (`stripe balance_transactions list --payout po_… --stripe-account acct_…`) and encode the real shape in the mock; most likely the service should read `source.source_transfer` when `source.object === 'charge'`. Add an e2e with the real fixture.
Confidence: medium (reasoned from Stripe Connect ledger semantics; not run against Stripe tonight — Stripe CLI not installed).

### [P2] `test/.env.test` is git-tracked but regenerated with new RSA keys and a new port on every e2e run
File: `test/setup/global-setup.ts:7,49`, `.gitignore` (no `test/.env.test` entry), `git ls-files test/.env.test` → tracked
Evidence:
```ts
const TEST_ENV_PATH = resolve(__dirname, '..', '.env.test')
...
writeFileSync(TEST_ENV_PATH, envContent)
```
Why it matters: every `npm run test:e2e` dirties the working tree (confirmed: ` M test/.env.test`, 3 lines). Developers will commit churn or, worse, `git checkout` it and later run a suite against a stale `DATABASE_URL`. In CI it is harmless but noisy. The committed file also contains a (dummy) private key, which trains people to commit keys.
Suggested fix: add `test/.env.test` to `.gitignore` and `git rm --cached` it; or have `global-setup` export the values via `process.env` + `globalThis` instead of a file, and make `load-env.ts` read them from there.
Confidence: high.

### [P2] `load-env.ts` does not override shell variables — an exported `DATABASE_URL` would make the e2e suite TRUNCATE the developer's database
File: `test/setup/load-env.ts:4`, `src/prisma/prisma.service.ts:8`, `test/setup/test-app.factory.ts:52-57`
Evidence:
```ts
config({ path: resolve(__dirname, '..', '.env.test') })   // dotenv default: existing env wins
// prisma.service.ts:8
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
// test-app.factory.ts:55
`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`
```
Why it matters: `npm run start:dev` users who export `DATABASE_URL` in their shell/direnv (common for `prisma studio`) would have `resetDatabase` wipe `proxy` on `localhost:5432` 103 times. Nothing guards against it (no assertion that `DATABASE_URL` contains the Testcontainers port, no `NODE_ENV === 'test'` check before TRUNCATE).
Suggested fix: `config({ path, override: true })` in `load-env.ts`, and in `resetDatabase` assert `process.env.DATABASE_URL === <value written by global-setup>` (expose it via `globalThis`) before truncating.
Confidence: high on mechanism, medium on likelihood.

### [P2] Type errors in test code never fail any test run (ts-jest transpile-only), and the e2e JWT factory has already drifted from the schema
File: `test/factories/user.factory.ts:64-81`, `src/modules/auth/utils/jwt.strategy.ts:28`, `tsconfig.json` (`"isolatedModules": true`), `jest.config.ts:11-28`, `test/jest-e2e.config.ts:11-28`
Evidence:
```ts
// user.factory.ts:64 — payload literal, no stripeAccountReady
const payload: SessionPayload = { sub: user.id, name: user.name, ... totalTasksCompleted: user.totalTasksCompleted }
// jwt.strategy.ts:28
stripeAccountReady: z.boolean().default(false),
```
Why it matters: (a) `tsc --noEmit` is red, so `npm run type-check` cannot gate CI until fixed. (b) Every e2e token carries `stripeAccountReady: false` even for PROXY users created with `stripeAccountReady: true`; tests pass only because `StartTaskService`/`ValidateTaskService` re-read the DB. Any future controller/guard that trusts `user.stripeAccountReady` from the JWT would be silently mis-tested. (c) Because ts-jest does not type-check, the only place this surfaces is a separate `tsc` step that does not exist in any pipeline.
Suggested fix: add `stripeAccountReady: user.stripeAccountReady` to the factory payload and expose it on `CreatedUser`; run `tsc --noEmit` as a CI step; optionally set `diagnostics: true` + drop `isolatedModules` for the jest transform.
Confidence: high.

### [P2] Stripe mock defaults are unrealistic in two places that would mask failures in new tests
File: `test/mocks/stripe.service.mock.ts:22,33`, `src/modules/tasks/use-cases/cancel-task.service.ts:59`, `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:34,45`
Evidence:
```ts
refundPayment: jest.fn().mockResolvedValue({ id: 're_test_123' }),   // no status
constructWebhookEvent: jest.fn(),                                     // returns undefined
// cancel-task.service.ts:59
if (!refund || refund.status !== 'succeeded') throw new AppException(errorDictionary.payment.refundFailed)
```
Why it matters: any cancel-with-payment test that forgets `mockResolvedValueOnce({ status: 'succeeded' })` gets `REFUND_FAILED` (500) — `cancel-task.e2e-spec.ts:86-90` works around it per-test. Any webhook test that forgets to prime `constructWebhookEvent` crashes on `event.id` and the filter returns `500 STANDARD_ERROR`, which can be mistaken for a real bug or, in a negative test asserting `>= 400`, pass for the wrong reason.
Suggested fix: default `refundPayment` to `{ id, status: 'succeeded' }`; default `constructWebhookEvent` to `jest.fn(() => { throw new Error('unprimed') })` so misuse is loud.
Confidence: high.

### [P2] Seven e2e "validation" tests assert only `status >= 400 && < 500` — they cannot distinguish a Zod 400 from a 401/404/409 domain error
File: `test/auth/authenticate.e2e-spec.ts:28-29`, `test/auth/create-account.e2e-spec.ts:35-36`, `test/auth/verify-reset-code.e2e-spec.ts:44-45`, `test/cards/create-card.e2e-spec.ts:39-40`, `test/tasks/create-task.e2e-spec.ts:106-107`, `test/tasks/fetch-tasks.e2e-spec.ts:39-40`, `test/tasks/validate-task.e2e-spec.ts:183-184`
Evidence:
```ts
expect(response.status).toBeGreaterThanOrEqual(400)
expect(response.status).toBeLessThan(500)
```
Why it matters: `ZodValidationPipe` (`src/pipes/zod-validation.pipe.ts:13-17`) returns `400` with `{ message: 'Validation failed', errors }`. The range assertion would also accept the request reaching the service and failing with 404/409 — i.e., validation being silently removed. The mobile app (SPEC §2.8) keys off `errorCode`, and these responses have none; that contract is untested.
Suggested fix: assert `toBe(400)` and `body.message === 'Validation failed'` (and that no DB row was created where applicable).
Confidence: high.

### [P2] Time-dependent rules are tested only far from their boundaries; code-expiry and rate-limit window logic live in the repository and are never exercised
File: `src/modules/tasks/use-cases/cancel-task.service.ts:43-44`, `test/tasks/cancel-task.e2e-spec.ts:56-70`, `src/modules/auth/repository/auth.repository.ts:166-204`, `test/auth/verify-reset-code.e2e-spec.ts:24-37`, `test/auth/reset-password.e2e-spec.ts:24-37`, `test/auth/forgot-password.e2e-spec.ts:71-79`
Evidence:
```ts
// cancel-task.service.ts:43-44 — differenceInHours truncates: 59m59s → 0 (allowed), 60m00s → 1 (rejected)
const elapsedHours = differenceInHours(new Date(), task.startedAt as Date)
if (elapsedHours >= 1) throw ...
// auth.repository.ts:173 — expiry enforced here, never reached by unit mocks; e2e always inserts +15 min
expiresAt: { gt: new Date() },
```
Why it matters: the only cancel tests use `startedAt = now` and `now - 2h`. A regression to `> 1` or to minutes would pass. `PASSWORD_RESET_INVALID_CODE` for an **expired** code is promised by SPEC §3.3 ("inválido ou expirado") but no test inserts `expiresAt` in the past, and no test proves codes older than 15 min stop counting toward the 429 limit.
Suggested fix: e2e cases with `startedAt = now - 59m` (200) and `now - 61m` (403); `insertCode(..., { expiresAt: past })` for verify and reset → 400; forgot-password with 3 codes `createdAt = now - 16m` → 200.
Confidence: high.

### [P2] Untested concurrency on money paths: double `/tasks/start`, non-atomic wallet read-modify-write
File: `src/modules/tasks/use-cases/start-task.service.ts:26-50`, `src/modules/auth/use-cases/update-wallet-balance.service.ts:19-27`, `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:61-65`, `prisma/schema.prisma:131` (`taskId String @id`)
Evidence:
```ts
// update-wallet-balance.service.ts:25-27
const newBalance = (user.walletBalance?.toNumber() || 0) + amount
await this.authRepository.updateWalletBalance(userId, newBalance)       // SET, not increment
// handle-charge-disputed.service.ts:61 does it right:
walletBalance: { decrement: payment.task.proxyEarnings! }
```
Why it matters: two proxies starting the same task concurrently both pass `fetchTaskById(status:'available')`; the second `insertTaskUserMapping` violates the `taskId` PK and surfaces as `500 STANDARD_ERROR` after the task was already flipped (and the owner may be charged twice). Validate + a concurrent payout-failed/dispute webhook can lose a wallet update. No test exercises either; the suite runs in-band so it never could by accident.
Suggested fix: e2e with `Promise.all([start, start])` asserting exactly one 200, one 4xx, one mapping, one PaymentIntent created; unit test asserting `UpdateWalletBalanceService` uses `{ increment }` (will drive the fix).
Confidence: high (race exists), medium (how often it bites in MVP traffic).

### [P2] `update-profile.service.spec.ts` enshrines the coercion of `null` avatar/phone into `''`
File: `src/modules/auth/use-cases/update-profile.service.spec.ts:64-72`, `src/modules/auth/use-cases/update-profile.service.ts:34-35`, `src/modules/auth/controllers/update-profile.controller.ts:14`
Evidence:
```ts
// spec expects
{ avatarUrl: '', name: 'New Name', userType: current.userType, phoneNumber: '+5511000000000' }
// service
avatarUrl: rest.avatarUrl ?? userDetails.avatarUrl ?? '',
phoneNumber: rest.phoneNumber ?? userDetails.phoneNumber ?? '',
```
Why it matters: the controller accepts `avatarUrl: z.url().optional().nullable()` — so `null` is a legal "no avatar" — yet any profile update writes `''` to a nullable column, and the new JWT carries `avatarUrl: ''`. The app's `IdentityCard` must now treat both `null` and `''` as "no avatar". The test locks this in as correct behaviour instead of flagging it.
Suggested fix: change expectation to `avatarUrl: null` / `phoneNumber: null` passthrough and fix the service to `?? null`; the e2e `update-profile` happy path should then assert `avatarUrl` stays `null`.
Confidence: medium (depends on whether the app relies on `''`).

### [P2] Three live code paths have no e2e at all, and one service has no unit spec
File: `src/modules/auth/controllers/refresh-session.controller.ts`, `src/modules/tasks/controllers/fetch-task-proof.controller.ts`, `src/modules/tasks/use-cases/fetch-task-proof.service.ts`, `src/modules/stripe-webhook/use-cases/handle-charge-disputed.service.ts`
Evidence: `grep -rln -E "session/refresh|/proof|dispute" test/` → no files. `find src -name '*.service.ts' ! -name '*.spec.ts'` minus specs → `fetch-task-proof.service.ts` is the only use case without a spec.
Why it matters: `GET /auth/session/refresh` is how the app learns `stripeAccountReady` after Stripe onboarding (SPEC §8.11 "atualizar … após refresh do token") — a wrong claim here blocks every proxy from accepting tasks. `GET /tasks/:id/proof` is the only way the client sees the proof photo (SPEC §8.9) and implements a 404-instead-of-403 authorization rule (`fetch-task-proof.service.ts:40-43`) plus a `src/tmp` path join that must be checked against traversal (`task.proofImageUrl` is DB-controlled, so low risk, but untested). `charge.dispute.created` debits a proxy's wallet — a money path with only a Prisma-mock unit test.
Suggested fix: see §8 items 3, 4, 7.
Confidence: high.

### [P3] Pass-through unit specs that cannot meaningfully fail
File: `src/modules/payments/use-cases/create-payment-record.service.spec.ts`, `update-payment-record.service.spec.ts`, `fetch-payment-record.service.spec.ts`, `src/modules/tasks/use-cases/fetch-active-tasks.service.spec.ts`, `fetch-tasks.service.spec.ts:37-44`, `src/modules/auth/use-cases/update-total-tasks-completed.service.spec.ts`, `update-total-tasks-created.service.spec.ts`, `src/modules/ratings/use-cases/rate-proxy.service.spec.ts`
Evidence: `expect(paymentsRepository.createPaymentRecord).toHaveBeenCalledWith(payload)` after `service.execute(payload)` — the service body is the same one line.
Why it matters: 8 of 37 suites (~20 tests) only prove `jest.fn()` records arguments. They inflate the "153 passing" number while covering zero logic. `fetch-tasks.service.spec.ts:19-35` (skip/perPage) is the one real assertion in that group; `rate-proxy` does check the average write-back.
Suggested fix: keep them but do not count them as coverage; the real coverage for these must come from e2e DB assertions (which exist for payments/ratings).
Confidence: high.

### [P3] Weak assertions: `toBeInstanceOf(AppException)` without `errorCode`
File: `src/modules/auth/use-cases/delete-account.service.spec.ts:51`, `src/modules/tasks/use-cases/validate-task.service.spec.ts:113`
Evidence: `await expect(service.execute('user-1')).rejects.toBeInstanceOf(AppException)`
Why it matters: any `AppException` satisfies it; the "already deleted → USER_NOT_FOUND" and "no mapping → TASK_MAPPING_NOT_FOUND" contracts are not pinned.
Suggested fix: `rejects.toMatchObject({ errorCode: '...' })` as every other test does.
Confidence: high.

### [P3] Duplicated / drifting fixtures
File: `src/modules/auth/use-cases/authenticate.service.spec.ts:14-39` (local `makeUser` duplicating `test-utils/user.factory.ts`, with a different default phone), `makeCard` copy-pasted in 3 cards specs, `insertCode` duplicated in `verify-reset-code` and `reset-password` e2e, `test/factories/task.factory.ts:10-17` status union missing `payout_failed` (the payout e2e bypasses the factory with raw `prisma.tasks.create`), `test/factories/user.factory.ts:19-28` `CreatedUser` lacks `stripeAccountReady`.
Why it matters: schema changes (e.g., adding a column to `Users`) must be made in 2–4 places; the `authenticate` local factory already diverged (`phoneNumber: '+5511999999999'` vs `null`).
Suggested fix: export `makeCard` from `cards/test-utils`, reuse `makeUser` in `authenticate.spec`, move `insertCode` to `test/factories/password-reset-code.factory.ts`, add `payout_failed` to the union.
Confidence: high.

### [P3] Fee formula duplicated into tests and into `FetchTransactionHistoryService`; history is recomputed, not read from `proxyEarnings`
File: `test/auth/transaction-history.e2e-spec.ts:96-97`, `src/modules/auth/use-cases/fetch-transaction-history.service.spec.ts:103-106`, `test/tasks/validate-task.e2e-spec.ts:108-113`, `src/modules/tasks/use-cases/validate-task.service.ts:55-57`
Evidence: `// 100 - (100 * 0.0399 + 0.39) - (100 * 0.2) = 75.62` appears in four files.
Why it matters: if the platform fee changes, history shows a different number than the wallet/transfer for already-completed tasks, and four tests must be edited in lock-step. The e2e for history seeds a completed task **without** `proxyEarnings` and still expects `75.62`, proving history ignores the persisted value.
Suggested fix: history should return `Number(task.proxyEarnings)` when present; tests should seed `proxyEarnings` and assert it round-trips.
Confidence: high.

### [P3] Latent flakiness: webhook e2e default event id is `evt_${Date.now()}`
File: `test/stripe-webhook/stripe-webhook.e2e-spec.ts:25-29`
Evidence: `id = \`evt_${Date.now()}\``
Why it matters: two `mockEvent()` calls inside one test within the same millisecond would get the same id → the second is treated as a duplicate and silently skipped. Today each test posts once (except idempotency, which passes explicit ids), so it is latent.
Suggested fix: `randomUUID()`.
Confidence: high.

### [P3] `lint` script runs `eslint --fix`; a CI lint step would rewrite files instead of failing
File: `package.json:20`
Evidence: `"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"`
Suggested fix: add `"lint:check": "eslint \"{src,test}/**/*.ts\""` for CI.
Confidence: high.

### [P3] `PrismaService` constructs and discards a second `PrismaClient`
File: `src/prisma/prisma.service.ts:8-11`
Evidence:
```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
new PrismaClient({ adapter })     // result discarded
super({ adapter, ... })
```
Why it matters: harmless for correctness, but each of the 22 e2e apps builds two clients over one adapter; noticed while checking connection handling. Not my slice to fix — forwarding to A1.
Confidence: high.

---

## 4. Gaps vs MVP (SPEC)

- SPEC §3.4 endpoint table and `CLAUDE.md` do not list `GET /auth/session/refresh` or `GET /tasks/:id/proof`; both exist and are used by the app flows in §8.9 / §8.11. Docs gap + zero e2e coverage.
- SPEC §7.2 "Proxy envia foto de prova (até 1h)" vs code/tests: no cutoff on finish; `TASK_STARTED_AT_NOT_VALID` (SPEC §3.3) is unreachable. Needs an owner decision (see §9).
- SPEC §8.14 "Erro USER_HAS_ACTIVE_TASKS … existem tarefas em andamento": the code also blocks on `available`. Decide (finding P1-1).
- SPEC §8.9/§8.10 proof photo flow: no test uploads a file; nothing proves `proofImageUrl` is set, the file lands in `src/tmp/<taskId>/`, the 10 MB limit, HEIC acceptance, or `FILE_FORMAT_NOT_SUPPORTED`.
- SPEC §7.3 3DS: e2e covers `requires_action` response but not the follow-up (`GET /tasks/:id` showing `payment.status` flipping after the webhook) as one scenario.
- SPEC §3.4 throttling 5/min on `/auth/session|create`: disabled under `NODE_ENV=test`, never tested.

---

## 5. Test coverage

### 5.1 Coverage matrix

Legend: ✔ covered, ✖ not covered, ~ partial, n/a not applicable. "Unit" = `src/.../<use-case>.service.spec.ts`; "E2E" = `test/<module>/<file>.e2e-spec.ts`. Domain errors list the codes the route can emit (from the service) and which are **not** covered by any e2e.

| Route | Unit spec | E2E spec | Happy | 401 | Validation | Domain errors NOT covered by e2e | DB side effects asserted |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `POST /auth/create` | create-account ✔ | create-account ✔ | ✔ | n/a | ~ (4xx only) | `STANDARD_ERROR` (Stripe down) — unit only | ✔ user row, hashed pw, customerId |
| `POST /auth/session` | authenticate ✔ | authenticate ✔ | ✔ (JWT shape only; claims not decoded) | n/a | ~ (4xx only) | — (USER_NOT_FOUND, USER_INVALID_CREDENTIALS covered) | n/a |
| `GET /auth/session/refresh` | refresh-session ✔ | **NONE** | ✖ | ✖ | n/a | `USER_NOT_FOUND` | ✖ |
| `POST /auth/forgot-password` | forgot-password ✔ | forgot-password ✔ | ✔ | n/a | ✖ | `PASSWORD_RESET_SEND_FAILED` (unit only); expired/old codes not counted — untested | ✔ code row (hash not verified against emailed plaintext) |
| `POST /auth/verify-reset-code` | verify-reset-code ✔ | verify-reset-code ✔ | ✔ | n/a | ~ (4xx only) | expired code → `PASSWORD_RESET_INVALID_CODE` ✖ | ✔ state=verified |
| `POST /auth/reset-password` | reset-password ✔ | reset-password ✔ | ✔ | n/a | ✖ | expired code ✖; user not found ✖ (unit only) | ✔ pw hash + state=used, reuse rejected |
| `POST /auth/update-profile` | update-profile ✔ | update-profile ✔ | ✔ | ✔ | ✖ | `USER_NOT_FOUND` (unit only) | ✔ name/phone/pw; avatarUrl `''` coercion untested (P2) |
| `POST /auth/merchant-account` | create-merchant-account ✔ | create-merchant-account ✔ | ✔ | ✔ | n/a | `MERCHANT_ACCOUNT_CREATION_FAILED` (unit only) | ✔ stripeAccountId |
| `GET /auth/merchant-dashboard` | create-merchant-dashboard-link ✔ | merchant-dashboard ✔ | ✔ | ✔ | n/a | `MERCHANT_DASHBOARD_LINK_FAILED` (unit only) | n/a |
| `GET /auth/transaction-history` | fetch-transaction-history ✔ | transaction-history ✔ | ✔ | ✔ | n/a | — | ✔ (netAmount recomputed, see P3) |
| `DELETE /auth/account` | delete-account ✔ | delete-account ✔ (**1 FAILING**) | ✔ | ✔ | n/a | — ; `available`-task semantics contradictory | ✔ anonymization, token rejected after |
| `POST /tasks/create` | create-task ✔ | create-task ✔ | ✔ | ✔ | ~ (4xx only) | `NO_SAVED_CARD_FOUND` / `CARD_CREATION_FAILED` / `USER_NOT_FOUND` via `cardDetails` ✖ (e2e sends `cardDetails: {}`) | ✔ task row, counter increments |
| `GET /tasks/fetch` | fetch-tasks ✔ | fetch-tasks ✔ | ✔ | ✔ | ~ (missing city, 4xx only) | — | n/a; pagination (`page`), deleted-owner exclusion, case sensitivity ✖ |
| `GET /tasks/active` | fetch-active-tasks ✔ (pass-through) | fetch-active-tasks ✔ | ✔ | ✔ | n/a | — | n/a; `payout_failed` exclusion, executor `verification_required` ✖ |
| `GET /tasks/:id` | fetch-task-by-id ✔ | fetch-task-by-id ✔ | ✔ | ✔ | n/a | — (TASK_NOT_FOUND incl. stranger-client covered) | n/a; `executor`/`executorId` fields never asserted in e2e |
| `GET /tasks/:id/proof` | **NONE** | **NONE** | ✖ | ✖ | n/a | `TASK_NOT_FOUND` (3 branches) | ✖ |
| `POST /tasks/start` | start-task ✔ | start-task ✔ | ✔ + 3DS | ✔ | ✖ | `NO_SAVED_CARD_FOUND`, `PAYMENT_FAILED`, non-available task → `TASK_NOT_FOUND`, `STANDARD_ERROR` on mapping PK race | ✔ status, mapping, pending payment; **no** failure-path side effects (P1-2) |
| `POST /tasks/finish` | finish-task ✔ | finish-task ✔ | ~ (no file only) | ✔ | ✖ | `TASK_MAPPING_NOT_FOUND`, `FILE_FORMAT_NOT_SUPPORTED`, size limit, non-in_progress → `TASK_NOT_FOUND` | ✔ status/completedAt; `proofImageUrl` never set in any test |
| `POST /tasks/validate` | validate-task ✔ | validate-task ✔ | ✔ + rating | ✔ | ~ (rating 6, 4xx only); comment >500 ✖ | `TASK_MAPPING_NOT_FOUND`, `TASK_TRANSFER_FAILED` (+ no state change), `stripeAccountId: null` variant, double-validate | ✔ status, transferId, fees, wallet, counter, rating avg |
| `POST /tasks/cancel` | cancel-task ✔ | cancel-task ✔ | ✔ (3 variants) | ✔ | ✖ | `TASK_NOT_FOUND`, `REFUND_FAILED` (+ task unchanged), `verification_required` → 403, 1h boundary | ✔ status, canceledAt, refundId |
| `POST /card/create` | create-user-payment-method ✔ | create-card ✔ | ✔ (create path) | ✔ | ~ (4xx only) | update-existing-card path, `CARD_CREATION_FAILED`, `USER_NOT_FOUND` (no customerId) | ✔ card row |
| `GET /card/fetch` | fetch-user-card ✔ | fetch-card ✔ | ✔ | ✔ | n/a | — | n/a |
| `DELETE /card/:id` | delete-user-card ✔ | delete-card ✔ | ✔ | ✔ | n/a | Stripe detach failure (service does not catch — 500) | ✔ isDeleted, hidden from fetch |

**Webhook `POST /stripe/webhook`** (unit: `dispatch-stripe-event.service.spec.ts` + one spec per handler; e2e: `stripe-webhook.e2e-spec.ts`):

| Event / path | Unit | E2E | Side effects asserted in DB | Not covered |
| --- | --- | --- | --- | --- |
| missing signature → `WEBHOOK_INVALID_SIGNATURE` | ✔ | ✔ | n/a | `WEBHOOK_MISSING_RAW_BODY` (not reachable via supertest) |
| bad signature | ✔ | ✔ | n/a | — |
| idempotency (`stripe_events`) | ✔ | ✔ | ✔ one row | — |
| `payment_intent.succeeded` | ✔ | ✔ | ✔ status | already-`refunded` payment stays untouched (status filter) ✖ |
| `payment_intent.payment_failed` | ✔ | ✔ | ✔ task→available, mapping deleted, payment failed | arriving after client cancel (would re-open a `canceled` task) ✖ |
| `charge.refunded` | ✔ | ✔ | ✔ status + refundId | expanded `payment_intent` object (unit only) |
| `charge.dispute.created` | ✔ (Prisma mock) | **NONE** | ✖ | wallet decrement on completed task; no-reverse branches |
| `account.updated` → ready | ✔ | ✔ | ✔ | flags false → `stripeAccountReady=false` (unit only) |
| `payout.failed` | ✔ | ✔ | ✔ reversal, wallet, counter, status, transferId null | real Stripe `source` shape (P1-3); `reverseTransfer` throws → nothing changes (unit only); no mapping |
| unhandled type → 200 + stored | ✔ | ✖ | ✖ | — |

### 5.2 Weak tests (summary; details in §3)
- Status-range-only validation tests: 7 (P2).
- Pass-through unit specs: 8 suites (P3).
- `toBeInstanceOf(AppException)` only: 2 (P3).
- Expectations that contradict or hard-code questionable service behaviour: `update-profile.service.spec.ts:64-72` (`avatarUrl: ''`), `finish-task.service.spec.ts:94-113` (asserts no 1h cutoff vs SPEC), `handle-payout-failed.service.spec.ts:27-28` + e2e `:223-227` (`source.object === 'transfer'`), `delete-account.e2e-spec.ts:103-114` vs `fetch-active-tasks.e2e-spec.ts:41-66` (opposite semantics, one fails), `test/factories/user.factory.ts:64` (payload drifted from `SessionPayload`).
- Dead/duplicated fixtures: `authenticate.service.spec.ts` local `makeUser`; `makeCard` ×3; `insertCode` ×2; `makePaymentRecord` in cancel spec vs `makePayment` in fetch-by-id spec; `createTask` status union missing `payout_failed`.
- Unreachable branch nobody can test: `finish-task.service.ts:26-28` (`taskNotAvailable` after a status-filtered fetch).

### 5.3 Determinism / isolation
- Isolation is sound: full TRUNCATE of all 8 tables before each test, in-band execution, per-suite app. No test depends on another's data. ✔
- Shared mutable state: `ctx.stripeMock` persists across tests within a suite; `clearMocks: true` clears calls but not `mockResolvedValueOnce` queues left by a failed test — a test that throws before the request consumes its `Once` value leaks it to the next test (`validate-task.e2e-spec.ts:22-25` and `delete-card.e2e-spec.ts:21` re-prime defensively; others do not).
- Time: cancel 1h tested only at 0h/2h; reset-code expiry and 15-min window never tested with past timestamps; `Date.now()`-based ids/emails (collision only in theory).
- Stripe mock realism: see P1-3 and P2 "mock defaults". Shapes services read that the mocks do provide: `client_secret`, `status: 'requires_action'`, `refunds.data[0].id`, `charges_enabled/payouts_enabled`, `event.account`. Not modelled: `latest_charge`, `balance_transaction`, `failure_code` on refunds, `requires_payment_method` on confirm (unit only).
- Filesystem: no e2e writes to `src/tmp` (no file upload test), so no cleanup issue today; once a file test is added it must clean `src/tmp/<taskId>`.
- Environment leakage: `load-env.ts` without `override` (P2-5); `test/.env.test` rewritten every run (P2-4).

---

## 6. Can the e2e suite run on this machine? CI readiness

**Yes.** `docker info` showed Server Version 29.9.2 (Docker Desktop). `npm run test:e2e` completed in 8.3 s wall-clock after image pull: 21/22 suites, 102/103 tests pass; the one failure is P1-1 above. `npx tsc --noEmit` fails with the single `user.factory.ts` error quoted at the top.

**CI config:** none. No `.github/workflows`, `.gitlab-ci.yml`, `.circleci`, `Dockerfile`, `.nvmrc` or `engines` field. Only `docker-compose.yml` for the local dev Postgres (bitnami image, not used by tests). Local Node is v26.13.0; `@types/node` is ^22 — pin a version.

**Minimal CI (GitHub Actions, `ubuntu-latest` has a Docker daemon so Testcontainers works unchanged):**
1. `actions/setup-node` (Node 22 LTS to match `@types/node`), `npm ci`.
2. `npx prisma generate` (required before `tsc`, unit and e2e; `postinstall` does not run it).
3. `npx tsc --noEmit` — currently red (P2-6); fix the factory first.
4. `npx eslint "{src,test}/**/*.ts"` **without `--fix`** (P3).
5. `npm test` (no env needed — unit specs never touch `AppModule`).
6. `npm run test:e2e` — needs only Docker; `global-setup` writes all env values itself. Add `test/.env.test` to `.gitignore` first so the job does not leave a dirty tree. If a Docker-less runner is ever used, replace Testcontainers with a `services: postgres:16` block and make `global-setup` honour a pre-set `DATABASE_URL` instead of starting a container.
7. Optional: `npm run test:cov` with a threshold; today `collectCoverageFrom` excludes modules/main/d.ts only — repositories and controllers would show near-zero line coverage from unit tests, which is accurate.

---

## 7. Questions for the owner

1. Should an `available` (posted, nobody accepted) task block `DELETE /auth/account`, or be auto-canceled on deletion? Today the code blocks; one e2e says it should not. (P1-1)
2. Is there a time limit for the proxy to **finish** a task (SPEC §7.2 says "até 1h"; code says none and a unit test asserts none)? If yes, `TASK_STARTED_AT_NOT_VALID` must be wired and tested; if no, remove it from the dictionary and SPEC.
3. Has `payout.failed` compensation ever been exercised against Stripe test mode? If not, P1-3 needs a real fixture before 1.0.

---

## 8. Tests that must be written before 1.0 (prioritized, implementable without re-reading the codebase)

Each item: behaviour → file. Use existing helpers `createTestApp/resetDatabase`, `createUser`, `createTask`, `ctx.stripeMock`, `ctx.notificationMock`. Expected statuses/codes are from `src/exception/error-dictionary.ts`.

1. **Fix the red suite** — decide P1-1, then in `test/auth/delete-account.e2e-spec.ts` seed only `completed`/`canceled` (or assert auto-cancel of the `available` task) so `npm run test:e2e` is green. Also add `stripeAccountReady: user.stripeAccountReady` to the payload in `test/factories/user.factory.ts:64` so `tsc` is green.
2. **`/tasks/start` failure paths leave the task untouched** → `test/tasks/start-task.e2e-spec.ts`: (a) owner has no card → 404 `NO_SAVED_CARD_FOUND`, task still `available`, no `user_task_mapping`, no `payments` row; (b) `ctx.stripeMock.createPaymentIntent.mockRejectedValueOnce(new Error())` → 402 `PAYMENT_FAILED`, same DB assertions; (c) `confirmPaymentIntent` → `{status:'requires_payment_method'}` → 402, payment row exists with `pending` (document current behaviour) and task state decided by owner. These fail today (P1-2) by design.
3. **`GET /auth/session/refresh`** → new `test/auth/refresh-session.e2e-spec.ts`: 401 without token; 200 returns `{ session }`; decode the JWT (`app.get(JwtService).decode`) and assert `stripeAccountReady`, `walletBalance`, `totalTasksCompleted` reflect DB values changed after the first token was issued; 401 after `DELETE /auth/account`.
4. **`GET /tasks/:id/proof`** → new `test/tasks/fetch-task-proof.e2e-spec.ts` + `src/modules/tasks/use-cases/fetch-task-proof.service.spec.ts`: 401; 404 when task has no `proofImageUrl`; 404 for a stranger (client or proxy); 200 with `Content-Type: image/png` and the file bytes for owner and for executor (write a tiny PNG to `src/tmp/<taskId>/x.png` in the test and remove it in `afterEach`); 404 when the DB path points to a missing file. Unit: the owner/executor/404 branches and `mimeTypeFromPath`.
5. **`/tasks/finish` with a real file** → `test/tasks/finish-task.e2e-spec.ts`: `.attach('file', Buffer, { filename:'p.jpg', contentType:'image/jpeg' })` → 200, `proofImageUrl` matches `/^<taskId>\/\d+-\d+\.jpg$/`, file exists on disk (clean up); `contentType: 'text/plain'` → 400 `FILE_FORMAT_NOT_SUPPORTED`, task still `in_progress`; HEIC accepted; task in `verification_required` → 404 `TASK_NOT_FOUND`; no mapping → 404 `TASK_MAPPING_NOT_FOUND`.
6. **`/tasks/validate` transfer failure is side-effect free** → `test/tasks/validate-task.e2e-spec.ts`: `createTransfer.mockRejectedValueOnce` → 500 `TASK_TRANSFER_FAILED`; task still `verification_required`, `transferId` null, wallet 0, counter 0, no rating. Plus: proxy with `stripeAccountReady: true` but `stripeAccountId: null` → 409; second validate on a `completed` task → 404; `comment` of 501 chars → 400.
7. **`charge.dispute.created` e2e** → `test/stripe-webhook/stripe-webhook.e2e-spec.ts`: (a) task `completed` with `proxyEarnings: 75.62`, mapping, proxy `walletBalance: 100` → payment `disputed`, wallet `24.38`; (b) task `in_progress` → payment `disputed`, wallet unchanged; (c) no payment row → 200, nothing changes. Also add "unhandled type → 200 and `stripe_events` row".
8. **`payout.failed` with the real Stripe shape** (after owner answers Q3) → same file: `listPayoutTransactions` resolving `{ data: [{ type:'payment', source:{ object:'charge', id:'py_1', source_transfer:'tr_payout_1' } }] }`; expect reversal. Keep the existing `transfer`-shaped test only if Stripe confirms it. Add `reverseTransfer.mockRejectedValueOnce` → 200, task still `completed`, wallet unchanged.
9. **Cancel edge cases** → `test/tasks/cancel-task.e2e-spec.ts`: `startedAt = now - 59 min` → 200; `now - 61 min` → 403; `verification_required` → 403; refund returns `{status:'pending'}` → 500 `REFUND_FAILED` and task still `in_progress`, `refundId` null; unknown task → 404.
10. **Password-reset time rules** → `verify-reset-code` / `reset-password` / `forgot-password` e2e: insert code with `expiresAt: now - 1 min` → 400 `PASSWORD_RESET_INVALID_CODE`; three codes with `createdAt: now - 16 min` → 200 (not 429); full flow: `forgot-password` → read plaintext from `ctx.notificationMock.sendResetCodeByEmail.mock.calls[0][1]` → `verify` → `reset` → login with new password → 200.
11. **Validation assertions** → the 7 files in P2 "status-range": change to `toBe(400)` + `body.message === 'Validation failed'`.
12. **Concurrency** → `test/tasks/start-task.e2e-spec.ts`: two proxies `Promise.all` on the same task → exactly one 200, exactly one `user_task_mapping`, `createPaymentIntent` called once. Expect it to fail today; it drives a `updateMany({ where:{ id, status:'available' } })` guard.
13. **Wallet atomicity** → `src/modules/auth/use-cases/update-wallet-balance.service.spec.ts`: assert the repository is called with an `{ increment: amount }` style argument (or a dedicated `incrementWalletBalance`), not a computed absolute value.
14. **Cards** → `test/cards/create-card.e2e-spec.ts`: user already has a card → row updated in place (still 1 row, new `stripeCardId`); `retrievePaymentMethod.mockRejectedValueOnce` → 400 `CARD_CREATION_FAILED`; `createUser({ stripeCustomerId: null })` → 404 `USER_NOT_FOUND`. `delete-card`: `detachPaymentMethod.mockRejectedValueOnce` → document the 500 and keep the row `isDeleted: false`.
15. **`/tasks/fetch` pagination and filters** → `test/tasks/fetch-tasks.e2e-spec.ts`: 11 tasks → page 1 returns 10, page 2 returns 1, `page=0` → 400; task whose owner is `isDeleted: true` is excluded; `city=são paulo` (lowercase) returns 0 (documents case sensitivity — owner decision whether that is a bug).
16. **Infra hygiene (not tests, but blockers for CI)**: gitignore `test/.env.test`; `override: true` in `load-env.ts`; default `refundPayment` mock `{ id, status:'succeeded' }`; `constructWebhookEvent` default throws; `randomUUID()` for webhook ids; `lint:check` script; pin Node version.
