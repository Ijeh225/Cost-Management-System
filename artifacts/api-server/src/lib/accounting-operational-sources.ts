import type { pool } from "@workspace/db";
import { createHash } from "node:crypto";
import { moneyToMinor, minorToMoney, requireAccounting } from "./accounting-rules.js";
import { financialDateKey } from "./financial-reporting.js";
import { operationalEventKey, type OperationalRef, type OperationalSource } from "./accounting-operational-mapping.js";
async function connect(database: Pick<typeof pool,"connect">) { return database.connect(); }
type Client=Awaited<ReturnType<typeof connect>>;
const date=(value:Date|string)=>financialDateKey(new Date(value));
const signed=(amount:string)=>amount.startsWith("-") ? -moneyToMinor(amount.slice(1)) : moneyToMinor(amount);
const digest=(value:unknown)=>createHash("sha256").update(String(value ?? "")).digest("hex");

// Reads/locks existing facts only. No operational data, status or balances are written.
export async function readOperationalSource(client:Client,branchId:number,ref:OperationalRef,bookId?:number):Promise<OperationalSource> {
  operationalEventKey(ref);
  const datedTables=new Map([...["credit_notes","invoice_audit_log","overhead_expenses","overhead_expense_topups","bank_fund_additions","bank_transfers"].map(t=>[t,"created_at"] as const),
    ...["invoice_payments","duty_payment_transactions","container_expense_payments","expense_payments","payment_schedule_payments"].map(t=>[t,"paid_at"] as const)]);
  const row=async(table:string,id=ref.id)=>{
    const time=datedTables.get(table);
    const value=(await client.query(`SELECT *${time ? `,${time} AT TIME ZONE 'UTC' AS ${time}` : ""} FROM ${table} WHERE id=$1 AND branch_id=$2 FOR SHARE`,[id,branchId])).rows[0];
    requireAccounting(value,"NOT_FOUND","Source not found in this branch"); return value;
  };
  const parentInvoice=async(id:number)=>{
    const invoice=await row("invoices",id);
    requireAccounting(["sent","partial","paid","overdue","written_off"].includes(invoice.status),"SOURCE_REVIEW_REQUIRED","Issued non-cancelled invoice required");
    const customer=(await client.query("SELECT branch_id FROM clients WHERE id=$1 FOR SHARE",[invoice.client_id])).rows[0];
    requireAccounting(customer?.branch_id===branchId,"SOURCE_REVIEW_REQUIRED","Linked customer must belong to this branch");
    return invoice;
  };
  const bank=async(id:number|null|undefined)=>{
    if(id!=null) await row("banks",id);
  };
  const source=(amount:string,when:Date|string,facts:Record<string,unknown>,extra:Partial<OperationalSource>={}):OperationalSource=>
    ({kind:ref.kind,id:ref.id,branchId,amount:amount.startsWith("-") ? `-${minorToMoney(moneyToMinor(amount.slice(1)))}` : minorToMoney(moneyToMinor(amount)),
      accountingDate:date(when),facts:{...facts,recordedAt:new Date(when).toISOString()},dependencies:[],...extra});
  if(ref.kind==="credit_note") {
    const note=await row("credit_notes"); const invoice=await parentInvoice(note.invoice_id);
    requireAccounting(note.status==="active" && moneyToMinor(note.amount)>0n,"SOURCE_REVIEW_REQUIRED","Active positive credit note required");
    const adjustments=(await client.query(`SELECT * FROM invoice_payments WHERE invoice_id=$1 AND reference=$2
      AND payment_method='credit_note' ORDER BY id FOR SHARE`,[invoice.id,note.credit_note_number])).rows;
    requireAccounting(adjustments.length<=1 && adjustments.every(p=>p.branch_id===branchId && p.bank_id===null
      && p.source_deposit_id===null && p.entry_type==='payment' && moneyToMinor(p.amount)>0n),
    "SOURCE_REVIEW_REQUIRED","Unambiguous linked non-cash credit-note adjustment required");
    const applied=adjustments.reduce((sum,p)=>sum+moneyToMinor(p.amount),0n), gross=moneyToMinor(note.amount);
    requireAccounting(applied<=gross,"SOURCE_REVIEW_REQUIRED","Credit adjustment cannot exceed its note");
    const notes=(await client.query("SELECT id,amount FROM credit_notes WHERE invoice_id=$1 AND status='active' ORDER BY id FOR SHARE",[invoice.id])).rows;
    requireAccounting(notes.reduce((sum,n)=>sum+moneyToMinor(n.amount),0n)<=moneyToMinor(invoice.total),"SOURCE_REVIEW_REQUIRED","Active notes exceed original invoice");
    return source(note.amount,note.created_at,{number:note.credit_note_number,reasonHash:digest(note.reason),adjustmentId:adjustments[0]?.id ?? null},
      {invoiceId:invoice.id,clientId:invoice.client_id,applied:minorToMoney(applied),excess:minorToMoney(gross-applied),dependencies:[`source:invoice:${invoice.id}:v1`]});
  }
  if(ref.kind==="client_credit_application") {
    const p=await row("invoice_payments"); const invoice=await parentInvoice(p.invoice_id);
    requireAccounting(p.payment_method==="credit" && p.bank_id===null && p.source_deposit_id===null && ["payment","reversal"].includes(p.entry_type),
      "SOURCE_REVIEW_REQUIRED","Explicit non-cash client-credit fact required");
    if(invoice.status==="written_off") {
      const audit=(await client.query("SELECT created_at AT TIME ZONE 'UTC' AS created_at FROM invoice_audit_log WHERE invoice_id=$1 AND action='written_off'",[invoice.id])).rows;
      requireAccounting(Number.isSafeInteger(bookId),"SOURCE_REVIEW_REQUIRED","Selected accounting book required for written-off credit history");
      const posted=(await client.query("SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND event_key=$3 AND status='posted'",
        [bookId,branchId,operationalEventKey(ref)])).rows[0];
      const writtenOff=(await client.query(`SELECT id FROM accounting_journals WHERE book_id=$1 AND branch_id=$2 AND status='posted'
        AND event_key IN (SELECT 'source:invoice_writeoff:'||id||':v1' FROM invoice_audit_log WHERE invoice_id=$3 AND action='written_off')`,
        [bookId,branchId,invoice.id])).rows[0];
      requireAccounting(audit.length===1 && new Date(p.paid_at)<=new Date(audit[0].created_at) && (!writtenOff || posted),
        "SOURCE_REVIEW_REQUIRED","Only dated pre-writeoff credit use before native writeoff, or an already-posted credit, is supported; no invented recovery");
    }
    let originalKey:string|undefined;
    if(p.entry_type==="reversal") {
      const original=await row("invoice_payments",p.reversal_of_payment_id);
      requireAccounting(original.invoice_id===p.invoice_id && original.entry_type==="payment" && original.payment_method==="credit"
        && original.bank_id===null && original.source_deposit_id===null && signed(original.amount)>0n
        && signed(original.amount)===-signed(p.amount) && new Date(original.paid_at)<=new Date(p.paid_at),"INVALID_REVERSAL","Matching full client-credit reversal required");
      originalKey=`source:invoice_payment:${original.id}:v1`;
    }
    return source(p.amount,p.paid_at,{paymentMethod:p.payment_method,entryType:p.entry_type,reference:p.reference ?? null},
      {invoiceId:invoice.id,clientId:invoice.client_id,bankId:null,originalKey,dependencies:[`source:invoice:${invoice.id}:v1`]});
  }
  if(ref.kind==="invoice_writeoff") {
    const audit=await row("invoice_audit_log"); const invoice=await parentInvoice(audit.invoice_id);
    const audits=(await client.query("SELECT id FROM invoice_audit_log WHERE invoice_id=$1 AND action='written_off' FOR SHARE",[invoice.id])).rows;
    requireAccounting(audit.action==="written_off" && audits.length===1 && invoice.status==="written_off"
      && invoice.written_off_amount && moneyToMinor(invoice.written_off_amount)>0n,"SOURCE_REVIEW_REQUIRED","One dated audit and stored write-off amount required; no prose amount parsed");
    return source(invoice.written_off_amount,audit.created_at,{auditHash:digest(audit.details)},
      {invoiceId:invoice.id,clientId:invoice.client_id,dependencies:[`source:invoice:${invoice.id}:v1`]});
  }
  if(["duty_payment","container_payment"].includes(ref.kind)) {
    const p=await row(ref.kind==="duty_payment" ? "duty_payment_transactions" : "container_expense_payments");
    await row("containers",p.container_id); await bank(p.bank_id);
    let originalKey:string|undefined;
    if(ref.kind==="duty_payment") {
      requireAccounting(["payment","reversal"].includes(p.entry_type),"SOURCE_REVIEW_REQUIRED","Known duty payment fact required");
      if(p.entry_type==="reversal") {
        const original=await row("duty_payment_transactions",p.reversal_of_transaction_id);
        requireAccounting(original.entry_type==="payment" && original.container_id===p.container_id && original.bank_id===p.bank_id
          && original.payment_method===p.payment_method && signed(original.amount)===-signed(p.amount)
          && new Date(original.paid_at)<=new Date(p.paid_at),"INVALID_REVERSAL","Matching full dated duty reversal required");
        originalKey=`source:duty_payment:${original.id}:v1`;
      }
    }
    return source(p.amount,p.paid_at,{paymentMethod:p.payment_method,section:p.section ?? null,categoryId:p.category_id ?? null,
      reference:p.reference ?? null,narrationHash:digest(p.narration ?? p.notes),entryType:p.entry_type ?? "payment"},
    {containerId:p.container_id,bankId:p.bank_id,originalKey});
  }
  const overhead=async(id:number)=>{
    const e=await row("overhead_expenses",id);
    requireAccounting(e.category?.trim() && e.description?.trim() && e.category!=="Bad Debt","SOURCE_REVIEW_REQUIRED","Real classified overhead bill required; write-offs use their own source");
    const topups=(await client.query("SELECT *,created_at AT TIME ZONE 'UTC' AS created_at FROM overhead_expense_topups WHERE expense_id=$1 ORDER BY id FOR SHARE",[id])).rows;
    requireAccounting(topups.every(t=>t.branch_id===branchId && moneyToMinor(t.amount)>0n && new Date(t.created_at)>=new Date(e.created_at)),"SOURCE_REVIEW_REQUIRED","Valid dated own-branch top-ups required");
    const base=moneyToMinor(e.amount)-topups.reduce((sum,t)=>sum+moneyToMinor(t.amount),0n);
    requireAccounting(base>0n,"SOURCE_REVIEW_REQUIRED","Positive original obligation must reconcile to header less top-ups");
    const payments=(await client.query("SELECT p.*,p.paid_at AT TIME ZONE 'UTC' AS paid_at FROM expense_payments p WHERE p.expense_id=$1 ORDER BY p.paid_at,p.id FOR SHARE OF p",[id])).rows;
    requireAccounting(payments.every(p=>p.branch_id===branchId && signed(p.amount)>0n)
      && payments.reduce((sum,p)=>sum+signed(p.amount),0n)<=moneyToMinor(e.amount)
      && (!e.paid_at || payments.length>0),"SOURCE_REVIEW_REQUIRED","Legacy/header-only or excess payments need review; no synthetic cash fact");
    return {e,topups,base,payments};
  };
  if(ref.kind==="overhead" || ref.kind==="overhead_topup") {
    const t=ref.kind==="overhead_topup" ? await row("overhead_expense_topups") : null;
    requireAccounting(!t || Number.isSafeInteger(t.expense_id) && t.expense_id>0,"SOURCE_REVIEW_REQUIRED","Top-up must link a real bill");
    const {e,base}=await overhead(t?.expense_id ?? ref.id);
    return source(t?.amount ?? minorToMoney(base),t?.created_at ?? e.created_at,
      {category:e.category,descriptionHash:digest(t?.description ?? e.description),reference:e.reference ?? null},
      {expenseId:e.id,category:e.category,dependencies:t ? [`source:overhead:${e.id}:v1`] : []});
  }
  if(ref.kind==="expense_payment") {
    const p=await row("expense_payments"); const {e,topups,payments}=await overhead(p.expense_id); await bank(p.bank_id);
    if(p.payment_schedule_id!=null) {
      const schedule=await row("payment_schedules",p.payment_schedule_id);
      requireAccounting(schedule.overhead_expense_id===e.id,"SOURCE_REVIEW_REQUIRED","Schedule must link this obligation; no duplicate standalone payment");
    }
    const dueTopups=topups.filter(t=>new Date(t.created_at)<=new Date(p.paid_at));
    const prior=payments.filter(v=>new Date(v.paid_at)<new Date(p.paid_at) || +new Date(v.paid_at)===+new Date(p.paid_at) && v.id<p.id);
    return source(p.amount,p.paid_at,{paymentMethod:p.payment_method,paymentScheduleId:p.payment_schedule_id ?? null,notesHash:digest(p.notes)},
      {expenseId:e.id,category:e.category,bankId:p.bank_id,dependencies:[`source:overhead:${e.id}:v1`,
        ...dueTopups.map(t=>`source:overhead_topup:${t.id}:v1`),...prior.map(v=>`source:expense_payment:${v.id}:v1`)]});
  }
  if(ref.kind==="schedule_payment") {
    const p=await row("payment_schedule_payments"); const schedule=await row("payment_schedules",p.schedule_id); await bank(p.bank_id);
    requireAccounting(schedule.overhead_expense_id===null,"DUPLICATE_SOURCE","Overhead schedules use expense_payments only");
    requireAccounting(["operating_expense","asset","advance","loan_repayment","other_non_expense"].includes(p.classification)
      && p.classification_reason?.trim() && p.classified_at && (p.classification!=="operating_expense" || p.expense_head?.trim()),
    "SOURCE_REVIEW_REQUIRED","Recorded approved classification/head required; preserve unknown historical payments");
    const payments=(await client.query("SELECT id,amount,branch_id FROM payment_schedule_payments WHERE schedule_id=$1 ORDER BY id FOR SHARE",[schedule.id])).rows;
    requireAccounting(payments.every(v=>v.branch_id===branchId && signed(v.amount)>0n)
      && payments.reduce((sum,v)=>sum+signed(v.amount),0n)<=moneyToMinor(schedule.amount_approved)
      && moneyToMinor(schedule.amount_approved)>0n,"SOURCE_REVIEW_REQUIRED","Immutable standalone payments must not exceed approved amount");
    return source(p.amount,p.paid_at,{paymentMethod:p.payment_method,scheduleId:p.schedule_id,classificationVersion:p.classification_version,
      expenseHead:p.expense_head ?? null,classificationHash:digest(p.classification_reason),reference:p.reference ?? null},
      {bankId:p.bank_id,classification:p.classification});
  }
  if(ref.kind==="bank_funding") {
    const p=await row("bank_fund_additions"); await bank(p.bank_id);
    if(p.writeoff_audit_id!=null) {
      const audit=await row('invoice_audit_log',p.writeoff_audit_id);
      const invoice=await parentInvoice(audit.invoice_id);
      requireAccounting(audit.action==='written_off'&&invoice.status==='written_off'&&invoice.written_off_amount
        &&date(p.created_at)>=date(audit.created_at),'SOURCE_REVIEW_REQUIRED','Dated original written-off debt required for recovery');
      const recoveries=(await client.query('SELECT id,amount FROM bank_fund_additions WHERE writeoff_audit_id=$1 AND branch_id=$2 FOR SHARE',[audit.id,branchId])).rows;
      const net=recoveries.reduce((s,r)=>s+signed(r.amount),0n);
      requireAccounting(net>=0n&&net<=moneyToMinor(invoice.written_off_amount),'CONTROL_MISMATCH','Net debt recoveries exceed written-off amount');
      let originalKey:string|undefined;
      if(p.reversal_of_funding_id!=null) {
        const original=await row('bank_fund_additions',p.reversal_of_funding_id);
        requireAccounting(original.writeoff_audit_id===audit.id&&original.reversal_of_funding_id==null
          &&original.bank_id===p.bank_id&&signed(original.amount)>0n&&signed(original.amount)===-signed(p.amount)
          &&new Date(original.created_at)<=new Date(p.created_at),'INVALID_REVERSAL','Matching full recovery and bank required');
        originalKey=`source:bank_funding:${original.id}:v1`;
      }
      return source(p.amount,p.created_at,{reference:p.reference??null,narrationHash:digest(p.narration),
        recoveryInvoiceId:invoice.id,writeoffAuditId:audit.id,writeoffAuditHash:digest(audit.details)},
        {bankId:p.bank_id,classification:'bad_debt_recovery',originalKey,dependencies:[`source:invoice_writeoff:${audit.id}:v1`]});
    }
    return source(p.amount,p.created_at,{reference:p.reference ?? null,narrationHash:digest(p.narration)}, {bankId:p.bank_id});
  }
  const transfer=await row("bank_transfers");
  requireAccounting(transfer.from_bank_id!=null && transfer.to_bank_id!=null && transfer.from_bank_id!==transfer.to_bank_id,"SOURCE_REVIEW_REQUIRED","Two existing distinct banks required");
  await bank(transfer.from_bank_id); await bank(transfer.to_bank_id);
  return source(transfer.amount,transfer.created_at,{reference:transfer.reference ?? null,narrationHash:digest(transfer.narration)},
    {fromBankId:transfer.from_bank_id,toBankId:transfer.to_bank_id});
}
