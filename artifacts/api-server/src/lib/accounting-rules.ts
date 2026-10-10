import { createHash } from "node:crypto";

export const ACCOUNTING_PERMISSIONS = ["read", "configure", "prepare", "post", "reverse", "close", "reopen"] as const;
export type AccountingPermission = typeof ACCOUNTING_PERMISSIONS[number];
export const ACCOUNTING_POLICY_KEYS = ["legalEntity", "financialYearEnd", "cutoverDate", "revenueRecognition",
  "clientDeposits", "passThroughCosts", "vat", "unpaidExpenses", "creditNotes", "badDebts", "assetsAndAdvances",
  "loansAndFunding", "branchAccounting", "openingBalances"] as const;

// Proposal only: not seeded or approved by a deployment.
export const DRAFT_CHART_VERSION = "native-draft-1";
export const DRAFT_CHART = [
  ["1000", "Cash", "asset"], ["1010", "Bank accounts (one subaccount per bank)", "asset"],
  ["1100", "Trade receivables", "asset"], ["1120", "Recoverable client disbursements", "asset"],
  ["1200", "Staff/supplier advances", "asset"], ["1300", "Fixed assets", "asset"],
  ["1390", "Accumulated depreciation", "asset"], ["2000", "Trade payables", "liability"],
  ["2100", "Unapplied client deposits", "liability"], ["2200", "VAT/tax control", "liability"],
  ["2300", "Accrued expenses", "liability"], ["2400", "Borrowings", "liability"],
  ["3000", "Owner capital", "equity"], ["3100", "Retained earnings", "equity"],
  ["4000", "Clearing/service revenue", "income"], ["4100", "Other approved revenue", "income"],
  ["5000", "Company-borne direct job costs", "expense"], ["6000", "Overhead expense heads", "expense"],
  ["6100", "Bad debt expense", "expense"], ["6200", "Depreciation expense", "expense"],
] as const;

export class AccountingError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = "AccountingError"; }
}
export function requireAccounting(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AccountingError(code, message);
}
export function accountingEnabled() { return process.env.NATIVE_ACCOUNTING_ENABLED === "true"; }
export function requireAccountingEnabled() {
  requireAccounting(accountingEnabled(), "ACCOUNTING_DISABLED", "Native accounting is inactive; production cutover must be approved separately");
}
export function moneyToMinor(value: unknown): bigint {
  requireAccounting(typeof value === "string" && /^(0|[1-9]\d{0,15})(\.\d{1,2})?$/.test(value),
    "INVALID_MONEY", "Use a nonnegative decimal string with at most two decimal places, not a floating-point number");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
}
export function minorToMoney(value: bigint | string): string {
  const minor = BigInt(value); const sign = minor < 0n ? "-" : ""; const absolute = minor < 0n ? -minor : minor;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}
export function accountingDate(value: unknown): asserts value is string {
  const parsed = typeof value === "string" ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
  requireAccounting(typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number(value.slice(0, 4)) >= 1 && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value,
  "INVALID_DATE", "A valid YYYY-MM-DD accounting date is required");
}
export function validatePolicy(policy: unknown): asserts policy is Record<typeof ACCOUNTING_POLICY_KEYS[number], string> {
  requireAccounting(policy && typeof policy === "object" && !Array.isArray(policy), "POLICY_REQUIRED", "Accountant-approved policy is required");
  for (const key of ACCOUNTING_POLICY_KEYS) requireAccounting(typeof (policy as Record<string, unknown>)[key] === "string"
    && ((policy as Record<string, string>)[key]?.trim().length ?? 0) > 0, "POLICY_REQUIRED", `Missing approved policy: ${key}`);
  accountingDate((policy as Record<string, string>).cutoverDate);
  const yearEnd = (policy as Record<string, string>).financialYearEnd;
  requireAccounting(typeof yearEnd === "string" && /^\d{2}-\d{2}$/.test(yearEnd), "POLICY_REQUIRED", "Financial year-end must be MM-DD");
  accountingDate(`2000-${yearEnd}`);
}
export interface JournalInput {
  bookId: number; branchId: number; currency: string; accountingDate: string;
  eventKey: string; narration: string; evidence: string;
  lines: { accountId: number; debit: string; credit: string; memo?: string }[];
}
export function normalizeJournal(input: JournalInput) {
  requireAccounting(Number.isSafeInteger(input.bookId) && input.bookId > 0 && Number.isSafeInteger(input.branchId) && input.branchId > 0,
    "INVALID_SCOPE", "Book and branch are required");
  accountingDate(input.accountingDate);
  requireAccounting(/^[A-Z]{3}$/.test(input.currency), "INVALID_CURRENCY", "Three-letter base currency is required");
  for (const key of ["eventKey", "narration", "evidence"] as const) requireAccounting(typeof input[key] === "string"
    && input[key].trim().length > 0 && input[key].length <= (key === "eventKey" ? 200 : 4000), "INVALID_JOURNAL", `${key} is required and must fit its limit`);
  requireAccounting(Array.isArray(input.lines) && input.lines.length >= 2 && input.lines.length <= 200,
    "INVALID_LINES", "Journal requires between two and 200 lines");
  const lines = input.lines.map(line => {
    requireAccounting(Number.isSafeInteger(line.accountId) && line.accountId > 0 && (line.memo === undefined || typeof line.memo === "string" && line.memo.length <= 1000),
      "INVALID_ACCOUNT", "Valid account and memo are required");
    const debit = moneyToMinor(line.debit); const credit = moneyToMinor(line.credit);
    requireAccounting((debit > 0n && credit === 0n) || (credit > 0n && debit === 0n), "INVALID_LINE", "Each line must have only one positive debit or credit");
    return { accountId: line.accountId, debitMinor: debit.toString(), creditMinor: credit.toString(), memo: line.memo?.trim() ?? "" };
  });
  requireAccounting(lines.reduce((sum, l) => sum + BigInt(l.debitMinor) - BigInt(l.creditMinor), 0n) === 0n,
    "UNBALANCED", "Total debit must equal total credit exactly");
  return { bookId: input.bookId, branchId: input.branchId, currency: input.currency, accountingDate: input.accountingDate,
    eventKey: input.eventKey.trim(), narration: input.narration.trim(), evidence: input.evidence.trim(), lines };
}
export function journalHash(journal: ReturnType<typeof normalizeJournal>) {
  return createHash("sha256").update(JSON.stringify(journal)).digest("hex");
}
