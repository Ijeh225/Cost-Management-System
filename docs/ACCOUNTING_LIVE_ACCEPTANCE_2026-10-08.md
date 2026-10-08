# Accounting Steps 1/2 Live Acceptance

Verified 2026-10-08 15:33 WAT. Scope: ACCT-001, ACCT-002, ACCT-003 only.

## Release and Protection

- Implementation: d37d4b4043a14cd57cf80dc0975516c3b40b87c0, pushed.
- First release: 158f6fce-9d41-4174-abe1-78dfdee1a6e3, provider SUCCESS but
  Financial Ledger returned HTTP 500. No dummy fixture had been created.
- Release defect ACCT-DEPLOY-001: additive columns were placed inside already
  recorded invoice_payment_reversals_v1. Production metadata confirmed missing
  fields and old migration recorded once. Provider health alone was insufficient.
- Correction: db68c79a07cda334f4136b45bc4203c562e67a9f, pushed; independently
  versioned invoice_cash_settlements_v1. Deployment
  05de367d-7c1d-429d-8e7f-1719ddeebaa9 SUCCESS, provider healthcheck passed,
  server startup log confirms migration. DB confirms all three nullable columns,
  partial retry-key unique index and migration recorded exactly once.
- New isolated older-schema upgrade test passed: old row preserved, repeated
  additive upgrade safe, duplicate retry key rejected. Prior 19 cases retained
  as separate passed evidence, not rerun. Final API suite 38 files/228 passed,
  3 pre-existing skips; API typecheck and server build passed.
- cf29433 checkpoint and annotated checkpoint-before-accounting-cash-fixes-
  2026-10-08 tag preserved and pushed. Private archive checksum unchanged.
  Full isolated restore rehearsal remains valid. External storage/provider
  secrets were not part of that backup; never claim otherwise.

## Live Results

| Control | Result | Evidence |
| --- | --- | --- |
| Original deposit | PASS | Existing NGN50,000,000 receipt appears exactly once in Financial Ledger. |
| All-time reconciliation before dummy writes | PASS | Ledger 50,002,005 in less 17,711,508 out = 32,290,497; Cash Flow 50,002,004 in less 17,711,507 out = same net. Ledger includes both sides of internal NGN1 transfer, consolidated Cash Flow eliminates them. |
| New original receipt | PASS | NGN1,000 dummy deposit increases scoped Ledger/Cash Flow/Bank by exactly NGN1,000. |
| Deposit allocation | PASS | Applying NGN400 produces invoice paid settlement 400/outstanding 600, sourceDepositId 4, method deposit, no bank link. Cash totals unchanged. |
| Retry safety | PASS | Same allocation key replays once; changing amount under that key returns 409. Same credit key also replays without additional consumption. |
| Credit note | PASS for cash scope | CN NGN700 applies 600 to invoice and 100 to reusable client credit; no cash movement. P&L/VAT recognition is separate OPEN ACCT-004, not certified here. |
| Deposit reversal | PASS | Negative source-linked settlement restores allocated amount to zero; original receipt remains. Invoice settlement becomes 600/outstanding 400. Cash unchanged. |
| Client credit | PASS | Apply 50 reduces credit to 50 and invoice outstanding to 350; no new cash. |
| Credit reversal | PASS | Restores reusable credit to 100 and invoice outstanding to 400; no fake bank refund. |
| Future opening | PASS | Future 2099 period has zero current inflow/outflow; opening equals current branch closing 1,500, not inflated by settlement history. Branch-wide Cash Flow and one selected bank have different source populations; no forced equality. |
| Bank final | PASS | Existing bank #3 increases from 599 to 1,599 only from original dummy deposit. |
| Invoice/AR integration | PASS | API and invoice UI show 600 settlement/400 outstanding; AR same 400. Both reversals and CN remain visible, with audit history. |
| Consolidated final | PASS | Ledger and Cash Flow closing net both 32,291,497, exactly +1,000 over protected baseline. |
| Original records retained | PASS | Read-only DB check excluding only exact new fixture IDs matches every protected financial source count and total. No unrelated finance source changed. |

## Retained Dummy Records

All are in existing E2E-20260901-Lagos branch #2, not a new branch or account.

| Record | ID / value |
| --- | --- |
| Client | #10, E2E-ACCT-20261008 Cash Settlement QA |
| Container | #34, ACCT2610081; B/L E2E-ACCT-20261008; Pending Verification |
| Invoice | #15, INV-202610-001; total 1,000; due 2026-10-31; Partial |
| Deposit | #4, 1,000; allocated zero; available 1,000; bank #3 |
| Deposit settlement/reversal | Payment #14 +400; #16 -400 |
| Credit-note settlement | Payment #15 +600, non-cash |
| Client-credit settlement/reversal | Payment #17 +50; #18 -50 |
| Credit note | #1 CN-202610-001, face value 700; remaining reusable client credit 100 |

No physical movement, operational stage transition, document upload, email,
WhatsApp, real payment gateway action or external bank transfer occurred. These
are internal application dummy postings authorised by the owner. Records were
not deleted or hidden; reversal traceability and original receipt were retained.
The guarded runner refuses to recreate this named fixture and supports read-only
inspection. API test sessions logged out; owner browser session restored.
Credentials/cookies are used only in memory, never saved to project records.

## Original Source Baseline Rechecked

Excluding the new fixture: invoices 9, invoice payments 5/net 2,001, original
deposits 1/50,000,000/zero allocated, clients 6, containers 15, banks 3, duty
transactions 7/net 2,000,501, overhead payments 9/net 15,710,302, container
payments 201, standalone schedule payments 2/net 501, funding 1, transfers 1.
All match the saved checkpoint. This verifies source counts/totals, not a new
byte-for-byte dump or a claim that session/notification/audit metadata is unchanged.

## Remaining Boundaries

ACCT-001/002/003 and ACCT-DEPLOY-001 are closed for these tested scopes.
ACCT-004/005/006/007 remain open and require separate approval. No proper
double-entry General Ledger, Trial Balance, general journals, Balance Sheet or
Statement of Affairs was added. Broader AI bank-draft source coverage remains
explicitly partial. Do not describe this release as full accounting certification.
The next proposed approved-by-owner step would be Step 3 recognition policy and
credit-note/bad-debt corrections; no such implementation started in this release.
