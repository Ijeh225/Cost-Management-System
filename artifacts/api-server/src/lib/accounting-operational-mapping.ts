import { accountingDate, moneyToMinor, minorToMoney, normalizeJournal, requireAccounting, type JournalInput } from "./accounting-rules.js";
import { purchaseSplit, type PurchaseTaxMapping } from "./accounting-tax.js";

export const OPERATIONAL_SOURCE_KINDS = ["credit_note", "client_credit_application", "invoice_writeoff", "duty_payment",
  "container_payment", "overhead", "overhead_topup", "expense_payment", "schedule_payment", "bank_funding", "bank_transfer"] as const;
export type OperationalKind = typeof OPERATIONAL_SOURCE_KINDS[number];
export type OperationalRef = { kind: OperationalKind; id: number };
export type AccountCategory = "asset" | "liability" | "equity" | "income" | "expense";
export interface OperationalSource extends OperationalRef {
  branchId: number; accountingDate: string; amount: string;
  clientId?: number; invoiceId?: number; expenseId?: number; containerId?: number;
  bankId?: number | null; fromBankId?: number; toBankId?: number;
  category?: string; classification?: string; applied?: string; excess?: string;
  originalKey?: string; dependencies: string[]; facts: Record<string, unknown>;
}
export interface OperationalMapping {
  currency: "NGN"; policyVersion: string; evidence: string;
  effect: "expense" | "recoverable" | "wip" | "asset" | "advance" | "prepayment" | "loan_repayment" | "other_non_expense"
    | "equity_funding" | "loan_funding" | "asset_funding" | "income_funding" | "liability_funding"
    | "overhead" | "credit_note" | "client_credit" | "writeoff" | "transfer";
  accountId?: number; accountCategory?: AccountCategory; controlAccountId?: number;
  receivableAccountId?: number; clientCreditAccountId?: number;
  bankAccounts?: Record<string, number>; cashAccountId?: number;
  recognitionDate?: string; recognitionEvidence?: string;
  reductions?: { accountId: number; amount: string; category: "income" | "liability"; evidence: string }[];
  vatAccountId?: number; vatReduction?: string; vatEvidence?: string;
  purchaseTax?: PurchaseTaxMapping;
}
export function operationalEventKey(ref: OperationalRef) {
  requireAccounting(OPERATIONAL_SOURCE_KINDS.includes(ref.kind) && Number.isSafeInteger(ref.id) && ref.id > 0,
    "INVALID_SOURCE", "Supported operational source and positive ID required");
  // Non-cash client-credit use belongs to the same payment row identity.
  return `source:${ref.kind === "client_credit_application" ? "invoice_payment" : ref.kind}:${ref.id}:v1`;
}
export function stableEvidence(value: unknown): string {
  const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical) : v && typeof v === "object"
    ? Object.fromEntries(Object.entries(v).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,item])=>[k,canonical(item)])) : v;
  return JSON.stringify(canonical(value));
}
export function buildOperationalJournal(bookId: number, source: OperationalSource, mapping: OperationalMapping) {
  mapping = { ...mapping, vatReduction: moneyToMinor(mapping.vatReduction ?? "0")>0n ? minorToMoney(moneyToMinor(mapping.vatReduction)) : undefined,
    reductions: mapping.reductions?.map(r => ({ ...r, amount: minorToMoney(moneyToMinor(r.amount)) }))
    .sort((a,b) => a.accountId-b.accountId || a.amount.localeCompare(b.amount) || a.evidence.localeCompare(b.evidence)) };
  const eventKey = operationalEventKey(source);
  accountingDate(source.accountingDate);
  requireAccounting(mapping.currency === "NGN" && mapping.policyVersion?.trim() && mapping.evidence?.trim(),
    "MAPPING_REQUIRED", "Reviewed currency, policy version and account treatment required");
  const negative = source.amount.startsWith("-"); const amount = moneyToMinor(negative ? source.amount.slice(1) : source.amount);
  requireAccounting(!mapping.purchaseTax || mapping.effect==="expense" && ["duty_payment","container_payment"].includes(source.kind),
    "INVALID_TAX","Purchase VAT is supported only on explicitly reviewed direct payments, not a second expense on settlement");
  requireAccounting(amount > 0n && negative === Boolean(source.originalKey), "INVALID_SOURCE", "Positive fact or linked negative reversal required");
  const requiredCategories = new Map<number, AccountCategory>();
  const lines: JournalInput["lines"] = [];
  const line = (id: number | undefined, category: AccountCategory, debit: bigint, credit: bigint) => {
    if (debit === 0n && credit === 0n) return;
    requireAccounting(Number.isSafeInteger(id) && id! > 0 && (!requiredCategories.has(id!) || requiredCategories.get(id!) === category),
      "INVALID_MAPPING", "Valid account with one consistent classification required");
    requiredCategories.set(id!, category); lines.push({ accountId: id!, debit: minorToMoney(debit), credit: minorToMoney(credit) });
  };
  const cashAccount = () => {
    const method = source.facts.paymentMethod;
    if (method === "cash") {
      requireAccounting(source.bankId === null, "SOURCE_REVIEW_REQUIRED", "Cash cannot silently carry a bank");
      return mapping.cashAccountId;
    }
    requireAccounting(["bank", "transfer", "bank_transfer", "cheque", "pos"].includes(String(method)) && source.bankId != null,
      "SOURCE_REVIEW_REQUIRED", "Supported bank method and explicit bank required");
    return mapping.bankAccounts?.[String(source.bankId)];
  };
  let cashMovement = 0n; let date = source.accountingDate;
  if (["overhead", "overhead_topup"].includes(source.kind)) {
    requireAccounting(mapping.effect === "overhead" && mapping.recognitionDate && mapping.recognitionEvidence?.trim(),
      "MAPPING_REQUIRED", "Reviewed obligation recognition date and evidence required");
    accountingDate(mapping.recognitionDate); date = mapping.recognitionDate;
    requireAccounting(date >= source.accountingDate && source.category !== "Bad Debt", "SOURCE_REVIEW_REQUIRED", "Dated real obligation required, not duplicate bad debt");
    line(mapping.accountId,"expense",amount,0n); line(mapping.controlAccountId,"liability",0n,amount);
  } else if (source.kind === "credit_note") {
    requireAccounting(mapping.effect === "credit_note" && Array.isArray(mapping.reductions) && mapping.reductions.length <= 50,
      "MAPPING_REQUIRED", "Reviewed credit-note net/tax split required");
    let total = 0n;
    for (const reduction of mapping.reductions) {
      const value=moneyToMinor(reduction.amount);
      requireAccounting(value>0n && ["income","liability"].includes(reduction.category) && reduction.evidence?.trim(), "INVALID_MAPPING", "Reviewed positive original-income/client-funds reduction required");
      line(reduction.accountId,reduction.category,value,0n); total+=value;
    }
    const vat=moneyToMinor(mapping.vatReduction ?? "0");
    if(vat>0n) {
      requireAccounting(mapping.vatEvidence?.trim() && !mapping.reductions.some(r=>r.accountId===mapping.vatAccountId), "MAPPING_REQUIRED", "Separate reviewed VAT reduction required");
      line(mapping.vatAccountId,"liability",vat,0n);
    } else requireAccounting(mapping.vatAccountId==null && mapping.vatEvidence==null,"MAPPING_REQUIRED","Do not invent a zero-VAT adjustment");
    requireAccounting(total+vat===amount,"UNBALANCED","Net plus reviewed VAT must equal the original note amount");
    const applied=moneyToMinor(source.applied), excess=moneyToMinor(source.excess);
    requireAccounting(applied+excess===amount,"SOURCE_REVIEW_REQUIRED","Linked invoice adjustment and client credit must equal the note");
    line(mapping.receivableAccountId,"asset",0n,applied); line(mapping.clientCreditAccountId,"liability",0n,excess);
  } else if (source.kind === "client_credit_application") {
    requireAccounting(mapping.effect==="client_credit","MAPPING_REQUIRED","Client-credit allocation treatment required");
    line(mapping.clientCreditAccountId,"liability",amount,0n); line(mapping.receivableAccountId,"asset",0n,amount);
  } else if (source.kind === "invoice_writeoff") {
    requireAccounting(mapping.effect==="writeoff","MAPPING_REQUIRED","Non-cash bad-debt treatment required");
    line(mapping.accountId,"expense",amount,0n); line(mapping.receivableAccountId,"asset",0n,amount);
  } else if (source.kind === "bank_transfer") {
    requireAccounting(mapping.effect==="transfer" && source.fromBankId!==source.toBankId,"INVALID_MAPPING","Distinct own-bank transfer required");
    line(mapping.bankAccounts?.[String(source.toBankId)],"asset",amount,0n);
    line(mapping.bankAccounts?.[String(source.fromBankId)],"asset",0n,amount);
  } else if (source.kind === "bank_funding") {
    requireAccounting(source.classification!=='bad_debt_recovery'||mapping.effect==='income_funding',
      'INVALID_MAPPING','Debt recovery must use an explicitly reviewed income head, never capital, AR, VAT or a second write-off');
    const category=({equity_funding:"equity",loan_funding:"liability",asset_funding:"asset",income_funding:"income",liability_funding:"liability"} as Partial<Record<OperationalMapping["effect"],AccountCategory>>)[mapping.effect];
    requireAccounting(category,"MAPPING_REQUIRED","Funding purpose must be explicitly reviewed, never inferred from narration");
    line(mapping.bankAccounts?.[String(source.bankId)],"asset",amount,0n); line(mapping.accountId,category,0n,amount); cashMovement=amount;
  } else {
    let category:AccountCategory;
    if(source.kind==="expense_payment") {
      requireAccounting(mapping.effect==="overhead","MAPPING_REQUIRED","Payment settles payable; do not expense it twice");
      line(mapping.controlAccountId,"liability",amount,0n);
    } else {
      const allowed=source.kind==="schedule_payment" ? ["expense","asset","advance","loan_repayment","other_non_expense"] : ["expense","recoverable","wip","advance"];
      requireAccounting(allowed.includes(mapping.effect),"MAPPING_REQUIRED","Supported reviewed payment classification required");
      if(source.kind==="schedule_payment") {
        const effect=({operating_expense:"expense",asset:"asset",advance:"advance",loan_repayment:"loan_repayment",other_non_expense:"other_non_expense"} as Record<string,string>)[source.classification ?? ""];
        requireAccounting(effect===mapping.effect,"SOURCE_REVIEW_REQUIRED","Native treatment must match the recorded reviewed classification");
      }
      category=mapping.effect==="expense" ? "expense" : mapping.effect==="loan_repayment" ? "liability" : mapping.effect==="other_non_expense" ? mapping.accountCategory! : "asset";
      requireAccounting(["asset","liability","equity","expense"].includes(category) && (mapping.effect!=="other_non_expense" || category!=="expense"),"INVALID_MAPPING","Supported non-income payment account required");
      if(mapping.purchaseTax) {
        const split=purchaseSplit(mapping.purchaseTax,minorToMoney(amount));
        line(mapping.accountId,category,moneyToMinor(split.net)+moneyToMinor(split.nonRecoverable),0n);
        line(mapping.purchaseTax.inputVatAccountId,"asset",moneyToMinor(split.recoverable),0n);
      } else line(mapping.accountId,category,amount,0n);
    }
    line(cashAccount(),"asset",0n,amount); cashMovement=-amount;
  }
  requireAccounting(new Set(lines.filter(l=>moneyToMinor(l.debit)>0n).map(l=>l.accountId)).size > 0
    && !lines.some(l=>moneyToMinor(l.debit)>0n && lines.some(r=>r.accountId===l.accountId && moneyToMinor(r.credit)>0n)),
  "INVALID_MAPPING","Debit and credit control accounts must differ");
  if(negative) { for(const l of lines) [l.debit,l.credit]=[l.credit,l.debit]; cashMovement=-cashMovement; }
  const input:JournalInput={bookId,branchId:source.branchId,currency:mapping.currency,accountingDate:date,eventKey,
    narration:`Reviewed ${source.kind} #${source.id}`,evidence:stableEvidence({source,mapping}),lines};
  normalizeJournal(input);
  return {input,source,requiredCategories,cashMovement:minorToMoney(cashMovement),originalKey:source.originalKey};
}
