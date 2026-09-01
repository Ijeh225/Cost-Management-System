# Project Continuity Rules

This repository uses [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) as the
single source of truth for project continuity.

Before making a change:

1. Read `docs/PROJECT_STATE.md` and `git status --short`.
2. Confirm the requested work matches the active objective or a listed next
   step. If it does not, record the new objective before implementation.
3. Preserve existing checkpoints, user changes, branch boundaries, and audit
   data. Do not replace them with a shortcut.

Before committing or ending a work session:

1. Update `docs/PROJECT_STATE.md` with what changed, what was verified, the
   next exact action, and anything blocked.
2. Do not claim a live test, deployment, or financial reconciliation passed
   unless it was actually observed in the live system.
3. Include the state-file update in the same commit as the work it describes.

Keep this file short and current. Historical specifications and roadmaps remain
in `docs/`, but `PROJECT_STATE.md` is the authoritative handoff record.
