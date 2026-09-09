# CAP-01 Live Staff Acceptance

Date: 2026-09-09, 17:11-17:30 WAT (Africa/Lagos).
Application: https://donclimaxmanagementapp.com
Feature release: 54f0ceb; prior deployment confirmation recorded in project state.
This session tested the deployed feature; no new application release was required.

## Authorized Scope

Complete the residual fresh non-finance staff check for CAP-01, not the full
financial/workflow audit. Use existing QA users and jobs. No financial, physical
movement, external messaging or stage changes. Never store credentials/cookies.

Existing Operations QA user #14: active Staff, Operations, branch #2 (E2E Lagos),
Transire and Shipping workspaces. Reused account; rotated only its dummy password.
Owner session restored at the end. No new user or changed access profile.

## Controlled Records

Existing job #26 E2EL260901, B/L E2E-LAG-260901, client #6. Task manager initially
had zero tasks, so two explicitly reserved controls were created once by owner.

| Task | Title | Assigned user | Final state |
| --- | --- | --- | --- |
| 2 | CAP01-ACCESS-20260909 Staff queue verification | 14, Operations QA | Completed by staff at 17:26 WAT |
| 3 | CAP01-ACCESS-20260909 Other assignee control | 13, Branch Admin QA | Completed by owner at 17:29 WAT |

Both medium priority, due 2026-09-09. Notes explicitly prohibit physical,
financial and external actions. Retain both completed and their ordinary internal
assignment events. Previously completed task #1 was neither reopened nor changed.

## Browser Results

| Check | Observed result |
| --- | --- |
| Fresh staff login | Lands in Transire; identity is Operations QA, Staff. |
| Personal queue while both controls pending | All open=1, Today=1, Overdue=0; original task #2 only. Task #3 excluded. |
| Task deep link | Opens original job #26 Tasks editor, taskId=2. |
| Job overview | Operational facts and both original job task IDs visible; no Financial context, currency totals or invoice links. |
| Department links | Transire and Shipping links only. Other milestone values remain read-only context, not workspace access. |
| Direct invoice URL /invoices/8 | Authenticated staff redirected to Transire without invoice data. |
| Direct Head Office /containers/24?tab=tasks&taskId=1 | Job data withheld; page says Failed to load container details. |
| Complete assigned task #2 | Success; overview 2->1 open and editor 1 active/1 done without reload. |
| Personal queue after completion | Zero open; other user's task #3 does not appear as replacement work. |
| Owner cleanup | Owner restored, completed #3. Reload confirms zero active/two done with original task IDs. |

The existing same-job task editor is collaborative under container access and
shows task controls for both assignees. My Tasks is personal queue selection, not
an assignee-only task-edit permission. This test did not change that policy or
exercise deletion/other-user edits as staff. Do not claim those were denied.

## Authenticated API Results

Raw /api browser navigation was blocked by the browser client. Used a separate
authenticated live HTTP cookie session instead, verified userId=14/branchId=2.
Checker: scripts/cap01-live-access-check.py. Credentials are prompted, not saved.

| GET request / assertion | Observed |
| --- | --- |
| /auth/csrf and /auth/me | 200; authenticated controlled identity |
| /containers/26/overview | 200; finance=null; task IDs 2 and 3; only container_review approval context |
| /containers/26/tasks | 200; #2 assigned14, #3 assigned13; both pending before browser completion |
| /my-tasks | 200; dailyQueue IDs exactly [2]; branch2; legacy financial fields zero |
| /my-tasks with forged X-Branch-Id all, 1, 3 | 200; still only Lagos staff task [2] |
| /containers/24/overview and /containers/25/overview under each forged header | 404 in all six attempts |
| /containers/24/tasks and /containers/25/tasks | 404 |
| /banks, /invoices, /invoices/8, /payment-schedules, /users | 403 for all five |
| Final /containers/26/tasks read | Exactly equals original task response; checker changed no data |

22 GET calls plus authentication login/logout completed successfully, runner exit
0. HTTP session logged out in finally. Staff browser was signed in again after
HTTP logout, then logged out after UI completion. Owner session was restored.
No cookies/passwords written to project files. Do not rerun the checker by
reopening completed fixtures; its pending-state assertions deliberately guard
against silently repeating this one-off acceptance.

## Final Baseline and Outcome

- Containers 15, undelivered13, delivered2.
- Budgeted clearing72,004,501; cost2,000,501; gross70,004,000; net59,293,698.
- Invoiced3,301; collected2,001; outstanding1,300.
- Bank #2 47,499,997; #3 599; #4 1.
- Existing #26 remains Documentation, no delivered/gate dates, unchanged owners
  and original invoice #8 full2,000/collected2,000/outstanding0.
- No new account, job, invoice, payment, document or external message.

PASS for the requested CAP-01 Operations-staff live access check. No new confirmed
defect in this scope. Other role combinations, destructive task permissions,
client-assignment reconfiguration and a full application audit were not repeated.
Existing automated coverage remains complementary, not relabelled as live evidence.
