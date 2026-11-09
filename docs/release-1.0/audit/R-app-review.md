# R-APP — Second-pass review of the mobile app findings (F1, F2, app-side F3, app-side X1)

Reviewer: R-APP. Date: 2026-11-08. Read-only on source; nothing edited in either repo.

Paths: `app:` = `/Users/leandromartins/Documents/proxy-app`, `api:` = `/Users/leandromartins/Documents/proxy-api`.
Every verdict below was re-derived by opening the cited file at the cited line; where the first pass reasoned
about serialization I re-ran the check (`node -e` in `proxy-api`, output quoted in §4).

Facts relied on (from the brief, not re-derived): app `tsc`/`eslint` clean; app has zero tests; prototype folder absent.

Totals: 89 first-pass rows graded (F1 31, F2 27, F3 20, X1 11; X1's app rows are mostly duplicates of F1/F2) —
**71 CONFIRMED, 5 PARTIAL, 1 REFUTED, 1 UNVERIFIABLE, 11 DEFERRED (REL/BE)**.
After dedupe: **30 canonical app findings** (1 P0, 11 P1, 12 P2, 6 P3), of which **2 are new standalone findings**
(APP-29, APP-30) and **6 further new items** are folded into existing IDs (marked NEW in APP-04, APP-17, APP-19,
APP-20, APP-23, APP-28).

---

## 1. Verdict table

Legend: `DEFERRED-TO-REL` = store/config owned by the release reviewer; `DEFERRED-TO-BE` = root cause is backend code
(A1/A2/A3 already have it); the app-side residue, if any, is noted. "Final" = my severity for the **app** register.

### F1 — foundation / auth / profile

| # | Orig | Title (short) | Verdict | Final | Note |
| --- | --- | --- | --- | --- | --- |
| F1-01 | P0 | No in-app account deletion | CONFIRMED | P0 | `grep deleteAccount\|/auth/account\|Excluir` over `app/ src/` → 0 hits; `authApis` has 6 routes, none is delete. → APP-01 |
| F1-02 | P1 | Document photo is a fake toggle; CPF/CNPJ + documentUrl never sent | CONFIRMED | P1 | `sign-up.tsx:270` `onPress={() => setPhotoUploaded((v) => !v)}`; payload `:83-91` has no `document`/`documentUrl`. → APP-06 |
| F1-03 | P1 | JWT numeric claims are strings; `ClientHome` `.toFixed` crash | PARTIAL | P2 | Strings confirmed (§4). Crash is **latent**: default rating is `"0"`, `"0" > 0` is `false` → `'—'`; a CLIENT is never rated by any in-app flow. Reachable only via `/auth/create` mass-assignment or `update-profile` `userType` flip (no app client). → APP-11 |
| F1-04 | P1 | Session snapshot never refreshed except after Stripe onboarding | CONFIRMED | P1 | `useRefreshSessionMutation` has one caller: `useStripeOnboarding.ts:47`. → APP-05 |
| F1-05 | P1 | Terms / Privacy not linked anywhere | CONFIRMED | P1 | `sign-up.tsx:281-284` plain `<Text>`; `index.tsx:165` plain text; grep `Linking\|openBrowserAsync` → only `wallet.tsx:33`. → APP-02 |
| F1-06 | P1 | Cold start hangs if SecureStore read rejects | CONFIRMED | P1 | `SessionProvider.tsx:23-25` `getToken().then(...)` no `.catch`; `index.tsx:31` returns `null` while `!hydrated`. Rare but unrecoverable. → APP-12 |
| F1-07 | P1 | Store identity placeholders | DEFERRED-TO-REL | — | Duplicate of F3-01. |
| F1-08 | P2 | `isAuthenticated: !!token` not `!!session` | CONFIRMED | P2 | `useProxyAuth.ts:30`; `home.tsx:8` returns `null` when session is null. → APP-13 |
| F1-09 | P2 | 401 path does not clear React Query cache | CONFIRMED | P2 | `SessionProvider.tsx:27-29` vs `useProxyAuth.ts:21-24` (only `signOut` clears). → APP-14 |
| F1-10 | P2 | English backend strings reach the user (Zod / throttler) | CONFIRMED | P2 | `api-client.ts:57-58` returns `data.message` verbatim; `zod-validation.pipe.ts:14`; throttler default text. → APP-10 |
| F1-11 | P2 | Tab bar fixed height + Toast double-counts inset | PARTIAL | P3 | Toast double count is deterministic (`Toast.tsx:21,89` adds `insets.bottom` to an 84 px bar that already contains it). Android clipping needs a device run (UNVERIFIABLE part). → APP-24 |
| F1-12 | P2 | `StripeProvider` silently accepts empty key | CONFIRMED | P2 | `(app)/_layout.tsx:21` `publishableKey={STRIPE_PUBLISHABLE_KEY ?? ''}`. Overlaps REL build-config. → APP-15 |
| F1-13 | P2 | `gestureEnabled: false` disables swipe-back app-wide | **REFUTED** | — | The global flag (`(app)/_layout.tsx:22`) is overridden per screen: `tasks/[id]/index.tsx:120`, `tasks/create.tsx:35`, `tasks/[id]/finish.tsx:100`, `cards.tsx:65` all set `<Stack.Screen options={{ gestureEnabled: true }} />`. Only the `(tabs)` root loses swipe-back, which is the intent. Owner question F1-Q5 is settled (§4). |
| F1-14 | P2 | `AppModal.onOk` errors unhandled; backdrop bypasses `onCancel`/loading guard | CONFIRMED | P3 | `AppModal.tsx:68-77,94,97`. Every current `onOk` caller wraps its own try/catch, so no live symptom today. → APP-25 |
| F1-15 | P2 | Keyboard "go" bypasses Button disabled guard (double submit) | PARTIAL | P3 | True (`sign-up.tsx:253`, `sign-in.tsx:130`, `forgot-password.tsx:249,481`), but requires two return-key presses inside one request window; worst case is a 409 modal over Home. → APP-26 |
| F1-16 | P2 | No `+not-found.tsx`; unauthenticated deep link loses destination | CONFIRMED | P3 | `ls app` → no not-found file. Reachable only by deep link / malformed URL; no in-app path produces an unmatched route. → APP-27 |
| F1-17 | P2 | Copy promises profile switching | CONFIRMED | P3 | `choose-profile.tsx:71`. Folded into the copy-vs-behaviour bucket. → APP-19 |
| F1-18 | P3 | Password-length drift (create none / reset 6 / app 8) | CONFIRMED | P3 | Backend owns (A1 P1 "No password policy"). App residue: none. DEFERRED-TO-BE for the fix. |
| F1-19 | P3 | Auth flows use modals, skip SPEC success toasts | CONFIRMED | P3 | → APP-28 (polish bucket) |
| F1-20 | P3 | Native splash hides before hydration (white flash) | CONFIRMED | P3 | No `SplashScreen.preventAutoHideAsync` anywhere; `app.json:58` splash bg `#ffffff`. → APP-28 |
| F1-21 | P3 | Duplicate redirect on sign-in | CONFIRMED | P3 | `index.tsx:24-28` and `(auth)/_layout.tsx:9-13` identical. → APP-28 |
| F1-22 | P3 | `ScreenHeader` unconditional `router.back()` | CONFIRMED | P3 | `ScreenHeader.tsx:36`. → APP-28 |
| F1-23 | P3 | Forgot-password: Android back exits, no resend cooldown, success modal dismissible | CONFIRMED | P3 | `forgot-password.tsx:49-55,303-310,99-106`; `BackHandler` unused repo-wide. → APP-28 |
| F1-24 | P3 | Button: white spinner on outline/ghost, discarded ref, no a11y state | CONFIRMED | P3 | `Button.tsx:48-60,77`. → APP-28 |
| F1-25 | P3 | Inputs lack autofill hints | CONFIRMED | P3 | → APP-28 |
| F1-26 | P3 | Tailwind `content` omits `./app/**` | CONFIRMED | P3 | `tailwind.config.js:3-7`; `grep -rl className app/` → empty, so latent. → APP-28 |
| F1-27 | P3 | Typed routes not enforceable in clean checkout | CONFIRMED | P3 | `ls expo-env.d.ts .expo/types` → both missing; `tsconfig.json` includes them. → APP-28 |
| F1-28 | P3 | `.npmrc legacy-peer-deps=true` | CONFIRMED | — | `.npmrc:1`. DEFERRED-TO-REL. |
| F1-29 | P3 | Two colour sources; raw HSL literals | CONFIRMED | P3 | → APP-28 |
| F1-30 | P3 | Docs drift | CONFIRMED | P3 | → APP-28 |
| F1-31 | P3 | Misc nits | CONFIRMED | P3 | All re-checked (relative `../../src/lib/modal` imports at `sign-in.tsx:22`, `sign-up.tsx:24`, `forgot-password.tsx:32`; `termsAccepted: true` hard-coded; etc.). → APP-28 |

### F2 — home / create / detail / finish / validate / history

| # | Orig | Title (short) | Verdict | Final | Note |
| --- | --- | --- | --- | --- | --- |
| F2-01 | P1 | 3DS `requires_action` treated as success; `payment.status` never read | CONFIRMED | P1 (app) | `tasks/[id]/index.tsx:103-110` only toasts (and a **success** toast); `clientSecret` dropped; `grep confirmPayment\|handleNextAction\|useConfirmPayment` → 0 hits; `useStripe` only in `AddCardSheet.tsx:37` for `createPaymentMethod`. Backend side is A2/A3 P0. → APP-03 |
| F2-02 | P1 | `PriceBreakdown` says client pays offered + 20 % + Stripe; backend charges `offeredPrice` | CONFIRMED | P1 | `PriceBreakdown.tsx:20-22,64`; `start-task.service.ts:60`; `validate-task.service.ts:55-57`. → APP-04 |
| F2-03 | P1 | City free text vs 3 pills vs case-sensitive `contains` | CONFIRMED | P1 | `CreateTaskStep1.tsx:261-271` (`rules={{ required }}` only); `ProxyHome.tsx:45`; `tasks.repository.ts:84` `locationAddress: { contains: city }` (no `mode`). → APP-07 |
| F2-04 | P1 | No refresh path (5-min stale, no pull/focus/poll) | CONFIRMED | P1 | `query-client.ts:24,28`; `grep refetchInterval\|RefreshControl\|focusManager\|useFocusEffect\|AppState\|refetchOnMount` → only `refetchOnWindowFocus: false`. → APP-08 |
| F2-05 | P1 | History tab is a placeholder | CONFIRMED | P1 | `app/(app)/(tabs)/history.tsx:5-13` renders `TabPlaceholder` with "Em breve você verá tarefas concluídas…"; no query. → APP-09 |
| F2-06 | P1 | Proof upload shares the 15 s timeout; retry → 404 | PARTIAL | P1 | Timeout confirmed (`api-client.ts:20`; `tasks-apis.ts:46-49` no override). The "server completes anyway → 404 on retry" branch is one of two outcomes; the more common one on a slow uplink is abort mid-stream → retry times out again. Either way the proxy cannot finish on a congested uplink. → APP-16 |
| F2-07 | P2 | Typed address still requires location permission; geocode failure silently uses device position | CONFIRMED | P2 | `useLocationCapture.ts:157,164-180`. → APP-17 |
| F2-08 | P2 | Coordinates never invalidated when address edited / on back from Step 2 | CONFIRMED | P2 | `CreateTaskStep1.tsx:71-73,107-115`; `create.tsx:57-61`. → APP-17 |
| F2-09 | P2 | Accept not gated by `stripeAccountReady`; misleading 403 copy | CONFIRMED | P2 | `index.tsx:56`; backend `start-task.service.ts:40-41` → "O usuário não possui permissão de proxy." → APP-18 |
| F2-10 | P2 | Home stats / wallet from JWT are structurally wrong or stale | CONFIRMED | P2 | `ClientHome.tsx:57-64`; `validate-task.service.ts:83-86` increments executor only; `rateProxyService` rates executor only. → APP-05 |
| F2-11 | P2 | API errors on both homes render the empty state | CONFIRMED | P2 | `ClientHome.tsx:40,258-264`; `ProxyHome.tsx:54,131-137`. → APP-20 |
| F2-12 | P2 | `payout_failed` displayed as happy completion | CONFIRMED | P2 | `status-display.ts:22-23`; `TaskTimeline.tsx:88-90`; `index.tsx:187` receipt only for `completed`. → APP-21 |
| F2-13 | P2 | Receipt lines don't add up; "Concluída em" = `payment.updatedAt` | CONFIRMED | P2 | `ReceiptCard.tsx:22,67-89`. Same root cause as the fee model. → APP-04 |
| F2-14 | P2 | Comment has no 500-char limit → English "Validation failed" | CONFIRMED | P3 | `ValidateTaskSheet.tsx:227-247` no `maxLength`; backend `validate-task.controller.ts:14`. → APP-10 |
| F2-15 | P2 | No local file-size check before upload (413 English) | CONFIRMED | P2 | `finish.tsx:79-85`; `multer-validation.pipe.ts:24-26`. → APP-16 |
| F2-16 | P2 | Missed invalidations after mutations | CONFIRMED | P2 | `tasks-hooks.ts:61-116` never touch `transactionHistory`; no mutation refreshes the session. → APP-08 |
| F2-17 | P2 | Task payloads carry owner `email`/`phoneNumber`/`stripeCustomerId` | CONFIRMED | — | Backend owns (A2 P1 PII leak). DEFERRED-TO-BE; app residue = narrow `TTaskOwner` (`tasks-api-types.ts:54-65`) once the select is trimmed. |
| F2-18 | P2 | Step 1 hint "Você paga apenas quando o Proxy entrega" contradicts charge at accept | CONFIRMED | P2 | `CreateTaskStep1.tsx:338` vs `index.tsx:98-99` and `start-task.service.ts:57-77` (full charge, not a hold). → APP-19 |
| F2-19 | P3 | `canCancelTask` null-`startedAt` inverted vs backend | CONFIRMED | P3 | `can-cancel.ts:19` returns `true`; `cancel-task.service.ts:40-42` throws. → APP-28 |
| F2-20 | P3 | Status colours / 5-step timeline / proxy waiting bar / people row drift | CONFIRMED | P3 | → APP-28 |
| F2-21 | P3 | Dead `ACTIVE_TASK_STATUSES`; unused `@react-native-community/datetimepicker` (+ plugin) | CONFIRMED | P3 | `grep DateTimePicker\|datetimepicker app src` → 0. Plugin removal is REL's. → APP-28 |
| F2-22 | P3 | Location permission requested on Proxy Home mount with a client-flow purpose string | CONFIRMED | P3 | `useDeviceLocation.ts:26-31`; `app.json:39-40`. Purpose string is REL's. → APP-28 |
| F2-23 | P3 | Absolute action bars contradict CLAUDE.md | CONFIRMED | P3 | `index.tsx:290-302,360-372`. Settled as a doc update (§4). |
| F2-24 | P3 | Rating mandatory in UI, optional in API/SPEC | CONFIRMED | P3 | `ValidateTaskSheet.tsx:100,268`. Product (§5). |
| F2-25 | P3 | Copy drift / "iPhone" string on Android / `Alert.alert` | CONFIRMED | P3 | `finish.tsx:46-49,65-68`. → APP-28 |
| F2-26 | P3 | Search filters only loaded pages; accent-sensitive | CONFIRMED | P3 | `ProxyHome.tsx:63-72`. → APP-28 |
| F2-27 | P3 | Card query failure rendered as "no card" (Step 2) | CONFIRMED | P3 | `CreateTaskStep2.tsx:33,153`. → APP-20 |

### F3 — cards / wallet / onboarding (app side only; store/config → REL)

| # | Orig | Title (short) | Verdict | Final | Note |
| --- | --- | --- | --- | --- | --- |
| F3-01 | P0 | Store identity is the Expo template | DEFERRED-TO-REL | — | |
| F3-02 | P0 | No account deletion, no privacy/terms/support surface | CONFIRMED | P0 / P1 | Same as F1-01 + F1-05. → APP-01, APP-02 |
| F3-03 | P1 | Onboarding always toasts "Recebimento configurado com sucesso" | CONFIRMED | P1 | `useStripeOnboarding.ts:47-48` unconditional after `refreshSession`; comment at `:17-20` promises a branch that does not exist; backend `stripe.service.ts:144-145` `return_url === refresh_url`. → APP-22 |
| F3-04 | P1 | Wallet balance / merchant status from a never-refreshed JWT | CONFIRMED | P1 | `wallet.tsx:19-21,76`; `ProxyHome.tsx:290`. → APP-05 |
| F3-05 | P1 | Stripe return page not hosted / `PROD_CALLBACK_URL` empty | DEFERRED-TO-REL | — | Infra; app side (`RETURN_URL = 'proxyapp://wallet'`, `useStripeOnboarding.ts:9`) is correct. |
| F3-06 | P1 | Card saved by plain `attach`; first charge is merchant-initiated | PARTIAL | — | App sends exactly what the contract asks (`AddCardSheet.tsx:102-109` → `{ token: pm_id }`). The SetupIntent redesign is a backend+app contract change; frequency with Brazilian issuers UNVERIFIABLE here. Collapsed into APP-03 as the app half of the 3DS fix. |
| F3-07 | P1 | No `eas.json`, build numbers, prod key strategy | DEFERRED-TO-REL | — | App residue = APP-15 (fail fast on empty key). |
| F3-08 | P1 | `supportsTablet: true` | DEFERRED-TO-REL | — | |
| F3-09 | P2 | Transaction-history failures as "Sem ganhos ainda"; never refreshes | CONFIRMED | P2 | `wallet.tsx:26,88-93` ignores `isError`. → APP-20 + APP-08 |
| F3-10 | P2 | Apple Pay entitlement generated | DEFERRED-TO-REL | — | |
| F3-11 | P2 | Over-declared permissions (Always location, microphone) | DEFERRED-TO-REL | — | |
| F3-12 | P2 | Replacing a card leaves the old PM attached | DEFERRED-TO-BE | — | A3 P2 has it. |
| F3-13 | P2 | `cards` route has no role gate | CONFIRMED | P3 | `cards.tsx:20-24`; only link is `profile.tsx:98` behind `isClient`; reachable by `proxyapp://cards`. Same for `/wallet` (NEW, see APP-23). |
| F3-14 | P2 | "Substituir cartão?" copy reads destructive before a form | CONFIRMED | P3 | `cards.tsx:28-38`. → APP-19 |
| F3-15 | P3 | expo-doctor / patch-behind packages | DEFERRED-TO-REL | — | |
| F3-16 | P3 | Dead `useMerchantDashboardMutation`; `delete` typed `{message}` | CONFIRMED | P3 | `wallet-hooks.ts:18-20` unused; `cards-apis.ts:10-11`; backend 204. → APP-28 |
| F3-17 | P3 | No card toasts; Stripe SDK error text may be English | CONFIRMED | P3 | `cards.tsx:134`; `AddCardSheet.tsx:106`. → APP-28 |
| F3-18 | P3 | Docs drift (README/CLAUDE.md) | CONFIRMED | P3 | → APP-28 |
| F3-19 | P3 | `ITSAppUsesNonExemptEncryption` / updates policy | DEFERRED-TO-REL | — | |
| F3-20 | P3 | `CardField` inside RN `Modal` on Android | UNVERIFIABLE | P3 | Needs one Android device run. Listed as a release QA item in APP-28. |

### X1 — app-side claims only

| # | Orig | Title (short) | Verdict | Final | Note |
| --- | --- | --- | --- | --- | --- |
| X1-01 | P1 | 3DS dead end | CONFIRMED | — | Dup of F2-01. → APP-03 |
| X1-03 | P1 | Price breakdown contradicts charge | CONFIRMED | — | Dup of F2-02. → APP-04 |
| X1-05 | P2 | JWT `rating`/`walletBalance` strings; `.toFixed` crash | CONFIRMED | P2 | X1's grading (P2, latent) is the correct one; A1 graded the same thing P0 "crashes for any rated user" — overstated, a CLIENT is never rated in-app. → APP-11 |
| X1-06 | P2 | Zod/Nest English bodies reach the user | CONFIRMED | — | Dup of F1-10. → APP-10 |
| X1-07 | P2 | JWT never expires; only refresh trigger is onboarding | CONFIRMED | — | Expiry is A1's; staleness → APP-05 |
| X1-09 | P2 | City filter | CONFIRMED | — | Dup of F2-03. → APP-07 |
| X1-10 | P2 | `phoneNumber: z.string()` in strategy → 500 for null phone | DEFERRED-TO-BE | — | App always sends a phone (`sign-up.tsx:86,184-188`); app type residue `TSessionPayload.phoneNumber: string` → APP-28. |
| X1-15 | P3 | App type lies (`offeredPrice: number` in history, `delete → {message}`, `ACTIVE_TASK_STATUSES`, `stripeAccountId?`) | CONFIRMED | P3 | `wallet-api-types.ts:10,30`; `cards-apis.ts:11`; `tasks-api-types.ts:21-26`. → APP-28 |
| X1-16 | P3 | Global 401 handler fires on business 401 (`USER_INVALID_CREDENTIALS`) | CONFIRMED | P3 | `api-client.ts:42-45`; harmless today (no session yet). → APP-28 |
| X1-17 | P3 | Client validation doesn't mirror backend limits | CONFIRMED | — | Dup of F2-14. → APP-10 |
| X1 gap | — | No app client for `update-profile` / `delete-account` | CONFIRMED | — | `auth-apis.ts:11-29`. → APP-01 (delete) ; edit-profile stays a gap (§5). |

---

## 2. Canonical findings register (app)

Ordered by severity, then blast radius. "Repo" in the fix outline says where the change lands.

### APP-01 · P0 · No in-app account deletion
- **Root cause**: `Profile` has no "Excluir conta" row and `authApis` has no `DELETE /auth/account` client, although the backend route exists (`api:src/modules/auth/controllers/delete-account.controller.ts:9-18`, 204, 409 `USER_HAS_ACTIVE_TASKS`). Apple 5.1.1(v) and Play's account-deletion policy make this a submission blocker.
- **Files**: `app:app/(app)/(tabs)/profile.tsx:81-110`; `app:src/apis/auth/auth-apis.ts:11-29`.
- **Fix outline (app)**: add `authApis.deleteAccount = () => api.delete<void>('/auth/account')` + `useDeleteAccountMutation`; in Profile add a destructive "Excluir conta" row → `modal.confirm` (destructive) → second confirm → mutate; on 409 show the backend message and `router.navigate('/history')`; on success `signOut()`. Also publish the web deletion URL Play requires (REL).
- **Test that proves it**: `src/apis/auth/__tests__/auth-apis.test.ts` — `deleteAccount()` issues `DELETE /auth/account`; a Profile render test asserts the row exists and calls `signOut` after a 204.
- **Collapses**: F1-01, F3-02 (deletion half), X1 gap.

### APP-02 · P1 · Terms of Use / Privacy Policy are referenced but never linked
- **Root cause**: the consent checkbox and the Splash footer mention documents the user cannot open; no URL constant, no `WebBrowser.openBrowserAsync` outside the Stripe dashboard. Play requires the privacy policy to be reachable in-app; Apple reviewers reject consent to unreadable documents.
- **Files**: `app:app/(auth)/sign-up.tsx:278-287`; `app:app/index.tsx:156-166`; `app:app/(app)/(tabs)/profile.tsx` (no row).
- **Fix outline (app)**: `src/common/constants/legal.ts` with `TERMS_URL`/`PRIVACY_URL`; make the bold spans `Pressable` → `WebBrowser.openBrowserAsync`; add a "Termos e Privacidade" `MenuRow` in Profile. URLs themselves are an owner input (§5).
- **Test**: render test on sign-up: pressing "Termos de Uso" calls `openBrowserAsync(TERMS_URL)`.
- **Collapses**: F1-05, F3-02 (privacy half).

### APP-03 · P1 (app) / P0 (backend) · 3DS `requires_action` is a dead end and is shown as success; `payment.status` never surfaced
- **Root cause**: `/tasks/start` returns `{status:'requires_action', clientSecret}` to the **proxy**; the app toasts `toast.success('Tarefa aceita. Aguardando confirmação…')`, drops the secret, invalidates queries and the proxy sees "Enviar comprovante e finalizar". Nothing in the app reads `task.payment.status`, so neither party learns the payment is `pending`; the client can later "Validar e pagar" and the backend transfers money it never collected (A2 P0). The card itself is attached without a SetupIntent (`AddCardSheet.tsx:102-109` → plain `attach`), so Stripe treats the first PI as on-session and may demand 3DS.
- **Files**: `app:app/(app)/tasks/[id]/index.tsx:103-110,265-266`; `app:src/apis/tasks/tasks-api-types.ts:168-170`; `app:src/feature/cards/components/AddCardSheet.tsx:102-109`; `app:app/(app)/_layout.tsx:21` (no `urlScheme` on `StripeProvider`); backend `api:src/modules/tasks/use-cases/start-task.service.ts:44-50,87-92`, `api:src/stripe/stripe.service.ts:63-82`.
- **Fix outline**: (backend, decides the shape) confirm with `off_session: true` and treat `requires_action` as a hard failure that rolls back status/mapping, **or** move the charge to a client-initiated step. (app) whichever path: show a "Pagamento pendente de confirmação" banner whenever `task.payment && task.payment.status !== 'succeeded'` for `in_progress`/`verification_required`; hide "Validar e pagar" and "Enviar comprovante" until succeeded; render `requires_action` as an error/info toast, never success. If client-side 3DS is chosen: save the card via `confirmSetupIntent` (usage `off_session`) and add `urlScheme="proxyapp"` to `StripeProvider`. Never call `confirmPayment` on the proxy's device.
- **Test**: `tasks/[id]` render test with `payment.status: 'pending'` asserts the banner is shown and "Validar e pagar" is absent; `start` result `requires_action` asserts no success toast.
- **Collapses**: F2-01, F3-06, X1-01; SPEC §7.3/§8.9/§9.1 design itself must be revised (challenge belongs to the client).

### APP-04 · P1 · Money copy contradicts the money model (breakdown, receipt, proxy net)
- **Root cause**: `PriceBreakdown` shows "Total a pagar = oferecido + 20 % + Stripe" while the backend charges exactly `offeredPrice` and deducts both fees from the proxy. `ReceiptCard` then shows numbers that do not add up (client: 20 + 75,62 vs "Valor pago 100,00"; proxy: 100 − 20 = "Você recebeu 75,62") and labels `payment.updatedAt` as "Concluída em". The proxy never sees their net (≈ 75,6 %) before accepting; `EarningsList` dates entries by `completedAt`, which the backend sets when the proxy *finished*, not when they were paid.
- **Files**: `app:src/feature/tasks/components/PriceBreakdown.tsx:20-22,36-39,64,75`; `app:src/feature/tasks/components/ReceiptCard.tsx:20-22,67-89`; `app:app/(app)/tasks/[id]/index.tsx:537-549` (SummaryCard "Valor oferecido"); `app:src/feature/wallet/components/EarningsList.tsx:116`; backend `api:src/modules/tasks/use-cases/start-task.service.ts:60`, `validate-task.service.ts:55-57`, `finish-task.service.ts:67`.
- **Fix outline (app, after the owner picks the model — §5 default: fees on the proxy, as coded)**: rename the Step 2 card to "Como o valor é dividido": "Você paga R$ 100,00 / Taxa Proxy −20,00 / Processamento −4,38 / O Proxy recebe 75,62"; add a "Taxa de processamento" line to both receipt variants (`offered − platformFee − proxyEarnings`); show "Você recebe ≈ R$ X" on the proxy's SummaryCard; relabel the date "Pago em" or drop it until the backend returns a validation timestamp. Update SPEC §8.8.
- **Test**: unit test for a `splitPrice(100)` helper → `{ platformFee: 20, processingFee: 4.38, proxyNet: 75.62 }` and snapshot of `PriceBreakdown` labels.
- **Collapses**: F2-02, F2-13, X1-03 (+ NEW proxy-net and earnings-date observations).

### APP-05 · P1 · UI reads money/stats from a JWT snapshot that is only refreshed after Stripe onboarding
- **Root cause**: `walletBalance`, `stripeAccountReady`, `rating`, `totalTasks*` come from `jwtDecode(token)`; the backend signs no `exp`, and the app calls `GET /auth/session/refresh` from exactly one place (`useStripeOnboarding.ts:47`). The proxy's Wallet/Home balance and merchant badge are login-time values until sign-out. For a CLIENT, "Concluídas" and "Avaliação" are structurally 0 / "—" (backend only increments/rates the executor).
- **Files**: `app:app/(app)/(tabs)/wallet.tsx:19-21,76`; `app:src/feature/home/components/ProxyHome.tsx:290`; `app:src/feature/home/components/ClientHome.tsx:57-64`; `app:src/apis/auth/auth-hooks.ts:54-61`; backend `api:src/modules/auth/auth.module.ts:49`, `validate-task.service.ts:83-91`.
- **Fix outline (app)**: wire `AppState` → `focusManager`; call `refreshSession` (throttled ≥ 30 s) on Wallet and Proxy Home focus and after `create`/`validate`/`finish`/`start` succeed; on Client Home replace "Concluídas"/"Avaliação" with "Criadas" (`totalTasksCreated`) and a count from `transactionHistory`. Longer term (backend): expose `GET /auth/me` or return balance in `/auth/transaction-history` so money is a normal query.
- **Test**: hook test — `useSessionRefreshOnFocus` calls `authApis.refreshSession` once when `AppState` goes `active` after ≥ 30 s.
- **Collapses**: F1-04, F2-10, F3-04, X1-07 (app half; expiry is A1's).

### APP-06 · P1 · Sign-up collects CPF/CNPJ and a "document photo" that are never sent; the photo is a boolean toggle
- **Root cause**: `PhotoUploader` is `onPress={() => setPhotoUploaded((v) => !v)}` with no picker/upload; the payload omits `document` and `documentUrl`; the backend has no document-number column and no document upload endpoint (the only multipart route is `/tasks/finish`). `isVerified` can never become true; the user is told "Documento enviado".
- **Files**: `app:app/(auth)/sign-up.tsx:74-80,83-91,242-272,317-388`; backend `api:src/modules/auth/controllers/create-account.controller.ts:15-16`; `api:prisma/schema.prisma` (model `Users`, no document column).
- **Fix outline**: product decision first (§5). Default for 1.0: remove the photo box and the document-number field from sign-up (keep `documentType` out too), and drop "Necessário para ativar sua conta de Proxy". If kept: backend adds a `document` column + an upload endpoint; app uses `expo-image-picker` and sends `documentUrl`.
- **Test**: sign-up render test asserts no `PhotoUploader` for PROXY (or, if kept, that submit is blocked until `documentUrl` is set).
- **Collapses**: F1-02.

### APP-07 · P1 · City is free text at creation but the feed queries three fixed strings with a case-sensitive substring
- **Root cause**: Step 1 `city` is `required` only; Proxy Home pills are `['São Paulo','Rio de Janeiro','Belo Horizonte']`; backend `where: { locationAddress: { contains: city } }` on `"${street}, ${city} - ${state}, ${zipCode}"` with no `mode: 'insensitive'`. "Sao Paulo", "SAO PAULO", "Guarulhos", "Niterói" or an Apple reverse-geocode `subregion` produce tasks no proxy can list; the client sees "Disponível" forever.
- **Files**: `app:src/feature/tasks/components/CreateTaskStep1.tsx:261-271`; `app:src/feature/tasks/hooks/useLocationCapture.ts:137`; `app:src/feature/home/components/ProxyHome.tsx:45,51`; backend `api:src/modules/tasks/repository/tasks.repository.ts:81-85`, `create-task.service.ts:34`.
- **Fix outline (app)**: make city a picker limited to the served list (shared `SERVED_CITIES` constant used by both Step 1 and the pills); when "Usar minha localização" returns an unserved city, show an inline error instead of filling it. (backend) `mode: 'insensitive'` now; a `city` column later (A2/A3 have it).
- **Test**: unit test that `normaliseCity('sao paulo')` → `'São Paulo'` and that Step 1 submit rejects an unserved city.
- **Collapses**: F2-03, X1-09.

### APP-08 · P1 · No refresh strategy: 5-min stale cache, no pull-to-refresh, no focus/poll, incomplete invalidations
- **Root cause**: `staleTime: 5 min`, `refetchOnWindowFocus: false`, no `focusManager`/`AppState`/`RefreshControl`/`refetchInterval` anywhere. The product is two devices mutating the same row; a client who backgrounds the app on a task detail returns to "Disponível + Cancelar" for up to 5 min after the proxy accepted; the proxy feed shows a task already taken. `transactionHistory` is never invalidated by any mutation; no mutation refreshes the session.
- **Files**: `app:src/apis/query-client.ts:24,28`; `app:src/apis/tasks/tasks-hooks.ts:61-134`; `app:src/feature/home/components/ClientHome.tsx:71-75`; `app:src/feature/home/components/ProxyHome.tsx:90-145`; `app:app/(app)/tasks/[id]/index.tsx:39`; `app:app/(app)/(tabs)/wallet.tsx:44-51`.
- **Fix outline (app)**: in `app/_layout.tsx` wire `focusManager.setEventListener` to `AppState` (and `onlineManager` to NetInfo); `RefreshControl` on both homes and Wallet; `useTaskByIdQuery` with `staleTime: 0` + `refetchInterval` (≈ 10 s) while `status ∈ {available,in_progress,verification_required}` or `payment?.status === 'pending'`; add `transactionHistory` to create/validate/cancel/finish invalidations.
- **Test**: hook test — `useTaskByIdQuery` returns `refetchInterval` > 0 for `available` and `false` for `completed`.
- **Collapses**: F2-04, F2-16, F3-09 (refresh half).

### APP-09 · P1 · History tab is a "Em construção" placeholder
- **Root cause**: `history.tsx` renders `TabPlaceholder`; completed/cancelled tasks vanish from `/tasks/active` and are unreachable (no receipt for the client, no record for the proxy). `useTransactionHistoryQuery` exists and is unused here. Backend `tasksCompleted` is `status: 'completed'` only and there is no endpoint for an executor's cancelled tasks, so a PROXY "Canceladas" tab cannot be built today (A1 P1 notes `payout_failed` is hidden too).
- **Files**: `app:app/(app)/(tabs)/history.tsx:5-13`; `app:src/apis/wallet/wallet-hooks.ts:6-12`; backend `api:src/modules/auth/repository/auth.repository.ts:110-129`.
- **Fix outline (app)**: implement SPEC §8.13: "Em andamento" from `tasksActive`; "Concluídas"/"Canceladas" from `transactionHistory` (`tasksCreated ∪ tasksCompleted`, dedupe by id, filter by status, include `payout_failed` under Concluídas with its badge); reuse `TaskCard`. (backend) return executor tasks in `canceled`/`payout_failed` or add a `status` filter.
- **Test**: render test with fixture history asserts the three tabs and that a `completed` task appears under "Concluídas".
- **Collapses**: F2-05.

### APP-10 · P2 · English framework strings reach the user (Zod, throttler, Multer); client validation does not mirror backend limits
- **Root cause**: `extractErrorMessage` returns `response.data.message` verbatim; Zod failures are `'Validation failed'`, throttler `'ThrottlerException: Too Many Requests'` (5/min on `/auth/session` and `/auth/create`), Multer `'File too large'`. The validate comment has no `maxLength` (backend 500), the app email regex is looser than `z.email()`.
- **Files**: `app:src/apis/api-client.ts:54-67`; `app:src/feature/tasks/components/ValidateTaskSheet.tsx:227-247`; backend `api:src/pipes/zod-validation.pipe.ts:13-17`, `api:src/app.module.ts:28-34`.
- **Fix outline (app)**: in `extractErrorMessage` branch on `status === 429` → "Muitas tentativas. Aguarde um minuto e tente novamente.", `413` → "A foto precisa ter até 10 MB.", `400 && message === 'Validation failed'` → "Dados inválidos. Revise os campos."; add `maxLength={500}` + counter to the comment. (backend, A1 P2) PT messages in the pipe/throttler.
- **Test**: unit test `extractErrorMessage({ response: { status: 429, data: { message: 'ThrottlerException…' } } })` returns the PT string.
- **Collapses**: F1-10, F2-14, X1-06, X1-17.

### APP-11 · P2 · JWT `rating`/`walletBalance` are strings at runtime, typed `number`; `ClientHome` would crash on a non-zero rating
- **Root cause**: backend signs raw Prisma `Decimal`s (`authenticate.service.ts:44,52`, same in `refresh-session.service.ts:26,34` and `update-profile.service.ts:54,62`); `jsonwebtoken` stringifies → `"4.5"`, `"0"`. The backend re-parses with `z.coerce.number()` (`jwt.strategy.ts:22-25`); the app does `jwtDecode<TSessionPayload>` with no coercion. `"4.5" > 0` is `true` and `"4.5".toFixed` throws. Latent today: a CLIENT's rating is `"0"` (`"0" > 0 === false`); only `/auth/create` mass-assignment or an `update-profile` `userType` flip (no app client) can put a non-zero rating on a CLIENT. `formatBRL` tolerates strings, so balances render.
- **Files**: `app:src/store/auth-store/auth-store.ts:17-24`; `app:src/apis/auth/auth-api-types.ts:25,28`; `app:src/feature/home/components/ClientHome.tsx:63`; `app:src/feature/wallet/components/BalanceCard.tsx:7` (prop typed `number`, receives string).
- **Fix outline (app)**: in `decodeOrNull` normalise with a zod schema mirroring the backend (`rating: z.coerce.number()`, `walletBalance: z.coerce.number()`, `phoneNumber: z.string().nullable()`, `stripeAccountReady: z.boolean().default(false)`); return `null` on parse failure. (backend, cheap) `.toNumber()` before signing in the three signers.
- **Test**: unit test `decodeOrNull(signedToken({ rating: '4.5', walletBalance: '120.5' }))` → numbers; `ClientHome` render with `rating: 4.5` shows "4,5".
- **Collapses**: F1-03, X1-05 (A1 P0 is the same root cause, overstated).

### APP-12 · P1 · Cold start hangs on a blank screen if the SecureStore read rejects
- **Root cause**: `getToken().then(hydrate)` has no `.catch`; `hydrated` stays `false` and every guard renders `null`. `expo-secure-store` is known to throw after keychain corruption/restore. Rare, but the only recovery is reinstalling.
- **Files**: `app:src/shared/providers/SessionProvider.tsx:20-34`; `app:app/index.tsx:31`; `app:app/(app)/_layout.tsx:18`.
- **Fix outline (app)**: `getToken().catch(async () => { await clearToken().catch(() => {}); return null }).then((t) => { if (!cancelled) hydrate(t) })`.
- **Test**: unit test with `getToken` mocked to reject asserts `hydrate(null)` is called.
- **Collapses**: F1-06.

### APP-13 · P2 · `isAuthenticated` is `!!token`, not `!!session`; no `exp` handling
- **Root cause**: an undecodable/foreign token counts as logged in; `home.tsx:8` then returns `null` (blank Home) and the tabs treat the user as CLIENT. Moot for `exp` today (backend sets none) but breaks the day it does.
- **Files**: `app:src/feature/auth/hooks/useProxyAuth.ts:30`; `app:src/store/auth-store/auth-store.ts:17-24,41-43`; `app:app/(app)/(tabs)/home.tsx:8`.
- **Fix outline (app)**: `isAuthenticated: !!session`; in `hydrate`/`setSession`, if `decodeOrNull` returns `null` or `exp * 1000 < Date.now()`, `clearToken()` and store `null`.
- **Test**: store test — `hydrate('garbage')` leaves `token: null, session: null`.
- **Collapses**: F1-08.

### APP-14 · P2 · Server-side 401 clears the token but not the React Query cache (cross-account data on a shared device)
- **Root cause**: the unauthorized handler only `clearSession()`s; `queryClient.clear()` happens solely in `signOut`. `['card']`, `['tasks',…]`, `['wallet',…]` survive for `gcTime` 15 min and are served fresh for 5 min to the next account.
- **Files**: `app:src/shared/providers/SessionProvider.tsx:27-29`; `app:src/feature/auth/hooks/useProxyAuth.ts:21-24`; `app:src/apis/query-client.ts:24-25`.
- **Fix outline (app)**: `registerUnauthorizedHandler(() => { void clearSession(); queryClient.clear() })`; additionally clear in `setSession` when `sub` changes.
- **Test**: store test — after the 401 handler runs, `queryClient.getQueryData(queryKeys.card)` is `undefined`.
- **Collapses**: F1-09.

### APP-15 · P2 · `StripeProvider` silently falls back to `''`; no fail-fast on a misconfigured build
- **Root cause**: `publishableKey={STRIPE_PUBLISHABLE_KEY ?? ''}`; a build without `.env` (or with the committed `pk_test_xxx`) boots and `CardField` is dead with an opaque Stripe error. `api-client.ts:11-15` warns for the API URL; the Stripe key has no guard.
- **Files**: `app:app/(app)/_layout.tsx:7,21`; `app:.env.example:2`.
- **Fix outline (app)**: a `src/common/env.ts` that reads both vars, throws in `__DEV__` and logs + shows a blocking `modal.error` in release when a key is empty or equals `pk_test_xxx`. Build profiles are REL's.
- **Test**: unit test on `assertEnv()` throwing for `''` and `'pk_test_xxx'`.
- **Collapses**: F1-12 (REL F3-07 owns `eas.json`).

### APP-16 · P1 · Proof upload: 15 s global timeout, no size check, no recovery path
- **Root cause**: the multipart `POST /tasks/finish` inherits `timeout: 15000`; a 2–4 MB JPEG on a congested uplink exceeds it. Two outcomes: (a) abort mid-stream → "A requisição demorou demais" → retry times out again (most common); (b) upload completed but response late → server sets `verification_required` → retry gets 404 "Tarefa não encontrada." (`finish-task.service.ts:19-25`). No local size check; a > 10 MB library pick yields an English 413 after a long upload.
- **Files**: `app:src/apis/api-client.ts:20`; `app:src/apis/tasks/tasks-apis.ts:40-51`; `app:app/(app)/tasks/[id]/finish.tsx:52-58,71-75,79-96`; backend `api:src/pipes/multer-validation.pipe.ts:24-26`.
- **Fix outline (app)**: `timeout: 120_000` on the finish request; downscale to ≤ 1600 px with `expo-image-manipulator` before upload; reject `asset.fileSize > 10 MB` locally with PT copy; on `ECONNABORTED`/404 after an upload, refetch `taskById` and treat `verification_required` as success (`router.back()` + toast).
- **Test**: unit test on `tasksApis.finish` config asserts `timeout === 120000`; unit test on `handlePickResult` rejecting a 11 MB asset.
- **Collapses**: F2-06, F2-15.

### APP-17 · P2 · Task coordinates: permission wall for typed addresses, silent wrong coordinates, stale coordinates after edits
- **Root cause**: `resolveCoords` calls `ensurePermission()` before `geocodeAsync` (which needs no permission), so a client who denies location can never publish; when geocoding fails it silently substitutes the device position (task saved at the client's current location, not the typed address). `coords` captured once are reused even after the address fields change or after "Voltar" from Step 2 (`initialCoords`). Denied-permission modal has no `Linking.openSettings()` action (NEW).
- **Files**: `app:src/feature/tasks/hooks/useLocationCapture.ts:103-112,151-187`; `app:src/feature/tasks/components/CreateTaskStep1.tsx:71-73,83-91,104-116`; `app:app/(app)/tasks/create.tsx:56-61`.
- **Fix outline (app)**: geocode first without requesting permission; ask only as a fallback; if both fail show a blocking "Não encontramos esse endereço. Confira a rua, cidade e CEP." and do not substitute; `form.watch(['street','city','state','zipCode'])` → `setCoords(null)`; add an "Abrir Ajustes" button to the permission modal.
- **Test**: hook test — `resolveCoords` with `geocodeAsync` resolving does not call `requestForegroundPermissionsAsync`; with both failing returns `null` and shows the error.
- **Collapses**: F2-07, F2-08.

### APP-18 · P2 · Proxy "Aceitar" is not gated by `stripeAccountReady`; backend answers "O usuário não possui permissão de proxy."
- **Root cause**: `proxyCanStart` checks role + status only; the backend rejects non-ready proxies with `USER_NOT_PROXY` (403) whose copy says they are not a proxy. Every new proxy's first acceptance ends in that modal.
- **Files**: `app:app/(app)/tasks/[id]/index.tsx:56,94-116`; backend `api:src/modules/tasks/use-cases/start-task.service.ts:39-42`, `api:src/exception/error-dictionary.ts:33-37`.
- **Fix outline (app)**: when `isProxy && !session.stripeAccountReady`, render the bar as "Configure seu recebimento para aceitar" → `router.navigate('/wallet')`. (backend) dedicated `PROXY_ACCOUNT_NOT_READY` copy on start.
- **Test**: render test with `stripeAccountReady: false` asserts the CTA label and navigation target.
- **Collapses**: F2-09.

### APP-19 · P2 · User-facing copy contradicts system behaviour (charge timing, refunds, profile switching, card replacement)
- **Root cause**: several strings describe a pre-authorisation/hold or promises the system does not make: "Você paga apenas quando o Proxy entrega" (Step 1), "Cobramos só quando você contrata… Pagamento retido" (AddCardSheet), "Se um pagamento foi pré-autorizado, ele será estornado" (cancel modal and `CanceledBadge`) — the backend fully captures at acceptance and refunds (days to appear); "Você pode trocar de perfil depois, dentro do app" (not in MVP); "O cartão atual será removido" before a form that only replaces on success.
- **Files**: `app:src/feature/tasks/components/CreateTaskStep1.tsx:338`; `app:src/feature/cards/components/AddCardSheet.tsx:202-203`; `app:app/(app)/tasks/[id]/index.tsx:71-72`; `app:src/feature/tasks/components/TaskTimeline.tsx:198`; `app:app/(auth)/choose-profile.tsx:71`; `app:app/(app)/cards.tsx:28-38`.
- **Fix outline (app)**: "Seu cartão é cobrado quando um Proxy aceita; o valor só é repassado após você validar."; "Pagamento cobrado na aceitação; estorno em até X dias úteis."; "Você pode criar outra conta com o outro perfil."; "Você vai cadastrar um novo cartão no lugar do atual."
- **Test**: snapshot of the four strings (copy tests are cheap and stop regressions).
- **Collapses**: F1-17, F2-18, F3-14 (+ NEW AddCardSheet/cancel copy).

### APP-20 · P2 · Query errors are rendered as empty states or as "not found" (NEW item inside)
- **Root cause**: `isError` is never read on Client Home, Proxy Home, Wallet earnings, Cards screen, Step 2 card row; a 500/timeout/offline shows "Nenhuma tarefa ativa", "Nenhuma tarefa por aqui", "Sem ganhos ainda", "Adicionar cartão". **NEW**: task detail maps *any* query error — including no network — to `DetailNotFound` "Tarefa não encontrada — Ela pode ter sido removida ou você não tem acesso a ela." (`index.tsx:135`), a false statement on the main path.
- **Files**: `app:src/feature/home/components/ClientHome.tsx:40,258-264`; `app:src/feature/home/components/ProxyHome.tsx:54,131-137`; `app:app/(app)/(tabs)/wallet.tsx:26,88-93`; `app:app/(app)/cards.tsx:21,101-107`; `app:src/feature/tasks/components/CreateTaskStep2.tsx:33,153`; `app:app/(app)/tasks/[id]/index.tsx:39,135-136`.
- **Fix outline (app)**: a shared `QueryErrorCard` (`extractErrorMessage(error)` + "Tentar novamente" → `refetch()`); in detail distinguish `isAxiosError(e) && e.response?.status === 404` (not found) from everything else (error card).
- **Test**: render test of task detail with a network error asserts "Sem conexão" copy and a retry button, not "Tarefa não encontrada".
- **Collapses**: F2-11, F2-27, F3-09 (error half) + NEW detail case.

### APP-21 · P2 · `payout_failed` is presented as a happy completion
- **Root cause**: label "Pagamento pendente", timeline step "Concluída — Pagamento liberado.", receipt hidden (only `status === 'completed'`). SPEC §2.2 wants "Falha no repasse" in red; the proxy needs the receipt to contact support.
- **Files**: `app:src/feature/tasks/utils/status-display.ts:22-23`; `app:src/feature/tasks/components/TaskTimeline.tsx:73,88-90`; `app:app/(app)/tasks/[id]/index.tsx:187`.
- **Fix outline (app)**: label "Falha no repasse"; red badge in `TaskTimeline` like `CanceledBadge` ("Não conseguimos repassar o pagamento. Verifique sua conta Stripe na Carteira."); show `ReceiptCard` for `payout_failed` too.
- **Test**: render test with `status: 'payout_failed'` asserts the red badge and receipt.
- **Collapses**: F2-12.

### APP-22 · P1 · Stripe onboarding return always toasts success
- **Root cause**: after `openAuthSessionAsync` resolves with anything but cancel/dismiss, the hook refreshes the session and toasts "Recebimento configurado com sucesso." regardless of `stripeAccountReady`; `return_url === refresh_url`, so an expired link lands on the same toast. The Wallet then shows "Configure sua conta pra receber" under a green success toast, and the proxy cannot accept tasks.
- **Files**: `app:src/feature/wallet/hooks/useStripeOnboarding.ts:37-48`; `app:src/feature/wallet/components/MerchantStatusRow.tsx:30`; backend `api:src/stripe/stripe.service.ts:141-151`.
- **Fix outline (app)**: after `refreshSession`, read `useAuthStore.getState().session?.stripeAccountReady`; true → success toast; false → `toast.info('Cadastro enviado. A confirmação do Stripe pode levar alguns minutos.')` and poll `refreshSession` 3× over ~30 s / on next Wallet focus. Use `session.stripeAccountId && !stripeAccountReady` to render a third "Cadastro iniciado — aguardando Stripe" state in `MerchantStatusRow` (the data is already in the JWT, see §4). (backend) distinct `refresh_url`.
- **Test**: hook test — with `stripeAccountReady: false` after refresh, `toast.info` is called and `toast.success` is not.
- **Collapses**: F3-03.

### APP-23 · P3 · `/cards` and `/wallet` routes have no role gate (NEW: wallet)
- **Root cause**: the only gates are the Profile row (`isClient`) and the tab `href: null`; `proxyapp://cards` lets a PROXY attach a card, `proxyapp://wallet` lets a CLIENT create a Stripe Express account (backend `/auth/merchant-account` has no PROXY check either — A1 P2).
- **Files**: `app:app/(app)/cards.tsx:20-24`; `app:app/(app)/(tabs)/wallet.tsx:18-21`; `app:app/(app)/(tabs)/_layout.tsx:59-66`.
- **Fix outline (app)**: `if (session?.userType !== 'CLIENT') return <Redirect href="/home" />` in `cards.tsx`; mirror for PROXY in `wallet.tsx`.
- **Test**: render test — `Cards` with a PROXY session renders `Redirect`.
- **Collapses**: F3-13 + NEW wallet.

### APP-24 · P3 · Tab bar fixed height; Toast double-counts the bottom inset
- **Root cause**: `tabBarStyle.height` 84/64 is a total that already includes `insets.bottom`; `Toast` adds `insets.bottom` again (≈ 34 px too high on notch iPhones). Android edge-to-edge clipping is plausible but needs a device.
- **Files**: `app:app/(app)/(tabs)/_layout.tsx:34-40`; `app:src/shared/components/Toast.tsx:21,89-91`.
- **Fix outline (app)**: drop the fixed height (let the library compute) or `56 + insets.bottom`; Toast reads `useBottomTabBarHeight()` or a shared constant without re-adding the inset.
- **Test**: device QA item (iPhone with home indicator + Android 3-button nav).
- **Collapses**: F1-11.

### APP-25 · P3 · `AppModal` swallows `onOk` rejections; backdrop/back bypass `onCancel` and the loading guard
- **Files**: `app:src/shared/components/AppModal.tsx:63-84,94,97`.
- **Fix outline (app)**: `catch (e) { setTimeout(() => modal.error(extractErrorMessage(e)), 280) }`; route `onRequestClose` and backdrop through `handleCancel`.
- **Test**: render test — tapping backdrop while `okLoading` does not hide.
- **Collapses**: F1-14.

### APP-26 · P3 · Return-key submit bypasses the Button's pending guard
- **Files**: `app:app/(auth)/sign-up.tsx:76,253`; `app:app/(auth)/sign-in.tsx:44,130`; `app:app/(auth)/forgot-password.tsx:220,249,412,481`.
- **Fix outline (app)**: `if (mutation.isPending) return` at the top of each `onSubmit`.
- **Test**: unit test — two rapid `onSubmit()` calls fire one `mutateAsync`.
- **Collapses**: F1-15.

### APP-27 · P3 · No `+not-found.tsx`; unauthenticated deep link loses its destination
- **Files**: `app:app/` (absent); `app:app/(app)/_layout.tsx:12-16`.
- **Fix outline (app)**: add `app/+not-found.tsx` (PT copy, "Voltar ao início"); stash the intended href before redirecting to `/` and replay after sign-in.
- **Test**: render test of `+not-found`.
- **Collapses**: F1-16.

### APP-28 · P3 · Polish / consistency bucket (all CONFIRMED, none release-blocking)
- Status colours unused, 4-step timeline, no proxy "Aguardando validação" bar, no client card for a browsing proxy (F2-20); `canCancelTask` null inversion (F2-19); "iPhone" copy on Android + `Alert.alert` instead of `modal` (F2-25); search over loaded pages only, accent-sensitive (F2-26); dead `ACTIVE_TASK_STATUSES`, unused datetimepicker (F2-21); location permission on Proxy Home mount (F2-22); auth modals vs SPEC toasts, no card toasts (F1-19, F3-17); white splash flash (F1-20); duplicate redirect (F1-21); `ScreenHeader` unconditional back (F1-22); forgot-password Android back / resend cooldown / dismissible success modal (F1-23); Button spinner/ref/a11y (F1-24); autofill hints (F1-25); tailwind `content` globs (F1-26); typed routes files missing (F1-27); colour duplication + raw HSL (F1-29); docs drift (F1-30, F3-18); misc nits incl. relative `../../src/lib/modal` imports (F1-31); dead `useMerchantDashboardMutation`, `delete` typed `{message}` (F3-16); type lies `offeredPrice: number` in history, `ACTIVE_TASK_STATUSES` omits `available`, `stripeAccountId?` never set, `phoneNumber: string` (X1-15, X1-10 residue); global 401 handler on `USER_INVALID_CREDENTIALS` (X1-16); `CardField`-in-`Modal` Android QA (F3-20, UNVERIFIABLE); NEW: `ProofPhoto` `<Image>` has no `onError`/placeholder (`index.tsx:407-411`); NEW: Proxy Home "N tarefas em andamento" counts `verification_required` and "{n} ativas" labels *available* tasks (`ProxyHome.tsx:418,441-444`).

---

## 3. Missed by the first pass (new findings)

### APP-29 · P2 · NEW · Mutations never invalidate on error; a timed-out start/finish/validate/cancel leaves the UI contradicting the server
- **Root cause**: all five task mutations invalidate only in `onSuccess` (`tasks-hooks.ts:61-134`); mutations never retry (`query-client.ts:31`). With a 15 s timeout on a flaky network, `POST /tasks/start` can succeed server-side (task `in_progress`, client charged) while the proxy sees "A requisição demorou demais"; the feed still lists the task (cache fresh for 5 min), the proxy taps again and gets "Tarefa não encontrada." (`start-task.service.ts:26-32` filters `status: 'available'`). Same shape for `cancel` (refund issued, UI still shows "Cancelar tarefa") and `validate` (transfer done, sheet shows an error, client may tap again → 404). Combined with APP-08 this is how money actions get retried by confused users.
- **Files**: `app:src/apis/tasks/tasks-hooks.ts:61-134`; `app:src/apis/api-client.ts:20`; `app:src/apis/query-client.ts:30-32`.
- **Fix outline (app)**: move invalidations to `onSettled` for start/cancel/validate/finish; on `ECONNABORTED`/no-response errors refetch `taskById` before showing the error and, if the status already advanced, treat as success with the normal toast. (backend) idempotency keys on Stripe calls (A2/A3 have it) so a real double-send is safe.
- **Test**: hook test — `useStartTaskMutation` with a rejecting `mutationFn` still calls `invalidateQueries(taskById)`.

### APP-30 · P2 · NEW · "Contestar conclusão" is a live placeholder on the payment-release screen; no dispute or expiry path exists anywhere
- **Root cause**: `askContest` → `modal.info('Funcionalidade em breve.')` (`index.tsx:88-90`) is the only alternative to "Validar e pagar" on `verification_required`. A client who disagrees with the proof has no action; the task stays `verification_required` forever, the client's card has already been charged (APP-03/A2) and the proxy is never paid. There is no auto-release timer, no admin path, no support contact in the app. SPEC §8.9 explicitly scoped this as the MVP stub, but shipping a dead button on the only money-release screen is a user-visible gap, not polish.
- **Files**: `app:app/(app)/tasks/[id]/index.tsx:88-90,314-325`; no backend route.
- **Fix outline**: product decision (§5). Minimum for 1.0 (app): replace the stub with "Falar com o suporte" → `mailto:`/WhatsApp link with the task id prefilled, and copy explaining the money stays held until resolved. Better (backend): `POST /tasks/:id/dispute` that freezes the task and notifies the owner.
- **Test**: render test — on `verification_required` the secondary action opens the support link (or is absent), never an "em breve" modal.

### APP-20 (NEW item) · P2 · Task detail shows "Tarefa não encontrada — pode ter sido removida" for network errors
Already folded into APP-20 above; called out here because it is new and on the main path.

### APP-23 (NEW item) · P3 · `/wallet` reachable by CLIENT via deep link; backend has no PROXY check
Folded into APP-23 above.

### Cross-slice notes for the backend reviewer (not app findings, observed while verifying)
- A1 P0 "JWT strings → Client Home crashes for any rated user" is overstated: no in-app path rates a CLIENT; the crash needs mass-assignment or a `userType` flip. Suggest P1/P2 on the backend side; the one-line `.toNumber()` fix stands.
- `fetchActiveTasksForUser` (`tasks.repository.ts:191-218`) returns `verification_required` tasks to the proxy; fine for "active" but the app's banner copy says "em andamento".
- Stripe Connect `individual.phone` receives the raw digits the app sends (`"11999990000"`, no `+55`, `create-merchant-account.service.ts:33`); whether Stripe accepts non-E.164 for BR accounts is UNVERIFIABLE here — worth one test-mode call before release.
- The second proxy in a start race gets "Tarefa não encontrada." (status filter) — a `TASK_NOT_AVAILABLE` would let the app show "Outro Proxy aceitou primeiro."

---

## 4. Settled questions (answered from code/docs)

| Question (source) | Answer |
| --- | --- |
| Are JWT `rating`/`walletBalance` strings in the token? Does Zod coerce for the app? (brief) | **Yes, strings; no coercion reaches the app.** `node -e` in `proxy-api`: `JSON.stringify({r:new Prisma.Decimal('4.5'), w:new Prisma.Decimal(0)})` → `{"r":"4.5","w":"0"}`; `jwt.decode(jwt.sign({rating: Decimal('4.5'), wb: Decimal(0)}))` → `{"rating":"4.5","wb":"0"}`. `z.coerce.number()` runs only in the backend strategy (`jwt.strategy.ts:22-25`); the app's `jwtDecode<T>` is a cast. A brand-new user's claim is `"0"` (schema `rating Decimal @default(0)`), `"0" > 0 === false` → no crash; `"4.5" > 0 === true` → `.toFixed` TypeError. |
| Is the History tab really a placeholder? | Yes. `app/(app)/(tabs)/history.tsx:5-13`: `<TabPlaceholder Icon={HistoryIcon} title="Histórico" subtitle="Tudo o que você já fez por aqui." description="Em breve você verá tarefas concluídas, canceladas e poderá filtrar por período." />`. No query hook imported. |
| What does the app do with `requires_action`? Is `confirmPayment`/`handleNextAction` anywhere? | `index.tsx:103-110`: `if (result.status === 'requires_action') toast.success('Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.')`; `clientSecret` unused. `grep -rn "confirmPayment\|handleNextAction\|useStripe\|useConfirmPayment" src app` → `useStripe` only in `AddCardSheet.tsx:1,37` (for `createPaymentMethod`); the other symbols do not appear. |
| Sign-up document photo toggle | `sign-up.tsx:267-272`: `<PhotoUploader uploaded={photoUploaded} onPress={() => setPhotoUploaded((v) => !v)} />`; `:74` `canSubmit = isValid && (!isProxy || photoUploaded)`; payload `:83-91` sends `name,email,phoneNumber,password,userType,documentType,termsAccepted:true` — no `document`, no `documentUrl`. |
| City handling | Create: `CreateTaskStep1.tsx:261-271` `<FormInput name="city" label="Cidade" placeholder="Ex: São Paulo" autoCapitalize="words" … rules={{ required: 'Informe a cidade.' }} />`. Feed: `ProxyHome.tsx:45` `const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte'] as const`, default `'São Paulo'` (`:51`). Backend `tasks.repository.ts:81-85` `where: { status: 'available', ownerId: { isDeleted: false }, locationAddress: { contains: city } }` — no `mode: 'insensitive'`; address built as `` `${street}, ${city} - ${state}, ${zipCode}` `` (`create-task.service.ts:34`). |
| Refetch strategy | `query-client.ts:24` `staleTime: 5 * 60 * 1000`, `:25` `gcTime: 15 * 60 * 1000`, `:28` `refetchOnWindowFocus: false`, `:31` mutations `retry: false`. `grep -rn "refetchInterval\|RefreshControl\|focusManager\|useFocusEffect\|AppState\|refetchOnMount\|onlineManager\|NetInfo" src app` → only `query-client.ts:28`. |
| Proof upload timeout | `api-client.ts:18-21` `axios.create({ baseURL, timeout: 15000 })`; `tasks-apis.ts:46-49` `api.post<void>('/tasks/finish', form, { headers: { 'Content-Type': 'multipart/form-data' } })` — no `timeout` override; `grep -rn timeout src app` → only `api-client.ts:20`. |
| Cards reachability | Only link: `profile.tsx:94-99` `<MenuRow label="Cartão" … onPress={() => router.push('/cards')} />` inside `{isClient ? … : null}`. `cards.tsx:20-24` has no role check, so a PROXY reaches it only via `proxyapp://cards`. |
| F1-Q5 `gestureEnabled: false` intentional? | **Settled: yes, scoped.** Global `false` in `(app)/_layout.tsx:22`; every pushed screen re-enables it (`index.tsx:120`, `create.tsx:35`, `finish.tsx:100`, `cards.tsx:65`). Only the tabs root cannot swipe back to Splash. No change needed; document it. |
| F2-Q7 sticky action bar vs CLAUDE.md | **Settled as a doc fix.** Form/CTA screens (sign-up, create, finish, cards) follow the in-scroll rule; task detail deliberately uses absolute bars with `actionBarPad` (`index.tsx:65,129,290-302`). Add an exception to CLAUDE.md for status-dependent action bars and replace the 140/190 constants with `onLayout`. |
| F2-Q4 scheduled date/time | **Settled for 1.0: drop.** `Tasks` has no scheduled column (`schema.prisma` model `Tasks`), `@react-native-community/datetimepicker` has zero usages; remove the dependency and the SPEC §8.8 fields unless a `scheduledAt` column is added. |
| F1-Q2 which upload endpoint for the document photo | **Settled: none exists.** The only multipart route is `/tasks/finish` (`finish-task.controller.ts:33`), scoped to a task's executor; `FILE_*` errors belong to it. A document upload needs a new backend endpoint; "reuse" is not possible. |
| F3-Q5 can the UI show a merchant "pending" state? | **Settled: yes, data exists.** The JWT carries `stripeAccountId` (`auth-api-types.ts:18`); `stripeAccountId && !stripeAccountReady` = "started, awaiting Stripe"; `!stripeAccountId` = "never started". `MerchantStatusRow.tsx:30` currently collapses both. |
| F3-Q7 Sign in with Apple required? | **Settled: no.** Only email/password auth exists (`auth-apis.ts`); the Apple requirement applies to apps offering third-party social login. Demo accounts for review remain an owner task. |
| F2-Q6 History data source for `payout_failed` / proxy cancellations | **Settled (partly backend gap).** `fetchTasksCompletedByUser` filters `status: 'completed'` (`auth.repository.ts:110-129`); `fetchTasksCreatedByUser` returns all statuses for the owner. A CLIENT history is fully buildable; a PROXY "Canceladas" tab and `payout_failed` rows need a backend change. |
| X1-Q5 is the proof photo mandatory server-side? | **Settled: no.** `finish-task.controller.ts:43` passes `file ?? null`; `finish-task.service.ts:49-61` skips the write when null. The app always sends one. Enforcement is a backend decision (`ParseFilePipe({ fileIsRequired: true })`). |

---

## 5. Open product decisions (owner only)

1. **Where is 3DS completed?** (APP-03) Options: (a) backend confirms with `off_session: true` and treats `requires_action` as a hard decline shown to the proxy ("O pagamento do cliente foi recusado; a tarefa continua disponível"), with the card saved through a client-confirmed SetupIntent so future charges are merchant-initiated; (b) client-initiated charge/authorisation at creation (manual capture, capture on accept); (c) push the client a "Confirme seu pagamento" step. **Recommended default: (a)** — smallest surface, matches how the app already works, and never shows the cardholder challenge to the wrong person. Either way the app ships the `payment.status` banner.
2. **Who pays the fees?** (APP-04) As coded: client pays `offeredPrice`, proxy nets ≈ 75,6 %. SPEC §8.8 / `PriceBreakdown` say the client pays fees on top. **Recommended default: keep the coded model** (no backend money change before release) and fix the copy on both sides.
3. **Served cities for 1.0** (APP-07): SP/RJ/BH picker + backend case-insensitive match, or open geography with a geo-radius feed. **Default: picker + insensitive match**; the feed already has pills for exactly those three.
4. **Document number + photo at sign-up** (APP-06): remove for 1.0 or build storage + upload + a review back-office that flips `isVerified`. **Default: remove**; nothing can consume them today.
5. **Terms / Privacy / Support URLs** (APP-02, APP-30): need hosted pages (same origin as the Stripe return page is simplest — REL). Owner must provide the URLs and a support channel.
6. **Dispute path for `verification_required`** (APP-30): support link for 1.0, or a real `dispute` endpoint plus an auto-release window (e.g. 7 days) so held money cannot be stuck forever. **Default: support link now + decide the auto-release policy before money is live.**
7. **Rating optional or mandatory when validating** (F2-24): SPEC and backend say optional; UI forces it. **Default: optional** (avoid inflated 5-star taps).
8. **Session freshness** (APP-05): periodic `refresh` on focus (cheap, ships now) vs. a `GET /auth/me` endpoint and moving money out of the JWT. **Default: focus refresh for 1.0, `/auth/me` next.**
9. **Profile switching copy** (APP-19): change the copy (default) or implement switching (backend already allows `userType` via `update-profile`, which A1 flags as a hole).
10. **Edit profile** (SPEC §8.14, "Editar dados" stub): ship 1.0 without it (hide the row) or wire `POST /auth/update-profile` (name/phone/password only, never `userType`). **Default: hide the row for 1.0.**
