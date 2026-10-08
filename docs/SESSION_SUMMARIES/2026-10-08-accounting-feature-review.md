# Accounting Feature Review Session

## 2026-10-08 13:38 WAT - Steps 1 and 2 Authorised

- User authorised checkpoint, DB backup, baseline and isolated reproductions,
  then cash/deposit fixes ACCT-001/002/003; requires duplicate-work checks.
- Verified current paths have no replacement classification/allocation linkage
  and existing isolated Railway tooling/database will be reused. Old role
  checkpoint tags remain. Production commit still 5f67dff, no new live writes.
- Preserve preceding uncommitted review/plan documents in new code checkpoint.
  Backup credentials must not enter repository/logs; production is read-only.
- Exact next: create/verify separate accounting checkpoint and DB archive,
  reproduce failing cases, then implement within approved Step 2 scope.

## 2026-10-08 12:18 WAT - Proposed Remediation Plan

- User asked for the plan to fix everything. Reviewed current registers, full
  accounting review, continuity rules and Git status. Existing uncommitted
  review documents preserved; source/API/data unchanged.
- Saved ACCOUNTING_REMEDIATION_PLAN.md with stable Steps 1-12: protect/baseline;
  cash/deposit corrections ACCT-001/002/003; credit-note/bad-debt ACCT-004/005;
  payment classification ACCT-006 and metadata investigation; aging ACCT-007
  plus Part A acceptance; proposed accounting foundation; automatic posting/
  opening cutover; GL/TB; manual journals; BS/management pack; Statement of
  Affairs; final isolated/live acceptance and training.
- Part A repairs seven existing findings. Part B adds missing capabilities and
  is a separate scope decision. Native versus integration, pass-through funds,
  recognition/VAT policy and opening/cutover treatment need agreement; no policy
  invented or external provider selected.
- Proposed safeguards: no duplicated source registers; no silent historic
  relinking; no double-counting openings/backfill; atomic/idempotent postings;
  concurrency, API permission, branch and multi-container/B/L tests; preserve
  checkpoints; no blind DB rollback over later postings. Cash-versus-accrual
  differences must be explained, not forced into identical totals.
- Official ACCA and IFRS definition sources rechecked. No additional live test,
  implementation, migration, transaction or deployment was performed. All seven
  ACCT findings remain open. Documentation uncommitted/unpushed.
- Exact next action: user reviews scope; if authorised, start Steps 1 and 2.
  Plan request itself does not approve implementation or full-accounting build.

## 2026-10-08 12:08 WAT - Review Complete, No Implementation

- User requested thorough verification of Trial Balance, General Ledger,
  Management Accounts, Journal Entries, Balance Sheet and Statement of Affairs.
  Explicit instruction: report first, do not implement or modify app functionality.
- Confirmed restored checkout, clean synchronized master at 5f67dff; read current
  authoritative records and latest Oct 6 summary. Historical closed tests not
  restarted. Railway confirms production exact commit SUCCESS in deployment
  d9b14b32-a6c4-4eba-8bb9-55e516335f88.
- Source/schema/API/frontend tracing finds no double-entry accounts/journals,
  Trial Balance, Balance Sheet or Statement of Affairs. Financial Ledger is
  money movement, not full GL. General journal module missing; related invoice/
  duty reversals and credit-note/write-off actions exist. Management reports partial.
- Fresh live READ-ONLY owner checks: Reports/Financial Ledger/duty history,
  Cash Flow and print, actual-paid P&L, bank #3, both Dashboard modes, AR/Invoices.
  P&L and Financial View match 3,001 revenue, 701 recognised costs, 15,710,302
  overhead and -15,708,002 net. Bank #3 reconciles credits 2,003-debits 1,404=599.
  Existing cancelled invoices, reversals and paid schedules reused, no new fixtures.
- New ACCT-001: ledger misses existing NGN50M deposit. Cash-flow all-time net
  32,290,497 versus ledger -17,709,503 differs by exactly NGN50M. Internal NGN1
  transfer inclusion/elimination explains gross-side NGN1 difference, not a bug.
- Source-confirmed ACCT-002 deposit allocation double receipt, ACCT-003 non-cash
  credit counted as cash, ACCT-004 credit-note revenue/VAT mismatch and ACCT-005
  bad-debt loss not posted to P&L. No fresh live writes performed for these cases.
  ACCT-006 standalone payment classification missing; do not blindly expense
  loan/asset/advance payments. ACCT-007 Dashboard 90d+ includes AR 61-90, live
  existing invoice 68 days overdue illustrates mislabelling. All remain unfixed.
- Existing safe tests: direct Vitest execution, 5 files/16 passed. Initial pnpm
  launcher did not produce a test result; only actual Vitest results are counted.
  No DB/concurrency writes; prior isolated passes not represented as new ones.
- Source risk needing later isolated coverage: deposit/credit checks occur before
  write transaction without direct-collection locking. Older blank expense joins
  merit metadata audit; no new corruption or missing-parent conclusion asserted.
- Cash Flow screen date typing/query navigation did not change applied October
  period in this browser path. Used generated printable route with verified period
  and all-time heading for reconciliation. Not classified as a proven date-widget
  product defect. No browser security/session bypass or credential change.
- Full review: docs/ACCOUNTING_FEATURE_REVIEW_2026-10-08.md. State and live
  registers updated; previous closures preserved. Only documentation changes,
  no new feature, fix, migration, permissions, transaction or deployment mutation.
  Documentation not committed/pushed in this review-only turn.
- Exact next action: user reviews findings and agrees fix/feature scope.
  Do not start implementing accounting merely because gaps were recorded.
