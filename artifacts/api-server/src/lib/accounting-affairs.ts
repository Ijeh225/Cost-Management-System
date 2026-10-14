import { createHash } from "node:crypto";
import { z } from "zod";
import { accountingDate, minorToMoney, moneyToMinor, requireAccounting } from "./accounting-rules.js";
import { stableEvidence } from "./accounting-operational-mapping.js";

const reference = z.string().trim().min(1).max(1000);
export const affairsRequestSchema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/), asOf: z.string(), title: z.string().trim().min(1).max(200),
  scopeEvidence: reference, limitations: reference, replacesId: z.number().int().positive().refine(Number.isSafeInteger).optional(),
  lines: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), category: z.enum(["asset", "liability"]),
    name: z.string().trim().min(1).max(200), value: z.string(), bookValue: z.string().nullable(),
    basis: z.enum(["book", "estimate"]), basisExplanation: reference, evidence: reference,
  }).strict()).min(1).max(200),
}).strict();
export type AffairsRequest = z.infer<typeof affairsRequestSchema>;
export function buildAffairs(bookId:number, branchId:number, currency:string, input:AffairsRequest) {
  requireAccounting(Number.isSafeInteger(bookId)&&bookId>0&&Number.isSafeInteger(branchId)&&branchId>0&&/^[A-Z]{3}$/.test(currency),
    "INVALID_SCOPE", "One book, branch and base currency are required");
  const request = affairsRequestSchema.parse(input);
  accountingDate(request.asOf);
  requireAccounting(new Set(request.lines.map(l=>l.key)).size===request.lines.length, "DUPLICATE_LINE", "Each asset or liability needs one unique schedule identity");
  let assets=0n, liabilities=0n, bookAssets=0n, bookLiabilities=0n, estimates=0, unknownBookValues=0;
  const lines=request.lines.map(line=>{
    const value=moneyToMinor(line.value), book=line.bookValue===null?null:moneyToMinor(line.bookValue);
    requireAccounting(line.basis!=="book" || book!==null&&book===value, "BOOK_VALUE_REQUIRED", "Book-basis values need an equal declared carrying amount and supporting reference");
    if(line.category==="asset") {assets+=value;bookAssets+=book??0n;} else {liabilities+=value;bookLiabilities+=book??0n;}
    if(line.basis==="estimate") estimates++;
    if(book===null) unknownBookValues++;
    return {...line,value:minorToMoney(value),bookValue:book===null?null:minorToMoney(book)};
  }).sort((a,b)=>a.key.localeCompare(b.key));
  const payload={bookId,branchId,currency,request:{...request,lines},totals:{assets:minorToMoney(assets),liabilities:minorToMoney(liabilities),
    netAssets:minorToMoney(assets-liabilities),declaredBookAssets:minorToMoney(bookAssets),declaredBookLiabilities:minorToMoney(bookLiabilities),
    estimatedLines:estimates,unknownBookValues},
    warnings:["Valuation schedule, not a posted Balance Sheet or client statement. No ledger postings are created.",
      "Book values are supplied carrying amounts with references, not automatically reconciled or certified ledger balances.",
      "Review covers the supplied scope and evidence; it does not certify complete records, statutory or insolvency compliance.",
      ...(unknownBookValues?["Some book values are unknown; declared book subtotals are incomplete, not zero balances."]:[])]};
  return {payload,hash:createHash("sha256").update(stableEvidence(payload)).digest("hex")};
}
