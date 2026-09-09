# CAP-01 Job Overview and Daily Queue

## 2026-09-09 15:29 WAT - Implementation Authorized

- User explicitly requested implementation after CAP-04 and both display fixes
  were deployed/live-verified. Clean starting master at a53f450.
- CAP-01 improves existing container detail and My Tasks; no second owner editor,
  task table, finance ledger, migration, or copied shared invoice charges.
- Shared read model separates workflow stage, department milestones and physical
  movement. Overview links existing tasks/documents/invoices; personal queue uses
  assignedStaffId, not ambiguous legacy owner names. WAT date buckets.
- Staff branch/client restrictions remain; overview finance is omitted without
  finance.access. Full linked invoice values are explicitly not per-visit allocations.
- Verification, publication and live acceptance pending at this milestone.

## 2026-09-09 15:54 WAT - Local Implementation and Verification

- Added overview API, generated contract, existing-detail panel and personalized
  dated queue. Preserved task IDs and reused task/document editors in department
  detail layouts. Existing tasks now show ordinary follow-ups, not just corrections.
- Fixed task form users response shape and obsolete mutation query key, WAT date
  consistency and accessible task buttons. Tightened task branch/client reads.
- Build passed after correcting a generated-hook queryKey requirement. First
  suite had 152 pass/1 test-fixture failure: fixture used shippingDelayReason,
  but schema field is doDelayReason. Corrected fixture; final suite in progress.
- No production changes or live fixtures so far. Browser verification and final
  publication/deployment evidence remain next. Not a full new live financial audit.

## 2026-09-09 16:02 WAT - Publication Ready

- 153 tests in 32 files passed; final 14 focused tests passed. Full Railway build
  passed. CAP-01 local browser passed Today filtering, original task links,
  completion refresh, department editor, financial/workspace visibility and stale
  refresh warning. CAP-04 local smoke also passed. Mobile/desktop images inspected.
- Moved the overview near the top, added semantic heading, canonical department
  links and reused task/document editors in department-only views. No duplicated
  financial values, task identities, owner writes, release controls or migrations.
- Complete behavior/limits documented in CAP01_JOB_OVERVIEW_AND_DAILY_QUEUE.md.
  No human productivity improvement or live acceptance claimed. Next publish,
  confirm deployment and perform bounded acceptance without new financial records.
