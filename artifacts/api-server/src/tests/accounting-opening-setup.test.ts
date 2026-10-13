import { describe, expect, it } from "vitest";
import { buildOpeningSetup, type OpeningSetupRequest } from "../lib/accounting-opening-setup";
const chart=[{id:1,code:"1010",name:"Dummy bank",category:"asset",active:true},{id:2,code:"3000",name:"Dummy equity",category:"equity",active:true},
  {id:3,code:"5000",name:"Dummy zero expense",category:"expense",active:true}];
const request:OpeningSetupRequest={requestId:"dummy_setup_123",cutoverDate:"2026-10-01",policyVersion:"dummy-v1",ownerEvidence:"Dummy owner",
  accountantEvidence:"Dummy accounts",sourceCoverageEvidence:"Dummy dated controls",balances:[{accountId:1,debit:"100",credit:"0",evidence:"Dummy bank"},
    {accountId:2,debit:"0",credit:"100",evidence:"Dummy capital"},{accountId:3,debit:"0",credit:"0",evidence:"Explicit dummy zero"}]};
const build=(r:OpeningSetupRequest=request,c=chart)=>buildOpeningSetup(1,2,"NGN",r,c);
describe("opening setup exact and complete payload",()=>{
  it("preserves explicit zeros but creates only actual nonzero journal lines",()=>{const d=build();expect(d.payload.request.balances).toHaveLength(3);expect(d.review?.lines).toHaveLength(2);expect(d.debitTotal).toBe("100.00");});
  it("canonicalises balances and chart order with stable exact retry hash",()=>{expect(build({...request,balances:[...request.balances].reverse()},[...chart].reverse()).hash).toBe(build().hash);});
  it("keeps verification hashes stable after JSONB key reordering",()=>{
    const reorder=(v:unknown):unknown=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>b.localeCompare(a)).map(([k,value])=>[k,reorder(value)])):v;
    const saved=build().payload;
    expect(build(reorder(saved.request) as OpeningSetupRequest,reorder(saved.chart) as typeof chart).hash).toBe(build().hash);
  });
  it("retains zero review with no financial journal or balancing plug",()=>{const d=build({...request,balances:request.balances.map(b=>({...b,debit:"0",credit:"0"}))});expect(d.zero).toBe(true);expect(d.review).toBeNull();});
  it("rejects omitted, duplicated or foreign chart accounts",()=>{for(const balances of [request.balances.slice(0,2),[request.balances[0]!,request.balances[0]!,request.balances[2]!],request.balances.map(b=>({...b,accountId:b.accountId+99}))])expect(()=>build({...request,balances})).toThrow();});
  it("requires evidence for zero accounts and actual approval references",()=>{expect(()=>build({...request,balances:request.balances.map(b=>({...b,evidence:" "}))})).toThrow();expect(()=>build({...request,accountantEvidence:""})).toThrow();});
  it("rejects unbalanced/negative/excess-scale/two-sided/non-string money",()=>{for(const debit of ["101","-1","0.001","NaN",1 as unknown as string])expect(()=>build({...request,balances:request.balances.map(b=>b.accountId===1?{...b,debit}:b)})).toThrow();expect(()=>build({...request,balances:request.balances.map(b=>b.accountId===1?{...b,credit:"100"}:b)})).toThrow();});
  it("does not invent a date or permit nonzero inactive balances",()=>{expect(()=>build({...request,cutoverDate:"2026-02-30"})).toThrow();expect(()=>build(request,chart.map(c=>({...c,active:false})))).toThrow();});
  it("limits complete charts and immutable request identities",()=>{expect(()=>build({...request,requestId:"short"})).toThrow();expect(()=>build(request,[])).toThrow();expect(()=>build({...request,balances:null as unknown as OpeningSetupRequest['balances']})).toThrow();});
});
