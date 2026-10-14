import { describe,it,expect } from "vitest";
import { buildAccountingStatements,type StatementLine } from "../lib/accounting-statements.js";
import { buildAccountingReport,type ReportAccount } from "../lib/accounting-reports.js";
import { moneyToMinor } from "../lib/accounting-rules.js";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { GetNativeAccountingReportResponse } from "@workspace/api-zod";
const accounts:ReportAccount[]=[['Cash','asset'],['AR','asset'],['AP','liability'],['Deposits','liability'],['Capital','equity'],['Income','income'],['Duty','expense'],['Overhead','expense'],['Fixed assets','asset'],['Depreciation contra','asset'],['Input VAT','asset'],['Depreciation','expense'],['Bad debts','expense']].map(([name,category],i)=>({id:i+1,code:String(1000+i),name:name!,category:category!,active:true}));
const filter={from:"2026-10-01",to:"2026-10-31",includeZero:true,includeInactive:false};
const mapping={cashAccountId:1,bankAccounts:{'1':1},receivableAccountId:2,depositLiabilityAccountId:4};
function fixture(){
  const facts:StatementLine[]=[];let journal=0;
  const add=(s:Record<string,any>|null,m:Record<string,any>,lines:[number,string,string][],date="2026-10-10",kind="standard")=>{
    journal++;for(const [accountId,debit,credit] of lines) facts.push({id:facts.length+1,journalId:journal,branchId:1,accountId,date,status:"posted",kind,eventKey:s?`source:${s.kind}:${s.id}:v1`:`manual:qa:${journal}`,narration:"Dummy retained source",memo:"",evidence:JSON.stringify({source:s,mapping:m}),debitMinor:moneyToMinor(debit).toString(),creditMinor:moneyToMinor(credit).toString()});return journal;
  };
  add(null,{},[[1,'1000','0'],[9,'200','0'],[5,'0','1200']],"2026-10-01","opening");
  add({kind:'invoice',id:1,clientId:7,items:[{id:11,containerId:32},{id:12,containerId:33}],dueDate:'2026-10-15'},
    {...mapping,items:[{itemId:11,splits:[{treatment:'income',amount:'180'}]},{itemId:12,splits:[{treatment:'income',amount:'120'}]}]},[[2,'300','0'],[6,'0','300']]);
  add({kind:'overhead',id:1,expenseId:1},{effect:'overhead',controlAccountId:3},[[8,'80','0'],[3,'0','80']]);
  add({kind:'invoice_payment',id:1,invoiceId:1},mapping,[[1,'120','0'],[2,'0','120']]);
  add({kind:'client_deposit',id:1},mapping,[[1,'50','0'],[4,'0','50']]);
  add({kind:'invoice_payment',id:2,invoiceId:1},mapping,[[4,'30','0'],[2,'0','30']]);
  add({kind:'credit_note',id:1,invoiceId:1},{effect:'credit_note',receivableAccountId:2},[[6,'30','0'],[2,'0','30']]);
  add({kind:'invoice_writeoff',id:1,invoiceId:1},{effect:'writeoff',receivableAccountId:2},[[13,'20','0'],[2,'0','20']]);
  add(null,{},[[12,'10','0'],[10,'0','10']]);
  add({kind:'duty_payment',id:1,containerId:32},{...mapping,effect:'expense'},[[7,'100','0'],[11,'7.50','0'],[1,'0','107.50']]);
  add({kind:'duty_payment',id:2,containerId:32},{...mapping,effect:'expense'},[[1,'107.50','0'],[7,'0','100'],[11,'0','7.50']],"2026-10-11","reversal");
  add({kind:'bank_funding',id:1},{...mapping,effect:'equity_funding'},[[1,'200','0'],[5,'0','200']]);
  return {facts,add};
}
const report=(facts=fixture().facts,changes={})=>buildAccountingStatements(accounts,facts,{...filter,...changes},'12-31',[{id:32,branchId:1,name:'Shared BL A',revenue:'190',cost:'90'},{id:33,branchId:1,name:'Shared BL B',revenue:'140',cost:null}]);
describe('Step10 exact posted statements',()=>{
  it('reconciles the equation, posted equity, accrual obligations, VAT and noncash losses',()=>{
    const s=report();expect(s.balanceSheet).toMatchObject({assets:'1660.00',liabilities:'100.00',postedEquity:'1400.00',currentYearEarnings:'160.00',difference:'0.00',balanced:true});
    expect(s.profitAndLoss).toMatchObject({income:'270.00',expense:'110.00',profit:'160.00'});
  });
  it('reconciles cash opening, financing, deposits, reversals and profit bridge without second receipts',()=>{
    const s=report();expect(s.cashFlow).toMatchObject({opening:'1000.00',closing:'1370.00',movement:'370.00',operating:'170.00',financing:'200.00',difference:'0.00'});
    expect(s.cashFlow.profitBridge).toMatchObject({profit:'160.00',cashMovement:'370.00',difference:'0.00'});
    expect(s.cashFlow.entries.find(e=>e.eventKey==='source:invoice_payment:2:v1')).toBeUndefined();
  });
  it('reconciles posted AR/AP including noncash adjustments; missing due dates stay undated',()=>{
    const s=report();expect(s.receivables).toMatchObject({total:'100.00',controlBalance:'100.00',unallocatedControl:'0.00',dueDatesComplete:true});
    expect(s.receivables.rows[0]).toMatchObject({balance:'100.00',daysOverdue:16,bucket:'1-30'});
    expect(s.payables).toMatchObject({total:'80.00',controlBalance:'80.00',unallocatedControl:'0.00',dueDatesComplete:false});expect(s.payables.rows[0]?.bucket).toBe('undated');
  });
  it('does not duplicate the full invoice across shared BL containers and exposes unallocated credits/overheads',()=>{
    const s=report();expect(s.jobPerformance.rows.map(j=>j.income)).toEqual(['180.00','120.00']);
    expect(s.jobPerformance).toMatchObject({unallocatedIncome:'-30.00',unallocatedExpense:'110.00'});
    expect(s.jobPerformance.rows[0]).toMatchObject({budgetRevenue:'190',budgetCost:'90',revenueVariance:'-10.00',costVariance:'-90.00'});
    expect(s.jobPerformance.rows[1]?.costVariance).toBeNull();
  });
  it('uses all prior balances for balance sheet, but only period movement for P&L/cash',()=>{
    const s=report(fixture().facts,{from:'2026-10-11'});expect(s.profitAndLoss).toMatchObject({income:'0.00',expense:'-100.00',profit:'100.00'});
    expect(s.balanceSheet.assets).toBe('1660.00');expect(s.cashFlow.difference).toBe('0.00');expect(s.cashFlow.profitBridge.difference).toBe('0.00');
  });
  it('excludes draft, cancelled and future postings without relying on mutable source status',()=>{
    const f=fixture();f.add({kind:'invoice',id:99},mapping,[[2,'999','0'],[6,'0','999']],'2026-11-01');
    f.add(null,{},[[7,'50','0'],[3,'0','50']]);for(const l of f.facts.slice(-2)) l.status='draft';
    expect(report(f.facts).balanceSheet).toEqual(report().balanceSheet);for(const l of f.facts.slice(-2)) l.status='cancelled';expect(report(f.facts).profitAndLoss).toEqual(report().profitAndLoss);
  });
  it('splits financial-year earnings at approved year-end and retains posted retained earnings separately',()=>{
    const f=fixture();const s=buildAccountingStatements(accounts,f.facts,filter,'09-30');expect(s.balanceSheet.financialYearStart).toBe('2026-10-01');
    const later=buildAccountingStatements(accounts,f.facts,{...filter,to:'2027-01-01'},'12-31');expect(later.balanceSheet.priorUnclosedEarnings).toBe('160.00');expect(later.balanceSheet.currentYearEarnings).toBe('0.00');
    expect(later.balanceSheet.postedEquity).toBe('1400.00');
  });
  it('does not invent cash identity or purpose from account names/freehand evidence',()=>{
    const f=fixture();f.add(null,{},[[1,'25','0'],[5,'0','25']]);expect(report(f.facts).cashFlow).toMatchObject({unclassified:'25.00',classificationsComplete:false,difference:'0.00'});
    const blank=buildAccountingStatements(accounts,[],filter,'12-31');expect(blank.cashFlow.identified).toBe(false);expect(blank.warnings.join(' ')).toContain('NOT a confirmed zero');
  });
  it('refuses cash identity from forged freehand, unknown-source and cross-branch evidence',()=>{
    const make=(eventKey:string,source:Record<string,unknown>)=>fixture().facts.slice(0,3).map(l=>({...l,eventKey,kind:'standard',evidence:JSON.stringify({source,mapping:{cashAccountId:1}})}));
    for(const [key,source] of [['manual:fake',{kind:'client_deposit',id:1}],['source:unknown:1:v1',{kind:'unknown',id:1}],['source:client_deposit:1:v1',{kind:'client_deposit',id:1,branchId:9}]] as const)
      expect(report(make(key,source)).cashFlow.identified).toBe(false);
  });
  it('exposes unallocated opening AR instead of hiding it or fabricating customer invoices',()=>{
    const f=fixture();f.add(null,{},[[2,'10','0'],[5,'0','10']]);expect(report(f.facts).receivables).toMatchObject({total:'100.00',controlBalance:'110.00',unallocatedControl:'10.00'});
  });
  it('keeps day90 distinct from day91 and catches invalid retained due dates',()=>{
    const f=fixture();for(const l of f.facts.filter(l=>l.journalId===2)) {const e=JSON.parse(l.evidence!);e.source.dueDate='2026-08-02';l.evidence=JSON.stringify(e);}
    expect(report(f.facts).receivables.rows[0]?.bucket).toBe('61-90');expect(report(f.facts,{to:'2026-11-01'}).receivables.rows[0]?.bucket).toBe('90+');
    f.facts[3]!.evidence=JSON.stringify({source:{kind:'invoice',id:1,dueDate:'2026-02-30'},mapping});expect(()=>report(f.facts)).toThrow();
  });
  it('retains exact cents beyond float precision and rejects partial-account, duplicate and outside-chart inputs',()=>{
    const huge=fixture().facts.slice(0,2).map((l,i)=>({...l,accountId:i===0?1:5,debitMinor:i===0?'999999999999999999':'0',creditMinor:i===1?'999999999999999999':'0'}));
    expect(report(huge).balanceSheet.assets).toBe('9999999999999999.99');expect(()=>report(huge,{accountId:1})).toThrow();expect(()=>report([...huge,huge[0]!])).toThrow();
    expect(()=>buildAccountingStatements(accounts,[{...huge[0]!,accountId:99}],filter,'12-31')).toThrow();
  });
  it('reproduces trial balance totals and account balances exactly',()=>{
    const f=fixture(),s=report(f.facts),tb=buildAccountingReport(accounts,f.facts,filter,'trial-balance');expect(tb.balanced).toBe(true);
    expect(s.balanceSheet.rows.find(a=>a.accountId===1)?.amount).toBe(tb.rows.find(a=>a.id===1)?.closing);
    expect(s.branchPerformance).toEqual([{branchId:1,income:'270.00',expense:'110.00',profit:'160.00',cashMovement:'370.00'}]);
  });
  it('carries every statement section, exact values and warnings into protected CSV',()=>{
    const module={exports:{}};new Function('module',transformSync(readFileSync(new URL('../../../../lib/api-client-react/src/accounting-report-format.ts',import.meta.url),'utf8'),{loader:'ts',format:'cjs'}).code)(module);
    const s=report(),tb=buildAccountingReport(accounts,fixture().facts,filter,'management-accounts');s.balanceSheet.rows[0]!.name='=HYPERLINK("bad")';
    const snapshot={...tb,statements:s,book:{id:1,name:'Dummy',currency:'NGN',policyVersion:'qa',cutoverDate:filter.from},branches:[{id:1,name:'QA'}],scope:'branch',asOf:filter.to,generatedAt:'snapshot',warnings:s.warnings,coverage:[],sourceCompletenessConfirmed:false,limit:50000,truncated:false};
    expect(GetNativeAccountingReportResponse.parse(snapshot).statements).toEqual(s);
    const csv=(module.exports as any).accountingReportCsv(snapshot);
    for(const text of ['BALANCE SHEET','ACCRUAL P&L','CASH FLOW','PROFIT BRIDGE','RECEIVABLE','PAYABLE','BRANCH','UNALLOCATED JOB','1370.00','160.00','snapshot',"'=HYPERLINK"]) expect(csv).toContain(text);
  });
});
