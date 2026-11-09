# R-REL — Second-pass review: release readiness, store submission, infra and the cross-repo contract

Date: 2026-11-08. Reviewer: R-REL. Read-only on both repos; nothing was modified (`git status`: proxy-app ` M CLAUDE.md`, `?? docs/`; proxy-api ` M CLAUDE.md`).

Paths: `app:` = `/Users/leandromartins/Documents/proxy-app`, `api:` = `/Users/leandromartins/Documents/proxy-api`.

Assigned first-pass material: F3 §2.3/§2.4 + the release/store/config findings; X1 in full (16 findings + the 24-row contract table, re-verified row by row against every controller under `api:/src/modules/*/controllers/*.ts` and every file under `app:/src/apis/**`); A4 §3 CI-related findings + §6.

Evidence I gathered myself (not taken from the first pass): `app.json`, `package.json`, `.env.example`, `file assets/*.png` + visual open of `icon.png`; the installed config plugins (`expo-location/plugin/build/withLocation.js`, `expo-image-picker/plugin/build/withImagePicker.js`, `@stripe/stripe-react-native/lib/commonjs/plugin/withStripe.js`, `@expo/config-plugins/build/ios/Permissions.js`, `@expo/config-plugins/build/ios/PrivacyInfo.js`); the Expo SDK 57 prebuild template extracted from `node_modules/expo/template.tgz` (Info.plist ATS block, debug/main AndroidManifest, Podfile); Android SDK version sources (`react-native/gradle/libs.versions.toml`, `expo-modules-autolinking/.../ExpoRootProjectPlugin.kt`, `expo-modules-core/android/ExpoModulesCorePlugin.gradle`); every `PrivacyInfo.xcprivacy` under `node_modules`; all 24 backend controllers; `stripe.service.ts`, `stripe.module.ts`, `handle-account-updated.service.ts`, `create-merchant-account.service.ts`, `start-task`, `validate-task`, `cancel-task`, `finish-task`, `fetch-task-proof`, `fetch-task-by-id`, `delete-account`, the three card services, `jwt.strategy.ts`, `auth.module.ts`, `main.ts`, `app.module.ts`, `prisma.service.ts`, `env.ts`, `notification.service.ts`, `multer-validation.pipe.ts`, `http.exception.ts`, `zod-validation.pipe.ts`, `error-dictionary.ts` (relevant entries), `prisma/schema.prisma` (Users), `prisma.config.ts`, `package.json`, `.gitignore`, `test/setup/load-env.ts`, `@nestjs/throttler/dist/throttler.guard.js` (default tracker), key *names* of `api:/.env` plus the two non-secret callback URL values.

---

## 1. Verdict table

Legend: verdict ∈ CONFIRMED / REFUTED / PARTIAL / UNVERIFIABLE. "Final" is my severity.

### 1a. F3 — release / store / config findings

| report-id | orig | title | verdict | final | note |
| --- | --- | --- | --- | --- | --- |
| F3-P0-1 | P0 | Store identity is the Expo template (placeholder icons, "proxy-app", `com.anonymous`) | CONFIRMED | P0 | `app.json:3-4,13,21`; `file` → three 1024×1024 colormap PNGs; opened `icon.png`: concentric circles on a grid. |
| F3-P0-2 | P0 | No in-app account deletion, no privacy/terms/support surface | CONFIRMED | P0 | `profile.tsx:34-37,90-102` only "Editar dados" (stub modal) + "Cartão"; no URL constant anywhere; backend `DELETE /auth/account` exists (`delete-account.controller.ts:14-18`) but is blocked by `available` tasks (see REL-04). |
| F3-P1-3 | P1 | Stripe return page not hosted / `PROD_CALLBACK_URL` has no value anywhere | PARTIAL | P1 | `.env.example:12-13` empty, but local `api:/.env:12-13` has `DEV_CALLBACK_URL=http://localhost:3000/profile/stripe-connect` and `PROD_CALLBACK_URL=https://proxy.com.br/profile/stripe-connect` — a domain nothing in either repo shows the owner controls, and `stripe-redirect/index.html` is deployed nowhere. The dev value cannot work on a physical phone (`localhost` is the phone). Blocker stands. |
| F3-P1-4 | P1 | No `eas.json`, no build numbers, no prod API/Stripe key strategy | CONFIRMED | P1 | `ls eas.json app.config.*` → none; `app.json` lacks `owner`, `extra.eas.projectId`, `ios.buildNumber`, `android.versionCode`. ATS claim verified harder: template `Info.plist:29-35` has `NSAllowsArbitraryLoads=false` + `NSAllowsLocalNetworking=true` (so the LAN IP works in dev, any public `http://` host is blocked in every build); Android `usesCleartextTraffic="true"` only in `src/debug/AndroidManifest.xml` → release blocks `http://` too. |
| F3-P1-5 | P1 | `supportsTablet: true` makes iPad a reviewed, screenshot-mandatory target | CONFIRMED | P1 | `app.json:12`. One-line fix; keep P1 because it is the most common first-rejection cause (2.4.1 / 4.0). |
| F3-P2-6 | P2 | Apple Pay entitlement generated although unused | CONFIRMED | P2 | `withStripe.js` `setApplePayEntitlement` always writes `com.apple.developer.in-app-payments=[merchantIdentifier]` when the option is set; `StripeProvider` in `(app)/_layout.tsx:21` passes no `merchantIdentifier`. |
| F3-P2-7 | P2 | Over-declared permissions: "Always" location string, microphone/RECORD_AUDIO | PARTIAL | P2 | True, but understated and the fix is wrong. `applyPermissions` (`Permissions.js:27-34`) writes `permissions[k] || infoPlist[k] || default` — so *removing* `locationAlwaysAndWhenInUsePermission` leaves the English default `Allow $(PRODUCT_NAME) to access your location`; the key must be set to `false`. Also missed: `NSLocationAlwaysUsageDescription` is written today with that English default because `locationAlwaysPermission` is not passed (`withLocation.js:111-118`). Microphone: confirmed (`withImagePicker.js:52-59`). |
| F3-P3-8 | P3 | `expo-doctor` fails on `newArchEnabled`; 8 packages patch-behind | CONFIRMED | P3 | Brief-established; `app.json:10`. |
| F3-P3-9 | P3 | Docs drift (SDK 54 in CLAUDE.md/README, Stripe env var undocumented) | CONFIRMED | P3 | `app:/CLAUDE.md:7`; `README.md:37-39` has only `EXPO_PUBLIC_API_URL`. |
| F3-P3-10 | P3 | Missing `ITSAppUsesNonExemptEncryption`; no EAS Update / runtime policy | CONFIRMED | P3 | No `ios.infoPlist` / `updates` / `runtimeVersion` in `app.json`. |
| F3-P3-11 | P3 | Dead `useMerchantDashboardMutation`; `DELETE /card/:id` typed `{message}` | CONFIRMED | P3 | `wallet-hooks.ts:18-20` has no call site (`wallet.tsx:32` calls `walletApis.merchantDashboard()` directly); `cards-apis.ts:11` vs `delete-user-card.controller.ts:21` `@HttpCode(204)`. Folded into CON-10. |

### 1b. X1 — findings

| report-id | orig | title | verdict | final | note |
| --- | --- | --- | --- | --- | --- |
| X1-P1-1 | P1 | 3DS `requires_action` is a dead end | CONFIRMED | P1 | `start-task.service.ts:87-92` returns the secret to the PROXY; `tasks/[id]/index.tsx:104-108` only toasts; `stripe.service.ts:78-82` confirms without `off_session`. Cross-slice root cause (A2/F2); listed here as CON-01. |
| X1-P1-2 | P1 | `/auth/create` accepts self-asserted `isVerified`, `rating`, `walletBalance`, counters | CONFIRMED | P1 | `create-account.controller.ts:17-22`; `create-account.service.ts:52-53` spreads `...data` into Prisma. |
| X1-P1-3 | P1 | Price breakdown contradicts what the backend charges | CONFIRMED | P1 | `PriceBreakdown.tsx:20-22,64,75` ("Total a pagar" = price + 20 % + Stripe); `start-task.service.ts:60` charges `offeredPrice*100`; `validate-task.service.ts:55-57` deducts both fees from the proxy. Product decision (§6). |
| X1-P1-4 | P1 | `/tasks/start` mutates state before the charge | CONFIRMED | **P0** | `start-task.service.ts:44-53` flips status + inserts mapping before `fetchUserCardService` (throws 404) and before Stripe. Re-graded P0 together with A2's reproduced Decimal→non-integer centavos bug on line 60 (≈9 % of real prices fail *after* the flip). |
| X1-P2-5 | P2 | JWT `rating`/`walletBalance` are strings at runtime, typed `number` | CONFIRMED | P2 | `authenticate.service.ts:44,52` embed Prisma `Decimal`; `jwt.strategy.ts:22-25` coerces server-side only; `auth-store.ts:20` no coercion; `ClientHome.tsx:63` `.toFixed` → latent `TypeError`. |
| X1-P2-6 | P2 | Zod / Nest built-in error bodies reach the user in English | CONFIRMED | P2 | `zod-validation.pipe.ts:13-17`; `api-client.ts:57-58` surfaces `message` verbatim. |
| X1-P2-7 | P2 | JWT never expires; only refresh trigger is Stripe onboarding | CONFIRMED | P2 | `auth.module.ts:49` `signOptions: { algorithm: 'RS256' }` only; `useStripeOnboarding.ts:47` is the sole `refreshSession` call. |
| X1-P2-8 | P2 | Task responses leak owner `email`, `phoneNumber`, `stripeCustomerId` to every proxy | CONFIRMED | **P1** | `tasks.repository.ts` select includes `email`, `phoneNumber`, `stripeCustomerId` in `fetchAllTasks` (public feed, any PROXY, any city) and the active/detail selects. Re-graded P1: LGPD exposure of every client with an open task, and it makes the store privacy declarations wrong ("data shared with other users"). |
| X1-P2-9 | P2 | City feed filter is free-text, case-sensitive `contains` | CONFIRMED | P2 | `tasks.repository.ts` `locationAddress: { contains: city }` (no `mode`); `create-task.service.ts:34` composes the string. |
| X1-P2-10 | P2 | JWT schema requires `phoneNumber: string`; null phone → 500 | CONFIRMED (mechanism) | P2 | `jwt.strategy.ts:15,50`; `schema.prisma` `phoneNumber String?`; `create-account.controller.ts:13` optional. A `ZodError` from `validate()` is not an `HttpException` → `HttpExceptionFilter` 500 path (`http.exception.ts:48-59`). App always sends a phone, so latent. |
| X1-P2-11 | P2 | `/tasks/create` inserts the task before validating the card | CONFIRMED | P2 | `create-task.service.ts:36-50`; `create-task.controller.ts:26-29` accepts `cardDetails: {}` (service returns `null` → no card check at all). |
| X1-P3-12 | P3 | SPEC §3.3 error-dictionary drift | CONFIRMED | P3 | Code: `tasks.transferFailed` = `TASK_TRANSFER_FAILED` (`error-dictionary.ts:155-159`) is what validate throws; a second `payment.transferFailed` = `TRANSFER_FAILED` (`:169-172`) exists and is unused by validate; SPEC line 215/867 say `TRANSFER_FAILED`. |
| X1-P3-13 | P3 | SPEC says multipart field `photo`; code uses `file`; HEIC undocumented | CONFIRMED | P3 | `finish-task.controller.ts:33` `FileInterceptor('file')`; `tasks-apis.ts:45`; SPEC line 905 `photo`. Also new: `.heif` is served as `image/jpeg` (CON-11). |
| X1-P3-14 | P3 | SPEC §3.4/§4 missing or wrong shapes | CONFIRMED | P3 | SPEC has no `session/refresh` / `/proof` route lines; `completedAt` at SPEC:319 is not in any task select. |
| X1-P3-15 | P3 | App type lies with no runtime impact | CONFIRMED | P3 | `wallet-api-types.ts:10` `offeredPrice: number` vs Decimal string; `cards-apis.ts:11`; `ACTIVE_TASK_STATUSES` has zero consumers; `TMerchantAccountResponse.stripeAccountId?` never set (`create-merchant-account.service.ts:80`). |
| X1-P3-16 | P3 | Global 401 handler fires on business 401s | CONFIRMED | P3 | `api-client.ts:42-45`. |
| X1-P3-17 | P3 | Client-side validation does not mirror backend limits | CONFIRMED | P3 | `validate-task.controller.ts:14` `max(500)`, `ValidateTaskSheet.tsx:227` `TextInput` without `maxLength`; `create-account.controller.ts:11` `password: z.string()` (no min); `reset-password.controller.ts:10` `min(6)`. |

### 1c. X1 — contract table, row by row

Every row was re-checked against the controller's Zod schema / decorators and the app file. Column "verdict" refers to the row as written in X1 §3b.

| # | Route | verdict | note |
| --- | --- | --- | --- |
| 1 | `POST /auth/create` | CONFIRMED | Schema `create-account.controller.ts:8-23` (14 keys, `@HttpCode(200)`, `@Throttle auth 5/min`). App sends `name,email,phoneNumber,password,userType,documentType,termsAccepted:true` (`sign-up.tsx:83-91`); the CPF/CNPJ **number** (`document`) and the photo are never sent — and the photo UI is a boolean toggle (`sign-up.tsx:270`, F1-P1). |
| 2 | `POST /auth/session` | CONFIRMED | `authenticate.controller.ts:8-11,19-22`; 401 `USER_INVALID_CREDENTIALS` (`error-dictionary.ts:27-31`). |
| 3 | `GET /auth/session/refresh` | CONFIRMED | `refresh-session.controller.ts:9-18`; service re-signs the same 17 claims (`refresh-session.service.ts:22-40`). |
| 4 | `POST /auth/forgot-password` | CONFIRMED | `{ message }` at `forgot-password.service.ts:29-30,59-60`. |
| 5 | `POST /auth/verify-reset-code` | CONFIRMED | `code: z.string().length(6)`; `{ message }` (`verify-reset-code.service.ts:45`). |
| 6 | `POST /auth/reset-password` | CONFIRMED | `newPassword: z.string().min(6)` (`reset-password.controller.ts:10`). |
| 7 | `POST /auth/update-profile` | CONFIRMED | `update-profile.controller.ts:11-17`: `name` + `userType` **required**, so any future "edit profile" call must resend `userType` (and may switch it). No app client. |
| 8 | `POST /auth/merchant-account` | CONFIRMED | `create-merchant-account.service.ts:80` returns `{ accountLinkUrl }` only; `@HttpCode(200)`. No PROXY check (A1). |
| 9 | `GET /auth/merchant-dashboard` | CONFIRMED | `create-merchant-dashboard-link.service.ts:16-33`. |
| 10 | `GET /auth/transaction-history` | CONFIRMED | `auth.repository.ts:92-131` passthrough selects (Decimal `offeredPrice` → string); `netAmount` computed as number (`fetch-transaction-history.service.ts:39-45`). |
| 11 | `DELETE /auth/account` | CONFIRMED + addendum | 204, 409 `USER_HAS_ACTIVE_TASKS` (`error-dictionary.ts:58-62`). Addendum: `fetchActiveTasksForUser` includes the owner's `available` tasks (`tasks.repository.ts` OR-branch 1), so a client with a posted, un-accepted task **cannot delete** without cancelling first (A4-P1-1 is the same root cause). |
| 12 | `POST /tasks/create` | CONFIRMED | `create-task.controller.ts:11-30`; `cardDetails` both-optional object; `@HttpCode(201)`; `{ id }`. No server-side min price. |
| 13 | `GET /tasks/fetch` | CONFIRMED | `fetch-tasks.controller.ts:8-16` (`page` string→number ≥ 1, default `'1'`); `fetch-tasks.service.ts:14-15` `perPage=10`, `skip=(page-1)*10`; app `params: { city, page }` serialises the number. |
| 14 | `GET /tasks/active` | CONFIRMED | `tasks.repository.ts` owner branch includes `available`. |
| 15 | `GET /tasks/:id` | CONFIRMED | `fetch-task-by-id.service.ts:39-41` 404 for non-owner CLIENT (PROXIES may read any task); `:52-57` adds `payment`, `executorId`, `executor`. |
| 16 | `GET /tasks/:id/proof` | CONFIRMED + addendum | `fetch-task-proof.controller.ts:22-35`, `Cache-Control: private, max-age=300`; `fetch-task-proof.service.ts:63-69` maps only `.png/.webp/.heic`; a `.heif` upload (allowed by `multer-validation.pipe.ts:16-17`) is served as `image/jpeg` (CON-11). |
| 17 | `POST /tasks/start` | CONFIRMED | `start-task.controller.ts:11-13`; result union `start-task.service.ts:83-92`; 403 `USER_NOT_PROXY`/`CANNOT_START_OWN_TASK`, 404 `NO_SAVED_CARD_FOUND`, 402 `PAYMENT_FAILED`. |
| 18 | `POST /tasks/finish` | CONFIRMED | `FileInterceptor('file')`, body `{ taskId }`, `file ?? null` (`finish-task.controller.ts:33-43`); limits/filter `multer-validation.pipe.ts:23-48` (memoryStorage, 10 MB, mimetype allow-list). |
| 19 | `POST /tasks/validate` | CONFIRMED | `validate-task.controller.ts:11-15`; 409 `PROXY_ACCOUNT_NOT_READY` (`validate-task.service.ts:50-52`), 500 `TASK_TRANSFER_FAILED` (`:70-73`). |
| 20 | `POST /tasks/cancel` | CONFIRMED | `cancel-task.service.ts:34-47` (`available` or `in_progress` < 1 h, `differenceInHours`), refund path `:54-67` → 500 `REFUND_FAILED` unless `refund.status === 'succeeded'`. |
| 21 | `POST /card/create` | CONFIRMED | `@HttpCode(201)`; `token` = PaymentMethod id (`create-user-payment-method.service.ts:46`); 404 `USER_NOT_FOUND` when no `stripeCustomerId` (`:26-28`), 400 `CARD_CREATION_FAILED`. |
| 22 | `GET /card/fetch` | CONFIRMED | 404 `NO_SAVED_CARD_FOUND` (`fetch-user-card.service.ts:16-18`). |
| 23 | `DELETE /card/:id` | CONFIRMED | 204; 404 `CARD_NOT_FOUND`, 403 `CANNOT_DELETE_CARD` (`delete-user-card.service.ts:23-28`). |
| 24 | `POST /stripe/webhook` | CONFIRMED | `stripe-webhook.controller.ts:18-46`; one `STRIPE_WEBHOOK_SECRET` (`stripe.module.ts:20-24`). |

Error envelope and JWT claim list: CONFIRMED (`http.exception.ts:27-45`, `zod-validation.pipe.ts:13-17`, `authenticate.service.ts:40-58`, `jwt.strategy.ts:10-30`). Net result: **24/24 rows verified, 0 corrected, 2 addenda (rows 11, 16).** The contract itself is in sync between the two repos; the drift is SPEC-only (X1-P3-12..15), the wire-type lies (CON-10) and the mass-assignable create body (CON-03).

### 1d. A4 — CI-readiness findings and §6

| report-id | orig | title | verdict | final | note |
| --- | --- | --- | --- | --- | --- |
| A4-P2-4 | P2 | `test/.env.test` is git-tracked but rewritten on every e2e run | CONFIRMED | P2 | `git ls-files test/.env.test` → tracked; `.gitignore` has no entry. (Working tree is clean right now, so a run since then was reverted; the mechanism stands.) |
| A4-P2-5 | P2 | `load-env.ts` does not override shell variables → TRUNCATE on the developer DB | CONFIRMED | P2 | `test/setup/load-env.ts:4` `config({ path })` without `override`. |
| A4-P2-6 | P2 | Type errors in tests never fail a run; e2e JWT factory drifted | CONFIRMED | P2 | `tsconfig.json` `"isolatedModules": true`; brief-established `tsc` error at `test/factories/user.factory.ts:64`. |
| A4-P3 | P3 | `lint` runs `eslint --fix` | CONFIRMED | P3 | `package.json:18`. |
| A4-§6 | — | No CI/Dockerfile/.nvmrc/engines; Node 26 local vs `@types/node ^22` | CONFIRMED | P2 | `ls .github .gitlab-ci.yml .circleci Dockerfile Procfile fly.toml render.yaml railway.* .nvmrc .node-version` → none; `node -v` = v26.13.0; `package.json:42` `@types/node ^22`. Folded into REL-10. |

---

## 2. Canonical findings register (deduped, ordered by severity then blast radius)

### REL-01 — P0 — Store identity is the Expo template
Root cause: `app.json` still carries the `create-expo-app` defaults; icon/adaptive/splash PNGs are the template placeholders; ids are `com.anonymous.proxyapp`, which is permanent after the first upload.
Files: `app:/app.json:3-4,8,13,16-21`; `app:/assets/{icon,adaptive-icon,splash-icon}.png`.
Fix outline (app): choose the final reverse-DNS id (owner's domain; **not** `proxy.com.br` unless owned), set `name`, `ios.displayName`, `android.package`/`ios.bundleIdentifier`; replace the three PNGs (1024² opaque icon; adaptive foreground with art inside the central 66 % circle; splash); set `android.adaptiveIcon.backgroundColor` to the brand background. Do this *before* `eas build` — EAS registers the bundle id and provisioning on the first build.
Test that proves it: `npx expo config --type introspect | jq '.ios.bundleIdentifier,.android.package,.name'` shows the final values; `file assets/*.png` no longer matches the template byte sizes (22380/17547).
Collapses: F3-P0-1.

### REL-02 — P0 — No in-app account deletion, no privacy policy / terms / support URLs
Root cause: Profile has only a stub "Editar dados" and "Cartão"; no "Excluir conta", no "Termos e Privacidade" row, no URL constants; the sign-up checkbox names the Terms and Privacy Policy as bold text with no link (`sign-up.tsx:277-283`). Apple 5.1.1(v) and Play "Account deletion" policy are hard gates; both consoles require a privacy-policy URL for an app collecting location, photos and payment data.
Files: `app:/app/(app)/(tabs)/profile.tsx:34-37,81-102`; `app:/app/(auth)/sign-up.tsx:277-283`; backend route `api:/src/modules/auth/controllers/delete-account.controller.ts:9-18`.
Fix outline (app + static hosting): add "Termos e Privacidade" and "Excluir conta" rows per SPEC §8.14; deletion = double confirm → `DELETE /auth/account` → on 409 `USER_HAS_ACTIVE_TASKS` show the message and deep-link to the active task; on 204 `clearSession()`. Publish privacy policy, terms, support page and an account-deletion request page on the same https origin as `stripe-redirect/index.html` (one static site). Put the URLs in a `src/common/constants/links.ts` and open them with `expo-web-browser`.
Test that proves it: manual store-review script — sign in, Profile → Excluir conta → confirm → app returns to sign-in and `POST /auth/session` with the old credentials gives 404 `USER_NOT_FOUND`.
Collapses: F3-P0-2.

### REL-03 — P0 — `/tasks/start` corrupts state before charging, and the integer-centavos bug makes it routine
Root cause: status flip + mapping insert happen before the card lookup and Stripe calls; `offeredPrice * 100` on a `Prisma.Decimal` yields non-integer amounts for ≈9 % of prices (A2 reproduced), so Stripe rejects *after* the flip.
Files: `api:/src/modules/tasks/use-cases/start-task.service.ts:44-62,95-98`.
Fix outline (api): card + `paymentIntents.create/confirm` first; then `updateMany({ where: { id, status: 'available' } })` + mapping insert in one `$transaction`, bail if `count === 0`; `amount: Math.round(Number(offeredPrice) * 100)`; on Stripe failure after a PI exists, `paymentIntents.cancel` and mark the payment `failed`. Owner of this fix: backend reviewer; listed here because the contract (`TStartTaskResult`) does not change.
Test that proves it: `test/tasks/start-task.e2e-spec.ts` — owner without card → 404 and task still `available`, no mapping, no payment row; `offeredPrice: 10.03` → `createPaymentIntent` called with `amount: 1003`.
Collapses: X1-P1-4 (+ A2 P0 start-task / P0 integer, F2 start-task).

### REL-04 — P1 — Account deletion dead-ends for a client with a posted task
Root cause: `DeleteAccountService` reuses `fetchActiveTasksForUser`, whose owner branch includes `available`; a client who posted a task nobody accepted gets 409 and must find and cancel it first. For store compliance the in-app deletion must be completable; A4-P1-1's red e2e encodes the opposite expectation.
Files: `api:/src/modules/auth/use-cases/delete-account.service.ts:21-25`; `api:/src/modules/tasks/repository/tasks.repository.ts` (owner status list incl. `available`).
Fix outline (api): in `DeleteAccountService`, auto-cancel the user's `available` tasks (no payment exists for them) inside the same transaction and block only on `in_progress`/`verification_required`; keep the 409 copy for those. Update `delete-account.e2e-spec.ts` accordingly (green suite).
Test that proves it: `test/auth/delete-account.e2e-spec.ts` "available task is auto-canceled and account deleted (204)".
Collapses: A4-P1-1 (dedupe pointer; owned by the tests reviewer), contract row 11 addendum.

### REL-05 — P1 — Stripe Connect return page is not hosted; callback URLs point nowhere usable
Root cause: the only https return target is `PROD_CALLBACK_URL=https://proxy.com.br/profile/stripe-connect` in the local `.env`, a domain not shown to be owned; `stripe-redirect/index.html` (which performs the `proxyapp://wallet` hop) is deployed nowhere; `DEV_CALLBACK_URL=http://localhost:3000/...` resolves to the phone itself on a device. `return_url === refresh_url` (`stripe.service.ts:144-145`), so an expired link and a finished onboarding are indistinguishable.
Files: `api:/.env:12-13` (values), `api:/.env.example:12-13`, `api:/src/modules/auth/use-cases/create-merchant-account.service.ts:67-78`, `api:/src/stripe/stripe.service.ts:141-151`, `app:/stripe-redirect/index.html:7,77-82`, `app:/src/feature/wallet/hooks/useStripeOnboarding.ts:9,37-48`.
Fix outline: host `stripe-redirect/` on the static origin from REL-02 (e.g. `https://<domain>/stripe/return`), set `PROD_CALLBACK_URL` to it and pass `refresh_url: <same>?refresh=1`; for dev use a LAN-reachable https tunnel (ngrok/cloudflared) or the simulator. Document both in `api:/CLAUDE.md` and `app:/README.md`.
Test that proves it: on a physical device, finish test-mode onboarding → browser closes automatically → Wallet shows "Recebimento configurado" only after `GET /auth/session/refresh` returns `stripeAccountReady: true`.
Collapses: F3-P1-3 (+ A1 P2 refresh_url note).

### REL-06 — P1 — No build/release configuration (EAS profiles, env per profile, versioning, https API)
Root cause: no `eas.json`, no `owner`/`projectId`, no build numbers; `EXPO_PUBLIC_API_URL` is an `http://` LAN IP and the Stripe key is `pk_test_`; both are inlined at bundle time. iOS: `NSAllowsArbitraryLoads=false` (only local networking is exempt), Android release: no `usesCleartextTraffic` → a public `http://` API is unreachable from a store build. A build without `.env` ships `baseURL: undefined` and `publishableKey: ''` (`api-client.ts:9-21`, `(app)/_layout.tsx:7,21`).
Files: `app:/app.json`, `app:/.env.example:1-2`, `app:/src/apis/api-client.ts:9-21`, `app:/app/(app)/_layout.tsx:7,21`; template `ios/HelloWorld/Info.plist:29-35`, `android/app/src/debug/AndroidManifest.xml`.
Fix outline (app): see §4.3 for the minimal `eas.json`; `eas init` to get `owner` + `extra.eas.projectId`; `appVersionSource: "remote"` + `autoIncrement` on production; backend served over https with a real hostname; fail fast at startup when either `EXPO_PUBLIC_*` is empty and `__DEV__` is false.
Test that proves it: `eas build -p ios --profile preview --local` succeeds and `strings` of the bundle contain the https API URL and a `pk_live_`/`pk_test_` key as intended.
Collapses: F3-P1-4, F3-P3-10 (ITSAppUsesNonExemptEncryption / updates policy).

### REL-07 — P1 — Backend throttler behind a reverse proxy rate-limits the whole platform as one client
Root cause: `ThrottlerGuard` tracks by `req.ip` (`throttler.guard.js:141-143`); Express only populates the real client IP when `trust proxy` is set, and `main.ts` never sets it. On any managed host (Railway, Render, Fly, Heroku — all terminate TLS in a proxy) every request arrives from the proxy's address: **100 requests/min for all users combined, and 5 sign-ins/min for the whole user base.**
Files: `api:/src/main.ts:8-17`, `api:/src/app.module.ts:28-34`.
Fix outline (api): `app.getHttpAdapter().getInstance().set('trust proxy', 1)` (or the host-specific hop count) in `main.ts`; optionally a custom `getTracker` reading `Fly-Client-IP`/`X-Forwarded-For`. Add a startup log of the resolved tracker for the first request in non-prod.
Test that proves it: e2e with `NODE_ENV=development` + `supertest` sending `X-Forwarded-For: 1.1.1.1` vs `2.2.2.2` → 6th `/auth/session` from `1.1.1.1` is 429 while `2.2.2.2` still gets 401/404 (requires un-skipping the throttler for that spec).
Collapses: — (new, §3).

### REL-08 — P1 — Task endpoints expose client PII and Stripe customer ids to every proxy
Root cause: the three task selects include `ownerId.email`, `phoneNumber`, `stripeCustomerId`; `/tasks/fetch` is readable by any PROXY for any city.
Files: `api:/src/modules/tasks/repository/tasks.repository.ts` (`fetchAllTasks` select ~66-79; same block in the active and by-id selects).
Fix outline (api + app): drop the three fields from the public selects (keep a private `fetchTaskForCharge` with `stripeCustomerId` for `start-task`); trim `TTaskOwner` in `tasks-api-types.ts:54-65`. Update the store privacy answers once this is done ("contact info shared with other users" becomes "no").
Test that proves it: `test/tasks/fetch-tasks.e2e-spec.ts` asserts `body[0].ownerId` has no `email`/`phoneNumber`/`stripeCustomerId` keys.
Collapses: X1-P2-8.

### REL-09 — P1 — Fee model shown to the client contradicts what is charged and paid
Root cause: app computes "Total a pagar = preço + 20 % + Stripe"; backend charges the bare price and deducts both fees from the proxy.
Files: `app:/src/feature/tasks/components/PriceBreakdown.tsx:6-8,20-22,64-75`; `api:/src/modules/tasks/use-cases/start-task.service.ts:60`; `api:/src/modules/tasks/use-cases/validate-task.service.ts:55-57`; `api:/src/modules/auth/use-cases/fetch-transaction-history.service.ts:39-45`.
Fix outline: product decision (§6 Q1); then either (a) app shows "Você paga R$ X" and the proxy card shows "Você recebe ≈ R$ Y" using the backend formula, or (b) backend charges `price + fees` and transfers `price`. Either way centralise the formula in one backend-owned constant block and expose it on `GET /tasks/:id` (`platformFee`, `proxyEarnings` already exist).
Test that proves it: snapshot test of `PriceBreakdown` for R$ 100 matching the number `validate-task.service.spec.ts` asserts for the proxy (`7562` centavos today).
Collapses: X1-P1-3 (+ A2 fee-model finding, F2 breakdown).

### REL-10 — P1 — No deployable backend: no Dockerfile/Procfile, CI, health check, migration step, file storage, or proxy-aware bootstrap
Root cause: the repo runs only on a laptop. See §4.4 for the per-item table (each with file:line and the minimal fix). Headline blockers: proof images are written to `src/tmp` under `process.cwd()` and vanish on redeploy (`finish-task.service.ts:54-58`, `fetch-task-proof.service.ts:45-50`); one webhook secret for two endpoint families (`stripe.module.ts:20-24`, A3-P1); `prisma migrate deploy` is not in any script (`package.json:8-24`); no health route; no `trust proxy` (REL-07); SES sender is a `@gmail.com` address (`api:/.env:18`).
Files: `api:/package.json:8-24`, `api:/src/main.ts`, `api:/src/prisma/prisma.service.ts`, `api:/src/modules/tasks/use-cases/finish-task.service.ts:46-61`, `api:/src/modules/tasks/use-cases/fetch-task-proof.service.ts:45-54`, `api:/src/stripe/stripe.module.ts`, `api:/src/notification/notification.service.ts:25-36`.
Fix outline (api): add `Dockerfile` (node 22-alpine, `npm ci`, `npm run build`, `CMD ["sh","-c","npx prisma migrate deploy && node dist/src/main"]`), `engines.node: "22.x"` + `.nvmrc`; `GET /health` (no auth, `@SkipThrottle`); S3-compatible bucket for proofs; second webhook secret + route; `trust proxy`; GitHub Actions running `prisma generate → tsc → eslint (no --fix) → jest → test:e2e`. Hosting default (recommendation): Railway or Render web service + managed Postgres, Cloudflare R2 or AWS S3 for images, Cloudflare Pages for the static site (privacy/terms/support/stripe-return).
Test that proves it: CI workflow green on `main`; `curl https://<api>/health` → 200; a proof uploaded from the app is still served after a redeploy.
Collapses: A4-§6, A4-P2-4, A4-P2-5, A4-P2-6, A4-P3 (lint), + pointers to A1 (SES/cors), A2 (local disk), A3 (webhook secrets).

### REL-11 — P1 — `supportsTablet: true`
Files: `app:/app.json:12`. Fix: `"supportsTablet": false` for 1.0. Test: App Store Connect no longer asks for 13" iPad screenshots. Collapses: F3-P1-5.

### CON-01 — P1 — 3DS `requires_action` dead end (cross-slice)
Files: `api:/src/modules/tasks/use-cases/start-task.service.ts:87-92`; `api:/src/stripe/stripe.service.ts:63-82`; `app:/app/(app)/tasks/[id]/index.tsx:104-108`. Fix: confirm with `off_session: true` and treat `requires_action` as a hard failure in the same transaction as REL-03; remove the `requires_action` branch from `TStartTaskResult` once the backend no longer returns it. Test: `start-task.e2e-spec.ts` `confirmPaymentIntent → { status: 'requires_action' }` → 402 `PAYMENT_FAILED`, task still `available`. Collapses: X1-P1-1 (+ A2/F2 3DS findings).

### CON-02 — P2 — Decimal claims in the JWT are strings on the app side
Files: `api:/src/modules/auth/use-cases/{authenticate,refresh-session,update-profile}.service.ts` (payload), `app:/src/store/auth-store/auth-store.ts:17-24`, `app:/src/feature/home/components/ClientHome.tsx:63`, `app:/src/apis/auth/auth-api-types.ts:25,28`. Fix (api, one place): sign `rating: Number(user.rating)`, `walletBalance: user.walletBalance.toNumber()`; (app, defensive): normalise in `decodeOrNull`. Test: new `test/auth/refresh-session.e2e-spec.ts` decodes the token and asserts `typeof walletBalance === 'number'`. Collapses: X1-P2-5 (+ A1/F1 "Decimal-as-string" findings).

### CON-03 — P1 — `POST /auth/create` mass assignment
Files: `api:/src/modules/auth/controllers/create-account.controller.ts:17-22`, `api:/src/modules/auth/use-cases/create-account.service.ts:52-53`. Fix: remove the five privileged keys, `.strict()`, pass an explicit object to `authRepository.create`. Test: `create-account.e2e-spec.ts` posting `isVerified: true, rating: 5` → 400 (strict) or row has `isVerified=false`. Collapses: X1-P1-2 (+ A1 F-04).

### CON-04 — P2 — English validation / throttler / multer messages reach the user
Files: `api:/src/pipes/zod-validation.pipe.ts:13-20`, `app:/src/apis/api-client.ts:54-67`. Fix: PT message + `errorCode: 'VALIDATION_FAILED'` in the pipe; `extractErrorMessage` special-cases 429/413 and ignores bodies without `errorCode`. Test: e2e `comment` of 501 chars → `body.message` is Portuguese; app unit test for `extractErrorMessage({ status: 429 })`. Collapses: X1-P2-6, X1-P3-17.

### CON-05 — P2 — JWT never expires; wallet balance only refreshed after onboarding
Files: `api:/src/modules/auth/auth.module.ts:49`, `app:/src/feature/wallet/hooks/useStripeOnboarding.ts:47`, `app:/app/(app)/(tabs)/wallet.tsx:21`. Fix: `expiresIn: '7d'`; app calls `useRefreshSessionMutation` on Wallet focus and after a validate succeeds; 401 → sign-in (already wired). Test: e2e token with `exp` in the past → 401. Collapses: X1-P2-7 (+ F3-P1 "JWT never refreshed", F1 stale session).

### CON-06 — P2 — `JwtStrategy` requires `phoneNumber: string` while the column is nullable
Files: `api:/src/modules/auth/utils/jwt.strategy.ts:15,49-50`, `app:/src/apis/auth/auth-api-types.ts:17`. Fix: `.nullable()` + `string | null`. Test: e2e `createUser({ phoneNumber: null })` → any guarded route returns 200, not 500. Collapses: X1-P2-10.

### CON-07 — P2 — City feed filter is free-text, case-sensitive substring
Files: `api:/src/modules/tasks/repository/tasks.repository.ts` (`locationAddress: { contains: city }`), `api:/src/modules/tasks/use-cases/create-task.service.ts:34`, `app:/src/feature/tasks/components/CreateTaskStep1.tsx` (free-text city), `app:/src/feature/home/components/ProxyHome.tsx:46,51`. Fix: store `city` as a column (migration), filter `equals` + `mode: 'insensitive'`; app Step 1 uses the same `CITIES` picker. Test: `fetch-tasks.e2e-spec.ts` with `city=são paulo` returns the "São Paulo" task. Collapses: X1-P2-9.

### CON-08 — P2 — `POST /tasks/create` inserts before validating the card; `cardDetails: {}` accepted
Files: `api:/src/modules/tasks/use-cases/create-task.service.ts:36-50`, `api:/src/modules/tasks/controllers/create-task.controller.ts:26-29`. Fix: validate card first; `cardDetails` as `z.union([{savedCard}, {token}])`; `offeredPrice: z.number().min(10).max(10000).multipleOf(0.01)`. Test: e2e with a stale `savedCard` → 404 and no task row. Collapses: X1-P2-11 (+ A2 price-validation finding).

### CON-09 — P3 — SPEC drift (codes, field names, missing routes, money types)
Files: `app:/SPEC.md:215,319,867,905` and §3.4/§4; `api:/src/exception/error-dictionary.ts:155-172`. Fix: regenerate SPEC §3.3/§3.4/§4.2 from `error-dictionary.ts`, the controller list and `tasks-api-types.ts`; delete the unused `payment.transferFailed` entry or make validate use it. Test: none (docs). Collapses: X1-P3-12, X1-P3-13, X1-P3-14.

### CON-10 — P3 — App wire-type lies and dead code
Files: `app:/src/apis/wallet/wallet-api-types.ts:10,30`, `app:/src/apis/cards/cards-apis.ts:11`, `app:/src/apis/tasks/tasks-api-types.ts:21-26`, `app:/src/apis/wallet/wallet-hooks.ts:18-20`. Fix: `offeredPrice: string`; `delete → Promise<void>`; remove `ACTIVE_TASK_STATUSES` and `stripeAccountId?`; use or delete `useMerchantDashboardMutation`. Test: `tsc` after making `walletApis.transactionHistory` return `offeredPrice: string` would flag any arithmetic. Collapses: X1-P3-15, F3-P3-11.

### CON-11 — P3 — `.heif` proofs are served as `image/jpeg`
Files: `api:/src/modules/tasks/use-cases/fetch-task-proof.service.ts:63-69` vs `api:/src/pipes/multer-validation.pipe.ts:16-17`. Fix: add `if (lower.endsWith('.heif')) return 'image/heif'`, or normalise HEIC/HEIF to JPEG on upload (also fixes Android, which cannot render HEIC). Test: unit test for `mimeTypeFromPath('x.heif')`. Collapses: — (new).

### CON-12 — P3 — Global 401 handler also fires for business 401s
Files: `app:/src/apis/api-client.ts:39-48`. Fix: only clear when the request carried an `Authorization` header. Test: app unit test. Collapses: X1-P3-16.

---

## 3. Missed by the first pass

### [P1] REL-07 — Throttler behind a proxy counts all users as one IP
File: `api:/src/main.ts:8-17`; `api:/node_modules/@nestjs/throttler/dist/throttler.guard.js:141-143`
Evidence:
```ts
// throttler.guard.js
async getTracker(req) { return req.ip; }
// main.ts — no app.set('trust proxy', …) anywhere in src/ (grep: 0 hits)
```
Why it matters: every managed host puts a TLS-terminating proxy in front of the container; without `trust proxy`, `req.ip` is that proxy. The `auth` throttler (5/min) then allows five sign-ins per minute **platform-wide**, and the default 100/min caps the whole app. Local dev and the e2e suite (`skipIf NODE_ENV==='test'`) never reveal it.
Suggested fix: `app.getHttpAdapter().getInstance().set('trust proxy', 1)` in `main.ts` (hop count per host); keep the 5/min on auth.
Confidence: high.

### [P2] REL-12 — Location purpose strings: "Always" keys get the English default, and the proposed fix would not remove them
File: `app:/app.json:36-42`; `app:/node_modules/expo-location/plugin/build/withLocation.js:110-119`; `app:/node_modules/@expo/config-plugins/build/ios/Permissions.js:27-34`
Evidence:
```js
infoPlist[permission] = permissions[permission] || infoPlist[permission] || description;
// defaults: NSLocationAlwaysAndWhenInUseUsageDescription / NSLocationAlwaysUsageDescription /
//           NSLocationWhenInUseUsageDescription = 'Allow $(PRODUCT_NAME) to access your location'
```
Why it matters: today `NSLocationAlwaysUsageDescription` is written in English (not passed in `app.json`), and simply deleting `locationAlwaysAndWhenInUsePermission` (F3's fix) would turn that key English too. App Review reads all purpose strings; a pt-BR app with English "Always" strings for a permission it never requests invites a 5.1.1 question.
Suggested fix: `["expo-location", { "locationWhenInUsePermission": "…", "locationAlwaysAndWhenInUsePermission": false, "locationAlwaysPermission": false }]`; same pattern for `expo-image-picker`: `"microphonePermission": false`.
Confidence: high (plugin source).

### [P2] REL-13 — No app-level `PrivacyInfo.xcprivacy` is generated
File: `app:/app.json` (no `ios.privacyManifests`); `app:/node_modules/@expo/config-plugins/build/ios/PrivacyInfo.js:44-50`; template `ios/HelloWorld/` has no manifest
Evidence: `withPrivacyInfo` returns early unless `config.ios.privacyManifests` is set. Library manifests present in `node_modules`: `react-native/React/Resources`, `react-native/ReactCommon/cxxreact`, `react-native/ReactCommon/react/timing`, RCT-Folly/boost/glog podspecs, `expo-constants/ios`, `expo-file-system/ios`, `expo-system-ui/ios`. **No** manifest ships inside `@stripe/stripe-react-native` (its iOS code is in the `Stripe ~> 25.11.0` CocoaPods, `stripe-react-native.podspec:5,47-53`, which carry their own `PrivacyInfo.xcprivacy` in `StripeCore` — verify after `pod install`: `find ios/Pods -name PrivacyInfo.xcprivacy`). `expo-location`, `expo-image-picker`, `expo-secure-store`, `expo-web-browser`, `expo-router` ship none (they do not use required-reason APIs directly).
Why it matters: Apple's ITMS-91053 is a warning e-mail today, not a rejection, but the app's own target uses `UserDefaults` (via RN/Expo) and file timestamps; Expo recommends declaring the four standard reasons.
Suggested fix: `"ios": { "privacyManifests": { "NSPrivacyAccessedAPITypes": [ {UserDefaults: CA92.1}, {FileTimestamp: C617.1}, {SystemBootTime: 35F9.1}, {DiskSpace: E174.1} ], "NSPrivacyCollectedDataTypes": [...matching the nutrition label], "NSPrivacyTracking": false } }`.
Confidence: high on the gap; the Stripe pod manifest is UNVERIFIABLE offline.

### [P2] REL-14 — User-generated content with no report/block path (Apple 1.2)
File: `app:/app/(app)/tasks/[id]/index.tsx`, `app:/src/feature/tasks/components/ValidateTaskSheet.tsx:227`, `app:/app/(app)/tasks/[id]/finish.tsx` (proof photo); grep `denunciar|report|bloquear` over `app/` + `src/` → 0 hits
Why it matters: task titles/descriptions are shown to every proxy in the city, proof photos to the client, rating comments to the proxy. Guideline 1.2 asks for a way to report objectionable content and block users plus published contact info. Reviewers apply this unevenly to marketplaces, but with no support e-mail anywhere it is a cheap rejection.
Suggested fix: a "Denunciar" row on task detail that opens `mailto:` / the support page with the task id pre-filled; support e-mail in Profile; moderation is manual for 1.0.
Confidence: medium (review-practice judgement).

### [P2] REL-15 — SES sender is a `@gmail.com` address
File: `api:/.env:18` (`AWS_SES_FROM_EMAIL=downritos@gmail.com`); `api:/src/notification/notification.service.ts:25-36`
Why it matters: SES only sends from verified identities; a gmail address can be verified as a single address but not DKIM-signed, so password-reset mail (the only e-mail the app sends, and a main flow) will often land in spam or be rejected by DMARC-strict receivers; while the SES account is in sandbox only verified *recipients* receive anything. Also A1 already notes: any SES error → 500 and the user is locked for 15 min.
Suggested fix: verify the owner's domain in SES (DKIM + custom MAIL FROM), request production access, set `AWS_SES_FROM_EMAIL=noreply@<domain>`; log the code in `NODE_ENV=development` instead of calling SES.
Confidence: high.

### [P2] REL-16 — Seven `PrismaClient` instances, no shutdown hooks
File: `api:/src/app.module.ts:19` plus `auth.module.ts:61`, `tasks.module.ts:50`, `cards.module.ts:19`, `payments.module.ts:13`, `ratings.module.ts:8`, `stripe-webhook.module.ts:21` (each lists `PrismaService` in `providers`); `api:/src/prisma/prisma.service.ts:7-18`; `api:/src/main.ts` (no `enableShutdownHooks()`)
Why it matters: Nest instantiates one `PrismaService` per module that provides it → 7 clients, each with its own `pg` pool (default `num_cpus*2+1` connections). Managed Postgres tiers (Neon/Supabase free, Railway small) cap at 20-100 connections; the app can exhaust them under light load. Without shutdown hooks SIGTERM on redeploy never runs `$disconnect`.
Suggested fix: `@Global() PrismaModule` exporting one `PrismaService`; `app.enableShutdownHooks()`; set `connection_limit` in `DATABASE_URL` for the host's tier.
Confidence: high (A4-P3 noted the discarded extra client; the per-module duplication is new).

### [P3] REL-17 — `NODE_ENV` decides the Stripe callback URL, and only the literal `development` selects the dev one
File: `api:/src/modules/auth/use-cases/create-merchant-account.service.ts:69-72`
Why it matters: a host that sets `NODE_ENV=production` (Railway/Render default) silently uses `PROD_CALLBACK_URL`; a host that leaves it unset gets `development` (env default) and hands Stripe the localhost URL. Fine once intentional; worth a deploy-checklist line.
Suggested fix: single `STRIPE_CONNECT_RETURN_URL` variable; validate it is `https://` in the env schema.
Confidence: high.

### [P3] CON-11 — `.heif` served as `image/jpeg` (see register).

### [P3] REL-18 — Sign-up "Termos de Uso / Política de Privacidade" are bold text, not links
File: `app:/app/(auth)/sign-up.tsx:277-283`
Why it matters: both stores and LGPD expect the documents to be reachable where consent is collected; today nothing is tappable.
Suggested fix: wrap in `Pressable` opening the REL-02 URLs.
Confidence: high.

(Already found by F1, repeated here only because it matters for review: the proxy "Foto do documento" is a boolean toggle — `sign-up.tsx:270` `onPress={() => setPhotoUploaded((v) => !v)}` — that shows "Documento enviado" without picking or sending anything. Apple 2.1/2.3.1 treats visible non-functional features as grounds for rejection. Recommended for 1.0: remove the uploader and the CPF/CNPJ number field until an upload endpoint exists, or implement them.)

---

## 4. Evidence-based release checklist

### 4.1 Apple App Store

| Requirement (guideline) | Current state (file:line) | What must change |
| --- | --- | --- |
| Bundle id / display name (2.3.8 metadata accuracy; ids are permanent) | `app.json:3` `name: "proxy-app"`, `:13` `com.anonymous.proxyapp`; no `ios.displayName` | REL-01. Check name availability in App Store Connect first ("Proxy" is likely taken; have a fallback like "Proxy — tarefas"). |
| App icon (2.3.8, 4.0 — no placeholder art) | `assets/icon.png` 1024×1024 8-bit colormap, visually the Expo template | REL-01. Opaque 1024² PNG, no alpha. |
| Splash / launch (4.0) | `expo-splash-screen` plugin with the same placeholder image (`app.json:53-60`) | Replace image; keep `resizeMode: contain`, brand `backgroundColor`. |
| iPad (2.4.1, 4.0; 13" screenshots required when tablet-enabled) | `app.json:12` `supportsTablet: true`; all layouts are 24-px phone layouts, sheets use `Dimensions` | REL-11: `false` for 1.0. |
| Permission purpose strings (5.1.1(i)) | Location: both `WhenInUse` and `AlwaysAndWhenInUse` set (pt-BR), `NSLocationAlwaysUsageDescription` falls to English default (`withLocation.js:111-118`); code only calls `requestForegroundPermissionsAsync` (`useDeviceLocation.ts:31`, `useLocationCapture.ts:104`). Camera + photos set (pt-BR, `app.json:46-47`), used by `finish.tsx:44-74`. Microphone: English default + `RECORD_AUDIO` injected (`withImagePicker.js:52-59`) although `mediaTypes: ['images']` (`finish.tsx:53,72`). `NSPhotoLibraryAddUsageDescription` not needed (app never saves). | REL-12: `locationAlwaysAndWhenInUsePermission: false`, `locationAlwaysPermission: false`, `microphonePermission: false`. Needed set: WhenInUse location, camera, photo library. |
| Apple Pay entitlement (2.3.1 — capabilities must match features) | `app.json:29-34` `merchantIdentifier` → `com.apple.developer.in-app-payments` entitlement (`withStripe.js setApplePayEntitlement`); no Apple Pay UI | Drop `merchantIdentifier` (keep the plugin). |
| Privacy manifest (ITMS-91053) | No app-level manifest (`ios.privacyManifests` unset); library manifests present for RN core, expo-constants/file-system/system-ui; Stripe's in pods (unverified offline) | REL-13. |
| Export compliance (`ITSAppUsesNonExemptEncryption`) | absent (`app.json` has no `ios.infoPlist`) | `"ios": { "infoPlist": { "ITSAppUsesNonExemptEncryption": false } }` — the app only uses OS TLS; answer "No" to the encryption question / no French declaration. |
| App Transport Security | Template `Info.plist:29-35` `NSAllowsArbitraryLoads=false`, `NSAllowsLocalNetworking=true`; `.env.example:1` `http://192.168.2.93:3333` | REL-06: production API over https; do not add ATS exceptions. |
| App Privacy "nutrition label" (5.1.1, 5.1.2) — derived from code | **Collected and linked to identity:** Name, Email, Phone (`sign-up.tsx:84-86` → `/auth/create`); Precise Location (lat/lng + reverse-geocoded address at task creation, `useLocationCapture.ts:120-123`, stored in `Tasks.locationLat/Lng/locationAddress`, **shared with other users** via `/tasks/fetch`); Photos (proof image, `/tasks/finish`); User Content (task title/description, rating comment); Payment Info — handled by Stripe SDK (`CardField`), backend stores only `brand/last4/pm_id` (`cards` table) → declare "Payment Info" collected via third-party (Stripe); Purchase History (transaction history, `/auth/transaction-history`); User ID (uuid, JWT). **Not collected:** CPF/CNPJ number (form field never sent, `sign-up.tsx:83-91`), document photo (toggle only), device id, usage data, crash data (no analytics/crash SDK in `package.json`), contacts, health. **Shared with other users today:** name, avatar, rating, and — until REL-08 — email, phone, Stripe customer id of task owners. Stripe Connect onboarding collects CPF, DOB, address and bank data **inside Stripe's hosted page**, not in the app — list under "Financial Info — collected by third party (Stripe)". Tracking: none. | Fill the label from this list; re-answer after REL-08. |
| Account deletion (5.1.1(v)) | No UI (`profile.tsx:81-102`); backend `DELETE /auth/account` 204 / 409 when active (`delete-account.service.ts:21-25`, blocks on `available` too) | REL-02 + REL-04. |
| Privacy policy URL, Terms, Support URL (5.1.1, App Store Connect fields) | none exist in either repo; sign-up mentions them as bold text (`sign-up.tsx:281-283`) | REL-02 / REL-18: one static site; same origin as the Stripe return page. |
| Payments for real-world services (3.1.1 vs 3.1.3(e)/3.1.5(a)) | Stripe card charge for a physical service performed by another user; no digital goods | Allowed outside IAP; state in Review Notes: "payments are for physical services rendered by other users; processed by Stripe Connect". |
| Login services (4.8) | Email/password only; grep `apple|google|facebook|oauth` in `app/(auth)`, `src/feature/auth` → 0 | Sign in with Apple **not** required (4.8 applies only when a third-party/social login is offered). |
| Demo accounts for review (2.1 App Completeness) | none documented | Provide one CLIENT (saved test card `4242 4242 4242 4242`) and one PROXY whose Stripe **test-mode** Express account is already `charges_enabled && payouts_enabled` (`handle-account-updated.service.ts:13`) so the reviewer can accept/finish/validate. In Review Notes explain that Connect onboarding in test mode accepts `000-000-0000`-style test data and a test IBAN/bank, and that the reviewer may skip it by using the pre-onboarded PROXY. Point the backend at Stripe **test keys** for the review build if live keys are not ready; otherwise use a live-mode PROXY you own. |
| UGC (1.2) | no report/block/support contact | REL-14. |
| Legal entity (5.1.1(ix) — financial services / sensitive info should be submitted by a legal entity) | unknown account type | Owner to confirm; recommended default: submit under an organisation account (CNPJ, D-U-N-S) given Stripe Connect payouts. |
| Age rating (2025 questionnaire) | no objectionable content; UGC yes; in-app browser only to Stripe/Terms; location shared with others; no gambling/contests | Expect 17+ only if "unrestricted web access" — answer No. Likely 12+/13+ due to UGC + location sharing; answer honestly on "user-generated content: yes (moderated manually)". |
| iOS SDK / Xcode (Apple requires iOS 26 SDK builds since April 2026) | Expo SDK 57 / RN 0.86 (`package.json:20,38`), Podfile deployment target 16.4 | EAS default image for SDK 57 builds with Xcode 26 — confirm in the first build log. |

### 4.2 Google Play

| Requirement | Current state | What must change |
| --- | --- | --- |
| Package name (permanent) | `app.json:21` `com.anonymous.proxyapp` | REL-01. |
| Adaptive icon safe zone | `assets/adaptive-icon.png` template placeholder, `backgroundColor #ffffff` (`app.json:16-19`) | Foreground art inside the central 66 % (684 px of 1024); brand background. |
| Target API level (Play: API 35+ since Aug 2025, API 36 required from Aug 2026 for new apps) | `react-native/gradle/libs.versions.toml:4` `targetSdk = "36"`, consumed by `ExpoRootProjectPlugin.kt:55`; `expo-modules-core/android/ExpoModulesCorePlugin.gradle:69` fallback 36; `expo-build-properties` not overriding (`app.json:61-68` iOS only) | Nothing — **targetSdkVersion 36, minSdk 24, compileSdk 36**. Android 16 edge-to-edge is on by default (template `gradle.properties:47 edgeToEdgeEnabled=true`); QA bottom-sheet insets. |
| Predictive back | `app.json:20` `predictiveBackGestureEnabled: false` | Nothing; explicit opt-out is fine. |
| Permissions declared by plugins/libraries (Play permission declaration) | `INTERNET`, `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `READ/WRITE_EXTERNAL_STORAGE (maxSdk 32)` from the template manifest; `CAMERA` (`expo-image-picker/android/.../AndroidManifest.xml`); `ACCESS_COARSE/FINE_LOCATION` (`expo-location` manifest + plugin); **`RECORD_AUDIO`** from the image-picker plugin (`withImagePicker.js:11-12,58-59`); no `READ_MEDIA_IMAGES` (Photo Picker used) → no "Photo and Video Permissions" declaration needed | Set `microphonePermission: false` (REL-12). Optionally `android.blockedPermissions: ["android.permission.SYSTEM_ALERT_WINDOW"]`. |
| Data safety form (derived from code) | Same inventory as the Apple label: Personal info (name, email, phone) collected, required, not shared*; Location (precise) collected, **shared with other users**; Photos (proof) collected; App activity (task text, ratings) collected; Financial info (payment info via Stripe SDK — "collected, processed ephemerally by third party"; purchase history); User IDs. Encryption in transit: **only true after REL-06 (https)**. Deletion: "users can request deletion" → requires REL-02 + a **web URL** for deletion requests (mandatory in the form since Dec 2023 even with in-app deletion). *Email/phone are currently shared with other users (REL-08) — fix before answering. | Fill after REL-02/06/08. |
| Account deletion policy | no in-app UI; no web form | REL-02 (in-app) + hosted request page URL. |
| Privacy policy URL | none | REL-02. |
| Financial features declaration | Play Console asks every app; this app moves money via Stripe but offers no loans/banking | Declare "no financial features" — note Stripe Connect payouts in the description if asked. |
| Closed testing requirement (personal accounts created after 13 Nov 2023: 12 opted-in testers for 14 continuous days before production access) | unknown account type/age | **Owner must confirm.** If it applies, start the closed track on day 1 of QA; it is the longest lead time in the plan. |
| App signing | no keystore in repo; EAS will generate and store it; Play App Signing mandatory for new apps (AAB) | `eas build -p android --profile production` → AAB; enrol in Play App Signing with the EAS upload key. |
| Developer verification (Brazil) | n/a in repo | Organisation accounts need D-U-N-S; personal accounts need ID verification — do it before the closed test. |
| Cleartext traffic | release manifest has no `usesCleartextTraffic` (only `src/debug/AndroidManifest.xml`) | REL-06 https API. |
| Target audience / content rating (IARC) | UGC + "shares location" + "users interact" | Answer: users interact (yes), shares location (yes), digital purchases (no), unrestricted internet (no). |

### 4.3 Build / release pipeline

Current state: `app.json` has no `owner`, `extra.eas.projectId`, `ios.buildNumber`, `android.versionCode`, `updates`, `runtimeVersion`; `version: "1.0.0"` (`app.json:6`, `package.json:3`); no `eas.json`; `.env` gitignored with LAN `http://` URL and `pk_test_`; `EXPO_PUBLIC_*` read at `api-client.ts:9`, `(app)/_layout.tsx:7`, `proof.ts:15` and inlined at bundle time; deep link is the custom scheme `proxyapp://wallet` (`app.json:5`, `useStripeOnboarding.ts:9`) — adequate for the Stripe return, universal links not required; `stripe-redirect/index.html` must sit on an **https** origin because Stripe Account Links reject non-https `return_url`/`refresh_url` in live mode (`stripe.service.ts:144-145` takes whatever `PROD_CALLBACK_URL` holds); backend picks the URL by `NODE_ENV` (`create-merchant-account.service.ts:69-72`).

Minimal `eas.json` (recommendation):

```json
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": {
        "EXPO_PUBLIC_API_URL": "http://192.168.2.93:3333",
        "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "pk_test_…"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api-staging.<domain>",
        "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "pk_test_…"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.<domain>",
        "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY": "pk_live_…"
      }
    }
  },
  "submit": {
    "production": {
      "ios": { "appleTeamId": "<TEAM>", "ascAppId": "<ASC_APP_ID>" },
      "android": { "serviceAccountKeyPath": "./play-service-account.json", "track": "internal" }
    }
  }
}
```

Notes: keep the publishable keys in EAS environment variables (`eas env:create --scope project`) rather than in the committed file if the repo is public; `appVersionSource: remote` lets EAS own `buildNumber`/`versionCode`; leave `updates` off for 1.0 (no `expo-updates` installed) and bump `version` manually per store release. Add `"owner"` and `"extra": { "eas": { "projectId": … } }` to `app.json` via `eas init`. Delete `newArchEnabled` (`app.json:10`) and run `npx expo install --fix` once (F3-P3-8).

### 4.4 Backend production readiness

| Item | Current state | Minimal viable fix (solo founder) |
| --- | --- | --- |
| Container / process | no `Dockerfile`/`Procfile`; `start:prod` = `node dist/src/main` (`package.json:17`), `build` = `prisma generate && nest build` (`:9`); `dist/` only has `tsconfig.tsbuildinfo` | `Dockerfile` (node:22-alpine, `npm ci`, `npm run build`, `CMD sh -c "npx prisma migrate deploy && node dist/src/main"`); `engines.node` + `.nvmrc` = 22. |
| CI | none (`.github`, `.gitlab-ci.yml`, `.circleci` absent) | GitHub Actions per A4 §6 (generate → `tsc --noEmit` → `eslint` without `--fix` → `jest` → `test:e2e` on `ubuntu-latest`). Prereqs: fix `user.factory.ts:64`, gitignore `test/.env.test`, `override: true` in `load-env.ts:4`. |
| Migrations | 15 migrations in `prisma/migrations`, `prisma.config.ts` points at them; `prisma migrate deploy` only runs inside the e2e `global-setup.ts:51` | Run `prisma migrate deploy` as the container start pre-step (above) or a release command; never `migrate dev` in prod. `prisma` CLI is already in `dependencies` (`package.json:48`). |
| Prisma clients | 7 `PrismaService` providers (REL-16); `prisma.service.ts:9` constructs and discards an extra client | Global `PrismaModule`; `enableShutdownHooks()`; `?connection_limit=` sized for the DB tier. |
| CORS | `main.ts:10` `app.enableCors()` (`*`) | Harmless for a native-only client; restrict to the static site's origin if any web page ever calls the API. |
| Helmet / security headers | none | `helmet()` (one line) — low value for a JSON API but free. |
| Request logging | none (only `Logger` in webhook/merchant services) | `nestjs-pino` or Nest `LoggerMiddleware` logging method, path, status, ms, `req.ip` — needed to debug REL-07 and webhooks. |
| Health endpoint | none | `GET /health` → `SELECT 1`; `@SkipThrottle()`; used by the host's health check. |
| Reverse proxy | no `trust proxy` (REL-07) | `set('trust proxy', 1)`. |
| File uploads | `multer-validation.pipe.ts:47` `memoryStorage()`; `finish-task.service.ts:54-58` writes to `join(process.cwd(), 'src', 'tmp', taskId)`; `fetch-task-proof.service.ts:45-54` reads the same path; `.gitignore` ignores `src/tmp/`; mimetype trusted (A2) | Proof images go to an S3-compatible bucket (R2/S3): upload with the `@aws-sdk/client-s3` already-adjacent SDK family, store the object key in `proofImageUrl`, stream via a signed GET or proxy through the existing authenticated route. Without this, every redeploy deletes all proofs and the client's validation screen 404s. |
| Stripe webhooks | one `STRIPE_WEBHOOK_SECRET` (`stripe.module.ts:20-24`), one route (`stripe-webhook.controller.ts:19`); `payout.failed` needs `event.account` (`dispatch-stripe-event.service.ts:69-73`), `account.updated` for proxies is a Connect event | Register two Dashboard endpoints (account events: `payment_intent.*`, `charge.refunded`, `charge.dispute.created`; Connect events: `account.updated`, `payout.failed`), add `STRIPE_CONNECT_WEBHOOK_SECRET` and a second route (or try both secrets on one route). Verified in A3-P1; a blocker for `stripeAccountReady` ever flipping in production. |
| AWS SES | sandbox by default; sender `@gmail.com` (`api:/.env:18`); any send error → 500 + 15-min lock (A1) | REL-15. |
| JWT keys | base64 PEMs in env (`auth.module.ts:45-51`, `jwt.strategy.ts:40-44`); no `exp` (CON-05) | Generate a prod key pair once (`openssl genrsa 2048`), store in the host's secret manager, add `expiresIn`. |
| Secrets | `.env` gitignored (`.gitignore`), `.env.example` tracked; `scripts/sync-stripe-secret.mjs` rewrites `.env` in dev | Host secret manager; never set `STRIPE_WEBHOOK_SECRET` from the CLI secret in prod. |
| Env schema | `env.ts` requires every AWS/Stripe key at boot (fail-fast, good) | Add `.url()` checks on the callback URLs and require `https` when `NODE_ENV=production`. |
| Hosting default (recommendation) | — | Railway (or Render) Node service + managed Postgres; Cloudflare R2 for images; Cloudflare Pages for the static site; Stripe + SES as today. Fly.io is equally fine if the owner prefers regional (GRU) placement. |

### 4.5 Stripe Brazil specifics

- **Connect configuration actually used** (`api:/src/stripe/stripe.service.ts:114-139`): `accounts.create({ email, business_type: 'individual', business_profile.product_description, individual: { first_name, last_name, phone }, controller: { stripe_dashboard: { type: 'express' }, fees: { payer: 'application' }, losses: { payments: 'application' } } })` — the controller-API equivalent of an Express account where the platform pays Stripe fees and absorbs losses. **No `country`, no `capabilities`, no `default_currency`** (A1-P2 / A3-P2). Account Links: `type: 'account_onboarding'`, `collection_options.fields: 'currently_due'`, `return_url === refresh_url` (`:141-151`).
- **Brazil 2026 verification**: Stripe's updated BR requirements mean the PROXY completes the hosted onboarding with CPF (or CNPJ), date of birth, address, a selfie/liveness check when Stripe asks, and a **BRL checking account** for payouts. The backend never touches this data (good for the privacy labels). Request `capabilities: { transfers: { requested: true } }` explicitly and pass `country: 'BR'` so readiness does not depend on dashboard defaults — mark **needs Stripe test-mode verification** on an existing test account (`stripe accounts retrieve acct_… | jq .capabilities`).
- **Both accounts in Brazil**: `transfers.create` from a BR platform is only possible to BR connected accounts (no cross-border transfers from BR); the platform account must be a Brazilian entity with CNPJ.
- **Readiness criterion the backend uses** (`api:/src/modules/stripe-webhook/use-cases/handle-account-updated.service.ts:13-22`): `const ready = Boolean(account.charges_enabled && account.payouts_enabled)` → `users.updateMany({ where: { stripeAccountId }, data: { stripeAccountReady: ready } })`. Note it can flip back to `false` when Stripe pauses payouts (new requirements), which then blocks `/tasks/start` (`start-task.service.ts:40-42`) and `/tasks/validate` (`validate-task.service.ts:50-52`) with no UI explanation — the Wallet shows the same CTA as "never started" (F3 owner Q5).
- **Amounts**: PaymentIntent `amount: offeredPrice * 100` without rounding (`start-task.service.ts:60`, REL-03) vs. transfer `Math.round(proxyEarnings * 100)` (`validate-task.service.ts:62`). Stripe requires integer centavos; BRL minimum charge is R$ 0,50.
- **`transfers.create` without `source_transaction`** (`stripe.service.ts:95-100`): draws on the platform's **available** balance; BR card funds sit in *pending* on Stripe's BR settlement schedule (historically up to 30 days), so early validations will fail with `balance_insufficient` → 500 `TASK_TRANSFER_FAILED` and the task stays `verification_required`. **Needs Stripe test-mode verification** (A2/A3 P1). Fix: persist `latest_charge` from `payment_intent.succeeded` and pass `source_transaction`, or switch to destination charges (`transfer_data.destination` + `application_fee_amount`) at PaymentIntent time.
- **Webhooks**: two endpoint families, one secret (see 4.4). In test mode `stripe listen` masks it.
- **3DS**: saved-card charge is confirmed without `off_session: true` (`stripe.service.ts:78-82`); Brazilian issuers frequently step up → `requires_action` → CON-01 dead end.
- **Review build**: keep the backend on **test keys** for the store-review period and give the reviewers the pre-onboarded test PROXY; switch to live keys (and live Connect onboarding) only after approval, in the same build (keys live in the backend, the app only carries the publishable key per EAS profile).

---

## 5. Settled questions

1. **"Is Sign in with Apple required?"** — No. The app offers only email/password (no third-party or social login found in `app/(auth)` or `src/feature/auth`); Guideline 4.8 applies only when a third-party login service is offered.
2. **"Does account deletion exist?"** — Backend only: `DELETE /auth/account` soft-deletes and anonymises PII (`auth.repository.ts:138-150`), but it refuses when the user has any `available|accepted|on_the_way|in_progress|verification_required` task as owner, or any of the last four as executor. The app has no entry point. Both must change (REL-02, REL-04).
3. **"Is `PROD_CALLBACK_URL` set anywhere?"** — Yes, locally: `https://proxy.com.br/profile/stripe-connect` (`api:/.env:13`), a domain not evidenced as owned, with no page deployed. Treat as unset (REL-05).
4. **"What targetSdkVersion does Expo SDK 57 produce?"** — 36 (`react-native/gradle/libs.versions.toml:4` via `ExpoRootProjectPlugin.kt:55`; `ExpoModulesCorePlugin.gradle:69` fallback 36). minSdk 24, compileSdk 36. Play-compliant for 2026.
5. **"Which iOS purpose strings are actually needed?"** — `NSLocationWhenInUseUsageDescription` (foreground only, `requestForegroundPermissionsAsync` at `useDeviceLocation.ts:31` / `useLocationCapture.ts:104`), `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` (`finish.tsx:44,63`). No microphone, no Always location, no photo-library-add, no background modes (`UIBackgroundModes` is only added when `isIosBackgroundLocationEnabled`, `withLocation.js:106-108`).
6. **"Is `RECORD_AUDIO` really added by the image-picker plugin?"** — Yes, unless `microphonePermission: false` (`withImagePicker.js:11-12,58-59`).
7. **"Does the Stripe RN package ship a privacy manifest?"** — Not in `node_modules/@stripe/stripe-react-native`; the native code is the `Stripe ~> 25.11.0` pods, which ship their own (verify after `pod install`). React Native core and `expo-constants`/`expo-file-system`/`expo-system-ui` do ship theirs.
8. **"Does the contract between app and API match?"** — Yes for all 24 routes (§1c). The only wire/type disagreements are app-side type annotations (CON-10) and Decimal→string claims (CON-02); no request shape is wrong.
9. **"Will a store build reach an `http://` API?"** — No on either platform (template ATS block; Android cleartext only in debug). The dev LAN IP works only because of `NSAllowsLocalNetworking`.
10. **"Is the CPF/CNPJ number collected?"** — Entered and validated on-device, never transmitted (`sign-up.tsx:83-91`), and the backend has no column for it (`schema.prisma` Users). So it is *not* "collected" in store terms — but the UI promises something it does not do (F1-P1).
11. **"Is `payout.failed` reachable with one webhook secret?"** — Not in production: it needs `event.account` (`dispatch-stripe-event.service.ts:69-73`), i.e. a Connect endpoint with its own secret (A3-P1).

## 6. Open product decisions (owner)

1. **Store identity**: final app name (check availability), reverse-DNS id under a domain you own, iPhone-only for 1.0 (recommended default: yes, `supportsTablet: false`).
2. **Static site origin**: one https origin for privacy policy, terms, support/report page, account-deletion request page and `stripe-redirect/` (recommended default: Cloudflare Pages on your domain; same domain as the API's parent).
3. **Developer accounts**: personal vs organisation on both stores, and the Play account's creation date (decides the 12-tester/14-day closed test). Recommended default: organisation accounts (CNPJ) given Stripe payouts and Apple 5.1.1(ix).
4. **Fee model** (REL-09): who pays the 20 % + Stripe fee. Recommended default for 1.0: client pays `price + fees`, proxy receives `price` — it matches what the app already shows and keeps the transfer ≤ charge for `source_transaction`.
5. **3DS policy** (CON-01): merchant-initiated off-session charges and decline on `requires_action` (recommended default for 1.0), or build the client-side confirmation step.
6. **Account deletion with an open `available` task** (REL-04): auto-cancel (recommended default) or block with guidance.
7. **Proxy document photo + CPF number** (F1-P1): remove from the 1.0 sign-up (recommended default) or ship a real upload path (S3 + `documentUrl`).
8. **Stripe test vs live during review**: review on test keys with pre-onboarded demo accounts (recommended default), switching to live after approval.
9. **Hosting**: Railway/Render + managed Postgres + R2 (recommended default) vs Fly.io GRU region; both need the same Dockerfile and secrets.
10. **JWT expiry** (CON-05): 7-day `exp` with refresh on launch/focus (recommended default) vs long-lived tokens.
