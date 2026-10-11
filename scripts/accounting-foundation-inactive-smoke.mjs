// Safe deployed-bundle acceptance: no credentials, database connection or writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { NativeAccounting, accountingEnabled, buildSettlementJournal, previewOpeningBalances } =
  createRequire(import.meta.url)("../artifacts/api-server/dist/accounting-foundation.cjs");
assert.equal(accountingEnabled(), false, "This smoke is for an INACTIVE release only");
assert.notEqual(process.env.NATIVE_ACCOUNTING_SCHEMA_ENABLED, "true", "Live schema must remain inactive");
const mapping = { currency: "NGN", policyVersion: "smoke-only", evidence: "Dummy smoke mapping, never official",
  bankAccounts: { "7": 101 }, receivableAccountId: 110, depositLiabilityAccountId: 210 };
const source = { kind: "client_deposit", id: 4, branchId: 2, clientId: 8, accountingDate: "2026-10-11",
  amount: "100.00", paymentMethod: "transfer", bankId: 7 };
assert.equal(buildSettlementJournal(1, source, mapping).cashMovement, "100.00");
assert.equal(buildSettlementJournal(1, { ...source, kind: "invoice_payment", id: 9, entryType: "payment",
  amount: "30.00", sourceDepositId: 4, paymentMethod: "deposit", bankId: null }, mapping).cashMovement, "0.00");
assert.throws(() => buildSettlementJournal(1, { ...source, kind: "invoice_payment", entryType: "payment", paymentMethod: "credit" }, mapping));
assert.equal(previewOpeningBalances({ bookId: 1, branchId: 2, currency: "NGN", cutoverDate: "2026-10-11",
  policyVersion: "smoke-only", strategy: "opening_balances_forward", ownerEvidence: "Dummy owner",
  accountantEvidence: "Dummy accountant", sourceCoverageEvidence: "Dummy coverage", lines: [
    { accountId: 101, debit: "100.00", credit: "0" }, { accountId: 210, debit: "0", credit: "100.00" },
  ] }).status, "preview_only");
let connections = 0;
const engine = new NativeAccounting({ connect: async () => { connections++; throw new Error("Smoke must not connect"); } });
for (const method of ["previewSettlement", "prepareSettlement"])
  await assert.rejects(() => engine[method](1, 2, 3, { kind: "client_deposit", id: 4 }, mapping), { code: "ACCOUNTING_DISABLED" });
assert.equal(connections, 0);
console.log("PASS: deployed inactive accounting bundle, settlement/opening previews, posting gates; zero database connections/writes");
