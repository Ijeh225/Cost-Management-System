// Safe deployed-bundle acceptance: no credentials, database connection or writes.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { NativeAccounting, accountingEnabled, buildSettlementJournal, previewOpeningBalances, buildInvoiceJournal, buildOperationalJournal, buildReviewedOpening, buildAccountingReport } =
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
const invoiceMapping = { currency: "NGN", policyVersion: "smoke-only", evidence: "Dummy invoice review",
  recognitionDate: "2026-10-11", recognitionEvidence: "Dummy date review", receivableAccountId: 110,
  items: [{ itemId: 1, splits: [{ accountId: 400, amount: "100", treatment: "income", evidence: "Dummy fee" }] }] };
assert.equal(buildInvoiceJournal(1, { kind: "invoice", id: 8, branchId: 2, clientId: 8, createdDate: "2026-10-11",
  subtotal: "100", vatAmount: "0", total: "100", items: [{ id: 1, containerId: null, amount: "100" }] }, invoiceMapping).cashMovement, "0.00");
assert.equal(previewOpeningBalances({ bookId: 1, branchId: 2, currency: "NGN", cutoverDate: "2026-10-11",
  policyVersion: "smoke-only", strategy: "opening_balances_forward", ownerEvidence: "Dummy owner",
  accountantEvidence: "Dummy accountant", sourceCoverageEvidence: "Dummy coverage", lines: [
    { accountId: 101, debit: "100.00", credit: "0" }, { accountId: 210, debit: "0", credit: "100.00" },
  ] }).status, "preview_only");
const operational={currency:"NGN",policyVersion:"smoke-only",evidence:"Dummy operational review",effect:"expense",accountId:500,
  bankAccounts:{"7":101},cashAccountId:102};
const fact={kind:"duty_payment",id:4,branchId:2,accountingDate:"2026-10-11",amount:"20.00",bankId:7,
  dependencies:[],facts:{paymentMethod:"transfer"}};
assert.equal(buildOperationalJournal(1,fact,operational).cashMovement,"-20.00");
assert.equal(buildOperationalJournal(1,{...fact,kind:"invoice_writeoff"},{...operational,effect:"writeoff",receivableAccountId:110}).cashMovement,"0.00");
assert.equal(buildOperationalJournal(1,{...fact,kind:"bank_transfer",fromBankId:7,toBankId:8},
  {...operational,effect:"transfer",bankAccounts:{"7":101,"8":102}}).cashMovement,"0.00");
const opening={bookId:1,branchId:2,currency:"NGN",cutoverDate:"2026-10-11",policyVersion:"smoke-only",
  strategy:"opening_balances_forward",ownerEvidence:"Dummy owner",accountantEvidence:"Dummy accountant",sourceCoverageEvidence:"Dummy controls",
  lines:[{accountId:101,debit:"100",credit:"0"},{accountId:210,debit:"0",credit:"100"}],
  controls:[{accountId:101,debit:"100",credit:"0",evidence:"Dummy bank"},{accountId:210,debit:"0",credit:"100",evidence:"Dummy liability"}]};
assert.equal(buildReviewedOpening(opening).status,"reviewed_draft");
let connections = 0;
const engine = new NativeAccounting({ connect: async () => { connections++; throw new Error("Smoke must not connect"); } });
for (const method of ["previewSettlement", "prepareSettlement"])
  await assert.rejects(() => engine[method](1, 2, 3, { kind: "client_deposit", id: 4 }, mapping), { code: "ACCOUNTING_DISABLED" });
for (const method of ["previewInvoice", "prepareInvoice"])
  await assert.rejects(() => engine[method](1, 2, 3, 8, invoiceMapping), { code: "ACCOUNTING_DISABLED" });
for(const method of ["previewOperational","prepareOperational"])
  await assert.rejects(()=>engine[method](1,2,3,{kind:"duty_payment",id:4},operational),{code:"ACCOUNTING_DISABLED"});
for(const method of ["previewOpening","prepareOpening"])
  await assert.rejects(()=>engine[method](3,opening),{code:"ACCOUNTING_DISABLED"});
await assert.rejects(()=>engine.reconcileSources(1,2,3,"2026-10-11",[]),{code:"ACCOUNTING_DISABLED"});
const reportFilter={from:"2026-10-11",to:"2026-10-11",includeZero:true,includeInactive:false};
await assert.rejects(()=>engine.reportCatalog(3,null),{code:"ACCOUNTING_DISABLED"});
await assert.rejects(()=>engine.reportOptions(1,2,3),{code:"ACCOUNTING_DISABLED"});
await assert.rejects(()=>engine.accountingReport(1,2,3,"trial-balance",reportFilter),{code:"ACCOUNTING_DISABLED"});
await assert.rejects(()=>engine.reportJournal(1,2,3,4),{code:"ACCOUNTING_DISABLED"});
const reportAccounts=[{id:101,code:"1000",name:"Dummy asset",category:"asset",active:true},
  {id:210,code:"2100",name:"Dummy liability",category:"liability",active:true}];
const reportLines=reportAccounts.map((account,index)=>({id:index+1,journalId:1,branchId:2,accountId:account.id,
  date:"2026-10-11",status:"posted",kind:"opening",eventKey:"smoke:dummy",narration:"Dummy only",memo:null,
  debitMinor:index===0?30n:0n,creditMinor:index===1?30n:0n}));
const tb=buildAccountingReport(reportAccounts,reportLines,reportFilter,"trial-balance");
const gl=buildAccountingReport(reportAccounts,reportLines,reportFilter,"general-ledger");
assert.equal(tb.totals.debit,"0.30");assert.equal(tb.totals.credit,"0.30");assert.equal(tb.balanced,true);
assert.deepEqual(tb.totals,gl.totals);
assert.equal(connections, 0);
console.log("PASS: deployed inactive accounting bundle, settlement/invoice/operational/opening previews, exact GL/TB, report/reconciliation/posting gates; zero database connections/writes");
