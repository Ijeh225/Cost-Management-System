# CAP-01 Job Overview and Daily Queue

## 2026-09-09 17:30 WAT - Live Staff Limitation Closed

- Acceptance evidence/checker committed and pushed as 939e8ed. Publication
  complete; next action is awaiting user-selected capability, not repeating tests.
- Fresh browser login as existing Operations QA #14; active Staff/Operations,
  branch #2 and only Transire/Shipping. Rotated dummy password only, not roles.
- New reserved tasks #2/#3 on existing #26, assigned #14/#13 respectively.
  Staff queue showed #2 alone; overview/task editor showed both shared job tasks.
  Finance hidden visually and finance=null in overview API; legacy queue amounts
  zero. Only permitted department links appeared. No new financial records.
- Raw API browser navigation hit ERR_BLOCKED_BY_CLIENT. Separate authenticated
  HTTP checker passed 22 GET responses/assertions, including forged branch
  selections, cross-branch 404s, finance/user-management 403s and unchanged tasks.
  HTTP session logged out; browser needed a fresh staff login afterwards.
- Direct invoice browser URL redirected to Transire; out-of-branch job withheld.
  Staff completed #2 and queue became empty while #3 remained pending. Owner
  restored, completed #3; reload confirmed both done and no open job tasks.
- Keep #2/#3 and ordinary assignment events. #1 and historical test records
  untouched. Same dashboard/bank baseline. No source/schema/deployment change.
- No new confirmed defect. Scope is this non-finance profile and CAP-01 checks,
  not a universal role/deletion audit. Existing same-job task editor is collaborative;
  personal queue filtering is not an assignee-only edit policy.
- Evidence: CAP01_LIVE_STAFF_ACCEPTANCE_2026-09-09.md. Checker is read-only
  apart from authentication and deliberately requires original pending fixtures;
  do not reopen/recreate now-completed fixtures just to rerun it.
- Next: publish test records, then await user-selected capability. CAP-02 proposed.

## 2026-09-09 17:11 WAT - Remaining Live Staff Check Authorized

- User asked whether the live staff-login limitation needs testing, then explicitly
  authorized it. Existing owner acceptance is not being repeated or overstated.
- Clean master at 6b12ff8. Reuse active E2E Operations QA #14, Lagos branch #2,
  Operations staff with only Transire/Shipping. Rotate dummy password if needed;
  credentials/session cookies must never enter project files.
- Check assigned queue, non-finance overview, branch/API denials and task actions.
  Reserve two non-financial tasks on existing #26 only if suitable records absent,
  assigned #14 and #13 to prove positive and negative queue selection. Retain done.
  No new user/job/invoice/payment, no repeated completed task #1 or movement test.

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
