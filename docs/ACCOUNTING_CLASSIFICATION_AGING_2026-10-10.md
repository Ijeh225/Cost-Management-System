# Accounting Classification and Aging Acceptance

## Final Status - 2026-10-10 02:44 WAT

ACCT-006/007 CLOSED, Part A all-seven corrections isolated/deployed/live accepted
within management-report scope. Runtime92e59d1cccc0e83fff05639b0e3346e99cb3513e,
exact Railwayd45f37a1-3488-4cb0-b096-a2ca64226af6 SUCCESS/healthz ok. Final print
labels Over90days and correct branch recognition footer visually verified,
figures unchanged. Prior pending label release note below is historical.
Final closure records8fc11f1 pushed/remote verified02:45 WAT; Part B unapproved.
Data-evidence exceptions
and downloaded-file validation limits below are explicit, not hidden by closure.

## Scope and Protection - 2026-10-10 01:56 WAT

User authorised ACCT-006 and ACCT-007, isolated regression of all seven cash/
adjustment corrections, deployment and controlled live acceptance. Earlier
ACCT-001..005 fixtures must not be recreated.

Protected code tag: checkpoint-before-payment-classification-aging-2026-10-10,
at84ea03b16f71bca89935fdad6cb880150071cba8. Existing cf29433 checkpoint retained.
Private backup: production-before-accounting.dump,283,787bytes, SHA256
6fdfc8e68bc8d2e5d302b83e079e5fb21294b316092ffa15553c27373460b236.
Archive transport/list/SQL inspection and full isolated restore PASS62tables,
financial baseline matching. Temporary restore database removed. Before release,
read-only checkpoint verification confirms archive checksum and production
financial counts/totals still unchanged. Backup excludes external document bucket
contents and service secrets; it is not a duplicate app/environment export.

## Existing Sources, Not Duplicate Functionality

- Existing standalone payment facts remain authoritative for cash. Classifications
  add fields to payment_schedule_payments, not another payment/overhead ledger.
- Overhead-linked schedules continue to write expense_payments only.
- Startup migration standalone_payment_classification_v1 is additive and repeatable.
  Legacy facts default unclassified, with no guessed head, reason or review date.
- Finance Accounts/admin pay authority can review; non-finance access is denied.
  Review honours both authorised and active branch scope, with a transaction row
  lock and expectedVersion conflict protection. Review event records previous and
  next values, actor, time, payment ID and version in the existing schedule timeline.
- Cash amount, payment date, bank and reference are not editable by classification.
- Paid/scheduled/top-up overhead source metadata cannot be deleted or silently
  changed. Unposted history-free overhead remains editable/deletable. Existing
  missing/blank source categories are flagged, not reconstructed from assumptions.

## Supported Management Categories

| Category | Evidence required | P&L effect | Cash effect |
| --- | --- | --- | --- |
| Unclassified / review required | May document missing evidence | Excluded until supported | Original payment once |
| Operating expense | Reason plus expense head | Paid overhead on payment date | Original payment once |
| Asset purchase | Acquisition evidence/reason | No immediate expense | Original payment once |
| Advance / prepayment | Recoverability/agreement/reason | No immediate expense | Original payment once |
| Loan principal repayment | Principal statement/reason | No immediate expense | Original payment once |
| Other non-expense | Specific supporting reason | No immediate expense | Original payment once |

These categories are not chart-of-account codes or statutory accounting policy.
No automatic depreciation, advance recovery, loan-interest split, GL, journal,
Trial Balance or Balance Sheet is implemented in this correction. Mixed-purpose
payments need separate supported facts or further approved accounting work; do
not classify principal as interest or an unknown vendor as an expense.

## Reporting and User Procedure

Payment Schedule includes Standalone Payment Accounting Review with category
filter, source schedule, bank/reference/notes, evidence reason and reviewer/version.
Open Source / timeline to inspect supporting documents and past events, then Review.
Supply a supported category and reason; use Operating expense only with a head.
If evidence is insufficient, retain Unclassified and document why. Concurrent
stale reviews receive409 and must reload; they never overwrite the newer review.
The payment dialog supports the same fields for new standalone payments.

P&L, Financial Dashboard and Branch Comparison use the same existing facts.
Only classified operating expenses enter paid overhead/category/month and net
profit. Client-filtered P&L still does not subtract organisation-wide overhead.
All categories remain in Bank, Financial Ledger and Cash Flow exactly once.
UI/print and branch CSV disclose unclassified cash excluded from expense totals
and missing historical overhead source categories; do not treat a review warning
as a reconciled statutory set of accounts.

## Aging Rules

Current,1-30,31-60,61-90 and over90 are five distinct buckets. Day90 belongs to
61-90; day91 belongs to over90. Dashboard now shows five labels, without combining
the final two. AR and printable aging share Nigeria-calendar date arithmetic,
including Lagos midnight when the UTC server is still on the preceding day.
The report is a current receivable snapshot generated at request time, not a new
historical-as-of balance reconstruction. Draft/cancelled/written-off exclusions
and original receivable balances are unchanged.

## Verification Status

Historical review02:04 WAT (production READ ONLY): payment1/schedule9/NGN1 is
the standalone reconciliation dummy test; payment2/schedule7/NGN500 is historical
reconstruction from Paid event22. Its LEGACY-RECON reference is a reconciliation
identifier, not original bank settlement evidence. Neither has supporting docs
or an established business-purpose category. Retain both unclassified, with
documented reason rather than guessing expense/asset/advance/loan principal.
Original cash facts, amount_paid/status and old events remain unchanged.

Overhead facts1/2/3, NGN200,000/10,000/10,000,000, reference missing parent4:
metadata loss confirmed. Keep10,210,000 as existing paid costs/cash, explicitly
unclassified missing source. Current backup does not recover that old parent;
no description/account head is fabricated. New retention guards prevent recurrence.

- Pre-fix isolated classification PATCH returned404; reproduced missing feature.
- Existing AR/print buckets already separate; initial API boundary reproduction
  passed. Dashboard combination was confirmed in source and earlier live review.
- Unit suite40files:248passed,3skipped; shared pure aging covers eight boundary
  ages at Lagos midnight/end-of-day. Classification rejects unknown/unsupported
  evidence and does not carry an expense head into a non-expense category.
- Typecheck and Railway build PASS (existing non-fatal sourcemap/chunk warnings).
- All43 distinct accounting isolated cases have passing evidence across full/
  selective runs: completed full42PASS/1duplicate-email fixture failure, then
  final guards/staff2PASS/41filtered after fixture correction. Not one single
  uninterrupted full43PASS run. Counts restored/private tunnels closed.
- Additional isolated expense->asset->expense/dashboard source case PASS after
  integration setup reused the real shipment compatibility migration; previously
  the isolated old schema lacked CAP-01 columns. Namespace restored/tunnel closed.
- Primary01e9de4 deployed SUCCESS; final source reconciliation168ab4f deployed
  SUCCESS (Railway496b4d2f-3305-41a9-8b77-6cdf9b2a82bb), healthz ok. Repeatable
  startup migration6fields/check verified; original baseline unchanged before
  authorised controlled writes. Print-label92e59d1 deployment still pending at
  2026-10-10 02:41 WAT; it changes no finance calculation or data.

## Controlled Live Acceptance - 2026-10-10 02:41 WAT

Used bounded existing helper classification mode ONCE for mutations, then
inspect-only on the final runtime. Original ACCT-001..005 fixtures preserved,
not recreated. Historical payments1/2 retain unknown with documented reason,
reviewer1/version1/audit. No original cash date, reference, amount or status edit.

Only new dummy schedule12 E2E-ACCT-20261010 Classification QA, Lagos/NGN6,
approved/completed. Payment3 operating expense QA stationery,4 asset,5 advance,
6 loan principal,7 other non-expense,8 unknown: NGN1 each. Payment3 reviewed
asset then back to expense; two classification audits and stale-version409,
no cash mutation. Source timeline shows six distinct payment events. Paid
overhead8 delete refused409; no deletion. New facts retained for audit.

| Control | Before new schedule | After / final inspection |
| --- | ---: | ---: |
| Bank3 balance | 1,599 | 1,593 |
| Lagos Ledger net / Cash Flow closing | 1,500 | 1,494 |
| Lagos accrual revenue | 4,200 | 4,200 |
| Lagos paid overhead | 300 | 301 |
| Lagos non-cash bad debt | 967.50 | 967.50 |
| Lagos finance net profit | 2,232.50 | 2,231.50 |
| Unclassified standalone cash | 501 /2facts | 502 /3facts |
| Receivables | 1,400 | 1,400 |

All-branches revenue4,201/recognised paid container costs701/gross3,500/paid
overhead15,710,303/non-cash bad debt967.50/net -15,707,770.50 match Financial
Dashboard, P&L and Branch Comparison print. Separate budgeted Operations View
gross70,006,000/net54,295,697 now deducts the same paid-overhead population;
it intentionally does not use accrual invoice revenue. Lagos operational estimate
gross5,000/net4,699/overhead301 matched P&L overhead301 on inspect-only API.
All-time ledger/cash closing net32,291,491 reconciles; transfers can change gross
in/out population without changing net. VAT unchanged by classifications.

Live aging all-branches/AR/print: Current400,1-30=0,31-60=0,61-90=1,000,
over90=0,total1,400. INV-202609-004 is70days overdue, in61-90 only. Draft,
cancelled and written-off records excluded. No live91day fixture created or
existing due date changed; exact90/91 and Lagos midnight covered isolated/unit.

Existing separate non-finance operations account denied403 for review/P&L/
classification; no grants/account changes. Fresh owner UI category/source/
reason/reviewer/version/timeline PASS. Empty evidence or expense head blocks
save via native required validation; dialogs closed without mutation. No captured
Dialog accessibility warnings. Mobile390x844 dialog366px wide/fits viewport.
Evidence screenshots under ignored tmp/, financial dashboard and review dialog.

P&L and branch printable totals/warnings and aging figures visually verified.
P&L CSV click returned no download path before browser timeout; downloaded file
contents not verified, no export bug inferred. No external money transfer, client
message, real invoice or new document created. Protected tags and private archive
checksum reverified after acceptance; audit records remain, not cleaned by deletion.

Remaining evidence limits: original501 business purpose and original expense4
metadata (10,210,000 historical overhead) unavailable. Explicit review warnings
remain, no fabricated classification/recovery. Full GL/Trial Balance/journals/
Balance Sheet/native accounting or integration is separate Part B, not implemented
or authorised here. Provider config migration before2026-12-01 is separately recorded.
