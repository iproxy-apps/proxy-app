# Audit brief — Proxy release 1.0 (2026-11-08)

Read this whole file before touching any source.

## What Proxy is

Personal side project of the repo owner. A mobile marketplace (Brazil, BRL, pt-BR copy) where
**CLIENTS** publish tasks with an offered price, and **PROXIES** (service providers) accept, execute,
upload a photo as proof, and get paid through Stripe Connect after the client validates.

Two repos, siblings on disk:

- Backend: `/Users/leandromartins/Documents/proxy-api` — NestJS 11, Prisma 7 + PostgreSQL, Zod 4,
  JWT RS256, Stripe (PaymentIntents + Connect transfers + webhooks), AWS SES/SNS. Read its
  `CLAUDE.md` first (architecture, route map, Stripe flows, testing layers).
- Mobile app: `/Users/leandromartins/Documents/proxy-app` — Expo (package.json says SDK 57 / RN 0.86 /
  React 19.2 / TS 6 even though CLAUDE.md still says SDK 54), Expo Router, NativeWind 4, Zustand,
  TanStack Query, axios, `@stripe/stripe-react-native`. Read its `CLAUDE.md` (architecture + layering
  rules) and `SPEC.md` (1073 lines: product spec, per-screen contract, API reference) first.

Task lifecycle written by the backend: `available → in_progress → verification_required → completed`,
plus `canceled` and `payout_failed`. Enum values `accepted` / `on_the_way` exist but nothing writes them
(SPEC "Option A": UI ignores them).

## Facts already established tonight (do not re-derive)

- Backend unit tests: `npx jest` → 37 suites / 153 tests pass (after `npx prisma generate`).
- Backend `npx tsc --noEmit` → ONE error: `test/factories/user.factory.ts(64,9)` missing
  `stripeAccountReady` in the JWT payload literal (factory drifted from the JWT schema).
- App `npx tsc --noEmit` and `npx eslint .` → clean.
- `npx expo-doctor` on the app → 2 failures: `newArchEnabled` is not an allowed property in app.json
  for this SDK; 8 expo packages are patch-level behind (`expo`, `expo-router`, `expo-location`, ...).
- Docker Desktop was DOWN at session start (being started now); Stripe CLI is not installed on this
  machine. Testcontainers-based e2e cannot run without Docker.
- No graphify graph exists; ignore any mention of it.

## Your job

A **line-by-line** read of every file in your slice. Not a skim: open each file in full, follow every
branch, and reason about what happens with real data (money in BRL, Stripe states, concurrent
requests, Brazilian cards with 3DS, slow networks). You are the first pass of a two-pass audit; a
second auditor will later try to disprove every claim you make against the code, so every finding
must cite `path:line` and quote the exact code.

You are READ-ONLY on source code. Do not edit, format, or commit anything in either repo. Do not start
dev servers, Expo, `stripe listen`, or Docker. You MAY run `npx tsc --noEmit`, `npx jest` (unit) in
`proxy-api`, and `npx tsc --noEmit` / `npx eslint .` in `proxy-app`. Do not run the e2e suite unless
your slice says so.

## Report format (write with the Write tool, Markdown, in English)

Write to the path given in your prompt. Sections, in this order:

1. **Scope** — the exact file list you read, with line counts. If you skipped anything, say so.
2. **How it works** — a prose walkthrough of the slice as it actually behaves (not as docs claim):
   data flow, state transitions, side effects, external calls. Flag every place where code and
   `CLAUDE.md` / `SPEC.md` disagree.
3. **Findings** — one entry per issue, ordered by severity:
   - `P0` blocks release: money loss/double charge, security hole, data corruption, crash on a main
     path, store rejection.
   - `P1` user-visible bug or missing MVP behaviour on a main flow.
   - `P2` robustness/consistency problem (race, missing validation, dead code, silent failure).
   - `P3` nit / style / docs drift.
   Each entry: `### [Pn] short title` then `File: path:line`, `Evidence:` (quoted code, ≤ 10 lines),
   `Why it matters:`, `Suggested fix:` (concrete, ≤ 5 lines), `Confidence: high|medium|low`.
4. **Gaps vs MVP** — what the SPEC/MVP promises that this slice does not implement, or implements
   partially. Cite SPEC section numbers.
5. **Test coverage** — which behaviours in your slice are covered by unit/e2e tests, which are not,
   and tests that exist but assert the wrong thing.
6. **Questions for the owner** — only things that truly need a product decision.

Be concrete and skeptical. Prefer 15 verified findings over 40 guesses. If something looks wrong but
you could not confirm, keep it with `Confidence: low` and say what would confirm it.
