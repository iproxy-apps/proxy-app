# Release 1.0 — Decisions register

Every decision below was taken on 2026-11-08 from the two-pass audit (`audit/R-*.md`). Items marked
**DEFAULT (confirm)** were chosen by Claude while the owner was asleep, using the recommended default
from the reviewers; the owner can overturn them. Items marked **SETTLED** are derived from code, the
SPEC or store rules and need no discussion. When a decision changes, edit it here, then update the
affected tasks in `plans/` and the row in `STATUS.md`.

## A. Money model

| # | Decision | Status | Choice | Why |
|---|---|---|---|---|
| D1 | Who pays the fees | **DEFAULT (confirm)** | Client is charged `offeredPrice + platformFee (20 % of price) + stripeFee (3.99 % of the charged total + R$ 0,39)`; proxy receives exactly `offeredPrice`. | This is what `SPEC.md §8.8` and the app's `PriceBreakdown` already promise. Transfer ≤ charge, so `source_transaction` works. The alternative (proxy absorbs both fees, as coded today) would need every money screen and SPEC rewritten. Worked example (Phase 1 plan): R$ 100,00 → charged R$ 125,39 = 100,00 + 20,00 + 5,39; R$ 10,03 → charged R$ 12,95 (fee 2,01 + Stripe 0,91). |
| D2 | Fee math | SETTLED | All money math in `Prisma.Decimal`, 2 dp, centavos as `Decimal.mul(100).toDecimalPlaces(0).toNumber()`. Single source of truth `src/common/money.ts` in proxy-api, exposed to the app via `GET /tasks/:id` fields (`offeredPrice`, `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings`). App never recomputes fees; it renders backend numbers. | BE-03, BE-39, APP-04. |
| D3 | 3DS / card authentication | **DEFAULT (confirm)** | Card is saved through a **SetupIntent** (`usage: 'off_session'`) confirmed on the client's device with `confirmSetupIntent` (3DS happens once, at save time). `/tasks/start` creates the PaymentIntent with `confirm: true, off_session: true, capture_method: 'manual', payment_method: savedCard`; only `requires_capture` continues → CAS claim of the task (`available → in_progress` + mapping + payment row) → `paymentIntents.capture` → `succeeded`. If the CAS fails (someone else took it) the hold is cancelled (`paymentIntents.cancel`), nothing written. Any other PI status (incl. `requires_action`) is a hard failure: nothing is written, the proxy sees "O pagamento do cliente foi recusado. A tarefa continua disponível." The `requires_action` branch is removed from the API contract. | BE-05, APP-03, CON-01. The cardholder (client) is never on the proxy's device, so client-side 3DS at accept time is impossible by construction. Manual capture is what makes "nothing written on failure" true: a captured charge can only be refunded, not cancelled (Phase 1 plan, P1-T05). |
| D4 | Pending BRL funds | SETTLED | Persist `Payments.chargeId` from `latest_charge`; `transfers.create({ source_transaction: chargeId, transfer_group: taskId }, { idempotencyKey })`. | BE-08. Needs one Stripe test-mode verification (see `QA-CHECKLIST.md`). |
| D5 | `payout.failed` policy | **DEFAULT (confirm)** | Notification only: log, set `Users.payoutIssue = true`, surface "Atualize seus dados bancários na Carteira". No reversal, no `payout_failed` task status (enum value kept for existing rows, never written again). | BE-24: funds return to the proxy's Stripe balance; the current claw-back cannot even match the event shape. |
| D6 | Chargebacks after validation | **DEFAULT (confirm)** | Persist `Payments.disputeId`, set payment `disputed`, block `finish`/`validate` on disputed payments, do **not** auto-reverse the transfer and do **not** debit `walletBalance` (it is "Total recebido", D8); manual review. | BE-25. |
| D7 | Cancellation after charge | **DEFAULT (confirm)** | Client cancel while `in_progress` (≤ 1 h after `startedAt`) refunds the **full charged amount**; platform absorbs Stripe's non-refundable fee for 1.0. | Simplest; revisit with volume. |
| D8 | What "Saldo" means | **DEFAULT (confirm)** | Rename to "Total recebido" (running total of `proxyEarnings` credited). Stripe connected balance is out of scope for 1.0. | NEW-06. |

## B. Accounts & sessions

| # | Decision | Status | Choice | Why |
|---|---|---|---|---|
| D9 | Session lifetime | **DEFAULT (confirm)** | JWT `expiresIn: '30d'` + `Users.tokenVersion` embedded in the token and bumped on password reset/change and account deletion. App refreshes the session on app-foreground (throttled 30 s) and after every task mutation. | BE-13, APP-05. |
| D10 | Money/stats in the JWT | SETTLED | Signed as numbers (`.toNumber()`), app normalises with Zod on decode. New `GET /auth/me` returns the fresh user subset; the token keeps the claims for backwards compatibility. | BE-16, APP-11. |
| D11 | `userType` switching | SETTLED | Not in 1.0 (SPEC §8.14). Removed from `update-profile`; choose-profile copy changed. | BE-14. |
| D12 | Document photo + CPF/CNPJ at sign-up | **DEFAULT (confirm)** | Removed from 1.0 sign-up. `documentType`/`documentUrl`/`isVerified` stay in the schema; "Verificado" badge hidden. | APP-06, Q12: nothing can consume them and the toggle is a fake feature (Apple 2.3.1). |
| D13 | Account deletion with open listings | SETTLED | `available` tasks the user owns are auto-cancelled in the same transaction; deletion blocks only on `in_progress`/`verification_required` (as owner or executor). Cards soft-deleted + PaymentMethods detached; Stripe Customer PII scrubbed; ids kept 180 days. | BE-17, BE-30, REL-04. |
| D14 | Edit profile | **DEFAULT (confirm)** | Not in 1.0: the "Editar dados" row is removed. | Q10. |
| D15 | Rating on validate | SETTLED | Optional (SPEC + backend). The UI must not force it. | F2-24. |

## C. Product scope

| # | Decision | Status | Choice | Why |
|---|---|---|---|---|
| D16 | Served cities | **DEFAULT (confirm)** | `São Paulo`, `Rio de Janeiro`, `Belo Horizonte`. Backend gets `Tasks.city`/`Tasks.state` columns, exact + case-insensitive match, shared constant list validated server-side. App Step 1 uses a picker. | APP-07, BE-37. |
| D17 | Scheduled date/time on tasks | SETTLED | Dropped for 1.0 (no column, picker unused). `@react-native-community/datetimepicker` removed. | F2-Q4. |
| D18 | Dispute path on `verification_required` | **DEFAULT (confirm)** | 1.0 ships "Falar com o suporte" (mailto with task id) instead of the "em breve" button, plus an **auto-release**: a task in `verification_required` for 7 days is validated automatically by a daily job. | APP-30. Money can never be stuck forever. |
| D19 | Proof photo | SETTLED | Mandatory server-side (`PROOF_PHOTO_REQUIRED` 400). HEIC/HEIF converted to JPEG on upload. Stored in S3-compatible object storage. | BE-18, CON-11. |
| D20 | History tab | SETTLED | Implemented per SPEC §8.13. Backend `GET /auth/transaction-history` returns executor tasks in all terminal statuses and real `proxyEarnings`. | APP-09, BE-40. |
| D21 | PII visible to proxies | SETTLED | Public owner shape: `id, name, avatarUrl, rating, totalTasksCreated`. Phone shown only to the mapped executor while the task is `in_progress`/`verification_required`. `payment` embedded only for the owner, without `paymentIntent`. | BE-11, REL-08. |
| D22 | UI revamp + dark/light mode | SETTLED (owner request) | Phase 4, after flows are correct and tested. Driven by the `frontend-design` skill with the partner's feedback as input. | Owner message 2026-11-08. |

## D. Platform & release

| # | Decision | Status | Choice | Why |
|---|---|---|---|---|
| D23 | Store identity | **OWNER INPUT NEEDED** | Final app name, reverse-DNS id under a domain the owner owns, iPhone-only (`supportsTablet: false`). | REL-01. Ids are permanent after first upload; the `proxy.com.br` domain in `.env` is not evidenced as owned. |
| D24 | Static site origin | **OWNER INPUT NEEDED** | One https origin (default: Cloudflare Pages on the owner's domain) hosting: privacy policy, terms, support/report page, account-deletion request page, `stripe-redirect/`. | REL-02, REL-05. |
| D25 | Backend hosting | **DEFAULT (confirm)** | Railway (or Render) Node service + managed Postgres; Cloudflare R2 (S3 API) for proof images; SES with the owner's verified domain. Dockerfile + `prisma migrate deploy` on start. | REL-10. |
| D26 | Developer accounts | **OWNER INPUT NEEDED** | Organisation accounts (CNPJ) on both stores recommended. Play personal accounts created after 13 Nov 2023 need a 12-tester / 14-day closed test: confirm now, it is the longest lead time. | REL checklist. |
| D27 | Stripe keys during review | SETTLED | Backend on **test** keys with two pre-onboarded demo accounts (CLIENT with `4242…` card, PROXY with a ready test Connect account); switch to live after approval. | REL checklist. |
| D28 | Autonomous device testing | **OWNER INPUT NEEDED** | The standing rule "never start the dev server" blocks Maestro/simulator E2E runs by Claude. Proposal: the owner explicitly allows `expo run:ios` on the simulator **only inside Phase 6 QA sessions**; until then autonomy = backend e2e (Testcontainers) + app unit/render tests (jest-expo + RNTL). | Owner asked for autonomous testing. |
| D29 | Push notifications | SETTLED | Out of 1.0 (SPEC §9.1). Refresh-on-focus + polling covers the two-device flow. | — |

## E. Settled by code/docs (no action besides the linked task)

- Finish has no 1 h limit (commit `d20bae9`); SPEC §7.2 updated in Phase 2 docs task.
- Sign in with Apple is not required (email/password only, guideline 4.8).
- `targetSdkVersion` is 36 with Expo SDK 57; nothing to do for Play's 2026 target.
- Required iOS purpose strings: location when-in-use, camera, photo library. Always-location and microphone must be disabled in the plugin config (`false`), not deleted.
- Stripe Connect accounts already use controller properties (not the deprecated `type: 'express'`); only `country: 'BR'`, `default_currency: 'brl'` and `capabilities.transfers` are missing.
