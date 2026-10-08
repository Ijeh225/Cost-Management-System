# Accounting Feature Review

Reviewed: 2026-10-08, completed 12:08 WAT (Africa/Lagos, UTC+01:00).
Scope: review only. No application implementation or financial writes authorised.

## 1. Executive Conclusion

The application is an operational clearing/logistics system with integrated
invoicing, receivables, payments, banking and management reporting. It is not yet
a complete double-entry accounting system. None of the six requested features
can be certified as fully implemented in the requested accounting form.

| Requested feature | Current status | What exists | What is missing |
| --- | --- | --- | --- |
| Trial Balance | Missing | Money-in/out totals and individual bank balances | Account-level opening/debit/credit/closing balances derived from balanced postings; trial-balance report and drilldown |
| General Ledger | Partial related coverage; a proper GL is missing | Source-linked Financial Ledger, individual bank statements and expense categories | Chart of accounts, account codes/types, debit/credit posting lines, control accounts, opening journals and per-account ledger balances |
| Management Accounts | Partially implemented | P&L, financial dashboard, cash flow, AR aging, client statements, VAT, branch comparison and disbursement reconciliation | Complete accounting-backed reporting pack, financial position, accrual expenses/payables, non-cash adjustments, period close, classified standalone payments and complete reconciliation |
| Journal Entries | Partial correction coverage; general journals are missing | Invoice/duty payment reversals, credit notes, bad-debt action and audit records | Authorised balanced manual journals, journal approval/posting lifecycle, general reclassification/accrual/depreciation adjustments and closed-period controls |
| Balance Sheet | Missing | Bank balances, receivables, deposits and some VAT information provide potential inputs | Complete assets/liabilities/equity accounts, valuations and opening balances; as-of-date report satisfying the accounting equation |
| Statement of Affairs | Missing | Client Statement and cash-flow statements, which are different reports | Dated asset/liability schedules, supported estimated values where needed, net-assets/capital calculation, evidence and review process |

"Partial" does not mean an accounting module is hidden or ready for use. It
means the app has some related functionality that can provide a foundation.
The manual already states that Financial Ledger is not a statutory double-entry
general ledger (`docs/manual/APPLICATION_MANUAL.md:37`).

## 2. Review Method and Evidence Limits

- Reviewed the current authoritative state/test registers, latest session
  summary, continuity rules, manual and prior capability review. Historical
  OPEN rows were not treated as current failures.
- Inspected database schema exports and relevant invoice, deposit, payment,
  overhead, duty, bank and schedule models; traced backend write paths and
  reporting queries; inspected frontend navigation, financial dashboard and
  report implementations. Searched source, scripts and API specification for
  the six modules and chart-of-accounts/journal/period-close support.
- Started with clean, synchronized `master` at `5f67dff`. Railway read-only
  deployment listing confirms that exact commit SUCCESS in production deployment
  `d9b14b32-a6c4-4eba-8bb9-55e516335f88`, created 2026-10-06.
- Fresh live read-only inspection used the existing owner browser session:
  Reports/Financial Ledger, duty ledger, Cash Flow screen and print, Actual-Paid
  P&L print, Bank Management and existing Lagos bank statement, both Dashboard
  modes, Accounts Receivable and Invoices. All comparisons below are All Branches
  and All Time unless otherwise stated; bank #3 is a specific-bank observation.
- Ran five existing safe API unit/mocked-HTTP test files: 16 tests passed.
  These cover invoice statuses, reversal credit logic, payment limits, optional
  bank-reference guards and finance access. They do not prove general accounting
  accuracy or database concurrency. No new database-backed write test was run.
- No transaction, deposit allocation, credit note, reversal, write-off, account,
  approval, report subscription, permission or configuration was created/changed.
  Changed report filters and opened print views only. No real-world bank
  settlement, tax compliance or exhaustive transaction audit is certified.

## 3. Feature-by-Feature Assessment

### 3.1 Trial Balance

No Trial Balance page, API or accounting-account/journal schema was found.
Financial Ledger totals are inflows/outflows, not account debit/credit balances.
A cash receipt need not equal an expense, so making money-in equal money-out
would not constitute a valid trial balance. A balanced trial balance would also
not prove that all transactions were entered or correctly classified.

Required foundation, not implemented: a chart of accounts, balanced postings,
opening balances, posting status, accounting dates and per-account balances.
Report functionality cannot be tested because this module does not exist.

### 3.2 General Ledger

`GET /reports/financial-ledger` combines invoice payments, duty, overhead
payments, container disbursements, standalone schedule payments, funding and
both legs of internal bank transfers (`routes/reports.ts:203`). Entries have
source/date/direction/amount/reference, not accounting account and debit/credit
lines. Bank statement columns use bank-statement presentation conventions;
they do not establish a company-wide double-entry GL.

Expense categories and shipping/customs/terminal/delivery/operations sections
are useful operating classifications, not a chart of accounts covering income,
expenses, assets, liabilities and equity. Issuing an unpaid invoice does not
post a debit to an AR control account and credit to revenue/VAT accounts.
No general opening/capital/loan/asset/depreciation journals were found.

Existing Financial Ledger works for the inspected source transactions but is
incomplete even as a money-movement register: ACCT-001 below was verified live.
ACCT-002/003 show additional source-confirmed cases requiring controlled tests.

### 3.3 Management Accounts

The existing reporting set is useful and genuinely integrated. Financial View
calls the same `useGetProfitLoss(... costBasis: "actual_paid")` calculation as
P&L (`pages/dashboard.tsx:528`). Fresh live totals match exactly:

| All-Time, All-Branches metric | P&L | Financial Dashboard |
| --- | ---: | ---: |
| Issued-invoice revenue excluding VAT | NGN3,001.00 | NGN3,001.00 |
| Recognised actual-paid container costs | NGN701.00 | NGN701.00 |
| Gross profit | NGN2,300.00 | NGN2,300.00 |
| Actual-paid overhead | NGN15,710,302.00 | NGN15,710,302.00 |
| Net result under this basis | -NGN15,708,002.00 | -NGN15,708,002.00 |

The calculation is arithmetically consistent: 3,001 - 701 - 15,710,302 =
-15,708,002. This does not certify the completeness of every accounting input.

Current P&L policy (`routes/reports.ts:1020`, `lib/financial-reporting.ts`):

- Revenue is based on invoice subtotals excluding draft/cancelled invoices.
  Its date filter uses invoice `createdAt`; no separate accounting issuance
  posting date is present in the invoice schema.
- Container cost can be Budgeted or Actual Paid. Actual-paid sums include duty
  reversals and container disbursements. Each container's lifetime selected
  costs are attributed once to its earliest non-draft/non-cancelled invoice
  period, not necessarily the cash payment period.
- Costs for uninvoiced containers are outside recognised gross profit and are
  returned separately as `uninvoicedCogs`. Therefore cash outflows and P&L cost
  are intentionally different populations. The print page does not expose that
  separate amount; it should explain/reconcile the excluded costs more clearly.
- Overhead is actual paid by payment date, not full accrued expense. Unpaid
  overhead, accrued salaries, depreciation and supplier liabilities are not a
  complete accrual P&L. A client P&L deliberately does not deduct company-wide
  overhead as if it were that client's allocated expense.
- Standalone schedule payments move cash but have no accounting classification
  or P&L mapping (ACCT-006). Credit notes and bad debts have further gaps below.

Thus "Accrual Revenue" is a declared operational recognition convention, not
certification of a full accrual accounting package. "True Net Profit" should
not be read as covering every adjustment, asset, liability or unpaid expense.
Comparing it with Operations View's budgeted margin without matching basis is
not a valid reconciliation. This distinction was already documented before this
review; it is not a reopening of the earlier actual-cost population fixes.

### 3.4 Journal Entries and Corrections

Implemented related controls:

- Invoice payment reversal locks the original record, appends a linked negative
  entry, requires a reference/reason, updates invoice/client-credit effects and
  writes an invoice audit event (`routes/invoices.ts:1246`). Deleting an invoice
  payment returns 405 and directs the user to reversal (`:1351`).
- Duty reversal similarly retains the original and records linked negative
  payment evidence plus actor/reason. The existing live NGN1 payment and reversal
  are still visible in Duty Ledger, Financial Ledger and bank #3 with zero net
  duty effect. No additional reversal was submitted this review.
- Credit notes and write-off actions exist with invoice audit entries, but their
  report integration is incomplete (ACCT-003/004/005).

Missing: a general journal editor or API, journal header/lines, balanced validation,
account selection, approval/posting state, attachments/reversal linkage for all
journals, locked accounting periods and adjustment reporting. Payment reversals
cannot replace depreciation, accruals, opening equity, transfers between expense
heads or other general accounting adjustments. Broad reversal coverage for
every type of payment is not certified by invoice/duty reversal support.

### 3.5 Balance Sheet

No balance-sheet module was found. Bank/AR/deposit/VAT summaries supply some
inputs but not a complete dated financial position. Fixed assets, accumulated
depreciation, prepayments, comprehensive supplier payables, accruals, loans,
share capital, drawings and retained earnings are not represented through
accounting accounts. Bank fund additions have narration/reference, not a reliable
capital-versus-loan-versus-other classification.

Required: complete account mapping and opening values, as-of-date balances,
asset/liability/equity classification, adjustment support and reconciled
Assets = Liabilities + Equity. A P&L or bank closing balance is not a substitute.

### 3.6 Statement of Affairs

No Statement of Affairs exists. Client Statement shows one customer's invoices,
settlements and available credit/deposits, not the company's assets/liabilities.
The requested incomplete-records version would need dated asset/liability lists,
estimation basis, supporting evidence, review and net-assets/capital calculation.
It must distinguish estimated values from book values. Any statutory insolvency
use would be a different scope needing separately agreed professional requirements.
There is no existing functionality to certify or integrate for this feature.

## 4. New Confirmed Findings and Classification Gaps

These IDs are new findings from this accounting review. They do not overwrite
the original RPT/FIN/VAT/SCHED closures, whose narrower recorded tests still stand.

| ID | Priority | Evidence level | Problem and cause | Affected modules | Correction needed, NOT implemented |
| --- | --- | --- | --- | --- | --- |
| ACCT-001 | High | Source confirmed and fresh live reproduced | Financial Ledger omits `client_deposits` entirely. Existing NGN50,000,000 deposit appears in AR, Cash Flow and bank figures, but not the ledger. | Financial Ledger, exports and reconciliations | Include original deposit cash facts once; identify later allocations as non-cash applications, not additional receipts. |
| ACCT-002 | High | Source-confirmed; no new live allocation created | Allocation inserts an invoice payment carrying the original deposit's bank/method while retaining the original deposit. Bank and Cash Flow aggregate both, so allocated cash is counted again. | Client deposits, invoice settlement, bank balance/statement, Cash Flow and Financial Ledger | Link settlements to their source deposit; count original receipt once, including opening balances, history and exports. Preserve AR allocation effect. |
| ACCT-003 | High | Source-confirmed; no new live credit/credit note created | Client-credit application (`paymentMethod: credit`) and credit-note adjustment (`credit_note`) are invoice-payment rows. Ledger and all-bank Cash Flow treat all positive invoice-payment rows as money received without excluding non-cash settlement methods. | Invoice collections, Financial Ledger, Cash Flow, opening balances and exports | Separate cash receipts from non-cash invoice settlement and adjustments consistently; do not remove their legitimate receivable effect. |
| ACCT-004 | High | Source-confirmed; no fresh live credit-note/VAT fixture | Credit note updates settlement/status and client credit, but not invoice subtotal/VAT. P&L and printable VAT Summary sum original invoice values; VAT Tracking separately derives credit-note VAT reductions. | P&L, Financial Dashboard, Branch Comparison, VAT Summary versus VAT Tracking | Agree credit-note date/net/VAT policy, then use the same adjustment source across all affected reports. Do not subtract a VAT-inclusive note blindly from ex-VAT revenue. |
| ACCT-005 | High | Source-confirmed; no write-off submitted | Write-off creates a Bad Debt overhead record and audit event, but no non-cash expense posting. P&L retains written-off invoice revenue while deducting only `expense_payments`, so this newly created non-cash loss is not recognised by P&L. | Write-offs, overheads, P&L and Financial Dashboard | Introduce a proper non-cash adjustment effect; retain correct AR history and avoid fabricating a bank/cash payment to force expense recognition. |
| ACCT-006 | High | Source gap and live population separation verified | Standalone paid schedules have vendor/description/payment facts but no expense/asset/liability account mapping. Existing NGN501 standalone payments appear in ledger, cash flow and bank #3, but not P&L's container or overhead expense sources. | Schedules, management accounts and future GL/BS | Require supported classification or an explicit review/unclassified queue. Some payments may be assets, advances or loan principal: do NOT automatically expense all NGN501. |
| ACCT-007 | Medium | Fresh live reproduced and source confirmed | Dashboard labels the combined 61-90 and 90+ buckets as `90d+`. The current NGN1,000 invoice is 68 days overdue in Invoices and 61-90 in AR, but shown as 90d+ on Dashboard. | Dashboard aging, AR and collections prioritisation | Use separate accurate buckets or label the combined bucket as 61+; totals are unchanged. |

Evidence pointers (repository-relative, verified 2026-10-08):

- ACCT-001: `artifacts/api-server/src/routes/reports.ts:218-269` lacks a deposit
  source; cash flow explicitly queries deposits at `:1426-1449`.
- ACCT-002: `routes/clients.ts:638-653` inserts allocation as payment; bank sums
  both sources at `routes/banks.ts:28-76`; cash flow adds both at
  `routes/reports.ts:1596-1627` and `:1811-1834`.
- ACCT-003: `routes/invoices.ts:1204-1214`, `:1784-1795` and unfiltered payment
  mapping `routes/reports.ts:239-242`, `:1596-1613`.
- ACCT-004: `routes/invoices.ts:1773-1823`; P&L invoice subtotal sums
  `routes/reports.ts:1047-1085`; VAT Summary `:803-846`; contrasting VAT Tracking
  credit-note treatment `:894-921`. Full accountant-approved VAT-period policy
  remains outside this review.
- ACCT-005: `routes/invoices.ts:1895-1921`; P&L `routes/reports.ts:1048` and
  `:1253-1279`. No adjusting journal or expense-payment insert in write-off path.
- ACCT-006: `lib/db/src/schema/payment-schedules.ts`; pay path
  `routes/payment-schedules.ts:576-599`; P&L costs `routes/reports.ts:1162-1283`.
- ACCT-007: `artifacts/cost-analysis/src/pages/dashboard.tsx:929-932`.

Illustrative source-traced example, NOT a transaction performed today:
receive NGN1,000 into a client's deposit, then allocate NGN400 to an invoice.
There is still only NGN1,000 received in the bank. Current aggregation can count
NGN1,400 because allocation carries the bank ID and amount into invoice payments.
Similarly, a NGN100 credit note is not NGN100 cash received.

## 5. Live Reconciliation Details

### 5.1 Deposit Omission

| All-Time, All-Branches | Financial Ledger | Cash Flow print |
| --- | ---: | ---: |
| Inflows | NGN2,005.00 | NGN50,002,004.00 |
| Outflows | NGN17,711,508.00 | NGN17,711,507.00 |
| Net movement | -NGN17,709,503.00 | NGN32,290,497.00 |

The net difference is exactly NGN50,000,000, matching the existing unallocated
client deposit shown in AR and the cash-flow deposit row. The NGN1 difference in
both inflows/outflows is expected: Financial Ledger shows both sides of the
existing internal transfer, while All-Banks Cash Flow eliminates both sides.
That internal transfer creates no net company cash and is not an error.

### 5.2 Existing Integration That Works in the Observed Scope

- Bank #3: 14 transactions; credits NGN2,003; debits NGN1,404; closing NGN599.
  Source-linked invoice payments, overhead, shipping, duty, standalone schedules,
  funding, reversal and outgoing transfer are visible.
- Cash Flow's bank #3 activity net is NGN600 because the All-Banks view removes
  the NGN1 transfer-out. Destination bank #4 has NGN1. A bank's external activity
  summary should not be mistaken for its full individual closing statement.
- Bank #2 balance on Dashboard is NGN42,499,997, agreeing with its cash-flow
  activity in the inspected all-time view. No external bank statement was matched.
- Existing invoice NGN1 reversal remains an outflow in ledger and a debit in bank;
  the duty NGN1 reversal remains an inflow/credit, offsetting its duty payment.
- Standalone schedules NGN500 + NGN1 are now in money-movement sources. The old
  SCHED-001 omission is not reopened; missing accounting classification is new.
- Overhead-linked schedules use `expense_payments`, while standalone schedules
  use `payment_schedule_payments`: one writer branch avoids two cash facts for
  the same overhead payment (`routes/payment-schedules.ts:576-599`).
- Invoices/AR/Dashboard issued totals match NGN3,001, collected NGN2,001 and
  outstanding NGN1,000. Three cancelled invoices remain separate history and
  do not contribute to those totals. The new issue concerns aging labels, not
  a repeat of the cancelled-invoice inclusion bug.

### 5.3 Controls That Are Limited, Not Universal

- Source IDs and explicit schedule writer branches help avoid some duplication.
  Invoice/duty reversal locks and original-entry linkage protect tested reversal
  cases. These are not a general balanced-posting or whole-system idempotency rule.
- Duplicate bank-reference enforcement checks funding and transfer references,
  within branch, with an advisory transaction lock. Blank references are optional
  and outside that protection; this is not a universal cross-module reference
  check covering invoices, deposits, duty and every expense payment.
- Deposit allocation, credit application and credit-note balance checks read
  balances before their write transaction, without the same row-lock protection
  found in direct invoice collection. Concurrent over-allocation/over-credit is
  a source-level risk requiring an isolated regression before certification;
  no simultaneous live requests were made and no corruption is claimed.
- Paid overhead parent records can be deleted while payment facts remain. This
  preserves money amounts but can lose original category/description joins. Live
  P&L has NGN10,210,000 under Other and cash flow has older blank descriptions.
  Missing parent versus originally blank metadata was not individually proved.
  Review retained classification/source snapshots and audit evidence separately.
- Finance Review Queue's zero exceptions only means its configured missing-bank
  check found none. It is not proof of complete postings, correctly matched bank
  settlement, a balanced trial balance or absence of ACCT-001 through ACCT-007.

## 6. Improvements Requiring Approval

First correct the proven existing reporting issues without changing legitimate
cash-versus-accrual distinctions. Then decide, with the responsible accountant,
whether to build a full ledger or integrate an established accounting system.
The prior CAP-07, CAP-11 and CAP-16 proposals are related foundations, not already
implemented accounting modules or authority to start them.

For a full native accounting suite, required foundations include chart of
accounts, source-linked balanced journals, accounting dates/period locks,
opening balances, complete source mappings, general adjustment approvals and
subledger-to-control-account reconciliation. Only then should TB/GL/BS and a
management pack be certified. Statement of Affairs needs its own evidence and
valuation scope; it is not automatically generated by relabelling a bank report.

This is an approval-stage review, not an implementation plan already in progress.
No fixes, migrations, accounting backfills or new accounting modules started.

## 7. Reference Definitions

- [ACCA: Sales and purchases in a computerised accounting system](https://www.accaglobal.com/uk/en/student/exam-support-resources/foundation-level-study-resources/fa1/technical-articles/sales-comp-acc-system.html)
  distinguishes subsidiary records from the general ledger where double entry
  occurs; invoice and receipt postings have different accounting effects.
- [ACCA: Computerised accounting systems](https://www.accaglobal.com/hk/en/student/exam-support-resources/foundation-level-study-resources/fa1/technical-articles/computerised-accounting-system.html)
  explains double-entry and linked receivable/customer postings.
- [IFRS Foundation: IAS 1](https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements.html/)
  includes financial position and other statements in a complete financial
  statement set. This review does not certify IFRS or Nigerian tax compliance.

External references checked 2026-10-08. Product-status conclusions are based on
the current repository and live observations, not inferred from those references.

## 8. Exact Handoff

Review completed; waiting for user review/approval. No live financial test paused
halfway and no new fixture needs cleanup. Existing records were preserved.
Next action is to agree the confirmed-fix scope and accounting feature scope;
do not begin fixes or a full accounting implementation merely from this report.
If authorised later, use isolated tests for deposit allocation, non-cash credit,
credit-note/VAT recognition and bad-debt reporting before controlled live writes.
