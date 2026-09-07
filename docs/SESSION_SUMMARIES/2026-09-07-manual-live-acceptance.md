# Deployed Manual Live Acceptance - 2026-09-07

## Request and Decision

User authorized live re-testing MANUAL-GATE-001 and MANUAL-INV-001. Preserve
earlier failure evidence; use one new labelled fixture and an unpaid draft.

## Verified Results

- Railway 696ef75 (includes fix 960b7ff) Active / Deployment successful,
  deployment c113654a-88a6-44f1-83a9-cf19509f1764.
- New container 31 E2ER260907 / E2E-ACCEPTANCE-260907, branch 2, existing client
  9. Charge NGN100; client agreed rate NGN90. No duplicate fixture created.
- Gate missing-release/order/duplicate requests rejected with 409. Complete
  release prerequisites enabled four ordered gate events. Loaded entry/exit
  concurrent requests returned 200/409 and retries preserved timestamps.
- Browser audit and separate read-only API PASS confirmed one audit each,
  all four persisted timestamps and emptyReturnDate equal to final empty exit.
  Historical invalid timestamps on 29/30 were preserved. Full evidence is in
  LIVE_E2E_TEST_REGISTER.md.
- Original write process final tail was unavailable after compaction; no rerun
  or invented full-run PASS. Final state was independently verified read-only.
- Browser invoice preview NGN90; 7.5% VAT preview NGN6.75 / total NGN96.75.
  VAT reset to 0. New invoice 13 INV-202609-006 saved NGN90, Draft, paid NGN0.
  No issuance, payment, bank posting, or external messages. Old invoice 12 kept.

## Outcome and Next Exact Action

Both manual defects closed on deployed live acceptance scope. No new confirmed
defect. Six isolated database regression cases remain NOT RUN, including wider
access/transaction coverage; live acceptance is not a substitute for that suite.
Run those against the isolated TEST_DATABASE_URL when available. Do not repeat
creation, modify old evidence, repair historical NGN500 records, or rewrite PDF.

## Files and Commit

Follow-up availability question: directly checked Railway; existing Postgres-2Wsy
in integration-test is Online and private, no public endpoint. Runner has no
TEST_DATABASE_URL. Railway suggests a CLI tunnel; it was not started or verified.
Database browser showed no tables, not proof of the named integration database's
contents. No changes to service, app, data or test status. Clarify connection gap
instead of saying the database does not exist. Updated both registers.

Updated PROJECT_STATE.md, LIVE_E2E_TEST_REGISTER.md, session index; added guarded
live acceptance script. No application source changed in this acceptance turn.
Evidence/script committed and pushed as `6c24e0f` to origin/master. Follow-up
record-only commit captures this verified hash and push result.
