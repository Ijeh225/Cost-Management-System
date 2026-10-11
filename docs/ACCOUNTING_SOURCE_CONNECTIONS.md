# Accounting Source Connections

Updated 2026-10-11 13:10 WAT. Internal engineering accepted; production inactive.

## Activation Boundary

These adapters prepare reviewed drafts in the existing native engine. They are
not public HTTP routes, automatic operational posters, or official book approval.
Every draft requires a matching approved book/policy, explicit branch grants,
active correctly classified accounts, an open accounting period, and independent
approval. Both production native switches remain disabled by default.

Operational tables remain the original source of facts. No second invoice,
payment, duty, bank or overhead transaction is created. Event identity is the
original source ID, never a B/L, container count, invoice item or search result.
Existing budgeted/actual-paid dashboards and management reports are unchanged.
Native accrual figures can differ legitimately; the approved General Ledger and
management-account report interfaces belong to later steps. Never add native
journal movements on top of the same original cash-report sums a second time.

## Source Register

| Source | Reviewed debit / credit | Important control |
| --- | --- | --- |
| Issued invoice | AR / reviewed income, client funds, recorded VAT | Explicit recognition date and item splits; one shared invoice only |
| Client deposit | Bank or cash / deposit liability | Actual received deposit, not a wallet snapshot |
| Invoice cash collection | Bank or cash / AR | Matches original AR when recognition is posted |
| Deposit allocation | Deposit liability / AR | Requires posted deposit; no second cash receipt |
| Credit note | Original income/client funds and reviewed VAT / AR and excess client credit | Original-account caps; exact linked adjustment; never cash |
| Client-credit application | Client-credit liability / AR | Requires posted client-specific credit-note evidence, not guessed wallet funds |
| Client-credit reversal | Exact opposite of posted application | Same existing invoice-payment identity; full original offset |
| Invoice write-off | Bad debt expense / AR | Stored amount plus one dated audit; exactly reconciled unpaid AR |
| Duty/container payment | Reviewed expense, recoverable, WIP or advance / bank or cash | Genuine own-branch payment and explicitly reviewed treatment |
| Duty reversal | Exact opposite of original duty journal | Existing negative linked operational reversal, once |
| Overhead bill | Expense / payable | Original header less all top-ups, reviewed recognition date |
| Overhead top-up | Original expense / original payable | Positive dated addition; not the full enlarged header again |
| Direct or scheduled overhead payment | Payable / bank or cash | One expense-payment fact; obligation and earlier payments posted first |
| Standalone schedule payment | Recorded expense, asset, advance, loan principal or other non-expense / bank or cash | Classified source, reason/head, approved amount; unknown history refused |
| Bank funding | Bank / explicitly reviewed capital, loan, asset recovery, income or other liability | No purpose inferred from narration; recovery requires existing asset |
| Own-bank transfer | Destination bank / source bank | Two distinct own-branch banks, no company revenue/cash increase |

Schedules and approvals alone do not create cash entries. Overhead-linked
schedules use `expense_payments`, not a second standalone payment. A derived
Bad Debt overhead row cannot create another payable or cash expense. Existing
asset/advance payments and reviewed loan/capital funding reuse these sources;
no missing loan instrument, amortisation or depreciation schedule is invented.

## Internal Procedure

1. Approve actual legal-book scope, chart, dates, policy version and named grants.
2. Review each original source and choose explicit supported account treatment.
3. Use `previewInvoice`, `previewSettlement` or `previewOperational`; previews
   read/validate only. Unknown, cross-branch or inconsistent sources fail closed.
4. Prepare with the corresponding method. Original/dependency journals must be
   posted first: invoice before adjustments, bill before bill payments, source
   receipt before its allocation, original payment before reversal.
5. A different explicitly authorised accountant uses `approveAndPost`. The
   engine re-reads current facts and rejects stale mappings/sources. Retries
   return the same journal; changed or cancelled attempts cannot post twice.
   Settlement evidence retains the linked invoice ID as well as the customer;
   moving a receipt to another invoice for the same client invalidates its draft.
6. Run `reconcileSources` with independent exact account controls and evidence.
   A balanced journal alone does not prove source coverage or correct balances.

Source timestamps are interpreted as the application's UTC database timestamps,
then converted to the existing Lagos accounting date. Dates do not depend on
whether the caller runs on Windows in Lagos or the deployed server in UTC.

## Reviewed Opening Procedure

`previewOpening` and `prepareOpening` reuse the existing opening validator.
Provide actual reviewed lines, exact debit/credit controls for EVERY account,
cutover date, approved policy version, owner/accountant and source-coverage
evidence. The book, date, accounts and scope must match. Preparation does not
post the opening. Independent approval is still required.

Prepare/post the opening before forward journals. A pending opening blocks
forward preparation; a branch with existing forward journals cannot receive a
late opening. Posted opening retries are idempotent and changed evidence is
refused. No balancing equity/suspense amount is manufactured by this engine.

Historical import and openings-plus-forward posting must not overlap. Generic
opening controls do NOT invent invoice/deposit/client-credit subledger links.
Pre-cutover records remain separately identified for professional coverage and
dated cutover review. A client-credit application without traceable posted
client-specific origins is refused even if today's wallet has a balance.
After an opening is posted, a pre-cutover-created invoice cannot be newly
recognized by simply choosing a later date: it may already be represented in
opening AR. Legacy invoice-specific coverage, including old unissued jobs, must
be resolved explicitly before cutover; this engine does not guess that linkage.

## Reconciliation Statuses

The report declares `existing_supported_sources`, branch, book and through-date.
It inventories source IDs, not multiplied container/item amounts; revalidates
posted source evidence; compares independently reviewed debit/credit controls;
and lists missing controls for every used account. No source/status/balance is
modified by reconciliation.

- `posted`: matching scoped posted source, subsequently revalidated.
- `missing`, `draft`, `cancelled`: no accepted posted source yet.
- `stale`: changed/orphan source, or a posted source now wrongly excluded.
- `review_required`: unknown classification, unlinked adjustment or orphan head.
- `pre_cutover`: historical coverage/opening review is still needed.
- `excluded`: actual draft/cancelled/zero invoice or proven derived duplicate,
  not a silently ignored genuine transaction.

`complete` is true only for this declared supported scope, with all non-excluded
sources accepted and every used account independently reconciled. It is not
professional sign-off, legal consolidation, or an all-assets/all-loans assertion.

## Explicit Limits

- Actual accountant approval, chart/year-end/cutover and dated real opening
  controls are pending; dummy isolated approvals are never production approvals.
- Unknown historical payment 501 and overhead metadata 10,210,000 stay review
  exceptions; no account head is guessed.
- No new collection/recovery on written-off invoices is fabricated. Already
  posted pre-write-off facts can be revalidated; recovery needs its approved
  dedicated operational source and accounting policy.
- Source changes after posting are flagged, not silently accepted by overwriting
  a journal. A corrected, traceable version/adjustment needs its approved workflow;
  an unrelated balancing journal does not erase a stale-source exception.
- No container-cost reversal source exists; do not invent an unrelated refund.
- Reviewed journals remain subject to the existing 4,000-character evidence and
  200-line limits. Oversized evidence is refused, never truncated. Large opening
  manifests or additional subledgers need an approved, traceable design.
- Public General Ledger/Trial Balance, journal UI, asset schedules and later
  accounting reports belong to Steps 8-12, not this inactive Step 7 connection.

Acceptance results and exact deployment evidence are maintained in the two
authoritative registers and the timestamped accounting-source session summary.
