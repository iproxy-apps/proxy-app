# Phase L — Loop infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** stand up everything `../LOOP.md` assumes exists so that the first real task (`P0-T01`) can
run through the full pick → build → review → gate → device → record iteration.

**Architecture:** five small deliverables, two per repo plus one shared: (1) the `release-1.0` branch
and the board plumbing (`## Now` block, task cards), (2) a backend `TestHooksModule` that lets device
flows reset and seed state through HTTP, (3) `scripts/dev-stack.sh` that starts/stops the local
backend stack and tracks only what it started, (4) the Maestro toolchain, scaffold and
`scripts/device.sh`, (5) the visual baseline screenshots captured on the pinned simulator.

**Tech Stack:** NestJS 11 + Prisma (`@prisma/adapter-pg`) + Zod 4 (`z.email()`), Jest + supertest +
Testcontainers; bash; Expo SDK 57 dev client (`npx expo run:ios`), Maestro (needs Java 17+),
`xcrun simctl`.

**Spec:** `../LOOP.md` (§5 loop, §6 state, §8 visual freeze, §9 pyramid/Maestro, §10 dev stack,
§12 resolutions). Decisions: `../DECISIONS.md` D28, D30, D31.

## Global Constraints

- Owner rules (`../START-HERE.md`): pt-BR user-facing copy, prettier only on new files, never
  repo-wide `--fix`, no Claude attribution in commits.
- D30: one commit per task on branch `release-1.0`, message `feat|fix|test|chore(<area>): L-Txx <title>`.
- D31: device steps run on this MacBook only. Pinned devices (iOS 26.5):
  **A (CLIENT)** = iPhone 17 Pro `C29B497C-4443-4138-9DBA-DCFA5836C71E`,
  **B (PROXY)** = iPhone 17e `ADFA408E-172E-426D-B2B0-A3D22DFFC188`.
- LOOP §10: `.env` files are never rewritten; the loop passes overrides in the environment of the
  processes it starts. Only processes/containers the scripts started are stopped by them. Ports:
  api 3333, Metro 8081, Postgres 5432 (compose container `proxy`).
- LOOP §2 anti-goal: nothing outside `proxy-app` / `proxy-api` is read for configuration, started or
  modified, except the two user-level installs in L-T04 (Java runtime, Maestro) authorised 2026-11-23.
- Backend conventions: controllers under `src/modules/<domain>/controllers/<name>.controller.ts`
  with `@Controller('/path')` + `@UsePipes(new ZodValidationPipe(schema))` (see
  `src/modules/auth/controllers/create-account.controller.ts`); errors via `AppException` with
  `errorDictionary` entries (`src/exception/`); e2e specs in `test/<domain>/<name>.e2e-spec.ts` using
  `createTestApp` / `resetDatabase` from `test/setup/test-app.factory.ts`. `import type` for types.
- App conventions: `CLAUDE.md` layering; Maestro files under `proxy-app/.maestro/`; scripts under
  `proxy-app/scripts/`.
- Visual freeze (LOOP §8): Phase L adds **no** UI change. No `testID` is added in this phase; flows
  select by visible pt-BR text or placeholder.

## Review Focus

1. `POST /__test/*` reachable with `LOOP_TEST_HOOKS` unset → must be 404 (L-T02 test "returns 404 when
   the flag is off").
2. `__test/reset` against a non-local database host → must be refused 403, nothing truncated (L-T02
   test "refuses a non-local DATABASE_URL").
3. `dev-stack.sh up` when 3333 is already held by a foreign process → must abort before starting
   anything, exit 1, no pid files written (L-T03 verification step 5).
4. `dev-stack.sh down` after a partial `up` (api started, stripe failed) → stops the api, leaves the
   compose container, removes `.dev-stack/` (L-T03 verification step 7).
5. Maestro `inputText` into the email field with autocorrect/capitalisation → the typed value must be
   exactly the seeded email, or sign-in fails with "Credenciais fornecidas são inválidas."; the sign-in
   flow asserts the Home screen appears (L-T05 flow `baseline/client-shell.yaml`).

---

### Task L-T01: Branch `release-1.0` + board plumbing (both repos)

**Files:**
- Modify: `proxy-app/docs/release-1.0/STATUS.md` (replace the `## Now` section; add the Phase L table
  if missing)
- Modify: `proxy-app/docs/release-1.0/START-HERE.md` ("Session protocol" → point to `LOOP.md` §11)
- Create: `proxy-app/docs/release-1.0/cards/README.md`, `proxy-app/docs/release-1.0/cards/_TEMPLATE.md`
- Commit (already in the tree, uncommitted): `proxy-app/.ai-memory.toml`, `proxy-api/.ai-memory.toml`,
  `docs/release-1.0/LOOP.md`, `docs/release-1.0/DECISIONS.md`, `docs/release-1.0/plans/phase-L-loop-infra.md`

**Interfaces:**
- Produces the `## Now` block shape every later task updates:
  ```markdown
  ## Now

  | Field | Value |
  |---|---|
  | task | `L-T02` |
  | step | build |
  | files touched | `src/modules/test-hooks/...` |
  | last gate | api: tsc ✔ eslint ✔ jest 153/153 ✔ e2e 103/103 ✔ (2026-11-24 09:10) |
  | waiting on owner | — |
  | next task | `L-T03` |
  ```
  `step` ∈ `pick | card | build | review | gate | device | record`. Empty = `—`.
- Produces the task-card template (`cards/_TEMPLATE.md`), sections in this order: `# <task id> —
  <title>`, `## Task text (verbatim from plans/<phase>.md)`, `## Contract rows consumed`, `## Files`,
  `## Visual freeze` (fixed sentence: "No visual change beyond what the task text names. Reuse
  existing components. Compare against `visual-baseline/` before reporting."), `## Device flow`
  (flow files to add/update + assertions, or `none`), `## Gate command`, `## Report format` (fixed:
  "For every claim: file path + command + the exact summary line of its output.").

- [ ] **Step 1: Create the branches.** In each repo: `git checkout -b release-1.0` (from `main`,
  clean tree except the files listed above). Expected: `git branch --show-current` → `release-1.0`
  in both.
- [ ] **Step 2: Rewrite `STATUS.md` "## Now".** Replace the current bullet list under `## Now` with
  the table above, values: task `L-T01`, step `record`, next task `L-T02`. Keep the "Owner inputs still
  open" and "Phase state" lines below the table (Phase state gains `L in_progress`).
- [ ] **Step 3: Add the Phase L table** to `STATUS.md` right after `## Now` (before Phase 0), rows
  `L-T01…L-T05` with titles from this plan, `L-T01` = `in_progress`, others `todo`, deps:
  T02 —, T03 T02, T04 —, T05 T02+T03+T04.
- [ ] **Step 4: `START-HERE.md` "Session protocol"** → replace the three bullets with: "Follow
  `LOOP.md` §11 (resume from `STATUS.md` `## Now`, run §5.2 iterations, §5.3 at phase boundaries)."
- [ ] **Step 5: Create `cards/README.md`** (what a card is, lifecycle: written at `card`, deleted in
  the `done` commit, never edited by subagents) and `cards/_TEMPLATE.md` with the sections above.
- [ ] **Step 6: Verify.** `git status --short` lists only the files above; `grep -c "| step |"
  docs/release-1.0/STATUS.md` → 1; `test -f docs/release-1.0/cards/_TEMPLATE.md`.
- [ ] **Step 7: Commit** in both repos. proxy-app: `chore(docs): L-T01 release-1.0 branch, LOOP design,
  Now block and task cards`; proxy-api: `chore(repo): L-T01 ai-memory marker`. Then set `L-T01` =
  `done` and `Now.task` = `L-T02`, `step` = `pick` in `STATUS.md` and amend the proxy-app commit.

---

### Task L-T02: `TestHooksModule` — reset, seed-user, mark-account-ready (api)

**Files:**
- Create: `proxy-api/src/modules/test-hooks/test-hooks.module.ts`
- Create: `proxy-api/src/modules/test-hooks/test-hooks.guard.ts`
- Create: `proxy-api/src/modules/test-hooks/truncate-tables.ts`
- Create: `proxy-api/src/modules/test-hooks/controllers/reset.controller.ts`
- Create: `proxy-api/src/modules/test-hooks/controllers/seed-user.controller.ts`
- Create: `proxy-api/src/modules/test-hooks/controllers/mark-account-ready.controller.ts`
- Create: `proxy-api/src/modules/test-hooks/use-cases/seed-user.service.ts`
- Modify: `proxy-api/src/env/env.ts` (add `LOOP_TEST_HOOKS`)
- Modify: `proxy-api/src/app.module.ts` (import `TestHooksModule`)
- Modify: `proxy-api/test/setup/test-app.factory.ts:28-37` (import `TRUNCATE_TABLES` from src)
- Test: `proxy-api/src/modules/test-hooks/test-hooks.guard.spec.ts`
- Test: `proxy-api/test/test-hooks/test-hooks.e2e-spec.ts`

**Interfaces:**
- `env.ts`: `LOOP_TEST_HOOKS: z.enum(['0', '1']).default('0')`.
- `truncate-tables.ts`: `export const TRUNCATE_TABLES = ['cards','tasks','users','ratings','payments',
  'stripe_events','user_task_mapping','password_reset_codes'] as const` (moved from the test factory,
  which now imports it).
- `test-hooks.guard.ts`: `export const isTestHooksEnabled = (env: { LOOP_TEST_HOOKS?: string;
  NODE_ENV?: string }): boolean` → `env.LOOP_TEST_HOOKS === '1' && env.NODE_ENV !== 'production'`;
  `export const isLocalDatabase = (databaseUrl: string): boolean` → host of the URL is `localhost`,
  `127.0.0.1` or `::1`. `@Injectable() export class TestHooksGuard implements CanActivate` reads
  `process.env` at request time: not enabled → `throw new NotFoundException()`; enabled but
  `!isLocalDatabase(process.env.DATABASE_URL)` → `throw new AppException({ statusCode: 403,
  errorCode: 'TEST_HOOKS_FORBIDDEN', message: 'Hooks de teste só funcionam contra um banco local.' })`.
- Routes (all `@UseGuards(TestHooksGuard)`, no JWT):
  - `POST /__test/reset` → `@HttpCode(204)`, body ignored; `prisma.$executeRawUnsafe('TRUNCATE TABLE "cards",
    … RESTART IDENTITY CASCADE')` built from `TRUNCATE_TABLES`.
  - `POST /__test/seed-user` body `{ email: z.email(), password: z.string().min(8), name: z.string()
    .default('Usuário Teste'), userType: z.enum(['CLIENT','PROXY']), stripeAccountReady: z.boolean()
    .default(false), stripeAccountId: z.string().nullable().default(null) }` → 201
    `{ id: string, email: string }`. `SeedUserService.execute(input)` creates the row like
    `test/factories/user.factory.ts` does (bcrypt hash cost 8, `isVerified: true`, `termsAccepted:
    true`, `stripeCustomerId: 'cus_test_seed'`, `phoneNumber: '+5511999999999'`); existing email →
    409 via `errorDictionary.user.emailExists(email)`.
  - `POST /__test/mark-account-ready` body `{ email: z.email(), stripeAccountId: z.string()
    .default('acct_test_ready') }` → `@HttpCode(204)`; `prisma.users.update({ where: { email }, data: {
    stripeAccountReady: true, stripeAccountId } })`; unknown email → 404
    `errorDictionary.user.notFound`.
- `TestHooksModule`: `providers: [PrismaService, TestHooksGuard, SeedUserService]`, the three
  controllers; imported unconditionally in `AppModule` (the guard decides at request time, so the
  e2e spec can toggle the flag between tests).

- [ ] **Step 1: Write the failing unit spec** `src/modules/test-hooks/test-hooks.guard.spec.ts`:
  ```ts
  import { isLocalDatabase, isTestHooksEnabled } from './test-hooks.guard'

  describe('isTestHooksEnabled', () => {
    it('is true only for LOOP_TEST_HOOKS=1 outside production', () => {
      expect(isTestHooksEnabled({ LOOP_TEST_HOOKS: '1', NODE_ENV: 'development' })).toBe(true)
      expect(isTestHooksEnabled({ LOOP_TEST_HOOKS: '1', NODE_ENV: 'test' })).toBe(true)
      expect(isTestHooksEnabled({ LOOP_TEST_HOOKS: '1', NODE_ENV: 'production' })).toBe(false)
      expect(isTestHooksEnabled({ LOOP_TEST_HOOKS: '0', NODE_ENV: 'development' })).toBe(false)
      expect(isTestHooksEnabled({})).toBe(false)
    })
  })

  describe('isLocalDatabase', () => {
    it('accepts loopback hosts and rejects everything else', () => {
      expect(isLocalDatabase('postgresql://postgres:docker@localhost:5432/proxy?schema=public')).toBe(true)
      expect(isLocalDatabase('postgresql://u:p@127.0.0.1:5432/proxy')).toBe(true)
      expect(isLocalDatabase('postgresql://u:p@db.railway.internal:5432/proxy')).toBe(false)
      expect(isLocalDatabase('not a url')).toBe(false)
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure.** `npx jest src/modules/test-hooks` → "Cannot find module
  './test-hooks.guard'".
- [ ] **Step 3: Implement** `truncate-tables.ts`, `test-hooks.guard.ts`, `env.ts` change.
- [ ] **Step 4: Run it, expect pass.** `npx jest src/modules/test-hooks` → `Tests: 2 passed`.
- [ ] **Step 5: Write the failing e2e spec** `test/test-hooks/test-hooks.e2e-spec.ts` (pattern of
  `test/cards/fetch-card.e2e-spec.ts`; `createUser` from `../factories/user.factory`):
  ```ts
  describe('/__test hooks (e2e)', () => {
    let ctx: TestAppContext
    beforeAll(async () => { ctx = await createTestApp() })
    afterAll(async () => { await ctx.app.close() })
    beforeEach(async () => { await resetDatabase(ctx.prisma); process.env.LOOP_TEST_HOOKS = '1' })
    afterEach(() => { delete process.env.LOOP_TEST_HOOKS })

    it('returns 404 when the flag is off', async () => {
      process.env.LOOP_TEST_HOOKS = '0'
      const res = await request(ctx.app.getHttpServer()).post('/__test/reset')
      expect(res.status).toBe(404)
    })

    it('refuses a non-local DATABASE_URL', async () => {
      const original = process.env.DATABASE_URL
      process.env.DATABASE_URL = 'postgresql://u:p@db.example.com:5432/proxy'
      await createUser(ctx.app, ctx.prisma)
      const res = await request(ctx.app.getHttpServer()).post('/__test/reset')
      process.env.DATABASE_URL = original
      expect(res.status).toBe(403)
      expect(res.body).toMatchObject({ errorCode: 'TEST_HOOKS_FORBIDDEN' })
      expect(await ctx.prisma.users.count()).toBe(1)
    })

    it('reset truncates every table', async () => {
      await createUser(ctx.app, ctx.prisma)
      const res = await request(ctx.app.getHttpServer()).post('/__test/reset')
      expect(res.status).toBe(204)
      expect(await ctx.prisma.users.count()).toBe(0)
    })

    it('seed-user creates a user that can sign in', async () => {
      const seed = await request(ctx.app.getHttpServer()).post('/__test/seed-user').send({
        email: 'cliente@loop.test', password: 'senha12345', userType: 'CLIENT',
      })
      expect(seed.status).toBe(201)
      expect(seed.body).toMatchObject({ email: 'cliente@loop.test' })
      const session = await request(ctx.app.getHttpServer()).post('/auth/session').send({
        email: 'cliente@loop.test', password: 'senha12345',
      })
      expect(session.status).toBe(200)
    })

    it('seed-user rejects a duplicate email with 409', async () => {
      const body = { email: 'dup@loop.test', password: 'senha12345', userType: 'PROXY' }
      await request(ctx.app.getHttpServer()).post('/__test/seed-user').send(body)
      const res = await request(ctx.app.getHttpServer()).post('/__test/seed-user').send(body)
      expect(res.status).toBe(409)
    })

    it('mark-account-ready flips the flag and sets an account id', async () => {
      const user = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY', stripeAccountReady: false })
      const res = await request(ctx.app.getHttpServer())
        .post('/__test/mark-account-ready').send({ email: user.email })
      expect(res.status).toBe(204)
      const row = await ctx.prisma.users.findUniqueOrThrow({ where: { email: user.email } })
      expect(row).toMatchObject({ stripeAccountReady: true, stripeAccountId: 'acct_test_ready' })
    })

    it('mark-account-ready returns 404 for an unknown email', async () => {
      const res = await request(ctx.app.getHttpServer())
        .post('/__test/mark-account-ready').send({ email: 'ghost@loop.test' })
      expect(res.status).toBe(404)
    })
  })
  ```
- [ ] **Step 6: Run it, expect failure.** Docker running; `npx jest --config test/jest-e2e.config.ts
  --runInBand test/test-hooks` → all 7 fail with 404 (routes absent).
- [ ] **Step 7: Implement** the module, guard class, controllers, service; wire `AppModule`; switch
  `test/setup/test-app.factory.ts` to `import { TRUNCATE_TABLES } from 'src/modules/test-hooks/truncate-tables'`.
- [ ] **Step 8: Run it, expect pass.** Same command → `Tests: 7 passed`.
- [ ] **Step 9: Repo gate.** `npx prisma generate && npx tsc --noEmit && npx jest && npx jest --config
  test/jest-e2e.config.ts --runInBand` → unit 155/155 (153 + 2), e2e 109/110 (103 + 7; the one
  pre-existing red `delete-account` case stays red until P0-T10). `git checkout -- test/.env.test` afterwards.
- [ ] **Step 10: Commit** `feat(api): L-T02 test hooks module (reset, seed-user, mark-account-ready)`;
  STATUS `L-T02` done with evidence line, `Now` → `L-T03`.

---

### Task L-T03: `scripts/dev-stack.sh` (api)

**Files:**
- Create: `proxy-api/scripts/dev-stack.sh` (executable)
- Modify: `proxy-api/.gitignore` (append `.dev-stack/`)
- Modify: `proxy-api/CLAUDE.md` (short "Loop dev stack" section: the three commands)

**Interfaces:**
- Consumes: L-T02 (`LOOP_TEST_HOOKS=1` makes `/__test/*` live).
- Produces: `scripts/dev-stack.sh up|down|status|logs`, state dir `proxy-api/.dev-stack/` with
  `api.pid`, `stripe.pid`, `api.log`, `stripe.log`, `started-postgres` (present only if `up` started
  the compose container). Exit codes: `up` 0 when the api answers, 1 on any precondition failure
  (nothing started), 2 when the api did not answer within 90 s (what was started is stopped again).
- `up` sequence (bash, `set -euo pipefail`, `cd` to the repo root = `dirname "$0"/..`):
  1. Port check: for 3333 and 8081, `lsof -nP -iTCP:$port -sTCP:LISTEN -t`; a listener whose pid is
     not in `.dev-stack/*.pid` → print `port $port is held by pid $pid ($(ps -o comm= -p $pid)); not
     starting` and exit 1. (8081 is checked for information only: a warning, not an abort — Metro is
     the app side's business.)
  2. Postgres: `docker inspect -f '{{.State.Running}}' proxy` → if not `true`, `docker compose up -d
     postgres` and touch `.dev-stack/started-postgres`; wait `docker exec proxy pg_isready -U
     postgres` (max 30 s).
  3. `npx prisma migrate deploy` (uses `.env` `DATABASE_URL`).
  4. Webhook secret: `stripe listen --print-secret` → must start with `whsec_`, else exit 1.
  5. API: `LOOP_TEST_HOOKS=1 STRIPE_WEBHOOK_SECRET=$secret nohup npm run start:dev:api >
     .dev-stack/api.log 2>&1 &` → `echo $! > .dev-stack/api.pid`.
  6. Stripe: `nohup stripe listen --forward-to localhost:3333/stripe/webhook --forward-connect-to
     localhost:3333/stripe/webhook > .dev-stack/stripe.log 2>&1 &` → `stripe.pid`.
  7. Readiness: poll `curl -s -o /dev/null -w '%{http_code}' http://localhost:3333/card/fetch` until
     `401` (max 90 s, 2 s interval); on timeout run `down` and exit 2.
  8. Print: `api 3333 pid …`, `stripe pid …`, `postgres proxy (started by us|pre-existing)`,
     `test hooks: on`.
- `down`: for each `*.pid`: `kill` the **process group** (`kill -- -$(ps -o pgid= -p $pid)`, the api is
  `npm → nest → node`), wait up to 5 s, then `kill -9`; remove `.dev-stack/`. The compose container
  is **never** stopped, even if `started-postgres` exists (LOOP §10 "left as found" means the owner
  may keep using it; the marker is informational).
- `status`: each pid alive/dead, listener on 3333 yes/no, container running yes/no, hooks on/off
  (probe `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:3333/__test/reset` → `204` means on;
  print the code only, do not call it in `status` if the api is down).
- `logs`: `tail -n 50 .dev-stack/api.log .dev-stack/stripe.log`.

- [ ] **Step 1: Write the script** with the interface above; `chmod +x`. Append `.dev-stack/` to
  `.gitignore`.
- [ ] **Step 2: Verify `up`.** `scripts/dev-stack.sh up` → exit 0; `curl -s -o /dev/null -w
  '%{http_code}' localhost:3333/card/fetch` → `401`; `curl -s -o /dev/null -w '%{http_code}' -X POST
  localhost:3333/__test/reset` → `204`; `.dev-stack/` has `api.pid`, `stripe.pid`.
- [ ] **Step 3: Verify `status`** → prints api alive, stripe alive, container running, hooks on.
- [ ] **Step 4: Verify webhook path.** `stripe trigger payment_intent.succeeded` → `.dev-stack/api.log`
  gains a line mentioning `payment_intent.succeeded` (handler logs exist today) within 10 s.
- [ ] **Step 5: Verify foreign-port abort.** `scripts/dev-stack.sh down`; `python3 -m http.server
  3333 &` (note its pid); `scripts/dev-stack.sh up` → exit 1, message names the python pid, no
  `.dev-stack/` dir; `kill` the python server.
- [ ] **Step 6: Verify second `up` is idempotent-safe.** `up` twice → second run exits 0 and reports
  the pids already alive (it must not start a second api).
- [ ] **Step 7: Verify `down` after partial up.** `up`; `kill $(cat .dev-stack/stripe.pid)`; `down` →
  no process on 3333, `.dev-stack/` gone, `docker inspect -f '{{.State.Running}}' proxy` → `true`.
- [ ] **Step 8: Docs.** `proxy-api/CLAUDE.md`: a "Loop dev stack" section with the four commands and
  the sentence "Test hooks (`/__test/*`) are live only under `dev-stack.sh up`; see `src/modules/test-hooks`."
- [ ] **Step 9: Commit** `chore(api): L-T03 dev-stack script for the autonomous loop`; STATUS update.

---

### Task L-T04: Maestro toolchain, scaffold, `scripts/device.sh`, first smoke flow (app)

**Files:**
- Create: `proxy-app/scripts/device.sh` (executable)
- Create: `proxy-app/.maestro/config.yaml`, `proxy-app/.maestro/README.md`
- Create: `proxy-app/.maestro/flows/auth/welcome-to-sign-in.yaml`
- Modify: `proxy-app/.gitignore` (append `.maestro/.maestro/` and `.dev-stack/`)
- Modify: `proxy-app/CLAUDE.md` (short "Device loop" section)
- Modify: `proxy-app/docs/release-1.0/STATUS.md` "Known machine/environment facts" (Java + Maestro
  versions)

**Interfaces:**
- Machine installs (user-level, authorised): `brew install --cask temurin` (Java 21 LTS; Maestro
  requires 17+), then `curl -fsSL "https://get.maestro.mobile.dev" | bash` (installs to
  `~/.maestro/bin/maestro`). Verify: `java -version` prints `openjdk 21…`; `~/.maestro/bin/maestro
  --version` prints a version.
- `scripts/device.sh <cmd>`; device letters resolve through a fixed map at the top of the script:
  `A=C29B497C-4443-4138-9DBA-DCFA5836C71E` (iPhone 17 Pro, iOS 26.5), `B=ADFA408E-172E-426D-B2B0-A3D22DFFC188`
  (iPhone 17e, iOS 26.5). `MAESTRO=${MAESTRO:-$HOME/.maestro/bin/maestro}`. State dir
  `proxy-app/.dev-stack/` (`metro.pid`, `metro.log`).
  - `boot <A|B>`: `xcrun simctl boot <udid>` (ignore "already booted"), `open -a Simulator`.
  - `metro`: abort if 8081 held by a pid not in `metro.pid`; `EXPO_PUBLIC_API_URL=http://localhost:3333
    nohup npx expo start --dev-client --port 8081 > .dev-stack/metro.log 2>&1 &`; wait until `curl -s
    localhost:8081/status` → `packager-status:running` (max 60 s). The shell variable wins over `.env`
    (Expo's env loader never overrides an already-set variable), so `.env` stays untouched.
  - `build <A|B>`: `boot`, then `npx expo run:ios --device <udid> --no-bundler` (first run prebuilds
    `ios/`, gitignored). Installs and launches the dev client on that simulator.
  - `install <A|B>`: `xcrun simctl install <udid> ios/build/Build/Products/Debug-iphonesimulator/proxyapp.app`
    (reuses the artefact from `build` for the second device; the exact `.app` name is whatever
    `build` produced — resolve with `ls ios/build/Build/Products/Debug-iphonesimulator/*.app`).
  - `test <A|B> <flow-or-dir> [extra maestro args]`: `"$MAESTRO" --device <udid> test <path> "$@"`,
    run from the repo root (so `takeScreenshot` paths resolve against it).
  - `shot <A|B> <path-without-ext>`: `xcrun simctl io <udid> screenshot <path>.png`.
  - `down`: kills the Metro process group recorded in `metro.pid`, removes `.dev-stack/`. Does not
    shut simulators down.
- `.maestro/config.yaml`: `flows: ["flows/**"]`. Tags used: `smoke`, `full`, `baseline`, plus one
  area tag (`auth`, `cards`, `tasks`, `wallet`, `history`, `profile`).
- First flow `flows/auth/welcome-to-sign-in.yaml`:
  ```yaml
  appId: com.anonymous.proxyapp
  tags: [smoke, auth]
  ---
  - launchApp:
      clearState: true
  - assertVisible: "Resolva o que precisa."
  - assertVisible: "Criar conta"
  - tapOn: "Já tenho conta"
  - assertVisible: "Bem-vindo de volta"
  - assertVisible: "voce@email.com"
  - takeScreenshot: .dev-stack/shots/auth--sign-in
  ```
  (`clearState` wipes SecureStore so the splash renders instead of redirecting to Home.)
- `README.md`: prerequisites, the device map, how to run one flow / a tag (`device.sh test A
  .maestro/flows --include-tags smoke`), where screenshots land, the rule "select by visible pt-BR
  text; add `testID` only when a flow cannot otherwise select, and only inside the task that needs it".

- [ ] **Step 1: Install the toolchain** (two commands above). Expected: both version checks print.
  Record versions in STATUS "Known machine/environment facts".
- [ ] **Step 2: Write `scripts/device.sh`**, `.maestro/config.yaml`, `.maestro/README.md`, the flow;
  `.gitignore` additions.
- [ ] **Step 3: Verify `metro` + `build A`.** `scripts/device.sh metro` → exit 0; `scripts/device.sh
  build A` → exits 0 after the simulator shows the app's splash ("Resolva o que precisa."). First build
  takes several minutes (CocoaPods + Xcode).
- [ ] **Step 4: Run the flow, expect pass.** `scripts/device.sh test A .maestro/flows/auth/welcome-to-sign-in.yaml`
  → Maestro prints `✅` for every step and `.dev-stack/shots/auth--sign-in.png` exists.
- [ ] **Step 5: Verify `install B` + the flow on B.** `scripts/device.sh boot B && scripts/device.sh
  install B && scripts/device.sh test B .maestro/flows/auth/welcome-to-sign-in.yaml` → passes on B.
- [ ] **Step 6: Verify `down`.** `scripts/device.sh down` → no listener on 8081, `.dev-stack/` gone.
- [ ] **Step 7: Repo gate.** `npx tsc --noEmit && npx eslint .` → exit 0 (no TS change expected; this
  confirms the new files are ignored by eslint or lint clean).
- [ ] **Step 8: Docs.** `proxy-app/CLAUDE.md`: "Device loop" section: the six `device.sh` commands and
  the pointer to `.maestro/README.md`.
- [ ] **Step 9: Commit** `chore(app): L-T04 maestro scaffold, device script and first smoke flow`;
  STATUS update (machine facts + task row).

---

### Task L-T05: Visual baseline capture (app + docs)

**Files:**
- Create: `proxy-app/.maestro/flows/baseline/auth.yaml`
- Create: `proxy-app/.maestro/flows/baseline/client-shell.yaml`
- Create: `proxy-app/.maestro/flows/baseline/proxy-shell.yaml`
- Create: `proxy-app/.maestro/subflows/seed-and-sign-in.yaml`, `proxy-app/.maestro/subflows/seed.js`
- Create: `proxy-app/docs/release-1.0/visual-baseline/INDEX.md` + the `.png` files the flows write
- Modify: `proxy-app/docs/release-1.0/LOOP.md` §8 (one line: baseline captured on device A, iOS 26.5,
  date)

**Interfaces:**
- Consumes: L-T02 hooks (`POST /__test/reset`, `POST /__test/seed-user`), L-T03 `dev-stack.sh up`,
  L-T04 `device.sh` + the `com.anonymous.proxyapp` dev build.
- `subflows/seed.js` (Maestro JS, run with `runScript`; env `API`, `EMAIL`, `PASSWORD`, `USER_TYPE`,
  `READY`):
  ```js
  const api = API
  http.post(api + '/__test/reset', { headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const res = http.post(api + '/__test/seed-user', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, userType: USER_TYPE,
      name: USER_TYPE === 'PROXY' ? 'Proxy Baseline' : 'Cliente Baseline',
      stripeAccountReady: READY === '1' }),
  })
  if (res.status !== 201) throw new Error('seed-user failed: ' + res.status + ' ' + res.body)
  ```
- `subflows/seed-and-sign-in.yaml` (parameters `EMAIL`, `PASSWORD`, `USER_TYPE`, `READY` default `0`,
  `API` default `http://localhost:3333`): `runScript: seed.js` → `launchApp: { clearState: true }` →
  `tapOn: "Já tenho conta"` → `tapOn: "voce@email.com"` → `inputText: ${EMAIL}` → `tapOn: "Sua senha"`
  → `inputText: ${PASSWORD}` → `tapOn: "Entrar"` → `extendedWaitUntil: { visible: "Perfil", timeout:
  15000 }` (tab label present for both roles).
- Screenshot naming (LOOP §8): `docs/release-1.0/visual-baseline/<route>--<state>` where `<route>` is
  the Expo Router path with `/` → `-` and groups dropped (`auth-sign-in`, `tabs-home`), `<state>` ∈
  `empty | filled | selected | error | loaded`. Flows call `takeScreenshot:
  docs/release-1.0/visual-baseline/<name>` (Maestro appends `.png`; run from the repo root).
- `baseline/auth.yaml` (tag `baseline`): `index--empty`, `auth-choose-profile--empty`,
  `auth-choose-profile--selected` (after `tapOn: "Quero contratar serviços"`), `auth-sign-up--empty`
  (after `tapOn: "Continuar"`); navigate back with `tapOn: "Voltar"` (the `ScreenHeader` back button's
  `accessibilityLabel`, which Maestro matches on iOS) twice, then `tapOn: "Já tenho conta"` →
  `auth-sign-in--empty`, `tapOn: "Esqueci a senha"` → `auth-forgot-password--empty`. 6 shots.
- `baseline/client-shell.yaml`: `runFlow: ../../subflows/seed-and-sign-in.yaml` with
  `EMAIL=cliente@baseline.test PASSWORD=senha12345 USER_TYPE=CLIENT`; then `tabs-home--empty`,
  `tapOn: "Histórico"` → `tabs-history--empty`, `tapOn: "Perfil"` → `tabs-profile--loaded`,
  `tapOn: "Cartão"` (row label, `app/(app)/(tabs)/profile.tsx:95`) → `cards--empty`, `tapOn: "Voltar"`,
  `tapOn: "Início"`, `tapOn: "Nova tarefa"` (CTA text, `ClientHome.tsx:176`; its `accessibilityLabel`
  is "Criar nova tarefa") → `tasks-create--step1-empty`. 5 shots.
- `baseline/proxy-shell.yaml`: seed `proxy@baseline.test` `USER_TYPE=PROXY READY=0`; `tabs-home--empty`
  (proxy list; tab label is "Tarefas"), `tapOn: "Carteira"` → `assertVisible: "Configurar recebimento"`
  → `tabs-wallet--not-onboarded`, `tapOn: "Histórico"` → `tabs-history--empty`, `tapOn: "Perfil"` →
  `tabs-profile--loaded`. 4 shots. Client and proxy shots of the same route differ by role, so the
  proxy files carry a `proxy-` prefix (`proxy-tabs-home--empty`, …).
- `INDEX.md`: header stating device A, iOS 26.5, capture date, app commit; then a table
  `file | route | state | how to reach (flow + step)`; then the standing rule: "Before an app task
  changes a screen or state not listed here, the orchestrator captures it first (same device, same
  naming) and adds the row; Phase 4 replaces this whole set."

- [ ] **Step 1: Bring the stack up.** `proxy-api/scripts/dev-stack.sh up` and
  `proxy-app/scripts/device.sh metro && scripts/device.sh build A` (or `install A` if the build from
  L-T04 is current).
- [ ] **Step 2: Write `subflows/seed.js`, `subflows/seed-and-sign-in.yaml`.**
- [ ] **Step 3: Run the subflow alone, expect pass.** `scripts/device.sh test A
  .maestro/subflows/seed-and-sign-in.yaml -e EMAIL=cliente@baseline.test -e PASSWORD=senha12345 -e
  USER_TYPE=CLIENT` → ends on the tabs (Review Focus 5: if sign-in fails, add
  `autoCorrect`-safe typing: `inputText` after `tapOn` on the placeholder, and `hideKeyboard` before
  tapping "Entrar").
- [ ] **Step 4: Write the three baseline flows**, confirming each tapped label against the screen
  source first (file paths above).
- [ ] **Step 5: Capture.** `scripts/device.sh test A .maestro/flows/baseline` → all three pass;
  `ls docs/release-1.0/visual-baseline/*.png | wc -l` → 15.
- [ ] **Step 6: Eyeball every PNG** (open them; the orchestrator does this, not a subagent) and
  confirm each shows the state its name claims. Write `INDEX.md`.
- [ ] **Step 7: Note in `LOOP.md` §8** the capture date, device A, iOS 26.5 and the proxy-app commit.
- [ ] **Step 8: Tear down.** `scripts/device.sh down`; `proxy-api/scripts/dev-stack.sh down`.
- [ ] **Step 9: Commit** `docs(app): L-T05 visual baseline (15 screens) and baseline flows`; STATUS:
  `L-T05` done, Phase L `done`, `Now` → `P0-T01` step `pick`.

---

## Phase done-when

- Both repos on `release-1.0` with one commit per task above.
- `STATUS.md` has the `## Now` table and the Phase L table all `done`.
- `dev-stack.sh up` → api 401 probe + `/__test/reset` 204; `down` leaves only the compose container.
- `device.sh test A .maestro/flows --include-tags smoke` passes; `docs/release-1.0/visual-baseline/`
  holds 15 PNGs + `INDEX.md`.
- Not in this phase (added when needed): `scripts/two-device.sh` (end of Phase 3), Maestro flows for
  cards/tasks/wallet (land with their Phase 3 tasks), `LOOP_TEST_HOOKS` rejection in the production
  env schema (P5-T10).
