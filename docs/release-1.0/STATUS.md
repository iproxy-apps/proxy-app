# STATUS — Proxy release 1.0 (live board)

**Canonical state of the workstream. Update this file in the same change as the code.**
Legend: `todo` · `in_progress` · `blocked` · `done` · `skipped` (with reason). Pick the first `todo`
whose dependencies are `done`. Phase 4 (UI revamp) and Phase 6 (QA) are tracked in the "Other
phases" section because they are briefs/checklists, not task tables.

## Now

| Field | Value |
|---|---|
| task | `P2-T05` |
| step | build (card `cards/P2-T05.md`, implementer dispatched) |
| files touched | — ; api Phase 0 complete at `44e09cf` |
| last gate | app @b64fc44 (Phase 1 close, 2026-11-23): tsc 0 · eslint 0 · `npm test` 10/10 · maestro A 4/4 (smoke + baseline), B 1/1 smoke · visual-diff vs baseline worst 0.000 % on 15 screens |
| last gate (api) | api @e80ac09 (P2-T04, 2026-11-23, orchestrator-run): type-check 0 · eslint 0 · jest 302/302 (51 suites) · e2e 36/36 suites, 266 passed, 1 skipped · drift none · CI on `release-1.0` green |
| waiting on owner | — (decision round closed 2026-11-23; D23/D26 deferred by the owner; Google Places key (D16) needed before the P3 address task) |
| next task | `P2-T06` |

- **Owner inputs still open** (see `DECISIONS.md`): D23 store identity and D26 developer account type
  (both deferred by the owner to "when the version is nearly final"); Google Cloud Places API key for D16
  (needed by the Phase 3 address task, goes in the app `.env` only).
- **Owner decision round closed (2026-11-23):** every `DEFAULT (confirm)` row is now SETTLED in `DECISIONS.md`; D1 (80/20, min R$ 20), D3 (charge at start, automatic capture, transfer at validate), D9 (30 m access + 60 d rotating refresh token), D12 (no documents stored at all), D14 (edit profile name/phone IN 1.0), D16 (Google Places autocomplete + served-city whitelist) changed; D23/D26 deferred by the owner until the app is nearly final; D24 Cloudflare Pages or Vercel; D25 Resend preferred. Plans for phases 1–3 carry an `## Amendments (2026-11-23 …)` section with the rewritten tasks and rulings.
- **Phase state:** L done · P0 done (CI green on GitHub) · P1 done (2026-11-23) · P2 in progress (T01–T04 done) · P3 todo · P4 todo (brief ready) · P5 todo · P6 todo.

## Session log (newest first)

| Date | Session | What happened |
|---|---|---|
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P2-T04 done (api `e80ac09`) after one fix round (advisory lock closes the revoke-vs-rotate race). P2-T05 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P2-T03b done (api `f10654f`): identity-document columns dropped (D12). P2-T04 (refresh tokens, D9) dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P2-T03 done (api `d9973e7`). e2e flake watch: `refresh-session › rejects unauthenticated requests` answered 404 instead of 401 once in a sequential full run (`maxWorkers: 1`, `--runInBand`), never alone — same family as the Phase 0/1 one-off 404/401 flakes; investigate at the Phase 2 boundary (run the suite 3× and collect failures). P2-T03b dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P2-T02 done (api `c3af4c6`) after one small fix round. P2-T03 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | Phase 2 started. P2-T01 done (api `c5dc043`); review clean, gate green. P2-T02 dispatched (ruling: keep `searchCustomer` for the loop seed hook). |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | **Phase 1 closed.** Final review + fix wave (api `03e798a`), boundary regression green (Maestro A 4/4, B 1/1, visual-diff 0.000 %), webhooks exercised live. Parked items recorded. Next: `P2-T01` (Phase 2 auth & API hardening). Owner inputs still open: Google Places key before P3-T14b; D23/D26 when near final. ai-memory handoff NOT written (Mac Pro server unreachable again); this STATUS is the handoff. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T17 done (api `fe30eff`) after one fix round. All 18 Phase 1 tasks committed. Boundary started: webhook exercised via Stripe CLI (events dispatched, deduped, "matches no task" for the CLI fixture as expected), Maestro regression + whole-branch review running. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T18 done (app, this commit): wire types for the Phase 1 contract; review clean, app gate green. P1-T17 (api CLAUDE.md) running in parallel (different repo). |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T16 done (api `cc3ddab`): auto-release job; review clean, gate green. P1-T17 (CLAUDE.md rewrite) dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T15 done (api `8c2e3a1`) after one fix round (atomic dispute write). e2e flake watch: `validate-task` failed once more in an implementer run (2nd occurrence), never in orchestrator runs (26 clean runs). P1-T16 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T14 done (api `a607d7b`) after one fix round (guarded downgrade, remove guard, refund status, cancel re-read after CAS). P1-T15 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T13 done (api `4987abc`) after one fix round (no revert after an accepted refund — Critical caught by the opus review). Every status write now goes through `transition`/`claimTask`/`releaseClaim`. P1-T14 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T12 done (api `fdbc658`) after one fix round (logging/guarded revert; 409 on wrong status). e2e flake watch: `validate-task` failed once in the implementer's isolated run, not reproduced in 21 further runs. P1-T13 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T11 done (api `446d350`): proof via storage + CAS finish + proof streaming; review clean, gate green. P1-T12 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T10 done (api `5391ab9`) after two small fix rounds (decoder/detector errors → 400). P1-T11 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T09 done (api `e19e69e`) after one fix round (empty `PROOF_DIR` → cwd root). e2e flake watch: `test/app/throttle` failed once (1/9), green alone and on rerun. P1-T10 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T08 done (api `0052d99`) after one fix round: opus review caught a two-key double-charge interleaving in the CAS-loss branch (card-induced) → `fetchClaim` snapshot; replay-before-card. Gate green. P1-T09 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T07 done (api `db73834`): price preview; review clean, gate green. P1-T08 (start: claim → charge) dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T06 done (api `30306c6`): strict `/tasks/create` with D1 fees persisted; review clean, gate green. P1-T07 dispatched. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T05 done (api `2f7682e`): cards via SetupIntent; review clean, gate green. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T04 done (api `96248ef`): CAS repositories + `cardActionRequired` column; review clean, gate green. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T03 done (api `a64edbc`). Phase 2/3 plans amended (4 lettered tasks added: P2-T03b, P2-T08b, P3-T08b, P3-T14b); STATUS tables synced. Ruling: Phase 1 owns `Users.cardActionRequired` (P1-T05 migration + clear, P1-T08 set) so the Phase 3 client banner "Confirme seu cartão" has a source; e-mail stays secondary. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P1-T02 done (api `886dc89`): migration + partial unique index, review clean, gate green. e2e flake watch: `test/auth/create-account` failed once (401 vs 400) in the implementer's run, green alone and on rerun (adds to `create-task`/`fetch-card` from Phase 0). |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | Phase 1 plan amended to the new D1/D3 (claim-first ruling folded back into D3/PLAN.md). P1-T01 done (api `67b25a4`), review clean, gate green. Phase 2/3 plan amendment still running. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | Owner's manual check of Phase 0 run by Claude instead (D28): `DEV_STACK_TEST_HOOKS=0 dev-stack.sh up` → `/health` 200, 6th `/auth/session` 429 pt-BR. Owner asked Claude to run such checks itself from now on. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | **Phase 0 closed.** Boundary regression green on rebuilt A/B, visual freeze held, final review fix wave (api `e0f01f6`, app `ec22198`). Handoff not written (ai-memory offline). Next: P1-T01. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | Owner allowed pushes (D30). `release-1.0` pushed in both repos; CI triggers widened to `release-1.0` (Ruling: branch trigger instead of a PR to `main`, because the loop must not touch `main`); both CI runs green. Decision round closed, plans being amended. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T16 done (app CI, awaiting push). All 16 Phase 0 tasks committed; boundary regression starts. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T15 done (fail-fast env module). Simulator A rebuild started after P0-T13 deps (ios/ regenerated: stale Podfile.lock). P0-T16 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T14 done (app jest runner; 4 plan defects ruled). P0-T15 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T13 done (app deps hygiene; simulator build now stale). P0-T14 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T12 done (api `44e09cf`): CI workflow, awaiting push. Backend half of Phase 0 complete (P0-T01…T12). P0-T13 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T11 done (api `84d1f34`): Dockerfile builds; plan's image checks corrected. P0-T12 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T10 done (api `966d0a7`): delete-account case parked; api gate fully green for the first time. P0-T11 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T09 done (api `0d6f769`): ESLint 9 flat config, lint gate now part of the api gate. P0-T10 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T08 done (api `eaf32bb`): GET /health. P0-T09 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T07 done (api `d00d14f`): z.uuid() on 7 controllers. P0-T08 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T06 done (api `e4c7499`): single default throttler, 5/min on 4 auth routes, loop exemption. P0-T07 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T05 done (api `6a75348`): Portuguese error contract (9 codes), Zod pipe, filter mapping, SPEC §3.3. P0-T06 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T04 done (api `64ab10f`): configureApp, TRUST_PROXY, Logger. P0-T05 card written. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T03 done (api `c22ae76`): one global PrismaModule, 8 modules de-duplicated, PaymentsModule exports. |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | P0-T02 done (api `67ade1e`); scope widened by ruling (Decimal fallout in two use-cases, test factories, `@types/pg`). |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | Owner re-ran the baseline (3/3 passed) after enabling LuLu Allow Simulator Apps; P0-T01 done (api `d97b18b`, implementer + blind reviewer, 1 fix round). |
| 2026-11-23 | Claude, MacBook Pro M5 | Phase L closed: final-review fix wave (api `96362fe`: real Stripe customer on seed, optional account id, lstart ownership guard; app: two-commit rule, known-red api gate baseline, plan supersessions, lstart guard in `device.sh`). |
| 2026-11-23 | Claude Fable 5.1, MacBook Pro M5 | Owner set targets (1 MVP-functional → 2 visual → 3 stores), settled D28/D30/D31, approved `LOOP.md` (approach B). Phase L plan written. ai-memory consolidated into one project (`default/iproxy-apps-proxy-app`, marker in both repos). No source code changed. |
| 2026-11-08 | Claude Fable 5.1, hackintosh, overnight | Two-pass audit of both repos (8 + 3 reports in `audit/`), DECISIONS.md, PLAN.md, phase plans 0–5, QA checklist, START-HERE. No source code changed except: graphify section removed from both `CLAUDE.md`, release-workstream pointer added to both `CLAUDE.md`. ai-memory pages written (`_rules/release-1-0-start-here`, `decisions/release-1-0-money-model`, `concepts/release-1-0-audit-verdict`). |

## Phase L — Loop infrastructure (both) — `plans/phase-L-loop-infra.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| L-T01 | Branch `release-1.0` + board plumbing (`## Now` table, task cards, LOOP/DECISIONS/marker commit) | — | done | |
| L-T02 | `TestHooksModule`: `/__test/reset`, `/__test/seed-user`, `/__test/mark-account-ready` behind `LOOP_TEST_HOOKS=1` + local-DB guard | — | done | api `1267e60` · jest 158/158 · e2e 109/110 · 2 review rounds (SkipThrottle default+auth) · final-review fix wave api `96362fe`: seed-user creates a real Stripe customer, `mark-account-ready` id optional (400 `ACCOUNT_ID_REQUIRED` without one), seed `stripeAccountReady` requires an id · deferred: DATABASE_URL try/finally (fixed in fix wave), TRUNCATE_TABLES is hard-coded — update it when adding tables |
| L-T03 | `proxy-api/scripts/dev-stack.sh up/down/status/logs` (compose Postgres, api with hooks, `stripe listen`, pid tracking) | L-T02 | done | api `b84a8ff` · up/status/down + exit-1/exit-2 paths verified live · 1 review round (pgid cleanup, pid-reuse guard, non-destructive status probe, log tails) · fix wave api `96362fe`: ownership checks require comm **and** `lstart` (same in `device.sh`) |
| L-T04 | Java + Maestro install, `.maestro/` scaffold, `proxy-app/scripts/device.sh`, first smoke flow | — | done | app L-T04 commit · maestro welcome-to-sign-in ✔ on A and B · Maestro 2.12.1 · tsc+eslint 0 · splash heading asserted by prefix regex (one a11y element with the accent line) |
| L-T05 | Visual baseline: 15 screenshots on device A (iOS 26.5) + `visual-baseline/INDEX.md` + baseline flows | L-T02, L-T03, L-T04 | done | app L-T05 commit · 15 PNGs · baseline flows COMPLETED on A |

Tasks: 5

## Phase 0 — Foundations: tests, CI, hygiene (both) — `plans/phase-0-foundations.md`

| ID | Title | Depends on | State | Notes |
|---|---|---|---|---|
| P0-T01 | Test infra hygiene: factory claim, dotenv override, untrack `.env.test`, TRUNCATE guard | — | done | api `d97b18b` · tsc 0 · jest 158/158 · e2e 117/118 (24 suites; +3 guard cases; red = delete-account) · `.env.test` untracked, still on disk · review: 1 Minor fixed (quotes on `got "<unset>"`) |
| P0-T02 | Strict typing: declare `Decimal`/`DocumentType`, `noImplicitAny`, `--skipLibCheck false` gate | P0-T01 | done | api `67ade1e` · strict tsc 15→0 · jest 158/158 · e2e 117/118 (red = delete-account) · **ruling:** plan claim "fallout 0" was false — real `Decimal` exposed `number` arithmetic on `offeredPrice` in start-task/validate-task; fixed behaviour-preserving with one `Number(taskDetails.offeredPrice)` per use-case, `new Prisma.Decimal()` in test factories, `@types/pg` dev dep. Real Decimal money math stays Phase 1 (`src/common/money.ts`) |
| P0-T03 | Global `PrismaModule`, one client, `PaymentsModule` exports | — | done | api `c22ae76` · prisma.module.spec 11/11 · jest 169/169 · e2e 117/118 (red = delete-account) · ruling: `TestHooksModule` (Phase L) stripped of its own `PrismaService` too, added to the spec table |
| P0-T04 | `configureApp`: CORS, filter, shutdown hooks, `TRUST_PROXY`, Logger in bootstrap | P0-T03 | done | api `64ab10f` · configure-app.spec 3/3 · jest 172/172 · e2e 117/118 (red = delete-account) · no `console.log` in src · review clean |
| P0-T05 | PT error contract: Zod pipe, Throttler/Unauthorized/413/404 and Prisma mapping in the filter | — | done | api `6a75348` · filter+pipe specs 13/13 · jest 185/185 · e2e 118/119 (+413 case; red = delete-account) · SPEC §3.3 +9 rows · review clean (2 Minor, no action) |
| P0-T06 | Throttler: one default 100/min, 5/min on the four public auth routes, trust-proxy behaviour | P0-T04, P0-T05 | done | api `e4c7499` · throttle.e2e 8/8 · jest 185/185 · e2e 126/127 (red = delete-account) · **ruling:** `skipIf` also true when `LOOP_TEST_HOOKS=1` (device loop signs in many times from one IP); Phase L hook controllers back to bare `@SkipThrottle()`; SPEC §3.4 + CLAUDE.md updated · review clean (1 cosmetic Minor) |
| P0-T07 | `z.uuid()` on every `:id` param and `taskId` body | P0-T05 | done | api `d00d14f` · 4 new e2e cases (500→400) · jest 185/185 · e2e 130/131 (red = delete-account) · review: 1 Minor (blank lines) fixed · note: `z.uuid()` is RFC-strict (v1-8); Prisma v4 ids pass |
| P0-T08 | `GET /health` (public, unthrottled, DB ping) | P0-T03, P0-T05 | done | api `eaf32bb` · health unit 2/2 · health e2e 1/1 · jest 187/187 · e2e 131/132 (red = delete-account) · CLAUDE.md route map +Health, auth throttle note fixed · review clean |
| P0-T09 | ESLint 9 flat config for proxy-api, `lint` without `--fix` | — | done | api `0d6f769` · eslint 9.39.5 + typescript-eslint 8.73 · first run: 1 error (unused type import), fixed by hand, 0 rules downgraded · final 0/0 on 196 files · jest 187/187 · review clean (1 Minor accepted: caret resolved to ^8.73.0) |
| P0-T10 | Park the red `delete-account` e2e case with a Phase 2 pointer | — | done | api `966d0a7` · `it.skip` + Phase 2 pointer (BE-17 / D13) · e2e 26/26 suites, 1 skipped, 131 passed · review clean |
| P0-T11 | Dockerfile, `.dockerignore`, `.nvmrc`, `engines` for proxy-api | P0-T08 | done | api `84d1f34` · `docker build` ok (node:22-alpine) · image loads `dist/src/configure-app.js` + `health.controller.js` without env · prisma 7.3.0 · migrations + prisma.config.ts present · image removed · **ruling:** plan's two run checks were wrong (`require(app.module)` validates env at import → exit 1; `prisma --version | head -1` is a banner), replaced as noted in the plan · review clean (2 Minor by design: devDeps in runtime image, no scripts/ copy) |
| P0-T12 | GitHub Actions workflow for proxy-api | P0-T01…T11 | done | api `44e09cf` · GitHub Actions run 45249535902 **success** (2026-11-23, after `ci(api): run on pushes to release-1.0`) · `.github/workflows/ci.yml` identical to the plan YAML · local CI sequence exit 0 (tsc 0, eslint 0, jest 187/187, e2e 26/26 + 1 skipped) · workflow run pending the owner's push |
| P0-T13 | App dependency hygiene: drop `newArchEnabled`, `expo install --fix`, remove datetimepicker | — | done | this commit · `expo install --check` up to date · 8 expo pkgs bumped (expo ~57.0.33, router ~57.0.32…) · datetimepicker gone · tsc 0 · eslint 0 · review clean (Minor: transitive majors glob/xcode moved) · **simulator build is stale: rebuild A and B before the next Maestro run** |
| P0-T14 | App test runner: jest-expo + RNTL + `Button` render test + `npm test` | P0-T13 | done | this commit · `npm test` 3/3 · tsc 0 · eslint 0 · **4 rulings** (plan defects): +`@react-native/jest-preset@0.86.3` and +`test-renderer@^1.3.1` (peers not auto-installed under legacy-peer-deps), RNTL 14 async API (`await render/fireEvent`), reanimated `setUpTests()` throws → mock fallback, TS 6 needs `"types": ["jest"]` in tsconfig · review clean (Minor: version spec forms) |
| P0-T15 | `src/common/env.ts` fail-fast + consumers | P0-T14 | done | this commit · read-env.test 7/7 · `npm test` 10/10 · tsc 0 · eslint 0 · 3 consumers migrated · review clean (4 Minor accepted: single-failure message lists only the failing var; extra CLAUDE.md sentence) |
| P0-T16 | App `.nvmrc`, `engines`, GitHub Actions workflow | P0-T13, P0-T14, P0-T15 | done | `c7a9eef` · GitHub Actions run 45249543025 **success** (2026-11-23, after `ci(app): run on pushes to release-1.0`) · ci.yml identical to the plan YAML · local CI sequence exit 0 (npm ci, tsc 0, eslint 0, jest 10/10) · workflow run pending the owner's push |

Tasks: 16

**Phase 0 boundary (2026-11-23, LOOP §5.3):** api gate at `e0f01f6`: type-check 0 · eslint 0/0 · jest 187/187 (also with `.env` removed, as CI runs it) · e2e 26/26 suites, 1 skipped, 132 passed. App gate at `ec22198`: tsc 0 · eslint 0 · jest 10/10 · `expo install --check` ✔. Device: `ios/` regenerated (stale Podfile.lock after P0-T13), A rebuilt, B installed from the same build; Maestro A 4/4 (`smoke` + `baseline`), B 1/1 `smoke`; `scripts/visual-diff.js` vs `visual-baseline/` worst 0.011% (forgot-password caret). Two-device script §6.3: not yet scripted (nothing in Phase 0 adds flows). Final whole-branch review found 2 Important (unit tests needed a local `.env`; throttler `skipIf` ignored production) → fixed in `e0f01f6` / `ec22198`. DECISIONS: nothing new to settle (D17, D28 already SETTLED; D25 stays `DEFAULT (confirm)`, owner's call). ai-memory handoff: **not written**, server offline (Mac Pro unreachable on tailscale); git is canonical. CI runs for P0-T12/P0-T16 await the owner's push.

**Parked for later phases (from the final review):** Phase 1 — `start-task.service.ts` Stripe `amount: offeredPrice * 100` is never rounded (19.99 → 1998.999…), money.ts must produce integer cents. Phase 2 — malformed JSON / body-parser errors may surface as 500 `STANDARD_ERROR` instead of a Portuguese 400; verify in the error-contract work; `delete-account` case un-skip (D13). Phase 5 / D25 — deploy runbook must set `TRUST_PROXY=1` behind Railway/Render (or boot should refuse without it); Dockerfile runtime runs as root (`USER node` + writable upload dir); proof uploads go to `process.cwd()/src/tmp` and vanish on redeploy; `/health` DB ping has no connect timeout. Loop — two e2e specs flaked once each during the fix wave (`create-task`, `fetch-card` 404 case), passed on rerun; watch for recurrence.
- **P1-T08 review follow-ups (2026-11-23):** (a) P1-T14 must write the `succeeded` row from the webhook metadata (`taskId`/`proxyId`/`claimedAt`) so a start whose response was lost still gets its row; (b) a claim left `in_progress` with no payment row (unknown charge outcome) has no sweeper — cancel by the client covers it for now; P1-T16 or Phase 2 should add a reconciler that checks Stripe for a PaymentIntent with that `metadata.taskId` before releasing; (c) if the client swaps the card while an attempt is unknown, the retry hits `StripeIdempotencyError` for up to 24 h — same reconciler.
- **P1-T10 (2026-11-23):** the plan said `sharp` needs a glibc image; `sharp` ≥ 0.33 ships musl prebuilts, so the `node:22-alpine` Dockerfile is expected to work — verify `docker build` + a `normalizeProofImage` smoke run inside the image at Phase 5 before deploying.
- **P1-T12 review follow-ups (2026-11-23):** the transfer idempotency key `task:<id>:transfer` protects a retry only inside Stripe's 24 h window; after that a re-validate (e.g. by the auto-release job) could create a second transfer from the same charge — P1-T16 must treat `TASK_STATUS_CONFLICT` from a race as harmless, and Phase 2/5 should add a "find existing transfer by `transfer_group`" check before retrying a transfer on a task that already left `verification_required`.
- **P1-T14 review follow-ups (2026-11-23):** (a) webhook dedupe marks an event processed before the handler finishes, so a Stripe retry arriving while the first attempt is still running gets 200 and the event is lost if that attempt then fails — Phase 2/5: add `processedAt` to `stripe_events` and answer non-2xx while a fresh claim has no `processedAt`; (b) the shared refund key `task:<id>:refund` assumes one charged PaymentIntent per task — true today (claim-first start), revisit together with the 24 h idempotency note if a reconciler ever re-charges; (c) `charge.refunded` marks `refunded` from any status, incl. `disputed` — P1-T15 may guard with `status in (succeeded, pending)`.
- **Phase 1 final review (2026-11-23, opus) — parked Minors:** M3 legacy `pending` branch of `payment_failed` writes task status outside the CAS helpers (legacy rows only; route through `releaseClaim` or document); M5 a dispute on a `refunded` row overwrites it with `disputed` (nothing reads it today); M6 `recordTransfer` failure after a successful transfer leaves `completed` + `transferId null` + wallet not credited → Phase 2 reconciler; M7 auto-release `take 200` oldest-first can starve newer tasks behind permanently-skipped ones (exclude disputed / cursor) → Phase 2; M8 before the first `migrate deploy` on a real DB run `SELECT "paymentIntent", count(*) FROM payments GROUP BY 1 HAVING count(*)>1` (unique index) and note the migration folder order (independent DDL, deploy-safe); M9 a dispute arriving before its payment row exists is marked processed and lost (same family as P1-T14(a) `processedAt`). Worse-than-parked notes: P1-T08(b) "cancel covers a claim without payment row" only holds within 1 h and not after finish (closed by fix wave I-1); P1-T12 24 h key window made routine by the daily cron (closed by fix wave I-2: reuse transfer by `transfer_group`).
- **Phase 1 fix-wave re-review (2026-11-23):** N2 — `replayOwnClaim` reads the latest payment row by `createdAt`; a legacy task carrying an old `failed` row (written by the legacy `payment_failed` branch) would answer `PAYMENT_PENDING` to every retry after an unknown charge outcome instead of resuming the key (pre-launch data only; fix: ignore `failed` rows or only rows created at/after the claim `startedAt`) → Phase 2; a claim with a `refunded` row stays `in_progress` after the client's 1 h cancel window → reconciler (P1-T08(b)).

## Phase 1 — Money core (api) — `plans/phase-1-money-core.md`

| ID | Title (synced with the amended plan index, 2026-11-23) | Depends on | State | Notes |
|---|---|---|---|---|
| P1-T01 | `src/common/money.ts` — fee model D1 (client pays `offeredPrice`, 20/80 split) in `Prisma.Decimal` | — | done | api `67b25a4` · `src/common/money.ts` + spec (11 tests, 100 % cov) · gate: type-check 0 · eslint 0 · jest 198/198 (45 suites) · blind review: spec ✅, quality approved, 0 Critical/Important · note for P1-T06: Zod must cap `offeredPrice` at 2 dp (`multipleOf(0.01)`) since `money.ts` does not round the input |
| P1-T02 | Prisma migration `phase1_money_core` (fee columns, payment bookkeeping, `payoutIssue`, partial unique active card) | — | todo |  |
| P1-T03 | StripeService: SetupIntent, off-session create+confirm PaymentIntent (automatic capture), idempotent refund/transfer, two webhook secrets; env; test doubles | — | todo |  |
| P1-T04 | Repositories: `TasksRepository.transition/claimTask/releaseClaim/recordTransfer`, `PaymentsRepository` latest-by-task/by-intent/`recordSucceededCharge`, `PaymentsModule` export | P1-T02 | todo |  |
| P1-T05 | Cards via SetupIntent: `POST /card/setup-intent`, `POST /card/create { paymentMethodId }`, replace-in-transaction, detach previous | P1-T02, P1-T03 | todo |  |
| P1-T06 | `POST /tasks/create`: strict Zod bounds (20–10 000), CLIENT-only, card before insert, fees persisted in one transaction, shared `taskSelect` | P1-T01, P1-T04, P1-T05 | todo |  |
| P1-T07 | `GET /tasks/price-preview?offeredPrice=` | P1-T01 | todo |  |
| P1-T08 | `POST /tasks/start`: CAS claim → charge (automatic capture) → payment row; definite failure releases + notifies client; `requires_action` removed | P1-T03, P1-T04, P1-T06 | todo |  |
| P1-T09 | `ProofStorage` port + `LocalDiskProofStorage` + `S3ProofStorage` + `StorageModule` + env | — | todo |  |
| P1-T10 | Proof image pipeline: magic bytes (`file-type`), HEIC→JPEG (`heic-convert`), normalise (`sharp`) | — | todo |  |
| P1-T11 | `POST /tasks/finish` (proof mandatory, disputed block, CAS) + `GET /tasks/:id/proof` streams from storage | P1-T04, P1-T09, P1-T10 | todo |  |
| P1-T12 | `POST /tasks/validate`: payment-checked, CAS first, `source_transaction` transfer of `proxyEarnings` (80 %), one transaction for transferId/counter/wallet | P1-T01, P1-T03, P1-T04 | todo |  |
| P1-T13 | `POST /tasks/cancel`: disputed block, CAS first, full refund of a succeeded charge, accept refund `pending` | P1-T03, P1-T04 | todo |  |
| P1-T14 | Webhooks I: dedupe-first dispatch, idempotent `payment_intent.succeeded` row write (+ refund on a canceled task), guarded `payment_failed` (+ open-claim release), `charge.refunded` keeps `refundId` | P1-T02, P1-T03, P1-T04 | todo |  |
| P1-T15 | Webhooks II: `payout.failed` → `payoutIssue`, dispute persists `disputeId`, `account.updated` guard + clears flag; dead Stripe methods removed | P1-T02, P1-T03 | todo |  |
| P1-T16 | Daily auto-release job (`@nestjs/schedule`) | P1-T12 | todo |  |
| P1-T17 | Rewrite `proxy-api/CLAUDE.md` sections (Stripe Connect, webhooks, card authentication, Database models, routes, env) | P1-T01…T16 | todo |  |
| P1-T18 | App wire types follow the new contract (types only + one dead branch) | P1-T05, P1-T07, P1-T08 | todo |  |

Tasks: 18

**Phase 1 boundary (2026-11-23, LOOP §5.3) — regression evidence:** api gate at `fe30eff`: type-check 0 · eslint 0 · jest 280/280 (48 suites) · e2e 32/32 suites, 227 passed, 1 skipped (`delete-account`, Phase 2 D13) · `money.ts` 100 % covered (P1-T01) · GitHub Actions green for every pushed commit. Webhooks exercised live with the Stripe CLI through the loop stack (`stripe trigger payment_intent.succeeded`): events dispatched, deduped into `stripe_events`, the CLI fixture intent logged as "matches no task" (expected), unhandled types answered 200. App at `b64fc44`: tsc 0 · eslint 0 · jest 10/10 · Maestro A 4/4 (smoke + baseline) · B 1/1 smoke · visual-diff vs `visual-baseline/` worst **0.000 %** on 15 screens (Phase 1 changed types only). Two-device script §6.3: not runnable yet — the app still sends the Phase 0 start/create payloads until Phase 3 wires the new contract; the money path was exercised end to end by the e2e suites (start/finish/validate/cancel/webhooks/auto-release) instead. **Whole-branch final review (opus):** no Critical; 2 Important closed by a single fix wave (api `03e798a`): `finish` now requires a confirmed charge (409 `PAYMENT_NOT_CONFIRMED`) so a claim whose charge is unknown can never reach `verification_required`; `validate` reuses an existing transfer found by `transfer_group` before creating one (closes the 24 h idempotency-window double transfer that the daily auto-release made routine), refusing reversed transfers. Also folded in: start refunds (shared key, status-checked) and answers 400 when the task was cancelled during the charge; an own claim with any non-`succeeded` payment row never creates a second PaymentIntent; the webhook `payment_failed` release sets `cardActionRequired`. Re-review verdict: **ship Phase 1**. Final api gate at `03e798a`: type-check 0 · eslint 0 · jest 292/292 (48 suites) · e2e 32/32, 229 passed, 1 skipped.

## Phase 2 — Auth & API hardening (api) — `plans/phase-2-auth-api.md`

| ID | Title (synced with the amended plan index, 2026-11-23) | Depends on | State | Notes |
|---|---|---|---|---|
| P2-T01 | Strict sign-up schema, password policy, email normalisation | — | todo |  |
| P2-T02 | Sign-up flow: row first, Stripe Customer after, P2002 → 409, lowercase migration | P2-T01 | todo |  |
| P2-T03 | `buildSessionPayload` with numeric claims, nullable phone, `safeParse`, no document claims | — | todo |  |
| P2-T03b | Drop identity-document columns (`documentType`, `documentUrl`, `isVerified`) | P2-T01, P2-T03 | done | api `f10654f` · migration `20261123220000_drop_identity_document_columns` (3 DROP COLUMN + DROP TYPE; dev DB had 0 `documentUrl` rows) · every reference removed (types, scrub, factories, task selects, seed hook); legacy body keys still tolerated · e2e + `no-identity-documents.e2e-spec.ts` (3) · gate: type-check 0 · eslint 0 · jest 294/294 · e2e 34/34, 247 passed, 1 skipped · drift none · review: spec ✅, approved |
| P2-T04 | 30-minute access JWT + rotating refresh tokens (`/auth/refresh`, `/auth/logout`) | P2-T03 | todo |  |
| P2-T05 | `GET /auth/me` | P2-T04, P2-T03b | todo |  |
| P2-T06 | `update-profile`: name and phone only | P2-T03, P2-T04 | todo |  |
| P2-T07 | Login returns 401 for unknown email (dummy compare) | P2-T03 | todo |  |
| P2-T08 | Password-reset hardening: attempts, send-then-persist, generic 200, dev log, HTML escape | P2-T01 | todo |  |
| P2-T08b | Mail provider port: Resend adapter (default), SES adapter kept | P2-T08, P2-T10 | todo | new task from the 2026-11-23 amendment |
| P2-T09 | Account deletion per D13 (auto-cancel listings, cards, Stripe scrub, refresh tokens, red e2e) | P2-T04, P2-T03b | todo |  |
| P2-T10 | Connect params, PROXY check, single `STRIPE_CONNECT_RETURN_URL`, env hardening | — | todo |  |
| P2-T11 | `SERVED_CITIES`, `Tasks.city`/`state` + backfill, Places-shaped create body, `CITY_NOT_SERVED` | — | todo |  |
| P2-T12 | `GET /tasks/fetch` → `{ items, page, perPage, hasMore }`, canonical served city | P2-T11 | todo |  |
| P2-T13 | Shared `taskSelect` + `publicUserSelect` + numeric `toTaskResponse` | P2-T12 | todo |  |
| P2-T14 | `GET /tasks/:id` visibility: DB role, executor-only phone, owner-only payment, deleted owner | P2-T13, P2-T04 | todo |  |
| P2-T15 | Transaction history: all executor statuses, stored earnings, numbers, `?page=` | P2-T11 | todo |  |
| P2-T16 | `PROXY_ACCOUNT_NOT_READY` on start, dead dictionary entries, dead code | — | todo |  |
| P2-T17 | Indexes, `Restrict` on financial FKs, `.gitignore` dup | P2-T11 | todo |  |
| P2-T18 | Docs sync: api `CLAUDE.md`, app `SPEC.md` | all above | todo |  |

Tasks: 18

## Phase 3 — App: contract + flows (app) — `plans/phase-3-app-flows.md`

| ID | Title (synced with the amended plan index, 2026-11-23) | Depends on | State | Notes |
|---|---|---|---|---|
| P3-T01 | Session schema (Zod), refresh-token storage, `isAuthenticated = !!session`, test harness | — | todo |  |
| P3-T02 | Boot hygiene + 401 → single-flight refresh → retry once → sign out; logout revokes | T01 | todo |  |
| P3-T03 | `api-errors.ts`: PT mapping for 429/413/VALIDATION_FAILED + error classifiers | — | todo |  |
| P3-T04 | Contract sync: types, route functions, pagination, update-profile, dead code | T01 | todo |  |
| P3-T05 | Refresh infra: `QueryFocusProvider`, NetInfo, `refreshMe` (user data only), `useSessionRefreshOnFocus` | T01, T04 | todo |  |
| P3-T06 | Task queries/mutations: `refetchInterval`, `onSettled`, `reconcileAfterTimeout`, pull-to-refresh | T04, T05 | todo |  |
| P3-T07 | `QueryErrorCard` + error states on every list; 404 vs network on detail | T03, T04 | todo |  |
| P3-T08 | Profile: "Excluir conta" (double confirm, 409), legal rows | T03, T04 | todo |  |
| P3-T08b | Edit profile screen (name + phone) behind "Editar dados" | T03, T04, T08 | todo | new task from the 2026-11-23 amendment |
| P3-T09 | Sign-up without document/photo, tappable Terms/Privacy, choose-profile copy | T08 | todo |  |
| P3-T10 | Cards via SetupIntent, `urlScheme`, `/cards` role gate, card copy, `cardActionRequired` banner | T04, T05 | todo |  |
| P3-T11 | Task detail split + `PaymentStatusBanner` (five payment states) + `requires_action` removal | T04, T06, T07 | todo |  |
| P3-T12 | Proxy gate to Wallet, "Falar com o suporte", waiting bar, start error copy (D3) | T11, T08 | todo |  |
| P3-T13 | Money from backend numbers: client "Você paga" (one total), proxy "Você recebe" (80 %), receipts, `payout_failed`, "Total recebido" | T04, T11 | todo |  |
| P3-T14 | Google Places (New) client, served-city mirror, `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | T04 | todo |  |
| P3-T14b | Create Task step 1: Places address search, served-city gate, Places-shaped payload, ProxyHome pills | T14, T13 | todo | new task from the 2026-11-23 amendment |
| P3-T15 | "Usar minha localização atual": permission flow, reverse geocode → served city, "Abrir Ajustes" | T14b | todo |  |
| P3-T16 | Proof upload: downscale, 10 MB check, 120 s timeout, reconcile, modal copy | T06 | todo |  |
| P3-T17 | Wallet: onboarding result, 4-state `MerchantStatusRow`, `payoutIssue` banner, `/wallet` gate | T05, T13 | todo |  |
| P3-T18 | History tab (three tabs) from `/tasks/active` + new history endpoint | T04, T06, T07 | todo |  |
| P3-T19 | Copy fixes, R$ 20,00 minimum, optional rating + 500-char counter, Client Home stats, cancel copy | T11, T13, T14b | todo |  |
| P3-T20 | Polish A — shell: tab bar height, Toast inset, `+not-found`, deep-link replay, `AppModal` guards | T02 | todo |  |
| P3-T21 | Polish B — forms & lists: double-submit guard, ProxyHome counts/search, lazy location, `ProofPhoto` fallback, `canCancelTask` | T06 | todo |  |
| P3-T22 | Polish C — hygiene & docs: alias imports lint rule, tailwind globs, CLAUDE.md/SPEC sync | all | todo |  |

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

- MacBook Pro M5 (2026-11-23, the loop machine per D31): Node 24.12, Xcode 27.2 with iPhone 17 Pro /
  17e / 18 Pro simulators, Docker Desktop running, Stripe CLI installed, Lovable prototype at
  `~/Downloads/proxy-prototype`. Missing: `eas`, `wrangler`, `psql`.
- MacBook Pro M5 device loop (L-T04, 2026-11-23): Maestro 2.12.1 (`brew install
  mobile-dev-inc/tap/maestro`, `/opt/homebrew/bin/maestro`); Java: brew openjdk@25 (openjdk
  25.0.5, keg-only, `/usr/bin/java` is the macOS stub) via JAVA_HOME in scripts/device.sh. Maestro's
  first run blocks on an analytics prompt unless `MAESTRO_CLI_NO_ANALYTICS=1` (device.sh sets it).
  Xcode 27.2 ships `DeviceHub.app`, not `Simulator.app`. `expo run:ios` builds into
  `~/Library/Developer/Xcode/DerivedData/proxyapp-*`, not `ios/build/` (device.sh `install` checks both).
  Maestro 2.12 writes `takeScreenshot` under its run output dir; `device.sh test` copies it to `.dev-stack/shots/<name>.png`.
  LuLu (firewall, 4.5.1): **Allow Simulator Apps** must be ON (Settings → Rules; enabled 2026-11-23).
  Off, every iOS-simulator daemon and each new install of `proxyapp.app` (new bundle path per build)
  raises its own alert, and the held connections slow or time out Maestro flows. `Allow localhost`
  is already on, so 3333/8081 never prompt; node, java, stripe, Docker and xcodebuild have rules.

- Hackintosh (2026-11-08): Node 26.13, Docker Desktop installed (start it before e2e), Stripe CLI not
  installed, no `eas`/`wrangler`/`aws` CLIs, Lovable prototype only on the MacBook.
- Backend: run `npx prisma generate` before `tsc`/`jest`; e2e writes the untracked `test/.env.test` (P0-T01).
- Backend has no ESLint installed despite the `lint` script (P0 adds it).
