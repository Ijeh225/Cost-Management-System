# Accounting Remediation and Feature Plan

Current2026-10-10 02:19 WAT: all43 distinct isolated accounting cases have
passing evidence across full/selective runs (42full passes, corrected duplicate
staff fixture,2final focused passes). Unit248PASS/3skips/build PASS. ACCT-006/007
local implementation verified; publish/deploy and controlled live proof next.

Current2026-10-10 01:56 WAT: Steps4/5 ACCT-006/007 now authorised and implemented
locally. New checkpoint/DB full-restore protection verified; unit247passed and
typecheck/build PASS. Full isolated accounting suite, exact deployment and live
acceptance still in progress. Historical501 not guessed as expense. See
ACCOUNTING_CLASSIFICATION_AGING_2026-10-10.md. Older proposed lines are historical.

Current 2026-10-10 01:26 WAT: Steps1-3 complete within correction scope.
Step3 ACCT-004/005 deployed and controlled live write acceptance PASS;
invoice16/note2/evidence10 retained. Nonzero VAT split, audited remaining loss,
unchanged cash and refusal guards verified, with matching live finance views.
Earlier pending release/live lines below are historical. Steps4/5 ACCT-006/007
remain OPEN/proposed; do not start new accounting functionality without authority.


Current 2026-10-10 01:00 WAT: Step 3 a50c321 committed/pushed and exact
Railway deployment47eb5a30 SUCCESS/healthy. Existing-note read-only finance
reconciliation PASS; live write-off/nonzero-VAT mutation acceptance pending.
Recognition rules authorised for management-report release, not statutory tax
certification. Twelve isolated cases and prior tests retained. Later steps proposed.

Release authorisation 2026-10-10 00:53 WAT: user instructed push and deploy
Step 3 after the local rules/status summary. Implemented management convention
authorised for release; no statutory certification. Deployment in progress.

Current update 2026-10-10 00:28 WAT: Step 3 (ACCT-004/005) authorised,
fixed locally and isolated verified (12 distinct cases). Recognition convention
is a local draft pending owner confirmation before release. Not committed,
pushed, deployed or live accepted. Details: ACCOUNTING_ADJUSTMENTS_2026-10-10.md.
Later steps remain proposals. Steps 1/2 retain deployed/live-accepted status.

Recorded: 2026-10-08 12:18 WAT (Africa/Lagos, UTC+01:00).
Original status: PROPOSED at 12:18 WAT. Later user authorised Steps 1/2 only.
Basis: ACCOUNTING_FEATURE_REVIEW_2026-10-08.md and current authoritative
PROJECT_STATE.md / LIVE_E2E_TEST_REGISTER.md. The requested six accounting
features are not six newly reproduced bugs.

Execution update 2026-10-08 15:33 WAT: Steps 1/2 complete, committed/pushed,
deployed and live accepted. Protected checkpoint/backup/full restore/baseline
preserved. ACCT-001/002/003 and release migration defect ACCT-DEPLOY-001 closed;
19 original isolated cases plus one new older-schema upgrade passed, 228 API
unit/mocked tests passed (3 prior skips), typechecks/builds passed. Exact runtime
release db68c79 SUCCESS; guarded live deposit/allocation/credit/reversal checks
passed. See ACCOUNTING_LIVE_ACCEPTANCE_2026-10-08.md for retained dummy IDs,
source-total reconciliation, release metadata and evidence boundaries.
Steps 3-12 not authorised or implemented; ACCT-004..007 remain OPEN. See the
current authoritative registers for exact proofs, transport recovery and limits.

## Scope and Rules

Two workstreams, in order: repair existing financial accuracy, then add the
missing accounting capabilities if the user approves that scope.
Keep the existing operational workflows and finance source records. Do not
replace the entire application or create a second independent payment register.
New accounting records must reference existing transactions and be derived from
explicit approved posting rules, not parallel manual re-entry of every payment.

This plan proposes native accounting as one option. Before its implementation,
confirm native accounting versus an external accounting integration, supported
reporting basis, account mappings and opening/cutover policy with the owner and
responsible accountant. No provider choice, migration or policy approved here.
No assurance of statutory/tax compliance follows from implementing report pages.

## Part A - Existing Accuracy Corrections

### Step 1 - Protect and Establish the Baseline

- Preserve existing checkpoints and the current uncommitted review documents.
- Once implementation is authorised, create and verify a clearly named new Git
  checkpoint and a separate secure database backup before any data migration.
  A Git checkpoint does not back up database records or uploaded files.
- Record source totals, branch/date filters and basis for deposits, invoices,
  receipts, credits, reversals, duties, container costs, overhead and schedules.
- Verify isolated database identity and connectivity before write tests. Do not
  infer availability from an older successful isolated run or Railway screenshot.
- Reproduce source-confirmed ACCT-002/003/004/005 with labelled isolated fixtures
  before changing them. Reuse existing live fixtures for read-only comparisons.

Exit: verified restore materials, baseline and failure-specific regression cases.
No reset, deletion, backfill or financial posting authorised by this plan.

### Step 2 - Correct Cash and Deposit Sources

Addresses ACCT-001, ACCT-002 and ACCT-003.

- Include original client deposits once in Financial Ledger.
- Link deposit allocation to its original receipt and treat it as settlement,
  not another bank/cash receipt. Preserve invoice/AR/client-deposit effects.
- Distinguish real receipts/refunds from non-cash credit applications and credit
  notes in bank, ledger and Cash Flow, including opening balances and exports.
- Reuse a consistent source classification across existing reporting paths;
  avoid independent filters that disagree between screen, print and dashboard.
- Check existing records for provable linkage. Produce an exception report for
  ambiguous historical allocations; do not guess links or silently rewrite them.
- Protect allocation/credit consumption against concurrent excess use with
  transaction locking and duplicate-request controls matching existing patterns.

Acceptance: receive NGN1,000, allocate NGN400, retain NGN1,000 cash and NGN600
unallocated deposit. An applied credit/credit note changes settlement without
increasing cash. Concurrent requests cannot spend the same balance twice.

### Step 3 - Reconcile Credit Notes and Bad Debts

Addresses ACCT-004 and ACCT-005.

Execution 2026-10-10 00:28 WAT: existing routes/reports repaired without a
new ledger or migration. Local draft adopts proportional note-date net/VAT
and audited write-off-date gross non-cash loss. Policy question was sent first,
but no owner response received; this is not an approved production/tax policy.
12 isolated cases, 234 unit/mocked cases, typechecks/builds pass. Release/live
acceptance still pending. Generic note reversal/cash refund and bad-debt
recovery journals are not newly implemented or certified by these corrections.

- Agree credit-note net/VAT/date and bad-debt recognition rules before coding.
  Do not presume a VAT-inclusive credit note equals an ex-VAT revenue reduction.
- Make credit-note adjustments consistent across invoice history, receivables,
  P&L, Financial Dashboard, Branch Comparison and VAT screen/print populations.
- Give write-offs an explicit non-cash reporting effect and audit trail. Do not
  manufacture expense payments or erase original invoices to recognise a loss.
- Preserve historical settlements, distinguish refunds from credit issuance,
  and test partial/full adjustments, overpayments and reversed adjustments.

Acceptance: each adjustment affects the approved reports once, with no fictitious
cash movement; screen/print and branch/date scopes agree. Later GL mappings must
reuse these source adjustments, not create a second independently counted loss.

### Step 4 - Classify Standalone Payments and Review Metadata

Addresses ACCT-006; also investigates the recorded expense-metadata risk.

- Add explicit supported classification for standalone schedules: for example
  operating expense, recoverable client advance, asset or loan repayment.
  Final categories depend on approved accounting policy.
- Until account mappings exist, retain an explicit unclassified/review state;
  later map supported classifications to the chart of accounts in Step 6.
- Keep overhead-linked schedules on their existing single payment source. Do
  not add another cash fact when a linked overhead is paid.
- Report unclassified legacy payments and seek supported classification rather
  than automatically expensing the observed NGN501.
- Investigate deleted-parent/blank historical expense descriptions separately.
  Retain source category/narration snapshots or prevent destructive loss of
  financial metadata, without inventing values for unsupported old records.

Acceptance: each payment moves cash once, its reporting effect matches supported
classification, and unresolved historical entries remain visibly unresolved.

### Step 5 - Correct Aging and Release the Existing Fixes

Addresses ACCT-007 and closes Part A only after verification.

- Use accurately named aging buckets in Dashboard and AR, including a tested
  61-90 versus 90+ boundary and consistent as-of-date rules.
- Run all ACCT-001 through ACCT-007 isolated regressions, relevant existing tests,
  typechecks/build, branch/role restrictions and screen/print comparisons.
- Verify migrated/legacy examples as well as new fixtures; a passing clean
  fixture must not hide old ambiguous records.
- After approval to publish, commit code and current records together, push,
  verify the exact deployed commit/health, then perform controlled live re-tests.
  Record separate implemented, locally tested, deployed and live-verified states.

Exit: Part A fixes accepted within documented scope before building a new suite.
Do not label the app a full accounting system at this milestone.

## Part B - Missing Accounting Capabilities

### Step 6 - Agree and Build the Accounting Foundation

Owner/accountant decision gate: native accounting or integration. The native
steps below proceed only if explicitly selected and authorised.

- Agree chart of accounts: assets, liabilities, equity, income and expenses,
  with individual required expense heads and customer/vendor control accounts.
- Decide how clearing fees versus pass-through client funds, duties, deposits,
  unpaid expenses, VAT, work in progress and interbranch movements are treated.
- Add journal headers/lines, accounting dates, branch/job/client dimensions,
  posting lifecycle, exact monetary arithmetic and balanced debit/credit rules.
- Make posting atomic, source-linked and idempotent. A source/version cannot
  be posted twice; retries and failures must not leave half a journal.
- Define financial permissions, approval separation, period closing/controlled
  reopening and immutable posted entries corrected through linked reversals.

Exit: approved mappings and isolated balanced-posting/permission/period tests.

### Step 7 - Integrate Source Transactions and Establish Openings

- Connect issued invoices, collections, deposits/applications, credit notes,
  write-offs, duty/container/overhead payments, unpaid obligations, schedules,
  bank funding/transfers and reversals to the shared posting engine.
- A schedule approval is not itself a cash payment. A payment settles an
  obligation rather than expensing it again if expense was already accrued.
- Respect one B/L with multiple independently progressing containers: do not
  multiply shared invoice/payment totals by joining sibling containers.
- Supply missing asset/liability/equity inputs through approved records or
  journals; do not infer loans/capital solely from bank funding narration.
- Choose an approved cutover: validated historical backfill OR opening balances
  with forward posting. Do not count both openings and their earlier transactions.
- Dry-run reconciliation on the isolated database/copy first; preserve original
  source IDs and route unsupported records to review. Confirm backup/rollback
  strategy before any approved production backfill.

Exit: bank, AR, deposits, liabilities and expense subledgers reconcile to their
control accounts; rerunning import/posting produces no duplicate entries.

### Step 8 - Provide General Ledger and Trial Balance

- GL: account-level dated debit/credit entries, running balance, opening/closing
  values and drilldown to source, journal, actor and adjustment reason.
- TB: all account opening balances and period debits/credits/closing balances,
  with branch/date filters and consistent screen/export/print results.
- Flag missing classifications and reconciliation exceptions. A balanced TB
  alone is not proof that every source record is complete or correctly classified.

Exit: account movements reproduce independent fixtures, debits equal credits,
and source completeness/reconciliation checks pass separately.

### Step 9 - Add Authorised Manual Journal Workflows

- Use the Step 6 posting engine for adjustment entry, review, approval, posting
  and reversal; no separate journal calculation system.
- Require balanced lines, valid accounts/date, reason and supporting evidence.
- Support agreed accruals, depreciation, prepayments, reclassifications and
  opening/correcting entries while enforcing closed-period and branch controls.
- Do not allow journals to silently desynchronise AR/bank/control accounts;
  require a supported source adjustment or reconciliation procedure.

Exit: authorised adjustments appear once in GL/TB/reports; unauthorised actions
fail at API level; posted entries cannot be silently edited or deleted.

### Step 10 - Complete Balance Sheet and Management Accounts

- Balance Sheet: dated assets/liabilities/equity, supported opening values,
  retained earnings and account drilldown; Assets = Liabilities + Equity.
- Management pack: accrual P&L, Balance Sheet, Cash Flow, receivables/payables,
  branch/job performance, budget-versus-actual comparisons and reconciliations.
- Retain budgeted operational estimates as a clearly labelled separate view.
  Link accounting-dashboard figures to the approved accounting reports.
- Do not claim a complete balance sheet until required fixed assets, loans,
  payables, accruals, equity and other applicable balances have supported inputs.

Exit: a controlled full scenario reconciles across all reports, with transparent
cash-versus-profit and operational-versus-accounting differences.

### Step 11 - Add Statement of Affairs

- Provide dated asset/liability schedules and net assets, with evidence,
  valuation basis, review and approval.
- Clearly distinguish estimated values from accounting book values. It is not
  a renamed Client Statement or another authoritative ledger replacing the GL.
- Define any statutory/insolvency purpose separately with professional input.

Exit: supported schedules reproduce the reviewed net-assets calculation and
cannot be mistaken for confirmed book balances or statutory certification.

### Step 12 - Complete Acceptance, Rollout and Training

- Full isolated end-to-end and concurrency tests covering every mapped source,
  duplicate retries, reversals, adjustments, partial settlements and failures.
- Verify permissions through separate finance/non-finance accounts, branch
  isolation, closed periods, multiple containers/B/L and all output formats.
- Rehearse migrations/imports/restore before release. Obtain accountant/owner
  acceptance of mappings, openings and report results.
- Publish in approved stages and verify exact deployment plus controlled live
  scenarios. Financial corrections after cutover use traceable adjustments;
  do not blindly restore a database over later legitimate postings.
- Update manual, training examples, PROJECT_STATE, LIVE_E2E_TEST_REGISTER and
  timestamped session summaries. Preserve original checkpoints and audit data.

Exit: each feature separately passes defined acceptance; unresolved exceptions
are disclosed. No blanket 100% accuracy/compliance guarantee from test passes.

## Exact Next Action

User reviews this proposed numbered plan. No step is implemented or approved by
the plan request. If implementation is authorised, begin with Steps 1 and 2;
do not jump to report pages before the corresponding posting data is reliable.
Part B is a separate expansion decision, not required to fix the seven defects.

## Accounting References

Definitions checked 2026-10-08; app findings come from the repository/live review:
- [ACCA on subsidiary records and GL double entry](https://www.accaglobal.com/uk/en/student/exam-support-resources/foundation-level-study-resources/fa1/technical-articles/sales-comp-acc-system.html).
- [IFRS Foundation on the financial statement set](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements.html/).
