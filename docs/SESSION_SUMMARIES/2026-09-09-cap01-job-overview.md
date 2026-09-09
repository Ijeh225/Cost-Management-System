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

## 2026-09-09 16:17 WAT - Deployed and Live-Accepted

- Feature code 54f0ceb pushed. Railway 61ffe1a3-322d-4fcf-b963-a4b8c1e85e24
  SUCCESS for exact commit. No migration or infrastructure configuration change.
- Existing CAP-04 visits #32/#33 and invoice #14 passed read-only overview checks:
  independent fields/100-and-200 budgets; one shared full-value 300 invoice link;
  delivery does not close sibling or imply gate presence.
- Empty owner queue required one controlled task fixture, not another container.
  Created task #1 on existing Head Office QA visit #24, assigned owner user #1,
  due today. Same ID in overview/queue/editor; Today=1 and Overdue=0. Completed
  once; immediate overview/queue refresh to 0 open, original task retained as done.
- Kept completed task and normal internal assignment notification. No external
  message, financial transaction, changed stage/owner/date, or new invoice/job.
- Dashboard/banks unchanged: 15 containers / 13 undelivered / 2 delivered;
  invoice 3,301 / collection 2,001 / AR 1,300; banks 47,499,997 / 599 / 1.
- Initial CAP-01 read-model/queue scope complete. Non-finance and branch/client
  restrictions tested locally; no claim of a fresh live cross-role or financial
  audit. Await next user-selected capability; CAP-02 is still only proposed.
