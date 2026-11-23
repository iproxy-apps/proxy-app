# LOOP — how the autonomous dev→test loop runs (design, 2026-11-23)

Companion to `PLAN.md` §3–§4. `PLAN.md` says *what* to build and in which order; this file says *how
a session turns the task queue into verified, owner-trusted code* without losing state across context
compaction, without agents inventing facts, and without touching the validated visuals before Phase 4.

## 1. Intent

The owner (solo, side project) wants Claude to drive the 1.0 work end to end: implement each task,
prove it with code-level tests **and** by exercising the real app on the iOS simulator against the real
backend in Stripe test mode, and keep going task after task until the MVP target is reached.

Targets, in order (owner decision 2026-11-23):

1. **MVP-functional** — Phases 0, 1, 2, 3 done + the two-device script (`QA-CHECKLIST.md` §6.3) green on
   two simulators with Stripe test keys.
2. **MVP-visual** — Phase 4 (UI revamp + light/dark) on top of 1.
3. **Stores** — Phases 5 and 6.

## 2. Goals / non-goals / anti-goals

Goals
- Every task ends with evidence: failing test → passing test, repo gate green, and for app tasks a
  simulator run with screenshots the owner can look at.
- State survives compaction, new sessions and machine switches: a fresh agent can resume from git alone.
- Agents never guess: each one works from the written task, the pinned contract and the real code, and
  reports what it verified, not what it believes.
- Visual output stays exactly what the owner already validated until Phase 4 begins.

Non-goals
- Replacing the phase plans. They stay the unit of work.
- Full pixel-diff CI for the app in Phases 0–3. Screenshots are for human and agent eyes, not a gate.
- Android in Phases 0–3 (simulator loop is iOS only; Android enters in Phase 5/6).

Anti-goals (a failure even if the code works)
- Any process started, file edited or port taken in a repository other than `proxy-app` / `proxy-api`.
- A task marked `done` whose evidence was not produced in that session.
- A "while I'm here" redesign of a screen the owner already validated.
- A STATUS board that lags the code.

## 3. Constraints

- Owner rules from `START-HERE.md` (pt-BR copy, no repo-wide formatting, D30 commit policy, D28 as settled).
- Runs on the MacBook Pro M5 only (D31). Single simulator pair: device tests run serially, orchestrated by the main session.
- Backend needs Docker (Testcontainers), the Stripe CLI (`stripe listen`) and a Postgres on 5432.
- Expo SDK 57 / RN 0.86 (per `package.json`; `CLAUDE.md` still says 54 — P3-T22 fixes the doc).
- Context compaction will happen several times per phase; nothing important may live only in the
  conversation.

## 4. Approaches considered

| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | One agent, one session, task by task | Cheapest; but 92 tasks in one context means repeated compaction, no independent review, fully serial | rejected |
| B | **Orchestrator + fresh subagent per task + reviewer; orchestrator owns verification and the simulator** | More tokens; but fresh context per task, built-in review, compaction-proof because state lives in git, api/app phases can overlap | **chosen** |
| C | Declarative multi-agent workflow per phase | Max parallelism; but the simulator is one resource, device results need visual judgement, and the pipeline cannot interleave owner input | rejected |

## 5. The loop (approach B, decided)

### 5.1 Roles

- **Orchestrator** — the interactive session. Only it edits `STATUS.md`, runs verification gates, drives
  the simulator, talks to the owner. Keeps its own context small: it reads task cards, not whole plans.
- **Implementer** — fresh subagent per task. Receives the *task card* (below), writes tests first, then
  code, runs the repo gate, reports a *task report*. Never edits `STATUS.md` or files outside the task.
- **Reviewer** — fresh subagent per task. Receives the task card + the diff. Checks plan conformance,
  conventions (`CLAUDE.md`), layering, copy rules, visual freeze. Reports findings with file:line.

### 5.2 One iteration

```
pick     next `todo` whose deps are `done` (STATUS.md)            → mark in_progress, write Now block
card     build task card = phase-plan task text + pinned contract rows + file list + visual-freeze rule
build    implementer subagent (TDD)                                → task report
review   reviewer subagent                                        → findings; implementer fixes; re-review once
gate     orchestrator runs the repo gate itself (never trusts the report):
           api: npx prisma generate && npx tsc --noEmit && npx eslint ... && npx jest && npm run test:e2e
           app: npx tsc --noEmit && npx eslint . && npm test
device   if the task touches an app flow: dev-stack up → Maestro flow(s) tagged for that flow → screenshots
record   STATUS.md: done (+ evidence line) · Now block cleared · owner-facing "test this flow" note
next
```

Task that needs the owner (console action, product call) → `blocked` with the question written in
`STATUS.md` "Now → Waiting on owner"; the loop continues with the next unblocked task.

### 5.3 Phase boundary

1. Full regression: both repo gates + **all** Maestro flows (`smoke` + `full`).
2. Two-device script §6.3 (as far as the phase allows) on simulators A (CLIENT) and B (PROXY).
3. `STATUS.md` phase row updated; `DECISIONS.md` defaults touched during the phase marked SETTLED.
4. ai-memory handoff written; owner gets a short summary and the list of flows to try by hand.

## 6. State that survives compaction (decided)

Git is the memory. The conversation is a cache.

- **Commits (D30, settled 2026-11-23).** Work happens on branch `release-1.0` in each repo. The
  orchestrator commits **one commit per task** when the task reaches `done`
  (`feat|fix|test|chore(<area>): <task id> <title>`, no Claude attribution, `STATUS.md` and card
  deletion in the same commit). It never pushes and never touches `main`. The reviewer's diff is
  `git diff` of the working tree against the branch head, so it is exactly one task.
  **Two-commit rule:** for a task whose code lives in proxy-api, the orchestrator commits the code in
  proxy-api and the STATUS/card change in proxy-app as `chore(docs): <task id> status`; app-side tasks
  carry the STATUS change in their own commit.

- **`STATUS.md` → `## Now` block** (new, replaces the one-liner) always holds:
  `task`, `step` (pick/card/build/review/gate/device/record), `files touched so far`, `last gate result`,
  `waiting on owner`, `next task`. Updated at every step change, not only at task end. After compaction the
  orchestrator re-reads this block first and resumes from `step`.
- **Evidence line per task** in the STATUS table `Notes` column: `jest 12/12 · e2e 3/3 · maestro
  sign-up,sign-in · shots 2026-11-24` — short, so the board stays readable.
- **Task cards are written to disk**, `docs/release-1.0/cards/<task-id>.md`, before dispatch. A subagent
  that dies or an orchestrator that compacts re-dispatches from the file, not from memory. Cards are
  deleted when the task is `done` (the plan + STATUS evidence are the record).
- **Handoff** via ai-memory (`ai-memory-handoff` skill) at every phase boundary and at session end,
  pointing to this folder and the next task. Single ai-memory project: `default/iproxy-apps-proxy-app`
  (marker `.ai-memory.toml` in both repos).
- **Orchestrator hygiene**: subagent outputs are summarised into the task report file
  (`cards/<task-id>.report.md`, deleted with the card); raw tool output never accumulates in the main
  context.

## 7. Anti-hallucination rules (decided)

- An implementer gets **exactly** the task text from the phase plan (it is written for someone who has
  not seen the code) plus the contract rows it consumes. No paraphrase by the orchestrator.
- Every claim in a task report must name a file and a command output. "Tests pass" without the jest
  summary line is rejected and the gate is re-run.
- The orchestrator runs the gates itself. Subagent-reported green is a hint, not evidence.
- Backend contract is pinned once in `plans/phase-3-app-flows.md` ("Backend contract this phase
  consumes"). Phase 1–2 implementers receive the same rows; drift is a review finding, not a judgement call.
- Decisions: a subagent that finds a `DECISIONS.md` row wrong stops and reports; it never applies its
  own default. The orchestrator records the problem in `STATUS.md` (PLAN §4 rule 4).
- Copy: pt-BR strings come from the plan or from existing screens; no new tone invented.
- Reviewer runs with no knowledge of the implementer's reasoning, only the card and the diff.

## 8. Visual freeze until Phase 4 (decided)

The owner validated the current screens. Until Phase 4 starts, the app's look is frozen.

- **Reference set**, in this order of authority: (1) the current screens as they render today,
  captured as a **baseline screenshot set** before the first Phase 3 task; (2) `CLAUDE.md` design
  system + screen skeleton; (3) existing components in `src/shared` and `src/feature/*/components`;
  (4) the Lovable prototype (`~/Downloads/proxy-prototype`) only for screens that do not exist yet
  (History) and only for structure, never colours.
- **Baseline capture** (one-time, before P3-T01): dev build on the simulator, one screenshot per screen
  and per major state, stored in `docs/release-1.0/visual-baseline/<route>--<state>.png` with an index
  `visual-baseline/INDEX.md` (route, state, how to reach it). Committed on `release-1.0` (D30). Phase 4 replaces it.
  **Captured 2026-11-23** (L-T05): 15 screens on device A (iPhone 17 Pro, iOS 26.5), app source `e7ed12e`, flows `.maestro/flows/baseline/`.
- **Rule for implementers**: a Phase 0–3 task may add or change layout only where its task text says
  so (e.g. `PaymentStatusBanner`, History tab, `QueryErrorCard`). New UI reuses an existing component or
  copies the structure of a named existing screen. No new colours, radii, type sizes, spacing scales,
  icons or motion. Inline `style` only for the NativeWind gotchas already listed.
- **Rule for the reviewer**: any visual change not named in the task card is a blocking finding.
- **Rule for the orchestrator**: after each app task, screenshots of the touched screens are compared
  by eye against the baseline; differences not called for by the task reopen the task.
- Phase 4 lifts the freeze deliberately: new baseline, design session with the owner, partner feedback.

## 9. Test pyramid and cadence (decided)

| Level | api | app | When |
|---|---|---|---|
| Static | `tsc`, `eslint` | `tsc`, `eslint` | every task |
| Unit / render | `jest` (37 suites today) | `jest-expo` + RNTL (P0-T14 creates it) | every task |
| Integration | Testcontainers e2e (22 suites, Docker) | — | every api task; app tasks that change a consumed route |
| Device | — | **Maestro** flows against dev build + local api + `stripe listen` | every app task touching a flow (`smoke` tag); all flows at phase end |

Maestro layout (`proxy-app/.maestro/`):

```
.maestro/
  config.yaml                 # flows dir, tags
  flows/
    auth/sign-up-client.yaml  auth/sign-up-proxy.yaml  auth/sign-in.yaml  auth/forgot-password.yaml
    cards/add-card-4242.yaml  cards/add-card-3ds.yaml
    tasks/create-task.yaml    tasks/proxy-start.yaml   tasks/proxy-finish.yaml
    tasks/client-validate.yaml tasks/client-cancel.yaml
    wallet/onboarding.yaml    history/tabs.yaml
    profile/delete-account.yaml
  subflows/                   # login-as, reset-backend-state, grant-location
  README.md                   # how to run, device ids, tags
```

Each flow: `appId: com.anonymous.proxyapp`, `tags: [smoke|full, <area>]`, ends with
`takeScreenshot`. Flows are written together with the task that makes the flow possible (e.g.
`cards/add-card-4242.yaml` lands with P3-T10) and are regression from then on.

Two-device script: `scripts/two-device.sh` boots simulators A and B, installs the same dev build on
both (`xcrun simctl install`), runs the §6.3 steps as alternating `maestro --device <udid> test` calls,
and collects screenshots into `scratch/runs/<timestamp>/`.

## 10. Dev stack and isolation (decided)

`proxy-api/scripts/dev-stack.sh up | down | status`:

- Postgres: the repo's own `proxy-api/docker-compose.yml` container (`proxy`, 5432) and the database
  named in `proxy-api/.env` (owner decision 2026-11-23: no separate loop database). The reset hook
  therefore wipes the dev database; that is accepted for this personal project. `.env` files are never
  rewritten; anything the loop needs differently is passed in the environment of the processes it starts.
- `up`: checks 3333 and 8081 are free (**aborts if taken by a process it did not start**), ensures the
  compose container is up and migrations applied (`prisma migrate deploy`), starts
  `npm run start:dev:api` (3333) with `LOOP_TEST_HOOKS=1`, starts `stripe listen --forward-to
  localhost:3333/stripe/webhook --forward-connect-to …` and injects the printed webhook secret(s) into
  the api process environment; records every PID/container it started in `proxy-api/.dev-stack/`
  (gitignored).
- `down`: stops **only** what `.dev-stack/` lists (the compose container is left as found).
- Test hooks (`reset-backend-state`, `mark-account-ready`, seed users) live in a `TestHooksModule`
  registered unconditionally; a request-time guard returns 404 unless `LOOP_TEST_HOOKS=1` **and**
  `NODE_ENV !== 'production'`, and 403 unless the database host is loopback; the production env
  schema (P5-T10) rejects the variable outright.
- App side: `expo run:ios --device "<udid>"` once per native-dependency change; Metro started with
  `EXPO_PUBLIC_API_URL=http://localhost:3333` in its environment (the simulator reaches the host as
  localhost); reused across runs.
- Nothing outside the two Proxy repos is read for configuration, started, or modified. The compose
  container is named `proxy` so a stray one is identifiable.

## 11. Session protocol (replaces START-HERE "Session protocol")

Start: read `START-HERE.md` → `STATUS.md` `## Now` → this file §5. If `Now.step` is set, resume there.
Work: §5.2 iterations. Owner input needed → `blocked`, continue.
End or phase boundary: §5.3; `STATUS.md` session log row; ai-memory handoff.

## 12. Resolutions from the builder check (2026-11-23)

Decided by the orchestrator (owner may override):

- **Stripe Connect onboarding in automation.** Hosted onboarding runs in `ASWebAuthenticationSession`,
  which Maestro cannot drive, and test-mode verification has hung in async review before. Automated
  path: `wallet/onboarding.yaml` taps "Configurar recebimento", asserts the browser sheet opened, then
  the flow calls the test hook `mark-account-ready` (or `stripe trigger account.updated` with the
  account id) and asserts the Wallet shows "Conta pronta" after refresh. The real hosted flow is
  verified by hand once in Phase 6 (§6.1 row 6).
- **§6.3 steps on a simulator: accepted substitutes.** Step 6 camera HEIC → `xcrun simctl addmedia`
  with a HEIC file + library picker; airplane-mode toggle → pause the api process (`kill -STOP`) during
  upload, resume after; step 10 token expiry → `JWT_EXPIRES_IN` env override on the loop api; step 11
  deep link signed-out → `xcrun simctl openurl` after `simctl terminate`; step 12 dark mode → deferred
  to Phase 4 (not part of target 1). Anything else that cannot be reproduced is listed in
  `QA-CHECKLIST.md` as "by hand, Phase 6" instead of silently skipped.
- **Maestro flows authorship.** The orchestrator appends a "Device flow" section to the task card
  (which flow files to add/update and what they must assert); the implementer writes them with the task.
- **Phase gating.** Phase 3 tasks start only after the Phase 1–2 tasks they consume are `done`; when
  api and app tasks are both unblocked, api first.
- **Tooling install.** The owner authorised installing Maestro on 2026-11-23. Maestro needs a Java 17+
  runtime, absent on this machine: `brew install --cask temurin` (or `openjdk@17`) + the Maestro
  installer to `~/.maestro`. These are user-level installs, not repository edits, and are the only
  machine-level changes the loop makes; both recorded in STATUS "Known machine facts".

Owner decisions (2026-11-23, recorded in `DECISIONS.md`):

- **D30 — commits:** one commit per task on `release-1.0`, orchestrator commits, owner pushes (§6).
- **D31 — machines:** MacBook Pro M5 only runs the loop and the device steps; baseline pinned to one
  simulator.

## 13. Left to the builder

- Exact Maestro selectors (prefer `testID` added to components; add `testID` only where a flow needs it).
- Whether `dev-stack.sh` seeds demo accounts (D27) or flows create their own users; recommendation: flows
  create their own, with a `reset-backend-state` subflow calling a test-only endpoint guarded by
  `NODE_ENV !== production`.
- Screenshot naming and how many states per screen in the baseline (minimum: empty, loaded, error).
- Order of overlapping Phase 2 (api) and Phase 3 (app) tasks when both are unblocked: default api first.
