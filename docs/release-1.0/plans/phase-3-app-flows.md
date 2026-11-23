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
`onSettled` invalidations + a timeout-reconciliation helper. The session is a 30-minute access JWT
plus an opaque refresh token in SecureStore: an authenticated 401 runs one single-flight
`POST /auth/refresh` and retries once (P3-T02); user data (wallet, rating, flags) is refreshed through
`GET /auth/me` on foreground (throttled 30 s) and after every task mutation. Create Task addresses
come from Google Places Autocomplete (New) through a small typed client in `src/lib/google-places/`.

**Tech stack:** Expo SDK 57 (`expo` ^57.0.24, RN 0.86.3, React 19.2.3), Expo Router ~57.0.22,
`@tanstack/react-query` 5.101.2, `axios` ^1.16, `zustand` ^5, `zod` 3.25.76 (already in
`node_modules`; add to `dependencies` explicitly), `jwt-decode` ^4, `@stripe/stripe-react-native`
0.64.0, `react-hook-form` ^7.76, `expo-location` ~57.0.19, `expo-image-picker` ~57.0.19,
`expo-web-browser` ~57.0.3, new: `@react-native-community/netinfo`, `expo-image-manipulator`, `expo-crypto` (Places session
tokens). Google Places API (New) is called over REST with axios (no SDK).
Tests: `jest-expo` + `@testing-library/react-native` (set up in Phase 0, `npm test`).

**Spec:** `../PLAN.md` §2 (Phase 3), `../DECISIONS.md` D1–D21, `proxy-app/SPEC.md` §2.5, §2.8, §7.2,
§7.3, §8.6–§8.14; registers `../audit/R-app-review.md` §2–3 (APP-01…APP-30),
`../audit/R-release-contract-review.md` §2 (CON-02, CON-04, CON-07, CON-10, CON-12).

## Amendments (2026-11-23 owner decision round)

`../DECISIONS.md` rows D1, D3, D9, D12, D14, D16 (and D25 on the backend) were rewritten on
2026-11-23 and are the binding authority; this plan was amended the same day to match them and the
amended Phase 2 plan. New tasks use **lettered inserts** (`P3-T08b`, `P3-T14b`) so every existing
task id, STATUS row and loop card keeps its meaning; a lettered task sits right after the task it
extends and, like every task, starts only when everything in its "Depends on" column is done.

**What changed**

- **D9 session.** The app stores an access JWT (30 minutes) **and** an opaque refresh token in
  SecureStore. An authenticated 401 runs one single-flight `POST /auth/refresh`, retries the
  original request once, and signs out only when the refresh is rejected. Sign-out revokes the
  refresh token server-side. An expired access token is no longer a reason to sign out at boot.
- **D1 money.** The client pays exactly `offeredPrice` and sees one number ("Você paga", fees
  included); the proxy sees "Você recebe" = `proxyEarnings` (80 %). No fee lines anywhere. Every
  example was recomputed (Python `decimal`, ROUND_HALF_UP, 2 dp, `stripeFee = charged × 0.0399 + 0.39`):
  100 → `{ offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 100, proxyEarnings: 80 }`;
  123.45 → `{ 123.45, 24.69, 5.32, 123.45, 98.76 }`; 20 (minimum) → `{ 20, 4, 1.19, 20, 16 }`.
  Price bounds R$ 20,00 … R$ 10.000,00.
- **D3 charging.** Card save is unchanged (SetupIntent). The charge happens at `/tasks/start` with
  automatic capture; payment states are only `pending | succeeded | failed | refunded | disputed`.
  A failed charge at start shows the proxy "Não foi possível cobrar o cliente. Tente outra tarefa."
  and the client a "confirm your card" banner driven by `cardActionRequired`.
- **D12 documents.** No document claims, types or "Verificado" badge; sign-up has no document fields.
- **D14 edit profile.** "Editar dados" stays and opens a new edit screen (name + phone).
- **D16 address search.** The Create Task address comes from Google Places Autocomplete (New)
  (`country:br`, session tokens) through a small typed REST client; the GPS shortcut survives as
  "Usar minha localização atual" (device coordinates + reverse geocode); both must resolve to a
  served city. New env key `EXPO_PUBLIC_GOOGLE_PLACES_KEY` (fail-fast, placeholder rejected).

**Tasks touched / added**

| Task | Change |
|---|---|
| Contract table | Token pair, refresh/logout, update-profile, Places-shaped create body, D1 fixture, numeric money/rating (matches P2-T13), history item = P2-T15 `TaskSummary` |
| P3-T01 | Session schema without document/`tokenVersion` claims, with `cardActionRequired`; refresh-token storage; expired access token kept at boot |
| P3-T02 | Rewritten: 401 → single-flight refresh → retry once → sign out; logout revokes |
| P3-T04 | Token-pair / update-profile types and routes, numeric money, history shape |
| P3-T05 | `refreshMe` refreshes user data only (ruling below), merges `cardActionRequired` |
| P3-T06 | Fixtures on D1 numbers |
| P3-T08 | "Editar dados" no longer removed |
| **P3-T08b (new)** | Edit profile screen (D14) |
| P3-T09 | Deletes `TDocumentType` |
| P3-T10 | `cardActionRequired` banner (D3); `env.stripePublishableKey` name fixed |
| P3-T11 | Five payment states with per-state titles |
| P3-T12 | D3 start-failure copy |
| P3-T13 | Rewritten: client one total, proxy 80 %, `TaskCard` per role, price bounds |
| P3-T14 | Rewritten: Places client + served-city mirror + env key |
| **P3-T14b (new)** | Create Task step 1 address search, Places-shaped payload, ProxyHome pills |
| P3-T15 | Rewritten: "Usar minha localização atual" (no forward geocoding) |
| P3-T18 | History amounts per role from `netAmount` |
| P3-T19 | R$ 20,00 minimum, new price hint |
| P3-T22 | Docs/sweep follow the above |

**Rulings**

- Ruling: lettered inserts (`P3-T08b`, `P3-T14b`) instead of renumbering — STATUS rows, cards and the Phase 2 contract notes keep pointing at the right task — cost if wrong: none beyond two new STATUS rows.
- Ruling: P3-T05 keeps `refreshMe` (throttled `GET /auth/me` on foreground and after mutations) for **user data** and drops any token refresh on foreground — the P3-T02 interceptor already renews an expired access token on the first 401, including the `/auth/me` call itself — cost if wrong: add a proactive `exp` check in the request interceptor (one function).
- Ruling: an expired access token is kept at boot; only an undecodable token or a missing refresh token signs the user out — 30-minute tokens expire every time the phone sleeps — cost if wrong: one extra 401 round trip after a long background.
- Ruling: the refresh is 401-driven only (no proactive `exp` check), matching D9 — cost if wrong: one failed request per 30 minutes of use.
- Ruling: sign-out happens only when `/auth/refresh` answers 4xx; offline / timeout / 5xx keep both tokens and just fail the original request — an offline phone must not log the user out — cost if wrong: a dead session survives until the next online request rejects it.
- Ruling: `/auth/refresh` and `/auth/logout` go through a bare axios instance (`authHttp`, no interceptors) — no recursion into the 401 handler — cost if wrong: none known.
- Ruling: sign-out revokes the refresh token fire-and-forget (the token is read before the store is cleared) — sign-out must work offline and instantly — cost if wrong: a missed revoke leaves one family alive until its 60-day expiry.
- Ruling: P3-T08 leaves the "Editar dados" row untouched and P3-T08b wires it to `/edit-profile` — typed routes would fail `tsc` if T08 linked to a route that does not exist yet — cost if wrong: none.
- Ruling: the edit screen is a short form (no `flex: 1` spacer, CTA right after the fields, per the keyboard-handling rule), sends only dirty fields, maps an empty phone to `null`, shows 400s inline and other errors in the deferred error modal — cost if wrong: copy/layout tweak only.
- Ruling: Places goes through a ~100-line typed REST client in `src/lib/google-places/` (`POST /v1/places:autocomplete`, `GET /v1/places/{id}` with `X-Goog-FieldMask: location,formattedAddress,addressComponents`) instead of `react-native-google-places-autocomplete` — that package targets the legacy Places web service, is effectively unmaintained, gives no typed results, and makes session-token and field-mask billing control awkward; a plain client is unit-testable with jest spies — cost if wrong: swap the client behind `usePlacesAutocomplete`, the UI does not change.
- Ruling: requests send `X-Goog-Api-Key` and, on iOS, `X-Ios-Bundle-Identifier` (needed when the key is restricted to the iOS app); the Android key restriction (`X-Android-Package` + `X-Android-Cert`) is deferred to Phase 5 with the final bundle ids (D23) — cost if wrong: Android builds get `403` from Places until Phase 5.
- Ruling: one session token (`expo-crypto` `randomUUID()`) per search, reused for every keystroke and the single Place Details call, renewed after details or when the user clears the field; debounce 300 ms, minimum 3 characters, `languageCode: 'pt-BR'`, `includedRegionCodes: ['br']` — keeps autocomplete inside one billed session — cost if wrong: tune two numbers.
- Ruling: city = `administrative_area_level_2` `longText`, falling back to `locality`; state = `administrative_area_level_1` `shortText` (UF); the served-city check runs in the app for instant feedback and again on the backend (authoritative, `CITY_NOT_SERVED`) — cost if wrong: one mapping function.
- Ruling: an optional "Complemento" field (apto, bloco) is sent separately and appended by the backend — Places addresses have no unit number — cost if wrong: drop one optional field.
- Ruling: `EXPO_PUBLIC_GOOGLE_PLACES_KEY` must start with `AIza`; the placeholder `your-google-places-key` is rejected like the Stripe placeholder — cost if wrong: relax one prefix check.
- Ruling: P3-T15 keeps the GPS path only as "Usar minha localização atual": device coordinates + `expo-location` `reverseGeocodeAsync` (the platform geocoder, free, no second Google API to enable) → must resolve to a served city; `geocodeAsync` at submit and the silent device-position fallback are gone because Places now supplies coordinates; "Abrir Ajustes" stays for denied permission — cost if wrong: switch the reverse geocode to the Google Geocoding API inside one hook.
- Ruling: P3-T14b removes the old "Usar minha localização" button with the old address inputs and P3-T15 re-adds the shortcut inside the new address field — one owner per piece of UI, no throw-away adapter — cost if wrong: the shortcut is missing for exactly one task.
- Ruling (copy, D1): client — `'Você paga'` + `formatBRL(chargedAmount)` + caption `'Taxas incluídas.'`, receipt headline `'Valor pago'`; proxy — `'Você recebe'` / `'Você recebeu'` + `formatBRL(proxyEarnings)` + caption `'80% do valor da tarefa'` (Brazilian typography writes `80%` without a space; "da tarefa" says what the 80 % is of) — cost if wrong: one string constant each.
- Ruling: the client still calls `GET /tasks/price-preview` and renders `chargedAmount` instead of echoing the typed number — D2 "the app never computes fees" and a future fee change needs no app release — cost if wrong: one cached GET per distinct price.
- Ruling (copy, D3): the proxy's start failure is mapped on `errorCode === 'PAYMENT_FAILED'` whatever the HTTP status (Phase 1 may answer 402 or 409) to `'Não foi possível cobrar o cliente. Tente outra tarefa.'`; the client banner reads title `'Confirme seu cartão'`, helper `'Não conseguimos cobrar seu cartão na última tarefa.'`, CTA `'Abrir Cartão'` → `/cards` — D3 says "Confirme seu cartão na Carteira", but clients have no Carteira tab (Carteira is the proxy's earnings tab) and their card lives under Perfil › Cartão — cost if wrong: one string; owner to confirm (open point).
- Ruling: `PaymentStatusBanner` gets one title per state (`pending` 'Pagamento pendente', `failed` 'Pagamento não aprovado', `disputed` 'Pagamento em disputa', `refunded` 'Pagamento estornado') — a refunded payment is not "pending" — cost if wrong: copy only.
- Ruling: the contract table now follows the amended Phase 2 output where the two plans disagreed before: `offeredPrice`, owner/counterpart `rating` and `payment.amount` are numbers (P2-T13/P2-T14), and the history item is the P2-T15 `TaskSummary` (`city`, `offeredPrice`, `netAmount`) without `proxyEarnings`/`platformFee` — cost if wrong: one types file (P3-T04).
- Ruling: proxies see their own number everywhere money appears (feed card, detail, receipt, history), clients see `offeredPrice`/`chargedAmount` — D1 "one number for each side" — cost if wrong: a `role` prop on two components.
- Ruling: `MIN_OFFERED_PRICE = 20` / `MAX_OFFERED_PRICE = 10_000` are mirrored in `src/common/constants/pricing.ts` for form validation and query gating only, never for fee math — cost if wrong: two constants to edit when D1 bounds change.

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
- The loop may start Expo/Metro, the simulators A/B and Maestro (D28, see `scripts/device.sh`); verification is tsc + eslint + jest plus the task's Maestro flow when it touches a screen.
- One task = one commit by the owner: `feat|fix|test|chore(<area>): P3-Txx <title>`.
- Repo gate before marking any task done: `npx tsc --noEmit && npx eslint . && npm test`.

## Backend contract this phase consumes (pinned here; Phases 1–2 must emit exactly this)

| Route | Shape consumed by the app | Phase/ID |
|---|---|---|
| JWT claims (access token) | `sub, name, email, userType, avatarUrl, phoneNumber: string \| null, rating: number, walletBalance: number, totalTasksCreated, totalTasksCompleted, termsAccepted, stripeAccountId, stripeAccountReady, stripeCustomerId, payoutIssue: boolean, cardActionRequired: boolean, iat, exp` (`exp - iat = 1800`, 30 minutes); no `tokenVersion`, no `documentType`/`documentUrl`/`isVerified` | P2-T03, P2-T03b, P2-T04, D3, D5, D9, D10, D12 |
| `POST /auth/session`, `POST /auth/create` | `TTokenPair = { session: string; refreshToken: string }` (`refreshToken` is opaque, 43 chars) | P2-T04, D9 |
| `POST /auth/refresh { refreshToken }` | `TTokenPair` (rotated; the old refresh token is dead); 401 `{ errorCode: 'SESSION_REFRESH_INVALID' }` when unknown, expired, reused or the user was deleted; not JWT-guarded | P2-T04, D9 |
| `POST /auth/logout { refreshToken }` | 204 always (idempotent); not JWT-guarded | P2-T04, D9 |
| `GET /auth/session/refresh` | `{ session }` — re-signed access token only, refresh token untouched | P2-T04 |
| `POST /auth/update-profile { name?, phoneNumber? }` | `{ session }` (re-signed access token); body is strict — any other key → 400 `VALIDATION_FAILED`; `phoneNumber: null` clears the phone | P2-T06, D14 |
| `GET /auth/me` | `TMeResponse = { id, name, email, avatarUrl, phoneNumber, userType, rating: number, totalTasksCompleted: number, totalTasksCreated: number, walletBalance: number, stripeAccountId: string \| null, stripeAccountReady: boolean, payoutIssue: boolean, cardActionRequired: boolean, termsAccepted: boolean }` | P2-T05, D3, D10 |
| `DELETE /auth/account` | 204; 409 `{ errorCode: 'USER_HAS_ACTIVE_TASKS', message }` | existing, P2-T09/D13 |
| `GET /auth/transaction-history?page=` | `{ tasksCreated: TTransactionHistoryTask[], tasksCompleted: TTransactionHistoryTask[], page, perPage, hasMore }`, `TTransactionHistoryTask = { id, title, status: TTaskStatus, city: string, offeredPrice: number, netAmount: number, createdAt, completedAt: string \| null, canceledAt: string \| null }` — `netAmount` = stored `proxyEarnings` for executor rows (0 when canceled), `chargedAmount ?? offeredPrice` for completed owner rows (0 otherwise); executor list = all terminal statuses | P2-T15, D1, D20 |
| `GET /tasks/fetch?city=&page=` | `{ items: TTask[], page: number, perPage: 10, hasMore: boolean }`; an unserved `city` returns the empty page | P2-T12, D16 |
| `GET /tasks/:id`, `/tasks/active`, `/tasks/fetch` items | `TTask` + `city`, `state`, `completedAt`, `canceledAt`; money fields `offeredPrice`, `platformFee`, `stripeFee`, `chargedAmount`, `proxyEarnings` and coordinates as **numbers**; owner = `{ id, name, avatarUrl, rating: number, totalTasksCreated }` (+ `phoneNumber` only for the mapped executor while `in_progress`/`verification_required`); `payment` only for the owner, without `paymentIntent`, `amount: number`, `status ∈ pending \| succeeded \| failed \| refunded \| disputed` | P1, P2-T13/P2-T14, D2, D3, D21 |
| `GET /tasks/price-preview?offeredPrice=` | `{ offeredPrice, platformFee, stripeFee, chargedAmount, proxyEarnings }` numbers, `chargedAmount === offeredPrice` (D1); accepted range 20 … 10000; fixture used in tests: `100 → { offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 100, proxyEarnings: 80 }` | P1-T07, D1 |
| `POST /tasks/create` | body `address = { formattedAddress, complement?, city, state, locationLat, locationLng }` (from Google Places or the device); 400 `{ errorCode: 'CITY_NOT_SERVED', message }` outside São Paulo/SP, Rio de Janeiro/RJ, Belo Horizonte/MG | P2-T11, D16 |
| `POST /tasks/start` | `{ status: 'succeeded' }` only (charge with automatic capture at start); errors `PAYMENT_FAILED` (client's card could not be charged — 409 per D3; the app routes on `errorCode`, not on the status), `TASK_NOT_AVAILABLE`, `PROXY_ACCOUNT_NOT_READY` 409, `CANNOT_START_OWN_TASK` | P1, P2-T16, D3 |
| `POST /card/setup-intent` → `{ clientSecret }`; `POST /card/create { paymentMethodId }` → `TCard` (also clears `cardActionRequired`) | — | P1, D3 |
| Error envelope | `{ message (pt-BR), errorCode, statusCode }`; Phase 0 adds `VALIDATION_FAILED` (400), `TOO_MANY_REQUESTS` (429), `FILE_TOO_LARGE` (413) | P0 BE-33/34 |
| Google Places API (New) — not our backend | `POST https://places.googleapis.com/v1/places:autocomplete` (`X-Goog-Api-Key`, `includedRegionCodes: ['br']`, `sessionToken`) → `{ suggestions: [{ placePrediction: { placeId, structuredFormat: { mainText: { text }, secondaryText: { text } } } }] }`; `GET https://places.googleapis.com/v1/places/{placeId}?sessionToken=` with `X-Goog-FieldMask: location,formattedAddress,addressComponents` → `{ formattedAddress, location: { latitude, longitude }, addressComponents: [{ longText, shortText, types }] }` | P3-T14, D16 |

If a Phase 1/2 plan names a key differently, change it in **one** file (`src/apis/<domain>/<domain>-api-types.ts`,
P3-T04) and nowhere else.

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P3-T01 | Session schema (Zod), refresh-token storage, `isAuthenticated = !!session`, test harness | — | APP-11, APP-13, CON-02, D9, D10, D12 | `npx jest src/apis/auth/__tests__/session-schema.test.ts src/store/auth-store/__tests__/auth-store.test.ts` |
| P3-T02 | Boot hygiene + 401 → single-flight refresh → retry once → sign out; logout revokes | T01 | APP-05, APP-12, APP-14, CON-12, D9 | `npx jest src/shared/providers/__tests__/SessionProvider.test.tsx src/apis/__tests__/api-client.test.ts src/apis/auth/__tests__/token-refresh.test.ts` |
| P3-T03 | `api-errors.ts`: PT mapping for 429/413/VALIDATION_FAILED + error classifiers | — | APP-10, CON-04 | `npx jest src/apis/__tests__/api-errors.test.ts` |
| P3-T04 | Contract sync: types, route functions, pagination, update-profile, dead code | T01 | APP-03 (types), CON-10, D12, D14, D21, pagination/history/me/price-preview/setup-intent contract | `npx jest src/apis/__tests__/apis-contract.test.ts && npx tsc --noEmit` |
| P3-T05 | Refresh infra: `QueryFocusProvider`, NetInfo, `refreshMe` (user data only), `useSessionRefreshOnFocus` | T01, T04 | APP-05, APP-08, D9, D10 | `npx jest src/shared/providers/__tests__/QueryFocusProvider.test.tsx src/feature/auth/hooks/__tests__/useSessionRefreshOnFocus.test.ts` |
| P3-T06 | Task queries/mutations: `refetchInterval`, `onSettled`, `reconcileAfterTimeout`, pull-to-refresh | T04, T05 | APP-08, APP-29 | `npx jest src/apis/tasks/__tests__/` |
| P3-T07 | `QueryErrorCard` + error states on every list; 404 vs network on detail | T03, T04 | APP-20 | `npx jest src/shared/components/__tests__/QueryErrorCard.test.tsx "app/(app)/tasks/\[id\]/__tests__/index.error.test.tsx"` |
| P3-T08 | Profile: "Excluir conta" (double confirm, 409), legal rows | T03, T04 | APP-01, APP-02, D13 | `npx jest "app/(app)/(tabs)/__tests__/profile.test.tsx"` |
| P3-T08b | Edit profile screen (name + phone) behind "Editar dados" | T03, T04, T08 | D14, BE-14 (app half) | `npx jest "app/(app)/__tests__/edit-profile.test.tsx" "app/(app)/(tabs)/__tests__/profile.test.tsx"` |
| P3-T09 | Sign-up without document/photo, tappable Terms/Privacy, choose-profile copy | T08 | APP-06, APP-02, D11, D12 | `npx jest "app/(auth)/__tests__/sign-up.test.tsx"` |
| P3-T10 | Cards via SetupIntent, `urlScheme`, `/cards` role gate, card copy, `cardActionRequired` banner | T04, T05 | D3, APP-23, APP-19, APP-15 | `npx jest src/feature/cards/components/__tests__/AddCardSheet.test.tsx src/feature/cards/components/__tests__/CardActionBanner.test.tsx "app/(app)/__tests__/cards.test.tsx"` |
| P3-T11 | Task detail split + `PaymentStatusBanner` (five payment states) + `requires_action` removal | T04, T06, T07 | APP-03, D3, D6 | `npx jest src/feature/tasks/utils/__tests__/task-actions.test.ts "app/(app)/tasks/\[id\]/__tests__/index.payment.test.tsx"` |
| P3-T12 | Proxy gate to Wallet, "Falar com o suporte", waiting bar, start error copy (D3) | T11, T08 | APP-18, APP-30, D3, D18 | `npx jest "app/(app)/tasks/\[id\]/__tests__/index.proxy.test.tsx"` |
| P3-T13 | Money from backend numbers: client "Você paga" (one total), proxy "Você recebe" (80 %), receipts, `payout_failed`, "Total recebido" | T04, T11 | APP-04, APP-21, D1, D2, D8 | `npx jest src/feature/tasks/components/__tests__/PriceBreakdown.test.tsx src/feature/tasks/components/__tests__/ReceiptCard.test.tsx src/feature/tasks/components/__tests__/TaskCard.test.tsx` |
| P3-T14 | Google Places (New) client, served-city mirror, `EXPO_PUBLIC_GOOGLE_PLACES_KEY` | T04 | APP-07, CON-07, D16 | `npx jest src/common/read-env.test.ts src/common/constants/__tests__/cities.test.ts src/lib/google-places/__tests__/` |
| P3-T14b | Create Task step 1: Places address search, served-city gate, Places-shaped payload, ProxyHome pills | T14, T13 | APP-07, D16 | `npx jest src/feature/tasks/hooks/__tests__/usePlacesAutocomplete.test.ts src/feature/tasks/components/__tests__/CreateTaskStep1.test.tsx src/feature/tasks/components/__tests__/CreateTaskStep2.payload.test.tsx` |
| P3-T15 | "Usar minha localização atual": permission flow, reverse geocode → served city, "Abrir Ajustes" | T14b | APP-17, D16 | `npx jest src/feature/tasks/hooks/__tests__/useLocationCapture.test.ts src/feature/tasks/components/__tests__/AddressSearchField.location.test.tsx` |
| P3-T16 | Proof upload: downscale, 10 MB check, 120 s timeout, reconcile, modal copy | T06 | APP-16, D19, APP-28 (finish.tsx items) | `npx jest src/feature/tasks/utils/__tests__/prepare-proof.test.ts src/apis/tasks/__tests__/tasks-apis.finish.test.ts` |
| P3-T17 | Wallet: onboarding result, 4-state `MerchantStatusRow`, `payoutIssue` banner, `/wallet` gate | T05, T13 | APP-22, APP-21, APP-23, D5 | `npx jest src/feature/wallet/hooks/__tests__/useStripeOnboarding.test.ts src/feature/wallet/components/__tests__/MerchantStatusRow.test.tsx` |
| P3-T18 | History tab (three tabs) from `/tasks/active` + new history endpoint | T04, T06, T07 | APP-09, D1, D20 | `npx jest src/feature/history/utils/__tests__/select-history.test.ts "app/(app)/(tabs)/__tests__/history.test.tsx"` |
| P3-T19 | Copy fixes, R$ 20,00 minimum, optional rating + 500-char counter, Client Home stats, cancel copy | T11, T13, T14b | APP-19, APP-10, APP-05, D1, D7, D15 | `npx jest src/feature/tasks/components/__tests__/ValidateTaskSheet.test.tsx src/feature/tasks/utils/__tests__/copy.test.ts src/feature/tasks/components/__tests__/CreateTaskStep1.price.test.tsx` |
| P3-T20 | Polish A — shell: tab bar height, Toast inset, `+not-found`, deep-link replay, `AppModal` guards | T02 | APP-24, APP-25, APP-27, APP-28 | `npx jest src/shared/components/__tests__/AppModal.test.tsx "app/__tests__/not-found.test.tsx" src/lib/__tests__/pending-route.test.ts` |
| P3-T21 | Polish B — forms & lists: double-submit guard, ProxyHome counts/search, lazy location, `ProofPhoto` fallback, `canCancelTask` | T06 | APP-26, APP-28 | `npx jest src/feature/tasks/utils/__tests__/can-cancel.test.ts src/feature/home/utils/__tests__/search.test.ts "app/(auth)/__tests__/sign-in.test.tsx"` |
| P3-T22 | Polish C — hygiene & docs: alias imports lint rule, tailwind globs, CLAUDE.md/SPEC sync | all | APP-28, CON-10 (docs) | `npx eslint . && npx tsc --noEmit` |

## Review focus

1. **Cold start with an expired access token but a valid refresh token** → the user stays signed in:
   the first request 401s, exactly one `POST /auth/refresh`, the retried request succeeds, no flash
   of the Splash screen. **Legacy install** (access token in SecureStore, no refresh token) →
   hydrates to `null`, SecureStore cleared, Splash, no request fired. Owned by P3-T01
   (`auth-store.test.ts` "hydrate keeps an expired access token when a refresh token exists",
   "hydrate without a refresh token (legacy install) signs out") and P3-T02 (`api-client.test.ts`).
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
6. **Two requests 401 at once after the app returns from background, and the phone is offline when
   the refresh runs** → one refresh attempt, both requests fail with the network copy, the user is
   **not** signed out; back online, the next request refreshes and succeeds. Owned by P3-T02
   (`api-client.test.ts` "two concurrent 401s trigger one refresh", "keeps the session when the
   refresh is unavailable (offline)").
7. **Client picks a Places suggestion in Niterói (outside the served cities)** → inline "Ainda não
   atendemos em Niterói. …" under the field, "Continuar" stays disabled, nothing reaches the backend.
   Owned by P3-T14b (`CreateTaskStep1.test.tsx` "an unserved city shows the inline error and keeps
   Continuar disabled").

---

### Task P3-T01: Session schema (Zod), refresh-token storage, `isAuthenticated = !!session`, test harness

**Files:**
- Create: `src/apis/auth/session-schema.ts`
- Create: `src/test/jwt.ts`, `src/test/fixtures/session.ts`, `src/test/render.tsx`
- Modify: `src/apis/auth/auth-api-types.ts:12-32` (replace the `TSessionPayload` interface with a re-export; add `TTokenPair`, `TAccessTokenResponse`; `TSessionResponse` becomes an alias of `TTokenPair`). `TDocumentType` stays until P3-T09 removes its last user.
- Modify: `src/lib/secure-store.ts` (refresh-token key)
- Modify: `src/store/auth-store/auth-store.ts` (whole)
- Modify: `src/apis/auth/auth-hooks.ts:14-33` (sign-in / sign-up store the token pair)
- Modify: `src/feature/auth/hooks/useProxyAuth.ts:30`
- Modify: `jest.setup.ts` (from Phase 0) — add the shared module mocks listed below
- Modify: `package.json` — add `"zod": "^3.25.76"` to `dependencies` (already hoisted in `node_modules`)
- Test: `src/apis/auth/__tests__/session-schema.test.ts`, `src/store/auth-store/__tests__/auth-store.test.ts`

**Interfaces:**
- Consumes: `jwtDecode` (`jwt-decode` 4), `saveToken/getToken/clearToken` from `@/lib/secure-store`.
- Produces:
  - `export const sessionPayloadSchema: z.ZodObject<…>` with fields: `sub: z.string()`, `email: z.string()`,
    `name: z.string()`, `avatarUrl: z.string().nullable().default(null)`,
    `phoneNumber: z.string().nullable().default(null)`, `stripeAccountId: z.string().nullable().default(null)`,
    `stripeAccountReady: z.boolean().default(false)`, `stripeCustomerId: z.string().nullable().default(null)`,
    `userType: z.enum(['CLIENT', 'PROXY'])`,
    `rating: z.coerce.number().default(0)`, `totalTasksCompleted: z.coerce.number().int().default(0)`,
    `totalTasksCreated: z.coerce.number().int().default(0)`, `walletBalance: z.coerce.number().default(0)`,
    `payoutIssue: z.boolean().default(false)`, `cardActionRequired: z.boolean().default(false)`,
    `termsAccepted: z.boolean().default(false)`, `iat: z.number().optional()`, `exp: z.number().optional()`.
    No `documentType`, `documentUrl`, `isVerified` or `tokenVersion` (D9, D12); unknown legacy claims are stripped by Zod.
  - `export type TSessionPayload = z.infer<typeof sessionPayloadSchema>` (re-exported from
    `auth-api-types.ts` so existing imports keep working).
  - `export function decodeSession(token: string | null): TSessionPayload | null` — `null` when the
    token is falsy, `jwtDecode` throws, or `safeParse` fails. It does **not** reject an `exp` in the
    past: access tokens live 30 minutes and an expired one is renewed by the 401 interceptor (P3-T02)
    with the refresh token.
  - `auth-api-types.ts`: `export type TTokenPair = { session: string; refreshToken: string }`,
    `export type TSessionResponse = TTokenPair` (`POST /auth/session`, `POST /auth/create`),
    `export type TAccessTokenResponse = { session: string }` (`GET /auth/session/refresh`, `POST /auth/update-profile`).
  - `src/lib/secure-store.ts`: keys `proxy.session.token` (unchanged) and `proxy.session.refresh`;
    `saveToken`, `getToken` unchanged; new `saveRefreshToken(token: string)`, `getRefreshToken(): Promise<string | null>`;
    `clearToken()` deletes **both** keys (every caller means "sign out").
  - `useAuthStore`:
    ```ts
    interface AuthState {
      token: string | null
      refreshToken: string | null
      session: TSessionPayload | null
      hydrated: boolean
      setTokens: (pair: TTokenPair) => Promise<void>   // login, sign-up, refresh rotation
      setSession: (token: string) => Promise<void>     // access token only (session/refresh, update-profile)
      clearSession: () => Promise<void>
      hydrate: (tokens: { token: string | null; refreshToken: string | null }) => void
    }
    ```
    `hydrate`: `session = decodeSession(token)`; when `!session || !refreshToken` → `void clearToken().catch(() => {})`
    and store `{ token: null, refreshToken: null, session: null, hydrated: true }` (a legacy install
    with only an access token signs out); otherwise store all three with `hydrated: true`.
    `setTokens`: decode `pair.session`; `null` → `clearSession()`; else `saveToken` + `saveRefreshToken`, then set.
    `setSession`: decode; `null` → `clearSession()`; else `saveToken`, set `token` + `session` (refresh token unchanged).
    `clearSession`: `clearToken().catch(() => {})`, all `null`.
  - `useSignInMutation` / `useCreateAccountMutation`: `await useAuthStore.getState().setTokens(await authApis.session(payload))`
    (resp. `authApis.create`); `useRefreshSessionMutation` keeps `setSession(session)`.
  - `useProxyAuth().isAuthenticated === !!session`.
  - Test harness: `signFakeJwt(payload: Record<string, unknown>): string` (base64url header + payload +
    `'sig'`; `jwtDecode` does not verify), `makeSession(overrides?: Partial<TSessionPayload>): TSessionPayload`
    (defaults: `sub: 'user-1'`, `userType: 'CLIENT'`, `name: 'Ana Cliente'`, `email: 'ana@proxy.app'`,
    `stripeAccountReady: false`, `payoutIssue: false`, `cardActionRequired: false`, `exp: Math.floor(Date.now() / 1000) + 1800`),
    `makeTokenPair(overrides?: Partial<TSessionPayload>): TTokenPair` (`{ session: signFakeJwt(makeSession(overrides)), refreshToken: 'rt_test_1' }`),
    `makeHydrateInput(overrides?: Partial<TSessionPayload>)` (`{ token: signFakeJwt(makeSession(overrides)), refreshToken: 'rt_test_1' }`),
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
  it('defaults payoutIssue/stripeAccountReady/cardActionRequired for old tokens', () => {
    const s = decodeSession(signFakeJwt({ ...baseWithoutThoseKeys }))
    expect(s?.payoutIssue).toBe(false); expect(s?.stripeAccountReady).toBe(false); expect(s?.cardActionRequired).toBe(false)
  })
  it('drops legacy identity-document claims', () => {
    const s = decodeSession(signFakeJwt({ ...base, documentType: 'CPF', documentUrl: 'x', isVerified: true, tokenVersion: 0 }))
    expect(s).not.toHaveProperty('documentType'); expect(s).not.toHaveProperty('isVerified'); expect(s).not.toHaveProperty('tokenVersion')
  })
  it('returns null for garbage and for a token failing the schema', () => {
    expect(decodeSession('garbage')).toBeNull()
    expect(decodeSession(signFakeJwt({ ...base, userType: 'ADMIN' }))).toBeNull()
  })
  it('keeps a token whose exp is in the past (renewed by the 401 interceptor)', () => {
    expect(decodeSession(signFakeJwt({ ...base, exp: 1_700_000_000 }))?.sub).toBe(base.sub)
  })
  // src/store/auth-store/__tests__/auth-store.test.ts
  it('hydrate with garbage leaves everything null and clears both SecureStore keys', async () => {
    useAuthStore.getState().hydrate({ token: 'garbage', refreshToken: 'rt_1' })
    expect(useAuthStore.getState()).toMatchObject({ token: null, refreshToken: null, session: null, hydrated: true })
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('proxy.session.token')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('proxy.session.refresh')
  })
  it('hydrate without a refresh token (legacy install) signs out', () => {
    useAuthStore.getState().hydrate({ token: signFakeJwt(makeSession()), refreshToken: null })
    expect(useAuthStore.getState()).toMatchObject({ token: null, session: null, hydrated: true })
  })
  it('hydrate keeps an expired access token when a refresh token exists', () => {
    useAuthStore.getState().hydrate({ token: signFakeJwt(makeSession({ exp: Math.floor(Date.now() / 1000) - 60 })), refreshToken: 'rt_1' })
    expect(useAuthStore.getState().session?.sub).toBe('user-1'); expect(useAuthStore.getState().refreshToken).toBe('rt_1')
  })
  it('setTokens persists both tokens', async () => {
    await useAuthStore.getState().setTokens(makeTokenPair({ sub: 'u2' }))
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('proxy.session.refresh', 'rt_test_1')
    expect(useAuthStore.getState().session?.sub).toBe('u2')
  })
  it('setSession replaces only the access token', async () => {
    await useAuthStore.getState().setTokens(makeTokenPair())
    await useAuthStore.getState().setSession(signFakeJwt(makeSession({ name: 'Ana Maria' })))
    expect(useAuthStore.getState().session?.name).toBe('Ana Maria'); expect(useAuthStore.getState().refreshToken).toBe('rt_test_1')
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/apis/auth/__tests__/session-schema.test.ts`
  → `Cannot find module '../session-schema'`.
- [ ] **Step 3: Implement** `sessionPayloadSchema`, `decodeSession` in `src/apis/auth/session-schema.ts`;
  secure-store keys; rewrite the store per Produces; the two auth hooks; `isAuthenticated: !!session`
  in `useProxyAuth.ts:30`; replace the `TSessionPayload` interface in `auth-api-types.ts:12-32` with
  `export type { TSessionPayload } from './session-schema'` and add the token types. Callers of the old
  `hydrate(token)` signature (`SessionProvider.tsx:23`) pass `{ token, refreshToken: await getRefreshToken() }`
  (P3-T02 hardens that call). `ClientHome.tsx:63` (`session.rating.toFixed`) is now safe because `rating` is a number.
- [ ] **Step 4: Run it, expect pass** — both spec files green (10 tests).
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit && npx eslint . && npm test`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(auth): P3-T01 Zod session schema + refresh-token storage`

---

### Task P3-T02: Boot hygiene + 401 → single-flight refresh → retry once → sign out

**Files:**
- Create: `src/apis/auth/token-refresh.ts`, `src/test/fixtures/http.ts`
- Modify: `src/shared/providers/SessionProvider.tsx:20-34`
- Modify: `src/apis/api-client.ts:25-48` (extract `handleResponseError`), `src/store/auth-store/auth-store.ts` (`setTokens`/`setSession` clear the query cache on a user switch)
- Modify: `src/feature/auth/hooks/useProxyAuth.ts:21-24` (`signOut` revokes the refresh token)
- Test: `src/shared/providers/__tests__/SessionProvider.test.tsx`, `src/apis/__tests__/api-client.test.ts`, `src/apis/auth/__tests__/token-refresh.test.ts`

**Interfaces:**
- Consumes: `getToken/getRefreshToken/clearToken` (`@/lib/secure-store`), `queryClient` (`@/apis/query-client`), `useAuthStore` + `TTokenPair` (T01), `env.apiUrl` (`@/common/env`).
- Produces:
  - `src/apis/auth/token-refresh.ts`:
    - `export const authHttp = axios.create({ baseURL: env.apiUrl, timeout: 15000 })` — a bare
      instance with **no** interceptors, used only for `/auth/refresh` and `/auth/logout`, so a
      failing refresh can never re-enter the 401 handler.
    - `export type RefreshOutcome = { kind: 'refreshed'; session: string } | { kind: 'rejected' } | { kind: 'unavailable' }`.
    - `export function refreshTokens(): Promise<RefreshOutcome>` — **single-flight**: while one call
      is pending every caller receives the same promise (module-level `inflight`, cleared in `finally`).
      Body: `refreshToken = await getRefreshToken().catch(() => null)`; none → `rejected`;
      `const { data } = await authHttp.post<TTokenPair>('/auth/refresh', { refreshToken })` →
      `await useAuthStore.getState().setTokens(data)` → `{ kind: 'refreshed', session: data.session }`;
      an axios error **with** a 4xx response → `rejected`; network error, timeout or 5xx → `unavailable`
      (tokens kept — an offline phone must not sign the user out).
    - `export async function revokeRefreshToken(refreshToken: string | null): Promise<void>` —
      `authHttp.post('/auth/logout', { refreshToken })` when `refreshToken` is non-null; every error swallowed.
    - `export function __resetRefreshFlight(): void` (tests only).
  - `src/apis/api-client.ts`: `type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean }`;
    `export async function handleResponseError(error: unknown): Promise<AxiosResponse>`, registered as
    the response interceptor's rejected handler:
    1. not an axios error, not `401`, or the request carried no `Authorization` header
       (`error.config?.headers?.has('Authorization')` false — e.g. sign-in with a wrong password) → rethrow.
    2. `(error.config as RetriableConfig)._retried` → sign out (step 4) and rethrow (a 401 right after
       a successful refresh means the account is gone).
    3. `outcome = await refreshTokens()`: `refreshed` → `return api.request({ ...error.config, _retried: true } as RetriableConfig)`
       (the request interceptor re-reads the new access token from SecureStore); `unavailable` → rethrow, no sign-out;
       `rejected` → step 4 and rethrow.
    4. sign out = `await clearToken().catch(() => {})` then `onUnauthorized?.()`.
  - `SessionProvider`: `Promise.all([getToken(), getRefreshToken()]).catch(async () => { await clearToken().catch(() => {}); return [null, null] as const }).then(([token, refreshToken]) => { if (!cancelled) hydrate({ token, refreshToken }) })`;
    `registerUnauthorizedHandler(() => { void clearSession(); queryClient.clear() })`.
  - `useAuthStore.setTokens` / `setSession`: when the previous `session` is non-null and the decoded
    `sub` differs from `session.sub`, call `queryClient.clear()` before `set(...)`.
  - `useProxyAuth().signOut`: `const refreshToken = useAuthStore.getState().refreshToken; void revokeRefreshToken(refreshToken); await clearSession(); queryClient.clear()`
    (the token is read before the store is cleared; the revoke is fire-and-forget so sign-out works offline).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // src/test/fixtures/http.ts
  // makeAxiosError(status: number, body?: object, config?: Partial<InternalAxiosRequestConfig>): AxiosError
  //   → new AxiosError(msg, code, { headers: new AxiosHeaders(config?.headers), ...config }, undefined, { status, data: body })
  // makeNetworkError(config?): AxiosError without response
  // SessionProvider.test.tsx
  it('hydrates null when SecureStore rejects', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain'))
    render(<SessionProvider><Text>ok</Text></SessionProvider>)
    await waitFor(() => expect(useAuthStore.getState().hydrated).toBe(true))
    expect(useAuthStore.getState().session).toBeNull()
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled()
  })
  it('a rejected refresh clears the query cache', async () => {
    jest.spyOn(authHttp, 'post').mockRejectedValue(makeAxiosError(401, { errorCode: 'SESSION_REFRESH_INVALID' }))
    queryClient.setQueryData(queryKeys.card, { id: 'c1' })
    render(<SessionProvider><Text>ok</Text></SessionProvider>)
    await act(() => handleResponseError(makeAxiosError(401, {}, { headers: { Authorization: 'Bearer x' } })).catch(() => {}))
    expect(queryClient.getQueryData(queryKeys.card)).toBeUndefined()
  })
  // token-refresh.test.ts (SecureStore mock seeded with 'proxy.session.refresh' = 'rt_1'; post = jest.spyOn(authHttp, 'post'); afterEach __resetRefreshFlight())
  it('rotates the pair and stores it', async () => {
    post.mockResolvedValue({ data: makeTokenPair() })
    await expect(refreshTokens()).resolves.toMatchObject({ kind: 'refreshed' })
    expect(post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'rt_1' })
    expect(useAuthStore.getState().refreshToken).toBe('rt_test_1')
  })
  it('is single-flight', async () => {
    let resolve!: (v: unknown) => void; post.mockReturnValue(new Promise((r) => { resolve = r }))
    const a = refreshTokens(); const b = refreshTokens(); resolve({ data: makeTokenPair() })
    await Promise.all([a, b]); expect(post).toHaveBeenCalledTimes(1)
  })
  it('a 4xx from /auth/refresh is rejected', async () => { post.mockRejectedValue(makeAxiosError(401, { errorCode: 'SESSION_REFRESH_INVALID' })); await expect(refreshTokens()).resolves.toEqual({ kind: 'rejected' }) })
  it('a network error is unavailable and keeps the tokens', async () => { post.mockRejectedValue(makeNetworkError()); await expect(refreshTokens()).resolves.toEqual({ kind: 'unavailable' }); expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled() })
  it('revokeRefreshToken posts /auth/logout and swallows errors', async () => { post.mockRejectedValue(makeNetworkError()); await expect(revokeRefreshToken('rt_1')).resolves.toBeUndefined(); expect(post).toHaveBeenCalledWith('/auth/logout', { refreshToken: 'rt_1' }) })
  // api-client.test.ts (handler = jest.fn(); registerUnauthorizedHandler(handler); request = jest.spyOn(api, 'request'))
  const authed = (extra = {}) => makeAxiosError(401, {}, { url: '/auth/me', headers: { Authorization: 'Bearer old' }, ...extra })
  it('does not refresh for a 401 without Authorization (sign-in)', async () => {
    await expect(handleResponseError(makeAxiosError(401, { errorCode: 'USER_INVALID_CREDENTIALS' }))).rejects.toBeDefined()
    expect(post).not.toHaveBeenCalled(); expect(handler).not.toHaveBeenCalled()
  })
  it('refreshes once and retries the original request', async () => {
    post.mockResolvedValue({ data: makeTokenPair() }); request.mockResolvedValue({ data: 'ok' })
    await expect(handleResponseError(authed())).resolves.toEqual({ data: 'ok' })
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/auth/me', _retried: true }))
  })
  it('two concurrent 401s trigger one refresh', async () => {
    let resolve!: (v: unknown) => void; post.mockReturnValue(new Promise((r) => { resolve = r })); request.mockResolvedValue({ data: 'ok' })
    const both = Promise.all([handleResponseError(authed()), handleResponseError(authed({ url: '/tasks/active' }))])
    resolve({ data: makeTokenPair() }); await both
    expect(post).toHaveBeenCalledTimes(1); expect(request).toHaveBeenCalledTimes(2)
  })
  it('signs out when the refresh is rejected', async () => {
    post.mockRejectedValue(makeAxiosError(401, { errorCode: 'SESSION_REFRESH_INVALID' }))
    await expect(handleResponseError(authed())).rejects.toBeDefined()
    expect(handler).toHaveBeenCalledTimes(1); expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('proxy.session.refresh')
  })
  it('keeps the session when the refresh is unavailable (offline)', async () => {
    post.mockRejectedValue(makeNetworkError())
    await expect(handleResponseError(authed())).rejects.toBeDefined()
    expect(handler).not.toHaveBeenCalled(); expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })
  it('signs out on a 401 from an already-retried request', async () => {
    await expect(handleResponseError(authed({ _retried: true }))).rejects.toBeDefined()
    expect(post).not.toHaveBeenCalled(); expect(handler).toHaveBeenCalledTimes(1)
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `handleResponseError is not a function` / `Cannot find module '../token-refresh'`.
- [ ] **Step 3: Implement** the files above; delete the old inline 401 handler in `api-client.ts`.
- [ ] **Step 4: Run it, expect pass** — 13 tests green.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done in ../STATUS.md; commit** `fix(auth): P3-T02 boot hygiene + single-flight token refresh`

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

### Task P3-T04: Contract sync — types, route functions, pagination, update-profile, dead code

**Files:**
- Modify: `src/apis/tasks/tasks-api-types.ts` (whole file except `TCreateTaskPayload`, which P3-T14b changes), `src/apis/tasks/tasks-apis.ts:14-52`
- Modify: `src/apis/tasks/tasks-hooks.ts:11-12,44-55`
- Modify: `src/apis/wallet/wallet-api-types.ts:6-23`, `src/apis/wallet/wallet-apis.ts:8-23`, `src/apis/wallet/wallet-hooks.ts` (whole)
- Modify: `src/apis/cards/cards-api-types.ts:17-19`, `src/apis/cards/cards-apis.ts:4-12`
- Modify: `src/apis/auth/auth-api-types.ts` (add `TMeResponse`, `TUpdateProfilePayload`), `src/apis/auth/auth-apis.ts:11-29`
- Modify: `src/apis/query-keys.ts`
- Modify: `src/feature/tasks/components/CounterpartCard.tsx:71-75` (delete the "Verificado" `isVerified` badge, D12), `src/feature/tasks/components/ReceiptCard.tsx:90-94` (reference line, see Produces)
- Delete: `src/feature/tasks/utils/format-payment-id.ts`
- Modify: `src/feature/home/components/ProxyHome.tsx:63-72` (`data?.pages.flatMap((p) => p.items)`), `app/(app)/(tabs)/wallet.tsx:26,89-92` (use `tasksCompleted` of page 1)
- Test: `src/apis/__tests__/apis-contract.test.ts`, `src/apis/tasks/__tests__/tasks-hooks.pagination.test.ts`

**Interfaces:**
- Produces (types):
  - `TTaskStatus` unchanged. **Delete** `ACTIVE_TASK_STATUSES` (`tasks-api-types.ts:21-26`).
  - `TPaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed'` (unchanged; D3 has no hold/capture states).
  - `TPayment = { id: string; taskId: string; amount: number; status: TPaymentStatus; refundId: string | null; createdAt: string; updatedAt: string }` (no `paymentIntent`).
  - `TTaskOwner = { id: string; name: string; avatarUrl: string | null; rating: number; totalTasksCreated: number; phoneNumber?: string | null }` (no `email`, no `isVerified`).
  - `TTaskCounterpart = { id: string; name: string; avatarUrl: string | null; rating: number; totalTasksCreated: number; phoneNumber?: string | null }`.
  - `TTask` adds `city: string; state: string; stripeFee: number | null; chargedAmount: number | null; completedAt: string | null; canceledAt: string | null`; `offeredPrice: number; proxyEarnings: number | null; platformFee: number | null; locationLat: number; locationLng: number` (were strings; P2-T13 sends numbers).
  - `TTaskDetail = TTask & { payment: TPayment | null; executorId: string | null; executor: TTaskCounterpart | null }` (payment is `null` for non-owners).
  - `TPaginated<T> = { items: T[]; page: number; perPage: number; hasMore: boolean }`.
  - `TChargePreview = { offeredPrice: number; platformFee: number; stripeFee: number; chargedAmount: number; proxyEarnings: number }`.
  - `TStartTaskResult = { status: 'succeeded' }`.
  - `TTransactionHistoryTask`, `TTransactionHistoryResponse` exactly as in the contract table (`netAmount`, `city`; no `proxyEarnings`/`platformFee`); delete `TCompletedTransactionTask`; `TMerchantDashboardResponse` stays.
  - `TCreateCardPayload = { paymentMethodId: string }`; `TSetupIntentResponse = { clientSecret: string }`.
  - `TMeResponse` as in the contract table (includes `cardActionRequired`).
  - `TUpdateProfilePayload = { name?: string; phoneNumber?: string | null }`.
- Produces (route functions):
  - `tasksApis.fetchByCity({ city, page }) → Promise<TPaginated<TTask>>`; `tasksApis.pricePreview(offeredPrice: number) → Promise<TChargePreview>` (`GET /tasks/price-preview`, `params: { offeredPrice }`).
  - `walletApis.transactionHistory(page = 1) → Promise<TTransactionHistoryResponse>` (`params: { page }`); delete `useMerchantDashboardMutation` (`wallet-hooks.ts:18-20`, unused — `wallet.tsx:32` calls `walletApis.merchantDashboard` directly).
  - `cardsApis.setupIntent() → Promise<TSetupIntentResponse>` (`POST /card/setup-intent`); `cardsApis.create({ paymentMethodId })`; `cardsApis.delete(id) → Promise<void>`.
  - `authApis.session(payload) → Promise<TTokenPair>`, `authApis.create(payload) → Promise<TTokenPair>`; `authApis.refreshSession() → Promise<TAccessTokenResponse>`;
    `authApis.me() → Promise<TMeResponse>` (`GET /auth/me`); `authApis.deleteAccount() → Promise<void>` (`DELETE /auth/account`);
    `authApis.updateProfile(payload: TUpdateProfilePayload) → Promise<TAccessTokenResponse>` (`POST /auth/update-profile`).
    `/auth/refresh` and `/auth/logout` are **not** here — they live on the bare `authHttp` (P3-T02).
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
  it('pricePreview → GET /tasks/price-preview', ...)            // params: { offeredPrice: 100 }; resolves { offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 100, proxyEarnings: 80 }
  it('authApis.me → GET /auth/me', ...)
  it('authApis.deleteAccount → DELETE /auth/account', ...)
  it('authApis.updateProfile → POST /auth/update-profile with only the given keys', ...) // updateProfile({ name: 'Ana Maria' }) → postSpy('/auth/update-profile', { name: 'Ana Maria' })
  it('cardsApis.setupIntent → POST /card/setup-intent; create sends { paymentMethodId }', ...)
  it('walletApis.transactionHistory(3) → GET /auth/transaction-history { params: { page: 3 } }', ...)
  // tasks-hooks.pagination.test.ts — renderHook(() => useAvailableTasksInfiniteQuery('São Paulo'), { wrapper })
  it('requests page 2 when hasMore and stops when false', ...)  // fetchByCity mocked: page1 hasMore true → fetchNextPage → called with page 2; page2 hasMore false → hasNextPage false
  ```
- [ ] **Step 2: Run it, expect failure** — `tasksApis.pricePreview is not a function`, etc.
- [ ] **Step 3: Implement** the types and functions above; fix every compile error `tsc` reports
  (`ProxyHome.tsx:64`, `wallet.tsx:90`, `ReceiptCard.tsx:6,92`, `CounterpartCard.tsx:71-75`, `index.tsx:155-161`,
  `EarningsList.tsx` reading `netAmount`).
  Where a screen needs the new money fields it is finished in T13; here only make it compile.
- [ ] **Step 4: Run it, expect pass** — spec files green and `npx tsc --noEmit` clean.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(apis): P3-T04 contract sync (pagination, me, update-profile, price-preview, setup-intent)`

---

### Task P3-T05: Refresh infrastructure (user data; tokens are P3-T02's job)

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
  - `useAuthStore.applyMe(me: TMeResponse): void` — merges `name, avatarUrl, phoneNumber, rating, totalTasksCompleted, totalTasksCreated, walletBalance, stripeAccountId, stripeAccountReady, payoutIssue, cardActionRequired` into `session` (no-op when `session` is null).
  - `export const SESSION_REFRESH_THROTTLE_MS = 30_000`; `export async function refreshMe(opts?: { force?: boolean }): Promise<void>` — returns early when no token, or when `!force && Date.now() - lastRefreshAt < THROTTLE`; otherwise `applyMe(await authApis.me())`, swallowing errors (a 401 is handled by the P3-T02 interceptor, which also renews an expired access token for this very call); `export function __resetRefreshThrottle()` for tests.
    `refreshMe` refreshes **user data only**: no token refresh runs on foreground, and `session-refresh.ts`
    never reads or writes the refresh token (ruling in Amendments). `makeMe()` (in `src/test/fixtures/session.ts`)
    returns a full `TMeResponse` with `cardActionRequired: false`.
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
    useAuthStore.getState().hydrate(makeHydrateInput()) // { token: signFakeJwt(makeSession()), refreshToken: 'rt_test_1' }
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
- [ ] **Step 3: Implement** `reconcile.ts`, rewrite the hooks, add the three `RefreshControl`s. Add `makeTask`, `makeTaskDetail`, `makePayment` to `src/test/fixtures/tasks.ts` (defaults: `id: 'task-1'`, `status: 'available'`, `offeredPrice: 100`, `platformFee: 20`, `stripeFee: 4.38`, `chargedAmount: 100`, `proxyEarnings: 80` (D1 numbers for 100), `city: 'São Paulo'`, `state: 'SP'`, `owner: 'user-1'`, `ownerId: { id: 'user-1', name: 'Ana Cliente', avatarUrl: null, rating: 0, totalTasksCreated: 1 }`, `payment: null`, `executorId: null`, `executor: null`).
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

### Task P3-T08: Profile — account deletion and legal rows

**Files:**
- Create: `src/common/constants/legal.ts`, `src/apis/auth/auth-hooks.ts` (add `useDeleteAccountMutation`), `src/feature/profile/hooks/useDeleteAccountFlow.ts`
- Modify: `app/(app)/(tabs)/profile.tsx:81-110` (menu sections; `openEditAccount` at `:34-37` is left for P3-T08b)
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
  - Profile menu: section "Conta" keeps `Editar dados` exactly as it is (P3-T08b wires it to the edit screen, D14) and `Cartão` (CLIENT only). New section "Mais" → `MenuRow label="Termos de Uso"` → `WebBrowser.openBrowserAsync(TERMS_URL)`, `MenuRow label="Política de Privacidade"` → `PRIVACY_URL`, `MenuRow label="Ajuda e suporte"` → `SUPPORT_URL`. Below "Sair da conta": `Button variant="destructive" size="lg" fullWidth` `'Excluir conta'`.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // profile.test.tsx (useProxyAuth mocked → { session: makeSession(), signOut: jest.fn() })
  it('shows the deletion and legal entries next to "Editar dados"', () => {
    const { getByText } = renderWithQuery(<Profile />)
    getByText('Excluir conta'); getByText('Termos de Uso'); getByText('Política de Privacidade'); getByText('Ajuda e suporte')
    getByText('Editar dados')
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

### Task P3-T08b: Edit profile screen — name + phone (D14)

**Files:**
- Create: `app/(app)/edit-profile.tsx`
- Modify: `src/apis/auth/auth-hooks.ts` (add `useUpdateProfileMutation`), `app/(app)/(tabs)/profile.tsx:34-37` (`openEditAccount`)
- Test: `app/(app)/__tests__/edit-profile.test.tsx`, `app/(app)/(tabs)/__tests__/profile.test.tsx` (one case added)

**Interfaces:**
- Consumes: `authApis.updateProfile`, `TUpdateProfilePayload` (T04), `useAuthStore.getState().setSession` (T01),
  `extractErrorMessage` (T03), `maskPhone`/`unmask` (`@/common/utils/masks`), `FormInput`, `Button`,
  `ScreenHeader`, `toast`, `modal`, `useProxyAuth().session`.
- Produces:
  - `useUpdateProfileMutation()` → `useMutation({ mutationFn: async (payload: TUpdateProfilePayload) => { const { session } = await authApis.updateProfile(payload); await useAuthStore.getState().setSession(session) } })`
    (access token only; the refresh token is untouched).
  - `app/(app)/edit-profile.tsx` (`export default function EditProfile()`), pushed on top of the tabs:
    - renders `<Stack.Screen options={{ gestureEnabled: true }} />` (swipe-back over the tabs) and `<ScreenHeader title="Editar dados" />`;
    - `SafeAreaView` → `KeyboardAvoidingView style={{ flex: 1 }}` → `ScrollView` with
      `contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24 }}`; short form:
      **no** `flex: 1` spacer — the CTA sits right after the fields (`marginTop: 24`) so it does not jump when the keyboard opens;
    - `useForm<{ name: string; phoneNumber: string }>({ mode: 'all', defaultValues: { name: session.name, phoneNumber: session.phoneNumber ? maskPhone(session.phoneNumber) : '' } })` inside `FormProvider`;
    - `FormInput name="name" label="Nome" placeholder="Seu nome" autoCapitalize="words" returnKeyType="next"`
      `rules={{ required: 'Informe seu nome.', validate: (v: string) => (v.trim().length >= 2 && v.trim().length <= 80) || 'Use entre 2 e 80 caracteres.' }}`;
    - `FormInput name="phoneNumber" label="Telefone" placeholder="(11) 99999-0000" keyboardType="phone-pad" format={maskPhone}`
      `rules={{ validate: (v: string) => v === '' || unmask(v).length >= 10 || 'Telefone incompleto.' }}` (empty is allowed and clears the phone);
    - root error slot: when `formState.errors.root?.message` → `<Text style={{ color: DESTRUCTIVE }}>` above the button;
    - `Button variant="primary" size="lg" fullWidth` `'Salvar alterações'`, `disabled={!isDirty || !isValid}`, `loading={mutation.isPending}`.
  - Submit (`form.handleSubmit`): first line `if (mutation.isPending) return`; payload holds only dirty
    fields — `name: data.name.trim()` when `dirtyFields.name`, `phoneNumber: unmask(data.phoneNumber) || null`
    when `dirtyFields.phoneNumber`; success → `toast.success('Dados atualizados.')` then `router.back()`;
    `axios.isAxiosError(e) && e.response?.status === 400` → `form.setError('root', { message: extractErrorMessage(e) })`
    (VALIDATION_FAILED maps to `'Dados inválidos. Revise os campos.'`); any other error →
    `setTimeout(() => modal.error(extractErrorMessage(e)), 280)`.
  - `profile.tsx`: `openEditAccount = () => router.push('/edit-profile')` (the `modal.info('Em breve…')` call is deleted).

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // app/(app)/__tests__/edit-profile.test.tsx (useProxyAuth mocked → { session: makeSession({ name: 'Ana Cliente', phoneNumber: '11999990000' }) }; jest.spyOn(authApis, 'updateProfile'))
  it('prefills the name and the masked phone', () => {
    const { getByDisplayValue } = renderWithQuery(<EditProfile />)
    getByDisplayValue('Ana Cliente'); getByDisplayValue('(11) 99999-0000')
  })
  it('keeps "Salvar alterações" disabled until something changes', () => {
    expect(getByText('Salvar alterações').parent?.props.accessibilityState?.disabled).toBe(true)
  })
  it('sends only the changed field, stores the new token and goes back', async () => {
    updateProfile.mockResolvedValue({ session: signFakeJwt(makeSession({ name: 'Ana Maria' })) })
    fireEvent.changeText(getByDisplayValue('Ana Cliente'), 'Ana Maria '); fireEvent.press(getByText('Salvar alterações'))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ name: 'Ana Maria' }))
    expect(useAuthStore.getState().session?.name).toBe('Ana Maria')
    expect(toast.success).toHaveBeenCalledWith('Dados atualizados.'); expect(router.back).toHaveBeenCalled()
  })
  it('clearing the phone sends null', async () => {
    updateProfile.mockResolvedValue({ session: signFakeJwt(makeSession({ phoneNumber: null })) })
    fireEvent.changeText(getByDisplayValue('(11) 99999-0000'), ''); fireEvent.press(getByText('Salvar alterações'))
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ phoneNumber: null }))
  })
  it('shows a 400 inline and stays on the screen', async () => {
    updateProfile.mockRejectedValue(makeAxiosError(400, { errorCode: 'VALIDATION_FAILED', message: 'Validation failed' }))
    fireEvent.changeText(getByDisplayValue('Ana Cliente'), 'Ana Maria'); fireEvent.press(getByText('Salvar alterações'))
    await findByText('Dados inválidos. Revise os campos.'); expect(router.back).not.toHaveBeenCalled()
  })
  it('rejects an incomplete phone locally', async () => {
    fireEvent.changeText(getByDisplayValue('(11) 99999-0000'), '(11) 9999'); await findByText('Telefone incompleto.')
    expect(updateProfile).not.toHaveBeenCalled()
  })
  // app/(app)/(tabs)/__tests__/profile.test.tsx
  it('"Editar dados" opens the edit screen', () => { fireEvent.press(getByText('Editar dados')); expect(router.push).toHaveBeenCalledWith('/edit-profile') })
  ```
- [ ] **Step 2: Run it, expect failure** — `Cannot find module '../edit-profile'`; the profile row still opens the "Em breve" modal.
- [ ] **Step 3: Implement** the hook, the route and the profile handler.
- [ ] **Step 4: Run it, expect pass.** Also `grep -rn "Em breve você poderá editar" app src` → 0 hits.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(profile): P3-T08b edit profile screen (name + phone)`

---

### Task P3-T09: Sign-up cleanup, tappable Terms/Privacy, choose-profile copy

**Files:**
- Modify: `app/(auth)/sign-up.tsx:29-37,46-47,68-95,231-272,274-288,312-388`, `app/(auth)/choose-profile.tsx:71`
- Modify: `src/apis/auth/auth-api-types.ts` (`TCreateAccountPayload`: drop `documentType`, `documentUrl`, `avatarUrl`; delete `TDocumentType`, now unused — D12)
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

### Task P3-T10: Cards via SetupIntent, `urlScheme`, `/cards` role gate, card copy, `cardActionRequired` banner

**Files:**
- Modify: `src/feature/cards/components/AddCardSheet.tsx:1,37,97-116,194-204`, `src/apis/cards/cards-hooks.ts:28-36`
- Modify: `app/(app)/_layout.tsx:1-25` (`StripeProvider publishableKey={env.stripePublishableKey} urlScheme="proxyapp"`, using `src/common/env.ts` from Phase 0 — APP-15)
- Modify: `app/(app)/cards.tsx:20-42,66` (role gate + copy + banner)
- Create: `src/feature/cards/components/CardActionBanner.tsx`
- Modify: `src/feature/home/components/ClientHome.tsx` (banner at the top of the scroll content)
- Test: `src/feature/cards/components/__tests__/AddCardSheet.test.tsx`, `src/feature/cards/components/__tests__/CardActionBanner.test.tsx`, `app/(app)/__tests__/cards.test.tsx`, `src/feature/home/components/__tests__/ClientHome.banner.test.tsx`

**Interfaces:**
- Consumes: `useConfirmSetupIntent()` from `@stripe/stripe-react-native` 0.64 — `confirmSetupIntent(clientSecret: string, { paymentMethodType: 'Card' }) → Promise<{ setupIntent?: SetupIntent.Result; error?: StripeError }>`; `setupIntent.paymentMethod?.id` (the `paymentMethodId` field is deprecated); `cardsApis.setupIntent`, `cardsApis.create` (T04); `refreshMe` (T05); `session.cardActionRequired` (T01/T05).
- Produces:
  - `useCreateCardMutation()` `mutationFn: ({ paymentMethodId }) => cardsApis.create({ paymentMethodId })`; `onSuccess` keeps its invalidation and adds `void refreshMe({ force: true })` (the backend clears `cardActionRequired` on `POST /card/create`, D3).
  - `AddCardSheet.handleSave`: `const { clientSecret } = await cardsApis.setupIntent()` → `const { setupIntent, error } = await confirmSetupIntent(clientSecret, { paymentMethodType: 'Card' })` → on `error || !setupIntent?.paymentMethod?.id` set `sheetError = error?.localizedMessage ?? 'Cartão inválido. Confira os dados.'` → `await createCard.mutateAsync({ paymentMethodId: setupIntent.paymentMethod.id })` → `toast.success('Cartão adicionado!')` → `onSuccess()`.
  - Sheet copy (`:202-203`) → `'Seu cartão é cobrado quando um Proxy aceita uma tarefa sua. O valor só é repassado depois que você valida a conclusão.'` (D3: charge at accept, automatic capture).
  - `cards.tsx`: `const { session } = useProxyAuth(); if (session && session.userType !== 'CLIENT') return <Redirect href="/home" />` before any hook that fetches (hooks order: call `useProxyAuth` first, then `useCardQuery({ enabled: isClient })`). Replace modal message (`:30-31`) → `'Você vai cadastrar um novo cartão no lugar do atual.'`; remove toast copy `'Cartão removido.'` on successful delete. When `session.cardActionRequired` → `<CardActionBanner />` (no CTA) above the card.
  - `CardActionBanner({ onPress }: { onPress?: () => void })` — `DESTRUCTIVE_TINT` card: title `'Confirme seu cartão'`, helper `'Não conseguimos cobrar seu cartão na última tarefa.'`, and when `onPress` is given a `Button variant="outline"` `'Abrir Cartão'`. (D3 copy ruling: clients have no "Carteira" tab; their card lives under Perfil › Cartão.)
  - `ClientHome`: `session.cardActionRequired` → `<CardActionBanner onPress={() => router.navigate('/cards')} />` as the first item of the scroll content.

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
    expect(authApis.me).toHaveBeenCalledTimes(1) // refreshMe({ force: true }) after the save
  })
  it('shows the Stripe error and does not call /card/create', async () => { confirmSetupIntent.mockResolvedValue({ error: { localizedMessage: 'Cartão recusado' } }); …; getByText('Cartão recusado'); expect(cardsApis.create).not.toHaveBeenCalled() })
  // CardActionBanner.test.tsx
  it('renders the D3 copy and the CTA only with onPress', () => {
    const onPress = jest.fn(); const { getByText, rerender, queryByText } = render(<CardActionBanner onPress={onPress} />)
    getByText('Confirme seu cartão'); getByText('Não conseguimos cobrar seu cartão na última tarefa.')
    fireEvent.press(getByText('Abrir Cartão')); expect(onPress).toHaveBeenCalledTimes(1)
    rerender(<CardActionBanner />); expect(queryByText('Abrir Cartão')).toBeNull()
  })
  // ClientHome.banner.test.tsx (hooks mocked)
  it('shows the banner only when cardActionRequired', () => {
    const { getByText, rerender, queryByText } = renderWithQuery(<ClientHome session={makeSession({ cardActionRequired: true })} />)
    fireEvent.press(getByText('Abrir Cartão')); expect(router.navigate).toHaveBeenCalledWith('/cards')
    rerender(<ClientHome session={makeSession({ cardActionRequired: false })} />); expect(queryByText('Confirme seu cartão')).toBeNull()
  })
  // cards.test.tsx
  it('redirects a PROXY to /home', () => { mockSession(makeSession({ userType: 'PROXY' })); expect(getByTestId('redirect').props.children).toBe('/home') })
  ```
  (`jest.setup.ts`: `CardField: (props) => { lastCardFieldProps = props; return null }` with `export const cardFieldProps = () => lastCardFieldProps` from `src/test/stripe-mock.ts`.)
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** `createPaymentMethod` import and `useStripe` usage removed from `AddCardSheet`.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(cards): P3-T10 SetupIntent card save, /cards role gate, card-charge banner`

---

### Task P3-T11: Task detail split + `PaymentStatusBanner` (five payment states) + `requires_action` removal

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
  - `PaymentStatusBanner({ status }: { status: TPaymentStatus })` — `TPaymentStatus` is exactly `'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed'` (D3: the charge is captured automatically at start; there is no hold, `requires_capture` or `requires_action` state). Renders nothing for `succeeded`; otherwise a card (`INFO_TINT` for `pending` and `refunded`, `DESTRUCTIVE_TINT` for `failed` and `disputed`) with title / body: `pending` → `'Pagamento pendente'` / `'Ainda estamos confirmando o pagamento. As ações ficam disponíveis assim que for aprovado.'`; `failed` → `'Pagamento não aprovado'` / `'O pagamento não foi aprovado. Fale com o suporte para seguir.'`; `disputed` → `'Pagamento em disputa'` / `'O pagamento está em disputa. Nossa equipe vai analisar e entrar em contato.'`; `refunded` → `'Pagamento estornado'` / `'O valor foi estornado no seu cartão.'`
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
  // PaymentStatusBanner, one title per state
  it.each([['pending', 'Pagamento pendente'], ['failed', 'Pagamento não aprovado'], ['disputed', 'Pagamento em disputa'], ['refunded', 'Pagamento estornado']])('%s → %s', (status, title) => { const { getByText } = render(<PaymentStatusBanner status={status as TPaymentStatus} />); getByText(title) })
  it('succeeded renders nothing', () => expect(render(<PaymentStatusBanner status="succeeded" />).toJSON()).toBeNull())
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
  - `askStart` error mapping by `errorCodeOf(e)` (the HTTP status is ignored): `PAYMENT_FAILED` (D3: the client's card could not be charged at start; the task stays available and the client sees the `cardActionRequired` banner from P3-T10) → `'Não foi possível cobrar o cliente. Tente outra tarefa.'`; `TASK_NOT_AVAILABLE` → `'Essa tarefa já foi aceita por outro Proxy.'`; `PROXY_ACCOUNT_NOT_READY` → `'Conclua seu cadastro de recebimento na Carteira para aceitar tarefas.'`; otherwise `extractErrorMessage(e)`. Shown with the existing 280 ms deferred `modal.error`.
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
    startMutate.mockRejectedValue(makeAxiosError(409, { errorCode: 'PAYMENT_FAILED', message: 'Não foi possível cobrar o cliente.' }))
    fireEvent.press(getByText('Aceitar e iniciar tarefa')); await act(() => useModalStore.getState().onOk!()); jest.advanceTimersByTime(280)
    expect(useModalStore.getState().message).toBe('Não foi possível cobrar o cliente. Tente outra tarefa.')
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

### Task P3-T13: Money from backend numbers — client pays one total, proxy receives 80 %

**Files:**
- Create: `src/common/constants/pricing.ts`
- Modify: `src/apis/tasks/tasks-hooks.ts` (add `useChargePreviewQuery`)
- Modify: `src/feature/tasks/components/PriceBreakdown.tsx` (whole), `src/feature/tasks/components/CreateTaskStep2.tsx:37,85-87,157-173`, `src/feature/tasks/components/ReceiptCard.tsx` (whole), `src/feature/tasks/components/task-detail/SummaryCard.tsx` (from T11), `src/feature/tasks/components/TaskCard.tsx:16-23,118-126` (`role` prop), `src/feature/tasks/utils/status-display.ts:22-23`, `src/feature/tasks/components/TaskTimeline.tsx:27,73,88-90,174-202`, `app/(app)/tasks/[id]/index.tsx` (receipt condition), `src/feature/wallet/components/BalanceCard.tsx:30`, `src/feature/wallet/components/EarningsList.tsx:11-16,116,127`, `src/feature/home/components/ProxyHome.tsx:277` (and `role="proxy"` on its `TaskCard`s), `src/feature/home/components/ClientHome.tsx` (`role="client"` on its `TaskCard`s)
- Test: `src/feature/tasks/components/__tests__/PriceBreakdown.test.tsx`, `src/feature/tasks/components/__tests__/ReceiptCard.test.tsx`, `src/feature/tasks/components/__tests__/TaskTimeline.test.tsx`, `src/feature/tasks/components/__tests__/TaskCard.test.tsx`

**Interfaces:**
- Consumes: `tasksApis.pricePreview`, `TChargePreview`, `TTask`/`TTaskDetail` money numbers (T04), `formatBRL`.
- Produces:
  - `src/common/constants/pricing.ts`: `export const MIN_OFFERED_PRICE = 20`, `export const MAX_OFFERED_PRICE = 10_000`
    (D1 bounds, mirrored for form validation and query gating only — never for fee math).
  - `useChargePreviewQuery(offeredPrice: number)` → `useQuery({ queryKey: queryKeys.pricePreview(offeredPrice), queryFn: () => tasksApis.pricePreview(offeredPrice), enabled: offeredPrice >= MIN_OFFERED_PRICE && offeredPrice <= MAX_OFFERED_PRICE, staleTime: Infinity, placeholderData: keepPreviousData })`.
  - `PriceBreakdown({ preview, loading, error, onRetry }: { preview: TChargePreview | undefined; loading: boolean; error?: unknown; onRetry?: () => void })` —
    client-only and presentational, **no arithmetic**: one row `'Você paga'` = `formatBRL(preview.chargedAmount)`
    and the caption `'Taxas incluídas.'` under it. No platform-fee or processing-fee row (D1: the client sees
    one number). `loading` → the amount renders `'—'`; `error` → `QueryErrorCard` (`message` via
    `extractErrorMessage`, resolved by the caller). Constants `PLATFORM_FEE_RATE`, `STRIPE_FEE_RATE`, `STRIPE_FEE_FIXED` deleted.
  - `CreateTaskStep2`: `const preview = useChargePreviewQuery(offeredPrice)`; `canPublish = !!card && !!preview.data && !createTask.isPending`; subtitle → `'Confirme os detalhes e publique. Nada é cobrado agora: o cartão é cobrado quando um Proxy aceitar.'`
  - `SummaryCard({ task, role })`: CLIENT → label `'Você paga'` + `formatBRL(task.chargedAmount ?? task.offeredPrice)`
    (the `??` covers rows created before Phase 1; it is a fallback, not a computation) + caption `'Taxas incluídas.'`;
    PROXY → label `'Você recebe'` + `formatBRL(task.proxyEarnings)` + caption `'80% do valor da tarefa'`.
  - `TaskCard` gains `role: 'client' | 'proxy'`: proxy → amount `formatBRL(task.proxyEarnings)` with the small label `'Você recebe'`; client → `formatBRL(task.offeredPrice)` (no label change).
  - `ReceiptCard({ task, role })` from stored numbers only, no fee lines for either role:
    client headline `'Valor pago'` = `formatBRL(task.chargedAmount ?? task.offeredPrice)`, caption `'Taxas incluídas.'`,
    lines `'Cobrado em'` `formatDateTime(task.startedAt)` (D3: charged at accept), `'Concluída em'`
    `formatDateTime(task.completedAt)` when present; proxy headline `'Você recebeu'` = `formatBRL(task.proxyEarnings)`,
    caption `'80% do valor da tarefa'`, lines `'Valor da tarefa'` `formatBRL(task.offeredPrice)`, `'Concluída em'`;
    both `'Referência'` `#<id8>`. Rendered for `status ∈ {completed, payout_failed}` (no `task.payment` requirement — proxies have none).
  - `statusLabel('payout_failed')` → `'Falha no repasse'`; `TaskTimeline`: `payout_failed` renders `<PayoutFailedBadge />` (red like `CanceledBadge`): title `'Falha no repasse'`, body `'Não conseguimos repassar o pagamento. Verifique sua conta Stripe na Carteira.'`; `CanceledBadge` body → `'Se já havia cobrança, o estorno foi solicitado ao cartão.'`
  - `BalanceCard` label `'Total recebido'` (D8); `ProxyHome.tsx:277` `'Total recebido'`; `EarningsList` props `earnings: TTransactionHistoryTask[]`, amount `+formatBRL(task.netAmount)` (stored `proxyEarnings`, P2-T15), date label from `completedAt`, header `'Repasses recentes'`.

- [ ] **Step 1: Write the failing tests**
  ```tsx
  // PriceBreakdown.test.tsx
  it('client sees one total with fees included', () => {
    const { getByText, queryByText } = render(<PriceBreakdown preview={{ offeredPrice: 123.45, platformFee: 24.69, stripeFee: 5.32, chargedAmount: 123.45, proxyEarnings: 98.76 }} loading={false} />)
    getByText('Você paga'); getByText('R$ 123,45'); getByText('Taxas incluídas.')
    expect(queryByText(/Taxa da plataforma|Taxa de processamento|Taxa Stripe/)).toBeNull()
    expect(queryByText('R$ 24,69')).toBeNull(); expect(queryByText('R$ 5,32')).toBeNull(); expect(queryByText('R$ 98,76')).toBeNull()
  })
  it('renders chargedAmount from the backend, not the typed price', () => {
    render(<PriceBreakdown preview={{ offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 101, proxyEarnings: 80 }} loading={false} />)
    getByText('R$ 101,00'); expect(queryByText('R$ 100,00')).toBeNull()
  })
  it('loading shows placeholders and no amount', () => { render(<PriceBreakdown preview={undefined} loading />); expect(queryByText(/R\$/)).toBeNull() })
  // ReceiptCard.test.tsx — task = makeTaskDetail({ id: 'task-1', status: 'completed', offeredPrice: 100, platformFee: 20, stripeFee: 4.38, chargedAmount: 100, proxyEarnings: 80, startedAt: '2026-11-20T13:00:00.000Z', completedAt: '2026-11-20T15:00:00.000Z' })
  it('client receipt shows the amount paid and no fee lines', () => {
    render(<ReceiptCard task={task} role="client" />)
    getByText('Valor pago'); getByText('R$ 100,00'); getByText('Taxas incluídas.'); getByText('Cobrado em'); getByText('#TASK-1')
    expect(queryByText('R$ 4,38')).toBeNull(); expect(queryByText('R$ 20,00')).toBeNull(); expect(queryByText(/Taxa/)).toBeNull()
  })
  it('proxy receipt shows proxyEarnings with the 80% caption', () => {
    render(<ReceiptCard task={task} role="proxy" />)
    getByText('Você recebeu'); getByText('R$ 80,00'); getByText('80% do valor da tarefa'); getByText('Valor da tarefa'); getByText('R$ 100,00')
    expect(queryByText(/Taxa/)).toBeNull()
  })
  // TaskCard.test.tsx
  it('proxy card shows what the proxy receives', () => {
    render(<TaskCard task={makeTask({ offeredPrice: 123.45, proxyEarnings: 98.76 })} role="proxy" onPress={jest.fn()} />)
    getByText('Você recebe'); getByText('R$ 98,76'); expect(queryByText('R$ 123,45')).toBeNull()
  })
  it('client card shows the offered price', () => { render(<TaskCard task={makeTask({ offeredPrice: 123.45, proxyEarnings: 98.76 })} role="client" onPress={jest.fn()} />); getByText('R$ 123,45'); expect(queryByText('Você recebe')).toBeNull() })
  // TaskTimeline.test.tsx
  it('payout_failed renders the red badge', () => { render(<TaskTimeline status="payout_failed" />); getByText('Falha no repasse'); expect(queryByText('Pagamento liberado.')).toBeNull() })
  ```
  (`makeTaskDetail({ id: 'task-1' })` → reference `#TASK-1`.)
- [ ] **Step 2: Run it, expect failure.**
- [ ] **Step 3: Implement.** `grep -rn "0.0399\|0\.2\b\|0.39\|Taxa Stripe\|Taxa Proxy\|Taxa da plataforma\|Taxa de processamento" src app` must return nothing after this task.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(money): P3-T13 client pays one total, proxy sees 80%`

---

### Task P3-T14: Google Places (New) client, served-city mirror, `EXPO_PUBLIC_GOOGLE_PLACES_KEY`

**Owner input (D16, precondition for any device build after this commit):** a Google Cloud project
with billing, **Places API (New)** enabled, and an API key restricted to the Places API and to the iOS
bundle id in `app.json` (`ios.bundleIdentifier`, today `com.anonymous.proxyapp`; re-restricted in
Phase 5 with D23). The owner writes it to `proxy-app/.env` as `EXPO_PUBLIC_GOOGLE_PLACES_KEY=…`
(never in chat or git). Jest does not need it (`jest.setup.ts` sets a fake). From this commit on, a
Metro bundle without the key crashes at import by design — if `.env` lacks it when a device step
is due, stop and ask the owner.

**Files:**
- Modify: `src/common/read-env.ts` (whole: third key), `src/common/read-env.test.ts`, `src/common/env.ts`, `jest.setup.ts` (`process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY = 'AIzaJestKey'`), `.env.example`, `CLAUDE.md` ("Environment variables" section)
- Create: `src/common/constants/cities.ts`
- Create: `src/lib/google-places/places-types.ts`, `src/lib/google-places/places-client.ts`, `src/lib/google-places/place-address.ts`
- Install: `npx expo install expo-crypto` (session tokens); add its mock to `jest.setup.ts` (`randomUUID: jest.fn(() => 'uuid-1')`)
- Test: `src/common/read-env.test.ts`, `src/common/constants/__tests__/cities.test.ts`, `src/lib/google-places/__tests__/places-client.test.ts`, `src/lib/google-places/__tests__/place-address.test.ts`

**Interfaces:**
- `read-env.ts`: `AppEnv = { apiUrl: string; stripePublishableKey: string; googlePlacesKey: string }`;
  `RawEnv` gains `EXPO_PUBLIC_GOOGLE_PLACES_KEY?: string`;
  `export const GOOGLE_PLACES_KEY_PLACEHOLDER = 'your-google-places-key'`;
  `readGooglePlacesKey(value)`: missing → reason `'missing'`; equal to the placeholder → `'placeholder value'`;
  not `startsWith('AIza')` → `'not a Google API key'`; failures join the other two in the same
  `EnvError` message (`EXPO_PUBLIC_GOOGLE_PLACES_KEY (<reason>)`), same fail-fast style as the Stripe key.
- `env.ts`: `EXPO_PUBLIC_GOOGLE_PLACES_KEY: process.env.EXPO_PUBLIC_GOOGLE_PLACES_KEY` (static member access for Expo inlining).
- `.env.example` gains
  `# Google Places API (New) key, restricted to the iOS bundle id; the app refuses to boot with the placeholder below`
  and `EXPO_PUBLIC_GOOGLE_PLACES_KEY=your-google-places-key`.
- `CLAUDE.md` "Environment variables": bullet `EXPO_PUBLIC_GOOGLE_PLACES_KEY` — Google Places API (New)
  key (app-restricted); the placeholder `your-google-places-key` is rejected; access line becomes
  `env.apiUrl` / `env.stripePublishableKey` / `env.googlePlacesKey`; "The app crashes at import time when any value is invalid."
- `src/common/constants/cities.ts` (mirror of proxy-api `src/common/served-cities.ts`, P2-T11 — same entries, same rule):
  ```ts
  export const SERVED_CITIES = [
    { city: 'São Paulo', state: 'SP', stateName: 'São Paulo' },
    { city: 'Rio de Janeiro', state: 'RJ', stateName: 'Rio de Janeiro' },
    { city: 'Belo Horizonte', state: 'MG', stateName: 'Minas Gerais' },
  ] as const
  export type ServedCityEntry = (typeof SERVED_CITIES)[number]
  export type ServedCity = ServedCityEntry['city']
  export function foldPlaceName(s: string): string   // NFD, strip ̀-ͯ, trim, collapse spaces, lower-case
  export function matchServedCity(city: string | null | undefined, state?: string | null): ServedCityEntry | null
  export const UNSERVED_CITY_MESSAGE = (city: string) =>
    `Ainda não atendemos em ${city}. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.`
  ```
  `matchServedCity`: folded city equal; when `state` is given it must fold-equal the UF or the `stateName`; empty/null → `null`.
- `src/lib/google-places/places-types.ts`:
  `PlaceSuggestion = { placeId: string; mainText: string; secondaryText: string }`;
  `PlaceAddressComponent = { longText: string; shortText: string; types: string[] }`;
  `PlaceDetails = { formattedAddress: string; lat: number; lng: number; addressComponents: PlaceAddressComponent[] }`.
  (Not backend entities, so no `T` prefix.)
- `src/lib/google-places/places-client.ts` (ruling: small typed REST client instead of `react-native-google-places-autocomplete`):
  - `export const placesHttp = axios.create({ baseURL: 'https://places.googleapis.com/v1', timeout: 10_000 })`
    with a request interceptor that sets `X-Goog-Api-Key: env.googlePlacesKey` and, when
    `Platform.OS === 'ios'`, `X-Ios-Bundle-Identifier: Constants.expoConfig?.ios?.bundleIdentifier ?? ''`
    (required by an iOS-restricted key on REST calls; Android restriction headers are Phase 5).
  - `export function newPlacesSessionToken(): string` → `Crypto.randomUUID()` (`expo-crypto`).
  - `export async function autocompletePlaces(input: string, sessionToken: string): Promise<PlaceSuggestion[]>` →
    `placesHttp.post('/places:autocomplete', { input, sessionToken, includedRegionCodes: ['br'], languageCode: 'pt-BR' }, { headers: { 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat' } })`;
    maps every `suggestions[i].placePrediction` (entries without one — query predictions — are skipped) to
    `{ placeId, mainText: structuredFormat.mainText.text, secondaryText: structuredFormat.secondaryText?.text ?? '' }`;
    a response without `suggestions` → `[]`.
  - `export async function fetchPlaceDetails(placeId: string, sessionToken: string): Promise<PlaceDetails>` →
    `placesHttp.get(\`/places/${encodeURIComponent(placeId)}\`, { params: { sessionToken, languageCode: 'pt-BR' }, headers: { 'X-Goog-FieldMask': 'location,formattedAddress,addressComponents' } })`
    → `{ formattedAddress, lat: location.latitude, lng: location.longitude, addressComponents }`.
  - Header comment: one session token per search (every autocomplete keystroke + the single details
    call), a new token after the details call or when the field is cleared; the field mask keeps
    details on the Essentials fields.
- `src/lib/google-places/place-address.ts`:
  `export function cityStateFromComponents(components: PlaceAddressComponent[]): { city: string | null; state: string | null }`
  — `city` = `longText` of the first component typed `administrative_area_level_2`, else of `locality`;
  `state` = `shortText` of `administrative_area_level_1` (the UF).

- [ ] **Step 1: Write the failing tests**
  ```ts
  // read-env.test.ts — `valid` gains EXPO_PUBLIC_GOOGLE_PLACES_KEY: 'AIzaSyTest123'; the first case's toEqual gains googlePlacesKey: 'AIzaSyTest123'
  it('throws for a missing Places key', () => expect(() => readEnv({ ...valid, EXPO_PUBLIC_GOOGLE_PLACES_KEY: undefined })).toThrow(/EXPO_PUBLIC_GOOGLE_PLACES_KEY \(missing\)/))
  it('throws for the committed Places placeholder', () => expect(() => readEnv({ ...valid, EXPO_PUBLIC_GOOGLE_PLACES_KEY: 'your-google-places-key' })).toThrow(/EXPO_PUBLIC_GOOGLE_PLACES_KEY \(placeholder value\)/))
  it('throws for a key that is not a Google API key', () => expect(() => readEnv({ ...valid, EXPO_PUBLIC_GOOGLE_PLACES_KEY: 'pk_test_1' })).toThrow(/not a Google API key/))
  // cities.test.ts
  it.each([
    ['São Paulo', 'SP', 'São Paulo'], ['sao paulo', 'sp', 'São Paulo'], ['  SÃO   PAULO ', undefined, 'São Paulo'],
    ['Rio de Janeiro', 'Rio de Janeiro', 'Rio de Janeiro'], ['Belo Horizonte', 'minas gerais', 'Belo Horizonte'],
    ['São Paulo', 'RJ', null], ['Niterói', 'RJ', null], ['', undefined, null], [null, undefined, null],
  ])('matchServedCity(%p, %p) → %p', (city, state, expected) => expect(matchServedCity(city, state)?.city ?? null).toBe(expected))
  it('unserved message', () => expect(UNSERVED_CITY_MESSAGE('Niterói')).toBe('Ainda não atendemos em Niterói. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.'))
  // place-address.test.ts — paulista = [
  //   { longText: '1578', shortText: '1578', types: ['street_number'] }, { longText: 'Avenida Paulista', shortText: 'Av. Paulista', types: ['route'] },
  //   { longText: 'Bela Vista', shortText: 'Bela Vista', types: ['sublocality_level_1', 'sublocality', 'political'] },
  //   { longText: 'São Paulo', shortText: 'São Paulo', types: ['administrative_area_level_2', 'political'] },
  //   { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1', 'political'] },
  //   { longText: 'Brasil', shortText: 'BR', types: ['country', 'political'] }, { longText: '01310-200', shortText: '01310-200', types: ['postal_code'] } ]
  it('reads the city from administrative_area_level_2 and the UF from level_1', () => expect(cityStateFromComponents(paulista)).toEqual({ city: 'São Paulo', state: 'SP' }))
  it('falls back to locality', () => expect(cityStateFromComponents([{ longText: 'Belo Horizonte', shortText: 'Belo Horizonte', types: ['locality', 'political'] }, { longText: 'Minas Gerais', shortText: 'MG', types: ['administrative_area_level_1', 'political'] }])).toEqual({ city: 'Belo Horizonte', state: 'MG' }))
  it('returns nulls without components', () => expect(cityStateFromComponents([])).toEqual({ city: null, state: null }))
  // places-client.test.ts (post = jest.spyOn(placesHttp, 'post'), get = jest.spyOn(placesHttp, 'get'))
  it('autocomplete restricts to Brazil, sends the session token and skips query predictions', async () => {
    post.mockResolvedValue({ data: { suggestions: [
      { placePrediction: { placeId: 'ChIJ1', structuredFormat: { mainText: { text: 'Av. Paulista, 1578' }, secondaryText: { text: 'Bela Vista, São Paulo - SP, Brasil' } } } },
      { queryPrediction: { text: { text: 'paulista' } } },
    ] } })
    await expect(autocompletePlaces('av paulista 1578', 'tok-1')).resolves.toEqual([{ placeId: 'ChIJ1', mainText: 'Av. Paulista, 1578', secondaryText: 'Bela Vista, São Paulo - SP, Brasil' }])
    expect(post).toHaveBeenCalledWith('/places:autocomplete', { input: 'av paulista 1578', sessionToken: 'tok-1', includedRegionCodes: ['br'], languageCode: 'pt-BR' }, expect.objectContaining({ headers: expect.objectContaining({ 'X-Goog-FieldMask': expect.stringContaining('placePrediction') }) }))
  })
  it('autocomplete returns [] when Google sends no suggestions', async () => { post.mockResolvedValue({ data: {} }); await expect(autocompletePlaces('zzzz', 'tok-1')).resolves.toEqual([]) })
  it('details asks only for location, formattedAddress and addressComponents', async () => {
    get.mockResolvedValue({ data: { formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil', location: { latitude: -23.5614, longitude: -46.6559 }, addressComponents: paulista } })
    await expect(fetchPlaceDetails('ChIJ1', 'tok-1')).resolves.toMatchObject({ lat: -23.5614, lng: -46.6559, formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil' })
    expect(get).toHaveBeenCalledWith('/places/ChIJ1', { params: { sessionToken: 'tok-1', languageCode: 'pt-BR' }, headers: { 'X-Goog-FieldMask': 'location,formattedAddress,addressComponents' } })
  })
  it('the request interceptor sends the API key', async () => {
    const handler = (placesHttp.interceptors.request as unknown as { handlers: { fulfilled: (c: InternalAxiosRequestConfig) => InternalAxiosRequestConfig }[] }).handlers[0]
    const cfg = await handler.fulfilled({ headers: new AxiosHeaders() } as InternalAxiosRequestConfig)
    expect(cfg.headers.get('X-Goog-Api-Key')).toBe('AIzaJestKey')
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `googlePlacesKey` undefined; `Cannot find module '@/common/constants/cities'` / `'../places-client'`.
- [ ] **Step 3: Implement** the env key, the constant, the three `lib/google-places` files; `npx expo install expo-crypto`.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(tasks): P3-T14 Google Places client, served-city mirror, Places env key`

---

### Task P3-T14b: Create Task step 1 — Places address search, served-city gate, Places-shaped payload

**Files:**
- Create: `src/feature/tasks/utils/selected-address.ts`, `src/feature/tasks/hooks/usePlacesAutocomplete.ts`, `src/feature/tasks/components/AddressSearchField.tsx`
- Modify: `src/feature/tasks/components/CreateTaskStep1.tsx` (types `:29-49`, props, address block — the street/city/state/CEP inputs and the "Usar minha localização" button with `handleUseLocation` are removed —, `submit`)
- Modify: `app/(app)/tasks/create.tsx:18,28,54-65` (drop `initialCoords`, pass `defaultAddress`)
- Modify: `src/feature/tasks/components/CreateTaskStep2.tsx:44-53,140-146` (payload + address summary)
- Modify: `src/apis/tasks/tasks-api-types.ts:118-128` (`TCreateTaskPayload.address`)
- Modify: `src/feature/home/components/ProxyHome.tsx:45,349` (city pills from `SERVED_CITIES`)
- Test: `src/feature/tasks/hooks/__tests__/usePlacesAutocomplete.test.ts`, `src/feature/tasks/components/__tests__/CreateTaskStep1.test.tsx`, `src/feature/tasks/components/__tests__/CreateTaskStep2.payload.test.tsx`

**Interfaces:**
- Consumes: `autocompletePlaces`, `fetchPlaceDetails`, `newPlacesSessionToken`, `cityStateFromComponents`, `PlaceSuggestion`, `PlaceDetails` (T14); `matchServedCity`, `UNSERVED_CITY_MESSAGE`, `SERVED_CITIES`, `ServedCity` (T14).
- Produces:
  - `src/feature/tasks/utils/selected-address.ts`:
    ```ts
    export type SelectedAddress = { formattedAddress: string; city: ServedCity; state: string; lat: number; lng: number; source: 'places' | 'device' }
    export function resolveSelectedAddress(
      input: { formattedAddress: string; lat: number; lng: number; city: string | null; state: string | null },
      source: SelectedAddress['source'],
    ): { ok: true; address: SelectedAddress } | { ok: false; message: string }
    ```
    `served = matchServedCity(input.city, input.state)`; `null` → `{ ok: false, message: UNSERVED_CITY_MESSAGE(input.city || 'sua cidade') }`;
    else `{ ok: true, address: { formattedAddress, city: served.city, state: served.state, lat, lng, source } }` (canonical names). Shared with P3-T15.
  - `usePlacesAutocomplete(): { query: string; setQuery: (q: string) => void; suggestions: PlaceSuggestion[]; loading: boolean; error: string | null; select: (placeId: string) => Promise<PlaceDetails | null>; reset: () => void }`:
    debounce 300 ms; `query.trim().length < 3` → no request and `suggestions = []`; one session token
    (`newPlacesSessionToken()`) created on the first request and reused for every request until `select`
    resolves or `reset()` runs, then a new one is created lazily; responses for an older query are dropped
    (request counter); a failed request → `error = 'Não foi possível buscar endereços agora. Tente de novo.'`
    and `suggestions = []`; `select` failure → same `error`, returns `null`.
  - `AddressSearchField({ value, onChange }: { value: SelectedAddress | null; onChange: (a: SelectedAddress | null) => void })`:
    - `value === null`: `TextInput` with label `'Endereço'`, placeholder `'Busque rua e número'`,
      `accessibilityLabel="Buscar endereço"`; under it the suggestions as plain `Pressable` rows in a `View`
      (no nested `FlatList` inside the step's `ScrollView`), `mainText` in `GRAPHITE` 600 and `secondaryText` in `MUTED`;
      `loading` → small `ActivityIndicator`; `error` → muted text; ≥ 3 characters with no results and not loading →
      `'Nenhum endereço encontrado.'`; caption `'Atendemos São Paulo, Rio de Janeiro e Belo Horizonte.'`.
    - on a row press: `details = await select(placeId)`; `{ city, state } = cityStateFromComponents(details.addressComponents)`;
      `r = resolveSelectedAddress({ formattedAddress: details.formattedAddress, lat: details.lat, lng: details.lng, city, state }, 'places')`;
      `!r.ok` → inline error `r.message` in `DESTRUCTIVE` under the field (the typed text stays so the user can search again);
      `r.ok` → `onChange(r.address)`.
    - `value !== null`: a summary card with `value.formattedAddress` and a `'Trocar'` link → `reset()` + `onChange(null)`.
  - `CreateTaskStep1`:
    - `Step1FormData = { title: string; description: string; complement: string; offeredPrice: string }` (street/city/state/zipCode removed);
      `Step1Submit = Step1FormData & { address: SelectedAddress }`.
    - Props `{ defaultValues?: Partial<Step1FormData>; defaultAddress?: SelectedAddress | null; onSubmit: (data: Step1Submit) => void }` (`initialCoords` removed).
    - `const [address, setAddress] = useState<SelectedAddress | null>(defaultAddress ?? null)`; renders
      `<AddressSearchField value={address} onChange={setAddress} />` then
      `FormInput name="complement" label="Complemento (opcional)" placeholder="Ex: apto 42, bloco B" maxLength={120}`.
    - "Continuar" `disabled={!isValid || !address}`; `submit` → `onSubmit({ title, description, complement: data.complement.trim(), offeredPrice, address })`
      — no geocoding at submit (coordinates come from Places, or from the device in P3-T15).
    - The old "Usar minha localização" button and `handleUseLocation` are deleted here; P3-T15 adds
      "Usar minha localização atual" inside `AddressSearchField`.
  - `create.tsx`: `<CreateTaskStep1 defaultValues={draft ?? undefined} defaultAddress={draft?.address ?? null} onSubmit={handleStep1Submit} />`.
  - `TCreateTaskPayload.address = { formattedAddress: string; complement?: string; city: string; state: string; locationLat: number; locationLng: number }`
    (`street`/`zipCode` removed from the app type; the backend still tolerates them until Phase 5).
  - `CreateTaskStep2` payload: `address: { formattedAddress: draft.address.formattedAddress, ...(draft.complement ? { complement: draft.complement } : {}), city: draft.address.city, state: draft.address.state, locationLat: draft.address.lat, locationLng: draft.address.lng }`;
    the address summary shows `draft.address.formattedAddress` and, when present, `draft.complement` on a second line.
    A `CITY_NOT_SERVED` 400 from the backend goes through the existing deferred `modal.error(extractErrorMessage(e))` (backend pt-BR copy).
  - `ProxyHome`: the local `CITIES` constant is replaced by `SERVED_CITIES.map((c) => c.city)`; default city `'São Paulo'` unchanged.

- [ ] **Step 1: Write the failing tests**
  ```ts
  // usePlacesAutocomplete.test.ts (jest.useFakeTimers; '@/lib/google-places/places-client' mocked; newPlacesSessionToken → 'uuid-1', then 'uuid-2')
  it('waits for 3 characters and 300 ms before calling Google', async () => {
    const { result } = renderHook(() => usePlacesAutocomplete())
    act(() => result.current.setQuery('av')); act(() => jest.advanceTimersByTime(400)); expect(autocompletePlaces).not.toHaveBeenCalled()
    act(() => result.current.setQuery('av p')); act(() => jest.advanceTimersByTime(299)); expect(autocompletePlaces).not.toHaveBeenCalled()
    await act(async () => { jest.advanceTimersByTime(1) }); expect(autocompletePlaces).toHaveBeenCalledWith('av p', 'uuid-1')
  })
  it('reuses one session token until a place is selected, then starts a new one', async () => {
    // type 'av pa' then 'av paulista' → both calls with 'uuid-1'; await select('ChIJ1') → fetchPlaceDetails('ChIJ1', 'uuid-1'); type 'rua x' → 'uuid-2'
  })
  it('drops a stale response', async () => { /* first call resolves after the second → suggestions are the second call's */ })
  it('maps a request error to the PT copy', async () => { autocompletePlaces.mockRejectedValue(new Error('403')); …; expect(result.current.error).toBe('Não foi possível buscar endereços agora. Tente de novo.') })
  // CreateTaskStep1.test.tsx (places client mocked; paulista components from P3-T14's fixture)
  it('selecting a served address enables Continuar and submits it', async () => {
    autocompletePlaces.mockResolvedValue([{ placeId: 'ChIJ1', mainText: 'Av. Paulista, 1578', secondaryText: 'Bela Vista, São Paulo - SP, Brasil' }])
    fetchPlaceDetails.mockResolvedValue({ formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil', lat: -23.5614, lng: -46.6559, addressComponents: paulista })
    // fill title, description, price 'R$ 100,00'; changeText(getByLabelText('Buscar endereço'), 'av paulista 1578'); advance 300 ms; press 'Av. Paulista, 1578'; await findByText('Trocar'); press 'Continuar'
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ complement: '', address: { formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil', city: 'São Paulo', state: 'SP', lat: -23.5614, lng: -46.6559, source: 'places' } }))
  })
  it('an unserved city shows the inline error and keeps Continuar disabled', async () => {
    fetchPlaceDetails.mockResolvedValue({ formattedAddress: 'R. da Conceição, 100 - Centro, Niterói - RJ, 24020-085, Brasil', lat: -22.8947, lng: -43.1236, addressComponents: [
      { longText: 'Niterói', shortText: 'Niterói', types: ['administrative_area_level_2', 'political'] }, { longText: 'Rio de Janeiro', shortText: 'RJ', types: ['administrative_area_level_1', 'political'] } ] })
    // … select it
    await findByText('Ainda não atendemos em Niterói. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.')
    expect(getByText('Continuar').parent?.props.accessibilityState?.disabled).toBe(true)
  })
  it('has no street/state/CEP inputs and never geocodes', () => {
    expect(queryByPlaceholderText('SP')).toBeNull(); expect(queryByPlaceholderText('00000-000')).toBeNull(); expect(queryByPlaceholderText('Ex: São Paulo')).toBeNull()
    expect(Location.geocodeAsync).not.toHaveBeenCalled()
  })
  // CreateTaskStep2.payload.test.tsx (useCardQuery → a card, useChargePreviewQuery → { data: 100-fixture }, useCreateTaskMutation → { mutateAsync })
  it('sends the Places address shape', async () => {
    render(<CreateTaskStep2 draft={{ title: 'Trocar lâmpada da sala', description: 'Lâmpada queimada na sala.', complement: 'apto 42', offeredPrice: 'R$ 100,00', address: { formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil', city: 'São Paulo', state: 'SP', lat: -23.5614, lng: -46.6559, source: 'places' } }} />)
    fireEvent.press(getByText('Publicar tarefa'))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ address: { formattedAddress: 'Av. Paulista, 1578 - Bela Vista, São Paulo - SP, 01310-200, Brasil', complement: 'apto 42', city: 'São Paulo', state: 'SP', locationLat: -23.5614, locationLng: -46.6559 } })))
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `Cannot find module '../usePlacesAutocomplete'`; Step 1 still renders the street/city/state/CEP inputs.
- [ ] **Step 3: Implement** the helper, hook, field, Step 1/Step 2/`create.tsx` changes, the payload type and the ProxyHome pills.
- [ ] **Step 4: Run it, expect pass.**
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(tasks): P3-T14b Places address search in Create Task`

---

### Task P3-T15: "Usar minha localização atual" — permission flow, reverse geocode → served city

**Files:**
- Modify: `src/feature/tasks/hooks/useLocationCapture.ts` (whole: `capture` rewritten; `resolveCoords`, its `geocodeAsync` attempt and the device-position fallback deleted; `normalizeStateAbbr`/`STATE_ABBREVIATIONS` kept)
- Modify: `src/feature/tasks/components/AddressSearchField.tsx` (shortcut row, from P3-T14b)
- Test: `src/feature/tasks/hooks/__tests__/useLocationCapture.test.ts`, `src/feature/tasks/components/__tests__/AddressSearchField.location.test.tsx`

**Interfaces:**
- Consumes: `expo-location` `getForegroundPermissionsAsync`, `requestForegroundPermissionsAsync`, `getCurrentPositionAsync`, `reverseGeocodeAsync`; `Linking.openSettings`; `resolveSelectedAddress`, `SelectedAddress` (P3-T14b); `maskCEP`; `UNSERVED_CITY_MESSAGE` (T14).
- Produces:
  - `useLocationCapture(): { capture: () => Promise<CaptureResult>; capturing: boolean }` with
    `type CaptureResult = { ok: true; address: SelectedAddress } | { ok: false; message: string } | null` (`null` = permission flow shown or a capture already running):
    1. `getForegroundPermissionsAsync()`; status `undetermined` → `requestForegroundPermissionsAsync()` once;
       still not `granted` → `modal.show({ variant: 'info', title: 'Permissão de localização', message: 'Precisamos da sua localização pra preencher o endereço. Você pode permitir em Ajustes.', okLabel: 'Abrir Ajustes', cancelLabel: 'Agora não', onOk: () => Linking.openSettings() })` → `null`.
    2. `position = getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })`;
       `r = (await reverseGeocodeAsync(position.coords))[0]`; missing →
       `{ ok: false, message: 'Não conseguimos identificar o endereço da sua localização. Busque pelo endereço.' }`.
    3. `city = r.city ?? r.subregion ?? null`, `uf = normalizeStateAbbr(r.region)`;
       `formattedAddress = \`${[[r.street, r.streetNumber].filter(Boolean).join(', '), r.district].filter(Boolean).join(' - ')}, ${city} - ${uf}${r.postalCode ? \`, ${maskCEP(r.postalCode)}\` : ''}\``.
    4. `return resolveSelectedAddress({ formattedAddress, lat: position.coords.latitude, lng: position.coords.longitude, city, state: uf }, 'device')`
       — an unserved city yields `UNSERVED_CITY_MESSAGE(city)`.
    Any `expo-location` throw → `{ ok: false, message: extractErrorMessage(e) }`. No forward geocoding
    anywhere in the app: Places supplies coordinates for searched addresses and the device supplies its own.
  - `AddressSearchField` (when `value === null`): a row above the suggestions with the `MapPin` icon and
    `'Usar minha localização atual'` (`accessibilityLabel="Usar minha localização atual"`, spinner while `capturing`);
    `ok` → `onChange(result.address)`; `!ok` → the same inline error slot as Places; `null` → nothing.

- [ ] **Step 1: Write the failing tests**
  ```ts
  // useLocationCapture.test.ts
  it('denied permission offers "Abrir Ajustes" and returns null', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' })
    await expect(result.current.capture()).resolves.toBeNull()
    expect(useModalStore.getState().okLabel).toBe('Abrir Ajustes'); await useModalStore.getState().onOk!(); expect(Linking.openSettings).toHaveBeenCalled()
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })
  it('undetermined asks once, then reads the position', async () => {
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'undetermined' }); Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' })
    …; expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalledTimes(1); expect(Location.getCurrentPositionAsync).toHaveBeenCalled()
  })
  it('a served city returns the device address', async () => {
    granted; Location.getCurrentPositionAsync.mockResolvedValue({ coords: { latitude: -19.9245, longitude: -43.9352 } })
    Location.reverseGeocodeAsync.mockResolvedValue([{ street: 'Av. Afonso Pena', streetNumber: '1500', district: 'Centro', city: 'Belo Horizonte', region: 'Minas Gerais', postalCode: '30130005' }])
    await expect(result.current.capture()).resolves.toEqual({ ok: true, address: { formattedAddress: 'Av. Afonso Pena, 1500 - Centro, Belo Horizonte - MG, 30130-005', city: 'Belo Horizonte', state: 'MG', lat: -19.9245, lng: -43.9352, source: 'device' } })
  })
  it('an unserved city returns the PT message', async () => {
    reverse → [{ street: 'Rua A', streetNumber: '1', district: 'Centro', city: 'Contagem', region: 'Minas Gerais', postalCode: '32000000' }]
    await expect(result.current.capture()).resolves.toEqual({ ok: false, message: 'Ainda não atendemos em Contagem. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.' })
  })
  it('never forward-geocodes', async () => { …a served capture…; expect(Location.geocodeAsync).not.toHaveBeenCalled() })
  // AddressSearchField.location.test.tsx (useLocationCapture mocked)
  it('the shortcut fills the address', async () => {
    capture.mockResolvedValue({ ok: true, address: bhAddress }); const onChange = jest.fn()
    render(<AddressSearchField value={null} onChange={onChange} />); fireEvent.press(getByLabelText('Usar minha localização atual'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(bhAddress))
  })
  it('an unserved capture shows the inline message', async () => { capture.mockResolvedValue({ ok: false, message: 'Ainda não atendemos em Contagem. Por enquanto estamos em São Paulo, Rio de Janeiro e Belo Horizonte.' }); …; await findByText(/Ainda não atendemos em Contagem/) })
  ```
- [ ] **Step 2: Run it, expect failure** — `capture()` returns the old `CapturedAddress` shape / `requestForegroundPermissionsAsync` called on a denied status; the shortcut row is missing.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it, expect pass.** Also `grep -rn "geocodeAsync\|resolveCoords" src app --exclude-dir=__tests__` → 0 hits.
- [ ] **Step 5: Verify the repo gate.**
- [ ] **Step 6: Mark done; commit** `feat(tasks): P3-T15 current-location shortcut resolves to a served city`

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
    jest.useFakeTimers(); refreshSession.mockImplementation(async () => useAuthStore.getState().setSession(signFakeJwt(makeSession({ userType: 'PROXY', stripeAccountId: 'acct_1', stripeAccountReady: false }))))
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
  - `export type THistoryItem = { id: string; title: string; status: TTaskStatus; amount: number; date: string }` (date = `completedAt ?? canceledAt ?? createdAt`;
    `amount` per role, D1: CLIENT → `offeredPrice`; PROXY → `netAmount` for history rows (stored `proxyEarnings`, 0 when canceled) and `proxyEarnings ?? 0` for active tasks).
  - `export function selectHistoryItems(tab: HistoryTab, active: TTask[] | undefined, pages: TTransactionHistoryResponse[] | undefined, role: 'client' | 'proxy'): THistoryItem[]` — `ongoing` → every `active` task (status ∈ available/in_progress/verification_required); `done` → `tasksCreated ∪ tasksCompleted` across pages, deduped by `id`, status ∈ `{completed, payout_failed}`; `canceled` → status `canceled`; sorted by `date` desc.
  - `useHistory(tab, role): { items, isPending, isError, error, refetch, isRefetching, fetchNextPage, hasNextPage }` — `ongoing` reads the active query; others read the infinite history query (both queries always enabled so switching tabs is instant, SPEC §8.13 edge case).
  - `history.tsx`: title `'Histórico'`, `HistoryTabs` (`accessibilityRole="tab"`, `accessibilityState={{ selected }}`), `FlatList` of `HistoryCard` (status badge, title, `formatBRL(amount)` — prefixed by `'Você recebeu'` for a PROXY on `done` items —, `formatDateTime(date)`); `role` comes from `session.userType`, `onEndReached` → `fetchNextPage`, `RefreshControl`, states: skeleton (`TaskCardSkeleton`×3), `QueryErrorCard`, empty `'Nada por aqui'` / `'Suas tarefas vão aparecer nesta aba quando houver atualização.'`. Tap → `router.push(\`/tasks/${id}\`)`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  // select-history.test.ts
  const pages = [{ tasksCreated: [h({ id: 'a', status: 'completed' }), h({ id: 'b', status: 'canceled' })], tasksCompleted: [h({ id: 'a', status: 'completed' }), h({ id: 'c', status: 'payout_failed' })], page: 1, perPage: 20, hasMore: false }]
  // h(overrides) → TTransactionHistoryTask defaults { title: 'Trocar lâmpada da sala', city: 'São Paulo', offeredPrice: 100, netAmount: 80, createdAt: '2026-11-20T12:00:00.000Z', completedAt: null, canceledAt: null }
  it('done merges both lists, dedupes and includes payout_failed', () => expect(selectHistoryItems('done', [], pages, 'client').map((i) => i.id)).toEqual(['a', 'c']))   // (after date sort with equal dates keep input order)
  it('canceled filters canceled', () => expect(selectHistoryItems('canceled', [], pages, 'client').map((i) => i.id)).toEqual(['b']))
  it('ongoing comes from active tasks', () => expect(selectHistoryItems('ongoing', [makeTask({ id: 'x', status: 'in_progress' })], pages, 'client').map((i) => i.id)).toEqual(['x']))
  it('amount follows the role (D1)', () => {
    expect(selectHistoryItems('done', [], pages, 'client')[0].amount).toBe(100)
    expect(selectHistoryItems('done', [], pages, 'proxy')[0].amount).toBe(80)
    expect(selectHistoryItems('ongoing', [makeTask({ id: 'x', status: 'in_progress', offeredPrice: 123.45, proxyEarnings: 98.76 })], pages, 'proxy')[0].amount).toBe(98.76)
  })
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
- Modify: `src/feature/tasks/components/CreateTaskStep1.tsx` (price `FormInput` `rules` + `hint`, as rewritten by P3-T14b), `src/feature/tasks/components/ValidateTaskSheet.tsx:99-112,202-215,227-247,263-274`, `src/feature/home/components/ClientHome.tsx:40,57-65`, `app/(app)/tasks/[id]/index.tsx` (`askCancel` message), `app/index.tsx:16` (keep)
- Test: `src/feature/tasks/utils/__tests__/copy.test.ts`, `src/feature/tasks/components/__tests__/ValidateTaskSheet.test.tsx`, `src/feature/home/components/__tests__/ClientHome.test.tsx`, `src/feature/tasks/components/__tests__/CreateTaskStep1.price.test.tsx`

**Interfaces:**
- Produces (`copy.ts`, exact strings — snapshot-tested):
  - `PRICE_HINT = 'Mínimo R$ 20,00. É o valor total que você paga, taxas incluídas. O cartão é cobrado quando um Proxy aceita; o valor só é repassado após você validar.'` (D1)
  - `cancelMessageFor(status: TTaskStatus): string` — `available` → `'Essa ação não pode ser desfeita. Como nenhum Proxy aceitou, nada foi cobrado.'`; `in_progress` → `'Essa ação não pode ser desfeita. O valor cobrado será estornado no seu cartão em até 10 dias úteis.'` (D7, full refund); other → `'Essa ação não pode ser desfeita.'`
  - `VALIDATE_SUBTITLE = 'Ao confirmar, liberamos o pagamento para o Proxy. Se quiser, deixe uma avaliação pra ajudar a comunidade.'`
  - `COMMENT_MAX = 500`
- `ValidateTaskSheet`: rating optional (D15) — button enabled regardless of rating; `handleValidate` sends `rating: rating > 0 ? rating : undefined`; label `'Sua avaliação (opcional)'`; `TextInput maxLength={COMMENT_MAX}` + counter text `` `${comment.length}/500` ``.
- `ClientHome` stats: `'Ativas'` (owned active count), `'Criadas'` (`session.totalTasksCreated`), `'Concluídas'` = count of `tasksCreated` with status `completed` from `useTransactionHistoryInfiniteQuery` page 1 (`'—'` while loading). Remove the rating stat.
- Step 1 price hint → `PRICE_HINT`; price rule (D1 bounds from `@/common/constants/pricing`, P3-T13):
  `validate: (v: string) => { const n = parseBRLToNumber(v); return n < MIN_OFFERED_PRICE ? 'Mínimo R$ 20,00.' : n > MAX_OFFERED_PRICE ? 'Máximo R$ 10.000,00.' : true }`;
  detail `askCancel` → `cancelMessageFor(task.status)`.

- [ ] **Step 1: Write the failing tests**
  ```ts
  it('copy snapshot', () => expect({ PRICE_HINT, VALIDATE_SUBTITLE, cancelAvailable: cancelMessageFor('available'), cancelInProgress: cancelMessageFor('in_progress') }).toMatchInlineSnapshot(…exact strings above…))
  // ValidateTaskSheet.test.tsx
  it('validates without a rating', async () => { fireEvent.press(getByText('Validar e pagar')); await waitFor(() => expect(validate).toHaveBeenCalledWith({ taskId: 'task-1', rating: undefined, comment: undefined })) })
  it('caps the comment at 500 and shows the counter', () => { fireEvent.changeText(getByPlaceholderText('Conte como foi o serviço (opcional).'), 'a'.repeat(20)); getByText('20/500'); expect(getByPlaceholderText(…).props.maxLength).toBe(500) })
  // ClientHome.test.tsx
  it('shows Criadas and no Avaliação', () => { render(<ClientHome session={makeSession({ totalTasksCreated: 7 })} />); getByText('Criadas'); getByText('7'); expect(queryByText('Avaliação')).toBeNull() })
  // CreateTaskStep1.price.test.tsx
  it('rejects R$ 19,99 and R$ 10.000,01, accepts R$ 20,00', async () => {
    fireEvent.changeText(getByPlaceholderText('R$ 0,00'), '1999'); await findByText('Mínimo R$ 20,00.')
    fireEvent.changeText(getByPlaceholderText('R$ 0,00'), '1000001'); await findByText('Máximo R$ 10.000,00.')
    fireEvent.changeText(getByPlaceholderText('R$ 0,00'), '2000'); await waitFor(() => { expect(queryByText('Mínimo R$ 20,00.')).toBeNull(); expect(queryByText('Máximo R$ 10.000,00.')).toBeNull() })
  })
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
- Modify: `eslint.config.js` (add `no-restricted-imports` with `patterns: ['../**/src/*', '../../src/*']`), `app/(auth)/sign-up.tsx:24`, `app/(auth)/sign-in.tsx:22`, `app/(auth)/forgot-password.tsx` (same relative `modal` import), `tailwind.config.js` `content` globs (must include `./app/**/*.{ts,tsx}` and `./src/**/*.{ts,tsx}`), `.env.example` (four legal keys from T08; the Places key from T14 is already there), `CLAUDE.md` (document: status-dependent absolute action bars on task detail as the one exception to the in-scroll CTA rule; `src/test/` harness; `QueryFocusProvider`; `apis/api-errors.ts`; `apis/auth/token-refresh.ts` (single-flight refresh, bare `authHttp`); `lib/google-places/` (Places client, session tokens)), `SPEC.md` §3.4 (routes `/auth/me`, `/auth/refresh`, `/auth/logout`, `/auth/update-profile`, `/tasks/price-preview`, `/card/setup-intent`, pagination shape; session = 30-minute access token + refresh token renewed by a single-flight 401 refresh), §7.3 (SetupIntent at save, off-session charge with automatic capture at accept, no `requires_action`/`requires_capture`, client pays exactly the offered price, proxy receives 80 %), §8.3 (no document fields), §8.8 (Google Places address search restricted to the served cities, "Usar minha localização atual", no date/time, one "Você paga" total from the backend), §8.9 (support link, no "em breve", payment banner, proxy states, "Você recebe"), §8.11 ("Total recebido", 4 states), §8.13 (as built), §8.14 ("Editar dados" screen for name + phone, deletion flow, legal rows).
- Test: `npx eslint .` must fail before (3 relative imports) and pass after; `npx tsc --noEmit`.

- [ ] **Step 1: Add the lint rule and run `npx eslint .`** — expect 3 errors `'../../src/lib/modal' import is restricted`.
- [ ] **Step 2: Fix the imports to `@/lib/modal`; re-run** — 0 errors.
- [ ] **Step 3: Update `tailwind.config.js`, `.env.example`, `CLAUDE.md`, `SPEC.md`** per the list.
- [ ] **Step 4: Verify the repo gate** — `npx tsc --noEmit && npx eslint . && npm test`.
- [ ] **Step 5: Final sweep** — `grep -rn "em breve\|Em construção\|requires_action\|requires_capture\|0.0399\|pré-autorizado\|tokenVersion\|isVerified\|documentType\|Taxa Stripe" app src --exclude-dir=__tests__` → 0 hits (test files keep legacy claims on purpose); every `TODO`/`FIXME` added during the phase removed.
- [ ] **Step 6: Mark Phase 3 done in ../STATUS.md; commit** `chore(app): P3-T22 lint rule, globs, docs sync`
