# Brief for phase-plan writers (2026-11-08)

You write ONE phase plan of the Proxy 1.0 release. Read, in this order, before writing anything:

1. `../START-HERE.md`, `../DECISIONS.md` (decisions are fixed; do not reopen them), `../PLAN.md`
   (your phase summary is there: implement exactly that scope, nothing more).
2. The canonical registers your phase draws from: `../audit/R-backend-review.md` §2 (BE-nn),
   `../audit/R-app-review.md` §2–3 (APP-nn), `../audit/R-release-contract-review.md` §2–4 (REL/CON).
3. The actual code for every file you will name. Open it. A plan that cites a line that does not
   exist, or a signature that is wrong, costs more than no plan. Both repos' `CLAUDE.md` describe
   conventions (module layout, 1 controller = 1 route, Zod inline in controllers, `AppException` +
   `errorDictionary`, path aliases, naming `T`-prefixed types in the app, pt-BR copy).

You are READ-ONLY on source code. You only write your plan file.

## Audience

An engineer or agent who has never seen this codebase, with the plan and the code in front of them.
They write idiomatic NestJS/Prisma/Zod or Expo/React Native/TanStack Query once they know the exact
interface and the exact test. They cannot know what you decided: which files, which names and
signatures, which values, which tests. Document those. Each task must be independently verifiable.

## Plan file format (Markdown, English)

```markdown
# Phase N — <name> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Update `../STATUS.md` when a task starts and finishes.

**Goal:** one sentence.
**Architecture:** 2–3 sentences.
**Tech stack:** exact libraries/versions involved.
**Spec:** ../PLAN.md §2 (Phase N), ../DECISIONS.md, SPEC.md sections touched.

## Global constraints
- repo-wide rules copied verbatim (no semicolons, pt-BR copy, `import type`, no repo-wide format, …)
- verification commands for the repo (from PLAN.md §3)

## Task index
| ID | Title | Depends on | Register IDs | Verification (one command / spec name) |
| P<N>-T01 | … | — | BE-04 | `npx jest src/...spec.ts` |
(every task; IDs `P<N>-T01…`; this table is copied into STATUS.md, keep it exact)

## Review focus
Five input classes or failure modes this phase implies but no task's tests exercise, most likely
to bite a real user first; each line names the input and the expected behaviour, and the task
that owns the test for it.

---

### Task P<N>-T01: <component>

**Files:**
- Create: `exact/path`
- Modify: `exact/path:line-range`
- Test: `exact/path`

**Interfaces:**
- Consumes: exact signatures from earlier tasks or existing code
- Produces: exact function names, parameter and return types later tasks rely on

- [ ] **Step 1: Write the failing test** — test name + assertions as code with the exact values.
- [ ] **Step 2: Run it, expect failure** — command + the expected failure text.
- [ ] **Step 3: Implement `signature` in `file`** — one line on approach; a code block only for an
      algorithm the signature and test do not determine, or exact copy the spec fixes.
- [ ] **Step 4: Run it, expect pass** — command + expected output.
- [ ] **Step 5: Verify the repo gate** — `npx tsc --noEmit` etc. as relevant.
- [ ] **Step 6: Mark done in ../STATUS.md; commit message** `fix(tasks): P1-T03 CAS transitions`
```

## Right-sizing

A task is the smallest unit with its own test cycle: fold scaffolding/config/docs into the task that
needs them; split only where a reviewer could reject one half and approve the other. Aim for 10–25
tasks per phase. Prefer small focused files; follow the existing module pattern. DRY, YAGNI, TDD.

## What a step contains

A test step: the test's name and assertions as code with the exact values (error codes, HTTP
statuses, centavos, field names). A code step: exact signature (name, params, return type), the
file, the pinned values; the implementer writes the body. A verification step: the command and the
output that means pass. A reference to another task: use its Interfaces block, do not repeat code.
No "TBD", "handle edge cases", "add validation": decide it.

## Migrations and contracts

Backend tasks that change the Prisma schema state the migration name
(`npx prisma migrate dev --name <snake_case>`), the SQL side effects (backfills, partial indexes as raw
SQL) and the generated client step. Tasks that change an HTTP response shape also list the app-side
type file that must follow and the Phase 3 task that consumes it (or say "app updated in Phase 3,
task P3-Txx: <title>").

## Self-review before you finish

1. Every register ID assigned to your phase in `../PLAN.md` appears in at least one task.
2. Every file:line you cite exists at that line (re-open the file).
3. Names/signatures are consistent across tasks.
4. Review-focus lines each have a test in a task.
5. The plan is a plan, not a transcript: signatures + tests, not full bodies.

Write the plan to the path given in your prompt. Reply with ≤ 8 lines: task count, any register ID
you could not place and why, and any decision in DECISIONS.md the code made impossible.
