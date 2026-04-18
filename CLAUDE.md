# Proxy App

Mobile app (React Native / Expo) for the Proxy marketplace — a task/service marketplace where CLIENTS create tasks and PROXIES execute them. Talks to the [proxy-api](../proxy-api) NestJS backend.

## Stack

- **Runtime**: Expo SDK 54 (React Native 0.81, React 19)
- **Language**: TypeScript (strict)
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

## Design system

Derived from the Lovable web prototype (see `LOVABLE_PROMPT.md`). Defined in [tailwind.config.js](./tailwind.config.js).

- **Primary**: deep green `hsl(158, 55%, 14%)`
- **Accent**: lime `hsl(78, 75%, 62%)`
- **Background**: warm off-white `hsl(60, 20%, 97%)`
- **Status colors** (task lifecycle): `status-available` (grey), `status-accepted` (blue), `status-onway` (purple), `status-progress` (yellow), `status-validating` (orange), `status-done` (green), `status-cancelled` (red)

Status enum mirrors the backend `TaskStatus` in [proxy-api/prisma/schema.prisma](../proxy-api/prisma/schema.prisma#L21-L29): `available → accepted → on_the_way → in_progress → verification_required → completed | canceled`.

## Backend integration

All endpoints live under the proxy-api base URL. Auth uses JWT RS256 Bearer tokens. Currency is BRL. Error messages come back in Portuguese. See [proxy-api/CLAUDE.md](../proxy-api/CLAUDE.md) for the full API surface.

## Conventions

- **Styling**: prefer NativeWind `className` over `StyleSheet`. Use design tokens from `tailwind.config.js`; avoid raw hex values in components.
- **Copy**: all user-facing text in **Portuguese (Brasil)**.
- **Money formatting**: `R$ 1.234,56` (BRL, Brazilian locale).
- **File layout** (to evolve):
  - `src/screens/` — one folder per screen
  - `src/components/` — reusable components
  - `src/lib/` — helpers (api client, formatters)
  - `src/types/` — shared types

## Prototype reference

The visual/UX reference lives in the Lovable export at `~/Downloads/proxy-prototype`. The output is web (React + Vite + shadcn/ui), so treat it as a design reference, not code to port directly.
