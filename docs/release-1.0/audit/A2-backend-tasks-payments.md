# A2 — Backend audit: tasks lifecycle, payments, ratings

Auditor: A2 · Date: 2026-11-08 · Repo: `/Users/leandromartins/Documents/proxy-api` (branch `main`, HEAD `708e468`)

All paths below are relative to `/Users/leandromartins/Documents/proxy-api/` unless prefixed with `proxy-app/`.

---

## 1. Scope

Every file was opened in full (`cat -n`) and read line by line. Line counts from `wc -l`.

| File | Lines |
| --- | ---: |
| `src/modules/tasks/tasks.module.ts` | 86 |
| `src/modules/tasks/controllers/cancel-task.controller.ts` | 34 |
| `src/modules/tasks/controllers/create-task.controller.ts` | 68 |
| `src/modules/tasks/controllers/fetch-active-tasks.controller.ts` | 19 |
| `src/modules/tasks/controllers/fetch-task-by-id.controller.ts` | 22 |
| `src/modules/tasks/controllers/fetch-task-proof.controller.ts` | 37 |
| `src/modules/tasks/controllers/fetch-tasks.controller.ts` | 34 |
| `src/modules/tasks/controllers/finish-task.controller.ts` | 45 |
| `src/modules/tasks/controllers/start-task.controller.ts` | 34 |
| `src/modules/tasks/controllers/validate-task.controller.ts` | 36 |
| `src/modules/tasks/dtos/tasks-repository.dto.ts` | 29 |
| `src/modules/tasks/repository/tasks.repository.ts` | 305 |
| `src/modules/tasks/types/index.d.ts` | 157 |
| `src/modules/tasks/test-utils/task.factory.ts` | 43 |
| `src/modules/tasks/use-cases/create-task.service.ts` / `.spec.ts` | 59 / 106 |
| `src/modules/tasks/use-cases/fetch-tasks.service.ts` / `.spec.ts` | 24 / 45 |
| `src/modules/tasks/use-cases/fetch-active-tasks.service.ts` / `.spec.ts` | 14 / 37 |
| `src/modules/tasks/use-cases/fetch-task-by-id.service.ts` / `.spec.ts` | 59 / 170 |
| `src/modules/tasks/use-cases/fetch-task-proof.service.ts` (no spec) | 69 |
| `src/modules/tasks/use-cases/start-task.service.ts` / `.spec.ts` | 100 / 255 |
| `src/modules/tasks/use-cases/finish-task.service.ts` / `.spec.ts` | 71 / 156 |
| `src/modules/tasks/use-cases/validate-task.service.ts` / `.spec.ts` | 103 / 227 |
| `src/modules/tasks/use-cases/cancel-task.service.ts` / `.spec.ts` | 82 / 212 |
| `src/modules/payments/payments.module.ts` | 19 |
| `src/modules/payments/dtos/payments-repository.dto.ts` | 6 |
| `src/modules/payments/repository/payments.repository.ts` | 29 |
| `src/modules/payments/types/index.d.ts` | 25 |
| `src/modules/payments/use-cases/create-payment-record.service.ts` / `.spec.ts` | 14 / 31 |
| `src/modules/payments/use-cases/fetch-payment-record.service.ts` / `.spec.ts` | 13 / 45 |
| `src/modules/payments/use-cases/update-payment-record.service.ts` / `.spec.ts` | 13 / 30 |
| `src/modules/ratings/ratings.module.ts` | 11 |
| `src/modules/ratings/dtos/ratings-repository.dto.ts` | 7 |
| `src/modules/ratings/repository/ratings.repository.ts` | 33 |
| `src/modules/ratings/types/index.d.ts` | 7 |
| `src/modules/ratings/use-cases/rate-proxy.service.ts` / `.spec.ts` | 19 / 58 |
| `src/stripe/stripe.service.ts` | 156 |
| `src/stripe/types/index.d.ts` | 17 |
| `src/pipes/multer-validation.pipe.ts` | 48 |
| `src/modules/auth/use-cases/update-wallet-balance.service.ts` | 29 |
| `src/modules/auth/use-cases/update-total-tasks-completed.service.ts` | 27 |
| `src/modules/auth/use-cases/update-total-tasks-created.service.ts` | 27 |
| `prisma/schema.prisma` (whole file; focus on Users/Tasks/Payments/Ratings/UserTaskMapping) | 205 |

Read for context (not in slice, needed to follow calls): `src/stripe/stripe.module.ts`, `src/pipes/zod-validation.pipe.ts`, `src/exception/*.ts`, `src/prisma/prisma.service.ts`, `src/main.ts`, `src/app.module.ts`, `src/modules/cards/use-cases/create-user-payment-method.service.ts`, `src/modules/cards/use-cases/fetch-user-card.service.ts`, `src/modules/cards/repositories/cards.repository.ts`, `src/modules/auth/use-cases/fetch-user-details.service.ts`, `src/modules/auth/repository/auth.repository.ts` (lines 44-80), `src/modules/auth/utils/jwt.strategy.ts`, `src/modules/auth/types/index.d.ts`, all `src/modules/stripe-webhook/use-cases/*.service.ts`, `test/tasks/*.e2e-spec.ts` (test names + start/validate/cancel/fetch happy paths), `test/factories/task.factory.ts`, `test/mocks/stripe.mock.ts`, `tsconfig.json`, `.gitignore`, `proxy-app/SPEC.md` §3.3, §3.4, §4.2, §7.2, §7.3, §8.8–8.11, §9, `proxy-app/app/(app)/tasks/[id]/index.tsx` lines 95-115 (to confirm how the app consumes `requires_action`).

Runtime checks executed (read-only): `npx tsc --noEmit --skipLibCheck false` and a `node -e` script exercising `Prisma.Decimal` arithmetic against the generated client. Nothing was edited. Unit/e2e suites were not re-run (brief already established the unit results; e2e needs Docker).

---

## 2. How it works (as the code actually behaves)

### Routing and auth

All nine task routes are `@UseGuards(JwtAuthGuard)`; the user comes from the JWT (`SessionPayload`, `jwt.strategy.ts:10-30`) and the strategy re-checks `Users.isDeleted` on every request. `userType` is read from the JWT only in `fetch-task-by-id` (`fetch-task-by-id.controller.ts:19`); every other role decision is made against the DB (`start-task.service.ts:39-42`) or implicitly via ownership/mapping.

### `POST /tasks/create` (`create-task.controller.ts`, `create-task.service.ts`)

Zod schema (`create-task.controller.ts:11-30`): `title`, `description` are bare `z.string()` (empty allowed); `address.{city,state,street,zipCode}` strings, `locationLat/Lng` `z.number()` (no range); `pricing.offeredPrice` is `z.number()` — **no minimum, no positivity, no decimal-places check**; `cardDetails` is a required object whose two keys are both optional, so `cardDetails: {}` is valid. **No role check** — a PROXY can create tasks.

Service order (`create-task.service.ts:34-57`): (1) composes `locationAddress = "street, city - state, zipCode"` (line 34); (2) **inserts the task** with `title, owner, description, locationLat, locationLng, offeredPrice, locationAddress` (lines 36-44 → `tasks.repository.ts:32-42`) — city/state/zip are not persisted separately, only inside the string; (3) *then* calls `CreateUserSourceService` (lines 46-50) which, for `savedCard`, only checks the saved card row matches (`create-user-payment-method.service.ts:33-42`), for `token` retrieves + attaches the PaymentMethod to the customer (lines 44-84), and for `{}` or both-set **returns `null` without doing anything** (line 86); (4) increments `totalTasksCreated` (atomic `{ increment }`, `auth.repository.ts:65-70`). No PaymentIntent, no SetupIntent, no authorization hold at create time; the card is only used at `start`. Returns `{ id }`.

### `GET /tasks/fetch?city=&page=` (`fetch-tasks.*`)

`page` defaults to `'1'`, is `Number()`-coerced and must be `>= 1` (`fetch-tasks.controller.ts:10-15`); `perPage` is hard-coded 10, `skip = (page-1)*10` (`fetch-tasks.service.ts:14-15`). Repository (`tasks.repository.ts:81-88`): `status: 'available'`, owner not deleted, `locationAddress: { contains: city }` — Postgres `contains` without `mode: 'insensitive'` is **case-sensitive substring on the composed address string**. Ordered `createdAt desc`. Returns the array only (no total/hasMore). Any authenticated user (CLIENT or PROXY) can call it. The selected `ownerId` relation includes `email`, `phoneNumber`, `stripeCustomerId` (`tasks.repository.ts:66-79`). Single query, no N+1.

### `GET /tasks/active`

`tasks.repository.ts:191-218`: owner → statuses `available | accepted | on_the_way | in_progress | verification_required`; executor (via `userTaskMappings.some`) → `accepted | on_the_way | in_progress | verification_required`. **Drift**: `CLAUDE.md:111` says "status ∈ accepted | on_the_way | in_progress | verification_required" — owners also get `available` (the e2e test `fetch-active-tasks.e2e-spec.ts:41` asserts the code behaviour, so the doc is the stale side).

### `GET /tasks/:id`

`fetch-task-by-id.service.ts:33-57`: loads the task with no status filter; if `userType === 'CLIENT'` and not owner → 404 (`:39-41`). **A PROXY may read any task in any status**, including other proxies' completed tasks. Then `Promise.all` of `payments.findFirst({ where: { taskId } })` (`payments.repository.ts:16-18`, no `orderBy`) and the mapping; executor counterpart (`id, name, avatarUrl, isVerified, rating`) is fetched separately (`tasks.repository.ts:231-244`). Response = task fields selected in `fetchTaskById` (`tasks.repository.ts:121-150`: **no `completedAt`, `canceledAt`, `transferId`**) + `payment` (full row incl. `paymentIntent`) + `executorId` + `executor`.

### `GET /tasks/:id/proof`

`fetch-task-proof.service.ts:26-59`: owner or executor only (404 otherwise); file is resolved as `join(process.cwd(), 'src', 'tmp', task.proofImageUrl)` (lines 45-50) and streamed with a MIME derived from the file extension (`:63-69`), `Cache-Control: private, max-age=300`. Images live **on local disk**, gitignored (`.gitignore` last line `src/tmp/`). The app builds `${baseURL}/tasks/${taskId}/proof` with the bearer header (`proxy-app/src/feature/tasks/utils/proof.ts:18`).

### `POST /tasks/start` (`start-task.service.ts`)

1. Load task **with `status: 'available'`** (lines 26-29) → 404 otherwise. Owner cannot start own (34-36). DB-checked `userType === 'PROXY' && stripeAccountReady` (39-42) else 403 `USER_NOT_PROXY`.
2. **Mutations before any payment** (44-50): `updateTaskStatus({ status: 'in_progress', startedAt: now })` — an unconditional `update where id` (`tasks.repository.ts:92-103`), *not* a conditional "where status = available" — then `insertTaskUserMapping` (PK on `taskId`, `schema.prisma:131`).
3. Owner's card (52-53): `FetchUserCardService` throws `NO_SAVED_CARD_FOUND` if none — **after** step 2.
4. Stripe (57-98): `paymentIntents.create({ payment_method_types: ['card'], amount: taskDetails.offeredPrice * 100, currency: 'brl', customer, payment_method: savedCard, setup_future_usage: 'off_session' })` (`stripe.service.ts:68-75`) — **no `confirm`, no `off_session: true`, no `capture_method: 'manual'`, no `idempotency_key`, no `transfer_group`/`metadata`**. So this is an immediate charge, not a pre-authorisation, despite comments ("pre-authorized payment", `cancel-task.service.ts:49`). `offeredPrice` here is a **`Prisma.Decimal` object**, not a number (see finding P0-2). Then `Payments` row inserted as `pending` (68-72), then `paymentIntents.confirm(id, { payment_method })` (74-77, `stripe.service.ts:78-82`). `succeeded` → `{status:'succeeded'}`; `requires_action` → `{status:'requires_action', clientSecret}` **returned to the PROXY's device**; anything else or any throw → `PAYMENT_FAILED` (402). **There is no cleanup on failure**: the task stays `in_progress`, the mapping stays, and the `pending` payment row (if it got that far) stays. Only the `payment_intent.payment_failed` webhook (`handle-payment-failed.service.ts:18-30`) reverts — and only if a `Payments` row with that PI exists.

### `POST /tasks/finish` (multipart)

`FileInterceptor('file')` with `multerOptions` (`finish-task.controller.ts:33`, `multer-validation.pipe.ts:23-48`): memory storage, 10 MB limit, `fileFilter` on the **client-supplied `file.mimetype`** (jpeg/png/webp/heic/heif) — no magic-byte sniffing. The file is optional (`file ?? null`, controller line 43). Service (`finish-task.service.ts:19-69`): task loaded with `status: 'in_progress'` (the extra `status !== 'in_progress'` check at 26-28 is unreachable); executor must match mapping; **no time cutoff** (commit `d20bae9` removed it; the dictionary entry `TASK_STARTED_AT_NOT_VALID`, `error-dictionary.ts:123-128`, is now dead and SPEC §7.2 "até 1h" is stale). File is written synchronously to `src/tmp/<taskId>/<ts>-<rand>.<ext>` (54-58), then `updateTaskStatus({ status: 'verification_required', completedAt: now, filePath })`. Payment status is **not** checked.

### `POST /tasks/validate` (`validate-task.service.ts`)

Task loaded with `status: 'verification_required'`; owner only; mapping required; proxy must have `stripeAccountReady && stripeAccountId` (50-52, 409). **Payment status is never consulted.** Fee math (54-57) on the Decimal-coerced price: `stripeFee = price*0.0399 + 0.39`, `platformFee = price*0.2`, `proxyEarnings = price - stripeFee - platformFee` — the **proxy absorbs the Stripe fee**; the platform keeps a clean 20 %. Then `transfers.create({ amount: Math.round(proxyEarnings*100), currency:'brl', destination, metadata:{taskId} })` (`stripe.service.ts:90-101`) — **no idempotency key, no `source_transaction`, no `transfer_group`**. Only after the transfer succeeds: `tasks.update where id` with `status: 'completed', platformFee, proxyEarnings, transferId` (unconditional, `tasks.repository.ts:246-259`), `totalTasksCompleted += 1` (atomic), `walletBalance = read + proxyEarnings` (**non-atomic read-modify-write**, `update-wallet-balance.service.ts:25-27`), and optional rating insert + `AVG(score)` written to `Users.rating` (`rate-proxy.service.ts:12-17`). No transaction wraps the four writes. `stripeFee` is not persisted (matches `CLAUDE.md:141`).

### `POST /tasks/cancel` (`cancel-task.service.ts`)

Owner only; status must be `available` or `in_progress` (34-36); for `in_progress`, `differenceInHours(now, startedAt) >= 1` → 403 (39-47). Then `payments.findFirst({ taskId })`; if a row exists **regardless of its status**, `refunds.create({ payment_intent })` (full refund, `stripe.service.ts:84-88`) and anything other than `refund.status === 'succeeded'` → 500 `REFUND_FAILED` (54-67). Then `updateTaskStatus({ status: 'canceled', canceledAt })` and `payments.updateMany({ where: { taskId }, data: { ...paymentRecord, refundId } })` (75-80) — spreads the whole stale row (including `status`) back. **Cancel never sets `status: 'refunded'` itself**, relying on the `charge.refunded` webhook. The `UserTaskMapping` row is **not** deleted on cancel.

### Decimal handling

Prisma returns `Decimal` objects for `offeredPrice`, `proxyEarnings`, `platformFee`, `walletBalance`, `rating`, lat/lng. The code does `offeredPrice * 100`, `offeredPrice * 0.0399 + 0.39`, `offeredPrice - a - b` directly on the object; JS coerces via `Decimal.prototype.valueOf()` (a string) → number, so it "works" but goes through IEEE-754 floats. `Decimal + number` yields a **string** (`"12.345"`), though no `+` on a Decimal exists in this slice today. The TypeScript type `Decimal` used in `src/modules/tasks/types/index.d.ts:65-69,83,96-101,136` **is not imported or declared anywhere**; with `skipLibCheck: true` (`tsconfig.json:19`) tsc silently treats it as an error/`any` type (confirmed: `npx tsc --noEmit --skipLibCheck false` reports 12× `TS2304: Cannot find name 'Decimal'`). That is why `offeredPrice * 100` type-checks and why unit tests can pass plain numbers (`task.factory.ts:8-13`).

### Code vs docs disagreements found

- `CLAUDE.md:111` `/tasks/active` status list omits `available` for owners (code includes it).
- `CLAUDE.md:111` and `error-dictionary.ts:218-223` say JPG/PNG/WEBP; `multer-validation.pipe.ts:32-38` also accepts HEIC/HEIF.
- `CLAUDE.md:139` "Clients pay via PaymentIntent with a saved card" is true, but comments in `start-task.service.ts:55` / `cancel-task.service.ts:49` call it "pre-authorized" — there is no manual capture; it is a captured charge.
- SPEC §7.2 "Proxy envia foto de prova (até 1h)" — no cutoff exists since `d20bae9`.
- SPEC §8.10 multipart field is `photo` and the photo is mandatory; backend field is `file` (`finish-task.controller.ts:33`) and optional.
- SPEC §4.2 `Task` has `completedAt`, `canceledAt`; `GET /tasks/:id` / `/fetch` / `/active` never select them.
- SPEC §3.3 `PROXY_ACCOUNT_NOT_READY` and `USER_HAS_ACTIVE_TASKS` messages differ from `error-dictionary.ts:148-153, 58-63` (copy changed in `e93d6a6`).
- SPEC §8.8 "Valor ≥ R$ 10,00" is client-side only; backend has no minimum.

---

## 3. Findings

### [P0] `validate` pays the proxy without ever checking that the client was charged

File: `src/modules/tasks/use-cases/validate-task.service.ts:28-81`
Evidence:
```ts
const taskDetails = await this.tasksRepository.fetchTaskById({ taskId, status: 'verification_required' })
...
const proxy = await this.fetchUserDetailsService.execute(taskMapping.executorId)
if (!proxy || !proxy.stripeAccountReady || !proxy.stripeAccountId) { throw ... }
// offeredPrice - stripe fee (3.99% + R$ 0.39) - platform fee (20%) = proxy net
const stripeFee = taskDetails.offeredPrice * 0.0399 + 0.39
...
const transfer = await this.stripeService.createTransfer({ amount: Math.round(proxyEarnings * 100), ... })
```
Nothing in the service (nor in `finish-task.service.ts`) reads `Payments.status`. Why it matters: a task reaches `verification_required` whenever `start` returned `requires_action` (payment row stays `pending`, see P1-1), or when `start` failed after the status flip (P0-3), or when the `payment_intent.payment_failed` webhook is late/undelivered. In all those cases the client was **never charged** but `transfers.create` moves `proxyEarnings` from the **platform's own balance** to the proxy. The client who owns the task is the one who clicks validate, so a client can obtain free work and the platform pays the proxy. Direct money loss. Suggested fix: in `validate` load the payment row for the task and require `status === 'succeeded'` (else 409 `PAYMENT_NOT_CONFIRMED`); optionally also gate `finish` on it. Pass `source_transaction: <chargeId>` on the transfer so Stripe itself ties the payout to a real charge. Confidence: high.

### [P0] `offeredPrice * 100` on a `Prisma.Decimal` produces non-integer centavos for ~9 % of prices → Stripe rejects, task left `in_progress`

File: `src/modules/tasks/use-cases/start-task.service.ts:58-62`; type hole at `src/modules/tasks/types/index.d.ts:67` + `tsconfig.json:19`
Evidence:
```ts
const paymentIntent = await this.stripeService.createPaymentIntent({
  savedCard,
  amount: taskDetails.offeredPrice * 100,
  customer: String(taskDetails.ownerId.stripeCustomerId),
})
```
`taskDetails.offeredPrice` is a `Decimal` at runtime (`schema.prisma:86 offeredPrice Decimal @db.Decimal(10, 2)`); `*` coerces through `valueOf()` → string → float. Verified against the generated client: `new Prisma.Decimal('10.03') * 100 === 1002.9999999999999`; of all 2-decimal prices between R$ 10,00 and R$ 1.000,00, **9 040 / 99 001 (9.1 %)** yield a non-integer. Stripe's `amount` must be an integer; the API returns `Invalid integer: 1002.9999999999999` → caught at line 95-98 → `PAYMENT_FAILED`. Because the status flip and mapping already happened (lines 44-50), the task is now stuck `in_progress` with a mapped proxy and no payment row (see P0-3). The unit/e2e suites never see this because the factories use plain numbers (`task.factory.ts:13 offeredPrice: 100`, e2e `offeredPrice: 100`), and tsc cannot flag it because `Decimal` is an undeclared name hidden by `skipLibCheck`. Why it matters: roughly one in eleven real prices (anything like R$ 25,03, R$ 49,90 …) cannot be started at all and corrupts state. Suggested fix: `amount: new Prisma.Decimal(taskDetails.offeredPrice).mul(100).toDecimalPlaces(0).toNumber()` (or `Math.round(Number(offeredPrice) * 100)`); import `Prisma.Decimal` in `tasks/types/index.d.ts`; make factories use `new Decimal(...)`. Confidence: high (reproduced).

### [P0] `start` mutates task + mapping before the card/Stripe path; any failure leaves an unrecoverable `in_progress` task

File: `src/modules/tasks/use-cases/start-task.service.ts:44-98`
Evidence:
```ts
await this.tasksRepository.updateTaskStatus({ taskId, status: 'in_progress', startedAt: new Date() })
await this.tasksRepository.insertTaskUserMapping(taskId, userId)
const ownerCard = await this.fetchUserCardService.execute(taskDetails.owner)   // throws NO_SAVED_CARD_FOUND
...
} catch (error) {
  if (error instanceof AppException) throw error
  throw new AppException(errorDictionary.payment.paymentFailed)
}
```
No `try/finally`, no transaction, no revert. Failure modes that leave the task `in_progress` + mapped with **no** `Payments` row (so the `payment_failed` webhook cannot revert either, `handle-payment-failed.service.ts:11-16` returns early): owner has no card (line 52), `paymentIntents.create` throws (card declined at create, network, the integer bug above), or the `Payments` insert fails. With a `pending` row and a synchronous decline at `confirm`, recovery depends entirely on webhook delivery. Consequences: the proxy sees the task as theirs and can `finish` it; the client can only `cancel` within 1 h, and cancel itself fails if any payment row exists (P1-2); after 1 h nobody can move the task and `validate` would pay out (P0-1). Why it matters: card declines are an everyday event on a main flow; this is persistent data corruption. Suggested fix: do the Stripe create+confirm first, then flip status + insert mapping in one `$transaction` with `updateMany({ where: { id, status: 'available' } })` and bail out if `count === 0`; on any Stripe error after a PI was created, cancel the PI (`paymentIntents.cancel`) and mark the payment `failed`. Confidence: high.

### [P1] 3DS (`requires_action`) is a dead end: the `clientSecret` goes to the proxy, the cardholder never sees the challenge

File: `src/modules/tasks/use-cases/start-task.service.ts:87-92`; `src/stripe/stripe.service.ts:68-82`; consumer `proxy-app/app/(app)/tasks/[id]/index.tsx:104-107`
Evidence:
```ts
if (confirmation.status === 'requires_action') {
  return { status: 'requires_action', clientSecret: confirmation.client_secret ?? null }
}
```
```tsx
if (result.status === 'requires_action') {
  toast.success('Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.')
```
The PI is confirmed server-side on the **proxy's** request, without `off_session: true`, so Stripe treats it as a customer-present payment and may demand 3DS. The secret is returned to the proxy; the client has no endpoint that exposes it (`GET /tasks/:id` embeds the `Payments` row with `paymentIntent` id but not the secret, and a secret cannot be rebuilt client-side). The app simply toasts and waits. The payment stays `pending`, the task `in_progress`, forever (until Stripe auto-cancels the PI ~24 h later → `payment_failed` webhook reverts to `available`, silently un-assigning a proxy who may have already done the work). SPEC §9.1 itself states most Brazilian cards have 3DS. Why it matters: main flow cannot complete for a large share of cards; combined with P0-1 it becomes a payout without a charge. Suggested fix (pick one): (a) make the charge merchant-initiated — `confirm: true, off_session: true` on create, and treat `requires_action` as failure (`PAYMENT_FAILED` + revert); card was attached under `setup_future_usage: 'off_session'`, so exemptions usually apply; or (b) move the charge/authorisation to task creation where the client is present (manual capture at `start`). Confidence: high.

### [P1] Double `validate` → double Stripe transfer (race + non-idempotent transfer + DB write after Stripe)

File: `src/modules/tasks/use-cases/validate-task.service.ts:28-31, 59-81`; `src/modules/tasks/repository/tasks.repository.ts:246-259`; `src/stripe/stripe.service.ts:90-101`
Evidence:
```ts
await this.prisma.tasks.update({ where: { id: taskId }, data: { status, platformFee, proxyEarnings, transferId } })
```
```ts
return await this.stripe.transfers.create({ amount, currency: 'brl', destination, metadata })  // no idempotencyKey
```
Two concurrent validates (double tap, retry after timeout) both read `verification_required`, both call `transfers.create`, both succeed; the second `update` fails on `transferId @unique` (`schema.prisma:90`) with a 500 **after** two transfers left the platform; `walletBalance`/`totalTasksCompleted` are then credited once or twice depending on timing. Same outcome if the DB `update` fails after a successful transfer: the task stays `verification_required` and the client retries. Why it matters: double payout to the proxy. Suggested fix: before Stripe, `updateMany({ where: { id, status: 'verification_required' }, data: { status: 'completed' } })` and abort if `count === 0`; pass `{ idempotencyKey: \`transfer:${taskId}\` }` as the second arg of `transfers.create`; persist `transferId` immediately after. Confidence: high.

### [P1] `cancel` refunds blindly: a `pending` (3DS) or `failed` payment row makes cancel impossible (500)

File: `src/modules/tasks/use-cases/cancel-task.service.ts:51-67`; `src/modules/payments/repository/payments.repository.ts:16-18`
Evidence:
```ts
const paymentRecord = await this.fetchPaymentRecordService.execute(taskId)
if (paymentRecord) {
  try {
    const refund = await this.stripeService.refundPayment(paymentRecord.paymentIntent)
    if (!refund || refund.status !== 'succeeded') throw new AppException(errorDictionary.payment.refundFailed)
```
`refunds.create` on a PaymentIntent that has no successful charge (status `requires_action`, `requires_payment_method`, `canceled`) is rejected by Stripe → `REFUND_FAILED` 500 → the client can never cancel. This hits exactly the states the client most needs to escape: 3DS never completed (P1-1), or a task that the `payment_failed` webhook already reverted to `available` (the `failed` row is still there, `handle-payment-failed.service.ts:19-22` only flips its status). Also: a legitimately `pending` refund (Stripe can return `pending` for cards) is treated as failure, the task is not cancelled, and the retry hits "charge already refunded". Why it matters: client-visible dead end on a main flow; blocks `DELETE /auth/account` as well (active-task check uses mappings). Suggested fix: branch on `paymentRecord.status`: `succeeded` → refund (accept `succeeded|pending`); `pending` → `paymentIntents.cancel(pi)`; `failed|refunded` → skip Stripe. Pick the latest row (`orderBy: { createdAt: 'desc' }`). Set `status: 'refunded'` locally instead of spreading the stale row. Confidence: high.

### [P1] PII leak: owner `email`, `phoneNumber`, `stripeCustomerId` and the `paymentIntent` id are returned to any PROXY, for any task

File: `src/modules/tasks/repository/tasks.repository.ts:66-79, 136-149, 176-189`; `src/modules/tasks/use-cases/fetch-task-by-id.service.ts:39-55`
Evidence:
```ts
ownerId: { select: { id: true, name: true, email: true, phoneNumber: true, avatarUrl: true, isVerified: true,
  rating: true, totalTasksCompleted: true, totalTasksCreated: true, stripeCustomerId: true } },
```
```ts
if (requester.userType === 'CLIENT' && task.owner !== requester.userId) { throw ... }   // PROXY: no check
...
return { ...task, payment, executorId, executor }
```
`/tasks/fetch` lists every available task with the owner's email, phone and Stripe customer id to every proxy (and to every client — the route has no role check). `/tasks/:id` lets any PROXY read any task id in any status (including other proxies' completed jobs) plus the `Payments` row (`paymentIntent` id, amount, status). `userType` here comes from the JWT, not the DB. Why it matters: LGPD exposure, enables off-platform contact/scraping, and leaks Stripe object ids. Suggested fix: a dedicated public-owner select (`id, name, avatarUrl, isVerified, rating, totalTasksCreated`); return `phoneNumber` only to the mapped executor while the task is active; embed `payment` only for the owner (or strip `paymentIntent`); restrict PROXY read of non-`available` tasks to the mapped executor. Confidence: high.

### [P1] Task is persisted before the card is validated; `cardDetails: {}` or `{token, savedCard}` is silently accepted

File: `src/modules/tasks/use-cases/create-task.service.ts:36-50`; `src/modules/tasks/controllers/create-task.controller.ts:26-29`; `src/modules/cards/use-cases/create-user-payment-method.service.ts:33-44, 86`
Evidence:
```ts
const task = await this.tasksRepository.create({ ... })        // persisted first
await this.createUserSourceService.execute({ token, userId, savedCard })   // may throw or return null
```
```ts
cardDetails: z.object({ savedCard: z.string().optional(), token: z.string().optional() }),
```
If the card step throws (`NO_SAVED_CARD_FOUND`, `CARD_CREATION_FAILED`) the client gets an error but the task is already `available` in the proxy feed; `totalTasksCreated` is not incremented, so counters drift. If neither or both keys are sent, `CreateUserSourceService` returns `null` (line 86) and the task is created with no card check at all. Either way, the next `start` by a proxy fails at `fetchUserCardService` **after** flipping the task (P0-3). Why it matters: orphan tasks that trap proxies. Suggested fix: validate/attach the card first, then insert; make `cardDetails` a discriminated union (`z.union([{savedCard}, {token}])`); wrap insert + counter in `$transaction`. Confidence: high.

### [P1] No server-side price validation: zero/negative/sub-R$0,52/3-decimal prices pass Zod and break Stripe math

File: `src/modules/tasks/controllers/create-task.controller.ts:22-24`; `src/modules/tasks/use-cases/validate-task.service.ts:54-57`
Evidence:
```ts
pricing: z.object({ offeredPrice: z.number() }),
```
```ts
const stripeFee = taskDetails.offeredPrice * 0.0399 + 0.39
const platformFee = taskDetails.offeredPrice * 0.2
const proxyEarnings = taskDetails.offeredPrice - stripeFee - platformFee
```
`offeredPrice: 0` or negative → Stripe `amount` invalid at start (after the status flip). `0.50` → `proxyEarnings = -0.00995` → `Math.round(-0.995) = -1` → Stripe rejects a negative transfer at validate. `10.005` → Postgres stores `10.01` (Decimal(10,2) rounding) but the row returned later is what's used, fine; values > 99 999 999.99 overflow `Decimal(10,2)` → Prisma 500. SPEC §8.8 promises ≥ R$ 10,00 only in the UI. Why it matters: money inputs must be validated server-side; several of these corrupt state via P0-3. Suggested fix: `offeredPrice: z.number().min(10).max(10000).multipleOf(0.01)` (or accept integer centavos). Confidence: high.

### [P1] Transfer is created from the platform's *available* balance; BRL card funds are not available for days → `TRANSFER_FAILED` on validate

File: `src/stripe/stripe.service.ts:90-101`; `src/modules/tasks/use-cases/validate-task.service.ts:59-73`
Evidence:
```ts
return await this.stripe.transfers.create({ amount: data.amount, currency: 'brl', destination: data.destination, metadata: data.metadata })
```
Without `source_transaction`, Stripe only allows a transfer if the platform's *available* BRL balance covers it; funds from a card charge made at `start` sit in *pending* balance until Stripe Brazil's settlement window (historically up to 30 days for cards, shorter by negotiation). With a fresh/low-volume platform balance, `validate` will fail with `insufficient funds` (`TASK_TRANSFER_FAILED` 500) and the client cannot complete the task. Why it matters: main flow blocked in production even though all code paths are "correct". Suggested fix: persist the charge id (or `latest_charge`) on `Payments` at start and call `transfers.create({ ..., source_transaction: chargeId })`, which lets the transfer settle with the charge; alternatively use `transfer_data.destination` + `application_fee_amount` on the PaymentIntent (destination charge) and drop the manual transfer. Confidence: medium (depends on the account's settlement terms; code-level fact is certain).

### [P2] `walletBalance` credit is a non-atomic read-modify-write

File: `src/modules/auth/use-cases/update-wallet-balance.service.ts:19-27`; `src/modules/auth/repository/auth.repository.ts:72-80`
Evidence:
```ts
const user = await this.authRepository.fetchUserDetailsById(userId)
const newBalance = (user.walletBalance?.toNumber() || 0) + amount
await this.authRepository.updateWalletBalance(userId, newBalance)
```
Two validates for the same proxy (different tasks) interleaving lose one credit; the webhook side correctly uses `{ decrement }` (`handle-charge-disputed.service.ts:61`). `handle-payout-failed.service.ts:61-65` has the same read-modify-write. Suggested fix: `data: { walletBalance: { increment: amount } }`. Confidence: high.

### [P2] `Payments` has no uniqueness per task; `findFirst` without `orderBy` returns an arbitrary row after a re-start

File: `prisma/schema.prisma:143-158`; `src/modules/payments/repository/payments.repository.ts:16-27`
Evidence:
```prisma
model Payments { id ... taskId String @db.Uuid  paymentIntent String ... }   // no @@unique, no @@index
```
```ts
return await this.prisma.payments.findFirst({ where: { taskId } })
await this.prisma.payments.updateMany({ where: { taskId }, data })
```
After a failed start + webhook revert + second proxy start there are two rows; `GET /tasks/:id` may embed the dead `failed` one, `cancel` may refund the wrong PI, and `updateMany` on cancel rewrites all rows. Suggested fix: `@@index([taskId])`, `@@unique([paymentIntent])`, read with `orderBy: { createdAt: 'desc' }`, update by `id`. Confidence: high.

### [P2] `cancel` writes the stale payment row back and never marks it `refunded`

File: `src/modules/tasks/use-cases/cancel-task.service.ts:75-80`
Evidence:
```ts
await this.updatePaymentRecordService.execute(taskId, { ...paymentRecord, refundId })
```
`paymentRecord` was read before the Stripe call and includes `status`, `id`, `createdAt`, `updatedAt`. If the `charge.refunded` webhook lands first (common with `stripe listen` locally), its `status: 'refunded'` is overwritten with the stale `succeeded`. Suggested fix: `{ refundId, status: 'refunded' }` only. Confidence: high.

### [P2] Two proxies starting the same task: second request 500s and overwrites `startedAt`

File: `src/modules/tasks/use-cases/start-task.service.ts:26-50`; `src/modules/tasks/repository/tasks.repository.ts:92-103`
Evidence:
```ts
const taskDetails = await this.tasksRepository.fetchTaskById({ taskId, status: 'available' })
...
await this.tasksRepository.updateTaskStatus({ taskId, status: 'in_progress', startedAt: new Date() })
await this.tasksRepository.insertTaskUserMapping(taskId, userId)
```
Both pass the read; both run the unconditional update (second one bumps `startedAt`, extending the client's cancel window); the second `insertTaskUserMapping` violates the PK and surfaces as a Prisma error → generic 500 `STANDARD_ERROR` instead of `TASK_NOT_AVAILABLE`. Fix as in P0-3 (conditional `updateMany` on status, map `P2002` to `TASK_NOT_AVAILABLE`). Confidence: high.

### [P2] `Decimal` type is undeclared; `skipLibCheck` hides it, so money code is effectively untyped

File: `src/modules/tasks/types/index.d.ts:65-69, 83, 96-101, 136`; `src/modules/auth/types/index.d.ts:17`; `tsconfig.json:19`
Evidence:
```
src/modules/tasks/types/index.d.ts(67,17): error TS2304: Cannot find name 'Decimal'.   // with --skipLibCheck false
```
Every `.d.ts` under `src/` is skipped by `skipLibCheck: true`, so `Decimal` (and `DocumentType` in auth types) resolve to an error type that behaves like `any`. That is the root cause for P0-2 compiling and for factories passing numbers. Suggested fix: `import type { Prisma } from '@prisma/client'` and `type Decimal = Prisma.Decimal` in the file (or rename the files to `.ts`); keep `skipLibCheck` for `node_modules` only is not possible, so move domain types out of `.d.ts`. Confidence: high.

### [P2] City filter is a case-sensitive substring on the composed address; no pagination metadata

File: `src/modules/tasks/repository/tasks.repository.ts:84`; `src/modules/tasks/use-cases/create-task.service.ts:34`
Evidence:
```ts
locationAddress: { contains: city },
```
`city=são paulo` matches nothing; `city=Rio` matches "Rio de Janeiro" and "Rua Rio Branco, Belo Horizonte - MG"; the composed string is the only place the city lives. The response is a bare array, so the app cannot know whether page N+1 exists except by `length < 10`. Suggested fix: persist `city`/`state` columns (indexed) and filter with equality; return `{ items, page, perPage, total }`. Confidence: high.

### [P2] Proof images on local disk, relative to `process.cwd()`, trusted MIME, synchronous writes

File: `src/modules/tasks/use-cases/finish-task.service.ts:49-61`; `src/modules/tasks/use-cases/fetch-task-proof.service.ts:45-50`; `src/pipes/multer-validation.pipe.ts:28-45`
Evidence:
```ts
const baseTmpPath = join(process.cwd(), 'src', 'tmp')
mkdirSync(taskFolderPath, { recursive: true })
writeFileSync(join(taskFolderPath, filename), file.buffer)
```
Files vanish on redeploy/scale-out; `src/tmp` is gitignored and not created by the build; the path depends on where `node dist/src/main` is launched from. `fileFilter` trusts `file.mimetype` (any payload can be uploaded with a spoofed header; served back with that MIME to the client's `<Image>`). `writeFileSync` of up to 10 MB blocks the event loop. If the DB update at line 64 fails the file is orphaned. Suggested fix for 1.0: S3/R2 with signed URLs, or at least an env-configured absolute dir + `file-type` magic-byte check + async `fs/promises`. Confidence: high.

### [P2] `GET /tasks/*` never returns `completedAt`, `canceledAt`, `transferId` though SPEC §4.2 lists them

File: `src/modules/tasks/repository/tasks.repository.ts:51-65, 121-135, 161-175`
Evidence:
```ts
select: { id, title, description, locationAddress, locationLat, locationLng, offeredPrice, proxyEarnings,
  platformFee, proofImageUrl, owner, createdAt, status, startedAt, ownerId: {...} }
```
The app's timeline/receipt (SPEC §8.9 items 4 and 7, §4.4 `date: completedAt`) cannot show completion/cancel times from this endpoint. Suggested fix: add the three fields to the shared select. Confidence: high.

### [P2] A PROXY can create tasks; role is never checked on `/tasks/create`

File: `src/modules/tasks/controllers/create-task.controller.ts:34-67`; `src/modules/tasks/use-cases/create-task.service.ts:17-58`
Evidence: no reference to `userType` in either file. SPEC §3.4 marks the route "(Cliente)". A proxy-owned task cannot be started by its owner, but pollutes feeds and counters. Suggested fix: load the user (DB) and require `userType === 'CLIENT'` → 403. Confidence: high.

### [P2] No idempotency keys on any Stripe mutation; `setup_future_usage` set on an already-saved card

File: `src/stripe/stripe.service.ts:63-101`
Evidence:
```ts
return await this.stripe.paymentIntents.create({ payment_method_types: ['card'], amount, currency: 'brl', customer, payment_method: savedCard, setup_future_usage: 'off_session' })
```
A network timeout on `paymentIntents.create`/`confirm`/`refunds.create`/`transfers.create` followed by a client retry creates a second object (double charge on start if the first confirm actually went through; double refund attempt; double transfer — see P1-2). `setup_future_usage` on a PM already attached is redundant and can raise SCA likelihood. Suggested fix: pass `{ idempotencyKey }` derived from `taskId` (+ attempt) on every call; drop `setup_future_usage`. Confidence: high.

### [P2] `PrismaService` is instantiated per module (separate connection pools); `PaymentsModule` providers are unused

File: `src/modules/tasks/tasks.module.ts:48-72`; `src/modules/payments/payments.module.ts:9-18`; `src/modules/ratings/ratings.module.ts:8`; `src/app.module.ts:18-21`; `src/prisma/prisma.service.ts:7-18`
Evidence:
```ts
providers: [EnvService, PrismaService, AuthRepository, TasksRepository, CardsRepository, ... PaymentsRepository, ...]
```
Each module that lists `PrismaService` gets its own `PrismaClient` (+ `new PrismaPg` adapter, and `prisma.service.ts:9` even constructs a throwaway `new PrismaClient({ adapter })`). `PaymentsModule` registers `CreatePaymentRecordService` but exports nothing and nobody imports it; `TasksModule` re-provides the payments services itself. Suggested fix: a global `PrismaModule`; make `PaymentsModule` export its services and import it from `TasksModule`. Confidence: high.

### [P2] Four post-transfer writes in `validate` are not transactional

File: `src/modules/tasks/use-cases/validate-task.service.ts:75-101`
Evidence:
```ts
await this.tasksRepository.validateTaskCompletion({...})
await this.updateTotalTasksCompletedService.execute({...})
await this.updateWalletBalanceService.execute({...})
if (rating !== undefined) { await this.rateProxyService.execute({...}) }
```
A failure in step 2-4 (e.g. `Ratings.taskId @unique` violation on a retry, DB blip) returns 500 to the client after the task is already `completed` and the money moved; wallet/counter may be left uncredited and the client cannot retry (status no longer `verification_required`). Suggested fix: `$transaction` for the DB writes; make the rating insert `upsert`/ignore-duplicate. Confidence: high.

### [P3] Dead code and stale dictionary entries

File: `src/modules/tasks/use-cases/finish-task.service.ts:26-28` (unreachable `status !== 'in_progress'` — query already filters); `src/exception/error-dictionary.ts:123-128` (`TASK_STARTED_AT_NOT_VALID`, unused since `d20bae9`), `:130-134` (`TASK_NOT_AVAILABLE_FOR_VALIDATION`, never thrown — validate returns 404 instead; SPEC §8.9 tells the app to expect it), `:169-173` (`payment.transferFailed`, duplicate of `tasks.transferFailed`), `:218-223` (message says JPG/PNG/WEBP, HEIC/HEIF accepted); `src/pipes/multer-validation.pipe.ts:18-19` (`imageExtensionFromMime` returning `null` would produce `"<unique>null"` filename — unreachable today). Suggested fix: delete or align. Confidence: high.

### [P3] Docs drift (CLAUDE.md / SPEC)

Files: `CLAUDE.md:111` (`/tasks/active` statuses; MIME list), `CLAUDE.md:139-141` wording "pre-authorized"; `proxy-app/SPEC.md` §7.2 "até 1h" on finish, §8.10 field `photo` (backend: `file`) and mandatory photo (backend: optional), §3.3 messages for `PROXY_ACCOUNT_NOT_READY` / `USER_HAS_ACTIVE_TASKS`, §4.2 missing `payout_failed`, `executor`, `executorId`, `payment`. Confidence: high.

### [P3] `fetch-task-by-id` trusts `userType` from the JWT

File: `src/modules/tasks/use-cases/fetch-task-by-id.service.ts:39`; `src/modules/tasks/controllers/fetch-task-by-id.controller.ts:17-20`
A stale token issued before a profile change keeps the old role. Low impact given P1-4 already lets any PROXY read anything; fix together. Confidence: medium.

### [P3] `String(taskDetails.ownerId.stripeCustomerId)` turns `null` into `"null"`

File: `src/modules/tasks/use-cases/start-task.service.ts:61`
`create-account.service.ts:37-50` aborts signup when Stripe fails, so today every user has a customer id; the cast only hides a future bug. Suggested fix: throw `NO_SAVED_CARD_FOUND`/`USER_NOT_FOUND` if null. Confidence: low (not reachable with current data).

---

## 4. Gaps vs MVP (SPEC references)

- **§7.3 step 2 / §9.1-2 — 3DS**: backend returns `requires_action` to the wrong party and has no way to hand the secret to the client; no polling target other than `GET /tasks/:id.payment.status`. Not implementable as specified (P1-1).
- **§7.3 step 4 — "valor fica retido … só é repassado quando você validar"** (also §8.8 disclaimer): there is no hold; the card is captured at `start` and refunded on cancel. The platform eats the Stripe fee on every cancel (Stripe does not return processing fees on refunds).
- **§8.8 — Valor ≥ R$ 10,00**: not enforced server-side (P1-6).
- **§8.8 — PriceBreakdown "Total a pagar: R$ W"**: the backend charges exactly `offeredPrice`; Stripe + platform fees come out of the proxy's side. If the UI shows a total above `offeredPrice`, it disagrees with what is charged.
- **§8.10 — photo mandatory, field `photo`**: backend accepts no file and expects `file`.
- **§8.9 — "Contestar conclusão"**: no backend route (SPEC itself defers it; fine).
- **§4.2 — `completedAt`, `canceledAt`**: not returned (P2-7).
- **§3.4 — `GET /tasks/fetch` (Proxy)**: no role gating; any client can list and read all owners' contact data (P1-4).
- **§8.11 — "Saldo derivado do JWT"**: `walletBalance` is updated in DB on validate but the JWT is only refreshed via `/auth/refresh`; out of slice, but the non-atomic credit (P2-1) can make that number wrong.
- Pagination metadata (total / hasMore) is not provided for §8.7's infinite list.

---

## 5. Test coverage

**Unit (`*.spec.ts`)** — all mock the repositories with plain numbers (`task.factory.ts`), so no test exercises `Decimal` behaviour.

- `create-task`: address composition, forwarding to card service, counter increment, return value. **Not covered**: ordering (task persisted before card check), `cardDetails: {}` path, role.
- `fetch-tasks`: skip math, pass-through. **Not covered**: city semantics (repository is not unit-tested anywhere).
- `fetch-active-tasks`: pass-through only.
- `fetch-task-by-id`: role checks, payment/executor embedding, 404. **Asserts the PII-leaking behaviour as correct** ("lets a PROXY view a task owned by any user").
- `fetch-task-proof`: **no spec at all**.
- `start-task`: 404, own task, not proxy, onboarding, happy path, `requires_action`, three failure shapes. **Wrong-ish assertion**: `createPaymentRecordService ... amount: 100` relies on a number; the real value is a `Decimal`. **Not covered**: that status/mapping are written *before* Stripe and left dirty on failure (the tests assert `updateTaskStatus` *not* called only for pre-Stripe validation errors), concurrency, no-card path.
- `finish-task`: 404, mapping, executor mismatch, no-cutoff, no-file, file write. **Not covered**: MIME/extension mapping, DB-failure-after-write.
- `validate-task`: 404, ownership, mapping, account-not-ready, transfer failure, happy path (fee math asserted by recomputing the same float formula — tautological), rating on/off. **Not covered**: payment status (there is none to cover), double validate, DB failure after transfer, rounding edge cases (R$ 0,50, R$ 10,03).
- `cancel-task`: 404, ownership, terminal, >1 h, available/no payment, in_progress/no payment, happy refund, `pending` refund → failure, Stripe throw. **Asserts questionable behaviour**: `pending` refund treated as failure; happy path asserts the stale-spread `{...paymentRecord, refundId}`.
- payments/ratings specs: pure pass-through; `rate-proxy` covers average recompute.

**E2E (`test/tasks/*.e2e-spec.ts`, Stripe mocked)** — 401 + 404 + one domain error + one happy path per route; `fetch-tasks` city test uses `locationAddress: 'São Paulo'` vs `'Rio'` so it never exercises substring/case problems; `start-task` happy path asserts `amount: 100 * 100` with a mock that never validates integers; `validate` happy path asserts `7562` for R$ 100 (an integer-friendly price); `cancel` happy path seeds a `pending` payment row and a mocked `succeeded` refund — i.e. it passes precisely the scenario (refund of a `pending` PI) that real Stripe rejects. No e2e for `/tasks/:id/proof`, for a `failed` payment row on cancel, for a PROXY creating a task, or for concurrent start/validate.

---

## 6. Questions for the owner

1. Who should absorb the Stripe processing fee (a) on normal completion (today: the proxy) and (b) on a client cancel after the charge (today: the platform, since the refund is full)? The PriceBreakdown in SPEC §8.8 suggests the client pays it on top.
2. Should the proxy who already started (within the 1 h window) receive anything when the client cancels an `in_progress` task?
3. Intended 3DS design: merchant-initiated off-session charge at `start` (fail fast if the issuer demands authentication) or client-present authorisation at `create` with manual capture at `start`?
4. Is a proof photo mandatory to finish (SPEC §8.10 says yes; backend says no)?
5. May proxies see the client's phone/email before accepting, or only once mapped?
6. Where should proof images live for release (S3/R2 vs. the API host's disk)?
7. Minimum/maximum offered price to enforce server-side (SPEC says R$ 10,00 minimum).
