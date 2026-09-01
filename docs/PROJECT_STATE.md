# Project State

## Purpose

This is the authoritative handoff record for the Cost Management System. Every
new work session must read it before planning, changing code, testing, or
deploying. Update it in the same commit as the work it records.

## Standing Project Command

Record every change to this application automatically. This includes new
features, fixes, discovered issues, tests, build results, deployment outcomes,
business decisions, blockers, commits, and the next action. Do this without
asking the user for a reminder. Keep the current status concise and append
important completed milestones so previous work remains traceable.

## Repository and Safety

- Canonical working repository: `Cost-Management-System-restored`
- Main branch: `master`
- Last confirmed project-state commit: `ac8c9b4 Add project continuity state`
- Preserved rollback tags:
  - `checkpoint-before-rbac-user-migration-2026-08-28`
  - `checkpoint-before-user-role-restructuring-2026-08-28`
- Never reset, delete, or overwrite these checkpoints.

## Current Objective

Carry out and document a controlled, comprehensive live end-to-end acceptance
test before beginning any new large product feature.

## Current Session Record

- On 2026-09-01, the user made automatic project-state recording a standing
  command. `AGENTS.md` now requires every future session to record all
  features, fixes, discovered issues, verification results, deployment
  outcomes, decisions, blockers, and next actions without waiting for a
  reminder.
- On 2026-09-01, the user authorised a comprehensive pre-delivery live test.
  The execution source of truth is now `docs/LIVE_E2E_TEST_REGISTER.md`.
  It began with a read-only inventory: the signed-in dashboard rendered and
  showed six existing containers, one invoice, and existing financial data.
  These figures are not yet reconciled or accepted as correct.
- `FIN-01` reconciled the main all-time financial amounts between Financial
  Dashboard and P&L, but identified High-priority defect `RPT-001`: P&L uses
  an all-cost-container count in its recognised-COS label and per-container
  average even though recognised cost totals include invoiced containers only.
- Report Centre inspection identified High-priority defect `RPT-002`: its
  headline cards and exports use budgeted container clearing charges/costs but
  label them as generic revenue, expenses, and net profit beside actual-based
  P&L reporting.
- Invoice testing confirmed the zero-value issuance safeguard holds at the
  backend. It also identified Medium-priority defect `INV-001`: the front end
  permits the failed action and gives only a generic error rather than the
  actual validation reason.
- A controlled existing invoice collection reconciled across invoice,
  receivables, and bank ledger: `INV-202608-002`, its ₦1 payment reference,
  zero outstanding balance, and matching bank credit all agree.
- Existing controlled duty, container-disbursement, and overhead-payment
  records also reconcile to their bank and report ledgers. The live test
  initially had two setup blockers: only one branch and no separate
  authenticated sessions for the existing test profiles. The branch blocker is
  resolved; separate authenticated sessions are still required for permission
  acceptance.
- Two controlled branches are now created: `E2E-20260901-Lagos` (ID 2) and
  `E2E-20260901-Abuja` (ID 3). Client setup identified High-priority defect
  `BRN-001`: branch selection in the client form conflicts with the required
  global branch scope and the UI hides the server's actionable error.
- The controlled clients are `E2E-20260901 Lagos Client` (ID 6) and
  `E2E-20260901 Abuja Client` (ID 7). Their pending-verification containers
  are `E2EL260901` (ID 26, Lagos) and `E2EA260901` (ID 25, Abuja). The
  container form initially displayed Head Office as Branch under the Lagos
  global scope, expanding `BRN-001` to include an unsafe/misleading default.

## Current Release Status

- Financial Dashboard implementation was pushed in `0f63688`.
- Its first Railway deployment failed because Operations View could reference
  dashboard statistics before they were available.
- The fix was pushed in `c06d356`.
- Local frontend typecheck and production build passed after the fix.
- Railway deployment of `c06d356` and live browser acceptance are still to be
  confirmed. Do not state that Financial Dashboard is live until confirmed.

## Next Actions, In Order

1. Complete `ENV-02` and catalogue the current test data without changing it.
2. Complete branch/date-range coverage for `FIN-01`; retain `RPT-001` for the
   final defect report and do not fix it before approval of the audit.
3. Use the two identified pending-verification containers to execute the
   Documentation, Transire, Shipping, Terminal, Pullout, and stage-isolation
   cases without approving, paying, or deleting data.
4. With explicit action-time confirmation, create the remaining labelled
   schedule and lifecycle test records required for `TD-03` through `TD-05`.
5. Obtain separate authenticated sessions or test credentials for at least one
   restricted profile and one branch-scoped profile before `SEC-01` can pass.
6. Execute the operational, documentation, financial, reporting, security,
   and UI cases in `docs/LIVE_E2E_TEST_REGISTER.md` in dependency order.
7. Update the defect log and project state after every verified result.
8. Produce a final audit report before any corrective implementation begins.

## Workstream Status

### Financial Reporting and Dashboard

- Reports use declared financial bases rather than silently mixing figures.
- P&L supports accrual revenue and budgeted or actual-paid container costs.
- Operational Dashboard remains a budgeted operational estimate.
- Financial Dashboard is a separate view that reuses the existing P&L request
  with `actual_paid` cost basis. It must match P&L for the same branch and
  period; do not duplicate its formulas in Dashboard.
- Related commits: `134458c`, `0f63688`, `c06d356`.

### Invoice Lifecycle

- Draft invoices are editable; issued invoices preserve their audit trail.
- Zero-value invoices cannot be issued.
- Payment, due date, cancellation, and write-off rules are protected by the
  backend, not only by the screen.
- Draft and cancelled invoices are excluded from active receivables and the
  relevant financial reports.
- Related commit: `956d965`.

### Department Workspaces

- Architecture stores separate owner fields for Documentation, Transire,
  Shipping, Terminal, and Pullout.
- Automated tests confirm owner-field separation and no cross-stage carryover.
- The live controlled-job acceptance test remains outstanding; see Next
  Actions.

### AI Assistant

- Existing foundation includes governance, approved read tools, business
  glossary, conversation context, evidence links, report/document drafts,
  controlled action drafts, and evaluation controls.
- Do not start a new AI redesign from scratch. When resumed, review
  `docs/Smart_AI_Assistant_Plan.txt`, `artifacts/api-server/src/lib/ai-business-definitions.ts`,
  and `artifacts/api-server/src/routes/ai-assistant.ts` first.
- AI work is paused until the Financial Dashboard and deferred live acceptance
  checks above are complete.

### Roles and Permissions

- Legacy role authorization was retired after a staged migration to access
  profiles and workspaces.
- Preserve the rollback checkpoints listed above and retain auditability for
  user-access changes.

## Verification Rules

- Local build success is not live deployment success.
- Live deployment success is not end-to-end business acceptance.
- Financial figures must be checked against the same P&L branch scope and date
  range before being described as reconciled.
- Production testing must use read-only checks unless a reversible controlled
  test record is explicitly required and recorded.

## Update Format

When updating this file, change only what is needed and always record:

1. Commit hash and whether it was pushed.
2. Tests/builds actually run and their result.
3. Deployment or live-test evidence actually observed.
4. The next exact action, in priority order.
