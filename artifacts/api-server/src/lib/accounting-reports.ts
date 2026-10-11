import { accountingDate, minorToMoney, requireAccounting } from "./accounting-rules.js";

export interface ReportAccount { id: number; code: string; name: string; category: string; active: boolean }
export interface ReportLine {
  id: number; journalId: number; branchId: number; accountId: number; date: string;
  status: string; kind: string; eventKey: string; narration: string; memo: string;
  debitMinor: string; creditMinor: string;
}
export interface ReportFilter { from: string; to: string; accountId?: number; periodId?: number; includeZero: boolean; includeInactive: boolean }
export function validateReportFilter(filter: ReportFilter) {
  accountingDate(filter.from); accountingDate(filter.to);
  requireAccounting(filter.from <= filter.to, "INVALID_DATE", "From date must not follow the as-of date");
  for (const id of [filter.accountId, filter.periodId]) requireAccounting(id === undefined || Number.isSafeInteger(id) && id > 0,
    "INVALID_FILTER", "Account and period must be positive IDs");
  requireAccounting(typeof filter.includeZero === "boolean" && typeof filter.includeInactive === "boolean", "INVALID_FILTER", "Explicit account visibility required");
}
function sides(net: bigint) { return { debit: minorToMoney(net > 0n ? net : 0n), credit: minorToMoney(net < 0n ? -net : 0n) }; }

// All calculations use minor-unit integers; openings include ALL earlier periods.
export function buildAccountingReport(accounts: ReportAccount[], facts: ReportLine[], filter: ReportFilter, kind: "general-ledger" | "trial-balance") {
  validateReportFilter(filter);
  requireAccounting(new Set(accounts.map(a => a.id)).size === accounts.length, "INVALID_ACCOUNT", "Distinct chart accounts required");
  if (filter.accountId) requireAccounting(accounts.some(a => a.id === filter.accountId), "NOT_FOUND", "Account not found in this book");
  const valid = facts.filter(f => f.status === "posted" && f.date <= filter.to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.journalId - b.journalId || a.id - b.id);
  const chart = new Set(accounts.map(a => a.id));
  requireAccounting(valid.every(f => chart.has(f.accountId)), "INVALID_ACCOUNT", "Journal line is outside the book chart");
  const groups = new Map<number, ReportLine[]>();
  for (const fact of valid) { const group = groups.get(fact.accountId) ?? []; group.push(fact); groups.set(fact.accountId, group); }
  let openingDebit = 0n, openingCredit = 0n, periodDebit = 0n, periodCredit = 0n, closingDebit = 0n, closingCredit = 0n;
  const rows = accounts.filter(a => !filter.accountId || a.id === filter.accountId).sort((a, b) => a.code.localeCompare(b.code) || a.id - b.id).flatMap(account => {
    const all = groups.get(account.id) ?? [];
    const earlier = all.filter(f => f.date < filter.from);
    const movement = all.filter(f => f.date >= filter.from);
    const opening = earlier.reduce((n, f) => n + BigInt(f.debitMinor) - BigInt(f.creditMinor), 0n);
    const debit = movement.reduce((n, f) => n + BigInt(f.debitMinor), 0n);
    const credit = movement.reduce((n, f) => n + BigInt(f.creditMinor), 0n);
    const closing = opening + debit - credit;
    // Never hide an inactive account with posted history just because it is inactive.
    if (!account.active && !filter.includeInactive && all.length === 0) return [];
    if (!filter.includeZero && opening === 0n && debit === 0n && credit === 0n && closing === 0n) return [];
    openingDebit += opening > 0n ? opening : 0n; openingCredit += opening < 0n ? -opening : 0n;
    periodDebit += debit; periodCredit += credit;
    closingDebit += closing > 0n ? closing : 0n; closingCredit += closing < 0n ? -closing : 0n;
    let running = opening;
    const entries = kind === "general-ledger" ? movement.map(f => {
      running += BigInt(f.debitMinor) - BigInt(f.creditMinor);
      return { id: f.id, journalId: f.journalId, branchId: f.branchId, date: f.date, kind: f.kind,
        eventKey: f.eventKey, narration: f.narration, memo: f.memo,
        debit: minorToMoney(f.debitMinor), credit: minorToMoney(f.creditMinor), balance: minorToMoney(running) };
    }) : [];
    return [{ ...account, opening: minorToMoney(opening), openingSides: sides(opening), debit: minorToMoney(debit), credit: minorToMoney(credit),
      closing: minorToMoney(closing), closingSides: sides(closing), entries }];
  });
  const totals = { openingDebit: minorToMoney(openingDebit), openingCredit: minorToMoney(openingCredit),
    debit: minorToMoney(periodDebit), credit: minorToMoney(periodCredit), closingDebit: minorToMoney(closingDebit), closingCredit: minorToMoney(closingCredit),
    openingDifference: minorToMoney(openingDebit - openingCredit), movementDifference: minorToMoney(periodDebit - periodCredit),
    closingDifference: minorToMoney(closingDebit - closingCredit) };
  return { kind, basis: "posted_double_entry" as const, filter, rows, totals,
    balanced: openingDebit === openingCredit && periodDebit === periodCredit && closingDebit === closingCredit };
}
