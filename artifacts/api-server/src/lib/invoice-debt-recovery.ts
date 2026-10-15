import { z } from 'zod';
import type { pool } from '@workspace/db';
import { accountingDate, moneyToMinor, minorToMoney, requireAccounting } from './accounting-rules.js';
import { financialDateKey } from './financial-reporting.js';
import { normaliseBankReference } from './bank-reference-guard.js';

export const recoveryRequest = z.object({
  amount:z.string().regex(/^(0|[1-9]\d{0,12})(\.\d{1,2})?$/).refine(v=>Number(v)>0,'Positive amount required'),
  bankId:z.number().int().positive(), date:z.string(), reference:z.string().trim().min(1).max(200),
  reason:z.string().trim().min(3).max(1000), requestId:z.string().regex(/^[A-Za-z0-9_-]{8,128}$/),
}).strict();
export type DebtRecoveryRequest = z.infer<typeof recoveryRequest>;
export const DEBT_RECOVERY_SQL = `
ALTER TABLE bank_fund_additions ADD COLUMN IF NOT EXISTS writeoff_audit_id INTEGER REFERENCES invoice_audit_log(id) ON DELETE RESTRICT;
ALTER TABLE bank_fund_additions ADD COLUMN IF NOT EXISTS reversal_of_funding_id INTEGER REFERENCES bank_fund_additions(id) ON DELETE RESTRICT;
ALTER TABLE bank_fund_additions ADD COLUMN IF NOT EXISTS recovery_request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS bank_recovery_request_key ON bank_fund_additions(recovery_request_key) WHERE recovery_request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bank_recovery_one_reversal ON bank_fund_additions(reversal_of_funding_id) WHERE reversal_of_funding_id IS NOT NULL;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='bank_fund_additions'::regclass AND conname='bank_recovery_link_check') THEN
 ALTER TABLE bank_fund_additions ADD CONSTRAINT bank_recovery_link_check CHECK
 ((writeoff_audit_id IS NULL AND reversal_of_funding_id IS NULL AND recovery_request_key IS NULL) OR
 (writeoff_audit_id IS NOT NULL AND recovery_request_key IS NOT NULL AND
 ((amount>0 AND reversal_of_funding_id IS NULL) OR (amount<0 AND reversal_of_funding_id IS NOT NULL))));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION protect_debt_recovery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.writeoff_audit_id IS NOT NULL THEN RAISE EXCEPTION 'Debt recovery evidence is immutable; use linked reversal'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.writeoff_audit_id IS NOT NULL THEN RAISE EXCEPTION 'Recovery links must be recorded on initial insertion'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS protect_debt_recovery ON bank_fund_additions;
CREATE TRIGGER protect_debt_recovery BEFORE UPDATE OR DELETE ON bank_fund_additions FOR EACH ROW EXECUTE FUNCTION protect_debt_recovery();
`;

// One bank-ledger fact, not another invoice settlement or reopened receivable.
export async function recordDebtRecovery(database:Pick<typeof pool,'connect'>,invoiceId:number,branchId:number,actorId:number,input:DebtRecoveryRequest,reverseId?:number) {
  accountingDate(input.date);
  const amount=moneyToMinor(input.amount);
  requireAccounting(amount>0n,'INVALID_MONEY','Recovery amount must be positive');
  requireAccounting(input.date<=financialDateKey(new Date()),'INVALID_DATE','Recovery date cannot be in the future');
  const client=await database.connect();
  try {
    await client.query('BEGIN');
    const invoice=(await client.query('SELECT * FROM invoices WHERE id=$1 AND branch_id=$2 FOR UPDATE',[invoiceId,branchId])).rows[0];
    requireAccounting(invoice,'NOT_FOUND','Invoice not found');
    requireAccounting(invoice.status==='written_off'&&invoice.written_off_amount&&moneyToMinor(invoice.written_off_amount)>0n,'INVALID_STATE','A recorded written-off debt is required');
    const audits=(await client.query("SELECT *,created_at AT TIME ZONE 'UTC' AS recorded_at FROM invoice_audit_log WHERE invoice_id=$1 AND branch_id=$2 AND action='written_off' ORDER BY id FOR SHARE",[invoiceId,branchId])).rows;
    requireAccounting(audits.length===1,'SOURCE_REVIEW_REQUIRED','One original write-off audit is required');
    const audit=audits[0];
    requireAccounting(input.date>=financialDateKey(new Date(audit.recorded_at)),'INVALID_DATE','Recovery cannot predate the write-off');
    const bank=(await client.query('SELECT id FROM banks WHERE id=$1 AND branch_id=$2 AND is_active FOR SHARE',[input.bankId,branchId])).rows[0];
    requireAccounting(bank,'NOT_FOUND','Choose an active bank in the invoice branch');
    const reference=normaliseBankReference(input.reference)!;
    const existing=(await client.query('SELECT * FROM bank_fund_additions WHERE recovery_request_key=$1',[input.requestId])).rows[0];
    const signedAmount=minorToMoney(reverseId?-amount:amount);
    const narration=`${reverseId?'Debt recovery reversal':'Bad debt recovery'} | invoice #${invoiceId} | ${input.reason}`;
    if(existing) {
      requireAccounting(existing.writeoff_audit_id===audit.id&&existing.branch_id===branchId&&existing.bank_id===input.bankId
        &&existing.amount===signedAmount&&existing.reference===reference&&existing.narration===narration
        &&existing.reversal_of_funding_id===(reverseId??null)&&financialDateKey(new Date(existing.created_at))===input.date,
      'DUPLICATE_CONFLICT','Request key already used with different recovery details');
      await client.query('COMMIT');return {...existing,replayed:true};
    }
    const all=(await client.query('SELECT *,created_at AT TIME ZONE \'UTC\' AS recorded_at FROM bank_fund_additions WHERE writeoff_audit_id=$1 AND branch_id=$2 ORDER BY id FOR SHARE',[audit.id,branchId])).rows;
    if(reverseId) {
      const original=all.find(r=>r.id===reverseId);
      requireAccounting(original&&Number(original.amount)>0&&original.reversal_of_funding_id===null&&original.bank_id===input.bankId
        &&moneyToMinor(original.amount)===amount&&input.date>=financialDateKey(new Date(original.recorded_at)),
      'INVALID_REVERSAL','Full original recovery, same bank and a non-earlier date required');
      requireAccounting(!all.some(r=>r.reversal_of_funding_id===reverseId),'ALREADY_REVERSED','Recovery already reversed');
    } else {
      const recovered=all.reduce((s,r)=>s+(r.amount.startsWith('-')?-moneyToMinor(r.amount.slice(1)):moneyToMinor(r.amount)),0n);
      requireAccounting(recovered+amount<=moneyToMinor(invoice.written_off_amount),'RECOVERY_EXCEEDS_DEBT','Recovery cannot exceed the remaining written-off debt');
    }
    const referenceKey=reference.toLowerCase();
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`bank-movement:${branchId}:${referenceKey}`]);
    const duplicate=(await client.query(`SELECT id FROM bank_fund_additions WHERE branch_id=$1 AND lower(btrim(reference))=$2
      UNION ALL SELECT id FROM bank_transfers WHERE branch_id=$1 AND lower(btrim(reference))=$2`,[branchId,referenceKey])).rows;
    requireAccounting(!duplicate.length,'DUPLICATE_REFERENCE','Bank movement reference already exists');
    const created=(await client.query(`INSERT INTO bank_fund_additions(bank_id,branch_id,amount,narration,reference,added_by,created_at,writeoff_audit_id,reversal_of_funding_id,recovery_request_key)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[input.bankId,branchId,signedAmount,narration,reference,actorId,input.date===financialDateKey(new Date())?new Date():`${input.date}T12:00:00Z`,audit.id,reverseId??null,input.requestId])).rows[0];
    await client.query(`INSERT INTO invoice_audit_log(invoice_id,branch_id,action,details,performed_by)
      VALUES($1,$2,$3,$4,$5)`,[invoiceId,branchId,reverseId?'debt_recovery_reversed':'debt_recovered',`Bank source #${created.id}; original write-off #${audit.id}; ${signedAmount}; ${reference}; ${input.reason}`,actorId]);
    await client.query('COMMIT');return {...created,replayed:false};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
