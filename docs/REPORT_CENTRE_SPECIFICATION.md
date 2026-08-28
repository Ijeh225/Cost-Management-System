# Report Centre Specification

## Purpose

The Report Centre must distinguish a job's operational progress from financial facts. A status or expected date is not a payment. An approved amount is not an amount paid. Every report must state its date range, branch scope, and monetary basis.

## Core Definitions

| Term | Meaning |
| --- | --- |
| Operational work queue | Jobs currently requiring work in a department. It is not a physical location or a financial result. |
| Stage completed | The department recorded its actual completion/release action. An expected date alone never completes a stage. |
| Assessed / budgeted amount | A charge or estimate recorded against a job. It is not proof of payment. |
| Actual payment | A dated transaction with amount, source, reference, notes, and recorded-by user. This is the basis for cash, bank, and payment reports. |
| Outstanding | Assessed or invoiced amount less actual recorded payments, according to the report's stated basis. |
| Branch scope | Super Admin may report across branches; every other user is limited to their authorised branch. |

## Required Report Families

1. **Executive Summary**: container counts, invoiced revenue, collected revenue, actual operating costs, overheads, receivables, and profit indicators.
2. **Workflow Stage Performance**: Pending Verification, Registered, Documentation, Duty Assessment, Duty Payment, Transire, Shipping, Terminal, Pull-Out, Gate-In, Examination, Final Release, Delivery/Empty Return, and Closed. Each report shows active/released counts, owner, expected date, actual date, and delay days.
3. **Job Costing and Profitability**: one job's budgeted charges, actual payments, invoicing, collection, margin, and linked evidence.
4. **Duty Payment Ledger**: one row per actual Customs duty payment, with payment date, container, customer, branch, amount, cash/bank source, bank account, reference, notes, and recorded-by user. Duty snapshots remain the live balance only.
5. **Accounts Receivable**: invoices, collections, balance, due/overdue aging, credits, and client deposits.
6. **Overhead and Payment Schedule**: original expense, top-ups, approved-but-unpaid schedule amounts, actual payments, balance, source, and approvals.
7. **Bank and Cashflow**: all dated credits/debits by source. Duty payments paid from a bank appear as debits; cash payments are not attributed to a bank.
8. **Branch Comparison**: the same definitions by branch, with an explicit period and no mixed scope.

## Integrity Rules

- Reports read transaction ledgers for actual money movement, not only running totals.
- Recording a payment updates the live balance and writes its ledger row in the same database transaction.
- A bank payment requires an active bank in the same branch as the job.
- Reports must show `No data` rather than inventing amounts from incomplete records.
- Downloads use the same filters and scope as the visible report.

## Delivery Sequence

1. Establish report definitions and permanent duty-payment ledger.
2. Add report screens and exports for duty, workflow stages, job costing, AR, overhead/schedules, and bank/cashflow.
3. Add reconciliation checks, saved report filters, scheduled delivery, and audit evidence.

## Initial Report Centre Delivery

The first Report Centre delivery provides three source-linked reports inside the existing Reports page:

- **Duty Payment Ledger**: exports each dated duty payment recorded after the ledger was introduced. It includes the payment source, bank/cash classification, reference, notes, recorder, and linked container.
- **Department Workflow Evidence**: reports Transire, Shipping/DO, Terminal/TDO, and Pullout independently. Expected dates remain planned work; actual release dates determine a released stage.
- **Duty Snapshot Reconciliation**: compares the current Customs-duty running balance to immutable ledger totals. A positive historical difference is labelled `Historical / unledgered`; it is not invented as a payment or automatically treated as an error. A ledger total above the current running balance is `Needs attention`.

Existing cashflow, P&L, accounts-receivable, client statement, delivery, branch-comparison, and disbursement-reconciliation reports remain available through their existing report cards.

## Scheduled Delivery Controls

The first controlled delivery release supports **Duty Payment Ledger** and **Workflow Stage Summary** emails.

- Only branch administrators and super administrators can create, pause, resume, restore, or archive schedules.
- A schedule is bound to the creator's current branch scope. A super administrator in all-branches mode may create a consolidated schedule.
- Recipients are validated email addresses, limited to 20 per schedule.
- Delivery uses the configured **Africa/Lagos** wall-clock time. Weekly schedules also use their selected weekday; saving a schedule never sends it immediately.
- Saved Report Centre date filters are used for the Duty Payment Summary delivery. Workflow Stage Summary is an as-of-now operational snapshot and intentionally does not pretend to be a historical ledger.
- The emailed Duty Payment Summary contains totals for the selected period. The on-screen Duty Payment Ledger and CSV export contain the individual payment rows.
- Delivery runs through the existing server scheduler and Resend configuration. A schedule is marked sent only after Resend accepts the message.
- Every attempt is stored in `report_delivery_logs` with recipients, report type, item count, delivery time, and an error message when it failed.
- Administrators can use **Send test** to prove a subscription and recipient list work immediately. Test sends are separately labelled in the delivery history and do not change the next scheduled delivery time.
- Administrators can open **History** to review the latest 50 sent, failed, and test delivery attempts before relying on a schedule.
- Archiving a schedule pauses it and retains the schedule plus its delivery history as audit evidence. A physical deletion is blocked while delivery evidence exists.
- Scheduled reports are read-only summaries. They never approve, pay, update, or otherwise change a job or financial record.
