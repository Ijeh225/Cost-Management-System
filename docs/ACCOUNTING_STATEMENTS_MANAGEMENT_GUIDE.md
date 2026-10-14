# Balance Sheet and Management Accounts (Step 10)

## Boundary

Read-only reports on the existing native posted ledger. No second ledger, source
cash replay, automatic historical classification, new posting engine or production
schema activation. General Ledger/Trial Balance and operational reports remain.
Native accounting must remain OFF until separately approved actual setup/cutover.

## Use

1. Open Finance > Balance Sheet or Management Accounts. Inactive accounting shows
   an explicit inactive message, not invented zero company balances.
2. After separately authorised activation, select a granted approved accounting
   book and branch, dates or a book period, then Apply Filters.
3. Whole book requires named read grants for EVERY included branch. It does not
   consolidate unrelated books/sister companies or perform intercompany eliminations.
4. Read the snapshot scope/basis/policy/cutover, source exceptions and controls.
   Pending field edits do not change the displayed applied snapshot. Switching
   branch/user/book removes old figures; same-scope refresh retains the snapshot.
5. Inspect account ledger links and posted cash journal/source drilldowns. Existing
   journal inspection is reused; there are no new adjustment/posting actions here.
6. Export Snapshot CSV or Print Snapshot. Both carry the exact same displayed
   decimal strings, warnings, controls, scope and snapshot timestamp.

## Reports and Basis

| Section | Calculation | Important control |
| --- | --- | --- |
| Balance Sheet | All posted assets less liabilities/equity through as-of date | Assets = liabilities + posted equity + unclosed earnings; equation difference visible |
| Earnings | Approved financial year-end separates prior unclosed and current-year income/expense balances | Posted equity/retained earnings is separate; closing journals already posted are not added a second time |
| Accrual P&L | Posted period income credits less expense debits, including unpaid obligations and noncash adjustments | Reviewed openings are not period turnover; deposits/collections are not revenue twice |
| Cash Flow | Retained reviewed bank/cash account mappings; period net movements excluding opening journals | Opening + movement = closing; operating/investing/financing/transfers/unclassified shown separately |
| Profit bridge | Accrual profit plus signed noncash balance-sheet account movements | Reproduces identified net cash exactly; not a made-up depreciation or working-capital estimate |
| AR/AP open items | Posted supported invoice/bill movements, allocations, collections, credit/writeoff and settlements | Open-item total, identified GL control and unallocated difference all visible |
| Aging | As-of date minus retained structured source due date | Current,1-30,31-60,61-90,90+ and Undated are separate; day90 stays61-90 |
| Branch performance | Same scoped posted period income/expense/cash facts | Same selected book only, no cross-book totals |
| Job performance | Reviewed invoice ITEM income and container-linked expense lines | Shared B/L/full invoice totals never repeated per container; unattributed adjustments/overhead remain visible |
| Budget context | Current configured clearing charges, existing five budget field sets and extra charges | Exact decimal sums; duty paid/unpaid summaries are not budget costs; unavailable cost is not assumed zero |

The management screen's KPIs are the **native accounting dashboard**: posted
accrual income, expenses, net profit and identified cash movement. Existing
operational Dashboard estimates and mixed-basis management reports are unchanged.
Cash and profit legitimately differ. Do not force them to the same figure.

## Explicit Limits / Actual Setup

- A balanced TB/equation is not proof of complete fixed assets, loans, liabilities,
  equity or independent bank/customer/supplier/deposit reconciliation. Source
  completeness remains explicitly unconfirmed in these read-only reports.
- Cash identity comes from retained reviewed source mappings, never account names.
  No mappings means "not configured", NOT a confirmed zero bank balance. Ambiguous
  asset/advance/liability funding/freehand cash purposes remain unclassified.
- New invoice drafts retain the actual recorded due date and revalidate it at
  approval. A subsequent source-term edit does not rewrite old aging; coverage
  flags stale source terms for a reviewed correction. Earlier invoice/bill adapters
  generally did not retain due dates in immutable evidence. Their posted open
  balances are available but historical due aging is
  **Undated**. Mutable present-day due fields are not silently treated as historical
  proof. Real due schedules/opening customer/supplier allocations require reviewed
  supporting detail; an unallocated GL difference remains visible.
- Budget metadata is current/lifetime operational context, not historical approved
  period budgets. Gross VAT/recoverable budget amounts and net posted expense costs
  can have different bases. These variances are not certified like-for-like budgets.
- Credit-note income reductions without retained item allocation remain unallocated
  at job level; full book/branch P&L still includes them once.
- Inactive accounts with posted history and all chart accounts are included in
  statements. A single-account statement is rejected; use GL for account filters.
- The existing 50,000 historical posted-line limit is enforced with an error,
  never silently truncated financial totals. Narrow branch/book scope if required.
- These are controlled accounting reports, not statutory financial statements,
  a VAT return, Statement of Affairs or professional audit certification.

## Controlled Example

One issued multi-container invoice: net income100, recorded outputVAT7.50,
AR107.50. Original deposit100, allocation30 (zero second cash), collection20.
An unpaid overhead bill80 is recognised; settlement25 reduces payable without
another expense. Noncash depreciation adjustment10 is posted separately.

Expected: accrual income100, expense90, profit10; identified cash95; AR57.50,
deposit liability70, payable55, tax liability7.50, contra asset-10. Assets142.50 =
liabilities132.50 + unclosed earnings10. The two invoice items receive income60
and40, never107.50 each. Cash95 is NOT profit10; the exact bridge reconciles it.

## Launch Gate

Actual approved book/chart/rules/grants, official go-live date, independently
verified openings, complete supported balances/due schedules and operational
reconciliation precede separate activation. Accountant service-exemption/recovery
approval is not supplied by engineering tests. No test-data cleanup is performed
by this feature; future cleanup remains a separately backed-up authorised task.
