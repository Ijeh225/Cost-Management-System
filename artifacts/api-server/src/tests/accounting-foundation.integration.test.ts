import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { ensureAccountingFoundationSchema } from "../lib/accounting-schema";
import { NativeAccounting } from "../lib/native-accounting";
import { ACCOUNTING_POLICY_KEYS, type JournalInput } from "../lib/accounting-rules";
import { previewOpeningBalances } from "../lib/accounting-source-mapping";
import type { InvoiceAccountingMapping } from "../lib/accounting-invoice-mapping";
import type { OperationalMapping,OperationalRef } from "../lib/accounting-operational-mapping";
import type { ReviewedOpening } from "../lib/accounting-reviewed-opening";
import type { ManualAdjustment } from "../lib/accounting-manual";
import type { TaxConfiguration } from "../lib/accounting-tax";

const schema = `acct_foundation_${Date.now()}_${randomBytes(4).toString("hex")}`;
const previousEnabled = process.env.NATIVE_ACCOUNTING_ENABLED;
const database = { connect: async () => {
  const client = await pool.connect();
  await client.query(`SET search_path TO "${schema}",public`);
  return client;
} };
const service = new NativeAccounting(database as Pick<typeof pool, "connect">);
async function sql(text: string, values: unknown[] = []) {
  const client = await database.connect();
  try { return await client.query(text, values); } finally { client.release(); }
}
const baselineSql = `SELECT jsonb_build_object('invoicePayments',(SELECT count(*) FROM public.invoice_payments),
  'deposits',(SELECT coalesce(sum(amount),0) FROM public.client_deposits),
  'payments',(SELECT coalesce(sum(amount),0) FROM public.payment_schedule_payments),
  'duties',(SELECT coalesce(sum(amount),0) FROM public.duty_payment_transactions),
  'containerCosts',(SELECT coalesce(sum(amount),0) FROM public.container_expense_payments),
  'overheads',(SELECT coalesce(sum(amount),0) FROM public.overhead_expenses),
  'topups',(SELECT coalesce(sum(amount),0) FROM public.overhead_expense_topups),
  'billPayments',(SELECT coalesce(sum(amount),0) FROM public.expense_payments),
  'funding',(SELECT coalesce(sum(amount),0) FROM public.bank_fund_additions),
  'transfers',(SELECT coalesce(sum(amount),0) FROM public.bank_transfers),
  'creditNotes',(SELECT coalesce(sum(amount),0) FROM public.credit_notes)) baseline`;
let baseline: unknown;
beforeAll(async () => {
  expect((await pool.query("SELECT current_database() name")).rows[0].name).toBe("cost_management_integration_test");
  console.info(`Owned foundation namespace: ${schema}`);
  baseline = (await pool.query(baselineSql)).rows[0].baseline;
  process.env.NATIVE_ACCOUNTING_ENABLED = "true";
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await sql(`CREATE TABLE branches(id SERIAL PRIMARY KEY,name TEXT NOT NULL);
    CREATE TABLE users(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL REFERENCES branches(id),name TEXT,
    authority_level TEXT,job_function TEXT,workspace_access TEXT,access_profile_migrated_at TIMESTAMPTZ,is_active BOOLEAN NOT NULL DEFAULT true)`);
  await sql(`CREATE TABLE clients(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL);
    CREATE TABLE banks(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL);
    CREATE TABLE invoices(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL,client_id INTEGER,status TEXT NOT NULL,
      total NUMERIC(15,2) NOT NULL,written_off_amount NUMERIC(15,2),subtotal NUMERIC(15,2) NOT NULL DEFAULT 0,
      vat_amount NUMERIC(15,2) NOT NULL DEFAULT 0,created_at TIMESTAMP NOT NULL DEFAULT '2026-10-09 10:00:00',updated_at TIMESTAMP,invoice_number TEXT);
    CREATE TABLE containers(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL,bl_number TEXT NOT NULL);
    CREATE TABLE invoice_items(id SERIAL PRIMARY KEY,invoice_id INTEGER NOT NULL,branch_id INTEGER NOT NULL,
      container_id INTEGER,amount NUMERIC(15,2) NOT NULL);
    CREATE TABLE credit_notes(id SERIAL PRIMARY KEY,invoice_id INTEGER NOT NULL,status TEXT NOT NULL,branch_id INTEGER,
      amount NUMERIC(15,2) DEFAULT 1,credit_note_number TEXT,reason TEXT,created_at TIMESTAMP DEFAULT '2026-10-10 12:00:00');
    CREATE TABLE client_deposits(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL,client_id INTEGER NOT NULL,
      amount NUMERIC(15,2) NOT NULL,bank_id INTEGER,payment_method TEXT NOT NULL,notes TEXT,created_at TIMESTAMP NOT NULL);
    CREATE TABLE invoice_payments(id SERIAL PRIMARY KEY,branch_id INTEGER NOT NULL,invoice_id INTEGER NOT NULL,
      amount NUMERIC(15,2) NOT NULL,paid_at TIMESTAMP NOT NULL,bank_id INTEGER,payment_method TEXT NOT NULL,
      source_deposit_id INTEGER,entry_type TEXT NOT NULL DEFAULT 'payment',reversal_of_payment_id INTEGER,reference TEXT);
    CREATE TABLE invoice_audit_log(id SERIAL PRIMARY KEY,invoice_id INTEGER,branch_id INTEGER,action TEXT,details TEXT,created_at TIMESTAMP);
    CREATE TABLE duty_payment_transactions(id SERIAL PRIMARY KEY,branch_id INTEGER,container_id INTEGER,bank_id INTEGER,amount NUMERIC(15,2),
      payment_method TEXT,paid_at TIMESTAMP,entry_type TEXT,reference TEXT,narration TEXT,reversal_of_transaction_id INTEGER);
    CREATE TABLE container_expense_payments(id SERIAL PRIMARY KEY,branch_id INTEGER,container_id INTEGER,bank_id INTEGER,amount NUMERIC(15,2),
      payment_method TEXT,paid_at TIMESTAMP,section TEXT,category_id INTEGER,notes TEXT);
    CREATE TABLE overhead_expenses(id SERIAL PRIMARY KEY,branch_id INTEGER,category TEXT,description TEXT,amount NUMERIC(15,2),reference TEXT,created_at TIMESTAMP,paid_at TIMESTAMP);
    CREATE TABLE overhead_expense_topups(id SERIAL PRIMARY KEY,branch_id INTEGER,expense_id INTEGER,amount NUMERIC(15,2),description TEXT,created_at TIMESTAMP);
    CREATE TABLE expense_payments(id SERIAL PRIMARY KEY,branch_id INTEGER,expense_id INTEGER,payment_schedule_id INTEGER,amount NUMERIC(15,2),
      payment_method TEXT,bank_id INTEGER,paid_at TIMESTAMP,notes TEXT);
    CREATE TABLE payment_schedules(id SERIAL PRIMARY KEY,branch_id INTEGER,overhead_expense_id INTEGER,amount_approved NUMERIC(15,2),status TEXT);
    CREATE TABLE payment_schedule_payments(id SERIAL PRIMARY KEY,branch_id INTEGER,schedule_id INTEGER,amount NUMERIC(15,2),bank_id INTEGER,
      payment_method TEXT,paid_at TIMESTAMP,classification TEXT,classification_reason TEXT,classified_at TIMESTAMP,classification_version INTEGER,expense_head TEXT,reference TEXT);
    CREATE TABLE bank_fund_additions(id SERIAL PRIMARY KEY,branch_id INTEGER,bank_id INTEGER,amount NUMERIC(15,2),created_at TIMESTAMP,reference TEXT,narration TEXT);
    CREATE TABLE bank_transfers(id SERIAL PRIMARY KEY,branch_id INTEGER,from_bank_id INTEGER,to_bank_id INTEGER,amount NUMERIC(15,2),created_at TIMESTAMP,reference TEXT,narration TEXT)`);
  await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
});

async function settlementFixture() {
  const f = await fixture();
  const ar = await service.addAccount(f.book, f.branch, f.owner, "1100", "Dummy AR", "asset");
  const client = (await sql("INSERT INTO clients(branch_id) VALUES($1) RETURNING id", [f.branch])).rows[0].id;
  const bank = (await sql("INSERT INTO banks(branch_id) VALUES($1) RETURNING id", [f.branch])).rows[0].id;
  const invoice = (await sql("INSERT INTO invoices(branch_id,client_id,status,total) VALUES($1,$2,'sent',100) RETURNING id", [f.branch, client])).rows[0].id;
  const deposit = (await sql(`INSERT INTO client_deposits(branch_id,client_id,amount,bank_id,payment_method,created_at)
    VALUES($1,$2,100,$3,'transfer','2026-10-10 10:00:00') RETURNING id`, [f.branch, client, bank])).rows[0].id;
  const mapping = { currency: "NGN" as const, policyVersion: "isolated-only-v1", evidence: "Dummy reviewed source mapping; not production",
    bankAccounts: { [String(bank)]: f.debit }, cashAccountId: f.debit, receivableAccountId: ar, depositLiabilityAccountId: f.credit };
  return { ...f, ar, client, bank, invoice, deposit, mapping };
}
type SettlementFixture = Awaited<ReturnType<typeof settlementFixture>>;
async function settlementPayment(f: SettlementFixture, amount = "30.00", method = "transfer", sourceDeposit: number | null = null,
  original: number | null = null, date = "2026-10-10 11:00:00") {
  return (await sql(`INSERT INTO invoice_payments(branch_id,invoice_id,amount,paid_at,bank_id,payment_method,source_deposit_id,entry_type,reversal_of_payment_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [f.branch, f.invoice, amount, date,
    method === "transfer" ? f.bank : null, method, sourceDeposit, original ? "reversal" : "payment", original])).rows[0].id as number;
}
async function postDeposit(f: SettlementFixture) {
  const journal = await service.prepareSettlement(f.book, f.branch, f.preparer, { kind: "client_deposit", id: f.deposit }, f.mapping);
  return service.approveAndPost(f.book, f.branch, f.approver, journal.id, "Dummy independent source approval");
}

async function invoiceFixture() {
  const f = await settlementFixture();
  const income = await service.addAccount(f.book, f.branch, f.owner, "4000", "Dummy fee income", "income");
  const vat = await service.addAccount(f.book, f.branch, f.owner, "2200", "Dummy recorded tax", "liability");
  const containers = (await sql("INSERT INTO containers(branch_id,bl_number) VALUES($1,'DUMMY-SHARED-BL'),($1,'DUMMY-SHARED-BL') RETURNING id", [f.branch])).rows;
  await sql("UPDATE invoices SET subtotal=100,vat_amount=7.50,total=107.50 WHERE id=$1", [f.invoice]);
  const items = (await sql(`INSERT INTO invoice_items(invoice_id,branch_id,container_id,amount)
    VALUES($1,$2,$3,60),($1,$2,$4,40) RETURNING id,amount`, [f.invoice,f.branch,containers[0]!.id,containers[1]!.id])).rows;
  const invoiceMapping: InvoiceAccountingMapping = { currency: "NGN", policyVersion: "isolated-only-v1", evidence: "Dummy reviewed issued invoice; NOT production",
    recognitionDate: "2026-10-10", recognitionEvidence: "Dummy issue-date review", receivableAccountId: f.ar,
    vatAccountId: vat, vatEvidence: "Dummy recorded tax reviewed; no tax rate inferred",
    items: items.map(item=>({itemId:item.id,splits:[{accountId:income,amount:item.amount,treatment:"income",evidence:"Dummy fee allocation"}]})) };
  return { ...f, income, vat, items, containers, invoiceMapping };
}

async function operationalFixture() {
  const f=await fixture();
  const accounts=(await sql(`INSERT INTO accounting_accounts(book_id,code,name,category) VALUES
    ($1,'5000','Dummy expense','expense'),($1,'1010','Dummy second bank','asset'),($1,'3000','Dummy equity','equity'),
    ($1,'1200','Dummy advances','asset') RETURNING id`,[f.book])).rows;
  const [expense,secondBankAccount,equity,advance]=accounts.map(a=>a.id as number);
  const banks=(await sql("INSERT INTO banks(branch_id) VALUES($1),($1) RETURNING id",[f.branch])).rows;
  const container=(await sql("INSERT INTO containers(branch_id,bl_number) VALUES($1,'DUMMY-OPERATIONAL') RETURNING id",[f.branch])).rows[0].id;
  const mapping:OperationalMapping={currency:"NGN",policyVersion:"isolated-only-v1",evidence:"Dummy reviewed operational mapping; not production",
    effect:"expense",accountId:expense!,controlAccountId:f.credit,bankAccounts:{[banks[0]!.id]:f.debit,[banks[1]!.id]:secondBankAccount!},cashAccountId:f.debit};
  return {...f,expense:expense!,secondBankAccount:secondBankAccount!,equity:equity!,advance:advance!,bank:banks[0]!.id,secondBank:banks[1]!.id,container,mapping};
}
type OperationalFixture=Awaited<ReturnType<typeof operationalFixture>>;
async function postOperational(f:Fixture,ref:OperationalRef,mapping:OperationalMapping) {
  const draft=await service.prepareOperational(f.book,f.branch,f.preparer,ref,mapping);
  return service.approveAndPost(f.book,f.branch,f.approver,draft.id,"Dummy independent reviewed source approval");
}
async function balances(f:Fixture) {
  return new Map((await sql(`SELECT account_id,(sum(debit_minor)-sum(credit_minor))::text balance FROM accounting_journal_lines l
    JOIN accounting_journals j ON j.id=l.journal_id WHERE j.book_id=$1 AND j.status='posted' GROUP BY account_id`,[f.book])).rows.map(r=>[r.account_id,r.balance]));
}
async function standalone(f:OperationalFixture,classification="operating_expense",amount="10.00",bank=f.bank) {
  const schedule=(await sql("INSERT INTO payment_schedules(branch_id,amount_approved,status) VALUES($1,$2,'paid') RETURNING id",[f.branch,amount])).rows[0].id;
  return (await sql(`INSERT INTO payment_schedule_payments(branch_id,schedule_id,amount,bank_id,payment_method,paid_at,
    classification,classification_reason,classified_at,classification_version,expense_head)
    VALUES($1,$2,$3,$4,'transfer','2026-10-10 14:00:00',$5,'Dummy voucher','2026-10-10 14:01:00',1,'Dummy expense head') RETURNING id`,
    [f.branch,schedule,amount,bank,classification])).rows[0].id as number;
}
async function taxFixture() {
  const f=await operationalFixture();
  const input=await service.addAccount(f.book,f.branch,f.owner,"1400","Dummy input VAT","asset"),output=await service.addAccount(f.book,f.branch,f.owner,"2200","Dummy output VAT","liability");
  const shipping=await service.addAccount(f.book,f.branch,f.owner,"5010","Dummy shipping expense","expense"),terminal=await service.addAccount(f.book,f.branch,f.owner,"5020","Dummy terminal expense","expense");
  await service.grantAccess(f.book,f.branch,f.owner,f.approver,"configure","Dummy independent configuration reviewer");
  const request:TaxConfiguration={requestId:randomBytes(8).toString('hex'),policyVersion:"isolated-only-v1",effectiveFrom:"2026-10-01",ownerEvidence:"Dummy owner policy",accountantEvidence:"Dummy accountant policy",
    inputVatAccountId:input,outputVatAccountId:output,dutyAccountId:f.expense,shippingAccountId:shipping,terminalAccountId:terminal,
    codes:[{code:"STD",name:"Dummy taxable recoverable",treatment:"taxable",rate:"7.5",recoverablePercent:"100",basisEvidence:"Dummy approved taxable/recovery basis"},
      {code:"COST",name:"Dummy taxable in cost",treatment:"taxable",rate:"7.5",recoverablePercent:"0",basisEvidence:"Dummy cost basis"},
      {code:"MIXED",name:"Dummy 40 percent",treatment:"taxable",rate:"7.5",recoverablePercent:"40",basisEvidence:"Dummy apportionment"},
      {code:"EXEMPT",name:"Dummy exempt",treatment:"exempt",rate:"0",recoverablePercent:"0",basisEvidence:"Dummy exemption review; NOT legal advice"},
      {code:"ZERO",name:"Dummy zero-rated",treatment:"zero_rated",rate:"0",recoverablePercent:"0",basisEvidence:"Dummy zero basis"}]};
  return {...f,input,output,shipping,terminal,request};
}
async function approveTax(f:Awaited<ReturnType<typeof taxFixture>>,request=f.request) {
  const version=await service.prepareTaxConfiguration(f.book,f.branch,f.owner,request);
  await service.taxConfigurationAction(f.book,f.branch,f.approver,version.id,"approve","Dummy independent full configuration review");return version.id as number;
}
async function taxPayment(f:Awaited<ReturnType<typeof taxFixture>>,section:string|null=null,amount="107.50",date="2026-10-10 12:00:00") {
  return section===null?(await sql(`INSERT INTO duty_payment_transactions(branch_id,container_id,bank_id,amount,payment_method,paid_at,entry_type)
    VALUES($1,$2,$3,$4,'transfer',$5,'payment') RETURNING id`,[f.branch,f.container,f.bank,amount,date])).rows[0].id as number:
    (await sql(`INSERT INTO container_expense_payments(branch_id,container_id,bank_id,amount,payment_method,paid_at,section)
    VALUES($1,$2,$3,$4,'transfer',$5,$6) RETURNING id`,[f.branch,f.container,f.bank,amount,date,section])).rows[0].id as number;
}
describe("VAT/direct expense configuration integration",()=>{
  it("protects configured tax controls and repeats the migration without mutation or cross-scope audit links",async()=>{
    const f=await taxFixture(),cfg=await approveTax(f);
    const snapshot=(await sql('SELECT payload,payload_hash,state FROM accounting_tax_configurations WHERE id=$1',[cfg])).rows[0];
    await ensureAccountingFoundationSchema(database as Pick<typeof pool,'connect'>);
    expect((await sql('SELECT payload,payload_hash,state FROM accounting_tax_configurations WHERE id=$1',[cfg])).rows[0]).toEqual(snapshot);
    const chart=(await sql('SELECT id FROM accounting_accounts WHERE book_id=$1',[f.book])).rows;
    await expect(service.reviewManualAccounts(f.book,f.owner,{ownerEvidence:'Dummy',accountantEvidence:'Dummy',accounts:chart.map(a=>({accountId:a.id,role:a.id===f.input?'adjustment':'protected'}))})).rejects.toMatchObject({code:'PROTECTED_ACCOUNT'});
    const client=await database.connect();
    try{await client.query('BEGIN');await client.query("INSERT INTO accounting_audit(book_id,branch_id,actor_id,action,reason) VALUES($1,$2,$3,'manual_accounts_reviewed','Dummy raw protected-account probe')",[f.book,f.branch,f.owner]);
      await expect(client.query("INSERT INTO accounting_manual_account_rules(book_id,account_id,role,policy_version,evidence,approved_by) VALUES($1,$2,'adjustment','isolated-only-v1','Dummy',$3)",[f.book,f.input,f.owner])).rejects.toThrow('Configured tax controls');
    }finally{await client.query('ROLLBACK');client.release();}
    const other=await fixture();
    await expect(sql("INSERT INTO accounting_audit(book_id,branch_id,actor_id,action,reason,tax_configuration_id) VALUES($1,$2,$3,'bad_tax_scope','Dummy forbidden audit',$4)",[other.book,other.branch,other.owner,cfg])).rejects.toThrow('exact configuration scope');
    await service.reviewManualAccounts(f.book,f.owner,{ownerEvidence:'Dummy owner',accountantEvidence:'Dummy accountant',accounts:chart.map(a=>({accountId:a.id,role:'protected'}))});
    expect((await sql("SELECT role FROM accounting_manual_account_rules WHERE book_id=$1 AND account_id=$2",[f.book,f.input])).rows[0].role).toBe('protected');
  },240000);
  it("retains independent immutable configuration and serializes duplicate approval with SQL guards",async()=>{
    const f=await taxFixture();
    const prepared=await Promise.all([1,2].map(()=>service.prepareTaxConfiguration(f.book,f.branch,f.owner,f.request)));
    expect(prepared[0]!.id).toBe(prepared[1]!.id);
    await expect(service.taxConfigurationAction(f.book,f.branch,f.owner,prepared[0]!.id,"approve","Self review")).rejects.toMatchObject({code:"SELF_APPROVAL"});
    await expect(service.prepareTaxConfiguration(f.book,f.branch,f.owner,{...f.request,ownerEvidence:"Changed"})).rejects.toMatchObject({code:"DUPLICATE_CONFLICT"});
    await expect(sql("UPDATE accounting_tax_configurations SET state='approved',reviewed_by=$2,decision_reason='SQL attempt',approved_at=now() WHERE id=$1",[prepared[0]!.id,f.approver])).rejects.toThrow("audit");
    await Promise.all([1,2].map(()=>service.taxConfigurationAction(f.book,f.branch,f.approver,prepared[0]!.id,"approve","Dummy independent review")));
    expect((await service.taxWorkspace(f.book,f.branch,f.approver)).versions[0].state).toBe("approved");
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE tax_configuration_id=$1 AND action='tax_configuration_approved'",[prepared[0]!.id])).rows[0].n).toBe(1);
    await expect(sql("UPDATE accounting_tax_configurations SET payload=jsonb_set(payload,'{dutyAccountId}',to_jsonb($2::int)) WHERE id=$1",[prepared[0]!.id,f.shipping])).rejects.toThrow("Immutable");
    await expect(sql("DELETE FROM accounting_tax_configurations WHERE id=$1",[prepared[0]!.id])).rejects.toThrow("cannot be deleted");
    await expect(service.prepareTaxConfiguration(f.book,f.branch,f.operations,f.request)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(service.prepareTaxConfiguration(f.book,f.branch,f.owner,{...f.request,requestId:randomBytes(8).toString('hex'),inputVatAccountId:f.expense})).rejects.toMatchObject({code:"INVALID_MAPPING"});
  },180000);
  it("posts three direct heads with exact recoverable/nonrecoverable splits and unchanged source cash",async()=>{
    const f=await taxFixture(),cfg=await approveTax(f);
    for(const [section,head,code,expense,tax] of [[null,f.expense,'STD','10000','750'],['shipping',f.shipping,'COST','10750','0'],['terminal',f.terminal,'MIXED','10450','300']] as const) {
      const id=await taxPayment(f,section),kind=section===null?'duty_payment':'container_payment';
      const before=(await sql(`SELECT row_to_json(p) data FROM ${section===null?'duty_payment_transactions':'container_expense_payments'} p WHERE id=$1`,[id])).rows[0].data;
      const request={kind,id,evidence:"Dummy supplier tax voucher",configurationId:cfg,taxCode:code,basis:'inclusive' as const,taxAmount:'107.50',settlementAccountId:f.debit} as const;
      const preview=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,request);expect(preview.kind).toBe('preview');if(preview.kind==='preview')expect(preview.cashMovement).toBe('-107.50');
      const prepared=await Promise.all([1,2].map(()=>service.reviewConfiguredSource(f.book,f.branch,f.preparer,request,true)));
      expect(prepared[0]!.kind).toBe('prepared');if(prepared[0]!.kind!=='prepared')throw Error('missing draft');const journal=prepared[0]!.id;
      expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1 AND event_key=$2",[f.book,`source:${kind}:${id}:v1`])).rows[0].n).toBe(1);
      await service.postConfiguredSource(f.book,f.branch,f.approver,journal,'Dummy independent supplier review');
      const values=await balances(f);expect(values.get(head)).toBe(expense);
      expect((await sql("SELECT coalesce(sum(debit_minor),0)::text d FROM accounting_journal_lines WHERE journal_id=$1 AND account_id=$2",[journal,f.input])).rows[0].d).toBe(tax);
      expect((await sql(`SELECT row_to_json(p) data FROM ${section===null?'duty_payment_transactions':'container_expense_payments'} p WHERE id=$1`,[id])).rows[0].data).toEqual(before);
    }
    const values=await balances(f);expect(values.get(f.debit)).toBe('-32250');expect(values.get(f.input)).toBe('1050');
    const report=await service.taxRegister(f.book,f.branch,f.preparer,'2026-10-01','2026-10-13');
    expect(report.unclassified).toBe(0);expect(report.totals).toMatchObject({netPurchases:'300.00',purchaseVat:'22.50',recoverable:'10.50',nonRecoverable:'12.00'});
    const tb=await service.accountingReport(f.book,f.branch,f.preparer,'trial-balance',{from:'2026-10-01',to:'2026-10-13',includeZero:true,includeInactive:false});expect(tb.balanced).toBe(true);
    const wrong=await taxPayment(f,'shipping');await expect(service.reviewConfiguredSource(f.book,f.branch,f.preparer,{kind:'container_payment',id:wrong,evidence:'Dummy',configurationId:cfg,taxCode:'STD',basis:'exclusive',taxAmount:'107.50',settlementAccountId:f.debit})).rejects.toMatchObject({code:'TAX_SOURCE_MISMATCH'});
  },240000);
  it("reuses original duty VAT/head on a later reversal instead of newer configuration",async()=>{
    const f=await taxFixture(),cfg=await approveTax(f),id=await taxPayment(f),request={kind:'duty_payment' as const,id,evidence:'Dummy',configurationId:cfg,taxCode:'STD',basis:'exclusive' as const,taxAmount:'100',settlementAccountId:f.debit};
    const d=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,request,true);if(d.kind!=='prepared')throw Error('draft missing');await service.postConfiguredSource(f.book,f.branch,f.approver,d.id,'Dummy independent approval');
    await approveTax(f,{...f.request,requestId:randomBytes(8).toString('hex'),effectiveFrom:'2026-10-11',codes:f.request.codes.map(c=>c.treatment==='taxable'?{...c,rate:'10',recoverablePercent:'0'}:c)});
    const reverse=(await sql(`INSERT INTO duty_payment_transactions(branch_id,container_id,bank_id,amount,payment_method,paid_at,entry_type,reversal_of_transaction_id)
      VALUES($1,$2,$3,-107.50,'transfer','2026-10-12 12:00:00','reversal',$4) RETURNING id`,[f.branch,f.container,f.bank,id])).rows[0].id;
    const reversal=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,{kind:'duty_reversal',id:reverse,evidence:'Dummy recorded full reversal'},true);if(reversal.kind!=='prepared')throw Error('reverse missing');
    await service.postConfiguredSource(f.book,f.branch,f.approver,reversal.id,'Dummy independent reversal');
    const result=await service.taxRegister(f.book,f.branch,f.preparer,'2026-10-01','2026-10-13');expect(result.totals.recoverable).toBe('0.00');expect(result.totals.purchaseVat).toBe('0.00');expect(result.rows[1]!.configurationId).toBe(cfg);
    expect([...(await balances(f)).values()].every(v=>v==='0')).toBe(true);
  },240000);
  it("reconciles mixed invoice classifications and credit-note VAT with no second cash event",async()=>{
    const f=await taxFixture(),cfg=await approveTax(f),ar=await service.addAccount(f.book,f.branch,f.owner,'1100','Dummy AR','asset'),income=await service.addAccount(f.book,f.branch,f.owner,'4000','Dummy service revenue','income');
    const customer=(await sql('INSERT INTO clients(branch_id) VALUES($1) RETURNING id',[f.branch])).rows[0].id;
    const inv=(await sql("INSERT INTO invoices(branch_id,client_id,status,subtotal,vat_amount,total) VALUES($1,$2,'sent',100,4.50,104.50) RETURNING id",[f.branch,customer])).rows[0].id;
    const items=(await sql('INSERT INTO invoice_items(invoice_id,branch_id,amount) VALUES($1,$2,60),($1,$2,40) RETURNING id',[inv,f.branch])).rows;
    const request={kind:'invoice' as const,id:inv,evidence:'Dummy issued bundled service review',configurationId:cfg,taxCode:'STD',recognitionDate:'2026-10-10',receivableAccountId:ar,incomeAccountId:income,items:[{itemId:items[0].id,code:'STD'},{itemId:items[1].id,code:'EXEMPT'}]};
    const draft=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,request,true);if(draft.kind!=='prepared')throw Error('missing');await service.postConfiguredSource(f.book,f.branch,f.approver,draft.id,'Dummy independently matched invoice VAT');
    const note=(await sql("INSERT INTO credit_notes(invoice_id,status,branch_id,amount,credit_note_number,reason) VALUES($1,'active',$2,10.45,'DUMMY-TAX-CN','Dummy reduction') RETURNING id",[inv,f.branch])).rows[0].id;
    await sql("INSERT INTO invoice_payments(branch_id,invoice_id,amount,paid_at,payment_method,reference) VALUES($1,$2,10.45,'2026-10-10 12:00:00','credit_note','DUMMY-TAX-CN')",[f.branch,inv]);
    await postOperational(f,{kind:'credit_note',id:note},{currency:'NGN',policyVersion:f.request.policyVersion,evidence:'Dummy note',effect:'credit_note',receivableAccountId:ar,clientCreditAccountId:f.credit,
      reductions:[{accountId:income,amount:'10',category:'income',evidence:'Dummy original net reduction'}],vatAccountId:f.output,vatReduction:'0.45',vatEvidence:'Dummy original recorded VAT reduction'});
    const register=await service.taxRegister(f.book,f.branch,f.preparer,'2026-10-01','2026-10-13');expect(register.totals.outputVat).toBe('4.05');expect(register.totals.netSales).toBe('90.00');expect(register.unclassified).toBe(0);
    const values=await balances(f);expect(values.get(f.output)).toBe('-405');expect(values.has(f.debit)).toBe(false);
    const second=(await sql("INSERT INTO invoices(branch_id,client_id,status,subtotal,vat_amount,total) VALUES($1,$2,'sent',100,0,100) RETURNING id",[f.branch,customer])).rows[0].id;
    await sql('INSERT INTO invoice_items(invoice_id,branch_id,amount) VALUES($1,$2,100)',[second,f.branch]);
    await expect(service.reviewConfiguredSource(f.book,f.branch,f.preparer,{...request,id:second,items:undefined,taxCode:'STD'})).rejects.toMatchObject({code:'TAX_SOURCE_MISMATCH'});
    const zero=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,{...request,id:second,items:undefined,taxCode:'ZERO'},true);if(zero.kind!=='prepared')throw Error('zero missing');await service.postConfiguredSource(f.book,f.branch,f.approver,zero.id,'Dummy zero rated review');
    expect((await service.taxRegister(f.book,f.branch,f.preparer,'2026-10-01','2026-10-13')).rows.some(r=>r.treatment==='zero_rated')).toBe(true);
  },240000);
  it("blocks stale draft rules, wrong heads, scope leaks and unreviewed configured source adapters",async()=>{
    const f=await taxFixture(),cfg=await approveTax(f),id=await taxPayment(f);
    await expect(service.previewOperational(f.book,f.branch,f.preparer,{kind:'duty_payment',id},f.mapping)).rejects.toMatchObject({code:'TAX_REVIEW_REQUIRED'});
    const request={kind:'duty_payment' as const,id,evidence:'Dummy',configurationId:cfg,taxCode:'STD',basis:'inclusive' as const,taxAmount:'107.50',settlementAccountId:f.debit};
    const draft=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,request,true);if(draft.kind!=='prepared')throw Error('missing');
    const replacement=await approveTax(f,{...f.request,requestId:randomBytes(8).toString('hex'),effectiveFrom:'2026-10-10'});
    await expect(service.postConfiguredSource(f.book,f.branch,f.approver,draft.id,'Refuse stale applicable version')).rejects.toMatchObject({code:'TAX_CONFIGURATION_CHANGED'});
    await expect(service.reviewConfiguredSource(f.book,f.branch,f.operations,request)).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(service.reviewConfiguredSource(f.book,f.branch,f.preparer,{...request,configurationId:replacement,settlementAccountId:f.input})).rejects.toMatchObject({code:'INVALID_MAPPING'});
    const other=await taxFixture();await expect(service.configuredSource(f.book,f.branch,f.preparer,'duty_payment',await taxPayment(other))).rejects.toMatchObject({code:'NOT_FOUND'});
    await service.revokeAccess(f.book,f.branch,f.owner,f.approver,'configure','Dummy revocation');
    const next=await service.prepareTaxConfiguration(f.book,f.branch,f.owner,{...f.request,requestId:randomBytes(8).toString('hex'),effectiveFrom:'2026-10-11'});
    await expect(service.taxConfigurationAction(f.book,f.branch,f.approver,next.id,'approve','Revoked review')).rejects.toMatchObject({code:'FORBIDDEN'});
  },240000);
  it("refuses retroactive configuration, preserves rejected versions and fails OFF before connection",async()=>{
    const f=await taxFixture(),cfg=await approveTax(f),id=await taxPayment(f);
    const draft=await service.reviewConfiguredSource(f.book,f.branch,f.preparer,{kind:'duty_payment',id,evidence:'Dummy',configurationId:cfg,taxCode:'EXEMPT',basis:'inclusive',taxAmount:'107.50',settlementAccountId:f.debit},true);
    if(draft.kind!=='prepared')throw Error('missing');await service.postConfiguredSource(f.book,f.branch,f.approver,draft.id,'Dummy exempt duty evidence');
    const next=await service.prepareTaxConfiguration(f.book,f.branch,f.owner,{...f.request,requestId:randomBytes(8).toString('hex'),effectiveFrom:'2026-10-10'});
    await expect(service.taxConfigurationAction(f.book,f.branch,f.approver,next.id,'approve','No retroactive rewrite')).rejects.toMatchObject({code:'HISTORY_REVIEW_REQUIRED'});
    await service.taxConfigurationAction(f.book,f.branch,f.approver,next.id,'reject','Dummy explicit historical conflict rejection');
    expect((await service.taxWorkspace(f.book,f.branch,f.owner)).versions[0].state).toBe('rejected');
    const ordinary=await service.prepareJournal(f.preparer,{...input(f),eventKey:`dummy_plain_${randomBytes(8).toString('hex')}`,evidence:'Plain-text evidence, not source JSON'});
    await service.approveAndPost(f.book,f.branch,f.approver,ordinary.id,'Dummy normal journal');
    expect((await service.taxWorkspace(f.book,f.branch,f.owner)).journals).toHaveLength(1);
    expect((await service.taxRegister(f.book,f.branch,f.preparer,'2026-10-01','2026-10-13')).rows).toHaveLength(1);
    await expect(service.configuredJournal(f.book,f.branch,f.preparer,ordinary.id)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await service.configuredJournal(f.book,f.branch,f.preparer,draft.id)).status).toBe('posted');
    const old=process.env.NATIVE_ACCOUNTING_ENABLED;delete process.env.NATIVE_ACCOUNTING_ENABLED;
    try{let connections=0;const off=new NativeAccounting({connect:async()=>{connections++;throw Error('Must not connect');}} as any);
      for(const run of [()=>off.taxWorkspace(1,2,3),()=>off.prepareTaxConfiguration(1,2,3,f.request),()=>off.taxConfigurationAction(1,2,3,4,'approve','Dummy'),
        ()=>off.configuredSource(1,2,3,'invoice',4),()=>off.reviewConfiguredSource(1,2,3,{kind:'duty_reversal',id:4,evidence:'Dummy'}),()=>off.postConfiguredSource(1,2,3,4,'Dummy'),()=>off.taxRegister(1,2,3,'2026-10-01','2026-10-13')])
        await expect(run()).rejects.toMatchObject({code:'ACCOUNTING_DISABLED'});expect(connections).toBe(0);
    }finally{process.env.NATIVE_ACCOUNTING_ENABLED=old;}
  },240000);
});

describe("Step7 remaining operational source integration",()=>{
  it("posts duty reversal, container cost and bank movements once with zero source mutation",async()=>{
    const f=await operationalFixture();
    const duty=(await sql(`INSERT INTO duty_payment_transactions(branch_id,container_id,bank_id,amount,payment_method,paid_at,entry_type)
      VALUES($1,$2,$3,20,'transfer','2026-10-10 10:00:00','payment') RETURNING id`,[f.branch,f.container,f.bank])).rows[0].id;
    const snap=(await sql("SELECT row_to_json(p) data FROM duty_payment_transactions p WHERE id=$1",[duty])).rows[0].data;
    const ref={kind:"duty_payment" as const,id:duty};
    expect((await service.previewOperational(f.book,f.branch,f.preparer,ref,f.mapping)).cashMovement).toBe("-20.00");
    const drafts=await Promise.all([1,2].map(()=>service.prepareOperational(f.book,f.branch,f.preparer,ref,f.mapping)));
    expect(drafts[0]!.id).toBe(drafts[1]!.id);
    const reverse=(await sql(`INSERT INTO duty_payment_transactions(branch_id,container_id,bank_id,amount,payment_method,paid_at,entry_type,reversal_of_transaction_id)
      VALUES($1,$2,$3,-20,'transfer','2026-10-11 10:00:00','reversal',$4) RETURNING id`,[f.branch,f.container,f.bank,duty])).rows[0].id;
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"duty_payment",id:reverse},f.mapping)).rejects.toMatchObject({code:"ORIGINAL_NOT_POSTED"});
    await service.approveAndPost(f.book,f.branch,f.approver,drafts[0]!.id,"Dummy duty approval");
    const reversal=await postOperational(f,{kind:"duty_payment",id:reverse},f.mapping);
    expect((await service.prepareOperational(f.book,f.branch,f.preparer,{kind:"duty_payment",id:reverse},f.mapping)).id).toBe(reversal.id);
    const cost=(await sql(`INSERT INTO container_expense_payments(branch_id,container_id,bank_id,amount,payment_method,paid_at)
      VALUES($1,$2,$3,10,'transfer','2026-10-11 11:00:00') RETURNING id`,[f.branch,f.container,f.bank])).rows[0].id;
    await postOperational(f,{kind:"container_payment",id:cost},f.mapping);
    const funding=(await sql(`INSERT INTO bank_fund_additions(branch_id,bank_id,amount,created_at,narration)
      VALUES($1,$2,50,'2026-10-11 11:00:00','Dummy capital') RETURNING id`,[f.branch,f.bank])).rows[0].id;
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"bank_funding",id:funding},f.mapping)).rejects.toMatchObject({code:"MAPPING_REQUIRED"});
    await postOperational(f,{kind:"bank_funding",id:funding},{...f.mapping,effect:"equity_funding",accountId:f.equity});
    const late=(await sql("INSERT INTO bank_fund_additions(branch_id,bank_id,amount,created_at) VALUES($1,$2,1,'2026-10-10 23:30:00') RETURNING id",[f.branch,f.bank])).rows[0].id;
    expect((await service.previewOperational(f.book,f.branch,f.preparer,{kind:"bank_funding",id:late},
      {...f.mapping,effect:"equity_funding",accountId:f.equity})).input.accountingDate).toBe("2026-10-11");
    const transfer=(await sql(`INSERT INTO bank_transfers(branch_id,from_bank_id,to_bank_id,amount,created_at)
      VALUES($1,$2,$3,20,'2026-10-11 12:00:00') RETURNING id`,[f.branch,f.bank,f.secondBank])).rows[0].id;
    await postOperational(f,{kind:"bank_transfer",id:transfer},{...f.mapping,effect:"transfer"});
    expect(await balances(f)).toEqual(new Map([[f.debit,"2000"],[f.expense,"1000"],[f.secondBankAccount,"2000"],[f.equity,"-5000"]]));
    expect((await sql("SELECT row_to_json(p) data FROM duty_payment_transactions p WHERE id=$1",[duty])).rows[0].data).toEqual(snap);
    await expect(service.previewOperational(f.book,f.branch,f.operations,ref,f.mapping)).rejects.toMatchObject({code:"FORBIDDEN"});
  },180000);
  it("reconciles original overhead plus top-up and settles scheduled payment without duplicate expense",async()=>{
    const f=await operationalFixture();
    const bill=(await sql(`INSERT INTO overhead_expenses(branch_id,category,description,amount,created_at)
      VALUES($1,'Rent','Dummy lease',120,'2026-10-10 09:00:00') RETURNING id`,[f.branch])).rows[0].id;
    const topup=(await sql(`INSERT INTO overhead_expense_topups(branch_id,expense_id,amount,description,created_at)
      VALUES($1,$2,20,'Dummy added charge','2026-10-10 10:00:00') RETURNING id`,[f.branch,bill])).rows[0].id;
    const schedule=(await sql("INSERT INTO payment_schedules(branch_id,overhead_expense_id,amount_approved,status) VALUES($1,$2,30,'paid') RETURNING id",[f.branch,bill])).rows[0].id;
    const payment=(await sql(`INSERT INTO expense_payments(branch_id,expense_id,payment_schedule_id,amount,bank_id,payment_method,paid_at)
      VALUES($1,$2,$3,30,$4,'transfer','2026-10-10 12:00:00') RETURNING id`,[f.branch,bill,schedule,f.bank])).rows[0].id;
    const mapping={...f.mapping,effect:"overhead" as const,recognitionDate:"2026-10-10",recognitionEvidence:"Dummy bill dates"};
    const snap=(await sql("SELECT row_to_json(e) data FROM overhead_expenses e WHERE id=$1",[bill])).rows[0].data;
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"expense_payment",id:payment},mapping)).rejects.toMatchObject({code:"SOURCE_NOT_POSTED"});
    expect((await service.previewOperational(f.book,f.branch,f.preparer,{kind:"overhead",id:bill},mapping)).input.lines[0]!.debit).toBe("100.00");
    await postOperational(f,{kind:"overhead",id:bill},mapping); await postOperational(f,{kind:"overhead_topup",id:topup},mapping);
    await postOperational(f,{kind:"expense_payment",id:payment},mapping);
    expect(await balances(f)).toEqual(new Map([[f.expense,"12000"],[f.credit,"-9000"],[f.debit,"-3000"]]));
    const direct=(await sql(`INSERT INTO expense_payments(branch_id,expense_id,amount,bank_id,payment_method,paid_at)
      VALUES($1,$2,15,$3,'transfer','2026-10-10 13:00:00') RETURNING id`,[f.branch,bill,f.bank])).rows[0].id;
    await postOperational(f,{kind:"expense_payment",id:direct},mapping);
    expect(await balances(f)).toEqual(new Map([[f.expense,"12000"],[f.credit,"-7500"],[f.debit,"-4500"]]));
    expect((await sql("SELECT row_to_json(e) data FROM overhead_expenses e WHERE id=$1",[bill])).rows[0].data).toEqual(snap);
    const rogue=await standalone(f); await sql("UPDATE payment_schedule_payments SET schedule_id=$2 WHERE id=$1",[rogue,schedule]);
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"schedule_payment",id:rogue},f.mapping)).rejects.toMatchObject({code:"DUPLICATE_SOURCE"});
    await sql("UPDATE overhead_expenses SET amount=121 WHERE id=$1",[bill]);
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"expense_payment",id:payment},mapping)).rejects.toMatchObject({code:"SOURCE_CHANGED"});
  },180000);
  it("honors five standalone classifications and rejects unknown/stale evidence and wrong bank branches",async()=>{
    const f=await operationalFixture();
    for(const [effect,accountId] of [["loan_funding",f.credit],["equity_funding",f.equity]] as const) {
      const funding=(await sql("INSERT INTO bank_fund_additions(branch_id,bank_id,amount,created_at) VALUES($1,$2,20,'2026-10-10 09:00:00') RETURNING id",[f.branch,f.bank])).rows[0].id;
      await postOperational(f,{kind:"bank_funding",id:funding},{...f.mapping,effect,accountId});
    }
    const categories=[ ["operating_expense","expense",f.expense], ["asset","asset",f.advance], ["advance","advance",f.advance],
      ["loan_repayment","loan_repayment",f.credit], ["other_non_expense","other_non_expense",f.equity] ] as const;
    for(const [classification,effect,accountId] of categories) {
      const id=await standalone(f,classification); await postOperational(f,{kind:"schedule_payment",id},{...f.mapping,effect,accountId,accountCategory:"equity"});
    }
    expect(await balances(f)).toEqual(new Map([[f.expense,"1000"],[f.advance,"2000"],[f.credit,"-1000"],[f.equity,"-1000"],[f.debit,"-1000"]]));
    const recovery=(await sql("INSERT INTO bank_fund_additions(branch_id,bank_id,amount,created_at) VALUES($1,$2,5,'2026-10-10 15:00:00') RETURNING id",[f.branch,f.bank])).rows[0].id;
    await postOperational(f,{kind:"bank_funding",id:recovery},{...f.mapping,effect:"asset_funding",accountId:f.advance});
    expect((await balances(f)).get(f.advance)).toBe("1500");
    const excessive=await standalone(f,"loan_repayment","50");
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"schedule_payment",id:excessive},
      {...f.mapping,effect:"loan_repayment",accountId:f.credit})).rejects.toMatchObject({code:"CONTROL_MISMATCH"});
    const unknown=await standalone(f,"unclassified","501");
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"schedule_payment",id:unknown},f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    const pending=await standalone(f); const ref={kind:"schedule_payment" as const,id:pending};
    const j=await service.prepareOperational(f.book,f.branch,f.preparer,ref,f.mapping);
    await sql("UPDATE payment_schedule_payments SET classification_reason='Changed review' WHERE id=$1",[pending]);
    await expect(service.approveAndPost(f.book,f.branch,f.approver,j.id,"Must refuse stale evidence")).rejects.toMatchObject({code:"SOURCE_CHANGED"});
    await sql("UPDATE banks SET branch_id=branch_id+1000 WHERE id=$1",[f.bank]);
    await expect(service.previewOperational(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"NOT_FOUND"});
  },240000);
  it("posts credit-note excess and subsequent client-credit application/reversal without any cash duplication",async()=>{
    const f=await invoiceFixture();
    const recognition=await service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping);
    await service.approveAndPost(f.book,f.branch,f.approver,recognition.id,"Dummy recognition");
    const cash=await settlementPayment(f,"100.00");
    const collection=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:cash},f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,collection.id,"Dummy collection");
    const note=(await sql(`INSERT INTO credit_notes(invoice_id,branch_id,status,amount,credit_note_number,reason,created_at)
      VALUES($1,$2,'active',20,'DUMMY-CN-1','Dummy reduction','2026-10-10 12:00:00') RETURNING id`,[f.invoice,f.branch])).rows[0].id;
    const adjustment=await settlementPayment(f,"7.50","credit_note",null,null,"2026-10-10 12:00:00");
    await sql("UPDATE invoice_payments SET reference='DUMMY-CN-1' WHERE id=$1",[adjustment]);
    const cn:OperationalMapping={currency:"NGN",policyVersion:"isolated-only-v1",evidence:"Dummy reviewed net-only reduction; not tax advice",
      effect:"credit_note",receivableAccountId:f.ar,clientCreditAccountId:f.credit,
      reductions:[{accountId:f.income,amount:"20",category:"income",evidence:"Dummy original fee correction"}]};
    await postOperational(f,{kind:"credit_note",id:note},cn);
    expect((await service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).id).toBe(recognition.id);
    const second=(await sql("INSERT INTO invoices(branch_id,client_id,status,total,subtotal) VALUES($1,$2,'sent',10,10) RETURNING id",[f.branch,f.client])).rows[0].id;
    const item=(await sql("INSERT INTO invoice_items(invoice_id,branch_id,amount) VALUES($1,$2,10) RETURNING id",[second,f.branch])).rows[0].id;
    const secondMap={...f.invoiceMapping,vatAccountId:undefined,vatEvidence:undefined,items:[{itemId:item,splits:[{accountId:f.income,amount:"10",treatment:"income" as const,evidence:"Dummy second invoice"}]}]};
    const j=await service.prepareInvoice(f.book,f.branch,f.preparer,second,secondMap); await service.approveAndPost(f.book,f.branch,f.approver,j.id,"Dummy second recognition");
    const use=await settlementPayment({...f,invoice:second},"10","credit",null,null,"2026-10-10 13:00:00");
    const cm={...cn,effect:"client_credit" as const,reductions:undefined};
    await postOperational(f,{kind:"client_credit_application",id:use},cm);
    const reverse=await settlementPayment({...f,invoice:second},"-10","credit",null,use,"2026-10-10 14:00:00");
    await postOperational(f,{kind:"client_credit_application",id:reverse},cm);
    expect(await balances(f)).toEqual(new Map([[f.ar,"1000"],[f.income,"-9000"],[f.vat,"-750"],[f.debit,"10000"],[f.credit,"-1250"]]));
    const excess=(await sql(`INSERT INTO credit_notes(invoice_id,branch_id,status,amount,credit_note_number,reason,created_at)
      VALUES($1,$2,'active',85,'DUMMY-CN-2','Bad split','2026-10-10 15:00:00') RETURNING id`,[f.invoice,f.branch])).rows[0].id;
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"credit_note",id:excess},
      {...cn,reductions:[{accountId:f.income,amount:"85",category:"income",evidence:"Over-reduction"}]})).rejects.toMatchObject({code:"CONTROL_MISMATCH"});
  },360000);
  it("writes off only the reconciled unpaid balance and refuses a second Bad Debt payable or unrecorded recovery",async()=>{
    const f=await invoiceFixture(); const expense=await service.addAccount(f.book,f.branch,f.owner,"5000","Dummy bad debt","expense");
    const j=await service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping); await service.approveAndPost(f.book,f.branch,f.approver,j.id,"Dummy invoice");
    const p=await settlementPayment(f); const collection=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:p},f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,collection.id,"Dummy cash");
    await sql("UPDATE invoices SET status='written_off',written_off_amount=78,invoice_number='DUMMY-WO-1' WHERE id=$1",[f.invoice]);
    const audit=(await sql("INSERT INTO invoice_audit_log(invoice_id,branch_id,action,details,created_at) VALUES($1,$2,'written_off','Dummy review','2026-10-10 15:00:00') RETURNING id",[f.invoice,f.branch])).rows[0].id;
    const mapping:OperationalMapping={currency:"NGN",policyVersion:"isolated-only-v1",evidence:"Dummy exact balance review",effect:"writeoff",accountId:expense,receivableAccountId:f.ar};
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"invoice_writeoff",id:audit},mapping)).rejects.toMatchObject({code:"CONTROL_MISMATCH"});
    await sql("UPDATE invoices SET written_off_amount=77.50 WHERE id=$1",[f.invoice]);
    await sql("UPDATE invoice_payments SET amount=31 WHERE id=$1",[p]);
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"invoice_writeoff",id:audit},mapping)).rejects.toMatchObject({code:"SOURCE_CHANGED"});
    await sql("UPDATE invoice_payments SET amount=30 WHERE id=$1",[p]); await postOperational(f,{kind:"invoice_writeoff",id:audit},mapping);
    expect(await balances(f)).toEqual(new Map([[f.ar,"0"],[f.income,"-10000"],[f.vat,"-750"],[f.debit,"3000"],[expense,"7750"]]));
    const bill=(await sql("INSERT INTO overhead_expenses(branch_id,category,description,amount,reference,created_at) VALUES($1,'Bad Debt','Derived write-off',77.5,'DUMMY-WO-1','2026-10-10 15:00:00') RETURNING id",[f.branch])).rows[0].id;
    await expect(service.prepareOperational(f.book,f.branch,f.preparer,{kind:"overhead",id:bill},mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    const later=await settlementPayment(f,"1","transfer",null,null,"2026-10-11 10:00:00");
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:later},f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
  },180000);
  it("reports exact scoped source coverage, balance differences, unknown classification and stale facts without writes",async()=>{
    const f=await operationalFixture();
    const funding=(await sql("INSERT INTO bank_fund_additions(branch_id,bank_id,amount,created_at) VALUES($1,$2,50,'2026-10-10 09:00:00') RETURNING id",[f.branch,f.bank])).rows[0].id;
    await postOperational(f,{kind:"bank_funding",id:funding},{...f.mapping,effect:"equity_funding",accountId:f.equity});
    const payment=await standalone(f); await postOperational(f,{kind:"schedule_payment",id:payment},f.mapping);
    const controls=[{accountId:f.debit,debit:"40",credit:"0",evidence:"Dummy cash control"},{accountId:f.equity,debit:"0",credit:"50",evidence:"Dummy capital control"},
      {accountId:f.expense,debit:"10",credit:"0",evidence:"Dummy voucher control"}];
    const report=await service.reconcileSources(f.book,f.branch,f.preparer,"2026-10-11",controls);
    expect(report.complete).toBe(true); expect(report.sources).toHaveLength(2);
    expect((await service.reconcileSources(f.book,f.branch,f.preparer,"2026-10-11",controls.slice(1))).complete).toBe(false);
    await sql("UPDATE bank_fund_additions SET amount=51 WHERE id=$1",[funding]);
    expect((await service.reconcileSources(f.book,f.branch,f.preparer,"2026-10-11",controls)).sources.some(s=>s.status==="stale")).toBe(true);
    const unknown=await standalone(f,"unclassified","501");
    expect((await service.reconcileSources(f.book,f.branch,f.preparer,"2026-10-11",controls)).sources.find(s=>s.id===unknown && s.kind==="schedule_payment")?.status).toBe("review_required");
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(2);
  },180000);
});
describe("Step7 reviewed opening integration",()=>{
  it("previews and posts one independently reviewed opening before forward entries, without inventing balances",async()=>{
    const f=await fixture(true,false,false);
    const opening:ReviewedOpening={bookId:f.book,branchId:f.branch,currency:"NGN",cutoverDate:"2026-10-01",policyVersion:"isolated-only-v1",
      strategy:"opening_balances_forward",requestId:"existing_opening_123",ownerEvidence:"Dummy owner",accountantEvidence:"Dummy professional; TEST ONLY",sourceCoverageEvidence:"Dummy bank/deposit controls",
      lines:[{accountId:f.debit,debit:"100",credit:"0"},{accountId:f.credit,debit:"0",credit:"100"}],
      controls:[{accountId:f.debit,debit:"100",credit:"0",evidence:"Dummy bank statement"},{accountId:f.credit,debit:"0",credit:"100",evidence:"Dummy deposits control"}]};
    expect((await service.previewOpening(f.preparer,opening)).status).toBe("reviewed_draft");
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(0);
    const drafts=await Promise.all([1,2].map(()=>service.prepareOpening(f.preparer,opening))); expect(drafts[0]!.id).toBe(drafts[1]!.id);
    const setup=await service.prepareOpeningSetup(f.book,f.branch,f.preparer,await setupRequest(f,true,"existing_opening_123"));
    await expect(service.prepareJournal(f.preparer,input(f))).rejects.toMatchObject({code:"CUTOVER_CONFLICT"});
    await service.openingAction(f.book,f.branch,f.approver,setup.id,"verify","Dummy reviewed opening approval");
    const client=(await sql("INSERT INTO clients(branch_id) VALUES($1) RETURNING id",[f.branch])).rows[0].id;
    const legacy=(await sql("INSERT INTO invoices(branch_id,client_id,status,total,subtotal,created_at) VALUES($1,$2,'sent',10,10,'2026-09-30 10:00:00') RETURNING id",[f.branch,client])).rows[0].id;
    const item=(await sql("INSERT INTO invoice_items(invoice_id,branch_id,amount) VALUES($1,$2,10) RETURNING id",[legacy,f.branch])).rows[0].id;
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,legacy,{currency:"NGN",policyVersion:"isolated-only-v1",evidence:"Legacy guess",
      recognitionDate:"2026-10-10",recognitionEvidence:"Late date",receivableAccountId:f.debit,
      items:[{itemId:item,splits:[{accountId:f.credit,amount:"10",treatment:"liability",evidence:"Legacy guess"}]}]})).rejects.toMatchObject({code:"CUTOVER_CONFLICT"});
    await posted(f);
    expect((await service.prepareOpening(f.preparer,opening)).id).toBe(drafts[0]!.id);
    await expect(service.prepareOpening(f.preparer,{...opening,ownerEvidence:"Changed"})).rejects.toMatchObject({code:"DUPLICATE_CONFLICT"});
    expect(await balances(f)).toEqual(new Map([[f.debit,"10030"],[f.credit,"-10030"]]));
  },180000);
  it("refuses mismatched controls, unauthorized scope, late openings, and disabled database access",async()=>{
    const f=await fixture();
    const opening:ReviewedOpening={bookId:f.book,branchId:f.branch,currency:"NGN",cutoverDate:"2026-10-01",policyVersion:"isolated-only-v1",
      strategy:"opening_balances_forward",ownerEvidence:"Dummy owner",accountantEvidence:"Dummy professional",sourceCoverageEvidence:"Dummy review",
      lines:input(f).lines,controls:input(f).lines.map(l=>({...l,evidence:"Dummy controls"}))};
    await expect(service.previewOpening(f.operations,opening)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(service.prepareOpening(f.preparer,{...opening,cutoverDate:"2026-10-02"})).rejects.toMatchObject({code:"BOOK_NOT_APPROVED"});
    await expect(service.prepareOpening(f.preparer,{...opening,controls:[]})).rejects.toMatchObject({code:"CONTROL_MISMATCH"});
    await posted(f); await expect(service.prepareOpening(f.preparer,opening)).rejects.toMatchObject({code:"CUTOVER_CONFLICT"});
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    try {await expect(service.previewOpening(f.preparer,opening)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});}
    finally {process.env.NATIVE_ACCOUNTING_ENABLED="true";}
  },180000);
});

describe("Step7 invoice recognition integration", () => {
  it("previews without writes and reconciles one multi-container recognition with cash and deposit allocation", async () => {
    const f=await invoiceFixture();
    const before=(await sql("SELECT row_to_json(i) data FROM invoices i WHERE id=$1",[f.invoice])).rows[0].data;
    const preview=await service.previewInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping);
    expect(preview.cashMovement).toBe("0.00"); expect(preview.input.lines[0]!.debit).toBe("107.50");
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(0);
    const draft=await service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping);
    await service.approveAndPost(f.book,f.branch,f.approver,draft.id,"Dummy invoice approval");
    const cash=await settlementPayment(f,"30.00");
    const cashJournal=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:cash},f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,cashJournal.id,"Dummy collection approval");
    await postDeposit(f);
    const allocation=await settlementPayment(f,"20.00","deposit",f.deposit);
    const allocationJournal=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:allocation},f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,allocationJournal.id,"Dummy allocation approval");
    const balances=new Map((await sql(`SELECT account_id,(sum(debit_minor)-sum(credit_minor))::text balance
      FROM accounting_journal_lines WHERE book_id=$1 GROUP BY account_id`,[f.book])).rows.map(r=>[r.account_id,r.balance]));
    expect(balances).toEqual(new Map([[f.ar,"5750"],[f.income,"-10000"],[f.vat,"-750"],[f.debit,"13000"],[f.credit,"-8000"]]));
    expect((await sql("SELECT row_to_json(i) data FROM invoices i WHERE id=$1",[f.invoice])).rows[0].data).toEqual(before);
    expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE book_id=$1 AND event_key LIKE 'source:invoice:%'",[f.book])).rows[0].n).toBe(1);
  },180000);
  it("deduplicates concurrent prepares/posts and later payment status changes without weakening independent approval", async () => {
    const f=await invoiceFixture();
    const journals=await Promise.all([1,2,3].map(()=>service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)));
    expect(new Set(journals.map(j=>j.id)).size).toBe(1);
    await expect(service.approveAndPost(f.book,f.branch,f.preparer,journals[0]!.id,"Self approval")).rejects.toMatchObject({code:"FORBIDDEN"});
    await sql("UPDATE invoices SET status='partial',updated_at=now() WHERE id=$1",[f.invoice]);
    await Promise.all([1,2].map(()=>service.approveAndPost(f.book,f.branch,f.approver,journals[0]!.id,"Dummy independent approval")));
    const reordered=Object.fromEntries(Object.entries({...f.invoiceMapping,items:[...f.invoiceMapping.items].reverse()}).reverse()) as unknown as InvoiceAccountingMapping;
    expect((await service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,reordered)).id).toBe(journals[0]!.id);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,{...f.invoiceMapping,recognitionEvidence:"Changed review"})).rejects.toMatchObject({code:"DUPLICATE_CONFLICT"});
    const counts=(await sql(`SELECT (SELECT count(*)::int FROM accounting_source_events WHERE book_id=$1) events,
      (SELECT count(*)::int FROM accounting_audit WHERE journal_id=$2 AND action='posted') posts`,[f.book,journals[0]!.id])).rows[0];
    expect(counts).toEqual({events:1,posts:1});
    await expect(service.prepareReversal(f.book,f.branch,f.preparer,journals[0]!.id,"2026-10-11","Freehand invoice correction")).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
  });
  it("refuses changed source linkage at approval and leaves the journal unposted", async () => {
    const f=await invoiceFixture(); const draft=await service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping);
    await sql("UPDATE invoice_items SET container_id=NULL WHERE id=$1",[f.items[0]!.id]);
    await expect(service.approveAndPost(f.book,f.branch,f.approver,draft.id,"Must refuse stale source")).rejects.toMatchObject({code:"SOURCE_CHANGED"});
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1",[draft.id])).rows[0].status).toBe("draft");
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'",[draft.id])).rows[0].n).toBe(0);
    await service.cancelDraft(f.book,f.branch,f.preparer,draft.id,"Dummy reviewed cancellation");
    await sql("UPDATE invoice_items SET container_id=$2 WHERE id=$1",[f.items[0]!.id,f.containers[0]!.id]);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"SOURCE_CANCELLED"});
  });
  it("enforces permissions, matching policy, branch-linked containers, account categories, cutover and periods", async () => {
    const f=await invoiceFixture();
    await expect(service.previewInvoice(f.book,f.branch,f.operations,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,{...f.invoiceMapping,policyVersion:"unreviewed"})).rejects.toMatchObject({code:"BOOK_NOT_APPROVED"});
    const foreign=(await sql("INSERT INTO branches(name) VALUES('Foreign dummy branch') RETURNING id")).rows[0].id;
    await sql("UPDATE containers SET branch_id=$2 WHERE id=$1",[f.containers[0]!.id,foreign]);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE containers SET branch_id=$2 WHERE id=$1",[f.containers[0]!.id,f.branch]);
    const wrong={...f.invoiceMapping,items:f.invoiceMapping.items.map(item=>({...item,splits:item.splits.map(split=>({...split,accountId:f.debit}))}))};
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,wrong)).rejects.toMatchObject({code:"INVALID_MAPPING"});
    await sql("UPDATE invoices SET created_at='2026-09-29 10:00:00' WHERE id=$1",[f.invoice]);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,{...f.invoiceMapping,recognitionDate:"2026-09-30"})).rejects.toMatchObject({code:"BEFORE_CUTOVER"});
    await sql("UPDATE invoices SET created_at='2026-10-09 10:00:00' WHERE id=$1",[f.invoice]);
    await service.changePeriod(f.book,f.owner,f.period,"close",review);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"PERIOD_CLOSED"});
  });
  it("refuses unsupported invoice states, credit/write-off history and inconsistent source totals", async () => {
    const f=await invoiceFixture();
    for(const status of ["draft","cancelled","written_off","unknown"]) {
      await sql("UPDATE invoices SET status=$2 WHERE id=$1",[f.invoice,status]);
      await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    }
    await sql("UPDATE invoices SET status='sent',written_off_amount=1 WHERE id=$1",[f.invoice]);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE invoices SET written_off_amount=0 WHERE id=$1",[f.invoice]);
    await sql("INSERT INTO credit_notes(invoice_id,status) VALUES($1,'active')",[f.invoice]);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE credit_notes SET status='cancelled' WHERE invoice_id=$1",[f.invoice]);
    await sql("UPDATE invoices SET total=108 WHERE id=$1",[f.invoice]);
    await expect(service.prepareInvoice(f.book,f.branch,f.preparer,f.invoice,f.invoiceMapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(0);
  });
});
describe("Step7 inactive source integration", () => {
  it("previews without writes, posts one deposit and allocation without counting cash twice", async () => {
    const f = await settlementFixture();
    const snapshot = (await sql("SELECT row_to_json(d) data FROM client_deposits d WHERE id=$1", [f.deposit])).rows[0].data;
    expect((await service.previewSettlement(f.book, f.branch, f.preparer, { kind: "client_deposit", id: f.deposit }, f.mapping)).cashMovement).toBe("100.00");
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
    const payment = await settlementPayment(f, "30.00", "deposit", f.deposit);
    await expect(service.prepareSettlement(f.book, f.branch, f.preparer, { kind: "invoice_payment", id: payment }, f.mapping)).rejects.toMatchObject({ code: "DEPOSIT_NOT_POSTED" });
    await postDeposit(f);
    const allocation = await service.prepareSettlement(f.book, f.branch, f.preparer, { kind: "invoice_payment", id: payment }, f.mapping);
    await service.approveAndPost(f.book, f.branch, f.approver, allocation.id, "Dummy allocation approval");
    const balances = (await sql(`SELECT account_id,(sum(debit_minor)-sum(credit_minor))::text balance FROM accounting_journal_lines
      WHERE book_id=$1 GROUP BY account_id`, [f.book])).rows;
    expect(new Map(balances.map(r => [r.account_id, r.balance]))).toEqual(new Map([[f.debit,"10000"],[f.credit,"-7000"],[f.ar,"-3000"]]));
    expect((await sql("SELECT row_to_json(d) data FROM client_deposits d WHERE id=$1", [f.deposit])).rows[0].data).toEqual(snapshot);
  });
  it("deduplicates concurrent source prepares/posts and refuses conflicting mappings", async () => {
    const f = await settlementFixture(); const id = await settlementPayment(f);
    const ref = { kind: "invoice_payment" as const, id };
    const journals = await Promise.all(Array.from({length:4}, () => service.prepareSettlement(f.book, f.branch, f.preparer, ref, f.mapping)));
    expect(new Set(journals.map(j => j.id)).size).toBe(1);
    await Promise.all([1,2].map(() => service.approveAndPost(f.book,f.branch,f.approver,journals[0]!.id,"Dummy independent approval")));
    expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE book_id=$1",[f.book])).rows[0].n).toBe(1);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,{...f.mapping,evidence:"Changed approval"})).rejects.toMatchObject({code:"DUPLICATE_CONFLICT"});
    await expect(service.prepareJournal(f.preparer,{...input(f),eventKey:`source:invoice_payment:${id}:v1`})).rejects.toMatchObject({code:"RESERVED_EVENT"});
  });
  it("posts linked cash reversal once and exactly offsets the original source accounts", async () => {
    const f=await settlementFixture(); const id=await settlementPayment(f);
    const original=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id},f.mapping);
    const reversalId=await settlementPayment(f,"-30.00","transfer",null,id,"2026-10-11 10:00:00");
    const ref={kind:"invoice_payment" as const,id:reversalId};
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"ORIGINAL_NOT_POSTED"});
    await service.approveAndPost(f.book,f.branch,f.approver,original.id,"Dummy original approval");
    const reverse=await service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,reverse.id,"Dummy refund approval");
    expect((await service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).id).toBe(reverse.id);
    expect((await sql("SELECT sum(debit_minor)-sum(credit_minor) balance FROM accounting_journal_lines WHERE book_id=$1 GROUP BY account_id",[f.book])).rows.every(r=>r.balance==="0")).toBe(true);
  });
  it("refuses changed source evidence at approval without posting or auditing success", async () => {
    const f=await settlementFixture(); const id=await settlementPayment(f);
    const draft=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id},f.mapping);
    const other=(await sql("INSERT INTO invoices(branch_id,client_id,status,total) VALUES($1,$2,'sent',100) RETURNING id",[f.branch,f.client])).rows[0].id;
    await sql("UPDATE invoice_payments SET invoice_id=$2 WHERE id=$1",[id,other]);
    await expect(service.approveAndPost(f.book,f.branch,f.approver,draft.id,"Refuse changed invoice on same customer")).rejects.toMatchObject({code:"SOURCE_CHANGED"});
    await sql("UPDATE invoice_payments SET invoice_id=$2 WHERE id=$1",[id,f.invoice]);
    await sql("UPDATE invoice_payments SET amount=31 WHERE id=$1",[id]);
    await expect(service.approveAndPost(f.book,f.branch,f.approver,draft.id,"Must refuse stale source")).rejects.toMatchObject({code:"SOURCE_CHANGED"});
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1",[draft.id])).rows[0].status).toBe("draft");
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'",[draft.id])).rows[0].n).toBe(0);
  });
  it("preserves branch, grants, cutover, account category and period restrictions", async () => {
    const f=await settlementFixture(); const ref={kind:"client_deposit" as const,id:f.deposit}; const other=await fixture();
    await expect(service.previewSettlement(f.book,f.branch,f.operations,ref,f.mapping)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,{...f.mapping,depositLiabilityAccountId:f.ar})).rejects.toMatchObject({code:"INVALID_MAPPING"});
    await sql("UPDATE banks SET branch_id=$2 WHERE id=$1",[f.bank,other.branch]);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE banks SET branch_id=$2 WHERE id=$1",[f.bank,f.branch]);
    await sql("UPDATE client_deposits SET created_at='2026-09-30 10:00:00' WHERE id=$1",[f.deposit]);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"BEFORE_CUTOVER"});
    await sql("UPDATE client_deposits SET created_at='2026-10-10 10:00:00' WHERE id=$1",[f.deposit]);
    await service.changePeriod(f.book,f.owner,f.period,"close",review);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"PERIOD_CLOSED"});
  });
  it("refuses non-cash credits, cancelled invoices, excess collections and credit-note history", async () => {
    const f=await settlementFixture(); const id=await settlementPayment(f,"30.00","credit"); const ref={kind:"invoice_payment" as const,id};
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE invoice_payments SET payment_method='transfer',bank_id=$2 WHERE id=$1",[id,f.bank]);
    await sql("UPDATE invoices SET status='cancelled' WHERE id=$1",[f.invoice]);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE invoices SET status='sent' WHERE id=$1",[f.invoice]);
    await sql("UPDATE invoice_payments SET amount=101 WHERE id=$1",[id]);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    await sql("UPDATE invoice_payments SET amount=30 WHERE id=$1",[id]);
    await sql("INSERT INTO credit_notes(invoice_id,status) VALUES($1,'active')",[f.invoice]);
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,ref,f.mapping)).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
  });
  it("validates opening preview without persisting a guessed opening journal", async () => {
    const f=await settlementFixture();
    expect(previewOpeningBalances({bookId:f.book,branchId:f.branch,currency:"NGN",cutoverDate:"2026-10-01",policyVersion:"isolated-only-v1",
      strategy:"opening_balances_forward",ownerEvidence:"Dummy owner",accountantEvidence:"Dummy professional review",
      sourceCoverageEvidence:"Dummy reviewed reconciliation",lines:input(f).lines}).status).toBe("preview_only");
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(0);
  });
  it("reverses an allocation without bank movement and refuses a freehand source offset", async () => {
    const f=await settlementFixture(); await postDeposit(f);
    const id=await settlementPayment(f,"30.00","deposit",f.deposit);
    const original=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id},f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,original.id,"Dummy allocation review");
    await expect(service.prepareReversal(f.book,f.branch,f.preparer,original.id,"2026-10-11","Manual source override")).rejects.toMatchObject({code:"SOURCE_REVIEW_REQUIRED"});
    const reversedId=await settlementPayment(f,"-30.00","deposit",f.deposit,id,"2026-10-11 10:00:00");
    const reversed=await service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:reversedId},f.mapping);
    await service.approveAndPost(f.book,f.branch,f.approver,reversed.id,"Dummy allocation reversal review");
    const balances=new Map((await sql("SELECT account_id,(sum(debit_minor)-sum(credit_minor))::text balance FROM accounting_journal_lines WHERE book_id=$1 GROUP BY account_id",[f.book])).rows.map(r=>[r.account_id,r.balance]));
    expect(balances.get(f.debit)).toBe("10000"); expect(balances.get(f.credit)).toBe("-10000"); expect(balances.get(f.ar)).toBe("0");
    await sql("UPDATE client_deposits SET amount=101 WHERE id=$1",[f.deposit]);
    const next=await settlementPayment(f,"10.00","deposit",f.deposit,null,"2026-10-12 10:00:00");
    await expect(service.prepareSettlement(f.book,f.branch,f.preparer,{kind:"invoice_payment",id:next},f.mapping)).rejects.toMatchObject({code:"SOURCE_CHANGED"});
  });
});
afterAll(async () => {
  try {
    expect((await pool.query(baselineSql)).rows[0].baseline).toEqual(baseline);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.query("SET search_path TO public");
    if (previousEnabled === undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED;
    else process.env.NATIVE_ACCOUNTING_ENABLED = previousEnabled;
  }
});
const policy = Object.fromEntries(ACCOUNTING_POLICY_KEYS.map(k => [k, k === "cutoverDate" ? "2026-10-01" : k === "financialYearEnd" ? "12-31" : `Isolated reviewed ${k}; not production approval`]));
async function fixture(approved = true, multiBranch = false, initialise = true) {
  const branch = (await sql("INSERT INTO branches(name) VALUES('Isolated native book branch') RETURNING id")).rows[0].id as number;
  const secondBranch = multiBranch ? (await sql("INSERT INTO branches(name) VALUES('Isolated second reporting branch') RETURNING id")).rows[0].id as number : undefined;
  const actors = (await sql(`INSERT INTO users(branch_id,name,authority_level,job_function,workspace_access,access_profile_migrated_at)
    VALUES($1,'Owner','super_admin','general_staff','[]',now()),($1,'Preparer','staff','accounts','["accounts"]',now()),
      ($1,'Approver','staff','accounts','["accounts"]',now()),($1,'Operations','staff','operations','["shipping"]',now()) RETURNING id`, [branch])).rows;
  const [owner, preparer, approver, operations] = actors.map(a => Number(a.id));
  const book = await service.createDraftBook(owner!, "Isolated reviewed draft", "NGN", secondBranch ? [branch,secondBranch] : [branch]);
  await sql(`INSERT INTO accounting_grants(book_id,branch_id,user_id,permission,evidence,granted_by)
    SELECT $1,$2,$3,p,'Isolated owner-approved permission fixture',$3 FROM unnest(ARRAY['read','configure','prepare','post','reverse','close','reopen']) p`, [book, branch, owner]);
  if(secondBranch) await sql(`INSERT INTO accounting_grants(book_id,branch_id,user_id,permission,evidence,granted_by)
    SELECT $1,$2,$3,p,'Isolated all-branch owner grant',$3 FROM unnest(ARRAY['read','configure','prepare','post','reverse','close','reopen']) p`,[book,secondBranch,owner]);
  for (const [user, permissions] of [[preparer, ["read", "prepare", "reverse"]], [approver, ["read", "post"]]] as const) {
    await sql(`INSERT INTO accounting_grants(book_id,branch_id,user_id,permission,evidence,granted_by)
      SELECT $1,$2,$3,p,'Isolated approved grant',$4 FROM unnest($5::text[]) p`, [book, branch, user, owner, permissions]);
  }
  const debit = await service.addAccount(book, branch, owner!, "1000", "Isolated cash", "asset");
  const credit = await service.addAccount(book, branch, owner!, "2100", "Isolated deposit liability", "liability");
  const period = await service.createPeriod(book, branch, owner!, "October", "2026-10-01", "2026-10-31");
  if (approved) await service.approveBook(book, branch, owner!, { policy, version: "isolated-only-v1", ownerEvidence: "Dummy owner approval", accountantEvidence: "Dummy professional review; TEST ONLY" });
  const result={ book, branch, secondBranch, owner: owner!, preparer: preparer!, approver: approver!, operations: operations!, debit, credit, period };
  if(approved && initialise) {
    const draft=await service.prepareOpeningSetup(book,branch,preparer!,await setupRequest(result));
    await service.openingAction(book,branch,approver!,draft.id,"verify","Dummy independently reviewed all-zero start; no real balances");
  }
  return result;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function setupRequest(f:{book:number;branch:number},positive=false,key=randomBytes(8).toString("hex")) {
  const accounts=(await sql("SELECT id FROM accounting_accounts WHERE book_id=$1 ORDER BY id",[f.book])).rows;
  return {requestId:key,cutoverDate:"2026-10-01",policyVersion:"isolated-only-v1",ownerEvidence:"Dummy owner",
    accountantEvidence:"Dummy professional; TEST ONLY",sourceCoverageEvidence:"Dummy bank/deposit controls",
    balances:accounts.map((a,i)=>({accountId:a.id as number,debit:positive&&i===0?"100":"0",credit:positive&&i===1?"100":"0",evidence:i===0?"Dummy bank statement":i===1?"Dummy deposits control":"Explicit reviewed dummy zero"}))};
}
describe("OpeningSetup controlled readiness",()=>{
  it("allows audited cancellation of a legacy draft without bypassing new preparation/posting readiness",async()=>{
    const f=await fixture(true,false,false);
    // Owned shadow schema only: reproduce a draft from before the readiness migration.
    await sql('ALTER TABLE accounting_journals DISABLE TRIGGER accounting_journal_guard');
    let journal:number;
    try {journal=(await sql(`INSERT INTO accounting_journals(book_id,branch_id,period_id,currency,accounting_date,event_key,payload_hash,narration,evidence,kind,prepared_by)
      VALUES($1,$2,$3,'NGN','2026-10-10','manual:legacy-pending',$4,'Dummy legacy draft','Dummy','manual',$5) RETURNING id`,[f.book,f.branch,f.period,'a'.repeat(64),f.preparer])).rows[0].id;}
    finally {await sql('ALTER TABLE accounting_journals ENABLE TRIGGER accounting_journal_guard');}
    await expect(service.approveAndPost(f.book,f.branch,f.approver,journal!,'Dummy refusal')).rejects.toMatchObject({code:'OPENING_REQUIRED'});
    await service.cancelDraft(f.book,f.branch,f.preparer,journal!,'Dummy approved legacy cleanup');
    expect((await sql('SELECT status FROM accounting_journals WHERE id=$1',[journal!])).rows[0].status).toBe('cancelled');
    const d=await service.prepareOpeningSetup(f.book,f.branch,f.preparer,await setupRequest(f));
    await service.openingAction(f.book,f.branch,f.approver,d.id,'verify','Dummy clean full-chart zero review');
  },180000);
  it("requires complete independent openings and posts exact balances once into GL/TB",async()=>{
    const f=await fixture(true,false,false);
    await service.addAccount(f.book,f.branch,f.owner,"5000","Dummy zero expense","expense");
    await expect(service.prepareJournal(f.preparer,input(f))).rejects.toMatchObject({code:"OPENING_REQUIRED"});
    await expect(sql(`INSERT INTO accounting_journals(book_id,branch_id,period_id,currency,accounting_date,event_key,payload_hash,narration,evidence,kind,prepared_by)
      VALUES($1,$2,$3,'NGN','2026-10-10','manual:direct-bypass',$4,'Dummy bypass','Dummy','manual',$5)`,[f.book,f.branch,f.period,'a'.repeat(64),f.preparer])).rejects.toThrow('Verified opening setup');
    const request=await setupRequest(f,true);
    expect((await service.previewOpeningSetup(f.book,f.branch,f.preparer,request)).accountCount).toBe(3);
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(0);
    await expect(service.prepareOpeningSetup(f.book,f.branch,f.preparer,{...request,balances:request.balances.slice(0,2)})).rejects.toMatchObject({code:"OPENING_INCOMPLETE"});
    const results=await Promise.all([1,2].map(()=>service.prepareOpeningSetup(f.book,f.branch,f.preparer,request)));
    expect(results[0].id).toBe(results[1].id);
    await expect(service.openingAction(f.book,f.branch,f.preparer,results[0].id,"verify","Dummy self review")).rejects.toMatchObject({code:"FORBIDDEN"});
    await service.grantAccess(f.book,f.branch,f.owner,f.preparer,"post","Dummy self-approval refusal check");
    await expect(service.openingAction(f.book,f.branch,f.preparer,results[0].id,"verify","Dummy self review")).rejects.toMatchObject({code:"SELF_APPROVAL"});
    await Promise.all([1,2].map(()=>service.openingAction(f.book,f.branch,f.approver,results[0].id,"verify","Dummy independent review")));
    expect((await service.openingWorkspace(f.book,f.branch,f.preparer)).ready).toBe(true);
    const details=await service.openingDetails(f.book,f.branch,f.preparer,results[0].id);
    expect(details.audit.filter(a=>a.action==='opening_verified')).toHaveLength(1);
    expect(await balances(f)).toEqual(new Map([[f.debit,"10000"],[f.credit,"-10000"]]));
    await posted(f);
    const tb=await service.accountingReport(f.book,f.branch,f.preparer,'trial-balance',{from:'2026-10-01',to:'2026-10-10',includeZero:true,includeInactive:false});
    expect(tb.balanced).toBe(true);expect(tb.totals.closingDebit).toBe('100.30');
    await expect(service.prepareOpeningSetup(f.book,f.branch,f.preparer,{...request,requestId:'new_ready_123'})).rejects.toMatchObject({code:'OPENING_STATE'});
    await expect(service.prepareOpeningSetup(f.book,f.branch,f.preparer,{...request,ownerEvidence:'Changed'})).rejects.toMatchObject({code:'DUPLICATE_CONFLICT'});
  },240000);
  it("verifies explicit zero balances without fake journals and keeps branches isolated",async()=>{
    const f=await fixture(true,true,false),r=await setupRequest(f);
    const d=await service.prepareOpeningSetup(f.book,f.branch,f.preparer,r);
    await service.openingAction(f.book,f.branch,f.approver,d.id,'verify','Dummy full-chart verified zeros');
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1",[f.book])).rows[0].n).toBe(0);
    expect((await service.openingDetails(f.book,f.branch,f.preparer,d.id)).journalId).toBeNull();
    await expect(service.prepareJournal(f.owner,{...input(f),branchId:f.secondBranch!})).rejects.toMatchObject({code:'OPENING_REQUIRED'});
    await expect(service.openingDetails(f.book,f.secondBranch!,f.owner,d.id)).rejects.toMatchObject({code:'NOT_FOUND'});
    await posted(f);
    await expect(sql("DELETE FROM accounting_opening_setup WHERE id=$1",[d.id])).rejects.toThrow('immutable');
    await expect(sql("UPDATE accounting_opening_setup SET payload='{}'::jsonb WHERE id=$1",[d.id])).rejects.toThrow();
  },180000);
  it("retains rejected/corrected versions and refuses stale charts or direct ready forgery",async()=>{
    const f=await fixture(true,false,false),request=await setupRequest(f,true),d=await service.prepareOpeningSetup(f.book,f.branch,f.preparer,request);
    await expect(sql("UPDATE accounting_opening_setup SET state='verified',reviewed_by=$2,reviewed_at=now() WHERE id=$1",[d.id,f.approver])).rejects.toThrow('audit');
    await service.addAccount(f.book,f.branch,f.owner,'4000','Dummy additional account','income');
    await expect(service.openingAction(f.book,f.branch,f.approver,d.id,'verify','Dummy stale review')).rejects.toMatchObject({code:'OPENING_INCOMPLETE'});
    await service.revokeAccess(f.book,f.branch,f.owner,f.preparer,'prepare','Dummy departed preparer');
    await service.openingAction(f.book,f.branch,f.approver,d.id,'reject','Dummy chart correction');
    const old=await service.openingDetails(f.book,f.branch,f.approver,d.id);
    expect(old.state).toBe('rejected');expect(old.audit.some(a=>a.actorId===f.approver&&a.action==='opening_rejected')).toBe(true);
    await service.grantAccess(f.book,f.branch,f.owner,f.preparer,'prepare','Dummy grant restored');
    const next=await service.prepareOpeningSetup(f.book,f.branch,f.preparer,await setupRequest(f,true));
    expect(next.id).not.toBe(d.id);await service.openingAction(f.book,f.branch,f.approver,next.id,'verify','Dummy corrected independent review');
    expect((await service.openingDetails(f.book,f.branch,f.preparer,d.id)).payload.request.balances).toHaveLength(2);
    expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1 AND status='posted'",[f.book])).rows[0].n).toBe(1);
  },240000);
  it("requires current finance grants/open periods and gates new methods before connection while OFF",async()=>{
    const f=await fixture(true,false,false),r=await setupRequest(f);
    await expect(service.prepareOpeningSetup(f.book,f.branch,f.operations,r)).rejects.toMatchObject({code:'FORBIDDEN'});
    await expect(service.prepareOpeningSetup(f.book,f.branch,f.preparer,{...r,cutoverDate:'2026-10-02'})).rejects.toMatchObject({code:'BOOK_NOT_APPROVED'});
    await service.changePeriod(f.book,f.owner,f.period,'close',{evidence:'Dummy period review',sourceCoverageComplete:true,reconciled:true,unresolvedMappings:0});
    await expect(service.prepareOpeningSetup(f.book,f.branch,f.preparer,r)).rejects.toMatchObject({code:'PERIOD_CLOSED'});
    process.env.NATIVE_ACCOUNTING_ENABLED='false';
    try {
      const off=new NativeAccounting({connect:async()=>{throw new Error('MUST NOT CONNECT');}} as Pick<typeof pool,'connect'>);
      for(const run of [()=>off.openingWorkspace(1,2,3),()=>off.openingDetails(1,2,3,4),()=>off.previewOpeningSetup(1,2,3,r),()=>off.prepareOpeningSetup(1,2,3,r),()=>off.openingAction(1,2,3,4,'verify','Dummy')])
        await expect(run()).rejects.toMatchObject({code:'ACCOUNTING_DISABLED'});
    }finally{process.env.NATIVE_ACCOUNTING_ENABLED='true';}
    await ensureAccountingFoundationSchema(database as Pick<typeof pool,'connect'>);
  },180000);
});
async function manualFixture(reviewed=true,multiBranch=false) {
  const f=await fixture(true,multiBranch);
  const expense=await service.addAccount(f.book,f.branch,f.owner,"6200","Dummy reviewed depreciation expense","expense");
  const contra=await service.addAccount(f.book,f.branch,f.owner,"1390","Dummy accumulated depreciation","asset");
  const review={ownerEvidence:"Dummy only owner approval",accountantEvidence:"Dummy only chart review; not professional approval",
    accounts:[{accountId:f.debit,role:"protected" as const},{accountId:f.credit,role:"protected" as const},
      {accountId:expense,role:"adjustment" as const},{accountId:contra,role:"adjustment" as const}]};
  if(reviewed)await service.reviewManualAccounts(f.book,f.owner,review);
  const input:ManualAdjustment={requestId:`test_${randomBytes(8).toString("hex")}`,accountingDate:"2026-10-12",narration:"Dummy reviewed depreciation",
    evidence:"Dummy approved adjustment purpose",adjustmentType:"depreciation",calculationEvidence:"Dummy asset schedule v1: 12 x 0.01; not production",
    evidenceReferences:["Dummy asset schedule v1"],lines:[{accountId:expense,debit:"0.12",credit:"0"},{accountId:contra,debit:"0",credit:"0.12"}]};
  return {...f,expense,contra,review,input};
}
describe("Step9 controlled manual journal workflow",()=>{
  it("posts reviewed manual adjustments once and linked reversals reconcile GL and TB without source writes",async()=>{
    const f=await manualFixture();
    const drafts=await Promise.all([1,2].map(()=>service.prepareManual(f.book,f.branch,f.preparer,f.input)));
    expect(drafts[0]!.id).toBe(drafts[1]!.id);const id=drafts[0]!.id;
    await expect(service.approveAndPost(f.book,f.branch,f.approver,id,"Dummy review")).rejects.toMatchObject({code:"REVIEW_REQUIRED"});
    await Promise.all([1,2].map(()=>service.manualAction(f.book,f.branch,f.preparer,id,"submit","Dummy verified schedule")));
    await expect(service.manualAction(f.book,f.branch,f.preparer,id,"post","Dummy self approval")).rejects.toMatchObject({code:"FORBIDDEN"});
    await Promise.all([1,2].map(()=>service.manualAction(f.book,f.branch,f.approver,id,"post","Dummy independent exact review")));
    const details=await service.manualDetails(f.book,f.branch,f.preparer,id);
    expect(details.state).toBe("posted");expect(details.audit.filter((a:{action:string})=>a.action==="posted")).toHaveLength(1);expect(details.audit.filter((a:{action:string})=>a.action==="manual_submitted")).toHaveLength(1);
    const filter={from:"2026-10-01",to:"2026-10-31",includeZero:true,includeInactive:false};
    const tb=await service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",filter);expect(tb.totals.debit).toBe("0.12");expect(tb.totals.credit).toBe("0.12");
    const reversals=await Promise.all([1,2].map(()=>service.prepareManualReversal(f.book,f.branch,f.preparer,id,"2026-10-13","Dummy full reversal")));
    expect(reversals[0]!.id).toBe(reversals[1]!.id);const reversal=reversals[0]!.id;
    await service.manualAction(f.book,f.branch,f.preparer,reversal,"submit","Dummy reversal review requested");
    await service.manualAction(f.book,f.branch,f.approver,reversal,"post","Dummy independent reversal review");
    expect((await service.manualDetails(f.book,f.branch,f.preparer,reversal)).reversalOf).toBe(id);
    const gl=await service.accountingReport(f.book,f.branch,f.preparer,"general-ledger",filter);
    expect(gl.totals.closingDifference).toBe("0.00");expect(gl.rows.every(a=>a.closing==="0.00")).toBe(true);
    await expect(sql("UPDATE accounting_journals SET narration='silently changed' WHERE id=$1",[id])).rejects.toThrow(/immutable/);
  },240000);
  it("retains rejected and revised versions atomically and prevents stale revision/rejection duplicates",async()=>{
    const f=await manualFixture(),draft=await service.prepareManual(f.book,f.branch,f.preparer,f.input);
    await service.manualAction(f.book,f.branch,f.preparer,draft.id,"submit","Dummy submission");
    const changed={...f.input,requestId:`revision_${randomBytes(6).toString("hex")}`,replacesJournalId:draft.id,narration:"Dummy corrected schedule"};
    await expect(service.prepareManual(f.book,f.branch,f.preparer,changed)).rejects.toMatchObject({code:"JOURNAL_STATE"});
    await Promise.all([1,2].map(()=>service.manualAction(f.book,f.branch,f.approver,draft.id,"reject","Dummy missing support")));
    expect((await service.manualDetails(f.book,f.branch,f.preparer,draft.id)).audit.filter((a:{action:string})=>a.action==="manual_rejected")).toHaveLength(1);
    await expect(service.prepareManual(f.book,f.branch,f.preparer,{...changed,accountingDate:"2026-11-01"})).rejects.toMatchObject({code:"PERIOD_CLOSED"});
    expect((await service.manualDetails(f.book,f.branch,f.preparer,draft.id)).state).toBe("rejected");
    await expect(service.manualAction(f.book,f.branch,f.preparer,draft.id,"submit","Dummy resubmit unchanged")).rejects.toMatchObject({code:"JOURNAL_STATE"});
    const revision=await service.prepareManual(f.book,f.branch,f.preparer,changed);
    expect((await service.manualDetails(f.book,f.branch,f.preparer,draft.id)).state).toBe("cancelled");
    expect((await service.manualDetails(f.book,f.branch,f.preparer,revision.id)).replacesJournalId).toBe(draft.id);
    expect((await service.prepareManual(f.book,f.branch,f.preparer,changed)).id).toBe(revision.id);
    await expect(service.prepareManual(f.book,f.branch,f.preparer,{...changed,narration:"different payload"})).rejects.toMatchObject({code:"DUPLICATE_CONFLICT"});
    await expect(service.prepareManual(f.book,f.branch,f.preparer,{...changed,requestId:"another_revision_123"})).rejects.toMatchObject({code:"JOURNAL_STATE"});
    await expect(sql("UPDATE accounting_journal_lines SET memo='tampered' WHERE journal_id=$1",[revision.id])).rejects.toThrow(/immutable revision/);
    await expect(sql("DELETE FROM accounting_manual_workflow WHERE journal_id=$1",[revision.id])).rejects.toThrow(/immutable/);
    await service.manualAction(f.book,f.branch,f.preparer,revision.id,"cancel","Dummy no longer needed");
    expect((await balances(f)).size).toBe(0);
  });
  it("blocks unreviewed/protected charts and preserves immutable owner/accountant classification evidence",async()=>{
    const f=await manualFixture(false);
    await expect(service.prepareManual(f.book,f.branch,f.preparer,f.input)).rejects.toMatchObject({code:"ACCOUNT_REVIEW_REQUIRED"});
    await expect(service.reviewManualAccounts(f.book,f.owner,{...f.review,accounts:f.review.accounts.slice(0,2)})).rejects.toMatchObject({code:"ACCOUNT_REVIEW_REQUIRED"});
    await expect(service.reviewManualAccounts(f.book,f.owner,{...f.review,accountantEvidence:""})).rejects.toMatchObject({code:"EVIDENCE_REQUIRED"});
    await expect(service.reviewManualAccounts(f.book,f.preparer,f.review)).rejects.toMatchObject({code:"FORBIDDEN"});
    await service.reviewManualAccounts(f.book,f.owner,f.review);
    await expect(service.prepareManual(f.book,f.branch,f.preparer,{...f.input,lines:[{accountId:f.debit,debit:"0.12",credit:"0"},f.input.lines[1]!]})).rejects.toMatchObject({code:"PROTECTED_ACCOUNT"});
    await expect(service.reviewManualAccounts(f.book,f.owner,{...f.review,accounts:f.review.accounts.map(a=>({...a,role:"adjustment" as const}))})).rejects.toMatchObject({code:"ACCOUNT_REVIEW_REQUIRED"});
    await expect(sql("UPDATE accounting_manual_account_rules SET role='adjustment' WHERE book_id=$1",[f.book])).rejects.toThrow(/immutable/);
    const newAccount=await service.addAccount(f.book,f.branch,f.owner,"9999","New unreviewed dummy account","expense");
    await expect(service.prepareManual(f.book,f.branch,f.preparer,f.input)).rejects.toMatchObject({code:"ACCOUNT_REVIEW_REQUIRED"});
    await service.reviewManualAccounts(f.book,f.owner,{...f.review,accounts:[...f.review.accounts,{accountId:newAccount,role:"protected"}]});
    await service.prepareManual(f.book,f.branch,f.preparer,f.input);
  });
  it("enforces branch/book/grant/current actor and closed periods with no failed-action audit side effects",async()=>{
    const f=await manualFixture(true,true),draft=await service.prepareManual(f.book,f.branch,f.preparer,f.input);
    await expect(service.manualDetails(f.book,f.secondBranch!,f.preparer,draft.id)).rejects.toMatchObject({code:"FORBIDDEN"});
    await expect(service.manualWorkspace(f.book,f.branch,f.operations)).rejects.toMatchObject({code:"FORBIDDEN"});
    await service.manualAction(f.book,f.branch,f.preparer,draft.id,"submit","Dummy submission");
    const before=(await sql("SELECT count(*)::int n FROM accounting_audit WHERE book_id=$1",[f.book])).rows[0].n;
    await service.revokeAccess(f.book,f.branch,f.owner,f.approver,"post","Dummy revocation");
    await expect(service.manualAction(f.book,f.branch,f.approver,draft.id,"post","Dummy unauthorized")).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE book_id=$1",[f.book])).rows[0].n).toBe(before+1);
    await service.grantAccess(f.book,f.branch,f.owner,f.approver,"post","Dummy restored grant");
    await service.manualAction(f.book,f.branch,f.approver,draft.id,"post","Dummy independent review");
    await service.changePeriod(f.book,f.owner,f.period,"close",{evidence:"Dummy independent test controls",sourceCoverageComplete:true,reconciled:true,unresolvedMappings:0});
    await expect(service.prepareManual(f.book,f.branch,f.preparer,{...f.input,requestId:"closed_period_123"})).rejects.toMatchObject({code:"PERIOD_CLOSED"});
    await expect(service.prepareManualReversal(f.book,f.branch,f.preparer,draft.id,"2026-10-13","Dummy closed date")).rejects.toMatchObject({code:"PERIOD_CLOSED"});
    expect((await service.manualDetails(f.book,f.branch,f.preparer,draft.id)).state).toBe("posted");
  });
  it("refuses source and opening bypass and audits a cancelled reversal retry separately",async()=>{
    const f=await settlementFixture(),source=await postDeposit(f);
    const rules=(await sql("SELECT id FROM accounting_accounts WHERE book_id=$1",[f.book])).rows.map(a=>({accountId:a.id,role:"protected" as const}));
    await expect(service.reviewManualAccounts(f.book,f.owner,{ownerEvidence:"Dummy",accountantEvidence:"Dummy",accounts:rules.map(a=>({...a,role:"adjustment" as const}))})).rejects.toMatchObject({code:"PROTECTED_ACCOUNT"});
    await expect(service.prepareManualReversal(f.book,f.branch,f.preparer,source.id,"2026-10-13","Dummy offset")).rejects.toMatchObject({code:"INVALID_REVERSAL"});
    const m=await manualFixture(),draft=await service.prepareManual(m.book,m.branch,m.preparer,m.input);
    await service.manualAction(m.book,m.branch,m.preparer,draft.id,"submit","Dummy submission");await service.manualAction(m.book,m.branch,m.approver,draft.id,"post","Dummy review");
    const r=await service.prepareManualReversal(m.book,m.branch,m.preparer,draft.id,"2026-10-13","Dummy incorrect date");
    await service.manualAction(m.book,m.branch,m.preparer,r.id,"cancel","Dummy reversal date correction");
    const retry=await service.prepareManualReversal(m.book,m.branch,m.preparer,draft.id,"2026-10-14","Dummy corrected date");
    expect(retry.id).not.toBe(r.id);expect((await service.manualDetails(m.book,m.branch,m.preparer,r.id)).state).toBe("cancelled");
    const revise={...m.input,requestId:"reverse_edit_123",replacesJournalId:retry.id};
    await expect(service.prepareManual(m.book,m.branch,m.preparer,revise)).rejects.toMatchObject({code:"JOURNAL_STATE"});
  });
  it("upgrades schema idempotently and fails all new native operations before connecting while OFF",async()=>{
    await ensureAccountingFoundationSchema(database as Pick<typeof pool,"connect">);
    const f=await manualFixture();await service.prepareManual(f.book,f.branch,f.preparer,f.input);
    await ensureAccountingFoundationSchema(database as Pick<typeof pool,"connect">);
    expect((await service.manualWorkspace(f.book,f.branch,f.preparer)).journals).toHaveLength(1);
    process.env.NATIVE_ACCOUNTING_ENABLED="false";
    try {
      const inactive=new NativeAccounting({connect:async()=>{throw new Error("MUST NOT CONNECT");}} as Pick<typeof pool,"connect">);
      for(const run of [()=>inactive.manualWorkspace(1,2,3),()=>inactive.manualDetails(1,2,3,4),()=>inactive.prepareManual(1,2,3,f.input),
        ()=>inactive.reviewManualAccounts(1,3,f.review),()=>inactive.manualAction(1,2,3,4,"post","Dummy"),()=>inactive.prepareManualReversal(1,2,3,4,"2026-10-13","Dummy")])
        await expect(run()).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});
    }finally{process.env.NATIVE_ACCOUNTING_ENABLED="true";}
  });
});
describe("Step8 posted General Ledger and Trial Balance",()=>{
  const filters={from:"2026-10-10",to:"2026-10-11",includeZero:true,includeInactive:false};
  async function postAmount(f:Fixture,amount:string,date:string) {
    const j=await service.prepareJournal(f.preparer,{...input(f,randomBytes(5).toString("hex"),amount),accountingDate:date});
    await service.approveAndPost(f.book,f.branch,f.approver,j.id,"Isolated independent report fixture");return j;
  }
  it("reconciles opening, movements, reversal, running and closing balances read-only",async()=>{
    const f=await fixture();await postAmount(f,"100","2026-10-02");const j=await postAmount(f,"25","2026-10-10");
    const reversal=await service.prepareReversal(f.book,f.branch,f.preparer,j.id,"2026-10-11","Dummy report reversal");
    await service.approveAndPost(f.book,f.branch,f.approver,reversal.id,"Dummy independent reversal");
    const draft=await service.prepareJournal(f.preparer,input(f,"report-draft","999"));
    const canceled=await service.prepareJournal(f.preparer,input(f,"report-canceled","1000"));await service.cancelDraft(f.book,f.branch,f.preparer,canceled.id,"Dummy canceled report fixture");
    const before=(await sql("SELECT (SELECT count(*) FROM accounting_audit WHERE book_id=$1) audit,(SELECT count(*) FROM accounting_journals WHERE book_id=$1) journals",[f.book])).rows[0];
    const gl=await service.accountingReport(f.book,f.branch,f.preparer,"general-ledger",filters);
    const tb=await service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",filters);
    expect(gl.rows.find(a=>a.id===f.debit)).toMatchObject({opening:"100.00",debit:"25.00",credit:"25.00",closing:"100.00"});
    expect(gl.rows.find(a=>a.id===f.debit)!.entries.map(e=>e.balance)).toEqual(["125.00","100.00"]);
    expect(gl.totals).toEqual(tb.totals);expect(tb.balanced).toBe(true);expect(tb.sourceCompletenessConfirmed).toBe(false);
    expect(gl.totals).toMatchObject({openingDebit:"100.00",openingCredit:"100.00",debit:"50.00",credit:"50.00",closingDebit:"100.00",closingCredit:"100.00"});
    expect((await service.reportJournal(f.book,f.branch,f.preparer,reversal.id)).reversalOf).toBe(j.id);
    await expect(service.reportJournal(f.book,f.branch,f.preparer,draft.id)).rejects.toMatchObject({code:"NOT_FOUND"});
    const after=(await sql("SELECT (SELECT count(*) FROM accounting_audit WHERE book_id=$1) audit,(SELECT count(*) FROM accounting_journals WHERE book_id=$1) journals",[f.book])).rows[0];expect(after).toEqual(before);
  },180000);
  it("retains posted balances, explicit zero rules and historical/unknown source warnings",async()=>{
    const f=await fixture();await postAmount(f,"0.30","2026-10-10");
    const unused=await service.addAccount(f.book,f.branch,f.owner,"4000","Dummy unused income","income");
    const inactive=await service.addAccount(f.book,f.branch,f.owner,"5000","Dummy unused inactive","expense");
    await expect(sql("UPDATE accounting_accounts SET active=false WHERE id=$1",[f.credit])).rejects.toThrow("Posted account definition is immutable");
    await sql("UPDATE accounting_accounts SET active=false WHERE id=$1",[inactive]);
    const client=(await sql("INSERT INTO clients(branch_id) VALUES($1) RETURNING id",[f.branch])).rows[0].id;
    await sql("INSERT INTO invoices(branch_id,client_id,status,total,created_at) VALUES($1,$2,'sent',10,'2026-09-01')",[f.branch,client]);
    const sched=(await sql("INSERT INTO payment_schedules(branch_id,amount_approved,status) VALUES($1,5,'paid') RETURNING id",[f.branch])).rows[0].id;
    await sql("INSERT INTO payment_schedule_payments(branch_id,schedule_id,amount,payment_method,paid_at) VALUES($1,$2,5,'cash','2026-10-10')",[f.branch,sched]);
    const tb=await service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",filters);
    expect(tb.rows.map(a=>a.id)).toContain(f.credit);expect(tb.rows.map(a=>a.id)).toContain(unused);expect(tb.rows.map(a=>a.id)).not.toContain(inactive);
    expect(tb.coverage[0]).toMatchObject({exceptionCount:2,counts:{pre_cutover:1,review_required:1},independentControlsVerified:false});
    expect(tb.warnings.some(w=>w.includes("exceptions"))).toBe(true);expect(tb.balanced).toBe(true);
    const all=await service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,includeInactive:true});expect(all.rows.map(a=>a.id)).toContain(inactive);
    const nonzero=await service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,includeZero:false});expect(nonzero.rows.map(a=>a.id)).toEqual([f.debit,f.credit]);
  },180000);
  it("requires every book grant for All, rejects unapproved/foreign scopes and revoked staff",async()=>{
    const f=await fixture(true,true);await postAmount(f,"10","2026-10-10");
    const whole=await service.accountingReport(f.book,null,f.owner,"trial-balance",filters);expect(whole.branches.map(b=>b.id)).toEqual([f.branch,f.secondBranch]);
    await expect(service.accountingReport(f.book,null,f.preparer,"trial-balance",filters)).rejects.toMatchObject({code:"FORBIDDEN"});
    await service.revokeAccess(f.book,f.secondBranch!,f.owner,f.owner,"read","Dummy all-scope report refusal");
    await expect(service.reportOptions(f.book,null,f.owner)).rejects.toMatchObject({code:"FORBIDDEN"});
    expect((await service.reportCatalog(f.owner,null)).books.filter(b=>b.id===f.book).map(b=>b.branchId)).toEqual([f.branch]);
    await expect(service.reportOptions(f.book,f.branch+999999,f.owner)).rejects.toMatchObject({code:"INVALID_SCOPE"});
    await expect(service.accountingReport(f.book,f.branch,f.operations,"trial-balance",filters)).rejects.toMatchObject({code:"FORBIDDEN"});
    await service.revokeAccess(f.book,f.branch,f.owner,f.preparer,"read","Dummy staff report grant revoked");
    await expect(service.reportOptions(f.book,f.branch,f.preparer)).rejects.toMatchObject({code:"FORBIDDEN"});
    const unapproved=await fixture(false);await expect(service.reportOptions(unapproved.book,unapproved.branch,unapproved.owner)).rejects.toMatchObject({code:"BOOK_NOT_APPROVED"});
  },240000);
  it("enforces date/period/account boundaries, allows closed-period reads and remains inactive before connection",async()=>{
    const f=await fixture();await postAmount(f,"0.01","2026-10-10");
    const options=await service.reportOptions(f.book,f.branch,f.preparer);expect(options.periods[0]).toMatchObject({id:f.period,from:"2026-10-01",to:"2026-10-31"});
    await expect(service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,from:"2026-09-30"})).rejects.toMatchObject({code:"PRE_CUTOVER"});
    await expect(service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,to:"2026-11-01",periodId:f.period})).rejects.toMatchObject({code:"INVALID_PERIOD"});
    await expect(service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,periodId:999999})).rejects.toMatchObject({code:"INVALID_PERIOD"});
    await expect(service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,accountId:999999})).rejects.toMatchObject({code:"NOT_FOUND"});
    await service.changePeriod(f.book,f.owner,f.period,"close",{evidence:"Dummy isolated report controls",sourceCoverageComplete:true,reconciled:true,unresolvedMappings:0});
    expect((await service.accountingReport(f.book,f.branch,f.preparer,"trial-balance",{...filters,periodId:f.period})).totals.debit).toBe("0.01");
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    let connections=0;const inactiveEngine=new NativeAccounting({connect:async()=>{connections++;throw new Error("Disabled reports must not connect");}} as Pick<typeof pool,"connect">);
    try {
      await expect(inactiveEngine.reportCatalog(f.owner,null)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});
      await expect(inactiveEngine.accountingReport(f.book,f.branch,f.owner,"trial-balance",filters)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});
      await expect(inactiveEngine.reportOptions(f.book,f.branch,f.owner)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});
      await expect(inactiveEngine.reportJournal(f.book,f.branch,f.owner,1)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});expect(connections).toBe(0);
    } finally{process.env.NATIVE_ACCOUNTING_ENABLED="true";}
  },180000);
});
function input(f: Fixture, key = randomBytes(8).toString("hex"), amount = "0.30"): JournalInput {
  return { bookId: f.book, branchId: f.branch, currency: "NGN", accountingDate: "2026-10-10", eventKey: `manual:qa:${key}`,
    narration: "Isolated controlled journal", evidence: "Dummy voucher; no cash/source mutation", lines: [
      { accountId: f.debit, debit: amount, credit: "0" }, { accountId: f.credit, debit: "0", credit: amount },
    ] };
}
const review = { evidence: "Isolated empty-source book reconciled; no production attestation", sourceCoverageComplete: true, reconciled: true, unresolvedMappings: 0 };
async function posted(f: Fixture) {
  const journal = await service.prepareJournal(f.preparer, input(f));
  return service.approveAndPost(f.book, f.branch, f.approver, journal.id, "Independent dummy voucher approval");
}
describe("Step6A-6F inactive native accounting foundation", () => {
  it("6B repeats migration without seeding accounts/books or changing source facts", async () => {
    const before = (await sql("SELECT count(*)::int n FROM accounting_books")).rows[0].n;
    await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
    expect((await sql("SELECT count(*)::int n FROM accounting_books")).rows[0].n).toBe(before);
    expect((await pool.query(baselineSql)).rows[0].baseline).toEqual(baseline);
  });
  it("6B rolls back the entire migration when an incompatible parent schema fails", async () => {
    const broken = `${schema}_broken`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE SCHEMA "${broken}"; SET search_path TO "${broken}"; CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE branches(id INTEGER PRIMARY KEY)`);
      await expect(ensureAccountingFoundationSchema({ connect: async () => ({ ...client, query: client.query.bind(client), release: () => {} }) } as Pick<typeof pool, "connect">)).rejects.toThrow();
      expect((await client.query("SELECT to_regclass('accounting_books') name")).rows[0].name).toBeNull();
    } finally { await client.query(`SET search_path TO public; DROP SCHEMA IF EXISTS "${broken}" CASCADE`); client.release(); }
  });
  it("6A requires complete approval evidence, and unapproved books cannot accept journals", async () => {
    const f = await fixture(false);
    await expect(service.approveBook(f.book, f.branch, f.owner, { policy: {}, version: "v1", ownerEvidence: "test", accountantEvidence: "test" })).rejects.toThrow();
    await expect(service.prepareJournal(f.preparer, input(f))).rejects.toMatchObject({ code: "BOOK_NOT_APPROVED" });
    await expect(sql("UPDATE accounting_books SET status='approved' WHERE id=$1", [f.book])).rejects.toThrow();
  });
  it("6C remains disabled regardless of an approved book or Super Admin authority", async () => {
    const f = await fixture(); delete process.env.NATIVE_ACCOUNTING_ENABLED;
    try { await expect(service.prepareJournal(f.owner, input(f))).rejects.toMatchObject({ code: "ACCOUNTING_DISABLED" }); }
    finally { process.env.NATIVE_ACCOUNTING_ENABLED = "true"; }
  });
  it("6C preserves exact large decimals and stable balanced lines", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f, "large", "9999999999999999.99"));
    await service.approveAndPost(f.book, f.branch, f.approver, j.id, "Reviewed exact amount");
    const read = await service.readJournal(f.book, f.branch, f.preparer, j.id);
    expect(read.lines.map(l => [l.debit, l.credit])).toEqual([["9999999999999999.99", "0.00"], ["0.00", "9999999999999999.99"]]);
  });
  it("6C serializes concurrent same-event requests and approvals without duplicate journals or events", async () => {
    const f = await fixture(); const request = input(f, "same-event");
    const journals = await Promise.all(Array.from({ length: 6 }, () => service.prepareJournal(f.preparer, request)));
    expect(new Set(journals.map(j => j.id)).size).toBe(1);
    const id = journals[0]!.id;
    await Promise.all(Array.from({ length: 4 }, () => service.approveAndPost(f.book, f.branch, f.approver, id, "Same reviewed approval")));
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'", [id])).rows[0].n).toBe(1);
    expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE journal_id=$1", [id])).rows[0].n).toBe(1);
  });
  it("6C refuses conflicting retries rather than replacing or double-counting the first payload", async () => {
    const f = await fixture(); const request = input(f, "conflict"); await service.prepareJournal(f.preparer, request);
    await expect(service.prepareJournal(f.preparer, { ...request, narration: "Different adjustment" })).rejects.toMatchObject({ code: "DUPLICATE_CONFLICT" });
  });
  it("6C refuses inactive accounts at final approval, with approval audit fully rolled back", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    await sql("UPDATE accounting_accounts SET active=false WHERE id=$1", [f.debit]);
    await expect(service.approveAndPost(f.book, f.branch, f.approver, j.id, "Controlled inactive-account check")).rejects.toThrow("Inactive account");
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'", [j.id])).rows[0].n).toBe(0);
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("draft");
  });
  it("6C rolls header, lines, event and audit back if the audit write fails", async () => {
    const f = await fixture();
    await sql(`CREATE FUNCTION fail_accounting_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.action='prepared' THEN RAISE EXCEPTION 'Controlled audit failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER fail_accounting_audit BEFORE INSERT ON accounting_audit FOR EACH ROW EXECUTE FUNCTION fail_accounting_audit()`);
    try {
      await expect(service.prepareJournal(f.preparer, input(f, "rollback"))).rejects.toThrow("Controlled audit failure");
      expect((await sql("SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
      expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
      expect((await sql("SELECT count(*)::int n FROM accounting_journal_lines WHERE book_id=$1", [f.book])).rows[0].n).toBe(0);
    } finally { await sql("DROP TRIGGER fail_accounting_audit ON accounting_audit; DROP FUNCTION fail_accounting_audit()"); }
  });
  it("6C rejects direct-SQL unbalanced posting at commit and keeps the journal draft", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    const client = await database.connect();
    try {
      await client.query("BEGIN");
      await client.query("UPDATE accounting_journal_lines SET debit_minor=31 WHERE journal_id=$1 AND debit_minor>0", [j.id]);
      await client.query("INSERT INTO accounting_audit(book_id,branch_id,actor_id,journal_id,action,reason) VALUES($1,$2,$3,$4,'posted','Dummy approval')", [f.book, f.branch, f.approver, j.id]);
      await client.query("UPDATE accounting_journals SET status='posted',posted_by=$2,posted_at=now() WHERE id=$1", [j.id, f.approver]);
      await expect(client.query("COMMIT")).rejects.toThrow("balance");
    } finally { await client.query("ROLLBACK"); client.release(); }
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("draft");
    expect((await sql("SELECT debit_minor::text FROM accounting_journal_lines WHERE journal_id=$1 AND debit_minor>0", [j.id])).rows[0].debit_minor).toBe("30");
  });
  it("6C forbids posted header/line/link/audit/account edits and deletion", async () => {
    const f = await fixture(); const j = await posted(f);
    for (const statement of ["UPDATE accounting_journals SET narration='Tampered' WHERE id=$1", "DELETE FROM accounting_journals WHERE id=$1",
      "UPDATE accounting_journal_lines SET debit_minor=31 WHERE journal_id=$1 AND debit_minor>0", "DELETE FROM accounting_journal_lines WHERE journal_id=$1",
      "DELETE FROM accounting_source_events WHERE journal_id=$1", "UPDATE accounting_audit SET reason='Tampered' WHERE journal_id=$1"])
      await expect(sql(statement, [j.id])).rejects.toThrow("immutable");
    await expect(sql("UPDATE accounting_accounts SET category='income' WHERE id=$1", [f.debit])).rejects.toThrow("immutable");
    await expect(sql("UPDATE accounting_books SET policy_version='Tampered' WHERE id=$1", [f.book])).rejects.toThrow("immutable");
  });
  it("6C reversal exactly offsets accounts, links evidence and keeps the original immutable", async () => {
    const f = await fixture(); const original = await posted(f);
    const reversal = await service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-11", "Wrong controlled adjustment; reviewed reversal");
    await service.approveAndPost(f.book, f.branch, f.approver, reversal.id, "Independent reversal approval");
    expect((await sql(`SELECT sum(l.debit_minor)-sum(l.credit_minor) balance FROM accounting_journal_lines l
      JOIN accounting_journals j ON j.id=l.journal_id WHERE j.book_id=$1 GROUP BY account_id`, [f.book])).rows.every(r => r.balance === "0")).toBe(true);
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [original.id])).rows[0].status).toBe("posted");
    await expect(service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-12", "Conflicting duplicate reversal")).rejects.toMatchObject({ code: "DUPLICATE_CONFLICT" });
  });
  it("6D rejects overlap, invalid dates, wrong currency, pre-cutover and foreign-book accounts", async () => {
    const f = await fixture(); const other = await fixture();
    await expect(service.createPeriod(f.book, f.branch, f.owner, "Overlap", "2026-10-31", "2026-11-30")).rejects.toThrow("overlap");
    await expect(service.prepareJournal(f.preparer, { ...input(f), currency: "USD" })).rejects.toMatchObject({ code: "BOOK_NOT_APPROVED" });
    await expect(service.prepareJournal(f.preparer, { ...input(f), accountingDate: "2026-09-30" })).rejects.toMatchObject({ code: "BOOK_NOT_APPROVED" });
    const request = input(f); request.lines[0]!.accountId = other.debit;
    await expect(service.prepareJournal(f.preparer, request)).rejects.toMatchObject({ code: "INVALID_ACCOUNT" });
  });
  it("6C replaces a cancelled reversal without losing its audit or duplicating the posted offset", async () => {
    const f = await fixture(); const original = await posted(f);
    const first = await service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-11", "Dummy reversal awaiting correction");
    await service.cancelDraft(f.book, f.branch, f.preparer, first.id, "Wrong dummy reversal date; keep cancelled evidence");
    await sql("CREATE UNIQUE INDEX accounting_one_reversal ON accounting_journals(reversal_of) WHERE reversal_of IS NOT NULL");
    await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
    await ensureAccountingFoundationSchema(database as Pick<typeof pool, "connect">);
    const replacements = await Promise.all([1, 2].map(() => service.prepareReversal(f.book, f.branch, f.preparer,
      original.id, "2026-10-12", "Reviewed corrected dummy reversal")));
    expect(replacements[0]!.id).not.toBe(first.id);
    expect(replacements[0]!.id).toBe(replacements[1]!.id);
    await service.approveAndPost(f.book, f.branch, f.approver, replacements[0]!.id, "Independent corrected reversal approval");
    expect((await sql(`SELECT sum(l.debit_minor)-sum(l.credit_minor) balance FROM accounting_journal_lines l
      JOIN accounting_journals j ON j.id=l.journal_id WHERE j.book_id=$1 AND j.status='posted' GROUP BY account_id`, [f.book])).rows.every(r => r.balance === "0")).toBe(true);
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [first.id])).rows[0].status).toBe("cancelled");
    expect((await sql("SELECT count(*)::int n FROM accounting_source_events WHERE book_id=$1", [f.book])).rows[0].n).toBe(3);
    expect((await sql("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='cancelled'", [first.id])).rows[0].n).toBe(1);
    await expect(sql("UPDATE accounting_journals SET status='draft' WHERE id=$1", [first.id])).rejects.toThrow("immutable");
    await expect(service.prepareReversal(f.book, f.branch, f.preparer, original.id, "2026-10-13", "Another conflicting reversal")).rejects.toMatchObject({ code: "DUPLICATE_CONFLICT" });
  });
  it("6D refuses close without source/reconciliation evidence or with pending drafts", async () => {
    const f = await fixture();
    await expect(service.changePeriod(f.book, f.owner, f.period, "close", { ...review, sourceCoverageComplete: false })).rejects.toMatchObject({ code: "CLOSE_REVIEW_REQUIRED" });
    const j = await service.prepareJournal(f.preparer, input(f));
    await expect(service.changePeriod(f.book, f.owner, f.period, "close", review)).rejects.toMatchObject({ code: "DRAFTS_PENDING" });
    await service.cancelDraft(f.book, f.branch, f.preparer, j.id, "Controlled cancelled draft");
    await service.changePeriod(f.book, f.owner, f.period, "close", review);
    await expect(service.prepareJournal(f.preparer, input(f))).rejects.toMatchObject({ code: "PERIOD_CLOSED" });
  });
  it("6D requires current audit and permission for direct-SQL close/reopen", async () => {
    const f = await fixture();
    await expect(sql("UPDATE accounting_periods SET status='closed' WHERE id=$1", [f.period])).rejects.toThrow("Audited");
    await service.changePeriod(f.book, f.owner, f.period, "close", review);
    await expect(service.changePeriod(f.book, f.approver, f.period, "reopen", review)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.changePeriod(f.book, f.owner, f.period, "reopen", { ...review, evidence: "Owner-authorised audited correction window" });
    expect((await sql("SELECT status FROM accounting_periods WHERE id=$1", [f.period])).rows[0].status).toBe("open");
  });
  it("6D serializes prepare against close: never creates a draft in a closed period", async () => {
    const f = await fixture();
    const results = await Promise.allSettled([service.prepareJournal(f.preparer, input(f)), service.changePeriod(f.book, f.owner, f.period, "close", review)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await sql(`SELECT count(*)::int n FROM accounting_journals j JOIN accounting_periods p ON p.id=j.period_id
      WHERE j.book_id=$1 AND p.status='closed' AND j.status='draft'`, [f.book])).rows[0].n).toBe(0);
  });
  it("6D serializes post against close: close cannot pass before a pending journal posts", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    const results = await Promise.allSettled([service.approveAndPost(f.book, f.branch, f.approver, j.id, "Independent approval"),
      service.changePeriod(f.book, f.owner, f.period, "close", review)]);
    expect(results[0].status).toBe("fulfilled");
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("posted");
    if (results[1].status === "rejected") await service.changePeriod(f.book, f.owner, f.period, "close", review);
    expect((await sql("SELECT status FROM accounting_periods WHERE id=$1", [f.period])).rows[0].status).toBe("closed");
  });
  it("6E rejects self approval even for Super Admin and refuses generic finance/operations access", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.owner, input(f));
    await expect(service.approveAndPost(f.book, f.branch, f.owner, j.id, "Owner self-approval attempt")).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    await expect(service.prepareJournal(f.approver, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.prepareJournal(f.operations, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("6E honours grants/revocations, rejects disabled/invalid users and preserves branch isolation", async () => {
    const f = await fixture();
    await service.grantAccess(f.book, f.branch, f.owner, f.operations, "prepare", "Explicit isolated owner approval for this preparer");
    const j = await service.prepareJournal(f.operations, input(f)); expect(j.prepared_by).toBe(f.operations);
    await service.revokeAccess(f.book, f.branch, f.owner, f.operations, "prepare", "Revoked after controlled permission test");
    const accessAudit = (await sql("SELECT action,reason FROM accounting_audit WHERE book_id=$1 AND action IN ('access_granted','access_revoked') ORDER BY id", [f.book])).rows;
    expect(accessAudit.map(a => ({ action: a.action, ...JSON.parse(a.reason) }))).toEqual([
      { action: "access_granted", targetUserId: f.operations, permission: "prepare", evidence: "Explicit isolated owner approval for this preparer" },
      { action: "access_revoked", targetUserId: f.operations, permission: "prepare", reason: "Revoked after controlled permission test" },
    ]);
    await expect(service.prepareJournal(f.operations, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await sql("UPDATE users SET is_active=false WHERE id=$1", [f.preparer]);
    await expect(service.prepareJournal(f.preparer, input(f))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await sql("UPDATE users SET workspace_access='invalid' WHERE id=$1", [f.approver]);
    await expect(service.approveAndPost(f.book, f.branch, f.approver, j.id, "Invalid profile")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await fixture();
    await expect(service.readJournal(f.book, f.branch, other.preparer, j.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.grantAccess(f.book, f.branch, f.owner, other.preparer, "read", "Invalid branch grant attempt")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("6E also denies invalid specialist profiles at the database permission boundary", async () => {
    const f = await fixture();
    await sql("UPDATE users SET workspace_access='[]' WHERE id=$1", [f.preparer]);
    expect((await sql("SELECT accounting_has_grant($1,$2,$3,'prepare') allowed", [f.book, f.branch, f.preparer])).rows[0].allowed).toBe(false);
    await sql(`UPDATE users SET workspace_access='["accounts","accounts"]' WHERE id=$1`, [f.preparer]);
    expect((await sql("SELECT accounting_has_grant($1,$2,$3,'prepare') allowed", [f.book, f.branch, f.preparer])).rows[0].allowed).toBe(true);
    expect((await service.prepareJournal(f.preparer, input(f))).prepared_by).toBe(f.preparer);
    const other = await fixture();
    await expect(sql(`INSERT INTO accounting_audit(book_id,branch_id,actor_id,period_id,action,reason)
      VALUES($1,$2,$3,$4,'bad_link','Controlled cross-book audit attempt')`, [f.book, f.branch, f.owner, other.period])).rejects.toThrow();
  });
  it("6E audits cancellation of an abandoned draft without forcing a wrong posting", async () => {
    const f = await fixture(); const j = await service.prepareJournal(f.preparer, input(f));
    await expect(service.cancelDraft(f.book, f.branch, f.approver, j.id, "No prepare/configure grant")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await sql("UPDATE users SET is_active=false WHERE id=$1", [f.preparer]);
    await service.cancelDraft(f.book, f.branch, f.owner, j.id, "Abandoned dummy draft; owner has explicit prepare/configure grants");
    expect((await sql("SELECT status FROM accounting_journals WHERE id=$1", [j.id])).rows[0].status).toBe("cancelled");
    expect((await sql("SELECT actor_id FROM accounting_audit WHERE journal_id=$1 AND action='cancelled'", [j.id])).rows[0].actor_id).toBe(f.owner);
    const second = await service.prepareJournal(f.owner, input(f));
    await expect(sql("UPDATE accounting_journals SET status='cancelled' WHERE id=$1", [second.id])).rejects.toThrow("cancellation requires");
  });
  it("6E requires all-branch configuration for a shared book chart and calendar", async () => {
    const f = await fixture();
    const second = (await sql("INSERT INTO branches(name) VALUES('Second isolated legal-book branch') RETURNING id")).rows[0].id;
    await sql("INSERT INTO accounting_book_branches VALUES($1,$2)", [f.book, second]);
    await expect(service.addAccount(f.book, f.branch, f.owner, "6000", "Shared overhead", "expense")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.createPeriod(f.book, f.branch, f.owner, "November", "2026-11-01", "2026-11-30")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await service.grantAccess(f.book, second, f.owner, f.owner, "configure", "Explicit shared-book calendar/chart responsibility");
    expect(await service.addAccount(f.book, f.branch, f.owner, "6000", "Shared overhead", "expense")).toBeGreaterThan(0);
    expect(await service.createPeriod(f.book, f.branch, f.owner, "November", "2026-11-01", "2026-11-30")).toBeGreaterThan(0);
  });
});
