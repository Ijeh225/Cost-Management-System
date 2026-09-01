# Project Continuity Rules

This repository uses [docs/PROJECT_STATE.md](docs/PROJECT_STATE.md) as the
single source of truth for project continuity. Updating it is mandatory for
every project change; do not wait for the user to ask or remind you.

Before making a change:

1. Read `docs/PROJECT_STATE.md` and `git status --short`.
2. Confirm the requested work matches the active objective or a listed next
   step. If it does not, record the new objective before implementation.
3. Preserve existing checkpoints, user changes, branch boundaries, and audit
   data. Do not replace them with a shortcut.

Before committing or ending a work session:

1. Update `docs/PROJECT_STATE.md` with every feature, fix, issue, test result,
   deployment result, decision, blocker, and next action introduced or
   discovered in the session. Record the commit hash once it exists.
2. Do not claim a live test, deployment, or financial reconciliation passed
   unless it was actually observed in the live system.
3. Include the state-file update in the same commit as the work it describes.

Do not ask whether this record should be updated: it is a standing project
command. Keep the current-state sections concise, and append important completed
milestones so earlier work remains traceable. Historical specifications and
roadmaps remain in `docs/`, but `PROJECT_STATE.md` is the authoritative handoff
record.
