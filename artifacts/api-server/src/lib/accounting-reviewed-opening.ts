import { minorToMoney, moneyToMinor, normalizeJournal, requireAccounting } from "./accounting-rules.js";
import { previewOpeningBalances, type OpeningBalanceReview } from "./accounting-source-mapping.js";
import { stableEvidence } from "./accounting-operational-mapping.js";
export interface ReviewedOpening extends OpeningBalanceReview {
  controls:{accountId:number;debit:string;credit:string;evidence:string}[];
}
export function buildReviewedOpening(review:ReviewedOpening) {
  const preview=previewOpeningBalances(review);
  requireAccounting(Array.isArray(review.controls) && review.controls.length>0,"CONTROL_MISMATCH","Reviewed dated controls are required, not a balancing plug");
  const totals=new Map<number,{debit:bigint;credit:bigint}>();
  for(const line of preview.input.lines) {
    const t=totals.get(line.accountId) ?? {debit:0n,credit:0n};
    t.debit+=moneyToMinor(line.debit); t.credit+=moneyToMinor(line.credit); totals.set(line.accountId,t);
  }
  requireAccounting(new Set(review.controls.map(c=>c.accountId)).size===review.controls.length
    && review.controls.length===totals.size,"CONTROL_MISMATCH","Every opening account requires exactly one reviewed control");
  for(const c of review.controls) {
    const total=totals.get(c.accountId);
    requireAccounting(c.evidence?.trim() && total && total.debit===moneyToMinor(c.debit) && total.credit===moneyToMinor(c.credit),
      "CONTROL_MISMATCH","Opening lines must match independently reviewed exact account controls");
  }
  const canonical={...review,controls:review.controls.map(c=>({...c,debit:minorToMoney(moneyToMinor(c.debit)),credit:minorToMoney(moneyToMinor(c.credit))}))
    .sort((a,b)=>a.accountId-b.accountId),lines:review.lines.map(l=>({...l,debit:minorToMoney(moneyToMinor(l.debit)),credit:minorToMoney(moneyToMinor(l.credit))}))
    .sort((a,b)=>a.accountId-b.accountId || a.debit.localeCompare(b.debit) || a.credit.localeCompare(b.credit) || (a.memo??"").localeCompare(b.memo??""))};
  const input={...preview.input,narration:"Reviewed opening balances",evidence:stableEvidence({review:canonical}),lines:canonical.lines};
  normalizeJournal(input);
  return {...preview,input,status:"reviewed_draft" as const};
}
