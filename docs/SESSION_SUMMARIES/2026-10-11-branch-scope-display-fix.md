# Branch-Switch Dashboard Display Fix

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
