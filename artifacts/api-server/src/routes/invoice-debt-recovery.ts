import { Router } from 'express';
import { pool } from '@workspace/db';
import { requireFinanceAccess, requireBranchAdminOrAbove, getBranchScope, userCanAccessBranch, type AuthRequest } from '../lib/auth.js';
import { AccountingError } from '../lib/accounting-rules.js';
import { recoveryRequest, recordDebtRecovery } from '../lib/invoice-debt-recovery.js';

export const invoiceDebtRecoveryRouter=Router();
const path='/invoices/:id/recoveries';
invoiceDebtRecoveryRouter.use(path,requireFinanceAccess);
async function branch(req:AuthRequest) {
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)throw new AccountingError('NOT_FOUND','Invoice not found');
  const row=(await pool.query('SELECT branch_id FROM invoices WHERE id=$1',[id])).rows[0];
  if(!row||!userCanAccessBranch(req,row.branch_id))throw new AccountingError('NOT_FOUND','Invoice not found');
  return {invoiceId:id,branchId:row.branch_id};
}
function failed(res:import('express').Response,error:unknown) {
  if(error instanceof AccountingError)return res.status(error.code==='NOT_FOUND'?404:error.code==='FORBIDDEN'?403:
    ['DUPLICATE_REFERENCE','DUPLICATE_CONFLICT','ALREADY_REVERSED'].includes(error.code)?409:400).json({error:error.message,code:error.code});
  console.error('[debt recovery]',error);return res.status(500).json({error:'Unable to complete debt recovery'});
}
invoiceDebtRecoveryRouter.get(path,async(req:AuthRequest,res)=>{
  try {
    const scope=await branch(req);
    const rows=(await pool.query(`SELECT f.id,f.amount,f.bank_id AS "bankId",b.name AS "bankName",f.reference,f.narration,
      f.created_at AS "createdAt",f.reversal_of_funding_id AS "reversalOfFundingId",f.writeoff_audit_id AS "writeoffAuditId",
      u.name AS "recordedBy" FROM bank_fund_additions f JOIN invoice_audit_log a ON a.id=f.writeoff_audit_id
      JOIN banks b ON b.id=f.bank_id LEFT JOIN users u ON u.id=f.added_by
      WHERE a.invoice_id=$1 AND f.branch_id=$2 ORDER BY f.id`,[scope.invoiceId,scope.branchId])).rows;
    res.setHeader('Cache-Control','no-store');return res.json(rows);
  } catch(error){return failed(res,error);}
});
for(const reverse of [false,true])invoiceDebtRecoveryRouter.post(path+(reverse?'/:recoveryId/reverse':''),
  ...(reverse?[requireBranchAdminOrAbove]:[]),async(req:AuthRequest,res)=>{
    try {
      const input=recoveryRequest.safeParse(req.body);
      if(!input.success)return res.status(400).json({error:'Enter amount, active branch bank, date, reference, reason and request ID'});
      const scope=await branch(req);
      if(getBranchScope(req)!==scope.branchId)throw new AccountingError('FORBIDDEN','Select the invoice branch before recording recovery');
      const reverseId=reverse?Number(req.params.recoveryId):undefined;
      if(reverse&&(!Number.isSafeInteger(reverseId)||reverseId!<=0))throw new AccountingError('NOT_FOUND','Recovery not found');
      const value=await recordDebtRecovery(pool,scope.invoiceId,scope.branchId,req.user!.id,input.data,reverseId);
      return res.status(201).json({id:value.id,replayed:value.replayed});
    } catch(error){return failed(res,error);}
  });
