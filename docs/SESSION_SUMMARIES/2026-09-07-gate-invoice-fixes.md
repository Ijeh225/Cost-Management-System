# Gate and Invoice Preview Fixes - 2026-09-07

User authorized MANUAL-GATE-001 and MANUAL-INV-001 corrections after live
reproduction. Both are implemented; not yet closed by deployed acceptance.

## Changes

- Four existing gate routes use one validator plus a row-locked transaction.
  Entry requires existing final-workflow readiness; duplicate timestamps and
  invalid loaded/empty sequences return 409. No automatic historical backfill.
  Audit/notifications commit with the event, prior notifications are retained,
  and final empty exit still records emptyReturnDate. Auth/branch guards retained.
- Invoice preview uses client agreed rate per container (zero included), falling
  back only when unset. Effective amounts drive labels, zero badges and totals.
  Creation waits for successful client data and selected-container resolution.
  Backend pricing and saved invoices unchanged.

## Verification

- API unit tests: 101 passed, 24 files.
- `node --experimental-strip-types --test scripts/invoice-preview.test.mjs`:
  three passed, different/equal/zero/unset rates and multi-container VAT.
- `corepack pnpm run railway:build`: passed all typechecks and production builds.
- Six new isolated DB cases authored, not executed: no TEST_DATABASE_URL and
  Docker Linux engine unavailable. No production DB or exposed test service used.
- No live business writes, schema migration or PDF regeneration this session.

## Next Exact Action

Confirm deployment, verify corrected preview and bounded gate rejects, then
execute the isolated concurrency/valid-flow cases when test DB access is available.
Retain existing client 9, containers 28-30 and draft invoice 12; do not rerun
scripts/live-gate-followup-probe.py or repair historical NGN500 data here.
Update PROJECT_STATE.md and LIVE_E2E_TEST_REGISTER.md only with observed results.
