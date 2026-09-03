# Controlled Verification Runbook

This runbook completes Step 11 without creating irreversible production data.
Use one isolated non-production branch, dedicated test users, and records whose
creation and reversal are authorised before starting.

## Preconditions

- Record the branch, user, record ID, starting balance, and expected reversal.
- Do not use an existing live invoice, duty payment, bank movement, or document
  as a test record.
- Capture the API response and a reload result for every write.

## Required checks

1. **Overdue invoice:** create a non-production draft, enter a past valid due
   date through the browser date field, send it, and confirm the same overdue
   status in Invoices, AR, Dashboard, and reports.
2. **Duty reversal:** create a new approved reversible duty record, post it,
   reverse it through the authorised reversal flow, and reconcile the immutable
   original and reversal rows across Duty Payments, Bank, Ledger, Cash Flow,
   and P&L.
3. **Duplicate bank reference:** submit one controlled bank posting with a
   unique reference, then attempt the exact same reference. The second request
   must fail with no second balance movement.
4. **Document retrieval:** upload a unique test document through an
   upload-capable browser surface, open its stored link, and confirm an exact
   filename search returns the same linked document in Documentation and AI.
5. **Cross-role isolation:** use separate non-production Documentation,
   Accounts, Transire, Shipping, Terminal, Pull-Out, and Admin sessions to
   verify both allowed access and denied access. Never reuse the owner session
   as proof of a restricted role.

## Pass Criteria

Each check passes only after the persisted value survives a full reload and
the affected modules reconcile to the same record. Record any deviation in
`docs/LIVE_E2E_TEST_REGISTER.md` before making another change.
