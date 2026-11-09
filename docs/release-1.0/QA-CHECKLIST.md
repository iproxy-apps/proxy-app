# Phase 6 — QA and submission checklist

Run after Phases 0–5 are `done`. Tick in place; copy failures into `STATUS.md` as tasks.

## 6.1 Stripe test-mode verifications (agent, backend against Stripe test keys)

Use the Stripe CLI (`brew install stripe/stripe-cli/stripe`, `stripe login`) and a test account in
Brazil. Record each result (date, ids) under the item.

- [ ] SetupIntent card save with 3DS test card `4000 0027 6000 3184` completes on device and the PM is
      attached with `setup_future_usage`/off-session usage; `GET /card/fetch` returns it.
- [ ] `/tasks/start` with that card charges off-session (`confirm: true, off_session: true`) and
      returns `succeeded`; with `4000 0000 0000 0341` (attach ok, charge fails) returns 402
      `PAYMENT_FAILED` and the task stays `available` with no mapping and no payment row.
- [ ] `/tasks/validate` creates a transfer with `source_transaction` while the charge is still pending
      in the platform balance (check `stripe balance_transactions list` and the transfer object).
- [ ] Double validate (two parallel requests) → one transfer (`stripe transfers list --limit 3`).
- [ ] Cancel after start → full refund of `chargedAmount`; cancel with payment `pending` → PI cancelled.
- [ ] Connect onboarding with BR test data (CPF `000.000.000-00` style test values per Stripe docs,
      test bank) → `account.updated` arrives on the **Connect** endpoint and `stripeAccountReady`
      flips; `GET /auth/me` reflects it.
- [ ] `stripe trigger payout.failed` → `Users.payoutIssue = true`, no transfer reversal, wallet
      unchanged; Wallet screen shows the banner.
- [ ] `stripe trigger charge.dispute.created` on a completed task → payment `disputed`, `disputeId`
      stored, wallet debited once even when the event is delivered twice.
- [ ] Webhook signature with the wrong secret → 400; event replay → 200 and no double side effect.
- [ ] Auto-release job: task in `verification_required` with `completedAt` 8 days ago is validated by
      the job run (`npm run jobs:auto-release` or the scheduled trigger).

## 6.2 Backend deployment smoke (agent)

- [ ] `curl -s https://<API_ORIGIN>/health` → `{"status":"ok"}`; logs show `trust proxy` tracker IP
      is the client's, not the proxy's.
- [ ] `prisma migrate deploy` ran on boot (no pending migrations: `npx prisma migrate status`).
- [ ] Proof upload from the app survives a redeploy (`GET /tasks/:id/proof` still 200).
- [ ] Password-reset email arrives from `noreply@<domain>` to a non-verified recipient (SES out of
      sandbox), DKIM pass in the headers.
- [ ] Throttle: 6th `POST /auth/session` from one IP → 429 with pt-BR message; 6th `GET /tasks/active`
      → 200.

## 6.3 Two-device script (owner or agent if D28 allows simulators)

Devices: A = CLIENT, B = PROXY. Backend on test keys. Expected results in parentheses.

1. A: sign up as CLIENT (toast "Conta criada"), add card `4242 4242 4242 4242` (SetupIntent sheet,
   "Cartão adicionado"), create task R$ 50 in São Paulo (Step 2 shows charged total from the
   price-preview, breakdown sums), task detail shows "Disponível".
2. B: sign up as PROXY, Wallet → "Configurar recebimento" → complete test onboarding → returns to app
   via `proxyapp://wallet` → status becomes "Conta pronta" after refresh (not before).
3. B: Home lists A's task in São Paulo with distance (location granted) and without distance when
   denied; pull-to-refresh works; search filters.
4. B: open task, "Aceitar e iniciar" → "Tarefa aceita"; A (backgrounded, then foregrounded) sees
   "Em andamento" within 10 s without manual refresh; A's phone number is visible to B only now.
5. A: cancel within 1 h → "Tarefa cancelada", refund issued; repeat 1 with a new task.
6. B: finish with camera photo (HEIC on iPhone) → upload completes on slow network (airplane-mode
   toggle mid-upload: retry reconciles instead of 404) → "Aguardando validação".
7. A: sees proof image, validates with rating 4 + comment → "Pagamento liberado"; receipt lines sum;
   B's Wallet total updates on focus; History shows the task under "Concluídas" for both.
8. A: validate with no rating → allowed (D15).
9. A: Profile → Termos e Privacidade opens the hosted page; Excluir conta with an `available` task
   → task auto-cancelled and account deleted; sign-in afterwards → "Credenciais inválidas".
10. Both: force-quit and reopen after token expiry simulation (set `expiresIn: '1m'` on staging) →
    sent to sign-in cleanly, no blank screen.
11. Deep link `proxyapp://tasks/<id>` while signed out → sign-in → lands on the task.
12. Dark mode on both devices: no unreadable text, status colours distinguishable.

## 6.4 Store submission

- [ ] `eas build -p ios --profile production` + `eas submit -p ios`; TestFlight external group with
      the demo accounts; review notes pasted (Phase 5 text).
- [ ] `eas build -p android --profile production` (AAB) + `eas submit -p android --track internal`;
      promote to closed testing if D26 requires; 12 testers opted-in for 14 days; apply for
      production.
- [ ] App Store Connect: App Privacy, age rating, screenshots 6.7"/6.1", support URL, privacy URL,
      copyright, category (Lifestyle or Business), price free.
- [ ] Play Console: Data safety, content rating, target audience, ads = no, financial features = no,
      account-deletion URL, privacy URL.
- [ ] After approval: switch backend to live keys, create live webhook endpoints (platform +
      Connect), `PROD_CALLBACK_URL` live, re-run 6.1 items 1, 2, 3, 6 with a real card and a real
      bank account on a test task of R$ 10, then release.
