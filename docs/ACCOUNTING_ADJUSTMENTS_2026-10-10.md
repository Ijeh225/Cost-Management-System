# Credit Note and Bad Debt Corrections

Release update 2026-10-10 00:53 WAT: user explicitly instructed push/deploy
after the local recognition-rules summary. Release of that management convention
is authorised. Historical pending-policy/local status below records the earlier
handoff; provider success/live acceptance not yet confirmed at this milestone.

Recorded: 2026-10-10 00:28 WAT (Africa/Lagos).
Scope: authorised Accounting Step 3, ACCT-004 and ACCT-005 only.
Status: FIXED LOCALLY / ISOLATED VERIFIED. UNCOMMITTED, UNPUSHED, NOT DEPLOYED.

## Evidence and Root Causes

Existing credit-note creation already settled invoices and created reusable
client credit where necessary. P&L and VAT Summary still summed original invoice
amounts, while VAT Tracking independently subtracted notes in the original
invoice period. Write-off created a Bad Debt overhead parent without an expense
payment; P&L only summed paid overhead, omitting the non-cash loss. Neither
creation route protected the complete calculation against concurrent requests.

Before edits, isolated regressions reproduced all three failures: credit-note
revenue unchanged, bad-debt loss omitted, and cumulative notes above invoice
value accepted. Earlier intermediate failures during implementation were fixed,
including correlated audit-date SQL qualification and currency remainder/date
boundary handling; intermediate runs are not described as successful live tests.

## Local Draft Recognition Convention

The owner was asked to confirm this convention; no response received yet.
It is implemented locally for review and must not be released as an approved
accounting/tax policy without confirmation.

- Notes are gross including invoice VAT. Split using original stored VAT,
  not a guessed present tax rate. Cumulative penny rounding ensures a full
  series of notes equals the original invoice VAT exactly.
- Net sales and VAT reductions belong to note date, not original invoice date.
  A later adjustment-only period may legitimately show negative net amounts.
- Bad debt is the actual remaining gross receivable, recorded once on its
  authoritative write-off audit date, as a separate non-cash P&L loss.
- Bad debt removes active outstanding AR but retains invoice revenue and VAT;
  no automatic VAT relief, refund or bank payment is created.
- Nigeria business-day/month/quarter boundaries are explicit, not dependent
  on the server/browser timezone. Undated old losses are visibly flagged.
- Management-report convention only; no statutory filing certification.

Examples: invoice NGN1,075 with VAT75, note107.50 -> net sales900, VAT67.50,
outstanding967.50 if nothing paid; cash unchanged. Separately, invoice1,075
with actual payment300 -> write-off775, revenue1,000 retained, VAT75 retained,
loss775, result225 before other costs, AR0, actual cash still300.

## Existing Architecture Repaired

- Shared invoice-adjustments reader drives P&L, VAT Summary/Tracking and Branch
  Comparison, including branch, client and adjustment-date scope.
- Invoice/client row locks, cumulative active-note cap, serial note numbering,
  positive monetary validation and invoice lifecycle/access guards.
- Write-off locks invoice, refuses due-today/fully-settled/repeat writes, stores
  actual remaining loss and audit event, retains non-cash overhead evidence.
- Non-cash evidence is not payable/editable/deletable or eligible for top-ups
  or payment schedules. Existing legacy linked schedules cannot be paid.
- Written-off invoice payment reversal requires prior adjustment review to
  prevent changing the frozen loss through a generic cash correction.
- Dashboard, invoice/overhead UI, relevant print/CSV and cache invalidation
  updated. Operations budget estimates remain distinct from Financial view.
- Old Bad Debt cash payments remain in cash/bank history and are flagged for
  classification/reversal review. They are excluded from paid overhead to avoid
  deducting an audited non-cash loss twice. No historical fact silently changed.
- No new schema migration, backfill, replacement ledger or GL implementation.
  Existing protected checkpoint and private backup remain intact.

## Verification

All twelve distinct new PostgreSQL cases passed using the existing private
Railway SSH runner against cost_management_integration_test:

1. Proportional note net/VAT matches P&L and VAT Summary; cash unchanged.
2. Remaining bad debt deducted once; VAT/revenue retained, AR0, cash preserved.
3. Due-today and fully settled write-offs refused without creating evidence.
4. Legacy cash Bad Debt payment retained, flagged, not counted as a second loss.
5. Cumulative notes above invoice face value refused.
6. Later-period note does not restate earlier invoice period; VAT/branch/client agree.
7. Concurrent note requests cannot exceed remaining allowance.
8. Lagos midnight agrees across report day/month/quarter boundaries.
9. Three notes on paid invoice exhaust value/VAT exactly, reusable credit but no cash.
10. Concurrent write-offs create one loss; payment/edit/delete/top-up/schedule guards.
11. Active-branch, lifecycle, monetary input and separate non-finance access rules.
12. Audited loss period and undated legacy warnings without guessed dates.

Run accounting: 10 PASS; follow-up4 PASS adding one new case; final1 PASS
adding one new case. Other cases deliberately filtered. Not 15 distinct cases,
and not an assertion that all 32 historical integration cases were re-run.
All run-owned fixtures removed; namespace counts restored; tunnels closed.

Safe unit/mocked API: 39 files,234 PASS,3 pre-existing network-only skips.
Includes six new pure rounding/calendar tests. Library/API/frontend typechecks,
server/frontend builds and git diff --check passed. Existing Vite sourcemap and
large-chunk warnings remain. No browser visual test or live mutation this session.

## Release and Live Gates

1. Confirm draft recognition convention with owner; revise and re-test if different.
2. Commit and push code plus continuity records; do not change protected tag.
3. Verify exact production release and affected endpoints, not only Git push.
4. Reuse retained cash acceptance fixture where suitable for read-only note checks.
   Only create a labelled reversible dummy case if a new write-off proof needs it.
5. Confirm invoice/AR/client settlement, financial Dashboard/P&L, VAT screen/print,
   branch comparison and unchanged cash/bank totals for non-cash adjustments.
6. Verify dialogs/actions/print/CSV visually, record exact IDs/totals and preserve
   audit history. Mark live closure only after those checks actually pass.

Not included: generic credit-note void/reversal, cash refunds, bad-debt recovery
journals, standalone schedule classification ACCT-006, aging ACCT-007, or full
double-entry accounting. Do not promise those workflows from this fix.
