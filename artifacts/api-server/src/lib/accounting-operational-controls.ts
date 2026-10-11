import type { pool } from "@workspace/db";
import { moneyToMinor, normalizeJournal, requireAccounting } from "./accounting-rules.js";
import { readOperationalSource } from "./accounting-operational-sources.js";
import { OPERATIONAL_SOURCE_KINDS, stableEvidence, type buildOperationalJournal } from "./accounting-operational-mapping.js";
async function connect(database: Pick<typeof pool,"connect">) { return database.connect(); }
type Client = Awaited<ReturnType<typeof connect>>;
type Draft = ReturnType<typeof buildOperationalJournal>;
type Posted = { id:number; event_key:string; accounting_date:string; evidence:string;
  lines:{account_id:number;debit_minor:string;credit_minor:string}[] };
const value = (row:Posted,account:number) => row.lines.filter(l=>l.account_id===account)
  .reduce((sum,l)=>sum+BigInt(l.debit_minor)-BigInt(l.credit_minor),0n);
const evidenceOf=(row:Posted):any=>{try{return JSON.parse(row.evidence);}catch{return {};}};

export async function validateOperationalControls(client:Client,bookId:number,branchId:number,draft:Draft) {
  const {source,input}=draft;
  const saved=JSON.parse(input.evidence); const mapping=saved.mapping;
  const journals=(await client.query<Posted>(`SELECT j.id,j.event_key,j.accounting_date::text,j.evidence,
    coalesce(jsonb_agg(jsonb_build_object('account_id',l.account_id,'debit_minor',l.debit_minor::text,
      'credit_minor',l.credit_minor::text) ORDER BY l.id),'[]') lines
    FROM accounting_journals j JOIN accounting_journal_lines l ON l.journal_id=j.id
    WHERE j.book_id=$1 AND j.branch_id=$2 AND j.status='posted' AND j.accounting_date<=$3::date
    GROUP BY j.id`,[bookId,branchId,input.accountingDate])).rows;
  // A retry must reconcile against the state BEFORE its own journal.
  const prior=journals.filter(j=>j.event_key!==input.eventKey); const byKey=new Map(prior.map(j=>[j.event_key,j]));
  const existedBefore=(j:Posted)=>!evidenceOf(j).source?.facts?.recordedAt
    || evidenceOf(j).source.facts.recordedAt<=source.facts.recordedAt!;
  for(const key of source.dependencies) {
    const dep=byKey.get(key);
    requireAccounting(dep,"SOURCE_NOT_POSTED","Post dated source dependencies first; do not guess opening controls");
    const evidence=JSON.parse(dep.evidence);
    if(OPERATIONAL_SOURCE_KINDS.includes(evidence.source?.kind)) {
      const current=await readOperationalSource(client,branchId,evidence.source);
      requireAccounting(stableEvidence(current)===stableEvidence(evidence.source),"SOURCE_CHANGED","Posted obligation/source facts changed; explicit correction required");
    }
  }
  let originalId:number|null=null;
  if(source.originalKey) {
    const original=byKey.get(source.originalKey);
    requireAccounting(original,"ORIGINAL_NOT_POSTED","Post the original source before its operational reversal");
    const originalEvidence=JSON.parse(original.evidence);
    requireAccounting(stableEvidence(await readOperationalSource(client,branchId,originalEvidence.source))===stableEvidence(originalEvidence.source),
      "SOURCE_CHANGED","Original source evidence changed after posting");
    const lines=normalizeJournal(input).lines;
    requireAccounting(original.lines.length===lines.length && original.lines.every((l,i)=>
      l.account_id===lines[i]!.accountId && l.debit_minor===lines[i]!.creditMinor && l.credit_minor===lines[i]!.debitMinor),
    "INVALID_REVERSAL","Operational reversal must exactly offset the originally posted accounts");
    const other=(await client.query("SELECT event_key FROM accounting_journals WHERE reversal_of=$1 AND status<>'cancelled'",[original.id])).rows[0];
    requireAccounting(!other || other.event_key===input.eventKey,"ALREADY_REVERSED","Source already has another native reversal");
    originalId=original.id;
  }
  if(source.invoiceId) {
    const invoice=byKey.get(`source:invoice:${source.invoiceId}:v1`)!;
    const original=JSON.parse(invoice.evidence);
    requireAccounting(mapping.receivableAccountId===original.mapping.receivableAccountId,"INVALID_MAPPING","Use the original invoice receivable control");
    if(source.kind==="credit_note" || source.kind==="invoice_writeoff") {
      const notes=(await client.query(`SELECT id FROM credit_notes WHERE invoice_id=$1 AND status='active'
        AND (created_at,id)<=(SELECT created_at,id FROM credit_notes WHERE id=$2)
        ORDER BY created_at,id`,[source.invoiceId,source.kind==="credit_note" ? source.id : -1])).rows;
      const requiredNotes=source.kind==="invoice_writeoff" ? (await client.query(
        "SELECT id FROM credit_notes WHERE invoice_id=$1 AND status='active'",[source.invoiceId])).rows : notes.filter(n=>n.id!==source.id);
      for(const n of requiredNotes) requireAccounting(byKey.has(`source:credit_note:${n.id}:v1`),"SOURCE_NOT_POSTED","Earlier credit notes must be posted first");
    }
    const payments=(await client.query(`SELECT id,payment_method,paid_at FROM invoice_payments WHERE invoice_id=$1
      AND paid_at<=$2::timestamp AND ($3::int IS NULL OR paid_at<$2::timestamp OR id<=$3)
      AND payment_method<>'credit_note' ORDER BY paid_at,id`,[source.invoiceId,source.facts.recordedAt,source.kind==="client_credit_application" ? source.id : null])).rows;
    const notePayments=(await client.query(`SELECT id,created_at FROM credit_notes WHERE invoice_id=$1 AND status='active'
      AND created_at<=$2::timestamp`,[source.invoiceId,source.facts.recordedAt])).rows;
    const included=new Set([invoice.event_key,...payments.map(p=>`source:invoice_payment:${p.id}:v1`),...notePayments.map(n=>`source:credit_note:${n.id}:v1`)]);
    const balance=prior.filter(j=>included.has(j.event_key)).reduce((sum,j)=>sum+value(j,mapping.receivableAccountId),0n);
    const amount=moneyToMinor(source.amount.replace(/^-/,""));
    if(!source.originalKey) {
      const required=source.kind==="invoice_writeoff" ? payments : payments.filter(p=>source.kind!=="client_credit_application" || p.id!==source.id);
      for(const p of required) requireAccounting(byKey.has(`source:invoice_payment:${p.id}:v1`),"SOURCE_NOT_POSTED","Earlier invoice settlements must be reconciled first");
      requireAccounting(balance >= (source.kind==="credit_note" ? moneyToMinor(source.applied) : amount),"CONTROL_MISMATCH","Adjustment exceeds posted outstanding receivable");
      if(source.kind==="invoice_writeoff") requireAccounting(balance===amount,"CONTROL_MISMATCH","Stored write-off must exactly equal the reconciled outstanding receivable");
    }
    if(source.kind==="credit_note") {
      requireAccounting(mapping.clientCreditAccountId==null || mapping.clientCreditAccountId!==original.mapping.vatAccountId,
        "INVALID_MAPPING","Client excess credit is not the VAT control");
      const reductions=[...mapping.reductions,...(moneyToMinor(mapping.vatReduction ?? "0")>0n ?
        [{accountId:mapping.vatAccountId,amount:mapping.vatReduction}] : [])];
      const accounts=new Set<number>(reductions.map((r:{accountId:number})=>r.accountId));
      for(const account of accounts) {
        const capacity=-value(invoice,account);
        const previous=prior.filter(j=>evidenceOf(j).source?.kind==="credit_note"
          && evidenceOf(j).source.invoiceId===source.invoiceId).reduce((sum,j)=>sum+value(j,account),0n);
        const requested=reductions.filter((r:{accountId:number})=>r.accountId===account)
          .reduce((sum:bigint,r:{amount:string})=>sum+moneyToMinor(r.amount),0n);
        requireAccounting(capacity>0n && previous+requested<=capacity,"CONTROL_MISMATCH","Credit note cannot reduce more than the original income, client-funds or recorded VAT");
      }
      requireAccounting(mapping.vatAccountId==null || mapping.vatAccountId===original.mapping.vatAccountId,"INVALID_MAPPING","VAT correction must use the original recorded tax control");
      requireAccounting(!mapping.reductions.some((r:{accountId:number})=>r.accountId===original.mapping.vatAccountId),"INVALID_MAPPING","VAT cannot be hidden in the net credit reduction");
    }
    if(source.kind==="client_credit_application" && !source.originalKey) {
      const creditSources=prior.filter(j=>["credit_note","client_credit_application"].includes(evidenceOf(j).source?.kind)
        && evidenceOf(j).source?.clientId===source.clientId
        && (!evidenceOf(j).source.facts?.recordedAt || evidenceOf(j).source.facts.recordedAt<=source.facts.recordedAt!));
      for(const j of creditSources) {
        const original=evidenceOf(j).source;
        requireAccounting(stableEvidence(await readOperationalSource(client,branchId,original))===stableEvidence(original),
          "SOURCE_CHANGED","Client-credit originating facts changed after posting");
      }
      const credit=creditSources.reduce((sum,j)=>sum-value(j,mapping.clientCreditAccountId),0n);
      requireAccounting(credit>=amount,"CONTROL_MISMATCH","Client credit requires posted client-specific liability evidence; not a guessed wallet balance");
    }
  }
  if(source.kind==="overhead_topup" || source.kind==="expense_payment") {
    const base=byKey.get(`source:overhead:${source.expenseId}:v1`)!;
    const original=JSON.parse(base.evidence).mapping;
    requireAccounting(mapping.controlAccountId===original.controlAccountId,"INVALID_MAPPING","Bill and payments must share the original payable control");
    if(source.kind==="overhead_topup") requireAccounting(mapping.accountId===original.accountId,"INVALID_MAPPING","Top-up must use the original reviewed expense head");
    if(source.kind==="expense_payment") {
      const balance=prior.filter(j=>evidenceOf(j).source?.expenseId===source.expenseId && existedBefore(j))
        .reduce((sum,j)=>sum-value(j,mapping.controlAccountId),0n);
      requireAccounting(balance>=moneyToMinor(source.amount),"CONTROL_MISMATCH","Payment cannot exceed the posted obligation");
    }
  }
  if(source.kind==="schedule_payment" && (mapping.effect==="loan_repayment"
    || mapping.effect==="other_non_expense" && ["liability","equity"].includes(mapping.accountCategory))) {
    const available=prior.filter(existedBefore).reduce((sum,j)=>sum-value(j,mapping.accountId),0n);
    requireAccounting(available>=moneyToMinor(source.amount),"CONTROL_MISMATCH","Liability/equity reduction needs a previously posted balance, not a fabricated loan or capital withdrawal");
  }
  if(source.kind==="bank_funding" && mapping.effect==="asset_funding") {
    const available=prior.filter(existedBefore).reduce((sum,j)=>sum+value(j,mapping.accountId),0n);
    requireAccounting(available>=moneyToMinor(source.amount),"CONTROL_MISMATCH","Asset recovery requires a previously posted asset balance");
  }
  return originalId;
}
