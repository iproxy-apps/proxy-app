# Visual baseline — INDEX

Reference set for the visual freeze ([LOOP.md §8](../LOOP.md)): the owner-validated look of every
screen reachable without data, captured before any Phase 3 change.

- **Device:** A — iPhone 17 Pro `C29B497C-4443-4138-9DBA-DCFA5836C71E`, iOS 26.5 (simulator)
- **Capture date:** 2026-11-23
- **App source at capture:** `e7ed12e` (UI code unchanged by L-T05, which only adds flows and this set)
- **Build:** debug dev build (`com.anonymous.proxyapp`) on Metro, api from `proxy-api/scripts/dev-stack.sh up`
- **How to recapture:** `scripts/device.sh metro`, `../proxy-api/scripts/dev-stack.sh up`, then
  `scripts/device.sh test A .maestro/flows/baseline`; shots land in `.dev-stack/shots/<file>`, copy
  them here before `scripts/device.sh down`.
- Each flow seeds through `/__test/reset` + `/__test/seed-user` (`.maestro/subflows/seed-and-sign-in.yaml`),
  so the shell screens show a fresh user with no tasks, no card and no Stripe account.
- Every shot goes through `.maestro/subflows/capture.yaml`: it closes the dev-only LogBox warning banner
  when shown (`dismiss-logbox.yaml`) and asserts it is gone; the banner is not part of the app's look.
- Client and proxy shots of the same route differ by role; proxy files carry a `proxy-` prefix.

| file | route | state | how to reach (flow + step) |
|---|---|---|---|
| `index--empty.png` | `/` | empty (signed-out splash) | `baseline/auth.yaml`: `clearKeychain` + `launchApp { clearState }` |
| `auth-choose-profile--empty.png` | `/(auth)/choose-profile` | empty (nothing selected, CTA disabled) | `baseline/auth.yaml`: splash → tap "Criar conta" |
| `auth-choose-profile--selected.png` | `/(auth)/choose-profile` | selected ("Quero contratar serviços") | `baseline/auth.yaml`: tap "Quero contratar serviços" |
| `auth-sign-up--empty.png` | `/(auth)/sign-up?userType=CLIENT` | empty | `baseline/auth.yaml`: tap "Continuar" |
| `auth-sign-in--empty.png` | `/(auth)/sign-in` | empty | `baseline/auth.yaml`: "Voltar" ×2 → tap "Já tenho conta" |
| `auth-forgot-password--empty.png` | `/(auth)/forgot-password` | empty (email step; input autofocused, keyboard up) | `baseline/auth.yaml`: tap "Esqueci a senha" |
| `tabs-home--empty.png` | `/(app)/(tabs)/home` (CLIENT) | empty (no tasks) | `baseline/client-shell.yaml`: seed + sign in as `cliente@baseline.test` |
| `tabs-history--empty.png` | `/(app)/(tabs)/history` (CLIENT) | "Em construção" placeholder (`TabPlaceholder`), not an empty history list | `baseline/client-shell.yaml`: tap tab "Histórico" |
| `tabs-profile--loaded.png` | `/(app)/(tabs)/profile` (CLIENT) | loaded (card row "Adicionar") | `baseline/client-shell.yaml`: tap tab "Perfil" |
| `cards--empty.png` | `/(app)/cards` | empty (no saved card) | `baseline/client-shell.yaml`: tap row "Cartão" |
| `tasks-create--step1-empty.png` | `/(app)/tasks/create` | step 1, empty (top of the scroll) | `baseline/client-shell.yaml`: "Voltar" → tab "Início" → tap "Criar nova tarefa" |
| `proxy-tabs-home--empty.png` | `/(app)/(tabs)/home` (PROXY) | empty (no tasks to accept) | `baseline/proxy-shell.yaml`: seed + sign in as `proxy@baseline.test` (`READY=0`) |
| `proxy-tabs-wallet--not-onboarded.png` | `/(app)/(tabs)/wallet` (PROXY) | not onboarded ("Configurar recebimento") | `baseline/proxy-shell.yaml`: tap tab "Carteira" |
| `proxy-tabs-history--empty.png` | `/(app)/(tabs)/history` (PROXY) | "Em construção" placeholder (`TabPlaceholder`), not an empty history list | `baseline/proxy-shell.yaml`: tap tab "Histórico" |
| `proxy-tabs-profile--loaded.png` | `/(app)/(tabs)/profile` (PROXY) | loaded | `baseline/proxy-shell.yaml`: tap tab "Perfil" |

## Known deviations at capture

- `auth-choose-profile--empty` / `--selected`: the option cards render with no background and no
  border, although `app/(auth)/choose-profile.tsx` sets `borderWidth`/`borderColor`/`backgroundColor`
  in the Pressable style function (observed on the SDK 57 / RN 0.86 build). Pre-existing; tracked for
  Phase 3 (P3-T09 touches this screen). The baseline records the screen as it renders today.

**Standing rule.** Before an app task changes a screen or state not listed here, the orchestrator
captures it first (same device, same naming) and adds the row; Phase 4 replaces this whole set.
