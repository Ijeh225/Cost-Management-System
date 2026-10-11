import { accountingDate, minorToMoney, moneyToMinor, normalizeJournal, requireAccounting, type JournalInput } from "./accounting-rules.js";

export type AccountingSettlementRef = { kind: "client_deposit" | "invoice_payment"; id: number };
export interface SettlementSource extends AccountingSettlementRef {
  branchId: number; clientId: number; accountingDate: string; amount: string;
  paymentMethod: string; bankId: number | null; sourceDepositId?: number | null;
  reversalOfId?: number | null; entryType?: string;
}
export interface SettlementMapping {
  currency: "NGN"; policyVersion: string; evidence: string;
  bankAccounts: Record<string, number>; cashAccountId?: number;
  receivableAccountId: number; depositLiabilityAccountId: number;
}

export function settlementEventKey(ref: AccountingSettlementRef) {
  requireAccounting(["client_deposit", "invoice_payment"].includes(ref.kind)
    && Number.isSafeInteger(ref.id) && ref.id > 0, "INVALID_SOURCE", "Supported source type and positive ID required");
  // Identity belongs to the money fact, never to an invoice item or B/L container.
  return `source:${ref.kind}:${ref.id}:v1`;
}

export function buildSettlementJournal(bookId: number, source: SettlementSource, mapping: SettlementMapping) {
  const eventKey = settlementEventKey(source);
  accountingDate(source.accountingDate);
  requireAccounting(typeof source.amount === "string" && typeof source.paymentMethod === "string",
    "INVALID_SOURCE", "Decimal source amount and explicit payment method required");
  requireAccounting(Number.isSafeInteger(source.clientId) && source.clientId > 0, "SOURCE_REVIEW_REQUIRED", "Linked client required");
  requireAccounting(mapping.currency === "NGN" && typeof mapping.policyVersion === "string" && mapping.policyVersion.trim().length > 0
    && typeof mapping.evidence === "string" && mapping.evidence.trim().length > 0,
  "MAPPING_REQUIRED", "Explicit source currency, approved policy version and mapping evidence required");
  const reversal = source.entryType === "reversal";
  const negative = source.amount.startsWith("-");
  const amount = moneyToMinor(negative ? source.amount.slice(1) : source.amount);
  requireAccounting(amount > 0n && (source.kind === "client_deposit" ? !negative && !reversal
    : ["payment", "reversal"].includes(source.entryType ?? "") && negative === reversal
      && (!reversal || Number.isSafeInteger(source.reversalOfId) && source.reversalOfId! > 0)),
  "INVALID_SOURCE", "Positive original or linked negative reversal required");
  const method = source.paymentMethod.trim().toLowerCase();
  const allocation = source.kind === "invoice_payment" && source.sourceDepositId != null;
  let debitAccountId: number;
  let creditAccountId: number;
  if (allocation) {
    requireAccounting(method === "deposit" && Number.isSafeInteger(source.sourceDepositId) && source.sourceDepositId! > 0,
      "SOURCE_REVIEW_REQUIRED", "Only an explicitly linked deposit allocation is supported");
    debitAccountId = mapping.depositLiabilityAccountId;
    creditAccountId = mapping.receivableAccountId;
  } else {
    requireAccounting(!["credit", "credit_note", "deposit"].includes(method), "SOURCE_REVIEW_REQUIRED",
      "Credits, credit-note adjustments and unlinked allocations are not cash receipts; use their own reviewed adapter");
    if (method === "cash") {
      requireAccounting(source.bankId === null, "SOURCE_REVIEW_REQUIRED", "Cash source unexpectedly has a bank; review source evidence");
      debitAccountId = mapping.cashAccountId!;
    } else {
      requireAccounting(["transfer", "bank_transfer", "cheque", "pos"].includes(method) && source.bankId !== null,
        "SOURCE_REVIEW_REQUIRED", "Supported payment method and explicit bank required; no bank inferred from narration");
      debitAccountId = mapping.bankAccounts?.[String(source.bankId)]!;
    }
    creditAccountId = source.kind === "client_deposit" ? mapping.depositLiabilityAccountId : mapping.receivableAccountId;
  }
  requireAccounting(debitAccountId !== creditAccountId, "INVALID_MAPPING", "Settlement control accounts must differ");
  const debit = reversal ? creditAccountId : debitAccountId;
  const credit = reversal ? debitAccountId : creditAccountId;
  const input: JournalInput = { bookId, branchId: source.branchId, currency: mapping.currency,
    accountingDate: source.accountingDate, eventKey, narration: `${allocation ? "Deposit allocation" : "Cash settlement"}: ${source.kind} #${source.id}`,
    evidence: JSON.stringify({ policyVersion: mapping.policyVersion, mappingEvidence: mapping.evidence.trim(), mapping,
      source: { ...source, amount: `${negative ? "-" : ""}${minorToMoney(amount)}` } }),
    lines: [{ accountId: debit, debit: minorToMoney(amount), credit: "0" },
      { accountId: credit, debit: "0", credit: minorToMoney(amount) }] };
  normalizeJournal(input);
  return { input, allocation, reversal, debitAccountId, creditAccountId,
    cashMovement: allocation ? "0.00" : minorToMoney(reversal ? -amount : amount) };
}

export interface OpeningBalanceReview {
  bookId: number; branchId: number; currency: string; cutoverDate: string; policyVersion: string;
  strategy: "opening_balances_forward"; ownerEvidence: string; accountantEvidence: string;
  sourceCoverageEvidence: string; lines: JournalInput["lines"];
}
// Validation only: no source snapshots are converted into official opening balances.
export function previewOpeningBalances(review: OpeningBalanceReview) {
  requireAccounting(review.strategy === "opening_balances_forward", "CUTOVER_CONFLICT", "Do not combine historical import and openings");
  for (const evidence of [review.policyVersion, review.ownerEvidence, review.accountantEvidence, review.sourceCoverageEvidence])
    requireAccounting(typeof evidence === "string" && evidence.trim().length > 0, "APPROVAL_REQUIRED", "Opening review and source coverage evidence required");
  const input: JournalInput = { bookId: review.bookId, branchId: review.branchId, currency: review.currency,
    accountingDate: review.cutoverDate, eventKey: `opening:branch:${review.branchId}:v1`, narration: "Reviewed opening balances - preview only",
    evidence: JSON.stringify({ policyVersion: review.policyVersion, strategy: review.strategy, owner: review.ownerEvidence,
      accountant: review.accountantEvidence, coverage: review.sourceCoverageEvidence }), lines: review.lines };
  const normalized = normalizeJournal(input);
  return { input, debitTotal: minorToMoney(normalized.lines.reduce((sum, line) => sum + BigInt(line.debitMinor), 0n)),
    creditTotal: minorToMoney(normalized.lines.reduce((sum, line) => sum + BigInt(line.creditMinor), 0n)),
    status: "preview_only" as const };
}
