# Phase 1 — Money core (backend only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make the proxy-api money path unable to lose or double-move money: client pays
`offeredPrice + fees`, proxy receives exactly `offeredPrice`, every status transition is
compare-and-set, every Stripe call is idempotent and happens before (or is reverted after) the DB
write it depends on, webhooks dedupe first, proofs live in object storage.

**Architecture:** one pure money module (`src/common/money.ts`) feeds `create` (fees persisted on
the task), `start` (off-session charge of `chargedAmount` as an authorisation hold, DB claim, then
capture), `validate` (payment-checked, CAS-first transfer with `source_transaction`), `cancel`
(CAS-first, branch on latest payment status) and the new `GET /tasks/price-preview`. Cards are saved
through a SetupIntent (`POST /card/setup-intent` + `POST /card/create { paymentMethodId }`). Webhooks
insert the `StripeEvents` row first; `payout.failed` and `charge.dispute.created` only flag. Proofs
go through a `ProofStorage` port (`S3ProofStorage` in prod, `LocalDiskProofStorage` in dev/test)
after a magic-byte check and JPEG normalisation. A daily `@nestjs/schedule` job auto-validates tasks
stuck in `verification_required` for 7 days.

**Tech stack:** NestJS 11.0, Prisma 7.3 (`Prisma.Decimal` = decimal.js, `ROUND_HALF_UP`), Zod 4.3,
`stripe` 20.2 (`apiVersion: '2025-12-15.clover'`), Jest 30 + ts-jest, Testcontainers Postgres 16,
supertest. New: `@nestjs/schedule` ^6, `@aws-sdk/client-s3` ^3.1164, `sharp` ^0.35, `heic-convert`
^2.1 (+ `@types/heic-convert`), `file-type@16.5.4` (last CommonJS release; v17+ is ESM-only and
cannot be `require`d by ts-jest). Node 26 locally.

**Spec:** ../PLAN.md §2 (Phase 1), ../DECISIONS.md D1–D8, D18, D19, `proxy-app/SPEC.md` §7.2, §7.3,
§8.8, §8.10, §3.3 (codes).

## Global constraints

- Repo: `/Users/leandromartins/Documents/proxy-api`. Conventions from its `CLAUDE.md`: 1 controller
  = 1 route (`controllers/<action>.controller.ts`), 1 service = 1 use case with `execute()`, Zod
  schemas inline in controllers, `@Body(new ZodValidationPipe(schema))`, domain errors
  `throw new AppException(errorDictionary.x.y)`, dictionary messages in **pt-BR**, no semicolons,
  single quotes, trailing commas, path alias `src/*`. Unit spec co-located
  (`<name>.service.spec.ts`), e2e in `test/<module>/<endpoint>.e2e-spec.ts`.
- Never run `npm run lint` (it uses `--fix`) or `npm run format` repo-wide; prettier only on files
  you created. Never start the dev server. Leave changes uncommitted unless the owner asks; one task
  = one commit message proposal `feat|fix|test|chore(<area>): P1-Txx <title>`.
- Phase 1 assumes Phase 0 is merged: global `PrismaModule` (one `PrismaService`), `z.uuid()` on ids,
  PT messages + `errorCode: 'VALIDATION_FAILED'` for Zod failures, Prisma `P2002→409`/`P2025→404`/
  `P2023→400` mapping, fixed `test/factories/user.factory.ts`, `test/.env.test` untracked. Where this
  plan says "400 VALIDATION_FAILED", a Phase-0-less tree returns a 400 with another body — assert the
  status only if Phase 0 is not merged yet, and note it in STATUS.md.
- Money: never `Number(decimal) * 100`. Only `Prisma.Decimal` (`mul`, `plus`, `div`,
  `toDecimalPlaces(2)`), centavos only via `toCentavos()` from `src/common/money.ts` (D2).
- Every status write goes through `TasksRepository.transition()` / `claimTask()` (CAS). No
  `tasks.update({ where: { id } , data: { status } })` anywhere after this phase.
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
| P1-T01 | `src/common/money.ts` — fee model D1 in `Prisma.Decimal` | — | BE-03, D1, D2 | `npx jest src/common/money.spec.ts --coverage --collectCoverageFrom=src/common/money.ts` (100 %) |
| P1-T02 | Prisma migration `phase1_money_core` (fee columns, payment bookkeeping, `payoutIssue`, partial unique active card) | — | BE-20, BE-21, BE-32, D5 | `test/schema/phase1-constraints.e2e-spec.ts` |
| P1-T03 | StripeService: SetupIntent, off-session hold/capture/cancel, idempotent refund/transfer, two webhook secrets; env; test doubles | — | BE-05, BE-06, BE-08, BE-10, BE-46 | `npx jest src/stripe/stripe.service.spec.ts` |
| P1-T04 | Repositories: `TasksRepository.transition/claimTask/releaseClaim/recordTransfer`, `PaymentsRepository` latest-by-task/by-id, `PaymentsModule` export | P1-T02 | BE-02, BE-21, BE-36 (payments part) | `test/tasks/tasks-repository.e2e-spec.ts` |
| P1-T05 | Cards via SetupIntent: `POST /card/setup-intent`, `POST /card/create { paymentMethodId }`, replace-in-transaction, detach previous | P1-T02, P1-T03 | BE-32, BE-05 (card part), D3 | `test/cards/setup-intent.e2e-spec.ts`, `test/cards/create-card.e2e-spec.ts` |
| P1-T06 | `POST /tasks/create`: strict Zod bounds, CLIENT-only, card before insert, fees persisted in one transaction, shared `taskSelect` | P1-T01, P1-T04, P1-T05 | BE-09, BE-19, BE-03, BE-39 (money path) | `test/tasks/create-task.e2e-spec.ts` |
| P1-T07 | `GET /tasks/price-preview?offeredPrice=` | P1-T01 | APP-04 (backend half), D2 | `test/tasks/price-preview.e2e-spec.ts` |
| P1-T08 | `POST /tasks/start`: hold → CAS claim → capture; `requires_action` removed | P1-T03, P1-T04, P1-T06 | BE-02, BE-03, BE-05, BE-08, CON-01, REL-03, D3 | `test/tasks/start-task.e2e-spec.ts` |
| P1-T09 | `ProofStorage` port + `LocalDiskProofStorage` + `S3ProofStorage` + `StorageModule` + env | — | BE-18, D19, D25 | `npx jest src/storage` |
| P1-T10 | Proof image pipeline: magic bytes (`file-type`), HEIC→JPEG (`heic-convert`), normalise (`sharp`) | — | BE-18, CON-11, D19 | `npx jest src/modules/tasks/utils/proof-image.spec.ts` |
| P1-T11 | `POST /tasks/finish` (proof mandatory, disputed block, CAS) + `GET /tasks/:id/proof` streams from storage | P1-T04, P1-T09, P1-T10 | BE-18, BE-02, BE-46 (dead branch), D6, D19 | `test/tasks/finish-task.e2e-spec.ts`, `test/tasks/fetch-task-proof.e2e-spec.ts` |
| P1-T12 | `POST /tasks/validate`: payment-checked, CAS first, `source_transaction` transfer, one transaction for transferId/counter/wallet | P1-T01, P1-T03, P1-T04 | BE-01, BE-06, BE-08, BE-20, D4, D6 | `test/tasks/validate-task.e2e-spec.ts` |
| P1-T13 | `POST /tasks/cancel`: CAS first, branch on latest payment, accept refund `pending`, full refund | P1-T03, P1-T04 | BE-07, BE-21, BE-02, D7 | `test/tasks/cancel-task.e2e-spec.ts` |
| P1-T14 | Webhooks I: dedupe-first dispatch, `payment_intent.succeeded` stores `chargeId`, guarded `payment_failed`, `charge.refunded` keeps `refundId` | P1-T02, P1-T03, P1-T04 | BE-23, BE-22, BE-21, BE-08, BE-10 | `test/stripe-webhook/stripe-webhook.e2e-spec.ts` |
| P1-T15 | Webhooks II: `payout.failed` → `payoutIssue`, dispute persists `disputeId`, `account.updated` guard + clears flag; dead Stripe methods removed | P1-T02, P1-T03 | BE-24, BE-25, BE-46, D5, D6 | `test/stripe-webhook/stripe-webhook.e2e-spec.ts` (new cases) |
| P1-T16 | Daily auto-release job (`@nestjs/schedule`) | P1-T12 | D18, APP-30 (backend half) | `test/tasks/auto-release.e2e-spec.ts` |
| P1-T17 | Rewrite `proxy-api/CLAUDE.md` sections (Stripe Connect, webhooks, 3DS, Database models, routes, env) | P1-T01…T16 | BE-47 (money sections) | `grep -c requires_action CLAUDE.md` → `0` |
| P1-T18 | App wire types follow the new contract (types only + one dead branch) | P1-T05, P1-T07, P1-T08 | CON-01, CON-10 (types), APP-03 (type half) | `cd ../proxy-app && npx tsc --noEmit && npx eslint .` |

Register IDs in scope but not placed: **BE-35** (`update-profile` null coercion) — no Phase 1 task
touches `update-profile`; it stays with Phase 2 (BE-14). BE-46's `PROXY_ACCOUNT_NOT_READY` on start
also stays in Phase 2 as listed in PLAN.md; P1-T08 keeps `USER_NOT_PROXY` for the un-onboarded proxy.

## Review focus

Five inputs no reviewer should accept this phase without seeing tested:

1. **Half-centavo rounding of the platform fee** — `offeredPrice = 10.03` gives `platformFee =
   2.006 → 2.01` (ROUND_HALF_UP), `chargedAmount = 12.95`, `stripeFee = 0.91`, Stripe `amount =
   1295`; the stripe-fee identity `round(charged × 0.0399 + 0.39, 2) === stripeFee` must hold.
   Owned by P1-T01 (`money.spec.ts` table) and P1-T08 (`amount: 1295`).
2. **Same proxy double-taps "Aceitar"** — both requests get the *same* PaymentIntent (same
   idempotency key); the CAS loser must **not** cancel the hold the winner is about to capture.
   Owned by P1-T08 ("same proxy, two concurrent starts" case: one capture, zero cancels).
3. **`payment_intent.succeeded` arrives before the capture response** — the webhook writes
   `succeeded + chargeId` first; `start` then writes the same values; no second row, no overwrite
   with `null`. Owned by P1-T14 (idempotent succeeded handler) and P1-T08 (chargeId from capture).
4. **Legacy `succeeded` payment with `chargeId = null`** (rows created before this phase) — validate
   must refuse with `PAYMENT_NOT_CONFIRMED` rather than call `transfers.create` without
   `source_transaction`. Owned by P1-T12.
5. **Auto-release meets a disputed or unconfirmed payment** — the job must skip the task (validate
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
  export const MIN_OFFERED_PRICE = 10
  export const MAX_OFFERED_PRICE = 10_000
  export type ChargeBreakdown = {
    offeredPrice: Prisma.Decimal; platformFee: Prisma.Decimal; stripeFee: Prisma.Decimal
    chargedAmount: Prisma.Decimal; proxyEarnings: Prisma.Decimal
  }
  export function computeCharge(offeredPrice: Prisma.Decimal | number | string): ChargeBreakdown
  export function toCentavos(value: Prisma.Decimal): number
  export function breakdownToNumbers(b: ChargeBreakdown): { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }
  ```
- Algorithm (fixed by D1; the only place these constants appear):
  ```ts
  const price = new Prisma.Decimal(offeredPrice)
  const platformFee = price.mul(PLATFORM_FEE_RATE).toDecimalPlaces(2)
  const chargedAmount = price.plus(platformFee).plus(STRIPE_FEE_FIXED)
    .div(new Prisma.Decimal(1).minus(STRIPE_FEE_RATE))      // ÷ 0.9601
    .toDecimalPlaces(2)
  const stripeFee = chargedAmount.minus(price).minus(platformFee)
  const proxyEarnings = price
  // toCentavos: value.mul(100).toDecimalPlaces(0).toNumber()
  ```

- [ ] **Step 1: Write the failing test** `src/common/money.spec.ts`:
  ```ts
  describe('computeCharge', () => {
    it.each([
      // price,      platformFee, stripeFee, chargedAmount, centavos
      ['100',        '20.00',     '5.39',    '125.39',      12539],
      ['10.03',      '2.01',      '0.91',    '12.95',       1295],
      ['19.99',      '4.00',      '1.40',    '25.39',       2539],
      ['10',         '2.00',      '0.90',    '12.90',       1290],
      ['10000',      '2000.00',   '499.10',  '12499.10',    1249910],
      ['49.90',      '9.98',      '2.89',    '62.77',       6277],
    ])('price %s', (price, platformFee, stripeFee, chargedAmount, centavos) => {
      const b = computeCharge(price)
      expect(b.platformFee.toFixed(2)).toBe(platformFee)
      expect(b.stripeFee.toFixed(2)).toBe(stripeFee)
      expect(b.chargedAmount.toFixed(2)).toBe(chargedAmount)
      expect(b.proxyEarnings.toFixed(2)).toBe(new Prisma.Decimal(price).toFixed(2))
      expect(toCentavos(b.chargedAmount)).toBe(centavos)
      // stripe identity: 3.99 % of the charged total + R$ 0,39
      expect(b.chargedAmount.mul('0.0399').plus('0.39').toDecimalPlaces(2).toFixed(2)).toBe(stripeFee)
      // the three parts sum exactly to the charged amount
      expect(b.offeredPrice.plus(b.platformFee).plus(b.stripeFee).toFixed(2)).toBe(chargedAmount)
    })
    it('accepts Decimal and number inputs', () => {
      expect(computeCharge(new Prisma.Decimal('100')).chargedAmount.toFixed(2)).toBe('125.39')
      expect(computeCharge(100).chargedAmount.toFixed(2)).toBe('125.39')
    })
  })
  describe('toCentavos', () => {
    it('never produces a float artefact', () => {
      expect(toCentavos(new Prisma.Decimal('10.03'))).toBe(1003)   // 10.03 * 100 === 1002.9999999999999 in JS
      expect(Number.isInteger(toCentavos(new Prisma.Decimal('0.29')))).toBe(true)
    })
  })
  describe('breakdownToNumbers', () => {
    it('returns plain numbers for the HTTP layer', () => {
      expect(breakdownToNumbers(computeCharge('100'))).toEqual({
        offeredPrice: 100, platformFee: 20, stripeFee: 5.39, chargedAmount: 125.39, proxyEarnings: 100,
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
  --collectCoverageFrom=src/common/money.ts` → `Tests: 9 passed`, `money.ts | 100 | 100 | 100 | 100`.
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
  -- backfill fee columns for existing tasks with the D1 model (only where missing)
  UPDATE "tasks" SET "platformFee" = ROUND("offeredPrice" * 0.20, 2) WHERE "platformFee" IS NULL;
  UPDATE "tasks" SET "proxyEarnings" = "offeredPrice" WHERE "proxyEarnings" IS NULL;
  UPDATE "tasks" SET "chargedAmount" = ROUND(("offeredPrice" + "platformFee" + 0.39) / 0.9601, 2) WHERE "chargedAmount" IS NULL;
  UPDATE "tasks" SET "stripeFee" = "chargedAmount" - "offeredPrice" - "platformFee" WHERE "stripeFee" IS NULL;
  ```
  Completed tasks that already have `proxyEarnings` (old model, e.g. 75.62) are left untouched.

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
    await ctx.prisma.payments.create({ data: { taskId: task.id, paymentIntent: 'pi_dup', amount: 125.39 } })
    await expect(ctx.prisma.payments.create({ data: { taskId: task.id, paymentIntent: 'pi_dup', amount: 125.39 } }))
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

### Task P1-T03: StripeService — SetupIntent, off-session hold/capture, idempotent refund/transfer, two webhook secrets, test doubles

**Files:**
- Modify: `src/env/env.ts:11-13` (`STRIPE_PUBLIC_KEY` → `.optional()`, add
  `STRIPE_CONNECT_WEBHOOK_SECRET: z.string().optional()`), `.env.example` (add
  `STRIPE_CONNECT_WEBHOOK_SECRET=` with a comment "secret of the Dashboard endpoint registered for
  *Connected accounts*; optional locally where `stripe listen` delivers both families").
- Modify: `src/stripe/stripe.module.ts:13-25` (third provider `'STRIPE_CONNECT_WEBHOOK_SECRET'` →
  `env.get('STRIPE_CONNECT_WEBHOOK_SECRET') ?? null`).
- Modify: `src/stripe/stripe.service.ts:14-31` (constructor + `constructWebhookEvent`), `:63-101`
  (add new methods; keep the legacy ones listed below until their last caller is migrated).
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
    // paymentIntents.create({ amount, currency: 'brl', customer, payment_method: paymentMethod,
    //   payment_method_types: ['card'], confirm: true, off_session: true, capture_method: 'manual',
    //   transfer_group: taskId, metadata: { taskId } }, { idempotencyKey })
  capturePaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent>   // paymentIntents.capture(id)
  cancelPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent>    // paymentIntents.cancel(id)
  refundPaymentIntent(paymentIntentId: string, idempotencyKey: string): Promise<Stripe.Refund>
    // refunds.create({ payment_intent }, { idempotencyKey })
  createTransferFromCharge(data: CreateTransferData, idempotencyKey: string): Promise<Stripe.Transfer>
    // transfers.create({ amount, currency: 'brl', destination, source_transaction: sourceTransaction,
    //   transfer_group: transferGroup, metadata: { taskId } }, { idempotencyKey })
  ```
  `src/stripe/types/index.d.ts`:
  ```ts
  export type ChargeSavedCardData = { amount: number; customer: string; paymentMethod: string; taskId: string }
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
  chargeSavedCard: { id: 'pi_test_123', status: 'requires_capture', latest_charge: null }
  capturePaymentIntent: { id: 'pi_test_123', status: 'succeeded', latest_charge: 'ch_test_123' }
  cancelPaymentIntent: { id: 'pi_test_123', status: 'canceled' }
  refundPaymentIntent: { id: 're_test_123', status: 'succeeded' }
  createTransferFromCharge: { id: 'tr_test_123' }
  detachPaymentMethod: { id: 'pm_test_123' }     // unchanged
  ```
  (keep the legacy mocks until their methods are deleted.)
- Produces (`test/factories/task.factory.ts`): `CreateTaskOverrides` gains `proxyEarnings?`,
  `platformFee?`, `stripeFee?`, `chargedAmount?` (numbers), `proofImageUrl?: string | null`,
  `transferId?: string | null`, `payout_failed` in the status union; defaults for the four fee fields
  come from `computeCharge(overrides.offeredPrice ?? 50)` (`breakdownToNumbers`) so seeded tasks look
  like created ones (for 50: platformFee 10, stripeFee 2.90, chargedAmount 62.90).
- Produces (`test/factories/payment.factory.ts`):
  ```ts
  export const createPayment = (prisma: PrismaService, taskId: string, overrides: {
    paymentIntent?: string; status?: 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed'
    amount?: number; chargeId?: string | null; refundId?: string | null; disputeId?: string | null; createdAt?: Date
  } = {}) => prisma.payments.create({ data: {
    taskId, paymentIntent: overrides.paymentIntent ?? 'pi_test_123', status: overrides.status ?? 'pending',
    amount: overrides.amount ?? 125.39,
    chargeId: overrides.chargeId === undefined ? (overrides.status === 'succeeded' ? 'ch_test_123' : null) : overrides.chargeId,
    refundId: overrides.refundId ?? null, disputeId: overrides.disputeId ?? null,
    ...(overrides.createdAt && { createdAt: overrides.createdAt }),
  } })
  ```

- [ ] **Step 1: Write the failing test** `src/stripe/stripe.service.spec.ts` (construct the service
  directly with `'sk_test_x'`; replace the SDK resources with `jest.fn()` through
  `(service as any).stripe = { webhooks: { constructEvent }, paymentIntents: { create, capture, cancel }, setupIntents: { create }, refunds: { create }, transfers: { create } }`):
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
  it('creates an off-session manual-capture PaymentIntent with the idempotency key', async () => {
    await service.chargeSavedCard({ amount: 12539, customer: 'cus_1', paymentMethod: 'pm_1', taskId: 't1' }, 'task:t1:pi:p1:1')
    expect(create).toHaveBeenCalledWith({
      amount: 12539, currency: 'brl', customer: 'cus_1', payment_method: 'pm_1', payment_method_types: ['card'],
      confirm: true, off_session: true, capture_method: 'manual', transfer_group: 't1', metadata: { taskId: 't1' },
    }, { idempotencyKey: 'task:t1:pi:p1:1' })
  })
  it('creates a SetupIntent for off-session usage', async () => {
    await service.createSetupIntent('cus_1')
    expect(setupIntentsCreate).toHaveBeenCalledWith({ customer: 'cus_1', usage: 'off_session', payment_method_types: ['card'] })
  })
  it('creates transfers from the charge with group and idempotency key', async () => {
    await service.createTransferFromCharge({ amount: 10000, destination: 'acct_1', sourceTransaction: 'ch_1', transferGroup: 't1', taskId: 't1' }, 'task:t1:transfer')
    expect(transfersCreate).toHaveBeenCalledWith({ amount: 10000, currency: 'brl', destination: 'acct_1', source_transaction: 'ch_1', transfer_group: 't1', metadata: { taskId: 't1' } }, { idempotencyKey: 'task:t1:transfer' })
  })
  it('refunds by PaymentIntent with the idempotency key', async () => {
    await service.refundPaymentIntent('pi_1', 'task:t1:refund')
    expect(refundsCreate).toHaveBeenCalledWith({ payment_intent: 'pi_1' }, { idempotencyKey: 'task:t1:refund' })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/stripe/stripe.service.spec.ts` → TS error
  `Expected 2 arguments, but got 3` / `Property 'chargeSavedCard' does not exist`.
- [ ] **Step 3: Implement** the constructor, `constructWebhookEvent` fallback and the six new methods
  in `src/stripe/stripe.service.ts`; the module provider and env changes; the mock, the two factories
  and the `global-setup` env line. `createStripeServiceMock` must list every public method of the
  service (old and new) or `overrideProvider` leaves `undefined` functions.
- [ ] **Step 4: Run it, expect pass** — `Tests: 7 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e` (nothing
  functional changed for existing routes; factories keep their defaults).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(stripe): P1-T03 setup intents, off-session hold, idempotent transfers, connect secret`

---

### Task P1-T04: Repositories — CAS transitions, atomic claim, payment bookkeeping

**Files:**
- Modify: `src/modules/tasks/repository/tasks.repository.ts:92-103` (keep `updateTaskStatus` until
  P1-T13 deletes it), add the methods below; `src/modules/tasks/dtos/tasks-repository.dto.ts:13-29`;
  `src/modules/tasks/types/index.d.ts` (new types).
- Modify: `src/modules/payments/repository/payments.repository.ts:12-28`,
  `src/modules/payments/dtos/payments-repository.dto.ts:3-6`,
  `src/modules/payments/types/index.d.ts:10-25` (`PaymentRecord` gains `chargeId: string | null;
  disputeId: string | null`; add `UpdatePaymentData`).
- Modify: `src/modules/payments/payments.module.ts:9-19` → `exports: [PaymentsRepository]`, drop
  `StripeModule`/`EnvService`/`CreatePaymentRecordService` (keep `PrismaService` only if Phase 0's
  global module is not merged).
- Modify: `src/modules/tasks/tasks.module.ts:42-73` → `imports` gains `PaymentsModule`; remove
  `PaymentsRepository` from `providers`.
- Modify: `src/modules/tasks/use-cases/fetch-task-by-id.service.ts:44`
  (`fetchPaymentRecord(taskId)` → `fetchLatestByTaskId(taskId)`) and its spec's mock key.
- Create: `test/tasks/tasks-repository.e2e-spec.ts`

**Interfaces:**
- Produces (`TasksRepository`):
  ```ts
  export type TransitionTaskData = {
    taskId: string; from: TaskStatus[]; to: TaskStatus
    data?: { startedAt?: Date | null; completedAt?: Date | null; canceledAt?: Date | null; proofImageUrl?: string | null; transferId?: string | null }
  }
  transition(data: TransitionTaskData): Promise<boolean>
    // prisma.tasks.updateMany({ where: { id, status: { in: from } }, data: { status: to, ...data } }) → count === 1

  export type ClaimTaskData = { taskId: string; executorId: string; startedAt: Date; payment: { paymentIntent: string; amount: Prisma.Decimal } }
  claimTask(data: ClaimTaskData): Promise<{ paymentId: string } | null>
    // interactive $transaction: updateMany available→in_progress (+startedAt); count !== 1 → return null (nothing else written);
    // userTaskMapping.create; payments.create({ status: 'pending', amount, paymentIntent }) → { paymentId }

  export type ReleaseClaimData = { taskId: string; executorId: string; paymentId: string }
  releaseClaim(data: ReleaseClaimData): Promise<void>
    // $transaction([ tasks.updateMany({ where: { id, status: 'in_progress' }, data: { status: 'available', startedAt: null } }),
    //                userTaskMapping.deleteMany({ where: { taskId, executorId } }),
    //                payments.update({ where: { id: paymentId }, data: { status: 'failed' } }) ])

  export type RecordTransferData = { taskId: string; executorId: string; transferId: string; proxyEarnings: Prisma.Decimal }
  recordTransfer(data: RecordTransferData): Promise<void>
    // $transaction([ tasks.update({ where: { id }, data: { transferId } }),
    //                users.update({ where: { id: executorId }, data: { totalTasksCompleted: { increment: 1 }, walletBalance: { increment: proxyEarnings } } }) ])
  ```
- Produces (`PaymentsRepository`):
  ```ts
  export type UpdatePaymentData = { status?: PaymentStatus; refundId?: string | null; chargeId?: string | null; disputeId?: string | null }
  fetchLatestByTaskId(taskId: string): Promise<PaymentRecord | null>   // findFirst({ where: { taskId }, orderBy: { createdAt: 'desc' } })
  findByPaymentIntent(paymentIntent: string): Promise<PaymentRecord | null>   // findUnique
  countByTaskId(taskId: string): Promise<number>
  updateById(id: string, data: UpdatePaymentData): Promise<void>   // payments.update({ where: { id }, data })
  ```
  Legacy `createPaymentRecord`/`fetchPaymentRecord`/`updatePaymentRecord` and the three pass-through
  services in `payments/use-cases/` stay until P1-T08 (create) and P1-T13 (fetch/update) delete them.

- [ ] **Step 1: Write the failing test** `test/tasks/tasks-repository.e2e-spec.ts` — obtain repos with
  `ctx.app.get(TasksRepository)` / `ctx.app.get(PaymentsRepository)`; helper
  `claimFor = (taskId, executorId = proxy.id) => ({ taskId, executorId, startedAt: new Date() })`:
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
  it('claimTask claims an available task atomically', async () => {
    const task = await createTask(ctx.prisma, owner.id)
    const result = await repo.claimTask({ taskId: task.id, executorId: proxy.id, startedAt: new Date(), payment: { paymentIntent: 'pi_claim', amount: new Prisma.Decimal('125.39') } })
    expect(result).toEqual({ paymentId: expect.any(String) })
    expect((await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: task.id } })).status).toBe('in_progress')
    expect((await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: task.id } }))?.executorId).toBe(proxy.id)
    expect((await ctx.prisma.payments.findUnique({ where: { paymentIntent: 'pi_claim' } }))?.status).toBe('pending')
  })
  it('claimTask returns null and writes nothing when the task is not available', async () => {
    const task = await createTask(ctx.prisma, owner.id, { status: 'in_progress', startedAt: new Date() })
    await expect(repo.claimTask({ ...claimFor(task.id), payment: { paymentIntent: 'pi_lost', amount: new Prisma.Decimal('125.39') } })).resolves.toBeNull()
    expect(await ctx.prisma.userTaskMapping.findUnique({ where: { taskId: task.id } })).toBeNull()
    expect(await ctx.prisma.payments.count({ where: { taskId: task.id } })).toBe(0)
  })
  it('exactly one of two concurrent claims wins', async () => {
    const task = await createTask(ctx.prisma, owner.id)
    const [a, b] = await Promise.all([
      repo.claimTask({ ...claimFor(task.id, proxy.id), payment: { paymentIntent: 'pi_a', amount: new Prisma.Decimal('62.90') } }),
      repo.claimTask({ ...claimFor(task.id, proxy2.id), payment: { paymentIntent: 'pi_b', amount: new Prisma.Decimal('62.90') } }),
    ])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(await ctx.prisma.payments.count({ where: { taskId: task.id } })).toBe(1)
  })
  it('releaseClaim reverts task, mapping and payment', async () => { /* claim then release → available, startedAt null, mapping null, payment failed */ })
  it('recordTransfer increments counters and wallet atomically', async () => {
    await repo.recordTransfer({ taskId: task.id, executorId: proxy.id, transferId: 'tr_1', proxyEarnings: new Prisma.Decimal('100') })
    await repo.recordTransfer({ taskId: task2.id, executorId: proxy.id, transferId: 'tr_2', proxyEarnings: new Prisma.Decimal('50') })
    const u = await ctx.prisma.users.findUniqueOrThrow({ where: { id: proxy.id } })
    expect(u.totalTasksCompleted).toBe(2); expect(u.walletBalance.toFixed(2)).toBe('150.00')
  })
  it('fetchLatestByTaskId returns the newest payment', async () => {
    await createPayment(ctx.prisma, task.id, { paymentIntent: 'pi_old', status: 'failed', createdAt: new Date(Date.now() - 3_600_000) })
    await createPayment(ctx.prisma, task.id, { paymentIntent: 'pi_new', status: 'succeeded' })
    expect((await payments.fetchLatestByTaskId(task.id))?.paymentIntent).toBe('pi_new')
    expect(await payments.countByTaskId(task.id)).toBe(2)
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest --config test/jest-e2e.config.ts --runInBand
  test/tasks/tasks-repository.e2e-spec.ts` → `repo.transition is not a function`.
- [ ] **Step 3: Implement** the methods above in both repositories (+ DTO interfaces + types), the
  module wiring (`PaymentsModule` exports, `TasksModule` imports it), and the one-line change in
  `fetch-task-by-id.service.ts`. `claimTask` uses `this.prisma.$transaction(async (tx) => { ... })`;
  return `null` *without throwing* when the CAS count is 0 (an early `return null` inside the
  callback commits an empty transaction, which is fine).
- [ ] **Step 4: Run it, expect pass** — `Tests: 8 passed`.
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
  ```
- [ ] **Step 2: Run them, expect failure** — setup-intent: `404 Cannot POST /card/setup-intent`;
  create-card: the legacy body is still accepted (201).
- [ ] **Step 3: Implement** controller + service + repository method + dictionary + module wiring;
  rename the service; delete `attachPaymentMethodToCustomer` from `StripeService` and the mock.
  Rewrite `save-card.service.spec.ts` to the new flow (customer mismatch → `CARD_NOT_CONFIRMED`;
  P2002 from `replaceUserCard` → `CARD_ALREADY_EXISTS`; detach called with previous id only).
- [ ] **Step 4: Run them, expect pass** — both specs green (`Tests: 3 passed`, `Tests: 6 passed`).
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
    // 3. fees = computeCharge(offeredPrice); tasksRepository.createTask({ ...fees, ... })
  ```
  Dictionary: `user.notClient = { message: 'Apenas clientes podem criar tarefas.', statusCode: 403, errorCode: 'USER_NOT_CLIENT' }`.
  Response of `GET /tasks/:id`, `/tasks/active`, `/tasks/fetch` now carries `stripeFee` and
  `chargedAmount` (Decimal → JSON string, like `offeredPrice`). App type follows in P1-T18; the
  screens render them in Phase 3 (P3 task "Money copy from backend numbers").

- [ ] **Step 1: Write the failing test** — rewrite `test/tasks/create-task.e2e-spec.ts`; the shared
  payload now has `cardDetails: { savedCard: 'pm_owner' }` and each test seeds the card
  (`ctx.prisma.cards.create({ data: { userId, stripeCardId: 'pm_owner', brand: 'visa', last4: '4242' } })`):
  ```ts
  it.each([0, 9.99, 10.005, 10000.01])('rejects offeredPrice %p', async (offeredPrice) => { → 400; tasks.count === 0 })
  it('rejects cardDetails {} and both keys at once', async () => { {} → 400; { savedCard: 'a', paymentMethodId: 'b' } → 400 })
  it('rejects a PROXY with 403 USER_NOT_CLIENT and writes nothing', async () => { createUser({ userType: 'PROXY' }) → 403; tasks.count 0; totalTasksCreated 0 })
  it('rejects a savedCard that is not the active card and writes nothing', async () => { send savedCard 'pm_other' → 404 NO_SAVED_CARD_FOUND; tasks.count 0; totalTasksCreated 0 })
  it('creates the task with the D1 fee breakdown persisted', async () => {
    → 201 { id }
    const t = await ctx.prisma.tasks.findUniqueOrThrow({ where: { id: res.body.id } })
    expect(t.offeredPrice.toFixed(2)).toBe('100.00'); expect(t.platformFee?.toFixed(2)).toBe('20.00')
    expect(t.stripeFee?.toFixed(2)).toBe('5.39'); expect(t.chargedAmount?.toFixed(2)).toBe('125.39'); expect(t.proxyEarnings?.toFixed(2)).toBe('100.00')
    expect(t.status).toBe('available'); totalTasksCreated === 1
  })
  it('rounds half-centavo platform fees up (10.03)', async () => { platformFee '2.01', stripeFee '0.91', chargedAmount '12.95' })
  it('saves a new card from a confirmed paymentMethodId and creates the task', async () => {
    send cardDetails { paymentMethodId: 'pm_test_123' } → 201; cards active for user = 1 with stripeCardId 'pm_test_123'
  })
  it('increments totalTasksCreated per call (3 calls → 3)', ... keep)
  ```
  `fetch-task-by-id.e2e-spec.ts`: in the happy case add
  `expect(Number(response.body.chargedAmount)).toBe(62.9); expect(Number(response.body.stripeFee)).toBe(2.9); expect(Number(response.body.platformFee)).toBe(10); expect(Number(response.body.proxyEarnings)).toBe(50)`
  (task factory default price 50; Prisma serialises `Decimal` as a string without trailing zeros,
  e.g. `'62.9'`, so compare numerically).
- [ ] **Step 2: Run it, expect failure** — `0` and `9.99` are accepted (201).
- [ ] **Step 3: Implement** schema, service, repository (`createTask`, `taskSelect`), types,
  dictionary, deletions. Rewrite `create-task.service.spec.ts`: asserts call order (`fetchUserDetails`
  → card → `createTask`), `createTask` receives `platformFee.toFixed(2) === '20.00'` etc., PROXY →
  `USER_NOT_CLIENT` without `createTask`.
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
  PricePreviewService.execute(offeredPrice: number): PricePreview   // breakdownToNumbers(computeCharge(offeredPrice))
  ```
  Consumed by Phase 3 (`useChargePreview(price)` in P3 task "Money copy from backend numbers");
  app type `TPricePreview` added in P1-T18.

- [ ] **Step 1: Write the failing test** `test/tasks/price-preview.e2e-spec.ts`:
  ```ts
  it('rejects unauthenticated requests', ... get('/tasks/price-preview?offeredPrice=100') → 401)
  it('returns the D1 breakdown as numbers for R$ 100,00', async () => {
    → 200; expect(res.body).toEqual({ offeredPrice: 100, platformFee: 20, stripeFee: 5.39, chargedAmount: 125.39, proxyEarnings: 100 })
  })
  it('rounds the platform fee half-up (10.03)', ... → { offeredPrice: 10.03, platformFee: 2.01, stripeFee: 0.91, chargedAmount: 12.95, proxyEarnings: 10.03 })
  it.each(['9.99', '10000.01', 'abc', ''])('rejects offeredPrice=%s', ... → 400)
  it('is not shadowed by GET /tasks/:id', ... → status 200, not 404 TASK_NOT_FOUND)
  ```
- [ ] **Step 2: Run it, expect failure** — `GET /tasks/price-preview?offeredPrice=100` → 404
  `TASK_NOT_FOUND` (caught by `:id`).
- [ ] **Step 3: Implement** controller, service (unit spec: `execute(100)` equals the object above),
  module registration order.
- [ ] **Step 4: Run it, expect pass** — `Tests: 8 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P1-T07 GET /tasks/price-preview`

---

### Task P1-T08: `POST /tasks/start` — hold → CAS claim → capture

**Files:**
- Modify: `src/modules/tasks/use-cases/start-task.service.ts:13-100` (full rewrite) + spec rewrite
- Modify: `src/modules/tasks/types/index.d.ts:114-116` → `export type StartTaskResult = { status: 'succeeded' }`
- Modify: `src/exception/error-dictionary.ts:163-167` message of `payment.paymentFailed`
- Delete: `StripeService.createPaymentIntent`, `confirmPaymentIntent` (`stripe.service.ts:63-82`) +
  mock entries; `PaymentsRepository.createPaymentRecord` + `CreatePaymentRecordService` (+ spec) +
  provider in `tasks.module.ts:34,69`.
- Modify: `test/tasks/start-task.e2e-spec.ts:96-185`

**Interfaces:**
- Consumes: `chargeSavedCard`, `capturePaymentIntent`, `cancelPaymentIntent` (P1-T03);
  `TasksRepository.claimTask/releaseClaim`, `PaymentsRepository.countByTaskId/findByPaymentIntent/updateById`
  (P1-T04); `FetchUserCardService.execute`, `FetchUserDetailsService.execute`; `computeCharge`,
  `toCentavos`.
- Produces: `StartTaskService(stripeService, tasksRepository, paymentsRepository, fetchUserCardService, fetchUserDetailsService)`;
  `execute({ taskId, userId }): Promise<{ status: 'succeeded' }>` with this fixed order:
  ```
  1. task = fetchTaskById({ taskId, status: 'available' })            → 404 TASK_NOT_FOUND
  2. task.owner === userId                                           → 403 CANNOT_START_OWN_TASK
  3. user = fetchUserDetails(userId); not PROXY or !stripeAccountReady → 403 USER_NOT_PROXY  (Phase 2 BE-46 splits this)
  4. card = fetchUserCard(task.owner)                                 → 404 NO_SAVED_CARD_FOUND (nothing written)
     customer = task.ownerId.stripeCustomerId ?? throw 402 PAYMENT_FAILED
  5. charged = task.chargedAmount ?? computeCharge(task.offeredPrice).chargedAmount
     attempt = (await paymentsRepository.countByTaskId(taskId)) + 1
     key = `task:${taskId}:pi:${userId}:${attempt}`
     pi = chargeSavedCard({ amount: toCentavos(charged), customer, paymentMethod: card.stripeCardId, taskId }, key)
        catch (err): if (err?.payment_intent?.id) cancelPaymentIntent(id) (ignore errors) → 402 PAYMENT_FAILED
     pi.status !== 'requires_capture' → cancelPaymentIntent(pi.id) → 402 PAYMENT_FAILED
  6. claim = claimTask({ taskId, executorId: userId, startedAt: new Date(), payment: { paymentIntent: pi.id, amount: charged } })
     claim === null → if (!(await findByPaymentIntent(pi.id))) cancelPaymentIntent(pi.id)   // same-proxy double tap shares the PI; never cancel the winner's
                   → 400 TASK_NOT_AVAILABLE
  7. captured = capturePaymentIntent(pi.id)
     throw or captured.status !== 'succeeded' → releaseClaim({ taskId, executorId: userId, paymentId }); cancelPaymentIntent(pi.id) (ignore errors) → 402 PAYMENT_FAILED
  8. updateById(paymentId, { status: 'succeeded', chargeId: typeof captured.latest_charge === 'string' ? captured.latest_charge : captured.latest_charge?.id ?? null })
  9. return { status: 'succeeded' }
  ```
  Dictionary: `payment.paymentFailed.message = 'O pagamento do cliente foi recusado. A tarefa continua disponível.'`
  (402 `PAYMENT_FAILED` kept). `Payments.amount` now stores `chargedAmount` (what the client paid),
  not `offeredPrice`. Contract change: `requires_action` shape removed — app type in P1-T18, UI in
  Phase 3 (P3 task "Payment status banner / requires_action removed").
  Note on D3: the decision text says "any status other than `succeeded` is a hard failure"; with
  `capture_method: 'manual'` the accepted status after confirm is `requires_capture` and after
  capture `succeeded` — the hold lets the CAS loser release money instead of refunding a captured
  charge (PLAN.md's "cancel PI" is only possible on an uncaptured intent).

- [ ] **Step 1: Write the failing test** — replace `start-task.e2e-spec.ts:96-185` (keep 24-94;
  helper `seed()` creates owner with card `pm_owner`, ready proxy, task `offeredPrice: 100`):
  ```ts
  it('returns 404 NO_SAVED_CARD_FOUND and writes nothing when the owner has no card', async () => {
    → 404; task.status 'available', startedAt null; mapping null; payments.count 0; chargeSavedCard not called
  })
  it('holds, claims, captures and records the payment', async () => {
    → 200 toEqual({ status: 'succeeded' })
    expect(ctx.stripeMock.chargeSavedCard).toHaveBeenCalledWith(
      { amount: 12539, customer: owner.stripeCustomerId, paymentMethod: 'pm_owner', taskId: task.id },
      `task:${task.id}:pi:${proxy.id}:1`)
    expect(ctx.stripeMock.capturePaymentIntent).toHaveBeenCalledWith('pi_test_123')
    task → status 'in_progress', startedAt not null; mapping.executorId === proxy.id
    payment = payments.findUnique({ where: { paymentIntent: 'pi_test_123' } }) → status 'succeeded', chargeId 'ch_test_123', amount.toFixed(2) '125.39'
  })
  it('sends integer centavos for prices with float artefacts (10.03 → 1295)', ... offeredPrice 10.03 → amount 1295)
  it('returns 402 and cancels the intent when the card is declined', async () => {
    ctx.stripeMock.chargeSavedCard.mockRejectedValueOnce(Object.assign(new Error('Your card was declined.'), { payment_intent: { id: 'pi_declined' } }))
    → 402; body.errorCode 'PAYMENT_FAILED'; body.message 'O pagamento do cliente foi recusado. A tarefa continua disponível.'
    task 'available'; mapping null; payments.count 0; cancelPaymentIntent called with 'pi_declined'; capture not called
  })
  it('treats requires_action as a hard failure (no 3DS on the proxy device)', async () => {
    ctx.stripeMock.chargeSavedCard.mockResolvedValueOnce({ id: 'pi_3ds', status: 'requires_action', client_secret: 'x' } as any)
    → 402 PAYMENT_FAILED; cancelPaymentIntent('pi_3ds'); task 'available'; payments.count 0; body has no clientSecret
  })
  it('reverts the claim when capture fails', async () => {
    ctx.stripeMock.capturePaymentIntent.mockRejectedValueOnce(new Error('network'))
    → 402; task 'available', startedAt null; mapping null; payment row exists with status 'failed'; cancelPaymentIntent('pi_test_123')
  })
  it('lets exactly one of two different proxies win and releases the other hold', async () => {
    ctx.stripeMock.chargeSavedCard.mockResolvedValueOnce({ id: 'pi_a', status: 'requires_capture' } as any).mockResolvedValueOnce({ id: 'pi_b', status: 'requires_capture' } as any)
    ctx.stripeMock.capturePaymentIntent.mockImplementation(async (id) => ({ id, status: 'succeeded', latest_charge: `ch_${id}` }) as any)
    const [a, b] = await Promise.all([start(proxy1), start(proxy2)])
    expect([a.status, b.status].sort()).toEqual([200, 400]); loser.body.errorCode 'TASK_NOT_AVAILABLE'
    expect(ctx.stripeMock.capturePaymentIntent).toHaveBeenCalledTimes(1)
    expect(ctx.stripeMock.cancelPaymentIntent).toHaveBeenCalledTimes(1)
    const captured = ctx.stripeMock.capturePaymentIntent.mock.calls[0][0]; const canceled = ctx.stripeMock.cancelPaymentIntent.mock.calls[0][0]
    expect(new Set([captured, canceled])).toEqual(new Set(['pi_a', 'pi_b']))
    payments.count 1, status 'succeeded'
  })
  it('same proxy double-tap shares the intent and never cancels the winner', async () => {
    // default mock returns pi_test_123 for both calls (same idempotency key would in Stripe too)
    const [a, b] = await Promise.all([start(proxy), start(proxy)])
    expect([a.status, b.status].sort()).toEqual([200, 400])
    expect(ctx.stripeMock.cancelPaymentIntent).not.toHaveBeenCalled()
    expect(ctx.stripeMock.capturePaymentIntent).toHaveBeenCalledTimes(1)
    payments.count 1 with status 'succeeded'
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `chargeSavedCard` never called (service still calls
  `createPaymentIntent`); `requires_action` case returns 200.
- [ ] **Step 3: Implement** the service per the fixed order; delete the legacy Stripe methods and
  the payments pass-through; rewrite `start-task.service.spec.ts` with invocation-order assertions
  (`chargeSavedCard.mock.invocationCallOrder[0] < claimTask.mock.invocationCallOrder[0]`,
  `claimTask` not called when the card lookup throws, `releaseClaim` called when capture throws).
- [ ] **Step 4: Run it, expect pass** — `Tests: 13 passed` (5 kept + 8 new).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T08 start charges before claiming, no requires_action`

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
  Dictionary: `payment.notConfirmed = { message: 'O pagamento desta tarefa ainda não foi confirmado. Tente novamente em alguns minutos.', statusCode: 409, errorCode: 'PAYMENT_NOT_CONFIRMED' }`.
  `Users.walletBalance` now means "total recebido" (D8): incremented by `proxyEarnings` only here.

- [ ] **Step 1: Write the failing test** — rewrite `validate-task.e2e-spec.ts` seeding
  (`seedTaskPendingValidation(offeredPrice = 100, { stripeAccountReady?, stripeAccountId?, payment? })`
  creates the payment with `createPayment(task.id, payment ?? { status: 'succeeded', chargeId: 'ch_test_1' })`):
  ```ts
  it('completes the task, transfers the offered price from the charge and credits the proxy', async () => {
    → 200; task.status 'completed', transferId 'tr_test_123'
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(
      { amount: 10000, destination: 'acct_proxy_test', sourceTransaction: 'ch_test_1', transferGroup: task.id, taskId: task.id }, `task:${task.id}:transfer`)
    proxy.totalTasksCompleted 1; proxy.walletBalance.toFixed(2) '100.00'; task.platformFee?.toFixed(2) '20.00'; task.proxyEarnings?.toFixed(2) '100.00'
  })
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
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledTimes(1); totalTasksCompleted 1; wallet '100.00'
  })
  it('increments the wallet atomically across concurrent validations of two tasks', async () => {
    // two tasks (100 and 50) for the same proxy, two owners → Promise.all → wallet '150.00', totalTasksCompleted 2
  })
  it('keeps the existing behaviour for PROXY_ACCOUNT_NOT_READY, rating recorded, rating out of range', ... keep lines 129-190 adjusted to createTransferFromCharge)
  ```
- [ ] **Step 2: Run it, expect failure** — `createTransferFromCharge` not called (service still calls
  `createTransfer` with `7562`); pending payment case returns 200.
- [ ] **Step 3: Implement** the service; deletions; rewrite `validate-task.service.spec.ts`
  (`transition` called before `createTransferFromCharge`; revert `transition` called with
  `from: ['completed']` when the transfer rejects; `PAYMENT_NOT_CONFIRMED` with `pending`;
  `recordTransfer` receives `proxyEarnings` as `Prisma.Decimal` equal to `'100'`).
- [ ] **Step 4: Run it, expect pass** — `Tests: 15 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`
  (`transaction-history.e2e-spec.ts` still asserts the recomputed `75.62` from its own fixture — it
  is Phase 2 BE-40; it must still pass because it seeds `proxyEarnings` itself).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T12 validate requires a confirmed charge, CAS-first transfer`

---

### Task P1-T13: `POST /tasks/cancel` — CAS first, branch on latest payment

**Files:**
- Modify: `src/modules/tasks/use-cases/cancel-task.service.ts:13-82` (rewrite) + spec rewrite
- Delete: `TasksRepository.updateTaskStatus` (`tasks.repository.ts:92-103`, DTO `:17`,
  `UpdateTaskStatusData` `types/index.d.ts:48-55`); `StripeService.refundPayment`
  (`stripe.service.ts:84-88`) + mock; `PaymentsRepository.fetchPaymentRecord/updatePaymentRecord`
  (`payments.repository.ts:16-28`) and `FetchPaymentRecordService`/`UpdatePaymentRecordService`
  (+ specs) + providers (`tasks.module.ts:39-40,67-68`).
- Modify: `test/tasks/cancel-task.e2e-spec.ts:72-109,132-152`

**Interfaces:**
- Consumes: `refundPaymentIntent`, `cancelPaymentIntent` (P1-T03); `TasksRepository.transition`,
  `PaymentsRepository.fetchLatestByTaskId/updateById` (P1-T04).
- Produces: `CancelTaskService(stripeService, tasksRepository, paymentsRepository)`;
  `execute({ taskId, userId }): Promise<void>`:
  ```
  1. task (any status, 404) ; owner (403 CANNOT_CANCEL_TASK) ; status ∉ {available, in_progress} (403) ; in_progress && elapsed ≥ 1 h (403)   [existing]
  2. payment = fetchLatestByTaskId(taskId)
  3. transition({ taskId, from: [task.status], to: 'canceled', data: { canceledAt: new Date() } }) === false → 409 TASK_STATUS_CONFLICT
  4. switch (payment?.status)
     undefined | 'failed' | 'refunded' | 'disputed' → no Stripe call
     'pending'   → cancelPaymentIntent(payment.paymentIntent); updateById(payment.id, { status: 'failed' })
     'succeeded' → refund = refundPaymentIntent(payment.paymentIntent, `task:${taskId}:refund`)
                   refund.status ∈ {'succeeded','pending'} → updateById(payment.id, { status: 'refunded', refundId: refund.id })
                   else throw
     any throw in 4 → transition({ taskId, from: ['canceled'], to: task.status, data: { canceledAt: null } }) → 500 REFUND_FAILED
  ```
  D7: the refund is the full `chargedAmount` (no `amount` passed → Stripe refunds the whole charge).

- [ ] **Step 1: Write the failing test** — rewrite `cancel-task.e2e-spec.ts:72-152` (keep 27-70,
  154-167):
  ```ts
  it('refunds the full charge and cancels within the grace period', async () => {
    createPayment(task.id, { paymentIntent: 'pi_refundable', status: 'succeeded' }) → 200
    expect(ctx.stripeMock.refundPaymentIntent).toHaveBeenCalledWith('pi_refundable', `task:${task.id}:refund`)
    task 'canceled', canceledAt set; payment status 'refunded', refundId 're_test_123'
  })
  it('accepts a refund that Stripe reports as pending', ... refundPaymentIntent.mockResolvedValueOnce({ id: 're_pending', status: 'pending' }) → 200; refundId 're_pending', status 'refunded')
  it('cancels a pending hold instead of refunding', async () => {
    createPayment(task.id, { paymentIntent: 'pi_hold', status: 'pending' }) → 200
    expect(ctx.stripeMock.cancelPaymentIntent).toHaveBeenCalledWith('pi_hold'); refundPaymentIntent not called; payment 'failed'; task 'canceled'
  })
  it('refunds only the latest payment when an older failed row exists', async () => {
    createPayment(task.id, { paymentIntent: 'pi_old', status: 'failed', createdAt: new Date(Date.now() - 3_600_000) }); createPayment(task.id, { paymentIntent: 'pi_new', status: 'succeeded' })
    → 200; refundPaymentIntent called once with 'pi_new'
  })
  it.each([['failed'], ['refunded']])('cancels without a Stripe call when the latest payment is %s', ... → 200; no refund/cancel calls)
  it('cancels an available task without payment', ... keep)
  it('cancels an in_progress task without a payment row', ... keep)
  it('restores in_progress when the refund fails', async () => {
    refundPaymentIntent.mockRejectedValueOnce(new Error('charge_already_refunded'))
    → 500 REFUND_FAILED; task 'in_progress', canceledAt null; payment still 'succeeded'
  })
  ```
- [ ] **Step 2: Run it, expect failure** — pending hold case → 500 `REFUND_FAILED` (today refunds blindly).
- [ ] **Step 3: Implement** the service; deletions; rewrite `cancel-task.service.spec.ts` (branch
  table: `pending → cancelPaymentIntent`, `succeeded → refundPaymentIntent` with key, `failed → no
  call`; `transition` to `canceled` happens before the Stripe call; revert `transition` on throw).
- [ ] **Step 4: Run it, expect pass** — `Tests: 14 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T13 cancel branches on payment status, CAS first`

---

### Task P1-T14: Webhooks I — dedupe-first dispatch, `chargeId` on success, guarded failure, refund bookkeeping

**Files:**
- Modify: `src/modules/stripe-webhook/repository/stripe-events.repository.ts:9-20`
- Modify: `src/modules/stripe-webhook/use-cases/dispatch-stripe-event.service.ts:31-80` (+ spec)
- Modify: `src/modules/stripe-webhook/use-cases/handle-payment-succeeded.service.ts:10-15` (+ spec),
  `handle-payment-failed.service.ts:10-31` (+ spec), `handle-charge-refunded.service.ts:10-24` (+ spec)
- Modify: `test/stripe-webhook/stripe-webhook.e2e-spec.ts:69-168,256-282`

**Interfaces:**
- Produces:
  ```ts
  // StripeEventsRepository
  tryMarkProcessed(eventId: string, type: string): Promise<boolean>   // create; catch Prisma P2002 → false
  remove(eventId: string): Promise<void>                              // deleteMany({ where: { id } })
  // DispatchStripeEventService.execute(rawBody, signature)
  //   event = constructWebhookEvent (400 WEBHOOK_INVALID_SIGNATURE)
  //   if (!(await tryMarkProcessed(event.id, event.type))) { log 'already processed'; return }
  //   try { switch … } catch (e) { await remove(event.id); throw e }     // Stripe retries → reprocessed
  // HandlePaymentSucceededService.execute(pi)
  //   chargeId = typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge?.id ?? null
  //   payments.updateMany({ where: { paymentIntent: pi.id, status: 'pending' }, data: { status: 'succeeded', ...(chargeId && { chargeId }) } })
  //   payments.updateMany({ where: { paymentIntent: pi.id, status: 'succeeded', chargeId: null }, data: { chargeId } })  // backfill when start wrote first without a charge id
  // HandlePaymentFailedService.execute(pi)
  //   payment = findFirst({ where: { paymentIntent: pi.id, status: 'pending' }, select: { id, taskId } }); !payment → return
  //   $transaction(async tx => { tx.payments.update({ where: { id }, data: { status: 'failed' } })
  //     r = tx.tasks.updateMany({ where: { id: taskId, status: 'in_progress' }, data: { status: 'available', startedAt: null } })
  //     if (r.count === 1) tx.userTaskMapping.deleteMany({ where: { taskId } }) else logger.warn(`task ${taskId} not in_progress; left untouched`) })
  // HandleChargeRefundedService.execute(charge)
  //   refundId = charge.refunds?.data[0]?.id; full = charge.amount_refunded === charge.amount
  //   full → updateMany({ where: { paymentIntent }, data: { status: 'refunded', ...(refundId && { refundId }) } })
  //   !full → logger.warn partial refund; no status change (refundId stored if present)
  ```

- [ ] **Step 1: Write the failing test** — in `stripe-webhook.e2e-spec.ts`:
  ```ts
  it('marks a pending payment succeeded and stores the charge id', async () => {
    createPayment(task.id, { paymentIntent: 'pi_evt_1', status: 'pending' }); mockEvent('payment_intent.succeeded', { id: 'pi_evt_1', latest_charge: 'ch_evt_1' })
    → 200; payment.status 'succeeded', chargeId 'ch_evt_1'
  })
  it('does not touch a failed payment on payment_intent.succeeded', ... status 'failed' stays 'failed', chargeId null)
  it('reverts an in_progress task on payment_failed only while the payment is pending', ... (existing case 96-139, now using createPayment { status: 'pending' }) → available, mapping null, payment failed)
  it('leaves a verification_required task untouched on payment_failed', async () => {
    task verification_required + mapping + pending payment → 200; task.status 'verification_required'; mapping kept; payment 'failed'
  })
  it('ignores payment_failed for an already succeeded payment', ... succeeded stays succeeded, task in_progress, mapping kept)
  it('marks payment refunded on a full charge.refunded', ... { payment_intent: 'pi_evt_3', amount: 12539, amount_refunded: 12539, refunds: { data: [{ id: 're_abc' }] } } → 'refunded', refundId 're_abc')
  it('keeps the stored refundId when charge.refunded has no refunds list', ... createPayment { status: 'succeeded', refundId: 're_kept' }; event { payment_intent, amount: 12539, amount_refunded: 12539 } → status 'refunded', refundId 're_kept')
  it('does not mark a partial refund as refunded', ... amount_refunded: 5000 → status stays 'succeeded')
  it('processes the same event only once, even concurrently', async () => {
    mockEvent twice with id 'evt_idem' (constructWebhookEvent.mockReturnValue, not Once) and a pending payment
    const [a, b] = await Promise.all([postWebhook(), postWebhook()]); expect(a.status).toBe(200); expect(b.status).toBe(200)
    stripe_events count 1; payment 'succeeded'
  })
  ```
  `dispatch-stripe-event.service.spec.ts`: `eventsRepo.tryMarkProcessed.mockResolvedValue(false)` →
  no handler called; handler rejects → `remove` called with `'evt_1'` and the error propagates.
- [ ] **Step 2: Run it, expect failure** — chargeId stays `null`; verification_required task flips
  to `available`; concurrent delivery writes the handler twice or 500s on the dedupe insert.
- [ ] **Step 3: Implement** repository, dispatcher, three handlers; update their unit specs
  (`handle-payment-failed.service.spec.ts` now mocks an interactive `$transaction` callback with a
  `tx` object; `handle-charge-refunded.service.spec.ts` adds `amount/amount_refunded` to fixtures).
- [ ] **Step 4: Run it, expect pass** — webhook e2e `Tests: 13 passed` (incl. the untouched
  `account.updated` and the `payout.failed` case still green until P1-T15 rewrites it).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx jest && npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(stripe-webhook): P1-T14 dedupe first, chargeId on success, guarded payment_failed`

---

### Task P1-T15: Webhooks II — `payout.failed` flag, dispute persistence, `account.updated` guard

**Files:**
- Modify: `src/modules/stripe-webhook/use-cases/handle-payout-failed.service.ts:1-81` (rewrite; deps
  become `PrismaService` only) + spec rewrite; `handle-charge-disputed.service.ts:12-69` (+ spec);
  `handle-account-updated.service.ts:12-27` (+ spec); `stripe-webhook.module.ts:6-7,22-23` (drop
  `AuthRepository`, `TasksRepository`).
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
  //   (no wallet decrement — D6/D8: manual review decides; finish/validate are blocked by P1-T11/P1-T12)
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
- [ ] **Step 4: Run it, expect pass** — webhook e2e `Tests: 17 passed`.
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
    expect(ctx.stripeMock.createTransferFromCharge).toHaveBeenCalledWith(expect.objectContaining({ sourceTransaction: 'ch_a', amount: 5000 }), `task:${a.task.id}:transfer`)   // factory default price 50
    statuses: a 'completed' (transferId 'tr_test_123'), b/c/d 'verification_required'; a.proxy.walletBalance '50.00'
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
  payments: "PaymentIntent off-session with manual capture; transfers with `source_transaction`").

**Interfaces:** none (docs). Content to write (replace the sections' text, keep headings):
- Route map: `POST /card/setup-intent` (returns `{ clientSecret, setupIntentId }`), `POST /card/create
  { paymentMethodId }`; `GET /tasks/price-preview?offeredPrice=` (numbers), `GET /tasks/:id/proof`
  (streams `image/jpeg` from storage, owner/executor only); `POST /tasks/finish` "multipart `file`
  **required**, JPG/PNG/WEBP/HEIC, stored as JPEG ≤ 1600 px"; `POST /tasks/create` "CLIENT only,
  `offeredPrice` 10–10 000 with 2 dp, `cardDetails: { savedCard } | { paymentMethodId }`".
- Database models: `Tasks` gains `stripeFee`, `chargedAmount` (set at create from
  `src/common/money.ts`), `proxyEarnings = offeredPrice`; `Payments` `amount = chargedAmount`,
  `chargeId` (from capture / `payment_intent.succeeded`), `disputeId`, unique `paymentIntent`, created
  as `pending` by the atomic claim and flipped to `succeeded` right after capture; `Users.payoutIssue`;
  `Users.walletBalance` = "total recebido"; `Cards`: one active card per user (partial unique index
  `cards_one_active_per_user`); lifecycle sentence: `accepted`/`on_the_way` enum-only; `payout_failed`
  kept for old rows, never written.
- Stripe Connect: D1 fee model with the R$ 100 example (client pays 125.39 = 100 + 20.00 + 5.39,
  proxy receives 100.00, platform keeps 20.00, Stripe 5.39); `start` sequence hold → claim → capture;
  `validate` sequence payment check → CAS → `transfers.create({ source_transaction, transfer_group },
  { idempotencyKey: task:<id>:transfer })` → one transaction; `cancel` branches; cards via SetupIntent
  (`usage: 'off_session'`), previous PM detached.
- Stripe webhooks: two endpoints/secrets (`STRIPE_WEBHOOK_SECRET` platform events,
  `STRIPE_CONNECT_WEBHOOK_SECRET` connected-account events; `constructWebhookEvent` tries both);
  dedupe **before** the handler (row removed if the handler throws so Stripe's retry reprocesses);
  the six handlers as implemented in P1-T14/T15 (`payout.failed` → `payoutIssue` flag only;
  `charge.dispute.created` → `disputed` + `disputeId`, blocks finish/validate, manual review).
- 3DS section: rename to "### Card authentication and the start charge": 3DS happens once at card
  save (SetupIntent confirmed on the client's device); `/tasks/start` always returns
  `{ status: 'succeeded' }` or `402 PAYMENT_FAILED` ("O pagamento do cliente foi recusado. A tarefa
  continua disponível."); no `requires_action`, no `clientSecret`.
- Environment: optional `STRIPE_CONNECT_WEBHOOK_SECRET`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `PROOF_DIR` (default `./tmp/proofs`), `STRIPE_PUBLIC_KEY`
  now optional/unused by the API; daily cron `0 3 * * *` America/Sao_Paulo auto-release after 7 days.
- Error codes added this phase (list for SPEC §3.3 sync in Phase 2): `PAYMENT_NOT_CONFIRMED` 409,
  `PAYMENT_DISPUTED` 409, `PROOF_PHOTO_REQUIRED` 400, `TASK_STATUS_CONFLICT` 409, `USER_NOT_CLIENT` 403,
  `CARD_NOT_CONFIRMED` 400, `CARD_ALREADY_EXISTS` 409; removed: `TASK_STARTED_AT_NOT_VALID`,
  `TASK_NOT_AVAILABLE_FOR_VALIDATION`, `TRANSFER_FAILED`.

- [ ] **Step 1: Write the failing check** — `cd /Users/leandromartins/Documents/proxy-api && grep -c
  "requires_action" CLAUDE.md` → currently `3`.
- [ ] **Step 2: Rewrite** the sections listed above.
- [ ] **Step 3: Verify** — `grep -c "requires_action" CLAUDE.md` → `0`; each of
  `grep -n "setup-intent\|price-preview\|STRIPE_CONNECT_WEBHOOK_SECRET\|payoutIssue\|chargedAmount\|source_transaction\|PROOF_PHOTO_REQUIRED\|cards_one_active_per_user" CLAUDE.md`
  returns at least one line; route map lists every controller in `src/modules/*/controllers`
  (`ls src/modules/*/controllers | wc -l` equals the number of routes documented).
- [ ] **Step 4: Mark done in ../STATUS.md; commit message** `docs(api): P1-T17 CLAUDE.md money sections for the D1 model`

---

### Task P1-T18: App wire types follow the new contract

**Files (repo `/Users/leandromartins/Documents/proxy-app`):**
- Modify: `src/apis/tasks/tasks-api-types.ts:39-48` (`TPayment`), `:72-88` (`TTask`), `:132-135`
  (`TCreateTaskPayload.cardDetails`), `:168-170` (`TStartTaskResult`), append `TPricePreview`.
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
  export interface TPricePreview { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }
  // cards-api-types.ts
  export interface TCreateCardPayload { paymentMethodId: string }
  export interface TSetupIntent { clientSecret: string; setupIntentId: string }
  ```
  Route functions (`cardsApis.setupIntent`, `tasksApis.pricePreview`), hooks (`useChargePreview`,
  `useConfirmSetupIntent`) and screens are Phase 3 (P3 tasks "Cards via SetupIntent", "Money copy from
  backend numbers", "Payment status banner"). `ACTIVE_TASK_STATUSES` removal is CON-10 → Phase 3.

- [ ] **Step 1: Write the failing check** — `cd /Users/leandromartins/Documents/proxy-app && grep -n
  "requires_action" src app -r` → 2 hits (`tasks-api-types.ts:170`, `app/(app)/tasks/[id]/index.tsx:104`).
- [ ] **Step 2: Apply** the type changes and the two call-site edits above.
- [ ] **Step 3: Verify** — `grep -rn "requires_action" src app` → no output;
  `grep -n "chargedAmount\|stripeFee\|TPricePreview\|TSetupIntent\|paymentMethodId" src/apis/tasks/tasks-api-types.ts src/apis/cards/cards-api-types.ts` → each symbol present;
  `npx tsc --noEmit && npx eslint .` → clean (and `npm test` if Phase 0 added it).
- [ ] **Step 4: Mark done in ../STATUS.md; commit message** `chore(apis): P1-T18 wire types for the Phase 1 money contract`
