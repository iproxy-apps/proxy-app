# Task cards

A task card is the self-contained brief for one task of the loop (see `../LOOP.md` §5 and §6). It
is copied from `_TEMPLATE.md` and filled in with the task text and the contract rows it consumes.

Lifecycle:

- Written at the `card` step of the task, as `cards/<task id>.md`.
- Deleted in the same commit that marks the task `done` in `../STATUS.md`.
- Never edited by subagents: only the controller writes or deletes cards.
