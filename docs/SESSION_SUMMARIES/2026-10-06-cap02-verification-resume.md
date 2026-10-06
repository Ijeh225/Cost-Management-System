# CAP-02 Verification Resume

## 2026-10-06 11:50 WAT - Download Labels Deployed; OCR Findings Remain Open

- Committed/pushed the label correction, keyboard regression and public-receipt
  benchmark/report as d3c7f1a. Railway confirms exact commit SUCCESS in deployment
  e737b841-29fc-42df-9601-8ef0374b94a4. Production build and local UI checks passed.
- Refreshed existing owner Chrome #32 Documents tab. Named download controls
  distinguish PNG versions 1/2 and PDF version 1. All have explicit button type
  and tooltip explaining new-tab behavior. Enter opens the existing PDF URL
  /api/documents/11. Chrome extension UI blocked the fresh native viewer read;
  did not bypass it or claim another rendering/download success.
- Screenshot saved as cap02-download-labels-live-20261006.png in OS temp.
  No application records created or altered. Existing staff/native PDF acceptance
  remains separately recorded; no duplicate test records or permission changes.
- Broader OCR benchmark is complete but not a quality pass: 12 public receipt
  scans attempted, 10 processed, 2 rejected by 12MP guard; 2/20 date/amount
  suggestions matched exactly. CAP02-OCR-001 (amount context) and CAP02-OCR-002
  (date contamination/validation) are confirmed Medium open issues, not fixed.
- Next proposed action: scoped conservative parser fixes and regression tests
  for these two findings, followed by the same benchmark. Genuine Nigerian
  clearing-document and handwriting performance remains unverified.

## 2026-10-06 10:40 WAT - Access Blocker, No Repeated Tests

- User said proceed. Read current project/test/session records and confirmed
  clean master, synchronized with origin, after b405d01.
- Completed expiry, OCR extraction and isolated concurrency tests were not rerun.
  Existing Chrome application tab initially showed login; requested sign-in to
  the existing Operations QA account #14, without resetting its password.
- Opened existing scanned PDF #11 from #32 in owner in-app session. Iframe source
  was /api/documents/11. Download button has a download icon but no accessible
  label; this is an observed accessibility gap, not fixed in this testing task.
- Download-event wait stalled; after browser interruption the action had opened
  a second in-app tab at /api/documents/11. That tab returned session-expired JSON.
  No downloaded file path or successful native rendering was observed. Main
  document page retains cached prior state, which does not prove fresh access.
- Chrome tab now points to the app homepage, but attempting control returned
  debugger-unattached. Cannot identify signed-in account or verify restrictions.
  Did not bypass browser control, extract cookies, change permissions or passwords.
- No document, review, profile, workflow or finance writes this turn. #9-#11 and
  profile #1 must be reused. PDF-preview and fresh staff controls stay unverified;
  real-document/handwriting accuracy also remains outside synthetic evidence.
- Exact next action: restore Chrome automation access, confirm existing QA #14
  identity/branch/role, then complete permission checks and inspect existing PDF
  #11. User action is required for the browser/auth blocker, not new business data.
- Resume record committed and pushed in 9b28fc1. The low-priority missing
  accessible names on document download buttons are also recorded in both
  authoritative registers; no implementation started.

## 2026-10-06 10:45 WAT - QA Account Ownership Clarified

- User pointed out the agent created the test account and asked to log in.
  Confirmed creation in original live register and latest recorded temporary
  password rotation in Sept 9 CAP-01 summary. Credentials intentionally were
  not saved in project files; do not guess a password or reuse the owner's.
- Chrome browser control now works. Profile menu identifies owner Super Admin,
  not QA. Existing QA row confirms active Lagos Staff/Operations with only
  Transire and Shipping. No duplicate account or widened permissions needed.
- Opened Edit User - E2E Operations QA for user password-change handoff. Every
  field remained unchanged; no password entered or Save Changes submitted.
  User must enter and save a temporary password, then provide it for sign-in or
  authenticate the staff session. This resolves missing credentials legitimately.
- Screenshot: C:/Users/SONOFGRACE/AppData/Local/Temp/cap02-qa-password-handoff.png.
  Browser tab retained for handoff. Staff/PDF acceptance still incomplete.

## 2026-10-06 10:53 WAT - Staff and PDF Acceptance Passed

- User supplied the test password after completing the handoff. Used through
  no-echo terminal input and the ordinary login UI only; not saved in records,
  scripts or environment files. No agent password reset or permission change.
- Guarded live checker authenticated existing #14/branch2/staff and passed all
  24 expected HTTP responses, including login/CSRF/me/logout. Same-branch #32/#33
  reads and PDF #11 binary retrieval passed. Valid forbidden review/profile/apply
  attempts returned 403; cross-branch #24/#25 returned 404 under forged all/1/3
  scope headers; banks/invoices/schedules/users returned 403. Documents/history/
  profiles/applications/items remained exactly equal before and after.
- After API logout, separate in-app browser login reached Transire workspace.
  Native typing first failed client-side email validation; corrected ordinary
  labelled-field entry succeeded. Not a confirmed application defect. #32's
  operational Documents view shows no requirement configuration; #10 review
  fields, confirmation and approval buttons disabled. Screenshot retained.
- Chrome remains signed in as owner. Existing #11 attachment opened in native
  PDF viewer and visibly rendered one-page dummy source with all three expected
  fields. No re-upload, replacement, approval or financial/workflow mutation.
- Evidence files: Temp/cap02-staff-readonly-20261006.png and
  Temp/cap02-chrome-pdf-verified-20261006.png. In-app QA tab and Chrome PDF retained.
- Supersedes the earlier credential/browser/PDF blockers. Bounded CAP-02
  functional acceptance is complete. Remaining: minor unlabeled download icons
  and broader representative real-document/handwriting OCR quality (not a pass
  or a confirmed defect). No new capability or product fix started this turn.
- Acceptance evidence committed/pushed as 32a9842; documentation-only diff checks
  passed. This does not claim a new application deployment or broader OCR accuracy.

## 2026-10-06 11:40 WAT - Labels and Real Receipt Benchmark

- User authorised download accessibility labels and broader real-document OCR
  testing. Clean master at 63358e1 before changes. Shared DocumentsTab now names
  download actions by filename/version and supplies a new-tab tooltip/type.
  Existing open/download semantics, data, permissions and review logic unchanged.
- Full Railway build/typechecks passed (existing sourcemap/chunk warnings).
  CAP-02 production-frontend fixtures passed, now also testing named download
  lookup, Enter and Space, correct target URL and absence of mutation requests.
- Used twelve preselected public SROIE test-split scans locally; no live uploads
  or OCR provider. Attribution/license, dataset revision, image/source hashes,
  exact comparison and results retained by reproducible resumable benchmark.
  Initial HTTP 502 was a source-service failure; resume did not repeat samples.
- Ten processed; two correctly rejected >12 MP. Raw date/total presence 15/20,
  exact suggestions 2/20. Not representative Nigerian clearing/handwriting data.
  Visually verified sample90 total46.20 vs tax1.26 incorrectly suggested as amount.
- Recorded Medium OPEN CAP02-OCR-001 amount-context/validation and CAP02-OCR-002
  date contamination/validation. User asked to test OCR, so product OCR parser
  is unchanged; suggested follow-up must use this evidence, not an accuracy claim.
- Next: publish label fix, confirm exact deployment and live labels. No repeat
  staff permission or finance tests. Report: CAP02_REAL_RECEIPT_BENCHMARK_2026-10-06.md.
