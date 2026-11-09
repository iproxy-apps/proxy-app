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

- Never start the dev server / Expo / app (`npm run dev`, `npm start`, `expo run:*`) unless the owner
  explicitly lifts the rule for that session (see `DECISIONS.md` D28).
- Never run repo-wide format/fix scripts; prettier only on new files.
- Leave work as uncommitted changes unless asked to commit; the owner owns git.
- All user-facing copy in pt-BR; work-comms output in English.
- When a task is finished, say so and tell the owner exactly which flow to test manually.

## Session protocol

- Start: read the files above; pick the first `todo` task whose dependencies are `done`; set it
  `in_progress` in `STATUS.md`.
- Work: follow the task's steps (test first, then code, then verify). Cite task IDs in commits.
- End: update `STATUS.md` (done / half-done with file list / next), and if ai-memory is available
  write a handoff (`ai-memory-handoff` skill) pointing to this folder and the next task.
