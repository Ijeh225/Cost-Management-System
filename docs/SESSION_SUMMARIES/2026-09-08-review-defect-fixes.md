# Review Defect Fixes - 2026-09-08

## 2026-09-08 13:52 WAT (UTC+01:00) - Authorized Scope

- User asked to fix the three findings from the capability review. Confirmed
  REVIEW-NOTES-001, REVIEW-A11Y-001 and REVIEW-LABEL-001 against current source.
- Starting checkout: master, clean and synchronized with origin at 06c57ee.
- Fix existing Stage Notes GET/POST paths and response handling; make
  Documentation expansion and fields accessible; separate issued invoice
  outstanding from draft value. Preserve branch checks and existing records.
- Add focused regressions, run typechecks/build, update registers, commit/push.
  No CAP feature proposals are approved; no financial writes or migrations planned.
- Historical review remains evidence, not a live acceptance of these fixes.

## 2026-09-08 14:06 WAT (UTC+01:00) - Implementation and Verification

- REVIEW-NOTES-001: fixed canonical route registration for both reads and adds,
  kept auth/CSRF/branch guards. Added strict JSON/array/record validation before
  displaying notes, safe count/render and local error/retry instead of page crash.
  Existing loaded notes remain visible on refresh failure. Added accessible note
  controls and prevented Enter submissions while a note request is pending.
- REVIEW-A11Y-001: native expandable Documentation buttons, expansion state,
  stable unique field IDs, linked labels for seven fields, assessment help text,
  search names and filter state. Existing save/submit behavior unchanged.
- REVIEW-LABEL-001: separate Issued Outstanding and Draft Value. Issued population
  matches API eligibility, excludes cancelled/written-off/draft amounts. Summary
  branch scope and list filters explained; draft invoices remain manageable.
- API suite: 25 files / 110 tests passed, including nine new Stage Notes HTTP
  cases using real auth/CSRF/branch guards against mocked database operations.
- node --experimental-strip-types --test scripts/review-response-summary.test.mjs:
  18 passed, including malformed note data, seven status parity cases, zero and
  cancelled invoices, NGN180 draft versus NGN1,000 issued example.
- scripts/review-ui-smoke.mjs: local production-build Chrome test passed native
  Enter/Space/Tab, seven label-to-field focus checks and unique IDs across two
  Documentation cards. Invoice cards show NGN1,000 issued and NGN180 draft, draft
  retained in list. No horizontal overflow at widths 390/768/1440 or page errors.
  Browser fixtures intercept all API calls and block external network access;
  no live records or credentials used. Bundled Playwright path supplied at run.
- Full corepack pnpm run railway:build passed (all workspace typechecks, frontend
  and API build). Existing Vite sourcemap and large-chunk warnings remain.
- Test setup corrections: included real CSRF header for authenticated POST tests;
  moved cross-project helper tests to scripts to respect API rootDir; corrected
  fixture pipeline URL. All reruns passed; these were not new live defects.
- Next: review/stage changes, commit and push. Then confirm Railway deployment
  and perform scoped live acceptance before closing REVIEW IDs in the register.
  No financial transaction, schema, deployment setting or historical fixture changed.
