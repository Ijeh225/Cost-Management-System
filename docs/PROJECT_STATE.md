# Project State

## Purpose

This is the authoritative handoff record for the Cost Management System. Every
new work session must read it before planning, changing code, testing, or
deploying. Update it in the same commit as the work it records.

## Repository and Safety

- Canonical working repository: `Cost-Management-System-restored`
- Main branch: `master`
- Last known local/pushed commit: `c06d356 Guard dashboard statistics by active view`
- Preserved rollback tags:
  - `checkpoint-before-rbac-user-migration-2026-08-28`
  - `checkpoint-before-user-role-restructuring-2026-08-28`
- Never reset, delete, or overwrite these checkpoints.

## Current Objective

Stabilise and accept the new Financial Dashboard, then return to the remaining
live acceptance checks before beginning any new large product feature.

## Current Release Status

- Financial Dashboard implementation was pushed in `0f63688`.
- Its first Railway deployment failed because Operations View could reference
  dashboard statistics before they were available.
- The fix was pushed in `c06d356`.
- Local frontend typecheck and production build passed after the fix.
- Railway deployment of `c06d356` and live browser acceptance are still to be
  confirmed. Do not state that Financial Dashboard is live until confirmed.

## Next Actions, In Order

1. Confirm Railway deployed `c06d356` successfully.
2. In the live application, open `Dashboard > Financial View`.
3. For one branch and one date range, compare these four values with the P&L
   opened from the Financial View: Accrual Revenue, Actual Paid Container
   Costs, Actual Paid Overhead, and True Net Profit.
4. Repeat the same comparison for consolidated All Branches, where the user is
   authorised to use that scope.
5. Complete the deferred controlled-job live acceptance test for Documentation,
   Transire, Shipping, Terminal, and Pullout. Verify independent owner,
   expected date, actual release date, and submitted views without duplicate
   records.
6. Only after the above acceptance checks, choose the next product workstream.

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
