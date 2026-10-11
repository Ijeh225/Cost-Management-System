# Branch-Switch Dashboard Display Fix

## 2026-10-11 01:34 WAT - Publication And Step 7 Authorised

- Owner requests completed fix be committed/pushed/deployed, checks all six
  Step6 phases and authorises starting Step7. Current roadmap confirms inactive
  Step6 engineering already accepted/deployed, with real policy/chart/cutover/
  opening/named grants approval still pending. Do not implement a duplicate.
- Publish notification fix first and verify release/live acceptance; then begin
  inactive Step7 source/opening engineering in same ledger with isolated tests.
  Generic authority does not fabricate accountant approvals/official balances
  or enable production flags. Both registers updated; implementation in progress.

## 2026-10-11 01:32 WAT - Notification Scope Fixed Locally

- Owner asks to fix the notification-badge delay (BRN-SCOPE-UI-002). Started
  clean master9b5ef58, reused existing branch-query helper rather than duplicate
  endpoints. All three shared sources (system/workflow/history) and five read/
  viewed mutations now capture branch scope in keys/headers across sidebar,
  bell and Notifications page. Existing access rules/invalidation unchanged.
- New branch shows loading, not the previous count; combined bell waits for
  both sources and reports failure distinctly. Own cached branch snapshots and
  late-response isolation retained. Scope-keyed list/history animations remove
  old rows immediately. No wider notification redesign/calculation change.
- PASS: five hook cases; full API units43files/280PASS/3existing skips; full
  railway:build/typechecks and final client build. Eight new built-UI groups
  cover delay/cache/read/history/rapid/failure-empty/mobile/headers-render.
  Existing dashboard eight groups and Documentation/Invoice smoke PASS.
  Initial ESM provider-context and missing dashboard-fixture fields corrected
  in harness, not claimed as live defects. Existing build warnings retained.
- All browser network writes were mock notification read actions, not live
  production writes. UI mark-viewed fixture deliberately does not change reads;
  captured mutation hook covered separately. No DB/schema, finance, role,
  config or accounting activation changes; checkpoints preserved.
- Registers/index updated. New notification fix remains uncommitted/unpushed/
  undeployed; no new live acceptance claimed. Exact next is approved publication,
  exact Railway release/source/health confirmation and bounded branch badge/
  bell/history acceptance. Existing accountant policy/chart approval separate.

## 2026-10-11 01:08 WAT - Published And Live Accepted

- User requests push/deploy. Functional3c2c1498380af2d5156e8f28213f9712f7fdb277
  pushed; exact Railway1764574f-a2e5-48aa-af1f-285df10e50cf successful with
  matching source commit link. Public /api/healthz returns status:ok. Auto GitHub
  deployment used, no extra manual deployment or config/permissions changes.
- New live owner reload verifies All->Lagos Operations loading without old17count
  or Head Office bank, then10count. Lagos->All Finance loads without prior4200/
  2231.50; settles4201/-15707770.50. Correct branch-specific cached revisits.
  Restore All Branches Finance. No financial writes, new test records or activation.
- BRN-SCOPE-UI-001 closed for bounded dashboard acceptance. Local failure/delay/
  empty/mobile/late-response coverage not represented as live induction tests.
- New Low BRN-SCOPE-UI-002: notification sidebar badge briefly shows old23/17
  count on switch; settled correct. Source shared notifications key remains
  unscoped. Logged separately, not fixed, no persistent or cross-role leak proved.
- Records/index updated for publication; previous policy review docs preserved.
  Next separate notification-scope review if approved, plus existing accountant
  policy/chart/year-end approval before Step7; no mandatory company hierarchy.

## 2026-10-11 01:02 WAT - Push And Deployment Authorised

- Owner explicitly requests push/deploy. Fetched origin/master; no divergence
  from local7341c2a. Include fix/tests and prior business-policy clarification
  records without changing their meaning, financial records or activation flags.
- Next exact commit/provider status/health and live switching acceptance; a push
  alone is not deployment evidence. Existing protected checkpoint untouched.

## 2026-10-11 00:59 WAT - Local Fix And Verification

- Owner asks to fix brief old figures under a newly selected branch. This is
  BRN-SCOPE-UI-001, not a company hierarchy or accounting calculation change.
- Root cause: dashboard query keys lacked branch scope; invalidation reused old
  cached results while labels changed. Reused generated query overrides and
  existing manual hooks with optional scope, not duplicate endpoints/features.
- Added one shared cache/request helper: same branch in query identity and
  captured X-Branch-Id, preserving filter/invalidation prefixes. Applied to all
  eight dashboard sources (stats, P&L, banks, AR, VAT, recent containers, alerts,
  berthing). Fetch cancellation supported; other optional callers unchanged.
- New branch loading does not display previous-scope amounts. Cached revisits
  show only their own branch snapshot; late responses cannot overwrite the new
  branch's cache. Added accessible loading labels, no financial logic changes.
- Verification PASS: focused five tests; full unit 42 files/275 tests/3 prior
  skips; complete railway:build/typechecks/client/server. Eight GET-only local
  built-UI assertions include delayed switches both directions, cached revisit,
  failed request, empty branch, rapid late response, mobile, eight-source scope.
  Existing Documentation/Invoice keyboard/responsive smoke also PASS.
- Initial test harness selector and cross-root import errors corrected using
  existing repository patterns. Known build sourcemap/chunk warnings retained.
  These are local fixture checks, not a live deployed re-test or database suite.
- Preserved prior dirty business-policy docs/checkpoints; no live records,
  settings, permissions, hierarchy, accounting activation or database writes.
- Both authoritative registers/index updated. Uncommitted/unpushed; no Railway
  deployment verification in this turn. Exact next: approved commit/push,
  confirm release and live All->Lagos Operations / Lagos->All Finance acceptance.
  Accounting policy/chart/year-end approval remains separate outstanding work.
