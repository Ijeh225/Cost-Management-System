import { createHash } from "node:crypto";
import { accountingDate, minorToMoney, moneyToMinor, requireAccounting } from "./accounting-rules.js";
import { buildReviewedOpening, type ReviewedOpening } from "./accounting-reviewed-opening.js";
import { stableEvidence } from "./accounting-operational-mapping.js";

export interface OpeningSetupRequest {
  requestId: string;
  cutoverDate: string;
  policyVersion: string;
  ownerEvidence: string;
  accountantEvidence: string;
  sourceCoverageEvidence: string;
  balances: { accountId: number; debit: string; credit: string; evidence: string }[];
}
export interface OpeningAccount { id: number; code: string; name: string; category: string; active: boolean }

export function buildOpeningSetup(bookId: number, branchId: number, currency: string,
  request: OpeningSetupRequest, chart: OpeningAccount[]) {
  requireAccounting(/^[a-zA-Z0-9_-]{8,80}$/.test(request.requestId), "INVALID_REQUEST", "Stable opening request identity required");
  accountingDate(request.cutoverDate);
  for (const field of [request.policyVersion, request.ownerEvidence, request.accountantEvidence, request.sourceCoverageEvidence])
    requireAccounting(typeof field === "string" && field.trim().length > 0 && field.length <= 500,
      "EVIDENCE_REQUIRED", "Actual policy, owner, accounts and source-coverage references required (maximum 500 characters each)");
  requireAccounting(chart.length > 0 && chart.length <= 200 && Array.isArray(request.balances) && request.balances.length === chart.length
    && new Set(request.balances.map(b => b.accountId)).size === chart.length,
  "OPENING_INCOMPLETE", "Enter every chart account, including explicit zero balances (maximum 200 accounts)");
  const accounts = [...chart].sort((a,b) => a.id-b.id);
  const balances = request.balances.map(row => {
    const account = accounts.find(a => a.id === row.accountId);
    const debit = moneyToMinor(row.debit), credit = moneyToMinor(row.credit);
    requireAccounting(account && (debit === 0n || credit === 0n) && (account.active || debit + credit === 0n),
      "INVALID_ACCOUNT", "One opening side per own-book account; inactive accounts must have zero balances");
    requireAccounting(typeof row.evidence === "string" && row.evidence.trim().length > 0 && row.evidence.length <= 500,
      "EVIDENCE_REQUIRED", "Supporting reference required for every account, including verified zeros");
    return { accountId: row.accountId, debit: minorToMoney(debit), credit: minorToMoney(credit), evidence: row.evidence.trim() };
  }).sort((a,b) => a.accountId-b.accountId);
  const debit = balances.reduce((n,b) => n+moneyToMinor(b.debit),0n), credit = balances.reduce((n,b) => n+moneyToMinor(b.credit),0n);
  requireAccounting(debit === credit, "UNBALANCED", "Opening debits and credits must balance exactly; never insert an invented balancing amount");
  const canonical = { ...request, policyVersion: request.policyVersion.trim(), ownerEvidence: request.ownerEvidence.trim(),
    accountantEvidence: request.accountantEvidence.trim(), sourceCoverageEvidence: request.sourceCoverageEvidence.trim(), balances };
  const nonzero = balances.filter(b => b.debit !== "0.00" || b.credit !== "0.00");
  const review: ReviewedOpening | null = nonzero.length ? { bookId, branchId, currency, cutoverDate: request.cutoverDate,
    policyVersion: canonical.policyVersion, strategy: "opening_balances_forward", ownerEvidence: canonical.ownerEvidence,
    accountantEvidence: canonical.accountantEvidence, sourceCoverageEvidence: canonical.sourceCoverageEvidence,
    requestId: request.requestId, lines: nonzero.map(({accountId,debit,credit}) => ({accountId,debit,credit})), controls: nonzero } : null;
  if (review) buildReviewedOpening(review);
  const payload = { request: canonical, chart: accounts, review };
  return { payload, hash: createHash("sha256").update(stableEvidence(payload)).digest("hex"), review,
    debitTotal: minorToMoney(debit), creditTotal: minorToMoney(credit), zero: debit === 0n };
}
