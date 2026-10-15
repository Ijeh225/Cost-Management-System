# Step12 Live Accounting Acceptance

Updated: 2026-10-15 13:22 WAT. Status: all seven confirmed defects/gap CLOSED; current output/posted-selection checks extended. Native print/PDF blocked pending actual saved output; broader coverage/launch gates remain, not staff-launch approval.

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
| Manual journals | Depreciation0.12 native1 plus independent linked reversal2; immutable history, zero net effect; staff queue accepted; added protected bank head28 explicitly re-reviewed | Actual company chart approval is not simulated QA review |
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
| Outputs | Actual current management CSV15438bytes on2026-10-15 includes native35/36 once/net0; scope/warnings/profit230.50/cash10177.50 verified. Prior15300/14551byte snapshots and screenshot/mobile evidence retained | Live native print layout/PDF not verified; native preview inaccessible to browser tools; owner acknowledged Save as PDF request, output awaited |
| Period restrictions | Empty future November period2 close/reopen audit, missing review and branch-only close refused, closed-date journal refused | Deployed-engine test; no false closure/certification of October |
| Selected staff source review | Real preparer15/reviewer16 selected two new dummy own transfers3/4; preview/draft/submit/return1/correct3/post2and3(native35/36), retained correction history and same-record public retries, actual role403, mobile390px and exact lookup accepted | New live write UI case is own-bank transfer; other source adapters retain prior service/isolation acceptance, not an assertion of fresh UI writes for all eleven families |
| Supporting modules | 29 live module/data endpoints returned200 with role negatives accepted | Availability is not complete UI/calculation acceptance of every module |
| Posted generic selections | Eleven real UI selections across ten families on2026-10-15 resolve original journals/read-only; includes cash receipt20 and noncash allocation21. Old credit allocation17 inspected only | Selection/no-duplicate UI acceptance, not fresh submission/posting for all families; no historical mappings guessed |
| Normal-suite network skips | Three document concurrency checks are intentionally skipped without CAP02_NETWORK_TEST; separately passed on Railway in the2026-10-05six-case run, current condition/evidence reviewed | Not outstanding Step12 accounting tests; no fresh concurrency run claimed today |

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
| Current period debits = credits after native35/36, live UI2026-10-15 | 13,322.84 |

An independent deployed-source review matched all28 account controls before the
additional offsetting penny control, with no new missing/draft/stale sources.
The later recognition33/CN34 leaves all closing controls unchanged, independently
confirmed by final source revalidation with all28 controls and32posted sources.
After the selected source-review acceptance, two opposite own-bank postings35/36
bring source coverage to34posted; all28 closing controls, profit/cash and bank5/6
still match exactly. There are no pending draft/submitted reviews from this test.
The2026-10-15read-only UI/CSV check confirms unchanged profit/cash and current
period debits/credits13322.84; the prior13322.82 snapshot precedes35/36. Today
did not rerun independent full-source reconciliation or mutate postings.
Historical
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
   Generic sources now use the selected staff-review section in the existing
   VAT/review page. Its controlled transfer UI test is accepted below.
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
| STEP12-INV-001 | High | CLOSED: isolated/race tests, exact5dc9974/85a0e30d SUCCESS; truly unpaid20/native33 and retained18refusal PASS |
| STEP12-INV-002 | Medium | CLOSED:483unit/API/build, exact57aa5c7/9cfa3c3a SUCCESS; same21detail/listzero outstanding/AR exclusion/original total retained PASS |
| STEP12-SOURCE-UI-001 | High implementation gap | CLOSED at6dc7df1/Railway824c31ee SUCCESS:490units/7HTTP/3realDB/build and real15/16 selected transfer submission/return/correction/independentpost/retry/role/mobile/exactlookup accepted |

## Exact Continuation and Launch Gates

- Both invoice corrections are already deployed/live accepted. Final same-ID
  resume created/posted nothing, completed protected bank28role review and
  confirmed unchanged230.50profit/10177.50cash. Publish the final evidence records;
  do not rerun the accepted resume or cancellation creation phases.
- Do not rerun prior accounting/transactions/support/cancellation creation modes.
  They intentionally refuse existing fixtures or assert older snapshot figures.
- Selected ordinary staff source review is now deployed/live accepted in the
  existing VAT/review page using current builders and independent named approval.
  No raw SQL financial posting or automatic poster substitutes for the UI test.
- Do not recreate transfers3/4, reviews1/2/3 or native35/36. Review1 stays returned,
  corrected3 links1, and each source has exactly one posted journal. Owner session
  is restored and temporary390px viewport reset. Three historical unknown sources
  still need actual evidence before any company launch/backfill, not guessed heads.
- Complete remaining bounded browser/output checks, including live print layout
  when supported, and record what has not been covered. Do not send external
  emails/WhatsApp without a verified suitable test recipient.
- Actual chart/entity scope, approved tax rules, real opening schedules, source
  coverage, staff training and launch acceptance remain company decisions. The
  owner's request to enable a TEST ONLY live rehearsal is not those certifications.

This document supplements `PROJECT_STATE.md`, `LIVE_E2E_TEST_REGISTER.md` and
the dated session summary. The latest confirmed timestamped records take
precedence over older interim milestones.

## Selected Transaction Review Procedure

1. Open VAT / Direct Expenses, select the approved accounting book and one
   authorised branch. Recent transactions stay scoped to that branch; use exact
   family/record ID lookup for older sources. A record created in another branch
   cannot be selected by overriding the branch header.
2. Select the existing source, not its parent container or schedule ID. For
   example a standalone schedule uses its actual payment-row ID; a linked
   overhead schedule uses the bill's expense-payment row, not a second payment.
3. Choose the actual ledger heads and documented voucher/classification. The
   system reads the amounts from the source; no arbitrary transaction amount is
   entered. Overhead header totals can include top-ups: the balanced preview
   separately recognises the original bill or selected incremental top-up.
4. Preview the exact balanced entry and source evidence. Save an unposted review
   draft, inspect it and submit with evidence. No native journal is created merely
   by preview, draft or submission; original operational money remains untouched.
5. A different named user with posting permission inspects the retained source
   snapshot. Return for correction, or Approve and Post. Changed sources, revoked
   grants, closed periods and self-approval are refused. A returned correction
   creates a new retained version rather than overwriting the old evidence.
6. Verify the resulting journal and applicable source/report balances. Posted
   sources are read-only in this screen; repeated source preparations cannot post
   money twice. Use existing linked reversal/credit procedures for corrections.

| Source family | Explicit treatment and required dependency |
| --- | --- |
| Client deposit | Actual bank/cash asset against client-deposit liability |
| Invoice cash/deposit settlement | Original AR and actual bank/cash or previously posted deposit liability; allocation is noncash |
| Credit note | Reviewed original net-income/client-funds split plus any original recorded VAT; original invoice recognition required |
| Client-credit application | Client-credit liability clears original AR without a cash receipt |
| Invoice write-off | Stored write-off audit/amount against bad debt and original AR, never a duplicate overhead |
| Overhead/top-up | Dated original/incremental obligation against payable; recognised source dependencies retained |
| Expense payment | Settles previously recognised payable; does not create another expense |
| Standalone schedule payment | Must match the stored reviewed expense/asset/advance/loan/other classification |
| Bank funding | Explicit equity, loan, asset recovery, income or liability purpose; never inferred from narration |
| Own-bank transfer | Separate actual source/destination bank heads; no aggregate cash or P&L change |

Invoices and Duty/Shipping/Terminal VAT recognition retain the existing configured
tax review controls above this new section. Native trial balance equality does
not certify historical source completeness or actual company launch readiness.
