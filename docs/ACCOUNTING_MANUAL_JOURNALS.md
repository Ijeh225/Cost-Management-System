# Manual Journals and Accounting Adjustments (Step 9)

## Activation Boundary

This is an additive interface to the Step6 engine and Step8 GL/TB, not another
ledger. Engineering deployment does not activate official accounting. Both native
switches remain OFF until actual chart/book/policy, opening controls and cutover
are separately approved. Do not use test approval evidence for real books.

Existing invoices, duty reversals, bank postings and operational cash reports
are unchanged. Source adapters and reviewed openings retain their own controls.

## Prerequisites

- Approved native book, currency and cutover; open non-overlapping accounting period.
- Current canonical finance access plus explicit branch/book accounting grants.
  Manual queue/details require read; preparation/submission/cancellation require
  prepare; independent rejection/posting require post; reversal requires prepare
  and reverse. Owner title alone is not a named accounting grant.
- Actual owner/accountant complete-chart classification: protected controls vs
  non-control adjustment accounts. Configure grants in EVERY book branch and
  Super Admin ownership are required to record this whole-book review.
- Protected bank/cash/customer/supplier/tax accounts cannot be freehand posted.
  Classification is never inferred from account code/name. Known source controls
  cannot be approved as adjustment accounts; future source mappings cannot use
  an account already approved as a freehand adjustment control.
- Reviewed account roles are immutable. New chart accounts require an additional
  complete-chart review preserving previous approved roles before manual writes.
  Correcting an incorrectly approved role is a separately reviewed migration,
  not a hidden edit or owner override.

## User Procedure

1. Open Finance > Manual Journals. Select an approved book and ONE authorised
   branch. All Branches can inspect the catalog but cannot be a journal's scope.
2. The owner uses Review Account Protection to record the actual accountant's
   chart classifications and both approval references. Existing approved roles
   remain locked; no default assignment or approval evidence is provided.
3. An authorised preparer clicks Prepare Adjustment. Select accrual, depreciation,
   prepayment, reclassification or correction. Enter date, narration, purpose,
   reviewed calculation/supporting schedule, and durable evidence references.
   Each reference identifies a retained voucher/document version or external
   accountant schedule. References are stored, not automatically fetched or
   verified files; retain the underlying evidence in its approved repository.
4. Choose explicitly permitted accounts and enter exact decimal strings. At least
   two lines, one nonzero side per line, total debit exactly equal to credit.
   Floating amounts, negative journal sides and more than two decimals are refused.
5. Save Draft. This creates an immutable version and audit/source identity, NOT
   a posting. An interrupted response can retry the same identity/payload without
   another journal. Changing its payload requires a fresh request identity.
6. Open the journal and inspect evidence/lines/audit. Revise Draft atomically
   cancels the old version and creates a linked replacement; the old version and
   rejection reasons remain readable. A failed replacement rolls back cancellation.
7. Submit for Review with reason/evidence. Submitted versions cannot be revised
   or cancelled by the preparer until an independent reviewer rejects them.
8. A DIFFERENT current user with the named post grant reviews that exact version.
   Reject requires a reason and leaves it unposted. To change a rejected version,
   the original preparer creates a new linked draft and submits that version.
9. Approve and Post is one atomic independent decision. It checks current grants,
   approved book, account protection/activity, cutover and open period again.
   One posted audit and one posting only; concurrent/repeated requests deduplicate.
10. Verify the posted journal in GL/TB using the same branch/date/book. Drafts,
    submitted, rejected and cancelled versions are excluded from these totals.

## Reversals and Corrections

- Posted payload, account lines, date, source identity and audit cannot be edited,
  deleted or moved between periods. Prepare Full Reversal creates an exact linked
  offset in an open period; original accounts/amounts are copied by the existing
  engine, not manually re-entered. The original remains posted and readable.
- The reversal is a draft requiring its own submission and different independent
  poster. There can be only one active reversal. A cancelled reversal attempt
  remains retained; prepare a new dated attempt using the same original link.
- A reversal draft cannot be revised into a different arbitrary manual adjustment.
  Cancel an unsubmitted/rejected reversal and prepare a new full reversal instead.
- Operational source reversals and reviewed opening corrections cannot bypass
  their source subledgers through this interface. Use their dedicated workflow.

## Supported Examples and Limits

Depreciation: debit reviewed depreciation expense, credit reviewed accumulated
depreciation, using an accountant-reviewed asset schedule as evidence. Prepaid
recovery: debit reviewed expense, credit a reviewed NON-CONTROL prepaid asset,
using an independently approved dated recovery schedule. Accrual/reclassification
and corrections similarly require exact approved amounts and non-control accounts.

No depreciation rate, asset life, VAT, loan interest, payroll or recognition policy
is guessed. This step does not introduce a complete fixed-asset, loan, payroll or
amortisation subledger. Approved supporting schedules are durable evidence inputs,
not an automatically recalculated accounting schedule. Unsupported control-account
adjustments need an approved source/reconciliation workflow, not a manual bypass.

The queue shows the latest 200 versions and explicitly warns if more exist.
Individual version IDs are retained and readable through the scoped detail API;
posted history remains available through GL/TB. Evidence references are not an
attachment upload system; existing document storage is not duplicated.

Balanced journals are not proof that all sources exist, controls reconcile or
financial statements are professionally approved. Step8 source exceptions remain.
Manual non-cash adjustments do not manufacture cash receipts in operational
reports. Step10 financial statements remain separate future work.

## Troubleshooting and Technical Controls

Inactive: await real approvals/authorised activation, do not enable flags to make
tests pass. Account review required: classify the whole chart, including new
accounts. Protected account: use the source workflow. Period closed: select a
valid open date or follow approved reopen controls; do not redraft history.
Self approval/grant refused: use the independently authorised reviewer.
Duplicate conflict: identity belongs to different payload/preparer; inspect it,
do not blindly resend with a new identity. Rejected: create a linked revision.

APIs live under `/api/accounting/books/:bookId/manual`. Authentication, existing
CSRF, finance capability, strict input/branch validation, named grants, book locks,
database triggers and immutable audit apply. Every response is non-cacheable.
New reviewed requests reserve `adjustment:` identities. Existing internal
`manual:` identities remain compatible and are not rewritten or silently enrolled
in the new review queue. Source/opening namespaces remain separately reserved.
Frontend caches are keyed by user/book/active branch/journal branch; switching scope
unmounts old data/forms/dialogs. Same-scope refresh retains entries but disables
writes. Successful mutations invalidate native reports/queue/details together.

Verification results and exact release evidence are maintained in PROJECT_STATE,
LIVE_E2E_TEST_REGISTER and the timestamped 2026-10-12 manual-journals summary.
