import type { pool } from '@workspace/db';
import { financialDateKey } from './financial-reporting.js';
import { requireAccounting } from './accounting-rules.js';
import { SOURCE_REVIEW_KINDS,type SourceReviewKind } from './accounting-source-review.js';
async function connect(database:Pick<typeof pool,'connect'>){return database.connect();}
type Client=Awaited<ReturnType<typeof connect>>;
const tables={client_deposit:'client_deposits',invoice_payment:'invoice_payments',credit_note:'credit_notes',client_credit_application:'invoice_payments',
  invoice_writeoff:'invoice_audit_log',overhead:'overhead_expenses',overhead_topup:'overhead_expense_topups',expense_payment:'expense_payments',
  schedule_payment:'payment_schedule_payments',bank_funding:'bank_fund_additions',bank_transfer:'bank_transfers'} as const;

// Bounded labels only; the existing builders separately lock and verify every source/dependency before submission/posting.
export async function sourceCandidates(client:Client,bookId:number,branchId:number,kind:SourceReviewKind,id?:number) {
  requireAccounting(SOURCE_REVIEW_KINDS.includes(kind),'INVALID_SOURCE','Supported review source required');
  const extra=kind==='invoice_writeoff'?"AND s.action='written_off'":kind==='invoice_payment'?"AND s.payment_method NOT IN ('credit','credit_note')":kind==='client_credit_application'?"AND s.payment_method='credit'":"";
  const rows=(await client.query(`SELECT to_jsonb(s) facts,j.id AS journal_id,j.status AS journal_status,
    ${kind==='invoice_writeoff'?"(SELECT written_off_amount::text FROM invoices i WHERE i.id=s.invoice_id AND i.branch_id=$2)":"s.amount::text"} AS amount
    FROM ${tables[kind]} s LEFT JOIN accounting_journals j ON j.book_id=$1 AND j.branch_id=$2
      AND j.event_key='source:'||$3||':'||s.id||':v1'
    WHERE s.branch_id=$2 ${extra} ${id?'AND s.id=$4':''} ORDER BY s.id DESC LIMIT 51`,
    [bookId,branchId,kind==='client_credit_application'?'invoice_payment':kind,...(id?[id]:[])])).rows;
  const candidates=rows.slice(0,50).map(({facts:f,journal_id,journal_status,amount})=>({kind,id:f.id,amount:amount??null,
    date:financialDateKey(new Date(f.paid_at??f.created_at)),label:String(f.reference??f.credit_note_number??f.description??f.action??`${kind} #${f.id}`).slice(0,200),
    bankIds:[...new Set([f.bank_id,f.from_bank_id,f.to_bank_id].filter((v):v is number=>Number.isSafeInteger(v)&&v>0))],
    paymentMethod:f.payment_method??null,classification:f.writeoff_audit_id!=null?'bad_debt_recovery':f.classification??null,journalId:journal_id??null,journalStatus:journal_status??null}));
  return {candidates,truncated:rows.length>50};
}
