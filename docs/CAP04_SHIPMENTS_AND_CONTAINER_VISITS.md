# CAP-04: Shipments and Container Visits

## Scope

One Bill of Lading can cover multiple containers. CAP-04 adds the grouping
foundation; it does not implement CAP-01's work queue or replace financial ledgers.

```text
Branch
  Shipment / B/L (one client)
    Container visit #31 -> existing stages, owners, dates, costs, documents
    Container visit #32 -> its own independent records
    Container visit #33 -> its own independent records

Physical equipment -> can have a different visit ID on a later B/L
```

## Invariants

- `shipments` is unique by branch plus trimmed, case-insensitive B/L identity.
- `container_equipment` identifies physical equipment by trimmed, case-insensitive
  number. Existing identifiers remain displayed as recorded.
- `containers.id` remains the permanent visit ID. Every existing foreign key,
  invoice item, payment, document, task, stage owner and audit link stays in place.
- A shipment cannot contain the same equipment twice. Another B/L creates another
  visit, not an overwrite. No repeat-visit charge/status/document is copied.
- Containers on one shipment must have the same linked client; unlinked imports
  must have a consistent customer name. Different branches remain separate.
- The compatibility trigger is the single atomic identity writer for existing
  create/import/update routes and SQL writers. API callers cannot forge parent IDs.
- Dates and workflow status are per visit. One delivered box does not deliver the
  shipment's other boxes. Delivered count uses recorded delivery dates; closed
  count uses the existing `closed` state.
- There is no automatic conversion between a forecast, charge, invoice or payment.
  Grouping does not duplicate job-level fees. Existing invoice general lines remain
  single lines; per-container charges stay on the appropriate visit. CAP-04 does
  not introduce a shared-fee allocation engine or shared document editor.

## User Procedure

1. Select the correct branch and create the first container with its B/L/client.
2. Create the next container using the same B/L and client. It joins that shipment
   automatically. Use its own container number, owner, dates and charges.
3. For spreadsheets, use one row per container. Repeat the B/L for all boxes on
   that shipment. Only a repeated container/B/L pair is a duplicate, not the B/L
   alone. Client conflicts are rejected by the database with an explanatory error.
4. Open any container and use **Containers on this B/L** to see the group,
   partial delivery count and links to the individual visits.
5. To change the client, the existing Link Shipment to Client dialog explicitly
   applies to the whole B/L. Unlink requires confirmation. Changes are transactional
   and generate one audit entry per affected visit. Existing invoices/payments keep
   their historical client references; this is not a financial reassignment tool.
6. Create invoices using existing container selection. Multiple items on one B/L
   show that B/L in the header. Mixed B/Ls retain their per-item references.
7. When equipment returns on another shipment, create another visit with its new
   B/L. Use the visit ID/B/L to distinguish history. AI exact number lookups refuse
   to choose arbitrarily when more than one visit matches.

## Migration and Release

- Startup migration `shipment_container_visits_v1` runs in one transaction on one
  connection with an advisory lock and container table lock. Parent/equipment
  backfill happens before legacy unique constraints are removed.
- Railway runs the same idempotent backfill before Drizzle schema synchronization
  via `railway:db:prepare`; startup verifies it again before accepting requests.
  Fresh databases are initialized by schema synchronization, then backfilled at
  startup. There is no force/truncate option in this release path.
- A conflicting historic normalized B/L/client or duplicate visit aborts and rolls
  back the migration. Investigate those records; never delete or merge history just
  to unblock deployment.
- No IDs are renumbered and no existing source rows are removed. Empty historic
  shipment/equipment parents are retained; no automatic garbage collection.
- Do not run `db push --force` on production as a substitute for this migration.
- After real multi-container data exists, reverting to code that assumes globally
  unique B/L/container numbers is not a safe rollback. Preserve backups/checkpoints
  and use a reviewed forward correction or a complete coordinated restore.
- Physical-yard inventory, master/house B/L hierarchy, shared document readiness,
  new tariff/fee allocation and CAP-01 queue features remain separately scoped.

## Verification

- Embedded PostgreSQL: migration rerun/backfill preservation, normalization,
  duplicate visits, client/branch boundaries, independent owners/delivery/costs,
  repeated equipment, forged IDs, correction and rollback on historic conflict.
- Real isolated Railway PostgreSQL: migration/history preservation and concurrency
  for three siblings, duplicate-visit retries and conflicting clients. Only a
  random fixture namespace is used; cleanup and private tunnel closure verified.
- PGlite/Drizzle: group client assignment/unlink, explicit confirmation, audit and
  rollback with financial history retained.
- HTTP tests: authentication, selected branch, forged staff branch, client scope,
  counts and no financial fields in the operational group endpoint.
- Browser fixtures: sibling navigation and partial-delivery count at 390/768/1440;
  upload accepts new siblings while skipping an existing visit. No external calls.
- Production migration/deployment/live acceptance must be separately recorded in
  PROJECT_STATE and LIVE_E2E_TEST_REGISTER. Local/isolated passes are not live passes.
