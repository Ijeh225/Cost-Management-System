# CAP-02 Verification Resume

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
