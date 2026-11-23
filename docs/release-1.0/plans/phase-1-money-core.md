# Phase 1 — Money core (backend only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make the proxy-api money path unable to lose or double-move money: the client pays
exactly `offeredPrice` (`chargedAmount = offeredPrice`), the proxy receives `proxyEarnings` = 80 %
of it, the platform keeps `platformFee` = 20 % and pays Stripe's fee out of that (D1); every status
transition is compare-and-set; the start charge happens only after an atomic claim, so exactly one
charge ever reaches the client; every Stripe call is idempotent and happens after (or is reverted
by) the DB write it depends on; webhooks dedupe first; proofs live in object storage.

**Architecture:** one pure money module (`src/common/money.ts`) feeds `create` (fees persisted on
the task), `start` (atomic CAS claim, then one off-session PaymentIntent for `chargedAmount`
created **and** confirmed with automatic capture under the idempotency key
`start:<taskId>:<proxyId>:<claim epoch ms>`, then the `succeeded` payment row; a definite decline
releases the claim and sets `Users.cardActionRequired` in one transaction, answers the proxy 409 `PAYMENT_FAILED` and e-mails the client "Confirme seu
cartão na Carteira"), `validate` (payment-checked, CAS-first transfer of `proxyEarnings` with
`source_transaction`), `cancel` (dispute-blocked, CAS-first, full refund of a succeeded charge) and
the new `GET /tasks/price-preview`. Funds sit in the platform balance between `start` and
`validate` (separate charges and transfers). Cards are saved through a SetupIntent
(`POST /card/setup-intent` + `POST /card/create { paymentMethodId }`). Webhooks insert the
`StripeEvents` row first and write payment rows idempotently from PaymentIntent metadata;
`payout.failed` and `charge.dispute.created` only flag. Proofs go through a `ProofStorage` port
(`S3ProofStorage` in prod, `LocalDiskProofStorage` in dev/test) after a magic-byte check and JPEG
normalisation. A daily `@nestjs/schedule` job auto-validates tasks stuck in
`verification_required` for 7 days.

**Tech stack:** NestJS 11.0, Prisma 7.3 (`Prisma.Decimal` = decimal.js, `ROUND_HALF_UP`), Zod 4.3,
`stripe` 20.2 (`apiVersion: '2025-12-15.clover'`), Jest 30 + ts-jest, Testcontainers Postgres 16,
supertest. New: `@nestjs/schedule` ^6, `@aws-sdk/client-s3` ^3.1164, `sharp` ^0.35, `heic-convert`
^2.1 (+ `@types/heic-convert`), `file-type@16.5.4` (last CommonJS release; v17+ is ESM-only and
cannot be `require`d by ts-jest). Node 26 locally.

**Spec:** ../PLAN.md §2 (Phase 1), ../DECISIONS.md D1–D8 (D1 and D3 as rewritten on 2026-11-23),
D18, D19, `proxy-app/SPEC.md` §7.2, §7.3, §8.8 (fee lines superseded by D1), §8.10, §3.3 (codes).

## Amendments (2026-11-23 owner decision round)

This plan was written on 2026-11-08 against the old D1/D3 and was rewritten in place on 2026-11-23.
Where this plan and an older text disagree (including the PLAN.md §2 Phase 1 summary and the
original wording of D3), the rulings below are what the loop implements.

What changed:
- **D1 (fees):** was "client pays `offeredPrice + 20 % + Stripe fee`, proxy receives `offeredPrice`";
  now the client pays exactly `offeredPrice`, `platformFee = 20 %`, `proxyEarnings = 80 %`,
  `stripeFee = 3.99 % × chargedAmount + R$ 0,39` is paid by the platform out of its 20 %, bounds
  `20 ≤ offeredPrice ≤ 10000` (R$ 100 → client 100.00, platformFee 20.00, stripeFee 4.38,
  proxyEarnings 80.00, platformNet 15.62).
- **D3 (charging):** was a manual-capture authorisation hold at start and a capture after the claim;
  now `/tasks/start` creates and confirms an off-session PaymentIntent with **automatic capture**,
  only `succeeded` continues, any other outcome leaves the task `available`, answers the proxy
  409 "Não foi possível cobrar o cliente. Tente outra tarefa." and notifies the client "Confirme seu
  cartão na Carteira". No manual capture, no capture call, no hold anywhere.

Tasks touched: P1-T01 (rewritten), P1-T02 (backfill SQL, amounts), P1-T03 (rewritten), P1-T04
(rewritten), P1-T06 (bounds, values), P1-T07 (values), P1-T08 (rewritten), P1-T12 (80 % transfer,
values), P1-T13 (rewritten), P1-T14 (rewritten), P1-T15 (D6 wording), P1-T16 (values), P1-T17
(rewritten), P1-T18 (`TChargePreview`, notes). P1-T05, P1-T09, P1-T10, P1-T11 unchanged.

Rulings (format: `Ruling: <decision> — <why> — <cost if wrong>`):
- Ruling: `/tasks/start` claims first (CAS `available → in_progress` + mapping in one transaction),
  then charges, then writes the payment row — with automatic capture a charge cannot be undone
  without a refund, so the CAS has to pick the single winner *before* Stripe is called; a racing
  proxy loses the CAS and never reaches Stripe, so exactly one charge reaches the client. D3's
  "nothing claimed, task stays available" holds at the end of every failed request because the
  claim is released before the response — cost if wrong: during the Stripe call (≈ 1–3 s) a second
  proxy is told `TASK_NOT_AVAILABLE` for a task that may become available again a moment later.
- Ruling: the idempotency key is `start:<taskId>:<proxyId>:<startedAt epoch ms>` (D3's prefix plus
  the claim's timestamp) — Stripe stores the outcome of a key for 24 h (declines included) and
  rejects a reused key with different parameters, so the bare D3 key would block the same proxy
  from retrying the task for 24 h after the client fixes the card; the suffix is stable while one
  claim lives (double-tap and retry reuse it) and changes after a release — cost if wrong: if the
  owner wants the literal D3 key, a same-proxy retry within 24 h of a decline fails until the key
  expires.
- Ruling: `startedAt` is the claim timestamp; no `claimedAt` column is added — `start` = claim in
  this flow and the cancel grace window already reads `startedAt` — cost if wrong: one extra
  column later if "claimed" and "started" ever diverge.
- Ruling: charge outcomes are classified in two buckets. **Definite failure** (PaymentIntent
  returned with any status other than `succeeded`/`processing`, e.g. `requires_action` or
  `requires_payment_method`; or a thrown `StripeCardError` / `StripeInvalidRequestError`) →
  `releaseClaim`, client notification, 409 `PAYMENT_FAILED`. **Unknown outcome** (`processing`;
  `StripeConnectionError`, `StripeAPIError`, `StripeRateLimitError`, `StripeIdempotencyError`,
  anything else) → the claim is **kept**, no notification, 409 `PAYMENT_PENDING` — releasing on an
  unknown outcome could let a second proxy charge the client again; the unknown outcome is settled
  by the same proxy's retry (same key → Stripe replays the stored result), by the
  `payment_intent.succeeded` / `payment_intent.payment_failed` webhooks (P1-T14, matched by
  metadata), or by the client cancelling — cost if wrong: a task can sit `in_progress` without a
  payment row until one of those happens.
- Ruling: a CAS loss is not an error when the caller already holds the claim: `start` re-reads the
  task + mapping; same proxy and a `succeeded` payment → 200 replay without a Stripe call; same
  proxy and no succeeded payment → resume the charge with the stored `startedAt` (same key → same
  PaymentIntent); anyone else → 400 `TASK_NOT_AVAILABLE` without a Stripe call. Because one key has
  exactly one outcome, a release can never follow a succeeded charge of the same claim — cost if
  wrong: a double-tap would show the proxy an error for a start that succeeded.
- Ruling: no payment row exists before Stripe answers `succeeded`; `start` writes it through
  `PaymentsRepository.recordSucceededCharge` (insert `ON CONFLICT ("paymentIntent") DO NOTHING`,
  then back-fill a missing `chargeId`), which the `payment_intent.succeeded` webhook also uses, so
  either writer can go first — a pending row would need the PaymentIntent id, which exists only
  after the call — cost if wrong: a crash between a succeeded charge and the row write leaves the
  row to the webhook (seconds to minutes).
- Ruling: non-succeeded PaymentIntents are not cancelled (`paymentIntents.cancel` is not wrapped)
  — a `requires_action` / `requires_payment_method` intent holds no funds and nobody but this API
  can confirm it off-session — cost if wrong: orphan intents in the Stripe dashboard; adding a
  cancel call later is one method.
- Ruling: `PAYMENT_FAILED` keeps its code but becomes 409 (was 402) with D3's message; new
  `PAYMENT_PENDING` 409; an owner without a saved card or Stripe customer is treated as a definite
  charge failure (client notified, nothing written) instead of the old 404 `NO_SAVED_CARD_FOUND`
  to the proxy — the proxy cannot fix the client's card and D3 asks for one proxy-facing error —
  cost if wrong: Phase 3 copy keyed on 402 must switch to the error code (the app does not read
  402 today).
- Ruling: the client notification is an e-mail through the existing `NotificationService`
  (new `sendCardChargeFailedEmail`), sent on every definite failure, wrapped in try/catch so a mail
  failure never changes the proxy's response; no push in Phase 1 — it is the only channel the API
  has today — cost if wrong: several proxies hitting the same broken card send several e-mails.
- Ruling: Phase 1 owns Users.cardActionRequired — P1-T04 adds a second migration `phase1_card_action_required` (`ALTER TABLE "users" ADD COLUMN "cardActionRequired" BOOLEAN NOT NULL DEFAULT false`) and P1-T05 clears the flag inside the /card/create transaction; P1-T08 sets it to true on a definite charge failure in the same transaction that releases the claim, and keeps the try/catch e-mail as a secondary channel — an in-app banner is the only channel the client reliably sees (no push in 1.0, e-mail may be unconfigured), and Phase 2/3 already build on the flag — cost if wrong: one extra boolean column and one migration.
- Ruling: the no-saved-card / no-customer branch of /tasks/start (a definite failure before any claim) also sets Users.cardActionRequired = true in a plain users.update and sends the same e-mail — the client needs the banner precisely when there is no card — cost if wrong: one extra flag write.
- Ruling: `platformNet` is derived, not persisted: `computeCharge` returns it for bookkeeping/tests,
  but it is not a column, not in `taskSelect`, not in any HTTP response — it is an exact identity of
  two persisted columns and exposing the platform margin to clients is not wanted — cost if wrong:
  a reporting query computes `"platformFee" - "stripeFee"`; adding a column later is a migration
  with the same identity as backfill.
- Ruling: `proxyEarnings = offeredPrice − platformFee` — for 2-dp prices it equals
  `round(offeredPrice × 0.80)` (asserted per row in `money.spec.ts`) and makes
  `platformFee + proxyEarnings === chargedAmount` exact by construction — cost if wrong: none for
  2-dp inputs (Zod enforces `multipleOf(0.01)`).
- Ruling: rounding is explicit `toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`; with 2-dp prices
  `platformFee` can never land on a half centavo (the third decimal of `x × 0.20` is always even), so
  the half-centavo case is tested on `stripeFee`: R$ 50.00 → 2.385 → **2.39** (banker's rounding
  would give 2.38); R$ 20.03 keeps the round-up case for `platformFee` (4.006 → 4.01) — cost if
  wrong: none, the table pins both.
- Ruling: `/tasks/cancel` drops the `pending` branch — the new `start` never writes `pending`; only
  rows created before this phase can be `pending`, and they get no Stripe call (Logger.warn) —
  cost if wrong: a legacy `pending` intent that was in fact charged is refunded by hand in the
  dashboard (pre-launch data only).
- Ruling: `/tasks/cancel` refuses a `disputed` latest payment with 409 `PAYMENT_DISPUTED` before
  any write — D6 as rewritten on 2026-11-23 blocks cancel as well as finish/validate — cost if
  wrong: the client cannot cancel a disputed task until the dispute is closed.
- Ruling: the `payment_intent.succeeded` webhook refunds a charge that lands on a task already
  `canceled` (same key `task:<id>:refund` as cancel, so a refund already issued is replayed, not
  duplicated); `payment_intent.payment_failed` without a payment row releases only the exact open
  claim named by the intent's metadata (`taskId`, `proxyId`, `claimedAt`) — these close the
  unknown-outcome bucket without a sweeper job — cost if wrong: a cancel and a late success
  webhook interleaving in the same few milliseconds can still leave one charge for a manual refund
  (logged at error level).
- Ruling: no `capture_method` key is sent — D3 wants Stripe's default automatic capture, and the
  P1-T03 spec asserts the key is absent so a manual-capture regression fails a test — cost if
  wrong: none.
- Ruling: the P1-T02 backfill fills missing fee columns of existing tasks with the new D1 model
  (`chargedAmount = offeredPrice`, 20/80 split); completed tasks that already carry
  `proxyEarnings` are left untouched — legacy in-flight tasks were charged `offeredPrice` by the
  old code, which is exactly the new `chargedAmount` — cost if wrong: none for pre-launch data.
- Ruling: the app type is `TChargePreview` (renamed from this plan's earlier `TPricePreview`) with
  the same five numeric fields — the Phase 3 plan already consumes `TChargePreview` — cost if
  wrong: one rename.

## Global constraints

- Repo: `/Users/leandromartins/Documents/proxy-api`. Conventions from its `CLAUDE.md`: 1 controller
  = 1 route (`controllers/<action>.controller.ts`), 1 service = 1 use case with `execute()`, Zod
  schemas inline in controllers, `@Body(new ZodValidationPipe(schema))`, domain errors
  `throw new AppException(errorDictionary.x.y)`, dictionary messages in **pt-BR**, no semicolons,
  single quotes, trailing commas, path alias `src/*`. Unit spec co-located
  (`<name>.service.spec.ts`), e2e in `test/<module>/<endpoint>.e2e-spec.ts`.
- Never run `npm run lint` (it uses `--fix`) or `npm run format` repo-wide; prettier only on files
  you created. The loop may start the api/Docker/simulators (D28). The orchestrator commits one commit per task on `release-1.0` and pushes (D30); implementers never commit; one task
  = one commit message proposal `feat|fix|test|chore(<area>): P1-Txx <title>`.
- Phase 1 assumes Phase 0 is merged: global `PrismaModule` (one `PrismaService`), `z.uuid()` on ids,
  PT messages + `errorCode: 'VALIDATION_FAILED'` for Zod failures, Prisma `P2002→409`/`P2025→404`/
  `P2023→400` mapping, fixed `test/factories/user.factory.ts`, `test/.env.test` untracked. Where this
  plan says "400 VALIDATION_FAILED", a Phase-0-less tree returns a 400 with another body — assert the
  status only if Phase 0 is not merged yet, and note it in STATUS.md.
- Money (D1, D2): the client pays `chargedAmount = offeredPrice`; `platformFee = 20 %`,
  `proxyEarnings = 80 %`, `stripeFee = 3.99 % × chargedAmount + 0.39` (platform's cost). Never
  `Number(decimal) * 100`. Only `Prisma.Decimal` (`mul`, `plus`, `minus`,
  `toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`), centavos only via `toCentavos()` from
  `src/common/money.ts`. The fee constants appear nowhere else.
- Stripe (D3): automatic capture only. No `capture_method`, no `paymentIntents.capture`, no
  authorisation hold anywhere in `src/`.
- Every status write goes through `TasksRepository.transition()` / `claimTask()` / `releaseClaim()`
  (CAS). No `tasks.update({ where: { id } , data: { status } })` anywhere after this phase.
- Verification commands (PLAN.md §3), run before claiming a task done:
  - unit/types: `npx prisma generate && npx tsc --noEmit && npx jest`
  - e2e (Docker running): `npm run test:e2e` (or a single file:
    `npx jest --config test/jest-e2e.config.ts --runInBand test/tasks/start-task.e2e-spec.ts`), then
    `git checkout -- test/.env.test` if the file is still tracked.
  - lint without fixing: `npx eslint "src/**/*.ts" "test/**/*.ts"`.
- App repo (`/Users/leandromartins/Documents/proxy-app`) is touched only by P1-T18:
  `npx tsc --noEmit && npx eslint .` there.

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P1-T01 | `src/common/money.ts` — fee model D1 (client pays `offeredPrice`, 20/80 split) in `Prisma.Decimal` | — | BE-03, D1, D2 | `npx jest src/common/money.spec.ts --coverage --collectCoverageFrom=src/common/money.ts` (100 %) |
| P1-T02 | Prisma migration `phase1_money_core` (fee columns, payment bookkeeping, `payoutIssue`, partial unique active card) | — | BE-20, BE-21, BE-32, D5 | `test/schema/phase1-constraints.e2e-spec.ts` |
| P1-T03 | StripeService: SetupIntent, off-session create+confirm PaymentIntent (automatic capture), idempotent refund/transfer, two webhook secrets; env; test doubles | — | BE-05, BE-06, BE-08, BE-10, BE-46 | `npx jest src/stripe/stripe.service.spec.ts` |
| P1-T04 | Repositories: `TasksRepository.transition/claimTask/releaseClaim/recordTransfer`, `PaymentsRepository` latest-by-task/by-intent/`recordSucceededCharge`, `PaymentsModule` export; migration `phase1_card_action_required` (`Users.cardActionRequired`), `releaseClaim` can flag the owner | P1-T02 | BE-02, BE-21, BE-36 (payments part) | `test/tasks/tasks-repository.e2e-spec.ts` |
| P1-T05 | Cards via SetupIntent: `POST /card/setup-intent`, `POST /card/create { paymentMethodId }`, replace-in-transaction, detach previous; clears `cardActionRequired` on save | P1-T02, P1-T03 | BE-32, BE-05 (card part), D3 | `test/cards/setup-intent.e2e-spec.ts`, `test/cards/create-card.e2e-spec.ts` |
| P1-T06 | `POST /tasks/create`: strict Zod bounds (20–10 000), CLIENT-only, card before insert, fees persisted in one transaction, shared `taskSelect` | P1-T01, P1-T04, P1-T05 | BE-09, BE-19, BE-03, BE-39 (money path) | `test/tasks/create-task.e2e-spec.ts` |
| P1-T07 | `GET /tasks/price-preview?offeredPrice=` | P1-T01 | APP-04 (backend half), D2 | `test/tasks/price-preview.e2e-spec.ts` |
| P1-T08 | `POST /tasks/start`: CAS claim → charge (automatic capture) → payment row; definite failure releases the claim, sets `cardActionRequired` + e-mails client; `requires_action` removed | P1-T03, P1-T04, P1-T06 | BE-02, BE-03, BE-05, BE-08, CON-01, REL-03, D3 | `test/tasks/start-task.e2e-spec.ts` |
| P1-T09 | `ProofStorage` port + `LocalDiskProofStorage` + `S3ProofStorage` + `StorageModule` + env | — | BE-18, D19, D25 | `npx jest src/storage` |
| P1-T10 | Proof image pipeline: magic bytes (`file-type`), HEIC→JPEG (`heic-convert`), normalise (`sharp`) | — | BE-18, CON-11, D19 | `npx jest src/modules/tasks/utils/proof-image.spec.ts` |
| P1-T11 | `POST /tasks/finish` (proof mandatory, disputed block, CAS) + `GET /tasks/:id/proof` streams from storage | P1-T04, P1-T09, P1-T10 | BE-18, BE-02, BE-46 (dead branch), D6, D19 | `test/tasks/finish-task.e2e-spec.ts`, `test/tasks/fetch-task-proof.e2e-spec.ts` |
| P1-T12 | `POST /tasks/validate`: payment-checked, CAS first, `source_transaction` transfer of `proxyEarnings` (80 %), one transaction for transferId/counter/wallet | P1-T01, P1-T03, P1-T04 | BE-01, BE-06, BE-08, BE-20, D4, D6 | `test/tasks/validate-task.e2e-spec.ts` |
| P1-T13 | `POST /tasks/cancel`: disputed block, CAS first, full refund of a succeeded charge, accept refund `pending` | P1-T03, P1-T04 | BE-07, BE-21, BE-02, D6, D7 | `test/tasks/cancel-task.e2e-spec.ts` |
| P1-T14 | Webhooks I: dedupe-first dispatch, idempotent `payment_intent.succeeded` row write (+ refund on a canceled task), guarded `payment_failed` (+ open-claim release), `charge.refunded` keeps `refundId` | P1-T02, P1-T03, P1-T04 | BE-23, BE-22, BE-21, BE-08, BE-10 | `test/stripe-webhook/stripe-webhook.e2e-spec.ts` |
| P1-T15 | Webhooks II: `payout.failed` → `payoutIssue`, dispute persists `disputeId`, `account.updated` guard + clears flag; dead Stripe methods removed | P1-T02, P1-T03 | BE-24, BE-25, BE-46, D5, D6 | `test/stripe-webhook/stripe-webhook.e2e-spec.ts` (new cases) |
| P1-T16 | Daily auto-release job (`@nestjs/schedule`) | P1-T12 | D18, APP-30 (backend half) | `test/tasks/auto-release.e2e-spec.ts` |
| P1-T17 | Rewrite `proxy-api/CLAUDE.md` sections (Stripe Connect, webhooks, card authentication, Database models, routes, env) | P1-T01…T16 | BE-47 (money sections) | `grep -c requires_action CLAUDE.md` → `0` and `grep -c capture_method CLAUDE.md` → `0` |
| P1-T18 | App wire types follow the new contract (types only + one dead branch) | P1-T05, P1-T07, P1-T08 | CON-01, CON-10 (types), APP-03 (type half) | `cd ../proxy-app && npx tsc --noEmit && npx eslint .` |

Register IDs in scope but not placed: **BE-35** (`update-profile` null coercion) — no Phase 1 task
touches `update-profile`; it stays with Phase 2 (BE-14). BE-46's `PROXY_ACCOUNT_NOT_READY` on start
also stays in Phase 2 as listed in PLAN.md; P1-T08 keeps `USER_NOT_PROXY` for the un-onboarded proxy.

## Review focus

Six inputs no reviewer should accept this phase without seeing tested:

1. **Rounding** — R$ 50.00 gives a raw Stripe fee of 2.385 → `stripeFee = 2.39` (ROUND_HALF_UP;
   banker's rounding would give 2.38); R$ 20.03 gives `platformFee = 4.006 → 4.01`,
   `proxyEarnings = 16.02`, `chargedAmount = 20.03`, Stripe `amount = 2003`, transfer `1602`;
   `platformFee + proxyEarnings === chargedAmount === offeredPrice` on every row. Owned by P1-T01
   (`money.spec.ts` table), P1-T06 (persisted values) and P1-T08 (`amount: 2001` for the
   float-artefact price 20.01).
2. **Two proxies race for one task** — the CAS claim picks one winner *before* Stripe is called;
   the loser gets 400 `TASK_NOT_AVAILABLE` and makes **zero** Stripe calls, so `chargeSavedCard`
   runs exactly once and the client is charged once. Owned by P1-T04 (concurrent `claimTask`) and
   P1-T08 ("two different proxies" case).
3. **Same proxy double-taps "Aceitar" or retries after an unknown outcome** — both requests use the
   same key `start:<taskId>:<proxyId>:<startedAt ms>`, Stripe returns the same PaymentIntent, one
   payment row is written, and no request releases a claim whose charge succeeded; an unknown
   outcome (`StripeConnectionError`, `processing`) keeps the claim and answers `PAYMENT_PENDING`.
   Owned by P1-T08 ("same proxy double-tap", "Stripe unreachable then retry") and P1-T04
   (`recordSucceededCharge` idempotent under concurrency).
4. **`payment_intent.succeeded` races the start response** — whichever writes first, there is one
   row with `status = 'succeeded'` and a non-null `chargeId`; a success that lands on a `canceled`
   task is refunded; `payment_failed` releases only the exact open claim named by metadata. Owned by
   P1-T14.
5. **Legacy `succeeded` payment with `chargeId = null`** (rows created before this phase) — validate
   must refuse with `PAYMENT_NOT_CONFIRMED` rather than call `transfers.create` without
   `source_transaction`. Owned by P1-T12.
6. **Auto-release meets a disputed or unconfirmed payment** — the job must skip the task (validate
   throws 409) and continue with the next one, never crash the batch. Owned by P1-T16.

---

### Task P1-T01: `src/common/money.ts` — fee model D1 in `Prisma.Decimal`

**Files:**
- Create: `src/common/money.ts`
- Create: `src/common/money.spec.ts`
- Modify (only if Phase 0 has not done it): `src/modules/tasks/types/index.d.ts:1` add
  `import type { Prisma } from '@prisma/client'` + `type Decimal = Prisma.Decimal`;
  `src/modules/payments/types/index.d.ts:1` replace `import { Decimal } from 'src/modules/auth/types'`
  (that module does not export `Decimal`) with the same two lines.
- Modify: `src/modules/tasks/test-utils/task.factory.ts:8-9,12,21` — `locationLat`, `locationLng`,
  `offeredPrice` and `ownerId.rating` become `new Prisma.Decimal(...)`.

**Interfaces:**
- Produces (`src/common/money.ts`):
  ```ts
  export const PLATFORM_FEE_RATE = new Prisma.Decimal('0.20')
  export const STRIPE_FEE_RATE = new Prisma.Decimal('0.0399')
  export const STRIPE_FEE_FIXED = new Prisma.Decimal('0.39')
  export const MIN_OFFERED_PRICE = 20
  export const MAX_OFFERED_PRICE = 10_000
  export type ChargeBreakdown = {
    offeredPrice: Prisma.Decimal; platformFee: Prisma.Decimal; stripeFee: Prisma.Decimal
    chargedAmount: Prisma.Decimal; proxyEarnings: Prisma.Decimal
    platformNet: Prisma.Decimal   // bookkeeping only: never persisted, never sent over HTTP
  }
  export function computeCharge(offeredPrice: Prisma.Decimal | number | string): ChargeBreakdown
  export function toCentavos(value: Prisma.Decimal): number
  export function breakdownToNumbers(b: ChargeBreakdown): { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }
    // exactly these five keys; platformNet is dropped on purpose
  ```
- Algorithm (fixed by D1; the only place these constants appear):
  ```ts
  const HALF_UP = Prisma.Decimal.ROUND_HALF_UP
  const price = new Prisma.Decimal(offeredPrice)
  const chargedAmount = price                                      // the client pays exactly what they typed
  const platformFee = price.mul(PLATFORM_FEE_RATE).toDecimalPlaces(2, HALF_UP)
  const proxyEarnings = price.minus(platformFee)                   // = round(price × 0.80) for 2-dp prices; split is exact
  const stripeFee = chargedAmount.mul(STRIPE_FEE_RATE).plus(STRIPE_FEE_FIXED).toDecimalPlaces(2, HALF_UP)
  const platformNet = platformFee.minus(stripeFee)
  // toCentavos: value.mul(100).toDecimalPlaces(0, HALF_UP).toNumber()
  ```

- [ ] **Step 1: Write the failing test** `src/common/money.spec.ts` (values computed with Python
  `decimal`, `ROUND_HALF_UP`, 2 dp):
  ```ts
  describe('computeCharge', () => {
    it.each([
      // price,    platformFee, stripeFee, chargedAmount, proxyEarnings, platformNet, chargedCentavos, earningsCentavos
      ['100',      '20.00',     '4.38',    '100.00',      '80.00',       '15.62',     10000,           8000],
      ['20.03',    '4.01',      '1.19',    '20.03',       '16.02',       '2.82',      2003,            1602],   // platformFee 4.006 → 4.01
      ['20',       '4.00',      '1.19',    '20.00',       '16.00',       '2.81',      2000,            1600],   // MIN_OFFERED_PRICE
      ['50',       '10.00',     '2.39',    '50.00',       '40.00',       '7.61',      5000,            4000],   // stripeFee 2.385 → 2.39 (half-up, not half-even)
      ['49.90',    '9.98',      '2.38',    '49.90',       '39.92',       '7.60',      4990,            3992],
      ['33.33',    '6.67',      '1.72',    '33.33',       '26.66',       '4.95',      3333,            2666],
      ['1234.56',  '246.91',    '49.65',   '1234.56',     '987.65',      '197.26',    123456,          98765],
      ['10000',    '2000.00',   '399.39',  '10000.00',    '8000.00',     '1600.61',   1000000,         800000], // MAX_OFFERED_PRICE
    ])('price %s', (price, platformFee, stripeFee, chargedAmount, proxyEarnings, platformNet, chargedCentavos, earningsCentavos) => {
      const b = computeCharge(price)
      expect(b.platformFee.toFixed(2)).toBe(platformFee)
      expect(b.stripeFee.toFixed(2)).toBe(stripeFee)
      expect(b.chargedAmount.toFixed(2)).toBe(chargedAmount)
      expect(b.proxyEarnings.toFixed(2)).toBe(proxyEarnings)
      expect(b.platformNet.toFixed(2)).toBe(platformNet)
      expect(toCentavos(b.chargedAmount)).toBe(chargedCentavos)
      expect(toCentavos(b.proxyEarnings)).toBe(earningsCentavos)
      // D1 identities
      expect(b.chargedAmount.toFixed(2)).toBe(new Prisma.Decimal(price).toFixed(2))                 // client pays exactly offeredPrice
      expect(b.proxyEarnings.toFixed(2)).toBe(new Prisma.Decimal(price).mul('0.80').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2))
      expect(b.platformFee.plus(b.proxyEarnings).toFixed(2)).toBe(chargedAmount)                     // the split is exact
      expect(b.chargedAmount.mul('0.0399').plus('0.39').toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)).toBe(stripeFee)
      expect(b.platformFee.minus(b.stripeFee).toFixed(2)).toBe(platformNet)
    })
    it('accepts Decimal and number inputs', () => {
      expect(computeCharge(new Prisma.Decimal('100')).proxyEarnings.toFixed(2)).toBe('80.00')
      expect(computeCharge(100).stripeFee.toFixed(2)).toBe('4.38')
    })
  })
  describe('toCentavos', () => {
    it('never produces a float artefact', () => {
      expect(toCentavos(new Prisma.Decimal('20.01'))).toBe(2001)   // 20.01 * 100 === 2001.0000000000002 in JS
      expect(Number.isInteger(toCentavos(new Prisma.Decimal('0.29')))).toBe(true)   // 0.29 * 100 === 28.999999999999996
    })
  })
  describe('breakdownToNumbers', () => {
    it('returns the five plain numbers for the HTTP layer (no platformNet)', () => {
      expect(breakdownToNumbers(computeCharge('100'))).toEqual({
        offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 100, proxyEarnings: 80,
      })
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/common/money.spec.ts` →
  `Cannot find module './money'`.
- [ ] **Step 3: Implement** `computeCharge`, `toCentavos`, `breakdownToNumbers` in
  `src/common/money.ts` exactly as the algorithm above (no other rounding points). Apply the
  `Decimal` declaration fixes listed under Files if `npx tsc --noEmit --skipLibCheck false` still
  reports `Cannot find name 'Decimal'`.
- [ ] **Step 4: Run it, expect pass** — `npx jest src/common/money.spec.ts --coverage
  --collectCoverageFrom=src/common/money.ts` → `Tests: 11 passed`, `money.ts | 100 | 100 | 100 | 100`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest` (the unit factory change
  must not break existing specs: `makeTaskDetails` consumers compare with `toMatchObject`, and
  `validate-task.service.spec.ts` still asserts the old `7562` — it is rewritten in P1-T12; if the
  Decimal factory breaks its arithmetic now, mark that spec `it.todo` with a `// P1-T12` pointer).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(common): P1-T01 money model D1 in Prisma.Decimal`

---

### Task P1-T02: Prisma migration `phase1_money_core`

**Files:**
- Modify: `prisma/schema.prisma:51` (`rating`), `:54` (`walletBalance`), `:58-59` (add
  `payoutIssue`), `:82-83` (lat/lng precision), `:86-88` (add `stripeFee`, `chargedAmount`),
  `:143-158` (`Payments`: `chargeId`, `disputeId`, `@@unique([paymentIntent])`, `@@index([taskId])`)
- Create: `prisma/migrations/<timestamp>_phase1_money_core/migration.sql` (generated, then edited)
- Create: `test/schema/phase1-constraints.e2e-spec.ts`
- Modify: `test/setup/test-app.factory.ts:20-29` — no table added (same tables), nothing to do; listed
  so the implementer checks `TRUNCATE` still covers `payments`/`cards`.

**Interfaces:**
- Produces (schema):
  ```prisma
  // Users
  rating        Decimal @default(0) @db.Decimal(3, 2)
  walletBalance Decimal @default(0) @db.Decimal(12, 2)
  payoutIssue   Boolean @default(false)
  // Tasks
  locationLat   Decimal  @db.Decimal(9, 6)
  locationLng   Decimal  @db.Decimal(9, 6)
  stripeFee     Decimal? @db.Decimal(10, 2)
  chargedAmount Decimal? @db.Decimal(10, 2)
  // (no platformNet column: it is derived as platformFee − stripeFee, see the Amendments rulings)
  // Payments
  chargeId  String?
  disputeId String?
  @@unique([paymentIntent])
  @@index([taskId])
  ```
- Raw SQL appended to the generated migration (Prisma cannot express partial indexes):
  ```sql
  -- one active card per user: soft-delete older duplicates, then enforce
  UPDATE "cards" c SET "isDeleted" = true
  WHERE c."isDeleted" = false AND c.id NOT IN (
    SELECT DISTINCT ON ("userId") id FROM "cards" WHERE "isDeleted" = false
    ORDER BY "userId", "createdAt" DESC
  );
  CREATE UNIQUE INDEX "cards_one_active_per_user" ON "cards" ("userId") WHERE "isDeleted" = false;
  -- backfill fee columns for existing tasks with the D1 model (only where missing):
  -- client pays offeredPrice, platform 20 %, proxy 80 %, Stripe fee 3.99 % + 0.39 on the charge
  -- (Postgres ROUND(numeric, 2) rounds half away from zero = ROUND_HALF_UP for positive amounts)
  UPDATE "tasks" SET "platformFee" = ROUND("offeredPrice" * 0.20, 2) WHERE "platformFee" IS NULL;
  UPDATE "tasks" SET "proxyEarnings" = "offeredPrice" - "platformFee" WHERE "proxyEarnings" IS NULL;
  UPDATE "tasks" SET "chargedAmount" = "offeredPrice" WHERE "chargedAmount" IS NULL;
  UPDATE "tasks" SET "stripeFee" = ROUND("chargedAmount" * 0.0399 + 0.39, 2) WHERE "stripeFee" IS NULL;
  ```
  For R$ 100.00 the backfill writes platformFee 20.00, proxyEarnings 80.00, chargedAmount 100.00,
  stripeFee 4.38 (same as `computeCharge`). Completed tasks that already have `proxyEarnings` (old
  model, e.g. 75.62) are left untouched. Legacy in-flight tasks were charged `offeredPrice` by the
  old start code, which equals the new `chargedAmount`, so their 80 % transfer at validate is
  consistent with what was charged.

- [ ] **Step 1: Write the failing test** `test/schema/phase1-constraints.e2e-spec.ts` (uses
  `createTestApp/resetDatabase`, `createUser`, `createTask`):
  ```ts
  it('allows only one active card per user (partial unique index)', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const data = { userId: user.id, stripeCardId: 'pm_1', brand: 'visa', last4: '4242' }
    await ctx.prisma.cards.create({ data })
    await expect(ctx.prisma.cards.create({ data: { ...data, stripeCardId: 'pm_2' } }))
      .rejects.toMatchObject({ code: 'P2002' })
    await ctx.prisma.cards.updateMany({ where: { userId: user.id }, data: { isDeleted: true } })
    await expect(ctx.prisma.cards.create({ data: { ...data, stripeCardId: 'pm_2' } })).resolves.toBeDefined()
  })
  it('rejects two payments for the same PaymentIntent', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id)
    await ctx.prisma.payments.create({ data: { taskId: task.id, paymentIntent: 'pi_dup', amount: 100 } })
    await expect(ctx.prisma.payments.create({ data: { taskId: task.id, paymentIntent: 'pi_dup', amount: 100 } }))
      .rejects.toMatchObject({ code: 'P2002' })
  })
  it('exposes the new columns with their defaults', async () => {
    const owner = await createUser(ctx.app, ctx.prisma)
    const task = await createTask(ctx.prisma, owner.id)
    const user = await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } })
    expect(user.payoutIssue).toBe(false)
    expect(task).toHaveProperty('stripeFee')      // column exists (value is set by the factory from P1-T03 on)
    expect(task).toHaveProperty('chargedAmount')
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand
  test/schema` → `Unknown argument 'payoutIssue'` / first `cards.create` does not reject.
- [ ] **Step 3: Implement** — edit `schema.prisma` as above; `npx prisma migrate dev --name
  phase1_money_core --create-only`; append the raw SQL block to the generated `migration.sql`
  **after** Prisma's own statements; `npx prisma migrate dev` (applies) ; `npx prisma generate`.
  Then confirm Prisma does not want to drop the partial index: `npx prisma migrate dev --create-only
  --name drift_check` must say "No schema changes found" (delete the empty folder if one was created;
  if it generates a `DROP INDEX "cards_one_active_per_user"`, delete that folder and record the
  problem under this task in STATUS.md before continuing — the index then has to be re-created by a
  `prisma.$executeRaw` in `PrismaService.onModuleInit`).
- [ ] **Step 4: Run it, expect pass** — the e2e command from Step 2 → `Tests: 3 passed`
  (`global-setup` runs `prisma migrate deploy`, so the new migration is applied in the container).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest`; `npm run test:e2e` must stay
  at the Phase 0 baseline (the `Decimal(12,2)`/`(3,2)` narrowing changes no assertion).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(prisma): P1-T02 phase1_money_core migration`

---

### Task P1-T03: StripeService — SetupIntent, off-session charge with automatic capture, idempotent refund/transfer, two webhook secrets, test doubles

**Files:**
- Modify: `src/env/env.ts:11-13` (`STRIPE_PUBLIC_KEY` → `.optional()`, add
  `STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional()`), `.env.example` (add
  `STRIPE_CONNECT_WEBHOOK_SECRET=` with a comment "secret of the Dashboard endpoint registered for
  *Connected accounts*; optional locally where `stripe listen` delivers both families").
- Modify: `src/stripe/stripe.module.ts:13-25` (third provider `'STRIPE_CONNECT_WEBHOOK_SECRET'` →
  `env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? null`).
- Modify: `src/stripe/stripe.service.ts:14-31` (constructor + `constructWebhookEvent`), `:63-101`
  (add the four new methods below; keep the legacy ones listed below until their last caller is
  migrated).
- Modify: `src/stripe/types/index.d.ts:1-5` (replace `CreatePaymentIntentData`).
- Create: `src/stripe/stripe.service.spec.ts`
- Modify: `test/mocks/stripe.service.mock.ts:3-35`
- Modify: `test/factories/task.factory.ts:3-42`; Create: `test/factories/payment.factory.ts`
- Modify: `test/setup/global-setup.ts:32-47` add `STRIPE_CONNECT_WEBHOOK_SECRET=whsec_test_connect`.

**Interfaces:**
- Produces (`StripeService`), all returning the Stripe SDK types:
  ```ts
  constructor(@Inject('STRIPE_SECRET_KEY') apiKey: string, @Inject('STRIPE_WEBHOOK_SECRET') webhookSecret: string,
              @Inject('STRIPE_CONNECT_WEBHOOK_SECRET') connectWebhookSecret: string | null)
  constructWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event
    // tries webhookSecret; on throw and connectWebhookSecret !== null tries it; else rethrows the FIRST error
  createSetupIntent(customer: string): Promise<Stripe.SetupIntent>
    // setupIntents.create({ customer, usage: 'off_session', payment_method_types: ['card'] })
  chargeSavedCard(data: ChargeSavedCardData, idempotencyKey: string): Promise<Stripe.PaymentIntent>
    // creates AND confirms in one call, automatic capture (D3):
    // paymentIntents.create({ amount, currency: 'brl', customer, payment_method: paymentMethod,
    //   payment_method_types: ['card'], confirm: true, off_session: true,
    //   transfer_group: taskId, metadata: { taskId, proxyId, claimedAt } }, { idempotencyKey })
    // NO `capture_method` key (Stripe's default automatic capture: a `succeeded` answer is a final charge;
    // the funds sit in the platform balance until P1-T12 transfers them)
  refundPaymentIntent(paymentIntentId: string, idempotencyKey: string): Promise<Stripe.Refund>
    // refunds.create({ payment_intent }, { idempotencyKey })   — no `amount`: always the full charge (D7)
  createTransferFromCharge(data: CreateTransferData, idempotencyKey: string): Promise<Stripe.Transfer>
    // transfers.create({ amount, currency: 'brl', destination, source_transaction: sourceTransaction,
    //   transfer_group: transferGroup, metadata: { taskId } }, { idempotencyKey })
  ```
  There is no capture, cancel-intent or hold method: D3 forbids manual capture, and a
  non-succeeded intent holds no funds, so nothing needs releasing on Stripe.
  `src/stripe/types/index.d.ts`:
  ```ts
  export type ChargeSavedCardData = {
    amount: number              // centavos, from toCentavos(chargedAmount)
    customer: string; paymentMethod: string
    taskId: string; proxyId: string
    claimedAt: string           // ISO of the claim's Tasks.startedAt; lets P1-T14 match a webhook to the exact claim
  }
  export type CreateTransferData = { amount: number; destination: string; sourceTransaction: string; transferGroup: string; taskId: string }
  ```
  Legacy methods kept **for now** and deleted by the task that migrates their last caller:
  `attachPaymentMethodToCustomer` (P1-T05), `createPaymentIntent` + `confirmPaymentIntent` (P1-T08),
  `createTransfer` (P1-T12), `refundPayment` (P1-T13), `reverseTransfer` + `listPayoutTransactions`
  (P1-T15). Unchanged: `searchCustomer`, `createCustomer`, `retrievePaymentMethod`,
  `detachPaymentMethod`, `createMerchantAccount`, `linkMerchantAccount`, `createDashboardLoginLink`.
- Produces (`test/mocks/stripe.service.mock.ts`) defaults — later tasks rely on these exact values:
  ```ts
  createSetupIntent: { id: 'seti_test_123', client_secret: 'seti_test_123_secret_abc' }
  retrievePaymentMethod: { id: 'pm_test_123', customer: 'cus_test_default', card: { brand: 'visa', last4: '4242' } }
  chargeSavedCard: { id: 'pi_test_123', status: 'succeeded', latest_charge: 'ch_test_123' }
  refundPaymentIntent: { id: 're_test_123', status: 'succeeded' }
  createTransferFromCharge: { id: 'tr_test_123' }
  detachPaymentMethod: { id: 'pm_test_123' }     // unchanged
  ```
  (keep the legacy mocks until their methods are deleted.)
- Produces (`test/factories/task.factory.ts`): `CreateTaskOverrides` gains `proxyEarnings?`,
  `platformFee?`, `stripeFee?`, `chargedAmount?` (each `number | null`; `null` seeds a legacy row
  without stored fees), `proofImageUrl?: string | null`, `transferId?: string | null`,
  `payout_failed` in the status union; defaults for the four fee fields come from
  `computeCharge(overrides.offeredPrice ?? 50)` (`breakdownToNumbers`) so seeded tasks look like
  created ones (for 50: platformFee 10.00, stripeFee 2.39, chargedAmount 50.00, proxyEarnings 40.00).
- Produces (`test/factories/payment.factory.ts`):
  ```ts
  export const createPayment = (prisma: PrismaService, taskId: string, overrides: {
    paymentIntent?: string; status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed'
    amount?: number; chargeId?: string | null; refundId?: string | null; disputeId?: string | null; createdAt?: Date
  } = {}) => prisma.payments.create({ data: {
    taskId, paymentIntent: overrides.paymentIntent ?? 'pi_test_123', status: overrides.status ?? 'succeeded',
    amount: overrides.amount ?? 50,   // = chargedAmount of the task factory default (offeredPrice 50)
    chargeId: overrides.chargeId === undefined ? ((overrides.status ?? 'succeeded') === 'succeeded' ? 'ch_test_123' : null) : overrides.chargeId,
    refundId: overrides.refundId ?? null, disputeId: overrides.disputeId ?? null,
    ...(overrides.createdAt && { createdAt: overrides.createdAt }),
  } })
  ```
  The default status is `succeeded` because that is the only status the new `start` writes;
  `pending` is seeded explicitly to represent rows created before this phase.

- [ ] **Step 1: Write the failing test** `src/stripe/stripe.service.spec.ts` (construct the service
  directly with `'sk_test_x'`, `'whsec_platform'`, `'whsec_connect'`; replace the SDK resources with
  `jest.fn()` through
  `(service as any).stripe = { webhooks: { constructEvent }, paymentIntents: { create }, setupIntents: { create: setupIntentsCreate }, refunds: { create: refundsCreate }, transfers: { create: transfersCreate } }`):
  ```ts
  it('verifies with the platform secret first', () => {
    constructEvent.mockReturnValueOnce({ id: 'evt_1' })
    expect(service.constructWebhookEvent('{}', 'sig')).toEqual({ id: 'evt_1' })
    expect(constructEvent).toHaveBeenCalledTimes(1)
    expect(constructEvent).toHaveBeenCalledWith('{}', 'sig', 'whsec_platform')
  })
  it('falls back to the Connect secret when the platform secret rejects', () => {
    constructEvent.mockImplementationOnce(() => { throw new Error('No signatures found') })
      .mockReturnValueOnce({ id: 'evt_2' })
    expect(service.constructWebhookEvent('{}', 'sig')).toEqual({ id: 'evt_2' })
    expect(constructEvent).toHaveBeenNthCalledWith(2, '{}', 'sig', 'whsec_connect')
  })
  it('rethrows the first error when no Connect secret is configured', () => {
    const svc = new StripeService('sk_test_x', 'whsec_platform', null) // + same SDK stub
    constructEvent.mockImplementation(() => { throw new Error('bad sig') })
    expect(() => svc.constructWebhookEvent('{}', 'sig')).toThrow('bad sig')
    expect(constructEvent).toHaveBeenCalledTimes(1)
  })
  it('creates and confirms an off-session PaymentIntent with automatic capture and the idempotency key', async () => {
    await service.chargeSavedCard(
      { amount: 10000, customer: 'cus_1', paymentMethod: 'pm_1', taskId: 't1', proxyId: 'p1', claimedAt: '2026-11-23T12:00:00.000Z' },
      'start:t1:p1:1795435200000')
    expect(create).toHaveBeenCalledWith({
      amount: 10000, currency: 'brl', customer: 'cus_1', payment_method: 'pm_1', payment_method_types: ['card'],
      confirm: true, off_session: true, transfer_group: 't1',
      metadata: { taskId: 't1', proxyId: 'p1', claimedAt: '2026-11-23T12:00:00.000Z' },
    }, { idempotencyKey: 'start:t1:p1:1795435200000' })
    expect(create.mock.calls[0][0]).not.toHaveProperty('capture_method')   // D3: automatic capture only
  })
  it('creates a SetupIntent for off-session usage', async () => {
    await service.createSetupIntent('cus_1')
    expect(setupIntentsCreate).toHaveBeenCalledWith({ customer: 'cus_1', usage: 'off_session', payment_method_types: ['card'] })
  })
  it('creates transfers from the charge with group and idempotency key', async () => {
    await service.createTransferFromCharge({ amount: 8000, destination: 'acct_1', sourceTransaction: 'ch_1', transferGroup: 't1', taskId: 't1' }, 'task:t1:transfer')
    expect(transfersCreate).toHaveBeenCalledWith({ amount: 8000, currency: 'brl', destination: 'acct_1', source_transaction: 'ch_1', transfer_group: 't1', metadata: { taskId: 't1' } }, { idempotencyKey: 'task:t1:transfer' })
  })
  it('refunds by PaymentIntent with the idempotency key and no amount (full refund)', async () => {
    await service.refundPaymentIntent('pi_1', 'task:t1:refund')
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'task:t1:refund' })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/stripe/stripe.service.spec.ts` → TS error
  `Expected 2 arguments, but got 3` / `Property 'chargeSavedCard' does not exist`.
- [ ] **Step 3: Implement** the constructor, `constructWebhookEvent` fallback and the four new
  methods (`createSetupIntent`, `chargeSavedCard`, `refundPaymentIntent`,
  `createTransferFromCharge`) in `src/stripe/stripe.service.ts`; the module provider and env
  changes; the mock, the two factories and the `global-setup` env line. `createStripeServiceMock`
  must list every public method of the service (old and new) or `overrideProvider` leaves
  `undefined` functions. Confirm `grep -rn "capture_method\|paymentIntents.capture" src` prints
  nothing.
- [ ] **Step 4: Run it, expect pass** — `Tests: 7 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e` (nothing
  functional changed for existing routes; factories keep their defaults).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(stripe): P1-T03 setup intents, off-session automatic-capture charge, idempotent transfers, connect secret`

---

### Task P1-T04: Repositories — CAS transitions, atomic claim, payment bookkeeping

**Files:**
- Modify: `src/modules/tasks/repository/tasks.repository.ts:92-103` (keep `updateTaskStatus` until
  P1-T13 deletes it), add the methods below; `src/modules/tasks/dtos/tasks-repository.dto.ts:13-29`;
  `src/modules/tasks/types/index.d.ts` (new types).
- Modify: `src/modules/payments/repository/payments.repository.ts:12-28`,
  `src/modules/payments/dtos/payments-repository.dto.ts:3-6`,
  `src/modules/payments/types/index.d.ts:10-25` (`PaymentRecord` gains `chargeId: string | null;
  disputeId: string | null`; add `UpdatePaymentData`, `RecordSucceededChargeData`).
- Modify: `src/modules/payments/payments.module.ts:9-19` → `exports: [PaymentsRepository]`, drop
  `StripeModule`/`EnvService`/`CreatePaymentRecordService` (keep `PrismaService` only if Phase 0's
  global module is not merged).
- Modify: `src/modules/tasks/tasks.module.ts:42-73` → `imports` gains `PaymentsModule`; remove
  `PaymentsRepository` from `providers`.
- Modify: `src/modules/tasks/use-cases/fetch-task-by-id.service.ts:44`
  (`fetchPaymentRecord(taskId)` → `fetchLatestByTaskId(taskId)`) and its spec's mock key.
- Create: `test/tasks/tasks-repository.e2e-spec.ts`
- Modify: `prisma/schema.prisma` (`cardActionRequired Boolean @default(false)` in `model Users`, right
  after `payoutIssue`).
- Create: `prisma/migrations/<timestamp>_phase1_card_action_required/migration.sql` — generated with
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` after
  editing `schema.prisma` (content: `ALTER TABLE "users" ADD COLUMN "cardActionRequired" BOOLEAN NOT NULL DEFAULT false;`),
  then `npx prisma migrate deploy` and `npx prisma generate` (`prisma migrate dev` refuses
  non-interactive runs in this loop). Do not edit the P1-T02 `phase1_money_core` migration.

**Interfaces:**
- Produces (`TasksRepository`):
  ```ts
  export type TransitionTaskData = {
    taskId: string; from: TaskStatus[]; to: TaskStatus
    data?: { startedAt?: Date | null; completedAt?: Date | null; canceledAt?: Date | null; proofImageUrl?: string | null; transferId?: string | null }
  }
  transition(data: TransitionTaskData): Promise<boolean>
    // prisma.tasks.updateMany({ where: { id, status: { in: from } }, data: { status: to, ...data } }) → count === 1

  export type ClaimTaskData = { taskId: string; executorId: string; startedAt: Date }
  claimTask(data: ClaimTaskData): Promise<boolean>
    // interactive $transaction:
    //   r = tx.tasks.updateMany({ where: { id: taskId, status: 'available' }, data: { status: 'in_progress', startedAt } })
    //   r.count !== 1 → return false (nothing else written)
    //   tx.userTaskMapping.deleteMany({ where: { taskId } })            // clears a stale legacy mapping, if any
    //   tx.userTaskMapping.create({ data: { taskId, executorId } }) → return true
    // No payment row here: the PaymentIntent id exists only after P1-T08 calls Stripe.
    // `startedAt` is the claim timestamp; P1-T08 derives the Stripe idempotency key from it.

  export type ReleaseClaimData = { taskId: string; executorId: string; startedAt: Date; cardActionOwnerId?: string }
  releaseClaim(data: ReleaseClaimData): Promise<boolean>
    // interactive $transaction:
    //   r = tx.tasks.updateMany({ where: { id: taskId, status: 'in_progress', startedAt }, data: { status: 'available', startedAt: null } })
    //   r.count === 1 → tx.userTaskMapping.deleteMany({ where: { taskId, executorId } })
    //   and, when `cardActionOwnerId` is given (P1-T08 definite charge failure), tx.users.update({ where: { id: cardActionOwnerId }, data: { cardActionRequired: true } }) in the same transaction
    //   return r.count === 1
    // Matching on startedAt releases only that exact claim: a later claim (new startedAt) or a task that moved on is untouched.

  export type RecordTransferData = { taskId: string; executorId: string; transferId: string; proxyEarnings: Prisma.Decimal }
  recordTransfer(data: RecordTransferData): Promise<void>
    // $transaction([ tasks.update({ where: { id }, data: { transferId } }),
    //                users.update({ where: { id: executorId }, data: { totalTasksCompleted: { increment: 1 }, walletBalance: { increment: proxyEarnings } } }) ])
  ```
- Produces (`PaymentsRepository`):
  ```ts
  export type UpdatePaymentData = { status?: PaymentStatus; refundId?: string | null; chargeId?: string | null; disputeId?: string | null }
  export type RecordSucceededChargeData = { taskId: string; paymentIntent: string; amount: Prisma.Decimal; chargeId: string | null }
  fetchLatestByTaskId(taskId: string): Promise<PaymentRecord | null>   // findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } })
  findByPaymentIntent(paymentIntent: string): Promise<PaymentRecord | null>   // findUnique
  updateById(id: string, data: UpdatePaymentData): Promise<void>   // payments.update({ where: { id }, data })
  recordSucceededCharge(data: RecordSucceededChargeData): Promise<PaymentRecord>
    // idempotent; called by POST /tasks/start (P1-T08) and by the payment_intent.succeeded webhook (P1-T14), in any order:
    // 1. payments.createMany({ data: [{ taskId, paymentIntent, amount, status: 'succeeded', chargeId }], skipDuplicates: true })
    //    (INSERT … ON CONFLICT ("paymentIntent") DO NOTHING — the unique index comes from P1-T02)
    // 2. payments.updateMany({ where: { paymentIntent, status: 'pending' }, data: { status: 'succeeded' } })   // rows created before this phase
    // 3. chargeId !== null → payments.updateMany({ where: { paymentIntent, chargeId: null }, data: { chargeId } })
    // 4. return payments.findUniqueOrThrow({ where: { paymentIntent } })
    // Never touches a row that is already 'refunded', 'disputed' or 'failed' (no downgrade, no resurrection).
  ```
  Legacy `createPaymentRecord`/`fetchPaymentRecord`/`updatePaymentRecord` and the three pass-through
  services in `payments/use-cases/` stay until P1-T08 (create) and P1-T13 (fetch/update) delete them.

- [ ] **Step 1: Write the failing test** `test/tasks/tasks-repository.e2e-spec.ts` — obtain repos with
  `ctx.app.get(TasksRepository)` / `ctx.app.get(PaymentsRepository)`; helper
  `claimFor = (taskId, executorId = proxy.id, startedAt = new Date()) => ({ taskId, executorId, startedAt })`:
  ```ts
  it('transition is a no-op when the from-status does not match', async () => {
    const task = await createTask(ctx.prisma, owner.id, { status: 'canceled' })
    await expect(repo.transition({ taskId: task.id, from: ['in_progress'], to: 'verification_required', data: { completedAt: new Date() } })).resolves.toBe(false)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.status).toBe('canceled'); expect(stored.completedAt).toBeNull()
  })
  it('transition writes status and data when the from-status matches', async () => {
    const task = await createTask(ctx.prisma, owner.id, { status: 'in_progress', startedAt: new Date() })
    await expect(repo.transition({ taskId: task.id, from: ['in_progress'], to: 'verification_required', data: { completedAt: new Date(), proofImageUrl: `${task.id}/a.jpg` } })).resolves.toBe(true)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.status).toBe('verification_required'); expect(stored.proofImageUrl).toBe(`${task.id}/a.jpg`)
  })
  it('claimTask claims an available task atomically and writes no payment', async () => {
    const task = await createTask(ctx.prisma, owner.id)
    const startedAt = new Date()
    await expect(repo.claimTask(claimFor(task.id, proxy.id, startedAt))).resolves.toBe(true)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.status).toBe('in_progress'); expect(stored.startedAt?.getTime()).toBe(startedAt.getTime())
    expect((await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: task.id } }))?.executorId).toBe(proxy.id)
    expect(await ctx.prisma.payments.count({ where: { taskId: task.id } })).toBe(0)
  })
  it('claimTask returns false and writes nothing when the task is not available', async () => {
    const task = await createTask(ctx.prisma, owner.id, { status: 'in_progress', startedAt: new Date() })
    await expect(repo.claimTask(claimFor(task.id))).resolves.toBe(false)
    expect(await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: task.id } })).toBeNull()
  })
  it('exactly one of two concurrent claims wins', async () => {
    const task = await createTask(ctx.prisma, owner.id)
    const results = await Promise.all([repo.claimTask(claimFor(task.id, proxy.id)), repo.claimTask(claimFor(task.id, proxy2.id))])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await ctx.prisma.userTaskMapping.count({ where: { taskId: task.id } })).toBe(1)
  })
  it('releaseClaim reverts task and mapping for the matching claim only', async () => {
    const task = await createTask(ctx.prisma, owner.id)
    const startedAt = new Date()
    await repo.claimTask(claimFor(task.id, proxy.id, startedAt))
    await expect(repo.releaseClaim({ taskId: task.id, executorId: proxy.id, startedAt: new Date(startedAt.getTime() - 1000) })).resolves.toBe(false)   // stale claim
    expect((await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress')
    await expect(repo.releaseClaim({ taskId: task.id, executorId: proxy.id, startedAt })).resolves.toBe(true)
    const stored = await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } })
    expect(stored.status).toBe('available'); expect(stored.startedAt).toBeNull()
    expect(await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: task.id } })).toBeNull()
  })
  it('releaseClaim flags the owner card when cardActionOwnerId is given', async () => {
    const t1 = await createTask(ctx.prisma, owner.id); const s1 = new Date()
    await repo.claimTask(claimFor(t1.id, proxy.id, s1))
    await repo.releaseClaim({ taskId: t1.id, executorId: proxy.id, startedAt: s1 })           // no option
    expect((await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } })).cardActionRequired).toBe(false)
    const t2 = await createTask(ctx.prisma, owner.id); const s2 = new Date()
    await repo.claimTask(claimFor(t2.id, proxy.id, s2))
    await repo.releaseClaim({ taskId: t2.id, executorId: proxy.id, startedAt: s2, cardActionOwnerId: owner.id })
    expect((await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } })).cardActionRequired).toBe(true)
  })
  it('recordSucceededCharge is idempotent and back-fills chargeId', async () => {
    const task = await createTask(ctx.prisma, owner.id, { status: 'in_progress', startedAt: new Date() })
    const data = { taskId: task.id, paymentIntent: 'pi_rec', amount: new Prisma.Decimal('100'), chargeId: null }
    await payments.recordSucceededCharge(data)
    const row = await payments.recordSucceededCharge({ ...data, chargeId: 'ch_rec' })
    expect(row.status).toBe('succeeded'); expect(row.chargeId).toBe('ch_rec'); expect(row.amount.toFixed(2)).toBe('100.00')
    await Promise.all([payments.recordSucceededCharge(data), payments.recordSucceededCharge(data)])
    expect(await ctx.prisma.payments.count({ where: { taskId: task.id } })).toBe(1)
  })
  it('recordSucceededCharge never downgrades a refunded or disputed row', async () => {
    await createPayment(ctx.prisma, task.id, { paymentIntent: 'pi_ref', status: 'refunded', chargeId: 'ch_ref', refundId: 're_1' })
    const row = await payments.recordSucceededCharge({ taskId: task.id, paymentIntent: 'pi_ref', amount: new Prisma.Decimal('100'), chargeId: 'ch_ref' })
    expect(row.status).toBe('refunded')
  })
  it('recordTransfer increments counters and wallet atomically', async () => {
    await repo.recordTransfer({ taskId: task.id, executorId: proxy.id, transferId: 'tr_1', proxyEarnings: new Prisma.Decimal('80') })
    await repo.recordTransfer({ taskId: task2.id, executorId: proxy.id, transferId: 'tr_2', proxyEarnings: new Prisma.Decimal('40') })
    const u = await ctx.prisma.users.findUniqueOrThrow({ where: { id: proxy.id } })
    expect(u.totalTasksCompleted).toBe(2); expect(u.walletBalance.toFixed(2)).toBe('120.00')
  })
  it('fetchLatestByTaskId returns the newest payment', async () => {
    await createPayment(ctx.prisma, task.id, { paymentIntent: 'pi_old', status: 'failed', createdAt: new Date(Date.now() - 3_600_000) })
    await createPayment(ctx.prisma, task.id, { paymentIntent: 'pi_new', status: 'succeeded' })
    expect((await payments.fetchLatestByTaskId(task.id))?.paymentIntent).toBe('pi_new')
    expect((await payments.findByPaymentIntent('pi_old'))?.status).toBe('failed')
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand
  test/tasks/tasks-repository.e2e-spec.ts` → `repo.transition is not a function`.
- [ ] **Step 3: Implement** the `cardActionRequired` column first (schema edit → `migrate diff` →
  `migrate deploy` → `prisma generate`, see Files), then the methods above in both repositories (+ DTO interfaces + types), the
  module wiring (`PaymentsModule` exports, `TasksModule` imports it), and the one-line change in
  `fetch-task-by-id.service.ts`. `claimTask` and `releaseClaim` use
  `this.prisma.$transaction(async (tx) => { ... })`; return `false` *without throwing* when the CAS
  count is 0 (an early `return false` inside the callback commits an empty transaction, which is
  fine).
- [ ] **Step 4: Run it, expect pass** — `Tests: 11 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T04 CAS transitions, atomic claim, payment bookkeeping`

---

### Task P1-T05: Cards via SetupIntent

**Files:**
- Create: `src/modules/cards/controllers/create-setup-intent.controller.ts`,
  `src/modules/cards/use-cases/create-setup-intent.service.ts` (+ `.spec.ts`)
- Rename: `src/modules/cards/use-cases/create-user-payment-method.service.ts` →
  `save-card.service.ts` (class `SaveCardService`); spec renamed `save-card.service.spec.ts`.
- Modify: `src/modules/cards/controllers/create-user-payment-method.controller.ts:11-13,32-37`
  (body `{ paymentMethodId }`), `src/modules/cards/repositories/cards.repository.ts:40-50`
  (`updateUserSource` → `replaceUserCard`), `src/modules/cards/dtos/cards-repository.dto.ts:7-13`,
  `src/modules/cards/types/index.d.ts:1-7,21-26`, `src/modules/cards/cards.module.ts:15-32`,
  `src/modules/tasks/tasks.module.ts:33,66` (import path/class rename).
- Modify: `src/exception/error-dictionary.ts:66-90` add `card.alreadyExists`, `card.notConfirmed`.
- Modify: `src/stripe/stripe.service.ts` delete `attachPaymentMethodToCustomer` (+ mock entry).
- Create: `test/cards/setup-intent.e2e-spec.ts`; Modify: `test/cards/create-card.e2e-spec.ts:43-74`.
- Note: the `cardActionRequired` column and its migration are created by P1-T04; this task only clears the flag.

**Interfaces:**
- Consumes: `StripeService.createSetupIntent`, `retrievePaymentMethod`, `detachPaymentMethod` (P1-T03);
  `AuthRepository.findUserStripeCustomerId`.
- Produces:
  ```ts
  // POST /card/setup-intent  (201)
  CreateSetupIntentService.execute(userId: string): Promise<{ clientSecret: string; setupIntentId: string }>
    // 404 USER_NOT_FOUND when no stripeCustomerId; 400 CARD_CREATION_FAILED when Stripe returns no client_secret
  // POST /card/create  body z.object({ paymentMethodId: z.string().min(1) })  (201 → UserCard)
  export type SaveCardData = { userId: string; paymentMethodId: string }
  SaveCardService.execute(data: SaveCardData): Promise<UserCard>
    // 1. customer id (404 USER_NOT_FOUND)
    // 2. pm = retrievePaymentMethod(paymentMethodId); customer of pm (string | { id }) must equal stripeCustomerId and pm.card must exist,
    //    else 400 CARD_NOT_CONFIRMED
    // 3. { card, previousStripeCardId } = cardsRepository.replaceUserCard(...)   (P2002 → 409 CARD_ALREADY_EXISTS)
    // 4. if previousStripeCardId && previousStripeCardId !== pm.id → detachPaymentMethod(previous) in try/catch (Logger.warn on failure)
  // Also: the `replaceUserCard` transaction runs tx.users.update({ where: { id: userId }, data: { cardActionRequired: false } })
  //   (D3 ruling: a new saved card clears the "confirm your card" flag the failed start set in P1-T08)
  // CardsRepository
  export type ReplaceUserCardData = { userId: string; stripeCardId: string; brand: string; last4: string }
  replaceUserCard(data: ReplaceUserCardData): Promise<{ card: UserCard; previousStripeCardId: string | null }>
    // interactive $transaction: findFirst active → update isDeleted:true → create new
  ```
  Dictionary (pt-BR):
  `card.notConfirmed = { message: 'Cartão não confirmado. Adicione o cartão novamente.', statusCode: 400, errorCode: 'CARD_NOT_CONFIRMED' }`,
  `card.alreadyExists = { message: 'Já existe um cartão salvo. Atualize a tela e tente novamente.', statusCode: 409, errorCode: 'CARD_ALREADY_EXISTS' }`.
  `/tasks/create` consumes `SaveCardService` in P1-T06. App types follow in P1-T18; UI in Phase 3
  (P3 task "Cards via SetupIntent (`useConfirmSetupIntent`)").

- [ ] **Step 1: Write the failing tests**
  `test/cards/setup-intent.e2e-spec.ts`:
  ```ts
  it('rejects unauthenticated requests', ... status 401)
  it('returns the client secret of an off-session SetupIntent', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const res = await request(ctx.app.getHttpServer()).post('/card/setup-intent').set('Authorization', `Bearer ${user.token}`).send()
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ clientSecret: 'seti_test_123_secret_abc', setupIntentId: 'seti_test_123' })
    expect(ctx.stripeMock.createSetupIntent).toHaveBeenCalledWith('cus_test_default')
  })
  it('returns 404 USER_NOT_FOUND when the user has no Stripe customer', ... createUser({ stripeCustomerId: null }) → 404, errorCode 'USER_NOT_FOUND')
  ```
  `test/cards/create-card.e2e-spec.ts` (replace lines 31-74):
  ```ts
  it('rejects the legacy { token } body', ... send({ token: 'pm_abc' }) → 400, no rows)
  it('rejects a payment method that is not attached to the caller customer', async () => {
    ctx.stripeMock.retrievePaymentMethod.mockResolvedValueOnce({ id: 'pm_other', customer: 'cus_other', card: { brand: 'visa', last4: '1111' } } as any)
    → 400, errorCode 'CARD_NOT_CONFIRMED'; cards.count === 0
  })
  it('saves the confirmed payment method as the active card', async () => {
    → 201; body toMatchObject({ userId: user.id, stripeCardId: 'pm_test_123', brand: 'visa', last4: '4242' })
    expect(ctx.stripeMock.retrievePaymentMethod).toHaveBeenCalledWith('pm_test_123')
    expect(ctx.stripeMock.detachPaymentMethod).not.toHaveBeenCalled()
  })
  it('replaces the previous card, soft-deletes it and detaches it on Stripe', async () => {
    // first create with defaults, then:
    ctx.stripeMock.retrievePaymentMethod.mockResolvedValueOnce({ id: 'pm_new', customer: 'cus_test_default', card: { brand: 'mastercard', last4: '0001' } } as any)
    → 201 with stripeCardId 'pm_new'
    const active = await ctx.prisma.cards.findMany({ where: { userId: user.id, isDeleted: false } })
    expect(active).toHaveLength(1); expect(active[0].stripeCardId).toBe('pm_new')
    expect(await ctx.prisma.cards.count({ where: { userId: user.id, isDeleted: true } })).toBe(1)
    expect(ctx.stripeMock.detachPaymentMethod).toHaveBeenCalledWith('pm_test_123')
    // GET /card/fetch → 200 with stripeCardId 'pm_new'
  })
  it('keeps the card when detaching the previous one fails on Stripe', ... detachPaymentMethod.mockRejectedValueOnce(new Error('resource_missing')) → 201, one active row 'pm_new')
  it('clears cardActionRequired when a new card is saved', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    await ctx.prisma.users.update({ where: { id: user.id }, data: { cardActionRequired: true } })
    // POST /card/create with the default payment method → 201
    expect((await ctx.prisma.users.findUniqueOrThrow({ where: { id: user.id } })).cardActionRequired).toBe(false)
  })
  ```
- [ ] **Step 2: Run them, expect failure** — setup-intent: `404 Cannot POST /card/setup-intent`;
  create-card: the legacy body is still accepted (201).
- [ ] **Step 3: Implement** controller + service + repository method
  (including the `cardActionRequired = false` reset in the transaction) + dictionary + module wiring; rename the service; delete `attachPaymentMethodToCustomer` from `StripeService` and the mock.
  Rewrite `save-card.service.spec.ts` to the new flow (customer mismatch → `CARD_NOT_CONFIRMED`;
  P2002 from `replaceUserCard` → `CARD_ALREADY_EXISTS`; detach called with previous id only).
- [ ] **Step 4: Run them, expect pass** — both specs green (`Tests: 3 passed`, `Tests: 7 passed`).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`
  (`create-task.e2e-spec.ts` still passes: it sends `cardDetails: {}` until P1-T06 and the service
  currently returns `null` for it).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(cards): P1-T05 save cards through SetupIntent, one active card`

---

### Task P1-T06: `POST /tasks/create` — bounds, CLIENT-only, card before insert, fees persisted

**Files:**
- Modify: `src/modules/tasks/controllers/create-task.controller.ts:11-30,46-66`
- Modify: `src/modules/tasks/use-cases/create-task.service.ts:9-58` (+ spec rewrite)
- Modify: `src/modules/tasks/repository/tasks.repository.ts:22-43` (`create` → `createTask` with
  `$transaction`), `:51-79,121-149,161-189,265-293` (replace the four inline selects with one exported
  `taskSelect` that adds `stripeFee`, `chargedAmount`); `dtos/tasks-repository.dto.ts:14`;
  `types/index.d.ts:11-35,62-89,91-107`.
- Delete: `src/modules/auth/use-cases/update-total-tasks-created.service.ts` (+ `.spec.ts`),
  `AuthRepository.updateTotalTasksCreated` (`auth.repository.ts:65-70`, DTO `:17-20`), provider in
  `tasks.module.ts:35,71`.
- Modify: `src/exception/error-dictionary.ts:13-64` add `user.notClient`.
- Modify: `test/tasks/create-task.e2e-spec.ts:23-36,46-111`; `test/tasks/fetch-task-by-id.e2e-spec.ts`
  (one assertion added).

**Interfaces:**
- Consumes: `computeCharge` (P1-T01), `SaveCardService.execute` (P1-T05), `FetchUserCardService.execute`,
  `FetchUserDetailsService.execute`.
- Produces:
  ```ts
  // controller schema
  const createTaskBodySchema = z.object({
    title: z.string().trim().min(3).max(80),
    description: z.string().trim().min(10).max(1000),
    address: z.object({
      city: z.string().trim().min(1), state: z.string().trim().length(2), street: z.string().trim().min(1),
      zipCode: z.string().trim().min(8).max(9),
      locationLat: z.number().min(-90).max(90), locationLng: z.number().min(-180).max(180),
    }),
    pricing: z.object({ offeredPrice: z.number().min(MIN_OFFERED_PRICE).max(MAX_OFFERED_PRICE).multipleOf(0.01) }),
    cardDetails: z.union([
      z.object({ savedCard: z.string().min(1) }).strict(),
      z.object({ paymentMethodId: z.string().min(1) }).strict(),
    ]),
  })
  // types
  export type CreateTaskData = { userId; title; description; offeredPrice: number; city; state; street; zipCode; locationLat: number; locationLng: number; savedCard?: string; paymentMethodId?: string }
  export type InsertTaskData = { userId; title; description; locationLat: number; locationLng: number; locationAddress: string;
    offeredPrice: Prisma.Decimal; platformFee: Prisma.Decimal; stripeFee: Prisma.Decimal; chargedAmount: Prisma.Decimal; proxyEarnings: Prisma.Decimal }
  FetchTasksResult gains: stripeFee: Decimal | null; chargedAmount: Decimal | null
  // repository
  export const taskSelect = { ...current select fields..., stripeFee: true, chargedAmount: true, ownerId: { select: {...unchanged (Phase 2 BE-11 trims it)} } } satisfies Prisma.TasksSelect
  createTask(data: InsertTaskData): Promise<{ id: string }>
    // $transaction([ tasks.create({ data, select: { id: true } }), users.update({ where: { id: userId }, data: { totalTasksCreated: { increment: 1 } } }) ])
  // service order
  CreateTaskService.execute(data): Promise<{ id: string }>
    // 1. user = fetchUserDetailsService.execute(userId); userType !== 'CLIENT' → 403 USER_NOT_CLIENT
    // 2. savedCard → card = fetchUserCardService.execute(userId) (404 NO_SAVED_CARD_FOUND); card.stripeCardId !== savedCard → 404 NO_SAVED_CARD_FOUND
    //    paymentMethodId → saveCardService.execute({ userId, paymentMethodId })
    // 3. fees = computeCharge(offeredPrice); tasksRepository.createTask({ offeredPrice, platformFee, stripeFee, chargedAmount, proxyEarnings, ... })
    //    (D1: chargedAmount = offeredPrice, platformFee 20 %, proxyEarnings 80 %; fees.platformNet is NOT passed — no column)
  ```
  Bounds come from `src/common/money.ts`: `MIN_OFFERED_PRICE = 20`, `MAX_OFFERED_PRICE = 10_000` (D1).
  Dictionary: `user.notClient = { message: 'Apenas clientes podem criar tarefas.', statusCode: 403, errorCode: 'USER_NOT_CLIENT' }`.
  Response of `GET /tasks/:id`, `/tasks/active`, `/tasks/fetch` now carries `stripeFee` and
  `chargedAmount` (Decimal → JSON string, like `offeredPrice`). App type follows in P1-T18; the
  screens render them in Phase 3 (P3 task "Money copy from backend numbers").

- [ ] **Step 1: Write the failing test** — rewrite `test/tasks/create-task.e2e-spec.ts`; the shared
  payload now has `cardDetails: { savedCard: 'pm_owner' }` and each test seeds the card
  (`ctx.prisma.cards.create({ data: { userId, stripeCardId: 'pm_owner', brand: 'visa', last4: '4242' } })`):
  ```ts
  it.each([0, 19.99, 20.005, 10000.01])('rejects offeredPrice %p', async (offeredPrice) => { → 400; tasks.count === 0 })
  it('rejects cardDetails {} and both keys at once', async () => { {} → 400; { savedCard: 'a', paymentMethodId: 'b' } → 400 })
  it('rejects a PROXY with 403 USER_NOT_CLIENT and writes nothing', async () => { createUser({ userType: 'PROXY' }) → 403; tasks.count 0; totalTasksCreated 0 })
  it('rejects a savedCard that is not the active card and writes nothing', async () => { send savedCard 'pm_other' → 404 NO_SAVED_CARD_FOUND; tasks.count 0; totalTasksCreated 0 })
  it('creates the task with the D1 fee breakdown persisted', async () => {
    → 201 { id }
    const t = await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(t.offeredPrice.toFixed(2)).toBe('100.00'); expect(t.platformFee?.toFixed(2)).toBe('20.00')
    expect(t.stripeFee?.toFixed(2)).toBe('4.38'); expect(t.chargedAmount?.toFixed(2)).toBe('100.00'); expect(t.proxyEarnings?.toFixed(2)).toBe('80.00')
    expect(t.status).toBe('available'); totalTasksCreated === 1
  })
  it('rounds half-up (20.03 and 50)', async () => {
    20.03 → platformFee '4.01', stripeFee '1.19', chargedAmount '20.03', proxyEarnings '16.02'
    50    → platformFee '10.00', stripeFee '2.39' (raw 2.385), chargedAmount '50.00', proxyEarnings '40.00'
  })
  it('saves a new card from a confirmed paymentMethodId and creates the task', async () => {
    send cardDetails { paymentMethodId: 'pm_test_123' } → 201; cards active for user = 1 with stripeCardId 'pm_test_123'
  })
  it('increments totalTasksCreated per call (3 calls → 3)', ... keep)
  ```
  `fetch-task-by-id.e2e-spec.ts`: in the happy case add
  `expect(Number(response.body.chargedAmount)).toBe(50); expect(Number(response.body.stripeFee)).toBe(2.39); expect(Number(response.body.platformFee)).toBe(10); expect(Number(response.body.proxyEarnings)).toBe(40)`
  (task factory default price 50; Prisma serialises `Decimal` as a string without trailing zeros,
  e.g. `'50'` for 50.00, so compare numerically); also `expect(response.body).not.toHaveProperty('platformNet')`.
- [ ] **Step 2: Run it, expect failure** — `0`, `19.99` and `20.005` are accepted (201).
- [ ] **Step 3: Implement** schema, service, repository (`createTask`, `taskSelect`), types,
  dictionary, deletions. Rewrite `create-task.service.spec.ts`: asserts call order (`fetchUserDetails`
  → card → `createTask`), `createTask` receives `platformFee.toFixed(2) === '20.00'`,
  `chargedAmount.toFixed(2) === '100.00'`, `proxyEarnings.toFixed(2) === '80.00'`,
  `stripeFee.toFixed(2) === '4.38'` and no `platformNet` key, PROXY → `USER_NOT_CLIENT` without
  `createTask`.
- [ ] **Step 4: Run it, expect pass** — `Tests: 9 passed` (create-task e2e) + fetch-task-by-id green.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T06 strict create, CLIENT-only, fees persisted`

---

### Task P1-T07: `GET /tasks/price-preview?offeredPrice=`

**Files:**
- Create: `src/modules/tasks/controllers/price-preview.controller.ts`,
  `src/modules/tasks/use-cases/price-preview.service.ts` (+ `.spec.ts`)
- Modify: `src/modules/tasks/tasks.module.ts:74-84` — add `PricePreviewController` **before**
  `FetchTaskByIdController` in `controllers` (Express matches `/tasks/:id` in registration order;
  `/tasks/fetch` and `/tasks/active` already rely on this).
- Create: `test/tasks/price-preview.e2e-spec.ts`

**Interfaces:**
- Consumes: `computeCharge`, `breakdownToNumbers` (P1-T01).
- Produces:
  ```ts
  // GET /tasks/price-preview  @UseGuards(JwtAuthGuard)  200
  const querySchema = z.object({ offeredPrice: z.coerce.number().min(MIN_OFFERED_PRICE).max(MAX_OFFERED_PRICE).multipleOf(0.01) })
  @Get() handle(@Query(new ZodValidationPipe(querySchema)) query, @User() user)
  export type PricePreview = { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }
  PricePreviewService.execute(offeredPrice: number): PricePreview   // breakdownToNumbers(computeCharge(offeredPrice)) — five keys, no platformNet
  ```
  Under D1 `chargedAmount === offeredPrice` in every response; the other fields tell the client
  nothing they pay extra and tell the proxy "Você recebe" (`proxyEarnings`). Consumed by Phase 3
  (`useChargePreviewQuery(offeredPrice)` in P3 task "Money copy from backend numbers"); app type
  `TChargePreview` added in P1-T18.

- [ ] **Step 1: Write the failing test** `test/tasks/price-preview.e2e-spec.ts`:
  ```ts
  it('rejects unauthenticated requests', ... get('/tasks/price-preview?offeredPrice=100') → 401)
  it('returns the D1 breakdown as numbers for R$ 100,00', async () => {
    → 200; expect(res.body).toEqual({ offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 100, proxyEarnings: 80 })
  })
  it('rounds half-up (20.03)', ... → { offeredPrice: 20.03, platformFee: 4.01, stripeFee: 1.19, chargedAmount: 20.03, proxyEarnings: 16.02 })
  it.each(['19.99', '10000.01', 'abc', ''])('rejects offeredPrice=%s', ... → 400)
  it('is not shadowed by GET /tasks/:id', ... → status 200, not 404 TASK_NOT_FOUND)
  ```
- [ ] **Step 2: Run it, expect failure** — `GET /tasks/price-preview?offeredPrice=100` → 404
  `TASK_NOT_FOUND` (caught by `:id`).
- [ ] **Step 3: Implement** controller, service (unit spec: `execute(100)` equals the object above;
  `execute(50)` equals `{ offeredPrice: 50, platformFee: 10, stripeFee: 2.39, chargedAmount: 50, proxyEarnings: 40 }`),
  module registration order.
- [ ] **Step 4: Run it, expect pass** — `Tests: 8 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T07 GET /tasks/price-preview`

---

### Task P1-T08: `POST /tasks/start` — CAS claim → charge (automatic capture) → payment row

**Files:**
- Modify: `src/modules/tasks/use-cases/start-task.service.ts:13-100` (full rewrite) + spec rewrite
- Modify: `src/modules/tasks/types/index.d.ts:114-116` → `export type StartTaskResult = { status: 'succeeded' }`
- Modify: `src/exception/error-dictionary.ts:163-167` (`payment.paymentFailed`: message + status),
  add `payment.chargePending` next to it
- Modify: `src/notification/notification.service.ts` add `sendCardChargeFailedEmail`;
  `test/mocks/notification.service.mock.ts` add its `jest.fn().mockResolvedValue(undefined)` entry;
  `src/modules/tasks/tasks.module.ts` `imports` gains `NotificationModule.forRoot()` (same call as
  `auth.module.ts:55`).
- Delete: `StripeService.createPaymentIntent`, `confirmPaymentIntent` (`stripe.service.ts:63-82`) +
  mock entries; `PaymentsRepository.createPaymentRecord` + `CreatePaymentRecordService` (+ spec) +
  provider in `tasks.module.ts:34,69`.
- Modify: `test/tasks/start-task.e2e-spec.ts:96-185`
- Modify (no new files): `TasksRepository.releaseClaim` (P1-T04) takes the optional
  `cardActionOwnerId`, so the claim release and `users.update({ where: { id: ownerId }, data: { cardActionRequired: true } })`
  share one `$transaction`; its spec gets one case for it.

**Interfaces:**
- Consumes: `chargeSavedCard` (P1-T03); `TasksRepository.claimTask/releaseClaim/fetchTaskById/fetchTaskMappingByTaskId`, `Users.cardActionRequired` (P1-T04),
  `PaymentsRepository.fetchLatestByTaskId/recordSucceededCharge` (P1-T04); `FetchUserCardService.execute`,
  `FetchUserDetailsService.execute`; `toCentavos` (P1-T01); `NotificationService.sendCardChargeFailedEmail`.
- Produces: `StartTaskService(stripeService, tasksRepository, paymentsRepository, fetchUserCardService, fetchUserDetailsService, notificationService)`;
  `execute({ taskId, userId }): Promise<{ status: 'succeeded' }>` with this fixed order:
  ```
  1. task = fetchTaskById({ taskId })   (no status filter)               → 404 TASK_NOT_FOUND
     task.status ∉ {'available', 'in_progress'}                         → 400 TASK_NOT_AVAILABLE
     task.status === 'in_progress' && fetchTaskMappingByTaskId(taskId)?.executorId !== userId
                                                                         → 400 TASK_NOT_AVAILABLE (someone else's claim)
  2. task.owner === userId                                              → 403 CANNOT_START_OWN_TASK
  3. user = fetchUserDetails(userId); not PROXY or !stripeAccountReady   → 403 USER_NOT_PROXY  (Phase 2 BE-46 splits this)
  4. card = fetchUserCard(task.owner) (its NO_SAVED_CARD_FOUND is caught); customer = task.ownerId.stripeCustomerId
     no card or no customer → users.update({ where: { id: ownerId }, data: { cardActionRequired: true } }); notifyClient() → 409 PAYMENT_FAILED   (no claim, no payment row, no Stripe call)
  5. claim (CAS before any Stripe call — the race is decided here, D3 ruling "claim first"):
     startedAt = new Date()
     claimed = task.status === 'available' && await claimTask({ taskId, executorId: userId, startedAt })
     if (!claimed) {
       current = fetchTaskById({ taskId }); mapping = fetchTaskMappingByTaskId(taskId)
       current?.status !== 'in_progress' || mapping?.executorId !== userId || !current.startedAt
                                                                         → 400 TASK_NOT_AVAILABLE (no Stripe call)
       (await fetchLatestByTaskId(taskId))?.status === 'succeeded'      → return { status: 'succeeded' }   // replay of this proxy's own start
       startedAt = current.startedAt                                     // resume the same claim → same key → same PaymentIntent
     }
  6. charged = task.chargedAmount ?? task.offeredPrice                   // D1: chargedAmount = offeredPrice; `??` covers rows seeded without fees
     key = `start:${taskId}:${userId}:${startedAt.getTime()}`
     try   pi = chargeSavedCard({ amount: toCentavos(charged), customer, paymentMethod: card.stripeCardId,
                                  taskId, proxyId: userId, claimedAt: startedAt.toISOString() }, key)
     catch err → outcome = (err?.type === 'StripeCardError' || err?.type === 'StripeInvalidRequestError') ? 'declined' : 'unknown'
     no throw  → outcome = pi.status === 'succeeded' ? 'succeeded' : pi.status === 'processing' ? 'unknown' : 'declined'
  7. 'succeeded' → recordSucceededCharge({ taskId, paymentIntent: pi.id, amount: charged,
                     chargeId: typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null })
                   → return { status: 'succeeded' }
     'declined'  → releaseClaim({ taskId, executorId: userId, startedAt, cardActionOwnerId: task.owner }) — one $transaction that releases the claim
                   AND runs users.update({ where: { id: ownerId }, data: { cardActionRequired: true } }); then notifyClient() (secondary channel) → 409 PAYMENT_FAILED
     'unknown'   → Logger.error(`start ${taskId}: charge outcome unknown (${err?.type ?? pi?.status}), key ${key}`)
                   claim kept, no notification → 409 PAYMENT_PENDING
  notifyClient() = notificationService.sendCardChargeFailedEmail(task.ownerId.email, task.ownerId.name, task.title)
                   inside try/catch → Logger.warn on failure; never changes the response
  ```
  Why this order: with automatic capture a `succeeded` answer is a final charge, so the CAS must pick
  the single winner before Stripe is called; a second proxy loses the CAS and never reaches Stripe.
  One key has exactly one outcome at Stripe, so a request can never release a claim whose charge
  succeeded: `declined` only comes back for a key that did not charge. If `recordSucceededCharge`
  throws after a succeeded charge, the claim stays and the `payment_intent.succeeded` webhook writes
  the row from metadata (P1-T14). Against real Stripe a *truly simultaneous* second request with the
  same key gets `StripeIdempotencyError` (the first is still executing) → `unknown` → 409
  `PAYMENT_PENDING` with the claim kept, which is safe; the e2e mock answers both calls, so the
  double-tap case below sees two 200s.
  Dictionary (pt-BR):
  `payment.paymentFailed = { message: 'Não foi possível cobrar o cliente. Tente outra tarefa.', statusCode: HttpStatus.CONFLICT, errorCode: 'PAYMENT_FAILED' }`
  (was 402 `'Falha ao processar o pagamento.'`; the code is kept),
  `payment.chargePending = { message: 'Ainda estamos confirmando a cobrança do cliente. Tente novamente em instantes.', statusCode: HttpStatus.CONFLICT, errorCode: 'PAYMENT_PENDING' }`.
  `NotificationService.sendCardChargeFailedEmail(to: string, userName: string, taskTitle: string): Promise<void>`
  — same HTML wrapper as `sendResetCodeByEmail`; subject `'Confirme seu cartão na Carteira - Proxy'`;
  body `Olá, <strong>${userName}</strong>!` / `Um Proxy tentou aceitar sua tarefa "<strong>${taskTitle}</strong>", mas não conseguimos cobrar seu cartão.` /
  `Confirme seu cartão na Carteira do app. A tarefa continua disponível.` (`userName` and `taskTitle`
  HTML-escaped: `&`, `<`, `>`, `"`); calls `this.sendEmail(to, subject, body)`.
  `Payments.amount` stores `chargedAmount` (what the client paid, = `offeredPrice`). The start path
  writes only `succeeded` rows; it never writes `pending` or `failed`. Contract change:
  `requires_action` shape removed and `PAYMENT_FAILED` is now 409 — app type in P1-T18, UI in
  Phase 3 (P3 task "Payment status banner / requires_action removed").

- [ ] **Step 1: Write the failing test** — replace `start-task.e2e-spec.ts:96-185` (keep 24-94;
  helper `seed()` creates owner with card `pm_owner`, ready proxy, task `offeredPrice: 100`;
  `start(user)` posts `/tasks/start` with that user's token; `stored()` reads the task row):
  ```ts
  it('answers 409 PAYMENT_FAILED, notifies the client and writes nothing when the owner has no card', async () => {
    → 409; body.errorCode 'PAYMENT_FAILED'; task.status 'available', startedAt null; mapping null; payments.count 0
    expect(ctx.stripeMock.chargeSavedCard).not.toHaveBeenCalled()
    expect(ctx.notificationMock.sendCardChargeFailedEmail).toHaveBeenCalledWith(owner.email, expect.any(String), task.title)
    expect((await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } })).cardActionRequired).toBe(true)
  })
  it('claims, charges and records the payment', async () => {
    → 200 toEqual({ status: 'succeeded' })
    const t = await stored()
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledWith(
      { amount: 10000, customer: owner.stripeCustomerId, paymentMethod: 'pm_owner', taskId: task.id, proxyId: proxy.id, claimedAt: t.startedAt!.toISOString() },
      `start:${task.id}:${proxy.id}:${t.startedAt!.getTime()}`)
    t.status 'in_progress'; mapping.executorId === proxy.id
    payment = payments.findUnique({ where: { paymentIntent: 'pi_test_123' } }) → status 'succeeded', chargeId 'ch_test_123', amount.toFixed(2) '100.00'
    expect(ctx.notificationMock.sendCardChargeFailedEmail).not.toHaveBeenCalled()
    expect((await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } })).cardActionRequired).toBe(false)
  })
  it('sends integer centavos for prices with float artefacts (20.01 → 2001)', ... offeredPrice 20.01 → chargeSavedCard amount 2001)
  it('answers 409 PAYMENT_FAILED, releases the claim and notifies the client when the card is declined', async () => {
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(Object.assign(new Error('Your card was declined.'),
      { type: 'StripeCardError', code: 'card_declined', payment_intent: { id: 'pi_declined', status: 'requires_payment_method' } }))
    → 409; body.errorCode 'PAYMENT_FAILED'; body.message 'Não foi possível cobrar o cliente. Tente outra tarefa.'
    task 'available', startedAt null; mapping null; payments.count 0; sendCardChargeFailedEmail called once
    expect((await ctx.prisma.users.findUniqueOrThrow({ where: { id: owner.id } })).cardActionRequired).toBe(true)
  })
  it('treats requires_action as a definite failure (no 3DS on the proxy device)', async () => {
    ctx.stripeMock.chargeSavedCard.mockResolvedValueOnce({ id: 'pi_3ds', status: 'requires_action', client_secret: 'x' } as any)
    → 409 PAYMENT_FAILED; task 'available'; mapping null; payments.count 0; body has no clientSecret; sendCardChargeFailedEmail called once
  })
  it('keeps the claim and answers PAYMENT_PENDING when Stripe is unreachable; the retry reuses the key', async () => {
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { type: 'StripeConnectionError' }))
    const first = await start(proxy)
    expect(first.status).toBe(409); expect(first.body.errorCode).toBe('PAYMENT_PENDING')
    task 'in_progress'; mapping.executorId === proxy.id; payments.count 0; sendCardChargeFailedEmail not called
    const second = await start(proxy)                      // default mock: succeeded
    expect(second.status).toBe(200)
    const keys = ctx.stripeMock.chargeSavedCard.mock.calls.map((c) => c[1]); expect(keys).toHaveLength(2); expect(keys[0]).toBe(keys[1])
    payments.count 1, status 'succeeded'
  })
  it('keeps the claim on a processing outcome', async () => {
    ctx.stripeMock.chargeSavedCard.mockResolvedValueOnce({ id: 'pi_proc', status: 'processing', latest_charge: null } as any)
    → 409 PAYMENT_PENDING; task 'in_progress'; payments.count 0; sendCardChargeFailedEmail not called
  })
  it('opens a new claim with a new key when the same proxy retries after a decline', async () => {
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(Object.assign(new Error('declined'), { type: 'StripeCardError' }))
    expect((await start(proxy)).status).toBe(409)
    expect((await start(proxy)).status).toBe(200)
    const keys = ctx.stripeMock.chargeSavedCard.mock.calls.map((c) => c[1]); expect(keys[0]).not.toBe(keys[1])
    payments.count 1, status 'succeeded'
  })
  it('lets exactly one of two different proxies claim and charges the client once', async () => {
    const [a, b] = await Promise.all([start(proxy1), start(proxy2)])
    expect([a.status, b.status].sort()).toEqual([200, 400]); loser.body.errorCode 'TASK_NOT_AVAILABLE'
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledTimes(1)
    expect(ctx.stripeMock.chargeSavedCard.mock.calls[0][0].proxyId).toBe(winner.id)
    mapping.executorId === winner.id; payments.count 1, status 'succeeded'
  })
  it('same proxy double-tap: one PaymentIntent, one payment row, no release', async () => {
    const [a, b] = await Promise.all([start(proxy), start(proxy)])
    expect([a.status, b.status]).toEqual([200, 200])
    const keys = new Set(ctx.stripeMock.chargeSavedCard.mock.calls.map((c) => c[1])); expect(keys.size).toBe(1)   // 1 or 2 calls, always the same key
    task 'in_progress'; mapping.executorId === proxy.id; payments.count 1, status 'succeeded'
  })
  it('replays 200 without a second charge once the start succeeded', async () => {
    expect((await start(proxy)).status).toBe(200); expect((await start(proxy)).status).toBe(200)
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledTimes(1)
  })
  it('charges offeredPrice for a legacy task without stored fees and an older failed payment row', async () => {
    task seeded with { offeredPrice: 100, chargedAmount: null, platformFee: null, stripeFee: null, proxyEarnings: null }
    createPayment(task.id, { paymentIntent: 'pi_legacy', status: 'failed', createdAt: new Date(Date.now() - 3_600_000) })
    → 200; chargeSavedCard amount 10000; payments.count 2; fetchLatestByTaskId → paymentIntent 'pi_test_123', status 'succeeded'
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `chargeSavedCard` never called (service still calls
  `createPaymentIntent`); the declined case returns 402; the `requires_action` case returns 200.
- [ ] **Step 3: Implement** the service per the fixed order, the two dictionary entries, the
  notification method + mock entry + module import; delete the legacy Stripe methods and the
  payments pass-through; rewrite `start-task.service.spec.ts` with invocation-order assertions
  (`claimTask.mock.invocationCallOrder[0] < chargeSavedCard.mock.invocationCallOrder[0]`,
  `chargeSavedCard.mock.invocationCallOrder[0] < recordSucceededCharge.mock.invocationCallOrder[0]`;
  `claimTask` and `chargeSavedCard` not called when the card lookup throws; `chargeSavedCard` not
  called when the CAS is lost and the mapping belongs to another proxy; `releaseClaim` called with
  the claim's `startedAt` and `cardActionOwnerId: task.owner` on `StripeCardError` and on `requires_action`; `releaseClaim` and the
  notification **not** called on `StripeConnectionError`, `StripeIdempotencyError` and
  `processing`; a rejected `sendCardChargeFailedEmail` still yields `PAYMENT_FAILED`).
- [ ] **Step 4: Run it, expect pass** — `Tests: 17 passed` (5 kept + 12 new).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`;
  `grep -rn "capture_method\|paymentIntents.capture\|requires_capture" src` prints nothing.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T08 start claims before charging, automatic capture, no requires_action`

---

### Task P1-T09: `ProofStorage` port, local-disk and S3 adapters

**Files:**
- Create: `src/storage/proof-storage.ts`, `src/storage/local-disk-proof-storage.ts` (+ `.spec.ts`),
  `src/storage/s3-proof-storage.ts` (+ `.spec.ts`), `src/storage/storage.module.ts`
- Modify: `src/env/env.ts:3-20` add `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `PROOF_DIR` — all `z.string().optional()`; `.env.example` (document them;
  Cloudflare R2 example `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto`).
- Modify: `src/app.module.ts:22-43` import `StorageModule`; `.gitignore` add `tmp/`.
- Modify: `test/setup/global-setup.ts:32-47` add `PROOF_DIR=${join(tmpdir(), 'proxy-proofs-e2e')}`;
  `test/setup/global-teardown.ts` `rm -rf` that dir.
- Install: `npm i @aws-sdk/client-s3`

**Interfaces:**
- Produces (`src/storage/proof-storage.ts`):
  ```ts
  export const PROOF_STORAGE = Symbol('PROOF_STORAGE')
  export interface ProofStorage {
    put(key: string, body: Buffer, contentType: string): Promise<void>
    getStream(key: string): Promise<Readable>          // rejects with ProofNotFoundError when the key is missing
  }
  export class ProofNotFoundError extends Error { constructor(key: string) }
  // local-disk-proof-storage.ts
  export class LocalDiskProofStorage implements ProofStorage { constructor(private readonly rootDir: string) }
    // resolve(rootDir, key) must stay inside rootDir, else throw ProofNotFoundError; put → mkdir -p + fs/promises writeFile; getStream → access (ENOENT → ProofNotFoundError) + createReadStream
  // s3-proof-storage.ts
  export class S3ProofStorage implements ProofStorage { constructor(private readonly client: Pick<S3Client, 'send'>, private readonly bucket: string) }
    // put → PutObjectCommand({ Bucket, Key, Body, ContentType }); getStream → GetObjectCommand → Body as Readable; error.name === 'NoSuchKey' → ProofNotFoundError
  // storage.module.ts
  @Global() @Module({ imports: [EnvModule], providers: [{ provide: PROOF_STORAGE, inject: [EnvService], useFactory: (env) => env.get('S3_BUCKET')
    ? new S3ProofStorage(new S3Client({ region: env.get('S3_REGION') ?? 'auto', endpoint: env.get('S3_ENDPOINT'), forcePathStyle: Boolean(env.get('S3_ENDPOINT')),
        credentials: { accessKeyId: env.get('S3_ACCESS_KEY_ID')!, secretAccessKey: env.get('S3_SECRET_ACCESS_KEY')! } }), env.get('S3_BUCKET')!)
    : new LocalDiskProofStorage(env.get('PROOF_DIR') ?? join(process.cwd(), 'tmp', 'proofs')) }], exports: [PROOF_STORAGE] })
  ```
  Consumed by P1-T11 via `@Inject(PROOF_STORAGE) private storage: ProofStorage`.

- [ ] **Step 1: Write the failing tests**
  `local-disk-proof-storage.spec.ts` (real fs, `await fs.mkdtemp(join(os.tmpdir(), 'proofs-'))`):
  ```ts
  it('round-trips bytes under nested keys', async () => {
    await storage.put('task-1/a.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')
    const chunks = []; for await (const c of await storage.getStream('task-1/a.jpg')) chunks.push(c)
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))
  })
  it('rejects missing keys with ProofNotFoundError', ... getStream('nope.jpg') rejects toBeInstanceOf(ProofNotFoundError))
  it('refuses keys escaping the root', ... getStream('../../etc/passwd') rejects ProofNotFoundError; put('../x.jpg', ...) rejects)
  ```
  `s3-proof-storage.spec.ts` (`client = { send: jest.fn() }`):
  ```ts
  it('puts objects with bucket, key and content type', async () => {
    await storage.put('t/a.jpg', body, 'image/jpeg')
    const cmd = send.mock.calls[0][0]; expect(cmd).toBeInstanceOf(PutObjectCommand)
    expect(cmd.input).toEqual({ Bucket: 'proofs', Key: 't/a.jpg', Body: body, ContentType: 'image/jpeg' })
  })
  it('returns the object body as a stream', async () => { send.mockResolvedValueOnce({ Body: Readable.from(['x']) }); expect(await storage.getStream('t/a.jpg')).toBeInstanceOf(Readable) })
  it('maps NoSuchKey to ProofNotFoundError', async () => { send.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NoSuchKey' })); await expect(storage.getStream('t/x.jpg')).rejects.toBeInstanceOf(ProofNotFoundError) })
  ```
- [ ] **Step 2: Run them, expect failure** — `npx jest src/storage` → `Cannot find module`.
- [ ] **Step 3: Implement** the four files, env, module registration, gitignore, e2e env.
- [ ] **Step 4: Run them, expect pass** — `Tests: 6 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e` (the app
  boots with `PROOF_DIR` from `.env.test`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(storage): P1-T09 ProofStorage port with local-disk and S3 adapters`

---

### Task P1-T10: Proof image pipeline — magic bytes, HEIC→JPEG, normalisation

**Files:**
- Create: `src/modules/tasks/utils/proof-image.ts` (+ `proof-image.spec.ts`)
- Modify: `src/pipes/multer-validation.pipe.ts:6-21` delete `imageExtensionFromMime` (dead after
  P1-T11; delete here, P1-T11 removes its import), `:28-45` keep the MIME pre-filter.
- Modify: `src/exception/error-dictionary.ts:218-223` message → `'Formato de arquivo não suportado. Envie uma imagem JPG, PNG, WEBP ou HEIC.'`
- Install: `npm i sharp heic-convert file-type@16.5.4 && npm i -D @types/heic-convert`
  (`file-type` is pinned: 17+ is ESM-only. `sharp`'s prebuilt libvips has no HEVC decoder, so HEIC is
  decoded by `heic-convert` (libheif wasm) and `sharp` only re-encodes. The Phase 0/5 Dockerfile must
  use a glibc image (`node:22-bookworm-slim`) for the `sharp` prebuilt binary.)

**Interfaces:**
- Produces:
  ```ts
  export const PROOF_MAX_EDGE = 1600
  export const PROOF_JPEG_QUALITY = 82
  export const ACCEPTED_PROOF_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
  export type NormalizedProof = { buffer: Buffer; contentType: 'image/jpeg'; extension: '.jpg' }
  export async function normalizeProofImage(input: Buffer): Promise<NormalizedProof>
    // 1. type = await fromBuffer(input) (file-type@16); !type || !ACCEPTED_PROOF_MIMES.includes(type.mime) → throw new AppException(errorDictionary.file.formatNotSupported)
    // 2. if heic/heif: input = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 }))
    // 3. sharp(input).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
  ```
  `multerOptions.fileFilter` keeps rejecting foreign `mimetype` early; the magic-byte check is the
  authoritative one.

- [ ] **Step 1: Write the failing test** `proof-image.spec.ts` (`jest.mock('heic-convert')`; build
  inputs with `sharp({ create: { width, height, channels: 3, background: '#ff0000' } })`):
  ```ts
  it('downscales a 2000×1000 PNG to a 1600×800 JPEG', async () => {
    const out = await normalizeProofImage(await png(2000, 1000))
    expect(out.contentType).toBe('image/jpeg'); expect(out.extension).toBe('.jpg')
    expect((await fromBuffer(out.buffer))?.mime).toBe('image/jpeg')
    const meta = await sharp(out.buffer).metadata(); expect(meta.width).toBe(1600); expect(meta.height).toBe(800)
  })
  it('does not enlarge small images', ... png(300, 200) → width 300)
  it('accepts WEBP and JPEG inputs', ... webp(100, 100) and jpeg(100, 100) → image/jpeg output)
  it('rejects non-images by content even when the extension lies', async () => {
    await expect(normalizeProofImage(Buffer.from('%PDF-1.4 ...'))).rejects.toMatchObject({ errorCode: 'FILE_FORMAT_NOT_SUPPORTED' })
    await expect(normalizeProofImage(Buffer.from('garbage'))).rejects.toMatchObject({ errorCode: 'FILE_FORMAT_NOT_SUPPORTED' })
  })
  it('routes HEIC (ftyp heic) and HEIF (ftyp mif1) through heic-convert', async () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)])
    const heif = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmif1'), Buffer.alloc(16)])
    ;(heicConvert as jest.Mock).mockResolvedValue(await jpeg(400, 300))
    for (const input of [heic, heif]) { const out = await normalizeProofImage(input); expect((await fromBuffer(out.buffer))?.mime).toBe('image/jpeg') }
    expect(heicConvert).toHaveBeenCalledTimes(2)
    expect(heicConvert).toHaveBeenCalledWith(expect.objectContaining({ format: 'JPEG' }))
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `Cannot find module './proof-image'`.
- [ ] **Step 3: Implement** `normalizeProofImage`; dictionary message; delete
  `imageExtensionFromMime` (and update `finish-task.service.ts:8,50` import/usage only if P1-T11 is
  not yet done — otherwise leave P1-T11 to remove it; `tsc` must be green either way).
- [ ] **Step 4: Run it, expect pass** — `Tests: 5 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T10 proof image pipeline (magic bytes, HEIC→JPEG, 1600px JPEG)`

---

### Task P1-T11: `POST /tasks/finish` with mandatory proof + `GET /tasks/:id/proof` from storage

**Files:**
- Modify: `src/modules/tasks/use-cases/finish-task.service.ts:1-71` (rewrite; delete dead lines
  26-28 and the disk write 46-61) + spec rewrite
- Modify: `src/modules/tasks/use-cases/fetch-task-proof.service.ts:1-69` (storage stream; `.heif` →
  `image/heif` in `mimeTypeFromPath`), `src/modules/tasks/controllers/fetch-task-proof.controller.ts:1,28-35`
- Modify: `src/exception/error-dictionary.ts:92-160` add `tasks.proofPhotoRequired`,
  `tasks.statusConflict`; `:162-180` add `payment.disputed`; delete `tasks.taskStartedAtNotValid`
  (`:123-128`), `tasks.taskNotAvailableForValidation` (`:130-134`), `payment.transferFailed`
  (`:169-173`) (BE-46 — none is thrown anywhere).
- Modify: `test/tasks/finish-task.e2e-spec.ts:78-92`; Create: `test/tasks/fetch-task-proof.e2e-spec.ts`

**Interfaces:**
- Consumes: `TasksRepository.transition` (P1-T04), `PaymentsRepository.fetchLatestByTaskId` (P1-T04),
  `PROOF_STORAGE`/`ProofStorage`/`ProofNotFoundError` (P1-T09), `normalizeProofImage` (P1-T10).
- Produces:
  ```ts
  FinishTaskService(tasksRepository, paymentsRepository, @Inject(PROOF_STORAGE) storage)
  execute({ taskId, userId, file }: FinishTaskData): Promise<void>
    // 1. task in_progress (404) ; mapping (404 TASK_MAPPING_NOT_FOUND) ; executor (403 CANNOT_FINISH_TASK)   [existing]
    // 2. !file → 400 PROOF_PHOTO_REQUIRED
    // 3. payment = fetchLatestByTaskId; payment?.status === 'disputed' → 409 PAYMENT_DISPUTED
    // 4. normalized = await normalizeProofImage(file.buffer)   (400 FILE_FORMAT_NOT_SUPPORTED)
    //    key = `${taskId}/${randomUUID()}.jpg`; storage.put(key, normalized.buffer, 'image/jpeg')  (throw → 500 FILE_UPLOAD_FAILED)
    // 5. transition({ taskId, from: ['in_progress'], to: 'verification_required', data: { completedAt: new Date(), proofImageUrl: key } }) === false → 409 TASK_STATUS_CONFLICT (orphan object is logged, not deleted)
  export type FetchTaskProofResult = { stream: Readable; mimeType: string }
  FetchTaskProofService(tasksRepository, @Inject(PROOF_STORAGE) storage).execute(taskId, { userId }): Promise<FetchTaskProofResult>
    // owner or mapped executor (else 404); storage.getStream(task.proofImageUrl); ProofNotFoundError → 404 TASK_NOT_FOUND
  // controller: return new StreamableFile(stream, { type: mimeType })
  ```
  Dictionary (pt-BR):
  `tasks.proofPhotoRequired = { message: 'Envie uma foto de comprovação para finalizar a tarefa.', statusCode: 400, errorCode: 'PROOF_PHOTO_REQUIRED' }`
  `tasks.statusConflict = { message: 'A tarefa mudou de estado. Atualize a tela e tente novamente.', statusCode: 409, errorCode: 'TASK_STATUS_CONFLICT' }`
  `payment.disputed = { message: 'O pagamento desta tarefa está em disputa. Fale com o suporte.', statusCode: 409, errorCode: 'PAYMENT_DISPUTED' }`
  Multipart field stays `file` (SPEC §8.10 says `photo`; Phase 2 docs task aligns the SPEC to `file`).

- [ ] **Step 1: Write the failing tests** — `finish-task.e2e-spec.ts` (replace 78-92; helper
  `png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#0f0' } }).png().toBuffer()`):
  ```ts
  it('requires a proof photo', async () => { .field('taskId', task.id) → 400 PROOF_PHOTO_REQUIRED; task.status 'in_progress'; completedAt null })
  it('stores the normalised proof and marks verification_required', async () => {
    .field('taskId', task.id).attach('file', png, { filename: 'proof.png', contentType: 'image/png' }) → 200
    const t = tasks.findUniqueOrThrow; expect(t.status).toBe('verification_required'); expect(t.completedAt).not.toBeNull()
    expect(t.proofImageUrl).toMatch(new RegExp(`^${task.id}/[0-9a-f-]{36}\\.jpg$`))
    const bytes = await fs.readFile(join(process.env.PROOF_DIR!, t.proofImageUrl!)); expect(bytes.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
  })
  it('rejects files whose bytes are not an image', ... attach('file', Buffer.from('garbage'), { filename: 'p.png', contentType: 'image/png' }) → 400 FILE_FORMAT_NOT_SUPPORTED; status 'in_progress')
  it('refuses to finish when the payment is disputed', async () => { createPayment(task.id, { status: 'disputed', disputeId: 'dp_1' }) → 409 PAYMENT_DISPUTED; status 'in_progress'; proofImageUrl null })
  ```
  `test/tasks/fetch-task-proof.e2e-spec.ts` (seed: task `verification_required` with
  `proofImageUrl: `${task.id}/p.jpg``, write a JPEG at `PROOF_DIR/<key>` directly):
  ```ts
  it('rejects unauthenticated requests', → 401)
  it('streams the proof to the owner as image/jpeg', → 200; res.headers['content-type'] matches /^image\/jpeg/; res.body (Buffer) starts ff d8)
  it('streams the proof to the mapped executor', → 200)
  it('hides the proof from strangers', → 404 TASK_NOT_FOUND)
  it('returns 404 when the object is missing from storage', ... proofImageUrl `${task.id}/missing.jpg` → 404)
  it('returns 404 when the task has no proof', ... proofImageUrl null → 404)
  ```
- [ ] **Step 2: Run them, expect failure** — finish without file → 200 (today); proof spec → 404
  for the owner (service reads `src/tmp`).
- [ ] **Step 3: Implement** both services and the controller; dictionary adds/deletes; rewrite
  `finish-task.service.spec.ts` (mock storage `{ put, getStream }`, `jest.mock('../utils/proof-image')`;
  assert `put` called with `expect.stringMatching(/^task-1\/.+\.jpg$/)` and `'image/jpeg'`, `transition`
  called with `from: ['in_progress']`, `PROOF_PHOTO_REQUIRED` when `file: null`, no `put` when disputed).
  Add a unit spec `fetch-task-proof.service.spec.ts` (`mimeTypeFromPath('x.heif') === 'image/heif'`,
  stranger → 404, `ProofNotFoundError` → 404).
- [ ] **Step 4: Run them, expect pass** — `Tests: 7 passed` (finish), `Tests: 6 passed` (proof).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T11 mandatory proof via storage, CAS finish, proof streaming`

---

### Task P1-T12: `POST /tasks/validate` — payment-checked, CAS first, `source_transaction` transfer

**Files:**
- Modify: `src/modules/tasks/use-cases/validate-task.service.ts:14-103` (rewrite) + spec rewrite
- Modify: `src/exception/error-dictionary.ts:162-180` add `payment.notConfirmed`
- Delete: `TasksRepository.validateTaskCompletion` (`tasks.repository.ts:246-259`, DTO `:27`, type
  `ValidateTaskCompletionData` `types/index.d.ts:146-152`); `StripeService.createTransfer`
  (`stripe.service.ts:90-101`) + mock entry; `src/modules/auth/use-cases/update-wallet-balance.service.ts`
  (+ spec), `update-total-tasks-completed.service.ts` (+ spec), `AuthRepository.updateWalletBalance`
  (`auth.repository.ts:72-80`) and `updateTotalTasksCompleted` (`:58-63`) + DTO entries
  (`auth-repository.dto.ts:13-16,21`); providers in `tasks.module.ts:32,36,70,72`.
- Modify: `test/tasks/validate-task.e2e-spec.ts:20-26,28-54,91-147`

**Interfaces:**
- Consumes: `createTransferFromCharge` (P1-T03); `TasksRepository.transition/recordTransfer`,
  `PaymentsRepository.fetchLatestByTaskId` (P1-T04); `RateProxyService.execute`;
  `FetchUserDetailsService.execute`; `computeCharge`, `toCentavos`.
- Produces: `ValidateTaskService(stripeService, tasksRepository, paymentsRepository, rateProxyService, fetchUserDetailsService)`;
  `execute({ taskId, userId, rating?, comment? }): Promise<void>`:
  ```
  1. task verification_required (404) ; owner (403 CANNOT_VALIDATE_TASK) ; mapping (404) ; proxy ready + stripeAccountId (409 PROXY_ACCOUNT_NOT_READY)   [existing]
  2. payment = fetchLatestByTaskId(taskId)
     payment?.status === 'disputed'                              → 409 PAYMENT_DISPUTED
     !payment || payment.status !== 'succeeded' || !payment.chargeId → 409 PAYMENT_NOT_CONFIRMED
  3. earnings = task.proxyEarnings ?? computeCharge(task.offeredPrice).proxyEarnings
  4. transition({ taskId, from: ['verification_required'], to: 'completed' }) === false → 409 TASK_STATUS_CONFLICT
  5. transfer = createTransferFromCharge({ amount: toCentavos(earnings), destination: proxy.stripeAccountId, sourceTransaction: payment.chargeId, transferGroup: taskId, taskId }, `task:${taskId}:transfer`)
     throw or !transfer?.id → transition({ taskId, from: ['completed'], to: 'verification_required' }) → 500 TASK_TRANSFER_FAILED
  6. recordTransfer({ taskId, executorId: mapping.executorId, transferId: transfer.id, proxyEarnings: earnings })
  7. rating !== undefined → rateProxyService.execute(...) inside try/catch (Logger.warn on failure; the response stays 200 — rating is optional, D15)
  ```
  D1: the transfer is `proxyEarnings` = 80 % of `offeredPrice` (R$ 100 → `amount: 8000`); the other
  20 % (`platformFee`, out of which Stripe already took `stripeFee`) stays in the platform balance.
  `source_transaction = chargeId` ties the transfer to the start charge (D3), so it never needs
  available balance. D6: a `disputed` latest payment blocks validate before any write.
  Dictionary: `payment.notConfirmed = { message: 'O pagamento desta tarefa ainda não foi confirmado. Tente novamente em alguns minutos.', statusCode: 409, errorCode: 'PAYMENT_NOT_CONFIRMED' }`.
  `Users.walletBalance` now means "total recebido" (D8): incremented by `proxyEarnings` only here.

- [ ] **Step 1: Write the failing test** — rewrite `validate-task.e2e-spec.ts` seeding
  (`seedTaskPendingValidation(offeredPrice = 100, { stripeAccountReady?, stripeAccountId?, payment? })`
  creates the task with the factory's D1 fees for that price and the payment with
  `createPayment(task.id, payment ?? { status: 'succeeded', chargeId: 'ch_test_1', amount: offeredPrice })`):
  ```ts
  it('completes the task, transfers 80 % of the offered price from the charge and credits the proxy', async () => {
    → 200; task.status 'completed', transferId 'tr_test_123'
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(
      { amount: 8000, destination: 'acct_proxy_test', sourceTransaction: 'ch_test_1', transferGroup: task.id, taskId: task.id }, `task:${task.id}:transfer`)
    proxy.totalTasksCompleted 1; proxy.walletBalance.toFixed(2) '80.00'; task.platformFee?.toFixed(2) '20.00'; task.proxyEarnings?.toFixed(2) '80.00'; task.chargedAmount?.toFixed(2) '100.00'
  })
  it('computes the 80 % transfer for a legacy task without stored proxyEarnings', ... seed proxyEarnings: null (offeredPrice 100) → amount 8000; wallet '80.00')
  it.each([['pending'], ['failed'], ['refunded']])('refuses with 409 PAYMENT_NOT_CONFIRMED when the latest payment is %s', async (status) => {
    → 409 PAYMENT_NOT_CONFIRMED; createTransferFromCharge not called; status 'verification_required'; transferId null; wallet '0.00'
  })
  it('refuses when there is no payment row', ... payment: null → 409 PAYMENT_NOT_CONFIRMED)
  it('refuses a succeeded payment without chargeId (legacy row)', ... { status: 'succeeded', chargeId: null } → 409 PAYMENT_NOT_CONFIRMED)
  it('refuses a disputed payment', ... { status: 'disputed', disputeId: 'dp_1' } → 409 PAYMENT_DISPUTED)
  it('reverts to verification_required when the transfer fails', async () => {
    ctx.stripeMock.createTransferFromCharge.mockRejectedValueOnce(new Error('balance_insufficient'))
    → 500 TASK_TRANSFER_FAILED; status 'verification_required'; transferId null; wallet '0.00'; totalTasksCompleted 0
  })
  it('pays exactly once under concurrent validates', async () => {
    const [a, b] = await Promise.all([validate(), validate()]); expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledTimes(1); totalTasksCompleted 1; wallet '80.00'
  })
  it('increments the wallet atomically across concurrent validations of two tasks', async () => {
    // two tasks (100 and 50) for the same proxy, two owners → Promise.all → wallet '120.00' (80.00 + 40.00), totalTasksCompleted 2
  })
  it('keeps the existing behaviour for PROXY_ACCOUNT_NOT_READY, rating recorded, rating out of range', ... keep lines 129-190 adjusted to createTransferFromCharge)
  ```
- [ ] **Step 2: Run it, expect failure** — `createTransferFromCharge` not called (service still calls
  `createTransfer` with `7562`); pending payment case returns 200.
- [ ] **Step 3: Implement** the service; deletions; rewrite `validate-task.service.spec.ts`
  (`transition` called before `createTransferFromCharge`; revert `transition` called with
  `from: ['completed']` when the transfer rejects; `PAYMENT_NOT_CONFIRMED` with `pending`;
  `recordTransfer` receives `proxyEarnings` as `Prisma.Decimal` with `toFixed(2) === '80.00'`;
  `createTransferFromCharge` receives `amount: 8000`).
- [ ] **Step 4: Run it, expect pass** — `Tests: 16 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`
  (`transaction-history.e2e-spec.ts` still asserts the recomputed `75.62` from its own fixture — it
  is Phase 2 BE-40; it must still pass because it seeds `proxyEarnings` itself).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T12 validate requires a confirmed charge, CAS-first transfer`

---

### Task P1-T13: `POST /tasks/cancel` — dispute block, CAS first, full refund of a succeeded charge

**Files:**
- Modify: `src/modules/tasks/use-cases/cancel-task.service.ts:13-82` (rewrite) + spec rewrite
- Delete: `TasksRepository.updateTaskStatus` (`tasks.repository.ts:92-103`, DTO `:17`,
  `UpdateTaskStatusData` `types/index.d.ts:48-55`); `StripeService.refundPayment`
  (`stripe.service.ts:84-88`) + mock; `PaymentsRepository.fetchPaymentRecord/updatePaymentRecord`
  (`payments.repository.ts:16-28`) and `FetchPaymentRecordService`/`UpdatePaymentRecordService`
  (+ specs) + providers (`tasks.module.ts:39-40,67-68`).
- Modify: `test/tasks/cancel-task.e2e-spec.ts:72-109,132-152`

**Interfaces:**
- Consumes: `refundPaymentIntent` (P1-T03); `TasksRepository.transition`,
  `PaymentsRepository.fetchLatestByTaskId/updateById` (P1-T04); `payment.disputed` dictionary entry
  (added by P1-T11; add it here with the same text if P1-T11 is not merged yet:
  `{ message: 'O pagamento desta tarefa está em disputa. Fale com o suporte.', statusCode: 409, errorCode: 'PAYMENT_DISPUTED' }`).
- Produces: `CancelTaskService(stripeService, tasksRepository, paymentsRepository)`;
  `execute({ taskId, userId }): Promise<void>`:
  ```
  1. task (any status, 404) ; owner (403 CANNOT_CANCEL_TASK) ; status ∉ {available, in_progress} (403) ; in_progress && elapsed ≥ 1 h since startedAt (403)   [existing]
  2. payment = fetchLatestByTaskId(taskId)
     payment?.status === 'disputed' → 409 PAYMENT_DISPUTED   (D6; nothing written)
  3. transition({ taskId, from: [task.status], to: 'canceled', data: { canceledAt: new Date() } }) === false → 409 TASK_STATUS_CONFLICT
  4. switch (payment?.status)
     undefined | 'failed' | 'refunded' → no Stripe call
     'pending'   → no Stripe call; Logger.warn(`legacy pending payment ${payment.id} on canceled task ${taskId}`)   // only rows created before this phase
     'succeeded' → refund = refundPaymentIntent(payment.paymentIntent, `task:${taskId}:refund`)
                   refund.status ∈ {'succeeded','pending'} → updateById(payment.id, { status: 'refunded', refundId: refund.id })
                   else throw
     any throw in 4 → transition({ taskId, from: ['canceled'], to: task.status, data: { canceledAt: null } }) → 500 REFUND_FAILED
  ```
  D7: the refund is the full `chargedAmount` (= `offeredPrice`; no `amount` passed → Stripe refunds
  the whole charge); the platform absorbs Stripe's non-refundable fee. There is no intent to cancel:
  the start charge is captured automatically (D3), so money that moved is returned by refund and an
  intent that did not succeed holds nothing. The refund key `task:<id>:refund` is shared with the
  P1-T14 webhook that refunds a charge landing on an already canceled task, so the two can never
  refund twice. An `in_progress` task without a payment row (a start whose charge outcome is still
  unknown, P1-T08) cancels without a Stripe call; if that charge later succeeds, P1-T14 refunds it.

- [ ] **Step 1: Write the failing test** — rewrite `cancel-task.e2e-spec.ts:72-152` (keep 27-70,
  154-167):
  ```ts
  it('refunds the full charge and cancels within the grace period', async () => {
    createPayment(task.id, { paymentIntent: 'pi_refundable', status: 'succeeded', amount: 100 }) → 200
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledWith('pi_refundable', `task:${task.id}:refund`)
    task 'canceled', canceledAt set; payment status 'refunded', refundId 're_test_123'
  })
  it('accepts a refund that Stripe reports as pending', ... refundPaymentIntent.mockResolvedValueOnce({ id: 're_pending', status: 'pending' }) → 200; refundId 're_pending', status 'refunded')
  it('refuses to cancel when the latest payment is disputed', async () => {
    createPayment(task.id, { paymentIntent: 'pi_disp', status: 'disputed', disputeId: 'dp_1' }) → 409 PAYMENT_DISPUTED
    task status unchanged ('in_progress'), canceledAt null; refundPaymentIntent not called; payment still 'disputed'
  })
  it('refunds only the latest payment when an older failed row exists', async () => {
    createPayment(task.id, { paymentIntent: 'pi_old', status: 'failed', createdAt: new Date(Date.now() - 3_600_000) }); createPayment(task.id, { paymentIntent: 'pi_new', status: 'succeeded' })
    → 200; refundPaymentIntent called once with 'pi_new'
  })
  it.each([['failed'], ['refunded'], ['pending']])('cancels without a Stripe call when the latest payment is %s', ... → 200; refundPaymentIntent not called; payment status unchanged)
  it('cancels an available task without payment', ... keep)
  it('cancels an in_progress task without a payment row', ... keep)
  it('restores in_progress when the refund fails', async () => {
    refundPaymentIntent.mockRejectedValueOnce(new Error('charge_already_refunded'))
    → 500 REFUND_FAILED; task 'in_progress', canceledAt null; payment still 'succeeded'
  })
  ```
- [ ] **Step 2: Run it, expect failure** — the disputed case → 200 (today cancels and refunds
  blindly); the `pending` case → 500 `REFUND_FAILED`.
- [ ] **Step 3: Implement** the service; deletions; rewrite `cancel-task.service.spec.ts` (branch
  table: `succeeded → refundPaymentIntent` with key, `failed | refunded | pending | none → no call`,
  `disputed → PAYMENT_DISPUTED` before `transition`; `transition` to `canceled` happens before the
  Stripe call; revert `transition` on throw).
- [ ] **Step 4: Run it, expect pass** — `Tests: 15 passed` (the `it.each` gained the `pending` row).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T13 cancel refunds the full charge, dispute-blocked, CAS first`

---

### Task P1-T14: Webhooks I — dedupe-first dispatch, idempotent succeeded write, guarded failure, refund bookkeeping

**Files:**
- Modify: `src/modules/stripe-webhook/repository/stripe-events.repository.ts:9-20`
- Modify: `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:31-80` (+ spec)
- Modify: `src/modules/stripe-webhook/use-cases/handle-payment-succeeded.service.ts:10-15` (+ spec),
  `handle-payment-failed.service.ts:10-31` (+ spec), `handle-charge-refunded.service.ts:10-24` (+ spec)
- Modify: `src/modules/stripe-webhook/stripe-webhook.module.ts:17-30` — `imports` gains
  `PaymentsModule` (exports `PaymentsRepository` since P1-T04); `TasksRepository` stays a provider
  (used for `releaseClaim`).
- Modify: `test/stripe-webhook/stripe-webhook.e2e-spec.ts:69-168,256-282`

**Interfaces:**
- Consumes: `PaymentsRepository.findByPaymentIntent/recordSucceededCharge/updateById`,
  `TasksRepository.releaseClaim` (P1-T04); `StripeService.refundPaymentIntent` (P1-T03). The start
  PaymentIntent carries `metadata: { taskId, proxyId, claimedAt }` (P1-T03/P1-T08).
- Produces:
  ```ts
  // StripeEventsRepository
  tryMarkProcessed(eventId: string, type: string): Promise<boolean>   // create; catch Prisma P2002 → false
  remove(eventId: string): Promise<void>                              // deleteMany({ where: { id } })
  // DispatchStripeEventService.execute(rawBody, signature)
  //   event = constructWebhookEvent (400 WEBHOOK_INVALID_SIGNATURE)
  //   if (!(await tryMarkProcessed(event.id, event.type))) { log 'already processed'; return }
  //   try { switch … } catch (e) { await remove(event.id); throw e }     // Stripe retries → reprocessed
  // HandlePaymentSucceededService(prisma, paymentsRepository, stripeService).execute(pi)
  //   chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null
  //   existing = paymentsRepository.findByPaymentIntent(pi.id)
  //   taskId = existing?.taskId ?? pi.metadata?.taskId
  //   !taskId → logger.warn(`succeeded intent ${pi.id} matches no task`); return
  //   payment = paymentsRepository.recordSucceededCharge({ taskId, paymentIntent: pi.id, amount: new Prisma.Decimal(pi.amount).div(100), chargeId })
  //     (same idempotent write as POST /tasks/start: whichever runs first creates the row, the other only back-fills chargeId)
  //   task = prisma.tasks.findUnique({ where: { id: taskId }, select: { status: true } })
  //   task?.status === 'canceled' && payment.status === 'succeeded' →
  //     refund = stripeService.refundPaymentIntent(pi.id, `task:${taskId}:refund`)   // same key as P1-T13: never a second refund
  //     paymentsRepository.updateById(payment.id, { status: 'refunded', refundId: refund.id }); logger.warn(`late charge on canceled task ${taskId} refunded`)
  // HandlePaymentFailedService(prisma, tasksRepository, paymentsRepository).execute(pi)
  //   legacy = prisma.payments.findFirst({ where: { paymentIntent: pi.id, status: 'pending' }, select: { id, taskId } })
  //   legacy → $transaction(async tx => { tx.payments.update({ where: { id }, data: { status: 'failed' } })
  //     r = tx.tasks.updateMany({ where: { id: taskId, status: 'in_progress' }, data: { status: 'available', startedAt: null } })
  //     if (r.count === 1) tx.userTaskMapping.deleteMany({ where: { taskId } }) else logger.warn(`task ${taskId} not in_progress; left untouched`) }); return
  //   (await paymentsRepository.findByPaymentIntent(pi.id)) → return            // a row exists and is not pending: never downgrade it
  //   { taskId, proxyId, claimedAt } = pi.metadata ?? {}; any missing → return
  //   tasksRepository.releaseClaim({ taskId, executorId: proxyId, startedAt: new Date(claimedAt) })
  //     // releases only that exact claim (status in_progress + same startedAt): closes a start whose outcome was unknown (P1-T08);
  //     // a no-op when start already released it or a newer claim exists
  // HandleChargeRefundedService.execute(charge)
  //   refundId = charge.refunds?.data[0]?.id; full = charge.amount_refunded === charge.amount
  //   full → updateMany({ where: { paymentIntent }, data: { status: 'refunded', ...(refundId && { refundId }) } })
  //   !full → logger.warn partial refund; no status change (refundId stored if present)
  ```
  The new `start` writes only `succeeded` rows, so `pending` rows (and the legacy branch of
  `payment_failed`) exist only for payments created before this phase. There is no
  capture-related event handling: charges are captured automatically (D3).

- [ ] **Step 1: Write the failing test** — in `stripe-webhook.e2e-spec.ts` (`claimedTask()` seeds an
  `in_progress` task with `offeredPrice: 100`, `startedAt = T`, a mapping for `proxy`, no payment row;
  other cases use the factory default price 50, i.e. `amount: 5000` centavos;
  `meta(task, T) = { taskId: task.id, proxyId: proxy.id, claimedAt: T.toISOString() }`):
  ```ts
  it('marks a legacy pending payment succeeded and stores the charge id', async () => {
    createPayment(task.id, { paymentIntent: 'pi_evt_1', status: 'pending' }); mockEvent('payment_intent.succeeded', { id: 'pi_evt_1', amount: 5000, latest_charge: 'ch_evt_1' })
    → 200; payment.status 'succeeded', chargeId 'ch_evt_1'
  })
  it('writes the payment row from metadata when start has not written it yet', async () => {
    const { task, T } = await claimedTask()
    mockEvent('payment_intent.succeeded', { id: 'pi_evt_meta', amount: 10000, latest_charge: 'ch_evt_meta', metadata: meta(task, T) })
    → 200; payments for task = 1: status 'succeeded', chargeId 'ch_evt_meta', amount.toFixed(2) '100.00'; task still 'in_progress'
  })
  it('is a no-op when start already wrote the row', async () => {
    createPayment(task.id, { paymentIntent: 'pi_evt_dup', status: 'succeeded', chargeId: 'ch_dup' })
    mockEvent('payment_intent.succeeded', { id: 'pi_evt_dup', amount: 5000, latest_charge: 'ch_dup', metadata: { taskId: task.id } })
    → 200; payments count 1; chargeId 'ch_dup'; refundPaymentIntent not called
  })
  it('refunds a charge that lands on a canceled task', async () => {
    task status 'canceled', no payment; mockEvent('payment_intent.succeeded', { id: 'pi_evt_late', amount: 5000, latest_charge: 'ch_late', metadata: { taskId: task.id, proxyId: proxy.id, claimedAt: new Date().toISOString() } })
    → 200; expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledWith('pi_evt_late', `task:${task.id}:refund`); payment 'refunded', refundId 're_test_123'
  })
  it('does not touch a failed payment on payment_intent.succeeded', ... status 'failed' stays 'failed', chargeId null)
  it('reverts an in_progress task on payment_failed only while the legacy payment is pending', ... (existing case 96-139, now using createPayment { status: 'pending' }) → available, mapping null, payment failed)
  it('leaves a verification_required task untouched on payment_failed', async () => {
    task verification_required + mapping + pending payment → 200; task.status 'verification_required'; mapping kept; payment 'failed'
  })
  it('ignores payment_failed for an already succeeded payment', ... succeeded stays succeeded, task in_progress, mapping kept)
  it('releases the open claim named by metadata when no payment row exists', async () => {
    const { task, T } = await claimedTask()
    mockEvent('payment_intent.payment_failed', { id: 'pi_evt_fail', metadata: meta(task, T) })
    → 200; task 'available', startedAt null; mapping null; payments count 0
  })
  it('ignores payment_failed metadata for a claim that is no longer open', async () => {
    const { task, T } = await claimedTask()
    mockEvent('payment_intent.payment_failed', { id: 'pi_evt_stale', metadata: meta(task, new Date(T.getTime() - 60_000)) })
    → 200; task still 'in_progress' with startedAt T; mapping kept
  })
  it('marks payment refunded on a full charge.refunded', ... { payment_intent: 'pi_evt_3', amount: 5000, amount_refunded: 5000, refunds: { data: [{ id: 're_abc' }] } } → 'refunded', refundId 're_abc')
  it('keeps the stored refundId when charge.refunded has no refunds list', ... createPayment { status: 'succeeded', refundId: 're_kept' }; event { payment_intent, amount: 5000, amount_refunded: 5000 } → status 'refunded', refundId 're_kept')
  it('does not mark a partial refund as refunded', ... amount: 5000, amount_refunded: 2500 → status stays 'succeeded')
  it('processes the same event only once, even concurrently', async () => {
    mockEvent twice with id 'evt_idem' (constructWebhookEvent.mockReturnValue, not Once) and a pending payment
    const [a, b] = await Promise.all([postWebhook(), postWebhook()]); expect(a.status).toBe(200); expect(b.status).toBe(200)
    stripe_events count 1; payment 'succeeded'
  })
  ```
  `dispatch-stripe-event.service.spec.ts`: `eventsRepo.tryMarkProcessed.mockResolvedValue(false)` →
  no handler called; handler rejects → `remove` called with `'evt_1'` and the error propagates.
- [ ] **Step 2: Run it, expect failure** — chargeId stays `null`; the metadata case writes no row;
  the canceled-task case is not refunded; verification_required task flips to `available`;
  concurrent delivery writes the handler twice or 500s on the dedupe insert.
- [ ] **Step 3: Implement** repository, dispatcher, three handlers, module import; update their
  unit specs (`handle-payment-succeeded.service.spec.ts`: `recordSucceededCharge` called with the
  metadata `taskId` and `amount` `'100'` for `pi.amount = 10000`, refund only when the task is
  `canceled`; `handle-payment-failed.service.spec.ts` mocks an interactive `$transaction` callback
  with a `tx` object for the legacy branch and asserts `releaseClaim` is called with
  `startedAt: new Date(claimedAt)` only when no row exists and the metadata is complete;
  `handle-charge-refunded.service.spec.ts` adds `amount/amount_refunded` to fixtures).
- [ ] **Step 4: Run it, expect pass** — webhook e2e `Tests: 18 passed` (incl. the untouched
  `account.updated` and the `payout.failed` case still green until P1-T15 rewrites it).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(stripe-webhook): P1-T14 dedupe first, idempotent succeeded write, guarded payment_failed`

---

### Task P1-T15: Webhooks II — `payout.failed` flag, dispute persistence, `account.updated` guard

**Files:**
- Modify: `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:1-81` (rewrite; deps
  become `PrismaService` only) + spec rewrite; `handle-charge-disputed.service.ts:12-69` (+ spec);
  `handle-account-updated.service.ts:12-27` (+ spec); `stripe-webhook.module.ts:5,20` (drop
  `AuthRepository`; keep `TasksRepository`, which P1-T14's `payment_failed` handler uses for
  `releaseClaim`).
- Delete: `TasksRepository.fetchTaskByTransferId`, `markPayoutFailed` (`tasks.repository.ts:261-304`,
  DTO `:20-22,28`); `StripeService.reverseTransfer`, `listPayoutTransactions`
  (`stripe.service.ts:103-112`) + mock entries.
- Modify: `test/stripe-webhook/stripe-webhook.e2e-spec.ts:170-254`

**Interfaces:**
- Produces:
  ```ts
  // HandlePayoutFailedService(prisma).execute(payout: Stripe.Payout, accountId?: string)
  //   !accountId → logger.error, return
  //   users.updateMany({ where: { stripeAccountId: accountId }, data: { payoutIssue: true } }); logger.error with failure_code/failure_message
  //   (no transfer reversal, no task status change, no wallet change — D5)
  // HandleAccountUpdatedService(prisma).execute(account)
  //   !account.id → logger.warn, return   (updateMany with undefined would match every user)
  //   ready = Boolean(charges_enabled && payouts_enabled)
  //   users.updateMany({ where: { stripeAccountId: account.id }, data: { stripeAccountReady: ready, ...(account.payouts_enabled && { payoutIssue: false }) } })
  // HandleChargeDisputedService(prisma).execute(dispute)
  //   paymentIntentId as today; payment = findFirst({ where: { paymentIntent }, select: { id, status, taskId, task: { select: { status } } } }); !payment → return
  //   payment.status === 'disputed' → return (idempotent)
  //   payments.update({ where: { id }, data: { status: 'disputed', disputeId: dispute.id } }); logger.warn(`dispute ${id} on task ${taskId} (${task.status}) — manual review`)
  //   (no wallet decrement — D6/D8: manual review decides; finish/validate/cancel are blocked by P1-T11/P1-T12/P1-T13, D6)
  ```
  App side: `payoutIssue` is surfaced in Phase 2 via `GET /auth/me` (BE-16/D10) and rendered in Phase 3
  (APP-21 banner).

- [ ] **Step 1: Write the failing test** — replace `stripe-webhook.e2e-spec.ts:170-254`:
  ```ts
  it('flips stripeAccountReady and clears payoutIssue on account.updated', async () => {
    createUser({ userType: 'PROXY', stripeAccountId: 'acct_ready' }); users.update payoutIssue true
    mockEvent('account.updated', { id: 'acct_ready', charges_enabled: true, payouts_enabled: true }) → 200; stripeAccountReady true; payoutIssue false
  })
  it('ignores account.updated without an account id', async () => {
    two proxies with stripeAccountReady false; mockEvent('account.updated', { charges_enabled: true, payouts_enabled: true }) → 200; both still false
  })
  it('flags the proxy on payout.failed without touching tasks or wallet', async () => {
    completed task with transferId 'tr_payout_1', proxy stripeAccountId 'acct_payout', walletBalance 200, totalTasksCompleted 3
    constructWebhookEvent → { id: 'evt_payout_failed_1', type: 'payout.failed', account: 'acct_payout', data: { object: { id: 'po_payout_1', failure_code: 'account_closed' } } }
    → 200; proxy.payoutIssue true; walletBalance '200.00'; totalTasksCompleted 3; task.status 'completed', transferId 'tr_payout_1'
  })
  it('persists the dispute and freezes the payment on charge.dispute.created', async () => {
    completed task, createPayment { status: 'succeeded', paymentIntent: 'pi_disp' }, proxy walletBalance 100
    mockEvent('charge.dispute.created', { id: 'dp_1', payment_intent: 'pi_disp' }) → 200; payment status 'disputed', disputeId 'dp_1'; walletBalance '100.00'
    // then POST /tasks/finish on an in_progress task with that payment → 409 PAYMENT_DISPUTED (covered in P1-T11; here assert only the row)
  })
  it('is idempotent for a second dispute event on the same payment', ... second event id different, same pi → still one disputeId 'dp_1')
  ```
- [ ] **Step 2: Run it, expect failure** — `payout.failed` case expects `payoutIssue` (column exists
  since P1-T02 but handler reverses transfers → `reverseTransfer` called, task `payout_failed`).
- [ ] **Step 3: Implement** the three handlers, module wiring, deletions; rewrite their unit specs
  (payout: `users.updateMany` called with `{ where: { stripeAccountId: 'acct_1' }, data: { payoutIssue: true } }`
  and nothing else; account: `updateMany` not called when `id` missing; dispute: second call with
  `status: 'disputed'` does not call `update`).
- [ ] **Step 4: Run it, expect pass** — webhook e2e `Tests: 22 passed` (P1-T14's 18 + 4).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(stripe-webhook): P1-T15 payout.failed flags, disputes persisted, no claw-back`

---

### Task P1-T16: Daily auto-release job (D18)

**Files:**
- Install: `npm i @nestjs/schedule`
- Modify: `src/app.module.ts:22-43` add `ScheduleModule.forRoot()` to `imports`
- Create: `src/modules/tasks/jobs/auto-release-tasks.job.ts` (+ `.spec.ts`)
- Modify: `src/modules/tasks/repository/tasks.repository.ts` add `findStaleVerificationRequired`;
  DTO + types; `tasks.module.ts` providers add `AutoReleaseTasksJob`
- Create: `test/tasks/auto-release.e2e-spec.ts`

**Interfaces:**
- Consumes: `ValidateTaskService.execute` (P1-T12).
- Produces:
  ```ts
  export const AUTO_RELEASE_AFTER_DAYS = 7
  // TasksRepository
  findStaleVerificationRequired(completedBefore: Date): Promise<{ id: string; owner: string }[]>
    // findMany({ where: { status: 'verification_required', completedAt: { lte: completedBefore } }, select: { id: true, owner: true }, orderBy: { completedAt: 'asc' }, take: 200 })
  @Injectable() export class AutoReleaseTasksJob {
    constructor(private tasksRepository: TasksRepository, private validateTaskService: ValidateTaskService)
    @Cron('0 3 * * *', { name: 'auto-release-tasks', timeZone: 'America/Sao_Paulo' }) run(): Promise<void>   // await this.execute()
    async execute(now = new Date()): Promise<{ released: string[]; skipped: string[] }>
      // cutoff = subDays(now, AUTO_RELEASE_AFTER_DAYS) (date-fns); for each task: try validateTaskService.execute({ taskId, userId: owner }) → released; catch → logger.warn(code) → skipped
  }
  ```
  The job validates with the owner's id and no rating; `verification_required` tasks have no rating
  by construction. "Falar com o suporte" (APP-30) is Phase 3.

- [ ] **Step 1: Write the failing test** `test/tasks/auto-release.e2e-spec.ts` (`job =
  ctx.app.get(AutoReleaseTasksJob)`; helper `seedStale(daysAgo, payment)` = ready proxy
  `acct_proxy_test`, task `verification_required` with `completedAt` N days ago, mapping, payment):
  ```ts
  it('validates tasks stuck for 7+ days and skips the rest', async () => {
    const a = await seedStale(8, { status: 'succeeded', chargeId: 'ch_a' })      // released
    const b = await seedStale(6, { status: 'succeeded', chargeId: 'ch_b' })      // too recent
    const c = await seedStale(8, { status: 'pending' })                          // skipped: PAYMENT_NOT_CONFIRMED
    const d = await seedStale(8, { status: 'disputed', disputeId: 'dp_1' })      // skipped: PAYMENT_DISPUTED
    const result = await job.execute()
    expect(result.released).toEqual([a.task.id]); expect(result.skipped.sort()).toEqual([c.task.id, d.task.id].sort())
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledTimes(1)
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(expect.objectContaining({ sourceTransaction: 'ch_a', amount: 4000 }), `task:${a.task.id}:transfer`)   // factory default price 50 → proxyEarnings 40.00 (80 %)
    statuses: a 'completed' (transferId 'tr_test_123'), b/c/d 'verification_required'; a.proxy.walletBalance '40.00'
  })
  it('is idempotent: a second run releases nothing', ... execute() again → released [] and transfer still called once)
  it('exposes the cron metadata', () => { const reg = ctx.app.get(SchedulerRegistry); expect(reg.getCronJob('auto-release-tasks')).toBeDefined() })
  ```
- [ ] **Step 2: Run it, expect failure** — `Cannot find module 'src/modules/tasks/jobs/auto-release-tasks.job'`.
- [ ] **Step 3: Implement** the job, repository method, module registration. Unit spec
  `auto-release-tasks.job.spec.ts`: one task rejects with `AppException` → appears in `skipped`, the
  next task is still validated.
- [ ] **Step 4: Run it, expect pass** — `Tests: 3 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`
  (`app.close()` in every e2e must still resolve: `ScheduleModule` clears its timers on shutdown).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T16 daily auto-release of verification_required tasks`

---

### Task P1-T17: Rewrite `proxy-api/CLAUDE.md` money sections

**Files:**
- Modify: `/Users/leandromartins/Documents/proxy-api/CLAUDE.md:110-113` (route map), `:126-135`
  (Database models), `:137-144` (Stripe Connect), `:146-157` (Stripe webhooks), `:159-168` (3DS /
  async payment flow), "## Environment variables" (required/optional lists), `:12` (Stack line about
  payments: "PaymentIntent created and confirmed off-session at start, automatic capture; transfers
  with `source_transaction` at validate").

**Interfaces:** none (docs). Content to write (replace the sections' text, keep headings):
- Route map: `POST /card/setup-intent` (returns `{ clientSecret, setupIntentId }`), `POST /card/create
  { paymentMethodId }`; `GET /tasks/price-preview?offeredPrice=` (five numbers: `offeredPrice`,
  `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings`), `GET /tasks/:id/proof` (streams
  `image/jpeg` from storage, owner/executor only); `POST /tasks/finish` "multipart `file`
  **required**, JPG/PNG/WEBP/HEIC, stored as JPEG ≤ 1600 px"; `POST /tasks/create` "CLIENT only,
  `offeredPrice` 20–10 000 with 2 dp, `cardDetails: { savedCard } | { paymentMethodId }`".
- Database models: `Tasks` gains `stripeFee`, `chargedAmount` (set at create from
  `src/common/money.ts`): `chargedAmount = offeredPrice`, `platformFee = 20 %`,
  `proxyEarnings = 80 %` (`offeredPrice − platformFee`), `stripeFee = 3.99 % × chargedAmount + 0.39`
  (paid by the platform; platform net = `platformFee − stripeFee`, derived, not stored);
  `Tasks.startedAt` is the claim time; `Payments` `amount = chargedAmount`, `chargeId` (from the
  start response or `payment_intent.succeeded`), `disputeId`, unique `paymentIntent`, written as
  `succeeded` by `start` after Stripe answers (or by the webhook from PaymentIntent metadata —
  either may go first), `pending` only on rows created before Phase 1; `Users.payoutIssue`;
  `Users.walletBalance` = "total recebido"; `Cards`: one active card per user (partial unique index
  `cards_one_active_per_user`); lifecycle sentence: `accepted`/`on_the_way` enum-only;
  `payout_failed` kept for old rows, never written.
- Stripe Connect: separate charges and transfers; D1 fee model with the R$ 100 example (client pays
  100.00; proxy receives 80.00; platform fee 20.00, of which Stripe takes 4.38, platform net 15.62);
  `start` sequence: CAS claim (`available → in_progress`, mapping) → PaymentIntent created and
  confirmed off-session for `chargedAmount`, automatic capture, idempotency key
  `start:<taskId>:<proxyId>:<startedAt ms>`, metadata `{ taskId, proxyId, claimedAt }`,
  `transfer_group = taskId` → `succeeded` payment row; definite failure → claim released, proxy gets
  409 `PAYMENT_FAILED`, `Users.cardActionRequired` is set in the claim-release transaction (in-app banner) and the client also gets the "Confirme seu cartão na Carteira" e-mail; unknown outcome →
  claim kept, 409 `PAYMENT_PENDING`; funds sit in the platform balance until `validate`; `validate`
  sequence payment check → CAS → `transfers.create({ amount: proxyEarnings, source_transaction:
  chargeId, transfer_group }, { idempotencyKey: task:<id>:transfer })` → one transaction; `cancel`:
  disputed → 409, otherwise CAS then full refund of a succeeded charge (key `task:<id>:refund`);
  cards via SetupIntent (`usage: 'off_session'`), previous PM detached.
- Stripe webhooks: two endpoints/secrets (`STRIPE_WEBHOOK_SECRET` platform events,
  `STRIPE_CONNECT_WEBHOOK_SECRET` connected-account events; `constructWebhookEvent` tries both);
  dedupe **before** the handler (row removed if the handler throws so Stripe's retry reprocesses);
  the six handlers as implemented in P1-T14/T15 (`payment_intent.succeeded` writes or completes the
  row idempotently and refunds a charge on a canceled task; `payment_intent.payment_failed` releases
  only the open claim named by metadata; `payout.failed` → `payoutIssue` flag only;
  `charge.dispute.created` → `disputed` + `disputeId`, blocks finish/validate/cancel, manual review).
- 3DS section: rename to "### Card authentication and the start charge": 3DS happens once at card
  save (SetupIntent confirmed on the client's device); `/tasks/start` returns `{ status: 'succeeded' }`,
  `409 PAYMENT_FAILED` ("Não foi possível cobrar o cliente. Tente outra tarefa.") or
  `409 PAYMENT_PENDING`; no SCA challenge on the proxy's device, no `clientSecret` in the response.
  Write the prose without the literal strings `requires_action`, `capture_method` or "manual
  capture" (the Step 3 greps count them).
- Environment: optional `STRIPE_CONNECT_WEBHOOK_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `PROOF_DIR` (default `./tmp/proofs`), `STRIPE_PUBLIC_KEY`
  now optional/unused by the API; daily cron `0 3 * * *` America/Sao_Paulo auto-release after 7 days.
- Error codes added or changed this phase (list for SPEC §3.3 sync in Phase 2): `PAYMENT_NOT_CONFIRMED`
  409, `PAYMENT_DISPUTED` 409, `PAYMENT_PENDING` 409, `PAYMENT_FAILED` now 409 (was 402) with the D3
  message, `PROOF_PHOTO_REQUIRED` 400, `TASK_STATUS_CONFLICT` 409, `USER_NOT_CLIENT` 403,
  `CARD_NOT_CONFIRMED` 400, `CARD_ALREADY_EXISTS` 409; removed: `TASK_STARTED_AT_NOT_VALID`,
  `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `TRANSFER_FAILED`.

- [ ] **Step 1: Write the failing check** — `cd /Users/leandromartins/Documents/proxy-api && grep -c
  "requires_action" CLAUDE.md` → non-zero (`2` on 2026-11-23); `grep -c "chargedAmount" CLAUDE.md`
  → `0`.
- [ ] **Step 2: Rewrite** the sections listed above.
- [ ] **Step 3: Verify** — `grep -c "requires_action" CLAUDE.md` → `0`; `grep -c "capture_method"
  CLAUDE.md` → `0`; `grep -ci "manual capture\|requires_capture" CLAUDE.md` → `0`; each of
  `grep -n "setup-intent\|price-preview\|STRIPE_CONNECT_WEBHOOK_SECRET\|payoutIssue\|chargedAmount\|source_transaction\|PROOF_PHOTO_REQUIRED\|PAYMENT_PENDING\|cards_one_active_per_user" CLAUDE.md`
  returns at least one line; route map lists every controller in `src/modules/*/controllers`
  (`ls src/modules/*/controllers | wc -l` equals the number of routes documented).
- [ ] **Step 4: Mark done in ../STATUS.md; commit message** `docs(api): P1-T17 CLAUDE.md money sections for the D1/D3 model`

---

### Task P1-T18: App wire types follow the new contract

**Files (repo `/Users/leandromartins/Documents/proxy-app`):**
- Modify: `src/apis/tasks/tasks-api-types.ts:39-48` (`TPayment`), `:72-88` (`TTask`), `:132-135`
  (`TCreateTaskPayload.cardDetails`), `:168-170` (`TStartTaskResult`), append `TChargePreview`.
- Modify: `src/apis/cards/cards-api-types.ts:17-19` (`TCreateCardPayload`), append `TSetupIntent`.
- Modify: `src/feature/cards/components/AddCardSheet.tsx:109` — `{ token: paymentMethod.id }` →
  `{ paymentMethodId: paymentMethod.id }` (key rename only; the SetupIntent confirm flow is Phase 3).
- Modify: `app/(app)/tasks/[id]/index.tsx:104-108` — delete the `if (result.status ===
  'requires_action') { … } else` branch, keep `toast.success('Tarefa aceita! Bom trabalho.')`
  (`tsc` otherwise fails: comparison with no overlap).

**Interfaces:**
- Produces (exact type changes):
  ```ts
  // tasks-api-types.ts
  export interface TPayment { id: string; taskId: string; amount: string; status: TPaymentStatus; paymentIntent: string; refundId: string | null; chargeId: string | null; disputeId: string | null; createdAt: string; updatedAt: string }
  export interface TTask { …existing…; proxyEarnings: string | null; platformFee: string | null; stripeFee: string | null; chargedAmount: string | null; … }
  export interface TCreateTaskPayload { …; cardDetails: { savedCard: string } | { paymentMethodId: string } }
  export type TStartTaskResult = { status: 'succeeded' }
  export interface TChargePreview { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }   // GET /tasks/price-preview
  // cards-api-types.ts
  export interface TCreateCardPayload { paymentMethodId: string }
  export interface TSetupIntent { clientSecret: string; setupIntentId: string }
  ```
  `TChargePreview` keeps the same five numeric fields as the backend `PricePreview` (P1-T07); the
  name matches what the Phase 3 plan already consumes. Under D1 `chargedAmount === offeredPrice` in
  every response (the client pays exactly the typed price) and `proxyEarnings` is 80 %; the app's
  copy change (client sees no fee lines, proxy sees "Você recebe") belongs to Phase 3, not here —
  this task changes types only. `PAYMENT_FAILED` from `/tasks/start` is now a 409 with the message
  "Não foi possível cobrar o cliente. Tente outra tarefa." and `PAYMENT_PENDING` (409) is new; the
  app already shows `extractErrorMessage`, so no code change is needed here.
  Route functions (`cardsApis.setupIntent`, `tasksApis.pricePreview`), hooks (`useChargePreviewQuery`,
  `useConfirmSetupIntent`) and screens are Phase 3 (P3 tasks "Cards via SetupIntent", "Money copy from
  backend numbers", "Payment status banner"). `ACTIVE_TASK_STATUSES` removal is CON-10 → Phase 3.

- [ ] **Step 1: Write the failing check** — `cd /Users/leandromartins/Documents/proxy-app && grep -n
  "requires_action" src app -r` → 2 hits (`tasks-api-types.ts:170`, `app/(app)/tasks/[id]/index.tsx:104`).
- [ ] **Step 2: Apply** the type changes and the two call-site edits above.
- [ ] **Step 3: Verify** — `grep -rn "requires_action" src app` → no output;
  `grep -n "chargedAmount\|stripeFee\|TChargePreview\|TSetupIntent\|paymentMethodId" src/apis/tasks/tasks-api-types.ts src/apis/cards/cards-api-types.ts` → each symbol present;
  `npx tsc --noEmit && npx eslint .` → clean (and `npm test` if Phase 0 added it).
- [ ] **Step 4: Mark done in ../STATUS.md; commit message** `chore(apis): P1-T18 wire types for the Phase 1 money contract`
