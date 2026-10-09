# Credit Notes and Bad Debts

## 2026-10-10 00:53 WAT - Push and Deployment Authorised

- User instructed push and deploy following local completion/policy summary.
  Record this as release authorisation for implemented management-report rules,
  not statutory tax certification. Earlier pending-policy lines are historical.
- Verified restored checkout master, matching previous local files, protected
  checkpoint retained, diff check clean. Commit/push/provider checks in progress.
- Exact next: verify pushed commit, successful exact Railway release, affected
  live report availability; record results and any remaining write/visual gates.

## 2026-10-10 00:28 WAT - Final Local Verification and Handoff

- Completed ACCT-004/005 local implementation, reusing original notes,
  invoices, audit events and overhead evidence rather than a duplicate ledger.
  Proposed recognition policy remains unconfirmed; no release/live closure.
- Final ten-case isolated run PASS, four-case follow-up PASS adding historical
  Bad Debt cash preservation/double-loss guard, one final case PASS proving
  due-today and fully settled write-offs refused. Twelve distinct new cases;
  last run's 31 skipped tests were deliberately filtered, not failures.
- Six new pure rounding/calendar unit cases included in final safe API result:
  39 files / 234 PASS / 3 prior network-only skips. Library/API/frontend
  typechecks, API/frontend builds and diff check PASS. Existing frontend
  sourcemap and large-bundle warnings retained; no visual/live UI pass claimed.
- Actual legacy cash facts stay in Bank, Financial Ledger and Cash Flow; flagged
  instead of silently reversed and excluded from paid overhead to avoid a
  duplicate loss. Missing write-off audit dates flagged instead of guessed.
  Write-off button now follows the same Lagos date rule as the backend.
- Namespace counts restored and tunnel closed after all isolated runs.
  Production records, earlier live fixtures, protected tag/archives untouched.
  UNCOMMITTED / UNPUSHED / NOT DEPLOYED. Registers and plan updated together;
  detailed handoff: ../ACCOUNTING_ADJUSTMENTS_2026-10-10.md.
- Exact next: owner confirms note-date proportional net/VAT and audited
  write-off-date gross non-cash loss convention (no automatic VAT relief),
  then code/records commit and push, exact deployment and bounded live acceptance.
  Do not start ACCT-006/007, re-run completed live writes or call this a full GL.

## 2026-10-10 00:16 WAT - Local Fix and Verification Milestone

- Original isolated run reproduced three failures before fixes. Added shared
  dated adjustment reader using original credit notes and write-off audit dates;
  kept invoice values/history, existing settlement/cash classifications intact.
- Credit-note cumulative limits, invoice/client locks and serial note numbering;
  write-off invoice lock, positive outstanding only, non-cash evidence and
  protective payment/edit/delete/schedule guards. Client notes allowed on paid
  invoices up to remaining face value; no automatic refund or VAT relief.
- P&L, VAT Summary/Tracking, Branch Comparison, Financial Dashboard and affected
  print/export/cache/UI labels updated. Explicit Lagos financial-period/month
  boundaries avoid server/browser timezone-dependent adjustment attribution.
- Nine scoped cases passed; final ten-case run adds explicit midnight proof.
  Six-pass intermediate run found/removed floating remainder and a period
  fixture mismatch; neither represented as a completed live test. Fixtures and
  tunnels cleaned after completed runs. Full unit run 234 pass/3 prior skips;
  final typechecks/build and diff review pending.
- Owner policy question unanswered: local draft uses proposed note-date VAT/net
  and dated gross non-cash loss. Do not deploy or claim tax-policy approval.
  New correction/recovery journals are not implemented; generic CN reversal
  remains refused. Undated legacy write-offs are flagged, not silently backdated.
- All work local/uncommitted; no production records/DDL or protected tag changes.
  Next exact: final ten cases and builds; record release/live gate and policy.

## 2026-10-09 23:36 WAT - Step 3 Authorised

- User authorised ACCT-004 and ACCT-005 only. Read current state/test register,
  prior full session and accounting review/plan; clean master e3e65cd verified.
- Confirmed credit notes settle invoices but original revenue remains in P&L;
  VAT screen independently subtracts proportional VAT, unlike print. Write-off
  creates an unpaid overhead record, but P&L recognises paid overhead only.
- Preserve completed cash fixes and retained live fixture. Do not reset isolated
  DB, duplicate live records, delete audit history or expand to full accounting.
- Asked owner to confirm note-date proportional net/VAT reductions and separate
  write-off-date non-cash loss without automatic VAT relief. Reproduction can
  proceed; policy is not yet confirmed. No implementation/test/release claim.
- Next: add scoped isolated regressions using existing secure Railway runner,
  reproduce failures, agree policy, implement existing report/mutation paths.
