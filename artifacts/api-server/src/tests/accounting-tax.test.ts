import { describe,it,expect } from "vitest";
import { calculateVat,validateTaxConfiguration,directExpenseHead,sameTaxRule,type TaxCode } from "../lib/accounting-tax";
import { buildOperationalJournal } from "../lib/accounting-operational-mapping";
import { buildInvoiceJournal } from "../lib/accounting-invoice-mapping";
import { buildTaxRegister } from "../lib/accounting-tax-register";
const taxable:TaxCode={code:"STD",name:"Dummy tax",treatment:"taxable",rate:"7.5",recoverablePercent:"100",basisEvidence:"Dummy approved taxable/recovery basis"};
const exempt:TaxCode={...taxable,code:"EXEMPT",treatment:"exempt",rate:"0",recoverablePercent:"0"};
const zero:TaxCode={...exempt,code:"ZERO",treatment:"zero_rated"};
const configuration={requestId:"dummy_config_123",policyVersion:"dummy",effectiveFrom:"2026-10-01",ownerEvidence:"Dummy",accountantEvidence:"Dummy",inputVatAccountId:1,outputVatAccountId:2,dutyAccountId:3,shippingAccountId:4,terminalAccountId:5,codes:[taxable,exempt,zero]};
const fact={kind:"duty_payment" as const,id:4,branchId:2,accountingDate:"2026-10-11",amount:"107500.00",bankId:7,dependencies:[],facts:{paymentMethod:"transfer"}};
const mapping={currency:"NGN" as const,policyVersion:"dummy",evidence:"Dummy cost review",effect:"expense" as const,accountId:500,bankAccounts:{"7":101},
  purchaseTax:{configurationId:1,code:taxable.code,basis:"inclusive" as const,amount:"107500.00",evidence:"Dummy supplier voucher",rule:taxable,inputVatAccountId:120}};
describe("reviewed VAT and direct expense calculations",()=>{
  it("calculates 7.5% exclusive/inclusive without adding tax to gross cash twice",()=>{
    const split={net:"100000.00",vat:"7500.00",gross:"107500.00",recoverable:"7500.00",nonRecoverable:"0.00"};
    expect(calculateVat("100000","exclusive",taxable)).toEqual(split);expect(calculateVat("107500","inclusive",taxable)).toEqual(split);
    const j=buildOperationalJournal(1,fact,mapping);expect(j.cashMovement).toBe("-107500.00");expect(j.input.lines).toEqual([
      {accountId:500,debit:"100000.00",credit:"0.00"},{accountId:120,debit:"7500.00",credit:"0.00"},{accountId:101,debit:"0.00",credit:"107500.00"}]);
    expect(()=>buildOperationalJournal(1,fact,{...mapping,purchaseTax:{...mapping.purchaseTax,basis:"exclusive"}})).toThrow("full payment");
  });
  it("puts nonrecoverable VAT in cost and only reviewed mixed recovery in the asset",()=>{
    expect(calculateVat("100000","exclusive",{...taxable,recoverablePercent:"0"})).toMatchObject({recoverable:"0.00",nonRecoverable:"7500.00"});
    const j=buildOperationalJournal(1,fact,{...mapping,purchaseTax:{...mapping.purchaseTax,rule:{...taxable,recoverablePercent:"40"}}});
    expect(j.input.lines[0]!.debit).toBe("104500.00");expect(j.input.lines[1]!.debit).toBe("3000.00");
    expect(()=>calculateVat("100","inclusive",{...taxable,recoverablePercent:"100.01"})).toThrow();
  });
  it("keeps exempt and zero-rated distinct even when both have zero VAT",()=>{
    expect(exempt.treatment).not.toBe(zero.treatment);for(const rule of [exempt,zero])expect(calculateVat("100","exclusive",rule)).toEqual({net:"100.00",vat:"0.00",gross:"100.00",recoverable:"0.00",nonRecoverable:"0.00"});
    expect(()=>validateTaxConfiguration({...configuration,codes:[taxable,exempt]})).toThrow();
    expect(()=>validateTaxConfiguration({...configuration,codes:[taxable,exempt,{...zero,code:exempt.code}]})).toThrow();
    expect(()=>calculateVat("100","exclusive",{...exempt,rate:"7.5"})).toThrow();
    expect(()=>calculateVat("100","exclusive",{...zero,recoverablePercent:"20"})).toThrow();
  });
  it("uses exact minor-unit rounding including ties and conserves every gross amount",()=>{
    expect(calculateVat("0.20","exclusive",taxable).vat).toBe("0.02");
    for(let cents=1;cents<2500;cents+=7){const amount=`${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`,split=calculateVat(amount,"inclusive",taxable);
      const minor=(s:string)=>BigInt(s.replace('.',''));expect(minor(split.net)+minor(split.vat)).toBe(BigInt(cents));expect(minor(split.recoverable)+minor(split.nonRecoverable)).toBe(minor(split.vat));}
    for(const amount of [1,"-1","1.001","1e3"])expect(()=>calculateVat(amount as string,"inclusive",taxable)).toThrow();
  });
  it("requires distinct heads, complete classifications and valid effective dates",()=>{
    expect(validateTaxConfiguration(configuration)).toEqual(configuration);
    expect(sameTaxRule(configuration.codes,[...configuration.codes].reverse())).toBe(true);
    expect(()=>validateTaxConfiguration({...configuration,shippingAccountId:3})).toThrow();expect(()=>validateTaxConfiguration({...configuration,effectiveFrom:"2026-02-30"})).toThrow();
    expect(()=>validateTaxConfiguration({...configuration,reviewedBy:9})).toThrow();
    expect(directExpenseHead("duty_payment",null)).toBe("dutyAccountId");expect(directExpenseHead("container_payment","shipping")).toBe("shippingAccountId");expect(directExpenseHead("container_payment","terminal")).toBe("terminalAccountId");
    for(const section of [null,"customs","delivery","operations"])expect(()=>directExpenseHead("container_payment",section)).toThrow();
  });
  it("reverses exactly the original duty net, tax and full cash, and reconciles the posted register",()=>{
    const j=buildOperationalJournal(1,fact,mapping),r=buildOperationalJournal(1,{...fact,id:5,amount:"-107500.00",originalKey:"source:duty_payment:4:v1"},mapping);
    expect(r.cashMovement).toBe("107500.00");expect(r.input.lines).toEqual(j.input.lines.map(l=>({...l,debit:l.credit,credit:l.debit})));
    const register=buildTaxRegister([j,r].map((v,i)=>({id:i+1,date:v.input.accountingDate,kind:i?'reversal':'manual',evidence:v.input.evidence,
      lines:v.input.lines.map(l=>({accountId:l.accountId,debit:l.debit.replace('.',''),credit:l.credit.replace('.','')}))})));
    expect(register.totals).toMatchObject({netPurchases:"0.00",purchaseVat:"0.00",recoverable:"0.00"});expect(register.rows[1]!.reversal).toBe(true);
    expect(()=>buildTaxRegister([{id:1,date:"2026-10-11",kind:"manual",evidence:j.input.evidence,lines:[]}])).toThrow("reconcile");
  });
  it("reconciles mixed invoice classifications against stored VAT rather than guessing exemption",()=>{
    const src={kind:"invoice" as const,id:1,branchId:2,clientId:3,createdDate:"2026-10-10",subtotal:"100.00",vatAmount:"4.50",total:"104.50",items:[{id:10,containerId:null,amount:"60.00"},{id:11,containerId:null,amount:"40.00"}]};
    const map={currency:"NGN" as const,policyVersion:"dummy",evidence:"Dummy",recognitionDate:"2026-10-11",recognitionEvidence:"Dummy",receivableAccountId:110,vatAccountId:220,vatEvidence:"Dummy",items:src.items.map(i=>({itemId:i.id,splits:[{accountId:400,amount:i.amount,treatment:"income" as const,evidence:"Dummy"}]})),
      tax:{configurationId:1,evidence:"Dummy",rules:[taxable,exempt,zero],items:[{itemId:10,code:"STD"},{itemId:11,code:"EXEMPT"}]}};
    const j=buildInvoiceJournal(1,src,map);expect(j.cashMovement).toBe("0.00");expect(j.input.lines.find(l=>l.accountId===220)!.credit).toBe("4.50");
    expect(()=>buildInvoiceJournal(1,src,{...map,tax:{...map.tax,items:[{itemId:10,code:"EXEMPT"},{itemId:11,code:"EXEMPT"}]}})).toThrow("match recorded");
    expect(()=>buildInvoiceJournal(1,src,{...map,tax:{...map.tax,items:[{itemId:10,code:"STD"},{itemId:10,code:"STD"}]}})).toThrow();
    const register=buildTaxRegister([{id:1,date:"2026-10-11",kind:"manual",evidence:j.input.evidence,lines:j.input.lines.map(l=>({accountId:l.accountId,debit:BigInt(l.debit.replace('.','').padEnd(3,'0')).toString(),credit:l.credit.includes('.')?l.credit.replace('.',''):"0"}))}]);
    expect(register.totals.outputVat).toBe("4.50");expect(register.rows.map(r=>r.treatment)).toEqual(["taxable","exempt"]);
  });
  it("includes reviewed credit-note output VAT reductions without inventing mixed tax-code allocations",()=>{
    const report=buildTaxRegister([{id:2,date:"2026-10-12",kind:"manual",originalConfigurationId:1,
      evidence:JSON.stringify({source:{kind:"credit_note",id:7,amount:"10.75"},mapping:{vatReduction:"0.75",vatAccountId:220}}),lines:[{accountId:220,debit:"75",credit:"0"}]}]);
    expect(report.totals.outputVat).toBe("-0.75");expect(report.totals.netSales).toBe("-10.00");expect(report.rows[0]!.code).toBe("CREDIT_ADJUSTMENT");
    expect(buildTaxRegister([{id:3,date:"2026-10-12",kind:"manual",evidence:JSON.stringify({source:{kind:"invoice"},mapping:{}}),lines:[]}]).unclassified).toBe(1);
  });
});
