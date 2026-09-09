# CAP-01: Job Overview and Daily Queue

## Scope

CAP-01 improves existing container detail and My Tasks. It uses a shared read
model rather than another workflow, owner editor or task table. CAP-04 remains
the shipment/visit identity foundation. No database migration is required.

## Using the Overview

1. Open Containers and select a visit. Job Overview appears near the top.
2. Check workflow stage separately from physical gate movements, delivery and
   closure. A Shipping/Terminal release never implies physical gate presence.
3. Read the recorded next action and current stage owner. Department cards use
   PAAR officer and independent Transire/Shipping/Terminal/Pullout owner fields.
   Missing owners are explicitly counted; no generic owner is copied into them.
4. Review recorded blockers and expand missing final-workflow prerequisites.
   These are evidence, not authorization to bypass existing workspace controls.
5. Follow an authorized department link to its existing workspace. No new release
   or approval action is added here. Bonded terminal release has no separate
   recorded owner in the current model, so the overview does not invent one.
6. Open a task by its original ID or a document by its original ID. Department
   detail pages reuse the existing task/document editors when following these links.
7. Finance-authorized users can inspect visit budgets and actual paid cost, then
   open linked invoices. Other users receive finance: null from the API, not merely
   a hidden financial card.

## Financial Definitions

- Budgeted clearing and budgeted costs are configured visit amounts. Costs include
  existing section charges plus extras. A read never creates missing charge rows.
- Actual paid cost is the all-time sum of immutable container-expense and duty
  transactions for this visit and branch, including signed reversals. This is not
  a period-matched P&L cost or a new net-profit calculation.
- Linked invoices are selected once by invoice ID, including item-linked invoices.
  Each shows FULL invoice value including VAT, recorded net collections and balance.
  A shared invoice is not allocated to each visit. Never add these full values
  across sibling overviews. Draft/cancelled/written-off records have zero summary
  effect using the existing invoice eligibility helper.
- No shared fees, overheads, credit allocations or payments are invented/copied.

## Using My Tasks

1. Open My Tasks. It contains only open tasks assigned to your user ID, restricted
   by current branch and applicable client assignments. Completed/cancelled tasks
   remain in their original job history but leave the open queue.
2. All open is ordered Overdue, Today, No due date, Upcoming, then priority/date/ID.
   Today is the Africa/Lagos calendar date, including the UTC midnight boundary.
3. Search task title/ID, container, B/L or client. Counts reflect the same search
   and blocker filter as the displayed rows.
4. Use No recorded blockers only to find follow-ups worth reviewing next. Absence
   of a recorded blocker is NOT proof of readiness or release authority. No attempt
   is made to infer task prerequisites from free-text titles.
5. Open the original task to update it. Save/completion refreshes the task list,
   job overview and daily queue. One task keeps one ID across all views.
6. Use the existing Approval Queue for approvals; duplicate approval editors were
   removed from My Tasks. Managers retain their existing operational/approval views.

Stage Owner is currently a text label, not a unique user identity. It does not
silently create a personal task assignment. Assign follow-ups using the existing
task form. Administrators choose active same-branch users from the real array
response; non-administrators can select their own eligible account without calling
the restricted user-management endpoint.

## Refresh, Access and Boundaries

- Manual refresh plus a one-minute refresh interval; cached data remain visible
  during refresh. A failed refresh labels the previous snapshot as potentially stale.
- Overview and task routes enforce authentication, branch scope and client
  assignments. Workspace links follow the current access profile. Existing mutation
  permission checks still govern all edits and actions.
- Document count is not a reviewed checklist, OCR result or expiry assessment.
  CAP-02 and later capability proposals are not included.
- No persisted derived queue or finance totals; existing task/document/payment IDs
  remain authoritative. No production finance or operational backfill.

## Verification (2026-09-09 16:02 WAT)

- 153 automated tests in 32 files passed; final 14 focused tests passed after cache
  assertions and canonical workspace links were finalized.
- Full Railway build passed. Existing sourcemap/large-chunk warnings remain.
- Local production browser: Today filter, task deep link, completion and immediate
  overview/queue refresh; department task editor; finance/workspace restrictions;
  retained snapshot after refresh failure; 390/768/1440 layout checks. Mobile and
  desktop screenshots inspected. Fixtures are intercepted locally, never live.
- Existing CAP-04 sibling navigation, independent delivery, import-pair behavior
  and responsive checks also pass. No repeated live financial writes.
- Initial test-only wrong delay property and generated-hook queryKey omission were
  corrected before final passes. A new overview heading was made semantic after
  browser accessibility lookup exposed its initial div-only title.
- Publication, deployed live checks and task write acceptance are still pending at
  this milestone. No measured human time-to-next-action improvement is claimed;
  collect a real user baseline before claiming productivity gains.

## Deployed Acceptance (2026-09-09 16:17 WAT)

This supersedes the earlier pending milestone. Code 54f0ceb is deployed successfully
as Railway 61ffe1a3-322d-4fcf-b963-a4b8c1e85e24. Existing #32/#33 show independent
state and budgets; shared invoice #14 is explicitly full-value 300, not an allocated
per-visit amount. Created one task #1 on existing Head Office QA visit #24, assigned
to owner user #1 and due today. Overview, personal Today queue and original task
editor agreed on ID #1. Today=1/Overdue=0. Completion refreshed the overview and
queue to zero open, retaining the completed task. No financial/stage writes.

Dashboard and all three bank balances remained unchanged. Retain task #1; do not
repeat creation. Local non-finance/branch/client tests supplement this live owner
session; no fresh multi-account login, external messaging or productivity benchmark
is claimed. Full evidence is in LIVE_E2E_TEST_REGISTER.md and the session summary.

## Live Staff Follow-Up (2026-09-09 17:30 WAT)

The earlier fresh-staff-login limitation is now closed for Operations QA #14,
Lagos branch #2, with only Transire and Shipping access. My Tasks included only
its task #2, not same-job #3 assigned to another user. Overview financial context
was absent and the authenticated response returned finance=null. Cross-branch
overview/tasks returned 404, finance/user APIs 403; forged branch headers did not
broaden access. Staff completion refreshed its personal queue to empty.

Both non-financial task controls #2/#3 on existing job #26 are retained completed;
owner login restored and financial baseline unchanged. No role/source/schema
changes. Shared job task editor remains collaborative under existing container
access; My Tasks personal filtering is not an assignee-only mutation policy.
This is scoped live Operations-staff acceptance, not a repeat of all roles or
destructive actions. Details: CAP01_LIVE_STAFF_ACCEPTANCE_2026-09-09.md.
