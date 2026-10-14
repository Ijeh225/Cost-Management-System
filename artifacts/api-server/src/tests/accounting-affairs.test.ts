import { describe,it,expect } from "vitest";
import { buildAffairs,type AffairsRequest } from "../lib/accounting-affairs";
const request:AffairsRequest={requestId:"dummy_affairs_01",asOf:"2026-10-14",title:"Dummy valuation",scopeEvidence:"Dummy asset and supplier schedules",limitations:"Incomplete dummy records, not certification",lines:[
  {key:"bank",category:"asset",name:"Dummy bank",value:"100.01",bookValue:"100.01",basis:"book",basisExplanation:"Dummy statement carrying value",evidence:"Dummy dated bank statement"},
  {key:"equipment",category:"asset",name:"Dummy equipment",value:"60.10",bookValue:null,basis:"estimate",basisExplanation:"Dummy survey valuation",evidence:"Dummy valuation reference"},
  {key:"supplier",category:"liability",name:"Dummy supplier",value:"200.12",bookValue:"190",basis:"estimate",basisExplanation:"Dummy settlement estimate",evidence:"Dummy supplier confirmation"},
]};
describe("Step11 evidence-backed Statement of Affairs",()=>{
  it("calculates exact assets, liabilities, deficiency and incomplete book subtotals",()=>{expect(buildAffairs(1,2,"NGN",request).payload.totals).toEqual({assets:"160.11",liabilities:"200.12",netAssets:"-40.01",declaredBookAssets:"100.01",declaredBookLiabilities:"190.00",estimatedLines:2,unknownBookValues:1});});
  it("retains evidence and never equates approval with posted/complete records",()=>{const p=buildAffairs(1,2,"NGN",request).payload;expect(p.request.lines.find(l=>l.key==="equipment")!.bookValue).toBeNull();expect(p.warnings.join(" ")).toMatch(/not automatically reconciled/);expect(p.warnings.join(" ")).toMatch(/not a posted Balance Sheet/);});
  it("canonicalises whitespace, money and order for retry identity",()=>{const a=buildAffairs(1,2,"NGN",request),b=buildAffairs(1,2,"NGN",{...request,title:" Dummy valuation ",lines:[...request.lines].reverse().map(l=>({...l,value:l.value+""}))});expect(a.hash).toBe(b.hash);});
  it.each(["-1","1.001","NaN","1e2","10000000000000000"])("rejects unsafe monetary value %s",value=>{expect(()=>buildAffairs(1,2,"NGN",{...request,lines:[{...request.lines[0]!,value}]})).toThrow();});
  it("requires book-basis carrying amount equality",()=>{for(const bookValue of [null,"100.00"])expect(()=>buildAffairs(1,2,"NGN",{...request,lines:[{...request.lines[0]!,bookValue}]})).toThrow(/equal declared/);});
  it("does not silently guess zeros or missing evidence",()=>{for(const change of [{value:""},{evidence:" "},{basisExplanation:""}])expect(()=>buildAffairs(1,2,"NGN",{...request,lines:[{...request.lines[0]!,...change}]})).toThrow();});
  it("rejects duplicate items, invalid dates/scope, unexpected state and excessive schedules",()=>{expect(()=>buildAffairs(1,2,"NGN",{...request,lines:[request.lines[0]!,request.lines[0]!]})).toThrow(/unique/);expect(()=>buildAffairs(1,2,"NGN",{...request,asOf:"2026-02-30"})).toThrow();expect(()=>buildAffairs(1,0,"NGN",request)).toThrow();expect(()=>buildAffairs(1,2,"NGN",{...request,state:"approved"} as AffairsRequest)).toThrow();expect(()=>buildAffairs(1,2,"NGN",{...request,lines:Array(201).fill(request.lines[0])})).toThrow();});
});
