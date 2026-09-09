# Shipment Scope Discussion - 2026-09-09

## 2026-09-09 10:53 WAT (UTC+01:00) - Multi-Container B/L Confirmed

- User confirmed one Bill of Lading can cover multiple containers.
- This resolves the multi-container part of the CAP-04 foundation question from
  the September 8 feature discussion. CAP identifiers and closed defects remain.
- Proposed structure: a shipment/B/L parent links multiple containers, each with
  independent operational progress, department ownership, dates and costs. Shared
  document/charge handling should avoid duplicate records and financial totals.
- Example for design discussion only: one B/L with three containers; one may be
  delivered while the other two remain in progress. This is not a new test record.
- Preserve current record IDs, financial facts and audit links through any future
  additive migration. Do not simply remove uniqueness checks as a workaround.
- Requirement confirmation is not implementation approval. No application source,
  schema, configuration or live data changed; no tests run or repeated.
- Next action: inspect the existing model/grouping and define CAP-04 acceptance
  and migration scope before implementation. Repeat equipment visits and whether
  the business operates a physical yard are still unconfirmed.
- Requirement records committed as 0fc60df; no feature implementation included.

## 2026-09-09 11:35 WAT (UTC+01:00) - CAP-04 Authorized

- User explicitly asked to start CAP-04 after discussing its dependency for CAP-01.
- Traced global container and B/L uniqueness and upload preview duplicate checks.
- Implement an additive shipment parent and equipment identity, retaining current
  container IDs as visits and preserving their finance/document/workflow links.
- Verify branch/client consistency, multiple containers per B/L, repeated equipment
  on different shipments, independent progress and duplicate-visit protection.
- Shared cost accounting remains in existing source records; do not generate or
  replicate charges while grouping. CAP-01 work queues remain a separate feature.
- Live migration/deployment and acceptance are not yet verified.

## 2026-09-09 12:01 WAT (UTC+01:00) - Isolated Verification Milestone

- Implemented shipment/equipment identity tables and transactional, idempotent
  startup migration. Container IDs remain visit IDs; no financial facts copied.
- Updated create/import identity errors, upload pair-based duplicate detection,
  generated API contract and sibling container navigation with partial delivery.
- Exact AI queries/actions now reject ambiguous equipment-number matches instead
  of selecting the first historical visit. Client linking/unlinking is an explicit
  whole-shipment operation with per-visit audit and atomic rollback.
- 130 API/local SQL tests passed initially; four additional PGlite/Drizzle client
  assignment tests passed. Full production typecheck/frontend/API build passed.
- Local Docker engine was unavailable; added dev-only embedded PostgreSQL tests
  and also verified the existing Railway isolated test DB over a private SSH tunnel.
- Real PostgreSQL tests passed migration/rerun/history preservation, three
  concurrent containers sharing one parent, duplicate-visit race rejection,
  conflicting-client race rejection, repeat equipment and partial completion/costs.
- Tests used only a random cap04_regression namespace in the named isolated DB.
  Namespace removal and tunnel closure verified; public schema and existing test
  fixtures untouched. No production connection or variable change.
- Local browser verified sibling navigation, partial delivery and 390/768/1440
  widths; upload smoke is still in progress. Not a live acceptance claim.

## 2026-09-09 12:07 WAT (UTC+01:00) - Implementation Ready for Publication

- Final suite: 137 passing tests in 29 files. Full Railway build passed; final
  API typecheck passed. Existing non-blocking Vite warnings unchanged.
- Local production browser smoke passed partial delivery, sibling navigation,
  phone/tablet/desktop widths and importing two new boxes on an existing B/L while
  skipping its existing visit. Initial fixture-only CSRF key corrected to `token`.
- Invoice headers now derive a common B/L from linked items; general fee lines
  are not treated as another shipment. Amount calculations remain unchanged.
- Same-client assignment retries do not duplicate audit events; client assignment
  records old/new client IDs and preserves financial references.
- Added CAP04_SHIPMENTS_AND_CONTAINER_VISITS.md with structure, procedures,
  migration/rollback guardrails, evidence and separately scoped features.
- Current remaining work: publish, confirm deployment/migration, then scoped live
  acceptance. No production data manually changed or live feature pass claimed.
- CAP-01, shared document editor/readiness, new shared-fee allocation, physical
  yard inventory and master/house B/L hierarchy remain outside this implementation.

## 2026-09-09 12:18 WAT (UTC+01:00) - Published Feature and Migration Guard

- Implementation committed/pushed as `37adcd3`; deployment
  `032aa2c8-a7d7-4d28-8552-1de731ded52b` confirmed Active / Deployment successful.
- Found schema synchronization precedes startup. Added a bundled pre-deploy
  migration so historical links are backfilled atomically before schema sync;
  startup also reasserts integrity after synchronization. Fresh DB creation skips
  the pre-backfill until tables exist. Migration failure stops the release.
- Full build passed. All six real isolated PostgreSQL check groups passed,
  including executing the bundled pre-deploy runner on the scratch fixture schema.
  Scratch namespace removed and private SSH tunnel closure verified.
- Publishing this safety follow-up next. Live CAP-04 write acceptance has not
  been performed; no production fixture writes or financial retests were made.

## 2026-09-09 12:22 WAT (UTC+01:00) - Deployment Confirmed

- Final code `fc88fb5` committed/pushed; deployment
  `5acda3fb-fd1a-41cb-bcdf-ddc68cab879a` reports SUCCESS.
- Deployment logs confirm shipment identity migration verified before schema sync.
- CAP-04 implementation and release verification complete: 137 automated tests,
  full build, six real isolated PostgreSQL groups and local browser checks passed.
- Next action is bounded live CAP-04 acceptance using existing fixtures first;
  no live feature write acceptance claimed. CAP-01 is a separate future task.
- Railway CLI warned config-as-code is deprecated with support ending 2026-12-01.
  Existing deployment succeeded; infrastructure config migration is a separate
  maintenance follow-up, not performed silently during CAP-04.

## 2026-09-09 13:15 WAT (UTC+01:00) - Live Acceptance and New Display Findings

- User asked whether CAP-01 can start; records showed CAP-04 live acceptance was
  pending. User then explicitly requested the multi-container live confirmation.
- Existing directory had no CAP-04 fixture. Created visits #32 and #33 under
  CAP04-LIVE-20260909, Lagos/client #6, with separate 100/200 clearing charges.
- Only #32 verified, assigned and due/delivery-dated; sibling fields stayed empty.
  Persisted shipment shows 1 of 2 delivered, 0 closed. No physical movement.
- Created and internally issued invoice #14 INV-202609-007, total 300 for both
  visits once. No external sending, payment, bank posting or old record changes.
- Dashboard, P&L and AR showed exactly +300; paid costs, overhead, collections and
  banks unchanged. Retained new records for inspection and future retest.
- Found CAP04-UI-001 (shipment query not refreshed on mutation) and DASH-002
  (open-job versus delivered-job counts overlap under misleading category labels).
  Both Medium, source traced and documented; no fixes silently implemented.
- Full bounded evidence: CAP04_LIVE_ACCEPTANCE_2026-09-09.md. Core live behavior
  passed; next correct display controls and retest same records before CAP-01.

## 2026-09-09 13:29 WAT (UTC+01:00) - Display Corrections Implemented

- User requested both display fixes. Central targeted invalidation refreshes
  cached shipment summaries after visit mutations, creation/import and detail edits.
  Old and new shipment views are invalidated after membership changes.
- Dashboard uses recorded delivery dates for complementary Undelivered/Delivered
  cards, retaining workflow closure as a separate concept and API count.
- 141 automated tests passed. Initial build caught a test-only cross-workspace
  rootDir import; corrected, focused 7 tests and full build passed. Local browser
  validates verification and delivery set/clear immediate refresh without reload,
  unchanged sibling, import and responsive widths. No live data changed yet.
- Next publish, confirm deployment, retest #32/#33 without a new invoice or payment.
