# General Ledger and Trial Balance

Step 8 implementation, 2026-10-11. These are read-only reports of the existing
native double-entry engine, not a replacement for the operational cash ledger.

## Availability and Official Approval

The production native schema and posting switches remain OFF. The new pages
show **Official Accounting Is Inactive**, not invented zero financial statements.
Deploying this code is not approval to enable official accounts. Actual approved
book/chart/rules, named grants, independently reviewed openings and dated cutover
remain separate requirements. Test approvals and fixtures are never real approval.

Existing invoices, payments, cash/source reports and operational workspaces are
unchanged. No report automatically imports, classifies or posts old transactions.

## Using the Pages Once a Book Is Approved and Activated

1. Open General Ledger or Trial Balance from the finance navigation.
2. Select an authorised accounting book. Different books are never added together
   as if they were one legal entity or a consolidated group.
3. Select the branch within your active application scope. A fixed active branch
   cannot be widened. Whole selected book requires read permission on every one
   of that book's branches, not just permission on some of them.
4. Choose an account or all accounts, a period or custom dates, and zero/inactive
   visibility. Dates must be valid and on/after approved cutover; selected-period
   dates must stay inside that book period. Closed periods can still be read.
5. Apply Filters. The report header records the actual applied snapshot, scope,
   currency, policy version, cutover and dates. Unapplied form edits do not change
   the displayed figures, CSV or print.
6. Review the source-coverage warnings as well as the balances. Use an account
   link to open its General Ledger and a journal link to inspect original evidence,
   preparer, independent poster, reversal link and debit/credit lines.
7. Export Snapshot CSV or Print Snapshot. Both use the displayed data, not a fresh
   request with possibly different filters. Refresh deliberately obtains a new
   snapshot; existing same-scope data stays visible during refresh. Switching
   branch/book clears the previous view immediately.

## Financial Rules

- Only posted native journals count. Draft/cancelled journals and future-dated
  postings after the as-of date do not count. Linked posted reversals offset the
  original entries without deleting their history.
- Opening balance is all earlier posted activity before From, across earlier
  periods. A period selection does not incorrectly reset opening to zero.
- Period movements cover From through As Of, inclusive. Closing = opening +
  debits - credits. General Ledger running balances use date/journal/line order.
- Positive signed balances are debit; negative are credit. Trial Balance shows
  debit and credit sides separately. Arithmetic is integer minor units and decimal
  strings throughout; large balances are never rounded through JavaScript Number.
- Unused inactive accounts appear only when requested. Inactive accounts with
  posted history are not hidden just because they are inactive. The existing
  database protection still forbids modifying a posted account definition. Zero
  suppression removes accounts with zero opening, zero movements and zero closing;
  offsetting non-zero movements are not silently hidden.
- A branch/account subset is not whole-book or group consolidation. Its displayed
  debit/credit equality can differ from the complete book. Approved interbranch
  treatment remains an accounting-policy decision, not a guessed report adjustment.

## Source Completeness and Controls

Balanced debit/credit totals are not proof that every operational source is
correctly represented. The report separately revalidates source evidence and
reports unposted, stale, pre-cutover and unclassified exceptions per branch.
It reuses Step 7 reconciliation, not an independent second accounting ledger.

Independent dated account controls are NOT supplied by this read-only report.
`sourceCompletenessConfirmed` and `independentControlsVerified` therefore remain
false, even if the displayed totals balance. Review controls through the existing
reconciliation process before relying on the books officially.

The first 100 exceptions per branch are shown/exported with an explicit truncation
notice and full counts. Monetary totals are never truncated: more than 50,000
posted journal lines in scope is a hard error. Choose a narrower branch/book or
arrange a separately designed higher-volume reporting approach; later From alone
does not reduce the opening-history population.

## Permissions and Safety

Public routes require current authenticated finance access plus the engine's
named native read grants and approved book. Grant revocation, unrelated branches,
unapproved books and inaccessible journals are refused. Super Admin authority does
not replace native grants or accountant approval. Responses are no-store.

All four public report endpoints are GET-only: catalog, book options, report and
posted journal. Report queries use a consistent database snapshot and perform no
journal/source/audit writes. OFF gates run before native database connections;
ordinary session authentication may still read existing user tables.

There is no manual-journal creation, amendment or reversal UI in Step 8. That is
Step 9, with independent permissions and approval through the same engine.

## Verification Boundaries

Unit/API tests cover exact balances, account/date rules, auth and strict scope.
Owned-namespace Railway tests exercise posted openings, movements, reversal,
draft/cancelled exclusion, controls, grant revocation, closed periods and immutable
accounts without changing production records. The namespace/public source guard
and tunnel cleanup must pass before acceptance.

The built-frontend smoke uses loopback-only dummy GET responses and tests CSV,
journal dialog, desktop/mobile, branch refresh, print and OFF/error states. It is
UI fixture evidence, not a live official-book reconciliation. Deployment acceptance
must separately verify exact commit, live health and the deployed OFF/zero-native-
connection smoke. Current results are recorded in the two authoritative registers.
