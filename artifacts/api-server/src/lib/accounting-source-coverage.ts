import type { pool } from "@workspace/db";
import { financialDateKey } from "./financial-reporting.js";
import { minorToMoney, moneyToMinor, requireAccounting } from "./accounting-rules.js";
async function connect(database: Pick<typeof pool,"connect">) { return database.connect(); }
type Client=Awaited<ReturnType<typeof connect>>;
export interface ReconciliationControl {accountId:number;debit:string;credit:string;evidence:string}
export type CoverageStatus="posted"|"missing"|"draft"|"cancelled"|"review_required"|"stale"|"excluded"|"pre_cutover";
interface CoverageItem {eventKey:string;kind:string;id:number;date:string;status:CoverageStatus;reason:string}

// Inventories real source identities, not duplicated invoice items/B/L containers.
export async function sourceCoverage(client:Client,bookId:number,branchId:number,through:string,controls:ReconciliationControl[]) {
  const book=(await client.query("SELECT * FROM accounting_books WHERE id=$1",[bookId])).rows[0];
  requireAccounting(book?.status==="approved","BOOK_NOT_APPROVED","Approved scoped book required");
  requireAccounting(Array.isArray(controls) && new Set(controls.map(c=>c.accountId)).size===controls.length,"CONTROL_MISMATCH","Distinct reviewed account controls required");
  const journals=(await client.query("SELECT id,event_key,status,accounting_date::text FROM accounting_journals WHERE book_id=$1 AND branch_id=$2",
    [bookId,branchId])).rows;
  const byKey=new Map(journals.map(j=>[j.event_key,j])); const sources:CoverageItem[]=[];
  const add=(kind:string,row:any,when:string,reason="",excluded=false)=>{
    const date=financialDateKey(new Date(row[when])); if(date>through) return;
    const eventKey=`source:${kind}:${row.id}:v1`; const journal=byKey.get(eventKey);
    const status:CoverageStatus=excluded && journal && journal.status!=="cancelled" ? "stale" : excluded ? "excluded" : reason ? "review_required" : date<book.policy.cutoverDate ? "pre_cutover"
      : journal?.accounting_date>through ? "missing" : journal?.status ?? "missing";
    sources.push({kind,id:row.id,date,eventKey,status,reason:reason || (status==="pre_cutover" ? "Requires dated reviewed opening/import coverage, not automatic historical posting" : "")});
  };
  const rows=async(table:string)=>{
    const time=["invoice_payments","duty_payment_transactions","container_expense_payments","expense_payments","payment_schedule_payments"].includes(table) ? "paid_at" : "created_at";
    return (await client.query(`SELECT *,${time} AT TIME ZONE 'UTC' AS ${time} FROM ${table} WHERE branch_id=$1 ORDER BY id`,[branchId])).rows;
  };
  for(const r of await rows("invoices")) add("invoice",r,"created_at",
    !["sent","partial","paid","overdue","written_off","draft","cancelled"].includes(r.status) ? "Unknown invoice state requires review" : "",
    ["draft","cancelled"].includes(r.status) || moneyToMinor(r.total)===0n);
  for(const r of await rows("client_deposits")) add("client_deposit",r,"created_at",r.notes?.includes("[VOIDED by wallet reset") ? "Voided deposit requires historical review" : "");
  for(const r of await rows("invoice_payments")) {
    const creditNote=r.payment_method==="credit_note";
    const linked=creditNote && (await client.query(`SELECT id FROM credit_notes WHERE branch_id=$1 AND invoice_id=$2
      AND credit_note_number=$3 AND status='active' AND amount>=$4::numeric`,[branchId,r.invoice_id,r.reference,r.amount])).rows.length===1
      && r.entry_type==="payment" && r.bank_id===null && r.source_deposit_id===null && moneyToMinor(r.amount)>0n;
    add("invoice_payment",r,"paid_at",creditNote ? linked ? "Covered by its linked credit-note identity; not a cash receipt" : "Unlinked credit-note adjustment requires review" : "",linked);
  }
  for(const r of await rows("credit_notes")) add("credit_note",r,"created_at","",r.status!=="active");
  for(const r of await rows("invoice_audit_log")) if(r.action==="written_off") add("invoice_writeoff",r,"created_at");
  for(const r of await rows("duty_payment_transactions")) add("duty_payment",r,"paid_at");
  for(const r of await rows("container_expense_payments")) add("container_payment",r,"paid_at");
  for(const r of await rows("overhead_expenses")) {
    const derived=r.category==="Bad Debt" && (await client.query(`SELECT a.id FROM invoice_audit_log a JOIN invoices i ON i.id=a.invoice_id
      WHERE a.branch_id=$1 AND i.branch_id=$1 AND a.action='written_off' AND i.invoice_number=$2 LIMIT 1`,[branchId,r.reference])).rows.length>0;
    add("overhead",r,"created_at",derived ? "Derived non-cash write-off is covered by its invoice audit, never an ordinary payable" :
      !r.category?.trim() || r.category==="Bad Debt" ? "Unclassified/orphan bad-debt obligation requires review" : "",derived);
  }
  for(const r of await rows("overhead_expense_topups")) add("overhead_topup",r,"created_at");
  for(const r of await rows("expense_payments")) add("expense_payment",r,"paid_at");
  for(const r of await rows("payment_schedule_payments")) add("schedule_payment",r,"paid_at",
    !["operating_expense","asset","advance","loan_repayment","other_non_expense"].includes(r.classification)
      ? "Historical classification requires review; unknown payments are not guessed expenses" : "");
  for(const r of await rows("bank_fund_additions")) add("bank_funding",r,"created_at");
  for(const r of await rows("bank_transfers")) add("bank_transfer",r,"created_at");
  const ids=new Set(sources.map(s=>s.eventKey));
  for(const j of journals) if(j.event_key.startsWith("source:") && j.accounting_date<=through && !ids.has(j.event_key))
    sources.push({eventKey:j.event_key,kind:"orphan",id:j.id,date:j.accounting_date,status:"stale",reason:"Native source journal has no matching scoped source fact"});
  const balances=(await client.query(`SELECT l.account_id,(sum(l.debit_minor)-sum(l.credit_minor))::text balance
    FROM accounting_journal_lines l JOIN accounting_journals j ON j.id=l.journal_id
    WHERE j.book_id=$1 AND j.branch_id=$2 AND j.status='posted' AND j.accounting_date<=$3::date GROUP BY l.account_id`,[bookId,branchId,through])).rows;
  const actual=new Map<number,bigint>(balances.map(b=>[b.account_id,BigInt(b.balance)]));
  const accountIds=(await client.query("SELECT id FROM accounting_accounts WHERE book_id=$1 AND id=ANY($2::int[])",[bookId,controls.map(c=>c.accountId)])).rows;
  requireAccounting(accountIds.length===controls.length,"INVALID_MAPPING","Control accounts must belong to this book");
  const compared=controls.map(c=>{
    requireAccounting(c.evidence?.trim(),"EVIDENCE_REQUIRED","Independent reconciliation control evidence required");
    const expected=moneyToMinor(c.debit)-moneyToMinor(c.credit); const balance=actual.get(c.accountId)??0n;
    return {...c,expected:minorToMoney(expected),actual:minorToMoney(balance),difference:minorToMoney(balance-expected)};
  });
  return {scope:"existing_supported_sources" as const,bookId,branchId,through,sources,controls:compared,
    missingControls:[...actual.keys()].filter(id=>!controls.some(c=>c.accountId===id)),
    limitations:["Professional policy/cutover approval is separate from engineering acceptance",
      "No unrecorded asset schedule, loan recovery, client-credit opening allocation or cash fact is invented",
      "Pre-cutover history requires its own independently reviewed opening/import coverage"]};
}
