# Opening Balances Entry and Verification

This interface reuses reviewed opening journals, exact money, book locks, grants,
GL/TB and immutable audit. It is not a second ledger or an automatic bank writer.
Engineering deployment does not activate official accounting. Current staff
launch has not happened; all existing figures remain test data per owner.

## Prerequisites

- Approved book/chart, currency, exact cutover date and open accounting period.
- Existing finance access plus named read/prepare grants for the preparer, and
  read/post grants for a different independent reviewer in the same branch/book.
- Head of Accounts' complete dated ledger schedule, bank reconciliations and
  detailed customer, supplier and deposit controls; actual recorded approvals.
- Real balances/date must not be inferred from test data, current deployment or
  today's bank snapshot. Supporting references identify retained source documents;
  the app stores these references, not an independently verified bank statement.

## Procedure

1. Open Finance > Opening Balances and choose ONE authorised book and branch.
   The approved start date and policy version are supplied by that book, not a
   default current date. All Branches cannot create an opening.
2. Select Enter Opening Balances. Provide actual owner approval, Head of Accounts
   schedule and bank/subledger reconciliation references.
3. Enter every account's debit and credit plus its supporting reference. The form
   starts blank; zero is never assumed. Use Zero only when deliberately entering
   an explicit reviewed zero. Inactive accounts require zero balances.
4. Validate Preview checks complete chart, dates, scope, exact totals and evidence
   without saving/posting. Debits and credits must be exactly equal. Correct the
   actual schedule; never manufacture a suspense/equity balancing amount.
5. Submit for Verification saves an immutable pending version. Nonzero balances
   prepare a journal using the EXISTING opening engine, without posting. All-zero
   schedules retain complete evidence without creating fictitious journal lines.
6. A DIFFERENT currently authorised reviewer inspects the full version and dated
   supporting controls. Enter decision evidence and select Verify and Initialise.
   Nonzero journal posting and branch readiness update occur in one transaction.
   An explicit zero schedule is verified with audit only, not a financial posting.
7. Check the native Trial Balance/GL using the same book/branch/date. Both retain
   exact opening figures once. Zero review is visible in opening history/audit,
   not a fake cash receipt or journal. Readiness is NOT official activation.

## Corrections and Controls

- Original preparer can cancel a pending version with reason. Independent reviewer
  can reject it. A related financial draft is cancelled atomically; the actual
  reviewer is recorded, not impersonated as the preparer. Rejection remains allowed
  for a current reviewer when the preparer's grant has since been revoked.
- Use as New Correction copies retained figures into a NEW immutable request.
  The current complete chart is required, including newly added accounts. Old
  versions, decisions and supporting references remain accessible.
- A verified opening cannot be edited, deleted, replaced or reversed through this
  page. Correct later financial errors using approved source/manual workflows.
  A wrong cutover/opening needs separate professional review, not a hidden reset.
- Stable same-request retries return the original version without another posting
  or audit decision. Changed amounts, references or preparer produce a conflict.
- Exact hashes use the existing canonical evidence serializer, including after
  PostgreSQL JSONB key reordering. Real chart changes before verification are refused.
- Source/manual forward journal preparation and posting require a VERIFIED
  initialization for the exact branch. Database triggers also enforce readiness,
  independent decisions, immutable payload/history and linked posted openings.
  Another branch's verification cannot satisfy this one. Operational cash/source
  writers outside the inactive native engine are unchanged.
- An existing native book with forward journals but no reviewed initialization is
  not silently grandfathered. Its original controls require a separate supported
  cutover review; never insert zero initialization over recorded history.

## Scope and Limits

The complete chart limit is 200 accounts; version list shows the latest200 with
an explicit truncation warning. Original chart/account definitions, all zeros,
payload, references and decisions are retained; older IDs remain readable.
Nonzero journals retain the existing 200-line/4,000-character journal-evidence
limit. Oversized supporting payloads are refused, not truncated or split to hide
missing accounts. Use concise durable document references; a larger supported
chart/evidence limit requires an explicitly reviewed engine extension.

Opening figures initialise the NATIVE general ledger. This page does not change
Bank Management's operational balances, existing AR/AP/deposit records, bank
funding or invoice payments. Reconcile and configure those launch controls with
their approved source mappings; one opening amount does not invent customer or
supplier allocations. Balanced figures alone do not prove complete source coverage.

Accounting flags remain OFF in the live deployment until separately authorised
professional setup/activation. Controlled testing uses owned isolated namespaces
and dummy loopback browser fixtures; no production figures or cleanup are needed.

## Clean Launch Is Separate

The owner intends to clear current test records before staff go-live. This page
does NOT perform that deletion or supply a blanket wipe. Before a future explicit
launch reset: take/verify backups, inventory dummy records and dependencies, agree
retained owner access/configuration, preserve checkpoints/evidence, clear only the
approved scope, then obtain a clean baseline and verified real openings. Protect
posted audit history; do not use ordinary deletion as a financial correction.

Source and acceptance status are recorded in PROJECT_STATE, LIVE_E2E_TEST_REGISTER
and the timestamped2026-10-13 session. VAT setup and Step10 reports are separate.
