import { z } from "zod";
import { accountingDate, moneyToMinor, minorToMoney, requireAccounting } from "./accounting-rules.js";
import { stableEvidence } from "./accounting-operational-mapping.js";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const reference = z.string().trim().min(1).max(300);
export const taxCodeSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_-]{0,19}$/), name: reference,
  treatment: z.enum(["taxable", "zero_rated", "exempt"]),
  rate: z.string().regex(/^(0|[1-9]\d?|100)(\.\d{1,2})?$/),
  recoverablePercent: z.string().regex(/^(0|[1-9]\d?|100)(\.\d{1,2})?$/),
  basisEvidence: reference,
}).strict();
export const taxConfigurationSchema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/), policyVersion: reference,
  effectiveFrom: z.string(), ownerEvidence: reference, accountantEvidence: reference,
  inputVatAccountId: id, outputVatAccountId: id,
  dutyAccountId: id, shippingAccountId: id, terminalAccountId: id,
  codes: z.array(taxCodeSchema).min(3).max(12),
}).strict();
export type TaxConfiguration = z.infer<typeof taxConfigurationSchema>;
export type TaxCode = TaxConfiguration["codes"][number];
export const purchaseTaxSchema = z.object({configurationId:id,code:z.string(),
  basis:z.enum(["inclusive","exclusive"]),amount:z.string(),evidence:reference}).strict();
export type PurchaseTaxReview = z.infer<typeof purchaseTaxSchema>;
export const invoiceTaxSchema = z.object({configurationId:id,evidence:reference,
  items:z.array(z.object({itemId:id,code:z.string()}).strict()).min(1).max(150)}).strict();
export type InvoiceTaxReview = z.infer<typeof invoiceTaxSchema>;
export type TaxSplit = {net:string;vat:string;gross:string;recoverable:string;nonRecoverable:string};
export type PurchaseTaxMapping = PurchaseTaxReview & {rule:TaxCode;inputVatAccountId:number};
export type InvoiceTaxMapping = InvoiceTaxReview & {rules:TaxCode[]};

const rounded = (numerator:bigint, denominator:bigint) => (numerator + denominator/2n)/denominator;
export function percentage(value:string) {
  const result=moneyToMinor(value);
  requireAccounting(result<=10000n,"INVALID_TAX","Percentage must be between zero and 100");
  return result;
}
export function validateTaxConfiguration(value:unknown):TaxConfiguration {
  const config=taxConfigurationSchema.parse(value);accountingDate(config.effectiveFrom);
  requireAccounting(new Set(config.codes.map(c=>c.code)).size===config.codes.length,"INVALID_TAX","Tax codes must be unique");
  requireAccounting(["taxable","zero_rated","exempt"].every(t=>config.codes.some(c=>c.treatment===t)),"INVALID_TAX","Taxable, zero-rated and exempt must be separate codes");
  requireAccounting(new Set([config.inputVatAccountId,config.outputVatAccountId,config.dutyAccountId,config.shippingAccountId,config.terminalAccountId]).size===5,
    "INVALID_MAPPING","Separate input/output VAT and Duty/Shipping/Terminal heads are required");
  for(const code of config.codes) {
    const rate=percentage(code.rate), recovery=percentage(code.recoverablePercent);
    requireAccounting((code.treatment==="taxable") === (rate>0n),"INVALID_TAX","Only taxable codes have a positive VAT rate");
    requireAccounting(code.treatment==="taxable"||recovery===0n,"INVALID_TAX","Zero VAT cannot create an input VAT recovery");
  }
  return config;
}
export function calculateVat(amount:string,basis:"inclusive"|"exclusive",rule:TaxCode):TaxSplit {
  taxCodeSchema.parse(rule);const value=moneyToMinor(amount),rate=percentage(rule.rate),recoverable=percentage(rule.recoverablePercent);
  requireAccounting(["inclusive","exclusive"].includes(basis) && (rule.treatment==="taxable") === (rate>0n)
    && (rule.treatment==="taxable"||recoverable===0n),"INVALID_TAX","Valid explicit VAT treatment/basis required");
  const vat=rate===0n?0n:rounded(value*rate,basis==="inclusive"?10000n+rate:10000n);
  const gross=basis==="inclusive"?value:value+vat, net=gross-vat, recovery=rounded(vat*recoverable,10000n);
  return {net:minorToMoney(net),vat:minorToMoney(vat),gross:minorToMoney(gross),recoverable:minorToMoney(recovery),nonRecoverable:minorToMoney(vat-recovery)};
}
export function purchaseSplit(tax:PurchaseTaxMapping,gross:string) {
  const review=purchaseTaxSchema.parse({configurationId:tax.configurationId,code:tax.code,basis:tax.basis,amount:tax.amount,evidence:tax.evidence});
  requireAccounting(review.code===tax.rule.code,"INVALID_TAX","Selected tax code must match its approved rule");
  const result=calculateVat(review.amount,review.basis,tax.rule);
  requireAccounting(result.gross===minorToMoney(moneyToMinor(gross)),"TAX_SOURCE_MISMATCH","VAT split must equal the recorded full payment; never add VAT to cash a second time");
  return result;
}
export function directExpenseHead(kind:string,section:unknown) {
  if(kind==="duty_payment")return "dutyAccountId" as const;
  requireAccounting(kind==="container_payment","INVALID_SOURCE","Only duty/container cost facts use direct-expense mappings");
  if(section==="shipping")return "shippingAccountId" as const;
  if(section==="terminal")return "terminalAccountId" as const;
  requireAccounting(false,"SOURCE_REVIEW_REQUIRED","Other container sections require their own reviewed mapping; do not guess Duty/Shipping/Terminal");
}
export function sameTaxRule(a:unknown,b:unknown){
  const ordered=(v:unknown)=>Array.isArray(v)?[...v].sort((x,y)=>String(x.code).localeCompare(String(y.code))):v;
  return stableEvidence(ordered(a))===stableEvidence(ordered(b));
}
