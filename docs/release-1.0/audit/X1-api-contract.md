# X1 — Cross-repo API contract audit (proxy-app ⇄ proxy-api ⇄ SPEC.md)

Date: 2026-11-08. Auditor: X1. Read-only pass; nothing in either repo was modified.

Paths below are absolute. `app:` = `/Users/leandromartins/Documents/proxy-app`, `api:` = `/Users/leandromartins/Documents/proxy-api`.

---

## 1. Scope

Every file was opened in full (line counts from `wc -l`).

**App — `src/apis/**` (824 lines total)**

| File | Lines |
| --- | --- |
| `app:/src/apis/api-client.ts` | 67 |
| `app:/src/apis/query-client.ts` | 34 |
| `app:/src/apis/apis.ts` | 20 |
| `app:/src/apis/query-keys.ts` | 13 |
| `app:/src/apis/auth/auth-api-types.ts` | 88 |
| `app:/src/apis/auth/auth-apis.ts` | 29 |
| `app:/src/apis/auth/auth-hooks.ts` | 61 |
| `app:/src/apis/tasks/tasks-api-types.ts` | 170 |
| `app:/src/apis/tasks/tasks-apis.ts` | 52 |
| `app:/src/apis/tasks/tasks-hooks.ts` | 134 |
| `app:/src/apis/cards/cards-api-types.ts` | 19 |
| `app:/src/apis/cards/cards-apis.ts` | 12 |
| `app:/src/apis/cards/cards-hooks.ts` | 46 |
| `app:/src/apis/wallet/wallet-api-types.ts` | 36 |
| `app:/src/apis/wallet/wallet-apis.ts` | 23 |
| `app:/src/apis/wallet/wallet-hooks.ts` | 20 |

**App — call sites that read responses** (read in full): `app:/app/(app)/tasks/[id]/index.tsx` (653), `app:/app/(app)/tasks/[id]/finish.tsx` (287), `app:/app/(app)/(tabs)/wallet.tsx` (97), `app:/app/(app)/cards.tsx` (138), `app:/src/feature/tasks/components/CreateTaskStep2.tsx` (333), `ValidateTaskSheet.tsx` (279), `ReceiptCard.tsx` (142), `PriceBreakdown.tsx` (106), `CounterpartCard.tsx` (partial, lines 15-40), `app:/src/feature/cards/components/AddCardSheet.tsx` (291), `app:/src/feature/wallet/hooks/useStripeOnboarding.ts` (58), `app:/src/feature/wallet/components/EarningsList.tsx` (lines 1-60), `app:/src/feature/tasks/utils/proof.ts` (21), `can-cancel.ts` (24), `status-display.ts` (24), `format-payment-id.ts` (10), `app:/src/store/auth-store/auth-store.ts` (44), `app:/src/shared/providers/SessionProvider.tsx` (37), `app:/src/lib/secure-store.ts` (15), `app:/src/common/utils/format.ts` (34), `masks.ts` (83), `app:/src/feature/auth/hooks/useProxyAuth.ts` (33). Grepped (not fully read): `sign-up.tsx`, `sign-in.tsx`, `forgot-password.tsx`, `ClientHome.tsx`, `ProxyHome.tsx`, `CreateTaskStep1.tsx`, `TaskCard.tsx`, `profile.tsx`, `history.tsx`, `BalanceCard.tsx`.

**Backend** (read in full): all 24 controllers under `api:/src/modules/*/controllers/*.ts` (747 lines total); use-cases `authenticate`, `create-account`, `refresh-session`, `fetch-transaction-history`, `create-merchant-account`, `create-merchant-dashboard-link`, `forgot-password`, `verify-reset-code`, `reset-password`, `delete-account`, `update-profile`, `fetch-user-details`, `update-wallet-balance` (auth); `create-task`, `fetch-active-tasks`, `fetch-task-by-id`, `fetch-tasks`, `fetch-task-proof`, `start-task`, `finish-task`, `validate-task`, `cancel-task` (tasks); `create-user-payment-method`, `delete-user-card`, `fetch-user-card` (cards); `fetch-payment-record` (payments); `rate-proxy` (ratings); `handle-account-updated`, `handle-payment-failed`, `handle-payment-succeeded` (webhook). Repositories: `api:/src/modules/auth/repository/auth.repository.ts` (245), `api:/src/modules/tasks/repository/tasks.repository.ts` (305), `api:/src/modules/cards/repositories/cards.repository.ts` (57), `api:/src/modules/payments/repository/payments.repository.ts` (28). Types/DTOs: `api:/src/modules/auth/types/index.d.ts` (50), `api:/src/modules/tasks/types/index.d.ts` (157), `api:/src/modules/cards/types/index.d.ts` (26), `api:/src/modules/payments/types/index.d.ts` (25), `api:/src/modules/auth/dtos/auth-repository.dto.ts` (40), `api:/src/modules/tasks/dtos/tasks-repository.dto.ts` (29). Infra: `api:/src/exception/app.exception.ts` (32), `error-dictionary.ts` (231), `http.exception.ts` (61), `api:/src/pipes/zod-validation.pipe.ts` (23), `multer-validation.pipe.ts` (48), `api:/src/modules/auth/utils/jwt.strategy.ts` (60), `jwt-auth.guard.ts` (3), `current-user-decorator.ts` (7), `api:/src/main.ts` (20), `api:/src/app.module.ts` (45), `api:/src/modules/tasks/tasks.module.ts` (86), `cards.module.ts` (32), `auth.module.ts` (lines 36-58), `api:/src/stripe/stripe.service.ts` (lines 60-105), `api:/prisma/schema.prisma` (lines 1-200).

**SPEC**: `app:/SPEC.md` §3.1–3.4 (lines 168-265), §4 (266-353), §8 API blocks (lines 506-1073, read via grep + targeted ranges), §9.

**Executed (allowed by brief)**: two `node -e` one-liners in `proxy-api` to confirm serialization facts (Prisma `Decimal` → JSON string; `zod-validation-error` body shape). No tests, servers or Docker were run.

**Skipped**: `update-profile`/`delete-account` app side (no app client exists — see Gaps); webhook internals beyond the three handlers above (other auditors' slice); `TaskTimeline.tsx`, `profile.tsx` body.

---

## 2. How it works (as the code actually behaves)

**Transport.** `app:/src/apis/api-client.ts:18-21` creates one axios instance (`baseURL = EXPO_PUBLIC_API_URL`, 15 s timeout). The request interceptor (24-30) reads the JWT from `expo-secure-store` and sets `Authorization: Bearer`. The response interceptor (39-48) clears the token and calls the registered handler on **any** 401, then rejects. `extractErrorMessage` (54-67) returns `response.data.message` if present, otherwise a PT fallback for timeout / no-network / generic. **It does not look at `errorCode`** — no app code branches on error codes (`grep errorCode|USER_|TASK_|...` → zero hits outside the type file). React Query (`query-client.ts`) retries only network/5xx/429, 3×, exponential; mutations never retry.

**Error envelope.** `api:/src/exception/http.exception.ts:27-45` spreads the exception response over `{statusCode, timestamp, path}`. For `AppException` the body is `{statusCode, timestamp, path, message, errorCode, info?}` — matches `TApiErrorBody` (`auth-api-types.ts:82-88`). For **Zod** failures `ZodValidationPipe` (`zod-validation.pipe.ts:13-17`) throws `BadRequestException({message:'Validation failed', statusCode:400, errors: fromZodError(e)})`; verified serialization: `{"message":"Validation failed","statusCode":400,"errors":{"name":"ZodValidationError","details":[...]}}` → the app shows the English string "Validation failed". Nest built-ins (`ThrottlerException`, `PayloadTooLargeException` from Multer, `UnauthorizedException` from the guard) have English `message`s too. Non-HTTP exceptions → 500 with `STANDARD_ERROR` (PT).

**Session.** `/auth/create`, `/auth/session`, `/auth/session/refresh`, `/auth/update-profile` all return `{ session: <JWT> }`. The payload (`authenticate.service.ts:40-58`, identical in `refresh-session.service.ts:22-40` and `update-profile.service.ts:50-68`) embeds raw Prisma rows: `rating` and `walletBalance` are `Prisma.Decimal` → **`JSON.stringify` emits strings** (verified: `{"r":"4.5","w":"0"}`). The backend re-parses with `z.coerce.number()` (`jwt.strategy.ts:22-25`) so the backend sees numbers; the app does `jwtDecode<TSessionPayload>` (`auth-store.ts:20`) with **no coercion**, so `session.rating` / `session.walletBalance` are strings at runtime while typed `number`. `stripeAccountReady` is present in all three signers and in the app type; the strategy defaults it to `false` for older tokens. `signOptions` is `{ algorithm: 'RS256' }` only (`auth.module.ts:49`) → **no `exp` claim**; tokens never expire. The strategy also queries `users.isDeleted` per request (`jwt.strategy.ts:52-56`).

**Decimal on the REST wire.** Every task endpoint returns the raw Prisma `select` (`tasks.repository.ts:50-89, 120-156, 160-220`); `offeredPrice`, `proxyEarnings`, `platformFee`, `locationLat/Lng`, `ownerId.rating`, `executor.rating`, `payment.amount` are **strings**. The app types this correctly (`tasks-api-types.ts:77-81, 61, 100, 42`) and `formatBRL` accepts strings (`format.ts:11-16`); `ProxyHome.tsx:101-102` and `CounterpartCard.tsx:21` wrap with `Number()`. The one exception is `/auth/transaction-history`: `offeredPrice` is a passthrough Decimal (string) but typed `number` in `wallet-api-types.ts:10`; only `netAmount` (a real number computed at `fetch-transaction-history.service.ts:39-45`) is rendered. Dates are `Date` objects → ISO strings; app types `string` and parses with `new Date()`.

**Task flows.** `POST /tasks/create` (201, `{id}`) inserts the task **before** validating the card (`create-task.service.ts:36-50`). `GET /tasks/fetch?city&page` is a bare array page of 10, `status='available'`, filtered by `locationAddress contains city` (case-sensitive, `tasks.repository.ts:81-85`); the app stops paginating when a page has < 10 items (`tasks-hooks.ts:50-53`). `GET /tasks/active` returns owner tasks in `available|accepted|on_the_way|in_progress|verification_required` **plus** executor tasks in the last four (`tasks.repository.ts:191-218`); `ClientHome` filters `owner === session.sub`. `GET /tasks/:id` adds `payment`, `executorId`, `executor` (`fetch-task-by-id.service.ts:52-57`), 404 for a non-owner CLIENT. `GET /tasks/:id/proof` streams the file with JWT in the `Image` `headers` (`proof.ts:17-20`). `POST /tasks/start` flips status to `in_progress` and inserts the mapping (`start-task.service.ts:44-50`) **before** fetching the owner's card and charging (52-98); returns `{status:'succeeded'}` or `{status:'requires_action', clientSecret}` to the **PROXY**. The app only toasts on `requires_action` (`tasks/[id]/index.tsx:105-108`) — no `confirmPayment`, no polling. `POST /tasks/finish` is multipart with field **`file`** (`finish-task.controller.ts:33`; app `tasks-apis.ts:45`), file optional on the backend (`file ?? null`), Multer limits 10 MB and accepts jpeg/png/webp/heic/heif (`multer-validation.pipe.ts:32-38`). `POST /tasks/validate` charges nothing: it computes `proxyEarnings = price − (3.99 %·price + 0.39) − 20 %·price` (`validate-task.service.ts:55-57`), creates a Stripe Transfer, marks `completed`, bumps the proxy's `walletBalance`, then rates. `POST /tasks/cancel` refunds if a payment row exists and sets `canceled`. Both `validate` and `cancel` return 200 with **no body**; app types `void`.

**Cards.** `/card/fetch` 404s with `NO_SAVED_CARD_FOUND` when none; the app maps 404 → `null` (`cards-hooks.ts:20`). `/card/create {token}` expects a Stripe **PaymentMethod id** (`pm_…`, `create-user-payment-method.service.ts:46`), which is what `AddCardSheet.tsx:102-109` sends. `DELETE /card/:id` is 204 with no body; the app types `{message}` but ignores it.

**Wallet.** `POST /auth/merchant-account` always returns `{accountLinkUrl}` only (the declared `stripeAccountId?` is never set, `create-merchant-account.service.ts:80`). `GET /auth/merchant-dashboard` → `{dashboardUrl}`. `walletBalance` shown on Wallet/ProxyHome comes **only from the JWT**; the app refreshes the JWT solely after Stripe onboarding (`useStripeOnboarding.ts:47`).

**Where code disagrees with CLAUDE.md / SPEC.md** — see "SPEC drift" column in §3b and findings P3-1..P3-4. Headline items: SPEC §8.10 field name `photo` (code: `file`); SPEC §3.3 `TRANSFER_FAILED` on validate (code emits `TASK_TRANSFER_FAILED`); SPEC §3.4 lacks `/auth/session/refresh` and `/tasks/:id/proof`; SPEC §4.1 lacks `stripeAccountReady`; SPEC §4.2 types money as `number`, lists `completedAt`/`canceledAt` (never returned by any select) and omits `payout_failed`; app CLAUDE.md "Backend integration" says errors come back in Portuguese — true for `AppException` only.

---

## 3. Findings

### [P1] 3DS `requires_action` is a dead end — clientSecret goes to the wrong party and nobody confirms
File: `api:/src/modules/tasks/use-cases/start-task.service.ts:87-92`; `app:/app/(app)/tasks/[id]/index.tsx:104-108`
Evidence:
```ts
// backend — returned to the PROXY who called /tasks/start
if (confirmation.status === 'requires_action') {
  return { status: 'requires_action', clientSecret: confirmation.client_secret ?? null }
}
// app — proxy device
if (result.status === 'requires_action') {
  toast.success('Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.')
```
Why it matters: The PaymentIntent is created with `setup_future_usage:'off_session'` but confirmed **without** `off_session:true` (`stripe.service.ts:63-82`), so Brazilian cards with 3DS will frequently return `requires_action`. The secret is handed to the proxy, who cannot authenticate the client's card; the client is never notified and has no screen/endpoint to confirm. The task is already `in_progress` with a `pending` payment (`start-task.service.ts:44-50`). When Stripe eventually fails the intent, `handle-payment-failed.service.ts:18-30` silently reverts the task to `available` and deletes the mapping — the proxy may have already done the work. SPEC §7.3/§8.9 require `confirmPayment(clientSecret)` + polling; neither exists.
Suggested fix: Backend: confirm with `off_session: true` so saved cards are charged as merchant-initiated (no 3DS), and treat `requires_action` as a hard failure (roll back status/mapping, return `PAYMENT_FAILED`). If 3DS must be supported, move the charge to a client-initiated step (client confirms on their device) before the proxy can start.
Confidence: high

### [P1] `POST /auth/create` accepts self-asserted `isVerified`, `rating`, `walletBalance`, `totalTasks*`
File: `api:/src/modules/auth/controllers/create-account.controller.ts:17-22`; `api:/src/modules/auth/use-cases/create-account.service.ts:52-57`
Evidence:
```ts
isVerified: z.boolean().optional(),
rating: z.number().min(0).max(5).optional(),
...
totalTasksCompleted: z.number().optional(),
totalTasksCreated: z.number().optional(),
walletBalance: z.number().optional(),
// service
await this.authRepository.create({ ...data, name, stripeCustomerId, password: hashedPassword })
```
Why it matters: The app's `TCreateAccountPayload` (`auth-api-types.ts:38-48`) never sends these, but any HTTP client can register with `isVerified:true, rating:5, totalTasksCompleted:999`. `isVerified` and `rating` are the marketplace's trust signals and are rendered on `CounterpartCard`/`ClientHome` from the JWT and `ownerId`/`executor`. No money is moved from `walletBalance`, so not P0.
Suggested fix: Remove those five keys from `createAccountBodySchema` (or `.strict()` + explicit pick); pass an explicit object to `authRepository.create` instead of `...data`.
Confidence: high

### [P1] Price breakdown shown to the client contradicts what the backend charges
File: `app:/src/feature/tasks/components/PriceBreakdown.tsx:20-22, 64`; `api:/src/modules/tasks/use-cases/start-task.service.ts:60`; `api:/src/modules/tasks/use-cases/validate-task.service.ts:55-57`
Evidence:
```ts
// app (client sees)
const platformFee = offeredPrice * PLATFORM_FEE_RATE
const stripeFee = offeredPrice * STRIPE_FEE_RATE + STRIPE_FEE_FIXED
const total = offeredPrice + platformFee + stripeFee   // "Total a pagar"
// backend charges exactly offeredPrice …
amount: taskDetails.offeredPrice * 100,
// … and deducts both fees from the PROXY
const proxyEarnings = taskDetails.offeredPrice - stripeFee - platformFee
```
Why it matters: For a R$ 100 task the client is told they will pay R$ 124,38 but is charged R$ 100,00; the proxy sees "Valor oferecido R$ 100,00" on `TaskCard`/`SummaryCard` and receives R$ 75,62. Wrong money information on both sides of the main flow; the `ReceiptCard` (which uses backend `platformFee`/`proxyEarnings`) will then disagree with the breakdown the client saw at publish time.
Suggested fix: Decide the model (product question below). If fees stay on the proxy: PriceBreakdown shows "Você paga R$ X" only, and the proxy-facing card shows "Você recebe ≈ R$ Y". If fees go on the client: backend must charge `offeredPrice + fees` and transfer `offeredPrice`.
Confidence: high

### [P1] `/tasks/start` mutates state before the charge; card/payment errors surface to the proxy and leave the task stuck
File: `api:/src/modules/tasks/use-cases/start-task.service.ts:44-53, 95-98`
Evidence:
```ts
await this.tasksRepository.updateTaskStatus({ taskId, status: 'in_progress', startedAt: new Date() })
await this.tasksRepository.insertTaskUserMapping(taskId, userId)
const ownerCard = await this.fetchUserCardService.execute(taskDetails.owner) // throws NO_SAVED_CARD_FOUND (404)
...
} catch (error) { if (error instanceof AppException) throw error
  throw new AppException(errorDictionary.payment.paymentFailed) }        // 402
```
Why it matters: If the client deleted their card after publishing (allowed by `DELETE /card/:id`), or Stripe declines, the proxy gets "Nenhum cartão salvo encontrado para este usuário." / "Falha ao processar o pagamento." — about someone else's card — while the task is now `in_progress` with the proxy mapped and **no** payment row (card case) or a `pending` row (decline case before webhook). The app's `useStartTaskMutation.onSuccess` never runs, so the feed still shows the task as available until refetch. Likely also flagged by the tasks-slice auditor; included here because the error semantics cross the contract.
Suggested fix: Fetch card + create/confirm the PaymentIntent first; only then update status + mapping inside one Prisma transaction. Map `NO_SAVED_CARD_FOUND` to a proxy-facing message ("O cliente não possui cartão válido").
Confidence: high

### [P2] JWT `rating` / `walletBalance` are strings at runtime but typed `number`; `ClientHome` calls `.toFixed` on it
File: `api:/src/modules/auth/use-cases/authenticate.service.ts:44, 52`; `app:/src/store/auth-store/auth-store.ts:17-24`; `app:/src/feature/home/components/ClientHome.tsx:63`
Evidence:
```ts
// backend payload: Prisma.Decimal → JSON string ("4.5")
rating: user.rating, … walletBalance: user.walletBalance,
// app: no coercion
return jwtDecode<TSessionPayload>(token)
// consumer
session.rating > 0 ? session.rating.toFixed(1).replace('.', ',') : '—'
```
Why it matters: `"4.5" > 0` is `true` (numeric coercion) and `"4.5".toFixed` throws `TypeError` → crash of the Client Home. Today a CLIENT's rating is always `0` (only executors are rated, `validate-task.service.ts:93-100`), so the branch is latent — but `/auth/update-profile` lets a user change `userType`, and any future client rating would crash the home screen. `walletBalance` happens to survive because `formatBRL` accepts strings; `BalanceCard`'s `amount: number` prop is a lie.
Suggested fix: In `decodeOrNull`, normalise: `{...p, rating: Number(p.rating), walletBalance: Number(p.walletBalance)}`; or have the three signers emit `Number(user.rating)` / `user.walletBalance.toNumber()`.
Confidence: high (serialization verified with `node -e`)

### [P2] Zod/Nest built-in error bodies reach the user in English
File: `api:/src/pipes/zod-validation.pipe.ts:13-17`; `app:/src/apis/api-client.ts:57-58`
Evidence:
```ts
throw new BadRequestException({ message: 'Validation failed', statusCode: 400, errors: fromZodError(error) })
// app
const fromBody = error.response?.data?.message
if (fromBody) return fromBody
```
Why it matters: Any schema miss (e.g. `comment` > 500 chars on validate, `code` not 6 chars, bad email, `page=0`) shows "Validation failed" in a modal on a pt-BR app. `ThrottlerException` (5 login attempts/min) shows "ThrottlerException: Too Many Requests"; Multer's 10 MB limit shows "File too large". SPEC §3.4 says 429 should show a "please wait" toast. The `errors.details[]` array is also leaked (field paths, regexes).
Suggested fix: In the pipe, build a PT message from the first issue (`errorCode: 'VALIDATION_FAILED'`); in `extractErrorMessage`, special-case `status === 429` → "Muitas tentativas. Aguarde um minuto." and `413` → "Arquivo muito grande (máx. 10 MB)."
Confidence: high

### [P2] JWT never expires and the only refresh trigger is Stripe onboarding → `walletBalance` on screen is stale
File: `api:/src/modules/auth/auth.module.ts:49`; `app:/src/feature/wallet/hooks/useStripeOnboarding.ts:47`; `app:/app/(app)/(tabs)/wallet.tsx:21`
Evidence:
```ts
signOptions: { algorithm: 'RS256' },            // no expiresIn
// app
const balance = session?.walletBalance ?? 0      // from JWT only
await refreshSession.mutateAsync()               // only called after onboarding
```
Why it matters: After a client validates, the proxy's `walletBalance` changes server-side (`update-wallet-balance.service.ts:25-27`) but the proxy's device never learns it until they log out/in or redo onboarding. SPEC §8.11 says to update after validation or token refresh. SPEC §3.1 also assumes expiry → 401 → logout, which never happens; a leaked token is valid forever (mitigated only by the `isDeleted` check).
Suggested fix: Add `expiresIn` (e.g. 7d) and call `useRefreshSessionMutation` on Wallet focus / pull-to-refresh and after `useValidateTaskMutation` success is observed server-side (or expose `walletBalance` on `/auth/transaction-history`).
Confidence: high

### [P2] Task responses leak owner `email`, `phoneNumber`, `stripeCustomerId` to every proxy
File: `api:/src/modules/tasks/repository/tasks.repository.ts:66-79` (same select at 136-149, 176-189)
Evidence:
```ts
ownerId: { select: { id: true, name: true, email: true, phoneNumber: true, avatarUrl: true,
  isVerified: true, rating: true, totalTasksCompleted: true, totalTasksCreated: true, stripeCustomerId: true } },
```
Why it matters: `/tasks/fetch` is readable by any PROXY for any city; it returns PII and the Stripe customer id of every client with an open task. The app's `TTaskOwner` mirrors the shape but the UI reads only `id/name/avatarUrl/isVerified/rating` (`tasks/[id]/index.tsx:156-160`). SPEC §4.2 `ownerId` pick does not include `stripeCustomerId`.
Suggested fix: Drop `email`, `phoneNumber`, `stripeCustomerId` from the three list/detail selects (keep a private select for `start-task`, which needs `stripeCustomerId`). Trim `TTaskOwner` accordingly.
Confidence: high

### [P2] City feed filter is free-text, case-sensitive `contains` over a composed address string
File: `api:/src/modules/tasks/repository/tasks.repository.ts:81-85`; `api:/src/modules/tasks/use-cases/create-task.service.ts:34`; `app:/src/feature/home/components/ProxyHome.tsx:46, 51`
Evidence:
```ts
where: { status: 'available', ownerId: { isDeleted: false }, locationAddress: { contains: city } },
const locationAddress = `${street}, ${city} - ${state}, ${zipCode}`
// app
const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte'] as const
```
Why it matters: The client types `city` freely in Step 1 (`CreateTaskStep1.tsx:263-270`, only `required`); "sao paulo", "SAO PAULO", "S. Paulo" never match the proxy's pill "São Paulo", so the task is invisible in every feed. The backend e2e uses `city=SP`, which only matches because the state is embedded in the same string.
Suggested fix: Store `city`/`state` as columns and filter `city: { equals, mode: 'insensitive' }`; or at minimum `contains` with `mode: 'insensitive'` plus a city picker (same `CITIES` list) in Step 1.
Confidence: high

### [P2] Backend JWT schema requires `phoneNumber: string`; a null phone turns every authenticated call into a 500
File: `api:/src/modules/auth/utils/jwt.strategy.ts:15, 50`; `api:/prisma/schema.prisma:45`
Evidence:
```ts
phoneNumber: z.string(),            // not .nullable()
...
const session = sessionPayloadSchema.parse(payload)   // throws ZodError, not HttpException
```
Why it matters: `phoneNumber String?` is nullable and `/auth/create` accepts it as optional (`create-account.controller.ts:13`). The app always sends it (`sign-up.tsx:86`, required ≥ 10 digits), so this only bites accounts created via another client — but for them the ZodError is not an `HttpException`, so `HttpExceptionFilter` returns 500 `STANDARD_ERROR`; the app retries 3× and shows "Algo de errado aconteceu…", never logging out. The app type `TSessionPayload.phoneNumber: string` repeats the assumption.
Suggested fix: `phoneNumber: z.string().nullable()` in the strategy and `string | null` in `TSessionPayload`; or make the column/schema required.
Confidence: medium (passport error path reasoned from `@nestjs/passport` source, not executed)

### [P2] `POST /tasks/create` inserts the task before validating the card; failure leaves an orphan `available` task
File: `api:/src/modules/tasks/use-cases/create-task.service.ts:36-50`; `api:/src/modules/tasks/controllers/create-task.controller.ts:26-29`
Evidence:
```ts
const task = await this.tasksRepository.create({...})
await this.createUserSourceService.execute({ token, userId, savedCard })  // may throw NO_SAVED_CARD_FOUND
// schema
cardDetails: z.object({ savedCard: z.string().optional(), token: z.string().optional() }),
```
Why it matters: The app sends `{ savedCard: card.stripeCardId }` from a possibly stale `useCardQuery` cache (5 min `staleTime`); if the card was replaced in between, the user sees an error yet the task exists and is already in proxies' feeds. The schema also accepts `cardDetails: {}` (service returns `null`, task created with no card check at all).
Suggested fix: Validate the card first, then insert; make `cardDetails` a discriminated union (`savedCard` xor `token`) with `.refine`.
Confidence: high

### [P3] SPEC §3.3 error dictionary drift (codes and copy)
File: `api:/src/exception/error-dictionary.ts:155-159, 58-63, 85-89, 148-153`; `app:/SPEC.md` lines 190-221
Evidence: validate emits `TASK_TRANSFER_FAILED` ("Falha ao transferir o valor da tarefa para o proxy.") — SPEC/§8.9 list `TRANSFER_FAILED`. Copy differs for `USER_HAS_ACTIVE_TASKS` ("Você possui tarefas em andamento…" vs SPEC "Não é possível excluir a conta…"), `CANNOT_DELETE_CARD` ("remover" vs "excluir"), `PROXY_ACCOUNT_NOT_READY` (different sentence). SPEC lacks `WEBHOOK_*` and `STANDARD_ERROR` on 500.
Why it matters: No runtime impact (app never branches on codes), but the SPEC is the contract the second auditor and any new screen will code against.
Suggested fix: Regenerate §3.3 from `error-dictionary.ts`.
Confidence: high

### [P3] SPEC §8.10 multipart field is `photo`; backend and app use `file`; HEIC/HEIF accepted but undocumented
File: `api:/src/modules/tasks/controllers/finish-task.controller.ts:33`; `app:/src/apis/tasks/tasks-apis.ts:45`; `api:/src/pipes/multer-validation.pipe.ts:32-38` vs `error-dictionary.ts:219-220`; `app:/SPEC.md` lines 896-901
Evidence: `FileInterceptor('file')` / `form.append('file', …)`; allowed mimes include `image/heic`, `image/heif`; error copy says "Envie uma imagem JPG, PNG ou WEBP."
Why it matters: Code is internally consistent; SPEC is wrong. Also backend accepts `file` **absent** (`file ?? null`) so a task can reach `verification_required` with no proof — the app always sends one, SPEC says the photo is mandatory.
Suggested fix: Fix SPEC; decide whether proof is mandatory and enforce server-side (`ParseFilePipe({ fileIsRequired: true })`).
Confidence: high

### [P3] SPEC §3.4 / §4 missing or wrong shapes
File: `app:/SPEC.md` lines 223-265, 270-325
Evidence: §3.4 lacks `GET /auth/session/refresh` (`refresh-session.controller.ts:9-14`) and `GET /tasks/:id/proof` (`fetch-task-proof.controller.ts:17-22`). §4.1 lacks `stripeAccountReady`. §4.2 types `locationLat/Lng`, `offeredPrice`, `proxyEarnings`, `platformFee`, `ownerId.rating` as `number` (wire: string), omits `payout_failed`, and lists `completedAt`/`canceledAt`, which no task select returns (`tasks.repository.ts:51-65`). §8.8 says success → `router.replace('/tasks/'+id)`; app does `router.dismissTo('/home')` (`CreateTaskStep2.tsx:59`). §8.3 says `documentUrl` is sent; app never sends it (`sign-up.tsx:83-91`) and the backend has no upload endpoint.
Why it matters: Doc/code drift only; app types are already right.
Suggested fix: Update SPEC §3.4/§4 from `tasks-api-types.ts` and the controller list.
Confidence: high

### [P3] App type lies with no current runtime impact
File: `app:/src/apis/wallet/wallet-api-types.ts:10`; `app:/src/apis/cards/cards-apis.ts:11`; `app:/src/apis/tasks/tasks-api-types.ts:21-26`; `app:/src/apis/wallet/wallet-api-types.ts:30`
Evidence: `TTransactionHistoryTask.offeredPrice: number` (wire is a Decimal string, `auth.repository.ts:95-107` passthrough); `cardsApis.delete` typed `{ message: string }` (backend 204, no body); `ACTIVE_TASK_STATUSES` omits `available` although `/tasks/active` returns owner tasks in `available` (constant is exported but unused — grep found no consumers); `TMerchantAccountResponse.stripeAccountId?` is never populated (`create-merchant-account.service.ts:80`).
Why it matters: Future code that does `offeredPrice.toFixed()` on history items will crash; the dead constant misleads.
Suggested fix: `offeredPrice: string`, `delete → void`, remove `ACTIVE_TASK_STATUSES` or add `'available'`, drop `stripeAccountId?`.
Confidence: high

### [P3] Global 401 handler fires on business 401s too
File: `app:/src/apis/api-client.ts:41-45`
Evidence:
```ts
if (error.response?.status === 401) { await clearToken(); onUnauthorized?.() }
```
Why it matters: `USER_INVALID_CREDENTIALS` on `/auth/session` is a 401 — harmless today (no session yet), but any future authenticated endpoint returning 401 for a business reason will log the user out silently. Nest's guard 401 body is `{statusCode:401, message:'Unauthorized'}` (English) if ever surfaced.
Suggested fix: Only clear the session when a token was attached to the request (`error.config.headers.Authorization`), or when `errorCode` is absent (guard-originated).
Confidence: high

### [P3] Client-side validation does not mirror backend limits
File: `app:/src/feature/tasks/components/ValidateTaskSheet.tsx:227-247` vs `api:/src/modules/tasks/controllers/validate-task.controller.ts:13-14`; `app:/app/(auth)/sign-up.tsx:193-199` vs `create-account.controller.ts:11`
Evidence: backend `comment: z.string().trim().min(1).max(500)`; app `TextInput` has no `maxLength`. Backend `/auth/create` `password: z.string()` has no minimum (reset-password has `min(6)`, SPEC §8.3 says ≥ 8, app placeholder says 8).
Why it matters: Over-long comment → English "Validation failed" (see P2 above); password policy is enforced nowhere on sign-up.
Suggested fix: `maxLength={500}` on the input; `password: z.string().min(8)` on both create and reset.
Confidence: high

---

## 3b. Contract table

Legend: **B-req** = backend request schema; **A-send** = app payload type and what it really sends; **B-res** = backend response shape (actual wire types); **A-read** = app response type + fields the UI reads; **MISM** = mismatches; **SPEC** = drift vs SPEC.md.

| # | Method + path | B-req | A-send | B-res | A-read | MISM | SPEC |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `POST /auth/create` (200, throttle 5/min) | `name:str, email:email, password:str, userType:'CLIENT'\|'PROXY', phoneNumber?:str, avatarUrl?:url, documentType?:'RG'\|'CPF'\|'CNPJ', documentUrl?:url, isVerified?:bool, rating?:0-5, termsAccepted:bool, totalTasksCompleted?:int, totalTasksCreated?:int, walletBalance?:num` | `TCreateAccountPayload` → sends `name,email(lowercased),phoneNumber(digits),password,userType,documentType,termsAccepted:true` | `{session: JWT}` | `TSessionResponse.session` → `setSession` → decoded claims | Backend accepts privileged fields app never sends (P1). No password min. 200 not 201. | §8.3 says `documentUrl` sent; app doesn't, no upload endpoint |
| 2 | `POST /auth/session` (200, 5/min) | `email:email, password:str` | `TSignInPayload` | `{session}`; errors 404 `USER_NOT_FOUND`, 401 `USER_INVALID_CREDENTIALS` | `session` | 401 triggers global clearToken (harmless). Throttle 429 message English. | ok |
| 3 | `GET /auth/session/refresh` (200, JWT) | — | — | `{session}` | `session` → `setSession` | none | Missing from §3.4 |
| 4 | `POST /auth/forgot-password` | `email:email` | `TForgotPasswordPayload` | `{message}`; 429 `PASSWORD_RESET_TOO_MANY_REQUESTS`, 500 `PASSWORD_RESET_SEND_FAILED` | `{message}` unused | none | ok |
| 5 | `POST /auth/verify-reset-code` | `email:email, code:str.length(6)` | `TVerifyResetCodePayload` (app gates 6 digits) | `{message}`; 400 `PASSWORD_RESET_INVALID_CODE` | unused | none | ok |
| 6 | `POST /auth/reset-password` | `email, code:len 6, newPassword:min(6)` | `TResetPasswordPayload` | `{message}` | unused | password min 6 vs SPEC 8 | §8.3 |
| 7 | `POST /auth/update-profile` (JWT) | `name:str, userType:enum, avatarUrl?:url\|null, password?:str\|null, phoneNumber?:str\|null` | **no app client** | `{session}` | — | not implemented app-side; allows `userType` switch (SPEC §8.14 says out of MVP) | §8.14 |
| 8 | `POST /auth/merchant-account` (JWT, 200) | — | `walletApis.createMerchantAccount()` | `{accountLinkUrl}` (declared `stripeAccountId?` never set); 400 `MERCHANT_ACCOUNT_CREATION_FAILED` | `TMerchantAccountResponse.accountLinkUrl` | `stripeAccountId?` dead field | ok |
| 9 | `GET /auth/merchant-dashboard` (JWT) | — | `merchantDashboard()` | `{dashboardUrl}`; 404 `MERCHANT_ACCOUNT_NOT_FOUND`, 400 `MERCHANT_DASHBOARD_LINK_FAILED` | `dashboardUrl` | none | ok |
| 10 | `GET /auth/transaction-history` (JWT) | — | `transactionHistory()` | `{tasksCreated: [{id,title,description,offeredPrice:**string**,status,createdAt,completedAt\|null}], tasksCompleted: [same + netAmount:number]}` | `TTransactionHistoryResponse`; UI reads `tasksCompleted[].title/netAmount/completedAt` | `offeredPrice` typed `number`, wire string (unused) | §8.13 history tab is a placeholder |
| 11 | `DELETE /auth/account` (JWT, 204) | — | **no app client** | empty; 409 `USER_HAS_ACTIVE_TASKS` | — | not implemented app-side | §8.14 |
| 12 | `POST /tasks/create` (JWT, 201) | `title, description, address{city,state,street,zipCode,locationLat:num,locationLng:num}, pricing{offeredPrice:num}, cardDetails{savedCard?:str, token?:str}` | `TCreateTaskPayload`; sends all, `cardDetails:{savedCard: card.stripeCardId}`, `offeredPrice` ≥ 10 (app rule) | `{id}` | `TCreateTaskResponse` (id unused; app navigates home) | task inserted before card check; `cardDetails:{}` accepted; no price min server-side; city free text (P2) | §8.8 nav drift; fee model (P1) |
| 13 | `GET /tasks/fetch?city&page` (JWT) | `city:str (required), page?:str→num ≥1 default 1` | `params:{city, page}` (page number → "2") | bare `TTask[]` (10/page), Decimal fields as strings, `ownerId{…email,phoneNumber,stripeCustomerId…}` | `TTask[]`; reads `id,title,locationAddress,status,offeredPrice,locationLat/Lng` | PII leak in `ownerId` (P2); case-sensitive `contains` (P2); no total → app infers end by `length===10` (consistent) | §4.2 numbers vs strings |
| 14 | `GET /tasks/active` (JWT) | — | `fetchActive()` | `TTask[]`: owner tasks in `available\|accepted\|on_the_way\|in_progress\|verification_required` + executor tasks in the last four | `TTask[]`; `owner`, `status`, card fields | `ACTIVE_TASK_STATUSES` constant omits `available` (unused) | CLAUDE.md/SPEC omit `available` for owner |
| 15 | `GET /tasks/:id` (JWT) | path `id` | `fetchById(id)` | `TTask & {payment: {id,taskId,amount:string,status,paymentIntent,refundId\|null,createdAt,updatedAt}\|null, executorId\|null, executor:{id,name,avatarUrl,isVerified,rating:string}\|null}`; 404 `TASK_NOT_FOUND` (also for non-owner CLIENT) | `TTaskDetail`; reads `executorId, executor, ownerId.{id,name,avatarUrl,isVerified,rating}, status, proofImageUrl, payment.{updatedAt,paymentIntent}, offeredPrice, platformFee, proxyEarnings, createdAt, startedAt` | none (types match wire) | §4.2 lists `completedAt/canceledAt` — not returned |
| 16 | `GET /tasks/:id/proof` (JWT) | path `id` | `Image source {uri, headers:{Authorization}}` | binary stream, `Content-Type` by extension, `Cache-Control: private, max-age=300`; 404 for non-owner/non-executor or missing file | rendered `<Image>` | heic served as `image/heic` (iOS only renders) | Missing from §3.4 |
| 17 | `POST /tasks/start` (JWT, 200) | `taskId:str` | `TStartTaskPayload` | `{status:'succeeded'} \| {status:'requires_action', clientSecret:string\|null}`; 404 `TASK_NOT_FOUND`, 403 `CANNOT_START_OWN_TASK`/`USER_NOT_PROXY`, 404 `NO_SAVED_CARD_FOUND`, 402 `PAYMENT_FAILED` | `TStartTaskResult.status` only | `requires_action` not handled (P1); errors after state flip (P1) | §8.9 requires `confirmPayment` |
| 18 | `POST /tasks/finish` (JWT, multipart, 200) | field `taskId:str`; file part **`file`** (optional server-side), ≤10 MB, jpeg/png/webp/heic/heif | `FormData{taskId, file:{uri,name,type}}` | empty; 404 `TASK_NOT_FOUND`, 400 `TASK_NOT_AVAILABLE`, 404 `TASK_MAPPING_NOT_FOUND`, 403 `CANNOT_FINISH_TASK`, 400 `FILE_FORMAT_NOT_SUPPORTED`, 413 "File too large" (EN) | `void` | file optional server-side; 413 English | §8.10 says field `photo`; `TASK_STARTED_AT_NOT_VALID` listed but never thrown |
| 19 | `POST /tasks/validate` (JWT, 200) | `taskId:str, rating?:int 1-5, comment?:str trim min1 max500` | `TValidateTaskPayload`; app forces rating ≥1, omits empty comment | empty; 404, 403 `CANNOT_VALIDATE_TASK`, 404 `TASK_MAPPING_NOT_FOUND`, 409 `PROXY_ACCOUNT_NOT_READY`, 500 `TASK_TRANSFER_FAILED` | `void` | comment >500 → EN "Validation failed" | §3.3/§8.9 say `TRANSFER_FAILED`; `TASK_NOT_AVAILABLE_FOR_VALIDATION` listed but code returns `TASK_NOT_FOUND` (status filter in query) |
| 20 | `POST /tasks/cancel` (JWT, 200) | `taskId:str` | `TCancelTaskPayload` | empty; 404, 403 `CANNOT_CANCEL_TASK` (also for >1 h), 500 `REFUND_FAILED` | `void` | none; app `canCancelTask` mirrors 1 h rule | ok |
| 21 | `POST /card/create` (JWT, 201) | `token:str` (Stripe PaymentMethod id) | `TCreateCardPayload{token: paymentMethod.id}` | `{id,userId,brand,last4,stripeCardId}`; 404 `USER_NOT_FOUND` (no customer), 400 `CARD_CREATION_FAILED` | `TCard` → cache | none | ok |
| 22 | `GET /card/fetch` (JWT) | — | `fetch()` | `TCard`; 404 `NO_SAVED_CARD_FOUND` | app maps 404 → `null` | none | ok |
| 23 | `DELETE /card/:id` (JWT, 204) | path `id` | `delete(id)` | empty; 404 `CARD_NOT_FOUND`, 403 `CANNOT_DELETE_CARD` | typed `{message}` (ignored) | type lie | §3.3 copy drift |
| 24 | `POST /stripe/webhook` | raw body + `stripe-signature` | n/a (Stripe → API) | `{received:true}` | n/a | n/a | n/a |

**Error body (all routes):** `AppException` → `{statusCode, timestamp, path, message(PT), errorCode, info?}` = `TApiErrorBody` ✔. Zod → `{statusCode:400, timestamp, path, message:'Validation failed', errors:{name,details[]}}` (EN, no `errorCode`). Throttler → `{statusCode:429, message:'ThrottlerException: Too Many Requests'}`. Guard → `{statusCode:401, message:'Unauthorized'}`. Unhandled → 500 `STANDARD_ERROR` (PT).

**Session claims (JWT):** backend signs `sub,name,email,rating(Decimal→string),userType,avatarUrl,isVerified,phoneNumber,documentUrl,documentType,termsAccepted,walletBalance(Decimal→string),stripeAccountId,stripeAccountReady,stripeCustomerId,totalTasksCreated,totalTasksCompleted,iat` — no `exp`. App `TSessionPayload` matches the key list (incl. `stripeAccountReady`) but types `rating`/`walletBalance` as `number` and `phoneNumber` as `string`.

---

## 4. Gaps vs MVP / SPEC

- **3DS on `/tasks/start`** (SPEC §7.3, §8.9, §9.1 item 2): not implemented on either side in a workable way — see P1.
- **Edit profile / delete account** (SPEC §8.14): backend routes exist; app has no `apis` functions, hooks or screens (`profile.tsx` only reads card + signOut).
- **History tab** (SPEC §8.13): placeholder (`history.tsx`); `tasksCreated` from `/auth/transaction-history` is fetched but never rendered.
- **Document upload / `isVerified`** (SPEC §8.3, §8.14 "badge Pendente"): app collects a photo but never sends `documentUrl`; backend has no upload endpoint and nothing ever sets `isVerified` except the mass-assignable create body.
- **429 UX** (SPEC §3.4): no PT toast; raw English message.
- **Wallet balance freshness** (SPEC §8.11): no refresh after validation.
- **Fee model transparency** (SPEC §7.3 / §8.8 breakdown): app and backend disagree — product decision needed.
- **Create-task success navigation** (SPEC §8.8): spec says go to detail; app goes home (UI, not contract).

---

## 5. Test coverage (contract-relevant)

**Backend e2e** (`api:/test/**`, Testcontainers — could not run tonight, Docker down): one spec per endpoint exists (auth ×10, tasks ×8, cards ×3, webhook ×1). Good: `start-task.e2e-spec.ts:176-178` asserts the `requires_action` + `clientSecret` shape; `fetch-task-by-id.e2e-spec.ts:55-87` asserts `ownerId`/`payment` presence; `finish-task.e2e-spec.ts:44-86` uses `.field('taskId')` (field name `file` is exercised via attach in the 200 case); `authenticate.e2e-spec.ts` asserts `errorCode` for 404/401; `create-task.e2e-spec.ts:68` acknowledges Decimal-as-string (`Number(tasks[0].offeredPrice)`).
Not covered: Zod 400 body shape (no test greps `Validation failed`); JWT claim types (`rating`/`walletBalance` strings) and absence of `exp`; mass-assignment on `/auth/create` (no test sends `isVerified`); PII fields in `/tasks/fetch` response (no negative assertion); case-sensitivity of city filter (`fetch-tasks.e2e-spec.ts:26,66` only tests exact `SP` / `São Paulo`); `/tasks/:id/proof` (no e2e spec); state left behind when `/tasks/start` throws after the status flip.
Asserts the wrong thing: `fetch-tasks.e2e-spec.ts:26` uses `city=SP`, which passes only because the state abbreviation is embedded in `locationAddress` — it does not prove the city filter works.

**Backend unit** (37 suites / 153 tests, pass): service-level; they mock repositories, so none exercises JSON serialization or controller schemas.

**App**: no test files, no `jest` in `package.json`. `tsc`/eslint clean, but TypeScript cannot catch the JWT string/number issue (types are asserted via `jwtDecode<T>`).

---

## 6. Questions for the owner

1. **Who pays the fees?** The app tells the client "Total a pagar = preço + 20 % + Stripe"; the backend charges the bare price and deducts both fees from the proxy. Which is the intended model for 1.0?
2. **3DS strategy:** accept merchant-initiated off-session charges only (reject `requires_action`), or build a client-side confirmation step? The current flow cannot complete 3DS at all.
3. Should `email`/`phoneNumber` of the client be visible to a proxy **before** acceptance (feed), only after acceptance (detail as executor), or never in-app?
4. Should the JWT expire (and the app refresh it on launch/focus), or stay long-lived with explicit refresh points?
5. Is a proof photo mandatory for `/tasks/finish`? Backend accepts none; SPEC/app assume yes.
6. Should `userType` be mutable via `/auth/update-profile` (SPEC §8.14 says not in MVP, backend allows it)?
