# Phase 0 — Foundations: tests, CI, hygiene (both repos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make both repos verifiable by an agent without the owner — `tsc`, lint, unit and e2e green in
GitHub Actions on `main` — while fixing the global backend defects every later phase depends on
(throttler, one Prisma client, PT error contract, UUID validation, health route) and giving the app a
test runner.

**Architecture:** Backend changes are confined to the cross-cutting layer (`src/main.ts`,
`src/app.module.ts`, `src/exception/*`, `src/pipes/*`, `src/prisma/*`, a new `src/health/*`), the
module wiring files and the test harness under `test/`; no use-case or repository logic changes. App
changes add a Jest runner (`jest-expo` + RNTL), a fail-fast env module in `src/common/`, and dependency
hygiene; no screen logic changes. Both repos gain `.github/workflows/ci.yml`, `.nvmrc` and `engines`.

**Tech stack:** proxy-api — NestJS 11.1.11, Prisma 7.3.0 (`@prisma/adapter-pg`), Zod 4.3.4,
`@nestjs/throttler` 6.5.0, Jest 30.3.0 + ts-jest 29.4.9, `@testcontainers/postgresql` 11.14.0,
supertest 7.2.2, TypeScript 5.9.3; new dev deps ESLint 9.39.x + typescript-eslint 8.72.x. proxy-app —
Expo SDK 57 (`expo` ~57.0.32 after `--fix`), React Native 0.86.3, React 19.2.3, TypeScript 6.0.3,
NativeWind 4.2.3; new dev deps `jest-expo` ~57.0.6, `jest` ~29.7.0, `@types/jest` ^29.5.14,
`@testing-library/react-native` 14.1.0. Node 22 LTS in CI and Docker (owner's machine runs Node 26;
nothing here requires >22).

**Spec:** ../PLAN.md §2 (Phase 0), ../DECISIONS.md (D17, D25, D28), SPEC.md §3.3 (new error codes
added), SPEC.md §3.4 (throttle table), proxy-api `CLAUDE.md` (rate-limiting line, route map, health).

## Global constraints

- Never start the dev server / Expo / app (`npm run dev`, `npm start`, `expo start`, `expo run:*`).
  Verification is static + Jest only (D28). Inspecting a deployed URL is fine.
- Never run repo-wide format/fix scripts (`npm run format`, `eslint --fix`, `prettier --write .`).
  Prettier only on files you create. The backend `lint` script currently runs `--fix` — P0-T09
  changes that; until then do not run `npm run lint` in proxy-api.
- Leave work as uncommitted changes; the owner commits. The one exception is the staging command
  `git rm --cached test/.env.test` in P0-T01, which is the task itself (no commit).
- Prettier config in both repos: **no semicolons, single quotes, trailing commas**. App additionally
  uses `prettier-plugin-tailwindcss`.
- Backend conventions: 1 controller = 1 route; Zod schemas inline in controllers; domain errors are
  `throw new AppException(errorDictionary.xxx.yyy)`; dictionary messages in Portuguese; path alias
  `src/*`; module domain types in `types/index.d.ts`; unit specs co-located
  (`<name>.service.spec.ts`), e2e in `test/<module>/<endpoint>.e2e-spec.ts`.
- App conventions: all user-facing copy in pt-BR; `import type { ... }` for types; `T`-prefixed names
  only for backend entity/payload types (local types un-prefixed); kebab-case non-component files,
  PascalCase components; path alias `@/*` → `src/*`; `common/` is a leaf layer (no imports from other
  layers); `app/` routes are thin glue.
- Phase 0 does not touch money math, use-cases, repositories, or screens. If a task seems to need it,
  stop and write the problem under the task in `../STATUS.md`.
- The red e2e test `test/auth/delete-account.e2e-spec.ts:103-114` is **not** fixed here; P0-T10 parks
  it with a pointer to Phase 2 (BE-17 / D13) so CI can be green.
- Verification commands (from ../PLAN.md §3), run before claiming any task done:
  - api: `npx prisma generate && npx tsc --noEmit --skipLibCheck false && npx eslint "{src,test}/**/*.ts" && npx jest && npm run test:e2e`
    (the `eslint` step exists only after P0-T09; before that run the other four). The e2e suite needs
    Docker running (`docker info`).
  - app: `npx tsc --noEmit && npx eslint . && npm test` (the `npm test` step exists after P0-T14).
- Machine note: until P0-T01 lands, the e2e run rewrites the tracked `test/.env.test`; run
  `git checkout -- test/.env.test` afterwards.

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P0-T01 | Test infra hygiene: factory claim, dotenv override, untrack `.env.test`, TRUNCATE guard | — | BE-43 | `npx tsc --noEmit` → 0 errors; `test/setup/assert-test-database-url.e2e-spec.ts` |
| P0-T02 | Strict typing: declare `Decimal`/`DocumentType`, `noImplicitAny`, `--skipLibCheck false` gate | P0-T01 | BE-39 (typing part) | `npx tsc --noEmit --skipLibCheck false` → 0 errors |
| P0-T03 | Global `PrismaModule`, one client, `PaymentsModule` exports | — | BE-36, REL-16 | `npx jest src/prisma/prisma.module.spec.ts` |
| P0-T04 | `configureApp`: CORS, filter, shutdown hooks, `TRUST_PROXY`, Logger in bootstrap | P0-T03 | BE-42, BE-48 (partial), REL-16 | `npx jest src/configure-app.spec.ts` |
| P0-T05 | PT error contract: Zod pipe, Throttler/Unauthorized/413/404 and Prisma mapping in the filter | — | BE-33 (mapping), BE-34, BE-48 (filter) | `npx jest src/exception src/pipes`; e2e assertions listed in the task |
| P0-T06 | Throttler: one default 100/min, 5/min on the four public auth routes, trust-proxy behaviour | P0-T04, P0-T05 | BE-04, BE-42 | `test/app/throttle.e2e-spec.ts` |
| P0-T07 | `z.uuid()` on every `:id` param and `taskId` body | P0-T05 | BE-33 (ids) | `fetch-task-by-id`, `delete-card`, `start-task`, `fetch-task-proof` e2e cases listed |
| P0-T08 | `GET /health` (public, unthrottled, DB ping) | P0-T03, P0-T05 | BE-48 (health), REL-10 | `test/health/health.e2e-spec.ts`; `npx jest src/health` |
| P0-T09 | ESLint 9 flat config for proxy-api, `lint` without `--fix` | — | REL-10 (CI lint step), A4-P3 lint | `npx eslint "{src,test}/**/*.ts"` → exit 0 |
| P0-T10 | Park the red `delete-account` e2e case with a Phase 2 pointer | — | (PLAN §2 Phase 0 done-when) | `npm run test:e2e` → 22 suites pass, 1 skipped |
| P0-T11 | Dockerfile, `.dockerignore`, `.nvmrc`, `engines` for proxy-api | P0-T08 | REL-10 (partial), D25 | `docker build -t proxy-api:phase0 .` → exit 0 |
| P0-T12 | GitHub Actions workflow for proxy-api | P0-T01…T11 | BE-44 (harness only), REL-10 | `gh run list --workflow ci.yml --limit 1` → `completed success` |
| P0-T13 | App dependency hygiene: drop `newArchEnabled`, `expo install --fix`, remove datetimepicker | — | D17, PLAN §2 Phase 0 | `CI=1 npx expo install --check` → up to date; `npx tsc --noEmit` |
| P0-T14 | App test runner: jest-expo + RNTL + `Button` render test + `npm test` | P0-T13 | PLAN §2 Phase 0, D28 | `npm test` → 3 passed |
| P0-T15 | `src/common/env.ts` fail-fast + consumers | P0-T14 | APP-15 | `npx jest src/common/read-env.test.ts` → 7 passed |
| P0-T16 | App `.nvmrc`, `engines`, GitHub Actions workflow | P0-T13, P0-T14, P0-T15 | REL-10 (partial) | `gh run list --workflow ci.yml --limit 1` → `completed success` |

## Review focus

1. **A body that fails Zod validation still consumes the 5/min auth bucket** (guards run before pipes).
   Expected: the 6th `POST /auth/session` with `{}` is 429 even though the first five were 400.
   Owned by P0-T06 (`limits %s to 5 requests per minute per IP`).
2. **`X-Forwarded-For` spoofing vs. shared bucket**: with `TRUST_PROXY=0` the header is ignored (all
   callers behind a PaaS share one bucket); with `TRUST_PROXY=1` distinct forwarded IPs get distinct
   buckets. Owned by P0-T06 (`trust proxy` describe).
3. **Non-UUID ids** (`GET /tasks/abc`, `DELETE /card/abc`, `{ taskId: 'abc' }`) must be 400
   `VALIDATION_FAILED`, never 500. Owned by P0-T07; the Prisma `P2023` fallback is unit-tested in P0-T05.
4. **Proof upload above 10 MB** must be 413 `FILE_TOO_LARGE` in Portuguese, not `File too large`.
   Owned by P0-T05 (`finish-task.e2e-spec.ts` new case).
5. **A shell `DATABASE_URL` pointing at the dev database** must never be truncated by the e2e suite.
   Owned by P0-T01 (`assert-test-database-url.e2e-spec.ts`).
6. **A build with the placeholder Stripe key `pk_test_xxx` or an empty API URL** must crash at
   startup instead of booting with a dead `CardField`. Owned by P0-T15 (`read-env.test.ts`).

---

### Task P0-T01: Test infra hygiene (BE-43)

**Files:**
- Modify: `proxy-api/test/factories/user.factory.ts:64-81` (session payload literal)
- Modify: `proxy-api/test/setup/load-env.ts:4`
- Modify: `proxy-api/.gitignore` (append `test/.env.test` after line 60)
- Create: `proxy-api/test/setup/assert-test-database-url.ts`
- Modify: `proxy-api/test/setup/test-app.factory.ts:53-58` (`resetDatabase`)
- Test: `proxy-api/test/setup/assert-test-database-url.e2e-spec.ts`

**Interfaces:**
- Consumes: `SessionPayload` from `src/modules/auth/utils/jwt.strategy.ts:32` (has
  `stripeAccountReady: boolean`, defaulted in the schema but required in the inferred type).
- Produces: `assertTestDatabaseUrl(url: string | undefined): void` — throws
  `Error('refusing to TRUNCATE: DATABASE_URL does not point at the Testcontainers database "proxy_test" (got <host>/<db>)')`
  unless `new URL(url).pathname === '/proxy_test'`. `resetDatabase` calls it first.

- [ ] **Step 1: Write the failing test** — `test/setup/assert-test-database-url.e2e-spec.ts`:
  ```ts
  import { assertTestDatabaseUrl } from './assert-test-database-url'

  describe('assertTestDatabaseUrl', () => {
    it('accepts the Testcontainers database', () => {
      expect(() =>
        assertTestDatabaseUrl('postgresql://test:test@localhost:55001/proxy_test'),
      ).not.toThrow()
    })

    it('refuses the local dev database', () => {
      expect(() =>
        assertTestDatabaseUrl(
          'postgresql://postgres:docker@localhost:5432/proxy?schema=public',
        ),
      ).toThrow(/refusing to TRUNCATE/)
    })

    it('refuses an unset URL', () => {
      expect(() => assertTestDatabaseUrl(undefined)).toThrow(/refusing to TRUNCATE/)
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npm run test:e2e -- test/setup/assert-test-database-url.e2e-spec.ts`
  → `Cannot find module './assert-test-database-url'`. Also `npx tsc --noEmit` → exactly one error:
  `test/factories/user.factory.ts(64,9): error TS2741: Property 'stripeAccountReady' is missing`.
- [ ] **Step 3: Implement** —
  - `test/setup/assert-test-database-url.ts`: `export const TEST_DATABASE_NAME = 'proxy_test'` and
    `export function assertTestDatabaseUrl(url: string | undefined): void` (wrap `new URL(url)` in
    try/catch; an unparsable or undefined URL also throws the same message with `got "<unset>"`).
  - `test-app.factory.ts:53-58`: first statement of `resetDatabase` is
    `assertTestDatabaseUrl(process.env.DATABASE_URL)`.
  - `user.factory.ts`: add `stripeAccountReady: user.stripeAccountReady,` after line 76
    (`stripeAccountId: user.stripeAccountId,`).
  - `load-env.ts:4`: `config({ path: resolve(__dirname, '..', '.env.test'), override: true })`.
  - `.gitignore`: append a line `test/.env.test`; then run `git rm --cached test/.env.test` (staging
    only; `git status` shows `D  test/.env.test` staged and the file still on disk).
    `global-setup.ts:7,49` keeps writing the file — unchanged.
- [ ] **Step 4: Run it, expect pass** — same command → `Tests: 3 passed`. `npx tsc --noEmit` → no output.
- [ ] **Step 5: Verify the repo gate** — `npm run test:e2e` → 23 suites (22 existing + the new one),
  22 pass, `delete-account` still red (parked in P0-T10); `git ls-files test/.env.test` prints nothing.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `test(infra): P0-T01 factory claim, dotenv override, untrack .env.test, TRUNCATE guard`

---

### Task P0-T02: Strict typing — `Decimal`, `DocumentType`, `noImplicitAny`, `--skipLibCheck false` (BE-39 typing part)

**Files:**
- Modify: `proxy-api/src/modules/tasks/types/index.d.ts:1` (prepend import + alias; uses at 65-69, 83, 96-101, 136)
- Modify: `proxy-api/src/modules/auth/types/index.d.ts:1-3` (uses `DocumentType` at line 17)
- Modify: `proxy-api/tsconfig.json:23` (`noImplicitAny: false` → `true`)
- Modify: `proxy-api/jest.config.ts:23`, `proxy-api/test/jest-e2e.config.ts:23` (`noImplicitAny: false` → `true`)
- Modify: `proxy-api/package.json:19` (`"type-check": "tsc --noEmit --skipLibCheck false"`)
- Test: the compiler

**Interfaces:**
- Produces: `type Decimal = Prisma.Decimal` local alias in `tasks/types/index.d.ts` (same shape as
  `auth/types/index.d.ts:3`). Phase 1 money work (`src/common/money.ts`) relies on `Decimal` being a
  real type here.

- [ ] **Step 1: Write the failing test** — none (compiler is the test). Record the baseline:
  `npx tsc --noEmit --skipLibCheck false 2>&1 | grep -c "error TS"` → `13` after P0-T01 (12 × `Cannot find
  name 'Decimal'` at `tasks/types/index.d.ts:65,66,67,68,69,83,96,97,99,100,101,136`, 1 ×
  `Cannot find name 'DocumentType'` at `auth/types/index.d.ts:17`).
- [ ] **Step 2: Run it, expect failure** — the command above prints those 13 errors.
- [ ] **Step 3: Implement** —
  - `tasks/types/index.d.ts`: prepend
    ```ts
    import type { Prisma } from '@prisma/client'

    type Decimal = Prisma.Decimal
    ```
  - `auth/types/index.d.ts:1` → `import type { DocumentType, Prisma } from '@prisma/client'` (keep line 3).
  - `tsconfig.json:23`, `jest.config.ts:23`, `test/jest-e2e.config.ts:23`: `noImplicitAny: true`
    (fallout today is 0 once P0-T01 is in; if a new error appears, fix it by typing the parameter, never
    with `any`).
  - `package.json:19`: `"type-check": "tsc --noEmit --skipLibCheck false"`.
- [ ] **Step 4: Run it, expect pass** — `npm run type-check` → no output, exit 0.
- [ ] **Step 5: Verify the repo gate** — `npx jest` → all suites pass (ts-jest picks up `noImplicitAny`).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(types): P0-T02 declare Decimal/DocumentType, noImplicitAny, skipLibCheck gate`

---

### Task P0-T03: Global `PrismaModule`, one client, `PaymentsModule` exports (BE-36, REL-16)

**Files:**
- Create: `proxy-api/src/prisma/prisma.module.ts`
- Modify: `proxy-api/src/prisma/prisma.service.ts:5-27` (delete line 9; add `implements OnModuleInit, OnModuleDestroy`)
- Modify: `proxy-api/src/app.module.ts:10,17-21,36` (remove `PrismaService` provider, import `PrismaModule`)
- Modify: `proxy-api/src/modules/auth/auth.module.ts:9,61`; `tasks/tasks.module.ts:7,50,60,67-69`;
  `cards/cards.module.ts:5,19`; `payments/payments.module.ts:1-19`; `ratings/ratings.module.ts:3,8`;
  `stripe-webhook/stripe-webhook.module.ts:4,21`
- Test: `proxy-api/src/prisma/prisma.module.spec.ts`

**Interfaces:**
- Produces: `@Global() PrismaModule` providing and exporting `PrismaService`. `PaymentsModule`
  provides **and exports** `PaymentsRepository`, `CreatePaymentRecordService`,
  `UpdatePaymentRecordService`, `FetchPaymentRecordService`; `TasksModule` imports `PaymentsModule`
  instead of listing those four providers (tasks.module.ts lines 60, 67, 68, 69).
- Consumes: `GLOBAL_MODULE_METADATA`, `MODULE_METADATA` from `@nestjs/common/constants`.

- [ ] **Step 1: Write the failing test** — `src/prisma/prisma.module.spec.ts`:
  ```ts
  import 'reflect-metadata'
  import { GLOBAL_MODULE_METADATA, MODULE_METADATA } from '@nestjs/common/constants'

  import { AppModule } from 'src/app.module'
  import { PrismaModule } from './prisma.module'
  import { PrismaService } from './prisma.service'
  import { AuthModule } from 'src/modules/auth/auth.module'
  import { TasksModule } from 'src/modules/tasks/tasks.module'
  import { CardsModule } from 'src/modules/cards/cards.module'
  import { RatingsModule } from 'src/modules/ratings/ratings.module'
  import { PaymentsModule } from 'src/modules/payments/payments.module'
  import { StripeWebhookModule } from 'src/modules/stripe-webhook/stripe-webhook.module'

  const providersOf = (mod: object): unknown[] =>
    Reflect.getMetadata(MODULE_METADATA.PROVIDERS, mod) ?? []

  describe('PrismaModule', () => {
    it('is global and exports a single PrismaService', () => {
      expect(Reflect.getMetadata(GLOBAL_MODULE_METADATA, PrismaModule)).toBe(true)
      expect(providersOf(PrismaModule)).toEqual([PrismaService])
      expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PrismaModule)).toEqual([PrismaService])
    })

    it('is imported by AppModule', () => {
      expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule)).toContain(PrismaModule)
    })

    it.each([
      ['AppModule', AppModule],
      ['AuthModule', AuthModule],
      ['TasksModule', TasksModule],
      ['CardsModule', CardsModule],
      ['PaymentsModule', PaymentsModule],
      ['RatingsModule', RatingsModule],
      ['StripeWebhookModule', StripeWebhookModule],
    ])('%s does not provide its own PrismaService', (_name, mod) => {
      expect(providersOf(mod)).not.toContain(PrismaService)
    })

    it('TasksModule gets payment services from PaymentsModule', () => {
      expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, TasksModule)).toContain(PaymentsModule)
      expect(Reflect.getMetadata(MODULE_METADATA.EXPORTS, PaymentsModule)).toHaveLength(4)
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/prisma/prisma.module.spec.ts` →
  `Cannot find module './prisma.module'`.
- [ ] **Step 3: Implement** —
  - `prisma.module.ts`: `@Global() @Module({ providers: [PrismaService], exports: [PrismaService] }) export class PrismaModule {}`.
  - `prisma.service.ts`: delete line 9 (`new PrismaClient({ adapter })`); class
    `implements OnModuleInit, OnModuleDestroy` (import from `@nestjs/common`); keep the log config.
  - Remove `PrismaService` from `providers` and its import line in the seven modules listed above.
    `app.module.ts`: `imports` gains `PrismaModule` (first entry after `ConfigModule.forRoot`).
  - `payments.module.ts`: providers `[EnvService, PaymentsRepository, CreatePaymentRecordService, UpdatePaymentRecordService, FetchPaymentRecordService]`,
    `exports` the last four; `tasks.module.ts`: add `PaymentsModule` to `imports`, remove lines 60, 67, 68, 69 and the matching import lines (26, 34, 40 and the `FetchPaymentRecordService` import).
- [ ] **Step 4: Run it, expect pass** — `npx jest src/prisma/prisma.module.spec.ts` → `Tests: 10 passed`.
- [ ] **Step 5: Verify the repo gate** — `npm run type-check` clean; `npm run test:e2e` → same result
  as before (wiring proven by the suite booting in every spec).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `refactor(prisma): P0-T03 global PrismaModule, single client, PaymentsModule exports`

---

### Task P0-T04: `configureApp` — CORS, filter, shutdown hooks, `TRUST_PROXY`, Logger (BE-42, BE-48 partial, REL-16)

**Files:**
- Create: `proxy-api/src/configure-app.ts`
- Modify: `proxy-api/src/main.ts:7-20`
- Modify: `proxy-api/src/env/env.ts:3-20` (add `TRUST_PROXY`)
- Modify: `proxy-api/.env.example` (append `TRUST_PROXY=0`)
- Modify: `proxy-api/test/setup/test-app.factory.ts:31-51`
- Test: `proxy-api/src/configure-app.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export type ConfigureAppOptions = { trustProxy: number }
  export function configureApp(app: INestApplication, options: ConfigureAppOptions): INestApplication
  ```
  Does, in order: `app.enableCors()`, `app.useGlobalFilters(new HttpExceptionFilter())`,
  `app.enableShutdownHooks()`, and when `options.trustProxy > 0`
  `app.getHttpAdapter().getInstance().set('trust proxy', options.trustProxy)`. Returns `app`.
- Produces: `createTestApp(options: { trustProxy?: number } = {}): Promise<TestAppContext>` — same
  behaviour as today plus `configureApp(app, { trustProxy: options.trustProxy ?? 0 })` replacing line 45.
- Produces: env key `TRUST_PROXY: z.coerce.number().int().min(0).default(0)` (number of trusted
  proxy hops; `1` on Railway/Render per D25 — set in the host, not in code).

- [ ] **Step 1: Write the failing test** — `src/configure-app.spec.ts`:
  ```ts
  import { configureApp } from './configure-app'
  import { HttpExceptionFilter } from './exception/http.exception'

  const makeApp = () => {
    const express = { set: jest.fn() }
    const app = {
      enableCors: jest.fn(),
      useGlobalFilters: jest.fn(),
      enableShutdownHooks: jest.fn(),
      getHttpAdapter: () => ({ getInstance: () => express }),
    }
    return { app, express }
  }

  describe('configureApp', () => {
    it('enables CORS, the PT exception filter and shutdown hooks', () => {
      const { app } = makeApp()
      configureApp(app as never, { trustProxy: 0 })
      expect(app.enableCors).toHaveBeenCalledTimes(1)
      expect(app.useGlobalFilters).toHaveBeenCalledWith(expect.any(HttpExceptionFilter))
      expect(app.enableShutdownHooks).toHaveBeenCalledTimes(1)
    })

    it('does not trust proxies by default', () => {
      const { app, express } = makeApp()
      configureApp(app as never, { trustProxy: 0 })
      expect(express.set).not.toHaveBeenCalled()
    })

    it('sets express trust proxy to the configured hop count', () => {
      const { app, express } = makeApp()
      configureApp(app as never, { trustProxy: 1 })
      expect(express.set).toHaveBeenCalledWith('trust proxy', 1)
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/configure-app.spec.ts` → `Cannot find module './configure-app'`.
- [ ] **Step 3: Implement** — `configure-app.ts` per the interface. `main.ts`: replace lines 10-16 with
  `const env = app.get(EnvService)`, `configureApp(app, { trustProxy: env.get('TRUST_PROXY') })`,
  `const port = env.get('PORT') ?? 3333`, `new Logger('Bootstrap').log(`Listening on port ${port}`)`
  (no `console.log` left in `src/`). `env.ts`: add `TRUST_PROXY` after `PORT`. `test-app.factory.ts`:
  signature + `configureApp` call (keep `createNestApplication({ logger: false, rawBody: true })`).
  `.env.example`: `TRUST_PROXY=0` with the comment `# hops of reverse proxy to trust (1 on Railway/Render)`.
- [ ] **Step 4: Run it, expect pass** — `npx jest src/configure-app.spec.ts` → `Tests: 3 passed`.
- [ ] **Step 5: Verify the repo gate** — `grep -rn "console.log" src/` → no output; `npm run type-check`;
  `npm run test:e2e` → unchanged results (each spec's `app.close()` unsubscribes its shutdown hooks).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(bootstrap): P0-T04 configureApp with shutdown hooks, TRUST_PROXY and Logger`

---

### Task P0-T05: PT error contract — Zod pipe, framework exceptions and Prisma mapping (BE-33 mapping, BE-34, BE-48 filter)

**Files:**
- Modify: `proxy-api/src/exception/error-dictionary.ts` (new groups `validation`, `http`, `database`; new `file.tooLarge`, `health.databaseUnavailable`)
- Modify: `proxy-api/src/pipes/zod-validation.pipe.ts:1-23`
- Modify: `proxy-api/src/exception/http.exception.ts:14-61`
- Modify (e2e assertions): `test/tasks/create-task.e2e-spec.ts:106-107`, `test/auth/create-account.e2e-spec.ts:35-36`,
  `test/tasks/validate-task.e2e-spec.ts:183-184`, `test/auth/verify-reset-code.e2e-spec.ts:44-45`,
  `test/tasks/fetch-tasks.e2e-spec.ts:39-40`, `test/cards/create-card.e2e-spec.ts:39-40`,
  `test/auth/authenticate.e2e-spec.ts:28-29`, `test/tasks/fetch-active-tasks.e2e-spec.ts:24-28`,
  `test/tasks/finish-task.e2e-spec.ts` (new case)
- Modify (docs): `proxy-app/SPEC.md` §3.3 table (lines 185-222): add the nine new rows
- Test: `proxy-api/src/exception/http.exception.spec.ts`, `proxy-api/src/pipes/zod-validation.pipe.spec.ts`

**Interfaces:**
- Produces dictionary entries (all `as const`, same shape as the existing ones):

  | key | status | errorCode | message |
  |---|---|---|---|
  | `validation.failed` | 400 | `VALIDATION_FAILED` | Dados inválidos. Verifique os campos e tente novamente. |
  | `http.unauthorized` | 401 | `UNAUTHORIZED` | Sessão inválida ou expirada. Entre novamente. |
  | `http.tooManyRequests` | 429 | `TOO_MANY_REQUESTS` | Muitas tentativas. Aguarde um minuto e tente novamente. |
  | `http.routeNotFound` | 404 | `ROUTE_NOT_FOUND` | Rota não encontrada. |
  | `file.tooLarge` | 413 | `FILE_TOO_LARGE` | Arquivo muito grande. O limite é 10 MB. |
  | `database.conflict` | 409 | `RESOURCE_ALREADY_EXISTS` | Já existe um registro com esses dados. |
  | `database.notFound` | 404 | `RESOURCE_NOT_FOUND` | Registro não encontrado. |
  | `database.invalidId` | 400 | `INVALID_IDENTIFIER` | Identificador inválido. |
  | `health.databaseUnavailable` | 503 | `HEALTH_DATABASE_UNAVAILABLE` | Banco de dados indisponível. |

- Produces `ZodValidationPipe.transform(value: unknown): unknown` throwing
  `new AppException({ ...errorDictionary.validation.failed, info: z.prettifyError(error) })` for
  `ZodError`, and `new AppException(errorDictionary.validation.failed)` for anything else. Works for
  `@Body(...)` and `@Param('id', ...)` alike (P0-T07 relies on this).
- Produces `HttpExceptionFilter.catch(exception: unknown, host: ArgumentsHost)` mapping, in order:
  `AppException` → as today; `ThrottlerException` (from `@nestjs/throttler`) → `http.tooManyRequests`;
  `UnauthorizedException` → `http.unauthorized`; `PayloadTooLargeException` → `file.tooLarge`;
  `NotFoundException` → `http.routeNotFound`; any other `HttpException` → its status with
  `errorDictionary.standard.message` + `errorCode: 'STANDARD_ERROR'` and a `logger.warn` of the original
  message; `Prisma.PrismaClientKnownRequestError` (`import { Prisma } from '@prisma/client'`) with
  `code` `P2002` → `database.conflict`, `P2025` → `database.notFound`, `P2023` → `database.invalidId`,
  other codes → 500 standard + `logger.error`; everything else → 500 standard as today. Body shape is
  always `{ statusCode, timestamp, path, message, errorCode, info? }` built by one private
  `reply(response, request, props: AppExceptionProps)` helper (removes the duplicate branches at
  `http.exception.ts:27-46`).

- [ ] **Step 1: Write the failing tests** —
  `src/exception/http.exception.spec.ts`:
  ```ts
  import { Prisma } from '@prisma/client'
  import { ThrottlerException } from '@nestjs/throttler'
  import {
    ArgumentsHost,
    NotFoundException,
    UnauthorizedException,
    PayloadTooLargeException,
    BadGatewayException,
  } from '@nestjs/common'

  import { AppException } from './app.exception'
  import { HttpExceptionFilter } from './http.exception'
  import { errorDictionary } from './error-dictionary'

  const makeHost = () => {
    const send = jest.fn()
    const status = jest.fn(() => ({ send }))
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/x' }),
      }),
    } as unknown as ArgumentsHost
    return { host, status, send }
  }

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: '7.3.0' })

  describe('HttpExceptionFilter', () => {
    const filter = new HttpExceptionFilter()

    it.each([
      [new ThrottlerException(), 429, 'TOO_MANY_REQUESTS', 'Muitas tentativas. Aguarde um minuto e tente novamente.'],
      [new UnauthorizedException(), 401, 'UNAUTHORIZED', 'Sessão inválida ou expirada. Entre novamente.'],
      [new PayloadTooLargeException('File too large'), 413, 'FILE_TOO_LARGE', 'Arquivo muito grande. O limite é 10 MB.'],
      [new NotFoundException('Cannot GET /nope'), 404, 'ROUTE_NOT_FOUND', 'Rota não encontrada.'],
      [new BadGatewayException(), 502, 'STANDARD_ERROR', errorDictionary.standard.message],
      [prismaError('P2002'), 409, 'RESOURCE_ALREADY_EXISTS', 'Já existe um registro com esses dados.'],
      [prismaError('P2025'), 404, 'RESOURCE_NOT_FOUND', 'Registro não encontrado.'],
      [prismaError('P2023'), 400, 'INVALID_IDENTIFIER', 'Identificador inválido.'],
      [prismaError('P1001'), 500, 'STANDARD_ERROR', errorDictionary.standard.message],
      [new Error('boom'), 500, 'STANDARD_ERROR', errorDictionary.standard.message],
    ])('maps %p to %i %s', (exception, statusCode, errorCode, message) => {
      const { host, status, send } = makeHost()
      filter.catch(exception, host)
      expect(status).toHaveBeenCalledWith(statusCode)
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode, errorCode, message, path: '/x' }),
      )
    })

    it('passes AppException payloads through untouched', () => {
      const { host, status, send } = makeHost()
      filter.catch(new AppException(errorDictionary.tasks.taskNotFound), host)
      expect(status).toHaveBeenCalledWith(404)
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ errorCode: 'TASK_NOT_FOUND', message: 'Tarefa não encontrada.' }),
      )
    })
  })
  ```
  `src/pipes/zod-validation.pipe.spec.ts`:
  ```ts
  import { z } from 'zod'

  import { AppException } from 'src/exception/app.exception'
  import { ZodValidationPipe } from './zod-validation.pipe'

  describe('ZodValidationPipe', () => {
    const pipe = new ZodValidationPipe(z.object({ email: z.email() }))

    it('returns the parsed value', () => {
      expect(pipe.transform({ email: 'a@b.io' })).toEqual({ email: 'a@b.io' })
    })

    it('throws a Portuguese AppException with VALIDATION_FAILED', () => {
      let caught: unknown
      try {
        pipe.transform({ email: 'nope' })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(AppException)
      const exception = caught as AppException
      expect(exception.getStatus()).toBe(400)
      expect(exception.errorCode).toBe('VALIDATION_FAILED')
      expect(exception.getResponse()).toMatchObject({
        message: 'Dados inválidos. Verifique os campos e tente novamente.',
        errorCode: 'VALIDATION_FAILED',
        info: expect.stringContaining('email'),
      })
    })
  })
  ```
- [ ] **Step 2: Run them, expect failure** — `npx jest src/exception src/pipes` → the `it.each` rows fail
  with `errorCode` undefined / English messages; the pipe test fails with `BadRequestException` instead
  of `AppException`.
- [ ] **Step 3: Implement** — dictionary entries, pipe and filter per Interfaces. Then update the e2e
  assertions: the seven pairs
  `expect(response.status).toBeGreaterThanOrEqual(400)` / `toBeLessThan(500)` become
  `expect(response.status).toBe(400)` and
  `expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })`;
  `fetch-active-tasks.e2e-spec.ts:24-28` adds
  `expect(response.body).toMatchObject({ errorCode: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada. Entre novamente.' })`;
  `finish-task.e2e-spec.ts` gains:
  ```ts
  it('rejects a proof above 10 MB with a Portuguese 413', async () => {
    const { proxy, task } = await seedInProgressTask()

    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/finish')
      .set('Authorization', `Bearer ${proxy.token}`)
      .field('taskId', task.id)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      })

    expect(response.status).toBe(413)
    expect(response.body).toMatchObject({
      errorCode: 'FILE_TOO_LARGE',
      message: 'Arquivo muito grande. O limite é 10 MB.',
    })

    const stored = await ctx.prisma.tasks.findUnique({ where: { id: task.id } })
    expect(stored?.status).toBe('in_progress')
  })
  ```
  (the multipart field is `file` — `finish-task.controller.ts:33` `FileInterceptor('file')`.)
  Docs: add the nine rows to `proxy-app/SPEC.md` §3.3.
- [ ] **Step 4: Run them, expect pass** — `npx jest src/exception src/pipes` → `Tests: 13 passed`;
  `npm run test:e2e -- test/tasks/finish-task.e2e-spec.ts test/tasks/fetch-active-tasks.e2e-spec.ts test/auth/authenticate.e2e-spec.ts` → pass.
- [ ] **Step 5: Verify the repo gate** — `npm run type-check`; `npx jest`; `npm run test:e2e` (only
  `delete-account` red until P0-T10).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(errors): P0-T05 Portuguese error contract for Zod, throttler, auth, multer and Prisma`

---

### Task P0-T06: Throttler — one default 100/min, 5/min on four public auth routes, trust-proxy behaviour (BE-04, BE-42)

**Files:**
- Modify: `proxy-api/src/app.module.ts:28-34`
- Modify: `proxy-api/src/modules/auth/controllers/authenticate.controller.ts:21`, `create-account.controller.ts:33`
- Modify: `proxy-api/src/modules/auth/controllers/forgot-password.controller.ts:17-19`, `verify-reset-code.controller.ts:18-20` (add decorator + import)
- Modify (docs): `proxy-api/CLAUDE.md:12` (rate-limiting line), `proxy-app/SPEC.md` §3.4 throttle note
- Test: `proxy-api/test/app/throttle.e2e-spec.ts`

**Interfaces:**
- Consumes: `createTestApp({ trustProxy })` from P0-T04; `TOO_MANY_REQUESTS` mapping from P0-T05.
- Produces: `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }], skipIf: () => process.env.NODE_ENV === 'test' })`
  (single unnamed throttler → name `default`, so `@nestjs/throttler` 6.5.0 evaluates exactly one
  bucket per route; see `throttler.guard.js:67-96` loop over `this.throttlers`). Per-route override
  `@Throttle({ default: { limit: 5, ttl: 60_000 } })` on `POST /auth/session`, `POST /auth/create`,
  `POST /auth/forgot-password`, `POST /auth/verify-reset-code`. `@SkipThrottle()` on the webhook
  controller stays. Buckets are per route + IP (`generateKey` at `throttler.guard.js:148-151`).

- [ ] **Step 1: Write the failing test** — `test/app/throttle.e2e-spec.ts`:
  ```ts
  import request from 'supertest'

  import { createUser } from '../factories/user.factory'
  import { createTestApp, resetDatabase } from '../setup/test-app.factory'

  import type { TestAppContext } from '../setup/test-app.factory'

  const AUTH_ROUTES = [
    '/auth/session',
    '/auth/create',
    '/auth/forgot-password',
    '/auth/verify-reset-code',
  ]

  describe('rate limiting (e2e)', () => {
    let ctx: TestAppContext

    beforeAll(async () => {
      ctx = await createTestApp()
    })

    afterAll(async () => {
      await ctx.app.close()
    })

    beforeEach(async () => {
      await resetDatabase(ctx.prisma)
      process.env.NODE_ENV = 'production' // disables skipIf for the requests below
    })

    afterEach(() => {
      process.env.NODE_ENV = 'test'
    })

    it('keeps regular routes on the 100/min default (6th call is not throttled)', async () => {
      const user = await createUser(ctx.app, ctx.prisma)
      for (let i = 0; i < 6; i++) {
        const response = await request(ctx.app.getHttpServer())
          .get('/tasks/active')
          .set('Authorization', `Bearer ${user.token}`)
        expect(response.status).toBe(200)
      }
    })

    it.each(AUTH_ROUTES)('limits %s to 5 requests per minute per IP', async (path) => {
      for (let i = 0; i < 5; i++) {
        const response = await request(ctx.app.getHttpServer()).post(path).send({})
        expect(response.status).toBe(400) // VALIDATION_FAILED still counts
      }
      const sixth = await request(ctx.app.getHttpServer()).post(path).send({})
      expect(sixth.status).toBe(429)
      expect(sixth.headers['retry-after']).toBeDefined()
      expect(sixth.body).toMatchObject({
        errorCode: 'TOO_MANY_REQUESTS',
        message: 'Muitas tentativas. Aguarde um minuto e tente novamente.',
      })
    })
  })

  describe('rate limiting behind a proxy (e2e)', () => {
    let untrusted: TestAppContext
    let trusted: TestAppContext

    beforeAll(async () => {
      untrusted = await createTestApp()
      trusted = await createTestApp({ trustProxy: 1 })
      process.env.NODE_ENV = 'production'
    })

    afterAll(async () => {
      process.env.NODE_ENV = 'test'
      await untrusted.app.close()
      await trusted.app.close()
    })

    it('ignores X-Forwarded-For when TRUST_PROXY is 0 (one shared bucket)', async () => {
      for (let i = 0; i < 5; i++) {
        await request(untrusted.app.getHttpServer())
          .post('/auth/session')
          .set('X-Forwarded-For', `10.0.0.${i}`)
          .send({})
      }
      const sixth = await request(untrusted.app.getHttpServer())
        .post('/auth/session')
        .set('X-Forwarded-For', '10.0.0.99')
        .send({})
      expect(sixth.status).toBe(429)
    })

    it('keys buckets by forwarded IP when TRUST_PROXY is 1', async () => {
      for (let i = 0; i < 6; i++) {
        const response = await request(trusted.app.getHttpServer())
          .post('/auth/session')
          .set('X-Forwarded-For', `10.0.1.${i}`)
          .send({})
        expect(response.status).toBe(400)
      }
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npm run test:e2e -- test/app/throttle.e2e-spec.ts` →
  exactly one failure: `keeps regular routes on the 100/min default` gets `expected 200, received 429`
  on the 6th `GET /tasks/active`, because the named `auth` throttler (5/min) is evaluated on every
  route today (`throttler.guard.js:67-96`). The `it.each` rows and the proxy describe already pass
  (the `auth` limiter covers those routes and P0-T04/P0-T05 are in) — they pin the behaviour that must
  survive the config change.
- [ ] **Step 3: Implement** — `app.module.ts:28-34` per Interfaces; replace
  `@Throttle({ auth: { limit: 5, ttl: 60_000 } })` with `@Throttle({ default: { limit: 5, ttl: 60_000 } })`
  in `authenticate.controller.ts:21` and `create-account.controller.ts:33`; add the same decorator
  (and `import { Throttle } from '@nestjs/throttler'`) above `@UsePipes` in
  `forgot-password.controller.ts` and `verify-reset-code.controller.ts`. `CLAUDE.md:12` →
  "100 req/min default per route+IP, 5 req/min on `/auth/session`, `/auth/create`,
  `/auth/forgot-password`, `/auth/verify-reset-code`; `TRUST_PROXY` hops honoured for the client IP".
- [ ] **Step 4: Run it, expect pass** — same command → `Tests: 7 passed`.
- [ ] **Step 5: Verify the repo gate** — `npm run type-check`; `npm run test:e2e` full run.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(throttle): P0-T06 single default limiter, 5/min on public auth routes, trust-proxy aware`

---

### Task P0-T07: `z.uuid()` on every id (BE-33 ids)

**Files:**
- Modify: `proxy-api/src/modules/tasks/controllers/start-task.controller.ts:12`, `finish-task.controller.ts:21`, `validate-task.controller.ts:12`, `cancel-task.controller.ts:12` (`taskId: z.string()` → `taskId: z.uuid()`)
- Modify: `proxy-api/src/modules/tasks/controllers/fetch-task-by-id.controller.ts:16`, `fetch-task-proof.controller.ts:25`, `proxy-api/src/modules/cards/controllers/delete-user-card.controller.ts:22`
  (`@Param('id') id: string` → `@Param('id', new ZodValidationPipe(z.uuid())) id: string`, with `import { z } from 'zod'` and the pipe import)
- Test: `test/tasks/fetch-task-by-id.e2e-spec.ts`, `test/tasks/start-task.e2e-spec.ts`, `test/cards/delete-card.e2e-spec.ts`, `test/tasks/finish-task.e2e-spec.ts` (new cases)

**Interfaces:**
- Consumes: `ZodValidationPipe` throwing `VALIDATION_FAILED` (P0-T05). Guards run before pipes, so the
  existing `GET /tasks/any-id` 401 case at `fetch-task-by-id.e2e-spec.ts:24-30` stays 401.

- [ ] **Step 1: Write the failing tests** — add to each spec (same `ctx`/`createUser` pattern as the file):
  ```ts
  // fetch-task-by-id.e2e-spec.ts
  it('returns 400 VALIDATION_FAILED for a non-UUID id', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/not-a-uuid')
      .set('Authorization', `Bearer ${user.token}`)
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  // finish-task.e2e-spec.ts (covers GET /tasks/:id/proof too)
  it('returns 400 VALIDATION_FAILED for a non-UUID proof id', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const response = await request(ctx.app.getHttpServer())
      .get('/tasks/not-a-uuid/proof')
      .set('Authorization', `Bearer ${user.token}`)
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
  })

  // start-task.e2e-spec.ts
  it('returns 400 VALIDATION_FAILED for a non-UUID taskId', async () => {
    const proxy = await createUser(ctx.app, ctx.prisma, { userType: 'PROXY' })
    const response = await request(ctx.app.getHttpServer())
      .post('/tasks/start')
      .set('Authorization', `Bearer ${proxy.token}`)
      .send({ taskId: 'not-a-uuid' })
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
    expect(ctx.stripeMock.createPaymentIntent).not.toHaveBeenCalled()
  })

  // delete-card.e2e-spec.ts
  it('returns 400 VALIDATION_FAILED for a non-UUID card id', async () => {
    const user = await createUser(ctx.app, ctx.prisma)
    const response = await request(ctx.app.getHttpServer())
      .delete('/card/not-a-uuid')
      .set('Authorization', `Bearer ${user.token}`)
    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ errorCode: 'VALIDATION_FAILED' })
    expect(ctx.stripeMock.detachPaymentMethod).not.toHaveBeenCalled()
  })
  ```
- [ ] **Step 2: Run them, expect failure** — `npm run test:e2e -- test/tasks/fetch-task-by-id.e2e-spec.ts test/tasks/start-task.e2e-spec.ts test/cards/delete-card.e2e-spec.ts test/tasks/finish-task.e2e-spec.ts`
  → the four new cases get `500` (Postgres `22P02` on the `@db.Uuid` column surfaces as
  `STANDARD_ERROR`) or `404`.
- [ ] **Step 3: Implement** — the seven one-line edits listed under Files. No service changes.
- [ ] **Step 4: Run them, expect pass** — same command → all pass.
- [ ] **Step 5: Verify the repo gate** — `npm run type-check`; `npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(validation): P0-T07 z.uuid() on every id param and taskId body`

---

### Task P0-T08: `GET /health` (BE-48 health, REL-10)

**Files:**
- Create: `proxy-api/src/health/health.module.ts`, `proxy-api/src/health/health.controller.ts`
- Modify: `proxy-api/src/app.module.ts` imports (add `HealthModule`)
- Modify (docs): `proxy-api/CLAUDE.md` route map (add `GET /health` (public, `@SkipThrottle()`))
- Test: `proxy-api/src/health/health.controller.spec.ts`, `proxy-api/test/health/health.e2e-spec.ts`

**Interfaces:**
- Produces: `HealthController` at `@Controller('/health')`, `@SkipThrottle()`, no guard,
  `@Get() @HttpCode(200) async handle(): Promise<{ status: 'ok' }>` — runs
  `await this.prisma.$queryRaw\`SELECT 1\`` and returns `{ status: 'ok' }`; on any throw it throws
  `new AppException(errorDictionary.health.databaseUnavailable)` (503, from P0-T05). Injects
  `PrismaService` from the global module (P0-T03). `HealthModule` = `@Module({ controllers: [HealthController] })`.
  Phase 5 points the PaaS health check here.

- [ ] **Step 1: Write the failing tests** — `src/health/health.controller.spec.ts`:
  ```ts
  import { AppException } from 'src/exception/app.exception'
  import { HealthController } from './health.controller'

  describe('HealthController', () => {
    it('returns ok when the database answers', async () => {
      const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) }
      const controller = new HealthController(prisma as never)
      await expect(controller.handle()).resolves.toEqual({ status: 'ok' })
    })

    it('returns 503 HEALTH_DATABASE_UNAVAILABLE when the database fails', async () => {
      const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('down')) }
      const controller = new HealthController(prisma as never)
      const promise = controller.handle()
      await expect(promise).rejects.toBeInstanceOf(AppException)
      await expect(promise).rejects.toMatchObject({ errorCode: 'HEALTH_DATABASE_UNAVAILABLE' })
      await promise.catch((e: AppException) => expect(e.getStatus()).toBe(503))
    })
  })
  ```
  `test/health/health.e2e-spec.ts`:
  ```ts
  import request from 'supertest'

  import { createTestApp } from '../setup/test-app.factory'

  import type { TestAppContext } from '../setup/test-app.factory'

  describe('GET /health (e2e)', () => {
    let ctx: TestAppContext

    beforeAll(async () => {
      ctx = await createTestApp()
    })

    afterAll(async () => {
      await ctx.app.close()
    })

    it('answers 200 without authentication', async () => {
      const response = await request(ctx.app.getHttpServer()).get('/health')
      expect(response.status).toBe(200)
      expect(response.body).toEqual({ status: 'ok' })
    })
  })
  ```
- [ ] **Step 2: Run them, expect failure** — `npx jest src/health` → `Cannot find module './health.controller'`;
  e2e → `404`.
- [ ] **Step 3: Implement** — per Interfaces; register `HealthModule` in `app.module.ts` imports; docs line.
- [ ] **Step 4: Run them, expect pass** — `npx jest src/health` → `Tests: 2 passed`;
  `npm run test:e2e -- test/health/health.e2e-spec.ts` → `Tests: 1 passed`.
- [ ] **Step 5: Verify the repo gate** — `npm run type-check`; `npm run test:e2e`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(health): P0-T08 GET /health with database ping`

---

### Task P0-T09: ESLint 9 flat config for proxy-api, `lint` without `--fix` (REL-10 lint step)

**Files:**
- Create: `proxy-api/eslint.config.mjs`
- Modify: `proxy-api/package.json:18` (`lint` script) + new `lint:fix`; devDependencies
- Test: the linter

**Interfaces:**
- Produces: `npm run lint` = `eslint "{src,test}/**/*.ts"` (exit 0 on `main`), `npm run lint:fix` = same
  with `--fix` (never run by agents). Install (exact command):
  `npm install --save-dev eslint@^9.39.5 @eslint/js@^9.39.5 typescript-eslint@^8.72.1 eslint-config-prettier@^10.1.8`
  (typescript-eslint 8.72.1 peers: `eslint ^8.57 || ^9 || ^10`, `typescript >=4.8.4 <6.1`; repo has
  TS 5.9.3). No eslint is installed today (`node_modules/.bin/eslint` is absent) and there is no config
  file, so the current `lint` script cannot run at all.
- Config (fixed):
  ```js
  import eslint from '@eslint/js'
  import prettier from 'eslint-config-prettier'
  import { defineConfig } from 'eslint/config'
  import tseslint from 'typescript-eslint'

  export default defineConfig([
    { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'generated/**', 'data/**'] },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
      files: ['**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
      },
    },
  ])
  ```

- [ ] **Step 1: Write the failing test** — none; the linter run is the test. Baseline: `npx eslint --version`
  → `npm ERR! could not determine executable` (not installed).
- [ ] **Step 2: Run it, expect failure** — after installing and creating the config,
  `npx eslint "{src,test}/**/*.ts"` reports the pre-existing violations (count unknown; record it in
  `../STATUS.md`).
- [ ] **Step 3: Implement** — fix every reported error **by hand** in the files reported (no `--fix`,
  no formatter run). Rule budget: if one rule reports more than 20 occurrences on existing code, set
  that rule to `'warn'` in `eslint.config.mjs` with a `// TODO(P2, BE-49): promote to error` comment
  instead of touching 20+ files; never add inline `eslint-disable`. Update `package.json` scripts.
- [ ] **Step 4: Run it, expect pass** — `npm run lint` → exit 0 (warnings allowed, errors 0).
- [ ] **Step 5: Verify the repo gate** — `npm run type-check`; `npx jest`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(lint): P0-T09 ESLint 9 flat config, lint without --fix`

---

### Task P0-T10: Park the red `delete-account` e2e case (PLAN §2 Phase 0 done-when)

**Files:**
- Modify: `proxy-api/test/auth/delete-account.e2e-spec.ts:103`
- Test: the e2e suite

**Interfaces:**
- Consumes: the failing case `allows completed/canceled tasks (not blocking)` (lines 103-114) — red
  because `TasksRepository.fetchActiveTasksForUser` (`tasks.repository.ts:193-205`) counts `available`
  owner tasks as active while the test seeds one. Phase 2 implements D13 (auto-cancel `available`
  tasks inside the deletion transaction, BE-17) and un-skips it.

- [ ] **Step 1: Write the failing test** — none (we are parking one). Baseline:
  `npm run test:e2e -- test/auth/delete-account.e2e-spec.ts` → 1 failed at line 113 (`expected 204, received 409`).
- [ ] **Step 2: Run it, expect failure** — as above.
- [ ] **Step 3: Implement** — change line 103 to `it.skip(` and insert directly above it:
  ```ts
  // Parked in Phase 0 (P0-T10). Red on main: fetchActiveTasksForUser
  // (tasks.repository.ts:193-205) treats `available` owner tasks as active.
  // Phase 2 (plans/phase-2-auth-api.md, BE-17 / D13) auto-cancels `available`
  // tasks on deletion and must turn this back into `it(`.
  ```
- [ ] **Step 4: Run it, expect pass** — same command → `Tests: 1 skipped, 5 passed`.
- [ ] **Step 5: Verify the repo gate** — `npm run test:e2e` → `Test Suites: 25 passed` (22 existing +
  `assert-test-database-url`, `throttle`, `health`), `Tests: 1 skipped`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `test(auth): P0-T10 park red delete-account case until Phase 2 D13`

---

### Task P0-T11: Dockerfile, `.dockerignore`, `.nvmrc`, `engines` for proxy-api (REL-10 partial, D25)

**Files:**
- Create: `proxy-api/Dockerfile`, `proxy-api/.dockerignore`, `proxy-api/.nvmrc`
- Modify: `proxy-api/package.json` (add `"engines": { "node": "22.x" }` after `"license"`)
- Test: `docker build`

**Interfaces:**
- Produces an image whose entrypoint runs migrations then the API. Fixed content:
  ```Dockerfile
  FROM node:22-alpine AS build
  WORKDIR /app
  # prisma generate reads prisma.config.ts; the URL is not used at generate time
  ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
  COPY package.json package-lock.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM node:22-alpine
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=build /app/node_modules ./node_modules
  COPY --from=build /app/dist ./dist
  COPY --from=build /app/prisma ./prisma
  COPY package.json prisma.config.ts ./
  EXPOSE 3333
  CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
  ```
  `.dockerignore`: `node_modules`, `dist`, `.env`, `.env.*`, `data`, `coverage`, `.git`, `test`,
  `src/tmp`, `.claude`. `.nvmrc`: `22`. `npm run build` = `prisma generate && nest build` (output
  `dist/src/main.js`, matching `start:prod`). The generated client lives in
  `node_modules/.prisma/client` (`schema.prisma` generator `output`), so copying `node_modules` carries it.
  `engines` is advisory (no `engine-strict`), so the owner's Node 26 keeps working locally.

- [ ] **Step 1: Write the failing test** — none; the build is the test. Baseline: `ls Dockerfile .nvmrc` → not found.
- [ ] **Step 2: Run it, expect failure** — `docker build -t proxy-api:phase0 .` → `failed to read dockerfile`.
- [ ] **Step 3: Implement** — the four files per Interfaces.
- [ ] **Step 4: Run it, expect pass** — `docker build -t proxy-api:phase0 .` → exit 0;
  `docker run --rm proxy-api:phase0 node -e "require('/app/dist/src/app.module.js'); console.log('ok')"` → `ok`;
  `docker run --rm proxy-api:phase0 npx prisma --version | head -1` → `prisma : 7.3.x`.
- [ ] **Step 5: Verify the repo gate** — `npm run type-check` (unchanged); `docker image rm proxy-api:phase0`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(deploy): P0-T11 Dockerfile, .dockerignore, .nvmrc, engines`

---

### Task P0-T12: GitHub Actions workflow for proxy-api (BE-44 harness, REL-10)

**Files:**
- Create: `proxy-api/.github/workflows/ci.yml`
- Test: the workflow run

**Interfaces:**
- Produces a single job `verify` on `ubuntu-latest` (Docker preinstalled, needed by Testcontainers):
  ```yaml
  name: CI
  on:
    push:
      branches: [main]
    pull_request:
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true
  jobs:
    verify:
      runs-on: ubuntu-latest
      timeout-minutes: 25
      env:
        # prisma generate loads prisma.config.ts; e2e writes its own test/.env.test
        DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version-file: .nvmrc
            cache: npm
        - run: npm ci
        - run: npx prisma generate
        - run: npx tsc --noEmit --skipLibCheck false
        - run: npx eslint "{src,test}/**/*.ts"
        - run: npx jest --ci
        - run: npm run test:e2e
  ```
  Order mirrors ../PLAN.md §3. `load-env.ts` (`override: true`, P0-T01) makes the e2e ignore the
  placeholder `DATABASE_URL`; the TRUNCATE guard (P0-T01) is the safety net.

- [ ] **Step 1: Write the failing test** — none; the run is the test.
- [ ] **Step 2: Run it, expect failure** — `ls .github/workflows/ci.yml` → not found.
- [ ] **Step 3: Implement** — the file above. Run the same five commands locally in sequence first
  (`npx prisma generate && npx tsc --noEmit --skipLibCheck false && npx eslint "{src,test}/**/*.ts" && npx jest --ci && npm run test:e2e`) → all exit 0.
- [ ] **Step 4: Run it, expect pass** — after the owner pushes: `gh run list --workflow ci.yml --limit 1`
  → `completed  success`. (Agents do not push; record "awaiting push" in `../STATUS.md`.)
- [ ] **Step 5: Verify the repo gate** — the local sequence above.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `ci(api): P0-T12 GitHub Actions — generate, tsc, eslint, jest, e2e`

---

### Task P0-T13: App dependency hygiene — `newArchEnabled`, `expo install --fix`, remove datetimepicker (D17)

**Files:**
- Modify: `proxy-app/app.json:10` (delete `"newArchEnabled": true,`), `:35` (delete `"@react-native-community/datetimepicker",` from `plugins`)
- Modify: `proxy-app/package.json:16` (dependency removed by `npm uninstall`), Expo package versions bumped by `--fix`
- Test: `expo install --check`, `tsc`, `eslint`

**Interfaces:**
- Produces: `package.json` without `@react-native-community/datetimepicker` (no source file imports it —
  `grep -rn datetimepicker app src` is empty today; D17 drops scheduling for 1.0). Expected bumps from
  `CI=1 npx expo install --check` today: `expo` 57.0.24 → ~57.0.32, `expo-build-properties` → ~57.0.23,
  `expo-constants` → ~57.0.23, `expo-image-picker` → ~57.0.21, `expo-linking` → ~57.0.13,
  `expo-location` → ~57.0.23, `expo-router` → ~57.0.30, `expo-splash-screen` → ~57.0.11.
  `newArchEnabled` is a no-op on SDK 57 (New Architecture is always on) and the key is deprecated.

- [ ] **Step 1: Write the failing test** — none; static checks are the test. Baseline:
  `CI=1 npx expo install --check` → lists the 8 packages and exits non-zero;
  `grep -c newArchEnabled app.json` → `1`; `grep -c datetimepicker package.json app.json` → `1` each.
- [ ] **Step 2: Run it, expect failure** — as above.
- [ ] **Step 3: Implement** — edit `app.json` (two deletions); `npm uninstall @react-native-community/datetimepicker`;
  `npx expo install --fix` (accept the 8 bumps; do not let it add anything else — review the
  `package.json` diff). Do **not** start Expo.
- [ ] **Step 4: Run it, expect pass** — `CI=1 npx expo install --check` → `Dependencies are up to date`, exit 0;
  `grep -c newArchEnabled app.json` → `0`; `grep -rc datetimepicker package.json app.json` → `0` each.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit` and `npx eslint .` → exit 0.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(deps): P0-T13 drop newArchEnabled and datetimepicker, expo install --fix`

---

### Task P0-T14: App test runner — jest-expo + RNTL + `Button` render test (PLAN §2 Phase 0, D28)

**Files:**
- Modify: `proxy-app/package.json` (scripts `test`, `jest` block, devDependencies)
- Create: `proxy-app/jest.setup.ts`
- Modify: `proxy-app/.gitignore` (append `coverage/`)
- Test: `proxy-app/src/shared/components/Button.test.tsx`

**Interfaces:**
- Install (exact): `npx expo install jest-expo jest @types/jest -- --save-dev` (resolves to
  `jest-expo@~57.0.6` — npm dist-tag `sdk-57` = 57.0.6 — `jest@~29.7.0`, `@types/jest@^29.5.14`; jest-expo
  57 is built on Jest 29, not 30) and `npm install --save-dev @testing-library/react-native@14.1.0`
  (peers `react >=19`, `react-native >=0.78`, `jest >=29`; it depends on `test-renderer@1.3.x` itself;
  `.npmrc` has `legacy-peer-deps=true`).
- `package.json`:
  ```json
  "scripts": { "...": "...", "test": "jest" },
  "jest": {
    "preset": "jest-expo",
    "setupFiles": ["<rootDir>/jest.setup.ts"],
    "testMatch": ["**/*.test.ts", "**/*.test.tsx"]
  }
  ```
- `jest.setup.ts` (fixed):
  ```ts
  import 'react-native-gesture-handler/jestSetup'

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-reanimated').setUpTests()

  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3333'
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY = 'pk_test_jest'
  ```
  (`babel-preset-expo` does not inline `EXPO_PUBLIC_*` under Jest — runtime reads see these values; the
  two lines are consumed by P0-T15. If `setUpTests` throws under Reanimated 4.5.1, replace that line with
  `jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))`.)
- Test convention produced: co-located `<Name>.test.tsx` / `<name>.test.ts`; `tsconfig.json` already
  includes `**/*.ts(x)` and `expo/tsconfig.base` sets no `types`, so `@types/jest` globals type-check;
  `eslint-config-expo` turns `no-undef` off for TS so `describe/it/expect` lint clean. `@/` alias
  resolves through `babel-plugin-module-resolver` (`babel.config.js`). `tsc` passes without the
  gitignored `.expo/types` (verified: no errors when they are absent).

- [ ] **Step 1: Write the failing test** — `src/shared/components/Button.test.tsx`:
  ```tsx
  import { fireEvent, render, screen } from '@testing-library/react-native'

  import { Button } from '@/shared/components/Button'

  describe('Button', () => {
    it('renders its label and calls onPress', () => {
      const onPress = jest.fn()
      render(<Button onPress={onPress}>Continuar</Button>)

      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }))

      expect(onPress).toHaveBeenCalledTimes(1)
    })

    it('hides the label and ignores presses while loading', () => {
      const onPress = jest.fn()
      render(
        <Button loading onPress={onPress}>
          Continuar
        </Button>,
      )

      expect(screen.queryByText('Continuar')).toBeNull()
      fireEvent.press(screen.getByRole('button'))
      expect(onPress).not.toHaveBeenCalled()
    })

    it('ignores presses when disabled', () => {
      const onPress = jest.fn()
      render(
        <Button disabled onPress={onPress}>
          Continuar
        </Button>,
      )

      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }))
      expect(onPress).not.toHaveBeenCalled()
    })
  })
  ```
  (`Button.tsx:63-65` sets `accessibilityRole="button"` and `disabled={isDisabled}`; RNTL honours
  the host `accessibilityState.disabled` that `Pressable` derives from `disabled`.)
- [ ] **Step 2: Run it, expect failure** — `npm test` → `Missing script: "test"`.
- [ ] **Step 3: Implement** — install, `package.json` edits, `jest.setup.ts`, `.gitignore`.
- [ ] **Step 4: Run it, expect pass** — `npm test` → `Tests: 3 passed, 3 total`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit` (test file + jest globals type-check) and
  `npx eslint .` → exit 0.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `test(app): P0-T14 jest-expo + RNTL runner with Button render test`

---

### Task P0-T15: `src/common/env.ts` fail-fast and consumers (APP-15)

**Files:**
- Create: `proxy-app/src/common/read-env.ts`, `proxy-app/src/common/env.ts`
- Modify: `proxy-app/src/apis/api-client.ts:9-21`, `proxy-app/src/feature/tasks/utils/proof.ts:15-16`, `proxy-app/app/(app)/_layout.tsx:7,21`
- Modify: `proxy-app/.env.example:2` (placeholder stays `pk_test_xxx`; add a comment line that the app refuses to boot with it)
- Modify (docs): `proxy-app/CLAUDE.md` "Environment variables" section — replace "Access from code via
  `process.env.EXPO_PUBLIC_API_URL`" with "Access from code via `env.apiUrl` / `env.stripePublishableKey`
  from `@/common/env`; never read `process.env` elsewhere"
- Test: `proxy-app/src/common/read-env.test.ts`

**Interfaces:**
- `read-env.ts` (pure, no side effects; `common/` leaf layer):
  ```ts
  export type AppEnv = { apiUrl: string; stripePublishableKey: string }
  export type RawEnv = {
    EXPO_PUBLIC_API_URL?: string
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?: string
  }
  export const STRIPE_KEY_PLACEHOLDER = 'pk_test_xxx'
  export class EnvError extends Error {}
  export function readEnv(raw: RawEnv): AppEnv
  ```
  Rules: `apiUrl` — present, parses with `new URL`, protocol `http:` or `https:`, trailing `/`
  stripped. `stripePublishableKey` — present, starts with `pk_test_` or `pk_live_`, not equal to
  `STRIPE_KEY_PLACEHOLDER`. Collect every failure and throw one `EnvError` with message
  `Invalid app configuration: EXPO_PUBLIC_API_URL (<reason>), EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (<reason>)`
  where reason ∈ `missing | not an http(s) URL | placeholder value | not a publishable key`
  (developer-facing; not user copy, so English).
- `env.ts` (side-effect module; the only place that touches `process.env`):
  ```ts
  export const env: AppEnv = readEnv({
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  })
  ```
  Static `process.env.EXPO_PUBLIC_*` member access is required for Expo's build-time inlining. The app
  crashes at import time in every build when misconfigured (fail-fast; Phase 5 preview builds catch it
  before the stores). Tests that import a consumer either rely on the values set in `jest.setup.ts`
  (P0-T14) or `jest.mock('@/common/env', () => ({ env: { apiUrl: 'http://localhost:3333', stripePublishableKey: 'pk_test_jest' } }))`.
- Consumers: `api-client.ts` — delete lines 9-15, `baseURL: env.apiUrl`; `proof.ts:15-16` —
  `const baseURL = env.apiUrl` and `if (!token) return null`; `(app)/_layout.tsx` — delete line 7,
  `publishableKey={env.stripePublishableKey}`. All via `import { env } from '@/common/env'`.

- [ ] **Step 1: Write the failing test** — `src/common/read-env.test.ts`:
  ```ts
  import { EnvError, readEnv } from '@/common/read-env'

  const valid = {
    EXPO_PUBLIC_API_URL: 'http://192.168.2.93:3333',
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_51abc',
  }

  describe('readEnv', () => {
    it('returns the parsed env for valid values', () => {
      expect(readEnv(valid)).toEqual({
        apiUrl: 'http://192.168.2.93:3333',
        stripePublishableKey: 'pk_test_51abc',
      })
    })

    it('strips a trailing slash from the API URL', () => {
      expect(readEnv({ ...valid, EXPO_PUBLIC_API_URL: 'https://api.proxy.app/' }).apiUrl).toBe(
        'https://api.proxy.app',
      )
    })

    it('throws when the API URL is missing', () => {
      expect(() => readEnv({ ...valid, EXPO_PUBLIC_API_URL: undefined })).toThrow(EnvError)
      expect(() => readEnv({ ...valid, EXPO_PUBLIC_API_URL: '' })).toThrow(/EXPO_PUBLIC_API_URL \(missing\)/)
    })

    it('throws when the API URL is not http(s)', () => {
      expect(() => readEnv({ ...valid, EXPO_PUBLIC_API_URL: 'ftp://x' })).toThrow(/not an http\(s\) URL/)
    })

    it('throws for an empty Stripe key', () => {
      expect(() => readEnv({ ...valid, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: '' })).toThrow(
        /EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY \(missing\)/,
      )
    })

    it('throws for the committed placeholder key', () => {
      expect(() => readEnv({ ...valid, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_xxx' })).toThrow(
        /placeholder value/,
      )
    })

    it('throws for a secret key pasted by mistake', () => {
      expect(() => readEnv({ ...valid, EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'sk_test_123' })).toThrow(
        /not a publishable key/,
      )
    })
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/common/read-env.test.ts` → `Cannot find module '@/common/read-env'`.
- [ ] **Step 3: Implement** — the two modules and the three consumer edits per Interfaces.
- [ ] **Step 4: Run it, expect pass** — `npx jest src/common/read-env.test.ts` → `Tests: 7 passed`.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx eslint . && npm test` → exit 0;
  `grep -rn "process.env" app src` → only the two lines in `src/common/env.ts`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(app): P0-T15 fail-fast env module for API URL and Stripe key`

---

### Task P0-T16: App `.nvmrc`, `engines`, GitHub Actions workflow (REL-10 partial)

**Files:**
- Create: `proxy-app/.nvmrc`, `proxy-app/.github/workflows/ci.yml`
- Modify: `proxy-app/package.json` (add `"engines": { "node": "22.x" }` after `"version"`)
- Test: the workflow run

**Interfaces:**
- `.nvmrc`: `22` (Expo SDK 57 requires Node ≥ 20.19; matches the backend).
- Workflow:
  ```yaml
  name: CI
  on:
    push:
      branches: [main]
    pull_request:
  concurrency:
    group: ci-${{ github.ref }}
    cancel-in-progress: true
  jobs:
    verify:
      runs-on: ubuntu-latest
      timeout-minutes: 15
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version-file: .nvmrc
            cache: npm
        - run: npm ci
        - run: npx tsc --noEmit
        - run: npx eslint .
        - run: npm test -- --ci
  ```
  No `.env` is needed: `Button.test.tsx` and `read-env.test.ts` do not import `@/common/env`, and
  `jest.setup.ts` seeds the two vars for anything that does. No Expo server is started anywhere (D28).

- [ ] **Step 1: Write the failing test** — none; the run is the test.
- [ ] **Step 2: Run it, expect failure** — `ls .github/workflows/ci.yml .nvmrc` → not found.
- [ ] **Step 3: Implement** — the three files/edits. Run locally first:
  `npm ci && npx tsc --noEmit && npx eslint . && npm test -- --ci` → exit 0 (`npm ci` here is fine: it
  reinstalls from the lockfile produced by P0-T13/T14).
- [ ] **Step 4: Run it, expect pass** — after the owner pushes: `gh run list --workflow ci.yml --limit 1`
  → `completed  success`. Record "awaiting push" in `../STATUS.md` until then.
- [ ] **Step 5: Verify the repo gate** — the local sequence above.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `ci(app): P0-T16 GitHub Actions — tsc, eslint, jest`

---

## Phase done-when (from ../PLAN.md §2)

- proxy-api: `npx prisma generate && npx tsc --noEmit --skipLibCheck false && npx eslint "{src,test}/**/*.ts" && npx jest && npm run test:e2e`
  exits 0 locally; e2e reports 25 suites passed, 1 test skipped (the parked `delete-account` case);
  `GET /health` is 200; `test/.env.test` is untracked; GitHub Actions green on `main`.
- proxy-app: `npx tsc --noEmit && npx eslint . && npm test` exits 0 (10 tests: 3 `Button` + 7 `readEnv`);
  `CI=1 npx expo install --check` reports up to date; no `newArchEnabled`, no datetimepicker; GitHub
  Actions green on `main`.
- `../STATUS.md` rows P0-T01…P0-T16 marked `done`.
- Owner manual check after both CIs are green: none in the app (no screen changed); on the backend,
  start the API as usual and `curl -i http://localhost:3333/health` → `200 {"status":"ok"}`, and
  `curl -i -X POST http://localhost:3333/auth/session -H 'content-type: application/json' -d '{}'`
  six times → the sixth is `429` with `"errorCode":"TOO_MANY_REQUESTS"` (needs `NODE_ENV` ≠ `test`).
