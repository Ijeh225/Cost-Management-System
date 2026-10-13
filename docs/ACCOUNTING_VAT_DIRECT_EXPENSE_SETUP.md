# VAT and Direct Expense Setup

Engineering implementation: 2026-10-13. Deployment does not approve tax rules or
activate official accounting. See PROJECT_STATE.md for acceptance/release evidence.

## Scope and Reuse

The Finance sidebar's VAT / Direct Expenses page uses the existing native book,
branch, chart, grants, source-event identities, balanced journal engine, independent
posting, openings, GL and Trial Balance. It does not create a second ledger or
another operational payment, alter budgets, replay test history or change banks.
Legacy invoice VAT entry and operational cash/P&L/VAT reports keep their previous
recorded-data basis until a separately approved native cutover. New native settings
are not silently pushed into existing invoice forms or historical expense figures.

## Configure

1. Select an authorised approved NGN book and one branch. All Branches is not a
   write scope. The operator needs a named current `configure` grant.
2. Select five existing, distinct, active accounts in that book: input VAT asset,
   output VAT liability, Duty direct expense, Shipping direct expense and Terminal
   direct expense. Account creation is the existing chart workflow, not guessed
   from account names or automatically seeded by this page.
3. Enter an explicit effective date no earlier than the approved cutover. Later
   approved versions must have later dates and cannot cover already posted native
   invoice/duty/container-cost history. Earlier versions remain immutable.
4. Enter owner and accountant approval references. Define separate taxable,
   zero-rated and exempt codes with their legal/recovery basis. Taxable rates are
   positive; zero-rated/exempt have zero rates and zero input recovery. The editable
   7.5% template is a proposal, not confirmation of company exemption or recovery.
5. Set each taxable purchase code's explicitly approved recoverable percentage
   from 0 to 100. Different codes may express cost-only, full or mixed-use recovery.
   Do not presume VAT on customs payments, or recoverability on exempt services.
6. Submit the immutable version. A different active user with the current configure
   grant inspects all accounts/rules/evidence and approves or rejects it. The preparer
   may cancel a pending version. Final versions, decision reasons and audit cannot
   be edited/deleted. A corrected configuration is a new dated version.

The accountant must confirm the applicable exemption and input recovery basis.
Reference verified 2026-10-13: [Nigeria Tax Act 2025, National Assembly](https://nass.gov.ng/documents/download/11249),
sections 147, 155, 185 and 186. This documentation is not a company-specific tax opinion.

## Review Existing Payments

1. Load the actual Duty Payment transaction-row ID or Shipping/Terminal Container
   Payment row ID. A container ID is not a payment ID. Source reads are branch-scoped.
2. Select the approved configuration applicable on the recorded payment date, the
   explicit supplier VAT code and the reconciled cash/bank ledger account.
3. Enter the supplier-document amount and select inclusive gross or exclusive net.
   Its calculated gross must exactly equal the already recorded payment. Never add
   VAT to cash again. A missing/ambiguous tax document requires review, not a guess.
4. Enter the supplier/tax review reference and preview. Example: gross N107,500 at
   7.5% produces net N100,000 and VAT N7,500. Full recovery debits expense N100,000
   and input VAT N7,500; no recovery debits expense N107,500; 40% recovery debits
   expense N104,500 and input VAT N3,000. All credit cash/bank exactly N107,500.
5. Prepare the existing source once. A different user with read/post grants inspects
   its exact retained draft/evidence and independently posts it. Verified openings,
   current access, open period and source/configuration revalidation still apply.

Duty sources use the configured Duty head, Shipping the Shipping head and Terminal
the Terminal head. Broad Customs, Delivery, Operations and category-only records
are not assumed to be duty/shipping/terminal: they retain their dedicated reviewed
mapping workflow. No expense is created again when an existing payable is settled.

For a recorded full Duty reversal, load its actual reversal row. The engine reuses
the posted original's configuration, tax split, heads and cash account, even if a
newer configuration is now effective. It uses the existing reversal dependency,
full-offset and duplicate guards. Do not enter a negative new dummy cash payment.

## Review Issued Invoices

Load an issued invoice; select the reviewed AR asset and service income account,
recognition date and per-item tax codes (default code can be overridden per item).
The existing invoice item's stored amount is net. Independently calculated item
VAT must exactly equal the stored invoice VAT, and total must equal net plus VAT.
Positive recorded VAT uses the configured output liability; zero does not invent
a tax journal. Exempt and zero-rated remain distinct even at the same zero amount.

If recorded VAT does not agree, correct the source through its existing permitted
invoice workflow before recognition. Do not overwrite an issued/paid source or
invent a tax adjustment here. This setup screen maps reviewed bundled service
items to income. Mixed principal/agent income/client-funds splits retain the
existing explicit InvoiceAccountingMapping workflow; the screen does not guess them.

## Reports and Controls

- Generate the Posted VAT Register for the selected branch/date range. It shows
  net, VAT, gross, recoverable and in-cost amounts with source/journal/config IDs.
  Input and output tax figures are checked against posted ledger tax lines, not
  reconstructed from a bank narration. Draft/unposted/cancelled entries are excluded.
- Full Duty reversals offset the original purchase VAT and cost. Credit notes use
  their existing independently reviewed original-liability reductions; they are
  aggregate credit adjustments, not invented allocations across mixed item codes.
- Legacy source journals without structured tax evidence are counted as unclassified.
  The register explicitly states its posted-native basis and is not an official
  tax return. Opening VAT controls and tax remittances require separate reconciliation.
- Reconcile with posted GL/TB under the same book/branch/date. Native Balance Sheet/
  Management Accounts are still Step10, not implemented by this configuration task.
- Stable request/source identities prevent duplicate versions or duplicate money.
  A later effective configuration makes affected unposted drafts stale and posting
  is refused. Existing cancelled source identities are not reused to duplicate money;
  correction follows the existing explicit accounting/source correction procedure.
- Branch/user changes clear unsaved scoped forms. Same-branch refresh retains
  visible data and disables writes. Dialogs carry accessible names/descriptions.

## Limits and Launch Boundary

At most 12 codes/configuration; latest 200 versions/journals visible, with a visible
limit notice. Existing source journal evidence is limited to 4,000 characters and
invoice item/line limits remain enforced; do not omit evidence to bypass them.
The VAT register rejects more than 10,000 journals instead of truncating totals.

Production native accounting and schema stay OFF. Real approved book/chart/grants,
go-live date, exemption/recovery basis, verified openings and operational bank/
AR/AP/deposit reconciliation are prerequisites for separately authorised activation.
Future removal of test data remains a separately backed-up launch operation.
