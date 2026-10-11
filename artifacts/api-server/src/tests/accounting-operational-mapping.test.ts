import { describe,expect,it } from "vitest";
import { buildOperationalJournal,operationalEventKey,type OperationalMapping,type OperationalSource } from "../lib/accounting-operational-mapping";
import { buildReviewedOpening,type ReviewedOpening } from "../lib/accounting-reviewed-opening";
import { journalHash,normalizeJournal } from "../lib/accounting-rules";
const source:OperationalSource={kind:"duty_payment",id:1,branchId:2,amount:"20.00",accountingDate:"2026-10-10",
  bankId:7,dependencies:[],facts:{paymentMethod:"transfer"}};
const mapping:OperationalMapping={currency:"NGN",policyVersion:"test",evidence:"Dummy reviewed classification",effect:"expense",
  accountId:500,controlAccountId:210,receivableAccountId:110,clientCreditAccountId:220,bankAccounts:{"7":100,"8":101},cashAccountId:102};
const draft=(s:Partial<OperationalSource>={},m:Partial<OperationalMapping>={})=>buildOperationalJournal(1,{...source,...s},{...mapping,...m});
describe("Remaining Step7 operational source mapping",()=>{
  it.each(["duty_payment","container_payment"] as const)("maps %s to one expense/cash fact, not a B/L",kind=>{
    const d=draft({kind}); expect(d.cashMovement).toBe("-20.00"); expect(d.input.lines).toHaveLength(2);
    expect(d.requiredCategories.get(500)).toBe("expense");
  });
  it.each(["recoverable","wip","advance"] as const)("keeps duty %s out of P&L",effect=>{
    expect(draft({}, {effect}).requiredCategories.get(500)).toBe("asset");
  });
  it("reverses a linked full duty fact with the original event retained",()=>{
    const d=draft({id:2,amount:"-20.00",originalKey:"source:duty_payment:1:v1"});
    expect(d.cashMovement).toBe("20.00"); expect(d.input.lines[0]!.credit).toBe("20.00");
  });
  it.each([{amount:"-20.00"},{amount:"20.00",originalKey:"source:duty_payment:1:v1"},{amount:"0"}])("rejects inconsistent signed facts %j",s=>{
    expect(()=>draft(s)).toThrow();
  });
  it.each(["overhead","overhead_topup"] as const)("recognizes %s as payable, not cash",kind=>{
    const d=draft({kind,category:"Rent"},{effect:"overhead",recognitionDate:"2026-10-10",recognitionEvidence:"Dummy bill date"});
    expect(d.cashMovement).toBe("0.00"); expect(d.requiredCategories.get(210)).toBe("liability");
  });
  it("settles scheduled overhead via payable, not a second expense",()=>{
    const d=draft({kind:"expense_payment"},{effect:"overhead"});
    expect(d.input.lines[0]!.accountId).toBe(210); expect(d.requiredCategories.has(500)).toBe(false);
  });
  it("refuses synthetic Bad Debt obligations and unreviewed/early recognition dates",()=>{
    for(const m of [{effect:"overhead" as const},{effect:"overhead" as const,recognitionDate:"2026-10-09",recognitionEvidence:"Earlier"}])
      expect(()=>draft({kind:"overhead",category:"Rent"},m)).toThrow();
    expect(()=>draft({kind:"overhead",category:"Bad Debt"},{effect:"overhead",recognitionDate:"2026-10-10",recognitionEvidence:"Duplicate"})).toThrow();
  });
  it("splits reviewed credit-note net/tax, AR and client excess without cash",()=>{
    const d=draft({kind:"credit_note",applied:"10",excess:"10"},{effect:"credit_note",
      reductions:[{accountId:400,amount:"18",category:"income",evidence:"Original fee"}],vatReduction:"2",vatAccountId:230,vatEvidence:"Recorded VAT"});
    expect(d.cashMovement).toBe("0.00"); expect(d.input.lines.map(l=>l.accountId)).toEqual([400,230,110,220]);
  });
  it("canonicalizes reordered equivalent credit splits and JSON properties",()=>{
    const s={kind:"credit_note" as const,applied:"20",excess:"0"};
    const m={effect:"credit_note" as const,reductions:[{accountId:401,amount:"10",category:"income" as const,evidence:"A"},
      {accountId:400,amount:"10.00",category:"income" as const,evidence:"B"}]};
    const a=draft(s,m); const b=draft(s,{...m,reductions:[...m.reductions].reverse()});
    expect(journalHash(normalizeJournal(a.input))).toBe(journalHash(normalizeJournal(b.input)));
  });
  it("canonicalizes equivalent reviewed VAT decimals",()=>{
    const s={kind:"credit_note" as const,applied:"20",excess:"0"};
    const m={effect:"credit_note" as const,reductions:[{accountId:400,amount:"18",category:"income" as const,evidence:"Net"}],vatAccountId:230,vatEvidence:"Tax"};
    expect(journalHash(normalizeJournal(draft(s,{...m,vatReduction:"2"}).input)))
      .toBe(journalHash(normalizeJournal(draft(s,{...m,vatReduction:"2.00"}).input)));
  });
  it.each([{applied:"20",excess:"1"},{applied:"10",excess:"10"}])("rejects credit splits without reconciled note evidence %j",s=>{
    expect(()=>draft({kind:"credit_note",...s},{effect:"credit_note",reductions:[{accountId:400,amount:"19",category:"income",evidence:"Wrong"}]})).toThrow();
  });
  it("uses the existing non-cash payment identity for client-credit use/reversal",()=>{
    expect(operationalEventKey({kind:"client_credit_application",id:9})).toBe("source:invoice_payment:9:v1");
    expect(draft({kind:"client_credit_application"},{effect:"client_credit"}).cashMovement).toBe("0.00");
    expect(draft({kind:"client_credit_application",amount:"-20",originalKey:"source:invoice_payment:9:v1"},{effect:"client_credit"}).input.lines[0]!.credit).toBe("20.00");
  });
  it("posts write-off expense against AR, never against cash",()=>{
    const d=draft({kind:"invoice_writeoff"},{effect:"writeoff"}); expect(d.cashMovement).toBe("0.00");
    expect(d.input.lines.map(l=>l.accountId)).toEqual([500,110]);
  });
  it.each([ ["operating_expense","expense","expense"], ["asset","asset","asset"], ["advance","advance","asset"],
    ["loan_repayment","loan_repayment","liability"], ["other_non_expense","other_non_expense","equity"] ] as const)
    ("honors recorded standalone %s classification",(classification,effect,category)=>{
      const d=draft({kind:"schedule_payment",classification},{effect,accountCategory:category});
      expect(d.requiredCategories.get(500)).toBe(category); expect(d.cashMovement).toBe("-20.00");
    });
  it.each(["unclassified","asset","loan_repayment"])("refuses mismatched standalone expense for %s",classification=>{
    expect(()=>draft({kind:"schedule_payment",classification})).toThrow();
  });
  it.each([ ["equity_funding","equity"], ["loan_funding","liability"], ["asset_funding","asset"],
    ["income_funding","income"], ["liability_funding","liability"] ] as const)("requires explicit %s purpose",(effect,category)=>{
    const d=draft({kind:"bank_funding"},{effect}); expect(d.requiredCategories.get(500)).toBe(category); expect(d.cashMovement).toBe("20.00");
  });
  it("never infers bank funding purpose from narration",()=>{expect(()=>draft({kind:"bank_funding"})).toThrow();});
  it("transfers bank-to-bank with no company-wide cash or revenue change",()=>{
    const d=draft({kind:"bank_transfer",fromBankId:7,toBankId:8},{effect:"transfer"});
    expect(d.cashMovement).toBe("0.00"); expect(d.input.lines.map(l=>l.accountId)).toEqual([101,100]);
    expect([...d.requiredCategories.values()]).toEqual(["asset","asset"]);
  });
  it.each([{bankId:null,facts:{paymentMethod:"transfer"}},{bankId:7,facts:{paymentMethod:"cash"}},{facts:{paymentMethod:"credit"}}])
    ("refuses invented cash/bank source %j",s=>{expect(()=>draft(s)).toThrow();});
  it("requires reviewed policy, separate accounts and bounded evidence",()=>{
    expect(()=>draft({}, {policyVersion:""})).toThrow(); expect(()=>draft({}, {accountId:100})).toThrow();
    expect(()=>draft({}, {evidence:"x".repeat(4001)})).toThrow();
  });
});
const opening:ReviewedOpening={bookId:1,branchId:2,currency:"NGN",cutoverDate:"2026-10-01",policyVersion:"test",
  strategy:"opening_balances_forward",ownerEvidence:"Dummy owner",accountantEvidence:"Dummy accountant",sourceCoverageEvidence:"Dummy as-of review",
  lines:[{accountId:100,debit:"100",credit:"0"},{accountId:300,debit:"0",credit:"100"}],
  controls:[{accountId:100,debit:"100",credit:"0",evidence:"Dummy bank statement"},{accountId:300,debit:"0",credit:"100",evidence:"Dummy equity record"}]};
describe("Reviewed opening preparation",()=>{
  it("validates every exact control and produces a reviewed draft, not an official posting",()=>{
    expect(buildReviewedOpening(opening).status).toBe("reviewed_draft");
    expect(buildReviewedOpening(opening).debitTotal).toBe("100.00");
  });
  it("rejects missing, duplicate or fabricated balancing controls",()=>{
    for(const controls of [[],[opening.controls[0]!], [opening.controls[0]!,opening.controls[0]!],
      opening.controls.map(c=>({...c,credit:"99"})),opening.controls.map(c=>({...c,evidence:""}))])
      expect(()=>buildReviewedOpening({...opening,controls})).toThrow();
  });
  it("preserves canonical opening retries",()=>{
    expect(journalHash(normalizeJournal(buildReviewedOpening(opening).input))).toBe(journalHash(normalizeJournal(
      buildReviewedOpening({...opening,lines:[...opening.lines].reverse(),controls:[...opening.controls].reverse()}).input)));
  });
});
