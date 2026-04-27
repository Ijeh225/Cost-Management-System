# Duty Payments — End-to-End Test Plan

**Module:** Centralized Duty Payment (Task #87)
**Owner:** Accounts workflow
**Routes under test:** `/duty-payments`, `/api/duty-payments`, `/api/duty-payments/:containerId`

---

## 1. Roles & Access

| # | Role | Expected behaviour |
|---|------|--------------------|
| 1.1 | `super_admin` / `admin` | Sidebar shows **Duty Payments** entry; `/duty-payments` page loads; record-payment dialog usable. |
| 1.2 | `accounts_user` | Same as above. |
| 1.3 | `documentation_user`, `operations_user`, `terminal_user`, `delivery_user` | Sidebar entry hidden; navigating directly to `/duty-payments` shows the "Duty Payments access required" gate. |
| 1.4 | Unauthenticated request to `GET /api/duty-payments` | Returns `401 { error: "Not authenticated" }`. |
| 1.5 | Authenticated non-allowed role to `GET /api/duty-payments` | Returns `403 { error: "Duty Payments access required" }`. |

## 2. List endpoint — `GET /api/duty-payments`

| # | Scenario | Expected |
|---|----------|----------|
| 2.1 | No filters | Returns paginated rows + summary; `total` matches container count visible to user. |
| 2.2 | `status=paid` / `partial` / `unpaid` / `not_assessed` | Only matching rows returned; counts in `summary` reflect FULL filtered set, not just current page. |
| 2.3 | `status=bogus` | Returns `400 { error: "Invalid status. Allowed: ..." }`. |
| 2.4 | `dateFrom=not-a-date` | Returns `400 { error: "Invalid dateFrom (expected ISO date)" }`. |
| 2.5 | `dateFrom=2026-04-30&dateTo=2026-04-01` | Returns `400 { error: "dateFrom must be on or before dateTo" }`. |
| 2.6 | `search=` matches container #, BL #, or customer name (case-insensitive). | Hits found by partial substring on any of the three columns. |
| 2.7 | Container with no `customs_charges` row | Appears with `dutyStatus=not_assessed`, all monetary fields `0`. |

## 3. Record-payment endpoint — `PATCH /api/duty-payments/:containerId`

| # | Scenario | Expected |
|---|----------|----------|
| 3.1 | Valid `{ amount: <= outstanding }` | `200`; `customs_charges.dutyPaid` increments, `dutyNotPaid` decrements; `audit_log` row written with `section=customs`, `action=duty_payment_recorded`, `fieldChanged=dutyPaid`, `oldValue=<prevPaid>`, `newValue=<newPaid>`, optional `reason` containing `date=<paymentDate>` and/or notes. |
| 3.2 | `amount <= 0` | `400 { error: "Amount must be greater than zero" }`. |
| 3.3 | `amount > outstanding` | `400 { error: "Amount (<amt>) exceeds outstanding balance (<outstanding>)." }`. |
| 3.4 | Container without an assessed duty | `400 { error: "Duty has not been assessed for this container yet." }`. |
| 3.4b | Container fully paid already | `400 { error: "Duty is already fully paid for this container." }`. |
| 3.5 | Container ID does not exist | `404 { error: "Container not found" }`. |
| 3.5b | Path parameter is not a number | `400 { error: "Invalid containerId" }`. |
| 3.6 | Two simultaneous PATCHes against the same container | Serialised by `SELECT … FOR UPDATE` inside the transaction; final balance is consistent (no lost update). |
| 3.7 | After PATCH: re-list `/api/duty-payments?search=<container#>` | Row reflects new paid/outstanding; `dutyStatus` flips to `paid` when outstanding reaches 0. |

## 4. Page UI — `/duty-payments`

| # | Scenario | Expected |
|---|----------|----------|
| 4.1 | Page loads | Summary cards (Total Assessed / Paid / Outstanding) render with NGN figures. |
| 4.2 | Status filter chip (paid / partial / unpaid / not_assessed) | Table updates; URL pagination resets to page 1. |
| 4.3 | Search input (debounced 300 ms) | Hits API with `search=`. |
| 4.4 | Date-range pickers (More → From / To) | Hits API with `dateFrom`, `dateTo` in YYYY-MM-DD. |
| 4.5 | "Record Payment" button on a row | Modal opens with container summary, outstanding, amount input. |
| 4.6 | Submit modal with valid amount | Toast "Duty payment recorded"; row + summary refresh; modal closes. |
| 4.7 | Submit modal with overpayment | Toast "Could not record payment" with API message. |
| 4.8 | Auto-focus via `?focus=<containerId>` querystring | Modal auto-opens for that container after data loads. |
| 4.9 | Pagination controls | Page changes; query refetches; rowset updates. |

## 5. Export

| # | Scenario | Expected |
|---|----------|----------|
| 5.1 | Filters set; click Download → Excel | Imperative `listDutyPayments({ limit: 500, ...filters })` runs; XLSX contains ALL filtered rows across pages, not just the current page. |
| 5.2 | Same as 5.1 but PDF | Landscape A4 PDF generated with same row set; right-aligned currency columns. |
| 5.3 | Click Download with no filtered rows | Toast "Nothing to export"; no file produced. |
| 5.4 | Export in progress | Button label shows "Exporting…" and is disabled. |

## 6. Cross-page consistency

| # | Scenario | Expected |
|---|----------|----------|
| 6.1 | After PATCH on `/duty-payments`, navigate to `/workspace/accounts` | Card shows updated duty paid/outstanding and updated chip. |
| 6.2 | After PATCH, navigate to `/containers` | Duty payment chip on the container row reflects the new status. |
| 6.3 | `/containers?dutyPaymentStatus=unpaid` | Container directory list filters down to unpaid containers only. |
| 6.4 | `/containers` "Clear all filters" button | Resets `status`, `profitFilter`, `paarFilter`, `berthedFilter`, **`dutyPaymentFilter`**, and date range. |
| 6.5 | Submit-to-Operations from `/workspace/accounts` while outstanding > 0 | Button disabled; tooltip explains duty must be fully paid first. |

## 7. Audit trail

| # | Scenario | Expected |
|---|----------|----------|
| 7.1 | Each successful payment | New `audit_log` row: `section=customs`, `action=duty_payment_recorded`, `userId=<recorder>`, `metadata` includes `amount`, `previousPaid`, `newPaid`, `outstandingBefore`, `outstandingAfter`. |
| 7.2 | Failed payment (overpay, etc.) | No `audit_log` row written (transaction rolled back). |

---

### Manual smoke pass executed during development

- 1.1, 1.4, 1.5 — verified via curl on `localhost:8080`.
- 2.3, 2.4 — verified after adding explicit param validation.
- 3.1, 4.5–4.7, 6.1, 6.2 — verified manually in the running app while logged in as `ijehifeany@gmail.com`.
- 5.1 — wired to `listDutyPayments({ limit: 500 })` for full filtered set.

### Outstanding for automated coverage (follow-up #89)

- 3.6 (concurrent PATCH lost-update test) requires a Vitest integration test.
- 7.1 (audit log assertion) requires a DB-level assertion in the same Vitest suite.
