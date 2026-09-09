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
