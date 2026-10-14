# Statement of Affairs

## Purpose and limits

Step 11 provides a dated asset/liability valuation schedule for one approved
accounting book and one authorised branch. Assets less liabilities gives net
assets, or a deficiency when negative. It is separate from the posted Balance
Sheet, Trial Balance, opening balances and customer statements. Nothing entered
or approved here creates a journal or changes bank, invoice or operational totals.

This is an internal management schedule, not a statutory/insolvency filing or
professional certification. Approval checks the supplied values and evidence;
it does not assert that every asset/liability has been disclosed or reconcile the
figures to the ledger automatically. Different sister-company books and branches
are not automatically consolidated. A group schedule needs separately reviewed
scope, eliminations and authority; do not add individual versions as if duplicate
and intercompany values had been eliminated.

## Access and readiness

Official accounting remains switched off. Deployment alone must not activate the
module or run its native schema against production. In an approved environment,
users require finance access plus named book/branch `read` grants. Preparation
requires `prepare`; independent approval/rejection requires `post` (reuses the
existing reviewer permission but performs no posting). Only the original preparer
can cancel a pending version. Being Super Admin does not bypass named grants or
independent review. Changing branch/book/user clears the previous scope on screen.

## Prepare a schedule

1. Open **Statement of Affairs**, select the approved book and one valuation
   branch. All Branches is not a writable valuation scope.
2. Choose **Prepare Statement of Affairs**. Enter its actual valuation date and
   descriptive title. No launch date, balance or amount is guessed.
3. Document the scope, supporting schedule reference and limitations/missing
   records. Include ownership boundaries, valuation date, omitted/uncertain items
   and material obligations in the evidence supplied for review.
4. Add each asset/liability once with a unique schedule identity, name and exact
   nonnegative decimal amount (maximum two decimal places). A schedule contains
   1-200 items; do not omit items to bypass the limit.
5. Select **Estimated value** or **Declared book value**. Explain the valuation
   basis and supply supporting evidence for every item. Evidence references are
   retained text; documents should be stored using existing approved document
   controls. References are not automatic proof of authenticity or attachment
   retrieval.
6. Enter its declared carrying amount only when known. A blank book amount means
   **unknown**, never zero. Book-basis valuation must exactly equal its declared
   carrying amount. An estimate may differ from the carrying amount. These book
   amounts are supplied references, not ledger-confirmed balances.
7. Submit for independent review. Amounts are validated using exact minor-unit
   arithmetic. Submission stores an immutable pending version. An interrupted
   response can be retried without editing the form; its stable request identity
   prevents duplicate submission. Editing creates a new identity.

## Review, correct and retain

1. Inspect the version, date, scope, evidence, basis, unknown amounts and totals.
   Resolve incomplete references externally before accepting the schedule.
2. A different authorised reviewer enters the decision evidence, then selects
   **Approve Valuation (No Posting)** or **Reject Valuation**. Neither affects GL.
3. The original preparer may cancel a pending version with a reason. Final
   versions cannot be edited or deleted. Reasons/reviewer/audit timestamps remain.
4. Use **Prepare Retained Replacement** to correct a final version. It retains the
   original ID and date, generates a new request identity and needs new review.
   Only one pending/approved replacement of the same original is allowed.
5. Once the replacement is approved, the original is labelled **Historical /
   Superseded**. Inspect the complete chain; never sum versions of one schedule.
   Rejected/cancelled replacements do not silently supersede the original.
6. CSV and print include state, scope, values, warnings, unknown-book controls,
   preparer/reviewer and audit evidence. A pending print is still explicitly
   pending, not approved. Historical prints retain their historical status.

## Exact example (dummy figures only)

| Item | Category | Valuation | Declared book amount | Basis |
| --- | --- | ---: | ---: | --- |
| Bank | Asset | 100.01 | 100.01 | Book |
| Equipment | Asset | 60.10 | Unknown | Estimate |
| Supplier settlement | Liability | 200.12 | 190.00 | Estimate |

Assets = 160.11; liabilities = 200.12; deficiency = -40.01. Declared book asset
subtotal = 100.01 and liability subtotal = 190.00, but the unknown equipment book
amount makes the book schedule incomplete. It is wrong to claim these subtotals
are a complete posted Balance Sheet. No balancing entry is created.

## Troubleshooting

- **Inactive:** expected while official accounting is off; do not enable it merely
  to inspect test values. Use the isolated approved test environment.
- **No book/branch:** obtain the explicit scoped grants and actual approved book.
- **Invalid money:** remove negatives, commas, exponents and more than two decimals;
  identify contra/revaluation adjustments in the reviewed net value/evidence.
- **Book value required:** provide actual carrying value equal to the book-basis
  valuation, or choose an evidence-backed estimate. Do not invent a carrying value.
- **Duplicate conflict:** inspect the retained request/replacement rather than
  changing an already-saved version or repeatedly creating copies.
- **Self approval:** ask the independent authorised reviewer, not another browser
  session of the same user.
- **Refresh failure:** retained data may stay visible; decisions/export are disabled
  until the current scope reloads. Do not use old figures as newly verified data.

## Verification boundary

Controlled calculator, API, schema, network PostgreSQL and built browser tests
are recorded in the test register. They use dummy scoped evidence only. Real
completeness, valuations, ownership, financial-date approval and professional
acceptance remain management/accountant responsibilities before official use.
