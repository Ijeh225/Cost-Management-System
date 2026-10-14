# Step12 Live Accounting Acceptance

Updated: 2026-10-14 17:20 WAT. Status: IN PROGRESS, not staff-launch approval.

## Scope and Protection

The owner authorised live native accounting activation on disposable application
test data. Both runtime gates are ON. The accepted book is explicitly named
`STEP12 TEST ONLY - 20261014 - NOT OFFICIAL COMPANY BOOKS`, covers test branches
2 and 3 and starts on 2026-10-14. No actual company accountant certification,
opening balances, legal consolidation, statutory return or staff rollout is implied.

The protected remote tag `checkpoint-before-step12-live-accounting-2026-10-14`
retains code c816352. A private full database archive was restored successfully
to a temporary isolated database: 62 tables/source totals matched. That archive
does not include external document objects or secrets. Do not overwrite the tag,
wipe the live app or restore the old archive over later test postings.

## Accepted Coverage

| Workflow | Evidence and result | Boundary |
| --- | --- | --- |
| Named accounting permissions | Actual preparer15/reviewer16/foreign17 and operations14 logins; self-post, nonfinance, foreign branch and missing grants refused | Not every future role or disabled-account lifecycle |
| Opening balances | Complete explicit zero schedule1, independently verified by16; one decision, no zero journal; actual staff UI and audit accepted | Fictional starting balances, not company bank/customer/supplier confirmation |
| Manual journals | Depreciation0.12 native1 plus independent linked reversal2; immutable history, zero net effect; staff queue accepted | Added bank head28 requires explicit full chart role review before further preparation |
| VAT/direct costs | Approved configuration1; taxable7.5, zero/exempt and recovery0/40/100 tests; original reversal retains original code; real UI register/date entry accepted | Hypothetical tax evidence, not legal VAT approval or official filing |
| Invoice and collections | Invoice17/1000, cash20/400, deposit5/300 and noncash allocation21; native sources4-7 counted once | Generic receipt/deposit native postings exercised deployed service, not staff source-review UI |
| Duty/container expenses | Duty8 and reversal9 offset; final duty10, shipping3 and terminal4; independent source journals8-12 | Each native source was reviewed and posted, not automatic legacy backfill |
| Overhead and schedules | Bill11/100, direct60, linked scheduled40, top-up20/payment20; only incremental obligation, AP0; standalone classifications and asset/loan recovery accepted | Generic recognition/payment native source approval was service-based |
| Credits and bad debts | CN3/100 plus invoice17write-off200/native19; no cash/deposit duplication, no Bad Debt payable/deletion, repeated writes refused | Recovery of a written-off debt not covered by this new live scenario |
| Bank controls | Capital10000, normalized duplicate references refused, own transfer25 bank5-to6 with distinct GL heads; asset recovery and loan principal do not enter P&L | No external banking/payment instruction sent |
| Operational job | Job36 normal verification, independent department releases, gates/exam/release/delivery/empty return/Closed; same B/L job37 remains pending | One controlled end-to-end job, not every cargo/terminal variant |
| Approval and tasks | Review4 rejection visible immediately in API, assigned correction task5, resubmit/approve/lock; task4 completed | Immediate browser rejection refresh not newly observed |
| Documents and AI | Text versions12/13 retained/indexed/download bytes match; foreign retrieval404; explicit content query44 routes to document_search, exact vendor reader returns14 only | Not a new scan/PDF/OCR accuracy benchmark or every AI query |
| Native reports | GL/TB/BS/management API controls; actual staff GL drill-down, BS equation, management/UI and 390px TB accepted | Legacy operational reports have different dates/populations/bases |
| Outputs | Actual management CSV14551bytes, snapshot scope/warnings and prior totals verified; screenshot/mobile evidence retained | CSV predates overhead top-up; live native print layout/PDF not verified |
| Period restrictions | Empty future November period2 close/reopen audit, missing review and branch-only close refused, closed-date journal refused | Deployed-engine test; no false closure/certification of October |
| Supporting modules | 29 live module/data endpoints returned200 with role negatives accepted | Availability is not complete UI/calculation acceptance of every module |

## Current Financial Proof

Expected and observed TEST ONLY figures after the supplemental sources and
offsetting tiny cancellation control:

| Control | NGN |
| --- | ---: |
| Income: original1000 less service credit100; tiny controls offset | 900.00 |
| Duty expense, including nonrecoverable VAT | 107.50 |
| Shipping expense, including nonrecoverable VAT | 107.50 |
| Terminal expense after recoverable input VAT3 | 104.50 |
| Overhead: original100 plus top-up20 | 120.00 |
| Standalone operating expense | 30.00 |
| Noncash bad-debt expense | 200.00 |
| Total expenses | 669.50 |
| Accrual net profit | 230.50 |
| Bank5 / Bank6 | 10,152.50 / 25.00 |
| Aggregate cash | 10,177.50 |
| Advance asset / input VAT asset | 50.00 / 3.00 |
| AR / AP / unapplied deposits | 0.00 / 0.00 / 0.00 |
| Assets = capital10000 + profit230.50 | 10,230.50 |
| Balance-sheet and profit-to-cash bridge differences | 0.00 |
| Period debits = credits after native33/34 | 13,322.82 |

An independent deployed-source review matched all28 account controls before the
additional offsetting penny control, with no new missing/draft/stale sources.
The later recognition33/CN34 leaves all closing controls unchanged. Historical
31pre-cutover and3unclassified fixtures remain disclosed. Read-only report
views do not persist that independent control checklist. Their completeness
warning must not be removed just because a trial balance balances.

## Worked Training Scenario

1. Select the correct branch and client before creating jobs. Record each
   container separately; jobs36/37 share B/L18 but keep independent owners,
   documents, milestones, dates and completion state.
2. Verify the controlled container through its assigned officer. Complete
   Documentation/PAAR and each department's expected and actual release actions.
   Final workflow navigation must not bypass prerequisites.
3. Prepare the correct invoice items. A shared B/L does not justify repeating
   the full invoice amount against each container. Draft/zero invoices cannot
   receive money; issued status and due date determine active collection rules.
4. Record actual receipts with the correct bank. A deposit receives cash once;
   allocating it clears deposit liability/AR without receiving the cash again.
5. Review expenses from actual supplier/payment evidence. Duty, shipping and
   terminal belong in separate direct heads. Apply explicit VAT recovery rules;
   do not infer taxable/exempt status or recovery from an amount or filename.
6. Recognise a bill once, then settle its payable. A linked payment schedule
   must not create a second standalone expense/payment. Classify an advance,
   fixed asset, loan principal or recovery from its supporting voucher.
7. Submit recognition/adjustments for a different named authorised reviewer.
   A manual journal cannot be used to bypass protected bank, AR/AP or tax heads.
   Generic source workflows still need the staff interface listed below.
8. Use supported credit notes, receipt reversals and write-offs for corrections,
   with original source links and audit retained. Do not cancel a recognized
   invoice as a substitute for reversing its accounting effect.
9. Reconcile the source records, bank balances, account controls and applicable
   report dates. Check warnings and outstanding review items, not only equality
   of total debits and credits. Valuation estimates are not the posted balance sheet.
10. Complete gates, examination/release, delivery and empty return before closing
    a job. Closing job36 does not close its B/L sibling37.

## Defects Found and Corrections

| ID | Priority | Finding and current evidence |
| --- | --- | --- |
| STEP12-ROUTE-001 | High | AI namespace middleware intercepted sibling native routes; scoped correction deployed/live CLOSED |
| STEP12-DEPOSIT-001 | High | Real Bank Transfer label refused by native mapper; narrow alias fix deployed/live CLOSED |
| STEP12-OH-001 | High | Same-day entered-later bill incorrectly rejected dated settlement; dependency-based fix deployed/live CLOSED |
| STEP12-OPS-001 | High | Basic PUT could bypass final workflow prerequisites; shared guard deployed/live CLOSED |
| STEP12-INV-001 | High | Cancellation could strand native recognition; isolated/race tests and exact5dc9974 deployment; real unpaid20/native33 refusal PASS |
| STEP12-INV-002 | Medium | Cancelled21 still displays0.01 outstanding; formatter correction locally tested, release/live same-ID retest pending |
| STEP12-SOURCE-UI-001 | High implementation gap | Generic receipts/deposits/overheads/schedules/bank native adapters lack ordinary staff review/post routes/workspace; service acceptance is not staff workflow acceptance |

## Exact Continuation and Launch Gates

- Publish the narrowly tested cancelled-display correction, verify exact Railway
  success, then run `resume-cancel`. Reuse18/20/21/native33/34/CN5, finish review
  of protected newbank28 and confirm unchanged230.50profit/10177.50cash.
- Do not rerun prior accounting/transactions/support/cancellation creation modes.
  They intentionally refuse existing fixtures or assert older snapshot figures.
- Complete the ordinary staff source-review workflow using the existing engine,
  named permissions, explicit mappings and independent approval. Neither raw SQL
  posting nor an automatic poster is an acceptable substitute.
- Complete remaining bounded browser/output checks, including live print layout
  when supported, and record what has not been covered. Do not send external
  emails/WhatsApp without a verified suitable test recipient.
- Actual chart/entity scope, approved tax rules, real opening schedules, source
  coverage, staff training and launch acceptance remain company decisions. The
  owner's request to enable a TEST ONLY live rehearsal is not those certifications.

This document supplements `PROJECT_STATE.md`, `LIVE_E2E_TEST_REGISTER.md` and
the dated session summary. The latest confirmed timestamped records take
precedence over older interim milestones.
