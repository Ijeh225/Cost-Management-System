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
   upload/search/open/link check against `E2EL260901`; do not delete the test
   document without explicit confirmation.
4. Do not create further live financial records until Critical `INV-002` has a
   reviewed correction/reversal plan. Preserve the controlled ₦1 entry and its
   invoice, AR, and Financial Ledger evidence for diagnosis.
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

### Invoice Lifecycle

- Draft invoices are editable; issued invoices preserve their audit trail.
- Zero-value invoices cannot be issued.
- Payment, due date, cancellation, and write-off rules are protected by the
  backend, not only by the screen.
- Draft and cancelled invoices are excluded from active receivables and the
  relevant financial reports.
- Related commit: `956d965`.

### Department Workspaces

- Architecture stores separate owner fields for Documentation, Transire,
  Shipping, Terminal, and Pullout.
- Automated tests confirm owner-field separation and no cross-stage carryover.
- The live controlled-job acceptance test remains outstanding; see Next
  Actions.

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
