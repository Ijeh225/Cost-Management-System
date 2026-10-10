# Accounting Foundation: Architecture and Accountant Decision Pack

## Owner Decision - 2026-10-10 21:17 WAT

Owner explicitly selected native accounting INSIDE this app and requested all
implementation steps. Architecture choice is confirmed; no external provider.
NATIVE_ACCOUNTING_IMPLEMENTATION_PLAN.md preserves roadmap Steps6-12 and breaks
foundation Step6 into6A-6F. Accountant policy/chart/permissions/cutover approvals
remain outstanding. No runtime implementation, posting or migration in this turn.
Earlier awaiting-choice statements below are historical. Exact next is6A draft
chart/rules and review; implementation/activation follows the agreed gates.

Recorded: 2026-10-10 10:29 WAT (Africa/Lagos).
Status: PROPOSED / awaiting owner architecture selection and accountant rules.
User authorised beginning Part B Step 6, explicitly requiring the native-versus-
integration decision first. User then requested detailed explanations of both
the architecture question and the accountant-policy question. Neither choice
nor policy approval has been received. No runtime implementation is claimed.

## Existing Position and Duplicate Check

- Clean master8a39eb5 before this documentation work. Part A ACCT-001..007 is
  closed within the recorded management-report correction scope.
- Source search across API/frontend/schema/OpenAPI found no chart of accounts,
  journal header/lines, accounting-period or external accounting adapter module.
- Financial Ledger is a cash-movement report, not a double-entry General Ledger.
  Existing corrected P&L mixes issued revenue with actual-paid overhead and
  its documented container-cost recognition rule; it is not a complete accrual GL.
- Existing invoices/items/payment facts, deposits, credit notes, audited write-offs,
  duty/overhead/container/standalone payments and bank transfers are reusable
  transaction sources. Do not create another payment table or enter cash twice.
- Existing canonical authority/job-function/workspace access and branch controls
  remain authoritative. General finance access is not a complete journal approval,
  independent review, period close or controlled reopening permission model.

Source anchors: lib/db/src/schema/invoices.ts, client-deposits.ts,
payment-schedules.ts and banks.ts; artifacts/api-server/src/lib/access-policy.ts,
authorization.ts, invoice-cash.ts, payment-classification.ts and financial-reporting.ts.

## Decision 1: Where Are the Official Books?

| Option | What it means | Main benefit | Responsibility / limitation |
| --- | --- | --- | --- |
| Native inside this app | Add one GL, accounts, journals and periods connected to existing source records; accounting reports are produced here | One user workflow, direct branch/job/container drilldown, tailored clearing operations | We must build, test and maintain accounting controls, source mappings, reports and policy updates |
| External integration | Existing app remains the operations/source system; send approved accounting transactions to the accountant's selected package | Uses that package's accounting workflows and reporting | Requires package selection, supported API/features, subscriptions, mapping, sync retries and reconciliations; some work occurs outside this app |

Recommendation, not a confirmed choice: native if the owner's goal is a
self-contained application and there is no established accounting package that
must remain authoritative. If the accountant already uses official books in a
package, evaluate its integration first rather than duplicating those books.
Choose one authoritative accounting ledger. Future export to another system is
possible but must not make both copies independently authoritative.

Do not select a provider, purchase a subscription, create OAuth grants or send
financial/customer data to an external service without explicit approval.

## Decision 2: Accountant's Rules and Chart

The accountant owns the policy choice; software implements approved rules.
No accountant has been contacted, and no professional approval is implied.
Owner may supply an existing chart/rules or authorise a draft for their review.

Draft account families, NOT approved account codes or seeded production accounts:

| Family | Illustrative accounts to review |
| --- | --- |
| Assets | Each bank/cash account, customer receivables, advances/prepayments, fixed assets, recoverable client disbursements where supported |
| Liabilities | Customer deposits/client funds held, supplier payables, accrued costs, applicable VAT/tax controls, loans payable |
| Equity | Owner/share capital, retained earnings, drawings/distributions where applicable |
| Income | Clearing/service fees and other supported earned income |
| Expenses | Approved shipping/terminal/delivery/operations cost heads, salaries, rent, utilities, bad debts, depreciation and finance costs |

Approval worksheet:
1. Accounting package/native choice; legal entities versus branches and base
   currency. A branch name alone does not prove a separate legal accounting entity.
2. Account codes/names, control accounts, required expense heads and review owner.
3. Financial year-end, period calendar and first accounting/cutover date.
4. Earned fees versus client funds and duty/shipping/terminal disbursements:
   principal-versus-agent/gross-versus-net policy and recoverable costs.
5. Invoice/revenue accounting date, uninvoiced work/cost recognition and unpaid
   supplier/overhead accruals. Current management P&L is not automatic approval
   of future statutory/accounting policies.
6. Applicable VAT/other tax treatment, credit-note dates and bad-debt policy;
   no rates, tax relief or filing compliance inferred from previous tests.
7. Funding as capital, loan or another supported source; asset/depreciation,
   prepayment recovery, interbranch settlement and manual control-account rules.
8. Opening balances versus supported historical import, with completeness review.
   Never count opening balances AND the same earlier source transactions.
9. Named preparers/reviewers/posters, independent approval, close/reopen authority,
   exception handling and supporting evidence requirements.

Unknown original501 and old expense4 metadata10,210,000 remain evidence exceptions.
Do not turn old unknown payments into expense/asset journals or guess funding
equity/loan categories to make a Trial Balance look complete.

## Proposed Native Foundation, Only After Decision Approval

1. Protect the latest release/code and verify a fresh DB backup/restore before
   any new migration. Existing checkpoints/private backups remain preserved.
2. Add accounting books/configuration, approved chart and non-overlapping dated
   periods; use branches/jobs/clients/shipments as dimensions, not duplicate cash.
3. Add journal header/lines/source-event links and audits. Decimal input/DB values
   remain exact; balance comparisons use integer minor units, not JS floats.
   Enforce at least two valid non-zero lines, exactly one debit or credit per line,
   one supported book/currency and exact total debit = total credit.
4. Post all lines atomically, with source event/version idempotency and payload
   conflict checks. Failed posting leaves no half-journal or duplicate source.
5. Draft/review/approval/posting lifecycle, independent approval of manual entries,
   immutable posted lines and traceable linked reversals rather than deletion.
6. Closed-period checks at API/database transaction level, posting-versus-closing
   concurrency protection, controlled audited reopening and explicit permissions.
   Existing finance access does not automatically grant every new accounting action.
7. Isolated tests before any live enablement: precision, unbalanced journals,
   missing/invalid accounts, duplicate retries/concurrency, period overlaps/locks,
   simultaneous close/post, branch/legal-entity isolation, permission denial,
   immutable posted entries, approved reversals and rollback on partial failure.

Source adapters/opening import are Step 7; GL/TB screens Step 8; manual journal UI
Step 9; Balance Sheet/management pack Step 10. Do not call this Step 6 request
authority to deploy all later features or rewrite existing financial modules.
Existing reports stay clearly labelled until approved accounting reports reconcile.

## External Integration Alternative

If selected, first inspect the accountant's named provider and organisation/API
access. Use its supported invoices/bills/receipts/credits/transfers/adjustment APIs,
not a guessed journal API for every source. Map account IDs/tax codes/contacts,
persist external IDs and source-event keys, use durable sync/retry/reconciliation
states, and keep local operational payment facts unchanged.

The external package owns final accounts/period controls; our app records sync
status and source references. There is no parallel locally authoritative GL.
Reports from the external ledger must be distinguished from current local
budgeted/mixed-basis management reports until reconciliation is approved.

## Illustrative Posting, Not Approved Live Entries

Where the accountant approves these ordinary models:
- Receive1,000 customer deposit: debit Bank1,000; credit Customer Deposits1,000.
- Apply400 to an already-issued invoice: debit Customer Deposits400; credit
  Customer Receivables400. No second Bank receipt is created.
- Recognise100 supplier expense: debit approved Expense100; credit Payables100.
- Pay that bill: debit Payables100; credit Bank100. Do not expense the payment again.

Examples explain double entry, not policy confirmation for every clearing duty,
tax, advance or asset transaction. Actual mappings require the signed-off rules.

## References Reviewed 2026-10-10

- [ACCA: Subsidiary records and general-ledger double entry](https://www.accaglobal.com/uk/en/student/exam-support-resources/foundation-level-study-resources/fa1/technical-articles/sales-comp-acc-system.html).
- [Xero official Accounting API overview](https://developer.xero.com/documentation/api/accounting/overview/): search-index evidence describes transaction/report APIs; direct page required JavaScript.
- [Xero official Journals API](https://developer.xero.com/documentation/api/accounting/journals/): current indexed documentation specifies GET/retrieval, distinguishes Manual Journals for creation and lists access conditions. Provider is an example, not selected/connected or endorsed for Nigerian compliance.

## Exact Stopping Point

Owner requested detailed explanations in response to the two approval questions.
Architecture recommendation, draft categories and proposed controls prepared;
owner choice and accountant policy/sign-off still pending. Documentation only:
no application code/schema/permissions/production configuration or data changed;
no new test record, posting, backfill, integration, live test or deployment run.
Next: explain both choices plainly; obtain architecture selection and existing
rules or authority to prepare a review draft. Then implement only the agreed scope.
