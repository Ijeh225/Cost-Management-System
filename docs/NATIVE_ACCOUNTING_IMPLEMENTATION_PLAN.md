# Native Accounting Implementation Plan

Recorded: 2026-10-10 21:17 WAT (Africa/Lagos).
Owner decision: build official accounting INSIDE the existing application.
Status: architecture selected; implementation sequence prepared for review.
Accountant policy, named permissions and production cutover are not yet approved.
This plan does not claim an implemented module, migration, deployment or passed test.

## Roadmap Identity and Scope

Keep the existing ACCOUNTING_REMEDIATION_PLAN.md numbering. Part A Steps1-5/
ACCT-001..007 remain closed within their recorded correction scope. Native
accounting is Part B Steps6-12; do not renumber it or reopen those fixed defects.
Subphases6A-6F organise the existing Step6, not a competing roadmap.

One authoritative native ledger; reuse existing transactions, branches, users,
jobs/shipments, clients, evidence and audit patterns. No external accounting
provider selected or connected. No rewrite of operational stages, owner fields,
container pages or existing cash facts is required by the architecture decision.

Each phase records implemented / isolated-tested / approved / deployed / live-
verified separately. Tests are required as each feature is built, not deferred
until the final rollout. Source mappings and report populations need separate
completeness checks: a balanced Trial Balance alone does not prove correct books.

## Step 6 - Build the Accounting Foundation

### 6A - Approve the Accounting Specification

- Draft the chart families: assets, liabilities, equity, income, expenses.
  Include bank/cash, customer receivables, client deposits, supplier payables,
  applicable tax controls, advances, assets, loans, capital and expense heads.
- Agree legal accounting entity/books, branch dimensions, base currency,
  financial year/period calendar and proposed accounting start date.
- Agree earned clearing fees versus client/pass-through funds, recoverable duty/
  shipping/terminal costs, invoiced/uninvoiced work, unpaid expenses and VAT rules.
- Agree credit notes, write-offs/recoveries, asset/depreciation, prepayments,
  principal/interest, funding and interbranch accounting policies.
- Record named owner/accountant approval and version of each rule. Owner's native
  choice does not approve unknown tax/recognition/account mappings automatically.

Exit: reviewed chart/rule/permission draft; unresolved decisions explicitly listed.
Do not seed guessed mappings or automatically classify old unknown records.

### 6B - Protect and Add the Database Foundation

- Check for existing/equivalent functionality again before editing.
- Preserve old checkpoints; make a fresh named code checkpoint and verify a new
  private database backup/full isolated restore before migrations.
- Add books/configuration, accounts, periods, journal headers/lines, source-event
  links and accounting audits with appropriate keys, checks and indexes.
- Keep account category/code distinct from standalone-payment business-purpose
  classification and expense heads. Map the existing fields; do not replace them.
- Use additive/repeatable migrations; rehearse older-schema upgrades, failures,
  recovery and source preservation in the isolated database.

Exit: valid empty foundation, no automatically posted historical transactions.

### 6C - Build One Balanced Posting Engine

- Require valid accounts, supported book/currency/date, branch and source/evidence.
- Exact decimal input/storage and integer minor-unit calculations; no floating-
  point balance comparisons. Define overflow/precision/rounding rules.
- At least two valid non-zero lines; each line has one debit OR credit;
  journal total debits must exactly equal total credits.
- Commit header/lines/source link/audit atomically; rollback every part on failure.
- Idempotent source-event/version links: retries cannot post the same financial
  event twice. A conflicting payload is refused, not treated as a successful retry.
- Immutable posted journals; corrections create linked adjustments/reversals.
  Source reclassification after posting must not silently rewrite old journal lines.

Exit: isolated balanced/unbalanced/precision/rollback/duplicate/concurrency tests pass.

### 6D - Add Accounting Period Controls

- Financial-year/month setup, non-overlapping periods and posting-date validation.
- Open/close workflow, reviewed close checklist and audited controlled reopening.
- Transaction-level enforcement against posting into a closed period, including
  simultaneous posting and closing; a UI-disabled button is not sufficient.
- Closing checks include source completeness, unresolved mappings and control
  reconciliation, not just matching debit/credit totals.

Exit: boundary, overlap, closed-period, race and reopening tests pass.

### 6E - Add Explicit Accounting Permissions and Approval

- Reuse canonical authority/job-function/workspace and authorised/active branch
  checks; do not revive old roles or grant all journal powers through finance.access.
- Separate read, account/configuration management, prepare, approve/post,
  reversal, close and reopen responsibilities.
- Require independent review of manual entries; no silent self-approval bypass.
  Define how approved source rules authorise system-generated postings separately.
- Named grants/approvers and emergency exceptions require explicit owner approval;
  authority level alone is not evidence of professional accounting sign-off.

Exit: isolated API-level permitted/denied, branch and separation-of-duty tests pass.

### 6F - Foundation Acceptance Before Source Activation

- Complete database-backed tests covering every6B-6E control and migration.
- Confirm existing Part A finance and operational tests remain valid; no duplicate
  payment creation, unexpected totals or changed operational workflows.
- Review documented rules and test evidence with owner/accountant before enabling
  postings. Foundation can be introduced inactive before a separately approved cutover.
- Record checkpoint, migrations, code hash and deployment proof where applicable.

Exit: Step6 foundation accepted, ready for explicit source mappings in Step7.

## Step 7 - Connect Transactions and Establish Opening Balances

### Source Mapping Register

| Existing source | Required accounting connection / control |
| --- | --- |
| Issued invoices and invoice items | Approved recognition date; customer receivable, earned revenue/tax or other supported treatment; exclude drafts/cancelled items |
| Invoice collections and reversals | Settle receivable and bank/cash once; distinguish real refunds from non-cash reversal/application |
| Customer deposits and allocations | Original receipt once; approved liability/settlement mapping, allocation is not another cash receipt |
| Credit notes/client-credit use/write-offs/recoveries | Reuse dated source/audit, separate net/tax/non-cash effects, preserve original settlement history |
| Duty/container disbursements and reversals | Approved expense/recoverable/WIP treatment; one posted payment source, linked reversal |
| Overhead obligations/payments | Recognise approved unpaid obligation; payment settles it without expensing the amount again |
| Standalone schedule payments | Map supported expense/asset/advance/principal/other categories; unknown facts require evidence review |
| Payment schedules | Requests/approvals are not cash payments; underlying supported bill determines whether an obligation exists |
| Bank funding/transfers | Approved funding purpose; balance transfer legs, no company revenue from moving own money |
| Assets/prepayments/loans/equity | Supported source schedules/approved journals; no invented balances from narration |

- Reuse existing source IDs and audit events; no independent second payment register.
- Add only missing obligation/asset/advance/loan source support required by approved
  policy. Check existing overhead/payment facilities first; do not duplicate them.
- Multiple containers under one B/L keep independent operational progress without
  multiplying shared invoice/payment totals or journal amounts.
- Choose ONE cutover: supported historical import OR approved openings plus forward
  posting. No double-counting openings and the same earlier transactions.
- Dry-run openings/mappings in isolation; reconstruct dated AR/other controls where
  needed rather than treating today's snapshot as a historical opening balance.
- Preserve original501 unknown purpose and missing historical overhead metadata
  10,210,000 as explicit exceptions. No fabricated account head or balancing entry.
  Any temporary review/suspense treatment requires accountant approval and disclosure.

Exit: source completeness and Bank/AR/deposit/payable/expense controls reconcile;
duplicates/retries/partial settlements/reversals and one-B/L cases pass isolated tests.

## Step 8 - General Ledger and Trial Balance

- General Ledger page/API: account/date/period/branch filters, debit/credit lines,
  opening/movement/closing balance, running balances and source/journal drilldown.
- Trial Balance: all relevant accounts, opening balances, period debit/credit
  movements and closing balances, including appropriate inactive/zero account rules.
- Agree book/entity versus branch reporting and interbranch balancing policy;
  do not imply every branch subset balances automatically without those mappings.
- Matching screen/export/print with declared as-of-date/period scope, unknown-source
  and completeness warnings. Do not rename the existing cash ledger as the GL.

Exit: independent fixtures/control balances agree; posted debits = credits and
source coverage is tested separately.

## Step 9 - Manual Journals and Accounting Adjustments

- Prepare, attach evidence, submit, review, approve, post and reverse through the
  SAME Step6 engine; no second calculation or permission framework.
- Draft editing permitted under policy; posted journals cannot be silently edited,
  deleted or moved between periods. Failed validation/approval cannot post.
- Support approved accruals, depreciation, prepaid recovery, reclassification,
  corrections and opening entries. Required asset/loan/prepayment schedules support
  the calculation; full payroll/complex treasury are not automatically in scope.
- Protect bank/customer/supplier control accounts from freehand adjustments that
  bypass their source subledgers; use supported workflows/reconciliation procedures.

Exit: approved adjustments appear once in GL/TB, closed periods and unauthorised
users refused, original/reversal audit and source controls reconcile.

## Step 10 - Balance Sheet and Management Accounts

- Dated Balance Sheet with assets/liabilities/equity, retained/current earnings and
  account drilldown; Assets = Liabilities + Equity within approved books/policy.
- Accrual P&L includes approved unpaid obligations/non-cash adjustments, not merely
  current paid-overhead conventions. Build accounting Cash Flow with reconciliation.
- Management pack: P&L, Balance Sheet, Cash Flow, AR/AP aging, job/branch performance,
  budgets versus actuals and control exceptions from consistent posted sources.
- Integrate a clearly identified accounting dashboard. Keep budgeted operational
  estimates and the current management-report basis visible/distinct until approved
  transition; no silent claim that unlike reports must have identical profit.

Exit: a full controlled scenario reconciles across reports, including cash-versus-
profit differences; balances are complete/supported, not a cash report relabelled.

## Step 11 - Statement of Affairs

- Dated supported asset/liability schedules and net-assets calculation.
- Evidence, valuation basis, reviewer/approval and explicit estimated versus book
  values. Keep separate from Balance Sheet and customer statements.
- Any statutory/insolvency use needs separately specified professional requirements.

Exit: reviewed values reproduce calculations without falsely implying confirmed
book values, complete records or statutory certification.

## Step 12 - Final Acceptance, Rollout and Training

- End-to-end isolated scenarios, concurrency/retry/partial-failure tests, source
  completeness, separate role/branch checks, periods, reversals and all output formats.
- Rehearse backup/restore/migration and proposed cutover; approve chart/mappings,
  openings, reports and operator training with owner/accountant.
- Controlled staged rollout; commit/push, exact deployment/migration/health proof,
  bounded live scenarios and independent reconciliation before final acceptance.
- Never blindly restore an old database over later legitimate postings; use the
  rehearsed rollback/correcting-entry procedure appropriate to the release stage.
- Update blueprint/user manual, project state, test register and timestamped session
  summaries. Preserve checkpoints and audit facts; no generic100% compliance claim.

Exit: each module has documented implementation/deployment/live acceptance,
unresolved exceptions remain explicit and the exact next action is recorded.

## Current Status / Exact Next Action

2026-10-10 21:17 WAT: native architecture selected by owner. Roadmap6-12 and
subphases prepared, no runtime feature implemented in this planning turn.
Next working phase is6A: prepare/review the chart and accounting-rule worksheet,
then obtain approved policies/named permissions before corresponding live activation.
No accountant sign-off, cutover date, historical import or new grants presumed.
