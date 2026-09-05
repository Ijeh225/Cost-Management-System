# Project State

## Current Work Register - Authoritative as of 2026-09-05

Use this section to choose the next task. Earlier plans, next-action lines,
and issue statuses in this document are historical evidence, not the current
backlog. They are retained so that previous decisions and live-test results
remain auditable.

### Closed Since the Original Audit

- Live re-tests closed `DASH-001`, `AR-002`, `BRN-001`, `AI-002` through
  `AI-007`, `NOTIF-001`, `NOTIF-002`, `TASK-001`, `PIPE-001`, `BANK-002`,
  `SCHED-002`, `CP-002`, `OH-002`, `APR-001`, and `DEL-001`.
- Finance re-test evidence now closes `RPT-001`, `RPT-002`, `RPT-003`,
  `SCHED-001`, `FIN-002`, and `FIN-003`. Branch Comparison, P&L, and the
  Financial Dashboard now use the same recognised actual-cost population.
- Operations and document re-tests now close `OPS-001`, `OPS-002`, `VAT-001`,
  `VAT-002`, `CLT-001`, `CONT-RPT-001`, `INV-001`, and `STMT-001`. Client
  Statement and VAT Summary now apply the same active-financial-invoice rule
  as Accounts Receivable.
- Earlier controlled work also closed `BANK-003`, `AI-008`, `SEC-02`, and
  `DUTY-002`, and `INV-002`. Do not repeat their financial or workflow writes.
- The latest deployment is verified live: Abuja dashboard completion now
  matches the persisted delivery date and Delivery Tracking.

### Current Follow-Up

No deployed application correction is awaiting a live re-test. The only
remaining `INV-002` follow-up is an isolated database integration test using
`TEST_DATABASE_URL` for concurrent/repeated-reversal safety.

### Next Action

1. Provision `TEST_DATABASE_URL` and add the isolated database-backed
   regression test for concurrent/repeated invoice-payment reversals. This is
   test-environment work only; it does not require another live financial write.

### INV-002 Traceable Payment Reversal Live Re-Test Passed - 2026-09-05

- Invoice payments now support immutable `payment` and `reversal` entries,
  linked one-to-one. Reversal requires a reference, reason, and a date no
  earlier than the original payment. A payment cannot be reversed twice.
- The legacy hard-delete endpoint and trash action are replaced by a reversal
  dialog. The original collection remains audit-visible; the new negative row
  restores invoice, bank, ledger, Cash Flow, analytics, and client-credit
  totals in the same transaction.
- The reversal source is presented as a money-out in Bank Management, Financial
  Ledger, and Cash Flow, rather than as a misleading negative collection.
- Railway deployed commit `a13d096`. In the explicit Lagos branch scope, the
  controlled N1 `E2E-20260901-INV-001-OVERPAY-REJECT` payment on
  `INV-202609-001` was reversed as
  `E2E-20260905-INV-001-OVERPAY-REVERSAL`. The original N1 payment and the
  linked negative N1 reversal remain in Payment History and the audit log.
- Live reconciliation passed: the invoice remains Paid at N2,000; client
  credit is N0; AR, Analytics, and Client Statement show N2,000 collected and
  N1,000 outstanding only from `INV-202609-004`; Bank Management shows the
  reversal as a N1 debit; Financial Ledger and Cash Flow show it as money-out.
- Local verification passed: API/frontend typechecks, API/frontend production
  builds, and all 85 API tests. The new unit test covers the calculation of
  credit created by an overpayment.

### STMT-001 and VAT-002 Live Re-Test Passed - 2026-09-05

- The Client Statement now uses `getInvoiceFinancialEffect`, which applies the
  existing `isInvoiceFinanciallyActive` rule to totals, paid amounts, and
  outstanding balance. Draft, cancelled, and written-off invoices remain in
  the statement history but have zero financial effect, including credit-note
  adjustments.
- VAT Summary now filters its report rows through the same canonical rule.
  Therefore audit-only invoice statuses are not included in taxable turnover,
  VAT, invoice count, or grand totals.
- Live Client Statement at `/reports/client-statement/print?clientId=6` retains
  cancelled `INV-202609-002` and `INV-202609-003` as N1,000 audit-history rows
  with N0 paid and N0 balance. Its totals reconcile to AR: N3,000 invoiced,
  N2,001 paid, N1,000 gross outstanding, N1 credit, and N999 net balance owed.
- Live VAT Summary at `/reports/vat-summary/print?from=2026-09-01&to=2026-09-05`
  lists only paid `INV-202609-001` and sent `INV-202609-004`: two invoices,
  N3,000 excluding VAT, N0 VAT, and N3,000 grand total. The cancelled invoices
  are absent from the breakdown and financial totals.

### Operations and Document Live Re-Test - 2026-09-05

- `OPS-001` passed: `/operations/20` now displays the Transire-specific owner
  for `HLCU8765432` as Unassigned, matching the Transire workspace rather than
  the stale generic `Jdjdh` value retained in its history. The Operations Board
  likewise shows distinct owner values for the same job in each department.
- `OPS-002` passed: Pull-Out Released now contains `E2EL260901` with its own
  `E2E Pull-Out Owner`, alongside its 1 September submission. Terminal Released
  independently shows `E2E Terminal Owner`; Documentation, Transire, and
  Shipping continue to show their separate owners.
- `VAT-001` passed: the VAT print route renders for both populated and no-data
  periods. `CLT-001` passed: the Lagos Client page matches AR at N3,000
  invoiced, N2,001 collected, and N999 outstanding. `CONT-RPT-001` passed for
  both empty-charge container 25 and charged container 26. `INV-001` passed:
  zero-value draft `INV-202608-001` keeps Mark as Sent disabled.
- `STMT-001` failed/reopened: its print route includes cancelled invoices
  `INV-202609-002` and `INV-202609-003` in N5,000 invoiced, N3,000 gross
  outstanding, and N2,999 net owed totals. `VAT-002` was recorded because the
  populated VAT print route repeats the same cancelled invoices and reports
  N5,000 taxable turnover for 1-5 September instead of the N3,000 active
  invoice population.

### RPT-003 and FIN-003 Live Re-Test Passed - 2026-09-05

- `RPT-003` passed on the deployed All-Branches view. Branch Comparison shows
  N3,001 accrual revenue, N701 actual paid costs, N2,300 gross profit before
  overhead, N10,710,302 actual paid overhead, and N-10,708,002 net profit.
  Those figures match the All-Branches Actual-Paid P&L and Financial Dashboard.
  Its operational container count remains 9, intentionally separate from the
  three invoiced containers recognised for actual cost of sales.
- `FIN-003` passed on the deployed Lagos Cash Flow screen and print route for
  1-5 September. Both now say `Net Movement` and explain that All-Banks mode
  excludes internal transfers, so the N1,101 per-bank period movement is not
  the individual bank statement's N1,100 closing balance.

### Finance Re-Test Completed - 2026-09-05

- Reserved controlled record: `E2E-20260905 FIN-RETEST Standalone Schedule`.
- The new N1 schedule was approved and paid through `E2E-20260901 Lagos Test
  Bank` with reference `E2E-20260905-FIN-RETEST-SCHED-001`. It moved to Paid
  with a zero balance and appeared as the exact N1 debit in the bank statement,
  Financial Ledger, and Cash Flow Payment Schedule outflow. The historic N500
  schedule remains unchanged and is not backfilled.
- `RPT-001` passed: Actual-Paid P&L uses 2 invoiced containers in Lagos and 3
  under All Branches, with the corresponding recognised-cost average.
- `RPT-002` passed: Reports explicitly state the operational cards use budgeted
  clearing charges/costs, and label Budgeted Expenses and Budgeted Gross Profit.
- `SCHED-001` passed for new payments: the new immutable schedule-payment row
  reaches Payment Schedules, Bank Management, Financial Ledger, and Cash Flow.
- `FIN-002` passed: Lagos P&L and Financial Dashboard agree on N3,000 accrual
  revenue, N700 actual paid container costs, N300 actual paid overhead, and
  N2,000 true net profit; Disbursement Reconciliation includes the controlled
  duty payments in the actual spend population.
- `RPT-003` failed/reopened: under All Branches, P&L and Financial Dashboard
  show N701 actual costs and N-10,708,002 net profit, while Branch Comparison
  shows N2,000,702 actual costs and N-12,708,003 net profit. The difference is
  the broader non-invoiced-container population shown by Branch Comparison.
- `FIN-003` observed: the E2E Lagos statement closes at N1,100 after the new
  schedule debit; Cash Flow's 1-5 September per-bank breakdown reports N1,101.
  This is recorded for source tracing and is not yet attributed to the new
  schedule-payment path.

### RPT-003 and FIN-003 Correction Implemented Locally - 2026-09-05

- `RPT-003`: Branch Comparison now derives actual container costs from the
  exact set of containers recognised by P&L: each container enters once, in the
  period of its first active (non-draft, non-cancelled) invoice. It includes
  both immutable container-disbursement and customs-duty rows for that set.
  Operational container counts remain all containers, intentionally separate
  from the financial recognition basis.
- `FIN-003`: Source tracing confirmed the N1 difference is the internal bank
  transfer that All-Banks Cash Flow deliberately removes from consolidated
  movement. The displayed per-bank value was already a period net, not a bank
  balance. The Cash Flow screen and print report now label it `Net Movement`
  and explicitly state that All-Banks internal-transfer elimination means it
  must not be compared to an individual bank statement closing balance.
- Verification: API typecheck and frontend typecheck pass; all 83 API tests
  pass. The API and frontend production builds passed, Railway deployed commit
  `6893ea1`, and the targeted live re-test passed.

### Verification Notes, Not Active Product Defects

- The document upload, linking, searchable index, and AI lookup have passed.
  Download behaviour was limited by the previous browser surface, not proven
  to be an application defect.
- Database-backed integration cases require an isolated `TEST_DATABASE_URL`.
  This is test-environment work, not permission to create more production data.
- All newly added entries must update this register and the live test register
  in the same commit. Do not use an older “Next action” paragraph to choose
  work without checking this section first.

## Latest Verified Checkpoint - 2026-09-05

- APR-001: CLOSED for the tested owner/Lagos workflow. Job 26 was submitted
  and rejected once; Pending Review immediately cleared and Recently Reviewed
  showed Rejected with the recorded reason, without reload.
- DEL-001: CLOSED for the controlled Abuja job 25. Delivery date 2026-09-05
  persists after reload. Delivery Tracking reports one delivery on that date,
  four days and N1,000 budgeted revenue. Dashboard now shows Total 1,
  In Progress 0, Completed 1 after deployment.
- Root cause fixed: Dashboard completed was hard-coded to zero. It now counts
  non-null deliveredAt in the selected branch, matching Delivery Tracking.
- Code commit b6638cb pushed to origin/master and verified ACTIVE/successful
  on Railway deployment 0d3cf23a-37d9-4349-965c-9badbf8baa6a before final live check.
- Validation: full railway:build passed; API unit suite 22 files / 83 tests
  passed. Added database integration reconciliation assertion was not run
  locally; it needs the seeded integration database. Live reconciliation passed.
- Retained evidence: Lagos job 26 rejection and Abuja job 25 delivery date.
  No financial postings, new jobs, deletions, or migrations in this task.
- Exact stopping point: Abuja Dashboard after deployment, Completed 1.
  Both requested controls are complete; do not repeat their writes. Older
  Open/Blocked entries below are historical and superseded by this checkpoint.
  The register closeout review is recorded in the Current Work Register above.
  Do not repeat APR-001/DEL-001 writes or claim that every app workflow has
  passed.

## Purpose

This is the authoritative handoff record for the Cost Management System. Every
new work session must read it before planning, changing code, testing, or
deploying. Update it in the same commit as the work it records.

## Standing Project Command

Record every change to this application automatically. This includes new
features, fixes, discovered issues, tests, build results, deployment outcomes,
business decisions, blockers, commits, and the next action. Do this without
asking the user for a reminder. Keep the current status concise and append
important completed milestones so previous work remains traceable.

## Repository and Safety

- Canonical working repository: `Cost-Management-System-restored`
- Main branch: `master`
- Last project-state checkpoint before this register cleanup: `1ad7ff1`
- Preserved rollback tags:
  - `checkpoint-before-rbac-user-migration-2026-08-28`
  - `checkpoint-before-user-role-restructuring-2026-08-28`
- Never reset, delete, or overwrite these checkpoints.

## Historical Objective - 2026-09-01 (Superseded)

Carry out and document a controlled, comprehensive live end-to-end acceptance
test before beginning any new large product feature.

The approved remediation sequence is the source of truth for all work after
the deployed re-tests of Steps 1-6. Do not reorder, rename, or replace these
steps from memory. Read this section and `docs/LIVE_E2E_TEST_REGISTER.md`
before planning any further changes.

## Current Session Record

- On 2026-09-01, the user made automatic project-state recording a standing
  command. `AGENTS.md` now requires every future session to record all
  features, fixes, discovered issues, verification results, deployment
  outcomes, decisions, blockers, and next actions without waiting for a
  reminder.
- On 2026-09-01, the user authorised a comprehensive pre-delivery live test.
  The execution source of truth is now `docs/LIVE_E2E_TEST_REGISTER.md`.
  It began with a read-only inventory: the signed-in dashboard rendered and
  showed six existing containers, one invoice, and existing financial data.
  These figures are not yet reconciled or accepted as correct.
- `FIN-01` reconciled the main all-time financial amounts between Financial
  Dashboard and P&L, but identified High-priority defect `RPT-001`: P&L uses
  an all-cost-container count in its recognised-COS label and per-container
  average even though recognised cost totals include invoiced containers only.
- Report Centre inspection identified High-priority defect `RPT-002`: its
  headline cards and exports use budgeted container clearing charges/costs but
  label them as generic revenue, expenses, and net profit beside actual-based
  P&L reporting.
- Invoice testing confirmed the zero-value issuance safeguard holds at the
  backend. It also identified Medium-priority defect `INV-001`: the front end
  permits the failed action and gives only a generic error rather than the
  actual validation reason.
- A controlled existing invoice collection reconciled across invoice,
  receivables, and bank ledger: `INV-202608-002`, its ₦1 payment reference,
  zero outstanding balance, and matching bank credit all agree.
- Existing controlled duty, container-disbursement, and overhead-payment
  records also reconcile to their bank and report ledgers. The live test
  initially had two setup blockers: only one branch and no separate
  authenticated sessions for the existing test profiles. The branch blocker is
  resolved; separate authenticated sessions are still required for permission
  acceptance.
- Two controlled branches are now created: `E2E-20260901-Lagos` (ID 2) and
  `E2E-20260901-Abuja` (ID 3). Client setup identified High-priority defect
  `BRN-001`: branch selection in the client form conflicts with the required
  global branch scope and the UI hides the server's actionable error.
- The controlled clients are `E2E-20260901 Lagos Client` (ID 6) and
  `E2E-20260901 Abuja Client` (ID 7). `E2EL260901` (ID 26, Lagos) was
  verified and released through Pullout; `E2EA260901` (ID 25, Abuja) remains
  pending verification. The
  container form initially displayed Head Office as Branch under the Lagos
  global scope, expanding `BRN-001` to include an unsafe/misleading default.
- Container branch isolation has passed: Lagos scope returned only the Lagos
  controlled container, Abuja scope returned only the Abuja controlled
  container, and the completed All Branches refresh returned both. Moving a
  controlled container into Operations requires an explicit verification
  approval before the stage-workspace tests can begin.
- `E2EL260901` was verified after explicit confirmation. The dedicated
  Documentation, Transire, Shipping, and Terminal workspaces now retain
  independent test owners, confirming the intended per-department owner model.
  The confirmed Terminal/TDO release moved only that test record into Terminal
  Released and correctly unlocked Pull-Out, where `E2E Pull-Out Owner` remains
  separate. High defect `OPS-001` was found: the generic Operations detail
  stage-control form reports a successful save but loses its values after
  navigation, unlike the authoritative department workspaces. The browser
  driver could not commit a native date field to React state, so expected-date
  entry needs a manual browser confirmation before it is accepted as a product
  defect.
- The explicitly confirmed Pullout release on `E2EL260901` succeeded and
  correctly created the derived Gate-In work item. High defect `OPS-002` was
  found: Pull-Out Released remains empty because the pipeline endpoint removes
  released Pull-Out records before the workspace can place them in its Released
  tab. The backend condition and required correction are in the live test
  register.
- Documentation UI was reached for `E2EL260901`; the Documents tab, section
  selector, and file picker render. The actual upload/search/open test is
  blocked only because this signed-in browser-control surface cannot provide a
  local file to the operating-system file chooser. This is not an application
  finding and needs a manual browser upload or an approved upload-capable test
  surface.
- Report testing confirmed Terminal/TDO and Pullout actual releases in the
  Department Workflow report and the presence of both controlled branches in
  Branch Comparison. It also found High defect `RPT-003`: Financial Dashboard
  and P&L agree on ₦500,002 Actual Paid Overhead, but Branch Comparison reports
  ₦10,710,002 as the same metric because their payment-row inclusion rules
  differ.
- Controlled invoice `INV-202609-001` (ID 8) was created for `E2EL260901` in
  Lagos with ₦2,000 total and an explicit test note. It completed the
  Draft → Sent → Partially Paid → Paid lifecycle through two controlled
  ₦1,000 Bank Transfer collections. AR now shows ₦2,000 invoiced, ₦2,000
  collected, and ₦0 outstanding; Financial Ledger has both matching credits.
  Critical `INV-002` was then found: a visible post-paid ₦1 payment attempt
  created a real `E2E-20260901-INV-001-OVERPAY-REJECT` Financial Ledger credit
  and ₦1 AR credit balance, but it is absent from invoice Payment History and
  the invoice still says ₦2,000 paid. All further live financial posting is
  paused pending review of this data-integrity defect. Controlled bank
  `E2E-20260901 Lagos Test Bank` has a zero opening balance. `BRN-001` also
  affects the invoice dialog, which displayed Head Office until Lagos was
  selected manually.
- The controlled schedule `E2E-20260901 Scheduled Test Vendor` was created for
  ₦500, approved, and marked Paid with the controlled Lagos bank. Its schedule
  timeline and ₦0 balance are correct, but its expected ₦500 money-out entry is
  absent from Financial Ledger. This High report/bank reconciliation defect is
  logged as `SCHED-001`; no corrective code has been applied.
- A fresh controlled ₦200 Shipping disbursement for `E2EL260901` was posted to
  the controlled Lagos bank with reference `E2E-20260901-CONTAINER-001`. Its
  container-payment section, budget-versus-disbursement view, and Financial
  Ledger all agree; `CP-01` has passed.
- A fresh controlled direct overhead path also reconciles: category
  `E2E-20260901 Test Overhead`, ₦300 expense `E2E-20260901-OVERHEAD-001`, and
  bank payment `E2E-20260901-OVERHEAD-001-PAID` progressed to Paid with a ₦0
  balance and a matching ₦300 Financial Ledger debit. This isolates
  `SCHED-001` to the scheduled-payment path rather than general overhead or
  bank ledger posting.
- Dedicated duty-test container `E2ED260901` (ID 27) was verified and given a
  controlled ₦400 Documentation assessment. Its controlled ₦200 bank duty
  payment (`E2E-20260901-DUTY-001-PARTIAL`) correctly reports Partial with
  ₦200 outstanding in Duty Payments, and appears as the matching dated debit
  in both Duty Payment Ledger and Financial Ledger.
- Dashboard reconciliation found two further High defects. Operations View
  includes cancelled `INV-202609-002` in Lagos Total Invoiced/Outstanding
  Receivables while AR correctly excludes it (`DASH-001`). Financial View uses
  the stated P&L basis and excludes the verified ₦200 Customs Duty payment from
  Actual Paid Container Costs, overstating net profit by the same amount
  (`FIN-002`).
- The matching actual-paid P&L was directly inspected: it reports ₦200 Shipping
  and ₦0 Customs (including duty), despite the dated ₦200 duty payment. It also
  reports two containers for one issued invoice, providing current controlled
  evidence for `FIN-002` and the pre-existing `RPT-001` count/average defect.
- Cash Flow independently confirms both core financial findings: it reports
  only ₦700 of the ₦1,200 controlled money-out total because the Paid schedule
  is absent (`SCHED-001`), and reports ₦2,001 invoice cash received across
  three inflows because it includes the hidden ₦1 overpayment (`INV-002`).
- Analytics correctly labels its main profitability cards as budgeted, but also
  shows ₦2,001 collected against ₦2,000 invoiced while capping Collection Rate
  at 100% and hiding the overpayment credit; this extends `INV-002` into the
  analytics module.
- The live Invoice Aging report excludes the paid controlled invoice but counts
  cancelled `INV-202609-002` as ₦1,000 Current outstanding, while Accounts
  Receivable correctly excludes it. This is the new High `AR-002` defect and
  confirms invoice-status rules are still inconsistent across receivables
  views.
- VAT Summary is currently unavailable: both its Generate button and direct
  print route produce a blank page. `vat-summary/print.tsx` violates React's
  hook-order rule by calling `useMemo` only after loading/error early returns;
  this High `VAT-001` defect needs a small route-render repair and regression
  test.
- Delivery Tracking generated normally with no date filters and reported zero
  deliveries. This is expected because no controlled container has been marked
  physically delivered, so the report's empty result is a verified pass.
- Exchange Rate History loaded normally and correctly returned no entries for
  the present live data; this read-only empty-state path has passed.
- Printable Invoice Aging renders, but repeats the cancelled-invoice error from
  the live aging view. `AR-002` therefore affects both on-screen and printable
  receivables reporting.
- The controlled Client Statement exposes a separate High `STMT-001` defect:
  cancelled invoice history is valid, but its cancelled ₦1,000 balance is
  included in Gross Outstanding and produces a false ₦999 Net Balance Owed
  instead of matching Accounts Receivable's zero balance.
- Disbursement Reconciliation confirms `FIN-002` is broader than the P&L and
  dashboard: it records the ₦200 Shipping disbursement, but omits the verified
  ₦200 Customs Duty payment from the controlled duty container's actual spend.
- Duty Reconciliation itself is correct for the controlled partial payment:
  `E2ED260901` shows Snapshot ₦200 and Ledger ₦200 as Matched.
- Monthly Summary is functional but confirms `RPT-002`: it labels budgeted
  container clearing charges and costs as Revenue and Expenses, even though
  those values are not the actual invoice and payment financial basis.
- Client Report repeats `RPT-002`: its controlled Lagos-client “Revenue” is
  the ₦3,000 total of two container budgets, not recognised invoice revenue.
- Operations Report reconciles to the current container population: nine
  containers with correct vessel and size distribution, and zero completed as
  expected because no job has reached Delivery/Closed.
- The Reports Financial tab also extends `RPT-002`: it presents budgeted
  clearing charges and costs as a financial report without clearly declaring
  the different basis from P&L and the Financial Dashboard.
- On 2026-09-02, the Reports Pending Verification filter correctly isolated
  controlled Abuja container `E2EA260901` and its expected operational values.
- Approval Queue was checked read-only on 2026-09-02: its empty state renders
  correctly with no pending submitted sections. Approval/rejection actions
  remain outstanding until a controlled pending submission can be reviewed.
- Pipeline Board preserves the controlled job's separate stage owners, but
  still presents a Terminal Advance action after that Terminal stage was
  released and Gate-In opened. This Medium `PIPE-001` consistency risk was
  recorded without attempting the potentially repeated action.
- Notifications render and correctly flag the controlled ₦200 unpaid duty, but
  workflow deadline alerts are misclassified as Low Profit Margin. This Medium
  `NOTIF-001` taxonomy defect is recorded; navigation was not clicked because
  it may mark live alerts as read.
- My Tasks renders as an unfiltered nine-container list with blank Review
  values and no ownership, due date, or task status. This Medium `TASK-001`
  workflow-usability defect is recorded without creating or changing tasks.
- Settings tabs were checked read-only on 2026-09-02. All eight sections load
  independently; Workflow and Container Aging current values render correctly,
  and no save action is enabled without a user change.
- Branch Management correctly lists the controlled active branches and their
  isolated active-container counts: Lagos 2 and Abuja 1. No branch changes
  were made.
- `SEC-002` production-access cleanup was completed on 2026-09-02 under the
  explicit instruction to retain only `ijehifeany@gmail.com`: seven unauthorised
  accounts, including the additional Super Admins and test accounts, are now
  Disabled rather than deleted. The owner account remains the sole Active
  Super Admin. A fresh owner-login verification remains advisable; the disabled
  accounts retain an Enable action for controlled recovery.

## Current Release Status

- Financial Dashboard implementation was pushed in `0f63688`.
- Its first Railway deployment failed because Operations View could reference
  dashboard statistics before they were available.
- The fix was pushed in `c06d356`.
- Local frontend typecheck and production build passed after the fix.
- On 2026-09-01, live browser testing confirmed Financial Dashboard renders
  under All Branches and its current all-time values reconcile to live P&L
  (₦1 revenue, ₦1 actual container cost, ₦500,002 actual paid overhead, and
  -₦500,002 net profit). Branch Comparison is not reconciled; see `RPT-003`.

## Historical Next Actions - 2026-09-01 (Superseded)

1. Complete `ENV-02` and catalogue the current test data without changing it.
2. Complete branch/date-range coverage for `FIN-01`; retain `RPT-001` for the
   final defect report and do not fix it before approval of the audit.
3. Use an upload-capable browser session to complete the `DOC-01` controlled
   upload/search/open/link check against `E2EL260901` and `UPL-01` actual
   file-validation/import check; do not delete any test document or imported
   record without explicit confirmation.
4. Complete the isolated `INV-002` API integration test and preserve the
   historic controlled ₦1 entry, invoice, AR balance, and Financial Ledger
   evidence for later correction. The deployed payment guard has passed its
   live UI verification, so further explicitly authorised financial tests may
   use only labelled E2E records and the controlled Lagos test bank.
5. Trace and correct `SCHED-001` only after the audit is approved; meanwhile,
   retain the controlled schedule and bank record as evidence and continue the
   remaining non-destructive lifecycle checks.
6. Obtain separate authenticated sessions or test credentials for at least one
   restricted profile and one branch-scoped profile before `SEC-01` can pass.
7. Execute the operational, documentation, financial, reporting, security,
   and UI cases in `docs/LIVE_E2E_TEST_REGISTER.md` in dependency order.
8. Update the defect log and project state after every verified result.
9. Produce a final audit report before any corrective implementation begins.

## Workstream Status

### Financial Reporting and Dashboard

- Reports use declared financial bases rather than silently mixing figures.
- P&L supports accrual revenue and budgeted or actual-paid container costs.
- Operational Dashboard remains a budgeted operational estimate.
- Financial Dashboard is a separate view that reuses the existing P&L request
  with `actual_paid` cost basis. It must match P&L for the same branch and
  period; do not duplicate its formulas in Dashboard.
- Related commits: `134458c`, `0f63688`, `c06d356`.
- 2026-09-02 dashboard re-check: Lagos scope correctly contains its two
  controlled containers. Financial View reconciles to its stated P&L basis
  at ₦2,000 accrual revenue, ₦200 actual container cost, ₦300 actual overhead,
  and ₦1,500 true net profit. This reconfirms `FIN-002`: the verified ₦200
  duty payment is absent from its actual container costs. Operations View
  still includes the cancelled invoice, reconfirming `DASH-001`.

### Live Bank Reconciliation

- 2026-09-02 read-only verification: `E2E-20260901 Lagos Test Bank` has six
  visible transactions, with ₦2,001 credits minus ₦700 debits producing its
  ₦1,301 closing balance. Its exact-reference search finds the controlled
  ₦200 duty payment. The same statement confirms the existing `SCHED-001`
  defect: the approved and paid ₦500 payment schedule is not a bank debit.
- No bank transaction was posted, edited, disabled, or deleted during this
  check. Branch and duplicate-entry tests are still pending.
- `BANK-002` was identified during the same check: Bank Statement Type filters
  omit Duty Payment even though it is a visible transaction type, and Clear
  filters does not reset an entered search term. This is a Low-priority
  financial-investigation usability defect; no financial amount is affected.

### Payment Schedule Views

- 2026-09-02: the controlled Lagos ₦500 schedule correctly remains Paid with
  a zero balance in Completed Schedules. `SCHED-002` is a new Low-priority
  UI/reporting defect: branch badges do not follow the selected schedule view.
  Completed shows six records but badges totaling seven; Cancelled shows zero
  records but the same badges.

### Container Payment Views

- 2026-09-02: the selected controlled container correctly shows its ₦200
  Shipping payment and its +₦200 variance against a zero charge budget.
  `CP-002` is a Low-priority landing-page message defect: the page initially
  says no payments exist, then reveals them after a container search.

### Overhead Expense Views

- 2026-09-02: the controlled ₦300 Lagos direct overhead is correctly shown as
  Paid and the Paid filter returns it. `OH-002` is a Low-priority refresh UI
  defect: initial load shows unexplained dashes and no records before the
  data arrives.

### Duty Payment Views

- 2026-09-02: the Duty Payments Partial filter correctly returns the one
  controlled record with ₦400 assessed, ₦200 paid, and ₦200 outstanding.
  No assessment, payment, approval, or reversal was made during the check.

### Accounts Receivable Branch Scope

- 2026-09-02: Receivables branch isolation passes. The Lagos scope contains
  only the controlled Lagos client, its ₦2,000 invoiced/₦2,001 collected/
  ₦0 outstanding/₦1 credit values; Abuja correctly shows no receivable client
  or amount. All Branches was restored after the read-only check.

### Analytics Re-check

- 2026-09-02: Analytics correctly limits its Lagos operational metrics to two
  controlled containers and labels those metrics as budgeted. It also confirms
  `INV-002` in another module: ₦2,001 collected versus ₦2,000 invoiced is
  capped at a 100% collection rate without explaining the ₦1 credit. All
  Branches was restored after the check.

### Client Financial Display

- 2026-09-02: `CLT-001` identified. The controlled Lagos client list and
  detail/wallet count cancelled `INV-202609-002` as ₦1,000 owed, yielding
  ₦3,000 invoiced and ₦999 outstanding. Accounts Receivable correctly shows
  ₦2,000 invoiced, ₦0 outstanding, and ₦1 credit. This extends the existing
  cancelled-invoice reporting problem into client-facing financial screens.

### Container Branch Scope

- 2026-09-02: Container Directory branch isolation passes. Lagos shows exactly
  controlled `E2EL260901` and `E2ED260901`; Abuja shows exactly pending
  verification `E2EA260901`. The global selector was returned to All Branches
  after the check.

### Branch-Scoped Creation Re-check

- 2026-09-02: A duplicate-container validation attempt selected the existing
  controlled Abuja container number and B/L plus the visible
  `E2E-20260901-Abuja` branch. The server nevertheless returned HTTP 400
  `Select a specific branch to create records.` No duplicate or other record
  was created. This confirms that `BRN-001` also blocks container creation
  when the global scope is All Branches, and prevents the remaining duplicate
  validation check from running.

### Container Print Summary

- 2026-09-02: Print summaries for controlled containers 25 and 26 are not
  reliable. They omit core identity values, render `Invalid Date`, and repeat
  the record's branch ID as a currency value in each charge section. Source
  tracing confirms a frontend/API field-shape mismatch and incomplete metadata
  filtering. High defect `CONT-RPT-001` is open; do not treat these printouts
  as valid reports until it is fixed and re-tested.

### Controlled Container Verification

- 2026-09-02: The dedicated Abuja controlled record `E2EA260901` (ID 25) was
  verified from Pending Verification. It changed to Registered, recorded
  `christian ifeanyi` with the verification time, and appeared in the
  Documentation Active queue. The Directory no longer displays a pending
  verification banner and Dashboard Recent Containers displays it as
  Registered. It still has zero charges, no invoice, no documents, no
  payments, and no delivery date. This was a deliberate, non-financial
  workflow test; do not progress it further without recording the next
  explicit test case.

### Controlled Approval Rejection

- 2026-09-02: `E2EA260901` was submitted for a Full Container Review and then
  rejected with the recorded reason `E2E test rejection: no charge sections
  were submitted.` No charges, invoice, payment, or external message were
  created. Reloading Approval Queue correctly moved the record from Pending
  Review to Recently Reviewed with a Rejected label. `APR-001` is open because
  the queue stayed visually stale immediately after the successful rejection
  until a page reload.
- The controlled container Audit Trail independently records the verification,
  review submission, and rejection actions, including actor, timestamp, and
  rejection reason. This audit-evidence path passed its live check.

### Operations Visibility

- 2026-09-02: After verification, `E2EA260901` is present in Documentation
  Active and on the Operations Board in its parallel Transire Processing,
  Shipping, and Terminal lanes. It has no owner or next action set there. This
  is expected independent-stage visibility, not duplicate creation; no board
  action was taken.

### Stage Separation Re-check

- 2026-09-02: The newly verified `E2EA260901` renders independently in the
  Transire, Shipping, and Terminal workspaces. Each has its own expected-date
  label and an Unassigned owner, with no carry-over value from another stage.
  Pull-Out correctly excludes the job before Terminal/TDO release. No stage
  owner, date, or release action was changed during this check.

### AI Assistant Exact-Record Check

- 2026-09-02: The read-only AI query `Show me E2EA260901.` returned the
  controlled Abuja job's correct client, Registered workflow state, unset
  stage data, and one cited record. Its cited-record control opened the
  matching `/containers/25` detail page. No business record was changed.
- 2026-09-03: the exact schedule query `Show the payment schedule for
  E2E-20260901 Scheduled Test Vendor.` failed. Instead of the controlled
  completed ₦500 schedule, the assistant answered the generic
  approved-schedules question and cited unrelated ₦25,000 schedule `tuykguh`.
  High `AI-005` is open. Exact named payment-schedule requests must resolve to
  the named record with matching status/amount evidence, or explicitly say
  that no exact record was found.
- The generic read-only transfer question passes: `Show recent bank transfers.`
  returned the one controlled ₦1 transfer, its exact source and destination
  E2E bank accounts, date, reference `E2E-20260903-BANK-TRANSFER-001`, and one
  matching cited record.
- The AI outstanding-duty query passes against the live Duty Payments totals:
  ₦2,000,401 assessed, the same amount paid, ₦0 outstanding, and zero unpaid
  duty containers. The empty result appropriately has no individual record to
  cite; direct Duty Payments verification shows the same values.
- AI current-briefing generation works with a specific branch: controlled
  Lagos refreshed to a 2026-09-03 briefing with zero configured exceptions.
  With All Branches selected, however, the enabled button failed with HTTP 400
  requiring a specific branch and left an August 19 briefing labelled Current.
  Medium `AI-006` is open: consolidated mode must be supported or prevented
  clearly, and stale content must be labelled after a refresh failure.
- High `AI-007` is open: the controlled `E2E-20260903-document-upload.csv`
  remains visibly linked to `E2ED260901` and labelled Searchable in the Lagos
  Documents tab, but the AI exact filename query returns zero indexed
  documents. Trace the searchable-document index and AI branch scope before
  relying on the assistant for document retrieval.
- AI controlled-action safety check passed for a deliberately labelled ₦1
  Lagos payment-schedule preview. It displayed Preview only and required
  `Confirm and execute` before it could create a normal pending-approval
  schedule. Cancelling the draft left zero matching schedules in the live
  Payment Schedule module; no payment or financial record was created.

### Live Test Cycle Closeout (2026-09-03)

- The complete live acceptance-test cycle is closed as **complete with defects
  and documented blockers**. All safe controlled paths were exercised and
  reconciled. The project must now move to fixing the logged defects and then
  targeted re-testing, rather than creating more production records merely to
  force coverage of unsafe duplicate or reversal scenarios.
- The remaining terminal blockers are isolated cross-role sessions, native
  manual due-date behavior, the delivery-date persistence failure `DEL-001`,
  duplicate bank-reference safety, a dedicated approved duty-reversal case,
  browser-surface file retrieval, and valid user-creation double-submit.

### AI Stage-Owner Reconciliation

- 2026-09-02: The AI correctly found delayed Transire job `HLCU8765432` and
  its expected date, but incorrectly named `Jdjdh` as the Transire owner. The
  dedicated Transire workspace shows Unassigned; only the generic Operations
  detail shows `Jdjdh`. High `AI-002` is open: the AI is reading the stale
  generic owner instead of the authoritative stage-specific owner. This is
  connected to existing `OPS-001` and must be fixed before relying on AI
  ownership recommendations.

### AI Terminal, Tasks, and Report-Draft Checks

- 2026-09-02: The AI terminal question passes: it correctly defines physical
  Terminal as Gate-In, Examination, and Final Release, returning zero and
  separating the nine open containers from Terminal occupancy.
- The AI task tool correctly reports zero actual open/overdue/high-priority
  tasks. The My Tasks page still displays all nine containers with blank
  review values, confirming `TASK-001` is a screen-design/data-source issue.
- High `AI-003` is open: the AI monthly finance draft counted Draft and
  Cancelled invoices as issued finance activity. Do not use its invoice count
  or issued-value result for management reporting until its status filtering
  is corrected and reconciled.
- The AI financial-control review correctly detects the existing controlled
  ₦1 invoice overpayment and cites its invoice. Direct invoice verification
  confirms the same ₦2,001 paid against a ₦2,000 total. This read-only control
  path passed; it created no payment or workflow action.

### Notification and AI Reconciliation

- 2026-09-02: read-only notification review confirms two live views: 7 active
  System Alerts and 67 unread Workflow History events. No alert card was
  opened and no item was marked read.
- High `AI-004` is open: a prior AI response reported 60 visible notifications,
  48 unread, and 14 types without identifying a source or reconciling to either
  live notification view. AI notification answers must name their scope and
  use the same count logic as the application.
- Medium `NOTIF-002` is open: Workflow History contains repeated identical
  payment-schedule events for the same transition. Preserve the existing audit
  history while tracing the duplicate event creation/query path.

### Container Dashboard Counter Reconciliation

- 2026-09-02: the consolidated Operations Dashboard reports 9 Total
  Containers, 9 In Progress, 0 Completed, and 0 Containers in Terminal. This
  matches the current container population and the established physical
  Terminal definition. It does not resolve the separate financial dashboard
  inconsistencies (`DASH-001` and `FIN-002`).

### Critical Invoice Payment Guard

- 2026-09-03: `INV-002` remediation is implemented locally. The invoice-payment
  API now locks the invoice, recalculates its live outstanding balance, and
  returns a validation error before inserting anything when the invoice is
  already paid or the requested amount exceeds the balance. The invoice-detail
  page no longer offers Record Payment at a zero balance.
- The deployed application was checked read-only with paid `INV-202609-001`:
  Record Payment is no longer rendered. No request was submitted and no live
  financial data changed during this verification.
- The regression test covers both an above-balance attempt and a second payment
  after settlement, confirming that neither should create an additional payment
  row. Full workspace typecheck plus the production frontend and API-server
  builds pass. The integration suite needs an isolated `TEST_DATABASE_URL`; it
  was deliberately not run against production. Deploy and verify one controlled
  rejected request before resuming financial writes.

### Documentation Search

- 2026-09-02: Documentation workspace search correctly isolates controlled
  `E2EL260901` after the active list loads. Actual document upload, open, and
  link verification remains blocked only by the current browser automation's
  inability to provide a file to the operating-system picker.

### Upload Data

- 2026-09-02: The Upload Containers screen renders both General and
  Customer-Linked import modes, its CSV/XLSX 10 MB constraint, file picker,
  format guide, and template-download control. The guide correctly identifies
  Customer Name, Container Number, and Bill of Lading as required columns. An
  actual file validation/import remains blocked by the browser-control
  environment's lack of OS file-picker input; no records were created.

### Usability Check

- 2026-09-02: A focused Container Directory desktop check found a labelled Add
  Container dialog with clear required-field validation. Empty submission kept
  the user in the dialog, showed the missing fields, and created no record.
  This is only partial UI coverage: mobile layout, keyboard-only navigation,
  repeated-submit protection, and the other module dialogs remain to test.

### Invoice Lifecycle

- Draft invoices are editable; issued invoices preserve their audit trail.
- Zero-value invoices cannot be issued.
- Payment, due date, cancellation, and write-off rules are protected by the
  backend, not only by the screen.
- Draft and cancelled invoices are excluded from active receivables and the
  relevant financial reports.
- Related commit: `956d965`.
- 2026-09-02 live re-check: the controlled paid invoice now visibly shows all
  three payment records and ₦2,001 Total Paid against its ₦2,000 total. This
  improves the evidence trail but does not resolve `INV-002`: Record Payment
  remains enabled at zero outstanding and the extra amount is not presented as
  an explicit, confirmed customer-credit/deposit workflow.
- The controlled cancelled invoice correctly blocks collection from its detail
  page. Its on-screen promise that cancelled invoices are excluded from active
  receivables and financial reports is not yet true across the application:
  the Invoice Aging and Client Statement defects remain recorded as `AR-002`
  and `STMT-001`.
- The Invoice status picker correctly narrows the list to the controlled
  cancelled invoice. Overdue and written-off lifecycle coverage still requires
  suitable controlled cases and must not create new live financial records
  until the remaining lifecycle cases have suitable, clearly labelled E2E
  records.
- 2026-09-02 invoice branch isolation passes: Lagos scope exposes only the two
  controlled Lagos invoices and Abuja scope exposes none. The browser was
  restored to All Branches after the check.

### Controlled Write-Test Continuation

- 2026-09-03: `E2ED260901` received its final controlled duty payment of ₦200
  from `E2E-20260901 Lagos Test Bank` with reference
  `E2E-20260903-DUTY-001-FINAL`. The duty record now shows ₦400 paid, ₦0
  outstanding, and Paid. The bank statement independently shows the exact ₦200
  debit; its reconciled balance changed from ₦1,301 to ₦1,101.
- The controlled paid schedule has no Pay control in Completed Schedules, which
  confirms the normal duplicate-payment UI route is blocked. It does not
  resolve `SCHED-001`: the existing ₦500 schedule payment is still absent from
  Financial Ledger and cash-flow reporting.
- The existing controlled ₦1 scheduled-overhead payment is correctly linked at
  the schedule level: Completed Schedules identifies `Source: Overhead Expense`,
  names `SYSTEM E2E TEST OVERHEAD - DIRECT AND SCHEDULE - DO NOT PROCESS`, and
  shows ₦1 requested, ₦1 paid, and a ₦0 balance. The remaining defect is the
  shared scheduled-payment financial-ledger and cash-flow omission in
  `SCHED-001`, not the overhead-to-schedule relationship.
- The paid ₦300 E2E overhead has no Pay Now action. A separate labelled ₦1
  overhead deletion candidate was created and deleted after its explicit
  warning; it disappeared, the outstanding total returned to ₦0, and the paid
  overhead remained unchanged. This confirms the tested delete path only
  removed the purpose-created E2E record.
- The 2026-09-03 report follow-up passes for the completed duty lifecycle:
  Duty Payment Ledger shows both labelled ₦200 payments, Financial Ledger
  shows both references within seven total entries and ₦900 money out, and
  Duty Reconciliation confirms `E2ED260901` at Snapshot ₦400, Ledger ₦400,
  Matched.
- `E2EA260901` was resubmitted for Full Container Review. A controlled Approve
  attempt correctly remained pending until the backend's required release
  fields existed: Documentation/PAAR, Transire, Shipping/DO, Terminal/TDO, and
  Pullout. This is a valid readiness block, not an approval-write failure. The
  same E2E record then completed those prerequisites and one final Approve
  action succeeded, moved the queue entry to Approved, and closed the record.

### Completed Controlled Workflow

- 2026-09-03: the Abuja E2E container `E2EA260901` completed the live
  operational acceptance path. It advanced from Registered through
  Documentation to Duty Payment, then recorded `E2E-PAAR-260901` with a
  Documentation owner and PAAR release date. Independent stage owners and
  releases were saved for Transire, Shipping/DO, Terminal/TDO, and Pullout.
- The final Full Container Review first refused approval while those releases
  were absent, then succeeded as soon as all prerequisites existed. Approval
  Queue immediately removed the item from Pending Review, showed Approved in
  Recently Reviewed, and `/containers/25` now reports Closed. This confirms
  the intended readiness guard and success path together.
- The Pull-Out release action itself succeeded, but its workspace still showed
  Active (0) and Released (0) immediately afterward. This is a fresh live
  reproduction of existing `OPS-002`, not a failure of the stored release.
- The generic container detail's Stage Control now displays the Documentation
  owner after the independent stage owners were saved. It remains
  non-authoritative legacy presentation covered by `OPS-001`; department
  workspaces are the authoritative source for stage ownership.

### Controlled Bank Transfer

- 2026-09-03: created the zero-balance, Lagos-scoped E2E-only account
  `E2E-20260903 Lagos Transfer Destination` for the remaining internal
  transfer acceptance check. It is separate from operational and customer
  money.
- A controlled ₦1 transfer from `E2E-20260901 Lagos Test Bank` used reference
  `E2E-20260903-BANK-TRANSFER-001`. The transfer list, source statement, and
  destination statement agree: source is ₦1,100 after its ₦1 Transfer Out and
  destination is ₦1 after its ₦1 Transfer In. The reference is retained as
  auditable test evidence.

### Controlled Invoice Cancellation

- 2026-09-03: created `INV-202609-003` only to verify the live invoice
  Draft-to-Sent-to-Cancelled path against `E2ED260901`. The note clearly marks
  it as an E2E-only invoice, not a customer receivable.
- It remains visible as Cancelled for audit purposes. Accounts Receivable
  correctly excludes it: Lagos still reports ₦0 outstanding and only the
  original paid invoice in its eligible population. Due-date/overdue testing
  remains a manual-browser acceptance item because the current browser driver
  did not preserve a typed date value in the creation form.

### Mobile Interface Re-check

- 2026-09-03: at a 390x844 viewport, the Invoice list reflowed into a
  readable single-column card layout without observed horizontal page overflow.
  The New Invoice, search, status filter, and record controls remained visible.
- The mobile Create User dialog retained all labelled controls and its Close,
  Cancel, and Create User actions within the viewport. `No users found` under
  the selected Lagos branch was expected; All Branches correctly showed the
  one active owner and seven disabled historical accounts. The same dialog
  closes correctly with Escape on desktop.
- Two consecutive empty Create User submissions retained one set of clear
  field-level errors and did not create an account. A valid double-submit is
  intentionally not exercised against production because it could create a
  live account; it remains a separate UI test gap.

### Controlled Document Upload

- 2026-09-03: a non-sensitive 107 B CSV named
  `E2E-20260903-document-upload.csv` was uploaded in the General section of
  controlled container `E2ED260901`. The record shows Searchable, the correct
  uploader, and the upload date, which confirms live file upload and document
  linking.
- Its row opens the stored-document dialog and exposes Open document. This
  browser session did not produce a new tab or download after that final
  action, so only file retrieval remains environment-limited; no app defect is
  recorded from that limitation.

### Controlled Import Validation

- 2026-09-03: the same non-sensitive E2E CSV was selected in Upload Containers
  General mode to test live validation without an import. The preview returned
  `Missing required fields (CON or B/Lading)`, reported 0 records ready, and
  disabled the import action. No container was created.

### Delivery Persistence Blocker

- 2026-09-03: the Date Delivered field on closed controlled container
  `E2EA260901` visibly accepted `2026-09-03` and returned `Delivery date
  saved.`, but the record reverted to `Not yet recorded` after each reload.
- The scoped Abuja Dashboard still lists the record as Closed while reporting
  Completed 0. This is documented as high-priority `DEL-001` and blocks the
  final delivered-stage acceptance check until the save path is corrected.

### Department Workspaces

- Architecture stores separate owner fields for Documentation, Transire,
  Shipping, Terminal, and Pullout.
- Automated tests confirm owner-field separation and no cross-stage carryover.
- 2026-09-02 read-only live re-test confirms the controlled Lagos job retains
  the correct independent owner in Documentation, Transire, Shipping, and
  Terminal, and those workspaces render their Active and submitted/released
  views. Pull-Out remains incomplete: its Released tab reports zero despite
  the controlled job having an existing Pull-Out release. `OPS-002` remains
  open. Expected-date browser-entry still requires a supported manual-browser
  acceptance test. Document upload has since been verified separately.

### AI Assistant

- Existing foundation includes governance, approved read tools, business
  glossary, conversation context, evidence links, report/document drafts,
  controlled action drafts, and evaluation controls.
- Do not start a new AI redesign from scratch. When resumed, review
  `docs/Smart_AI_Assistant_Plan.txt`, `artifacts/api-server/src/lib/ai-business-definitions.ts`,
  and `artifacts/api-server/src/routes/ai-assistant.ts` first.
- AI work is paused until the Financial Dashboard and deferred live acceptance
  checks above are complete.

### Roles and Permissions

- Legacy role authorization was retired after a staged migration to access
  profiles and workspaces.
- Preserve the rollback checkpoints listed above and retain auditability for
  user-access changes.
- 2026-09-02 continuation check: the authenticated owner session remains
  healthy after production account cleanup. User Management loads with
  `ijehifeany@gmail.com` as the sole Active Super Admin and all seven former
  test/legacy accounts Disabled. The owner can still see the full operations
  and administration navigation. This is a current-session verification only;
  a fresh owner sign-out/sign-in remains a later acceptance check.

## Verification Rules

- Local build success is not live deployment success.
- Live deployment success is not end-to-end business acceptance.
- Financial figures must be checked against the same P&L branch scope and date
  range before being described as reconciled.
- Production testing must use read-only checks unless a reversible controlled
  test record is explicitly required and recorded.

### Financial Integrity Remediation: Steps 1 and 3 (2026-09-03)

- Step 1 was re-verified. The invoice-payment API locks the invoice and
  recalculates its outstanding amount before a payment row can be inserted.
  It rejects both a payment against a fully paid invoice and an amount greater
  than the live outstanding balance. The paid-invoice UI also hides Record
  Payment when no amount remains. The existing API regression coverage passed.
- The historic `INV-202609-001` extra N1 collection remains intentionally
  untouched. It is an already-posted production accounting fact, not a new
  application behaviour. Reversing or reallocating it requires the real
  customer/bank evidence and an explicitly authorised credit-note or correction
  workflow; this release does not silently mutate live financial history.
- Step 3 is implemented for future financial activity. The new immutable
  `payment_schedule_payments` table records each paid standalone schedule with
  its amount, payment date, method, bank, reference, notes, and recorder.
  Overhead-linked schedules continue to use the existing expense-payment
  ledger, preventing double counting.
- Actual-paid P&L, Branch Comparison, Disbursement Reconciliation, Cash Flow,
  Financial Ledger, and Bank Management now use the aligned sources: container
  expense payments, customs-duty payments, overhead payments, and standalone
  schedule payments. Duty now contributes to Customs actual cost.
- Startup migration `payment_schedule_payments_v1` creates the new table and
  indexes once when the deployed API starts. A production deployment and a
  controlled new standalone-schedule payment re-test are still required before
  marking `FIN-002` and `SCHED-001` fully live-verified.
- The historic paid N500 controlled schedule remains without a reconstructed
  immutable payment row because its actual payment evidence was not supplied to
  this change. Its correction must use the actual bank, date, reference, and
  approval evidence; no financial details are invented.

### Workflow and Reporting Remediation: Steps 4-6 (2026-09-03)

- Step 4: Invoice issuing now prevents the invalid zero-value action in the
  interface and explains why it is unavailable. The API validates a supplied
  due date as a real `YYYY-MM-DD` calendar date and locks it, like invoice
  amounts, once an invoice has been issued. Draft, sent, partial, paid,
  cancelled, and written-off status rules remain server-controlled.
- Step 5: The generic Operations detail page now saves Transire, Shipping,
  Terminal, and Pull-Out owners through the existing stage-action endpoint.
  Each save therefore reaches the stage-specific owner field instead of the
  legacy shared `stageOwner` field. The pipeline also retains a released
  Pull-Out work item so the Pull-Out workspace can put it in its Released tab.
- Step 6: P&L now calculates average recognised profit using invoiced
  containers only and includes immutable overhead-payment rows even if their
  parent expense record is unavailable. Operational reports explicitly label
  their costs and profit as budgeted. The VAT printable route now obeys React
  hook ordering. Container printouts now normalise the detail API response,
  exclude metadata such as branch ID from money rows, and label their figures
  as budgeted rather than actual-paid.
- Verification before commit: API typecheck passed, frontend typecheck passed,
  and all 69 API tests passed. A production deployment and targeted re-tests
  are still required for `INV-001`, `OPS-001`, `OPS-002`, `RPT-001`, `RPT-002`,
  `RPT-003`, `VAT-001`, and `CONT-RPT-001` before their live-test entries are
  marked resolved.

### Approved Remaining Remediation Roadmap: Steps 6-11 (2026-09-03)

- **Step 6 completion: Consistent cancelled-invoice financial population.**
  Centralise the eligible invoice rule so cancelled invoices remain visible as
  audit history but have zero financial effect in Dashboard (`DASH-001`),
  Invoice Aging (`AR-002`), Client Statement (`STMT-001`), and Client/Wallet
  totals (`CLT-001`). This is remaining finance-consistency work, not a new
  standalone roadmap step.
- **Step 7: Correct branch scope.** Fix `BRN-001`: forms must create in the
  selected authorised branch, use the effective branch as their displayed
  default, surface actionable validation errors, and preserve branch isolation
  in all figures.
- **Step 8: Make AI answers trustworthy.** Fix `AI-002` stage-owner sourcing,
  `AI-003` invoice eligibility in finance drafts, `AI-004` notification
  counts, `AI-005` exact schedule lookup, `AI-006` All Branches briefing
  behaviour, and `AI-007` searchable-document retrieval.
- **Step 9: Fix workflow visibility and persistence.** Fix `NOTIF-001` alert
  taxonomy, `NOTIF-002` duplicate history events, `TASK-001` assigned-work
  queue, `APR-001` stale rejection view, `PIPE-001` released Terminal action
  display, and `DEL-001` delivery-date persistence and Dashboard completion.
- **Step 10: Fix smaller finance and UI problems.** Fix `BANK-002` statement
  filters/reset, `SCHED-002` selected-tab counts, `CP-002` loading/empty copy,
  and `OH-002` refresh loading presentation.
- **Step 11: Complete controlled verification.** Use approved controlled test
  records to verify overdue invoice behaviour with native date entry, duty
  reversal, duplicate bank-reference prevention, document retrieval outside
  the current browser limitation, and cross-role restrictions with separate
  non-production accounts.

### Remediation Follow-up: Steps 6-8 (2026-09-03)

- **Step 6 completion - implemented locally; deployment reconciliation
  required.** The shared eligible-invoice rule now excludes draft, cancelled,
  and written-off invoices from Dashboard invoice totals, Client list/detail
  totals, and wallet liability while retaining their audit records. Reconcile
  Dashboard, AR, Client Statement, Wallet, and P&L under one branch scope.
- **Step 7 - implemented locally; branch creation re-test required.** Create
  endpoints honour an explicitly selected authorised branch for a Super Admin
  in All Branches mode, reject invalid or unauthorised selections, and Client,
  Container, and Invoice forms initialise to the effective active branch.
- **Step 8 - implemented locally; AI evidence re-test required.** AI reads
  stage-specific owners, uses eligible finance invoices, identifies its
  notification view as Workflow History, performs exact schedule lookup,
  blocks false All Branches briefing refreshes, and searches indexed filenames
  as well as document text. Re-test `AI-002` through `AI-007` after deploy.
- **Verification before commit:** API typecheck passed, frontend typecheck
  passed, the API test suite passed (70 tests), and `git diff --check` passed.
  No live deployment verification has been recorded for these changes yet.

### Remediation Follow-up: Steps 9-11 (2026-09-03)

- **Step 9 - implemented locally; deployment re-test required.** Notifications
  now recognise operational due-date alerts instead of falling back to a profit
  label. Payment schedule decisions and stage releases reject repeat transitions
  so one user action cannot create another history event. My Tasks now derives
  its container list from open tasks assigned to the current user, and Approval
  Queue updates its cached row immediately before refetching. Recording a
  delivery date now also records delivery status and invalidates the Dashboard
  and container lists; the API refuses to report success if the date is absent
  from the returned persisted row.
- **Step 10 - implemented locally; UI re-test required.** Bank statement Clear
  filters now also clears the search term. Payment Schedule tab labels use
  server-provided bucket counts from the same filtered scope. Container
  Payments shows a loading state before an empty state, while Overhead Expenses
  retains the last verified result during a refresh and labels the refresh.
- **Step 11 - verification controls implemented; execution remains blocked.**
  `docs/CONTROLLED_VERIFICATION_RUNBOOK.md` defines the required isolated
  non-production records, reload checks, reversals, and role sessions. No
  production write was made for the overdue-date, duty-reversal, duplicate-bank
  reference, document-retrieval, or cross-role tests.
- **Verification before commit:** workspace typecheck passed, frontend
  typecheck passed, API typecheck passed, API suite passed (70 tests), and
  `git diff --check` passed. Deployment and the controlled re-tests described
  above remain required.

### Authorised Live Test Continuation (2026-09-04)

- The owner confirmed that the deployed data is test-only and authorised
  controlled dummy records for end-to-end verification. Every new record must
  remain clearly labelled `E2E verification only` and be captured in
  `docs/LIVE_E2E_TEST_REGISTER.md`.
- **TD-03 passed:** created `INV-202609-004` (ID 11) for `E2ED260901` with a
  native past due date of 2026-08-01. Sending it produced Overdue status, which
  persisted after reload. Accounts Receivable reported N1,000.00 gross overdue
  and N999.00 net receivable after the existing N1.00 credit. The Dashboard
  reconciled to N3,000.00 invoiced, N2,001.00 collected, and N999.00
  outstanding under the same E2E branch. Invoice Aging Report also listed the
  record in 31-60 days, 34 days overdue, with N1,000.00 outstanding.
- **DUTY-002 discovered:** controlled assessment and payment for `E2EL260901`
  persisted at N100.00 under reference `E2E-20260904-DUTY-REVERSAL-001`, but
  the application has no duty-payment reversal route or user action. A reversal
  test cannot continue until the system supports a traceable immutable reversal
  entry that reconciles the Duty, Bank, Ledger, Cash Flow, and P&L views.
- **BANK-003 discovered:** the transfer and fund-addition API routes insert
  optional references without checking for an existing reference. A duplicate
  runtime write was not attempted because the source confirms the missing
  protection; add validation before re-testing it.
- **DOC-01 / AI-007 passed; AI-008 discovered:** uploaded
  `E2E-DOCUMENT-RETRIEVAL-20260904.txt` to `E2EL260901`, verified its direct
  stored link, and confirmed AI exact search retrieves its indexed filename and
  contents. The AI citation opens the correct Documents tab but incorrectly
  labels the available target as `Page unavailable`.
- **USER-001 discovered:** User Management reports one active modern access
  profile but lists no users, including the signed-in owner Super Admin. Repair
  the user listing and account inventory before depending on it for cross-role
  verification.
- **SEC-01 partial pass:** created and signed into the dedicated Documentation
  test account for E2E Lagos. It reaches Documentation but is redirected from
  both `/users` and `/banks`, which confirms those restricted surfaces are
  denied. The remaining role accounts require the owner Super Admin session to
  be restored; the owner password is intentionally not stored in project files.
- **Next exact action:** repair `USER-001`, then create and execute cross-role
  tests using clearly labelled E2E accounts. Implement `AI-008`, `BANK-003`,
  and `DUTY-002` before attempting their blocked or failed cases again.

### Cross-Role Continuation (2026-09-04)

- **`USER-001` re-test passed.** A fresh Super Admin session showed the owner
  and test accounts, 9 modern profiles, and 0 legacy access paths. The earlier
  empty User Management table was not reproduced.
- **Created controlled E2E role accounts** in E2E Lagos for Accounts, Terminal
  Manager, Delivery / Transport, Branch Admin, and Operations. Credentials are
  deliberately excluded from repository files. The Accounts, Terminal, and
  Delivery accounts landed in their intended workspace; Branch Admin stayed
  branch-scoped; Operations required explicit workspace choices and, with
  Transire plus Shipping selected, correctly exposed only those workspaces.
- **New High finding `SEC-02`: route authorisation is incomplete.** The UI
  hides financial modules from Delivery, Terminal, and Operations Staff, but
  direct `/invoices` navigation still renders invoice totals, customer names,
  payment collection values, and overdue balances for their authorised branch.
  `artifacts/cost-analysis/src/App.tsx` applies admin guards to a few routes
  but renders `/invoices` and many other module routes without a capability
  guard. Navigation hiding is therefore not access enforcement.
- **Next exact action:** implement a reusable modern-profile route guard,
  apply it to every sensitive route, add allow/deny route tests, deploy, then
  repeat `SEC-02` with the current E2E role accounts. Do not run more
  departmental financial writes until this High issue is closed.

### SEC-02 Remediation (2026-09-04)

- **Implemented locally; deployment re-test required.** `finance.access` now
  permits the existing Branch Admin authority and the Accounts job function.
  `requireCapability` and `requireFinanceAccess` enforce that policy at the
  backend API boundary for invoices, payment schedules, reports, banks,
  overhead expenses, and container payments. Direct API calls can no longer
  rely on a hidden sidebar link as their only restriction.
- The frontend now derives `canAccessFinance` from the same modern profile.
  Finance pages and printable finance routes use a shared guard that redirects
  denied users to their assigned workspace. Workspace routes themselves now
  verify the exact assigned workspace, while User Management, Approvals,
  Pipeline, and generic Operations require administrative authority.
- **Verification before commit:** workspace type check passed; API suite
  passed (71 tests); web production build passed; server build passed; and
  `git diff --check` passed.
- **Next exact action:** push and deploy, then re-test `SEC-02` using the
  existing Delivery, Terminal, Operations, Accounts, and Branch Admin E2E
  accounts. Mark the issue closed only after both denied URL/API access and
  permitted finance access are observed live.

### Deployment Build Correction (2026-09-04)

- Railway rejected commit `b772158` before deployment because
  `payment-schedules/index.tsx` used an untyped `{}` fallback for
  `bucketCounts`; TypeScript therefore could not index it with a
  `PaymentScheduleBucket`. Production remains on the prior successful build,
  so `SEC-02` is not yet closed.
- The fallback now has the explicit type
  `Partial<Record<PaymentScheduleBucket, number>>`. The precise local Railway
  checks now pass: cost-analysis type check and production build. The existing
  server build had also passed before this frontend-only correction.
- **Next exact action:** commit and push the narrow build correction; confirm
  Railway marks it active; then repeat the denied Operations `/invoices` URL
  and API checks plus the allowed Accounts and Branch Admin finance checks.

### SEC-02 Scope Completion: Client Data (2026-09-04)

- During the live Delivery re-test, the corrected `/invoices` route redirected
  to Delivery Workspace as intended, but direct `/clients` still displayed an
  owed client balance and an `Add Client` control. This contradicted the
  Delivery quick-start promise that client records are unavailable.
- The same `finance.access` policy now protects the Clients router and both
  client web routes. This is an extension of the existing finance capability,
  not a new role or parallel permission model.
- **Local verification:** cost-analysis type check passed and API suite passed
  (17 files, 71 tests). Deploy and re-test Delivery `/clients` before closing
  the full route-authorisation finding.

### SEC-02 Live Verification Complete (2026-09-04)

- Railway deployed `b9942b9` successfully. The exact previously exposed
  direct URLs were re-tested with the existing E2E accounts: Operations,
  Terminal, and Delivery now redirect from `/invoices` to their assigned
  workspaces; Delivery also redirects from `/clients` to Delivery Workspace.
  No invoice totals, client balances, or create controls are shown.
- The Accounts E2E user still opens `/invoices` successfully, confirming the
  finance rule preserves intended Accounts access. The Branch Admin allowance
  is covered by the shared policy test and deployed capability rule.
- **Residual verification gap:** this browser environment blocks direct
  `/api/*` navigation, so an authenticated live API 403 response was not
  captured here. The deployed API middleware, successful production build,
  type check, and 71-test API suite provide code-level coverage; repeat the
  direct API request from a browser without that limitation when practical.
- **Next exact action:** continue the remaining documented controlled
  verification items (`DUTY-002`, `BANK-003`, and `AI-008`) from the live E2E
  register. Do not treat the browser API limitation as evidence of an access
  bypass.

### DUTY-002 Implementation: Immutable Duty Payment Reversal (2026-09-04)

- Implemented a true duty-payment reversal. The original payment remains
  immutable; a single linked negative transaction is created with a mandatory
  reference, reason, reversal date, user, and audit-log record. A database
  constraint prevents zero entries, invalid entry types, orphan reversals, and
  a second reversal of the same payment.
- The reversal atomically restores the Customs duty balance and uses the
  original cash or bank source. Duty history now exposes a History action and
  an explicit Reverse action only for unreversed original payments. It does
  not offer deletion or editing of historical payment facts.
- Bank statements show a reversal as a credit, while Financial Ledger and Cash
  Flow show it as an inflow. Duty ledger, duty reconciliation, P&L, analytics,
  and bank balances use the same signed transaction ledger, so their aggregate
  totals net the original payment and its reversal correctly.
- **Local verification:** API and web TypeScript checks passed; web production
  build and server production build passed. The normal unit suite passed (17
  files, 71 tests). A dedicated duty-reversal integration
  test now covers payment, linked reversal, restored balance, history, audit
  trail, and duplicate-reversal rejection; it could not execute here because
  `TEST_DATABASE_URL` is not configured. No production reversal has been made.
- **Next exact action:** commit and deploy this implementation, then conduct
  one controlled live reversal using a fresh labelled duty payment and verify
  Duty Payments, the original bank statement, Duty Payment Ledger, Financial
  Ledger, Cash Flow, P&L, and the audit history before closing `DUTY-002`.

### DUTY-002 Deployment Status (2026-09-04)

- Implementation commit `53a74e5` (`Add immutable duty payment reversals`) was
  pushed to `origin/master`. Railway completed the build and returned the
  production service to **Online**.
- The available browser session is the controlled Terminal E2E user for
  `E2E-20260901-Lagos`. It correctly exposes only Terminal Workspace and cannot
  perform the finance-only Duty Payments reversal test. No production payment
  or reversal was created from that restricted session.
- **Next exact action:** sign in as the owner Super Admin or a controlled
  Accounts user, make one fresh labelled duty payment, reverse it once through
  Duty Payment History, and record the Duty, Bank, Ledger, Cash Flow, P&L, and
  audit reconciliation results before closing `DUTY-002`.

### BANK-003, AI-008, and API Access Verification (2026-09-04)

- **Implementation commit:** `199d96d` (`Protect bank references and AI
  document evidence`) is pushed to `origin/master`.

- **BANK-003 implemented locally.** Non-empty bank references are now trimmed
  and treated as a branch-level bank-movement identifier across both bank
  transfers and fund additions. Each write takes a PostgreSQL transaction
  advisory lock before checking both movement tables, so concurrent requests
  cannot create duplicate references. A duplicate now returns HTTP `409`; a
  blank optional reference remains valid. The integration test creates a fund
  addition, retries it with casing/whitespace changes, then tries the same
  reference as a transfer and expects both duplicate attempts to be rejected.
- **AI-008 implemented locally.** AI document search no longer displays
  `Page unavailable` merely because a filename match has no page-text match.
  Search results now label the actual evidence as `Filename match`, `Text
  match`, `Indexed match`, or a verified `Page N`. The existing document link
  remains the container Documents tab.
- **Residual finance API check completed at the middleware level.** A new HTTP
  regression test signs an authenticated Delivery session and observes a real
  `403` from `requireFinanceAccess`; the same test observes `200` for Accounts.
  A direct production navigation attempt to `/api/banks` from the controlled
  Terminal browser session was blocked by the browser client with
  `net::ERR_BLOCKED_BY_CLIENT` before it reached the deployed application, so
  it cannot be claimed as a live API response.
- **Verification:** focused tests passed (12 tests), the API unit suite passed
  (19 files, 75 tests), workspace typecheck passed, the local Railway build
  command passed, and `git diff --check` passed. The database integration suite remains
  intentionally blocked because `TEST_DATABASE_URL` is not configured; it was
  not pointed at production.
- **Next exact action:** commit and deploy these three changes. Then, from an
  environment that permits same-origin API requests, repeat the live
  authenticated non-finance `403` check and run the controlled BANK-003 and
  AI-008 re-tests before resuming the DUTY-002 financial write test.

### Pre-Duty Fix Deployment Status (2026-09-04)

- After the `199d96d` implementation and `8b9da6c` state-record commits were
  pushed, Railway was observed showing the `Cost-Management-System` production
  service as **Online**. No live BANK-003 movement, AI query, or finance API
  request was made from the available Terminal-only session.
- **Next exact action:** use the owner Super Admin or Accounts session to run
  the documented BANK-003 and AI-008 re-tests. Use a browser/client that lets
  a same-origin `/api/banks` request reach the server for the remaining live
  `403` capture, then resume the controlled DUTY-002 reversal test.

### Live-Test Resumption Checkpoint (2026-09-04)

- The project handover was reviewed in full before resuming work. Git is clean
  on `master`; no completed test record, code change, or deployment has been
  overwritten.
- The available application browser session is now the controlled Documentation
  E2E user in `E2E-20260901-Lagos`. It correctly exposes Documentation only.
  It cannot access the AI Assistant, Bank Management, or Duty Payments.
- No live write or duplicate test was attempted. The remaining BANK-003,
  AI-008, and authenticated finance-API checks still require an Owner Super
  Admin or Accounts session. DUTY-002 remains after those checks.
- **Next exact action:** restore an authorised Owner Super Admin or E2E Accounts
  browser session, then perform the already documented targeted checks in this
  order: AI-008 exact document query, BANK-003 duplicate-reference rejection,
  authenticated finance API `403` capture, and the single controlled DUTY-002
  reversal reconciliation.

### Owner Authentication Attempt (2026-09-04)

- The supplied Owner Super Admin sign-in was attempted once and the application
  returned HTTP `401 Invalid credentials`. No credential is stored in this
  repository, and no live record or user access was changed.
- This is an authentication blocker, not an application defect: do not retry
  until the owner supplies a confirmed current sign-in or an authenticated E2E
  Accounts session is restored.
- **Next exact action:** obtain a valid Owner Super Admin or E2E Accounts
  session, then resume the documented checks in their existing order.

### AI-008 Live Re-Test (2026-09-04)

- Owner Super Admin access was restored and the exact Lagos query
  `Find E2E-DOCUMENT-RETRIEVAL-20260904.txt.` was run once.
- The assistant found one indexed document for `E2EL260901`, cited the correct
  container Documents tab, and labelled the evidence `Filename match`. The
  former `Page unavailable` label did not appear. `AI-008` is live-verified
  and closed.
- No operational or financial record was changed.
- **Next exact action:** run the one controlled BANK-003 fund-addition and
  duplicate-reference rejection check, then capture the remaining authenticated
  finance API `403` response before starting DUTY-002.

### BANK-003 Controlled Record Reservation (2026-09-04)

- The first planned reference `E2E-20260904-BANK-003-001` was rejected with
  HTTP `409` because a movement with that reference already exists somewhere in
  the Lagos branch. No new movement was created; neither active E2E bank
  statement contains that reference.
- To avoid conflating that historic record with this verification, the one new
  controlled record is reserved before posting: `E2E-20260904-BANK-003-LIVE-001-7A9C`,
  a N1.00 fund addition to `E2E-20260901 Lagos Test Bank` (bank ID 3,
  E2E Lagos). It will be posted once, then the identical reference will be
  retried once and must return `409` without a second movement.

### BANK-003 Guard Correction (2026-09-04)

- The attempted reserved N1.00 fund addition was rejected with HTTP `409` even
  though its reference was newly reserved. Source tracing found the fault: both
  duplicate queries return arrays, and the route treated empty arrays as truthy
  rather than checking their lengths. This made every non-empty reference look
  duplicated.
- The fund-addition and transfer paths now use one tested helper that normalises
  optional references and returns true only when either query has at least one
  match. The focused API suite passed 20 files / 78 tests, API typecheck passed,
  and `git diff --check` passed. No live financial movement was created.
- **Next exact action:** commit and deploy this guard correction. Once Railway
  is active, use the already reserved reference once, retry it once, and verify
  the first movement exists exactly once while the retry returns `409`.

### BANK-003 Live Re-Test Passed (2026-09-04)

- Railway deployed commit `d34706d` (`Correct bank reference duplicate guard`)
  successfully; the production service was shown as Active and Online before
  the live verification resumed.
- The reserved N1.00 fund addition
  `E2E-20260904-BANK-003-LIVE-001-7A9C` was accepted once by
  `E2E-20260901 Lagos Test Bank`. Its statement now has nine transactions,
  N2,002.00 total credits, and a N1,101.00 closing balance. The one matching
  row is a Fund Addition credit of N1.00 with the recorded E2E narration.
- Retrying the exact same reference was correctly rejected with HTTP `409`.
  The bank statement has no second matching movement. `BANK-003` is
  live-verified and closed.
- **Next exact action:** attempt the remaining authenticated non-finance API
  `403` capture only through a client that can reach `/api/*`. If the browser
  continues blocking that request before it reaches the app, retain the
  already-passing middleware regression evidence and record the environmental
  limitation. Then begin the documented fresh-record DUTY-002 reversal test.

### SEC-02 Authenticated API Capture Passed (2026-09-04)

- The existing controlled `E2E Delivery QA` profile (ID 12) was reused rather
  than creating another account. Its test-only password was rotated for the
  check and is not stored in the repository.
- An authenticated live HTTP request to `/api/banks` using that Delivery
  profile returned HTTP `403`. This proves the request reached production and
  `requireFinanceAccess` denied the non-finance profile as designed.
- The Owner Super Admin browser session was restored after the isolated check.
  The former direct-browser API limitation is no longer an open verification
  item. `SEC-02` is fully closed for both route and API access.
- **Next exact action:** register one fresh labelled duty payment in the live
  test register before creating it, then use the DUTY-002 History action to
  reverse it exactly once and reconcile Duty Payments, Bank, Financial Ledger,
  Cash Flow, and actual-paid P&L.

### DUTY-002 Controlled Record Reservation (2026-09-04)

- No unused Lagos duty assessment is available. The smallest reversible path
  uses the existing controlled container `E2EL260901`: temporarily change its
  already paid N100.00 assessment to N101.00, creating N1.00 outstanding.
  This is an assessment-only adjustment and will be restored to N100.00 after
  the reversal check.
- The only new payment is N1.00 from `E2E-20260901 Lagos Test Bank`, reference
  `E2E-20260904-DUTY-REVERSAL-LIVE-002-PAY`, narration `E2E verification only
  DUTY-002 payment`. It will be reversed once with reference
  `E2E-20260904-DUTY-REVERSAL-LIVE-002-REV` and the matching E2E reason.
- The historic `E2E-20260904-DUTY-REVERSAL-001` payment is not part of this
  test and must not be changed.
- **Next exact action:** save the N101.00 assessment, record the reserved
  N1.00 payment once, reverse only that new transaction once, reconcile all
  affected views, then restore the N100.00 assessment.

### DUTY-002 Live Re-Test Passed (2026-09-04)

- The reserved controlled payment
  `E2E-20260904-DUTY-REVERSAL-LIVE-002-PAY` was recorded once for N1.00 on
  `E2EL260901`, then reversed once through Duty Payment History with reference
  `E2E-20260904-DUTY-REVERSAL-LIVE-002-REV` and the required E2E reason. The
  historic `E2E-20260904-DUTY-REVERSAL-001` payment was not changed.
- History retains the original N1.00 payment as already reversed and shows one
  linked N1.00 reversal. The product did not offer a second reversal for that
  payment. This confirms the immutable, one-time reversal workflow.
- Reconciliation passed: Duty Payments and the Duty Ledger show the N1.00
  payment and -N1.00 reversal as a net-zero pair; Financial Ledger records a
  N1.00 Customs duty payment outflow and N1.00 Customs duty reversal inflow;
  the E2E Lagos bank statement returned to its N1,101.00 closing balance; and
  Cash Flow shows the matching duty outflow and reversal inflow.
- The actual-paid P&L also reconciles. It shows N500.00 Customs cost and
  N701.00 total cost of sales, with the new N1.00 payment-and-reversal pair
  contributing no net cost. September actual cost of sales remains N700.00.
- The temporary assessment adjustment was restored successfully: `E2EL260901`
  is again assessed at N100.00, paid N100.00, has N0.00 outstanding, and is
  marked Paid. The reversal audit trail remains intentionally retained.
- `DUTY-002` is live-verified and closed. No source code changed during this
  final live test.
- **Next exact action:** review the remaining open or environment-blocked cases
  in `docs/LIVE_E2E_TEST_REGISTER.md` before scheduling another live write
  test. Do not repeat completed BANK-003, AI-008, SEC-02, or DUTY-002 cases.

### Historical Remaining Work Order (2026-09-04; Superseded)

The completed BANK-003, AI-008, SEC-02, and DUTY-002 evidence supersedes the
older Step 11 notes that listed bank-reference and duty-reversal verification as
pending. Do not repeat those production writes.

1. Re-test the deployed Step 6 cancelled-invoice rule across Dashboard,
   Accounts Receivable, Aging, Client Statement, and Client/Wallet (`DASH-001`,
   `AR-002`, `STMT-001`, `CLT-001`).
2. Re-test selected-branch creation and isolation for the Step 7 correction
   (`BRN-001`).
3. Re-test the Step 8 AI corrections: authoritative stage ownership, eligible
   invoice finance totals, notification scope/counts, exact schedule lookup,
   consolidated briefing state, and uploaded-document retrieval
   (`AI-002` through `AI-007`). `AI-008` is already closed.
4. Re-test Step 9 workflow and persistence fixes: notification taxonomy and
   duplicate history, My Tasks, approval refresh, Pipeline Terminal display,
   and delivery-date persistence (`NOTIF-001`, `NOTIF-002`, `TASK-001`,
   `APR-001`, `PIPE-001`, `DEL-001`).
5. Re-test Step 10 bank and loading-state fixes (`BANK-002`, `SCHED-002`,
   `CP-002`, `OH-002`).
6. Leave only the true Step 11 environmental cases for an appropriate test
   surface: native overdue-date entry, actual uploaded-file retrieval, and
   isolated non-production cross-role sessions. These do not justify further
   uncontrolled production writes.

**Next exact action:** begin item 1 with the cancelled-invoice financial
population re-test, then update both project records with the observed result.

### Step 6 Live Re-Test - Partial Failure (2026-09-04)

- Invoices, Dashboard, Accounts Receivable, and the controlled Lagos Client
  now agree on the active financial population: the two cancelled invoices are
  presented separately, while the genuine overdue `INV-202609-004` drives the
  N1,000 gross / N999 net receivable after the existing N1 credit. This is
  consistent with the live Dashboard N3,001 invoiced, N2,002 collected, and
  N999 outstanding figures.
- The printable Invoice Aging report still fails `AR-002`. It labels cancelled
  `INV-202609-002` and `INV-202609-003` as two Current unpaid invoices for
  N2,000, then adds the genuine N1,000 overdue invoice for a false N3,000
  outstanding total. The report must apply the same eligible-invoice rule as
  AR before Step 6 can close.
- The current live data also demonstrates a native overdue case: invoice
  `INV-202609-004` has a persisted 2026-08-01 due date and is correctly shown
  as 34 days overdue in Invoices, AR, and Aging. This observation does not
  remove the remaining manual-browser verification requirement for a newly
  entered due date on a controlled record.
- **Next exact action:** continue with the Step 7 branch-scope re-test, then
  proceed through the remaining current work order without repeating this
  ageing query.

### Step 7 and Step 8 Live Re-Test - Partial Pass (2026-09-04)

- `BRN-001` passed its non-destructive UI scope check. With **All branches**
  selected, the Add Client form requires an explicit branch. After selecting
  **E2E-20260901-Lagos**, the same form defaults to that branch and explains
  that it follows the active branch. No extra client was created merely to
  exercise a backend rejection, so submission-time enforcement remains to be
  confirmed during an appropriate controlled write.
- `AI-002` passed. The all-branches delayed-stage answer cited
  `HLCU8765432 - Transire` with **Owner: Unassigned**, rather than reusing a
  generic or another-stage owner. `MSCU1234567` independently showed owner
  `john`.
- `AI-003` passed. A fresh all-branches monthly finance draft for
  2026-08-31 to 2026-09-04 reported three eligible invoices totaling
  N3,001.00 and cited the actual eligible records, including
  `INV-202609-004`; it excluded both cancelled invoices.
- `AI-004` passed. The assistant reported 88 visible workflow-history events
  and 72 unread. Notifications independently showed 88 of 88 workflow events
  and an Unread badge of 72; the separate System Alerts count was not mixed
  into the answer.
- `AI-005` failed. The exact question for `E2E-20260901 Scheduled Test
  Vendor` did not execute a search and demanded a schedule ID, invoice number,
  or client ID. Exact vendor-name lookup remains open.
- `AI-006` is partial. All-branches briefing generation is correctly disabled
  with an explanation, but the dated snapshot is still headed "Current Finance
  & Control Briefing". It should be labelled as a historical snapshot whenever
  no new all-branches briefing can be generated.
- `AI-007` passed. The assistant found and cited
  `E2E-20260903-document-upload.csv` for `E2ED260901` with one indexed match.
- **Next exact action:** complete the Step 9 workflow visibility re-test,
  beginning with notification taxonomy/idempotency and approval refresh.

### Step 9 Live Re-Test - Partial Result (2026-09-04)

- `TASK-001` passed. My Tasks now presents only the signed-in user's assigned
  follow-ups and clearly directs submitted section reviews to Approval Queue;
  it did not show the former broad container list.
- `NOTIF-001` remains open. System Alerts still labels a PAAR deadline alert as
  "Low Profit Margin" even though its text says "PAAR overdue".
- `NOTIF-002` remains open. Workflow History contains repeated identical
  Payment Scheduled and Payment Approved events for the same schedule and
  timestamp, including three identical E2E vendor events. This is evidence of
  duplicate history generation rather than a display-only count issue.
- **Next exact action:** continue Step 9 with Approval Queue immediate-refresh,
  Pipeline Terminal visibility, and delivery-date persistence; do not repeat
  the passed My Tasks check.

### Step 9 and Step 10 Continued Live Re-Test (2026-09-04)

- `PIPE-001` passed. Terminal Workspace shows the released E2E Abuja job
  `E2EA260901` in **Submitted** as Closed, and Pipeline independently shows
  it in the Closed lane. Released terminal work is no longer hidden.
- `APR-001` is blocked, not failed. Approval Queue correctly rendered its
  current empty Pending Review state and a recently approved E2E record, but
  there was no safe pending submission available to reject and observe an
  immediate in-page removal. This requires one explicitly controlled
  submit-and-reject cycle.
- `DEL-001` is still unverified. The closed job shows stage history but the
  Delivery actual-date field was not exposed in the inspected details; verify
  it through the Delivery & Empty Return workflow with a controlled record.
- `BANK-002` passed. The bank statement offers a **Duty Payments** filter,
  returned exactly the four duty transactions when selected, and exposed
  **Clear filters** after filtering.
- `SCHED-002` remains open. The **Today's Schedule (1)** tab displayed the
  only record as `8 days overdue` with a 2026-08-27 schedule date. A past-due
  record must not be counted or presented as today's schedule.
- `CP-002` and `OH-002` need a visual cold-load/refresh observation; the
  current static pages cannot prove the prior transient empty-state defect is
  gone.
- **Next exact action:** record this re-test result, then test Container
  Payments and Overhead Expenses with a cold load and refresh before deciding
  whether their loading-state issues can close.

### Step 10 Loading-State Live Re-Test Passed (2026-09-04)

- `CP-002` passed the observed cold-load and browser-refresh check. Container
  Payments retained its populated Recent Payments view and did not present a
  false "no payments" state while loading.
- `OH-002` passed the observed cold-load and browser-refresh check. Overhead
  Expenses retained its non-zero balances and populated expense list without a
  transient empty or zero state.
- This is visual runtime evidence only; no expense, payment, or bank record was
  created or changed.
- **Next exact action:** address the still-open functional defects in priority
  order: `AR-002`, `AI-005`, `AI-006`, `NOTIF-001`, `NOTIF-002`, and
  `SCHED-002`; retain `BRN-001`, `APR-001`, and `DEL-001` as controlled-write
  or workflow verification work.

## Update Format

When updating this file, change only what is needed and always record:

1. Commit hash and whether it was pushed.
2. Tests/builds actually run and their result.
3. Deployment or live-test evidence actually observed.
4. The next exact action, in priority order.

## Remaining Confirmed Defects - Source Fixes Implemented (2026-09-04)

The following fixes are implemented locally and verified by unit tests,
typechecks, and production builds. They are **not marked live-passed** until
the deployed application is re-tested.

**Implementation commit:** `c7db5bc` (`Fix remaining reporting, AI,
notification, and schedule defects`) was pushed to `origin/master` on
2026-09-04.

| Defect | Source correction | Live re-test required |
| --- | --- | --- |
| `AR-002` | Invoice Aging now applies `isInvoiceFinanciallyActive`, the same eligible-invoice rule used by Accounts Receivable. Draft, cancelled, and written-off invoices cannot enter aging totals or printable aging. | Confirm both the Aging page and its print route exclude `INV-202609-002` and `INV-202609-003`. |
| `NOTIF-002` | Payment-schedule group notices are now one untargeted business event instead of one row per recipient. Historical recipient rows are filtered by the signed-in recipient, preserving audit rows without showing an admin every copy. | Create and approve one controlled schedule; each signed-in recipient must see one Scheduled event and one Approved event. |
| `AI-005` | Exact singular payment-schedule questions now take a deterministic, punctuation-normalised vendor/description lookup path before model routing. The existing exact-match reader returns the named record or no match, never a substitute. | Query the full `E2E-20260901 Scheduled Test Vendor` name and confirm the paid N500 record is cited. |
| `AI-006` | In All Branches, saved briefings are rendered as **Historical finance & control briefing** with a Historical snapshot badge. No saved data is changed. | Confirm All Branches cannot generate a new briefing and no displayed saved briefing calls itself Current. |
| `NOTIF-001` | `paar_overdue` now has its own PAAR Overdue notification configuration instead of falling through to Low Profit Margin. | Confirm an existing PAAR deadline alert is labelled PAAR Overdue. |
| `SCHED-002` | Open schedules before today now enter a separate Overdue bucket. Today, Tomorrow, Upcoming, Completed, and Cancelled retain their exact date/status meanings. | Confirm the 2026-08-27 schedule is in Overdue and Today's Schedule contains only records due today. |

**Validation completed locally:** API unit suite (22 files, 83 tests), root
workspace typecheck, web typecheck, web production build, and API production
build all passed. The web build reported only pre-existing source-map and
chunk-size warnings.

**Next exact action:** push and deploy this correction, then perform the six
listed live re-tests in the table order. Do not repeat the already closed
`BANK-003`, `AI-008`, `SEC-02`, or `DUTY-002` controls.

### Six Confirmed Defects Live Re-Test Passed (2026-09-05)

**Implementation already pushed:** `c7db5bc`; the preceding documentation
checkpoint was `dc84f36`. The earlier local validation remains valid: API unit
suite (22 files / 83 tests), root and web typechecks, API production build,
and web production build all passed.

- `AR-002` passed in both views. Invoice Aging Analysis and printable Invoice
  Aging show only `INV-202609-004` at ₦1,000 outstanding; cancelled
  `INV-202609-002` and `INV-202609-003` are excluded.
- `NOTIF-002` passed. A single controlled ₦1 schedule,
  `E2E-20260905 Notification Idempotency Vendor`, was created and approved in
  E2E Lagos. Owner Workflow History shows one Payment Scheduled and one Payment
  Approved event for it, not duplicate rows.
- `AI-005` passed. The exact named-vendor question found one record and cited
  the paid ₦500 schedule with matching requested, approved, and paid amounts.
- `AI-006` passed. With All Branches selected, generation is disabled; the
  saved briefing is headed `Historical finance & control briefing` and marked
  `Historical snapshot`.
- `NOTIF-001` passed. The active PAAR deadline alert for `MSCU1234567` displays
  `PAAR Overdue`.
- `SCHED-002` passed. The 2026-08-27 `tuykguh` record is in Overdue and Today's
  Schedule contains only the 2026-09-05 controlled schedule.

The new ₦1 approved payment schedule remains in the E2E Lagos branch as a
clearly labelled, auditable test record. No payment was recorded against it.

**Next exact action:** perform `BRN-001` backend branch creation verification:
from All Branches, submit one controlled record for an explicitly selected
branch, then verify creation and data isolation in the target branch only.

### BRN-001 Backend Branch-Creation Re-Test Passed (2026-09-05)

- In All Branches, the New Client form explicitly selected
  `E2E-20260901-Lagos` and successfully created
  `E2E-20260905 BRN-001 Lagos Scope Client` (client ID 8).
- The new client is visible in All Branches and the Lagos branch, and absent
  from the Abuja branch. This is backend persistence evidence, not merely a
  form-default observation.
- The deployed shared `resolveCreateBranch` helper is the same creation guard
  used by clients, containers, and invoices, so this proves the repaired
  authorised selected-branch path under a consolidated global scope.
- The client remains as labelled E2E test data only; it has no containers,
  invoices, payments, or balances.

**Next exact action:** finish the remaining controlled workflow verification:
`APR-001` immediate Approval Queue rejection refresh, then `DEL-001` delivery
date persistence and its Dashboard/Delivery Tracking reconciliation.

### APR-001 Controlled Live Re-Test (2026-09-05)

DEL-001 follow-up: the existing Abuja job 25 now retains delivery date
2026-09-05 after save and full reload. Delivery Tracking returns that one job,
the same date, four days, and N1,000 budgeted revenue. Dashboard still returned
Completed 0: its API hard-coded `const completed = 0`. Replaced this with the
branch-scoped count of non-null deliveredAt records, matching Delivery Tracking.
Full railway:build passed. Added an integration reconciliation assertion;
it has not been run locally because it requires the seeded test database.
Next exact action: deploy this correction, then verify Abuja Dashboard Completed
1 against the already verified Delivery Tracking row. Do not create another job.

- Current work: finish APR-001 and DEL-001 using existing controlled jobs.
- APR-001 passed: submitted full container review for Lagos E2EL260901 (ID 26)
  once, then rejected it through Approval Queue with reason
  `E2E-20260905 APR-001 controlled rejection: verify immediate queue refresh.`
- Without navigation or reload after rejection, Pending Review became empty
  and Recently Reviewed displayed the same job as Rejected with that reason.
- Existing deployed correction passed; no source-code change was needed.
- Git was clean at start, HEAD follows pushed test checkpoint 251caed.
- Next: DEL-001 on existing Abuja E2EA260901 (ID 25), currently Closed with
  delivery date Not yet recorded. Save a controlled date, reload, and reconcile
  Dashboard Completed and Delivery Tracking. Retain rejection audit evidence.
