# Verified Pre-Correction Checkpoint

Created 2026-10-08 before ACCT-001/002/003 runtime changes.

- Source commit: `cf29433d0f235aafa973ebd276bc5d2fea093f8c`.
- Annotated tag: `checkpoint-before-accounting-cash-fixes-2026-10-08`.
- Existing role checkpoint tags preserved. Source recovery bundle contains
  complete history and all tags; `git bundle verify` passed.
- Access-restricted local directory (owner and SYSTEM only):
  `C:\Users\SONOFGRACE\.codex\private-backups\cost-management\2026-10-08-before-accounting`.
- Files: `source-checkpoint.bundle`, `production-before-accounting.dump`,
  `checkpoint-manifest.json`. No backup or credential file added to Git.
- Production database matched to the application DATABASE_URL privately before
  selecting its service. Source application remains deployed at `5f67dff`.
- PostgreSQL 18.6 custom archive: 280,492 bytes; SHA256
  `176aecd526424b5dd1cbbf55b3064057e52887bf71c1082b5bf9aa77683a4547`.
- Remote/local checksums, archive list and full SQL extraction passed.
- Full `pg_restore --exit-on-error` passed in the EXISTING integration-test
  service using temporary database `acct_checkpoint_restore_test_20261008`.
  All 62 public tables restored; checked invoice/container counts and financial
  sums matched baseline. Temporary restore DB and remote archive removed.
  Existing `cost_management_integration_test` was not reset or overwritten.

## Baseline - Read-Only Production

| Source | Rows / total |
| --- | ---: |
| Invoices | 9 |
| Invoice payments | 5 / NGN2,001 net |
| Original deposits | 1 / NGN50,000,000 |
| Allocated deposits | NGN0 |
| Duty payment facts | 7 / NGN2,000,501 net |
| Overhead payment facts | 9 / NGN15,710,302 |
| Container payment facts | NGN201 |
| Standalone schedule payments | 2 / NGN501 |
| Bank funding | NGN1 |
| Internal transfers | NGN1, no company-wide net cash |
| Non-draft/non-cancelled invoice subtotal | NGN3,001 |

Current payment methods are five `transfer` rows. No historical allocation-note
candidates exist in this production snapshot. Therefore no guessed legacy
allocation relinking/backfill is necessary for this deployment.
Earlier read-only report totals remain in ACCOUNTING_FEATURE_REVIEW_2026-10-08.md.
These raw source totals do not equal P&L costs: recognised versus uninvoiced
costs and cash versus settlement populations intentionally differ.

## Coverage and Recovery Limits

Database schema/data is protected. This does not contain Railway service secrets
or external document bucket binaries. This accounting correction does not modify
those components; do not describe this archive as a full file-storage backup.
Secrets remain in provider/process memory, not logs or documentation.

To recover later, identify this exact tag and private manifest first. Do not
delete/overwrite checkpoint files. Code restoration and database restoration are
separate decisions. A database restore replaces later records, so stop writers
and agree a recovery point before any approved restore. No production restore
has been performed; production backup and financial baseline were read-only.
