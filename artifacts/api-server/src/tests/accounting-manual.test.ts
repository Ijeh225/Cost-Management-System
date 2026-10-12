import { describe,expect,it } from "vitest";
import { manualInput,mappedControlAccounts } from "../lib/accounting-manual";
const request={requestId:"isolated-only-123",accountingDate:"2026-10-12",narration:"Dummy accrual",evidence:"Dummy purpose",adjustmentType:"accrual" as const,
  calculationEvidence:"Dummy reviewed schedule 12 x 0.01",evidenceReferences:["Dummy schedule v1"],lines:[{accountId:1,debit:"0.12",credit:"0"},{accountId:2,debit:"0",credit:"0.12"}]};
describe("Step9 pure manual preparation",()=>{
  it("uses a stable reserved identity and durable reviewed evidence without guessed amounts",()=>{
    const input=manualInput(1,2,"NGN",request);expect(input.eventKey).toBe("adjustment:isolated-only-123");
    expect(JSON.parse(input.evidence).manualReview.calculationEvidence).toBe(request.calculationEvidence);expect(input.lines).toEqual(request.lines);
  });
  it.each(["accrual","depreciation","prepayment","reclassification","correction"] as const)("supports reviewed %s, not an automatic calculation",adjustmentType=>{
    expect(JSON.parse(manualInput(1,2,"NGN",{...request,adjustmentType}).evidence).manualReview.adjustmentType).toBe(adjustmentType);
  });
  it.each([{evidence:""},{calculationEvidence:""},{evidenceReferences:[]},{evidenceReferences:["dup","dup"]},{evidenceReferences:[""]},{requestId:"source:1"},{adjustmentType:"opening"}])("refuses missing/invalid approvals and identities %j",change=>{
    expect(()=>manualInput(1,2,"NGN",{...request,...change} as typeof request)).toThrow();
  });
  it("refuses unbalanced/negative/floating overprecision and impossible dates",()=>{
    for(const debit of ["-1","1.001","NaN","1e3","0.13"])expect(()=>manualInput(1,2,"NGN",{...request,lines:[{...request.lines[0]!,debit},request.lines[1]!]})).toThrow();
    expect(()=>manualInput(1,2,"NGN",{...request,accountingDate:"2026-02-30"})).toThrow();
  });
  it("identifies controls by explicit source mapping, never names/account codes",()=>{
    expect(mappedControlAccounts({cashAccountId:1,bankAccounts:{"2":3,"4":3},receivableAccountId:5,controlAccountId:6,vatAccountId:7,accountId:8})).toEqual([1,5,6,7,3]);
  });
});
