# Historical Schedule Data Reconciliation - 2026-09-08

## User Decision

User explicitly said to proceed with fixing the retained historical NGN500
schedule discrepancy. This authorizes a traceable data correction for this test
record; earlier deferrals do not prohibit this new request. Do not generalize to
other historical payments or reset/re-pay an already-paid schedule.

## Evidence and Method

- Browser and read-only DB inspection: schedule 7, branch 2, exact vendor
  E2E-20260901 Scheduled Test Vendor, requested/approved/paid NGN500, Paid, no
  overhead link, empty payment_schedule_payments list. Original Paid event 22,
  actor1, NGN500. Original test register identifies Lagos Test Bank, current bank3.
- Bank3 before: 13 entries, credits 2,003, debits 904, closing 1,099, no NGN500 debit.
- Retained original snapshot in docs/evidence/2026-09-08-schedule-7-before.json.
- Guarded one-off script: scripts/reconcile-legacy-schedule-7.mjs. Rehearsed in
  existing isolated test DB, rolled back all fixtures. Tested wrong-amount refusal,
  single payment, idempotent retry, unchanged schedule, one trace comment.
- Connected via SSH only. Isolated port54339/test DB; live port54340/Postgres railway
  DB explicitly matched to application's configured postgres.railway.internal.
  No public endpoint or persistent credential/config file was created.
- Applied one transaction: payment_schedule_payments id2, amount500, bank3,
  schedule7; payment_schedule_events comment id28. Schedule row and original
  events 20-22 exactly preserved. No normal payment request or duplicated paid sum.

## Reconstruction Limits

Original bank reference was not retained. New reference
LEGACY-RECON-SCHED-7-20260908 is explicitly a reconciliation ID, not invented
original bank evidence. The payment date copies event22.created_at in SQL,
2026-09-01 16:49:12.876633, without a JS timezone roundtrip. This represents the
recorded Paid action, not independently confirmed bank settlement time. Correction
created_at remains current. These limits appear in payment notes and UI timeline.

## Verification

- Direct read-only --verify PASS: one payment; exact original schedule/events;
  one correction comment; full-precision payment date matches event22 date.
- After evidence saved to docs/evidence/2026-09-08-schedule-7-after.json.
- Browser schedule Paid500/balance0, correction note visible, prior history kept.
- Browser Bank3: 14 entries, credits2,003, debits1,404, closing599.
- Browser Reports Financial Ledger: correct vendor/bank, one NGN500 outflow and
  reconciliation reference. Bank-specific Cash Flow Sept1-8: opening0/in2,003/
  out1,404/closing599; Payment Schedule category501 = reconstructed500 + earlier1.
- Isolated fixture counts0 (branches/users/banks/schedules/events/payment facts).
- Both tunnels/SSH children stopped; no listeners on ports54339/54340.
- No external payment/message, production schema/runtime change, PDF rewrite,
  or unrelated test record cleanup. Data correction is already live, not waiting
  on an app deployment. Not a claim of a newly audited P&L classification.

## Outcome and Next Action

Historical schedule7 discrepancy reconciled and verified. Preserve before/after
evidence and script; do not pay it again. Current manual fixes/six isolated tests
remain closed. Await next user-selected work. Three continuity records updated.
Script/evidence/records committed and pushed as `aa43d7c`; script syntax and git
whitespace checks passed. Record-only follow-up captures verified push result.
