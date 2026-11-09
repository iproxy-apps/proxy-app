# Phase 5 — Release engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** make the app submittable (identity, permissions, privacy manifest, EAS profiles, report path), publish the legal/support/Stripe-return static site, deploy the backend to a managed host with every production integration wired, and fill both store consoles with the evidence-based answers, so Phase 6 can build, test on devices and submit.

**Architecture:** Three deployables. (1) The Expo app, configured only through `app.json` + `eas.json` (no native folders are committed; `/ios` and `/android` are gitignored) and built on EAS with per-environment `EXPO_PUBLIC_*` variables. (2) A static site (`proxy-app/site/`) on Cloudflare Pages at `<SITE_ORIGIN>` hosting privacy, terms, support/report, account-deletion and the Stripe Connect return page; the app links to it through `src/common/constants/links.ts`. (3) The NestJS API as a Docker image on Railway (D25) with managed Postgres, Cloudflare R2 for proofs, SES for e-mail and two Stripe webhook endpoints; `prisma migrate deploy` runs in the container start command.

**Tech stack:** Expo SDK 57 (`expo ^57.0.24`, `expo-router ~57.0.22`, `expo-location ~57.0.19`, `expo-image-picker ~57.0.19`, `@stripe/stripe-react-native 0.64.0`, `expo-web-browser ~57.0.3`, `expo-linking ~57.0.10`), `eas-cli >= 16` (run as `npx eas-cli@latest`, not installed on the owner's machine), `jest-expo` + `@testing-library/react-native` (set up in Phase 0), NestJS 11 / Prisma 7.3 (`prisma-client-js` output `node_modules/.prisma/client`), Node 22, Docker (`node:22-bookworm-slim`), Cloudflare Pages + R2, Railway, Stripe API 2025 (test mode until approval, D27), AWS SES v2. Local tools present: `jq`, `docker`, `gh`; absent: `eas`, `stripe`, `aws`, `wrangler`, `railway` (commands below use `npx` or `curl` against the vendor APIs where a CLI is missing).

**Spec:** ../PLAN.md §2 (Phase 5), ../DECISIONS.md D13, D18, D23–D29, E, `audit/R-release-contract-review.md` §2 REL-01/02/05/06/10/11, §3 REL-12/13/14/15/17, §4.1–4.5; SPEC.md §5.3, §8.9, §8.14.

## Global constraints

- Owner rule: never start the dev server / Expo / the API locally (`npm start`, `expo run:*`, `npm run start:dev`, `docker run` of the API) — all runtime checks below hit the **deployed** `<API_ORIGIN>` / `<SITE_ORIGIN>`, or run inside jest/supertest. `docker build` is allowed (no process is started).
- Never run repo-wide format/fix scripts (`npm run format`, `npm run lint:fix`, api `npm run lint` which carries `--fix`). Prettier only on files you create (`npx prettier --write <file>`).
- Leave work uncommitted unless asked; one task = one commit message proposal (`chore(release): P5-Txx <title>`).
- App code: no semicolons, single quotes, trailing commas; `import type` for types; `@/…` aliases; pt-BR user-facing copy; colour tokens from `@/common/theme/colors`. Backend: same Prettier rules, `src/…` import paths, Zod inline, `AppException` + `errorDictionary`.
- Static site copy is pt-BR; everything meant for store reviewers (Review Notes) is English.
- Repo gates (PLAN §3) to run before claiming a repo task done:
  - app: `cd /Users/leandromartins/Documents/proxy-app && npx tsc --noEmit && npx eslint . && npm test`
  - api: `cd /Users/leandromartins/Documents/proxy-api && npx prisma generate && npx tsc --noEmit && npx eslint "src/**/*.ts" "test/**/*.ts" && npx jest && npm run test:e2e`
- Config-plugin facts this plan relies on (verified in `node_modules`): `@expo/config-plugins/build/ios/Permissions.js:28-33` deletes an Info.plist key when the option is `false` and otherwise writes `option || existing || englishDefault`; `expo-image-picker/plugin/build/withImagePicker.js:58-66` adds `android.permission.RECORD_AUDIO` unless `microphonePermission === false`, in which case it blocks it; `expo-location/plugin/build/withLocation.js:110-119` writes the three `NSLocation*` keys with the English default `'Allow $(PRODUCT_NAME) to access your location'`; `@stripe/stripe-react-native/lib/commonjs/plugin/withStripe.js` sets the `com.apple.developer.in-app-payments` entitlement only when `merchantIdentifier` is truthy, and **destructures its options object**, so the plugin entry must stay an array with an object (`["@stripe/stripe-react-native", { … }]`), never the bare string; `@expo/config-plugins/build/ios/PrivacyInfo.js:43-51` writes `ios/<Project>/PrivacyInfo.xcprivacy` only when `ios.privacyManifests` is set.
- Expo has no `ios.displayName` key (PLAN §2 wording): the display name is `expo.name`; use `ios.infoPlist.CFBundleDisplayName` only if the store display name must differ from the project name.

### Placeholders (OWNER INPUT)

| Placeholder | Decision | Example | Needed by |
|---|---|---|---|
| `<APP_NAME>` | D23 | `Proxy` (check availability; fallback `Proxy — tarefas`) | T01, T16, T17 |
| `<BUNDLE_ID>` | D23 | `br.com.<domain>.proxy` (reverse-DNS of a domain the owner owns; permanent) | T01, T16, T17 |
| `<DOMAIN>` | D24 | `<domain>.com.br` | T07, T08, T11, T14 |
| `<SITE_ORIGIN>` | D24 | `https://proxy.<DOMAIN>` (or `https://<CF_PAGES_PROJECT>.pages.dev` until DNS is ready) | T05, T07, T08, T13, T16, T17 |
| `<API_ORIGIN>` | D25 | `https://api.<DOMAIN>` | T04, T12, T13 |
| `<SUPPORT_EMAIL>` | D24 | `suporte@<DOMAIN>` (must exist and be read) | T05, T07, T16, T17 |
| `<LEGAL_NAME>`, `<CNPJ>`, `<ADDRESS>` | D26 | controller identity for LGPD pages | T07 |
| `<EXPO_OWNER>` | — | Expo account/org slug | T04 |
| `<APPLE_TEAM_ID>`, `<APPLE_ID_EMAIL>`, `<ASC_APP_ID>` | D26 | from developer.apple.com / App Store Connect | T04, T16, T18 |
| `<CF_ACCOUNT_ID>`, `<CF_PAGES_PROJECT>`, `<R2_BUCKET>` | D24/D25 | Cloudflare | T08, T11, T12 |
| `<DEMO_CLIENT_EMAIL>`, `<DEMO_PROXY_EMAIL>`, `<DEMO_PASSWORD>` | D27 | reviewer accounts | T15, T16, T17 |

Tasks marked **OWNER INPUT** cannot start until the placeholder values exist in `../DECISIONS.md` (D23, D24, D26 rows updated to `SETTLED` with the values).

## Task index

| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
|---|---|---|---|---|
| P5-T01 | App identity in `app.json` + brand assets (OWNER INPUT D23) | — | REL-01, REL-11 | `npx expo config --type introspect --json \| jq -r '.ios.bundleIdentifier,.android.package,.name,.ios.supportsTablet'` |
| P5-T02 | Permission plugin options + Stripe plugin without Apple Pay | — | REL-12 | `npx expo config --type introspect --json \| jq '.ios.infoPlist \| keys'` has no `NSLocationAlways*`/`NSMicrophone*` |
| P5-T03 | Export compliance + iOS privacy manifest | T01 | REL-13 | `npx expo config --type introspect --json \| jq '.ios.infoPlist.ITSAppUsesNonExemptEncryption,.ios.privacyManifests.NSPrivacyAccessedAPITypes \| length'` → `false`, `4` |
| P5-T04 | EAS project, `eas.json`, EAS environments, docs | T01 | REL-06 | `npx eas-cli@latest env:list --environment production --format long` lists both `EXPO_PUBLIC_*` |
| P5-T05 | `links.ts` final URLs + `reportTaskUrl` | — | REL-02 (hosting half), REL-14 | `npx jest src/common/constants/__tests__/links.test.ts` |
| P5-T06 | "Denunciar" row on task detail | T05 | REL-14 | `npx jest src/feature/tasks/components/__tests__/ReportTaskRow.test.tsx` |
| P5-T07 | Static site `site/` (privacy, terms, support, delete-account, stripe/return) + `check-site.mjs` (OWNER INPUT D24) | — | REL-02, REL-05, REL-14, REL-18 (hosting) | `node site/check-site.mjs` → `site: 5 pages OK` |
| P5-T08 | Cloudflare Pages deploy workflow + project | T07, T11 | REL-02, REL-05 | `curl -sI <SITE_ORIGIN>/privacy.html \| head -1` → `HTTP/2 200` |
| P5-T09 | Backend container readiness (Dockerfile, `.dockerignore`, `/health`) | — | REL-10 (deploy half) | `docker build -t proxy-api . && npx jest test/health.e2e-spec.ts` |
| P5-T10 | Backend production env schema + `.env.example` + docs | — | REL-05, REL-15, REL-17 | `npx jest src/env/env.spec.ts` |
| P5-T11 | Cloudflare account: DNS zone, R2 bucket + token, Pages project (OWNER) | — | REL-10, REL-02 | `curl -sI https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com/<R2_BUCKET> -H "Authorization: …"` → not `404`; see task |
| P5-T12 | Railway: Postgres + API service + env vars + domain (OWNER) | T09, T10, T11, T13, T14 | REL-10, REL-07 | `curl -s -o /dev/null -w '%{http_code}' <API_ORIGIN>/health` → `200` |
| P5-T13 | Stripe Dashboard: two webhook endpoints, return URL, Connect settings (OWNER) | T07 | REL-05, BE-10 (ops) | `curl -s https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" \| jq '.data \| length'` → `2` |
| P5-T14 | AWS SES: domain identity, DKIM, production access, IAM (OWNER) | T11 | REL-15 | `aws sesv2 get-email-identity --email-identity <DOMAIN> \| jq '.VerifiedForSendingStatus,.DkimAttributes.Status'` → `true "SUCCESS"` |
| P5-T15 | Demo review accounts on the deployed backend (OWNER, D27) | T12, T13 | checklist §4.1 "Demo accounts" | `curl -s <API_ORIGIN>/auth/session -d '{"email":"<DEMO_PROXY_EMAIL>","password":"…"}' -H 'content-type: application/json' \| jq -r '.session \| split(".")[1] \| gsub("-";"+") \| gsub("_";"/") \| @base64d \| fromjson \| .stripeAccountReady'` → `true` |
| P5-T16 | Apple Developer + App Store Connect record, URLs, App Privacy, age rating, review notes (OWNER INPUT D23/D26) | T01, T07, T08, T15 | REL-01, REL-02, REL-11, §4.1 | `npx eas-cli@latest credentials -p ios` shows `<BUNDLE_ID>` with a distribution certificate + provisioning profile |
| P5-T17 | Google Play Console app, Data safety, deletion URL, content rating, signing, closed testing (OWNER INPUT D26) | T01, T07, T08, T15 | REL-01, REL-02, §4.2 | `test -f play-service-account.json && git check-ignore -q play-service-account.json && echo ok` |
| P5-T18 | EAS builds (preview → device full task; production) + `eas submit` dry pass | T02, T03, T04, T06, T12, T16, T17 | REL-06, phase gate | `npx eas-cli@latest build:list --limit 2 --json --non-interactive \| jq -r '.[].status'` → `FINISHED` ×2 |

## Review focus

1. **A store build with an empty or placeholder `EXPO_PUBLIC_*`** (`''`, `pk_test_xxx`, `http://` URL in `production`): the app must refuse to boot (Phase 0 `assertEnv`, APP-15) and the EAS environment must not contain them. Owned by **P5-T04** (step 5 asserts `eas env:list` values match `^https://` and `^pk_(test|live)_[A-Za-z0-9]{8,}`).
2. **Stripe return page opened with `?refresh=1`** (expired Account Link, BE-31's distinct `refresh_url`): the page must say the link expired and still deep-link to `proxyapp://wallet`. Owned by **P5-T07** (`check-site.mjs` asserts the `refresh` branch strings and the scheme).
3. **A Connect-family event (`account.updated`) signed with the second secret hitting `POST /stripe/webhook` in production**: must return 200 and flip `stripeAccountReady`. Code test is Phase 1 (BE-10); the production wiring is owned by **P5-T13** (verification sends a test `account.updated` from the Dashboard and checks the delivery is `200`).
4. **Five failed sign-ins from one phone must not lock out a second phone** (REL-07 `trust proxy`, Phase 0 code): owned by **P5-T12** verification (laptop hits `/auth/session` 6× → 6th is `429`; a phone on cellular still gets `401`/`404`).
5. **Task detail for a `completed` or `canceled` task** (no action bar rendered): the "Denunciar" row must still be visible and open `<SITE_ORIGIN>/support.html?task=<id>`. Owned by **P5-T06** test `renders for a completed task`.

---

### Task P5-T01: App identity in `app.json` + brand assets — OWNER INPUT (D23)

**Files:**
- Modify: `/Users/leandromartins/Documents/proxy-app/app.json:3-22` (`name`, `slug`, `ios`, `android`)
- Replace: `/Users/leandromartins/Documents/proxy-app/assets/icon.png`, `assets/adaptive-icon.png`, `assets/splash-icon.png` (owner supplies the art; today `icon.png` is 22380 bytes and `adaptive-icon.png`/`splash-icon.png` are 17547 bytes, the Expo template placeholders, all `1024 x 1024, 8-bit colormap`)
- Test: none (config); verification via `npx expo config`

**Interfaces:**
- Consumes: D23 values `<APP_NAME>`, `<BUNDLE_ID>`.
- Produces: `expo.name = <APP_NAME>`, `expo.ios.bundleIdentifier = expo.android.package = <BUNDLE_ID>`, `expo.ios.supportsTablet = false`; T03/T04/T16/T17 read these.

- [ ] **Step 1: Confirm D23 is `SETTLED`** in `../DECISIONS.md` with the three values (name, id, iPhone-only). If not, stop and mark the task `blocked (owner input D23)` in `../STATUS.md`.
- [ ] **Step 2: Edit `app.json`**: `"name": "<APP_NAME>"`; keep `"slug": "proxy-app"` (slug is the EAS project key, not user-visible; changing it later breaks `eas init`); `"ios": { "supportsTablet": false, "bundleIdentifier": "<BUNDLE_ID>" }`; `"android": { "adaptiveIcon": { "foregroundImage": "./assets/adaptive-icon.png", "backgroundColor": "#F9F8F6" }, "predictiveBackGestureEnabled": false, "package": "<BUNDLE_ID>" }`; splash plugin `backgroundColor: "#F9F8F6"` (`#F9F8F6` = `BG` `hsl(40, 20%, 97%)` from `src/common/theme/colors.ts:38`). Leave `userInterfaceStyle`, `scheme`, `version` untouched (Phase 4 owns the scheme style).
- [ ] **Step 3: Drop in the owner's art** and check it: `cd /Users/leandromartins/Documents/proxy-app && for f in icon adaptive-icon splash-icon; do sips -g pixelWidth -g pixelHeight -g hasAlpha assets/$f.png; done`. Pass: `icon.png` 1024×1024 `hasAlpha: no`; `adaptive-icon.png` 1024×1024 with the artwork inside the central 684 px circle (visual check: `open assets/adaptive-icon.png`); `splash-icon.png` any size ≤ 1024, transparent background allowed. Also `ls -l assets/*.png` shows sizes different from 22380/17547.
- [ ] **Step 4: Verify** — `npx expo config --type introspect --json | jq -r '.ios.bundleIdentifier,.android.package,.name,.ios.supportsTablet,.android.adaptiveIcon.backgroundColor'` prints `<BUNDLE_ID>`, `<BUNDLE_ID>`, `<APP_NAME>`, `false`, `#F9F8F6`. `grep -c anonymous app.json` → `0` (the `merchantIdentifier` line is removed in T02; if T02 is not done yet expect `1` and note it).
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx eslint .` (no code changed; must still pass).
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(release): P5-T01 app identity and brand assets`

### Task P5-T02: Permission plugin options + Stripe plugin without Apple Pay

**Files:**
- Modify: `/Users/leandromartins/Documents/proxy-app/app.json:27-69` (`plugins` array)
- Test: none (config)

**Interfaces:**
- Produces: Info.plist with exactly `NSLocationWhenInUseUsageDescription`, `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription` (pt-BR); Android manifest without `RECORD_AUDIO`; entitlements without `com.apple.developer.in-app-payments`.

- [ ] **Step 1: Baseline** — `npx expo config --type introspect --json | jq '.ios.infoPlist | keys'` currently contains `NSLocationAlwaysAndWhenInUseUsageDescription`, `NSLocationAlwaysUsageDescription` (English default) and `NSMicrophoneUsageDescription` (English default); `jq '.ios.entitlements'` contains `"com.apple.developer.in-app-payments": ["merchant.com.anonymous.proxyapp"]`; `jq '.android.permissions'` contains `android.permission.RECORD_AUDIO`.
- [ ] **Step 2: Rewrite the plugin entries**:
  - `["expo-location", { "locationWhenInUsePermission": "Usamos sua localização pra preencher o endereço da tarefa automaticamente.", "locationAlwaysAndWhenInUsePermission": false, "locationAlwaysPermission": false }]`
  - `["expo-image-picker", { "photosPermission": "Precisamos acessar suas fotos pra você anexar o comprovante da tarefa.", "cameraPermission": "Precisamos acessar sua câmera pra você registrar o comprovante da tarefa.", "microphonePermission": false }]`
  - `["@stripe/stripe-react-native", { "enableGooglePay": false }]` (object kept because `withStripe.js` destructures it; no `merchantIdentifier`)
  - Remove `"@react-native-community/datetimepicker"` from `plugins` if Phase 0 left it (`grep -c datetimepicker package.json` must be `0` first; if it is still a dependency, Phase 0 task "remove datetimepicker" is not done — do that first).
- [ ] **Step 3: Verify** — `npx expo config --type introspect --json > /tmp/cfg.json` then: `jq '.ios.infoPlist | keys | map(select(startswith("NS")))' /tmp/cfg.json` → exactly `["NSCameraUsageDescription","NSLocationWhenInUseUsageDescription","NSPhotoLibraryUsageDescription"]` (plus any `NS*` keys Expo adds itself such as `NSAppTransportSecurity`; the three `Always`/`Microphone` keys must be absent); `jq '.ios.entitlements["com.apple.developer.in-app-payments"]' /tmp/cfg.json` → `null`; `jq '.android.permissions' /tmp/cfg.json` has no `RECORD_AUDIO`; `jq '.android.blockedPermissions' /tmp/cfg.json` → `["android.permission.RECORD_AUDIO"]` (if introspect does not surface this key, the built-manifest check in T18 step 3 — `RECORD_AUDIO` count `0` — is the proof).
- [ ] **Step 4: Repo gate** — `npx tsc --noEmit && npx eslint .`
- [ ] **Step 5: Mark done in ../STATUS.md; commit message** `chore(release): P5-T02 permission plugin options, no Apple Pay entitlement`

### Task P5-T03: Export compliance + iOS privacy manifest

**Files:**
- Modify: `/Users/leandromartins/Documents/proxy-app/app.json` (`expo.ios`: add `infoPlist`, `privacyManifests`)
- Test: none (config)

**Interfaces:**
- Produces: `ios.infoPlist.ITSAppUsesNonExemptEncryption = false`; `ios.privacyManifests` with the four required-reason APIs and the nine collected data types below, which T16's App Privacy answers must mirror exactly.

- [ ] **Step 1: Add to `expo.ios`**:
  ```json
  "infoPlist": { "ITSAppUsesNonExemptEncryption": false },
  "privacyManifests": {
    "NSPrivacyTracking": false,
    "NSPrivacyTrackingDomains": [],
    "NSPrivacyAccessedAPITypes": [
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] },
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp", "NSPrivacyAccessedAPITypeReasons": ["C617.1"] },
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons": ["35F9.1"] },
      { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace", "NSPrivacyAccessedAPITypeReasons": ["E174.1"] }
    ],
    "NSPrivacyCollectedDataTypes": [ /* one object per type below */ ]
  }
  ```
  Collected data types (each `{ "NSPrivacyCollectedDataType": "<id>", "NSPrivacyCollectedDataTypeLinked": true, "NSPrivacyCollectedDataTypeTracking": false, "NSPrivacyCollectedDataTypePurposes": ["NSPrivacyCollectedDataTypePurposeAppFunctionality"] }`): `NSPrivacyCollectedDataTypeName`, `NSPrivacyCollectedDataTypeEmailAddress`, `NSPrivacyCollectedDataTypePhoneNumber`, `NSPrivacyCollectedDataTypePreciseLocation`, `NSPrivacyCollectedDataTypePhotosorVideos`, `NSPrivacyCollectedDataTypeOtherUserContent`, `NSPrivacyCollectedDataTypePaymentInfo`, `NSPrivacyCollectedDataTypePurchaseHistory`, `NSPrivacyCollectedDataTypeUserID` (inventory: `audit/R-release-contract-review.md` §4.1 "App Privacy").
- [ ] **Step 2: Verify the config** — `npx expo config --type introspect --json | jq '.ios.infoPlist.ITSAppUsesNonExemptEncryption, (.ios.privacyManifests.NSPrivacyAccessedAPITypes|length), (.ios.privacyManifests.NSPrivacyCollectedDataTypes|length), .ios.privacyManifests.NSPrivacyTracking'` → `false`, `4`, `9`, `false`.
- [ ] **Step 3: Verify the generated manifest** — `npx expo prebuild --platform ios --no-install` (writes the gitignored `/ios`), then `plutil -lint ios/*/PrivacyInfo.xcprivacy` → `OK`, and `grep -c "CA92.1\|C617.1\|35F9.1\|E174.1" ios/*/PrivacyInfo.xcprivacy` → `4`. Then `rm -rf ios` (do not leave a native folder behind; EAS prebuilds in the cloud).
- [ ] **Step 4: Repo gate** — `npx tsc --noEmit && npx eslint .`
- [ ] **Step 5: Mark done in ../STATUS.md; commit message** `chore(release): P5-T03 export compliance flag and privacy manifest`

### Task P5-T04: EAS project, `eas.json`, EAS environments, docs

**Files:**
- Create: `/Users/leandromartins/Documents/proxy-app/eas.json`
- Modify: `/Users/leandromartins/Documents/proxy-app/app.json` (`owner`, `extra.eas.projectId` written by `eas init`), `/Users/leandromartins/Documents/proxy-app/.env.example`, `/Users/leandromartins/Documents/proxy-app/README.md:35-41` (env table) + new "Builds (EAS)" section, `/Users/leandromartins/Documents/proxy-app/.gitignore` (add `play-service-account.json`)
- Test: none; verification via `eas` CLI

**Interfaces:**
- Consumes: Phase 0 `src/common/env.ts` `assertEnv()` (APP-15) which throws when `EXPO_PUBLIC_API_URL`/`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` are empty or placeholders.
- Produces: build profiles `development`, `preview`, `production` bound to EAS environments of the same name; submit profile `production`. T18 uses them.

- [ ] **Step 1: Log in and init** — requires the owner's Expo account (`npx eas-cli@latest login`, or the owner runs it). Then `cd /Users/leandromartins/Documents/proxy-app && npx eas-cli@latest init` (interactive: confirm account `<EXPO_OWNER>`, create project for slug `proxy-app`; it writes `extra.eas.projectId` and, for an org account, `owner`). Verify `jq -r '.expo.extra.eas.projectId' app.json | grep -E '^[0-9a-f-]{36}$'`.
- [ ] **Step 2: Write `eas.json`** (exact content; no `EXPO_PUBLIC_*` values inline — they live in EAS environments):
  ```json
  {
    "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
    "build": {
      "development": { "developmentClient": true, "distribution": "internal", "environment": "development" },
      "preview": { "distribution": "internal", "environment": "preview", "android": { "buildType": "apk" } },
      "production": { "environment": "production", "autoIncrement": true }
    },
    "submit": {
      "production": {
        "ios": { "appleId": "<APPLE_ID_EMAIL>", "ascAppId": "<ASC_APP_ID>", "appleTeamId": "<APPLE_TEAM_ID>" },
        "android": { "serviceAccountKeyPath": "./play-service-account.json", "track": "internal" }
      }
    }
  }
  ```
  Leave `updates`/`runtimeVersion` out (no `expo-updates` in `package.json`); `version` stays `1.0.0` and is bumped by hand per store release; `buildNumber`/`versionCode` are remote.
- [ ] **Step 3: Create the EAS environment variables** (one command per variable per environment; values are not secrets, visibility `plaintext`):
  `npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_API_URL --value http://192.168.2.93:3333 --visibility plaintext --scope project --type string --non-interactive` and the same for `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`); `--environment preview` with `https://<API_ORIGIN>` + `pk_test_…`; `--environment production` with `https://<API_ORIGIN>` + `pk_test_…` **for the review period (D27)** — switch to `pk_live_…` in Phase 6 together with the backend keys.
- [ ] **Step 4: Docs** — `.env.example`: keep both keys, add a comment line `# Store builds read these from EAS environments (eas env:list); .env is for local dev only`. `README.md`: add `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the env table and a "Builds (EAS)" section with the three commands `npx eas-cli@latest build --profile preview --platform all`, `… --profile production …`, `npx eas-cli@latest submit --profile production --platform all --latest`. `.gitignore`: add `play-service-account.json`.
- [ ] **Step 5: Verify** — `npx eas-cli@latest env:list --environment production --format long --non-interactive` shows both names; assert the values: API URL matches `^https://` and the key matches `^pk_(test|live)_[A-Za-z0-9]{8,}$` (copy them into `grep -E`). `npx eas-cli@latest config --profile production --platform ios --non-interactive` resolves without error and shows `bundleIdentifier: <BUNDLE_ID>`. `jq -e '.cli.appVersionSource=="remote" and .build.production.autoIncrement==true' eas.json` → `true`.
- [ ] **Step 6: Repo gate** — `npx tsc --noEmit && npx eslint .`
- [ ] **Step 7: Mark done in ../STATUS.md; commit message** `chore(release): P5-T04 eas.json, EAS environments, build docs`

### Task P5-T05: `links.ts` final URLs + `reportTaskUrl`

**Files:**
- Create or modify: `/Users/leandromartins/Documents/proxy-app/src/common/constants/links.ts` (Phase 3 APP-02 creates this file for the Profile row and the sign-up links; if Phase 3 named it `legal.ts`, keep that name and add the exports below there — the sign-up/Profile UI is Phase 3's, only the values and the two new exports are Phase 5's)
- Test: `/Users/leandromartins/Documents/proxy-app/src/common/constants/__tests__/links.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const SITE_ORIGIN = 'https://<SITE_ORIGIN host>'      // no trailing slash
  export const TERMS_URL = `${SITE_ORIGIN}/terms.html`
  export const PRIVACY_URL = `${SITE_ORIGIN}/privacy.html`
  export const SUPPORT_URL = `${SITE_ORIGIN}/support.html`
  export const DELETE_ACCOUNT_URL = `${SITE_ORIGIN}/delete-account.html`
  export const SUPPORT_EMAIL = '<SUPPORT_EMAIL>'
  export function reportTaskUrl(taskId: string): string  // `${SUPPORT_URL}?task=${encodeURIComponent(taskId)}`
  ```
  Consumed by T06 (`reportTaskUrl`), Phase 3 Profile/sign-up (`TERMS_URL`, `PRIVACY_URL`, `SUPPORT_URL`), T07 (same paths must exist on the site).

- [ ] **Step 1: Write the failing test** `links.test.ts`:
  ```ts
  import { DELETE_ACCOUNT_URL, PRIVACY_URL, reportTaskUrl, SITE_ORIGIN, SUPPORT_URL, TERMS_URL } from '@/common/constants/links'
  test('every link is https on the site origin', () => {
    for (const url of [TERMS_URL, PRIVACY_URL, SUPPORT_URL, DELETE_ACCOUNT_URL]) {
      expect(url.startsWith('https://')).toBe(true)
      expect(url.startsWith(SITE_ORIGIN + '/')).toBe(true)
    }
    expect(SITE_ORIGIN.endsWith('/')).toBe(false)
  })
  test('reportTaskUrl pre-fills the task id', () => {
    expect(reportTaskUrl('a1b2')).toBe(`${SUPPORT_URL}?task=a1b2`)
    expect(reportTaskUrl('x y')).toBe(`${SUPPORT_URL}?task=x%20y`)
  })
  ```
- [ ] **Step 2: Run it, expect failure** — `npx jest src/common/constants/__tests__/links.test.ts` → `Cannot find module '@/common/constants/links'` or `reportTaskUrl is not a function`.
- [ ] **Step 3: Implement** the exports above in `links.ts` with the D24 origin.
- [ ] **Step 4: Run it, expect pass** — same command → `Tests: 2 passed`.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx eslint . && npm test`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(links): P5-T05 site URLs and reportTaskUrl`

### Task P5-T06: "Denunciar" row on task detail

**Files:**
- Create: `/Users/leandromartins/Documents/proxy-app/src/feature/tasks/components/ReportTaskRow.tsx`
- Modify: `/Users/leandromartins/Documents/proxy-app/app/(app)/tasks/[id]/index.tsx:187-196` (render the row after the `Recibo` block, inside the populated branch, for every status)
- Test: `/Users/leandromartins/Documents/proxy-app/src/feature/tasks/components/__tests__/ReportTaskRow.test.tsx`

**Interfaces:**
- Consumes: `reportTaskUrl(taskId)` from T05; `openBrowserAsync` from `expo-web-browser` (already used in `app/(app)/(tabs)/wallet.tsx:33`); colours `MUTED`, `BORDER`, `DESTRUCTIVE` from `@/common/theme/colors`; `Flag` icon from `lucide-react-native`.
- Produces: `export function ReportTaskRow({ taskId }: { taskId: string }): JSX.Element` — a full-width `Pressable` with `accessibilityRole="button"`, label `Denunciar esta tarefa`, hint text `Conteúdo impróprio, golpe ou comportamento inadequado`, `testID="report-task-row"`; `onPress` → `WebBrowser.openBrowserAsync(reportTaskUrl(taskId))`. The Profile "Suporte" row (REL-14 other half) is Phase 3.

- [ ] **Step 1: Write the failing test** `ReportTaskRow.test.tsx`:
  ```tsx
  import { fireEvent, render, screen } from '@testing-library/react-native'
  import * as WebBrowser from 'expo-web-browser'
  import { ReportTaskRow } from '@/feature/tasks/components/ReportTaskRow'
  import { SUPPORT_URL } from '@/common/constants/links'
  jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(async () => ({ type: 'cancel' })) }))
  test('opens the support page with the task id', () => {
    render(<ReportTaskRow taskId="t-123" />)
    fireEvent.press(screen.getByText('Denunciar esta tarefa'))
    expect(WebBrowser.openBrowserAsync).toHaveBeenCalledWith(`${SUPPORT_URL}?task=t-123`)
  })
  ```
  Plus, in the existing task-detail render test file from Phase 3 (`app/(app)/tasks/[id]/__tests__/index.test.tsx` or wherever Phase 3 put it; create `src/feature/tasks/__tests__/task-detail-report.test.tsx` if none exists), `renders for a completed task`: render the screen with `useTaskByIdQuery` mocked to a `completed` task and `useProxyAuth` to a CLIENT → `screen.getByTestId('report-task-row')` exists, and the same for `canceled`.
- [ ] **Step 2: Run it, expect failure** — `npx jest src/feature/tasks/components/__tests__/ReportTaskRow.test.tsx` → `Cannot find module`.
- [ ] **Step 3: Implement** `ReportTaskRow.tsx`; in `index.tsx` add `<ReportTaskRow taskId={task.id} />` wrapped in `<View style={{ marginTop: 24 }}>` right after the `Recibo` conditional (line 195) so it is the last element of the populated branch for every status.
- [ ] **Step 4: Run it, expect pass** — both test files green.
- [ ] **Step 5: Repo gate** — `npx tsc --noEmit && npx eslint . && npm test`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `feat(tasks): P5-T06 Denunciar row on task detail`

### Task P5-T07: Static site `site/` — OWNER INPUT (D24 + legal identity)

**Files:**
- Create: `/Users/leandromartins/Documents/proxy-app/site/index.html`, `site/privacy.html`, `site/terms.html`, `site/support.html`, `site/delete-account.html`, `site/stripe/return/index.html`, `site/styles.css`, `site/_headers`, `site/check-site.mjs`
- Delete: `/Users/leandromartins/Documents/proxy-app/stripe-redirect/index.html` (content moves to `site/stripe/return/index.html`; `git mv stripe-redirect/index.html site/stripe/return/index.html` keeps history)
- Modify: `/Users/leandromartins/Documents/proxy-app/README.md` (section "Site estático (`site/`)")
- Test: `node site/check-site.mjs`

**Interfaces:**
- Consumes: paths fixed by T05 (`/privacy.html`, `/terms.html`, `/support.html`, `/delete-account.html`), `?task=` query from `reportTaskUrl`, `?refresh=1` appended by the backend to `refresh_url` (BE-31, Phase 2).
- Produces: the five public URLs under `<SITE_ORIGIN>`; `/stripe/return/` is the value of `STRIPE_CONNECT_RETURN_URL` (T10/T13).

- [ ] **Step 1: Write the check script first** (`site/check-site.mjs`, plain Node ≥ 20, no deps): reads each required file, fails (exit 1, prints `file: rule`) unless: it contains `<html lang="pt-BR">`, a non-empty `<title>`, `<meta name="viewport"`, no unresolved placeholder (`/<[A-Z_]{3,}>/` or `TODO`), and the per-page anchors below; `stripe/return/index.html` must contain `proxyapp://wallet` twice (meta refresh + button), the string `refresh=1` handling (`location.search`) and the copy `O link expirou`. On success prints `site: 5 pages OK`.
  Required ids — `privacy.html`: `#controlador`, `#dados-coletados`, `#finalidades`, `#compartilhamento`, `#retencao`, `#direitos`, `#seguranca`, `#contato`, `#vigencia`; `terms.html`: `#aceite`, `#elegibilidade`, `#papeis`, `#tarefas`, `#pagamentos`, `#cancelamento`, `#conduta`, `#denuncias`, `#responsabilidade`, `#alteracoes`, `#foro`, `#contato`; `support.html`: `#contato`, `#denunciar`, `#faq`, and a `mailto:<SUPPORT_EMAIL>` link; `delete-account.html`: `#no-app`, `#por-email`, `#o-que-acontece`, `#prazos`, and a `mailto:<SUPPORT_EMAIL>?subject=` link.
- [ ] **Step 2: Run it, expect failure** — `node site/check-site.mjs` → `privacy.html: missing file` (exit 1).
- [ ] **Step 3: Write the pages** (pt-BR, same visual language as the current redirect page: system font stack, `#f8f6f2` background, `#1e2024` text, `#f9c526` accent; one shared `styles.css`; max-width 680 px; no JS except on `support.html` and `stripe/return`). Content requirements:
  - **`privacy.html` — Política de Privacidade (LGPD, Lei 13.709/2018)**: `#controlador` — `<LEGAL_NAME>`, CNPJ `<CNPJ>`, `<ADDRESS>`, encarregado (DPO) `<SUPPORT_EMAIL>`; `#dados-coletados` — table with three columns (dado, quando, base legal): nome, e-mail, telefone e senha (hash) no cadastro; tipo de perfil (Cliente/Proxy); localização precisa e endereço da tarefa ao criar uma tarefa (visível para Proxies da mesma cidade); foto de comprovante ao finalizar; títulos, descrições, avaliações e comentários; dados de pagamento: bandeira, últimos 4 dígitos e identificador do método na Stripe — **o número do cartão nunca passa pelos nossos servidores**; histórico de transações; identificador de usuário; dados que a Stripe coleta diretamente no cadastro de recebimento do Proxy (CPF/CNPJ, data de nascimento, endereço, conta bancária) nas páginas da Stripe. Explicit "não coletamos": identificadores de dispositivo, dados de uso/analytics, relatórios de falha, contatos; `#finalidades` — execução do contrato (cadastro, publicação, pagamento, repasse), obrigação legal (registros fiscais), legítimo interesse (segurança, prevenção a fraude, suporte); `#compartilhamento` — operadores: Stripe (pagamentos e Connect), Amazon Web Services (envio de e-mail), Cloudflare (hospedagem do site e das imagens), Railway (hospedagem da API e banco de dados); transferência internacional (art. 33) por cláusulas contratuais dos operadores; outros usuários veem: nome, foto, avaliação, número de tarefas e, para o executor de uma tarefa em andamento, o telefone (D21); `#retencao` — enquanto a conta existir; ao excluir: dados pessoais anonimizados imediatamente, identificadores de pagamento mantidos por 180 dias (D13), registros financeiros pelo prazo legal de 5 anos; `#direitos` — art. 18 list (confirmação, acesso, correção, anonimização/bloqueio/eliminação, portabilidade, informação sobre compartilhamento, revogação do consentimento) + how to exercise (e-mail, prazo de 15 dias) + link to `delete-account.html`; `#seguranca` — TLS, senhas com hash, acesso restrito; `#contato`; `#vigencia` — "Vigente a partir de <date>" + versioning line. Also one line: service is for adults (18+).
  - **`terms.html` — Termos de Uso**: `#aceite`; `#elegibilidade` — 18+, residentes no Brasil, CPF válido para Proxies (exigido pela Stripe); `#papeis` — Cliente publica e paga, Proxy executa e recebe, a plataforma intermedia (não é empregadora nem parte do serviço); `#tarefas` — publicar, aceitar, executar, enviar comprovante, validar; liberação automática 7 dias após o envio do comprovante se o cliente não validar nem contestar (D18); `#pagamentos` — cobrança no cartão do Cliente no momento em que um Proxy aceita; valor cobrado = preço + taxa da plataforma (20 %) + taxa de processamento (3,99 % + R$ 0,39) (D1); Proxy recebe o preço anunciado via Stripe Connect após validação; valores em BRL; `#cancelamento` — Cliente pode cancelar enquanto disponível, ou até 1 h após o início com estorno integral (D7); `#conduta` — proibidos: atividades ilegais, conteúdo ofensivo, dados falsos, uso para fraude; `#denuncias` — como denunciar (link `support.html#denunciar`), moderação manual, suspensão de contas; `#responsabilidade` — limitações, disputas entre usuários; `#alteracoes`; `#foro` — legislação brasileira, foro de `<CITY>`; `#contato`.
  - **`support.html` — Suporte e denúncias**: `#contato` — `<SUPPORT_EMAIL>`, resposta em até 2 dias úteis; `#denunciar` — explanation + a button `Denunciar por e-mail` whose `href` is built by a 10-line inline script from `location.search` (`task` param): `mailto:<SUPPORT_EMAIL>?subject=Denúncia%20-%20tarefa%20<id>&body=Tarefa:%20<id>%0AMotivo:%20` (fallback without id when the param is missing); `#faq` — "Meu pagamento está preso em verificação" (7 dias → liberação automática), "Não consigo concluir o cadastro de recebimento" (Stripe, dados do titular), "Quero excluir minha conta" (link).
  - **`delete-account.html` — Excluir sua conta**: `#no-app` — Perfil → "Excluir conta" → confirmar duas vezes; `#por-email` — for users who cannot sign in: `mailto:<SUPPORT_EMAIL>?subject=Exclusão%20de%20conta` with the required body fields (e-mail cadastrado; we confirm by replying to that address); `#o-que-acontece` — tarefas disponíveis são canceladas automaticamente; a exclusão é bloqueada enquanto houver tarefa em andamento ou aguardando validação (finalize ou aguarde a liberação); dados pessoais anonimizados; cartão removido; `#prazos` — pedidos por e-mail atendidos em até 15 dias; identificadores de pagamento mantidos 180 dias, registros fiscais 5 anos (same as privacy).
  - **`stripe/return/index.html`**: the current `stripe-redirect/index.html` content, plus: if `new URLSearchParams(location.search).get('refresh') === '1'` replace the `<h1>` with `O link expirou` and the paragraph with `Volte ao app e toque em "Configurar recebimento" de novo pra gerar um novo link.`; keep the meta refresh and button to `proxyapp://wallet` in both branches.
  - **`index.html`**: one-paragraph description + links to the four pages (the stores' "Marketing URL" can point here).
  - **`_headers`** (Cloudflare Pages): `/*` → `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`.
- [ ] **Step 4: Run it, expect pass** — `node site/check-site.mjs` → `site: 5 pages OK`; `grep -rn "proxyapp://wallet" site/stripe/return/index.html | wc -l` ≥ 2; `ls stripe-redirect 2>&1` → `No such file or directory`.
- [ ] **Step 5: Docs** — README section "Site estático (`site/`)" listing the five URLs and `node site/check-site.mjs`; `grep -rn "stripe-redirect" README.md CLAUDE.md ../proxy-api/CLAUDE.md` → 0 hits (update any mention to `site/stripe/return/`).
- [ ] **Step 6: Repo gate** — `npx tsc --noEmit && npx eslint .` (ESLint ignores `site/` only if `eslint.config.js` `ignores` includes `'site/*'`; add it).
- [ ] **Step 7: Mark done in ../STATUS.md; commit message** `feat(site): P5-T07 privacy, terms, support, delete-account and Stripe return pages`

### Task P5-T08: Cloudflare Pages deploy workflow + project

**Files:**
- Create: `/Users/leandromartins/Documents/proxy-app/.github/workflows/deploy-site.yml`
- Owner: Cloudflare Pages project `<CF_PAGES_PROJECT>` (created in T11), GitHub repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- Test: `curl` against `<SITE_ORIGIN>`

**Interfaces:**
- Consumes: `site/` from T07; Pages project + token from T11.
- Produces: every push to `main` touching `site/**` deploys; the five URLs return 200 over https.

- [ ] **Step 1: Write the workflow**: `on: push: branches: [main], paths: ['site/**']` + `workflow_dispatch`; one job on `ubuntu-latest`, steps: `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22`, `run: node site/check-site.mjs`, then `cloudflare/wrangler-action@v3` with `apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}`, `command: pages deploy site --project-name=<CF_PAGES_PROJECT> --branch=main --commit-dirty=true`. `permissions: contents: read`.
- [ ] **Step 2: Owner adds the two GitHub secrets** — repo → Settings → Secrets and variables → Actions → New repository secret (`CLOUDFLARE_API_TOKEN` from T11 step 4, `CLOUDFLARE_ACCOUNT_ID` from the Cloudflare dashboard URL). Agent verification: `gh secret list -R <owner>/proxy-app` lists both names.
- [ ] **Step 3: First deploy** — push to `main` (owner) or `gh workflow run deploy-site.yml` then `gh run watch`; expect `✓ Deployment complete`.
- [ ] **Step 4: Verify** — for each of `privacy.html terms.html support.html delete-account.html stripe/return/` run `curl -sI <SITE_ORIGIN>/<path> | head -1` → `HTTP/2 200`; `curl -s "<SITE_ORIGIN>/stripe/return/?refresh=1" | grep -c "O link expirou"` → `1` (string present in the page source; the branch is chosen client-side); `curl -sI <SITE_ORIGIN>/privacy.html | grep -i x-frame-options` → `DENY`.
- [ ] **Step 5: Mark done in ../STATUS.md; commit message** `ci(site): P5-T08 Cloudflare Pages deploy workflow`

### Task P5-T09: Backend container readiness (Dockerfile, `.dockerignore`, `/health`)

**Files:**
- Verify/Create: `/Users/leandromartins/Documents/proxy-api/Dockerfile`, `/Users/leandromartins/Documents/proxy-api/.dockerignore`, `/Users/leandromartins/Documents/proxy-api/.nvmrc` (`22`), `package.json` `engines.node: "22.x"` (Phase 0 scope — this task verifies and completes it)
- Verify: `GET /health` controller from Phase 0 (expected `src/health/health.controller.ts`, `@SkipThrottle()`, no auth, `{ status: 'ok' }`, runs `SELECT 1` through the global `PrismaService`)
- Test: `/Users/leandromartins/Documents/proxy-api/test/health.e2e-spec.ts` (create if Phase 0 did not)

**Interfaces:**
- Consumes: `npm run build` = `prisma generate && nest build` (`package.json:9`) emitting `dist/src/main.js` (`start:prod`, `package.json:17`); Prisma client generated into `node_modules/.prisma/client` (`prisma/schema.prisma:1-4`), so `node_modules` must be copied from the build stage **after** `npm run build`; `prisma.config.ts` (imports `dotenv/config` and reads `DATABASE_URL`) must be present at runtime for `prisma migrate deploy`.
- Produces: image whose `CMD` is `sh -c "npx prisma migrate deploy && node dist/src/main"`; `GET /health` → 200 `{"status":"ok"}`. T12 deploys it.

- [ ] **Step 1: Write/confirm the failing test** `test/health.e2e-spec.ts`: `GET /health` → `200`, body `{ status: 'ok' }`; `GET /health` 101 times in a loop → all `200` (proves `@SkipThrottle()`; the e2e env skips the throttler anyway via `skipIf`, so also assert the controller carries the decorator with `Reflect.getMetadata('THROTTLER:SKIP', HealthController)` truthy — `@nestjs/throttler` stores it under `THROTTLER:SKIPdefault`/`THROTTLER:SKIP`; read the constant from `@nestjs/throttler`'s `THROTTLER_SKIP` export instead of hard-coding).
- [ ] **Step 2: Run it** — `npx jest --config test/jest-e2e.config.ts test/health.e2e-spec.ts` → passes if Phase 0 is complete; otherwise implement `HealthModule` (`src/health/health.module.ts`, controller as above) and register it in `app.module.ts`.
- [ ] **Step 3: Dockerfile** (if absent or different from this shape, align it; Debian slim instead of alpine because `sharp` (Phase 1) and Prisma's schema engine prefer glibc):
  ```dockerfile
  FROM node:22-bookworm-slim AS build
  WORKDIR /app
  RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
  COPY package.json package-lock.json prisma.config.ts ./
  COPY prisma ./prisma
  RUN npm ci
  COPY . .
  RUN npm run build && npm prune --omit=dev

  FROM node:22-bookworm-slim
  WORKDIR /app
  ENV NODE_ENV=production
  RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
  COPY --from=build /app/node_modules ./node_modules
  COPY --from=build /app/dist ./dist
  COPY --from=build /app/prisma ./prisma
  COPY --from=build /app/package.json /app/prisma.config.ts ./
  EXPOSE 3333
  CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
  ```
  `.dockerignore`: `node_modules`, `dist`, `.env*`, `!.env.example`, `test`, `data`, `coverage`, `.git`, `src/tmp`, `docs`. Note `prisma` CLI is a runtime dependency already (`package.json:48`), which is what makes `npx prisma migrate deploy` work after `npm prune --omit=dev`.
- [ ] **Step 4: Verify the image builds** — `cd /Users/leandromartins/Documents/proxy-api && docker build -t proxy-api:local . 2>&1 | tail -3` → `naming to docker.io/library/proxy-api:local`; `docker run --rm --entrypoint sh proxy-api:local -c 'ls dist/src/main.js node_modules/.prisma/client/index.js prisma.config.ts && npx prisma --version | head -2'` lists the three files and prints the Prisma version (no DB needed; the API process is **not** started — owner rule).
- [ ] **Step 5: Repo gate** — api gate; `node -e "const p=require('./package.json');if(p.engines?.node!=='22.x')process.exit(1)"` → exit 0; `cat .nvmrc` → `22`.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `chore(api): P5-T09 container readiness verified (Dockerfile, health)`

### Task P5-T10: Backend production env schema + `.env.example` + docs

**Files:**
- Modify: `/Users/leandromartins/Documents/proxy-api/src/env/env.ts:3-20`, `/Users/leandromartins/Documents/proxy-api/.env.example`, `/Users/leandromartins/Documents/proxy-api/CLAUDE.md:181-192` (Environment variables) and `:146-157` (Stripe webhooks — add the second endpoint)
- Modify only if Phase 2 did not: `/Users/leandromartins/Documents/proxy-api/src/modules/auth/use-cases/create-merchant-account.service.ts:67-78`, `/Users/leandromartins/Documents/proxy-api/src/stripe/stripe.service.ts:141-151`
- Test: `/Users/leandromartins/Documents/proxy-api/src/env/env.spec.ts`

**Interfaces:**
- Consumes: Phase 1 keys (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`) and Phase 2's `STRIPE_CONNECT_RETURN_URL` if it landed (BE-31/BE-48). **Check first:** `grep -n "STRIPE_CONNECT_RETURN_URL\|DEV_CALLBACK_URL\|PROD_CALLBACK_URL" src/env/env.ts src/modules/auth/use-cases/create-merchant-account.service.ts`.
- Produces: `envSchema` that rejects a production boot with a non-https Connect return URL or a non-e-mail sender; `.env.example` listing every key in `envSchema` in the same order; CLAUDE.md documenting both webhook endpoints and the production env table. T12 copies the keys from `.env.example`.

- [ ] **Step 1: Write the failing test** `src/env/env.spec.ts` (unit, `npx jest src/env/env.spec.ts`):
  ```ts
  const base = { DATABASE_URL: 'postgresql://u:p@h/db', JWT_PRIVATE_KEY: 'x', JWT_PUBLIC_KEY: 'x', STRIPE_SECRET_KEY: 'sk_test_1', STRIPE_PUBLIC_KEY: 'pk_test_1', STRIPE_WEBHOOK_SECRET: 'whsec_1', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_2', STRIPE_CONNECT_RETURN_URL: 'https://proxy.example.com/stripe/return/', AWS_REGION: 'us-east-1', AWS_ACCESS_KEY_ID: 'a', AWS_SECRET_ACCESS_KEY: 'b', AWS_SES_FROM_EMAIL: 'noreply@example.com', S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com', S3_REGION: 'auto', S3_BUCKET: 'proxy-proofs', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' }
  it('accepts a complete production env', () => expect(envSchema.safeParse({ ...base, NODE_ENV: 'production' }).success).toBe(true))
  it('rejects http return URL in production', () => expect(envSchema.safeParse({ ...base, NODE_ENV: 'production', STRIPE_CONNECT_RETURN_URL: 'http://proxy.example.com/stripe/return/' }).success).toBe(false))
  it('accepts http return URL in development', () => expect(envSchema.safeParse({ ...base, NODE_ENV: 'development', STRIPE_CONNECT_RETURN_URL: 'http://localhost:8787/stripe/return/' }).success).toBe(true))
  it('rejects a non-email sender', () => expect(envSchema.safeParse({ ...base, NODE_ENV: 'production', AWS_SES_FROM_EMAIL: 'noreply' }).success).toBe(false))
  it('.env.example lists every schema key', () => { const keys = Object.keys(envSchema.shape); const example = readFileSync('.env.example', 'utf8'); for (const k of keys) expect(example).toMatch(new RegExp(`^${k}=`, 'm')) })
  ```
  (adjust `base` to the exact S3/Connect key names Phase 1 chose — read them from `env.ts`; the test must use real names.)
- [ ] **Step 2: Run it, expect failure** — e.g. `Expected: true, Received: false` on the production case (missing `STRIPE_CONNECT_RETURN_URL`) or the `.env.example` regex failing for `S3_*`.
- [ ] **Step 3: Implement** — in `env.ts`: `STRIPE_CONNECT_RETURN_URL: z.url()`, `AWS_SES_FROM_EMAIL: z.email()`, and a `.superRefine((env, ctx) => { if (env.NODE_ENV === 'production' && !env.STRIPE_CONNECT_RETURN_URL.startsWith('https://')) ctx.addIssue({ code: 'custom', path: ['STRIPE_CONNECT_RETURN_URL'], message: 'must be https in production' }) })`; remove `DEV_CALLBACK_URL`/`PROD_CALLBACK_URL` (if still present) and make `create-merchant-account.service.ts:67-72` read `STRIPE_CONNECT_RETURN_URL` unconditionally, passing `return_url: url` and `refresh_url: \`${url}?refresh=1\`` in `stripe.service.ts:141-151` (skip when Phase 2 did this). `.env.example`: every key, grouped with comments, production-safe placeholders (`AWS_SES_FROM_EMAIL=noreply@<DOMAIN>`, `STRIPE_CONNECT_RETURN_URL=https://<SITE_ORIGIN>/stripe/return/`).
- [ ] **Step 4: Run it, expect pass** — `npx jest src/env/env.spec.ts` → `5 passed`.
- [ ] **Step 5: Docs** — CLAUDE.md env section = the table from T12 step 3 (names + where the value comes from); webhooks section: two Dashboard endpoints (platform events `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created`; Connect events `account.updated`, `payout.failed`), both pointing at `POST <API_ORIGIN>/stripe/webhook`, secrets `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET`; local dev keeps `stripe listen` (one secret). Remove the `DEV_CALLBACK_URL`/`PROD_CALLBACK_URL` line (`CLAUDE.md:187`).
- [ ] **Step 6: Repo gate** — api gate (e2e `test/.env.test` must gain the new keys; Phase 0 untracked it, so edit the local copy and the e2e `load-env`/factory defaults).
- [ ] **Step 7: Mark done in ../STATUS.md; commit message** `chore(api): P5-T10 production env schema and example`

### Task P5-T11: Cloudflare account — DNS zone, R2 bucket + token, Pages project — OWNER

**Files:** none in repo. Values produced go to `../DECISIONS.md` D24/D25 rows and to T08/T12.

**Interfaces:**
- Produces: `<CF_ACCOUNT_ID>`, `<CF_PAGES_PROJECT>` (Pages), `<R2_BUCKET>` + S3 credentials (`S3_ENDPOINT=https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), `CLOUDFLARE_API_TOKEN` (Pages deploy).

- [ ] **Step 1: Zone** — Cloudflare dashboard → Add a domain → `<DOMAIN>` → Free plan → change the registrar's nameservers to the two shown. Verification: `dig +short NS <DOMAIN>` → two `*.ns.cloudflare.com`.
- [ ] **Step 2: Pages project** — Workers & Pages → Create → Pages → "Upload assets" (direct upload; the workflow deploys) → project name `<CF_PAGES_PROJECT>` → create. Then Custom domains → Set up a custom domain → `proxy.<DOMAIN>` (Cloudflare adds the CNAME). `<SITE_ORIGIN>` = `https://proxy.<DOMAIN>`; until DNS propagates use `https://<CF_PAGES_PROJECT>.pages.dev`.
- [ ] **Step 3: R2** — R2 Object Storage → Create bucket → name `<R2_BUCKET>` (e.g. `proxy-proofs`), location hint South America (if offered) → Create. Settings: keep **no public access** (proofs are streamed by the API through `GET /tasks/:id/proof`). Then R2 → Manage R2 API Tokens → Create API token → name `proxy-api-prod`, permissions **Object Read & Write**, scope: only `<R2_BUCKET>`, TTL forever → copy Access Key ID / Secret Access Key (shown once) → these are `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`. Record `<CF_ACCOUNT_ID>` from the dashboard URL (`dash.cloudflare.com/<CF_ACCOUNT_ID>`).
- [ ] **Step 4: Pages deploy token** — My Profile → API Tokens → Create Token → template "Edit Cloudflare Workers" (includes `Cloudflare Pages: Edit`) → limit to this account → Create → copy as `CLOUDFLARE_API_TOKEN` (T08 step 2).
- [ ] **Step 5: Verification (agent, with the S3 keys in the shell env only, never written to disk)** — `npx --yes @aws-sdk/client-s3@3 >/dev/null 2>&1 || true`; simplest: `AWS_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY aws s3 ls --endpoint-url https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com s3://<R2_BUCKET>` → exit 0 (empty listing). If `aws` is missing: `brew install awscli` first. Pages: `curl -sI https://<CF_PAGES_PROJECT>.pages.dev | head -1` → `HTTP/2 200` or `404` (project exists; 5xx/`could not resolve` means it does not).
- [ ] **Step 6: Mark done in ../STATUS.md** (no commit; record values in DECISIONS D24/D25).

### Task P5-T12: Railway — Postgres + API service + env vars + domain — OWNER (D25)

**Files:** none in repo (reads `/Users/leandromartins/Documents/proxy-api/.env.example` from T10 as the checklist).

**Interfaces:**
- Consumes: image from T09; env list from T10; `S3_*` from T11; webhook secrets + return URL from T13; SES sender/keys from T14.
- Produces: `<API_ORIGIN>` serving `/health` 200 with migrations applied; `trust proxy` behaviour verified (REL-07).

- [ ] **Step 1: Project + database** — railway.com → New Project → "Deploy PostgreSQL" → wait for `Postgres` to be online. (Render alternative: New → PostgreSQL, then New → Web Service, same env table; health check path `/health`.)
- [ ] **Step 2: API service** — New → GitHub Repo → `proxy-api` (install the Railway GitHub app if asked) → Railway detects the `Dockerfile`. Settings → Deploy: Healthcheck Path `/health`, Healthcheck Timeout `300`, Restart Policy `On Failure`; Settings → Networking → Generate Domain (target port `3333`), then Custom Domain → `api.<DOMAIN>` → add the shown CNAME in Cloudflare DNS (proxy status DNS-only/grey cloud first; switch to proxied later if desired). Region: closest available to Brazil (`us-east` if `sa-east` is not offered).
- [ ] **Step 3: Variables** (Variables tab → Raw Editor; every key from `envSchema`; values below). JWT keys: `openssl genrsa -out /tmp/jwt.pem 2048 && openssl rsa -in /tmp/jwt.pem -pubout -out /tmp/jwt.pub && base64 -i /tmp/jwt.pem | tr -d '\n' | pbcopy` (then the same for `.pub`); delete `/tmp/jwt.*` after pasting.

  | Key | Value / source |
  |---|---|
  | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}?connection_limit=10` (Railway reference; private network) |
  | `PORT` | `3333` |
  | `NODE_ENV` | `production` |
  | `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY` | base64 PEMs generated above (new pair, never the dev pair) |
  | `STRIPE_SECRET_KEY`, `STRIPE_PUBLIC_KEY` | **test-mode** `sk_test_…`/`pk_test_…` until approval (D27) |
  | `STRIPE_WEBHOOK_SECRET` | platform endpoint `whsec_…` (T13) |
  | `STRIPE_CONNECT_WEBHOOK_SECRET` | Connect endpoint `whsec_…` (T13) |
  | `STRIPE_CONNECT_RETURN_URL` | `<SITE_ORIGIN>/stripe/return/` |
  | `AWS_REGION` | SES region used in T14 (e.g. `us-east-1` or `sa-east-1`) |
  | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | IAM user `proxy-api-ses` (T14) |
  | `AWS_SES_FROM_EMAIL` | `noreply@<DOMAIN>` |
  | `S3_ENDPOINT` | `https://<CF_ACCOUNT_ID>.r2.cloudflarestorage.com` |
  | `S3_REGION` | `auto` |
  | `S3_BUCKET` | `<R2_BUCKET>` |
  | `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | R2 token (T11) |
  | any other key present in `env.ts` (Phase 1/2 additions) | from its owner task; the diff in step 5 catches omissions |
- [ ] **Step 4: Deploy** — Deployments → the first deploy runs `prisma migrate deploy` then starts; Logs must show `N migrations found` / `All migrations have been successfully applied` followed by `🚀 ~ Starting server on port 3333` (or Phase 0's logger line).
- [ ] **Step 5: Verification (agent)** — `curl -s -o /dev/null -w '%{http_code}\n' https://<API_ORIGIN>/health` → `200`; `curl -s https://<API_ORIGIN>/health` → `{"status":"ok"}`; `curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<API_ORIGIN>/stripe/webhook` → `400` (route exists, signature missing; `404` means the image is stale). Env completeness: `railway variables --json --service <service> | jq -r 'keys[]' | sort > /tmp/host.txt` (install: `npm i -g @railway/cli && railway login`) vs `grep -oE '^  [A-Z0-9_]+:' /Users/leandromartins/Documents/proxy-api/src/env/env.ts | tr -d ' :' | sort > /tmp/schema.txt; comm -23 /tmp/schema.txt /tmp/host.txt` → empty. Throttler (review focus 4): `for i in $(seq 1 6); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://<API_ORIGIN>/auth/session -H 'content-type: application/json' -d '{"email":"nobody@example.com","password":"wrongpass1"}'; done` → five `401`/`404` then `429`; immediately after, the owner's phone on cellular opening the app and failing one sign-in gets the normal error, not "muitas tentativas" (if it gets 429, `trust proxy` from Phase 0 is missing or the hop count is wrong).
- [ ] **Step 6: Mark done in ../STATUS.md** (record `<API_ORIGIN>` in DECISIONS D25).

### Task P5-T13: Stripe Dashboard — two webhook endpoints, return URL, Connect settings — OWNER

**Files:** none in repo.

**Interfaces:**
- Consumes: `<API_ORIGIN>` (T12 domain can be created before the first deploy), `<SITE_ORIGIN>/stripe/return/` (T07/T08).
- Produces: `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` for T12; Connect branding/return URL settings. All in **test mode** now; repeated in live mode in Phase 6.

- [ ] **Step 1: Platform endpoint** — Dashboard (Test mode toggle on) → Developers → Webhooks → Add destination → Events from: **Your account** → select events `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, `charge.dispute.created` → Continue → Endpoint type Webhook endpoint → URL `https://<API_ORIGIN>/stripe/webhook` → Create → Reveal signing secret → `STRIPE_WEBHOOK_SECRET`.
- [ ] **Step 2: Connect endpoint** — Add destination → Events from: **Connected accounts** → events `account.updated`, `payout.failed` → same URL `https://<API_ORIGIN>/stripe/webhook` → Create → signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`.
- [ ] **Step 3: Connect settings** — Settings → Connect → Onboarding options / Branding: business name `<APP_NAME>`, icon, brand colour `#F9C526`, accent `#1E2024`; Settings → Connect → Platform profile completed (Brazil, services marketplace, platform collects payments and pays out to individuals). Confirm the platform account's country is Brazil with CNPJ (required for BR→BR transfers, §4.5).
- [ ] **Step 4: Verification (agent, test secret in the shell only)** — `curl -s https://api.stripe.com/v1/webhook_endpoints -u "$STRIPE_SECRET_KEY:" | jq '[.data[] | {url, status, enabled_events}]'` → two objects, both `status: "enabled"`, URL `https://<API_ORIGIN>/stripe/webhook`, event lists exactly as above. After T12 is live: Dashboard → the Connect endpoint → "Send test event" → `account.updated` → the attempt shows `200` and the API logs `Incoming webhook (signature present …)`; same for `payment_intent.succeeded` on the platform endpoint (the handler will log "unknown payment" for a fake id — that is fine; 200 is the point).
- [ ] **Step 5: Mark done in ../STATUS.md**.

### Task P5-T14: AWS SES — domain identity, DKIM, production access, IAM — OWNER

**Files:** none in repo.

**Interfaces:**
- Produces: verified sender domain `<DOMAIN>`, `AWS_SES_FROM_EMAIL=noreply@<DOMAIN>`, IAM access key with `ses:SendEmail`/`ses:SendRawEmail` only, production (non-sandbox) sending. Replaces the `@gmail.com` sender (REL-15).

- [ ] **Step 1: Identity** — AWS Console → Amazon SES (choose the region you will put in `AWS_REGION`; `us-east-1` is fine for BR traffic) → Identities → Create identity → Domain → `<DOMAIN>` → Easy DKIM, RSA_2048 → Create. Copy the three CNAME records → Cloudflare DNS → add them (**DNS only**, grey cloud). Optional but recommended: Custom MAIL FROM domain `mail.<DOMAIN>` (adds an MX + TXT). Add a DMARC TXT `_dmarc.<DOMAIN>` = `v=DMARC1; p=none; rua=mailto:<SUPPORT_EMAIL>`.
- [ ] **Step 2: Production access** — SES → Account dashboard → "Request production access" → Mail type Transactional, website `<SITE_ORIGIN>`, use-case description: "Password-reset codes for a mobile marketplace app; one e-mail per user request; bounces handled by not retrying" → Submit. Lead time: up to 24 h.
- [ ] **Step 3: IAM** — IAM → Users → Create user `proxy-api-ses` (no console access) → Attach policies directly → create inline policy allowing `ses:SendEmail`, `ses:SendRawEmail` on `arn:aws:ses:<region>:<account>:identity/<DOMAIN>` → Create access key (Application running outside AWS) → `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` for T12. Rotate/delete the key that currently lives in the local `.env`.
- [ ] **Step 4: Verification (agent; `brew install awscli` if missing)** — `aws sesv2 get-email-identity --email-identity <DOMAIN> --region <region> | jq '.VerifiedForSendingStatus, .DkimAttributes.Status'` → `true`, `"SUCCESS"`; `aws sesv2 get-account --region <region> | jq '.ProductionAccessEnabled'` → `true`; `dig +short TXT _dmarc.<DOMAIN>` → the DMARC record. End-to-end after T12: app "Esqueci minha senha" with a real address → e-mail arrives from `noreply@<DOMAIN>` with DKIM `pass` in the headers.
- [ ] **Step 5: Mark done in ../STATUS.md**.

### Task P5-T15: Demo review accounts on the deployed backend — OWNER (D27)

**Files:** `/Users/leandromartins/Documents/proxy-app/docs/release-1.0/REVIEW-ACCOUNTS.md` (create; **no passwords in git** — only e-mails and where the password is kept).

**Interfaces:**
- Consumes: `<API_ORIGIN>` on test keys (T12), a `preview` build (T18 step 1 can run before this; otherwise use the dev build).
- Produces: `<DEMO_CLIENT_EMAIL>` (CLIENT, saved card `4242 4242 4242 4242`, any future expiry, any CVC), `<DEMO_PROXY_EMAIL>` (PROXY with `stripeAccountReady = true`), `<DEMO_PASSWORD>`; pasted into T16 (App Review Information) and T17 (App access).

- [ ] **Step 1: Create the two accounts** in the app against `<API_ORIGIN>` (sign-up as CLIENT; sign-up as PROXY on a second device or after sign-out). City: `São Paulo` (D16).
- [ ] **Step 2: Client card** — Perfil → Cartão → add `4242 4242 4242 4242`, `12/34`, `123` (SetupIntent, D3).
- [ ] **Step 3: Proxy onboarding (test mode)** — Carteira → Configurar recebimento → in Stripe's hosted test-mode form use the test shortcuts it offers (the "Use test data"/"Skip this account form" controls present in test mode; if a bank field is still required use Stripe's BR test bank values shown in the form hints) → the browser returns to `<SITE_ORIGIN>/stripe/return/` → app → Wallet shows "Recebimento configurado" after refresh.
- [ ] **Step 4: Seed one task** as the client (`R$ 25,00`, São Paulo) so the reviewer's PROXY sees something to accept; keep one in `completed` by running one full cycle yourself (also proves T12/T13 end-to-end).
- [ ] **Step 5: Verification (agent)** — `curl -s -X POST https://<API_ORIGIN>/auth/session -H 'content-type: application/json' -d '{"email":"<DEMO_PROXY_EMAIL>","password":"<DEMO_PASSWORD>"}' | jq -r '.session | split(".")[1] | gsub("-";"+") | gsub("_";"/") | @base64d | fromjson | .userType, .stripeAccountReady'` → `PROXY`, `true` (claim name per Phase 2 `buildSessionPayload`); the connected account: `curl -s https://api.stripe.com/v1/accounts/<acct_id> -u "$STRIPE_SECRET_KEY:" | jq '.charges_enabled, .payouts_enabled'` → `true`, `true`. Write `REVIEW-ACCOUNTS.md` with both e-mails, the card used, and "password: in the owner's password manager, entry `Proxy review accounts`".
- [ ] **Step 6: Mark done in ../STATUS.md**.

### Task P5-T16: Apple Developer + App Store Connect — OWNER INPUT (D23, D26)

**Files:** `/Users/leandromartins/Documents/proxy-app/docs/release-1.0/store/apple-review-notes.md` (create: the exact text pasted into App Review Information, kept in git for re-submissions), `docs/release-1.0/store/listing-pt-BR.md` (create: shared listing copy for both stores).

**Interfaces:**
- Consumes: `<BUNDLE_ID>`, `<APP_NAME>` (T01), the nine data types from T03, `<SITE_ORIGIN>` pages (T08), demo accounts (T15).
- Produces: `<APPLE_TEAM_ID>`, `<ASC_APP_ID>` for `eas.json` (T04 placeholders) and the App Store record ready for the Phase 6 upload.

- [ ] **Step 1: Account (D26)** — developer.apple.com/programs → Enroll as **Organization** (needs D-U-N-S for `<LEGAL_NAME>`/`<CNPJ>`; 1–2 weeks lead time) or Individual. Note `<APPLE_TEAM_ID>` (Membership details).
- [ ] **Step 2: Bundle id** — developer.apple.com/account/resources/identifiers → `+` → App IDs → App → Description `<APP_NAME>`, Bundle ID **Explicit** `<BUNDLE_ID>`, Capabilities: leave **all unchecked** (no Apple Pay, no Push — D29) → Register. (EAS can also do this during the first build; registering by hand first avoids a prompt in CI.)
- [ ] **Step 3: App record** — appstoreconnect.apple.com → My Apps → `+` → New App → Platforms iOS; Name `<APP_NAME>`; Primary Language Portuguese (Brazil); Bundle ID `<BUNDLE_ID>`; SKU `proxy-ios-1`; User Access Full → Create. Copy the numeric Apple ID from App Information → `<ASC_APP_ID>` (also `eas.json`).
- [ ] **Step 4: App Information** — Category Primary `Lifestyle`, Secondary `Productivity`; Content Rights: does not contain third-party content; Age Rating → Edit → answer **None** to every content descriptor (violence, sexual content, profanity, drugs, horror, medical, gambling, contests), **No** to unrestricted web access, **No** to gambling/loot boxes/in-app purchases; where asked, **Yes** to user-generated content and **Yes** to sharing location with other users, **No** to messaging/chat. Expected result 12+ (or 13+ under the 2025 tiers); accept whatever the questionnaire yields. Privacy Policy URL `<SITE_ORIGIN>/privacy.html`.
- [ ] **Step 5: App Privacy** — App Privacy → Get Started → "Yes, we collect data" → select and configure exactly:

  | Data type (ASC name) | Collected | Linked to user | Tracking | Purpose |
  |---|---|---|---|---|
  | Contact Info → Name | Yes | Yes | No | App Functionality |
  | Contact Info → Email Address | Yes | Yes | No | App Functionality |
  | Contact Info → Phone Number | Yes | Yes | No | App Functionality |
  | Location → Precise Location | Yes | Yes | No | App Functionality |
  | Photos or Videos | Yes | Yes | No | App Functionality |
  | User Content → Other User Content | Yes | Yes | No | App Functionality |
  | Financial Info → Payment Info | Yes | Yes | No | App Functionality |
  | Purchases → Purchase History | Yes | Yes | No | App Functionality |
  | Identifiers → User ID | Yes | Yes | No | App Functionality |
  | Everything else (Device ID, Usage Data, Diagnostics, Contacts, Health, Browsing/Search History, Sensitive Info, Other Financial Info) | **Not collected** | — | — | — |

  Then "Data used to track you: No". This mirrors T03's manifest 1:1 (re-check both if either changes; owner e-mail/phone are no longer shared with other users after Phase 2 BE-11, which is why "Name/Email/Phone" carry no "shared" note).
- [ ] **Step 6: Version 1.0 page** — Screenshots: capture from the `preview` build (T18) on an iPhone 16 Pro Max / 15 Pro Max simulator-sized device or real device: one set at **6.9"** (1320×2868) or 6.7" (1290×2796) is mandatory; add 6.5"/6.1" only if ASC asks. Six screens: Splash/choose-profile, Home cliente, Criar tarefa (passo 2 com valores), Detalhe da tarefa, Carteira, Histórico. Promotional text (optional), Description + Keywords + Support URL `<SITE_ORIGIN>/support.html` + Marketing URL `<SITE_ORIGIN>/` from `listing-pt-BR.md` (write it: title ≤ 30, subtitle ≤ 30, description ≤ 4000 in pt-BR describing a marketplace where clients publish tasks with a price and verified proxies execute them, payment held and released after validation; keywords ≤ 100 chars). Version Release: **Manually release**. Pricing: Free. Availability: **Brazil only** (BR-only payouts, §4.5).
- [ ] **Step 7: App Review Information** — Sign-in required: **Yes**; user name `<DEMO_CLIENT_EMAIL>`, password `<DEMO_PASSWORD>`; Notes = `apple-review-notes.md`, written as:

  > Proxy is a Brazilian marketplace for small real-world errands ("tasks"). CLIENT users post a task with a price; PROXY users accept it, do it, upload a photo as proof, and the client validates to release payment. Payments are for physical services rendered by other users and are processed by Stripe (card charge on accept, payout to the proxy via Stripe Connect), so they are outside In-App Purchase (guideline 3.1.3(e)/3.1.5(a)).
  >
  > DEMO ACCOUNTS (the backend runs on Stripe TEST MODE for review — no real money moves):
  > - Client: `<DEMO_CLIENT_EMAIL>` / `<DEMO_PASSWORD>` — a test card (4242…) is already saved. You can create a task (Início → Criar tarefa).
  > - Proxy: `<DEMO_PROXY_EMAIL>` / `<DEMO_PASSWORD>` — Stripe Connect test onboarding is already complete, so you can accept, finish (any photo works as proof) and the client can validate.
  > To see both sides, sign in with each account on two devices or sign out/in. If you start Stripe Connect onboarding with a new PROXY account, Stripe's test-mode form accepts its own test data; you may skip this by using the pre-onboarded proxy above.
  > Location is used only in the foreground to pre-fill the task address; camera/photos only to attach the proof photo. Account deletion: Perfil → Excluir conta. Report content: "Denunciar esta tarefa" on any task, or <SITE_ORIGIN>/support.html. Support: <SUPPORT_EMAIL>.

  Contact information: owner's name/phone/e-mail.
- [ ] **Step 8: Verification (agent)** — `npx eas-cli@latest credentials -p ios --non-interactive 2>/dev/null || npx eas-cli@latest credentials -p ios` → the `<BUNDLE_ID>` entry exists with a Distribution Certificate and an App Store provisioning profile (created on the first `eas build -p ios`); `jq -r '.submit.production.ios | .ascAppId, .appleTeamId' eas.json` → numeric id and 10-char team id (no `<` placeholders). The ASC form validators (red banners on the version page) are all cleared except "Build" (Phase 6).
- [ ] **Step 9: Mark done in ../STATUS.md; commit message** `docs(store): P5-T16 Apple review notes and pt-BR listing copy`

### Task P5-T17: Google Play Console — app, Data safety, deletion URL, content rating, signing, closed testing — OWNER INPUT (D26)

**Files:** `/Users/leandromartins/Documents/proxy-app/docs/release-1.0/store/play-data-safety.md` (create: the answers below, for re-submission), `play-service-account.json` at the app repo root (gitignored by T04).

**Interfaces:**
- Consumes: `<BUNDLE_ID>` (T01), `<SITE_ORIGIN>` pages (T08), demo accounts (T15), listing copy (T16 `listing-pt-BR.md`).
- Produces: Play app record in a testable state; service account JSON for `eas submit` (T18).

- [ ] **Step 1: Account (D26)** — play.google.com/console → create a developer account as **Organization** (`<LEGAL_NAME>`, `<CNPJ>`, D-U-N-S) or Personal; complete identity verification (ID + address; days). **Record the account creation date and type in DECISIONS D26**: personal accounts created after 13 Nov 2023 must run a closed test with ≥ 12 testers opted in for 14 continuous days before production access (step 8).
- [ ] **Step 2: Create app** — Create app → App name `<APP_NAME>`, Default language Português (Brasil), App (not game), Free → declarations ticked → Create app. The package name is fixed by the first AAB upload (`<BUNDLE_ID>`).
- [ ] **Step 3: Dashboard "Set up your app"** — Privacy policy: `<SITE_ORIGIN>/privacy.html`. App access: "All or some functionality is restricted" → Add instructions: name `Reviewer accounts`, username `<DEMO_CLIENT_EMAIL>`, password `<DEMO_PASSWORD>`, "Any other information" = the paragraph from T16's review notes (English) incl. the PROXY account. Ads: No. Content rating: start questionnaire → category Utility/Productivity/Communication/Other → answers: violence No, sexuality No, language No, controlled substances No, **users interact with each other: Yes** (user-generated content, no chat), **shares user's location with other users: Yes**, **personal information shared: Yes (name, profile photo, rating)**, digital purchases No, gambling No, unrestricted internet No → Save → IARC rating issued. Target audience: **18 and over** only (Stripe Connect requires adults; avoids Families policy). News app: No. COVID apps: No. Data safety: step 4. Government apps: No. Financial features: "My app doesn't provide any financial features" (Stripe Connect payouts to service providers are not loans/banking/crypto — if the follow-up asks, describe "marketplace payments processed by Stripe"). Health: No.
- [ ] **Step 4: Data safety** — "Does your app collect or share any of the required user data types?" **Yes**. Encrypted in transit: **Yes** (https API, REL-06). Deletion: "Provides a way for users to request that their data is deleted" **Yes** → URL `<SITE_ORIGIN>/delete-account.html` → "Deletes some data while retaining other data for legitimate reasons (e.g., legal)" and the account-deletion URL field = the same page. Data types:

  | Category → type | Collected | Shared | Ephemeral | Required/optional | Purposes |
  |---|---|---|---|---|---|
  | Personal info → Name | Yes | No | No | Required | App functionality, Account management |
  | Personal info → Email address | Yes | No | No | Required | App functionality, Account management |
  | Personal info → Phone number | Yes | No | No | Required | App functionality, Account management |
  | Personal info → User IDs | Yes | No | No | Required | App functionality, Account management |
  | Location → Precise location | Yes | **Yes** (task location shown to other users — prominent, user-initiated when publishing a task) | No | Optional (only when creating a task) | App functionality |
  | Financial info → User payment info | Yes (card brand/last4 via Stripe) | No | No | Optional (clients only) | App functionality |
  | Financial info → Purchase history | Yes | No | No | Required | App functionality |
  | Photos and videos → Photos | Yes (proof photo) | No | No | Optional (proxies only) | App functionality |
  | App activity → Other user-generated content | Yes (task text, ratings, comments) | No | No | Required | App functionality |
  | Everything else (Device IDs, Crash logs, Diagnostics, Contacts, Messages, Audio, Files, Calendar, Health, Web browsing, Installed apps) | **No** | — | — | — | — |

  Save → the generated preview must read "Data is encrypted in transit; You can request that data be deleted".
- [ ] **Step 5: Store listing** — Main store listing: app name, short description (≤ 80), full description from `listing-pt-BR.md`; app icon 512×512 PNG (export from `assets/icon.png`: `sips -z 512 512 assets/icon.png --out /tmp/play-icon.png`); feature graphic 1024×500 (owner art); phone screenshots: at least 2, up to 8, 9:16 PNG from the `preview` APK (T18); App category Lifestyle; contact e-mail `<SUPPORT_EMAIL>`, website `<SITE_ORIGIN>/`.
- [ ] **Step 6: Signing** — Play App Signing is automatic for new apps: on the first AAB upload choose "Let Google manage and protect your app signing key"; EAS keeps the **upload key**. Nothing to do before the first upload.
- [ ] **Step 7: Service account for `eas submit`** — Google Cloud Console → create project `proxy-play` → IAM → Service accounts → Create (`eas-submit`) → Keys → Add key → JSON → download → save as `/Users/leandromartins/Documents/proxy-app/play-service-account.json`. Play Console → Users and permissions → Invite new users → the service account e-mail → App permissions: this app → Release manager (Releases: create/edit, manage testing tracks) → Invite. (Play's older "API access" page is no longer required; the invite links the project.)
- [ ] **Step 8: Testing tracks** — Testing → Internal testing → Create email list `internal` with the owner + partner e-mails. If D26 says the closed test applies: Testing → Closed testing → Create track `closed-alpha` → testers list with ≥ 12 real Google accounts (friends/partners; opt-in link sent on day 1 of Phase 6) → the 14-day clock starts when the first release is rolled out there.
- [ ] **Step 9: Verification (agent)** — `cd /Users/leandromartins/Documents/proxy-app && test -f play-service-account.json && git check-ignore -q play-service-account.json && jq -r .client_email play-service-account.json` → prints the service-account e-mail; `jq -r .submit.production.android.serviceAccountKeyPath eas.json` → `./play-service-account.json`. Console: Dashboard shows every "Set up your app" item with a green check and the Data safety preview text above. After the first `eas submit -p android` (T18) the internal track lists the AAB.
- [ ] **Step 10: Mark done in ../STATUS.md; commit message** `docs(store): P5-T17 Play data-safety answers`

### Task P5-T18: EAS builds (preview → device full task; production) + `eas submit`

**Files:** none (uses `eas.json` from T04).

**Interfaces:**
- Consumes: T01–T06 config, T12 live API, T16/T17 console records, T15 demo accounts.
- Produces: the Phase 5 done-when evidence; the production AAB/IPA that Phase 6 submits for review.

- [ ] **Step 1: Preview builds** — `cd /Users/leandromartins/Documents/proxy-app && npx eas-cli@latest build --profile preview --platform all --non-interactive --no-wait` (first iOS build asks for Apple login and creates the distribution credentials: run once interactively without `--non-interactive`; register the owner's iPhone UDID with `npx eas-cli@latest device:create` for the internal iOS build). Then `npx eas-cli@latest build:list --limit 2 --json --non-interactive | jq -r '.[] | "\(.platform) \(.status) \(.artifacts.buildUrl // .artifacts.applicationArchiveUrl)"'` → two `FINISHED` lines. Check the iOS build log shows Xcode 26 (`audit §4.1` last row) and no `ITMS-91053` warning in the TestFlight processing e-mail later.
- [ ] **Step 2: Install and run the full task (owner, two phones)** — install the APK (link) and the iOS internal build (link/QR); CLIENT (`<DEMO_CLIENT_EMAIL>`) creates a task; PROXY accepts → camera proof → finish; CLIENT validates with a rating; History shows the entry on both; Wallet "Total recebido" increases (D8). Also: Perfil → Termos e Privacidade opens `<SITE_ORIGIN>/privacy.html`; task detail → Denunciar opens the support page with `?task=`; Carteira → Configurar recebimento with a fresh PROXY account returns through `<SITE_ORIGIN>/stripe/return/` and the browser closes. Record pass/fail per step in `../STATUS.md` under P5-T18.
- [ ] **Step 3: Bundle inspection (agent)** — download the Android APK from the build URL and run `unzip -p <apk> assets/index.android.bundle 2>/dev/null | strings | grep -oE 'https://[a-z0-9.-]+' | sort -u` → contains `<API_ORIGIN>` and `<SITE_ORIGIN>`, and **no** `192.168.` / `http://` origin; `grep -oE 'pk_(test|live)_[A-Za-z0-9]+' | sort -u` → exactly one key (the Hermes bundle may require `hermes-dec`; if strings yields nothing, verify via `npx eas-cli@latest build:view <id>` env summary instead). `unzip -p <apk> AndroidManifest.xml | strings | grep -c RECORD_AUDIO` → `0`.
- [ ] **Step 4: Production builds** — `npx eas-cli@latest build --profile production --platform all --non-interactive` → `FINISHED` ×2; `autoIncrement` gave build 1 / versionCode 1 (`build:list` shows `appBuildVersion`).
- [ ] **Step 5: Submit to the internal tracks (not to review yet — Phase 6)** — `npx eas-cli@latest submit --profile production --platform android --latest --non-interactive` → `Submitted` (Play internal testing track); `npx eas-cli@latest submit --profile production --platform ios --latest` → uploaded to TestFlight (processing e-mail follows). Phase 6 owns the review submission and the live-keys switch.
- [ ] **Step 6: Phase gate** — all three PLAN §2 done-when lines hold: preview build completed a full task against `<API_ORIGIN>` (step 2), both consoles show no validator errors (T16 step 8, T17 step 9), `curl -s -o /dev/null -w '%{http_code}' https://<API_ORIGIN>/health` → `200`.
- [ ] **Step 7: Mark done in ../STATUS.md** (no commit; build ids recorded in STATUS).
