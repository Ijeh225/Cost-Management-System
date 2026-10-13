import { normalizeJournal, requireAccounting, type JournalInput } from "./accounting-rules.js";

export const ADJUSTMENT_TYPES = ["accrual", "depreciation", "prepayment", "reclassification", "correction"] as const;
export type AdjustmentType = typeof ADJUSTMENT_TYPES[number];
export interface ManualAdjustment {
  requestId: string; accountingDate: string; narration: string; evidence: string;
  adjustmentType: AdjustmentType; calculationEvidence: string; evidenceReferences: string[];
  lines: JournalInput["lines"]; replacesJournalId?: number;
}
export function manualInput(bookId:number,branchId:number,currency:string,request:ManualAdjustment):JournalInput {
  requireAccounting(typeof request.requestId==="string" && /^[a-zA-Z0-9_-]{8,80}$/.test(request.requestId),"INVALID_REQUEST","Stable request identity required");
  requireAccounting(ADJUSTMENT_TYPES.includes(request.adjustmentType),"INVALID_ADJUSTMENT","Supported adjustment type required; openings use reviewed opening workflow");
  requireAccounting(typeof request.evidence==="string" && request.evidence.trim().length>0 && request.evidence.length<=1000
    && typeof request.calculationEvidence==="string" && request.calculationEvidence.trim().length>0 && request.calculationEvidence.length<=1500,
  "EVIDENCE_REQUIRED","Purpose and reviewed calculation/supporting schedule evidence required; no rates or balances are inferred");
  requireAccounting(Array.isArray(request.evidenceReferences) && request.evidenceReferences.length>=1 && request.evidenceReferences.length<=10
    && request.evidenceReferences.every(r=>typeof r==="string" && r.trim().length>0 && r.length<=100)
    && new Set(request.evidenceReferences.map(r=>r.trim())).size===request.evidenceReferences.length,"EVIDENCE_REQUIRED","One to ten distinct durable evidence references required");
  requireAccounting(request.replacesJournalId===undefined || Number.isSafeInteger(request.replacesJournalId) && request.replacesJournalId>0,"INVALID_REQUEST","Valid original draft identity required");
  const input={bookId,branchId,currency,accountingDate:request.accountingDate,eventKey:`adjustment:${request.requestId}`,
    narration:request.narration,evidence:JSON.stringify({manualReview:{adjustmentType:request.adjustmentType,evidence:request.evidence.trim(),
      calculationEvidence:request.calculationEvidence.trim(),evidenceReferences:request.evidenceReferences.map(r=>r.trim()),replacesJournalId:request.replacesJournalId??null}}),lines:request.lines};
  normalizeJournal(input);
  return input;
}
export function mappedControlAccounts(mapping:Record<string,unknown>):number[] {
  const keys=["cashAccountId","receivableAccountId","depositLiabilityAccountId","controlAccountId","vatAccountId"];
  return [...new Set([...keys.map(k=>mapping[k]),(mapping.purchaseTax as {inputVatAccountId?:number}|undefined)?.inputVatAccountId,
    ...Object.values((mapping.bankAccounts??{}) as Record<string,unknown>)])]
    .filter((id):id is number=>Number.isSafeInteger(id) && (id as number)>0);
}
