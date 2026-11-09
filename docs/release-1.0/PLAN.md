# Proxy — Release 1.0 master plan

**Written:** 2026-11-08 (Sunday, early morning) from the two-pass audit in `audit/`.
**Goal:** ship Proxy 1.0 to the App Store and Google Play with a money path that cannot lose or
double-move money, a store-compliant app, a deployable backend, and a test suite that lets an agent
verify its own work without the owner.

**Repos:** backend `/Users/leandromartins/Documents/proxy-api` (NestJS 11 / Prisma 7 / Stripe),
app `/Users/leandromartins/Documents/proxy-app` (Expo SDK 57 / RN 0.86 / Expo Router / NativeWind).
**Spec:** `proxy-app/SPEC.md` (product), `proxy-api/CLAUDE.md` (API), `DECISIONS.md` (this folder).
**Status board:** `STATUS.md`. **Detailed task plans:** `plans/phase-N-*.md`.

## 0. Where the project stands (audit verdict)

- Backend: 24 routes, 6 webhook handlers, 37 unit suites (153 green) and 22 e2e suites (102/103 green,
  1 red). Architecture is clean, but the **money path is unsafe**: 4 P0 + 14 P1 (`audit/R-backend-review.md`).
- App: all screens exist except History (placeholder). `tsc`/`eslint` clean, **zero tests**. 1 P0 + 11 P1
  (`audit/R-app-review.md`), most of them contract/UX gaps that make the two-device flow lie to the user.
- Release: nothing is deployable or submittable yet: template identity, no in-app deletion/legal links,
  no EAS config, no CI, no hosting, proofs on local disk, one Stripe webhook secret for two endpoint
  families (`audit/R-release-contract-review.md`, incl. the full store checklist in its §4).
- Owner asks on top: progress must survive sessions/machines/compaction; UI revamp + dark/light mode.

Register IDs used below: `BE-nn` (backend), `APP-nn` (app), `REL-nn`/`CON-nn` (release/contract).

## 1. Phases and order

Dependencies drive the order: tests and CI first (so every later task is verifiable), then the money
core (everything else renders its output), then auth/API hardening, then the app, then the revamp, then
release engineering, then device QA and submission. Phases 1 and 2 are backend-only and Phase 3 is
app-only, so one session can run Phase 2 while another runs Phase 3 once Phase 1 is merged.

| Phase | Name | Repo | Output | Blocks |
|---|---|---|---|---|
| 0 | Foundations: tests, CI, hygiene | both | green `tsc`/lint/unit/e2e in CI; app test runner; global fixes that unblock everything (throttler, Prisma module, health, PT errors, UUID validation) | all |
| 1 | Money core | api | fee model D1, Decimal math, SetupIntent cards, off-session charge, CAS transitions, payment-checked validate, idempotent Stripe calls, cancel branches, webhook dedupe-first, payout/dispute policy, proof storage | 3, 5 |
| 2 | Auth & API hardening | api | mass-assignment, JWT exp/tokenVersion, numeric claims, `/auth/me`, deletion semantics, PII shape, city columns + pagination, history fixes, password/reset hardening, indexes, Connect params, docs sync | 3 |
| 3 | App: contract + flows | app | session normalisation, refresh strategy, deletion + legal links, History, money copy from backend numbers, city picker, sign-up cleanup, payment banner, onboarding result, proof upload, location, errors, copy | 4, 6 |
| 4 | UI revamp + dark/light mode | app | design proposals via `frontend-design` skill, theme tokens for light/dark, screen-by-screen restyle | 6 |
| 5 | Release engineering | both + infra | identity/icons, `eas.json`, permissions, privacy manifest, static site (privacy/terms/support/deletion/stripe-return), Dockerfile + hosting + R2 + SES domain + two webhook endpoints, store listings, data-safety answers, demo accounts | 6 |
| 6 | QA + submission | both + devices | Stripe test-mode verifications, device E2E script, closed testing (Play), TestFlight, submission, post-approval switch to live keys | — |

Each phase has a detailed plan in `plans/` written for an engineer/agent who has not seen the code:
exact files, signatures, tests, commands. Phase 4 has a brief instead of a step plan (design work is
iterative with the partner). Phase 6 is a checklist.

## 2. Phase summaries (what, why, done-when)

### Phase 0 — Foundations (plans/phase-0-foundations.md)

Backend: fix `test/factories/user.factory.ts` (`stripeAccountReady`), untrack `test/.env.test`,
`override: true` in `load-env.ts` + DB-URL guard before `TRUNCATE`, `tsc --noEmit --skipLibCheck false`
clean (declare `Prisma.Decimal` in types), global `PrismaModule` (one client) + `enableShutdownHooks`,
`GET /health`, `trust proxy`, throttler fixed to one default 100/min + 5/min only on `/auth/session`,
`/auth/create`, `/auth/forgot-password`, `/auth/verify-reset-code` (BE-04, BE-42), PT messages + error
codes for Zod/throttler/multer/unauthorized and Prisma error mapping (`P2002→409`, `P2025→404`,
`P2023→400`) (BE-33, BE-34), `z.uuid()` on every id, GitHub Actions workflow
(`prisma generate → tsc → eslint (no --fix) → jest → test:e2e`), Dockerfile, `.nvmrc`.
App: `jest-expo` + `@testing-library/react-native` + a first smoke test, `npm test` script, CI
workflow (`tsc → eslint → jest`), remove `newArchEnabled`, `npx expo install --fix`, remove
`@react-native-community/datetimepicker`, `src/common/env.ts` fail-fast (APP-15).
Done when: both CIs green on `main`; e2e 22/22 (the red delete-account spec is moved to Phase 2 and
temporarily marked `.todo` with a pointer); `STATUS.md` updated.

### Phase 1 — Money core (plans/phase-1-money-core.md)

Implements D1–D7, D19. Key pieces:
- `src/common/money.ts`: `computeCharge(offeredPrice: Decimal) → { offeredPrice, platformFee,
  stripeFee, chargedAmount, proxyEarnings }` (all `Decimal`, 2 dp) + `toCentavos(d: Decimal): number`.
  Persist `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings` on the task at **create** time
  (new columns `stripeFee`, `chargedAmount`), so every screen renders stored numbers (BE-03, BE-39).
- Cards via SetupIntent: `POST /card/setup-intent` returns `clientSecret`; app confirms on device;
  `POST /card/create { paymentMethodId }` verifies the PM is attached + `setup_future_usage`; previous
  card detached; partial unique index on active card (BE-32, BE-05).
- `/tasks/start`: load owner card → `paymentIntents.create({ amount: toCentavos(chargedAmount),
  currency: 'brl', customer, payment_method, confirm: true, off_session: true,
  transfer_group: taskId }, { idempotencyKey })` → only on `succeeded`: `$transaction([CAS
  available→in_progress, mapping insert, payment row succeeded + chargeId])`; `count === 0` → cancel
  PI + `TASK_NOT_AVAILABLE`; non-succeeded → `PAYMENT_FAILED` 402, nothing written (BE-02, BE-05).
  `requires_action` removed from `StartTaskResult`.
- CAS on every transition in `TasksRepository.transition(id, from[], to, data)`; `finish` from
  `in_progress`, `cancel` from `available|in_progress`, `validate` from `verification_required` (BE-02).
- `/tasks/validate`: require latest payment `succeeded` (`PAYMENT_NOT_CONFIRMED` 409), CAS to
  `completed` first, `transfers.create({ amount: toCentavos(proxyEarnings), destination,
  source_transaction: chargeId, transfer_group }, { idempotencyKey: task:${id}:transfer })`, then one
  `$transaction` for transferId/wallet increment/counter/rating; revert CAS on transfer failure
  (BE-01, BE-06, BE-08).
- `/tasks/cancel`: branch on latest payment status (`succeeded` → refund full `chargedAmount`,
  `pending` → PI cancel, `failed|refunded` → no call), accept refund `pending`, CAS (BE-07, BE-21).
- `/tasks/create`: Zod `offeredPrice min(10) max(10000) multipleOf(0.01)`, title/description bounds,
  `cardDetails` union, CLIENT-only, validate card before insert, `$transaction` with counter (BE-09, BE-19).
- Webhooks: insert `StripeEvents` first (`P2002` = already processed) (BE-23); `payment_failed`
  guarded by `status: 'pending'`/`in_progress` (BE-22); `charge.refunded` keeps `refundId` (BE-21);
  `payout.failed` → `Users.payoutIssue` flag only (D5, BE-24); dispute persists `disputeId`, blocks
  finish/validate (D6, BE-25); second secret `STRIPE_CONNECT_WEBHOOK_SECRET` tried after the first (BE-10).
- Proof storage: S3-compatible client (`@aws-sdk/client-s3`, env `S3_*`), magic-byte check, HEIC→JPEG
  (`sharp`), mandatory file, `GET /tasks/:id/proof` streams from storage (BE-18, D19). Local dev uses
  a `LocalDiskStorage` adapter behind the same interface.
- Auto-release job: `@nestjs/schedule` daily, validates tasks `verification_required` older than 7 days
  with rating `null` (D18).
Done when: e2e specs listed in the plan pass (start failure modes, double start, double validate,
pending/failed cancel, dedupe, payment_failed guard, proof upload), unit 100 % on `money.ts`,
`CLAUDE.md` API sections rewritten.

### Phase 2 — Auth & API hardening (plans/phase-2-auth-api.md)

BE-12 strict create schema; BE-13 `expiresIn: '30d'` + `tokenVersion` + revocation; BE-16/D10
`buildSessionPayload` with numbers + `GET /auth/me`; BE-15 nullable phone + `safeParse`; BE-14
`update-profile` (no `userType`, `currentPassword`); BE-17/D13 deletion semantics + cards/Stripe
scrub + red e2e fixed; BE-11/D21 public owner shape + executor-only phone + owner-only payment;
BE-37/D16 `city`/`state` columns, migration backfill, insensitive exact match, `{ items, page,
perPage, hasMore }` pagination (app updated in Phase 3); BE-40/D20 history with all executor statuses,
real `proxyEarnings`, numbers, pagination; BE-38 shared `taskSelect` with `completedAt/canceledAt`;
BE-26 401 for unknown email + generic forgot-password; BE-27 password ≥ 8; BE-28 attempts counter +
send-then-persist + dev log; BE-29 email normalisation + Customer after insert; BE-31 Connect
`country/default_currency/capabilities` + PROXY check + distinct `refresh_url`; BE-46 `PROXY_ACCOUNT_NOT_READY`
on start; BE-41 indexes; BE-48/49 ops nits (no `NODE_ENV` default, https check on callback URL, bcrypt 10,
cascade → restrict on financial rows); BE-47 docs sync (`CLAUDE.md`, `SPEC.md` §3.3/3.4/4/7/8).
Done when: e2e 100 % green incl. new specs (`refresh-session`, `me`, `proof`, `dispute`, throttle),
`npx tsc --noEmit --skipLibCheck false` clean, route map in `CLAUDE.md` matches controllers.

### Phase 3 — App: contract + flows (plans/phase-3-app-flows.md)

Session: Zod-normalised decode, `isAuthenticated = !!session`, `exp` check, SecureStore `.catch`,
401 clears query cache, `useSessionRefreshOnFocus` + refresh after mutations, `GET /auth/me`
(APP-05/11/12/13/14). Refresh strategy: `focusManager`↔`AppState`, `onlineManager`↔NetInfo,
`RefreshControl` on lists, `refetchInterval` while a task is live, invalidations in `onSettled`,
timed-out mutation → refetch and reconcile (APP-08, APP-29). Store compliance: "Excluir conta" with
double confirm + 409 handling, "Termos e Privacidade" row, tappable links in sign-up (APP-01/02).
History tab per SPEC §8.13 from the new history endpoint (APP-09). Money: render `chargedAmount`,
`platformFee`, `stripeFee`, `proxyEarnings` from the task; `PriceBreakdown` becomes a presentational
component fed by a `useChargePreview(price)` hook calling `GET /tasks/price-preview?offeredPrice=` (new
tiny backend route in Phase 1) so Step 2 shows exact numbers; receipts sum; proxy sees "Você recebe"
(APP-04). City picker shared constant (APP-07). Sign-up without document photo/number (APP-06, D12).
Cards via SetupIntent (`useConfirmSetupIntent`) (D3). Payment status banner; `requires_action` type
removed (APP-03). Onboarding result from `stripeAccountReady`, 3-state `MerchantStatusRow` (APP-22).
Proof upload: 120 s timeout, downscale ≤ 1600 px, 10 MB local check, reconcile on timeout (APP-16).
Location: geocode first, no silent coordinate substitution, reset on edit, "Abrir Ajustes" (APP-17).
Proxy accept gated by `stripeAccountReady` with CTA to Wallet (APP-18). `QueryErrorCard` + 404 vs
network distinction (APP-20). `payout_failed` display, `payoutIssue` banner (APP-21). Copy fixes
(APP-19). "Falar com o suporte" replaces "Contestar" (APP-30, D18). Role gates on `/cards`, `/wallet`
(APP-23). English error mapping in `extractErrorMessage` (APP-10). Pagination shape. Tests: RNTL render
tests per screen state + hook tests, as listed in the plan.
Done when: app CI green with the listed tests; every SPEC §8 screen has loading/empty/error/populated
states; no "em breve" on main flows.

### Phase 4 — UI revamp + dark/light mode (plans/phase-4-ui-revamp.md — brief)

Inputs: partner feedback (to be collected by the owner), the Lovable prototype at
`~/Downloads/proxy-prototype` (on the MacBook only; copy it or commit a `design/reference/` folder),
current design tokens in `tailwind.config.js` and `src/common/theme/colors.ts`.
Process: invoke the `frontend-design` skill with a written brief (audience, tone "premium-neutro",
constraints: NativeWind 4 gotchas, pt-BR, status colours) to get 2–3 directions as static screens;
pick one with the partner; then implement in this order: theme tokens (semantic light/dark pairs via
NativeWind `dark:` variants + `useColorScheme`, `userInterfaceStyle: 'automatic'`), shared primitives
(`Button`, `FormInput`, cards, sheets, `ScreenHeader`, tab bar), then screens by flow. Add a
`ThemeProvider` with a manual override (system / light / dark) stored in `localStorage`-equivalent
(`expo-secure-store` is for secrets; use `AsyncStorage` or `expo-sqlite/kv-store`).
Done when: every screen renders in both schemes without raw HSL/hex in components, contrast ≥ 4.5:1 on
text, snapshot tests per screen per scheme.

### Phase 5 — Release engineering (plans/phase-5-release-engineering.md)

App: identity (`expo.name`, ids, icons, splash, `supportsTablet: false`), plugin permission
config (`locationAlwaysAndWhenInUsePermission: false`, `locationAlwaysPermission: false`,
`microphonePermission: false`), drop Apple Pay `merchantIdentifier`, `ITSAppUsesNonExemptEncryption:
false`, `ios.privacyManifests`, `eas init` + `eas.json` (dev/preview/production with env per profile),
`appVersionSource: remote`, "Denunciar"/support entry (REL-14). Static site: privacy policy, terms,
support/report, account-deletion request page, `stripe-redirect/` → Cloudflare Pages. Backend:
Railway/Render service with Dockerfile, managed Postgres, `prisma migrate deploy`, secrets, R2 bucket,
SES domain verification + production access, two Stripe webhook endpoints (platform + Connect) with
their secrets, `PROD_CALLBACK_URL` = static site return page, https API URL in the production EAS
profile. Store consoles: listings (pt-BR), screenshots (iPhone 6.7"/6.1"), App Privacy label and Play
Data safety from the inventory in `audit/R-release-contract-review.md §4.1/§4.2`, age rating, demo
accounts, review notes (Stripe Connect test mode). Play closed testing track if D26 says so.
Done when: `eas build --profile preview` installs on a device and completes a full task against the
staging backend; both store listings pass the console validators; `curl /health` on prod is 200.

### Phase 6 — QA + submission (QA-CHECKLIST.md)

Stripe test-mode verifications (SetupIntent 3DS test card `4000 0027 6000 3184`, off-session charge,
`source_transaction` transfer on a pending charge, Connect onboarding with BR test data,
`account.updated` flips readiness, `payout.failed` trigger, dispute trigger), two-device script
(client phone + proxy phone) covering every status × role cell of SPEC §8.9, cold start, offline,
background/foreground refresh, deep link `proxyapp://wallet`, account deletion, password reset mail.
Then TestFlight + Play internal → closed (14 days if required) → production review → post-approval
switch to live keys and live Connect.

## 3. Autonomous verification strategy

- Backend: Testcontainers e2e (`npm run test:e2e`, needs Docker running) + unit (`npx jest`). Every
  task in Phases 0–2 names the spec that must fail before and pass after. CI runs the same.
- App: `jest-expo` + RNTL render/hook tests (Phase 0 sets it up). Every Phase 3 task names its test.
  Static gates: `npx tsc --noEmit`, `npx eslint .`.
- Device E2E: not autonomous until D28 is confirmed (standing rule: never start the dev server).
  Phase 6 includes a Maestro flow file ready to run once allowed.
- Verification command per repo, to be run before claiming any task done:
  - api: `npx prisma generate && npx tsc --noEmit && npx eslint "src/**/*.ts" "test/**/*.ts" && npx jest && npm run test:e2e`
  - app: `npx tsc --noEmit && npx eslint . && npm test`

## 4. Working agreement for every session (any model, any machine)

1. Read `START-HERE.md`, then `STATUS.md`, then the phase plan you are on. Do not re-audit.
2. Pick the first task marked `todo` whose dependencies are `done`. Mark it `in_progress` in `STATUS.md`
   **before** editing code; mark `done` only after the task's verification step passed.
3. One task = one commit, message `feat|fix|test|chore(<area>): <task id> <title>` (the owner commits; leave
   the tree clean of unrelated reformatting; never run repo-wide format/fix scripts).
4. If a decision in `DECISIONS.md` turns out wrong, stop, write the problem under the task in
   `STATUS.md`, and either ask the owner or apply the reviewer's recommended default and record it.
5. End of session: update `STATUS.md` (what is done, what is half-done with file list, next task),
   and write an ai-memory handoff when the ai-memory tools are available.

## 5. Effort estimate (agent-sessions, not calendar)

| Phase | Tasks | Estimate |
|---|---|---|
| 0 | 16 | 1–2 sessions |
| 1 | 18 | 3–4 sessions |
| 2 | 18 | 2–3 sessions |
| 3 | 22 | 3–4 sessions |
| 4 | design + ~12 screens | 2–3 sessions + partner reviews |
| 5 | 18 (8 are owner/console actions) | 2 sessions + owner time |
| 6 | checklist | 1–2 sessions + 14 days if Play closed test applies |

Owner-only lead times to start now (they run in parallel with the code work): developer accounts
and their type (D26), domain + static site origin (D24), app name availability (D23), Stripe account
in live mode with CNPJ, SES domain verification.
