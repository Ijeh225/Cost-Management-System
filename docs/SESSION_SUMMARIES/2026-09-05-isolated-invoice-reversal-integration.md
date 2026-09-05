# Session Summary: Isolated Invoice-Reversal Integration Test

**Date:** 2026-09-05

## Objective

Complete the remaining `INV-002` follow-up without touching Railway
production: prove that concurrent or repeated invoice-payment reversals cannot
create more than one reversal entry.

## Completed

- Added a local-only PostgreSQL Compose definition for an isolated integration
  database.
- Added the guarded `pnpm test:integration` command.
- Added guards that reject a non-test database name, a remote host without an
  explicit override, and a test URL equal to `DATABASE_URL`.
- Added the shared invoice-reversal schema bootstrap helper used by startup and
  integration setup.
- Added a real API integration test that creates a fully paid N250 invoice
  with a historic N1 overpayment credit, submits two simultaneous reversal
  requests, and expects one success and one HTTP 409 rejection.
- Added assertions for one linked reversal row, N250 net invoice payment, N0
  client credit, and one invoice audit event.
- API typecheck passed.

## Blocker

- The first `pnpm test:integration` attempt stopped before PostgreSQL started.
  Docker Desktop's local Linux engine returned HTTP 500 while inspecting the
  PostgreSQL image. No test schema, test record, Railway database, or live
  application data was touched.

## Decision Record

- Docker Desktop is a local convenience for a disposable PostgreSQL database;
  it is not part of the deployed application.
- A separately provisioned Railway PostgreSQL database is also a valid
  alternative. It must live in a dedicated test environment, use
  `TEST_DATABASE_URL`, and never point at the production database.
- The user selected separate Railway test infrastructure rather than Docker
  Desktop.
- An empty `integration-test` Railway environment was requested, explicitly
  avoiding a copy of production. Railway blocked creation because the workspace
  subscription is unpaid and the trial is maxed out. The selector still shows
  only `production`; no Railway service or database was created.

## Commit

- `60d135e Add isolated invoice reversal integration test` pushed to
  `origin/master`.

## Exact Next Action

The capacity blocker is resolved and API-ROUTE-001 deployment / live staff
acceptance are complete. This remediation round is closed; await the next
user-selected task without repeating completed financial writes.

Do not run this suite against Railway production.

## Railway Resolution and Regression Result

- Created the empty `integration-test` environment, fresh `Postgres-2Wsy`
  service, and `cost_management_integration_test` database. Production was
  not copied or used. Public TCP access was temporarily enabled for testing.
- Fixed Windows Drizzle schema discovery, selected only self-seeding
  integration files, and allowed 120 seconds for remote hooks/test cases.
  Schema reset is opt-in and restricted to the exact disposable database name.
- Initial runs exposed API-ROUTE-001: root-mounted finance middleware ran on
  unrelated staff requests. Scoped the guards in seven finance routers to
  their own URL families; role policy and assigned-officer checks stay intact.
- Final isolated run passed all 11 cases in 137.41 seconds. This includes
  simultaneous invoice reversal, finance denial, cross-branch restrictions,
  officer verification/berthing, bank/schedule reconciliation, and cleanup.
- Full production build and all 85 API unit tests passed. Older seeded
  delivery/duty test files are excluded and are not claimed as passed.
- User asked whether the live app had changed; explained that edits were local
  and uncommitted at that point. User then explicitly said to proceed.
- Code and records committed/pushed as `05ba101`. Railway started deployment
  `265a65ca-254b-4649-8e4d-d79e2475eec8`; live acceptance is pending.
- Removed temporary test public TCP access and applied the change. Railway
  shows the isolated PostgreSQL service Online and Unexposed. Future local
  runs need an explicitly selected test-environment tunnel or temporary proxy.

## Final Deployment and Live Acceptance

- Railway confirms `6a327a5` (including fix `05ba101`) Active / Deployment
  successful, deployment `644c3d66-5bea-4b2c-8c6e-8c91b39a4786`.
- Reused existing E2E Operations QA, user 14 in branch 2, with Staff authority
  and only Transire / Shipping access. Rotated only its dummy password for a
  fresh login; did not change its authority, workspaces, branch, or active state.
- All 12 live authenticated API checks passed: permitted same-branch task,
  own-profile and container reads; 404 for other-branch tasks; 403 for all seven
  finance route groups and User Management. Staff session logged out afterwards.
- These were direct API checks, not new browser workflow or officer-write tests.
  No new test account or business/financial record was created or changed.
  Only the QA password and authentication-session state changed.
- API-ROUTE-001 is closed. The user's requested final acceptance is complete.
