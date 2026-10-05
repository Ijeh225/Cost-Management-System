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
