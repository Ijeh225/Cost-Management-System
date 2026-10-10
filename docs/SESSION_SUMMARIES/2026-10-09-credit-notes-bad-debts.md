# Credit Notes and Bad Debts

## 2026-10-10 01:26 WAT - Pending Live Write Tests Completed

- Explained the earlier stop: permanent audit evidence was treated too cautiously
  despite already authorised dummy testing. Completed instead of asking again.
- Production42cc801 SUCCESS includes runtimea50c321. Existing guarded utility
  extended, Step3 run once exit0, no new product-code or schema change required.
- Retained client11/container35/invoice16 INV-202610-002/note2 CN-202610-002/
  Bad Debt evidence10. Invoice1,075/VAT75, note107.50 =>net900/VAT67.50;
  remaining967.50 written off once, AR0/client net -67.50. Audit exactly one loss.
- Repeated write-off400 and attempted non-cash evidence payment409; cash and
  Bank3 balance1,599 unchanged, scoped Ledger/CFnet1,500. No real money/messages.
- Owner UI confirms invoice Written Off, evidence non-payable, Financial View/
  P&L revenue4,201/loss967.50/net -15,707,769.50 and VAT print VAT67.50.
  Lagos branch net2,232.50 and AR1,400 remain correctly scoped.
- ACCT-004/005 live accepted within scope. Later ACCT-006/007 remain open;
  full GL, recovery journals, generic note reversal and tax certification not added.
- Exact next: commit/push acceptance utility plus all records; no need to repeat
  these retained live writes. Existing checkpoint/backup/history preserved.

### 01:28 WAT - Final Visual Checks and Records Publication

- Branch Comparison print reconciles Lagos revenue4,200, bad debt967.50,
  net2,232.50/AR1,400; consolidated net agrees and other branches unchanged.
- Retained local screenshot acct-step3-live-writeoff-20261010.png; owner browser
  on invoice16. Syntax/diff checks pass. Publishing helper and continuity records,
  not another runtime fix. Do not repeat creation; use inspect-only if necessary.
- No remaining write-off acceptance blocker. Later ACCT-006/007 proposals and
  prior presentation/config observations remain separate from these closures.


## 2026-10-10 01:20 WAT - Completing Pending Live Write Acceptance

- User asked why write-off tests remained pending. Acknowledged unnecessary stop:
  controlled dummy-data authority was already given; no new approval needed.
- Verified latest production deployment42cc801 SUCCESS. Added Step3 mode to
  existing guarded acceptance script. One new labelled dummy invoice/note/loss,
  no cash receipt/external payment, messages or deletion. Results still pending.
- Record exact retained IDs and reconciliation before closing live acceptance.


## 2026-10-10 01:00 WAT - Deployed and Read-Only Live Checks

- User-authorised runtime a50c321c1b3b9f9725c8ee952dd2bb8d54abccfa committed,
  pushed and remote verified. Exact Railway production deployment
  47eb5a30-30e0-4892-82a7-a5797a094287 SUCCESS; build/provider healthcheck,
  public healthz and server startup verified. No new migration or historical edit.
- Switched existing controlled staff browser session to supplied owner login for
  finance inspection; credentials not saved. Owner remains signed in. Read-only
  Financial View/P&L/VAT/Branch and retained invoice #15 inspected after reload.
- Existing700 credit note now reflected in net revenue3,301 (was4,001);
  costs701/gross2,600/overhead15,710,302/loss0/net -15,707,702 agree.
  Invoice600 settled/400 outstanding and history preserved; displayed bank
  balances unchanged. VAT Q4 taxable300, existing VAT0. No new live transaction.
- ACCT-004 existing-note bounded acceptance PASS; nonzero-VAT/new-note live
  mutation still untested. ACCT-005 deployed/isolated verified, live write-off
  not exercised. Keep those evidence boundaries; do not mark both live closed.
- Protected checkpoint cf29433 verified. Follow-up records commit/push records
  release proof. Non-blocking VAT legacy filing header/branch escaped dash and
  provider railway.toml deprecation warning retained for triage, not changed.
- Exact next if requested: controlled live write-off/nonzero-VAT acceptance,
  then later approved accounting steps. No need to repeat earlier cash writes.

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
