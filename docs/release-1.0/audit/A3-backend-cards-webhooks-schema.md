# A3 — Backend audit: cards, Stripe webhooks, StripeService, schema & migrations

Auditor: A3 · Date: 2026-11-08 · Repo: `/Users/leandromartins/Documents/proxy-api` (read-only)

All paths below are relative to `/Users/leandromartins/Documents/proxy-api/` unless prefixed with `proxy-app/`.

---

## 1. Scope

Every file below was opened in full and read line by line (line counts from `wc -l`).

### Cards module (`src/modules/cards/`) — 685 lines
| File | Lines |
|---|---|
| `cards.module.ts` | 32 |
| `controllers/create-user-payment-method.controller.ts` | 39 |
| `controllers/delete-user-card.controller.ts` | 28 |
| `controllers/fetch-user-card.controller.ts` | 20 |
| `dtos/cards-repository.dto.ts` | 13 |
| `repositories/cards.repository.ts` | 58 |
| `types/index.d.ts` | 26 |
| `use-cases/create-user-payment-method.service.ts` | 88 |
| `use-cases/create-user-payment-method.service.spec.ts` | 218 |
| `use-cases/delete-user-card.service.ts` | 33 |
| `use-cases/delete-user-card.service.spec.ts` | 81 |
| `use-cases/fetch-user-card.service.ts` | 22 |
| `use-cases/fetch-user-card.service.spec.ts` | 57 |

### Stripe webhook module (`src/modules/stripe-webhook/`) — 1 000 lines
| File | Lines |
|---|---|
| `stripe-webhook.module.ts` | 35 |
| `controllers/stripe-webhook.controller.ts` | 47 |
| `repository/stripe-events.repository.ts` | 21 |
| `use-cases/dispatch-stripe-event.service.ts` / `.spec.ts` | 81 / 146 |
| `use-cases/handle-payment-succeeded.service.ts` / `.spec.ts` | 16 / 29 |
| `use-cases/handle-payment-failed.service.ts` / `.spec.ts` | 32 / 61 |
| `use-cases/handle-charge-refunded.service.ts` / `.spec.ts` | 25 / 59 |
| `use-cases/handle-charge-disputed.service.ts` / `.spec.ts` | 70 / 119 |
| `use-cases/handle-account-updated.service.ts` / `.spec.ts` | 28 / 44 |
| `use-cases/handle-payout-failed.service.ts` / `.spec.ts` | 81 / 163 |

### Stripe service (`src/stripe/`) — 202 lines
`stripe.module.ts` (29), `stripe.service.ts` (156), `types/index.d.ts` (17).

### Prisma — 452 lines
`prisma/schema.prisma` (205), `prisma.config.ts` (12), `prisma/migrations/migration_lock.toml` (3) and all 15 migrations:
`20260201185429` (109), `20260308192843` (10), `20260309220348` (2), `20260309222230` (2), `20260309224234` (8), `20260309225921` (8), `20260309233324` (9), `20260310155223` (2), `20260322182729` (14), `20260422022643_add_stripe_webhook_fields` (17), `20260422220201_add_cards_is_deleted` (2), `20260422221238_add_ratings_table` (24), `20260513220738_add_payout_failed_and_transfer_id` (8), `20260526000526_add_password_reset_verified_flag` (2), `20260526011500_replace_password_reset_flags_with_state` (24).

### Infra / config — 249 lines
`scripts/sync-stripe-secret.mjs` (44), `docker-compose.yml` (14), `package.json` (69), `tsconfig.json` (31), `tsconfig.build.json` (4), `nest-cli.json` (8), `.gitignore` (62), `.env.example` (17).

### Read for context only (not audited line-by-line, cited where a finding depends on them)
`src/main.ts`, `src/app.module.ts`, `src/exception/*.ts`, `src/env/*.ts`, `src/prisma/prisma.service.ts`, `src/modules/tasks/use-cases/{start,validate,cancel}-task.service.ts`, `src/modules/tasks/repository/tasks.repository.ts` (fetchAllTasks, validateTaskCompletion, fetchTaskByTransferId, markPayoutFailed), `src/modules/payments/repository/payments.repository.ts`, `src/modules/auth/repository/auth.repository.ts` (wallet/customer methods), `src/modules/auth/use-cases/{create-merchant-account,update-wallet-balance,create-account}.service.ts`, `test/cards/*.e2e-spec.ts`, `test/stripe-webhook/stripe-webhook.e2e-spec.ts`, `test/mocks/stripe.service.mock.ts`, `test/setup/test-app.factory.ts`, `proxy-app/SPEC.md` §4.3, §4.4, §7.3, §8.11, §8.12, `proxy-app/src/apis/cards/*`, `proxy-app/src/feature/cards/components/AddCardSheet.tsx`, `proxy-app/app/(app)/tasks/[id]/index.tsx:95-115`, and `node_modules/stripe` (installed 20.2.0: `types/Charges.d.ts`, `types/BalanceTransactions.d.ts`, `types/Events.d.ts`, `cjs/stripe.core.js`, `cjs/RequestSender.js`).

Nothing in the slice was skipped. Per the brief I did not re-run `jest`/`tsc` (results already established) and did not touch Docker, Expo or the Stripe CLI.

---

## 2. How it works (as the code actually behaves)

### 2.1 Cards
* **Tokenisation happens on the device.** `AddCardSheet.tsx:102-109` calls `createPaymentMethod({ paymentMethodType: 'Card' })` with the publishable key and POSTs `{ token: paymentMethod.id }` (a `pm_…` id) to `POST /card/create`. The controller schema is `z.object({ token: z.string() })` (`create-user-payment-method.controller.ts:11-13`); Zod strips unknown keys, so the `savedCard` field that `CreateUserSourceService` also understands can never arrive over HTTP.
* **`CreateUserSourceService.execute`** (`create-user-payment-method.service.ts:20-87`): looks up `Users.stripeCustomerId` (404 `USER_NOT_FOUND` when null), loads the single active card (`cards.findFirst where userId && isDeleted=false`), then `paymentMethods.retrieve(token)` → `paymentMethods.attach(pm, customer)` → either `cards.create` (no active card) or `cards.update` of the existing row's `brand/last4/stripeCardId` (replacement). **No SetupIntent is used; the card is never authenticated (3DS) at save time, and the previous PaymentMethod is never detached from the customer.** Any non-`AppException` error becomes 400 `CARD_CREATION_FAILED`.
* **`GET /card/fetch`** returns the raw Prisma row (`id, userId, stripeCardId, brand, last4, isDeleted, createdAt, updatedAt`) or 404 `NO_SAVED_CARD_FOUND`. The app receives the `pm_…` id (`TCard.stripeCardId`).
* **`DELETE /card/:id`** (`delete-user-card.service.ts:20-32`): `findFirst({id, isDeleted:false})` → 404; `card.userId !== userId` → 403 `CANNOT_DELETE_CARD`; then `paymentMethods.detach` on Stripe, then `isDeleted=true`. Returns 204 with no body. The `:id` param is not validated as a UUID.
* **Consumer:** `StartTaskService` (`start-task.service.ts:52-77`) fetches the **task owner's** card via `FetchUserCardService` and charges it with `paymentIntents.create({ payment_method_types:['card'], amount, currency:'brl', customer, payment_method, setup_future_usage:'off_session' })` followed by a separate `paymentIntents.confirm(pi, { payment_method })` — **without `off_session: true`**. `requires_action` is returned to the caller of `/tasks/start`, i.e. the **proxy**, with the client secret.

### 2.2 Webhook endpoint
* `main.ts:8` boots with `rawBody: true`; `StripeWebhookController` (`@SkipThrottle`, `@HttpCode(200)`) requires `req.rawBody` and a `stripe-signature` header (400 `WEBHOOK_MISSING_RAW_BODY` / `WEBHOOK_INVALID_SIGNATURE`), then calls `DispatchStripeEventService.execute`.
* `DispatchStripeEventService` (`dispatch-stripe-event.service.ts:31-80`): `constructEvent` with the single `STRIPE_WEBHOOK_SECRET` (failure → 400); `stripeEvents.findUnique(event.id)` → skip if present; `switch (event.type)` to one of six handlers; unknown types are logged; **then** `stripeEvents.create({ id, type })`. There is **no transaction** around check → handler → insert, and the insert happens **after** the handler. If a handler throws, the exception reaches `HttpExceptionFilter` → 500 → Stripe retries (good, event not lost); if the handler succeeds but `markAsProcessed` throws → 500 → Stripe retries → **handler runs a second time**.
* Handlers, all using `PrismaService` directly except payout-failed:
  * `payment_intent.succeeded` → `payments.updateMany({paymentIntent, status:'pending'} → 'succeeded')`. Nothing on the task.
  * `payment_intent.payment_failed` → find payment by `paymentIntent` (no status filter); `$transaction([payments→failed, userTaskMapping.deleteMany(taskId), tasks.update(status:'available', startedAt:null)])` regardless of the task's current status.
  * `charge.refunded` → `payments.updateMany({paymentIntent} → {status:'refunded', refundId: charge.refunds?.data[0]?.id ?? null})`.
  * `charge.dispute.created` → find payment + task; if `task.status === 'completed' && proxyEarnings != null && mapping` → `$transaction([payment→disputed, users.update(executor, walletBalance decrement proxyEarnings)])`, else only payment→disputed. The Stripe transfer is **not** reversed.
  * `account.updated` → `users.updateMany({stripeAccountId: account.id}, {stripeAccountReady: charges_enabled && payouts_enabled})`. Readiness can flip back to false.
  * `payout.failed` → requires `event.account`; `balanceTransactions.list({payout, expand:['data.source']}, {stripeAccount})` (default page size 10, no pagination); for each row whose expanded `source.object === 'transfer'`: find task by `transferId`, find mapping, `transfers.createReversal(tr)` (errors caught → `continue`), then **three separate non-transactional writes**: `updateWalletBalance(proxy.id, current - proxyEarnings)` (read-modify-write), `updateTotalTasksCompleted(-1)`, `markPayoutFailed(task)` (status `payout_failed`, `transferId=null`). DB errors here are **not** caught.

### 2.3 StripeService
Thin wrapper, API version pinned to `'2025-12-15.clover'` (matches the installed SDK 20.2.0 default). SDK defaults to `maxNetworkRetries: 2` (`stripe.core.js:74`) and auto-adds an `Idempotency-Key` to retried POSTs (`RequestSender.js:232`), so **SDK-level** retries are safe; **no idempotency key is supplied by the application** on `paymentIntents.create`, `paymentIntents.confirm`, `refunds.create`, `transfers.create`, `transfers.createReversal`. Transfers carry only `metadata.taskId` — no `transfer_group`, no `source_transaction`. Connect accounts are created with the controller API (`stripe_dashboard.type:'express'`, `fees.payer:'application'`, `losses.payments:'application'`, `business_type:'individual'`), **no `country`, no `capabilities`**. `customers.search` interpolates the raw email into the query string. No PII/secrets are logged by this slice (the webhook logs event ids/types/account ids only).

### 2.4 Schema and migrations
* Migrations are **consistent with `schema.prisma`** — I diffed each model column-by-column against the cumulative SQL (users: `totalTasks` dropped → `totalTasksCompleted/Created`; `stripeAccountId` dropped in `20260309233324` and re-added in `20260310155223`; tasks: `acceptedAt`, `executingAt` dropped, `canceledAt`, `transferId` added; payments: `refundId`, `status`; cards: `isDeleted`; `ratings`, `stripe_events`, `password_reset_codes.state` backfilled). `TaskStatus` got `payout_failed` via `ALTER TYPE … ADD VALUE`. `migration_lock.toml` = postgresql.
* **Destructive migrations** exist (5 `DROP COLUMN`s); pre-release so acceptable, but `20260309233324` dropped `stripeAccountId` and `20260310155223` re-added it empty — any dev data was lost.
* Indexes present: PKs, `users.email` unique, `ratings.taskId` unique, `tasks.transferId` unique. **No other index at all** (Postgres does not index FK columns automatically).
* Decimal precision: `offeredPrice/proxyEarnings/platformFee/payments.amount` are `Decimal(10,2)`; `users.rating`, `users.walletBalance`, `tasks.locationLat/Lng` are bare `Decimal` → `DECIMAL(65,30)`.
* Cascades: `users → tasks → payments/ratings/user_task_mapping`, `users → cards/password_reset_codes/ratings`, all `ON DELETE CASCADE`. The API only soft-deletes users, so cascades only fire on a manual hard delete.
* No `city` column; `GET /tasks/fetch?city=` is implemented as `locationAddress: { contains: city }` (`tasks.repository.ts:84`), case-sensitive, un-indexable.
* `StripeEvents` stores `id, type, createdAt` only, forever (no payload, no retention).

### 2.5 Code vs. docs disagreements found
| Claim | Reality |
|---|---|
| `CLAUDE.md:142` "walletBalance … debited **atomically** on dispute reversal and payout-failed compensation" | Dispute: yes (`$transaction`). Payout-failed: **no** — read-modify-write in `handle-payout-failed.service.ts:57-66`, three separate statements, not transactional. |
| `CLAUDE.md:156` "Errors per-transfer are logged and don't break the loop" | Only `reverseTransfer` errors are caught (`:48-55`); errors from `listPayoutTransactions`, repositories or `authRepository` propagate and abort the loop → 500. |
| `CLAUDE.md:149` "Deduped by `event.id` … safe against Stripe retries" | Safe only when the whole request succeeded; retry after a post-handler failure or a concurrent duplicate re-runs the handler (finding P1-4). |
| `SPEC.md §8.12` "Backend guarda apenas 1 cartão por usuário" | Enforced only by `findFirst`; no DB constraint; concurrent creates produce two active rows (finding P2-2). |
| `SPEC.md §7.3 step 2` "Frontend deve confirmar via `confirmPayment`" (3DS) | The frontend never calls `confirmPayment`; the proxy gets the client secret and only shows a toast (`tasks/[id]/index.tsx:104-107`). |
| `proxy-app/src/apis/cards/cards-apis.ts:10-11` types `DELETE /card/:id` as `{ message: string }` | Backend returns `204 No Content` (`delete-user-card.controller.ts:21`). Harmless, but the type is wrong. |
| `CLAUDE.md:7` "Node.js … TypeScript (ES2024, strict mode)" | `tsconfig.json:23` sets `noImplicitAny: false`, which turns off a core part of `strict`. |

---

## 3. Findings

Severity counts: **P0: 3 · P1: 5 · P2: 13 · P3: 9** (30 findings).
Findings marked **[cross-slice]** have their root or fix partly in the tasks module (auditor A2); they are listed because the trigger or the money consequence lives in this slice.

### [P0] 3DS `requires_action` is handed to the wrong party; card saved without authentication; task + payment hang forever
File: `src/stripe/stripe.service.ts:63-82`, `src/modules/cards/use-cases/create-user-payment-method.service.ts:56-60`, `src/modules/tasks/use-cases/start-task.service.ts:74-92`, `proxy-app/app/(app)/tasks/[id]/index.tsx:104-107`
Evidence:
```ts
// stripe.service.ts:68-81
return await this.stripe.paymentIntents.create({ payment_method_types: ['card'], amount, currency: 'brl', customer, payment_method: savedCard, setup_future_usage: 'off_session' })
…
return await this.stripe.paymentIntents.confirm(paymentIntentId, { payment_method: savedCard })   // no off_session: true
// create-user-payment-method.service.ts:56-60 — card attached directly, no SetupIntent
await this.stripeService.attachPaymentMethodToCustomer(stripeCardId, stripeCustomerId)
// tasks/[id]/index.tsx:104-107 — proxy device
if (result.status === 'requires_action') { toast.success('Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.') }
```
Why it matters: The card is attached with a plain `attach` (no SetupIntent, so the issuer never authenticated it) and the later confirm is treated by Stripe as **on-session** (no `off_session: true`), so for a Brazilian card whose issuer requests 3DS Stripe returns `requires_action` and expects a cardholder challenge. The only device that receives the `clientSecret` is the **proxy's**, and the app does nothing with it. The PaymentIntent stays `requires_action`, `Payments.status` stays `pending`, the task is already `in_progress` with a mapping (`start-task.service.ts:44-50`), and no webhook ever fires to revert it (`payment_failed` only fires after a failed attempt). The proxy may do the work unpaid (see P0 "validate without payment check").
Suggested fix: Save cards through a **SetupIntent** (`usage: 'off_session'`, confirmed on the client with `confirmSetupIntent`, which performs 3DS once); on `/tasks/start` confirm with `off_session: true` and treat `requires_action`/`authentication_required` as a hard failure that rolls the task back to `available` and tells the proxy "pagamento do cliente recusado". Expose the client secret only to the client if a client-present flow is ever added.
Confidence: high (mechanism); medium on how often BR issuers demand 3DS for a given merchant.

### [P0] [cross-slice] `/tasks/start` marks the task `in_progress` and inserts the mapping *before* fetching the owner's card or charging — any card/Stripe failure strands the task
File: `src/modules/tasks/use-cases/start-task.service.ts:44-62`, `src/modules/cards/use-cases/fetch-user-card.service.ts:16-18`
Evidence:
```ts
await this.tasksRepository.updateTaskStatus({ taskId, status: 'in_progress', startedAt: new Date() })
await this.tasksRepository.insertTaskUserMapping(taskId, userId)
const ownerCard = await this.fetchUserCardService.execute(taskDetails.owner)   // throws NO_SAVED_CARD_FOUND (404)
…
const paymentIntent = await this.stripeService.createPaymentIntent({ … })      // any Stripe error → PAYMENT_FAILED (402)
```
Why it matters: If the client never saved a card, or deleted it after posting the task (`DELETE /card/:id` has no check for open tasks), or Stripe is down, the proxy receives 404/402 but the DB already says `in_progress` with an executor mapping and **no `Payments` row**. No webhook can revert it (there is no PaymentIntent), the client cannot cancel after 1 h (`cancel-task.service.ts:39-47`), and the task disappears from `/tasks/fetch` for everyone. Main-path crash leaving corrupted state.
Suggested fix: Resolve the card and create/confirm the PaymentIntent **first**, then flip status + mapping inside one `$transaction`; or wrap the whole thing in an interactive transaction and roll back on any throw. Additionally block `DELETE /card/:id` while the user owns tasks in `available|in_progress`.
Confidence: high.

### [P0] [cross-slice] `/tasks/validate` transfers money to the proxy without checking that the payment actually succeeded
File: `src/modules/tasks/use-cases/validate-task.service.ts:28-81` (no reference to `payments` at all), `src/modules/stripe-webhook/use-cases/handle-charge-disputed.service.ts:45-50`
Evidence:
```ts
// validate-task.service.ts — the only status checked is the task's
const taskDetails = await this.tasksRepository.fetchTaskById({ taskId, status: 'verification_required' })
…
const transfer = await this.stripeService.createTransfer({ amount: Math.round(proxyEarnings * 100), destination: proxy.stripeAccountId, metadata: { taskId } })
// handle-charge-disputed.service.ts:45-50 — a dispute on a non-completed task only flags the payment
await this.prisma.payments.update({ where: { id: payment.id }, data: { status: 'disputed' } }); return
```
Why it matters: `Payments.status` is the only place where the webhook outcome lands, and nothing reads it on the money path. With the P0 above (payment stuck `pending`), or a `charge.dispute.created` arriving while the task is `in_progress`/`verification_required`, the client can still validate and the platform creates a **real Stripe transfer** from its own balance for a payment it never collected. Direct money loss.
Suggested fix: In `ValidateTaskService`, load the payment for the task and refuse unless `status === 'succeeded'` (new error e.g. `PAYMENT_NOT_SETTLED`, 409). Also refuse `finish`/`validate` when `status === 'disputed'`.
Confidence: high.

### [P1] One webhook secret, but production needs two endpoints (platform events vs. Connect events)
File: `src/stripe/stripe.module.ts:20-24`, `src/stripe/stripe.service.ts:25-31`, `src/env/env.ts:13`, `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:66-74`
Evidence:
```ts
{ provide: 'STRIPE_WEBHOOK_SECRET', useFactory: (env: EnvService) => env.get('STRIPE_WEBHOOK_SECRET') }
…
case 'account.updated': …        // Connect event (event.account set)
case 'payout.failed': …          // Connect event (payout on the connected account)
```
Why it matters: `payment_intent.*`, `charge.refunded`, `charge.dispute.created` are emitted on the **platform** account; `account.updated` and `payout.failed` for proxies are emitted **by connected accounts** and only reach a Dashboard endpoint registered with "Listen to events on Connected accounts". Each Dashboard endpoint has its own `whsec_`. In production, whichever family is sent to the endpoint whose secret is not the configured one gets 400 `WEBHOOK_INVALID_SIGNATURE` on every delivery; Stripe retries for 3 days and then disables the endpoint. Locally this is masked because `stripe listen` forwards both families with a single CLI secret.
Suggested fix: Add `STRIPE_CONNECT_WEBHOOK_SECRET` and either a second route (`/stripe/webhook/connect`) or try both secrets in `constructWebhookEvent`. Document the two-endpoint setup in `CLAUDE.md`/`.env.example`.
Confidence: medium-high (Stripe Connect webhook model; verify by registering both endpoints in test mode).

### [P1] `payout.failed` compensation filters on `source.object === 'transfer'`, which is not what a connected account's balance transactions contain — handler likely never compensates in production
File: `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:32-36`, `src/stripe/stripe.service.ts:107-112`
Evidence:
```ts
const transactions = await this.stripeService.listPayoutTransactions(payout.id, accountId)  // { stripeAccount: accountId }
for (const transaction of transactions.data) {
  const source = transaction.source as Stripe.BalanceTransaction['source']
  if (!source || typeof source === 'string' || source.object !== 'transfer') { continue }
  const task = await this.tasksRepository.fetchTaskByTransferId(source.id)
```
Why it matters: The list is executed **on the connected account**. Funds that arrive from a platform `transfers.create` show up there as a *Payment* (`py_…`, `object: 'charge'`, balance-transaction type `payment`) whose `source_transfer` points to the `tr_…` id (`node_modules/stripe/types/Charges.d.ts:207-210`: "The transfer ID which created this charge. Only present if the charge came from another Stripe account"). Balance transactions of type `transfer` with a `tr_` source live on the **platform** side. So every row is skipped, no reversal/wallet debit/`payout_failed` happens, and the only trace is the final `logger.error`. The unit spec and e2e fabricate `{ object: 'transfer', id: 'tr_…' }` sources and therefore pass.
Suggested fix: Match on `source.object === 'charge' && source.source_transfer` (expand `data.source.source_transfer` or read the string id), or list on the platform with `transfer_group`. Verify once with a real test-mode payout failure (`stripe trigger payout.failed` on a connected account) before relying on it.
Confidence: medium (cannot run Stripe here; the type docs and Connect balance model support it).

### [P1] Dedupe row is written *after* the handler, outside any transaction — retries and duplicate deliveries double-apply non-idempotent money handlers
File: `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:45-79`, `src/modules/stripe-webhook/repository/stripe-events.repository.ts:9-20`, `src/modules/stripe-webhook/use-cases/handle-charge-disputed.service.ts:53-64`
Evidence:
```ts
const alreadyProcessed = await this.stripeEventsRepository.wasProcessed(event.id)
if (alreadyProcessed) { … return }
switch (event.type) { … await handler.execute(...) … }
await this.stripeEventsRepository.markAsProcessed(event.id, event.type)
```
Why it matters: (a) Stripe can deliver the same event twice concurrently (notably when the first attempt is slow and times out at 30 s while `payout.failed` is doing several Stripe round-trips); both requests pass `wasProcessed` and both run the handler. (b) If the handler succeeds and the `create` fails, the 500 makes Stripe retry and the handler runs again. `charge.dispute.created` then **decrements `walletBalance` twice**; `payout.failed` re-attempts a reversal (second one throws → skipped) but the wallet/counter path is non-idempotent too. `payment_intent.*`/`account.updated` are naturally idempotent.
Suggested fix: Insert the `StripeEvents` row **first** and treat a unique-violation (`P2002`) as "already processed"; run handler + insert in one interactive `$transaction` (handlers already use `PrismaService`), or make each money handler idempotent (guard on `payments.status !== 'disputed'` before decrementing).
Confidence: high on the mechanism; medium on frequency.

### [P1] No application idempotency keys on PaymentIntent / Transfer / Refund / Reversal creation
File: `src/stripe/stripe.service.ts:63-105`
Evidence:
```ts
return await this.stripe.paymentIntents.create({ … })            // :68
return await this.stripe.refunds.create({ payment_intent })      // :85
return await this.stripe.transfers.create({ amount, currency: 'brl', destination, metadata })   // :95
return await this.stripe.transfers.createReversal(transferId)   // :104
```
Why it matters: stripe-node only auto-generates a key for its own network retries (`RequestSender.js:232`). If `transfers.create` is processed by Stripe but the response is lost (timeout after the 2 SDK retries, process restart), `ValidateTaskService` throws `TRANSFER_FAILED` (`validate-task.service.ts:70-73`) with the task still `verification_required`; the client taps "Validar" again and a **second transfer** of `proxyEarnings` is created → double payout. Same for `refunds.create` on cancel (double refund is rejected by Stripe, but the first one is then orphaned from `refundId`) and PaymentIntents on start.
Suggested fix: Pass `{ idempotencyKey }` as the second argument: `task:${taskId}:transfer`, `task:${taskId}:refund`, `task:${taskId}:pi:${attempt}`, `transfer:${transferId}:reversal`. Keys are scoped per Stripe account and valid 24 h.
Confidence: high.

### [P1] `transfers.create` without `source_transaction` — in Brazil card funds are *pending* for weeks, so transfers from the platform's available balance will fail
File: `src/stripe/stripe.service.ts:90-101`
Evidence:
```ts
return await this.stripe.transfers.create({ amount: data.amount, currency: 'brl', destination: data.destination, metadata: data.metadata })
```
Why it matters: A transfer without `source_transaction` can only use the platform's **available** balance. Brazilian card charges settle to available on a long schedule (Stripe BR default is D+30 for cards); a fresh platform with no pre-funded balance will get `balance_insufficient` on the first validations, surfacing as `TRANSFER_FAILED` (500) to the client and blocking every completion until the balance is topped up. With `source_transaction: <charge id>` Stripe lets the transfer ride on that specific charge's pending funds and releases it when the charge becomes available.
Suggested fix: Store the charge id (from `payment_intent.succeeded` → `latest_charge`) on `Payments` and pass `source_transaction` plus `transfer_group: taskId` in `createTransfer`. Alternatively use destination charges (`transfer_data.destination` + `application_fee_amount`) at PaymentIntent time.
Confidence: medium (depends on the platform account's payout schedule and whether the owner keeps a float).

### [P2] `charge.refunded` handler nulls out `refundId` because `charge.refunds` is not expanded in current API versions
File: `src/modules/stripe-webhook/use-cases/handle-charge-refunded.service.ts:18-23`, `src/modules/tasks/use-cases/cancel-task.service.ts:75-79`
Evidence:
```ts
const refundId = charge.refunds?.data[0]?.id ?? null
await this.prisma.payments.updateMany({ where: { paymentIntent: paymentIntentId }, data: { status: 'refunded', refundId } })
```
Why it matters: Since API version 2022-11-15 the `refunds` list is omitted from `Charge` unless expanded (the SDK types it as optional `refunds?:`, `Charges.d.ts:190`). With the pinned `2025-12-15.clover`, webhook payloads will not include it, so `refundId` is set to `null`, **overwriting** the id that `CancelTaskService` had just persisted. Also fires for partial refunds and marks the whole payment `refunded`.
Suggested fix: Only set `refundId` when present (`...(refundId && { refundId })`), or retrieve `refunds.list({ charge })`; use `charge.amount_refunded === charge.amount` to decide `refunded` vs. a new `partially_refunded`.
Confidence: medium-high.

### [P2] One-active-card rule is not enforced in the DB and replacement leaks the old PaymentMethod on Stripe
File: `src/modules/cards/use-cases/create-user-payment-method.service.ts:31,66-79`, `src/modules/cards/repositories/cards.repository.ts:28-32`, `prisma/schema.prisma:112-128`
Evidence:
```ts
const existingCard = await this.cardsRepository.fetchUserCard(userId)     // findFirst, no orderBy
…
return await this.cardsRepository.updateUserSource({ last4, brand, stripeCardId, id: existingCard.id })  // old pm_ overwritten, never detached
```
Why it matters: Two concurrent `POST /card/create` (double tap, slow network retry) both see `existingCard === null` and insert two active rows; `fetchUserCard` then returns an arbitrary one, and `DELETE` of one leaves a hidden second card that `/tasks/start` will charge. On replacement the previous `pm_` stays attached to the Stripe customer forever (still chargeable with the secret key, visible in Dashboard, PCI-ish clutter).
Suggested fix: Add a partial unique index `CREATE UNIQUE INDEX cards_one_active ON cards("userId") WHERE "isDeleted" = false` (Prisma: raw migration) and catch `P2002`; detach `existingCard.stripeCardId` after a successful attach of the new one.
Confidence: high.

### [P2] `payments.paymentIntent` not unique, `payments.taskId` not indexed, and lookups use `findFirst` without ordering — re-started tasks accumulate rows and cancel may refund the wrong intent
File: `prisma/schema.prisma:143-158`, `src/modules/payments/repository/payments.repository.ts:16-18`, `src/modules/stripe-webhook/use-cases/handle-payment-failed.service.ts:11-14`
Evidence:
```prisma
model Payments { … taskId String @db.Uuid  paymentIntent String  … }   // no @unique, no @@index
```
```ts
return await this.prisma.payments.findFirst({ where: { taskId } })
```
Why it matters: After `payment_intent.payment_failed` reverts a task to `available`, a second `/tasks/start` creates a second `Payments` row for the same task. `fetchPaymentRecord(taskId)` returns whichever row Postgres yields first; `CancelTaskService` may call `refunds.create` on the failed `pi_` → Stripe error → `REFUND_FAILED` → the client cannot cancel a task that was in fact paid. Webhook `where paymentIntent` lookups are also sequential scans.
Suggested fix: `@@unique([paymentIntent])`, `@@index([taskId])`; make `fetchPaymentRecord` order by `createdAt desc` and prefer `status in (succeeded, pending)`.
Confidence: medium-high.

### [P2] `payment_intent.payment_failed` reverts the task regardless of its current status (stale or late events destroy completed work)
File: `src/modules/stripe-webhook/use-cases/handle-payment-failed.service.ts:11-30`
Evidence:
```ts
const payment = await this.prisma.payments.findFirst({ where: { paymentIntent: paymentIntent.id }, select: { taskId: true } })
…
this.prisma.tasks.update({ where: { id: payment.taskId }, data: { status: 'available', startedAt: null } }),
```
Why it matters: Stripe does not guarantee ordering. A `payment_failed` from an earlier 3DS attempt delivered after `payment_intent.succeeded` marks a successful payment `failed`, deletes the executor mapping and re-lists a task the proxy is already executing. If the proxy had already finished (`verification_required`), the proof and `completedAt` stay on a task that is now `available`.
Suggested fix: Guard both writes: `payments.updateMany({ where: { paymentIntent, status: 'pending' } })` and `tasks.updateMany({ where: { id, status: 'in_progress' } })`; if the task is past `in_progress`, log and flag for manual review instead.
Confidence: high.

### [P2] `payout.failed`: partial-failure leaves Stripe and DB permanently inconsistent; wallet update is a non-atomic read-modify-write; only the first 10 balance transactions are read
File: `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:48-69`, `src/stripe/stripe.service.ts:107-112`
Evidence:
```ts
try { await this.stripeService.reverseTransfer(source.id) } catch (error) { …; continue }
const proxy = await this.authRepository.fetchUserDetailsById(taskMapping.executorId)
if (proxy) {
  const currentBalance = proxy.walletBalance?.toNumber() ?? 0
  await this.authRepository.updateWalletBalance(proxy.id, currentBalance - reversalAmount)   // overwrite
  await this.authRepository.updateTotalTasksCompleted(proxy.id, -1)
}
await this.tasksRepository.markPayoutFailed(task.id)
```
Why it matters: If any DB call after a successful reversal throws, the exception escapes the loop, the event is not marked, Stripe retries, the second `createReversal` fails (already fully reversed) → `continue` → the wallet, counter and task are **never** updated while the money has already been pulled back. `updateWalletBalance` overwrites with a value computed in JS, so a concurrent validate credit is lost. `balanceTransactions.list` defaults to `limit: 10` with no `autoPagingEach`, so payouts bundling more than 10 transactions silently skip tasks.
Suggested fix: Use `walletBalance: { decrement }` + `totalTasksCompleted: { decrement }` + `markPayoutFailed` in a single `$transaction`; make the loop idempotent by checking `task.status !== 'payout_failed'` before reversing and tolerating "already reversed"; iterate with `for await (const tx of stripe.balanceTransactions.list(...))`.
Confidence: high.

### [P2] Dispute handler never reverses the Stripe transfer and does not stop the task — platform absorbs the loss, proxy keeps the funds
File: `src/modules/stripe-webhook/use-cases/handle-charge-disputed.service.ts:40-64`, `src/stripe/stripe.service.ts:131-136`
Evidence:
```ts
const shouldReverseWallet = payment.task.status === 'completed' && payment.task.proxyEarnings !== null && mapping !== null
…
this.prisma.users.update({ where: { id: mapping.executorId }, data: { walletBalance: { decrement: payment.task.proxyEarnings! } } })
```
Why it matters: `walletBalance` is internal bookkeeping; the real money is already on the proxy's connected account. With `losses.payments: 'application'` the dispute amount + fee is debited from the **platform**. The wallet shows a negative balance the proxy can never "repay" through the product. For non-completed tasks only the payment flag changes (see P0 validate finding). Dispute id/amount are not persisted anywhere.
Suggested fix: Decide product-wise (see Questions); minimally also call `transfers.createReversal(task.transferId)` inside the same flow when `transferId` is set, persist `disputeId`, and block `finish`/`validate` while `status === 'disputed'`.
Confidence: high on behaviour; product decision pending.

### [P2] `DELETE /card/:id` → 500 on a non-UUID id and on an already-detached PaymentMethod
File: `src/modules/cards/controllers/delete-user-card.controller.ts:20-22`, `src/modules/cards/use-cases/delete-user-card.service.ts:23,30`
Evidence:
```ts
@Delete(':id') … async handle(@Param('id') id: string, …)                    // no ParseUUIDPipe / zod
const card = await this.cardsRepository.fetchCardById(cardId)                // where: { id } on a @db.Uuid column
await this.stripeService.detachPaymentMethod(card.stripeCardId)              // not wrapped
```
Why it matters: `/card/abc` makes Postgres raise `22P02 invalid input syntax for type uuid` → Prisma error → `HttpExceptionFilter` 500 `standard`. If the PM was detached in the Stripe Dashboard or by a replacement flow in the future, `detach` throws `resource_missing`/"not attached", the row is never soft-deleted and the user can never remove the card from the app.
Suggested fix: `@Param('id', new ParseUUIDPipe())`; catch Stripe `resource_missing` / already-detached errors and still soft-delete.
Confidence: high.

### [P2] Webhook lookups and list queries run on unindexed columns
File: `prisma/schema.prisma` (whole file — only `users.email`, `ratings.taskId`, `tasks.transferId` have indexes), `src/modules/stripe-webhook/use-cases/handle-account-updated.service.ts:19-22`, `src/modules/tasks/repository/tasks.repository.ts:81-88`
Evidence:
```prisma
model Tasks { … owner String @db.Uuid … status TaskStatus … }   // no @@index
model Cards { … userId String @db.Uuid … }                         // no @@index
model Payments { … taskId … paymentIntent … }                      // no @@index / @@unique
model UserTaskMapping { … executorId String @db.Uuid … }           // no @@index
model PasswordResetCodes { … userId … }                            // no @@index
```
Why it matters: Postgres does not create indexes for FK columns. `users.updateMany({ where: { stripeAccountId } })`, `payments.updateMany({ where: { paymentIntent } })`, `tasks.findMany({ where: { status:'available', … }, orderBy: createdAt })`, `cards.findFirst({ where: { userId } })`, `userTaskMapping` by `executorId` (active-tasks), reset-code rate limiting by `userId` all seq-scan. Fine at 100 rows, a problem well before 100 k, and the migration is a one-liner now vs. a locking `CREATE INDEX` later.
Suggested fix: Add `@@index([status, createdAt])`, `@@index([owner])` on Tasks; `@@index([userId])` on Cards and PasswordResetCodes; `@@unique([paymentIntent])` + `@@index([taskId])` on Payments; `@@index([executorId])` on UserTaskMapping; `@@index([ratedId])` on Ratings; `@unique` or `@@index` on `users.stripeAccountId` / `stripeCustomerId`.
Confidence: high.

### [P2] No `city` column — `GET /tasks/fetch?city=` is a case-sensitive substring match over the free-text address
File: `prisma/schema.prisma:75-110`, `src/modules/tasks/repository/tasks.repository.ts:81-85`, `src/modules/tasks/use-cases/create-task.service.ts:34`
Evidence:
```ts
const locationAddress = `${street}, ${city} - ${state}, ${zipCode}`      // create-task.service.ts:34
…
where: { status: 'available', ownerId: { isDeleted: false }, locationAddress: { contains: city } }   // no mode: 'insensitive'
```
Why it matters: The API receives `city` as a first-class field on create and throws it away. `?city=são paulo` does not match "São Paulo"; `?city=Rio` matches "Rio Branco" and any street named "Rio …"; the filter cannot be indexed. This is the main discovery query of the app.
Suggested fix: Add `city String` (+ `state`) to `Tasks`, backfill from `locationAddress`, index `@@index([city, status, createdAt])`, filter with `equals`/`mode: 'insensitive'` or a normalised lowercase column.
Confidence: high.

### [P2] `customers.search` interpolates the raw email into the Stripe query string
File: `src/stripe/stripe.service.ts:33-37`
Evidence:
```ts
return await this.stripe.customers.search({ query: `email:'${email}'` })
```
Why it matters: A valid address containing `'` (e.g. `o'neil@…`) produces an invalid search query → Stripe 400 → `CreateAccountService` (`create-account.service.ts:48-50`) throws the generic `standard` error and sign-up is impossible for that user. Also, searching by email and adopting an existing customer (`:42-43`) silently re-uses a customer that may belong to a soft-deleted account with saved cards.
Suggested fix: Escape `'` and `\` (`email.replace(/(['\\])/g, '\\$1')`) or drop search and always `customers.create` with `metadata.userId`.
Confidence: medium.

### [P2] Connect account is created without `capabilities` (and without `country`) — readiness and transfers depend on Stripe defaults
File: `src/stripe/stripe.service.ts:114-139`, `src/modules/stripe-webhook/use-cases/handle-account-updated.service.ts:13`
Evidence:
```ts
return await this.stripe.accounts.create({ email, business_type: 'individual', business_profile: {…}, individual: {…},
  controller: { stripe_dashboard: { type: 'express' }, fees: { payer: 'application' }, losses: { payments: 'application' } } })
// no `country`, no `capabilities: { transfers: { requested: true } }`
```
Why it matters: Transfers to a connected account require its `transfers` capability to be active; with the controller API capabilities are not implied. If Stripe does not auto-request them for this configuration, `charges_enabled && payouts_enabled` may never become true (so `stripeAccountReady` stays false and the proxy is locked out of `/tasks/start`), or `transfers.create` fails with "destination account needs … transfers capability". `country` defaults to the platform's country, which is fine only while the platform is BR. `individual.phone` is sent as `''` when the user has no phone (`create-merchant-account.service.ts:33`), which Stripe may reject.
Suggested fix: Pass `country: 'BR'`, `capabilities: { card_payments: { requested: true }, transfers: { requested: true } }`, omit `phone` when empty. Verify on an existing test account with `stripe accounts retrieve acct_…` → `capabilities`.
Confidence: low-medium (the owner has apparently onboarded a test account successfully; confirm which capabilities it shows).

### [P2] `payout.failed` is handled by clawing the money back — but a failed payout does not lose the funds; they return to the connected balance
File: `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:18-80`
Evidence:
```ts
await this.stripeService.reverseTransfer(source.id)
…
await this.tasksRepository.markPayoutFailed(task.id)   // status payout_failed, transferId null
```
Why it matters: When a Stripe payout fails (closed bank account, wrong agência/conta), Stripe credits the amount back to the connected account's balance and the proxy simply has to fix bank details; the next automatic payout retries. The current code instead reverses the platform transfer (taking the money back to the platform), decrements the proxy's completed count and marks the task `payout_failed` with no path to pay the proxy again. Combined with the `source.object` filter finding it currently does nothing, but if "fixed" literally it would penalise proxies for a bank-details problem.
Suggested fix: Treat `payout.failed` as a notification (`stripeAccountReady=false`/flag + push the proxy to update bank data via the Express dashboard link) rather than a reversal; keep `payout_failed` status only if the product wants it visible.
Confidence: high on Stripe behaviour; product decision pending.

### [P2] `walletBalance` and `rating` are `DECIMAL(65,30)`; wallet arithmetic is done in JS floats
File: `prisma/schema.prisma:51,54,82-83`, `src/modules/auth/use-cases/update-wallet-balance.service.ts:25-27`, `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:46,61-65`
Evidence:
```prisma
rating        Decimal @default(0)
walletBalance Decimal @default(0)
locationLat   Decimal
locationLng   Decimal
```
```ts
const newBalance = (user.walletBalance?.toNumber() || 0) + amount          // float add, then overwrite
```
Why it matters: BRL amounts stored with 30 decimals and updated via `toNumber()` float math accumulate binary-fraction noise (e.g. `75.62` stored as `75.619999999999997…`), which later shows up in the app's "Saldo disponível" and in reconciliation vs. Stripe. `Decimal(10,2)` makes the DB round for you; `increment/decrement` avoids the RMW race.
Suggested fix: `walletBalance Decimal @db.Decimal(12,2)`, `rating Decimal @db.Decimal(3,2)`, `locationLat/Lng Decimal @db.Decimal(9,6)`; use `{ increment: amount }` / `{ decrement }` everywhere.
Confidence: high.

### [P3] `savedCard` branch and `null` return in `CreateUserSourceService` are unreachable dead code; loose types
File: `src/modules/cards/use-cases/create-user-payment-method.service.ts:33-42,86`, `src/modules/cards/types/index.d.ts:1-7`, `src/modules/cards/repositories/cards.repository.ts:21-23`
Evidence:
```ts
if (!token && savedCard) { … return existingCard }      // controller schema only accepts `token`
…
return null                                               // Promise<UserCard | null>
```
Why it matters: 40 % of the unit spec exercises code no request can reach; `token?`/`brand?`/`last4?` optional with `as string` casts hide missing-data bugs.
Suggested fix: Remove `savedCard` handling and the `null` return; make `CreateUserSourceData` fields required.
Confidence: high.

### [P3] Hard-delete cascades would wipe financial records
File: `prisma/schema.prisma:103,125,137-138,155,172-174,202`
Evidence:
```prisma
ownerId Users @relation("UserTasks", fields: [owner], references: [id], onDelete: Cascade)
task    Tasks @relation(fields: [taskId], references: [id], onDelete: Cascade)     // Payments
```
Why it matters: Deleting a `users` row (admin, migration script, Prisma Studio) cascades to tasks → payments/ratings/mappings, destroying payment and transfer history that may be needed for disputes/tax. Today the API only soft-deletes, so this is latent.
Suggested fix: `onDelete: Restrict` on `Payments.task`, `Tasks.ownerId`; keep cascade for `Cards`, `PasswordResetCodes`.
Confidence: high.

### [P3] `StripeEvents` keeps every event id forever and stores no payload
File: `prisma/schema.prisma:179-185`, `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:75-79`
Evidence:
```ts
default: this.logger.log(`Ignoring unhandled event type: ${event.type}`)
}
await this.stripeEventsRepository.markAsProcessed(event.id, event.type)      // also for ignored types
```
Why it matters: Unbounded growth (every subscribed event type) and no way to replay/inspect a failed event later. Stripe retries only for 3 days.
Suggested fix: Store `payload Json?` + `processedAt`, add `@@index([createdAt])`, and a periodic delete of rows older than 90 days (or just don't record ignored types).
Confidence: high.

### [P3] `PrismaService` builds and discards a second `PrismaClient`
File: `src/prisma/prisma.service.ts:8-9`
Evidence:
```ts
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
new PrismaClient({ adapter })        // result unused
```
Why it matters: Dead object; harmless today (lazy connect) but confusing and could open a second pool if ever awaited.
Suggested fix: Delete line 9.
Confidence: high.

### [P3] Build-only tooling shipped as production `dependencies`
File: `package.json:28,35,36,40-43,52-54`
Evidence:
```json
"@nestjs/cli": "^11.0.0", "@nestjs/schematics": "^11.0.0", "@nestjs/testing": "^11.1.12",
"@types/express": …, "@types/multer": …, "@types/node": …, "@types/passport-jwt": …,
"ts-node": "^10.9.2", "tsconfig-paths": "^4.2.0", "typescript": "^5.7.3"
```
Why it matters: `npm ci --omit=dev` in a production image still installs the Nest CLI, TypeScript, ts-node and the test harness; bigger attack surface and slower deploys. (`prisma` must stay a runtime dep only if `prisma generate`/`migrate deploy` run in the image.)
Suggested fix: Move the above to `devDependencies`; keep `prisma` if migrations run from the image.
Confidence: high.

### [P3] Tooling config nits: `tsconfig` weakens `strict`, jest types in the prod build, duplicated `.gitignore` entries, unpinned Postgres image
File: `tsconfig.json:23,29`, `.gitignore:39,60`, `docker-compose.yml:4`
Evidence:
```json
"strict": true, … "noImplicitAny": false, … "types": ["node", "jest", "express", "multer"]
```
```yaml
image: bitnami/postgresql        # no tag; POSTGRES_* env names are Bitnami aliases, PGDATA overrides Bitnami's default dir
```
Why it matters: `noImplicitAny:false` silently allows untyped params in a "strict" codebase; `jest` globals leak into app typings; `.env` appears twice in `.gitignore`; Bitnami stopped publishing free versioned images in 2025 so `latest` can drift or stall and `restart: always` + `./data/pg` bind mount is fine for dev only.
Suggested fix: Remove `noImplicitAny:false`, move `jest` to a test tsconfig, dedupe `.gitignore`, pin `postgres:16-alpine` (or a specific Bitnami tag).
Confidence: high.

### [P3] Destructive / unnamed migrations
File: `prisma/migrations/20260308192843`, `20260309224234`, `20260309225921`, `20260309233324` + `20260310155223`, `20260526011500_replace_password_reset_flags_with_state:22-24`
Evidence:
```sql
ALTER TABLE "users" DROP COLUMN "stripeAccountId", ADD COLUMN "stripeCustomerId" TEXT;   -- 20260309233324
ALTER TABLE "users" ADD COLUMN "stripeAccountId" TEXT;                                   -- 20260310155223 (data gone)
```
Why it matters: Nine of fifteen migrations have no descriptive suffix; several drop columns with data. Acceptable pre-release, but once production exists `prisma migrate dev` must not be used and drops need backfills.
Suggested fix: Squash into a single baseline migration before the first production deploy; adopt `--name` always.
Confidence: high.

### [P3] Docs drift (see table in §2.5)
File: `CLAUDE.md:142,149,156`, `proxy-app/SPEC.md §7.3 step 2`, `proxy-app/src/apis/cards/cards-apis.ts:10-11`
Why it matters: The second-pass auditor and future contributors will trust the docs; three statements about atomicity/idempotency are stronger than the code.
Suggested fix: Update the three CLAUDE.md sentences after fixing P1-4/P2 payout findings; fix the app `delete` type to `void`/204.
Confidence: high.

### [P3] Webhook 400 on signature failure triggers 3 days of Stripe retries; `webhook.missingRawBody` is unreachable in practice
File: `src/modules/stripe-webhook/controllers/stripe-webhook.controller.ts:35-41`
Evidence:
```ts
if (!req.rawBody) { throw new AppException(errorDictionary.webhook.missingRawBody) }
if (!signature)   { throw new AppException(errorDictionary.webhook.invalidSignature) }
```
Why it matters: Correct semantics (non-2xx → retry) but noisy; a misconfigured secret produces thousands of retried 400s. Nest only populates `rawBody` for parsed bodies, so an empty body yields `rawBody` of 0 bytes but not `undefined`.
Suggested fix: Keep as is; add an alert on repeated `WEBHOOK_INVALID_SIGNATURE`.
Confidence: medium.

---

## 4. Gaps vs. MVP (SPEC / CLAUDE.md promises not met by this slice)

| SPEC / doc | Promise | Status in code |
|---|---|---|
| SPEC §7.3 step 2 | 3DS completed by the **client** via `confirmPayment` using `clientSecret` | Secret returned to the proxy; no client path exists (P0). |
| SPEC §7.3 step 2 / §8.3 | "pagamento retido na plataforma" until validation | Money is captured immediately (`confirm` without `capture_method: 'manual'`); "retido" is only bookkeeping. Cancel = refund (fees not recovered). Not a bug, but the SPEC wording implies an authorisation hold. |
| SPEC §8.12 | "Adicionar novo substitui o anterior" | Row is updated but old PaymentMethod stays attached on Stripe (P2). |
| SPEC §8.12 | `DELETE /card/:id` errors `CARD_NOT_FOUND`, `CANNOT_DELETE_CARD` | Implemented; plus unhandled 500s (P2). |
| SPEC §8.11 | "Saldo é derivado do JWT (`walletBalance`)" | Backend writes wallet from float math into `Decimal(65,30)` (P2); app will display noisy decimals. |
| CLAUDE.md §Stripe webhooks | `payout.failed` compensation | Unlikely to ever match a real connected-account balance transaction (P1). |
| CLAUDE.md §Stripe Connect | "Proxies can only accept tasks after `stripeAccountReady === true`" | Implemented in `start-task` via DB read; readiness itself depends on an endpoint/secret setup that production lacks (P1). |
| Brief | Production webhook configuration | No documentation of the two required endpoints; `.env.example` has one secret. |

---

## 5. Test coverage

**Covered (unit, all pass):**
* Cards: all three services — not-found, ownership 403, create vs. update branch, Stripe error mapping, dead `savedCard` branch (5 of 10 cases in `create-user-payment-method.service.spec.ts` test code unreachable over HTTP).
* Webhooks: signature failure, dedupe skip, routing for all six events, unknown type recorded; each handler's happy path; dispute with/without wallet reversal; payout-failed skip/non-transfer/reversal-throws.

**Covered (e2e, require Docker):** `POST /card/create` (fresh user only), `GET /card/fetch`, `DELETE /card/:id` (401/404/403/204 + hidden after delete), webhook 400s, `payment_intent.succeeded`, `payment_failed` revert, `charge.refunded`, `account.updated`, `payout.failed`, idempotency (same event twice).

**Not covered:**
* Card replacement when a card already exists (e2e) → would have surfaced the missing detach and the two-rows race.
* `DELETE /card/not-a-uuid` → 500; `detach` throwing.
* Handler throws → event **not** marked and 500 returned; `markAsProcessed` throws → handler re-run; concurrent duplicate deliveries.
* `payment_failed` arriving when the task is `verification_required`/`completed`; `payment_failed` after `succeeded`.
* `charge.dispute.created` e2e (none); dispute on a `payout_failed` task.
* `payout.failed` with >10 balance transactions; DB failure after a successful reversal.
* `charge.refunded` without `refunds` in payload **overwriting** an existing `refundId` (the unit test asserts `refundId: null` is written — it encodes the bug).
* StripeService itself has zero tests (always mocked); nothing checks parameters like `off_session`, `idempotencyKey`, `source_transaction`.

**Tests that assert questionable behaviour:**
* `handle-payout-failed.service.spec.ts:27-28,76-78` and `stripe-webhook.e2e-spec.ts:223-227` fabricate balance transactions with `source.object === 'transfer'` — they validate the code against an assumption about Stripe's payload, not against Stripe (P1).
* `handle-charge-refunded.service.spec.ts:49-58` asserts that a charge without `refunds` writes `refundId: null` (P2 data loss).
* `dispatch-stripe-event.service.spec.ts:97-113` asserts `markAsProcessed` is called with the handler having run first, cementing the insert-after ordering (P1).
* `handle-payment-failed.service.spec.ts:39-60` asserts the revert happens with no status guard (P2).

---

## 6. Questions for the owner

1. **3DS / client-present payment.** Should the client authorise the payment when *creating* the task (SetupIntent at card save + `off_session: true` charge on start, failing fast), or should the charge move to task creation so the client is present for any challenge? This decides the fix for the top P0.
2. **Payout failure policy.** When a proxy's bank payout fails, do you want to claw the transfer back (current intent) or leave the funds on their Stripe balance and ask them to fix bank details? Stripe's model favours the latter.
3. **Disputes after validation.** Should the platform absorb chargebacks (current: `losses.payments: 'application'`, wallet goes negative) or reverse the transfer from the proxy? Should a disputed-but-unvalidated task be frozen?
4. **Pending-funds float.** Will the platform account keep a BRL float so `transfers.create` works while card funds are pending, or should transfers be tied to the charge (`source_transaction`) / destination charges?
5. **Two webhook endpoints** in production (platform + Connect): confirm you are fine with a second secret/env var.
6. **Multiple cards.** Is "one card, replace on add" final for 1.0 (then add the DB constraint), or will multiple cards + default selection come soon (then the schema needs `isDefault`)?
