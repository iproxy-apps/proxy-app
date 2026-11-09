# Phase 3 — App: contract + flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make the Expo app render the Phase 1–2 backend contract truthfully (money, payment status,
session, pagination, history), keep two devices in sync without push, and ship the store-compliance
flows (account deletion, legal links, no fake features) with an RNTL/jest test per task.

**Architecture:** `src/apis/*` owns wire types + axios route functions + TanStack Query hooks;
`src/store/auth-store` owns the Zod-normalised session; `src/feature/<domain>/{components,hooks,utils}`
owns domain UI; `app/**` routes stay thin (state + handlers + JSX delegating to feature components).
Freshness comes from `focusManager`/`onlineManager` wiring + `refetchInterval` on live tasks +
`onSettled` invalidations + a timeout-reconciliation helper; the session is refreshed through
`GET /auth/me` on foreground (throttled 30 s) and after every task mutation.

**Tech stack:** Expo SDK 57 (`expo` ^57.0.24, RN 0.86.3, React 19.2.3), Expo Router ~57.0.22,
`@tanstack/react-query` 5.101.2, `axios` ^1.16, `zustand` ^5, `zod` 3.25.76 (already in
`node_modules`; add to `dependencies` explicitly), `jwt-decode` ^4, `@stripe/stripe-react-native`
0.64.0, `react-hook-form` ^7.76, `expo-location` ~57.0.19, `expo-image-picker` ~57.0.19,
`expo-web-browser` ~57.0.3, new: `@react-native-community/netinfo`, `expo-image-manipulator`.
Tests: `jest-expo` + `@testing-library/react-native` (set up in Phase 0, `npm test`).

**Spec:** `../PLAN.md` §2 (Phase 3), `../DECISIONS.md` D1–D21, `proxy-app/SPEC.md` §2.5, §2.8, §7.2,
§7.3, §8.6–§8.14; registers `../audit/R-app-review.md` §2–3 (APP-01…APP-30),
`../audit/R-release-contract-review.md` §2 (CON-02, CON-04, CON-07, CON-10, CON-12).

## Global constraints

- Prettier: no semicolons, single quotes, trailing commas. Prettier only on **new** files; never run
  `npm run format` / `npm run lint:fix` repo-wide.
- All user-facing copy in **pt-BR**, SPEC §2.5 tone (informal-profissional, no financial jargon,
  CTAs in the infinitive, toasts are one sentence with a full stop, no "!" in errors).
- `import type { … }` for every type import. Backend entity/payload types are `T`-prefixed and live in
  `src/apis/<domain>/<domain>-api-types.ts`; component prop types stay un-prefixed.
- Path alias `@/*` → `src/*`. No relative `../../src/...` imports.
- Colors only from `@/common/theme/colors`. No local `const GRAPHITE = ...`.
- Screen skeleton: CTAs **inside** the `ScrollView`, pushed down by `<View style={{ flex: 1 }} />`
  (`CLAUDE.md` "Screen layout pattern"). Exception kept as-is: task detail uses absolute,
  status-dependent action bars (documented in P3-T22).
- NativeWind 4 gotchas: `textAlign`, `alignSelf`, nested `flex-1 + justify-center` → inline `style`.
- Layering (`CLAUDE.md` "Architecture"): `shared/` imports only `common/` + `lib/`; `apis/` may import
  `store/` (already does in `auth-hooks.ts`); `app/` is glue.
- The app **never computes fees**. Every money figure is `formatBRL(<backend number>)`.
- Never start the dev server / Expo / simulator (owner rule). Verification is static + jest only.
- One task = one commit by the owner: `feat|fix|test|chore(<area>): P3-Txx <title>`.
- Repo gate before marking any task done: `npx tsc --noEmit && npx eslint . && npm test`.

## Backend contract this phase consumes (pinned here; Phases 1–2 must emit exactly this)

| Route | Shape consumed by the app | Phase/ID |
|---|---|---|
| JWT claims | existing claims + `exp` (30 d), `tokenVersion`, `payoutIssue: boolean`, `phoneNumber: string \| null`; `rating`/`walletBalance` numbers | P2 BE-13/16, D5, D9, D10 |
| `GET /auth/me` | `TMeResponse = { id, name, email, avatarUrl, phoneNumber, userType, rating: number, totalTasksCompleted: number, totalTasksCreated: number, walletBalance: number, stripeAccountId: string \| null, stripeAccountReady: boolean, payoutIssue: boolean }` | P2 BE-16, D10 |
| `DELETE /auth/account` | 204; 409 `{ errorCode: 'USER_HAS_ACTIVE_TASKS', message }` | existing, P2 BE-17/D13 |
| `GET /auth/transaction-history?page=` | `{ tasksCreated: TTransactionHistoryTask[], tasksCompleted: TTransactionHistoryTask[], page, perPage, hasMore }`, `TTransactionHistoryTask = { id, title, status: TTaskStatus, offeredPrice: number, proxyEarnings: number \| null, platformFee: number \| null, createdAt, completedAt: string \| null, canceledAt: string \| null }` (executor list = all terminal statuses) | P2 BE-40, D20 |
| `GET /tasks/fetch?city=&page=` | `{ items: TTask[], page: number, perPage: 10, hasMore: boolean }` | P2 BE-37 |
| `GET /tasks/:id`, `/tasks/active`, `/tasks/fetch` items | `TTask` + `city`, `state`, `completedAt`, `canceledAt`, money fields `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings` as **numbers** (`offeredPrice` stays a Decimal string); owner = `{ id, name, avatarUrl, rating, totalTasksCreated }` (+ `phoneNumber` only for the mapped executor while `in_progress`/`verification_required`); `payment` only for the owner, without `paymentIntent` | P1 BE-03/39, P2 BE-11/38, D2, D21 |
| `GET /tasks/price-preview?offeredPrice=` | `{ offeredPrice, platformFee, stripeFee, chargedAmount, proxyEarnings }` numbers (fixture used in tests: `100 → { 100, 20, 5.39, 125.39, 100 }`) | P1 (tiny route), D1 |
| `POST /tasks/start` | `{ status: 'succeeded' }` only; errors `PAYMENT_FAILED` 402, `TASK_NOT_AVAILABLE`, `PROXY_ACCOUNT_NOT_READY` 409, `CANNOT_START_OWN_TASK` | P1 BE-02/05, BE-46, D3 |
| `POST /card/setup-intent` → `{ clientSecret }`; `POST /card/create { paymentMethodId }` → `TCard` | — | P1 BE-32, D3 |
| Error envelope | `{ message (pt-BR), errorCode, statusCode }`; Phase 0 adds `VALIDATION_FAILED` (400), `TOO_MANY_REQUESTS` (429), `FILE_TOO_LARGE` (413) | P0 BE-33/34 |

If a Phase 1/2 plan names a key differently, change it in **one** file (`src/apis/<domain>/<domain>-api-types.ts`,
P3-T04) and nowhere else.

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P3-T01 | Session schema (Zod), `exp` check, `isAuthenticated = !!session`, test harness | — | APP-11, APP-13, CON-02, D10 | `npx jest src/apis/auth/__tests__/session-schema.test.ts src/store/auth-store/__tests__/auth-store.test.ts` |
| P3-T02 | Boot + 401 hygiene (SecureStore `.catch`, cache clear, auth-only 401) | T01 | APP-12, APP-14, CON-12 | `npx jest src/shared/providers/__tests__/SessionProvider.test.tsx src/apis/__tests__/api-client.test.ts` |
| P3-T03 | `api-errors.ts`: PT mapping for 429/413/VALIDATION_FAILED + error classifiers | — | APP-10, CON-04 | `npx jest src/apis/__tests__/api-errors.test.ts` |
| P3-T04 | Contract sync: types, route functions, pagination, dead code | T01 | APP-03 (types), CON-10, D21, pagination/history/me/price-preview/setup-intent contract | `npx jest src/apis/__tests__/apis-contract.test.ts && npx tsc --noEmit` |
| P3-T05 | Refresh infra: `QueryFocusProvider`, NetInfo, `refreshMe`, `useSessionRefreshOnFocus` | T01, T04 | APP-05, APP-08, D9, D10 | `npx jest src/shared/providers/__tests__/QueryFocusProvider.test.tsx src/feature/auth/hooks/__tests__/useSessionRefreshOnFocus.test.ts` |
| P3-T06 | Task queries/mutations: `refetchInterval`, `onSettled`, `reconcileAfterTimeout`, pull-to-refresh | T04, T05 | APP-08, APP-29 | `npx jest src/apis/tasks/__tests__/` |
| P3-T07 | `QueryErrorCard` + error states on every list; 404 vs network on detail | T03, T04 | APP-20 | `npx jest src/shared/components/__tests__/QueryErrorCard.test.tsx "app/(app)/tasks/\[id\]/__tests__/index.error.test.tsx"` |
| P3-T08 | Profile: "Excluir conta" (double confirm, 409), legal rows, remove "Editar dados" | T03, T04 | APP-01, APP-02, D13, D14 | `npx jest "app/(app)/(tabs)/__tests__/profile.test.tsx"` |
| P3-T09 | Sign-up without document/photo, tappable Terms/Privacy, choose-profile copy | T08 | APP-06, APP-02, D11, D12 | `npx jest "app/(auth)/__tests__/sign-up.test.tsx"` |
| P3-T10 | Cards via SetupIntent, `urlScheme`, `/cards` role gate, card copy | T04 | D3, APP-23, APP-19, APP-15 | `npx jest src/feature/cards/components/__tests__/AddCardSheet.test.tsx "app/(app)/__tests__/cards.test.tsx"` |
| P3-T11 | Task detail split + `PaymentStatusBanner` + `requires_action` removal | T04, T06, T07 | APP-03, D3, D6 | `npx jest src/feature/tasks/utils/__tests__/task-actions.test.ts "app/(app)/tasks/\[id\]/__tests__/index.payment.test.tsx"` |
| P3-T12 | Proxy gate to Wallet, "Falar com o suporte", waiting bar, start error copy | T11, T08 | APP-18, APP-30, D18 | `npx jest "app/(app)/tasks/\[id\]/__tests__/index.proxy.test.tsx"` |
| P3-T13 | Money from backend numbers: `PriceBreakdown` + `useChargePreviewQuery`, `ReceiptCard`, "Você recebe", `payout_failed`, "Total recebido" | T04, T11 | APP-04, APP-21, D1, D2, D8 | `npx jest src/feature/tasks/components/__tests__/PriceBreakdown.test.tsx src/feature/tasks/components/__tests__/ReceiptCard.test.tsx` |
| P3-T14 | City picker: `SERVED_CITIES`, Step 1 toggle, ProxyHome pills, unserved-city error | T04 | APP-07, CON-07, D16 | `npx jest src/common/constants/__tests__/cities.test.ts src/feature/tasks/components/__tests__/CreateTaskStep1.test.tsx` |
| P3-T15 | Location flow: geocode first, no silent substitution, reset on edit, "Abrir Ajustes" | T14 | APP-17 | `npx jest src/feature/tasks/hooks/__tests__/useLocationCapture.test.ts` |
| P3-T16 | Proof upload: downscale, 10 MB check, 120 s timeout, reconcile, modal copy | T06 | APP-16, D19, APP-28 (finish.tsx items) | `npx jest src/feature/tasks/utils/__tests__/prepare-proof.test.ts src/apis/tasks/__tests__/tasks-apis.finish.test.ts` |
| P3-T17 | Wallet: onboarding result, 4-state `MerchantStatusRow`, `payoutIssue` banner, `/wallet` gate | T05, T13 | APP-22, APP-21, APP-23, D5 | `npx jest src/feature/wallet/hooks/__tests__/useStripeOnboarding.test.ts src/feature/wallet/components/__tests__/MerchantStatusRow.test.tsx` |
| P3-T18 | History tab (three tabs) from `/tasks/active` + new history endpoint | T04, T06, T07 | APP-09, D20 | `npx jest src/feature/history/utils/__tests__/select-history.test.ts "app/(app)/(tabs)/__tests__/history.test.tsx"` |
| P3-T19 | Copy fixes, optional rating + 500-char counter, Client Home stats, cancel copy | T11, T13 | APP-19, APP-10, APP-05, D7, D15 | `npx jest src/feature/tasks/components/__tests__/ValidateTaskSheet.test.tsx src/feature/tasks/utils/__tests__/copy.test.ts` |
| P3-T20 | Polish A — shell: tab bar height, Toast inset, `+not-found`, deep-link replay, `AppModal` guards | T02 | APP-24, APP-25, APP-27, APP-28 | `npx jest src/shared/components/__tests__/AppModal.test.tsx "app/__tests__/not-found.test.tsx" src/lib/__tests__/pending-route.test.ts` |
| P3-T21 | Polish B — forms & lists: double-submit guard, ProxyHome counts/search, lazy location, `ProofPhoto` fallback, `canCancelTask` | T06 | APP-26, APP-28 | `npx jest src/feature/tasks/utils/__tests__/can-cancel.test.ts src/feature/home/utils/__tests__/search.test.ts "app/(auth)/__tests__/sign-in.test.tsx"` |
| P3-T22 | Polish C — hygiene & docs: alias imports lint rule, tailwind globs, CLAUDE.md/SPEC sync | all | APP-28, CON-10 (docs) | `npx eslint . && npx tsc --noEmit` |

## Review focus

1. **JWT with `exp` in the past on cold start** → app lands on Splash, SecureStore cleared, no blank
   screen, no request fired with the stale token. Owned by P3-T01 (`auth-store.test.ts`
   "expired token hydrates to null") and P3-T02 (SessionProvider test).
2. **`POST /tasks/start` times out but succeeded server-side** → proxy sees "Tarefa aceita! Bom
   trabalho." (reconciled), feed drops the task, no second start attempt possible. Owned by P3-T06
   (`reconcile.test.ts` "advanced status resolves as success") and P3-T12 render test.
3. **Owner cancels while the proxy's detail screen is open in background** → on foreground the proxy's
   detail refetches within one focus event and shows "Cancelada" with no action bar. Owned by P3-T05
   (focus listener test) + P3-T06 (`liveRefetchInterval` test) + P3-T11 (`task-actions.test.ts`
   "canceled → no proxy action").
4. **Proxy with `stripeAccountId` set but `stripeAccountReady: false` returns from Stripe** → info
   toast, not success; Wallet shows "Cadastro iniciado — aguardando o Stripe"; "Aceitar" bar replaced
   by "Configure seu recebimento para aceitar". Owned by P3-T17 (`useStripeOnboarding.test.ts`,
   `MerchantStatusRow.test.tsx` pending state) and P3-T12.
5. **Library photo of 11 MB or HEIC** → rejected locally with PT copy before any upload (11 MB), or
   converted to JPEG ≤ 1600 px (HEIC) and sent with a 120 s timeout. Owned by P3-T16
   (`prepare-proof.test.ts`, `tasks-apis.finish.test.ts`).

---

### Task P3-T01: Session schema (Zod), `exp` check, `isAuthenticated = !!session`, test harness

**Files:**
- Create: `src/apis/auth/session-schema.ts`
- Create: `src/test/jwt.ts`, `src/test/fixtures/session.ts`, `src/test/render.tsx`
- Modify: `src/apis/auth/auth-api-types.ts:12-32` (replace the interface with a re-export)
- Modify: `src/store/auth-store/auth-store.ts:17-24` (`decodeOrNull`), `:31-34`, `:41-43`
- Modify: `src/feature/auth/hooks/useProxyAuth.ts:30`
- Modify: `jest.setup.ts` (from Phase 0) — add the shared module mocks listed below
- Modify: `package.json` — add `"zod": "^3.25.76"` to `dependencies` (already hoisted in `node_modules`)
- Test: `src/apis/auth/__tests__/session-schema.test.ts`, `src/store/auth-store/__tests__/auth-store.test.ts`

**Interfaces:**
- Consumes: `jwtDecode` (`jwt-decode` 4), `saveToken/clearToken` from `@/lib/secure-store`.
- Produces:
  - `export const sessionPayloadSchema: z.ZodObject<…>` with fields: `sub: z.string()`, `email: z.string()`,
    `name: z.string()`, `avatarUrl: z.string().nullable().default(null)`,
    `phoneNumber: z.string().nullable().default(null)`, `stripeAccountId: z.string().nullable().default(null)`,
    `stripeAccountReady: z.boolean().default(false)`, `stripeCustomerId: z.string().nullable().default(null)`,
    `userType: z.enum(['CLIENT', 'PROXY'])`, `documentType: z.enum(['RG', 'CPF', 'CNPJ']).nullable().default(null)`,
    `documentUrl: z.string().nullable().default(null)`, `isVerified: z.boolean().default(false)`,
    `rating: z.coerce.number().default(0)`, `totalTasksCompleted: z.coerce.number().int().default(0)`,
    `totalTasksCreated: z.coerce.number().int().default(0)`, `walletBalance: z.coerce.number().default(0)`,
    `payoutIssue: z.boolean().default(false)`, `termsAccepted: z.boolean().default(false)`,
    `tokenVersion: z.number().optional()`, `iat: z.number().optional()`, `exp: z.number().optional()`.
  - `export type TSessionPayload = z.infer<typeof sessionPayloadSchema>` (re-exported from
    `auth-api-types.ts` so existing imports keep working).
  - `export function decodeSession(token: string | null, now: number = Date.now()): TSessionPayload | null`
    — `null` when token is falsy, `jwtDecode` throws, `safeParse` fails, or `exp * 1000 <= now`.
  - `useAuthStore`: `hydrate(token)` and `setSession(token)` store `session = decodeSession(token)`; when
    it is `null` they also `await clearToken().catch(() => {})` and store `token: null`.
  - `useProxyAuth().isAuthenticated === !!session`.
  - Test harness: `signFakeJwt(payload: Record<string, unknown>): string` (base64url header + payload +
    `'sig'`; `jwtDecode` does not verify), `makeSession(overrides?: Partial<TSessionPayload>): TSessionPayload`
    (defaults: `sub: 'user-1'`, `userType: 'CLIENT'`, `name: 'Ana Cliente'`, `email: 'ana@proxy.app'`,
    `stripeAccountReady: false`, `payoutIssue: false`, `exp: Math.floor(Date.now() / 1000) + 3600`),
    `renderWithQuery(ui: ReactElement, client?: QueryClient)` wrapping in `QueryClientProvider` with
    `new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } })`.
  - `jest.setup.ts` mocks (used by every later render test): `expo-router` (`router.{push,replace,navigate,back,dismissTo}` as `jest.fn()`, `useLocalSearchParams: jest.fn(() => ({}))`, `usePathname: () => '/'`, `Redirect: ({ href }) => <Text testID="redirect">{href}</Text>`, `Stack: { Screen: () => null }`, `Tabs`, `Link`), `expo-secure-store` (in-memory map), `expo-web-browser` (`openBrowserAsync`, `openAuthSessionAsync` as `jest.fn()`), `expo-location`, `expo-image-picker`, `expo-image-manipulator`, `expo-linear-gradient` (passthrough `View`), `@react-native-community/netinfo` (`require('@react-native-community/netinfo/jest/netinfo-mock.js')`), `@stripe/stripe-react-native` (`StripeProvider` passthrough, `CardField: () => null`, `useStripe`, `useConfirmSetupIntent` as `jest.fn()`), `lucide-react-native` (`new Proxy({}, { get: () => () => null })`), `react-native-safe-area-context` (`useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })`, `SafeAreaView: View`).

- [ ] **Step 1: Write the failing tests**
  ```ts
  // src/apis/auth/__tests__/session-schema.test.ts
  it('coerces Decimal-string claims to numbers', () => {
    const s = decodeSession(signFakeJwt({ ...base, rating: '4.5', walletBalance: '120.5', totalTasksCompleted: '3' }))
    expect(s?.rating).toBe(4.5); expect(s?.walletBalance).toBe(120.5); expect(s?.totalTasksCompleted).toBe(3)
  })
  it('defaults payoutIssue/stripeAccountReady for old tokens', () => {
    const s = decodeSession(signFakeJwt({ ...baseWithoutThoseKeys }))
    expect(s?.payoutIssue).toBe(false); expect(s?.stripeAccountReady).toBe(false)
  })
  it('returns null for garbage, for a token failing the schema, and for exp in the past', () => {
    expect(decodeSession('garbage')).toBeNull()
    expect(decodeSession(signFakeJwt({ ...base, userType: 'ADMIN' }))).toBeNull()
    expect(decodeSession(signFakeJwt({ ...base, exp: 1_700_000_000 }), 1_700_000_001_000)).toBeNull()
  })
  // src/store/auth-store/__tests__/auth-store.test.ts
  it('hydrate("garbage") leaves token and session null and clears SecureStore', async () => {
    useAuthStore.getState().hydrate('garbage')
    expect(useAuthStore.getState()).toMatchObject({ token: null, session: null, hydrated: true })
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('proxy.session.token')
  })
  it('expired token hydrates to null', ...) // exp = now - 60
  it('setSession stores a decoded session', async () => {
    await useAuthStore.getState().setSession(signFakeJwt(makeSession({ sub: 'u2' })))
    expect(useAuthStore.getState().session?.sub).toBe('u2')
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/apis/auth/__tests__/session-schema.test.ts`
  → `Cannot find module '../session-schema'`.
- [ ] **Step 3: Implement** `sessionPayloadSchema`, `decodeSession` in `src/apis/auth/session-schema.ts`;
  rewrite `decodeOrNull` → `decodeSession`; `hydrate`/`setSession` null-path clears the token;
  `isAuthenticated: !!session` in `useProxyAuth.ts:30`; replace the `TSessionPayload` interface in
  `auth-api-types.ts:12-32` with `export type { TSessionPayload } from './session-schema'`.
  `ClientHome.tsx:63` (`session.rating.toFixed`) is now safe because `rating` is a number.
- [ ] **Step 4: Run it, expect pass** — both spec files green (7 tests).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx eslint . && npm test`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P3-T01 Zod session schema + exp check`

---

### Task P3-T02: Boot + 401 hygiene

**Files:**
- Modify: `src/shared/providers/SessionProvider.tsx:20-34`
- Modify: `src/apis/api-client.ts:39-48` (extract `handleResponseError`), `src/store/auth-store/auth-store.ts` (`setSession`)
- Test: `src/shared/providers/__tests__/SessionProvider.test.tsx`, `src/apis/__tests__/api-client.test.ts`

**Interfaces:**
- Consumes: `getToken/clearToken` (`@/lib/secure-store`), `queryClient` (`@/apis/query-client`), `useAuthStore` (T01).
- Produces:
  - `export async function handleResponseError(error: unknown): Promise<never>` in `api-client.ts` —
    registered as the response interceptor's rejected handler. Calls `clearToken()` + `onUnauthorized?.()`
    only when `axios.isAxiosError(error) && error.response?.status === 401 && error.config?.headers?.has('Authorization')`.
  - `SessionProvider`: `getToken().catch(async () => { await clearToken().catch(() => {}); return null }).then((t) => { if (!cancelled) hydrate(t) })`;
    `registerUnauthorizedHandler(() => { void clearSession(); queryClient.clear() })`.
  - `useAuthStore.setSession(token)`: when the decoded `sub` differs from the previous `session?.sub`,
    call `queryClient.clear()` before `set(...)`.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // SessionProvider.test.tsx
  it('hydrates null when SecureStore rejects', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'))
    render(<SessionProvider><Text>ok</Text></SessionProvider>)
    await waitFor(() => expect(useAuthStore.getState().hydrated).toBe(true))
    expect(useAuthStore.getState().session).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled()
  })
  it('401 handler clears the query cache', async () => {
    queryClient.setQueryData(queryKeys.card, { id: 'c1' })
    render(<SessionProvider><Text>ok</Text></SessionProvider>)
    await act(() => handleResponseError(makeAxiosError(401, {}, { headers: { Authorization: 'Bearer x' } })).catch(() => {}))
    expect(queryClient.getQueryData(queryKeys.card)).toBeUndefined()
  })
  // api-client.test.ts
  it('does not fire the unauthorized handler for a 401 without Authorization (sign-in)', async () => {
    const handler = jest.fn(); registerUnauthorizedHandler(handler)
    await expect(handleResponseError(makeAxiosError(401, { errorCode: 'USER_INVALID_CREDENTIALS' }))).rejects.toBeDefined()
    expect(handler).not.toHaveBeenCalled()
  })
  it('fires it for an authenticated 401', ...) // headers: { Authorization: 'Bearer x' } → called once
  ```
  Add `makeAxiosError(status: number, body?: object, config?: Partial<InternalAxiosRequestConfig>): AxiosError`
  to `src/test/fixtures/http.ts` (builds `new AxiosError(msg, code, { headers: new AxiosHeaders(config?.headers) }, undefined, { status, data: body })`).
- [ ] **Step 2: Run it, expect failure** — `handleResponseError is not a function` / `expected null, received undefined`.
- [ ] **Step 3: Implement** the three changes above.
- [ ] **Step 4: Run it, expect pass** — 4 tests green.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done in ../STATUS.md; commit** `fix(auth): P3-T02 boot/401 hygiene`

---

### Task P3-T03: `api-errors.ts` — PT mapping + classifiers

**Files:**
- Create: `src/apis/api-errors.ts`
- Modify: `src/apis/api-client.ts:50-67` (delete the body; `export { extractErrorMessage } from './api-errors'`)
- Test: `src/apis/__tests__/api-errors.test.ts`

**Interfaces:**
- Produces (all exported from `src/apis/api-errors.ts`):
  - `isTimeoutError(e: unknown): boolean` — axios error with `code === 'ECONNABORTED' || code === 'ETIMEDOUT'`.
  - `isNetworkError(e: unknown): boolean` — axios error, `!e.response`, not a timeout.
  - `isNotFoundError(e: unknown): boolean` — `response?.status === 404`.
  - `errorCodeOf(e: unknown): string | null` — `response?.data?.errorCode ?? null`.
  - `extractErrorMessage(e: unknown): string`, precedence:
    1. status `429` → `'Muitas tentativas. Aguarde um minuto e tente novamente.'`
    2. status `413` → `'A foto precisa ter até 10 MB.'`
    3. `errorCode === 'VALIDATION_FAILED'` or (`status === 400` and `message === 'Validation failed'`) → `'Dados inválidos. Revise os campos.'`
    4. body has both `errorCode` and `message` → `message` (backend pt-BR dictionary)
    5. status `401` → `'Sua sessão expirou. Entre novamente.'`; `403` → `'Você não tem permissão para fazer isso.'`; `404` → `'Não encontramos o que você procurava.'`; `>= 500` → `'Algo deu errado do nosso lado. Tente de novo em instantes.'`
    6. timeout → `'A requisição demorou demais. Tente novamente.'`; network → `'Sem conexão. Verifique sua internet e tente novamente.'`
    7. fallback `'Algo deu errado. Tente novamente.'`

- [ ] **Step 1: Write the failing test** — one `it.each` table with the exact inputs/outputs above, e.g.
  `[makeAxiosError(429, { message: 'ThrottlerException: Too Many Requests' }), 'Muitas tentativas. Aguarde um minuto e tente novamente.']`,
  `[makeAxiosError(413, { message: 'File too large' }), 'A foto precisa ter até 10 MB.']`,
  `[makeAxiosError(400, { message: 'Validation failed' }), 'Dados inválidos. Revise os campos.']`,
  `[makeAxiosError(409, { errorCode: 'USER_HAS_ACTIVE_TASKS', message: 'Você possui tarefas em andamento. Finalize ou cancele todas antes de excluir a conta.' }), <same message>]`,
  `[Object.assign(new AxiosError('t'), { code: 'ECONNABORTED' }), 'A requisição demorou demais. Tente novamente.']`,
  `[new AxiosError('net'), 'Sem conexão. Verifique sua internet e tente novamente.']`,
  `[new Error('x'), 'Algo deu errado. Tente novamente.']`; plus `isTimeoutError`, `isNetworkError`, `isNotFoundError` truth tables.
- [ ] **Step 2: Run it, expect failure** — `Cannot find module '../api-errors'`.
- [ ] **Step 3: Implement** per the precedence list. Callers keep importing `extractErrorMessage` from `@/apis/api-client`.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(apis): P3-T03 PT error mapping + classifiers`

---

### Task P3-T04: Contract sync — types, route functions, pagination, dead code

**Files:**
- Modify: `src/apis/tasks/tasks-api-types.ts` (whole file), `src/apis/tasks/tasks-apis.ts:14-52`
- Modify: `src/apis/tasks/tasks-hooks.ts:11-12,44-55`
- Modify: `src/apis/wallet/wallet-api-types.ts:6-23`, `src/apis/wallet/wallet-apis.ts:8-23`, `src/apis/wallet/wallet-hooks.ts` (whole)
- Modify: `src/apis/cards/cards-api-types.ts:17-19`, `src/apis/cards/cards-apis.ts:4-12`
- Modify: `src/apis/auth/auth-api-types.ts` (add `TMeResponse`), `src/apis/auth/auth-apis.ts:11-29`
- Modify: `src/apis/query-keys.ts`
- Modify: `src/feature/tasks/components/CounterpartCard.tsx:71-75` (delete the `isVerified` badge), `src/feature/tasks/components/ReceiptCard.tsx:90-94` (reference line, see Produces)
- Delete: `src/feature/tasks/utils/format-payment-id.ts`
- Modify: `src/feature/home/components/ProxyHome.tsx:63-72` (`data?.pages.flatMap((p) => p.items)`), `app/(app)/(tabs)/wallet.tsx:26,89-92` (use `tasksCompleted` of page 1)
- Test: `src/apis/__tests__/apis-contract.test.ts`, `src/apis/tasks/__tests__/tasks-hooks.pagination.test.ts`

**Interfaces:**
- Produces (types):
  - `TTaskStatus` unchanged. **Delete** `ACTIVE_TASK_STATUSES` (`tasks-api-types.ts:21-26`).
  - `TPayment = { id: string; taskId: string; amount: string; status: TPaymentStatus; refundId: string | null; createdAt: string; updatedAt: string }` (no `paymentIntent`).
  - `TTaskOwner = { id: string; name: string; avatarUrl: string | null; rating: string; totalTasksCreated: number; phoneNumber?: string | null }`.
  - `TTaskCounterpart = { id: string; name: string; avatarUrl: string | null; rating: string }`.
  - `TTask` adds `city: string; state: string; stripeFee: number | null; chargedAmount: number | null; completedAt: string | null; canceledAt: string | null`; `proxyEarnings: number | null; platformFee: number | null` (were strings). `offeredPrice: string` stays.
  - `TTaskDetail = TTask & { payment: TPayment | null; executorId: string | null; executor: TTaskCounterpart | null }` (payment is `null` for non-owners).
  - `TPaginated<T> = { items: T[]; page: number; perPage: number; hasMore: boolean }`.
  - `TChargePreview = { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }`.
  - `TStartTaskResult = { status: 'succeeded' }`.
  - `TTransactionHistoryTask`, `TTransactionHistoryResponse` exactly as in the contract table; delete `TCompletedTransactionTask`, `TMerchantDashboardResponse` stays.
  - `TCreateCardPayload = { paymentMethodId: string }`; `TSetupIntentResponse = { clientSecret: string }`.
  - `TMeResponse` as in the contract table.
- Produces (route functions):
  - `tasksApis.fetchByCity({ city, page }) → Promise<TPaginated<TTask>>`; `tasksApis.pricePreview(offeredPrice: number) → Promise<TChargePreview>` (`GET /tasks/price-preview`, `params: { offeredPrice }`).
  - `walletApis.transactionHistory(page = 1) → Promise<TTransactionHistoryResponse>` (`params: { page }`); delete `useMerchantDashboardMutation` (`wallet-hooks.ts:18-20`, unused — `wallet.tsx:32` calls `walletApis.merchantDashboard` directly).
  - `cardsApis.setupIntent() → Promise<TSetupIntentResponse>` (`POST /card/setup-intent`); `cardsApis.create({ paymentMethodId })`; `cardsApis.delete(id) → Promise<void>`.
  - `authApis.me() → Promise<TMeResponse>` (`GET /auth/me`); `authApis.deleteAccount() → Promise<void>` (`DELETE /auth/account`).
  - `queryKeys.pricePreview = (offeredPrice: number) => ['tasks', 'pricePreview', offeredPrice] as const`.
  - `useAvailableTasksInfiniteQuery(city)`: `getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined)`; delete `AVAILABLE_TASKS_PAGE_SIZE`.
  - `useTransactionHistoryInfiniteQuery(options?: { enabled?: boolean })` replaces `useTransactionHistoryQuery` (same key `queryKeys.transactionHistory`, `initialPageParam: 1`, same `getNextPageParam`).
  - `ReceiptCard` "ID do pagamento" line becomes `label="Referência" value={`#${task.id.slice(0, 8).toUpperCase()}`}` (pin here; full receipt rewrite in T13).

- [ ] **Step 1: Write the failing tests**
  ```ts
  // apis-contract.test.ts — jest.spyOn(api, 'get'|'post'|'delete').mockResolvedValue({ data: ... })
  it('fetchByCity calls GET /tasks/fetch with city+page and returns the page object', async () => {
    getSpy.mockResolvedValue({ data: { items: [], page: 2, perPage: 10, hasMore: false } })
    await expect(tasksApis.fetchByCity({ city: 'São Paulo', page: 2 })).resolves.toEqual({ items: [], page: 2, perPage: 10, hasMore: false })
    expect(getSpy).toHaveBeenCalledWith('/tasks/fetch', { params: { city: 'São Paulo', page: 2 } })
  })
  it('pricePreview → GET /tasks/price-preview', ...)            // params: { offeredPrice: 100 }
  it('authApis.me → GET /auth/me', ...)
  it('authApis.deleteAccount → DELETE /auth/account', ...)
  it('cardsApis.setupIntent → POST /card/setup-intent; create sends { paymentMethodId }', ...)
  it('walletApis.transactionHistory(3) → GET /auth/transaction-history { params: { page: 3 } }', ...)
  // tasks-hooks.pagination.test.ts — renderHook(() => useAvailableTasksInfiniteQuery('São Paulo'), { wrapper })
  it('requests page 2 when hasMore and stops when false', ...)  // fetchByCity mocked: page1 hasMore true → fetchNextPage → called with page 2; page2 hasMore false → hasNextPage false
  ```
- [ ] **Step 2: Run it, expect failure** — `tasksApis.pricePreview is not a function`, etc.
- [ ] **Step 3: Implement** the types and functions above; fix every compile error `tsc` reports
  (`ProxyHome.tsx:64`, `wallet.tsx:90`, `ReceiptCard.tsx:6,92`, `CounterpartCard.tsx:71-75`, `index.tsx:155-161`).
  Where a screen needs the new money fields it is finished in T13; here only make it compile.
- [ ] **Step 4: Run it, expect pass** — spec files green and `npx tsc --noEmit` clean.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(apis): P3-T04 contract sync (pagination, me, price-preview, setup-intent)`

---

### Task P3-T05: Refresh infrastructure

**Files:**
- Create: `src/shared/providers/QueryFocusProvider.tsx`, `src/apis/auth/session-refresh.ts`, `src/feature/auth/hooks/useSessionRefreshOnFocus.ts`
- Modify: `src/apis/query-client.ts:21-34`, `src/store/auth-store/auth-store.ts` (add `applyMe`), `app/_layout.tsx:15-26`, `app/(app)/_layout.tsx:9-25`
- Install: `npx expo install @react-native-community/netinfo`
- Test: `src/shared/providers/__tests__/QueryFocusProvider.test.tsx`, `src/feature/auth/hooks/__tests__/useSessionRefreshOnFocus.test.ts`

**Interfaces:**
- Consumes: `focusManager`, `onlineManager` (`@tanstack/react-query` 5.101), `AppState` (RN), `NetInfo.addEventListener`, `authApis.me` (T04).
- Produces:
  - `QueryFocusProvider({ children })`: in a mount effect, `focusManager.setEventListener((setFocused) => { const sub = AppState.addEventListener('change', (s) => setFocused(s === 'active')); return () => sub.remove() })` and
    `onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected && s.isInternetReachable !== false)))`. Mounted in `app/_layout.tsx` directly inside `QueryClientProvider`.
  - `queryClient` defaults: `staleTime: 30_000`, `refetchOnWindowFocus: true`, `refetchOnReconnect: true` (gcTime, retry unchanged).
  - `useAuthStore.applyMe(me: TMeResponse): void` — merges `name, avatarUrl, phoneNumber, rating, totalTasksCompleted, totalTasksCreated, walletBalance, stripeAccountId, stripeAccountReady, payoutIssue` into `session` (no-op when `session` is null).
  - `export const SESSION_REFRESH_THROTTLE_MS = 30_000`; `export async function refreshMe(opts?: { force?: boolean }): Promise<void>` — returns early when no token, or when `!force && Date.now() - lastRefreshAt < THROTTLE`; otherwise `applyMe(await authApis.me())`, swallowing errors (401 is handled by the interceptor); `export function __resetRefreshThrottle()` for tests.
  - `useSessionRefreshOnFocus(): void` — calls `refreshMe()` on mount and on every `AppState` `'active'` transition. Mounted once in `app/(app)/_layout.tsx` (authenticated area).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // QueryFocusProvider.test.tsx
  it('mirrors AppState into focusManager', () => {
    const spy = jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() } as never)
    render(<QueryFocusProvider><Text>x</Text></QueryFocusProvider>)
    const handler = spy.mock.calls[0][1]
    act(() => handler('background')); expect(focusManager.isFocused()).toBe(false)
    act(() => handler('active'));     expect(focusManager.isFocused()).toBe(true)
  })
  it('mirrors NetInfo into onlineManager', () => { ... NetInfo mock listener → isConnected false → onlineManager.isOnline() === false })
  // useSessionRefreshOnFocus.test.ts (jest.useFakeTimers; authApis.me mocked → makeMe())
  it('calls /auth/me once on mount and not again inside 30 s', async () => {
    useAuthStore.getState().hydrate(signFakeJwt(makeSession()))
    renderHook(() => useSessionRefreshOnFocus())
    await act(async () => { appStateHandler('active') })
    expect(authApis.me).toHaveBeenCalledTimes(1)
  })
  it('calls again after 30 s on the next active event and applies walletBalance', async () => {
    jest.advanceTimersByTime(30_000); await act(async () => { appStateHandler('active') })
    expect(authApis.me).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().session?.walletBalance).toBe(250)
  })
  ```
- [ ] **Step 2: Run it, expect failure** — module not found / `applyMe is not a function`.
- [ ] **Step 3: Implement** the four files; run `npx expo install @react-native-community/netinfo`.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(session): P3-T05 focus/online managers + /auth/me refresh`

---

### Task P3-T06: Task queries/mutations — live polling, `onSettled`, timeout reconciliation, pull-to-refresh

**Files:**
- Create: `src/apis/tasks/reconcile.ts`
- Modify: `src/apis/tasks/tasks-hooks.ts:31-37,61-134`
- Modify: `src/feature/home/components/ClientHome.tsx:71-75`, `src/feature/home/components/ProxyHome.tsx:90-145`, `app/(app)/(tabs)/wallet.tsx:44-51` (add `RefreshControl`)
- Test: `src/apis/tasks/__tests__/reconcile.test.ts`, `src/apis/tasks/__tests__/tasks-hooks.mutations.test.ts`, `src/apis/tasks/__tests__/tasks-hooks.live.test.ts`

**Interfaces:**
- Consumes: `isTimeoutError`, `isNetworkError`, `isNotFoundError` (T03), `queryClient`, `refreshMe` (T05).
- Produces:
  - `export const LIVE_STATUSES: readonly TTaskStatus[] = ['available', 'in_progress', 'verification_required']`;
    `export const LIVE_REFETCH_MS = 10_000`;
    `export function liveRefetchInterval(task: TTaskDetail | undefined): number | false` — `LIVE_REFETCH_MS` when `task` is undefined (first load) or `LIVE_STATUSES.includes(task.status)` or `task.payment?.status === 'pending'`; else `false`.
  - `useTaskByIdQuery(id)`: `staleTime: 0`, `refetchInterval: (q) => liveRefetchInterval(q.state.data)`, `refetchIntervalInBackground: false`.
  - `export async function reconcileAfterTimeout(taskId: string, advancedTo: readonly TTaskStatus[]): Promise<TTaskDetail | null>` — `queryClient.fetchQuery({ queryKey: queryKeys.taskById(taskId), queryFn: () => tasksApis.fetchById(taskId), staleTime: 0 })`; returns the task when `advancedTo.includes(task.status)`, otherwise `null`; any error → `null`.
  - `export async function withReconcile<T>(run: () => Promise<T>, taskId: string, advancedTo: readonly TTaskStatus[], fallback: T): Promise<T>` — `try { return await run() } catch (e) { if (isTimeoutError(e) || isNetworkError(e) || isNotFoundError(e)) { const t = await reconcileAfterTimeout(taskId, advancedTo); if (t) return fallback } throw e }`.
  - `export function invalidateTaskScope(qc: QueryClient, taskId?: string): void` — invalidates `taskById(taskId)` (when given), `tasksActive`, `['tasks', 'byCity']`, `transactionHistory`, then `void refreshMe({ force: true })`.
  - Mutations: `useCreateTaskMutation` → `onSettled: () => invalidateTaskScope(qc)`;
    `useCancelTaskMutation` → `mutationFn: (p) => withReconcile(() => tasksApis.cancel(p), p.taskId, ['canceled'], undefined)`, `onSettled: (_, __, p) => invalidateTaskScope(qc, p.taskId)`;
    `useValidateTaskMutation` → advancedTo `['completed', 'payout_failed']`;
    `useFinishTaskMutation` → advancedTo `['verification_required', 'completed']`;
    `useStartTaskMutation` → `withReconcile(() => tasksApis.start(p), p.taskId, ['in_progress', 'verification_required'], { status: 'succeeded' })`.
  - `RefreshControl` on `ClientHome` `ScrollView` (`refreshing={isRefetching && !isPending}`, `onRefresh={refetch}`), on `ProxyHome` `FlatList` (`refreshing={isRefetching && !isFetchingNextPage}`, `onRefresh={refetch}` of the infinite query + `activeTasks.refetch`), on `Wallet` `ScrollView` (history refetch + `refreshMe({ force: true })`).

- [ ] **Step 1: Write the failing tests**
  ```ts
  // reconcile.test.ts (tasksApis.fetchById mocked)
  it('advanced status resolves as success', async () => {
    fetchById.mockResolvedValue(makeTaskDetail({ status: 'in_progress' }))
    await expect(withReconcile(() => Promise.reject(timeoutError), 'task-1', ['in_progress'], { status: 'succeeded' })).resolves.toEqual({ status: 'succeeded' })
  })
  it('rethrows when the task did not advance', async () => {
    fetchById.mockResolvedValue(makeTaskDetail({ status: 'available' }))
    await expect(withReconcile(() => Promise.reject(timeoutError), 'task-1', ['in_progress'], undefined)).rejects.toBe(timeoutError)
  })
  it('rethrows business errors without refetching', async () => { /* 409 → fetchById not called */ })
  // tasks-hooks.mutations.test.ts
  it('useStartTaskMutation invalidates taskById even when the request fails with 400', async () => {
    const spy = jest.spyOn(qc, 'invalidateQueries'); tasksApis.start.mockRejectedValue(makeAxiosError(400, { errorCode: 'TASK_NOT_AVAILABLE', message: '…' }))
    const { result } = renderHook(() => useStartTaskMutation(), { wrapper })
    await act(() => result.current.mutateAsync({ taskId: 'task-1' }).catch(() => {}))
    expect(spy).toHaveBeenCalledWith({ queryKey: ['tasks', 'byId', 'task-1'] })
    expect(spy).toHaveBeenCalledWith({ queryKey: ['wallet', 'transactionHistory'] })
  })
  // tasks-hooks.live.test.ts
  it.each([['available', 10000], ['in_progress', 10000], ['verification_required', 10000], ['completed', false], ['canceled', false]])('liveRefetchInterval(%s) → %p', ...)
  it('payment pending keeps polling even when completed', () => expect(liveRefetchInterval(makeTaskDetail({ status: 'completed', payment: makePayment({ status: 'pending' }) }))).toBe(10000))
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement** `reconcile.ts`, rewrite the hooks, add the three `RefreshControl`s. Add `makeTask`, `makeTaskDetail`, `makePayment` to `src/test/fixtures/tasks.ts` (defaults: `id: 'task-1'`, `status: 'available'`, `offeredPrice: '100.00'`, `platformFee: 20`, `stripeFee: 5.39`, `chargedAmount: 125.39`, `proxyEarnings: 100`, `city: 'São Paulo'`, `state: 'SP'`, `owner: 'user-1'`, `ownerId: { id: 'user-1', name: 'Ana Cliente', avatarUrl: null, rating: '0', totalTasksCreated: 1 }`, `payment: null`, `executorId: null`, `executor: null`).
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(tasks): P3-T06 live refetch, onSettled invalidations, timeout reconcile`

---

### Task P3-T07: `QueryErrorCard` + error states; 404 vs network on detail

**Files:**
- Create: `src/shared/components/QueryErrorCard.tsx`
- Modify: `src/feature/home/components/ClientHome.tsx:40,258-271`, `src/feature/home/components/ProxyHome.tsx:54,131-137`, `app/(app)/(tabs)/wallet.tsx:26,88-93`, `app/(app)/cards.tsx:21,101-107`, `src/feature/tasks/components/CreateTaskStep2.tsx:33,153`, `app/(app)/tasks/[id]/index.tsx:39,133-137,607-652`
- Test: `src/shared/components/__tests__/QueryErrorCard.test.tsx`, `app/(app)/tasks/[id]/__tests__/index.error.test.tsx`

**Interfaces:**
- Consumes: `isNetworkError`, `isTimeoutError` (T03). Because `shared/` may not import `apis/`, the card receives already-resolved props.
- Produces:
  - `QueryErrorCard({ message, offline, onRetry, retrying }: { message: string; offline?: boolean; onRetry: () => void; retrying?: boolean })` — title `offline ? 'Sem conexão' : 'Não foi possível carregar'`, body `message`, `Button variant="outline"` `'Tentar novamente'` (`loading={retrying}`).
  - `src/feature/shared-query/` is **not** created; each caller passes `message={extractErrorMessage(error)}` and `offline={isNetworkError(error) || isTimeoutError(error)}`.
  - Detail: `isError` branch → `isNotFoundError(error) ? <DetailNotFound /> : <QueryErrorCard … onRetry={refetch} />`. Only a 404 renders "Tarefa não encontrada".
  - `useCardQuery` consumers (`cards.tsx`, `CreateTaskStep2`, `profile.tsx`) show the card for `isError`; `cards.tsx` hides the CTAs while in error.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // QueryErrorCard.test.tsx
  it('renders offline title and retries', () => {
    const onRetry = jest.fn()
    const { getByText } = render(<QueryErrorCard message="Sem conexão. Verifique sua internet e tente novamente." offline onRetry={onRetry} />)
    getByText('Sem conexão'); fireEvent.press(getByText('Tentar novamente')); expect(onRetry).toHaveBeenCalledTimes(1)
  })
  // index.error.test.tsx — jest.mock('@/apis/tasks/tasks-hooks'); useTaskByIdQuery → { isPending: false, isError: true, error, refetch }
  it('network error shows the error card, not "Tarefa não encontrada"', () => {
    mockTaskQuery({ error: new AxiosError('Network Error') })
    const { queryByText, getByText } = render(<TaskDetail />)
    expect(queryByText('Tarefa não encontrada')).toBeNull(); getByText('Sem conexão'); getByText('Tentar novamente')
  })
  it('404 shows "Tarefa não encontrada"', () => { mockTaskQuery({ error: makeAxiosError(404, { errorCode: 'TASK_NOT_FOUND', message: 'Tarefa não encontrada.' }) }); getByText('Tarefa não encontrada') })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement** the component and wire the six call sites (`isError` was never read on five of them).
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(ui): P3-T07 QueryErrorCard + 404 vs network`

---

### Task P3-T08: Profile — account deletion, legal rows, remove "Editar dados"

**Files:**
- Create: `src/common/constants/legal.ts`, `src/apis/auth/auth-hooks.ts` (add `useDeleteAccountMutation`), `src/feature/profile/hooks/useDeleteAccountFlow.ts`
- Modify: `app/(app)/(tabs)/profile.tsx:34-37,81-110`
- Test: `app/(app)/(tabs)/__tests__/profile.test.tsx`, `src/feature/profile/hooks/__tests__/useDeleteAccountFlow.test.ts`

**Interfaces:**
- Consumes: `authApis.deleteAccount` (T04), `modal.confirm` (`src/lib/modal.ts:24-30`), `useProxyAuth().signOut`, `WebBrowser.openBrowserAsync`, `errorCodeOf` (T03).
- Produces:
  - `src/common/constants/legal.ts`:
    `TERMS_URL = process.env.EXPO_PUBLIC_TERMS_URL ?? 'https://proxy.app/termos'`,
    `PRIVACY_URL = process.env.EXPO_PUBLIC_PRIVACY_URL ?? 'https://proxy.app/privacidade'`,
    `SUPPORT_URL = process.env.EXPO_PUBLIC_SUPPORT_URL ?? 'https://proxy.app/suporte'`,
    `SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? 'suporte@proxy.app'`
    (placeholders; D24 owner input; `.env.example` gets the four keys).
  - `useDeleteAccountMutation()` → `useMutation({ mutationFn: authApis.deleteAccount })`.
  - `useDeleteAccountFlow(): { start: () => void; isPending: boolean }` — `start` opens
    `modal.confirm({ title: 'Excluir sua conta?', message: 'Seus dados pessoais serão removidos e você perderá o acesso ao histórico. Essa ação não pode ser desfeita.', okLabel: 'Continuar', onOk })`;
    `onOk` → `setTimeout(() => modal.confirm({ title: 'Tem certeza?', message: 'Tarefas publicadas e ainda sem Proxy serão canceladas. Confirme para excluir definitivamente.', okLabel: 'Excluir conta', destructive: true, onOk: run }), 320)`;
    `run` → `await mutateAsync()`; success → `toast.success('Conta excluída.')` then `await signOut()`;
    error with `errorCodeOf(e) === 'USER_HAS_ACTIVE_TASKS'` → `setTimeout(() => modal.error(extractErrorMessage(e)), 280)` then `router.navigate('/history')`; other errors → deferred `modal.error(extractErrorMessage(e))`.
  - Profile menu: section "Conta" → `Cartão` (CLIENT only). New section "Mais" → `MenuRow label="Termos de Uso"` → `WebBrowser.openBrowserAsync(TERMS_URL)`, `MenuRow label="Política de Privacidade"` → `PRIVACY_URL`, `MenuRow label="Ajuda e suporte"` → `SUPPORT_URL`. Below "Sair da conta": `Button variant="destructive" size="lg" fullWidth` `'Excluir conta'`. "Editar dados" row and `openEditAccount` deleted (D14).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // profile.test.tsx (useProxyAuth mocked → { session: makeSession(), signOut: jest.fn() })
  it('shows the deletion and legal entries and no "Editar dados"', () => {
    const { getByText, queryByText } = renderWithQuery(<Profile />)
    getByText('Excluir conta'); getByText('Termos de Uso'); getByText('Política de Privacidade'); getByText('Ajuda e suporte')
    expect(queryByText('Editar dados')).toBeNull()
  })
  it('opens the terms URL', () => { fireEvent.press(getByText('Termos de Uso')); expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(TERMS_URL) })
  // useDeleteAccountFlow.test.ts (authApis.deleteAccount mocked)
  it('double-confirms, deletes and signs out', async () => {
    jest.useFakeTimers(); result.current.start()
    expect(useModalStore.getState().title).toBe('Excluir sua conta?'); await act(() => useModalStore.getState().onOk!())
    act(() => jest.advanceTimersByTime(320)); expect(useModalStore.getState().title).toBe('Tem certeza?')
    await act(() => useModalStore.getState().onOk!())
    expect(authApis.deleteAccount).toHaveBeenCalledTimes(1); expect(signOut).toHaveBeenCalledTimes(1)
  })
  it('409 navigates to /history and keeps the session', async () => {
    deleteAccount.mockRejectedValue(makeAxiosError(409, { errorCode: 'USER_HAS_ACTIVE_TASKS', message: 'Você possui tarefas em andamento. Finalize ou cancele todas antes de excluir a conta.' }))
    …; expect(router.navigate).toHaveBeenCalledWith('/history'); expect(signOut).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(280)); expect(useModalStore.getState().message).toBe('Você possui tarefas em andamento. Finalize ou cancele todas antes de excluir a conta.')
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `Unable to find an element with text: Excluir conta`.
- [ ] **Step 3: Implement** the constants, hooks and the Profile menu per Produces.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(profile): P3-T08 account deletion + legal links`

---

### Task P3-T09: Sign-up cleanup, tappable Terms/Privacy, choose-profile copy

**Files:**
- Modify: `app/(auth)/sign-up.tsx:29-37,46-47,68-95,231-272,274-288,312-388`, `app/(auth)/choose-profile.tsx:71`
- Modify: `src/apis/auth/auth-api-types.ts` (`TCreateAccountPayload`: drop `documentType`, `documentUrl`, `avatarUrl`)
- Test: `app/(auth)/__tests__/sign-up.test.tsx`, `app/(auth)/__tests__/choose-profile.test.tsx`

**Interfaces:**
- Consumes: `TERMS_URL`, `PRIVACY_URL` (T08), `useCreateAccountMutation`.
- Produces:
  - `SignUpFormData = { name, email, phoneNumber, password, termsAccepted }`; `photoUploaded`, `PhotoUploader`, `FormToggle documentType`, the `document` input, `maskDocument` import and `canSubmit`'s proxy clause are deleted. Password field `returnKeyType="go"` → `onSubmitEditing={() => onSubmit()}`.
  - Payload sent: `{ name, email, phoneNumber, password, userType, termsAccepted: true }`.
  - Checkbox label: `Pressable` spans with `accessibilityRole="link"`: `'Termos de Uso'` → `WebBrowser.openBrowserAsync(TERMS_URL)`, `'Política de Privacidade'` → `PRIVACY_URL`; pressing a link must not toggle the checkbox (`onPress` stops at the span; `FormCheckbox` label is a `ReactNode`, `FormCheckbox.tsx:59-69`).
  - `choose-profile.tsx:71` → `'Cada conta tem um perfil. Para usar o outro, crie uma nova conta com outro e-mail.'`

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // sign-up.test.tsx (useLocalSearchParams → { userType: 'PROXY' }; useCreateAccountMutation mocked)
  it('renders no document fields for PROXY', () => {
    const { queryByText, queryByPlaceholderText } = render(<SignUp />)
    expect(queryByText('Foto do documento (frente)')).toBeNull(); expect(queryByText('Tipo de documento')).toBeNull()
    expect(queryByPlaceholderText('000.000.000-00')).toBeNull()
  })
  it('opens the terms and privacy links', () => {
    fireEvent.press(getByText('Termos de Uso')); expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(TERMS_URL)
    fireEvent.press(getByText('Política de Privacidade')); expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(PRIVACY_URL)
  })
  it('submits without document keys', async () => { …fill fields…; expect(mutateAsync).toHaveBeenCalledWith({ name: 'Bia Proxy', email: 'bia@proxy.app', phoneNumber: '11999990000', password: 'senha1234', userType: 'PROXY', termsAccepted: true }) })
  // choose-profile.test.tsx
  it('does not promise profile switching', () => { expect(queryByText('Você pode trocar de perfil depois, dentro do app.')).toBeNull(); getByText('Cada conta tem um perfil. Para usar o outro, crie uma nova conta com outro e-mail.') })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** `maskDocument/maskCPF/maskCNPJ` stay in `masks.ts` (unused is fine; `tsc` does not flag).
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(auth): P3-T09 sign-up without document, tappable legal links`

---

### Task P3-T10: Cards via SetupIntent, `urlScheme`, `/cards` role gate, card copy

**Files:**
- Modify: `src/feature/cards/components/AddCardSheet.tsx:1,37,97-116,194-204`, `src/apis/cards/cards-hooks.ts:28-36`
- Modify: `app/(app)/_layout.tsx:1-25` (`StripeProvider publishableKey={env.STRIPE_PUBLISHABLE_KEY} urlScheme="proxyapp"`, using `src/common/env.ts` from Phase 0 — APP-15)
- Modify: `app/(app)/cards.tsx:20-42` (role gate + copy)
- Test: `src/feature/cards/components/__tests__/AddCardSheet.test.tsx`, `app/(app)/__tests__/cards.test.tsx`

**Interfaces:**
- Consumes: `useConfirmSetupIntent()` from `@stripe/stripe-react-native` 0.64 — `confirmSetupIntent(clientSecret: string, { paymentMethodType: 'Card' }) → Promise<{ setupIntent?: SetupIntent.Result; error?: StripeError }>`; `setupIntent.paymentMethod?.id` (the `paymentMethodId` field is deprecated); `cardsApis.setupIntent`, `cardsApis.create` (T04).
- Produces:
  - `useCreateCardMutation()` `mutationFn: ({ paymentMethodId }) => cardsApis.create({ paymentMethodId })`; `onSuccess` unchanged.
  - `AddCardSheet.handleSave`: `const { clientSecret } = await cardsApis.setupIntent()` → `const { setupIntent, error } = await confirmSetupIntent(clientSecret, { paymentMethodType: 'Card' })` → on `error || !setupIntent?.paymentMethod?.id` set `sheetError = error?.localizedMessage ?? 'Cartão inválido. Confira os dados.'` → `await createCard.mutateAsync({ paymentMethodId: setupIntent.paymentMethod.id })` → `toast.success('Cartão adicionado!')` → `onSuccess()`.
  - Sheet copy (`:202-203`) → `'Seu cartão é cobrado quando um Proxy aceita uma tarefa sua. O valor só é repassado depois que você valida a conclusão.'`
  - `cards.tsx`: `const { session } = useProxyAuth(); if (session && session.userType !== 'CLIENT') return <Redirect href="/home" />` before any hook that fetches (hooks order: call `useProxyAuth` first, then `useCardQuery({ enabled: isClient })`). Replace modal message (`:30-31`) → `'Você vai cadastrar um novo cartão no lugar do atual.'`; remove toast copy `'Cartão removido.'` on successful delete.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // AddCardSheet.test.tsx
  it('saves through SetupIntent and posts the payment method id', async () => {
    cardsApis.setupIntent.mockResolvedValue({ clientSecret: 'seti_secret' })
    confirmSetupIntent.mockResolvedValue({ setupIntent: { paymentMethod: { id: 'pm_123' } } })
    cardsApis.create.mockResolvedValue(makeCard())
    const onSuccess = jest.fn(); const { getByText } = renderWithQuery(<AddCardSheet visible onClose={jest.fn()} onSuccess={onSuccess} />)
    // CardField is mocked to null; drive `complete` through the exported test hook: fire onCardChange via the mock's captured prop
    cardFieldProps().onCardChange({ complete: true })
    fireEvent.press(getByText('Salvar cartão'))
    await waitFor(() => expect(cardsApis.create).toHaveBeenCalledWith({ paymentMethodId: 'pm_123' }))
    expect(confirmSetupIntent).toHaveBeenCalledWith('seti_secret', { paymentMethodType: 'Card' }); expect(onSuccess).toHaveBeenCalled()
  })
  it('shows the Stripe error and does not call /card/create', async () => { confirmSetupIntent.mockResolvedValue({ error: { localizedMessage: 'Cartão recusado' } }); …; getByText('Cartão recusado'); expect(cardsApis.create).not.toHaveBeenCalled() })
  // cards.test.tsx
  it('redirects a PROXY to /home', () => { mockSession(makeSession({ userType: 'PROXY' })); expect(getByTestId('redirect').props.children).toBe('/home') })
  ```
  (`jest.setup.ts`: `CardField: (props) => { lastCardFieldProps = props; return null }` with `export const cardFieldProps = () => lastCardFieldProps` from `src/test/stripe-mock.ts`.)
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** `createPaymentMethod` import and `useStripe` usage removed from `AddCardSheet`.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(cards): P3-T10 SetupIntent card save + /cards role gate`

---

### Task P3-T11: Task detail split + `PaymentStatusBanner` + `requires_action` removal

**Files:**
- Create: `src/feature/tasks/utils/task-actions.ts`, `src/feature/tasks/components/task-detail/PaymentStatusBanner.tsx`, `…/ClientActionBar.tsx`, `…/ProxyActionBar.tsx`, `…/SummaryCard.tsx`, `…/ProofPhoto.tsx`, `…/DetailStates.tsx` (`DetailLoading`, `DetailNotFound`, `SectionTitle`)
- Modify: `app/(app)/tasks/[id]/index.tsx` (whole: keep state/handlers/JSX composition only; `:88-90` `askContest`, `:94-116` `askStart`, `:250-270` `clientActionsFor`, `:281-385`, `:391-414`, `:420-554`, `:560-652` move out)
- Test: `src/feature/tasks/utils/__tests__/task-actions.test.ts`, `app/(app)/tasks/[id]/__tests__/index.payment.test.tsx`

**Interfaces:**
- Consumes: `TTaskDetail`, `TSessionPayload`, `canCancelTask` (`src/feature/tasks/utils/can-cancel.ts`).
- Produces (`task-actions.ts`):
  - `export type ClientActions = { cancel: boolean; validate: boolean; support: boolean }`
  - `export function paymentBlocksActions(task: TTaskDetail): boolean` — `!!task.payment && task.payment.status !== 'succeeded'`.
  - `export function clientActionsFor(task: TTaskDetail, now = Date.now()): ClientActions | null` — `available` → `{ cancel: true, validate: false, support: false }`; `in_progress` → `canCancelTask(task, now) ? { cancel: true, … } : null`; `verification_required` → `paymentBlocksActions(task) ? { cancel: false, validate: false, support: true } : { cancel: false, validate: true, support: true }`; else `null`.
  - `export type ProxyAction = 'start' | 'configure' | 'finish' | 'waiting' | null`
  - `export function proxyActionFor(task: TTaskDetail, session: TSessionPayload): ProxyAction` — not PROXY → `null`; `available` → `session.stripeAccountReady ? 'start' : 'configure'`; `in_progress` and `task.executorId === session.sub` → `'finish'`; `verification_required` and executor → `'waiting'`; else `null`.
- Produces (components):
  - `PaymentStatusBanner({ status }: { status: TPaymentStatus })` — renders nothing for `succeeded`; otherwise a card (`INFO_TINT` for `pending`, `DESTRUCTIVE_TINT` otherwise) with title `'Pagamento pendente'` and body: `pending` → `'Ainda estamos confirmando o pagamento. As ações ficam disponíveis assim que for aprovado.'`; `failed` → `'O pagamento não foi aprovado. Fale com o suporte para seguir.'`; `disputed` → `'O pagamento está em disputa. Nossa equipe vai analisar e entrar em contato.'`; `refunded` → `'O pagamento foi estornado.'`
  - Route renders `{task.payment ? <PaymentStatusBanner status={task.payment.status} /> : null}` right under `SummaryCard`.
  - `askStart` success path: `toast.success('Tarefa aceita! Bom trabalho.')` only (no `requires_action` branch; `TStartTaskResult` has one member after T04).
  - `ClientActionBar({ actions, onCancel, onValidate, onSupport, insetsBottom, cancelLoading })` renders the support link only when `actions.support` (wired in T12; here `onSupport` is a prop).

- [ ] **Step 1: Write the failing tests**
  ```ts
  // task-actions.test.ts
  it('verification_required with pending payment hides validate', () => expect(clientActionsFor(makeTaskDetail({ status: 'verification_required', payment: makePayment({ status: 'pending' }) }))).toEqual({ cancel: false, validate: false, support: true }))
  it('verification_required with succeeded payment shows validate + support', ...)
  it('canceled → no proxy action', () => expect(proxyActionFor(makeTaskDetail({ status: 'canceled' }), makeSession({ userType: 'PROXY' }))).toBeNull())
  it('available + not ready → configure; ready → start', ...)
  it('executor on verification_required → waiting', ...)
  // index.payment.test.tsx (CLIENT session; useTaskByIdQuery mocked)
  it('pending payment shows the banner and no "Validar e pagar"', () => {
    mockTaskQuery({ data: makeTaskDetail({ status: 'verification_required', payment: makePayment({ status: 'pending' }) }) })
    const { getByText, queryByText } = render(<TaskDetail />)
    getByText('Pagamento pendente'); expect(queryByText('Validar e pagar')).toBeNull()
  })
  it('succeeded payment renders no banner', () => expect(queryByText('Pagamento pendente')).toBeNull())
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement** the split and the banner. The route file must shrink to ≈ 200 lines of state + handlers + composition.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `refactor(tasks): P3-T11 detail split + payment status banner`

---

### Task P3-T12: Proxy gate, "Falar com o suporte", waiting bar, start error copy

**Files:**
- Modify: `app/(app)/tasks/[id]/index.tsx` (handlers `askStart`, `openSupport`, `goConfigure`), `src/feature/tasks/components/task-detail/ClientActionBar.tsx`, `…/ProxyActionBar.tsx`
- Create: `src/feature/tasks/utils/support-link.ts`
- Test: `app/(app)/tasks/[id]/__tests__/index.proxy.test.tsx`, `src/feature/tasks/utils/__tests__/support-link.test.ts`

**Interfaces:**
- Consumes: `proxyActionFor`, `clientActionsFor` (T11), `SUPPORT_EMAIL` (T08), `Linking.openURL`, `errorCodeOf` (T03).
- Produces:
  - `export function buildSupportMailto(taskId: string, title: string): string` — `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Tarefa ${taskId}`)}&body=${encodeURIComponent(`Olá! Preciso de ajuda com a tarefa "${title}" (id ${taskId}).\n\n`)}`.
  - Client bar on `verification_required`: primary `'Validar e pagar'` (when `actions.validate`), secondary outline `'Falar com o suporte'` (when `actions.support`) → `modal.confirm({ title: 'Falar com o suporte?', message: 'O valor segue retido até o suporte analisar. Vamos abrir seu e-mail com o número da tarefa preenchido.', okLabel: 'Abrir e-mail', onOk: () => Linking.openURL(buildSupportMailto(task.id, task.title)) })`. Helper text under the buttons: `'Sem contestação, o pagamento é liberado automaticamente após 7 dias.'` No `modal.info('Funcionalidade em breve.')` anywhere (`grep -rn "em breve" app src` → 0 hits after T18).
  - Proxy bar by `proxyActionFor`: `'start'` → `'Aceitar e iniciar tarefa'`; `'configure'` → label `'Configure seu recebimento para aceitar'`, caption `'Conclua o cadastro no Stripe antes de aceitar tarefas.'`, `onPress: () => router.navigate('/wallet')`; `'finish'` → `'Enviar comprovante e finalizar'`; `'waiting'` → disabled button `'Aguardando validação do cliente'`.
  - `askStart` error mapping by `errorCodeOf(e)`: `PAYMENT_FAILED` → `'O pagamento do cliente foi recusado. A tarefa continua disponível.'`; `TASK_NOT_AVAILABLE` → `'Essa tarefa já foi aceita por outro Proxy.'`; `PROXY_ACCOUNT_NOT_READY` → `'Conclua seu cadastro de recebimento na Carteira para aceitar tarefas.'`; otherwise `extractErrorMessage(e)`. Shown with the existing 280 ms deferred `modal.error`.
  - Executor phone: when `task.ownerId.phoneNumber` is present, `CounterpartCard` gets an optional `phoneNumber?: string | null` prop rendering `maskPhone(phoneNumber)` under the name (D21).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // index.proxy.test.tsx (PROXY session)
  it('not-ready proxy sees the configure CTA and navigates to /wallet', () => {
    mockSession(makeSession({ userType: 'PROXY', sub: 'proxy-1', stripeAccountReady: false })); mockTaskQuery({ data: makeTaskDetail({ status: 'available' }) })
    fireEvent.press(getByText('Configure seu recebimento para aceitar')); expect(router.navigate).toHaveBeenCalledWith('/wallet'); expect(queryByText('Aceitar e iniciar tarefa')).toBeNull()
  })
  it('executor on verification_required sees a disabled waiting bar', () => { getByText('Aguardando validação do cliente'); expect(getByText('Aguardando validação do cliente').parent?.props.accessibilityState?.disabled).toBe(true) })
  it('PAYMENT_FAILED on start shows the decline copy', async () => {
    startMutate.mockRejectedValue(makeAxiosError(402, { errorCode: 'PAYMENT_FAILED', message: 'Falha ao processar o pagamento.' }))
    fireEvent.press(getByText('Aceitar e iniciar tarefa')); await act(() => useModalStore.getState().onOk!()); jest.advanceTimersByTime(280)
    expect(useModalStore.getState().message).toBe('O pagamento do cliente foi recusado. A tarefa continua disponível.')
  })
  // client half
  it('client on verification_required sees support, never "em breve"', () => { mockSession(makeSession()); getByText('Falar com o suporte'); expect(queryByText('Contestar conclusão')).toBeNull() })
  // support-link.test.ts
  it('builds the mailto with task id in subject', () => expect(buildSupportMailto('task-1', 'Trocar lâmpada')).toMatch(/^mailto:suporte@proxy\.app\?subject=Tarefa%20task-1&body=/))
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(tasks): P3-T12 proxy readiness gate + support link`

---

### Task P3-T13: Money from backend numbers

**Files:**
- Create: `src/apis/tasks/tasks-hooks.ts` (add `useChargePreviewQuery`)
- Modify: `src/feature/tasks/components/PriceBreakdown.tsx` (whole), `src/feature/tasks/components/CreateTaskStep2.tsx:37,85-87,157-173`, `src/feature/tasks/components/ReceiptCard.tsx` (whole), `src/feature/tasks/components/task-detail/SummaryCard.tsx` (from T11), `src/feature/tasks/utils/status-display.ts:22-23`, `src/feature/tasks/components/TaskTimeline.tsx:27,73,88-90,174-202`, `app/(app)/tasks/[id]/index.tsx` (receipt condition), `src/feature/wallet/components/BalanceCard.tsx:30`, `src/feature/wallet/components/EarningsList.tsx:11-16,116,127`, `src/feature/home/components/ProxyHome.tsx:277`
- Test: `src/feature/tasks/components/__tests__/PriceBreakdown.test.tsx`, `src/feature/tasks/components/__tests__/ReceiptCard.test.tsx`, `src/feature/tasks/components/__tests__/TaskTimeline.test.tsx`

**Interfaces:**
- Consumes: `tasksApis.pricePreview`, `TChargePreview`, `TTaskDetail` money numbers (T04), `formatBRL`.
- Produces:
  - `useChargePreviewQuery(offeredPrice: number)` → `useQuery({ queryKey: queryKeys.pricePreview(offeredPrice), queryFn: () => tasksApis.pricePreview(offeredPrice), enabled: offeredPrice >= 10, staleTime: Infinity, placeholderData: keepPreviousData })`.
  - `PriceBreakdown({ preview, loading, error, onRetry }: { preview: TChargePreview | undefined; loading: boolean; error?: unknown; onRetry?: () => void })` — presentational, **no arithmetic**: rows `'Valor oferecido'` `formatBRL(preview.offeredPrice)`, `'Taxa da plataforma (20%)'` `platformFee`, `'Taxa de processamento'` `stripeFee`, total `'Total a pagar'` `chargedAmount`; `loading` → skeleton rows with `'—'`; `error` → `QueryErrorCard` (`message` via `extractErrorMessage`, resolved by the caller). Constants `PLATFORM_FEE_RATE`, `STRIPE_FEE_RATE`, `STRIPE_FEE_FIXED` deleted.
  - `CreateTaskStep2`: `const preview = useChargePreviewQuery(offeredPrice)`; `canPublish = !!card && !!preview.data && !createTask.isPending`; subtitle → `'Confirme os detalhes e publique. Nada é cobrado agora: o cartão é cobrado quando um Proxy aceitar.'`
  - `SummaryCard({ task, role })`: CLIENT → label `'Valor oferecido'` + `formatBRL(task.offeredPrice)` and a second line `'Total a pagar'` `formatBRL(task.chargedAmount)`; PROXY → label `'Você recebe'` + `formatBRL(task.proxyEarnings)`.
  - `ReceiptCard({ task, role })` from stored numbers only: client headline `'Valor pago'` = `chargedAmount`, lines `'Valor da tarefa'` `offeredPrice`, `'Taxa da plataforma'` `platformFee`, `'Taxa de processamento'` `stripeFee`, `'Cobrado em'` `formatDateTime(task.startedAt)` (D1: charge at accept), `'Concluída em'` `formatDateTime(task.completedAt)` when present; proxy headline `'Você recebeu'` = `proxyEarnings`, lines `'Valor da tarefa'`, `'Concluída em'`; both `'Referência'` `#<id8>`. Rendered for `status ∈ {completed, payout_failed}` (no `task.payment` requirement — proxies have none).
  - `statusLabel('payout_failed')` → `'Falha no repasse'`; `TaskTimeline`: `payout_failed` renders `<PayoutFailedBadge />` (red like `CanceledBadge`): title `'Falha no repasse'`, body `'Não conseguimos repassar o pagamento. Verifique sua conta Stripe na Carteira.'`; `CanceledBadge` body → `'Se já havia cobrança, o estorno foi solicitado ao cartão.'`
  - `BalanceCard` label `'Total recebido'` (D8); `ProxyHome.tsx:277` `'Total recebido'`; `EarningsList` props `earnings: TTransactionHistoryTask[]`, amount `+formatBRL(task.proxyEarnings)`, date label from `completedAt`, header `'Repasses recentes'`.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // PriceBreakdown.test.tsx
  it('renders backend numbers verbatim', () => {
    const { getByText } = render(<PriceBreakdown preview={{ offeredPrice: 100, platformFee: 20, stripeFee: 5.39, chargedAmount: 125.39, proxyEarnings: 100 }} loading={false} />)
    getByText('R$ 100,00'); getByText('R$ 20,00'); getByText('R$ 5,39'); getByText('R$ 125,39'); getByText('Taxa de processamento'); getByText('Total a pagar')
  })
  it('loading shows placeholders and no total', () => { render(<PriceBreakdown preview={undefined} loading />); expect(queryByText(/R\$/)).toBeNull() })
  // ReceiptCard.test.tsx
  it('client receipt uses chargedAmount and stored fees', () => { …role="client"…; getByText('Valor pago'); getByText('R$ 125,39'); getByText('Taxa de processamento'); getByText('R$ 5,39'); getByText('#TASK-1') })
  it('proxy receipt shows proxyEarnings only', () => { getByText('Você recebeu'); getByText('R$ 100,00'); expect(queryByText('Taxa da plataforma')).toBeNull() })
  // TaskTimeline.test.tsx
  it('payout_failed renders the red badge', () => { render(<TaskTimeline status="payout_failed" />); getByText('Falha no repasse'); expect(queryByText('Pagamento liberado.')).toBeNull() })
  ```
  (`makeTaskDetail({ id: 'task-1' })` → reference `#TASK-1`.)
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** `grep -rn "0.0399\|0\.2\b\|0.39" src app` must return nothing after this task.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(money): P3-T13 render backend fee numbers everywhere`

---

### Task P3-T14: City picker

**Files:**
- Create: `src/common/constants/cities.ts`
- Modify: `src/feature/tasks/components/CreateTaskStep1.tsx:29-38,56-68,83-91,93-102,261-309`, `src/feature/home/components/ProxyHome.tsx:45,51,349`, `src/feature/tasks/hooks/useLocationCapture.ts:135-142`
- Test: `src/common/constants/__tests__/cities.test.ts`, `src/feature/tasks/components/__tests__/CreateTaskStep1.test.tsx`

**Interfaces:**
- Produces (`cities.ts`):
  - `export const SERVED_CITIES = [{ city: 'São Paulo', state: 'SP' }, { city: 'Rio de Janeiro', state: 'RJ' }, { city: 'Belo Horizonte', state: 'MG' }] as const`
  - `export type ServedCity = (typeof SERVED_CITIES)[number]['city']`
  - `export function normaliseCity(raw: string | null | undefined): ServedCity | null` — trims, lower-cases, strips diacritics (`normalize('NFD').replace(/[̀-ͯ]/g, '')`) and matches the same transform of each served city.
  - `export function stateForCity(city: ServedCity): string`.
  - `export const UNSERVED_CITY_MESSAGE = (city: string) => \`Ainda não atendemos em ${city}. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.\``
- Produces (Step 1): `city` becomes `FormToggle<ServedCity>` (`label="Cidade"`, options from `SERVED_CITIES`, `rules.required: 'Escolha a cidade.'`); the `state` `FormInput` (`:273-291`) is removed and `state` is derived `stateForCity(data.city)` at submit; `zipCode` keeps its row full-width. `handleUseLocation`: `const served = normaliseCity(result.city)`; if `null` → `modal.error(UNSERVED_CITY_MESSAGE(result.city || 'sua cidade'))` and leave the fields untouched; else set `city` to `served`.
- Produces (ProxyHome): `CITIES` constant replaced by `SERVED_CITIES.map((c) => c.city)`; default city unchanged.

- [ ] **Step 1: Write the failing tests**
  ```ts
  it.each([['sao paulo', 'São Paulo'], ['SÃO PAULO ', 'São Paulo'], ['rio de janeiro', 'Rio de Janeiro'], ['Guarulhos', null], ['', null]])('normaliseCity(%s) → %s', (i, o) => expect(normaliseCity(i)).toBe(o))
  it('stateForCity', () => expect(stateForCity('Belo Horizonte')).toBe('MG'))
  // CreateTaskStep1.test.tsx
  it('renders the three city options and no state input', () => { getByText('São Paulo'); getByText('Rio de Janeiro'); getByText('Belo Horizonte'); expect(queryByPlaceholderText('SP')).toBeNull() })
  it('submits state derived from the chosen city', async () => { …fill title/description/street/zip/price, press 'Rio de Janeiro', press 'Continuar'…; expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ city: 'Rio de Janeiro', state: 'RJ' })) })
  it('rejects an unserved city from device location', async () => { capture.mockResolvedValue({ …, city: 'Niterói' }); fireEvent.press(getByLabelText('Usar minha localização')); await waitFor(() => expect(useModalStore.getState().message).toBe('Ainda não atendemos em Niterói. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.')) })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** (`useLocationCapture` is mocked in the Step 1 test via `jest.mock('@/feature/tasks/hooks/useLocationCapture')`; `resolveCoords` mocked to `{ lat: -22.9, lng: -43.2 }`.)
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(tasks): P3-T14 served-cities picker`

---

### Task P3-T15: Location flow

**Files:**
- Modify: `src/feature/tasks/hooks/useLocationCapture.ts:103-112,151-187`, `src/feature/tasks/components/CreateTaskStep1.tsx:71-74` (coords reset), `app/(app)/tasks/create.tsx:54-65` (drop `initialCoords`)
- Test: `src/feature/tasks/hooks/__tests__/useLocationCapture.test.ts`

**Interfaces:**
- Consumes: `expo-location` `geocodeAsync`, `getForegroundPermissionsAsync`, `requestForegroundPermissionsAsync`, `getCurrentPositionAsync`; `Linking.openSettings`.
- Produces:
  - `ensurePermission()` modal → `modal.show({ variant: 'info', title: 'Permissão de localização', message: 'Precisamos da sua localização pra preencher o endereço. Você pode permitir em Ajustes.', okLabel: 'Abrir Ajustes', cancelLabel: 'Agora não', onOk: () => Linking.openSettings() })`.
  - `resolveCoords(input)`: **no permission request**; `geocodeAsync(query)` first; on a hit return `{ lat, lng }`; on miss/throw → `modal.error('Não encontramos esse endereço. Confira a rua, cidade e CEP.')` and return `null`. The device-position fallback is removed.
  - `capture()` unchanged except it uses `getForegroundPermissionsAsync` first and only calls `requestForegroundPermissionsAsync` when status is `undetermined`.
  - `CreateTaskStep1`: `useEffect` on `form.watch(['street', 'city', 'zipCode'])` → `setCoords(null)` when any value changes after mount; `initialCoords` prop removed (coords always re-resolved after "Voltar").

- [ ] **Step 1: Write the failing tests**
  ```ts
  it('resolveCoords geocodes without asking permission', async () => {
    Location.geocodeAsync.mockResolvedValue([{ latitude: -23.55, longitude: -46.63 }])
    await expect(result.current.resolveCoords(addr)).resolves.toEqual({ lat: -23.55, lng: -46.63 })
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled(); expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })
  it('returns null and shows the address error when geocoding finds nothing', async () => {
    Location.geocodeAsync.mockResolvedValue([])
    await expect(result.current.resolveCoords(addr)).resolves.toBeNull()
    expect(useModalStore.getState().message).toBe('Não encontramos esse endereço. Confira a rua, cidade e CEP.'); expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })
  it('denied permission offers "Abrir Ajustes"', async () => { Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' }); await result.current.capture(); expect(useModalStore.getState().okLabel).toBe('Abrir Ajustes'); await useModalStore.getState().onOk!(); expect(Linking.openSettings).toHaveBeenCalled() })
  ```
- [ ] **Step 2: Run it, expect failure** — `getCurrentPositionAsync` was called / message mismatch.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(tasks): P3-T15 geocode-first location flow`

---

### Task P3-T16: Proof upload

**Files:**
- Create: `src/feature/tasks/utils/prepare-proof.ts`
- Modify: `src/apis/tasks/tasks-apis.ts:40-51` (`timeout: 120_000`), `app/(app)/tasks/[id]/finish.tsx:30-96,282-287`
- Install: `npx expo install expo-image-manipulator`
- Test: `src/feature/tasks/utils/__tests__/prepare-proof.test.ts`, `src/apis/tasks/__tests__/tasks-apis.finish.test.ts`

**Interfaces:**
- Consumes: `ImageManipulator`, `SaveFormat` from `expo-image-manipulator` (SDK 57 object API: `ImageManipulator.manipulate(uri)` → `ctx.resize({ width })` → `await ctx.renderAsync()` → `await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG })` → `{ uri, width, height }`); `useFinishTaskMutation` (T06, already reconciles on timeout/404).
- Produces (`prepare-proof.ts`):
  - `export const MAX_PROOF_BYTES = 10 * 1024 * 1024`, `export const MAX_PROOF_EDGE = 1600`
  - `export const PROOF_TOO_LARGE_MESSAGE = 'A foto precisa ter até 10 MB. Escolha outra ou tire uma nova.'`
  - `export function validateProofAsset(asset: { fileSize?: number }): string | null` — message when `fileSize > MAX_PROOF_BYTES`, else `null`.
  - `export async function prepareProof(asset: { uri: string; width: number; height: number }): Promise<{ uri: string; name: string; type: 'image/jpeg' }>` — resizes when `Math.max(width, height) > MAX_PROOF_EDGE` (longest edge → 1600, aspect kept by passing only `width` or only `height`), always re-encodes to JPEG (HEIC → JPEG), `name: \`proof-${Date.now()}.jpg\``.
- Produces (`finish.tsx`): `handlePickResult` → `const err = validateProofAsset(asset); if (err) return modal.error(err)`; `setPicked(await prepareProof(asset))` with a `preparing` state on the preview; permission alerts → `modal.show({ variant: 'info', title: 'Permissão necessária', message: 'Habilite o acesso às fotos nas configurações do aparelho.' | '…à câmera…', okLabel: 'Abrir Ajustes', cancelLabel: 'Agora não', onOk: () => Linking.openSettings() })` (no `Alert.alert`, no "iPhone"). `extFromMime` deleted. Success toast unchanged `'Comprovante enviado. Aguardando validação.'`.
- `tasksApis.finish` posts with `{ headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 }`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  // prepare-proof.test.ts
  it('rejects an 11 MB asset', () => expect(validateProofAsset({ fileSize: 11 * 1024 * 1024 })).toBe('A foto precisa ter até 10 MB. Escolha outra ou tire uma nova.'))
  it('accepts 9 MB and unknown size', () => { expect(validateProofAsset({ fileSize: 9 * 1024 * 1024 })).toBeNull(); expect(validateProofAsset({})).toBeNull() })
  it('downscales a 4000x3000 photo to 1600 wide and outputs jpeg', async () => {
    const out = await prepareProof({ uri: 'file://a.heic', width: 4000, height: 3000 })
    expect(resizeMock).toHaveBeenCalledWith({ width: 1600 }); expect(saveMock).toHaveBeenCalledWith({ compress: 0.8, format: 'jpeg' }); expect(out.type).toBe('image/jpeg'); expect(out.name).toMatch(/^proof-\d+\.jpg$/)
  })
  it('does not resize a 1200x900 photo', async () => { await prepareProof({ uri: 'file://b.jpg', width: 1200, height: 900 }); expect(resizeMock).not.toHaveBeenCalled() })
  // tasks-apis.finish.test.ts
  it('finish posts multipart with a 120 s timeout', async () => {
    const post = jest.spyOn(api, 'post').mockResolvedValue({ data: undefined })
    await tasksApis.finish({ taskId: 'task-1', file: { uri: 'file://p.jpg', name: 'p.jpg', type: 'image/jpeg' } })
    expect(post).toHaveBeenCalledWith('/tasks/finish', expect.any(FormData), expect.objectContaining({ timeout: 120000 }))
  })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement**; run `npx expo install expo-image-manipulator`; add the module mock to `jest.setup.ts` (`manipulate: () => ctx` where `ctx.resize = resizeMock`, `ctx.renderAsync = async () => ({ saveAsync: saveMock })`).
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(tasks): P3-T16 proof downscale, size check, 120s timeout`

---

### Task P3-T17: Wallet — onboarding result, 4-state `MerchantStatusRow`, `payoutIssue`, role gate

**Files:**
- Modify: `src/feature/wallet/hooks/useStripeOnboarding.ts:26-52`, `src/feature/wallet/components/MerchantStatusRow.tsx` (whole), `app/(app)/(tabs)/wallet.tsx:18-26,76-86`, `src/feature/home/components/ProxyHome.tsx` (banner slot after the total card)
- Create: `src/feature/wallet/components/PayoutIssueBanner.tsx`
- Test: `src/feature/wallet/hooks/__tests__/useStripeOnboarding.test.ts`, `src/feature/wallet/components/__tests__/MerchantStatusRow.test.tsx`, `app/(app)/(tabs)/__tests__/wallet.test.tsx`

**Interfaces:**
- Consumes: `useRefreshSessionMutation` (existing, `/auth/session/refresh`), `refreshMe` (T05), `useAuthStore.getState().session`, `Redirect`.
- Produces:
  - `export type MerchantState = 'none' | 'pending' | 'ready' | 'issue'`; `export function merchantStateOf(s: Pick<TSessionPayload, 'stripeAccountId' | 'stripeAccountReady' | 'payoutIssue'>): MerchantState` — `payoutIssue && stripeAccountReady` → `'issue'`; `stripeAccountReady` → `'ready'`; `stripeAccountId` → `'pending'`; else `'none'`.
  - `MerchantStatusRow({ state, onboardingPending, dashboardPending, onStartOnboarding, onOpenDashboard })`: `none` → title `'Configure sua conta pra receber'`, CTA `'Configurar recebimento'`; `pending` → title `'Cadastro iniciado — aguardando o Stripe'`, body `'A confirmação pode levar alguns minutos. Se faltou algum dado, continue o cadastro.'`, CTA `'Continuar cadastro'` (same `onStartOnboarding`); `ready` → `'Recebimento configurado'` + link `'Abrir painel Stripe'`; `issue` → red card `'Problema no repasse'`, body `'Não conseguimos enviar seu último repasse. Atualize seus dados bancários no painel Stripe.'`, CTA `'Abrir painel Stripe'`.
  - `PayoutIssueBanner({ onPress })` (ProxyHome, shown when `session.payoutIssue`): `'Atualize seus dados bancários na Carteira'` → `router.navigate('/wallet')`.
  - `useStripeOnboarding().start`: after `refreshSession.mutateAsync()`, `const ready = useAuthStore.getState().session?.stripeAccountReady`; `ready` → `toast.success('Recebimento configurado com sucesso.')`; else `toast.info('Cadastro enviado. A confirmação do Stripe pode levar alguns minutos.')` and schedule `refreshMe({ force: true })` 3× at 10 s intervals (cleared on unmount).
  - `wallet.tsx`: `if (session && session.userType !== 'PROXY') return <Redirect href="/home" />`; `<MerchantStatusRow state={merchantStateOf(session)} …/>`; `BalanceCard amount={session.walletBalance}`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  // useStripeOnboarding.test.ts (createMerchantAccount → { accountLinkUrl: 'https://connect' }, openAuthSessionAsync → { type: 'success', url: 'proxyapp://wallet' })
  it('not ready after refresh → info toast, no success toast, polls 3×', async () => {
    jest.useFakeTimers(); refreshSession.mockImplementation(async () => useAuthStore.getState().hydrate(signFakeJwt(makeSession({ userType: 'PROXY', stripeAccountId: 'acct_1', stripeAccountReady: false }))))
    await act(() => result.current.start())
    expect(toast.info).toHaveBeenCalledWith('Cadastro enviado. A confirmação do Stripe pode levar alguns minutos.'); expect(toast.success).not.toHaveBeenCalled()
    jest.advanceTimersByTime(30_000); await act(async () => {}); expect(authApis.me).toHaveBeenCalledTimes(3)
  })
  it('ready → success toast', ...)
  // MerchantStatusRow.test.tsx
  it.each([['none', 'Configure sua conta pra receber'], ['pending', 'Cadastro iniciado — aguardando o Stripe'], ['ready', 'Recebimento configurado'], ['issue', 'Problema no repasse']])('%s', (state, title) => { render(<MerchantStatusRow state={state} … />); getByText(title) })
  it('merchantStateOf', () => { expect(merchantStateOf({ stripeAccountId: 'acct', stripeAccountReady: false, payoutIssue: false })).toBe('pending'); expect(merchantStateOf({ stripeAccountId: 'acct', stripeAccountReady: true, payoutIssue: true })).toBe('issue') })
  // wallet.test.tsx
  it('redirects a CLIENT', () => expect(getByTestId('redirect').props.children).toBe('/home'))
  it('shows "Total recebido"', () => getByText('Total recebido'))
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(wallet): P3-T17 onboarding result, merchant states, payoutIssue`

---

### Task P3-T18: History tab

**Files:**
- Create: `src/feature/history/utils/select-history.ts`, `src/feature/history/hooks/useHistory.ts`, `src/feature/history/components/HistoryTabs.tsx`, `src/feature/history/components/HistoryCard.tsx`, `src/feature/history/components/HistoryEmptyState.tsx`
- Modify: `app/(app)/(tabs)/history.tsx` (whole)
- Delete: `src/shared/components/TabPlaceholder.tsx` (last consumer gone)
- Test: `src/feature/history/utils/__tests__/select-history.test.ts`, `app/(app)/(tabs)/__tests__/history.test.tsx`

**Interfaces:**
- Consumes: `useActiveTasksQuery`, `useTransactionHistoryInfiniteQuery` (T04), `statusLabel`, `formatBRL`, `formatDateTime`, `QueryErrorCard` (T07).
- Produces:
  - `export type HistoryTab = 'ongoing' | 'done' | 'canceled'`; `export const HISTORY_TABS: { key: HistoryTab; label: string }[] = [{ key: 'ongoing', label: 'Em andamento' }, { key: 'done', label: 'Concluídas' }, { key: 'canceled', label: 'Canceladas' }]`.
  - `export type THistoryItem = { id: string; title: string; status: TTaskStatus; offeredPrice: string | number; date: string }` (date = `completedAt ?? canceledAt ?? createdAt`).
  - `export function selectHistoryItems(tab: HistoryTab, active: TTask[] | undefined, pages: TTransactionHistoryResponse[] | undefined): THistoryItem[]` — `ongoing` → every `active` task (status ∈ available/in_progress/verification_required); `done` → `tasksCreated ∪ tasksCompleted` across pages, deduped by `id`, status ∈ `{completed, payout_failed}`; `canceled` → status `canceled`; sorted by `date` desc.
  - `useHistory(tab): { items, isPending, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage }` — `ongoing` reads the active query; others read the infinite history query (both queries always enabled so switching tabs is instant, SPEC §8.13 edge case).
  - `history.tsx`: title `'Histórico'`, `HistoryTabs` (`accessibilityRole="tab"`, `accessibilityState={{ selected }}`), `FlatList` of `HistoryCard` (status badge, title, `formatBRL(offeredPrice)`, `formatDateTime(date)`), `onEndReached` → `fetchNextPage`, `RefreshControl`, states: skeleton (`TaskCardSkeleton`×3), `QueryErrorCard`, empty `'Nada por aqui'` / `'Suas tarefas vão aparecer nesta aba quando houver atualização.'`. Tap → `router.push(\`/tasks/${id}\`)`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  // select-history.test.ts
  const pages = [{ tasksCreated: [h({ id: 'a', status: 'completed' }), h({ id: 'b', status: 'canceled' })], tasksCompleted: [h({ id: 'a', status: 'completed' }), h({ id: 'c', status: 'payout_failed' })], page: 1, perPage: 20, hasMore: false }]
  it('done merges both lists, dedupes and includes payout_failed', () => expect(selectHistoryItems('done', [], pages).map((i) => i.id)).toEqual(['a', 'c']))   // (after date sort with equal dates keep input order)
  it('canceled filters canceled', () => expect(selectHistoryItems('canceled', [], pages).map((i) => i.id)).toEqual(['b']))
  it('ongoing comes from active tasks', () => expect(selectHistoryItems('ongoing', [makeTask({ id: 'x', status: 'in_progress' })], pages).map((i) => i.id)).toEqual(['x']))
  // history.test.tsx (hooks mocked)
  it('renders the three tabs and a completed task under Concluídas', () => {
    getByText('Em andamento'); getByText('Concluídas'); getByText('Canceladas')
    fireEvent.press(getByText('Concluídas')); getByText('Trocar lâmpada da sala'); getByText('Concluída')
  })
  it('empty tab copy', () => { fireEvent.press(getByText('Canceladas')); getByText('Nada por aqui') })
  it('no "Em construção" anywhere', () => expect(queryByText('Em construção')).toBeNull())
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.** Also `grep -rn "em breve\|Em construção" app src` → 0 hits.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(history): P3-T18 history tab`

---

### Task P3-T19: Copy fixes, optional rating + 500-char counter, Client Home stats, cancel copy

**Files:**
- Create: `src/feature/tasks/utils/copy.ts`
- Modify: `src/feature/tasks/components/CreateTaskStep1.tsx:338`, `src/feature/tasks/components/ValidateTaskSheet.tsx:99-112,202-215,227-247,263-274`, `src/feature/home/components/ClientHome.tsx:40,57-65`, `app/(app)/tasks/[id]/index.tsx` (`askCancel` message), `app/index.tsx:16` (keep)
- Test: `src/feature/tasks/utils/__tests__/copy.test.ts`, `src/feature/tasks/components/__tests__/ValidateTaskSheet.test.tsx`, `src/feature/home/components/__tests__/ClientHome.test.tsx`

**Interfaces:**
- Produces (`copy.ts`, exact strings — snapshot-tested):
  - `PRICE_HINT = 'Mínimo R$ 10,00. Seu cartão é cobrado quando um Proxy aceita; o valor só é repassado após você validar.'`
  - `cancelMessageFor(status: TTaskStatus): string` — `available` → `'Essa ação não pode ser desfeita. Como nenhum Proxy aceitou, nada foi cobrado.'`; `in_progress` → `'Essa ação não pode ser desfeita. O valor cobrado será estornado no seu cartão em até 10 dias úteis.'` (D7, full refund); other → `'Essa ação não pode ser desfeita.'`
  - `VALIDATE_SUBTITLE = 'Ao confirmar, liberamos o pagamento para o Proxy. Se quiser, deixe uma avaliação pra ajudar a comunidade.'`
  - `COMMENT_MAX = 500`
- `ValidateTaskSheet`: rating optional (D15) — button enabled regardless of rating; `handleValidate` sends `rating: rating > 0 ? rating : undefined`; label `'Sua avaliação (opcional)'`; `TextInput maxLength={COMMENT_MAX}` + counter text `` `${comment.length}/500` ``.
- `ClientHome` stats: `'Ativas'` (owned active count), `'Criadas'` (`session.totalTasksCreated`), `'Concluídas'` = count of `tasksCreated` with status `completed` from `useTransactionHistoryInfiniteQuery` page 1 (`'—'` while loading). Remove the rating stat.
- Step 1 price hint → `PRICE_HINT`; detail `askCancel` → `cancelMessageFor(task.status)`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  it('copy snapshot', () => expect({ PRICE_HINT, VALIDATE_SUBTITLE, cancelAvailable: cancelMessageFor('available'), cancelInProgress: cancelMessageFor('in_progress') }).toMatchInlineSnapshot(…exact strings above…))
  // ValidateTaskSheet.test.tsx
  it('validates without a rating', async () => { fireEvent.press(getByText('Validar e pagar')); await waitFor(() => expect(validate).toHaveBeenCalledWith({ taskId: 'task-1', rating: undefined, comment: undefined })) })
  it('caps the comment at 500 and shows the counter', () => { fireEvent.changeText(getByPlaceholderText('Conte como foi o serviço (opcional).'), 'a'.repeat(20)); getByText('20/500'); expect(getByPlaceholderText(…).props.maxLength).toBe(500) })
  // ClientHome.test.tsx
  it('shows Criadas and no Avaliação', () => { render(<ClientHome session={makeSession({ totalTasksCreated: 7 })} />); getByText('Criadas'); getByText('7'); expect(queryByText('Avaliação')).toBeNull() })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** Also `grep -rn "pré-autorizado\|Você paga apenas quando\|Cobramos só quando\|trocar de perfil" app src` → 0 hits.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(copy): P3-T19 money copy, optional rating, client stats`

---

### Task P3-T20: Polish A — shell

**Files:**
- Create: `app/+not-found.tsx`, `src/lib/pending-route.ts`, `src/common/constants/layout.ts`
- Modify: `app/(app)/(tabs)/_layout.tsx:34-40`, `src/shared/components/Toast.tsx:21,89-91`, `src/shared/components/AppModal.tsx:63-84,94,96-97`, `app/(app)/_layout.tsx:12-16`, `app/(auth)/_layout.tsx:9-13`, `app/index.tsx:24-28`
- Test: `src/shared/components/__tests__/AppModal.test.tsx`, `app/__tests__/not-found.test.tsx`, `src/lib/__tests__/pending-route.test.ts`

**Interfaces:**
- Produces:
  - `layout.ts`: `export const TAB_BAR_CONTENT_HEIGHT = 56`. Tabs: `tabBarStyle.height: TAB_BAR_CONTENT_HEIGHT + insets.bottom` (`useSafeAreaInsets` in `TabsLayout`), Toast `bottomOffset = inTabs ? TAB_BAR_CONTENT_HEIGHT + insets.bottom + 8 : insets.bottom + 12` (inset counted once).
  - `pending-route.ts`: `setPendingHref(href: string)`, `consumePendingHref(): string | null` (module state, cleared on consume). `(app)/_layout` stores `usePathname()` before `router.replace('/')` when unauthenticated and the path is not `/home`; `(auth)/_layout` and `app/index.tsx` redirect to `consumePendingHref() ?? '/home'`.
  - `+not-found.tsx`: title `'Página não encontrada'`, body `'O link que você abriu não existe mais.'`, `Button 'Voltar ao início'` → `router.replace('/home')` when authenticated else `'/'`.
  - `AppModal.handleOk`: `catch (e) { setTimeout(() => useModalStore.getState().show({ variant: 'error', message: 'Algo deu errado. Tente novamente.' }), 280) }`; backdrop `onPress` and `onRequestClose` → `handleCancel` (which returns early while `okLoading`).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  it('backdrop press while okLoading does not hide', async () => {
    useModalStore.getState().show({ message: 'x', cancelLabel: 'Cancelar', okLabel: 'Ok', onOk: () => new Promise(() => {}) })
    fireEvent.press(getByText('Ok')); fireEvent.press(getByTestId('modal-backdrop'))
    expect(useModalStore.getState().open).toBe(true)
  })
  it('rejected onOk surfaces an error modal', async () => { show({ message: 'x', onOk: () => Promise.reject(new Error('boom')) }); fireEvent.press(getByText('OK')); jest.advanceTimersByTime(280); expect(useModalStore.getState().variant).toBe('error') })
  // not-found
  it('renders PT copy and navigates home', () => { getByText('Página não encontrada'); fireEvent.press(getByText('Voltar ao início')); expect(router.replace).toHaveBeenCalled() })
  // pending-route
  it('consume returns once', () => { setPendingHref('/tasks/abc'); expect(consumePendingHref()).toBe('/tasks/abc'); expect(consumePendingHref()).toBeNull() })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement** (add `testID="modal-backdrop"` to the outer `Pressable`).
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(shell): P3-T20 tab bar inset, modal guards, not-found, deep-link replay`

---

### Task P3-T21: Polish B — forms & lists

**Files:**
- Create: `src/feature/home/utils/search.ts`
- Modify: `app/(auth)/sign-in.tsx:44-53`, `app/(auth)/sign-up.tsx` (`onSubmit`), `app/(auth)/forgot-password.tsx:220-227,412-421` (guard at the top of each `onSubmit`), `src/feature/home/components/ProxyHome.tsx:63-72,418,441-444`, `src/feature/tasks/hooks/useDeviceLocation.ts:26-53`, `src/feature/tasks/components/task-detail/ProofPhoto.tsx` (from T11), `src/feature/tasks/utils/can-cancel.ts:17-23`
- Test: `src/feature/tasks/utils/__tests__/can-cancel.test.ts`, `src/feature/home/utils/__tests__/search.test.ts`, `app/(auth)/__tests__/sign-in.test.tsx`

**Interfaces:**
- Produces:
  - `canCancelTask`: `in_progress` with `startedAt === null` → `false` (inconsistent data = no money action).
  - `search.ts`: `export function matchesSearch(task: Pick<TTask, 'title' | 'locationAddress'>, query: string): boolean` — diacritic- and case-insensitive on both fields; `export function fold(s: string): string`.
  - ProxyHome: result count `` `${resultCount} disponíveis` ``; banner `'1 tarefa ativa'` / `` `${n} tarefas ativas` ``.
  - `useDeviceLocation`: on mount call `getForegroundPermissionsAsync()`; fetch position only when already `granted`; never `request…` on mount (`status: 'denied'` otherwise). Distances simply hide.
  - `ProofPhoto`: `useState(error)`; `Image onError={() => setError(true)}`; fallback box with `'Não foi possível carregar a foto.'`.
  - Auth `onSubmit`s: `if (mutation.isPending) return` as the first line inside `handleSubmit`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  it('in_progress without startedAt cannot be canceled', () => expect(canCancelTask({ status: 'in_progress', startedAt: null })).toBe(false))
  it('search ignores accents and case', () => expect(matchesSearch({ title: 'Trocar lâmpada', locationAddress: 'Rua Sao Joao' }, 'LAMPADA')).toBe(true))
  // sign-in.test.tsx
  it('two rapid submits fire one mutateAsync', async () => { mutateAsync.mockReturnValue(new Promise(() => {})); isPending→true after first call; fill fields; fireEvent(getByPlaceholderText('Sua senha'), 'submitEditing'); fireEvent(getByPlaceholderText('Sua senha'), 'submitEditing'); await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1)) })
  ```
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `fix(ui): P3-T21 submit guard, accent search, lazy location, proof fallback`

---

### Task P3-T22: Polish C — hygiene & docs

**Files:**
- Modify: `eslint.config.js` (add `no-restricted-imports` with `patterns: ['../**/src/*', '../../src/*']`), `app/(auth)/sign-up.tsx:24`, `app/(auth)/sign-in.tsx:22`, `app/(auth)/forgot-password.tsx` (same relative `modal` import), `tailwind.config.js` `content` globs (must include `./app/**/*.{ts,tsx}` and `./src/**/*.{ts,tsx}`), `.env.example` (four legal keys from T08), `CLAUDE.md` (document: status-dependent absolute action bars on task detail as the one exception to the in-scroll CTA rule; `src/test/` harness; `QueryFocusProvider`; `apis/api-errors.ts`), `SPEC.md` §3.4 (routes `/auth/me`, `/tasks/price-preview`, `/card/setup-intent`, pagination shape), §7.3 (SetupIntent at save, off-session charge, no `requires_action`), §8.8 (city toggle, no date/time, breakdown from backend), §8.9 (support link, no "em breve", payment banner, proxy states), §8.11 ("Total recebido", 4 states), §8.13 (as built), §8.14 (no edit profile, deletion flow, legal rows).
- Test: `npx eslint .` must fail before (3 relative imports) and pass after; `npx tsc --noEmit`.

- [ ] **Step 1: Add the lint rule and run `npx eslint .`** — expect 3 errors `'../../src/lib/modal' import is restricted`.
- [ ] **Step 2: Fix the imports to `@/lib/modal`; re-run** — 0 errors.
- [ ] **Step 3: Update `tailwind.config.js`, `.env.example`, `CLAUDE.md`, `SPEC.md`** per the list.
- [ ] **Step 4: Verify the repo gate** — `npx tsc --noEmit && npx eslint . && npm test`.
- [ ] **Step 5: Final sweep** — `grep -rn "em breve\|Em construção\|requires_action\|0.0399\|pré-autorizado" app src` → 0 hits; every `TODO`/`FIXME` added during the phase removed.
- [ ] **Step 6: Mark Phase 3 done in ../STATUS.md; commit** `chore(app): P3-T22 lint rule, globs, docs sync`
