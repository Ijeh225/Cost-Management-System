import { calculateVat, purchaseSplit, type InvoiceTaxMapping, type PurchaseTaxMapping } from "./accounting-tax.js";
import { moneyToMinor, minorToMoney, requireAccounting } from "./accounting-rules.js";

export interface TaxRegisterJournal {id:number;date:string;evidence:string;kind:string;
  originalConfigurationId?:number|null;lines:{accountId:number;debit:string;credit:string}[];}
export function buildTaxRegister(journals:TaxRegisterJournal[]) {
  const rows:{journalId:number;date:string;sourceKind:string;sourceId:number;configurationId:number;code:string;treatment:string;
    net:string;vat:string;gross:string;recoverable:string;nonRecoverable:string;direction:"purchase"|"sale";reversal:boolean}[]=[];
  let unclassified=0;
  for(const j of journals) {
    const {source,mapping}=JSON.parse(j.evidence);
    if(!source)continue;
    const tax=mapping?.tax as InvoiceTaxMapping|undefined, purchase=mapping?.purchaseTax as PurchaseTaxMapping|undefined;
    const sign=source.originalKey?-1n:1n;
    const amount=(value:string)=>minorToMoney(moneyToMinor(value)*sign);
    if(purchase) {
      const split=purchaseSplit(purchase,source.amount.replace(/^-/,""));
      const posted=j.lines.filter(l=>l.accountId===purchase.inputVatAccountId)
        .reduce((sum,l)=>sum+BigInt(l.debit)-BigInt(l.credit),0n);
      requireAccounting(posted===moneyToMinor(split.recoverable)*sign,"TAX_LEDGER_MISMATCH","Posted input VAT does not reconcile with recorded tax evidence");
      rows.push({journalId:j.id,date:j.date,sourceKind:source.kind,sourceId:source.id,configurationId:purchase.configurationId,
        code:purchase.code,treatment:purchase.rule.treatment,...Object.fromEntries(Object.entries(split).map(([k,v])=>[k,amount(v)])) as typeof split,
        direction:"purchase",reversal:sign<0n});
    } else if(tax) {
      let output=0n;
      for(const item of source.items as {id:number;amount:string}[]) {
        const selection=tax.items.find(i=>i.itemId===item.id),rule=tax.rules.find(r=>r.code===selection?.code);
        requireAccounting(rule,"INVALID_TAX","Retained invoice tax rule required");
        const split=calculateVat(item.amount,"exclusive",{...rule,recoverablePercent:"0"});output+=moneyToMinor(split.vat);
        rows.push({journalId:j.id,date:j.date,sourceKind:source.kind,sourceId:source.id,configurationId:tax.configurationId,
          code:rule.code,treatment:rule.treatment,...split,direction:"sale",reversal:false});
      }
      const posted=j.lines.filter(l=>l.accountId===mapping.vatAccountId).reduce((sum,l)=>sum+BigInt(l.credit)-BigInt(l.debit),0n);
      requireAccounting(posted===output,"TAX_LEDGER_MISMATCH","Posted output VAT does not reconcile with retained invoice evidence");
    } else if(source.kind==="credit_note" && j.originalConfigurationId) {
      const vat=moneyToMinor(mapping.vatReduction??"0"),gross=moneyToMinor(source.amount);
      const posted=j.lines.filter(l=>l.accountId===mapping.vatAccountId).reduce((sum,l)=>sum+BigInt(l.debit)-BigInt(l.credit),0n);
      requireAccounting(posted===vat,"TAX_LEDGER_MISMATCH","Credit-note output VAT must reconcile to the original tax liability");
      rows.push({journalId:j.id,date:j.date,sourceKind:source.kind,sourceId:source.id,configurationId:j.originalConfigurationId,
        code:"CREDIT_ADJUSTMENT",treatment:"reviewed_credit_adjustment",net:minorToMoney(-(gross-vat)),vat:minorToMoney(-vat),gross:minorToMoney(-gross),
        recoverable:"0.00",nonRecoverable:"0.00",direction:"sale",reversal:true});
    } else if(["invoice","duty_payment","container_payment","credit_note"].includes(source.kind))unclassified++;
  }
  const totals={netPurchases:0n,purchaseVat:0n,recoverable:0n,nonRecoverable:0n,netSales:0n,outputVat:0n};
  for(const row of rows) {
    const value=(s:string)=>s.startsWith("-")?-moneyToMinor(s.slice(1)):moneyToMinor(s);
    if(row.direction==="purchase") {totals.netPurchases+=value(row.net);totals.purchaseVat+=value(row.vat);totals.recoverable+=value(row.recoverable);totals.nonRecoverable+=value(row.nonRecoverable);}
    else {totals.netSales+=value(row.net);totals.outputVat+=value(row.vat);}
  }
  return {basis:"Posted native journals; reviewed tax classifications only" as const,rows,unclassified,
    totals:{netPurchases:minorToMoney(totals.netPurchases),purchaseVat:minorToMoney(totals.purchaseVat),recoverable:minorToMoney(totals.recoverable),
      nonRecoverable:minorToMoney(totals.nonRecoverable),netSales:minorToMoney(totals.netSales),outputVat:minorToMoney(totals.outputVat)},
    limitation:"Credit notes are shown as reviewed aggregate adjustments, not guessed allocations to mixed item tax codes. Legacy unclassified entries require separate reconciliation. This is not an official VAT return."};
}
