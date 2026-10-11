# Native Accounting Foundation Specification

Prepared 2026-10-10, Africa/Lagos. Status: draft policy, inactive implementation.
Owner selected native accounting. No accountant approval is implied.

## Branch Units Are Sufficient For Stated Scope - 2026-10-11 00:42 WAT

- Owner confirms the existing Branches concept already represents their separate
  units. A row can represent Donclimax Head Office, Merit, Ace or a managed
  location. The UI term does not force a geographic-only meaning.
- Do not mandate a new group/company/branch hierarchy or label its absence a
  defect. Existing branch ownership/access/combined reporting fits the stated
  need. Company rollups across several locations are optional future requirements,
  not approved implementation or current blocking defect.
- Map existing units to the foundation's books through approved accounting scope;
  this policy mapping is separate from adding a new operational company table.
  Do not infer legal status, consolidation or account activation from branch names.
- Reuse current controls. Only BRN-SCOPE-UI-001 is the newly observed display
  defect; documentation clarification does not fix it or change live records.

## Current App Fit Check - 2026-10-11 00:32 WAT

- Fresh live/source inspection confirms existing flat branches and a working
  generic All Branches management overview/Branch Comparison. It is incorrect
  to describe ALL group visibility as missing. Branch rows have no company parent,
  but this is not a confirmed feature gap or bug (clarified00:42WAT). Verified
  accounting book mapping remains a policy decision. Merit/Ace not configured.
- Cross-branch switching/comparison currently require Super Admin; ordinary
  Admin/Branch Admin/Staff remain branch-scoped. Broader management delegation
  would need separately approved access design, not blanket Super Admin grants.
- Inactive foundation source already has accounting_books and book/branch
  membership; reuse after approved mapping, not a second ledger. No native source
  adapters/UI or official accounting activation verified/introduced in this review.
- New BRN-SCOPE-UI-001 recorded: brief scope-label/cached-amount mismatch during
  switching, with correct settled totals. Review only; no runtime fix performed.

## Confirmed Branch Visibility Requirement - 2026-10-11 00:22 WAT

- Owner states the app has been intended from the beginning to keep each branch
  separate while management can access the overall branches. This confirms the
  product requirement for branch-scoped records and authorised group visibility,
  not proof of separate legal registrations or a new accounting implementation.
- Retain branch ownership of jobs, invoices, costs, payments and reporting;
  authorised management needs individual-branch and combined overview access.
  Combined viewing must not duplicate shared source amounts or erase boundaries.
- Reuse existing branch-scope/access architecture after duplicate-work review;
  do not create another tenant/payment system or infer independent official
  books per branch. Company/legal-book mapping and intercompany reporting still
  need verified business facts and approved policies before accounting activation.
- All-inclusive charging retained; fiscal year-end/chart/sign-off pending.
  Clarification only: no runtime or live data changes authorised/performed here.

## Corrected Group Relationship - 2026-10-11 00:16 WAT

- Owner corrects the head-office name to Donclimax, superseding the earlier
  Donclimas/Dunclermont wording. Merit and Ace, plus future additions, are
  described as sister companies within the group, not merely branch names.
- Proposed conceptual structure: group -> company -> branch/location. Keep
  company ownership and reporting separate in the draft; do not conflate a shared
  location, owner or head office with one legal accounting entity. Donclimax's
  head-office role does not itself prove legal parent/subsidiary ownership.
- Registered names, separate registrations, ownership/reporting scope and any
  consolidation/intercompany rules still require confirmation. A combined
  management overview is a proposed capability, not implemented consolidated
  statutory accounts. Do not activate or remap existing branches/books here.
- Existing all-inclusive pricing facts retained. Year-end/chart/sign-off remain
  pending; this naming/relationship clarification is documentation only.

## Owner Business Facts - 2026-10-10 23:54 WAT

- Owner describes Donclimas Group with Donclimas and Merit Bonded Terminal in
  Lagos, another Donclimas location possibly Amuwo, and Merit, Don and Ace Bonded
  in Onitsha. These are owner-reported names/examples, not verified registered
  spellings, legal entities or an exhaustive branch list. Group membership does
  not establish that all businesses share a single legal entity/accounting book.
- Confirmed commercial arrangement: one combined clearing quotation covering
  terminal, shipping and other container/job charges plus the intended margin.
  Refine the draft around this all-inclusive model; do not use the earlier
  fee-only/client-funds teaching example as the confirmed default. Contract-based
  principal/agent, tax and revenue-recognition decisions remain unapproved.
- Owner's wording about what remains after payments is ambiguous: explain job
  margin versus company overhead and net profit, not classify the remainder as
  an expense or treat a bank balance as profit. Supported incurred unpaid costs
  also matter; paid cash alone is not a complete accrual profit calculation.
- Owner is unsure of the financial year-end and believes businesses end on
  31December. Record31December as PROPOSED ONLY, not established/approved; annual
  reporting does not universally require a calendar year-end. Existing approved
  chart remains unknown, not confirmed absent.
- Next clarify whether the named businesses are separately registered companies
  or branches of one registration, and exact legal names. Refine this same draft
  for owner/accountant sign-off; no Step7 implementation or activation authorised
  by these business answers. No runtime/live records changed.

## Plain-Language Review - 2026-10-10 22:58 WAT

Review version: `6A-review-1`. This expands the existing worksheet, not another
accounting implementation or an approved production policy. Architecture and
technical controls are confirmed; business/accounting settings below are NOT
approved. No live setting, source transaction or accounting switch changed.

### What We Are Agreeing

The app needs to distinguish money we hold, money customers owe, money we owe,
income we have earned and costs belonging to the business. A bank receipt is not
automatically profit. The proposed official books use accrual rules, while the
existing budgeted/paid management reports retain their declared basis until an
approved transition. The accountant must confirm the applicable reporting
framework; citing IFRS guidance does not establish this company's eligibility
or compliance.

The draft20-account chart below is a starting list, not a complete signed chart.
Existing bank and expense-head records should become linked subaccounts, not
second payments. The accountant may require additional controls such as deferred
service income, prepayments, receivable allowances or interbranch accounts.

### Fourteen Policy Decisions

Every formal policy row remains UNAPPROVED; partial owner business facts are
recorded above. Suggested treatment is not a setting or approval.

| Policy field | Plain-language meaning | Draft for review / information needed |
|---|---|---|
| `legalEntity` | Whose official accounts these are | Exact registered name, legal structure and reporting framework; do not substitute the app's display name |
| `financialYearEnd` | When the annual accounting year finishes | Use the existing approved year-end, if any; do not assume31December |
| `cutoverDate` | First date covered by the new official ledger | Select after opening reconciliation and separating test from official records; no date selected |
| `revenueRecognition` | When the company's service fee becomes earned income | Tie recognition to supported performance/contract terms; an invoice date or operational stage alone is insufficient evidence |
| `clientDeposits` | Money received before being earned or used for the client | Separate unearned fees/client money from income; receipt once, allocation or authorised use is not another receipt |
| `passThroughCosts` | Duty, shipping, terminal and similar amounts paid in connection with a client job | Review each contract/service: client-funded liability settlement, recoverable company advance, or company-borne cost; do not classify all duty payments identically |
| `vat` | Which amounts attract tax and how it is reported | Accountant confirms current applicable rules, registration, taxable components, recovery, dates and rounding; no rate/exemption assumed |
| `unpaidExpenses` | Costs incurred before payment | Proposed accrual: recognise supported obligation once, then payment settles it; a schedule request/approval is not a cash movement |
| `creditNotes` | Reductions/corrections to an invoice | Link original invoice and approved net/tax adjustment; applying credit is not cash; distinguish actual refunds |
| `badDebts` | Amounts unlikely to be collected or written off | Approve impairment/allowance, write-off and recovery rules; reuse evidence and remaining exposure without inventing a bank expense |
| `assetsAndAdvances` | Equipment, prepaid costs and money advanced to others | Use supported asset/advance balances; agree useful lives, depreciation, amortisation and settlement evidence |
| `loansAndFunding` | Borrowed money and owner money put into the business | Identify capital versus loan; separate principal from interest; bank funding is not automatically sales |
| `branchAccounting` | How branches fit into legal books | Proposed one book only for branches of the same legal entity, with branch reporting; separately approve interbranch balancing and other entities |
| `openingBalances` | Verified starting assets, debts and capital | Prefer reviewed openings plus forward posting where history is incomplete; choose this OR an approved historical import, never both for the same transactions |

Revenue recognition depends on fulfilment of the agreed service, not simply
collection. The IFRS15 reference also distinguishes advance consideration from
earned revenue. See [IFRS15 overview](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-15-revenue-from-contracts-with-customers/)
and [advance consideration, paragraph106](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2021/issued/part-a/ifrs-15-revenue-from-contracts-with-customers.pdf?bypass=on).

For third-party services, gross versus fee-only revenue needs a principal/agent
assessment of the particular contractual promise and control. Separate pricing,
reimbursement or a job title does not settle that assessment. The software-reseller
example illustrates the general framework, not this clearing business's conclusion:
[IFRS principal/agent guidance](https://www.ifrs.org/news-and-events/updates/ifric/2022/ifric-update-april-2022/).

Unpaid expenses and prepaid costs illustrate why cash paid and accounting expense
can differ: [ACCA adjustment guidance](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/adjustments-financial-statements.html).

### One Job, Explained With Dummy Figures

Teaching assumptions ONLY: the approved contract assessment treats NGN90,000
as client money for authorised disbursements and NGN10,000 as the company's fee.
All service obligations are fulfilled before recognising that fee. No tax is
modelled here; this is NOT an assertion of VAT exemption or an approved mapping.
There are no company-borne expenses in this simplified example.

| Event | Illustrative debit | Illustrative credit | What it means |
|---|---|---|---|
| Client pays NGN100,000 in advance | Bank100,000 | Client deposit/funds liability100,000 | Bank increases; this is not100,000 profit |
| Authorised client disbursements paid90,000 | Client funds liability90,000 | Bank90,000 | Client money used; no second company cost under these assumptions |
| Earned service fee invoiced10,000 | Receivable10,000 | Service revenue10,000 | Recognise only the company's earned fee |
| Remaining deposit applied to that invoice10,000 | Client deposit liability10,000 | Receivable10,000 | Invoice settled; no new bank receipt |

The scenario adds NGN10,000 to bank and NGN10,000 to profit, with no remaining
client-funds liability or receivable. These are hypothetical movements, not live
totals or an official opening balance. Different contractual/tax facts require
different approved entries. Multiple containers on the same B/L do not multiply
the shared invoice, collection or journal.

### Permission and Opening-Balance Review

- Name the people who may prepare, independently approve/post, reverse, configure,
  read, close and reopen each book/branch. No names or grants are assigned here.
- The current engine requires different preparer and approver for every journal.
  If only one person is available, resolve staffing/review arrangements rather
  than silently bypassing this control. General finance or Super Admin access
  does not automatically grant accounting posting power.
- Retain the owner's existing designation of these records as test data unless
  explicitly corrected. Do not import test totals as official company balances,
  silently delete them or declare all real openings zero. Official cutover needs
  separately verified real opening evidence.
- Obtain dated bank reconciliation, receivables, deposits/client funds, payables,
  taxes, advances, assets, loans and equity evidence. Balance and source coverage
  both need approval; a journal that balances can still contain wrong figures.
- The recorded original NGN501 purpose exception and NGN10,210,000 missing
  overhead metadata remain evidence exceptions. Do not guess account heads or
  use a hidden balancing plug. These are recorded historical findings, not newly
  checked live amounts in this review.

### Decisions Requested / Approval Record

Owner questions sent22:58WAT: registered business name/entity scope; separate
fee/reimbursed costs versus all-inclusive or mixed contracts; year-end and any
existing approved chart. Partial owner answers received23:54WAT are recorded
above: group arrangement and all-inclusive charging; legal scope/chart remain
unknown and31December is tentative. Do not mark agreement from silence or
interpret business answers as accountant sign-off or Step7 activation.

Before policy activation record: agreed values for all14fields, approved chart
version, owner decision/date/evidence, accountant decision/date/evidence, named
grants, dated reconciled openings and cutover coverage. Record unresolved decisions
as unresolved, not as empty approved values. No signature/approval supplied yet.

Exact next: collect those business facts, refine this same worksheet with the
accountant, then obtain explicit Step7 implementation authority. No new runtime
code, schema, UI, live accounting posting or repeat test suite in this review.

## Phase 6A: Approval Worksheet

The versioned proposed chart is `native-draft-1` in accounting-rules.ts. It covers
assets, liabilities, equity, income and expenses; normal balance is not a rule
that prevents legitimate contra-account balances. Bank and expense-head
subaccounts must map existing records, not create duplicate money facts.

| Decision | Required before activation |
|---|---|
| Books and branches | Legal entity name; which branches belong to one book |
| Currency and year | Three-letter base currency; two-decimal precision; financial year-end |
| Cutover and openings | Cutover date, reconciled signed opening balances, migration coverage |
| Revenue | Service-fee recognition; issued/draft/cancelled invoice treatment |
| Client funds | Deposit liability; allocations reduce liabilities and AR, not cash twice |
| Disbursements | Recoverable duty/shipping/terminal versus company expense; agency versus principal |
| VAT | Applicable treatment, tax controls, rounding and credit-note adjustments |
| Costs | Accrual of unpaid expenses; payment reduces payable, not expense twice |
| Corrections | Credit notes, bad debts, recoveries, reversals and adjustment evidence |
| Non-expense payments | Assets, advances, depreciation, loan principal/interest, funding |
| Access | Named prepare/post/reverse/close/reopen/configure/read grants per branch |

All fourteen policy fields must be supplied with a version and owner/accountant
approval evidence. No VAT rate, financial year, legal structure, historical
classification or opening balance is inferred. Current missing evidence remains
unclassified. Exact fiscal dates and chart details need professional review.

### Proposed Chart for Review - NOT Activated

| Code | Proposed account / subaccount family | Category |
|---|---|---|
| 1000 | Cash | Asset |
| 1010 | Bank accounts, one subaccount per existing bank | Asset |
| 1100 | Trade receivables | Asset |
| 1120 | Recoverable client disbursements | Asset |
| 1200 | Staff/supplier advances | Asset |
| 1300 | Fixed assets | Asset |
| 1390 | Accumulated depreciation, contra-asset | Asset |
| 2000 | Trade payables | Liability |
| 2100 | Unapplied client deposits | Liability |
| 2200 | VAT/tax control | Liability |
| 2300 | Accrued expenses | Liability |
| 2400 | Borrowings | Liability |
| 3000 | Owner capital | Equity |
| 3100 | Retained earnings | Equity |
| 4000 | Clearing/service revenue | Income |
| 4100 | Other approved revenue | Income |
| 5000 | Company-borne direct job costs | Expense |
| 6000 | Existing overhead expense-head subaccounts | Expense |
| 6100 | Bad debt expense | Expense |
| 6200 | Depreciation expense | Expense |

These mirror `native-draft-1`, not approved source mappings or tax advice.
No account or opening balance has been seeded. Names/codes/subaccounts and
recognition rules may be revised during professional review before activation.

## Phases 6B-6E: Controls

- Additive tables only; no existing transactions or roles replaced. Schema and
  functions are created transactionally, under a migration advisory lock.
- Accounting models are outside ordinary Drizzle schema-push discovery, and
  `accounting_*` is excluded from its database introspection. Only the accounting
  migration owns these tables and deferred triggers; deployment cannot create
  a half-protected ledger or strip its guards through generic schema push.
- No chart, book, grants, period or journal is automatically seeded in production.
- The built internal `accounting-foundation.cjs` exports the engine/configuration
  service for future approved adapters. Loading it performs no writes. Step6
  exposes no public journal/configuration HTTP routes or frontend accounting UI;
  those belong to later approved roadmap steps, not duplicate manual cash entry.
- Global `NATIVE_ACCOUNTING_ENABLED` defaults off. A book additionally needs
  approved policy, a matching branch and open dated period. Startup migration
  also remains opt-in while this foundation is awaiting production approval.
- Amount inputs are decimal strings, converted to integer minor units with
  BigInt. Journal totals use exact SQL arithmetic; no floating-point tolerance.
- At least two nonzero one-sided lines, valid active same-book accounts, one
  branch/currency, exact balance. Header, lines, event link and audit are atomic.
- Event keys represent one source event/version. Same payload retries reuse the
  existing journal; changed payload is refused. Source adapters are Step7, not
  enabled by this foundation. Manual journals have explicit controlled request keys.
- Posted headers, lines, links and audits cannot be edited/deleted. Reversal is
  a second journal with opposite lines, reason, link and independent approval;
  no deletion or rewriting of the original cash/source transaction.
- A cancelled draft reversal keeps its original audit/event link. A corrected
  replacement has a new deterministic attempt key; concurrency and a partial
  unique index still permit only one draft/posted reversal for the original.
  The migration upgrades the earlier index only in its own schema.
- Explicit per-book/per-branch grants; canonical active profiles still required.
  Super Admin and general `finance.access` do not silently imply posting grants.
  Every journal has a different preparer and approver, including reversals.
- Abandoned drafts may be cancelled by their preparer, or a reviewer with both
  explicit prepare/configure grants and an immutable reason/actor audit. This
  cannot cancel/edit a posted journal or force a bad draft to post just to close.
- Periods cannot overlap. Posting, configuration and close/reopen share a
  book-level transaction lock. Closed-period writes fail. Reopening requires
  distinct permission and audit reason, not changing original posting dates.
- Shared chart, book policy and period creation require configure grants across
  every branch in that legal book. A single selected branch cannot grant control
  over another branch's shared accounting setup. Close/reopen has the same scope.
- Closing requires no unposted journals plus source completeness, unresolved
  mapping and reconciliation attestations. Until Step7 coverage exists, a normal
  production close cannot be certified by this foundation alone.

## Phase 6F: Acceptance and Rollout Boundary

Engineering acceptance2026-10-10 22:35 WAT:

| Phase | Implemented / verified | Approval or activation boundary |
|---|---|---|
| 6A | Versioned20-account proposal and14-field rule worksheet; missing approval refused | Accountant/owner policy sign-off pending |
| 6B | Protected code/tag; fresh full-restored backup; repeatable transactional nine-table schema | Production schema creation off |
| 6C | Exact atomic balanced/idempotent engine; immutable posted records, audits and linked reversals | No existing transaction writer calls it |
| 6D | Non-overlapping periods, close/reopen audit, draft checks, post/close serialization | Source completeness is a reviewed attestation; automated adapters are Step7 |
| 6E | Named branch grants, canonical profiles, independent approval, whole-book configuration scope | No production grants or permission changes |
| 6F | All23distinct isolated cases across full20/focused3/5/3; existing43/43; unit270PASS/3prior skips; typechecks/build/smoke PASS | Final40aec3d inactive release verified; no official cutover |

Not one uninterrupted full23 foundation run; final five-case rerun covers changed
permissions and final three-case rerun covers cancelled-reversal replacement,
exact original offset and migration repeatability. Three ordinary unit skips predate this
foundation. Checkpoint `checkpoint-before-native-accounting-foundation-2026-10-10`
is preserved remotely at `bec6dca8834d349f566b427fab4b3b0ed054e028`.
Fresh private archive SHA256
`30b6920259ebfda974bff75e2e99a03c276a4cc798c81c7fcbf2ed639ba8b76b`
passed a full isolated restore and62-table financial baseline comparison. It
covers database schema/data, not external document storage or service secrets.

Final functional release `40aec3d6f90dd4f9539e59cd5b28eae2ca0b69ec`, exact
Railway deployment `c687034c-b1e8-48fa-aaa1-a6cf4ad3e725` SUCCESS, public
healthz and deployed inactive-bundle smoke PASS. Read-only production checks:
both switches false,62tables and full financial source baseline unchanged.
Later documentation-only commits carry identical runtime code.

Use the existing isolated Railway database, new run-owned schemas and no duplicate
live records. Test migration twice, rollback, decimal boundaries, API-service
authorization, inactive and unapproved books, balance/immutability at the database,
concurrent retries, conflicting payloads, close/post serialization and reversal.
Also run existing accounting source regressions and the complete build.

These are infrastructure acceptance tests, not accountant certification or full
GL/Trial Balance/Balance Sheet user interfaces. Steps7-12 remain separate.
No source adapter, production grant, historical backfill or cutover is authorised
by implementing Step6. Reviewed policy plus named grants and a separate activation
decision are still needed.

Accounting rationale: balanced adjustments preserve double entry; balance alone
does not prove source completeness. See [ACCA adjustments guidance](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/adjustments-financial-statements.html).
