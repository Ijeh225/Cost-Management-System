import { describe, expect, it } from "vitest";
import { buildInvoiceJournal, invoiceEventKey, type InvoiceAccountingMapping, type InvoiceAccountingSource } from "../lib/accounting-invoice-mapping";
import { journalHash, normalizeJournal } from "../lib/accounting-rules";
import { NativeAccounting } from "../lib/native-accounting";

function fixture() {
  const source: InvoiceAccountingSource = { kind: "invoice", id: 8, branchId: 2, clientId: 3, createdDate: "2026-10-09",
    subtotal: "100.00", vatAmount: "7.50", total: "107.50",
    items: [{ id: 11, containerId: 20, amount: "60.00" }, { id: 12, containerId: 21, amount: "40.00" }] };
  const mapping: InvoiceAccountingMapping = { currency: "NGN", policyVersion: "dummy-v1", evidence: "Dummy reviewed mapping",
    recognitionDate: "2026-10-10", recognitionEvidence: "Dummy verified issue date", receivableAccountId: 110,
    vatAccountId: 220, vatEvidence: "Recorded tax reviewed; no rate inferred",
    items: source.items.map(item => ({ itemId: item.id, splits: [{ accountId: 400, amount: item.amount, treatment: "income", evidence: "Dummy fee" }] })) };
  return { source, mapping };
}
describe("inactive issued invoice mapping", () => {
  it('Step10 retains actual due terms without adding them to legacy evidence or changing cash/lines',()=>{
    const {source,mapping}=fixture(),old=buildInvoiceJournal(1,source,mapping);
    expect(JSON.parse(old.input.evidence).source).not.toHaveProperty('dueDate');
    const dated=buildInvoiceJournal(1,{...source,dueDate:'2026-10-15'},mapping);
    expect(JSON.parse(dated.input.evidence).source.dueDate).toBe('2026-10-15');expect(dated.input.lines).toEqual(old.input.lines);expect(dated.cashMovement).toBe('0.00');
    expect(buildInvoiceJournal(1,source,mapping).input.evidence).toBe(old.input.evidence);
    expect(()=>buildInvoiceJournal(1,{...source,dueDate:'2026-02-30'},mapping)).toThrow();
  });
  it("recognizes multi-container totals once, records existing VAT and creates no cash", () => {
    const { source, mapping } = fixture(); const result = buildInvoiceJournal(1, source, mapping);
    expect(result.input.lines).toEqual([{ accountId: 110, debit: "107.50", credit: "0" },
      { accountId: 220, debit: "0", credit: "7.50" }, { accountId: 400, debit: "0", credit: "100.00" }]);
    expect(result.cashMovement).toBe("0.00"); expect(result.input.eventKey).toBe("source:invoice:8:v1");
    expect([...result.requiredCategories]).toEqual([[110,"asset"],[400,"income"],[220,"liability"]]);
  });
  it("requires exact income/client-funds splits rather than assuming gross charges are revenue", () => {
    const { source, mapping } = fixture(); mapping.items[0]!.splits = [
      { accountId: 400, amount: "10", treatment: "income", evidence: "Approved fee" },
      { accountId: 210, amount: "50", treatment: "liability", evidence: "Approved client funds" }];
    expect(buildInvoiceJournal(1,source,mapping).input.lines.map(l=>[l.accountId,l.credit])).toEqual([[110,"0"],[210,"50.00"],[220,"7.50"],[400,"50.00"]]);
  });
  it("does not invent tax on a zero-VAT invoice", () => {
    const { source, mapping } = fixture(); source.vatAmount="0"; source.total="100";
    delete mapping.vatAccountId; delete mapping.vatEvidence;
    expect(buildInvoiceJournal(1,source,mapping).input.lines).toHaveLength(2);
    mapping.vatAccountId=220; expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
  });
  it("requires separate reviewed tax control without changing the recorded tax amount", () => {
    const { source, mapping } = fixture(); mapping.vatEvidence="";
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow(); mapping.vatEvidence="Reviewed"; mapping.vatAccountId=400;
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow(); mapping.vatAccountId=110;
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
  });
  it("retains exact large decimals", () => {
    const { source, mapping } = fixture(); source.items=[{id:11,containerId:null,amount:"9999999999999999.99"}];
    source.subtotal=source.total=source.items[0]!.amount; source.vatAmount="0";
    delete mapping.vatAccountId; delete mapping.vatEvidence;
    mapping.items=[{itemId:11,splits:[{accountId:400,amount:source.total,treatment:"income",evidence:"Dummy"}]}];
    expect(buildInvoiceJournal(1,source,mapping).input.lines[0]!.debit).toBe("9999999999999999.99");
  });
  it.each(["missing","extra","duplicate","unknown"])("refuses %s item mappings", mode => {
    const {source,mapping}=fixture();
    if(mode==="missing") mapping.items.pop();
    if(mode==="extra") mapping.items.push({...mapping.items[0]!,itemId:99});
    if(mode==="duplicate") mapping.items[1]=mapping.items[0]!;
    if(mode==="unknown") mapping.items[1]!.itemId=99;
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
  });
  it.each(["header","items","zero","negative","precision"])("refuses %s source inconsistencies", mode => {
    const {source,mapping}=fixture();
    if(mode==="header") source.total="108";
    if(mode==="items") source.items[0]!.amount="61";
    if(mode==="zero") source.subtotal=source.total=source.vatAmount="0";
    if(mode==="negative") source.items[0]!.amount="-60";
    if(mode==="precision") source.vatAmount="7.501";
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
  });
  it("refuses guessed dates, missing evidence, wrong splits and conflicting accounts", () => {
    const {source,mapping}=fixture();
    expect(()=>buildInvoiceJournal(1,source,{...mapping,recognitionDate:"2026-10-08"})).toThrow();
    expect(()=>buildInvoiceJournal(1,source,{...mapping,recognitionEvidence:""})).toThrow();
    expect(()=>buildInvoiceJournal(1,{...source,clientId:0},mapping)).toThrow();
    mapping.items[0]!.splits[0]!.amount="59"; expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
    mapping.items[0]!.splits[0]!.amount="60"; mapping.items[0]!.splits[0]!.accountId=110;
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow(); mapping.items[0]!.splits[0]!.accountId=400;
    mapping.items[1]!.splits[0]!.treatment="liability"; expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
  });
  it("canonicalizes source/item order and decimal formatting, but detects changed recognition evidence", () => {
    const {source,mapping}=fixture(); const hash=journalHash(normalizeJournal(buildInvoiceJournal(1,source,mapping).input));
    source.items.reverse(); mapping.items.reverse(); source.subtotal="100"; source.items[0]!.amount="40";
    mapping.items[0]!.splits[0]!.amount="40";
    expect(journalHash(normalizeJournal(buildInvoiceJournal(1,source,mapping).input))).toBe(hash);
    mapping.recognitionDate="2026-10-11";
    expect(journalHash(normalizeJournal(buildInvoiceJournal(1,source,mapping).input))).not.toBe(hash);
    expect(buildInvoiceJournal(1,source,mapping).input.eventKey).toBe(invoiceEventKey(8));
  });
  it("refuses oversized review evidence instead of silently truncating it", () => {
    const {source,mapping}=fixture(); mapping.evidence="x".repeat(4000);
    expect(()=>buildInvoiceJournal(1,source,mapping)).toThrow();
  });
  it("canonicalizes object key order as well as item/split order", () => {
    const {source,mapping}=fixture();
    const reorder=<T extends object>(value:T):T=>Object.fromEntries(Object.entries(value).reverse()) as T;
    const equivalent=reorder({...mapping,items:mapping.items.map(item=>reorder({...item,splits:item.splits.map(reorder)}))});
    const hash=(s:InvoiceAccountingSource,m:InvoiceAccountingMapping)=>journalHash(normalizeJournal(buildInvoiceJournal(1,s,m).input));
    expect(hash(reorder({...source,items:source.items.map(reorder)}),equivalent)).toBe(hash(source,mapping));
  });
  it("blocks invoice preview/preparation before connecting while disabled", async () => {
    const previous=process.env.NATIVE_ACCOUNTING_ENABLED; delete process.env.NATIVE_ACCOUNTING_ENABLED;
    let connections=0; const service=new NativeAccounting({connect:async()=>{connections++;throw new Error("Must not connect");}} as never);
    try {
      const {mapping}=fixture();
      await expect(service.previewInvoice(1,2,3,8,mapping)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});
      await expect(service.prepareInvoice(1,2,3,8,mapping)).rejects.toMatchObject({code:"ACCOUNTING_DISABLED"});
      expect(connections).toBe(0);
    } finally { if(previous===undefined) delete process.env.NATIVE_ACCOUNTING_ENABLED; else process.env.NATIVE_ACCOUNTING_ENABLED=previous; }
  });
});
