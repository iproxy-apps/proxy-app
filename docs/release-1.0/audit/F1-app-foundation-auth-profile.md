# F1 — Mobile app: foundation, routing, session, auth screens, profile, shared UI

Audit date: 2026-11-08. Auditor: F1 (first pass). Read-only; no source edited.

All paths below are relative to `/Users/leandromartins/Documents/proxy-app/` unless prefixed with `proxy-api/`
(= `/Users/leandromartins/Documents/proxy-api/`).

---

## 1. Scope

Every file below was opened in full and read line by line.

| File | Lines |
| --- | ---: |
| `app/_layout.tsx` | 28 |
| `app/index.tsx` | 172 |
| `app/(auth)/_layout.tsx` | 19 |
| `app/(auth)/choose-profile.tsx` | 188 |
| `app/(auth)/sign-in.tsx` | 221 |
| `app/(auth)/sign-up.tsx` | 388 |
| `app/(auth)/forgot-password.tsx` | 525 |
| `app/(app)/_layout.tsx` | 25 |
| `app/(app)/(tabs)/_layout.tsx` | 83 |
| `app/(app)/(tabs)/profile.tsx` | 114 |
| `src/apis/api-client.ts` | 67 |
| `src/apis/apis.ts` | 20 |
| `src/apis/query-client.ts` | 34 |
| `src/apis/query-keys.ts` | 13 |
| `src/apis/auth/auth-api-types.ts` | 88 |
| `src/apis/auth/auth-apis.ts` | 29 |
| `src/apis/auth/auth-hooks.ts` | 61 |
| `src/store/auth-store/auth-store.ts` + `index.ts` | 44 + 1 |
| `src/store/modal-store/modal-store.ts` + `index.ts` | 62 + 1 |
| `src/store/toast-store/toast-store.ts` + `index.ts` | 28 + 1 |
| `src/lib/modal.ts` | 33 |
| `src/lib/toast.ts` | 18 |
| `src/lib/secure-store.ts` | 15 |
| `src/shared/providers/SessionProvider.tsx` | 37 |
| `src/shared/components/Button.tsx` | 91 |
| `src/shared/components/ScreenHeader.tsx` | 73 |
| `src/shared/components/AppModal.tsx` | 196 |
| `src/shared/components/Toast.tsx` | 163 |
| `src/shared/components/Avatar.tsx` | 48 |
| `src/shared/components/Logo.tsx` | 44 |
| `src/shared/components/TabPlaceholder.tsx` | 105 |
| `src/shared/components/form/FormInput.tsx` | 126 |
| `src/shared/components/form/FormCheckbox.tsx` | 89 |
| `src/shared/components/form/FormToggle.tsx` | 89 |
| `src/shared/components/form/OtpInput.tsx` | 148 |
| `src/shared/components/form/RatingInput.tsx` | 48 |
| `src/common/theme/colors.ts` | 55 |
| `src/common/utils/masks.ts` | 83 |
| `src/common/utils/format.ts` | 34 |
| `src/common/utils/haversine.ts` | 30 |
| `src/common/utils/initials.ts` | 11 |
| `src/feature/auth/hooks/useProxyAuth.ts` | 33 |
| `src/feature/profile/components/MenuList.tsx` | 86 |
| `src/feature/profile/components/IdentityCard.tsx` | 91 |
| `global.css` | 3 |
| `tailwind.config.js` | 76 |
| `babel.config.js` | 20 |
| `metro.config.js` | 6 |
| `tsconfig.json` | 15 |
| `eslint.config.js` | 9 |
| `nativewind-env.d.ts` | 3 |
| `.npmrc` | 1 |
| `app.json` (not in the list but required to audit scheme/bundle id/plugins) | 74 |
| `package.json` | 59 |

Cross-checked (read in part, only what was needed to verify claims about this slice):
`src/apis/cards/cards-hooks.ts` (46), `app/(app)/(tabs)/history.tsx` (14), `src/feature/home/components/ClientHome.tsx:50-70`,
`app/(app)/(tabs)/wallet.tsx:15-40`, `.env`, `.env.example`, `.prettierrc`, `git diff CLAUDE.md`;
backend: `proxy-api/src/modules/auth/controllers/*.ts` (all 11), `proxy-api/src/modules/auth/utils/jwt.strategy.ts`,
`proxy-api/src/modules/auth/auth.module.ts:36-70`, `proxy-api/src/modules/auth/use-cases/{authenticate,refresh-session}.service.ts`,
`proxy-api/src/modules/auth/types` (FindUserByEmailResult), `proxy-api/src/exception/{http.exception,app.exception,error-dictionary}.ts`,
`proxy-api/src/pipes/zod-validation.pipe.ts`, `proxy-api/prisma/schema.prisma` (model Users), `proxy-api/src/app.module.ts` (throttler).

Nothing in the slice was skipped. `npx tsc --noEmit` / `npx eslint .` were not re-run (brief: already clean).

---

## 2. How it works (as the code actually behaves)

### Boot and session hydration

`app/_layout.tsx` wraps the Expo Router `Stack` in `QueryClientProvider → SafeAreaProvider → SessionProvider`, and mounts the
singleton `AppModal` and `Toast` next to the stack. There is **no `expo-splash-screen` `preventAutoHideAsync`** anywhere, so the
native splash is hidden on first render while the auth store is still unhydrated.

`SessionProvider` (`src/shared/providers/SessionProvider.tsx:20-34`) runs one effect: `getToken().then(token => hydrate(token))`
and registers the global 401 handler `() => void clearSession()`. The promise has **no `.catch`**; if SecureStore throws,
`hydrated` stays `false` forever and every route renders `null` (see P1 finding).

`useAuthStore` (`src/store/auth-store/auth-store.ts`) holds `{ token, session, hydrated }`. `session` is `jwtDecode(token)` with no
signature or `exp` check (`decodeOrNull`). `isAuthenticated` in `useProxyAuth` is `!!token` (`src/feature/auth/hooks/useProxyAuth.ts:30`),
**not** `!!session`, so an undecodable token still counts as logged in.

### Route guards

Three independent guards, all pattern `useEffect → router.replace` + `return null`:
- `app/index.tsx:24-31` — if hydrated and authenticated → `replace('/home')`, else render the Splash.
- `app/(auth)/_layout.tsx:9-16` — same redirect to `/home`.
- `app/(app)/_layout.tsx:12-18` — if hydrated and **not** authenticated → `replace('/')`; wraps the app stack in
  `StripeProvider publishableKey={EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? ''}` and sets `gestureEnabled: false` for every app screen.

Because the native stack keeps `index` mounted underneath `(auth)`, a successful sign-in fires **both** `index.tsx` and
`(auth)/_layout.tsx` effects, i.e. two `router.replace('/home')` calls in the same commit. Harmless in practice (same target), noted as P3.

SPEC §5.2 says the guard should redirect to `/(auth)/sign-in`; code redirects to `/` (Splash). SPEC §5.1 lists `+not-found.tsx`;
it does not exist. SPEC §5.1 puts `cards.tsx`/`wallet.tsx` inside `(tabs)`; actual: `wallet` is a tab, `cards.tsx` lives at
`app/(app)/cards.tsx` (pushed from Profile). Tab `home.tsx` replaces the spec's `index.tsx`.

### HTTP client, errors, 401, 429

`src/apis/api-client.ts`: axios instance, `timeout: 15000`, request interceptor reads the token **from SecureStore on every request**
(`getToken()` at line 25, not from the store). Response interceptor: on any 401 → `clearToken()` then `onUnauthorized?.()` →
`clearSession()` → `(app)/_layout` redirects to `/`. The React Query cache is **not** cleared on this path (only `signOut()` calls
`queryClient.clear()`), so a second account logging in on the same device within `gcTime` (15 min) can be served the previous
user's cached `card` / `tasks` data (P2).

`extractErrorMessage` returns `response.data.message` verbatim. Two backend paths produce **English** messages that reach the user:
Zod failures (`proxy-api/src/pipes/zod-validation.pipe.ts:14` → `message: 'Validation failed'`) and the throttler
(`ThrottlerGuard` default `"ThrottlerException: Too Many Requests"`; no `errorMessage` override in `proxy-api/src/app.module.ts`).
The app has no 429-specific UX; `query-client.ts` only retries 429 for *queries*, mutations never retry.

### JWT contents and freshness

Backend signs with RS256 and **no `expiresIn`** (`proxy-api/src/modules/auth/auth.module.ts:48` — `signOptions: { algorithm: 'RS256' }`
only), so tokens never expire; the only server-side invalidation is `isDeleted` (`jwt.strategy.ts:52-56`). Consequently the app has
no expiry handling at all, and "reopened days later" simply works with the old token. `walletBalance`, `rating`,
`totalTasks*`, `stripeAccountReady` are baked into the token at sign-in; the only re-issue path is `GET /auth/session/refresh`
(exists: `refresh-session.controller.ts:9`), called **only** from `src/feature/wallet/hooks/useStripeOnboarding.ts:47` after the
Stripe onboarding return. Nothing refreshes after task completion/validation, on app foreground, or on a timer.

The backend puts raw Prisma `Decimal` values into the payload (`authenticate.service.ts` lines 40-57, `rating: user.rating`,
`walletBalance: user.walletBalance`, where `FindUserByEmailResult.rating: Decimal`). `jsonwebtoken` JSON-stringifies the payload,
and decimal.js `toJSON()` returns a **string**. The backend itself knows this — `jwt.strategy.ts:22-25` uses `z.coerce.number()`.
The app type `TSessionPayload.rating: number` / `walletBalance: number` (`auth-api-types.ts:26,28`) is therefore wrong: after
`jwtDecode` these fields are strings (e.g. `"4.5"`, `"120.5"`).

### Auth screens

- **Splash** (`app/index.tsx`): copy matches SPEC §8.1 except the badge emoji (icon instead). The footer "Ao continuar você aceita
  nossos Termos e Política de Privacidade." is plain text, not a link.
- **Choose profile**: matches §8.2; passes `userType` as a route param; sub-copy promises "Você pode trocar de perfil depois, dentro
  do app", which §8.14 explicitly says is not in the MVP.
- **Sign-up** (`app/(auth)/sign-up.tsx`): react-hook-form `mode: 'all'`; rules: name ≥ 2, email regex, phone ≥ 10 digits
  (`maskPhone`), password ≥ 8, CPF 11 / CNPJ 14 digits (`maskDocument`), terms `required`. The payload sent (`lines 83-91`) is
  `{ name, email, phoneNumber (digits), password, userType, documentType, termsAccepted: true }`. **The document number is never
  sent** (and the backend `Users` model has no column for it). **No `documentUrl` is sent**; the "Foto do documento" box is a
  boolean toggle (`onPress={() => setPhotoUploaded((v) => !v)}`, line 270) that shows "Documento enviado" without any picker or upload.
  Errors go to `modal.error`, not toast (SPEC §2.8 says toast). No success toast.
- **Sign-in**: email regex + required password; `modal.error(extractErrorMessage(e))`; no success toast; "Criar conta" uses
  `router.replace` to choose-profile.
- **Forgot password**: 3 local steps in one route; header back steps backwards (`handleBack`), Android hardware back is not
  intercepted (`BackHandler` unused anywhere) so it leaves the flow. Resend has no cooldown. Step 3 success → `modal.show` success
  → `router.dismissTo('/(auth)/sign-in')` (exists in expo-router 57). UI min password 8 while backend reset min is 6 and backend
  **create has no minimum at all** (`create-account.controller.ts:11` `password: z.string()`).

### Profile (`app/(app)/(tabs)/profile.tsx`)

Renders `IdentityCard` (avatar initials + name + email + role chip), a "Conta" card with "Editar dados" → `modal.info('Em breve…')`
and, for CLIENT, "Cartão" → `/cards`, then "Sair da conta" via `modal.confirm({ onOk: signOut })`. **Not implemented**: edit
profile, delete account (`DELETE /auth/account` exists on the backend), Terms/Privacy links, stats grid, phone, "Verificado"/"Pendente"
badge, version footer. Sign-out works: `clearSession()` → `(app)/_layout` → `replace('/')`.

### Shared primitives

- `Button`: `disabled || loading` → Pressable disabled + `opacity-60`; spinner is always `white` (invisible on `outline`/`ghost`);
  ref is accepted and discarded; no `accessibilityState`. No haptics (SPEC §2.7/§6).
- `AppModal`: single global instance (no stacking/queue). `onOk` may return a Promise → spinner on OK → `finally { hide() }`;
  exceptions from `onOk` are not caught. Backdrop tap and Android back call `hide` directly, bypassing `onCancel` and the
  `okLoading` guard.
- `Toast`: single instance, 3.5 s auto-hide, bottom-anchored; offset = `TAB_BAR_HEIGHT + insets.bottom + 8` inside tabs.
- `ScreenHeader`: `router.back()` unconditionally when no `onBack`; no `canGoBack()` check.
- `FormInput`: shows error only when `isTouched`; `format` prop applies masks; no `textContentType`/`autoComplete` on email/password.
- `OtpInput`: 6 boxes, paste distributes digits, iOS `oneTimeCode` autofill lands in box 0 and is distributed by the paste branch.
- `TabPlaceholder` is still live: `app/(app)/(tabs)/history.tsx` renders it ("Em construção").

### Config

`babel.config.js` and `tsconfig.json` both map `@ → ./src` (consistent). NativeWind: `global.css` imported in root layout, metro
`withNativeWind`, babel preset `jsxImportSource: 'nativewind'`. `tailwind.config.js` `content` covers `./src/**` but **not
`./app/**`** (and lists non-existent `./App.*` and `./components/**`); today no route file uses `className`, so it is latent.
`app.json`: `scheme: proxyapp`, `userInterfaceStyle: light` (dark-mode safe), `typedRoutes: true` (but `.expo/types` and
`expo-env.d.ts` are absent in the checkout, so typed routes are not enforced by `tsc` in a clean clone), bundle/package
`com.anonymous.proxyapp`, merchant id `merchant.com.anonymous.proxyapp`, display `name: "proxy-app"`, `newArchEnabled` (flagged by
expo-doctor), splash background `#ffffff` vs dark Splash screen.

### Code vs docs disagreements (summary)

- `CLAUDE.md`: says Expo 54 / RN 0.81 / React 19 — actual 57 / 0.86 / 19.2 / TS 6. Working tree deletes the `graphify` section
  (uncommitted). Says `colors.ts` is the ONE source of color truth — `tailwind.config.js` duplicates every token.
- `SPEC.md` §3.1 "401 → redirect `/login`", §5.2 redirect to `/(auth)/sign-in` — code goes to `/`. §5.1 `+not-found.tsx` missing.
  §6 paths `src/components/`, §2.6 `src/lib/format.ts`, §4 `src/types/` — all live elsewhere. §8.3 photo upload "required (Proxy)"
  — not implemented. §8.14 — most of the screen not implemented. §8.5 step-3 validation "≥ 6" — app uses 8. §2.8 "toast de erro"
  — auth screens use blocking modals. §2.7 haptics — `expo-haptics` not installed.

---

## 3. Findings

### [P0] No in-app account deletion (Apple 5.1.1(v) / Google Play account-deletion requirement)
File: `app/(app)/(tabs)/profile.tsx:81-102` (Conta card), `src/apis/auth/auth-apis.ts:11-29` (no `deleteAccount` route)
Evidence:
```tsx
<MenuRow label="Editar dados" onPress={openEditAccount} />
{isClient ? ( ... <MenuRow label="Cartão" ... /> ) : null}
```
and `authApis` exposes only `create, session, refreshSession, forgotPassword, verifyResetCode, resetPassword`.
Why it matters: The app lets users create accounts, so both stores require an in-app path to delete the account. The backend already
has `DELETE /auth/account` (`proxy-api/src/modules/auth/controllers/delete-account.controller.ts:9-18`) with `USER_HAS_ACTIVE_TASKS`
handling, and SPEC §8.14 specifies the double-confirm flow. This is a release blocker for review, independent of code quality.
Suggested fix: add `authApis.deleteAccount = () => api.delete('/auth/account')`; in Profile add a destructive "Excluir conta" row →
`modal.confirm(destructive)` → second confirm → mutation; on 409 `USER_HAS_ACTIVE_TASKS` show the message and `router.push('/history')`;
on success `signOut()`.
Confidence: high

### [P1] Proxy document photo is a fake toggle; `documentUrl` never sent; CPF/CNPJ number never sent
File: `app/(auth)/sign-up.tsx:267-272`, `:83-91`, `:317-388`
Evidence:
```tsx
<PhotoUploader uploaded={photoUploaded} onPress={() => setPhotoUploaded((v) => !v)} />
...
await signUp.mutateAsync({ name, email, phoneNumber: unmask(data.phoneNumber), password, userType,
  documentType: data.documentType, termsAccepted: true })
```
`PhotoUploader` renders "Documento enviado — Toque pra trocar" after a single tap with no `expo-image-picker` call and no upload;
`data.document` (validated to 11/14 digits) is dropped. Backend accepts `documentUrl: z.url().optional()`
(`create-account.controller.ts:16`) and has **no column** for the document number (`prisma/schema.prisma` model `Users`).
Why it matters: SPEC §8.3 marks the photo as required for PROXY and the badge "Verificado" (§8.14) depends on `isVerified`, which can
never become true. The user is told their document was sent when nothing was. The CPF/CNPJ field is pure theatre and collects
sensitive data for nothing.
Suggested fix: implement a real picker (`expo-image-picker`) + upload endpoint (backend has `FILE_*` errors so an upload exists for
task photos — reuse it), send `documentUrl`; either add a `document` column on the backend or remove the field from the form.
Confidence: high

### [P1] JWT numeric claims are strings; `TSessionPayload` types them as `number` (latent crash in ClientHome)
File: `src/apis/auth/auth-api-types.ts:26,28`, `src/store/auth-store/auth-store.ts:20`; consumer `src/feature/home/components/ClientHome.tsx:63`
Evidence:
```ts
rating: number            // auth-api-types.ts:26
walletBalance: number     // auth-api-types.ts:28
return jwtDecode<TSessionPayload>(token)   // auth-store.ts:20 — no coercion
```
Backend: `proxy-api/.../authenticate.service.ts` signs `rating: user.rating, walletBalance: user.walletBalance` where both are Prisma
`Decimal` (`FindUserByEmailResult.rating: Decimal`); `jwt.sign` JSON-stringifies → `"4.5"`. The backend's own strategy coerces
(`jwt.strategy.ts:22-25` `z.coerce.number()`), the app does not. `ClientHome.tsx:63` does
`session.rating > 0 ? session.rating.toFixed(1)…` → `"4.5" > 0` is `true`, then `"4.5".toFixed` throws `TypeError`.
Why it matters: Type lie at the boundary; any arithmetic on `session.walletBalance` (e.g. `balance + x`) concatenates. Today only
proxies receive ratings so a CLIENT's rating is normally `"0"`, but `/auth/create` accepts a client-supplied `rating`
(`create-account.controller.ts:18`), and any future client rating would crash the Client home. `formatBRL` happens to accept strings,
which hides the problem on the Proxy side.
Suggested fix: in `decodeOrNull`, normalise: `{ ...p, rating: Number(p.rating), walletBalance: Number(p.walletBalance) }` (or a zod
schema with `z.coerce.number()` mirroring the backend); and/or have the backend `.toNumber()` before signing.
Confidence: high (string claims), medium (crash reachability)

### [P1] Session snapshot (`walletBalance`, `totalTasks*`, `rating`) is never refreshed except after Stripe onboarding
File: `src/apis/auth/auth-hooks.ts:54-61`, only caller `src/feature/wallet/hooks/useStripeOnboarding.ts:47`
Evidence:
```ts
export function useRefreshSessionMutation() { ... authApis.refreshSession() ... setSession(session) }
```
Consumers read money from the token: `app/(app)/(tabs)/wallet.tsx:21` `const balance = session?.walletBalance ?? 0`,
`src/feature/home/components/ProxyHome.tsx:290` `formatBRL(session.walletBalance ?? 0)`.
Why it matters: After a client validates a task and the transfer lands, the proxy's wallet screen keeps showing the balance from
the moment they last logged in (tokens never expire — see cross-slice note — so "last login" can be weeks ago). The headline
money number on the Wallet tab is wrong until the user signs out and back in. SPEC §3.1 ("usar claims para decidir UI sem chamar
API") assumed a refresh mechanism that does not exist.
Suggested fix: call `refreshSession` on `AppState` → `active`, on Wallet/Home focus (`useFocusEffect`), and after
`tasks.validate`/`tasks.finish` succeed; or stop reading money from the JWT and fetch it.
Confidence: high

### [P1] Terms of Use / Privacy Policy are not linked anywhere in the app
File: `app/(auth)/sign-up.tsx:278-287`, `app/index.tsx:156-166`, `app/(app)/(tabs)/profile.tsx` (no "Termos e Privacidade" row)
Evidence:
```tsx
Li e aceito os <Text style={{ fontWeight: '700' }}>Termos de Uso</Text> e a <Text style={{ fontWeight: '700' }}>Política de Privacidade</Text>.
```
No `Linking.openURL` / `WebBrowser` call exists outside `wallet.tsx` (grep `Linking|openBrowserAsync|Termos`).
Why it matters: Google Play's User Data policy requires the privacy policy to be linked **inside the app**; Apple requires it in
metadata and reviewers commonly reject consent checkboxes that reference documents the user cannot open. SPEC §8.14 lists a
"Termos e Privacidade" row. The checkbox asks the user to accept documents they cannot read.
Suggested fix: make the bold spans `Pressable` → `WebBrowser.openBrowserAsync(TERMS_URL / PRIVACY_URL)`; add the Profile row.
Confidence: high

### [P1] Cold start hangs on a blank screen if SecureStore read rejects
File: `src/shared/providers/SessionProvider.tsx:23-25`
Evidence:
```ts
getToken().then((token) => {
  if (!cancelled) hydrate(token)
})
```
Why it matters: `expo-secure-store` `getItemAsync` is known to throw (e.g. keychain item undecryptable after an iOS restore/migration,
or on some Android keystore failures). With no `.catch`, `hydrated` stays `false`, `app/index.tsx:31` returns `null`, and the user
sees an empty white screen with no recovery path except reinstalling.
Suggested fix: `getToken().catch(() => null).then((token) => { if (!cancelled) hydrate(token) })`; on catch also `clearToken()`.
Confidence: high (code path), medium (frequency)

### [P1] Store identity placeholders: `com.anonymous.proxyapp`, display name `proxy-app`
File: `app.json:3,13,21,32`
Evidence:
```json
"name": "proxy-app",
"bundleIdentifier": "com.anonymous.proxyapp",
"package": "com.anonymous.proxyapp",
"merchantIdentifier": "merchant.com.anonymous.proxyapp"
```
Why it matters: The home-screen label will read "proxy-app"; bundle id / package cannot be changed after the first store upload;
the Apple Pay merchant identifier must match a real merchant id in the Apple developer account or the Stripe plugin's Apple Pay
entitlement is invalid.
Suggested fix: set `name: "Proxy"`, a real reverse-DNS id (e.g. `br.com.proxy.app`) for iOS/Android, and a matching
`merchant.<id>` (or drop the Apple Pay config if not used).
Confidence: high

### [P2] `isAuthenticated` is `!!token`, not `!!session`: undecodable token = logged in with a blank Home
File: `src/feature/auth/hooks/useProxyAuth.ts:30`, `src/store/auth-store/auth-store.ts:17-24`
Evidence:
```ts
isAuthenticated: !!token,
...
function decodeOrNull(token) { ... try { return jwtDecode(token) } catch { return null } }
```
Why it matters: If the stored token is corrupted/truncated (or the backend later changes the token format), `session` is `null` but
the guards treat the user as authenticated; `app/(app)/(tabs)/home.tsx:8` then `return null` → blank Home; tabs layout treats
the user as CLIENT. No `exp` check either (moot today because the backend sets no `expiresIn`, but it will silently break the day it does).
Suggested fix: `isAuthenticated: !!session`; in `hydrate`, if `decodeOrNull` returns null (or `exp*1000 < Date.now()`), call
`clearToken()` and hydrate with `null`.
Confidence: high

### [P2] 401 path does not clear the React Query cache (cross-account data leak on shared device)
File: `src/shared/providers/SessionProvider.tsx:27-29`, `src/feature/auth/hooks/useProxyAuth.ts:21-24`, `src/apis/query-client.ts:24-25`
Evidence:
```ts
registerUnauthorizedHandler(() => { void clearSession() })   // no queryClient.clear()
...
staleTime: 5 * 60 * 1000, gcTime: 15 * 60 * 1000,
```
Why it matters: After a server-side 401 (e.g. account deleted elsewhere), the cache keeps `['card']`, `['tasks','active']`,
`['wallet','transactionHistory']`. A different user signing in within 15 min gets the previous user's card last4 / tasks until
refetch (`staleTime` 5 min means no refetch at all for 5 min). Only the explicit "Sair" path clears.
Suggested fix: in the unauthorized handler call `queryClient.clear()` (import from `@/apis/query-client`) or clear it in
`setSession` whenever `sub` changes.
Confidence: high

### [P2] English raw backend messages reach the user: Zod "Validation failed" and "ThrottlerException: Too Many Requests"
File: `src/apis/api-client.ts:54-66`; backend `proxy-api/src/pipes/zod-validation.pipe.ts:13-17`, `proxy-api/src/app.module.ts:20,28`
Evidence:
```ts
const fromBody = error.response?.data?.message
if (fromBody) return fromBody
```
Why it matters: `/auth/session` and `/auth/create` are throttled at 5/min; a user mistyping a password 5 times sees
"ThrottlerException: Too Many Requests" in a modal titled "Algo deu errado". The app's email regex
(`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) is looser than backend `z.email()` (e.g. one-letter TLD, consecutive dots) → "Validation failed".
SPEC §3.4 requires a Portuguese "aguarde" message on 429.
Suggested fix: in `extractErrorMessage`, branch on `status === 429` → "Muitas tentativas. Aguarde um minuto e tente novamente."
and on `status === 400 && message === 'Validation failed'` → "Dados inválidos. Revise os campos." before returning `fromBody`.
Confidence: high

### [P2] Hard-coded tab bar height ignores bottom safe-area (Android edge-to-edge) and is double-counted by Toast
File: `app/(app)/(tabs)/_layout.tsx:34-40`, `src/shared/components/Toast.tsx:21,89-91`
Evidence:
```ts
tabBarStyle: { ..., height: Platform.OS === 'ios' ? 84 : 64, paddingTop: 6 },
...
const bottomOffset = inTabs ? TAB_BAR_HEIGHT + insets.bottom + 8 : insets.bottom + 12
```
Why it matters: With an explicit `height`, `@react-navigation/bottom-tabs` uses it as the total and still applies
`paddingBottom: insets.bottom` inside it. SDK 57 forces edge-to-edge on Android, where 3-button navigation gives `insets.bottom`
≈ 48 → a 64 px bar has 16 px left for icon+label (overlap/clipping). On iPhone SE (no inset) 84 px is visibly too tall. The Toast
adds `insets.bottom` again on top of the 84 that already includes it → floats ~34 px above the bar on notch iPhones.
Suggested fix: drop the fixed `height`; let the library compute (or `height: 56 + insets.bottom` via `useSafeAreaInsets`), and
make Toast read the real height via `useBottomTabBarHeight` or a shared constant without re-adding the inset.
Confidence: medium (needs a device check; reasoning from library behaviour)

### [P2] `StripeProvider` silently falls back to an empty publishable key
File: `app/(app)/_layout.tsx:7,21`
Evidence:
```ts
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
...
<StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY ?? ''}>
```
Why it matters: A misconfigured build (the committed `.env.example` ships `pk_test_xxx`) boots fine and fails only at card
tokenization/3DS with an opaque Stripe error. The API URL has an equivalent `console.warn` guard; the Stripe key has none.
Suggested fix: mirror `api-client.ts:11-15`: warn (or throw in `__DEV__`) when the key is missing or still `pk_test_xxx`.
Confidence: high

### [P2] `gestureEnabled: false` on every authenticated screen
File: `app/(app)/_layout.tsx:22`
Evidence:
```tsx
<Stack screenOptions={{ headerShown: false, gestureEnabled: false }} />
```
Why it matters: iOS swipe-back is disabled app-wide (task detail, create task, cards, finish). Users must find the header back
button. If the intent was to protect only the tabs root from swiping back to Splash, this is too broad.
Suggested fix: remove the global flag; set `gestureEnabled: false` only on `(tabs)` via `<Stack.Screen name="(tabs)" options=...>`.
Confidence: high (behaviour), low (whether intentional)

### [P2] `AppModal.onOk` errors are unhandled; backdrop/back bypass `onCancel` and the loading guard
File: `src/shared/components/AppModal.tsx:63-84,94,97`
Evidence:
```ts
try { const result = onOk(); if (result instanceof Promise) { setOkLoading(true); await result } }
finally { setOkLoading(false); hide() }
...
onRequestClose={hide}
<Pressable onPress={hide} ...>   // backdrop
```
Why it matters: A rejected `onOk` (e.g. `signOut` failing on SecureStore, or a future delete-account mutation) closes the modal and
surfaces nothing — an unhandled rejection. Tapping the backdrop while `okLoading` dismisses the modal mid-operation and never
calls `onCancel`, unlike the Cancel button. Also, any `modal.error()` raised *during* a pending `onOk` is closed by the `finally { hide() }`.
Suggested fix: `catch (e) { modal.error(extractErrorMessage(e)) }` (after hide), route backdrop/`onRequestClose` through
`handleCancel`, and only `hide()` in `finally` if the store's current `show` call is still the one that opened this modal (compare a `showId`).
Confidence: high

### [P2] Keyboard "go" submits bypass the Button's disabled/loading guard (double submit)
File: `app/(auth)/sign-up.tsx:253,76`, `app/(auth)/sign-in.tsx:130`, `app/(auth)/forgot-password.tsx:249,481`
Evidence:
```tsx
onSubmitEditing={() => onSubmit()}
...
const onSubmit = form.handleSubmit(async (data) => { ... await signUp.mutateAsync(...) })
```
Why it matters: `Button` is disabled while `isPending`, but the return-key path is not. Two quick "go" presses fire two
`POST /auth/create`; the second returns `USER_EMAIL_EXISTS` and the error modal appears on top of a successful login/redirect.
On sign-in, each press burns one of the 5/min throttle slots.
Suggested fix: guard inside `onSubmit`: `if (signUp.isPending) return` (same for `signIn`, `forgotPassword`, `verifyCode`, `resetPassword`).
Confidence: high

### [P2] No `+not-found.tsx`; unknown deep links show Expo's default English "Unmatched Route" screen
File: `app/` (file absent; SPEC §5.1 lists it)
Evidence: `ls app | grep -i not-found` → empty.
Why it matters: `proxyapp://` is registered; any malformed or future link lands on a developer-looking screen. Also, an
unauthenticated deep link to `proxyapp://tasks/:id` is redirected to `/` by `(app)/_layout` and the destination is lost.
Suggested fix: add `app/+not-found.tsx` with PT copy and a "Voltar ao início" button; optionally stash the intended href before
redirecting to Splash and replay it after sign-in.
Confidence: high

### [P2] Copy promises profile switching that the MVP does not offer
File: `app/(auth)/choose-profile.tsx:71`
Evidence:
```tsx
Você pode trocar de perfil depois, dentro do app.
```
Why it matters: SPEC §8.14 edge case: "Trocar de `userType` manualmente não está no MVP". Users will pick PROXY to "try" and
discover they cannot switch; `userType` is a real DB column, not a mode.
Suggested fix: change to "Você pode criar outra conta depois com o outro perfil." or implement the switch.
Confidence: high

### [P3] Backend Zod/password-length drift: create has no minimum, reset min 6, app 8
File: `app/(auth)/sign-up.tsx:224-228`, `app/(auth)/forgot-password.tsx:465-469`; backend `create-account.controller.ts:11`, `reset-password.controller.ts:10`
Evidence: `password: z.string()` (create) vs `newPassword: z.string().min(6)` (reset) vs app `minLength: 8`.
Why it matters: The app is the only enforcement for sign-up; any other client (or Postman) can create 1-char passwords. SPEC §8.5
says "≥ 6" for step 3 while the UI says 8.
Suggested fix: backend `.min(8)` on both; update SPEC §8.5 to 8.
Confidence: high

### [P3] Auth flows use blocking modals and skip the SPEC success toasts
File: `app/(auth)/sign-in.tsx:51`, `app/(auth)/sign-up.tsx:93`, `app/(auth)/forgot-password.tsx:226,299,306,421`
Evidence: `modal.error(extractErrorMessage(e))` everywhere; no `toast.success('Tudo certo! Bem-vindo de volta.')` / `'Conta criada! Bem-vindo ao Proxy.'`.
Why it matters: SPEC §2.8/§8.3/§8.4 define toast feedback; `lib/toast.ts` docs say blocking modals are for errors needing
acknowledgement. Inconsistent with the rest of the app (wallet uses `toast.error`).
Suggested fix: decide one pattern; at minimum add the two success toasts after `setSession`.
Confidence: high

### [P3] Native splash hides before hydration → white flash, then dark Splash
File: `app/_layout.tsx` (no `SplashScreen.preventAutoHideAsync`), `app/index.tsx:31`, `app.json:54-59` (`backgroundColor: #ffffff`)
Evidence: `if (!hydrated || isAuthenticated) return null`
Why it matters: Every cold start shows: white native splash → blank frame (null) → dark gradient Splash or Home. Cosmetic but
on every launch.
Suggested fix: `SplashScreen.preventAutoHideAsync()` at module scope in `_layout.tsx`, `SplashScreen.hideAsync()` once `hydrated`;
set splash `backgroundColor` to `hsl(220,10%,8%)` equivalent `#121417`.
Confidence: high

### [P3] Duplicate redirect on sign-in (`index.tsx` and `(auth)/_layout.tsx` both `replace('/home')`)
File: `app/index.tsx:24-28`, `app/(auth)/_layout.tsx:9-13`
Evidence: identical effects; `index` stays mounted under `(auth)` in the native stack.
Why it matters: Two navigation actions per login; harmless today but a source of "navigate during render" warnings and
double-animations if either effect changes.
Suggested fix: keep the redirect in one place (`(auth)/_layout`) and let `index` only handle the hydrated-and-authenticated cold start.
Confidence: medium

### [P3] `ScreenHeader` back is unconditional `router.back()`
File: `src/shared/components/ScreenHeader.tsx:36`
Evidence: `onPress={() => (onBack ? onBack() : router.back())}`
Why it matters: On a cold-start deep link (`proxyapp://sign-in`) there is no history; the button does nothing (dev warning
"GO_BACK was not handled").
Suggested fix: `router.canGoBack() ? router.back() : router.replace('/')`.
Confidence: high

### [P3] Forgot-password: Android hardware back exits the flow; resend has no cooldown; success modal dismissible by backdrop
File: `app/(auth)/forgot-password.tsx:49-55,303-310,99-106`
Evidence: `handleBack` only wired to `ScreenHeader`; `BackHandler` unused anywhere in the repo; `onResend` has no timer; success
`modal.show` has no `cancelLabel` but backdrop tap `hide`s without navigating.
Why it matters: Android users lose their step; spamming resend hits the 100/min route limit and SES; dismissing the success modal
leaves the user on step 3 with a consumed code.
Suggested fix: `useEffect` with `BackHandler.addEventListener('hardwareBackPress', ...)` while `step > 1`; 30 s resend cooldown;
navigate to sign-in immediately and show a toast instead of a modal.
Confidence: high

### [P3] `Button`: white spinner on transparent variants, discarded ref, no `accessibilityState`, no haptics
File: `src/shared/components/Button.tsx:48-60,76-77`
Evidence: `forwardRef<unknown, Props>(... , _ref)` never forwards; `<ActivityIndicator color="white" />` regardless of variant.
Why it matters: `loading` on `outline`/`ghost` is invisible; screen readers are not told the button is disabled/busy; SPEC §2.7/§6
promise haptics.
Suggested fix: spinner colour by variant; `accessibilityState={{ disabled: isDisabled, busy: loading }}`; forward the ref or drop `forwardRef`.
Confidence: high

### [P3] Inputs lack autofill hints (`textContentType` / `autoComplete`)
File: `app/(auth)/sign-in.tsx:102-152`, `app/(auth)/sign-up.tsx:154-229`, `app/(auth)/forgot-password.tsx:435-507`
Evidence: email/password `FormInput`s set `keyboardType`/`secureTextEntry` only.
Why it matters: iOS password manager and Android autofill cannot offer/save credentials; iOS strong-password suggestion on sign-up is lost.
Suggested fix: `textContentType="emailAddress" autoComplete="email"`, `textContentType="password" autoComplete="password"`,
`textContentType="newPassword" autoComplete="new-password"` on sign-up/reset.
Confidence: high

### [P3] `tailwind.config.js` content globs omit `./app/**` and reference non-existent paths
File: `tailwind.config.js:3-7`
Evidence:
```js
content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
```
Why it matters: Today no route file uses `className` (verified by grep) so nothing breaks, but the first `className` in `app/`
will silently render unstyled.
Suggested fix: `content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}']`.
Confidence: high

### [P3] Typed routes not enforceable in a clean checkout; `expo-env.d.ts` missing
File: `tsconfig.json:9-15`, `app.json:70-72`
Evidence: `include` lists `.expo/types/**/*.ts` and `expo-env.d.ts`; neither exists (`ls` → "No such file").
Why it matters: `tsc --noEmit` passes without route typing until someone runs `expo start`/`expo customize`; a CI type-check gives
false confidence on `href` strings.
Suggested fix: run `npx expo customize tsconfig.json`/generate `expo-env.d.ts` and commit it; or add `expo-router typed-routes`
generation to the `type-check` script.
Confidence: medium

### [P3] `.npmrc legacy-peer-deps=true` hides peer-dependency conflicts
File: `.npmrc:1`
Why it matters: With React 19.2 / RN 0.86 / Reanimated 4.5 / NativeWind 4.2, peer mismatches are exactly what you want to see
before a store build; the flag suppresses them globally for this repo.
Suggested fix: remove the flag, run `npm i`, fix or pin what actually conflicts.
Confidence: medium

### [P3] Two sources of colour truth (`colors.ts` vs `tailwind.config.js`); raw HSL literals in screens
File: `src/common/theme/colors.ts` vs `tailwind.config.js:11-66`; `app/(auth)/choose-profile.tsx:40,109,151`, `app/(auth)/sign-up.tsx:126,336-339`, `src/shared/components/ScreenHeader.tsx:49`
Evidence: `backgroundColor: 'hsl(40, 20%, 97%)'` (choose-profile:40) duplicates `BG`; `color="hsl(220, 10%, 12%)"` (ScreenHeader:49) duplicates `GRAPHITE`.
Why it matters: CLAUDE.md "Color tokens: import from `@/common/theme/colors`. Never declare local… avoid raw hex values".
Suggested fix: replace literals with tokens; consider generating the tailwind palette from `colors.ts`.
Confidence: high

### [P3] Docs drift (CLAUDE.md / SPEC.md vs code)
File: `CLAUDE.md:7-9` (SDK 54/RN 0.81), `SPEC.md` §3.1, §5.1, §5.2, §6, §2.6, §4, §8.5; uncommitted deletion of the graphify section in `CLAUDE.md`.
Evidence: see "Code vs docs disagreements" above.
Why it matters: The second auditor and future contributors will be misled on redirect targets, file locations and SDK version.
Suggested fix: one pass updating version numbers, `src/shared/components`, redirect to `/`, remove `+not-found` or add it, commit the CLAUDE.md change.
Confidence: high

### [P3] Misc nits
- `app/(auth)/sign-in.tsx:22`, `sign-up.tsx:24`, `forgot-password.tsx:32`: `import { modal } from '../../src/lib/modal'` — relative path instead of `@/lib/modal` (CLAUDE.md alias rule).
- `app/(auth)/sign-up.tsx:90`: `termsAccepted: true` hard-coded instead of `data.termsAccepted` (equivalent given the rule, but misleading).
- `app/(auth)/sign-up.tsx:256-263`: `document` validation is not re-run when `documentType` toggles (a valid 11-digit CPF stays `isValid` after switching to CNPJ) — only matters if the field is ever sent.
- `src/common/utils/masks.ts`: no CPF/CNPJ check-digit validation (length only).
- `src/apis/api-client.ts:25`: SecureStore read on every request; prefer `useAuthStore.getState().token`.
- `src/shared/components/Avatar.tsx`: no `uri` support (SPEC §6 `uri?`); `session.avatarUrl` is never displayed.
- `src/shared/components/TabPlaceholder.tsx` is still mounted by `app/(app)/(tabs)/history.tsx` → the Histórico tab ships as "Em construção" (owned by another slice; flagged here because the component is in F1's scope).
- `src/common/utils/format.ts:33` `.replace('.', '')` yields "10 de nov, 14:32" while SPEC §2.6 shows "24 abr, 14:30".
- `src/shared/components/form/RatingInput.tsx` lives under `shared/components/form` but is task-domain UI.

---

## 4. Gaps vs MVP (SPEC references)

| SPEC | Promise | Status in this slice |
| --- | --- | --- |
| §8.14 Perfil | Edit profile → `POST /auth/update-profile`, new JWT | Not implemented; "Editar dados" → `modal.info('Em breve…')` (`profile.tsx:34-37`) |
| §8.14 | Delete account, double confirm, `USER_HAS_ACTIVE_TASKS` → history | Not implemented (P0) |
| §8.14 | Terms & Privacy row | Not implemented (P1) |
| §8.14 | Stats grid, phone, Documentos "Verificado/Pendente", Segurança, version footer | Not implemented |
| §8.3 | Proxy document photo upload (`expo-image-picker`), `documentUrl` | Fake toggle, nothing uploaded/sent (P1) |
| §8.3 | Document number (CPF/CNPJ) | Collected, validated, discarded; backend has no column |
| §8.3 / §8.4 | Success toasts | Missing |
| §3.4 | 429 → Portuguese "aguarde" toast | Raw English throttler text (P2) |
| §3.1 / §4.1 | JWT claims drive UI "sem round-trip" | No refresh strategy besides Stripe return (P1) |
| §5.1 | `+not-found.tsx` | Missing (P2) |
| §5.3 | Deep link `proxyapp://tasks/:id` | Scheme set; unauthenticated link loses destination |
| §2.7 | Haptics on primary actions (`expo-haptics`) | Not installed/used |
| §6 | `Avatar uri?`, `ScreenContainer`, `Skeleton` (shared) | Avatar has no image; others not in this slice's `shared/` |
| §8.1 | Footer Terms/Privacy | Plain text, not tappable |

---

## 5. Test coverage

There are **no tests in the app repo** (`find . -name '*.test.*' -o -name '*.spec.*'` outside `node_modules` → nothing; no Jest
config in `package.json`). Nothing in this slice — hydration, guards, 401 handler, `extractErrorMessage`, masks, `OtpInput` paste
logic, `initialsOf`, `formatBRL`, `maskBRL` — has unit coverage.

Backend tests touching this slice's contract (`proxy-api/src/modules/auth/use-cases/*.spec.ts`: authenticate, create-account,
refresh-session, forgot/verify/reset) assert service behaviour but, per the brief, `test/factories/user.factory.ts:64` lacks
`stripeAccountReady`, i.e. the factory is already behind the JWT schema the app depends on. No backend test asserts the **type** of
`rating`/`walletBalance` inside the signed token (they are `Decimal` → string), which is the gap behind the P1 above.

Highest-value tests to add (pure, no native deps): `decodeOrNull`/hydrate normalisation of string claims; `extractErrorMessage` for
429/400-Zod/timeout/offline; `maskPhone/maskCPF/maskCNPJ/unmask`; `OtpInput` `setDigitAt` paste distribution; a guard test with
mocked `useAuthStore` that an undecodable token is **not** authenticated.

---

## 6. Questions for the owner

1. **Document number (CPF/CNPJ)**: the form collects it but the backend has nowhere to store it. Add a `document` column (and
   uniqueness? KYC use?) or drop the field for 1.0?
2. **Proxy document photo**: is it truly required for 1.0 (SPEC §8.3) given there is no verification back-office to flip
   `isVerified`? If yes, which upload endpoint should be used (reuse the task-photo upload?).
3. **Terms / Privacy URLs**: do hosted documents exist? Needed for the sign-up links, Splash footer, Profile row and store listings.
4. **Session freshness**: accept refreshing the JWT on app foreground + after task finish/validate, or move balance/stats to a
   fetched endpoint and stop reading money from the token?
5. **`gestureEnabled: false` app-wide**: intentional (protect tabs root) or accidental? Affects iOS swipe-back everywhere.
6. **Profile switching copy** ("trocar de perfil depois"): keep the copy and implement, or change the copy?
7. **Cross-slice, for the backend auditor** (observed while verifying this slice, not re-derived): `POST /auth/create` accepts
   client-supplied `isVerified`, `rating`, `walletBalance`, `totalTasks*` (`create-account.controller.ts:17-22`) — mass-assignment of
   money/verification fields; JWTs have **no `expiresIn`** (`auth.module.ts:48`) so a leaked token is valid forever and password
   reset does not invalidate sessions; `create` password has no minimum length.
