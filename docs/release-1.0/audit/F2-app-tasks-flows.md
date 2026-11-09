# F2 — Mobile app: home, create task, task detail, finish, validate, history

Audit date: 2026-11-08. Auditor: F2 (first pass). Read-only; nothing was edited in either repo.

---

## 1. Scope

Every file below was read in full, line by line (line counts from `wc -l`).

**Routes (`app/`)**

| File | Lines |
| --- | ---: |
| `app/(app)/(tabs)/home.tsx` | 14 |
| `app/(app)/(tabs)/history.tsx` | 14 |
| `app/(app)/tasks/create.tsx` | 96 |
| `app/(app)/tasks/[id]/index.tsx` | 653 |
| `app/(app)/tasks/[id]/finish.tsx` | 287 |

**API layer (`src/apis/`)**

| File | Lines |
| --- | ---: |
| `src/apis/tasks/tasks-api-types.ts` | 170 |
| `src/apis/tasks/tasks-apis.ts` | 52 |
| `src/apis/tasks/tasks-hooks.ts` | 134 |
| `src/apis/query-keys.ts` | 13 |
| `src/apis/query-client.ts` | 34 |
| `src/apis/api-client.ts` (supporting) | 67 |

**Feature modules**

| File | Lines |
| --- | ---: |
| `src/feature/home/components/ClientHome.tsx` | 276 |
| `src/feature/home/components/ProxyHome.tsx` | 566 |
| `src/feature/tasks/components/CreateTaskStep1.tsx` | 359 |
| `src/feature/tasks/components/CreateTaskStep2.tsx` | 333 |
| `src/feature/tasks/components/PriceBreakdown.tsx` | 106 |
| `src/feature/tasks/components/ValidateTaskSheet.tsx` | 279 |
| `src/feature/tasks/components/ReceiptCard.tsx` | 142 |
| `src/feature/tasks/components/CounterpartCard.tsx` | 112 |
| `src/feature/tasks/components/TaskTimeline.tsx` | 202 |
| `src/feature/tasks/components/TaskCard.tsx` | 131 |
| `src/feature/tasks/components/TaskCardSkeleton.tsx` | 90 |
| `src/feature/tasks/components/TasksEmptyState.tsx` | 53 |
| `src/feature/tasks/hooks/useDeviceLocation.ts` | 56 |
| `src/feature/tasks/hooks/useLocationCapture.ts` | 195 |
| `src/feature/tasks/utils/can-cancel.ts` | 24 |
| `src/feature/tasks/utils/format-payment-id.ts` | 10 |
| `src/feature/tasks/utils/proof.ts` | 21 |
| `src/feature/tasks/utils/status-display.ts` | 25 |
| `src/common/utils/format.ts` | 34 |
| `src/common/utils/haversine.ts` | 30 |

**Supporting app files read in full for context** (not audited line by line for findings): `src/common/utils/masks.ts`, `src/shared/components/form/FormInput.tsx`, `src/shared/components/Button.tsx`, `src/shared/components/form/RatingInput.tsx`, `src/shared/components/AppModal.tsx`, `src/shared/components/TabPlaceholder.tsx`, `src/store/modal-store/modal-store.ts`, `src/store/toast-store/toast-store.ts`, `src/store/auth-store/auth-store.ts`, `src/apis/auth/*`, `src/apis/cards/cards-hooks.ts`, `src/apis/wallet/*`, `src/feature/auth/hooks/useProxyAuth.ts`, `src/shared/providers/SessionProvider.tsx`, `src/lib/*`, `app/_layout.tsx`, `app/(app)/_layout.tsx`, `app/(app)/(tabs)/_layout.tsx`, `app.json`, `package.json`, `.env.example`.

**Backend read for contract checks (read-only, `/Users/leandromartins/Documents/proxy-api/`)**: all 9 files in `src/modules/tasks/controllers/`, all 9 `src/modules/tasks/use-cases/*.service.ts`, `src/modules/tasks/repository/tasks.repository.ts`, `src/modules/tasks/types/index.d.ts`, `src/modules/tasks/dtos/tasks-repository.dto.ts`, `src/pipes/multer-validation.pipe.ts`, `src/pipes/zod-validation.pipe.ts`, `src/exception/http.exception.ts`, `src/stripe/stripe.service.ts` (lines 55-110), `src/modules/stripe-webhook/use-cases/handle-payment-{succeeded,failed}.service.ts`, `src/modules/auth/use-cases/fetch-transaction-history.service.ts`, `src/modules/cards/use-cases/create-user-payment-method.service.ts` (lines 1-70), `prisma/schema.prisma` (Tasks/Payments/enums), e2e test names under `test/tasks/`.

Nothing in the slice was skipped. `npx tsc --noEmit` / `npx eslint .` were not re-run (brief: already clean).

---

## 2. How it works (as the code actually behaves)

### 2.1 Plumbing

- `api-client.ts` is a single axios instance, `timeout: 15000` for **every** request including the multipart upload (`api-client.ts:20`). Request interceptor reads the JWT from SecureStore on each call; a 401 clears the token and the `(app)/_layout` guard redirects.
- `query-client.ts`: `staleTime` 5 min, `gcTime` 15 min, `refetchOnWindowFocus: false`, retry only on network/5xx/429. There is **no** `focusManager`/`AppState` wiring, no `RefreshControl`, no `useFocusEffect`, no `refetchInterval` anywhere in `app/` or `src/` (grep returned nothing). The only ways data changes on screen are: a mutation on *this* device invalidating keys, or the 5-minute staleness expiring and a component mounting.
- `query-keys.ts` defines `card`, `tasksActive`, `tasksByCity(city)`, `taskById(id)`, `transactionHistory`. There is no key for the session/JWT: `walletBalance`, `totalTasksCreated/Completed`, `rating`, `stripeAccountReady` all come from `jwtDecode(token)` in `auth-store.ts` and only change on login or `useRefreshSessionMutation`, which is used solely by `useStripeOnboarding.ts`.

### 2.2 Home (`home.tsx` → `ClientHome` / `ProxyHome`)

- `ClientHome`: `GET /tasks/active` then `filter(t => t.owner === session.sub)` (`ClientHome.tsx:44-47`). Stats: "Ativas" = owned list length; "Concluídas" = `session.totalTasksCompleted`; "Avaliação" = `session.rating` or "—". Backend only increments `totalTasksCompleted` for the **executor** (`validate-task.service.ts:83-86`) and only proxies are rated (`rateProxyService`), so for a CLIENT both stats are structurally 0/"—" forever. Loading = 2 skeletons; empty = `TasksEmptyState`; `isError` is never read — an API failure renders the empty state with no toast (SPEC 8.6 asks for toast + empty).
- `ProxyHome`: `useInfiniteQuery` on `GET /tasks/fetch?city=&page=` with 3 hard-coded pills `['São Paulo','Rio de Janeiro','Belo Horizonte']`, page size 10, `getNextPageParam` stops when a page is shorter than 10. Search is a client-side filter over the pages already loaded. Distance = haversine between `useDeviceLocation()` (permission requested on mount) and task coords; hidden when permission denied. Also calls `GET /tasks/active` to show an "N tarefas em andamento" banner that always opens `tasks[0]`. Wallet card shows `session.walletBalance` from the JWT. No error state (falls through to "Nenhuma tarefa por aqui").
- Backend `/tasks/fetch` filters `status: 'available'` and `locationAddress: { contains: city }` — a **case-sensitive substring** on the address string built by the backend as `` `${street}, ${city} - ${state}, ${zipCode}` `` (`create-task.service.ts:34`, `tasks.repository.ts:84`).

### 2.3 Create task (`create.tsx` → `CreateTaskStep1` → `CreateTaskStep2`)

- Step 1 is a react-hook-form with `mode: 'all'`: title (required), description (required, ≥10), street (required), city (free text, required), state (2-letter mask), CEP (mask, 9 chars), price (BRL cents mask, `>= 10`). **There is no date/time field** (SPEC 8.8 lists "Data" and "Hora"; backend `Tasks` has no scheduled field; `@react-native-community/datetimepicker` is in `package.json` but unused).
- Coordinates: "Usar minha localização" → `useLocationCapture.capture()` → permission → `getCurrentPositionAsync` → `reverseGeocodeAsync` → fills the 4 address fields and stores `coords`. On submit, if `coords` is null, `resolveCoords()` runs: **requests location permission first** (`useLocationCapture.ts:157`), then `geocodeAsync(typed address)`; if that throws or returns nothing it silently falls back to the device position (`:173-180`). Once `coords` is set (by capture, or carried back from Step 2 via `initialCoords`), it is never cleared when the user edits the address.
- Step 2: `useCardQuery()`; "Publicar" is enabled only when a card exists and the mutation is idle (`CreateTaskStep2.tsx:38`) — double submit is guarded. `PriceBreakdown` renders offered + 20% + (3.99% + 0,39) and calls the sum **"Total a pagar"**. Payload: `address{city,state,street,zipCode,locationLat,locationLng}`, `pricing{offeredPrice}`, `cardDetails{savedCard}`. Success → toast "Tarefa publicada! Aguardando um Proxy." → `router.dismissTo('/home')` (SPEC says `router.replace('/tasks/'+id)`), and `tasksActive` is invalidated.
- Backend: the task row is inserted **before** the card check (`create-task.service.ts:36-50`); the charge at `/tasks/start` is `offeredPrice * 100` (`start-task.service.ts:60`) — i.e. the client pays exactly the offered price; both fees are deducted from the proxy's side at validation (`validate-task.service.ts:55-57`).

### 2.4 Task detail (`tasks/[id]/index.tsx`)

- `GET /tasks/:id` → `TTaskDetail` (`TTask` + `payment`, `executorId`, `executor`). Role flags: `isClient`, `isProxy`, `isExecutor = task.executorId === session.sub`.
- Rendered action matrix:

| status | CLIENT | PROXY |
| --- | --- | --- |
| `available` | Cancelar tarefa | Aceitar e iniciar tarefa (any proxy, no `stripeAccountReady` check) |
| `in_progress` | Cancelar (only if `canCancelTask` true at render time), else nothing | executor: "Enviar comprovante e finalizar" → `/tasks/[id]/finish` |
| `verification_required` | Validar e pagar + Contestar conclusão (→ `modal.info('Funcionalidade em breve.')`) | nothing (SPEC wants a disabled "Aguardando validação do cliente..." bar) |
| `completed` | Recibo (if `payment` present) | Recibo |
| `canceled` | Timeline replaced by "Tarefa cancelada" badge | same |
| `payout_failed` | badge "Pagamento pendente", timeline at step "Concluída / Pagamento liberado.", **no receipt** | same |

- `payment.status` (`pending/succeeded/failed/refunded/disputed`) is **never read anywhere in the app** (grep for `payment.status`, `confirmPayment`, `handleNextAction`, `useStripe` in tasks code: none; `useStripe` is only used in `AddCardSheet`).
- Accept: `modal.confirm` → `POST /tasks/start`. `requires_action` → `toast.success('Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.')`; `clientSecret` is dropped. Invalidates `taskById`, `tasksActive`, `['tasks','byCity']`.
- Cancel: `modal.confirm` (destructive) → `POST /tasks/cancel`; error shown via `modal.error` after 280 ms. Invalidates `taskById`, `tasksActive`.
- Validate: `ValidateTaskSheet` (custom animated `Modal`). Rating 1-5 is **required** by the UI (`disabled={rating <= 0}`), comment optional with **no length limit**. Error is rendered inline in the sheet. Success → `onSuccess` → toast "Pagamento liberado. Obrigado!". Invalidates `taskById`, `tasksActive` only.
- Proof photo: `buildProofImageSource()` → `{ uri: ${API}/tasks/:id/proof, headers: { Authorization } }` — RN `<Image>` supports `headers` on iOS and Android, so the authenticated route works. Backend serves `Cache-Control: private, max-age=300`.
- Action bars are `position: 'absolute'` at the bottom (`index.tsx:290-302`, `:360-372`), with scroll padding compensating. CLAUDE.md says CTAs must live inside the scroll and that sticky bars were "explicitly rejected" — code and CLAUDE.md disagree here.

### 2.5 Finish (`tasks/[id]/finish.tsx`)

- Two options: camera or library, both `quality: 0.7`, `allowsEditing: false`, `mediaTypes: ['images']`. On iOS, `quality < 1` takes expo-image-picker's re-encode path, so HEIC originals come back as JPEG (`node_modules/expo-image-picker/ios/MediaHandler.swift:128-131` fast path only when `quality >= 1`). `picked = { uri, name: fileName ?? proof-<ts>.<ext>, type: mimeType ?? 'image/jpeg' }`.
- Submit → `tasksApis.finish` builds `FormData` with `taskId` + `file` `{uri,name,type}` and `Content-Type: multipart/form-data` (RN's fetch sets the boundary). No per-request timeout override → 15 s global. On error `modal.error`, `picked` is kept so retry works without re-picking. Success → toast "Comprovante enviado. Aguardando validação." → `router.back()`; detail refetches because `taskById` was invalidated.
- No local size check; no "Observações" field (SPEC 8.10 lists one; backend has nowhere to put it).
- Backend: `MulterModule.register(multerOptions)` in `tasks.module.ts:45` gives the finish route a 10 MB limit and a JPEG/PNG/WEBP/HEIC/HEIF filter. The service writes the file to `src/tmp/<taskId>/` and sets `verification_required` + `completedAt = now` (completedAt means "proxy finished", not "client validated").

### 2.6 History (`history.tsx`)

`TabPlaceholder` with "Em construção" and copy "Em breve você verá tarefas concluídas, canceladas e poderá filtrar por período." No data is fetched. SPEC 8.13 is not implemented.

### 2.7 Code vs CLAUDE.md / SPEC disagreements (summary)

1. CLAUDE.md "never sticky/fixed outside the scroll" vs absolute action bars in task detail.
2. SPEC 8.8 date/time pickers, SP/RJ/BH city toggle, `router.replace('/tasks/'+id)` — none implemented; city is free text; nav is `dismissTo('/home')`.
3. SPEC 8.9 5-step timeline → 4 steps; proxy "Aguardando validação" disabled bar missing; "Aguardando" people section missing.
4. SPEC 8.10 "Observações", 10 MB local check, toast copy — not implemented / different copy.
5. SPEC 8.13 History — placeholder.
6. SPEC 2.2 status colours — every badge uses `ACCENT_TINT_STRONG`; `payout_failed` label is "Pagamento pendente" not "Falha no repasse".
7. SPEC 7.3 / 9.1 3DS (`confirmPayment`, poll `payment.status`) — not implemented.
8. SPEC 8.8 breakdown describes what the client pays; backend charges only `offeredPrice`.
9. SPEC 4.2 `Task.completedAt/canceledAt` — backend `select` omits them, app type omits them.

---

## 3. Findings

No P0 found inside this slice. One P1 (3.1) has a P0-grade backend counterpart that the backend auditor should own.

### [P1] 3DS `requires_action` is treated as success; `payment.status` is never surfaced; client can validate a task whose payment is still `pending`

File: `app/(app)/tasks/[id]/index.tsx:103-110`, `:265-266`; `src/apis/tasks/tasks-api-types.ts:168-170`; backend `start-task.service.ts:44-50,87-92`, `validate-task.service.ts:28-57`

Evidence:
```ts
const result = await startTask.mutateAsync({ taskId: task.id })
if (result.status === 'requires_action') {
  toast.success(
    'Tarefa aceita. Aguardando confirmação do pagamento pelo cliente.',
  )
} else {
  toast.success('Tarefa aceita! Bom trabalho.')
}
```
```ts
case 'verification_required':
  return { cancel: false, validate: true, contest: true }
```
Backend flips the task to `in_progress` and inserts the executor mapping **before** confirming the PaymentIntent (`start-task.service.ts:44-50`); `validate-task.service.ts` never checks `payment.status` before `createTransfer`.

Why it matters: For a 3DS card (most Brazilian cards per SPEC 9.1) the proxy sees a success toast and starts working on a task whose payment is `pending`. `clientSecret` is discarded; nobody can complete the challenge (the challenge belongs to the *client's* card, and the client's app has no entry point for it). Two outcomes: (a) `payment_intent.payment_failed` webhook later reverts the task to `available` and deletes the mapping (`handle-payment-failed.service.ts:18-30`) — the proxy's banner/detail silently loses the task with no explanation; (b) the PI stays `requires_action`, the proxy finishes, the client taps "Validar e pagar" and the platform **transfers money it never collected**. The app never reads `task.payment.status` to warn either party.

Suggested fix: (1) App: render a "Pagamento pendente de confirmação" banner whenever `task.payment?.status !== 'succeeded'` for `in_progress`/`verification_required`, hide "Validar e pagar" (and "Enviar comprovante") until it is; (2) Backend (P0, F-backend): refuse `validate` unless `payment.status === 'succeeded'`; (3) Product: decide where 3DS is completed — see Questions §6.1. Do **not** call `confirmPayment(clientSecret)` on the proxy's device; it would present the cardholder challenge to the wrong person.

Confidence: high

### [P1] `PriceBreakdown` tells the client they will pay offered + 20% + Stripe fee; the backend charges exactly `offeredPrice`

File: `src/feature/tasks/components/PriceBreakdown.tsx:20-22,36-39,64,75`; backend `start-task.service.ts:60`, `validate-task.service.ts:54-57`

Evidence:
```ts
const platformFee = offeredPrice * PLATFORM_FEE_RATE
const stripeFee = offeredPrice * STRIPE_FEE_RATE + STRIPE_FEE_FIXED
const total = offeredPrice + platformFee + stripeFee
...
<Row label="Taxa da plataforma (20%)" ... />
<Row label="Taxa Stripe (3,99% + R$ 0,39)" ... />
...  Total a pagar  ... {formatBRL(total)}
```
Backend:
```ts
amount: taskDetails.offeredPrice * 100,            // start-task.service.ts:60
// offeredPrice - stripe fee (3.99% + R$ 0.39) - platform fee (20%) = proxy net
const proxyEarnings = taskDetails.offeredPrice - stripeFee - platformFee
```

Why it matters: A client offering R$ 100 is told "Total a pagar R$ 124,38" and is charged R$ 100,00; `ReceiptCard` then shows "Valor pago R$ 100,00". Money copy that contradicts the statement is a trust/complaint issue and arguably a consumer-law problem (CDC art. 31 price transparency). SPEC 8.8 itself describes the wrong model.

Suggested fix: Rename the card to "Como o valor é dividido": "Você paga R$ 100,00 / Taxa Proxy (20%) − R$ 20,00 / Taxa de processamento − R$ 4,38 / O Proxy recebe R$ 75,62". Update SPEC 8.8 accordingly.

Confidence: high

### [P1] City is free text on creation but the proxy feed only queries 3 fixed cities with a case-sensitive `contains` — tasks can be unreachable

File: `src/feature/tasks/components/CreateTaskStep1.tsx:261-271`; `src/feature/home/components/ProxyHome.tsx:45,51`; backend `tasks.repository.ts:81-85`, `create-task.service.ts:34`

Evidence:
```tsx
<FormInput ref={cityRef} name="city" label="Cidade" placeholder="Ex: São Paulo"
  autoCapitalize="words" ... rules={{ required: 'Informe a cidade.' }} />
```
```ts
const CITIES = ['São Paulo', 'Rio de Janeiro', 'Belo Horizonte'] as const
```
```ts
where: { status: 'available', ownerId: { isDeleted: false },
         locationAddress: { contains: city } },     // no mode: 'insensitive'
```

Why it matters: "sao paulo", "SP", "São paulo" (lower p after a mid-field autocorrect), "Guarulhos", "Niterói", or any city other than the three pills produces a task no proxy can ever list. The client sees it as "Disponível" indefinitely and nothing in the UI explains why. Reverse-geocode fills `r.city ?? r.subregion` which for Apple often yields the district/municipality (e.g. "Osasco"), again outside the pills.

Suggested fix: Make city a picker limited to the served cities (SPEC 8.8 "Toggle SP / RJ / BH") and normalise on submit; when "Usar minha localização" returns a non-served city, show an inline error. Backend (F-backend): `mode: 'insensitive'` or a dedicated `city` column.

Confidence: high

### [P1] No refresh path: lists and detail stay stale for 5 minutes; no pull-to-refresh, focus refetch or polling

File: `src/apis/query-client.ts:24,28`; `src/feature/home/components/ClientHome.tsx:71-75`; `src/feature/home/components/ProxyHome.tsx:90-145`; `app/(app)/tasks/[id]/index.tsx:39`

Evidence:
```ts
staleTime: 5 * 60 * 1000,
...
refetchOnWindowFocus: false,
```
`grep -rn "RefreshControl\|focusManager\|AppState\|useFocusEffect\|refetchInterval" app src` → no matches.

Why it matters: The whole product is two people changing the same row from two devices. A client who opens a task detail, backgrounds the app, and returns after the proxy accepted still sees "Disponível" + "Cancelar tarefa" for up to 5 minutes (cache is fresh, so remount does not refetch); the proxy's feed keeps showing a task that was just taken (tap → `TASK_NOT_AVAILABLE`). SPEC 7.3 ("após qualquer ação, refetch ... que pode ter mudado via webhook") and 9.2 step 10 ("poll após ações") are not met, and there is no manual escape hatch.

Suggested fix: Wire `focusManager.setEventListener` to `AppState` in `app/_layout.tsx`; add `RefreshControl` to both homes; in task detail use `refetchOnMount: 'always'` (or `staleTime: 0`) plus `refetchInterval` while `status ∈ {available, in_progress, verification_required}` or `payment.status === 'pending'`.

Confidence: high

### [P1] History tab is a placeholder (SPEC 8.13 missing)

File: `app/(app)/(tabs)/history.tsx:5-13`

Evidence:
```tsx
<TabPlaceholder Icon={HistoryIcon} title="Histórico"
  subtitle="Tudo o que você já fez por aqui."
  description="Em breve você verá tarefas concluídas, canceladas e poderá filtrar por período." />
```

Why it matters: After a task is `completed` or `canceled` it disappears from `/tasks/active` and therefore from Home; the only way to see it again is a deep link. A client cannot find their receipt, a proxy cannot see what they were paid for. `useTransactionHistoryQuery` + `queryKeys.transactionHistory` already exist, unused by any screen in this slice. Also note the backend `tasksCompleted` list is `status: 'completed'` only (`auth.repository.ts:115-116`), so `payout_failed` tasks would be missing from a "Concluídas" tab built on it.

Suggested fix: Implement 8.13 with 3 tabs: "Em andamento" from `tasksActive`; "Concluídas"/"Canceladas" from `transactionHistory` (`tasksCreated ∪ tasksCompleted`, dedupe by id, filter by status; include `payout_failed` under Concluídas with the badge). Reuse `TaskCard`.

Confidence: high

### [P1] Proof upload shares the 15 s global timeout; on timeout the server likely completes, so retry returns "Tarefa não encontrada."

File: `src/apis/api-client.ts:20`; `src/apis/tasks/tasks-apis.ts:40-51`; backend `finish-task.service.ts:19-28,46-69`

Evidence:
```ts
export const api = axios.create({ baseURL, timeout: 15000 })
```
```ts
return api.post<void>('/tasks/finish', form,
  { headers: { 'Content-Type': 'multipart/form-data' } })   // no timeout override
```
Backend looks the task up with `status: 'in_progress'` and throws `taskNotFound` otherwise (`finish-task.service.ts:19-25`).

Why it matters: A 12 MP photo at `quality: 0.7` is typically 2-4 MB; on a congested LTE/3G uplink (common where proxies work) 15 s is easily exceeded. axios aborts with `ECONNABORTED` → "A requisição demorou demais. Tente novamente." while the server finishes writing the file and sets `verification_required`. The user retries and gets a 404 "Tarefa não encontrada." The task is actually fine, but the proxy has no way to know; `router.back()` never runs so the detail is not shown.

Suggested fix: `timeout: 120_000` on the finish request; on `ECONNABORTED` or 404 after an upload, refetch `taskById` and, if `status === 'verification_required'`, treat as success. Optionally downscale with `expo-image-manipulator` to ≤ 1600 px before upload.

Confidence: medium (depends on real-world photo size and network; the failure mode is deterministic once the timeout fires)

### [P2] Creating a task requires location permission even when the address is typed; failure silently uses the device position as the task location

File: `src/feature/tasks/hooks/useLocationCapture.ts:151-187`

Evidence:
```ts
const resolveCoords = async (input) => {
  ...
  if (!(await ensurePermission())) return null
  // Try A2 first — geocode the typed address.
  ...
  // A1 fallback — current device position.
  const position = await Location.getCurrentPositionAsync({ ... })
  return { lat: position.coords.latitude, lng: position.coords.longitude }
```

Why it matters: (1) A client who denies location can never publish a task — `ensurePermission` shows "Precisamos da sua localização pra usar essa função" and submit aborts, although `geocodeAsync` does not need the permission on iOS. (2) When geocoding of the typed address fails (throws or empty), the task is saved with the *client's current* coordinates — if they are creating a task for another address (parents' home, office) the proxy's distance is wrong and no one is told. SPEC 8.7 asks for graceful degradation when permission is denied.

Suggested fix: Try `geocodeAsync` first without requesting permission; only ask for permission as a fallback; if both fail, show a blocking error ("Não encontramos esse endereço. Confira a rua, cidade e CEP.") instead of silently substituting coordinates.

Confidence: high

### [P2] Coordinates captured once are never invalidated when the address is edited (incl. coming back from Step 2)

File: `src/feature/tasks/components/CreateTaskStep1.tsx:71-73,83-91,104-116`; `app/(app)/tasks/create.tsx:56-61`

Evidence:
```ts
const [coords, setCoords] = useState(initialCoords ?? null)
...
let finalCoords = coords
if (!finalCoords) {
  finalCoords = await location.resolveCoords({ ... })
}
```

Why it matters: Tap "Usar minha localização" (fills home address + coords), then retype the street for the real job site → the typed address is sent with the *home* lat/lng. Same after "Voltar" from Step 2: `initialCoords` restores the old coords regardless of edits. The proxy sees a wrong distance; the stored `locationLat/Lng` is permanently wrong.

Suggested fix: `form.watch(['street','city','state','zipCode'])` → `setCoords(null)` on change; or store the address snapshot the coords belong to and compare on submit.

Confidence: high

### [P2] Proxy "Aceitar" is not gated by `stripeAccountReady`; the user hits a misleading 403 "O usuário não possui permissão de proxy."

File: `app/(app)/tasks/[id]/index.tsx:56,94-116`; backend `start-task.service.ts:39-42`

Evidence:
```ts
const proxyCanStart = !!(task && isProxy && task.status === 'available')
```
```ts
if (userDetails.userType !== 'PROXY' || !userDetails.stripeAccountReady) {
  throw new AppException(errorDictionary.user.userNotProxy)
}
```

Why it matters: Every new proxy's first "Aceitar e iniciar" ends in an error modal that says they are not a proxy. `session.stripeAccountReady` is available in the JWT; the wallet tab already knows how to onboard.

Suggested fix: When `isProxy && !session.stripeAccountReady`, render the bar as "Complete sua conta de recebimento para aceitar" → `router.navigate('/wallet')`. Keep the server check.

Confidence: high

### [P2] Home stats and wallet balance come from the JWT and are structurally wrong/stale for the role shown

File: `src/feature/home/components/ClientHome.tsx:57-64`; `src/feature/home/components/ProxyHome.tsx:290`; `src/apis/tasks/tasks-hooks.ts:61-69,91-100`; backend `validate-task.service.ts:83-101`

Evidence:
```ts
{ label: 'Concluídas', value: String(session.totalTasksCompleted ?? 0) },
{ label: 'Avaliação', value: session.rating > 0 ? ... : '—' },
```
Backend increments `totalTasksCompleted` only for `taskMapping.executorId` and `rateProxyService` rates only the executor.

Why it matters: For a CLIENT, "Concluídas" is always 0 and "Avaliação" always "—" (nothing ever writes them for clients). For a PROXY, `walletBalance` on Home is whatever the JWT held at login; after a client validates, the proxy sees the old balance until they re-login or run Stripe onboarding (the only caller of `useRefreshSessionMutation`). `useCreateTaskMutation`/`useValidateTaskMutation` never refresh the session.

Suggested fix: Client stats: "Criadas" = `session.totalTasksCreated` (refresh session after create) and "Concluídas" = count of `tasksCreated.filter(status==='completed')` from `transactionHistory`; drop "Avaliação" for clients. Proxy Home: call `refreshSession` on mount/focus (cheap, `GET /auth/session/refresh`) or show balance from a wallet query.

Confidence: high

### [P2] API errors on both homes render the empty state with no error signal

File: `src/feature/home/components/ClientHome.tsx:40,258-271`; `src/feature/home/components/ProxyHome.tsx:54-55,131-137`

Evidence:
```tsx
const { data: activeTasks, isPending } = useActiveTasksQuery()
...
{isPending ? (...) : ownedTasks.length === 0 ? (<TasksEmptyState />) : (...)}
```
```tsx
ListEmptyComponent={ isPending ? <TaskListSkeletons /> : <TasksListEmpty hasSearch=... /> }
```

Why it matters: Server down / 500 / no network shows "Nenhuma tarefa ativa — Crie sua primeira tarefa" or "Nenhuma tarefa por aqui — Tente trocar de cidade". A client with 3 live tasks is told they have none. SPEC 8.6 requires a toast on failure.

Suggested fix: Read `isError`/`error`; render an error card with `extractErrorMessage(error)` and a "Tentar novamente" button calling `refetch()`.

Confidence: high

### [P2] `payout_failed` is displayed as a happy completion

File: `src/feature/tasks/utils/status-display.ts:22-23`; `src/feature/tasks/components/TaskTimeline.tsx:88-90,73`; `app/(app)/tasks/[id]/index.tsx:187`

Evidence:
```ts
case 'payout_failed':
  return 'Pagamento pendente'
```
```ts
case 'completed':
case 'payout_failed':
  return 'completed'          // step hint: 'Pagamento liberado.'
```
```tsx
{task.status === 'completed' && task.payment ? ( <ReceiptCard .../> ) : null}
```

Why it matters: `payout_failed` means Stripe could not pay the proxy, the transfer was reversed and the wallet debited (SPEC 2.2/7.3). The app shows a timeline step "Concluída — Pagamento liberado." and a badge "Pagamento pendente" (SPEC: "Falha no repasse", red), and hides the receipt the proxy most needs to contact support.

Suggested fix: Label "Falha no repasse"; in `TaskTimeline` render a red badge like `CanceledBadge` ("Não conseguimos repassar o pagamento. Verifique sua conta Stripe na Carteira."); show `ReceiptCard` for `payout_failed` too.

Confidence: high

### [P2] `ReceiptCard` lines do not add up and "Concluída em" is the payment row's `updatedAt`

File: `src/feature/tasks/components/ReceiptCard.tsx:20-22,67-89`

Evidence:
```ts
const paidAt = task.payment?.updatedAt ?? null
...
<Line label="Preço da tarefa" value={formatBRL(task.offeredPrice)} />
<Line label="Taxa Proxy" value={`− ${formatBRL(task.platformFee)}`} />
...
<Line label="Taxa Proxy" value={formatBRL(task.platformFee)} />
<Line label="Recebido pelo executor" value={formatBRL(task.proxyEarnings)} />
```

Why it matters: For R$ 100: proxy sees 100 − 20 = "Você recebeu 75,62"; client sees 20 + 75,62 = 95,62 against "Valor pago 100,00". The missing R$ 4,38 Stripe fee is unexplained on both sides. `payment.updatedAt` is set when the Payments row is created at `/tasks/start` (or by the `payment_intent.succeeded` webhook) — not when the client validated; the task's own `completedAt` is neither selected by the backend nor in `TTask`.

Suggested fix: Add a "Taxa de processamento" line (`offered − platformFee − proxyEarnings`); label the date "Pago em" or drop it until the backend exposes a validation timestamp (`Tasks.updatedAt` at `completed` is the closest today).

Confidence: high

### [P2] Comment has no 500-char limit; overflow yields an English "Validation failed"

File: `src/feature/tasks/components/ValidateTaskSheet.tsx:227-247`; backend `validate-task.controller.ts:14`, `zod-validation.pipe.ts:13-17`

Evidence:
```tsx
<TextInput value={comment} onChangeText={setComment} ... multiline numberOfLines={3} ... />
```
(no `maxLength`)
```ts
comment: z.string().trim().min(1).max(500).optional(),
...
throw new BadRequestException({ message: 'Validation failed', ... })
```

Why it matters: `extractErrorMessage` surfaces `data.message` → the client sees "Validation failed" inside the sheet, in English, with no hint. Same pipe message applies to any schema error on any task route.

Suggested fix: `maxLength={500}` + a "x/500" counter in the sheet; map `message === 'Validation failed'` to a pt-BR fallback in `extractErrorMessage`.

Confidence: high

### [P2] No local file-size check before upload; a >10 MB file yields an English 413 from Multer

File: `app/(app)/tasks/[id]/finish.tsx:79-85`; backend `multer-validation.pipe.ts:24-26`

Evidence:
```ts
const handlePickResult = (result: ImagePicker.ImagePickerResult) => {
  if (result.canceled) return
  const asset = result.assets[0]
  const type = asset.mimeType ?? 'image/jpeg'
  const name = asset.fileName ?? `proof-${Date.now()}.${extFromMime(type)}`
  setPicked({ uri: asset.uri, name, type })
}
```

Why it matters: Library picks can exceed 10 MB (panoramas, pro-RAW-derived JPEGs); Nest's `FileInterceptor` turns Multer's limit into a 413 whose `message` is "File too large" — shown verbatim to the user after a long upload. SPEC 8.10 explicitly asks for a local check. `asset.fileSize` is available from expo-image-picker.

Suggested fix: `if ((asset.fileSize ?? 0) > 10 * 1024 * 1024) modal.error('A foto precisa ter até 10 MB.')`; or downscale via `expo-image-manipulator`.

Confidence: high

### [P2] Missed invalidations after mutations

File: `src/apis/tasks/tasks-hooks.ts:61-69,91-100,107-116,124-134`

Evidence:
```ts
export function useValidateTaskMutation() {
  ...
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskById(variables.taskId) })
      qc.invalidateQueries({ queryKey: queryKeys.tasksActive })
    },
```

Why it matters: `transactionHistory` (used by Wallet; needed by History) is never invalidated by validate/cancel/finish/create, so a wallet screen opened within 5 min shows the pre-validation list. No mutation refreshes the session JWT, so `totalTasksCreated`/`walletBalance` drift (see stats finding). `useCancelTaskMutation` does not invalidate `['tasks','byCity']` (harmless today since only proxies browse feeds).

Suggested fix: Add `qc.invalidateQueries({ queryKey: queryKeys.transactionHistory })` to create/validate/cancel/finish; after create and validate call `authApis.refreshSession()` and `setSession`.

Confidence: high

### [P2] Task list/detail payloads carry the owner's `email`, `phoneNumber` and `stripeCustomerId` to any proxy (cross-slice: backend owns the fix)

File: `src/apis/tasks/tasks-api-types.ts:54-65`; backend `tasks.repository.ts:66-79` (same `select` in all four queries)

Evidence:
```ts
export interface TTaskOwner {
  id: string; name: string; email: string; phoneNumber: string | null;
  ...
  stripeCustomerId: string | null
}
```

Why it matters: `/tasks/fetch` is readable by every PROXY; each card in the feed ships the client's e-mail, phone and Stripe customer id. The app only renders `name/avatar/isVerified/rating`, so there is no UI need. LGPD data-minimisation issue and a leak if any device is compromised.

Suggested fix: Backend: select only the `TaskCounterpart` fields for `ownerId` (as already done for `executor`). App: narrow `TTaskOwner` to match so the type does not silently invite use.

Confidence: high

### [P2] Step 1 hint "Você paga apenas quando o Proxy entrega." contradicts when the card is actually charged

File: `src/feature/tasks/components/CreateTaskStep1.tsx:338`; `app/(app)/tasks/[id]/index.tsx:98-99`; backend `start-task.service.ts:57-61`

Evidence:
```tsx
hint="Mínimo R$ 10,00. Você paga apenas quando o Proxy entrega."
```
```ts
message: 'Ao aceitar, o cartão do cliente será cobrado imediatamente e a tarefa entrará em andamento.',
```

Why it matters: The card is charged (not pre-authorised) the moment a proxy accepts; the Step 2 copy ("fica retido até você validar") is closer but still implies a hold. A client who checks their statement after acceptance sees a charge they were told would not happen yet — chargeback risk.

Suggested fix: "Mínimo R$ 10,00. Seu cartão é cobrado quando um Proxy aceita; o valor só é repassado após você validar."

Confidence: high

### [P3] `canCancelTask` diverges from the backend on `startedAt == null` and is only evaluated at render

File: `src/feature/tasks/utils/can-cancel.ts:17-22`; backend `cancel-task.service.ts:39-47`

Evidence:
```ts
if (task.status === 'in_progress') {
  if (!task.startedAt) return true
  const elapsed = now - new Date(task.startedAt).getTime()
  return elapsed < ONE_HOUR_MS
}
```
Backend: `if (!task.startedAt) throw cannotCancelTask`.

Why it matters: Both agree on the 1 h cut-off (`differenceInHours(...) >= 1` ⇔ `elapsed ≥ 1h`), but the null case is inverted, and a detail screen left open past the hour keeps the button until the 403 arrives.

Suggested fix: Return `false` when `startedAt` is null; recompute with a 30 s `setInterval` or derive from `Date.now()` in render via a ticking state.

Confidence: high

### [P3] Status presentation drifts from SPEC 2.2 / 8.9 (colours, label, timeline steps, proxy waiting state, people section)

File: `src/feature/tasks/components/TaskCard.tsx:44-65`; `app/(app)/tasks/[id]/index.tsx:443-463,62,141-165`; `src/feature/tasks/components/TaskTimeline.tsx:57-74`

Evidence:
```tsx
backgroundColor: ACCENT_TINT_STRONG,   // every status, TaskCard.tsx:50 and index.tsx:449
```
```ts
const STEPS = [ published, in_progress, awaiting, completed ]   // 4 steps; SPEC says 5
```
```ts
const showActionBar = !!clientActions || proxyCanStart || proxyCanFinish   // proxy sees nothing on verification_required
```

Why it matters: SPEC 2.2 defines per-status colours (`status-*` tokens exist in `tailwind.config.js` and are unused here); a client cannot tell "Disponível" from "Aguardando validação" at a glance. SPEC 8.9 wants the proxy to see a disabled "Aguardando validação do cliente..." bar, an "Aguardando" people row when there is no executor, and a proxy browsing an `available` task currently sees no client card at all (`isExecutor` gate at `:151`).

Suggested fix: Map `statusLabel` → token colour; show the client `CounterpartCard` to any proxy (`ownerId` is already in the payload); add the disabled bar and "Aguardando um Proxy" row.

Confidence: high

### [P3] Dead code / dead dependency: `ACTIVE_TASK_STATUSES`, `@react-native-community/datetimepicker`

File: `src/apis/tasks/tasks-api-types.ts:21-26`; `package.json` (`"@react-native-community/datetimepicker": "9.1.0"`), `app.json` plugin entry

Evidence: `grep -rn ACTIVE_TASK_STATUSES app src` → only the definition; `grep -rn "DateTimePicker\|datetimepicker" app src` → nothing.

Why it matters: The native date picker module is compiled into both binaries and listed as a config plugin for a feature that does not exist (SPEC 8.8 date/time were dropped because the backend has no field). The constant invites a filter the backend already applies.

Suggested fix: Remove both, or implement the scheduled date end-to-end (needs a backend column first — see Questions).

Confidence: high

### [P3] Location permission is requested on Proxy Home mount, with a purpose string written for the client flow

File: `src/feature/tasks/hooks/useDeviceLocation.ts:26-31`; `src/feature/home/components/ProxyHome.tsx:61`; `app.json` expo-location plugin

Evidence:
```ts
useEffect(() => { ... const perm = await Location.requestForegroundPermissionsAsync() ... }, [])
```
```json
"locationWhenInUsePermission": "Usamos sua localização pra preencher o endereço da tarefa automaticamente."
```

Why it matters: A proxy's first screen after login is a system permission dialog that explains a different feature ("preencher o endereço da tarefa"). App Review guideline 5.1.1 asks the purpose string to match the use; the `locationAlwaysAndWhenInUsePermission` key is also set although only foreground access is ever requested.

Suggested fix: Purpose string: "Usamos sua localização para mostrar a distância até as tarefas e preencher endereços."; request lazily (first time distance is needed, or behind an inline "Mostrar distância" affordance); drop the Always key.

Confidence: medium (store-review outcome is not deterministic)

### [P3] Action bars are `position: 'absolute'`, contradicting CLAUDE.md's "never sticky/fixed outside the scroll"

File: `app/(app)/tasks/[id]/index.tsx:290-302,360-372,65,129`

Evidence:
```ts
position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'white', borderTopWidth: 1,
```
```ts
const actionBarPad = clientActions?.contest ? 190 : 140
```

Why it matters: Either the rule or the screen is wrong; the hard-coded 140/190 px padding is a maintenance trap (breaks on font scaling / a third button). Flagged as doc-vs-code disagreement, not a bug.

Suggested fix: Decide; if the sticky bar stays, update CLAUDE.md and measure the bar with `onLayout` instead of constants.

Confidence: high

### [P3] Rating is mandatory in the UI while the API/SPEC make it optional

File: `src/feature/tasks/components/ValidateTaskSheet.tsx:100,268`

Evidence:
```ts
if (validate.isPending || rating <= 0) return
...
disabled={rating <= 0}
```

Why it matters: A client who just wants to release payment is forced to rate (and a rushed 5-star inflates proxy ratings). SPEC 8.9: "estrelas 1-5 + comentário opcional"; backend `rating?: optional`. Product call — see Questions.

Suggested fix: Allow validating with `rating === 0` (omit from payload) and show a softer "Avalie para ajudar a comunidade" prompt.

Confidence: high

### [P3] Copy drift vs SPEC and platform-specific strings

File: `app/(app)/tasks/[id]/finish.tsx:46-49,65-68,91`; `src/feature/tasks/components/CreateTaskStep2.tsx:58`; `app/(app)/tasks/[id]/index.tsx:109`; `src/common/utils/format.ts:33`

Evidence:
```ts
'Habilite o acesso às fotos nas configurações do seu iPhone.'   // also shown on Android
toast.success('Comprovante enviado. Aguardando validação.')        // SPEC: 'Enviado! Aguardando validação do cliente.'
router.dismissTo('/home')                                         // SPEC: router.replace('/tasks/' + id)
toast.success('Tarefa aceita! Bom trabalho.')                      // SPEC: 'Tarefa aceita! Boa execução.'
return dateTimeFormatter.format(d).replace('.', '')                // yields "10 de nov, 14:32"; SPEC "24 abr, 14:30"
```

Why it matters: Minor, but the "iPhone" string is wrong on Android and `Alert.alert` bypasses the app's `modal` system. Navigation after publish lands on Home instead of the new task's detail, so the client never sees the "Disponível" state they just created unless they scroll.

Suggested fix: Platform-neutral copy via `modal.error`; align toasts with SPEC or update SPEC; `router.replace({ pathname: '/tasks/[id]', params: { id } })` after create.

Confidence: high

### [P3] Proxy search filters only the pages already loaded; `{count} ativas` counts filtered items

File: `src/feature/home/components/ProxyHome.tsx:63-72,125,418`

Evidence:
```ts
const flat = data?.pages.flat() ?? []
const q = search.trim().toLowerCase()
if (!q) return flat
return flat.filter((t) => t.title.toLowerCase().includes(q) || t.locationAddress.toLowerCase().includes(q))
```

Why it matters: With >10 tasks, a search for something on page 3 shows "Nenhum resultado" until the user scrolls past the matches that are hidden by the filter (and `onEndReached` may never fire with a short filtered list). Accent-insensitive matching is also missing ("sao" ≠ "são").

Suggested fix: Either a backend `q=` param, or when `search` is non-empty eagerly `fetchNextPage()` until `hasNextPage` is false (bounded), and normalise with `NFD` strip.

Confidence: high

### [P3] Card query failure is rendered as "no card"

File: `src/feature/tasks/components/CreateTaskStep2.tsx:33,153`

Evidence:
```ts
const { data: card } = useCardQuery()
...
{card ? <SavedCardRow card={card} /> : <AddCardRow onPress={() => setSheetOpen(true)} />}
```

Why it matters: A 500/timeout on `/card/fetch` shows "Adicionar cartão"; the user re-adds a card they already have (backend `createUserSource` would then attach a second PM, but `Cards` keeps one row). Low frequency.

Suggested fix: Read `isPending`/`isError` from `useCardQuery` and render a skeleton / retry row.

Confidence: high

---

## 4. Gaps vs MVP

| SPEC | Gap | Status |
| --- | --- | --- |
| 7.3 / 8.9 / 9.1 | 3DS: `confirmPayment` + poll `payment.status` | Not implemented; `requires_action` treated as success (Finding 3.1). The SPEC design itself needs revisiting (challenge belongs to the client, not the device that triggers it). |
| 8.6 | Error toast when `/tasks/active` fails; header icons (histórico, notificações); "Ver todas" link | Error path missing; no header icons; no "Ver todas". |
| 8.7 | Pull-to-refresh / infinite scroll | Infinite scroll yes; pull-to-refresh no (Finding 3.4). |
| 8.8 | Date/Hora fields; city toggle; `router.replace('/tasks/'+id)`; breakdown semantics | Date/Hora absent (no backend field); city free text (Finding 3.3); nav to Home; breakdown overstates charge (Finding 3.2). |
| 8.8 | "Gap de UX" strategy (b) hard-coded state per city | Implemented differently: free state/CEP inputs + reverse geocode + geocode fallback (Findings 3.7, 3.8). |
| 8.9 | 5-step timeline; proxy disabled "Aguardando validação" bar; "Aguardando" people row | 4 steps; nothing for proxy on `verification_required`; no placeholder row. |
| 8.9 | "Contestar conclusão" → "Funcionalidade em breve." | Implemented exactly as the SPEC's MVP stub (`index.tsx:89`). Still a placeholder on a main-flow button. |
| 8.10 | Observações field; 10 MB local check; "Enviar e finalizar" copy | None of the three; backend has no field for observations. |
| 8.13 | History screen | Placeholder (Finding 3.5). |
| 2.2 | Status colours; `payout_failed` = "Falha no repasse" red | Not implemented (Findings 3.12, 3.20). |
| 2.7 | Haptics on primary actions; Reanimated entrance animations | No `expo-haptics` in `package.json`; no entrance animations in this slice. |
| 2.8 | Every failed request → toast | Mix of `modal.error`, inline text and silent empty states; homes silent. |
| 3.1 | Session refresh for stale claims | Only via Stripe onboarding; see Finding 3.10. |

Placeholders / "em breve" strings left on main flows: `app/(app)/(tabs)/history.tsx:11`, `app/(app)/tasks/[id]/index.tsx:89` (Contestar), and outside this slice `app/(app)/(tabs)/profile.tsx:36`.

---

## 5. Test coverage

**App (`proxy-app`)**: there are **zero** test files (`find . -name "*.test.*" -o -name "*.spec.*" -o -name "__tests__"` outside `node_modules` → nothing). No unit tests for `canCancelTask`, `parseBRLToNumber`/`maskBRL`, `formatBRL`, `formatDateTime`, `haversineKm`/`formatDistance`, `normalizeStateAbbr`, `clientActionsFor`, `mapToStep`, `getNextPageParam`; no component tests; no e2e. Everything in §3 was verified by reading, not by execution.

**Backend (`proxy-api`) e2e covering this slice's contracts** (names from `test/tasks/*.e2e-spec.ts`; could not run — Docker was down):
- `create-task`: auth, creates for user, counter increments, invalid schema. **Not covered**: task row persisted when card check fails (service order), `offeredPrice` minimum, non-CLIENT creating.
- `start-task`: auth, 404, own task, non-proxy, `stripeAccountReady` false, happy path, `requires_action` with `client_secret`. **Not covered**: what the task/mapping look like after `requires_action` (they are already `in_progress`), race of two proxies starting the same task.
- `finish-task`: auth, 404, non-executor, **"marks the task as verification_required without a proof file"** — the only happy path asserts the *no-file* case; the multipart file path, 10 MB limit and MIME filter are untested.
- `validate-task`: auth, 404, non-owner, happy path, 409 not ready, rating recorded, rating range. **Not covered**: validating while `payment.status !== 'succeeded'` (Finding 3.1), comment > 500.
- `cancel-task`: auth, non-owner, >1 h, refund within grace, available without refund, in_progress without payment record, terminal. Good coverage of the 1 h rule the app mirrors.
- `fetch-tasks`: auth, missing city, empty, city match. **Not covered**: case-insensitivity / accent (Finding 3.3), pagination boundaries the app relies on (`length === 10` ⇒ next page).
- `fetch-active-tasks`, `fetch-task-by-id`: good; `fetch-task-by-id` covers CLIENT 404 and PROXY visibility that the app relies on; `payment` embedded covered.
- `fetch-task-proof`: **no e2e file** (`test/tasks/` has none) — the authenticated image route the detail screen depends on is untested end-to-end.

Tests that assert something misleading for the app: `finish-task` "without a proof file" passes with `file: null`, so the backend accepts a finish with no photo; the app always sends one, but a proxy could bypass it with curl. Not an app bug, worth noting for F-backend.

---

## 6. Questions for the owner

1. **Where should 3DS be completed?** The PaymentIntent is on the *client's* card but `/tasks/start` is triggered from the *proxy's* device. `confirmPayment(clientSecret)` on the proxy's phone presents the cardholder challenge to the wrong person. Options: (a) confirm/authorise at creation time while the client is present (manual-capture PI, capture at `start`), (b) `off_session: true` on the PI so Stripe uses the SCA exemption for saved cards and treat `requires_action` as a hard failure, (c) push the client a "Confirme seu pagamento" deep link. This decides Finding 3.1's fix.
2. **Who pays the fees?** Backend deducts 20% + Stripe from the proxy and charges the client exactly `offeredPrice`; SPEC 8.8 and `PriceBreakdown` say the client pays them on top. Which model is the product?
3. **Served cities**: is the marketplace SP/RJ/BH-only for 1.0? If yes, the create form should be a picker and the API should reject other cities; if no, the proxy feed needs a different filter (geo radius, city column).
4. **Scheduled date/time**: SPEC 8.8 lists it, the backend has no column, the picker library is installed. Drop from SPEC or add `scheduledAt` to `Tasks`?
5. **Rating mandatory or optional** when validating?
6. **History data source**: `tasksCompleted` returns `status: 'completed'` only. Should `payout_failed` appear under "Concluídas" for the proxy (it is their money problem) — and should the backend return it?
7. **Sticky action bar vs CLAUDE.md rule** — which one is current?
