# START HERE — Proxy release 1.0 workstream

You are a new session (any model, any machine). This folder is the single source of truth for the
road to 1.0. It lives in git so it survives sessions, machine switches and context compaction. The
same text is mirrored into ai-memory when that tool is available, but **git is canonical**.

## Read in this order (10 minutes)

1. `STATUS.md` — the live board: what is done, in progress, next. Trust it over anything else.
2. `DECISIONS.md` — product/tech decisions with their status (`SETTLED`, `DEFAULT (confirm)`,
   `OWNER INPUT NEEDED`). Never silently contradict one; change it there first.
3. `PLAN.md` — the master plan: phases, order, done-when, working agreement (§4).
4. The phase plan you are executing, in `plans/`.
5. Only if you need the evidence behind a task: `audit/R-*.md` (second-pass registers with IDs
   `BE-nn`, `APP-nn`, `REL-nn`, `CON-nn`) and then the first-pass `audit/A*.md`, `F*.md`, `X1*.md`.

## Repos

- Backend: `/Users/leandromartins/Documents/proxy-api` (NestJS + Prisma + Stripe). `CLAUDE.md` there.
- App: `/Users/leandromartins/Documents/proxy-app` (Expo). `CLAUDE.md` + `SPEC.md` here.

## Machine setup checks (run before any backend task)

```bash
cd /Users/leandromartins/Documents/proxy-api && npx prisma generate && npx tsc --noEmit && npx jest
docker info >/dev/null 2>&1 && echo docker-up || echo docker-down   # e2e needs Docker
```

The e2e run rewrites `test/.env.test` until Phase 0 untracks it; `git checkout -- test/.env.test`
after running it.

## Rules that override everything (from the owner's CLAUDE.md)

- The global "never start the dev server" rule is **lifted for the two Proxy repos** (D28, settled
  2026-11-23): Claude may run Expo/`expo run:ios` on the simulator, the backend, Docker, the Stripe CLI
  and Maestro. Never start or touch anything in other repositories; check ports before binding; stop
  only processes Claude started.
- Never run repo-wide format/fix scripts; prettier only on new files.
- Commit policy (D30): one commit per finished task on branch `release-1.0`, message `feat|fix|test|chore(<area>): <task id> <title>`, no Claude attribution. Never push, never touch `main`; the owner owns pushes and merges.
- All user-facing copy in pt-BR; work-comms output in English.
- When a task is finished, say so and tell the owner exactly which flow to test manually.

## Session protocol

- Follow `LOOP.md` §11 (resume from `STATUS.md` `## Now`, run §5.2 iterations, §5.3 at phase boundaries).
