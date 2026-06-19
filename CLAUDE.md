# Proxy App

Mobile app (React Native / Expo) for the Proxy marketplace — a task/service marketplace where CLIENTS create tasks and PROXIES execute them. Talks to the [proxy-api](../proxy-api) NestJS backend.

## Stack

- **Runtime**: Expo SDK 54 (React Native 0.81, React 19)
- **Language**: TypeScript (strict)
- **Routing**: Expo Router 6 (file-based, `app/` directory, typed routes enabled)
- **Styling**: NativeWind 4 (Tailwind CSS for React Native)
- **Formatting**: Prettier (no semicolons, single quotes, trailing commas)
- **Linting**: ESLint 9 with `eslint-config-expo` (flat config)

## Commands

```bash
npm start                # Expo dev server
npm run ios              # iOS simulator
npm run android          # Android emulator
npm run web              # Web preview
npm run lint             # ESLint
npm run lint:fix         # ESLint with auto-fix
npm run format           # Prettier
npm run type-check       # tsc --noEmit
```

## Environment variables

Defined in `.env` (gitignored) and documented in `.env.example`. Expo requires the `EXPO_PUBLIC_` prefix to expose vars to the runtime.

- `EXPO_PUBLIC_API_URL` — base URL of the proxy-api backend (e.g., `http://192.168.2.93:3333`)

Access from code via `process.env.EXPO_PUBLIC_API_URL`.

## Routing

Expo Router with file-based routing. Each file under [app/](./app) is a route; `_layout.tsx` wraps nested routes. The root [_layout.tsx](./app/_layout.tsx) imports `global.css` (Tailwind) and wraps everything in `SafeAreaProvider`. Typed routes are enabled (`app.json` → `experiments.typedRoutes`), so `<Link href="/...">` is autocompleted.

Route groups (folders wrapped in parens, e.g. `(auth)`) organize routes without adding a segment to the URL. Deep link scheme: `proxyapp://`.

## Design system

Direction: **premium-neutro** (Linear/Stripe/Notion vibe). Defined in [tailwind.config.js](./tailwind.config.js).

- **Primary**: graphite `hsl(220, 10%, 12%)`
- **Accent**: mustard yellow `hsl(45, 95%, 55%)`
- **Background**: warm off-white `hsl(40, 20%, 97%)`
- **Foreground**: graphite (same as primary)
- **Status colors** (task lifecycle): `status-available` (grey), `status-accepted` (blue), `status-onway` (purple), `status-progress` (yellow), `status-validating` (orange), `status-done` (green), `status-cancelled` (red)

Status enum mirrors the backend `TaskStatus` in [proxy-api/prisma/schema.prisma](../proxy-api/prisma/schema.prisma#L21-L29): `available → accepted → on_the_way → in_progress → verification_required → completed | canceled | payout_failed`. The states `accepted` and `on_the_way` are enum-only — no use-case writes to them; UI ignores them (see [SPEC.md §7.2](./SPEC.md)).

### NativeWind 4 gotchas

Some Tailwind utilities don't translate reliably to React Native `style` in this version. When layout misbehaves, **don't fight the framework** — drop to inline `style` for that property:

- `text-center` on `<Text>` → use `style={{ textAlign: 'center' }}`
- `self-start` on `<View>` in column-flex parent → use `style={{ alignSelf: 'flex-start' }}` or define `width`
- Nested `flex-1` + `justify-center` on tall mobile screens looks bad with little content — prefer top-aligned content + `<View style={{ flex: 1 }} />` spacer + bottom-anchored CTAs

Default: use `className` for colors, fonts, borders, simple spacing. Drop to inline `style` only when the result is visually wrong.

## Backend integration

All endpoints live under the proxy-api base URL. Auth uses JWT RS256 Bearer tokens. Currency is BRL. Error messages come back in Portuguese. See [proxy-api/CLAUDE.md](../proxy-api/CLAUDE.md) for the full API surface.

## Screen layout pattern

Every screen with a primary CTA follows this exact skeleton. CTAs always live **inside** the scroll, at the end, pushed down by a `flex: 1` spacer. **Never sticky/fixed outside the scroll** — that pattern was tested and explicitly rejected.

```tsx
<SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
  <ScreenHeader title="..." />
  <KeyboardAvoidingView style={{ flex: 1 }}> {/* only when the screen has form inputs */}
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        flexGrow: 1,           // critical: lets the spacer expand
        paddingHorizontal: 24,
        paddingBottom: 24,
      }}
    >
      {/* heading / form / cards — top-aligned */}
      <View>...</View>
      <View style={{ flex: 1 }} />   {/* absorbs leftover space */}
      <View style={{ marginTop: 24 }}>
        <Button>Continuar</Button>    {/* CTA at the end of the scroll */}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
</SafeAreaView>
```

Behavior:
- **Short content** → spacer expands, button sits at the bottom of the visible area.
- **Long content** → spacer collapses, button sits naturally after the last item (visible after scrolling to the end).

Reference: [app/index.tsx](./app/index.tsx), [app/(auth)/choose-profile.tsx](./app/(auth)/choose-profile.tsx), [app/(auth)/sign-up.tsx](./app/(auth)/sign-up.tsx).

## Conventions

- **Styling**: prefer NativeWind `className` over `StyleSheet`. Use design tokens from `tailwind.config.js`; avoid raw hex values in components.
- **Copy**: all user-facing text in **Portuguese (Brasil)**.
- **Money formatting**: `R$ 1.234,56` (BRL, Brazilian locale).
## Architecture

Layered structure mirroring our other projects (flex-v3-frontend, premium-frontend). Each layer has a single responsibility — don't mix:

```
app/                        # Expo Router routes ONLY — page-level glue + state.
                            # Any non-trivial component goes to src/feature/<domain>/components/.
src/
├── apis/                   # Backend domain layer: routes + entity types.
│   ├── api-client.ts       # axios instance + interceptors + extractErrorMessage
│   ├── apis.ts             # central export — `apis.auth.session(...)`, `apis.cards.fetch()`
│   ├── auth/
│   │   ├── auth-apis.ts        # route functions
│   │   └── auth-api-types.ts   # T-prefixed entity + payload types
│   └── cards/
│       ├── cards-apis.ts
│       └── cards-api-types.ts
│
├── store/                  # Zustand stores — one folder per domain.
│   ├── auth-store/
│   ├── card-store/
│   ├── modal-store/
│   └── toast-store/        # each has `<name>-store.ts` + `index.ts` re-export
│
├── feature/                # Feature modules — self-contained vertical slices.
│   ├── auth/hooks/         # useProxyAuth
│   ├── cards/components/   # CardPreview, CardSkeleton, EmptyState, AddCardSheet
│   ├── cards/utils/        # brand-display
│   └── profile/components/ # IdentityCard, MenuList (MenuRow + MenuListDivider)
│
├── shared/                 # Cross-feature UI primitives.
│   ├── components/         # Button, Logo, ScreenHeader, AppModal, Toast, TabPlaceholder
│   ├── components/form/    # FormInput, FormCheckbox, FormToggle, OtpInput
│   └── providers/          # SessionProvider
│
├── common/                 # App-wide constants + utils.
│   ├── theme/colors.ts     # ONE source of truth for color tokens
│   └── utils/              # masks.ts (phone/document masks)
│
└── lib/                    # Internal infra (small reusable wrappers).
    ├── modal.ts            # `modal.error()`, `modal.confirm()`, ...
    ├── toast.ts            # `toast.success()`, ...
    └── secure-store.ts     # expo-secure-store wrapper
```

**Layering rules**:
- `apis/` → owns all backend entity types. Stores and features **import** from here; never duplicate.
- `store/` → can import from `apis/` and `lib/`. Stores expose state + actions.
- `feature/<domain>/` → imports from `apis/`, `store/`, `shared/`, `common/`, `lib/`. Owns domain-specific UI + hooks. Never imported by `shared/` or `common/`.
- `shared/` → only imports from `common/`, `lib/`. No domain coupling.
- `common/` → leaf utilities. No imports from other layers.
- `lib/` → leaf infra. Only imports from other `lib/` and `common/`.
- `app/` (routes) → glue layer. Imports from anywhere; ideally thin (state + handlers + JSX delegating to `feature/*/components/`).

**Conventions**:
- **Path aliases**: `@/*` resolves to `src/*`. Always use `@/feature/cards/components/CardPreview` instead of `../../../src/feature/...`. Configured in `tsconfig.json` (TS) + `babel.config.js` via `babel-plugin-module-resolver` (runtime).
- **Type naming**: prefix backend entity types and payloads with `T` (e.g., `TCard`, `TSessionPayload`, `TCreateAccountPayload`). React component types and local interfaces (e.g., `MenuRowProps`, `CardState`) stay un-prefixed.
- **Type imports**: always `import type { ... }` for types (not `import { ... }`).
- **Files**: kebab-case for non-component files (`card-store.ts`, `brand-display.ts`); PascalCase for components (`CardPreview.tsx`, `MenuList.tsx`).
- **Color tokens**: import from `@/common/theme/colors`. Never declare local `const GRAPHITE = ...` blocks. Gradient stops unique to one component can stay inline.

## Prototype reference

The visual/UX reference lives in the Lovable export at `~/Downloads/proxy-prototype`. The output is web (React + Vite + shadcn/ui), so treat it as a design reference, not code to port directly.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- ALWAYS read graphify-out/GRAPH_REPORT.md before reading any source files, running grep/glob searches, or answering codebase questions. The graph is your primary map of the codebase.
- IF graphify-out/wiki/index.md EXISTS, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
