# STATUS — Proxy release 1.0 (live board)

**Canonical state of the workstream. Update this file in the same change as the code.**
Legend: `todo` · `in_progress` · `blocked` · `done` · `skipped` (with reason). Pick the first `todo`
whose dependencies are `done`. Phase 4 (UI revamp) and Phase 6 (QA) are tracked in the "Other
phases" section because they are briefs/checklists, not task tables.

## Now

- **Next task to pick up:** `P0-T01` (phase 0, backend test factory + env hygiene). See
  `plans/phase-0-foundations.md`.
- **Owner inputs still open** (see `DECISIONS.md`): D23 store identity, D24 static-site origin,
  D26 developer account type (Play closed test clock), D28 autonomous device testing; plus
  confirmation of every `DEFAULT (confirm)` row (D1, D3, D5–D9, D12, D14, D16, D18, D25).
- **Phase state:** P0 todo · P1 todo · P2 todo · P3 todo · P4 todo (brief ready) · P5 todo · P6 todo.

## Session log (newest first)

| Date | Session | What happened |
|---|---|---|
| 2026-11-08 | Claude Fable 5.1, hackintosh, overnight | Two-pass audit of both repos (8 + 3 reports in `audit/`), DECISIONS.md, PLAN.md, phase plans 0–5, QA checklist, START-HERE. No source code changed except: graphify section removed from both `CLAUDE.md`, release-workstream pointer added to both `CLAUDE.md`. ai-memory pages written (`_rules/release-1-0-start-here`, `decisions/release-1-0-money-model`, `concepts/release-1-0-audit-verdict`). |

## Phase 0 — Foundations: tests, CI, hygiene (both) — `plans/phase-0-foundations.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| P0-T01 | Test infra hygiene: factory claim, dotenv override, untrack `.env.test`, TRUNCATE guard | — | todo | |
| P0-T02 | Strict typing: declare `Decimal`/`DocumentType`, `noImplicitAny`, `--skipLibCheck false` gate | P0-T01 | todo | |
| P0-T03 | Global `PrismaModule`, one client, `PaymentsModule` exports | — | todo | |
| P0-T04 | `configureApp`: CORS, filter, shutdown hooks, `TRUST_PROXY`, Logger in bootstrap | P0-T03 | todo | |
| P0-T05 | PT error contract: Zod pipe, Throttler/Unauthorized/413/404 and Prisma mapping in the filter | — | todo | |
| P0-T06 | Throttler: one default 100/min, 5/min on the four public auth routes, trust-proxy behaviour | P0-T04, P0-T05 | todo | |
| P0-T07 | `z.uuid()` on every `:id` param and `taskId` body | P0-T05 | todo | |
| P0-T08 | `GET /health` (public, unthrottled, DB ping) | P0-T03, P0-T05 | todo | |
| P0-T09 | ESLint 9 flat config for proxy-api, `lint` without `--fix` | — | todo | |
| P0-T10 | Park the red `delete-account` e2e case with a Phase 2 pointer | — | todo | |
| P0-T11 | Dockerfile, `.dockerignore`, `.nvmrc`, `engines` for proxy-api | P0-T08 | todo | |
| P0-T12 | GitHub Actions workflow for proxy-api | P0-T01…T11 | todo | |
| P0-T13 | App dependency hygiene: drop `newArchEnabled`, `expo install --fix`, remove datetimepicker | — | todo | |
| P0-T14 | App test runner: jest-expo + RNTL + `Button` render test + `npm test` | P0-T13 | todo | |
| P0-T15 | `src/common/env.ts` fail-fast + consumers | P0-T14 | todo | |
| P0-T16 | App `.nvmrc`, `engines`, GitHub Actions workflow | P0-T13, P0-T14, P0-T15 | todo | |

Tasks: 16

## Phase 1 — Money core (api) — `plans/phase-1-money-core.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| P1-T01 | `src/common/money.ts` — fee model D1 in `Prisma.Decimal` | — | todo | |
| P1-T02 | Prisma migration `phase1_money_core` (fee columns, payment bookkeeping, `payoutIssue`, partial unique active card) | — | todo | |
| P1-T03 | StripeService: SetupIntent, off-session hold/capture/cancel, idempotent refund/transfer, two webhook secrets; env; test doubles | — | todo | |
| P1-T04 | Repositories: `TasksRepository.transition/claimTask/releaseClaim/recordTransfer`, `PaymentsRepository` latest-by-task/by-id, `PaymentsModule` export | P1-T02 | todo | |
| P1-T05 | Cards via SetupIntent: `POST /card/setup-intent`, `POST /card/create { paymentMethodId }`, replace-in-transaction, detach previous | P1-T02, P1-T03 | todo | |
| P1-T06 | `POST /tasks/create`: strict Zod bounds, CLIENT-only, card before insert, fees persisted in one transaction, shared `taskSelect` | P1-T01, P1-T04, P1-T05 | todo | |
| P1-T07 | `GET /tasks/price-preview?offeredPrice=` | P1-T01 | todo | |
| P1-T08 | `POST /tasks/start`: hold → CAS claim → capture; `requires_action` removed | P1-T03, P1-T04, P1-T06 | todo | |
| P1-T09 | `ProofStorage` port + `LocalDiskProofStorage` + `S3ProofStorage` + `StorageModule` + env | — | todo | |
| P1-T10 | Proof image pipeline: magic bytes (`file-type`), HEIC→JPEG (`heic-convert`), normalise (`sharp`) | — | todo | |
| P1-T11 | `POST /tasks/finish` (proof mandatory, disputed block, CAS) + `GET /tasks/:id/proof` streams from storage | P1-T04, P1-T09, P1-T10 | todo | |
| P1-T12 | `POST /tasks/validate`: payment-checked, CAS first, `source_transaction` transfer, one transaction for transferId/counter/wallet | P1-T01, P1-T03, P1-T04 | todo | |
| P1-T13 | `POST /tasks/cancel`: CAS first, branch on latest payment, accept refund `pending`, full refund | P1-T03, P1-T04 | todo | |
| P1-T14 | Webhooks I: dedupe-first dispatch, `payment_intent.succeeded` stores `chargeId`, guarded `payment_failed`, `charge.refunded` keeps `refundId` | P1-T02, P1-T03, P1-T04 | todo | |
| P1-T15 | Webhooks II: `payout.failed` → `payoutIssue`, dispute persists `disputeId`, `account.updated` guard + clears flag; dead Stripe methods removed | P1-T02, P1-T03 | todo | |
| P1-T16 | Daily auto-release job (`@nestjs/schedule`) | P1-T12 | todo | |
| P1-T17 | Rewrite `proxy-api/CLAUDE.md` sections (Stripe Connect, webhooks, 3DS, Database models, routes, env) | P1-T01…T16 | todo | |
| P1-T18 | App wire types follow the new contract (types only + one dead branch) | P1-T05, P1-T07, P1-T08 | todo | |

Tasks: 18

## Phase 2 — Auth & API hardening (api) — `plans/phase-2-auth-api.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| P2-T01 | Strict sign-up schema, password policy, email normalisation | — | todo | |
| P2-T02 | Sign-up flow: row first, Stripe Customer after, P2002 → 409, lowercase migration | P2-T01 | todo | |
| P2-T03 | `buildSessionPayload` with numeric claims, nullable phone, `safeParse` | — | todo | |
| P2-T04 | 30-day expiry + `tokenVersion` revocation | P2-T03 | todo | |
| P2-T05 | `GET /auth/me` | P2-T04 | todo | |
| P2-T06 | `update-profile`: no `userType`, `currentPassword`, bump `tokenVersion` | P2-T01, P2-T04 | todo | |
| P2-T07 | Login returns 401 for unknown email (dummy compare) | P2-T03 | todo | |
| P2-T08 | Password-reset hardening: attempts, send-then-persist, generic 200, dev log, HTML escape | P2-T01 | todo | |
| P2-T09 | Account deletion per D13 (auto-cancel listings, cards, Stripe scrub, red e2e) | P2-T04 | todo | |
| P2-T10 | Connect params, PROXY check, single `STRIPE_CONNECT_RETURN_URL`, env hardening | — | todo | |
| P2-T11 | `SERVED_CITIES`, `Tasks.city`/`state` + backfill migration, insensitive match | — | todo | |
| P2-T12 | `GET /tasks/fetch` → `{ items, page, perPage, hasMore }` | P2-T11 | todo | |
| P2-T13 | Shared `taskSelect` + `publicUserSelect` + numeric `toTaskResponse` | P2-T12 | todo | |
| P2-T14 | `GET /tasks/:id` visibility: DB role, executor-only phone, owner-only payment, deleted owner | P2-T13, P2-T04 | todo | |
| P2-T15 | Transaction history: all executor statuses, stored earnings, numbers, `?page=` | P2-T11 | todo | |
| P2-T16 | `PROXY_ACCOUNT_NOT_READY` on start, dead dictionary entries, dead code | — | todo | |
| P2-T17 | Indexes, `Restrict` on financial FKs, `.gitignore` dup | P2-T11 | todo | |
| P2-T18 | Docs sync: api `CLAUDE.md`, app `SPEC.md` | all above | todo | |

Tasks: 18

## Phase 3 — App: contract + flows (app) — `plans/phase-3-app-flows.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| P3-T01 | Session schema (Zod), `exp` check, `isAuthenticated = !!session`, test harness | — | todo | |
| P3-T02 | Boot + 401 hygiene (SecureStore `.catch`, cache clear, auth-only 401) | T01 | todo | |
| P3-T03 | `api-errors.ts`: PT mapping for 429/413/VALIDATION_FAILED + error classifiers | — | todo | |
| P3-T04 | Contract sync: types, route functions, pagination, dead code | T01 | todo | |
| P3-T05 | Refresh infra: `QueryFocusProvider`, NetInfo, `refreshMe`, `useSessionRefreshOnFocus` | T01, T04 | todo | |
| P3-T06 | Task queries/mutations: `refetchInterval`, `onSettled`, `reconcileAfterTimeout`, pull-to-refresh | T04, T05 | todo | |
| P3-T07 | `QueryErrorCard` + error states on every list; 404 vs network on detail | T03, T04 | todo | |
| P3-T08 | Profile: "Excluir conta" (double confirm, 409), legal rows, remove "Editar dados" | T03, T04 | todo | |
| P3-T09 | Sign-up without document/photo, tappable Terms/Privacy, choose-profile copy | T08 | todo | |
| P3-T10 | Cards via SetupIntent, `urlScheme`, `/cards` role gate, card copy | T04 | todo | |
| P3-T11 | Task detail split + `PaymentStatusBanner` + `requires_action` removal | T04, T06, T07 | todo | |
| P3-T12 | Proxy gate to Wallet, "Falar com o suporte", waiting bar, start error copy | T11, T08 | todo | |
| P3-T13 | Money from backend numbers: `PriceBreakdown` + `useChargePreviewQuery`, `ReceiptCard`, "Você recebe", `payout_failed`, "Total recebido" | T04, T11 | todo | |
| P3-T14 | City picker: `SERVED_CITIES`, Step 1 toggle, ProxyHome pills, unserved-city error | T04 | todo | |
| P3-T15 | Location flow: geocode first, no silent substitution, reset on edit, "Abrir Ajustes" | T14 | todo | |
| P3-T16 | Proof upload: downscale, 10 MB check, 120 s timeout, reconcile, modal copy | T06 | todo | |
| P3-T17 | Wallet: onboarding result, 4-state `MerchantStatusRow`, `payoutIssue` banner, `/wallet` gate | T05, T13 | todo | |
| P3-T18 | History tab (three tabs) from `/tasks/active` + new history endpoint | T04, T06, T07 | todo | |
| P3-T19 | Copy fixes, optional rating + 500-char counter, Client Home stats, cancel copy | T11, T13 | todo | |
| P3-T20 | Polish A — shell: tab bar height, Toast inset, `+not-found`, deep-link replay, `AppModal` guards | T02 | todo | |
| P3-T21 | Polish B — forms & lists: double-submit guard, ProxyHome counts/search, lazy location, `ProofPhoto` fallback, `canCancelTask` | T06 | todo | |
| P3-T22 | Polish C — hygiene & docs: alias imports lint rule, tailwind globs, CLAUDE.md/SPEC sync | all | todo | |

Tasks: 22

## Phase 5 — Release engineering (both + infra) — `plans/phase-5-release-engineering.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| P5-T01 | App identity in `app.json` + brand assets (OWNER INPUT D23) | — | todo | |
| P5-T02 | Permission plugin options + Stripe plugin without Apple Pay | — | todo | |
| P5-T03 | Export compliance + iOS privacy manifest | T01 | todo | |
| P5-T04 | EAS project, `eas.json`, EAS environments, docs | T01 | todo | |
| P5-T05 | `links.ts` final URLs + `reportTaskUrl` | — | todo | |
| P5-T06 | "Denunciar" row on task detail | T05 | todo | |
| P5-T07 | Static site `site/` (privacy, terms, support, delete-account, stripe/return) + `check-site.mjs` (OWNER INPUT D24) | — | todo | |
| P5-T08 | Cloudflare Pages deploy workflow + project | T07, T11 | todo | |
| P5-T09 | Backend container readiness (Dockerfile, `.dockerignore`, `/health`) | — | todo | |
| P5-T10 | Backend production env schema + `.env.example` + docs | — | todo | |
| P5-T11 | Cloudflare account: DNS zone, R2 bucket + token, Pages project (OWNER) | — | todo | |
| P5-T12 | Railway: Postgres + API service + env vars + domain (OWNER) | T09, T10, T11, T13, T14 | todo | |
| P5-T13 | Stripe Dashboard: two webhook endpoints, return URL, Connect settings (OWNER) | T07 | todo | |
| P5-T14 | AWS SES: domain identity, DKIM, production access, IAM (OWNER) | T11 | todo | |
| P5-T15 | Demo review accounts on the deployed backend (OWNER, D27) | T12, T13 | todo | |
| P5-T16 | Apple Developer + App Store Connect record, URLs, App Privacy, age rating, review notes (OWNER INPUT D23/D26) | T01, T07, T08, T15 | todo | |
| P5-T17 | Google Play Console app, Data safety, deletion URL, content rating, signing, closed testing (OWNER INPUT D26) | T01, T07, T08, T15 | todo | |
| P5-T18 | EAS builds (preview → device full task; production) + `eas submit` dry pass | T02, T03, T04, T06, T12, T16, T17 | todo | |

Tasks: 18

## Other phases

| Phase | Item | State | Notes |
|---|---|---|---|
| 4 | Collect partner feedback + copy Lovable prototype into the repo (owner) | todo | `plans/phase-4-ui-revamp.md` inputs |
| 4 | Design session with `frontend-design` skill (2 directions × light/dark) | todo | after Phase 3 done |
| 4 | Theme infrastructure (ThemeProvider, semantic tokens, `userInterfaceStyle: automatic`) | todo | |
| 4 | Primitives restyled + snapshots per scheme | todo | |
| 4 | Screens restyled by flow + snapshots + contrast gate | todo | |
| 4 | Profile "Aparência" (system/claro/escuro) | todo | |
| 6 | Stripe test-mode verifications (QA-CHECKLIST §6.1) | todo | needs Stripe CLI |
| 6 | Backend deployment smoke (§6.2) | todo | after Phase 5 |
| 6 | Two-device script (§6.3) | todo | owner, or agent if D28 confirmed |
| 6 | Store submission (§6.4) | todo | |

## Known machine/environment facts

- Hackintosh (2026-11-08): Node 26.13, Docker Desktop installed (start it before e2e), Stripe CLI not
  installed, no `eas`/`wrangler`/`aws` CLIs, Lovable prototype only on the MacBook.
- Backend: run `npx prisma generate` before `tsc`/`jest`; e2e rewrites `test/.env.test` until P0-T01.
- Backend has no ESLint installed despite the `lint` script (P0 adds it).
