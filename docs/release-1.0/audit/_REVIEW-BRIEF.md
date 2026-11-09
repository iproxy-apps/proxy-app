# Second-pass review brief (2026-11-08)

You are a reviewer in the second pass of a two-pass audit. First read `_BRIEF.md` in this folder
(project context, rules). Then read the first-pass reports assigned to you in your prompt.

Your job is adversarial verification, not summarising:

1. For EVERY finding (`### [Pn] ...`) in your assigned reports, open the cited file(s) at the cited
   lines and decide: `CONFIRMED` (code does what the finding says), `REFUTED` (it does not; say why
   with your own `path:line` evidence), `PARTIAL` (true but overstated/understated; restate it), or
   `UNVERIFIABLE` (needs a runtime/Stripe test; say which). Re-grade the severity if you disagree,
   with one line of reasoning. Be as hard on the first pass as it was on the code.
2. Dedupe across reports: several slices found the same root cause (3DS dead end, start-task ordering,
   validate without payment check, Decimal-as-string JWT claims, stale session, no account deletion,
   fee-model contradiction, throttler scope...). Give each root cause ONE canonical ID and list which
   report findings collapse into it.
3. Look for what the first pass MISSED in the same files. Spend real effort here: at least read the
   main-path files of your area end-to-end once more with fresh eyes, thinking about: money, auth,
   concurrency, error paths, store review, and what happens on a real Brazilian phone with a flaky
   network.
4. Answer the owner questions the first pass raised where the code or docs actually settle them;
   leave only genuine product decisions open.

You are READ-ONLY on source. You may run `npx tsc --noEmit`, unit `npx jest` in `proxy-api`, and
`npx tsc --noEmit` / `npx eslint .` in `proxy-app`. Do not run e2e, dev servers, Expo or Docker.
Do not edit the first-pass reports; write your own review file.

## Output format (Markdown, English, written with the Write tool to the path in your prompt)

1. **Verdict table** — one row per first-pass finding: `report-id | original severity | title |
   verdict | final severity | note (≤ 1 line)`.
2. **Canonical findings register** — the deduped list after verification. For each:
   `ID` (e.g. `BE-01`, `APP-01`, `REL-01`, `CON-01`), `Severity`, `Title`, `Root cause` (2–4 lines),
   `Files` (path:line list), `Fix outline` (concrete, ≤ 6 lines, say which repo), `Test that proves
   it` (one line: which spec file, what it asserts), `Collapses` (first-pass IDs merged into it).
   Order by severity then by blast radius. This register is what the release plan will be built on,
   so it must be complete and precise.
3. **Missed by the first pass** — new findings in the same format.
4. **Settled questions** — owner questions you could answer from code/docs, with the answer.
5. **Open product decisions** — the ones only the owner can take, each with the options and your
   recommended default.
