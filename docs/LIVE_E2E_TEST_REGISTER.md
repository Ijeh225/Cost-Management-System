# Live End-to-End Test Register

## Purpose

This is the execution record for the pre-delivery live acceptance test. It
records what was tested, the controlled records used, observed outcomes, and
defects. A test is not complete until its related pages, ledgers, reports, and
branch scopes have been reconciled.

## Safety Rules

- Use the `E2E-20260901-...` prefix for every newly created controlled record.
- Record the ID and branch of every test record before progressing its
  workflow.
- Do not delete a record merely to tidy up. Deletion of live data requires an
  explicit confirmation at the point it is about to happen.
- Do not approve, pay, post to a bank, send a message, or change user access
  without a specific test case and a recorded result.
- Never use a real customer, bank account, payment instruction, email, or
  WhatsApp recipient for a test without explicit confirmation.

## Test Data Matrix

| ID | Controlled data needed | Branch coverage | Status |
| --- | --- | --- | --- |
| TD-01 | Two test branches and branch-scoped users | Branch A, Branch B, consolidated | In progress | `E2E-20260901-Lagos` (ID 2) and `E2E-20260901-Abuja` (ID 3) now exist. Branch-scoped user testing remains blocked until separate authenticated sessions are available. |
| TD-02 | Two clients and six containers across active/completed stages | Both branches | In progress | Controlled clients `E2E-20260901 Lagos Client` (ID 6) and `E2E-20260901 Abuja Client` (ID 7) exist. Containers `E2EL260901` (ID 26, Lagos) and `E2EA260901` (ID 25, Abuja) are pending verification; full-stage coverage remains pending. |
| TD-03 | Draft, issued, partial, paid, overdue, cancelled, and zero-value invoice cases | Both branches | Pending |
| TD-04 | Duty, container, scheduled, direct-overhead, and bank-payment records | Both branches | In progress | Existing labelled transactions cover duty, container disbursement, direct overhead, scheduled-overhead payment, invoice collection, and bank ledger in one branch. |
| TD-05 | At least one pending approval and one rejected/blocked action | Both branches | In progress | Zero-value invoice issuance is a verified blocked action. A controlled pending/approved schedule is still required. |

## Execution Register

| ID | Area | End-to-end assertion | Status | Evidence / finding |
| --- | --- | --- | --- | --- |
| ENV-01 | Deployment | Signed-in application opens and core dashboard renders | Passed | 2026-09-01: Dashboard rendered with Operations and Financial tabs. |
| ENV-02 | Existing data | Identify pre-existing test data and avoid treating it as verified evidence | In progress | 6 containers, 1 invoice, and existing bank balance were visible. |
| FIN-01 | Financial Dashboard | Reconcile Financial View figures with P&L using the identical branch and period | Partial | 2026-09-01, All Branches/All Time: revenue ₦1, actual cost ₦1, overhead ₦500,002, and net loss ₦500,002 match P&L. A P&L container-count/average defect is logged as RPT-001. |
| OPS-01 | Operations | Create one controlled job and follow it through Documentation, Transire, Shipping, Terminal, Pullout, and submitted lists | Pending | |
| OPS-02 | Stage isolation | Verify each stage retains its own owner, expected date, actual date, and notes | Pending | |
| DOC-01 | Documentation | Upload, search, open, and link a document to the controlled job | Pending | |
| CONT-01 | Containers | Validate create, edit, duplicate protection, status progression, branch scope, and dashboard counters | In progress | 2026-09-01: Created pending-verification containers `E2EA260901` (Abuja, ID 25) and `E2EL260901` (Lagos, ID 26), each linked to its branch-specific controlled client. Lagos scope displayed only `E2EL260901`; Abuja displayed only `E2EA260901`; All Branches displayed both after refresh. The Create Container form displayed Head Office as its initial Branch value even while the active global scope was Lagos; this is recorded in BRN-001. Status progression, duplicate prevention, and dashboard counters remain pending. |
| INV-01 | Invoicing | Validate draft, issued, partial, paid, overdue, cancelled, zero-value, due-date, and repeated-action rules | In progress | 2026-09-01: existing ₦0 draft rejected a Mark as Sent attempt and remained Draft. Existing ₦1 invoice is Paid. UI validation defect INV-001 logged. |
| AR-01 | Receivables | Reconcile invoice changes with receivables, aging, collection totals, and reports | In progress | 2026-09-01: paid `INV-202608-002` reconciles to ₦0 outstanding and ₦1 collected. Aging and non-paid lifecycle cases remain pending. |
| DUTY-01 | Duty payments | Validate draft, approval, payment, bank ledger impact, reversal/blocking, and reports | In progress | 2026-09-01: controlled duty entries ₦2,000,000 and ₦1 reconcile to the duty ledger, bank debits, and report ledger. Paid rows have Record disabled. Draft/approval/reversal cases remain pending. |
| SCHED-01 | Payment schedules | Validate create, approval, payment, duplicate-payment blocking, ledger impact, and reports | Blocked | The visible approved ₦25,000 schedule is not labelled as a controlled test record and will not be altered. A new labelled schedule is required. |
| BANK-01 | Bank management | Validate balances, postings, ledger, filters, branch scope, and prevention of invalid or duplicate entries | In progress | 2026-09-01: `chris Bank` contains the matching ₦1 invoice-collection credit (`SYSTEM-E2E-INVOICE-N1`); the visible balance reconciles to opening + credits - debits. Filter, branch, and duplicate cases remain pending. |
| CP-01 | Container payments | Validate payment posting, linked container cost, bank ledger impact, and reports | In progress | 2026-09-01: QATU20260831 controlled ₦1 shipping disbursement (`SYSTEM-E2E-CONTAINER-N1`) appears in Container Payments, bank ledger, financial ledger, and P&L Actual Paid cost. The +₦1 variance against a ₦0 budget is correctly treated as over budget. |
| OH-01 | Overhead expenses | Validate direct and scheduled overheads, payment, deletion safeguards, ledger impact, dashboard, and reports | In progress | A controlled ₦2 overhead is Paid through two separately labelled ₦1 payments (direct and scheduled) and appears in bank/financial ledgers. Creation and deletion-safeguard cases remain pending. |
| REP-01 | Reports | Reconcile P&L, duty, disbursement, branch comparison, analytics, ledger, VAT, budget-versus-actual, and date filters | Pending | |
| SEC-01 | Roles and permissions | Verify allowed and denied actions for separate access profiles and branch restrictions | Blocked | Eight active modern access profiles exist, including Operations, Accounts, Documentation, Delivery, and Terminal Manager. Separate authenticated test sessions or credentials have not been supplied; the current Super Admin session cannot prove denied access. |
| UI-01 | Usability | Review desktop/mobile layout, dialogs, keyboard access, loading states, errors, and repeated-click protection | Pending | |

## Defect Log

| ID | Priority | Module | Finding | Cause | Required correction | Cross-module impact | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RPT-001 | High | P&L and Financial Dashboard | P&L labels Actual Paid cost of sales as covering 6 containers and calculates average profit using 6, while its cost-of-sales total includes only 1 invoiced container. Financial View correctly reports 1 invoiced container. | `reports.ts` sets `containerCount` from invoiced plus uninvoiced records, while actual COGS totals include only invoiced records. The P&L UI uses the mixed `containerCount` for its label and average. | Use `invoicedContainerCount` for recognised-COS count and average, or explicitly split and label invoiced versus uninvoiced metrics. | Misleads P&L users and creates a visible mismatch with Financial Dashboard. Amount totals reconcile, but per-container reporting does not. | Open |
| RPT-002 | High | Report Centre summary and exports | Headline cards and export sheets label budgeted container clearing charges/costs as Total Revenue, Total Expenses, and Net Profit without declaring that they are budgeted operational estimates. The same screen also offers P&L with accrual revenue and actual-paid costs. | `reports/index.tsx` sums `clearingCharges`, `totalCost`, and `grossProfit` from container records but uses generic financial labels. | Rename these values to Budgeted Clearing Charges, Budgeted Container Cost, and Gross Profit before Overhead, and show their basis in the UI and exports. Keep P&L as the source for accrual/actual net profit. | Can lead users to compare or export unlike financial bases and make incorrect management decisions. | Open |
| INV-001 | Medium | Invoice details | A zero-value draft displays an enabled Mark as Sent button. The server correctly rejects it and preserves Draft status, but the user only sees the vague message “Failed to update status.” | The UI does not use the known invoice total to disable the action or surface the server's specific validation error. | Disable issuing/sending for zero-value invoices and show the clear reason: add a positive charge or delete the draft. | Does not corrupt financial data because the backend blocks it, but creates avoidable failed actions and support questions. | Open |
| BRN-001 | High | Branch-scoped record creation | A Super Admin can select a target branch in the New Client dialog, but submitting from All Branches fails with only “Failed to create client.” The Create Container form also initially displays Head Office as Branch when the active global scope is Lagos. | The client form submits `branchId` in its JSON body, but `resolveCreateBranch` reads only the global `X-Branch-Id` scope and rejects All Branches mode. The frontend discards the actual server reason. The container dialog does not initialise its visible branch selector from the effective global scope. | Make the visible branch selector reliably reflect the effective creation branch. Either make the selector set the active branch scope before submission, or allow the selected body branch for Super Admin users after access validation. Display the server's specific error. | Blocks or misdirects Super Admin creation of branch-scoped clients and can affect all branch-scoped create workflows that use the same create-scope rule. | Open |

## Completion Criteria

The test is complete only when every execution item is marked Passed, Failed,
Blocked, or Not Applicable; every created record is identified; financial
figures are reconciled to their source records; and every defect is prioritised
with an owner and required correction.
