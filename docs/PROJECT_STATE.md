# Project State

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
- Last confirmed project-state commit: `ac8c9b4 Add project continuity state`
- Preserved rollback tags:
  - `checkpoint-before-rbac-user-migration-2026-08-28`
  - `checkpoint-before-user-role-restructuring-2026-08-28`
- Never reset, delete, or overwrite these checkpoints.

## Current Objective

Carry out and document a controlled, comprehensive live end-to-end acceptance
test before beginning any new large product feature.

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

## Next Actions, In Order

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

## Update Format

When updating this file, change only what is needed and always record:

1. Commit hash and whether it was pushed.
2. Tests/builds actually run and their result.
3. Deployment or live-test evidence actually observed.
4. The next exact action, in priority order.
