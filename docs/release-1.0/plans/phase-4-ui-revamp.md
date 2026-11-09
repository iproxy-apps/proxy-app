# Phase 4 — UI revamp + dark/light mode (brief, not a step plan)

> Design work is iterative with the owner and their partner, so this phase is a brief plus a
> fixed implementation order. Run it only after Phase 3 is `done` (flows correct and tested), so the
> restyle never has to guess what a screen does. Update `../STATUS.md` per sub-step.

**Goal:** a visual identity the partner is happy with, applied to every screen, in light and dark
mode, without changing behaviour or copy that Phase 3 fixed.

**Why now and not earlier:** the partner is unhappy with the current look; the audit found the
current design system is thin (raw HSL in components, 4-step timeline, template splash) but the
flows were wrong first. Restyling broken flows twice is the expensive path.

## Inputs to collect before the design session (owner)

1. Partner feedback, written: what they dislike (3–5 concrete screens or feelings), what they like
   elsewhere (3 apps, with screenshots), and the one word they want the app to feel like.
2. The Lovable prototype export (`~/Downloads/proxy-prototype` on the MacBook). Copy it to
   `proxy-app/design/reference/prototype/` (or a zip in the repo) so it survives machine switches.
3. Current tokens: `tailwind.config.js`, `src/common/theme/colors.ts`, splash gradient in
   `app/index.tsx`.
4. The copy voice in `SPEC.md §2.5` (informal-profissional, pt-BR).

## Design session (agent, with the `frontend-design` skill)

Invoke `Skill: frontend-design:frontend-design` and give it this brief verbatim, plus the inputs above:

> Product: Proxy, a Brazilian mobile marketplace where clients post everyday tasks with a price and
> local proxies accept, do them, upload a photo as proof and get paid after validation. Two
> audiences in one app: a client who wants something solved today, a proxy who wants to earn
> safely. Primary job of the design: make money and status feel trustworthy at a glance (what will I
> pay / receive, what state is my task in, what should I do next). Platform: Expo / React Native
> with NativeWind 4 (Tailwind subset; see CLAUDE.md gotchas), phone only, pt-BR, BRL. Constraints:
> keep the 6 task-status colours semantically distinct; one memorable element, everything else quiet;
> both light and dark schemes from the same semantic tokens; no raw hex in components. Current
> direction "premium-neutro" (graphite + mustard) is allowed to change; the previous green/lime was
> rejected as "agronegócio demais". Deliver: a token plan (4–6 named colours per scheme, type
> family/scale, radius/spacing scale, principles) and three static mock screens (proxy home with
> task list, task detail with action bar, client create-task step 2 with price breakdown) in two
> directions, each in light and dark.

Review the two directions with the partner; pick one; record the choice and the token plan in
`DECISIONS.md` (new row D30) and in `design/TOKENS.md`.

## Implementation order (one task each, with tests)

1. **Theme infrastructure.** `app.json` `userInterfaceStyle: "automatic"`; `tailwind.config.js`
   `darkMode: 'class'` is not available in NativeWind 4 the same way as web, so use NativeWind's
   `dark:` variants driven by `useColorScheme` + a `ThemeProvider` (`src/shared/providers/ThemeProvider.tsx`)
   exposing `scheme: 'light' | 'dark'` and `preference: 'system' | 'light' | 'dark'` persisted with
   `expo-sqlite/kv-store` or `@react-native-async-storage/async-storage` (not SecureStore). Replace
   `src/common/theme/colors.ts` constants with a `useThemeColors()` hook returning the semantic set
   (`bg`, `fg`, `card`, `muted`, `border`, `accent`, status colours) per scheme; keep the constants
   file exporting the light set for non-component code. Test: hook returns the dark set when
   preference is `dark`.
2. **Primitives.** `Button`, `FormInput`, `FormCheckbox`, `FormToggle`, `OtpInput`, `ScreenHeader`,
   `Avatar`, `AppModal`, `Toast`, tab bar, sheets (`AddCardSheet`, `ValidateTaskSheet`), `TaskCard`,
   `TaskCardSkeleton`, `PriceBreakdown`, `ReceiptCard`, `CounterpartCard`, `TaskTimeline`, empty
   states, `QueryErrorCard`. Snapshot per primitive per scheme.
3. **Screens by flow:** splash → auth (choose-profile, sign-up, sign-in, forgot) → client home +
   create → proxy home + detail + finish → wallet/cards → history/profile. Snapshot per screen per
   scheme; a11y check: text contrast ≥ 4.5:1 (use a script over the token table), `accessibilityLabel`
   on icon-only buttons.
4. **Splash/icon/store art** handed to Phase 5 (REL-01) from the chosen direction.
5. **Profile → "Aparência"** row: system / claro / escuro.

Done when: every screen renders in both schemes with no raw HSL/hex in `app/` or `src/feature`
(grep gate in CI: `grep -rn "hsl(\|#[0-9a-fA-F]\{6\}" app src/feature src/shared --include=*.tsx`
returns nothing outside the theme files), snapshots committed, partner sign-off recorded in STATUS.md.
