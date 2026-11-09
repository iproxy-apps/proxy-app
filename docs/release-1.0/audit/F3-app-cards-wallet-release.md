# F3 — Mobile app: cards, wallet / Stripe Connect onboarding, release & store configuration

Audit date: 2026-11-08. Auditor: F3. Read-only pass; nothing in either repo was modified
(`git status` in proxy-app still shows only ` M CLAUDE.md` / `?? docs/`, which predate this audit).

---

## 1. Scope

Every file below was opened in full and read line by line unless marked *(partial)*.

### proxy-app (slice)

| File | Lines |
| --- | ---: |
| `app/(app)/cards.tsx` | 138 |
| `app/(app)/(tabs)/wallet.tsx` | 97 |
| `src/apis/cards/cards-api-types.ts` | 19 |
| `src/apis/cards/cards-apis.ts` | 12 |
| `src/apis/cards/cards-hooks.ts` | 46 |
| `src/apis/wallet/wallet-api-types.ts` | 36 |
| `src/apis/wallet/wallet-apis.ts` | 23 |
| `src/apis/wallet/wallet-hooks.ts` | 20 |
| `src/feature/cards/components/AddCardSheet.tsx` | 291 |
| `src/feature/cards/components/CardPreview.tsx` | 134 |
| `src/feature/cards/components/CardSkeleton.tsx` | 41 |
| `src/feature/cards/components/EmptyState.tsx` | 54 |
| `src/feature/cards/utils/brand-display.ts` | 18 |
| `src/feature/wallet/components/BalanceCard.tsx` | 46 |
| `src/feature/wallet/components/EarningsList.tsx` | 135 |
| `src/feature/wallet/components/MerchantStatusRow.tsx` | 148 |
| `src/feature/wallet/hooks/useStripeOnboarding.ts` | 58 |
| `stripe-redirect/index.html` | 85 |
| `app.json` | 74 |
| `package.json` | 59 |
| `.env.example` | 2 |
| `.gitignore` | 44 |
| `README.md` | 78 |
| `package-lock.json` | *(resolved versions only, via `node -e require(...)`)* |
| `assets/*.png` | *(size/format via `file`, PNG chunk scan, and visual inspection of `icon.png` + `adaptive-icon.png`)* |

### proxy-app (context, needed to follow the data flow)

`app/_layout.tsx` (28), `app/(app)/_layout.tsx` (25), `app/(app)/(tabs)/_layout.tsx` (83),
`app/(app)/(tabs)/profile.tsx` (lines 1–140), `app/(app)/tasks/[id]/index.tsx` (lines 85–135 only),
`src/apis/api-client.ts` (67), `src/apis/query-client.ts` (34), `src/apis/query-keys.ts` (13),
`src/apis/auth/auth-hooks.ts` (61), `src/apis/auth/auth-api-types.ts` (lines 12–32),
`src/store/auth-store/auth-store.ts` (44), `src/shared/providers/SessionProvider.tsx` (37),
`src/feature/auth/hooks/useProxyAuth.ts` (33), `src/lib/secure-store.ts` (15), `src/lib/modal.ts` (33),
`src/common/utils/format.ts` (34), `src/feature/home/components/ProxyHome.tsx` (lines 280–295),
`CLAUDE.md` (full), `SPEC.md` §4.1, §4.3, §4.4, §5.1–5.3, §7.3, §8.11, §8.12, §8.14, §9.
Config-plugin sources in `node_modules` for `@stripe/stripe-react-native`, `expo-location`,
`expo-image-picker`, `expo-build-properties`, and `expo-web-browser/build/WebBrowser.js` (to verify what
`app.json` actually generates and how `openAuthSessionAsync` behaves per platform).

### proxy-api (read-only contract checks)

`src/modules/cards/controllers/{create-user-payment-method,delete-user-card,fetch-user-card}.controller.ts`,
`src/modules/cards/use-cases/{create-user-payment-method,delete-user-card,fetch-user-card}.service.ts`,
`src/modules/cards/types/index.d.ts`,
`src/modules/auth/controllers/{create-merchant-account,fetch-merchant-dashboard-link,fetch-transaction-history,refresh-session}.controller.ts`,
`src/modules/auth/use-cases/{create-merchant-account,create-merchant-dashboard-link,fetch-transaction-history,refresh-session}.service.ts`,
`src/stripe/stripe.service.ts` (156), `src/modules/stripe-webhook/use-cases/handle-account-updated.service.ts` (28),
`src/modules/auth/utils/jwt.strategy.ts` (lines 1–60), `src/modules/auth/repository/auth.repository.ts` (lines 92–129),
`src/modules/tasks/use-cases/validate-task.service.ts` (lines 40–100), `start-task.service.ts` (lines 40, 55–99),
`src/exception/error-dictionary.ts` (card + merchant entries), `src/env/env.ts`, `.env.example`, test file names only.

### Commands run (non-mutating)

- `CI=1 npx expo-doctor` — output quoted in §3 / finding P3-1.
- `CI=1 npx expo install --check` — in CI mode it only reports and exits non-zero; verified `package.json` byte-identical before/after (`diff` clean, `git status` unchanged). Output quoted in finding P3-1.
- `git -C proxy-app ls-files .env .env.* eas.json` → only `.env.example` is tracked. `.env` exists locally, is gitignored, and holds a `pk_test_` key.
- `npm ls typescript react react-native @stripe/stripe-react-native react-native-webview` — no peer errors; all deduped to the lock versions.

Skipped: nothing in the slice. I did **not** run the backend e2e suite (brief) and did not launch Expo.

---

## 2. How it works (as the code behaves)

### 2.1 Cards (CLIENT)

**Entry point.** There is no cards tab. `app/(app)/(tabs)/_layout.tsx:52-80` registers only `home`, `wallet`
(hidden for CLIENT via `href: null`, line 64), `history`, `profile`. The CLIENT reaches the card screen from
Profile → "Conta" → row **"Cartão"** (`app/(app)/(tabs)/profile.tsx:93-99`, `router.push('/cards')`), rendered only
when `isClient`. The route itself, `app/(app)/cards.tsx`, is a plain stack screen with **no role check**; a PROXY
could reach it only by deep link (`proxyapp://cards`). This diverges from SPEC §5.1/§8.12, which place cards at
`/(app)/(tabs)/cards` as a tab hidden for PROXY.

**Read.** `useCardQuery` (`src/apis/cards/cards-hooks.ts:13-26`) calls `GET /card/fetch`; a 404
(`NO_SAVED_CARD_FOUND`, backend `fetch-user-card.service.ts:16-18`) is translated into `null` so the screen shows
`EmptyState`; any other error propagates and — because `cards.tsx:101-107` only branches on `isPending` / `card` —
renders the same `EmptyState` (an error looks like "no card"). The query inherits `staleTime: 5min`,
`refetchOnWindowFocus: false` (`src/apis/query-client.ts:24-28`).

**Add / replace.** `cards.tsx:26-42`: if a card exists, `modal.confirm("Substituir cartão?")` then opens the sheet
after a 340 ms delay. `AddCardSheet` (`AddCardSheet.tsx:97-116`) renders Stripe's `<CardField postalCodeEnabled={false}>`
(line 227-249) and on save calls `createPaymentMethod({ paymentMethodType: 'Card' })` (lines 102-104) — i.e. it
creates a **PaymentMethod** (`pm_…`), not a legacy token; the `pm_` id is then sent as `{ token: paymentMethod.id }`
to `POST /card/create` (line 109). That matches the backend Zod schema `z.object({ token: z.string() })`
(`create-user-payment-method.controller.ts:11-13`). Backend (`create-user-payment-method.service.ts:44-79`)
`paymentMethods.retrieve(token)` → `paymentMethods.attach(pm, { customer })` (`stripe.service.ts:50-57`) → inserts
or **updates** the single card row. No SetupIntent is created, so the card is attached without any
customer-initiated authentication; see finding P1-4 for the off-session consequence. On success the mutation
writes the returned card straight into the query cache (`cards-hooks.ts:32-34`) and the sheet closes
(`cards.tsx:134`). No success toast (SPEC §8.12 asks for "Cartão adicionado!").

**Delete.** `cards.tsx:44-61` → confirm → `DELETE /card/:id` (backend detaches the PM on Stripe then soft-deletes,
`delete-user-card.service.ts:30-31`, 204 No Content). Cache set to `null` (`cards-hooks.ts:42-44`). No toast
("Cartão removido." in SPEC). The error path defers `modal.error` 280 ms to avoid iOS modal stacking.

**Stripe runtime wiring.** `StripeProvider` is mounted in `app/(app)/_layout.tsx:21` with
`publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}` — an empty string silently disables the
SDK if the env var is missing in the build (see P1-6). No `urlScheme` / `merchantIdentifier` prop is passed at
runtime; the Apple Pay merchant id lives only in `app.json`.

### 2.2 Wallet (PROXY)

**Balance.** `wallet.tsx:19-21` reads `session.walletBalance` and `session.stripeAccountReady` from the **decoded JWT**
(`auth-store.ts:17-24`, `jwt-decode`). The JWT is only replaced on sign-in/sign-up (`auth-hooks.ts:14-34`) and by
`useRefreshSessionMutation` (`auth-hooks.ts:54-61` → `GET /auth/session/refresh`), which is called from exactly one
place: the end of the onboarding hop (`useStripeOnboarding.ts:47`). Nothing refreshes it when the Wallet tab gains
focus or after a task is validated, so the balance shown in `BalanceCard` and in `ProxyHome.tsx:290` is whatever it was
at login (P1-2). Backend `walletBalance` is a Prisma Decimal; it is coerced with `z.coerce.number()` server-side
(`jwt.strategy.ts:24`) but the JWT *body* carries the Decimal's JSON form, which `formatBRL` tolerates
(`format.ts:11-16` accepts string). The backend JWT has **no `exp`** (`auth.module.ts:49` sets only the
algorithm) — outside this slice, but it means stale claims live forever.

**Merchant status.** `MerchantStatusRow` has two states only (`MerchantStatusRow.tsx:30` `if (!ready)`): "not ready"
(card with "Configure sua conta pra receber" + CTA) and "ready" ("Conta merchant ativa" + "Abrir painel Stripe"). There
is no distinct "pending / in review" or "restricted" state. Backend `stripeAccountReady` is set by the
`account.updated` webhook as `charges_enabled && payouts_enabled` (`handle-account-updated.service.ts:13`), and
`POST /tasks/start` refuses non-ready proxies (`start-task.service.ts:40`), so the copy "Antes de aceitar tarefas"
is accurate.

**Onboarding hop.** `useStripeOnboarding.start` (`useStripeOnboarding.ts:26-52`):
1. `POST /auth/merchant-account` → backend creates an **Express** account (`stripe.service.ts:114-139`,
   `controller.stripe_dashboard.type: 'express'`, fees/losses on the platform) on first call, reuses it afterwards,
   then creates an Account Link with `return_url === refresh_url === DEV_CALLBACK_URL | PROD_CALLBACK_URL`
   (`create-merchant-account.service.ts:67-80`, `stripe.service.ts:141-151`).
2. `WebBrowser.openAuthSessionAsync(accountLinkUrl, 'proxyapp://wallet')` (lines 37-40). On iOS this is
   `ASWebAuthenticationSession` with callback scheme `proxyapp`. On Android `expo-web-browser` uses the
   polyfill (`WebBrowser.js:263-265` `return Platform.OS !== 'android'`): a Custom Tab raced against a
   `Linking` listener for the return URL (`WebBrowser.js:311-335`).
3. Stripe redirects to the hosted page `stripe-redirect/index.html`, which does `<meta http-equiv="refresh"
   content="0; url=proxyapp://wallet">` (line 7), a 200 ms JS fallback (lines 80-82) and a manual button (line 77).
4. Back in the app: `cancel`/`dismiss` → info toast; anything else → `refreshSession` then
   `toast.success('Recebimento configurado com sucesso.')` **unconditionally** (lines 47-48) — the doc comment
   on lines 17-20 promises an "in flight" message when the flag is still false, but no such branch exists (P1-1).

**Where is the redirect page hosted?** Nowhere that the repos know of. `stripe-redirect/index.html` has no deploy
config, no README mention, no URL anywhere; `proxy-api/.env.example:12-13` leaves `DEV_CALLBACK_URL=` /
`PROD_CALLBACK_URL=` empty; e2e setup uses `http://localhost:3000/callback`. Stripe requires an `https` `return_url`
for Account Links, so this page (or an equivalent) **must** be live at `PROD_CALLBACK_URL` before any proxy can
finish onboarding (P1-3).

**Dashboard.** `wallet.tsx:28-39` calls `walletApis.merchantDashboard()` directly (bypassing the unused
`useMerchantDashboardMutation`, `wallet-hooks.ts:18-20`) and opens the login link with `openBrowserAsync`. Backend
uses `accounts.createLoginLink` (`stripe.service.ts:153-155`), which is valid for Express accounts — consistent
with the account type created above. SPEC §8.11 says to hide the link when not ready; the code does (link only in
the `ready` branch).

**Earnings.** `useTransactionHistoryQuery` → `GET /auth/transaction-history` → `tasksCompleted` only
(`wallet.tsx:90`). Backend returns tasks with `status: 'completed'` for which the user is executor
(`auth.repository.ts:110-129`) and **recomputes** `netAmount = price − (3.99 % + R$ 0,39) − 20 %` from
`offeredPrice` (`fetch-transaction-history.service.ts:36-46`) rather than returning the stored
`tasks.proxyEarnings`; `validate-task.service.ts:55-57` uses the identical formula, so they agree today but are two
copies of one business rule. `EarningsList.tsx:127` renders `+{formatBRL(task.netAmount)}`, date from `completedAt`
via `toLocaleDateString('pt-BR')` (lines 18-25). `history.isError` is never read (`wallet.tsx:89-92`) — a failed
request shows "Sem ganhos ainda" (P2-1). No pull-to-refresh, no refetch on focus.

### 2.3 Release / store configuration (what `app.json` really generates)

- `name: "proxy-app"`, `slug: "proxy-app"`, `bundleIdentifier`/`package: "com.anonymous.proxyapp"`
  (`app.json:3-4,13,21`). The display name under the icon, the `ASWebAuthenticationSession` consent sheet
  ("proxy-app" Wants to Use "stripe.com" to Sign In) and the Android launcher label all use "proxy-app".
- Icons: `icon.png`, `adaptive-icon.png`, `splash-icon.png` are **Expo's default template placeholders**
  (concentric circles on a grid; 1024×1024 8-bit palette PNG, `adaptive-icon`/`splash` with tRNS). `favicon.png`
  48×48 gray+alpha. Visually confirmed.
- `@stripe/stripe-react-native` plugin with `merchantIdentifier` (`app.json:30-34`) → plugin
  `setApplePayEntitlement` adds `com.apple.developer.in-app-payments = [merchant.com.anonymous.proxyapp]` to the
  iOS entitlements (verified in `lib/commonjs/plugin/withStripe.js`). Apple Pay is not used anywhere in the app.
- `expo-location` plugin (`app.json:37-42`) passes both `locationAlwaysAndWhenInUsePermission` and
  `locationWhenInUsePermission` → both `NSLocationAlwaysAndWhenInUseUsageDescription` and
  `NSLocationWhenInUseUsageDescription` are written (`withLocation.js:116-118`); `UIBackgroundModes` is **not**
  added (only when `isIosBackgroundLocationEnabled`). The app only ever calls
  `requestForegroundPermissionsAsync` / `getCurrentPositionAsync` (`useDeviceLocation.ts:31,37`,
  `useLocationCapture.ts:104,120,174`).
- `expo-image-picker` plugin (`app.json:43-49`) sets photos + camera strings but **not** `microphonePermission:
  false`, so the plugin adds `NSMicrophoneUsageDescription` with the English default and `android.permission.RECORD_AUDIO`
  (`withImagePicker.js:52,58-59`). The app never records video (`finish.tsx:52-54` `mediaTypes: ['images']`).
  `NSPhotoLibraryAddUsageDescription` is **not** needed: the app never saves to the library.
- `newArchEnabled: true` (`app.json:10`) is rejected by the SDK 57 schema (RN 0.86 is New-Arch-only); harmless but
  fails `expo-doctor`.
- `expo-build-properties.ios.enableSceneSupport: true` is a valid SDK 57 key (`pluginConfig.js:217`).
- Absent: `ios.buildNumber`, `android.versionCode`, `ios.infoPlist` (so no `ITSAppUsesNonExemptEncryption`),
  `ios.displayName`, `owner`, `extra.eas.projectId`, `updates`, `runtimeVersion`, `privacy`, `description`,
  `android.permissions` (defaults), `android.intentFilters` / `associatedDomains` (the custom scheme `proxyapp`
  from `scheme` is enough for the Stripe return; no universal links needed). No `eas.json`, no `app.config.*`.
- Dependencies (lock): expo 57.0.24, react-native 0.86.3, react 19.2.3, @stripe/stripe-react-native 0.64.0,
  typescript 6.0.3, expo-router 57.0.22, reanimated 4.5.1, worklets 0.10.1. `expo/bundledNativeModules.json` for this
  SDK pins **exactly** `@stripe/stripe-react-native 0.64.0`, RN 0.86.3, React 19.2.3, reanimated 4.5.1, worklets
  0.10.1, datetimepicker 9.1.0, svg 15.15.4 — all match. The git history went 0.50.3 → 0.67.0 (`01ed159`) → 0.64.0
  (`274bc01`), i.e. the "downgrade" is the SDK-57-pinned version, not drift. TypeScript 6 is not pinned by Expo;
  `npx tsc --noEmit` is clean per the brief and Babel strips types, so it is compatible.
- Secrets: `.env` is gitignored and untracked; local key is `pk_test_…`; API URL is a plain-`http` LAN IP
  (`.env.example:1`). README's env table omits `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`README.md:37-39`).
- Push notifications: no `expo-notifications`, no `expo-device`, no token registration, no notification handlers
  anywhere (`grep -ri notification app src app.json package.json` only hits the toast doc-comment). Nothing is
  half-wired; matches SPEC §9.1 (future).

### 2.4 Code vs docs disagreements noticed

| Topic | Code | Doc |
| --- | --- | --- |
| Cards location | stack route `app/(app)/cards.tsx`, entered from Profile | SPEC §5.1/§8.12: tab `(tabs)/cards.tsx` |
| Card toasts | none | SPEC §8.12: "Cartão adicionado!", "Cartão removido." |
| Onboarding result | success toast always | `useStripeOnboarding.ts:17-20` comment promises an "in flight" message |
| SDK | expo 57 / RN 0.86 / React 19.2 (`package.json`) | `CLAUDE.md` + `README.md:7`: SDK 54 / RN 0.81 |
| Palette | graphite + mustard | `README.md:72`: "verde-escuro com acento lima" |
| Profile | "Editar dados" is a stub modal; no Terms/Privacy, no Delete account | SPEC §8.14 items 3-4 |
| Audit brief | — | brief says "account deletion (exists)"; only the **backend** `DELETE /auth/account` exists, the app has no UI for it |

---

## 3. Findings

### [P0] Store identity is still the Expo template (placeholder icons, "proxy-app" name, `com.anonymous` ids)
File: `app.json:3-13,16-21`; `assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png`
Evidence:
```json
"name": "proxy-app",
"slug": "proxy-app",
...
"icon": "./assets/icon.png",
"ios": { "supportsTablet": true, "bundleIdentifier": "com.anonymous.proxyapp" },
"android": { "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", ... }, "package": "com.anonymous.proxyapp" }
```
`file assets/*.png` → all three 1024×1024 "8-bit colormap"; visual inspection shows the default Expo concentric-circles
placeholder. The splash is the same image.
Why it matters: App Review Guideline 2.3.8 / 4 and Play's metadata policy reject placeholder icons; the bundle id and
package cannot be changed after the first upload, and "com.anonymous.*" is not a domain the owner controls. The
launcher label and the iOS "proxy-app Wants to Use stripe.com" consent sheet show "proxy-app".
Suggested fix: pick a final reverse-DNS id (e.g. `br.com.<domain>.proxy`) for both platforms before the first EAS
build; set `name: "Proxy"` (and `ios.displayName`); replace icon / adaptive foreground (keep artwork inside the
central 66 % safe zone) / splash with real assets; set `android.adaptiveIcon.backgroundColor` to the brand color.
Confidence: high

### [P0] No in-app account deletion, no privacy-policy / terms / support surface
File: `app/(app)/(tabs)/profile.tsx:33-37,93-110`; grep of `app/` + `src/` for `Excluir conta|deleteAccount|/auth/account` → no hits
Evidence:
```tsx
const openEditAccount = () =>
  modal.info('Em breve você poderá editar seus dados, foto e gerenciar a conta por aqui.')
...
<MenuRow label="Editar dados" onPress={openEditAccount} />
{isClient ? (<MenuRow label="Cartão" ... onPress={() => router.push('/cards')} />) : null}
...
<Button variant="outline" ... onPress={handleSignOut}>Sair da conta</Button>
```
Backend has `DELETE /auth/account` (`proxy-api/src/modules/auth/controllers/delete-account.controller.ts`), the app
never calls it. There is also no "Termos e Privacidade" row (SPEC §8.14 item 4) and no URL constant anywhere.
Why it matters: Apple 5.1.1(v) requires account deletion *inside* the app for any app that supports account creation
(since 2022); Google Play's account-deletion policy requires it in-app and via a web link declared in the Data
safety form. Both stores require a privacy-policy URL for apps collecting location, photos, PII and payment data.
These are hard submission blockers, not polish. (The brief's "account deletion (exists)" is true only for the API.)
Suggested fix: add "Excluir conta" (double confirm → `DELETE /auth/account` → clear session; handle 409
`USER_HAS_ACTIVE_TASKS`) and "Termos e Privacidade" rows per SPEC §8.14; publish privacy policy + terms + support
pages (can live next to `stripe-redirect/`), and wire the URLs via `expo-web-browser`.
Confidence: high

### [P1] Onboarding always ends with "Recebimento configurado com sucesso", even when it is not
File: `src/feature/wallet/hooks/useStripeOnboarding.ts:37-48`; `proxy-api/src/stripe/stripe.service.ts:141-151`
Evidence:
```ts
const result = await WebBrowser.openAuthSessionAsync(accountLinkUrl, RETURN_URL)
if (result.type === 'cancel' || result.type === 'dismiss') { toast.info(...); return }
await refreshSession.mutateAsync()
toast.success('Recebimento configurado com sucesso.')
```
```ts
return await this.stripe.accountLinks.create({ account, return_url: url, refresh_url: url, type: 'account_onboarding', ... })
```
Why it matters: Stripe documents that reaching `return_url` does **not** mean onboarding is complete (the user can
leave mid-flow, requirements can remain `currently_due`, verification can be pending). `refresh_url` is the same URL,
so an *expired* link also lands on the success toast. `stripeAccountReady` is flipped only by the
`account.updated` webhook (`charges_enabled && payouts_enabled`), which may lag or never come. The screen then shows
"Configure sua conta pra receber" directly under a green "sucesso" toast, and the proxy cannot accept tasks
(`start-task.service.ts:40`) without understanding why. The hook's own comment (lines 17-20) describes the missing
branch.
Suggested fix: after `refreshSession`, read `useAuthStore.getState().session?.stripeAccountReady`; if true →
success toast, else → `toast.info('Cadastro enviado. A confirmação do Stripe pode levar alguns minutos.')` and poll
`/auth/session/refresh` a few times (or on next Wallet focus). Backend: use a distinct `refresh_url` (e.g.
`?refresh=1`) so the page/app can tell "expired" from "returned".
Confidence: high

### [P1] Wallet balance and merchant status come from a JWT that is never refreshed on the main flow
File: `app/(app)/(tabs)/wallet.tsx:19-21,76`; `src/feature/home/components/ProxyHome.tsx:290`; `src/apis/auth/auth-hooks.ts:54-61`
Evidence:
```ts
const { session } = useProxyAuth()
const stripeReady = !!session?.stripeAccountReady
const balance = session?.walletBalance ?? 0
...
<BalanceCard amount={balance} />
```
`useRefreshSessionMutation` is referenced from exactly one call site (`useStripeOnboarding.ts:47`); the JWT has no
`exp`, and `query-client.ts:28` disables refetch-on-focus.
Why it matters: after a client validates a task, the backend credits `walletBalance`
(`validate-task.service.ts:85-88`) but the proxy's app keeps showing the login-time value in both the Wallet card
and the Home header until they sign out and in. Same for `stripeAccountReady` flipping via webhook after the app was
already open, or being *revoked* (webhook sets it false when Stripe restricts the account) — the UI keeps showing
"Conta merchant ativa". SPEC §8.11 explicitly asks to "atualizar localmente após validação de tarefas ou após refresh
do token"; neither happens.
Suggested fix: call `refreshSession` in a `useFocusEffect` on Wallet (and on Home for PROXY), with a cheap
throttle (e.g. ≥30 s since last refresh); also refresh after `validate` succeeds on the client side is irrelevant
(different user), so focus-based refresh is the practical path. Alternatively expose `GET /auth/me`.
Confidence: high

### [P1] The Stripe return page is not hosted / `PROD_CALLBACK_URL` has no value anywhere
File: `stripe-redirect/index.html:7,77-82`; `src/feature/wallet/hooks/useStripeOnboarding.ts:9`; `proxy-api/.env.example:12-13`; `proxy-api/src/modules/auth/use-cases/create-merchant-account.service.ts:67-72`
Evidence:
```html
<meta http-equiv="refresh" content="0; url=proxyapp://wallet" />
```
```
DEV_CALLBACK_URL=
PROD_CALLBACK_URL=
```
No deploy config, README line, workflow, or URL references `stripe-redirect` in either repo (grep over both repos
and `docs/`). The e2e setup uses `http://localhost:3000/callback`.
Why it matters: Stripe only accepts `https` `return_url`/`refresh_url` on Account Links, and the app's whole
onboarding return depends on this page issuing the `proxyapp://wallet` hop. If `PROD_CALLBACK_URL` points to a
generic host that does not redirect to the scheme, iOS `ASWebAuthenticationSession` never closes
(`openAuthSessionAsync` resolves only on `cancel`), and on Android the Custom Tab just sits on the page. On Android,
Chrome blocks non-user-gesture navigations to external schemes in some versions, so the manual button (line 77) is
the only reliable path — keep it.
Suggested fix: host `stripe-redirect/index.html` on a static origin (same place as privacy/terms), document it in
both READMEs, set `PROD_CALLBACK_URL` to it, and add a second route/query for `refresh_url` (see P1-1). Test on
Android that the meta refresh actually opens the app; if not, make the button primary.
Confidence: high (hosting gap) / medium (Android meta-refresh behaviour, needs a device run)

### [P1] Card is saved by plain `attach`; the first charge is merchant-initiated with the client absent
File: `src/feature/cards/components/AddCardSheet.tsx:102-109`; `proxy-api/src/stripe/stripe.service.ts:50-57,63-82`; `proxy-api/src/modules/tasks/use-cases/start-task.service.ts:58-92`; `app/(app)/tasks/[id]/index.tsx:103-108`
Evidence:
```ts
const { paymentMethod, error } = await createPaymentMethod({ paymentMethodType: 'Card' })
...
await createCard.mutateAsync({ token: paymentMethod.id })
```
```ts
return await this.stripe.paymentMethods.attach(paymentMethodId, { customer })          // no SetupIntent
return await this.stripe.paymentIntents.create({ ..., payment_method: savedCard, setup_future_usage: 'off_session' })
return await this.stripe.paymentIntents.confirm(paymentIntentId, { payment_method: savedCard }) // no off_session: true
```
```ts
if (result.status === 'requires_action') {
  toast.success('Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.')
```
Why it matters: the charge happens in `POST /tasks/start`, triggered by the **proxy**, while the **client** (card
owner) is not in the loop. Because no SetupIntent with `usage: 'off_session'` was ever confirmed by the client, Stripe
treats the first PaymentIntent as an on-session confirmation; any issuer/Radar rule that demands 3DS returns
`requires_action` with a `client_secret` that the proxy's device cannot complete and the client never receives (the
app has no `confirmPayment`/`handleNextAction` call anywhere — grep is empty). The task is then left with a pending
payment. In Brazil 3DS is not mandated, so most cards will pass, but SPEC §9.1 item 2 itself calls this
"não é opcional". `setup_future_usage` on the PI only helps *after* a first successful authenticated charge.
Suggested fix (contract-level, shared with the tasks auditor): save the card via a SetupIntent
(`usage: 'off_session'`, confirmed in the app with `confirmSetupIntent`) so later PIs can be created with
`off_session: true, confirm: true`; keep `requires_action` as a hard failure the proxy sees, not a success toast.
Confidence: medium (the Stripe behaviour is documented; the frequency with Brazilian issuers is not measurable here)

### [P1] No build/release configuration: no `eas.json`, no build numbers, no prod API/Stripe key strategy
File: `app.json` (absent keys), `package.json:5-14`, `.env.example:1-2`, `app/(app)/_layout.tsx:7,21`, `src/apis/api-client.ts:9-15`
Evidence:
```
EXPO_PUBLIC_API_URL=http://192.168.2.93:3333
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
```
```tsx
<StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY ?? ''}>
```
`ls eas.json app.config.*` → none; `node -e` over `app.json` → `ios.buildNumber`, `android.versionCode`, `owner`,
`extra.eas.projectId`, `updates`, `runtimeVersion` all `undefined`.
Why it matters: `EXPO_PUBLIC_*` values are inlined at bundle time, so a store build made from the developer's
`.env` ships the LAN IP and the **test** publishable key; a build without `.env` ships `''` and Stripe's `CardField`
silently does nothing. iOS release builds enforce ATS, so a plain-`http` API host is blocked unless an exception is
added — the backend must be served over `https` with a public hostname. Without `eas.json` profiles there is no
place to pin `pk_live_` vs `pk_test_` or to auto-increment build numbers; the second upload will be rejected for a
duplicate `1.0.0 (1)`.
Suggested fix: add `eas.json` with `development`/`preview`/`production` profiles, each with its own
`EXPO_PUBLIC_API_URL` (https) and `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `autoIncrement: true` on production, and
`owner` + `extra.eas.projectId` in `app.json`. Fail fast at startup if either env var is empty in a non-dev build.
Confidence: high

### [P1] `supportsTablet: true` makes iPad a reviewed, screenshot-mandatory target
File: `app.json:12`
Evidence:
```json
"ios": { "supportsTablet": true, ... }
```
Why it matters: with tablet support on, App Store Connect requires 13" iPad screenshots and App Review runs the app
on an iPad; every screen here is a 24 px-gutter phone layout, bottom sheets are `Dimensions`-based
(`AddCardSheet.tsx:28`), and nothing was designed for 1024-pt widths. It is the most common cause of a first-review
rejection for small Expo apps.
Suggested fix: set `"supportsTablet": false` for 1.0 (iPhone-only), or budget a tablet QA pass and produce the
screenshots.
Confidence: high

### [P2] Transaction-history failures are rendered as "Sem ganhos ainda"; list never refreshes
File: `app/(app)/(tabs)/wallet.tsx:26,88-93`; `src/feature/wallet/components/EarningsList.tsx:43-79`; `src/apis/query-client.ts:24-28`
Evidence:
```tsx
const history = useTransactionHistoryQuery({ enabled: !!session })
...
<EarningsList earnings={history.data?.tasksCompleted ?? []} loading={history.isLoading} />
```
`history.isError` is never read; `staleTime: 5 * 60 * 1000`, `refetchOnWindowFocus: false`; the `ScrollView` has no
`refreshControl`.
Why it matters: a 500/timeout (15 s axios timeout) yields the empty state with a reassuring message; a proxy who just
had a task validated and opens Wallet within 5 minutes sees the old list (same root cause as the balance). Silent
failure on a money screen is a trust problem.
Suggested fix: render an error card with "Tentar de novo" when `history.isError`; add `RefreshControl` wired to
`history.refetch()` (and `refreshSession`), and `refetchOnMount: 'always'` for this query.
Confidence: high

### [P2] Apple Pay entitlement is generated although Apple Pay is unused
File: `app.json:29-34`; `node_modules/@stripe/stripe-react-native/lib/commonjs/plugin/withStripe.js` (`setApplePayEntitlement`)
Evidence:
```json
["@stripe/stripe-react-native", { "merchantIdentifier": "merchant.com.anonymous.proxyapp" }]
```
Plugin: `entitlements['com.apple.developer.in-app-payments'] = [merchantIdentifier]`.
Why it matters: the entitlement forces the "Apple Pay" capability and a Merchant ID `merchant.com.anonymous.proxyapp`
on the provisioning profile; if that Merchant ID is not registered in the developer account the archive fails to
sign (EAS can register it, but under the wrong domain), and App Review sees an Apple Pay capability with no Apple Pay
UI. No code passes `merchantIdentifier` to `StripeProvider`, so even the SDK side is unused.
Suggested fix: drop the `merchantIdentifier` option (plugin entry can stay as `"@stripe/stripe-react-native"`) until
Apple Pay is a feature; if kept, align it with the final bundle id.
Confidence: high

### [P2] Over-declared iOS/Android permissions: "Always" location string and microphone/RECORD_AUDIO
File: `app.json:36-49`; `node_modules/expo-location/plugin/build/withLocation.js:116-118`; `node_modules/expo-image-picker/plugin/build/withImagePicker.js:52,58-59`; `src/feature/tasks/hooks/useDeviceLocation.ts:31`
Evidence:
```json
["expo-location", { "locationAlwaysAndWhenInUsePermission": "Usamos sua localização ...",
                    "locationWhenInUsePermission": "Usamos sua localização ..." }],
["expo-image-picker", { "photosPermission": "...", "cameraPermission": "..." }]
```
App code: only `requestForegroundPermissionsAsync` / `getCurrentPositionAsync`; image picker uses
`mediaTypes: ['images']`.
Why it matters: `NSLocationAlwaysAndWhenInUseUsageDescription` is written to Info.plist although no background
mode is requested; reviewers routinely ask why an "Always" string exists (5.1.1 "request only what you need"). The
image-picker plugin, lacking `microphonePermission: false`, injects an **English** default
(`Allow $(PRODUCT_NAME) to access your microphone`) into a pt-BR app plus `android.permission.RECORD_AUDIO`, which must
then be justified in Play's Data safety / permissions declaration.
Suggested fix: remove `locationAlwaysAndWhenInUsePermission`; add `"microphonePermission": false` to the
image-picker plugin options. (No `NSPhotoLibraryAddUsageDescription` is needed — the app never writes to the library.)
Confidence: high

### [P2] Replacing a card leaves the previous PaymentMethod attached to the Stripe customer (backend, cross-slice)
File: `proxy-api/src/modules/cards/use-cases/create-user-payment-method.service.ts:56-79`
Evidence:
```ts
const paymentMethodAttachment = await this.stripeService.attachPaymentMethodToCustomer(stripeCardId, stripeCustomerId)
...
return await this.cardsRepository.updateUserSource({ last4, brand, stripeCardId, id: existingCard.id })
```
No `detachPaymentMethod(existingCard.stripeCardId)` on the replace path (only `delete-user-card.service.ts:30` detaches).
Why it matters: the app's "Substituir cartão" UX promises "O cartão atual será removido" (`cards.tsx:30-31`); on
Stripe the old card stays usable on the customer indefinitely, which is a PCI-hygiene and support-confusion issue
(Stripe dashboard shows N cards for a "single-card" user).
Suggested fix: on the update branch, `detachPaymentMethod(existingCard.stripeCardId)` after a successful attach of
the new one (best-effort, log on failure).
Confidence: high

### [P2] `cards` route has no role gate
File: `app/(app)/cards.tsx:20-24`; `app/(app)/(tabs)/_layout.tsx:59-66`
Evidence:
```tsx
export default function Cards() {
  const { data: card, isPending } = useCardQuery()
  const deleteCard = useDeleteCardMutation()
```
Why it matters: the only gate is the Profile row's `isClient` check; `proxyapp://cards` (or any future `router.push`)
lets a PROXY add a card — the backend accepts it because every account gets a Stripe customer at signup
(`create-account.service.ts:40-47`). Low impact today, but it contradicts SPEC §8.12 "Acessa: CLIENT" and the
`wallet` tab's own `href: null` pattern.
Suggested fix: in `cards.tsx`, `if (session?.userType !== 'CLIENT') return <Redirect href="/home" />`.
Confidence: high

### [P2] Replace flow: "Substituir cartão?" confirms before the sheet, but a failed save still keeps the old card — copy promises removal first
File: `app/(app)/cards.tsx:26-42`; `src/feature/cards/components/AddCardSheet.tsx:109-112`
Evidence:
```ts
modal.confirm({ title: 'Substituir cartão?', message: 'O cartão atual será removido e o novo cartão ficará no lugar.', ...
  onOk: () => { setTimeout(() => setSheetOpen(true), 340) } })
```
Why it matters: behaviour is actually the *safe* one (backend updates in place, nothing is removed until the new PM
is attached), so this is a copy/expectation mismatch rather than a bug: the modal reads as a destructive action yet
is followed by a form. Users may cancel at the sheet thinking they already lost the card.
Suggested fix: reword to "Você vai cadastrar um novo cartão no lugar do atual." and make the sheet title
"Substituir cartão" when `card` exists; or drop the pre-modal entirely.
Confidence: medium (UX judgement)

### [P3] `expo-doctor` fails on `newArchEnabled`; 8 Expo packages are patch-behind
File: `app.json:10`; `package.json:20-32`
Evidence (`CI=1 npx expo-doctor`):
```
✖ Check Expo config (app.json/ app.config.js) schema
 Field: newArchEnabled - Additional property "newArchEnabled" is not allowed.
✖ Check that packages match versions required by installed Expo SDK
expo ~57.0.32 (found 57.0.24), expo-build-properties ~57.0.23 (57.0.21), expo-constants ~57.0.23 (57.0.19),
expo-image-picker ~57.0.21 (57.0.19), expo-linking ~57.0.13 (57.0.10), expo-location ~57.0.23 (57.0.19),
expo-router ~57.0.30 (57.0.22), expo-splash-screen ~57.0.11 (57.0.9)
```
`CI=1 npx expo install --check` printed the same 8 lines and did not modify `package.json` (diffed).
Why it matters: not a runtime problem (RN 0.86 is New-Arch-only, so the flag is a no-op), but EAS Build runs
`expo-doctor` and the failures will show up on every build; patch updates in the SDK line include native fixes.
Suggested fix: delete `newArchEnabled`; run `npx expo install --fix` once and re-lock.
Confidence: high

### [P3] Dead / bypassed hooks and a mistyped DELETE response
File: `src/apis/wallet/wallet-hooks.ts:18-20`; `app/(app)/(tabs)/wallet.tsx:24-39`; `src/apis/cards/cards-apis.ts:10-11`
Evidence:
```ts
export function useMerchantDashboardMutation() { return useMutation({ mutationFn: walletApis.merchantDashboard }) }
```
```ts
delete: (id: string) => api.delete<{ message: string }>(`/card/${id}`).then((r) => r.data),
```
Backend `delete-user-card.controller.ts:21` is `@HttpCode(204)` with no body.
Why it matters: `useMerchantDashboardMutation` has zero call sites (wallet re-implements its pending state with
`useState`), violating the project's "hooks in `apis/`" convention; the DELETE type lies about a body nobody reads.
Suggested fix: use the hook in `wallet.tsx` (or delete it); type the delete as `Promise<void>`.
Confidence: high

### [P3] SPEC copy not implemented on cards (toasts), Stripe SDK error text may be English
File: `app/(app)/cards.tsx:134`; `src/feature/cards/components/AddCardSheet.tsx:105-107`
Evidence:
```tsx
onSuccess={() => setSheetOpen(false)}
```
```ts
setSheetError(error?.message ?? 'Cartão inválido. Confira os dados.')
```
Why it matters: SPEC §8.12 asks for "Cartão adicionado!" / "Cartão removido."; `error.message` from
`createPaymentMethod` is Stripe's SDK-localised text (device locale), so a pt-BR UI can show English on an en-US device.
Suggested fix: `toast.success('Cartão adicionado!')` in `onSuccess`, `toast.success('Cartão removido.')` after delete;
map `error.code` to local copy and fall back to the SPEC string.
Confidence: high

### [P3] Docs drift: CLAUDE.md / README say SDK 54, README palette and links are stale, Stripe env var undocumented
File: `CLAUDE.md` ("Expo SDK 54 (React Native 0.81, React 19)"); `README.md:3,7,37-39,72`
Evidence:
```
- [Expo](https://expo.dev) SDK 54 · React Native 0.81 · React 19
...
| `EXPO_PUBLIC_API_URL` | URL base da API proxy-api | `http://192.168.2.93:3333` |
...
paleta principal em verde-escuro com acento lima
```
`README.md:3` links the backend to `https://github.com/` (placeholder).
Why it matters: onboarding another developer (or App Review's "support URL" reviewer) from these docs fails on the
first step; the missing `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` row is the one that produces a silently-dead `CardField`.
Suggested fix: update SDK line (57 / RN 0.86 / React 19.2 / Expo Router 57), add the Stripe key row, fix palette
text and the repo link.
Confidence: high

### [P3] Missing `ITSAppUsesNonExemptEncryption` and no EAS Update / runtime policy
File: `app.json` (no `ios.infoPlist`, no `updates`, no `runtimeVersion`)
Evidence: `node -e` dump → `ios.infoPlist: undefined`, `updates: undefined`, `runtimeVersion: undefined`.
Why it matters: every TestFlight/App Store upload will stop at the export-compliance question until
`ITSAppUsesNonExemptEncryption=false` is declared (the app only uses HTTPS). Not configuring `updates` is fine for
1.0 but should be a conscious choice (OTA off).
Suggested fix: `"ios": { "infoPlist": { "ITSAppUsesNonExemptEncryption": false } }`; decide OTA now (if on, add
`runtimeVersion: { policy: "appVersion" }`).
Confidence: high

### [P3] `CardField` inside a React Native `Modal` on Android (needs device confirmation)
File: `src/feature/cards/components/AddCardSheet.tsx:121-127,227-249`
Evidence:
```tsx
<Modal visible transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
  ...
  <CardField key={cardFieldKey} postalCodeEnabled={false} ... />
```
Why it matters: `@stripe/stripe-react-native` has a long-running class of Android issues where `CardField` hosted in
an RN `Modal` does not receive focus / the keyboard does not open, or `onCardChange` never reports `complete`. Nothing
in this repo shows an Android run of this sheet. If it reproduces, CLIENTs on Android can never save a card.
Suggested fix: test on a physical Android device before release; if it fails, render the sheet outside `Modal`
(absolute overlay in the screen tree) or use `useStripe().initPaymentSheet` for setup.
Confidence: low (would be confirmed by one Android device run)

---

## 4. Gaps vs MVP (SPEC)

| SPEC | Status |
| --- | --- |
| §5.1 / §8.12 — cards as a tab `(tabs)/cards.tsx`, hidden for PROXY | Implemented as a stack route reached from Profile; no PROXY gate on the route (P2). Functionally acceptable, but SPEC should be updated or route gated. |
| §8.12 — `CardField` tokenisation via `createPaymentMethod`, `POST /card/create { token }` | Implemented and contract-correct. |
| §8.12 — "Substituir cartão?" modal when a card exists | Implemented (`cards.tsx:26-42`). |
| §8.12 — toasts "Cartão adicionado!" / "Cartão removido." | Missing (P3). |
| §8.12 — "Remover cartão?" alert with Cancelar / Remover | Implemented (`cards.tsx:44-61`). |
| §8.11 — balance card, merchant badge / CTA, Stripe dashboard link, earnings list | All present. |
| §8.11 — "Extrato" label | Not present (only "Ganhos recentes"); cosmetic. |
| §8.11 — "atualizar localmente após validação de tarefas ou após refresh do token" | Not implemented: no refresh path besides onboarding (P1). |
| §7.3 step 2 — `requires_action` + `confirmPayment` in the app | Not implemented anywhere in the app; cards are attached without SetupIntent (P1, shared with tasks slice). |
| §8.14 — Editar perfil, Documentos, Segurança, Termos e Privacidade, Excluir conta | Only "Editar dados" stub + "Cartão" + "Sair da conta". Delete account and Terms/Privacy missing (P0 for store). |
| §9.1 item 4 / §9.3 — push notifications (future) | Correctly absent; nothing half-wired. |
| Release readiness (implicit) | No final identity, icons, build profiles, privacy URL, tablet decision (P0/P1 above). |

---

## 5. Test coverage

### proxy-app
There are **no tests at all** in the app (`find . -name "*.test.*" -o -name "*.spec.*" -o -name __tests__` outside
`node_modules` → empty). Nothing in this slice — 404→null translation, replace/delete flows, onboarding result
handling, the success-toast branch, `brandDisplay`, `EarningsList` date/amount rendering — is covered.

### proxy-api (unit, names read; not re-run — brief says 37 suites / 153 pass)
- Cards: `create-user-payment-method.service.spec.ts` (10 cases: token/savedCard branches, creationFailed paths,
  create vs update), `delete-user-card.service.spec.ts` (3), `fetch-user-card.service.spec.ts` (3). **Not asserted:**
  that the old PM is detached on replace (it isn't — P2); that `token` must look like `pm_…` (any string reaches
  Stripe).
- Merchant: `create-merchant-account.service.spec.ts` (6, incl. callback URL by `NODE_ENV`),
  `create-merchant-dashboard-link.service.spec.ts` (4), `handle-account-updated.service.spec.ts` (2: both flags /
  either flag off). **Not asserted:** that `return_url` and `refresh_url` differ (they are identical by design).
- History: `fetch-transaction-history.service.spec.ts` (4) asserts the fee formula and 2-decimal rounding — it
  pins the *duplicated* formula rather than `tasks.proxyEarnings`, so a future fee change in `validate-task` will not
  be caught here.
- Refresh: `refresh-session.service.spec.ts` (2) asserts `stripeAccountReady` is in the new JWT.
- e2e (Testcontainers, not run): `test/cards/{create,delete,fetch}-card.e2e-spec.ts`,
  `test/auth/{create-merchant-account,merchant-dashboard,transaction-history}.e2e-spec.ts` exist. No e2e for
  `/auth/session/refresh`.

---

## 6. Questions for the owner

1. **Store identity**: final app name ("Proxy"?), bundle id / package, and whether iPad is in scope for 1.0
   (`supportsTablet`). These must be decided before the first EAS build; the ids are permanent.
2. **Hosting for static pages**: where will `stripe-redirect/index.html`, the privacy policy, terms and support page
   live (needed for `PROD_CALLBACK_URL`, App Store Connect and Play Console)? Same origin for all four is simplest.
3. **3DS policy**: accept the current "first charge is merchant-initiated without prior SetupIntent" model and treat
   `requires_action` as a decline, or move card saving to a SetupIntent now (changes both apps and the API)?
4. **Balance source of truth**: keep deriving `walletBalance` from the JWT with periodic `session/refresh`, or add a
   lightweight `GET /auth/me` so the Wallet can be a normal query with pull-to-refresh?
5. **Merchant "pending" state**: should the UI distinguish "onboarding started, awaiting Stripe" (account exists,
   `stripeAccountReady=false`) from "never started"? Today both show the same CTA.
6. **Apple Pay**: intended for a later release (keep the merchant id, properly registered) or remove the option now?
7. **App Review login**: which demo CLIENT and PROXY accounts (with a ready Stripe test account and a saved
   `4242` card) will be provided in the review notes? Sign in with Apple is **not** required because the app offers
   only email/password (no third-party social login), so no action there.
