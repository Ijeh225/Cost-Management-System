import { describe, expect, it } from "vitest";
import { buildSettlementJournal, previewOpeningBalances, settlementEventKey, type SettlementSource } from "../lib/accounting-source-mapping";
import { journalHash, normalizeJournal } from "../lib/accounting-rules";

const mapping = { currency: "NGN" as const, policyVersion: "test-only-v1", evidence: "Reviewed dummy mapping",
  bankAccounts: { "7": 101 }, cashAccountId: 100, receivableAccountId: 110, depositLiabilityAccountId: 210 };
const deposit: SettlementSource = { kind: "client_deposit", id: 4, branchId: 2, clientId: 8,
  accountingDate: "2026-10-11", amount: "100.00", paymentMethod: "transfer", bankId: 7 };
const payment: SettlementSource = { ...deposit, kind: "invoice_payment", id: 9, entryType: "payment" };
describe("Step7 settlement mapping - no automatic posting", () => {
  it("records a deposit receipt against liability, never income", () => {
    const draft = buildSettlementJournal(1, deposit, mapping);
    expect(draft.input.lines).toEqual([{ accountId: 101, debit: "100.00", credit: "0" }, { accountId: 210, debit: "0", credit: "100.00" }]);
    expect(draft.cashMovement).toBe("100.00");
  });
  it("allocates a partial deposit to AR without a second cash receipt", () => {
    const draft = buildSettlementJournal(1, { ...payment, amount: "30.00", sourceDepositId: 4, paymentMethod: "deposit", bankId: null }, mapping);
    expect(draft.input.lines).toEqual([{ accountId: 210, debit: "30.00", credit: "0" }, { accountId: 110, debit: "0", credit: "30.00" }]);
    expect(draft.cashMovement).toBe("0.00");
  });
  it("settles real cash against AR and requires a cash account explicitly", () => {
    expect(buildSettlementJournal(1, payment, mapping).input.lines[1]!.accountId).toBe(110);
    expect(buildSettlementJournal(1, { ...payment, paymentMethod: "cash", bankId: null }, mapping).input.lines[0]!.accountId).toBe(100);
    expect(() => buildSettlementJournal(1, { ...payment, paymentMethod: "cash", bankId: null }, { ...mapping, cashAccountId: undefined })).toThrow();
  });
  it.each(["credit", "credit_note", "deposit", "unknown"])("does not turn %s into bank income", method => {
    expect(() => buildSettlementJournal(1, { ...payment, paymentMethod: method }, mapping)).toThrow();
  });
  it("reverses allocation without cash, and real receipt with negative cash movement", () => {
    const reverse = { ...payment, amount: "-100.00", entryType: "reversal", reversalOfId: 8 };
    const cash = buildSettlementJournal(1, reverse, mapping);
    expect(cash.input.lines.map(line => line.accountId)).toEqual([110, 101]);
    expect(cash.cashMovement).toBe("-100.00");
    const allocation = buildSettlementJournal(1, { ...reverse, sourceDepositId: 4, paymentMethod: "deposit", bankId: null }, mapping);
    expect(allocation.input.lines.map(line => line.accountId)).toEqual([110, 210]);
    expect(allocation.cashMovement).toBe("0.00");
  });
  it("rejects unsafe money, wrong sign, unlinked reversal and ambiguous bank evidence", () => {
    for (const patch of [{ amount: "0" }, { amount: "0.001" }, { amount: "-1" }, { amount: "1", entryType: "reversal", reversalOfId: 8 },
      { amount: "-1", entryType: "reversal" }, { bankId: null }, { bankId: 999 }, { paymentMethod: "cash" }])
      expect(() => buildSettlementJournal(1, { ...payment, ...patch }, mapping)).toThrow();
    expect(() => buildSettlementJournal(1, payment, { ...mapping, receivableAccountId: 101 })).toThrow("must differ");
    expect(() => buildSettlementJournal(1, payment, { ...mapping, evidence: "" })).toThrow();
  });
  it("uses one money-fact identity regardless of B/L/container item counts", () => {
    expect(settlementEventKey(payment)).toBe("source:invoice_payment:9:v1");
    const first = buildSettlementJournal(1, payment, mapping).input;
    const retry = buildSettlementJournal(1, { ...payment, amount: "100.0" }, mapping).input;
    expect(journalHash(normalizeJournal(first))).toBe(journalHash(normalizeJournal(retry)));
    const changed = buildSettlementJournal(1, payment, { ...mapping, bankAccounts: { "7": 102 } }).input;
    expect(changed.eventKey).toBe(first.eventKey);
    expect(journalHash(normalizeJournal(changed))).not.toBe(journalHash(normalizeJournal(first)));
  });
});

const opening = { bookId: 1, branchId: 2, currency: "NGN", cutoverDate: "2026-10-11", policyVersion: "test-v1",
  strategy: "opening_balances_forward" as const, ownerEvidence: "Dummy owner", accountantEvidence: "Dummy accountant",
  sourceCoverageEvidence: "Dummy dated reconciliations, not live balances", lines: [
    { accountId: 101, debit: "300.00", credit: "0" }, { accountId: 300, debit: "0", credit: "300.00" }] };
describe("Step7 openings preview", () => {
  it("validates exact balanced explicit openings with evidence and no guessed plug", () => {
    expect(previewOpeningBalances(opening)).toMatchObject({ status: "preview_only", debitTotal: "300.00", creditTotal: "300.00" });
    expect(previewOpeningBalances(opening).input.eventKey).toBe("opening:branch:2:v1");
  });
  it("requires separate opening/cutover review and refuses historical-plus-opening strategy", () => {
    expect(() => previewOpeningBalances({ ...opening, accountantEvidence: "" })).toThrow();
    expect(() => previewOpeningBalances({ ...opening, strategy: "historical_import" as any })).toThrow("combine");
    expect(() => previewOpeningBalances({ ...opening, lines: [{ ...opening.lines[0]!, debit: "301.00" }, opening.lines[1]!] })).toThrow("equal");
  });
});
