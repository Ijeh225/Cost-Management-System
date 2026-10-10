# Native Accounting Foundation Specification

Prepared 2026-10-10, Africa/Lagos. Status: draft policy, inactive implementation.
Owner selected native accounting. No accountant approval is implied.

## Phase 6A: Approval Worksheet

The versioned proposed chart is `native-draft-1` in accounting-rules.ts. It covers
assets, liabilities, equity, income and expenses; normal balance is not a rule
that prevents legitimate contra-account balances. Bank and expense-head
subaccounts must map existing records, not create duplicate money facts.

| Decision | Required before activation |
|---|---|
| Books and branches | Legal entity name; which branches belong to one book |
| Currency and year | Three-letter base currency; two-decimal precision; financial year-end |
| Cutover and openings | Cutover date, reconciled signed opening balances, migration coverage |
| Revenue | Service-fee recognition; issued/draft/cancelled invoice treatment |
| Client funds | Deposit liability; allocations reduce liabilities and AR, not cash twice |
| Disbursements | Recoverable duty/shipping/terminal versus company expense; agency versus principal |
| VAT | Applicable treatment, tax controls, rounding and credit-note adjustments |
| Costs | Accrual of unpaid expenses; payment reduces payable, not expense twice |
| Corrections | Credit notes, bad debts, recoveries, reversals and adjustment evidence |
| Non-expense payments | Assets, advances, depreciation, loan principal/interest, funding |
| Access | Named prepare/post/reverse/close/reopen/configure/read grants per branch |

All fourteen policy fields must be supplied with a version and owner/accountant
approval evidence. No VAT rate, financial year, legal structure, historical
classification or opening balance is inferred. Current missing evidence remains
unclassified. Exact fiscal dates and chart details need professional review.

## Phases 6B-6E: Controls

- Additive tables only; no existing transactions or roles replaced. Schema and
  functions are created transactionally, under a migration advisory lock.
- Accounting models are outside ordinary Drizzle schema-push discovery, and
  `accounting_*` is excluded from its database introspection. Only the accounting
  migration owns these tables and deferred triggers; deployment cannot create
  a half-protected ledger or strip its guards through generic schema push.
- No chart, book, grants, period or journal is automatically seeded in production.
- The built internal `accounting-foundation.cjs` exports the engine/configuration
  service for future approved adapters. Loading it performs no writes. Step6
  exposes no public journal/configuration HTTP routes or frontend accounting UI;
  those belong to later approved roadmap steps, not duplicate manual cash entry.
- Global `NATIVE_ACCOUNTING_ENABLED` defaults off. A book additionally needs
  approved policy, a matching branch and open dated period. Startup migration
  also remains opt-in while this foundation is awaiting production approval.
- Amount inputs are decimal strings, converted to integer minor units with
  BigInt. Journal totals use exact SQL arithmetic; no floating-point tolerance.
- At least two nonzero one-sided lines, valid active same-book accounts, one
  branch/currency, exact balance. Header, lines, event link and audit are atomic.
- Event keys represent one source event/version. Same payload retries reuse the
  existing journal; changed payload is refused. Source adapters are Step7, not
  enabled by this foundation. Manual journals have explicit controlled request keys.
- Posted headers, lines, links and audits cannot be edited/deleted. Reversal is
  a second journal with opposite lines, reason, link and independent approval;
  no deletion or rewriting of the original cash/source transaction.
- A cancelled draft reversal keeps its original audit/event link. A corrected
  replacement has a new deterministic attempt key; concurrency and a partial
  unique index still permit only one draft/posted reversal for the original.
  The migration upgrades the earlier index only in its own schema.
- Explicit per-book/per-branch grants; canonical active profiles still required.
  Super Admin and general `finance.access` do not silently imply posting grants.
  Every journal has a different preparer and approver, including reversals.
- Abandoned drafts may be cancelled by their preparer, or a reviewer with both
  explicit prepare/configure grants and an immutable reason/actor audit. This
  cannot cancel/edit a posted journal or force a bad draft to post just to close.
- Periods cannot overlap. Posting, configuration and close/reopen share a
  book-level transaction lock. Closed-period writes fail. Reopening requires
  distinct permission and audit reason, not changing original posting dates.
- Shared chart, book policy and period creation require configure grants across
  every branch in that legal book. A single selected branch cannot grant control
  over another branch's shared accounting setup. Close/reopen has the same scope.
- Closing requires no unposted journals plus source completeness, unresolved
  mapping and reconciliation attestations. Until Step7 coverage exists, a normal
  production close cannot be certified by this foundation alone.

## Phase 6F: Acceptance and Rollout Boundary

Engineering acceptance2026-10-10 22:30 WAT:

| Phase | Implemented / verified | Approval or activation boundary |
|---|---|---|
| 6A | Versioned20-account proposal and14-field rule worksheet; missing approval refused | Accountant/owner policy sign-off pending |
| 6B | Protected code/tag; fresh full-restored backup; repeatable transactional nine-table schema | Production schema creation off |
| 6C | Exact atomic balanced/idempotent engine; immutable posted records, audits and linked reversals | No existing transaction writer calls it |
| 6D | Non-overlapping periods, close/reopen audit, draft checks, post/close serialization | Source completeness is a reviewed attestation; automated adapters are Step7 |
| 6E | Named branch grants, canonical profiles, independent approval, whole-book configuration scope | No production grants or permission changes |
| 6F | All23distinct isolated cases across full20/focused3/5/3; existing43/43; unit270PASS/3prior skips; typechecks/build/smoke PASS | Initial inactive release verified; final native-only follow-up proof next; no official cutover |

Not one uninterrupted full23 foundation run; final five-case rerun covers changed
permissions and final three-case rerun covers cancelled-reversal replacement,
exact original offset and migration repeatability. Three ordinary unit skips predate this
foundation. Checkpoint `checkpoint-before-native-accounting-foundation-2026-10-10`
is preserved remotely at `bec6dca8834d349f566b427fab4b3b0ed054e028`.
Fresh private archive SHA256
`30b6920259ebfda974bff75e2e99a03c276a4cc798c81c7fcbf2ed639ba8b76b`
passed a full isolated restore and62-table financial baseline comparison. It
covers database schema/data, not external document storage or service secrets.

Use the existing isolated Railway database, new run-owned schemas and no duplicate
live records. Test migration twice, rollback, decimal boundaries, API-service
authorization, inactive and unapproved books, balance/immutability at the database,
concurrent retries, conflicting payloads, close/post serialization and reversal.
Also run existing accounting source regressions and the complete build.

These are infrastructure acceptance tests, not accountant certification or full
GL/Trial Balance/Balance Sheet user interfaces. Steps7-12 remain separate.
No source adapter, production grant, historical backfill or cutover is authorised
by implementing Step6. Reviewed policy plus named grants and a separate activation
decision are still needed.

Accounting rationale: balanced adjustments preserve double entry; balance alone
does not prove source completeness. See [ACCA adjustments guidance](https://www.accaglobal.com/gb/en/student/exam-support-resources/fundamentals-exams-study-resources/f3/technical-articles/adjustments-financial-statements.html).
