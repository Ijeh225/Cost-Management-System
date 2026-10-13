# Accounting Policy Requirements

Acceptance update2026-10-13 19:38 WAT: structured VAT/direct expense setup,
source review and posted reconciliation accepted in11distinct owned DB cases,
419unit/API and built UI tests. Publishing inactive next; actual company tax
approval and figures remain distinct from engineering acceptance.

Current update2026-10-13 19:22 WAT: structured VAT and separate direct-expense
configuration/source review/register engineering built. Final419unit/API/UI checks
passed; final10owned DB cases and publication pending. This supersedes the earlier
"VAT not started" snapshots below; actual accountant approvals/launch remain open.
Operating procedure: ACCOUNTING_VAT_DIRECT_EXPENSE_SETUP.md. No live data rewritten.

Release update2026-10-13 18:16 WAT: opening setup complete and functional9d2d070
verified deployed INACTIVE. Current records untouched; no real opening inputs,
professional exemption approval or launch reset inferred. See current PROJECT_STATE.

Implementation update2026-10-13 18:05 WAT: authorised opening UI/API/verification
and mandatory native readiness are now built/accepted, inactive publication next.
The source-status table below preserves the earlier16:03 review, not current
absence of those opening controls. See ACCOUNTING_OPENING_SETUP.md and PROJECT_STATE.
Owner clarifies staff launch has not occurred; all current figures are test data.
Actual go-live is still a future explicit date and any test-data clearance is a
separate backed-up launch operation, not performed here. VAT/direct-cost setup
and Step10 remain separate; no professional exemption or real balances inferred.

Recorded: 2026-10-13 16:03 WAT (Africa/Lagos).
Authority: owner's four requirements in this session; not a recorded professional
tax opinion, completed chart approval, opening review or activation instruction.

## Owner-Confirmed Business Requirements

1. Duty payments, shipping charges and terminal charges are direct job expenses.
   Maintain separate approved expense heads under direct costs, linked to the
   correct book, branch and job. Do not infer an asset/client-funds treatment for
   these heads from an earlier draft policy. Existing source mappings still need
   an explicit approved policy version; do not rewrite posted history silently.
2. Owner states the company's services are VAT-exempt. Capture exempt service
   treatment only with the applicable accountant-confirmed legal basis. Support
   7.5% VAT on applicable taxable purchases/costs, not a blanket surcharge on
   every duty/shipping/terminal payment. Taxable, zero-rated and exempt must be
   distinct recorded classifications even when the last two have no tax amount.
3. Official accounting commences on the application's official implementation/
   go-live date. The actual YYYY-MM-DD date has NOT been supplied. Do not assume
   today's date, a deployment timestamp, first test record or native activation
   date is that date. Existing test data must not be replayed as official history.
4. Head of Accounts supplies opening balances for every GL account, including
   bank balances. Authorised accounting staff must be able to enter, verify and
   independently approve them BEFORE live accounting transactions begin. Retain
   evidence, preparer/reviewer, exact date and version; no balancing plug or
   duplicate historic transactions. Explicitly account for reviewed zero balances.

## VAT Interpretation and Evidence Boundary

The Nigerian National Assembly's published Nigeria Tax Act 2025 specifies 7.5%
for taxable supplies (section147), separate exempt/zero-rated categories
(sections185-186), and input-credit eligibility tied to taxable supplies, with
mixed-use apportionment (section155(4)). This does not establish that this
company's clearing/terminal services are exempt merely because the owner states
it. The accountant must identify the applicable exemption and purchase-VAT
recoverability, including any transaction-specific or mixed-use treatment.

Source checked 2026-10-13:
[Nigeria Tax Act 2025, National Assembly](https://nass.gov.ng/documents/download/11249).
The large NRS hosted PDF could not be fetched by the browser tool; no new NRS
circular interpretation or company-specific exemption was verified this session.

Illustrative calculation only: taxable VAT-exclusive supplier cost N100,000.00
at7.5% gives VAT N7,500.00 and gross N107,500.00. Do not add VAT again to a
VAT-inclusive amount. Import/duty documents may already contain separately stated
taxes; review their basis rather than taxing the entire payment again. Whether
purchase VAT is recoverable or belongs in cost requires approved tax treatment.

## Existing Implementation Versus Remaining Work

| Area | Source-confirmed existing implementation | Required addition/configuration |
| --- | --- | --- |
| Direct costs | Existing operational mapping can post company-borne costs to expense accounts; draft chart has a direct-job-cost parent | Approve duty/shipping/terminal expense heads and explicit source mappings under the new policy; preserve earlier evidence |
| VAT | Invoice scalar rate/amount and reviewed recorded-output-VAT mapping exist | Typed taxable/zero-rated/exempt classifications, effective-dated rates/bases, purchase-VAT split and approved recovery/cost rules across forms, posting and reports |
| Commencement | Policy cutoverDate and pre-cutover posting restrictions exist | Obtain exact official go-live date, approved book/calendar and dated opening boundary; do not confuse operational test history with official accounts |
| Openings | previewOpening, prepareOpening and independent approveAndPost exist with exact controls, immutable evidence, duplicate and late-opening protections | Authorised setup screen/API, whole-chart completeness including zeros, explicit independently verified readiness gate before forward transactions |

Current public native routes provide reports and reviewed manual adjustments, not
an opening-balance setup screen/API. The engine blocks forward preparation when an
opening draft is pending and refuses a late opening after forward journals exist;
it does NOT currently require a verified opening/init record to exist before the
first forward journal. That stronger readiness requirement remains to be built.
An all-zero opening must be reviewed without inventing a nonzero journal merely
to satisfy the engine's existing balanced/nonzero posting validation.

These are policy/setup requirements and implementation gaps, not newly reproduced
live accounting defects. Reuse the existing Step6/7 engine and Step9 review/audit
patterns; do not create another ledger or bypass protected source/control accounts.

## Exact Next Action / Activation Boundary

1. Obtain the exact official go-live date and Head of Accounts' dated complete
   chart/opening schedule, with bank reconciliations and AR/AP/deposit detail.
2. Obtain the professional basis for service exemption and purchase-tax rules;
   owner statements do not substitute for required recorded approvals.
3. On implementation instruction, extend the existing setup/opening workflow and
   structured VAT/source policy; test in isolated namespaces before activation.
4. Keep official accounting/schema inactive until book/chart/policy/openings and
   cutover are explicitly reviewed and activation is separately authorised.

Step9 engineering acceptance is retained. Step10 Balance Sheet/Management Accounts
remains the next reporting roadmap and is not started by this policy discussion.
This session changes documentation only: no code, native flag, schema, bank balance,
source transaction or production accounting record is changed.
