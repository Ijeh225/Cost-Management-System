# Isolated Manual Regression Completion - 2026-09-07

## Request

Establish a secure connection to the existing Railway test DB, verify it, and
run the six pending gate/invoice cases. Do not create another database or use
production. This completes the previous live acceptance's remaining coverage.

## Connection and Isolation

- Existing project 30166120-54e6-4f58-86ed-18ab396913f1; integration-test environment
  51a4f5a2-e7ae-443e-836f-095b2015f3cc; Postgres-2Wsy service
  ed1e8b3d-c2e2-4654-a11d-bc16fa858bd6.
- CLI 5.49.3 already authenticated. Used existing SSH identity and
  `railway connect Postgres-2Wsy --project <project> --environment <test-environment> --tunnel-only --port 54339`.
- Verified through SQL: cost_management_integration_test, 57 public tables,
  zero starting containers. Default railway database is not this named database;
  earlier UI's empty-table view did not mean test schema was absent.
- Credentials fetched for only that service/environment, held in process memory.
  No public TCP exposure, environment-variable mutation on Railway, DB creation,
  schema reset, production connection or persisted credential file.

## Tests and Cleanup

Installed Vitest command, from artifacts/api-server, with process-only
TEST_DATABASE_URL aimed at the verified DB and NODE_ENV=test:

```text
node node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts src/tests/sensitive-workflows.integration.test.ts -t "gate|persists the same per-container pricing rule" --reporter verbose
```

- Initial Corepack wrapper stalled before executing tests and was stopped.
- First executed run: 6 passed / 11 deliberately skipped, 58.36s, exit 0.
- Cleanup check identified 3 broadcast invoice notifications left by the six
  test fixtures. Adjusted test-only afterAll to delete notifications belonging
  to the newly created test branches. Verified and removed only IDs 16-18 from
  that first isolated run. Initial date guard rolled back without mutation;
  IDs/type/branch/messages confirmed before targeted removal.
- Final repeat: 6 passed / 11 skipped, 66.07s, exit 0. Final run uses ephemeral
  random JWT_SECRET instead of the local development fallback warning.
- API TypeScript check (`node node_modules/typescript/bin/tsc -p artifacts/api-server/tsconfig.json --noEmit`) and git diff whitespace check passed.
- Covers rejected gate writes without side effects, four concurrent gate pairs,
  prior notification preservation, authorization/branch restrictions, and invoice
  agreed-90/zero/unset pricing with two containers and 7.5% VAT.
- SQL post-check: zero containers, clients, invoices, users, branches, banks,
  schedules, overheads, workflow notifications and audit rows. Tests cleaned up.
- Closed the tunnel and its SSH child, verified port 54339 no longer listening.
  Existing isolated DB/volume retained, still private. No production writes.

## Outcome / Next Action

Both MANUAL-GATE-001 and MANUAL-INV-001 have live acceptance AND all six isolated
regressions passed. No outstanding test in this bounded task. Await next user
request; do not repeat previously completed live writes or full unrelated suite.
The eleven skipped cases retain earlier evidence, not a fresh pass claim.
Preserve live fixtures 28-31, client 9, invoices 12-13 and historic NGN500 evidence.

## Changes

Test fixture cleanup only; no application runtime/source behavior or PDF changes.
Updated Project State, Live Test Register and session index. Commit hash recorded
after commit creation and verified push.
