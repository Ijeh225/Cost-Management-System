# CAP-04 Live Acceptance - 2026-09-09 13:15 WAT

## Scope and Result

User requested live confirmation of multi-container B/L grouping, independent
progress and no duplicated financial totals. Core checks passed on the deployed
application through the owner browser session. Two display issues were found
and subsequently closed at 13:37 WAT by the fix and live retest below. This is
bounded CAP-04 acceptance, not a repeated full finance audit.

All test data was explicitly authorized by the user. No passwords, tokens or raw
session data are recorded here. Existing historical fixtures were not changed.

## Controlled Records

The initial All Branches directory contained 13 containers and no CAP-04 fixture.
Created exactly two containers, in E2E-20260901-Lagos, linked to existing client #6:

| Record | Container | B/L | Agreed clearing charge |
| --- | --- | --- | ---: |
| Visit #32 | CAPU2609091 | CAP04-LIVE-20260909 | NGN 100 |
| Visit #33 | CAPU2609092 | CAP04-LIVE-20260909 | NGN 200 |

Declarations identify these as dummy CAP-04 acceptance records, not physical moves.
Created one invoice #14, INV-202609-007, containing each visit once. Draft subtotal
and total were NGN 300; marked Sent internally for accrual reconciliation. No
external Send Invoice/Reminder action, collection, bank posting, duty transaction
or expense payment was performed. Invoice and visits remain for inspection.

## Observed Passes

1. Both create operations succeeded with the same B/L, branch and client. Visit
   links #32 and #33 appear in the same Containers on this B/L card.
2. Verified only #32: it became Registered while #33 remained Pending Verification.
3. Saved only #32 delivery date as 2026-09-09. Reload confirmed persistence and
   the group reported 1 of 2 delivered, 0 jobs closed. Delivery is not job closure.
4. Assigned only #32 to the owner, due 2026-09-10, with a clearly labelled next
   action. #33 still had no owner, due date, next action or delivery date.
5. Charges remained NGN 100 on #32 and NGN 200 on #33; neither inherited the
   other's amount. No expenses or payment history were copied.
6. Invoice #14 has two source lines (NGN 200 + NGN 100), one common B/L and
   total NGN 300, not NGN 600. No old containers were included in that invoice.
7. All-time Financial Dashboard and actual-paid P&L agreed after issuance.
   AR also showed precisely NGN 300 current outstanding from this new invoice.

## Before/After Reconciliation

All Branches; no date filter. Changes reflect only the recorded dummy writes.

| Metric | Before | After | Delta |
| --- | ---: | ---: | ---: |
| Containers | 13 | 15 | +2 |
| Budgeted clearing charges | 72,004,201 | 72,004,501 | +300 |
| Budgeted cost | 2,000,501 | 2,000,501 | 0 |
| Accrual revenue / total invoiced | 3,001 | 3,301 | +300 |
| Issued invoice count | 3 | 4 | +1 |
| Invoiced container count | 3 | 5 | +2 |
| Actual paid container costs | 701 | 701 | 0 |
| Actual paid overhead | 10,710,302 | 10,710,302 | 0 |
| True net profit | -10,708,002 | -10,707,702 | +300 |
| Total collected | 2,001 | 2,001 | 0 |
| Outstanding receivables | 1,000 | 1,300 | +300 |
| Bank #2 | 47,499,997 | 47,499,997 | 0 |
| Bank #3 | 599 | 599 | 0 |
| Bank #4 | 1 | 1 | 0 |

P&L source categories stayed Shipping 201 + Customs 500 = cost of sales 701.
Revenue 3,301 - costs 701 - overhead 10,710,302 = net profit -10,707,702.
AR showed Lagos invoices 3,300, collected 2,000, outstanding 1,300; the other
client's NGN 1 invoice/collection remained unchanged.

## New Findings

### CAP04-UI-001 - Shipment Summary Refresh (Medium)

- After verifying #32 and saving its delivery date, the detail fields updated but
  the already-loaded sibling card retained its old status/count until reload.
- Reload showed correct persisted values: Registered and 1 of 2 delivered.
- Source confirms delivery mutation invalidates the container detail/list and
  delivery/dashboard queries, but not `/api/containers/:id/shipment`. React Query
  does not prefix-match inside the single URL string. The separate shipment
  query remains cached. Review verification and other membership/status mutations
  as well so all affected loaded sibling cards refresh consistently.
- Fix cache invalidation at existing mutation boundaries, add regression coverage,
  then retest with the same records. No financial/data persistence failure found.

### DASH-002 - Overlapping Progress/Completion Labels (Medium)

- After recording #32 delivery without closing its workflow, Dashboard showed
  Total 15, In Progress 14, Completed 2. Those apparent category totals equal 16.
- Source in `routes/containers.ts` counts In Progress as status != closed, but
  Completed as deliveredAt != null. A delivered yet unclosed job counts in both.
- Independent shipment delivery worked; this is a pre-existing dashboard
  definition/label inconsistency exposed by a new combination of test data.
- Correct or explicitly distinguish open jobs versus delivered containers, with
  agreed non-overlapping definitions where a partition is intended. Do not erase
  a delivery date or auto-close a job merely to make cards add up.

## Limits and Next Action

No new actual cash payment, shared-fee allocation engine, repeat-equipment live
visit, cross-role session or full departmental release sequence was tested here.
Prior isolated checks remain separate evidence. No general claim that every
possible financial aggregation is verified follows from this bounded scenario.

Core requested live behavior is confirmed. CAP04-UI-001 and DASH-002 are now
closed by the following retest. CAP-01 has not started. Preserve invoice #14 and
visits #32/#33; do not recreate or reinvoice this test shipment.

## 13:37 WAT - Display Fix and Live Closure

- Code `4e8095e` committed/pushed; Railway deployment
  `6b10f5bb-ba9a-46f7-9b59-994b25ecc862` SUCCESS.
- CAP04-UI-001: explicitly invalidates shipment queries after visit mutations,
  including cached sibling/old-shipment views. Local browser verified status
  change and delivery set/clear without reload. Live #32 cleared delivery date:
  card immediately showed 0 of 2; restoring 2026-09-09 immediately showed 1 of 2.
  No intervening page reload. Original date restored, #33 remains pending.
- DASH-002: API retains compatible field names but both delivery-card counts now
  use delivery-date presence. UI labels Undelivered and Delivered distinguish
  these from job closure. Live 15 = 13 + 2; no overlapping category counts.
- Automated suite: 141 tests / 30 files; focused 7 tests after test-import fix;
  full production build and browser smoke passed. Existing Vite warnings remain.
- No financial write or new fixture. Dashboard invoice 3,301, collection 2,001,
  AR 1,300, budget figures and banks match the earlier baseline after date restore.
- Both findings closed. Prior source observations remain above as audit evidence.
