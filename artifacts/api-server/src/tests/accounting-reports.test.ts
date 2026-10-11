import { describe,expect,it } from "vitest";
import { buildAccountingReport,type ReportAccount,type ReportLine } from "../lib/accounting-reports.js";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import type { AccountingReport } from "@workspace/api-zod";
// Execute the actual pure client formatter without coupling the server rootDir to React sources.
const module = {exports:{}};
new Function("module",transformSync(readFileSync(new URL("../../../../lib/api-client-react/src/accounting-report-format.ts",import.meta.url),"utf8"),{loader:"ts",format:"cjs"}).code)(module);
const {accountingReportCsv,formatAccountingMoney}=module.exports as {accountingReportCsv:(r:AccountingReport)=>string;formatAccountingMoney:(v:string)=>string};
const accounts:ReportAccount[]=[{id:1,code:"1000",name:"Cash",category:"asset",active:true},
  {id:2,code:"2100",name:"Deposits",category:"liability",active:false},{id:3,code:"4000",name:"Empty active",category:"income",active:true},
  {id:4,code:"6000",name:"Empty inactive",category:"expense",active:false}];
const fact=(id:number,accountId:number,debitMinor:string,creditMinor:string,date="2026-10-10",status="posted"):ReportLine=>
  ({id,accountId,journalId:Math.ceil(id/2),branchId:2,date,status,kind:"standard",eventKey:`manual:test:${Math.ceil(id/2)}`,narration:"Reviewed",memo:"",debitMinor,creditMinor});
const facts=[fact(1,1,"10000","0","2026-10-01"),fact(2,2,"0","10000","2026-10-01"),fact(3,1,"2500","0"),fact(4,2,"0","2500"),fact(5,1,"0","500"),fact(6,2,"500","0")];
const filter={from:"2026-10-10",to:"2026-10-11",includeZero:true,includeInactive:false};
function report(kind:"general-ledger"|"trial-balance"="general-ledger") {return buildAccountingReport(accounts,facts,filter,kind);}
describe("Step8 exact posted report calculations",()=>{
  it("uses earlier periods for opening and exact movements/closing, not cash aggregates",()=>{
    expect(report().rows[0]).toMatchObject({opening:"100.00",debit:"25.00",credit:"5.00",closing:"120.00"});
    expect(report().totals).toMatchObject({openingDebit:"100.00",openingCredit:"100.00",debit:"30.00",credit:"30.00",closingDebit:"120.00",closingCredit:"120.00"});
    expect(report().balanced).toBe(true);
  });
  it("keeps ordered running balances and both sides of reversals",()=>{
    const r=buildAccountingReport(accounts,[...facts].reverse(),filter,"general-ledger");
    expect(r.rows[0]!.entries.map(e=>[e.journalId,e.balance])).toEqual([[2,"125.00"],[3,"120.00"]]);
    expect(r.rows[1]!.closing).toBe("-120.00");
  });
  it("excludes draft/cancelled/future facts completely",()=>{
    const r=buildAccountingReport(accounts,[...facts,fact(7,1,"9999","0","2026-10-10","draft"),fact(8,2,"0","9999","2026-10-10","cancelled"),fact(9,1,"9999","0","2026-10-12")],filter,"trial-balance");
    expect(r.totals).toEqual(report().totals);expect(r.rows.every(a=>a.entries.length===0)).toBe(true);
  });
  it("includes dormant active accounts and inactive historical balances by default",()=>{expect(report().rows.map(a=>a.id)).toEqual([1,2,3]);});
  it("shows unused inactive only when requested and suppresses zero without dropping movements",()=>{
    expect(buildAccountingReport(accounts,facts,{...filter,includeInactive:true},"trial-balance").rows).toHaveLength(4);
    expect(buildAccountingReport(accounts,facts,{...filter,includeZero:false},"trial-balance").rows.map(a=>a.id)).toEqual([1,2]);
    const zero=buildAccountingReport(accounts,[fact(1,1,"100","0"),fact(2,1,"0","100")],{...filter,includeZero:false},"trial-balance");
    expect(zero.rows[0]).toMatchObject({debit:"1.00",credit:"1.00",closing:"0.00"});
  });
  it("single-account view exposes imbalance rather than claiming full-book equality",()=>{
    const r=buildAccountingReport(accounts,facts,{...filter,accountId:1},"trial-balance");
    expect(r.balanced).toBe(false);expect(r.totals.closingDifference).toBe("120.00");
  });
  it("retains cents beyond floating point and uses identical GL/TB totals",()=>{
    const large=[fact(1,1,"999999999999999999","0"),fact(2,2,"0","999999999999999999")];
    const r=buildAccountingReport(accounts,large,filter,"trial-balance");
    expect(r.totals.debit).toBe("9999999999999999.99");expect(formatAccountingMoney(r.totals.debit)).toBe("9,999,999,999,999,999.99");
    expect(report("general-ledger").totals).toEqual(report("trial-balance").totals);
  });
  it("rejects invalid date range, ID filters and chart leaks",()=>{
    for(const change of [{from:"2026-02-30"},{to:"2026-10-01"},{accountId:99},{periodId:0}]) expect(()=>buildAccountingReport(accounts,facts,{...filter,...change},"trial-balance")).toThrow();
    expect(()=>buildAccountingReport(accounts,[fact(1,90,"1","0")],filter,"trial-balance")).toThrow();
  });
  it("CSV carries exact snapshot balances, scope, warnings and coverage, preventing formula injection",()=>{
    const r={...report(),book:{id:1,name:"Test book",currency:"NGN",cutoverDate:"2026-10-01"},branches:[{id:2,name:"Test branch"}],
      scope:"branch",asOf:filter.to,generatedAt:"2026-10-11T21:00:00Z",sourceCompletenessConfirmed:false,limit:50000,truncated:false,
      warnings:["Incomplete source controls"],coverage:[{branchId:2,counts:{missing:1},exceptionCount:1,exceptionsTruncated:false,missingControlAccountIds:[1],
        independentControlsVerified:false,exceptions:[{eventKey:"source:x:1:v1",kind:"x",id:1,date:filter.from,status:"missing",reason:"Not posted"}]}]} as AccountingReport;
    r.rows[0]!.name="=HYPERLINK(\"bad\")";
    const csv=accountingReportCsv(r);expect(csv).toContain("'=");expect(csv).toContain('"120.00"');expect(csv).toContain('"-120.00"');
    expect(csv).toContain("Incomplete source controls");expect(csv).toContain("source:x:1:v1");expect(csv).toContain(r.generatedAt);
    expect(accountingReportCsv({...r,kind:"trial-balance"})).toContain('"Closing debit"');
  });
});
