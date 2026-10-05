# CAP-02 Document Readiness and Reviewed OCR

## 2026-10-05 14:26 WAT - Implementation and Initial Checks

- User explicitly authorized CAP-02 after records review. Started from clean
  master at 0d49c85 in the restored checkout. Earlier proposed-only status no
  longer applies. No new production fixtures or record writes so far.
- Extending existing DocumentsTab, storage, index and API. Additive document
  classification/issuer/expiry/version metadata; append-only branch job/cargo
  profiles, per-visit profile applications and human reviews. Historical uploads
  remain unreviewed. New versions and reviewed legacy documents cannot be deleted
  through the document API; replacements keep predecessor and reset readiness.
- Profile creation requires branch administrator; review/application requires
  Documentation or branch administration. Branch and assigned-client boundaries
  applied to document readiness, upload, list and file retrieval. Stale review,
  checklist application and replacement requests rejected. Review never changes
  stage, release, bank, invoice or payment records.
- Local English OCR uses bundled Tesseract language data; no document bytes sent
  externally. PDF.js renders scanned pages. Bounded to six scanned PDF pages,
  12MP images, one concurrent OCR operation and 60 seconds. Upload remains stored
  on extraction failure and offers retry. Human source confirmation mandatory;
  suggestions carry page/confidence, accepted corrections and extraction snapshot
  retained in review history. Profiles apply per visit, not automatically to siblings.
- Eight readiness/API tests passed against isolated PGlite (including idempotent
  migration and legacy preservation), three real synthetic image/scanned-PDF OCR
  tests passed. Printed identifier, amount and date matched expected values.
  This is not a representative handwriting/real-world accuracy benchmark.
- Initial typecheck passed; full build, expanded regression, UI browser testing,
  concurrency checks, final review and publication/acceptance still in progress.

Next: finish tests and code review before commit/deploy. Retain prior CAP-01/04
fixtures. Do not claim live CAP-02 acceptance until observed.

## 2026-10-05 14:36 WAT - Local Browser and Retention Checks

- Full API regression passed 164 tests across 35 files. Production build rerun
  underway after final retention changes; first full build already passed.
- CAP-02 browser fixture passed profile creation/application, low-confidence
  suggestion correction, required manual source confirmation, readiness refresh,
  read-only controls and dialog geometry at 320/390/768/1440 pixels. Inspected
  phone screenshot. Test fixture initially lacked the shipment response; fixed
  fixture, not production logic. Animation completion awaited for pixel checks.
- Added database deletion protection for retained documents and made existing
  bulk container deletion atomic with a retained-history conflict. This closes
  the parent-deletion bypass without changing ordinary workflow/financial data.
- Unsafe document MIME types download rather than execute inline; readiness
  response no longer includes internal storage keys through an unused field.
- Added docs/CAP02_DOCUMENT_READINESS.md with permissions, setup, statuses,
  retention and OCR limits. No production writes or deployed acceptance yet.

## 2026-10-05 14:42 WAT - Publication Gate

- Final Railway build/typechecks passed with pre-existing sourcemap/chunk-size
  warnings. Full regression rerun: 35 files, 164 tests passed, including direct
  SQL retained-file deletion rejection. CAP-02 browser rerun and CAP-01/CAP-04
  regression suites passed. No unexpected local code changes.
- Railway CLI authenticated read-only status works. Proceeding to commit/push
  and verify exact deployment, schema startup and bounded live acceptance.
  No live CAP-02 fixture yet. True concurrent network PostgreSQL race testing
  and representative real-document OCR accuracy remain outside current evidence.

## 2026-10-05 14:51 WAT - Deployed and Bounded Live Acceptance

- Code committed/pushed `bf24fb0`; exact Railway deployment
  67edc83f-5abf-45c7-bbc0-85f19a7d420a SUCCESS. Runtime logs confirm
  document_readiness_v1 and listening; /api/healthz returned ok. The attempted
  /api/health path was not the public health route and returned unauthenticated;
  this is not a recorded health failure. Source confirms /api/healthz.
- Fresh owner login in in-app browser. Existing Chrome tab was blocked by another
  extension UI, so it was left untouched. In-app pointer actions did not reliably
  activate controls; keyboard actions worked. Do not infer a UI defect from this
  automation behaviour; production-build Playwright mouse interactions passed.
- Profile #1 CAP02-LIVE-20261005 Dummy Release applied once to existing #32.
  PNG #9 v1 -> reviewed/ready, then replacement #10 v2 -> received, then rejected.
  V1 now historical/read-only; three review entries retained across two versions.
  Current final state: v2 deliberately rejected; no real release implied.
- Live OCR matched identifier CAP02-LIVE-20261005, NGN500.00 and 2026-10-05 at 93%
  page confidence. Compared rendered source visually, explicitly accepted fields,
  ticked source confirmation; review history persisted. Dummy source generator:
  scripts/cap02-create-sample.mjs (outputs a labelled PNG to OS temp).
- Expiry attempt saved a second v1 review with blank expiry because browser date
  input did not take the value. Subsequent native-segment attempt also blank and
  was not submitted. This is NOT a live expiry pass or a confirmed product bug.
  Local expiry validation/status tests passed. Next: native-browser date entry
  and expiry check on existing #10 only; no duplicated fixtures or repeated writes.
- Sibling #33 remains unconfigured with no files, pending/unassigned/undelivered.
  #32 remains Registered/delivered Sept9/owner christian/dueSept10. Dashboard
  same-session totals and banks unchanged:15/13/2 containers, invoiced3001,
  collected2001, AR1000, banks42499997/599/1. No stage or financial writes.
- Evidence saved at C:/Users/SONOFGRACE/AppData/Local/Temp/cap02-live-review.png.
  Broader OCR quality, network-Postgres parallel races, fresh live restricted-role
  checks and live scanned-PDF OCR remain outside acceptance evidence. Local
  regressions cover permissions/stale writes/PDF OCR. No next capability started.

## 2026-10-05 18:03 WAT - Remaining Verification Authorised

- User asked what remains, then authorised proceeding. Read current records and
  session; clean master at 9f80530. No completed fixture sequence restarted.
- Native calendar solved the previous date-tool limitation: Space on the date
  picker button opened its native table; Left/Return selected 2026-10-04, verified
  in AX before saving. #10 reviewed once with that expiry -> expired/not ready.
  No code change needed. Total review entries now four across existing files.
- Remaining work underway: live scanned-PDF OCR, isolated network Postgres
  simultaneous-write checks, restricted live staff session, broader OCR evidence.

## 2026-10-05 18:10 WAT - PDF and Network Database Checks

- New necessary format fixture #11: CAP02-LIVE-20261005-scanned.pdf on #32,
  Other/unreviewed, not a replacement for expired #10. Live server OCR matched
  all three expected fields at 93% page confidence; verified amount remained
  blank until human acceptance (none submitted). Embedded PDF viewport blank
  in this browser; OCR passed, native PDF preview compatibility is not verified.
- Six isolated PostgreSQL/API tests passed through existing private Railway
  tunnel, including simultaneous reviews/profile applications/replacements.
  Each race gave one 201 and one 409. Random schema removed and tunnel closed.
  Initial run failed; fixed incomplete test review body and network-test timeout
  before all six passed. No production schema or data used for the race tests.
- Extended existing CAP-04 runner with explicit cap02 suite selection instead
  of copying tunnel/credential code. Credentials remain memory-only. Existing
  CAP-04 default unchanged; no closed CAP-04 tests rerun against Railway.
- Requested existing Operations QA login for fresh restricted-session check;
  no password reset, new account or permission change performed. Continuing
  synthetic OCR quality probes while awaiting access.

## 2026-10-05 18:20 WAT - Quality Results and Exact Stop Point

- Five synthetic OCR probes completed: printed/skewed/faded sources matched all
  three fields each; blurred simulation matched none; script-font simulation
  matched amount/date but inserted a space in its identifier. Total 11/15 exact
  fields, not a general accuracy percentage or human-handwriting benchmark.
  Documented this manual-review limitation in the CAP-02 guide and both registers.
- Full API regression: 36 files, 169 tests passed, three network-only skipped in
  normal mode. Separate Railway PostgreSQL run already passed all six including
  those three races. No extra production finance or stage writes were performed.
- Fresh Operations QA #14 credentials requested asynchronously; no response yet.
  No password reset, role widening or duplicate account created. Guarded Python
  live-access runner prepared and syntax checked, but NOT executed. Credentials
  will be prompted into memory only; no passwords or session cookies saved.
- Exact next action: authenticate existing QA #14, verify read access and denied
  review/configuration/branch/finance requests, retrieve existing PDF #11 and
  compare unchanged history. Reuse #32/#33; never recreate profile #1 or #9-#11.
  Native PDF preview outside this in-app viewer and representative real-document
  OCR quality remain unverified. No confirmed new product defect from these limits.
- Live final state: #10 expired, four review entries across #9/#10; #11 unreviewed.
  Evidence: C:/Users/SONOFGRACE/AppData/Local/Temp/cap02-expiry-verified.png.
  Last verified application deployment bf24fb0; this round adds tests/docs only.
