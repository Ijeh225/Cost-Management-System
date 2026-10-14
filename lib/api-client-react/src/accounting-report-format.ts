import type { AccountingReport } from "./generated/api.schemas";

// Do not convert financial decimal strings to Number (large balances lose cents).
export function formatAccountingMoney(value:string) {
  const [whole,fraction="00"]=value.split(".");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g,",")}.${fraction.padEnd(2,"0")}`;
}
function cell(value:unknown) {
  let text=String(value??"");
  if(/^[=+@\t\r]/.test(text) || /^-/.test(text) && !/^-\d+(\.\d+)?$/.test(text)) text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export function accountingReportCsv(report:AccountingReport) {
  const rows:unknown[][]=[
    [report.kind,report.book.name,report.book.currency,"Posted double entry"],
    ["Scope",report.scope,...report.branches.map(b=>b.name)],
    ["From",report.filter.from,"As of",report.asOf,"Generated",report.generatedAt],
    ["Policy",report.book.policyVersion,"Cutover",report.book.cutoverDate,"Account filter",report.filter.accountId??"all","Period",report.filter.periodId??"dates"],
    ["Include zero",report.filter.includeZero,"Include inactive",report.filter.includeInactive],
    ...report.warnings.map(w=>["WARNING",w]),
    ["Source completeness confirmed",report.sourceCompletenessConfirmed],
  ];
  if(report.statements) {
    const s=report.statements,bs=s.balanceSheet;
    rows.push(["BALANCE SHEET","As of",report.asOf],["Account","Name","Category","Normal-side closing balance"]);
    for(const a of bs.rows) rows.push([a.code,a.name,a.category,a.amount]);
    for(const [label,amount] of Object.entries(bs).filter(([key])=>key!=="rows")) rows.push(["BALANCE SHEET CONTROL",label,amount]);
    if(report.kind==="management-accounts") {
      rows.push(["ACCRUAL P&L","From",report.filter.from,"Through",report.asOf],["Code","Name","Category","Amount"]);
      for(const a of s.profitAndLoss.rows) rows.push([a.code,a.name,a.category,a.amount]);
      rows.push(["P&L TOTALS","Income",s.profitAndLoss.income,"Expense",s.profitAndLoss.expense,"Profit",s.profitAndLoss.profit]);
      const cf=s.cashFlow;
      for(const [label,v] of Object.entries(cf).filter(([key])=>!["entries","profitBridge"].includes(key))) rows.push(["CASH FLOW",label,Array.isArray(v)?v.join(";"):v]);
      rows.push(["Cash journal","Branch","Date","Source","Classification","Movement"]);
      for(const e of cf.entries) rows.push([e.journalId,e.branchId,e.date,e.eventKey,e.classification,e.amount]);
      rows.push(["PROFIT BRIDGE","Profit",cf.profitBridge.profit,"Cash movement",cf.profitBridge.cashMovement,"Difference",cf.profitBridge.difference]);
      for(const a of cf.profitBridge.adjustments) rows.push(["BRIDGE ACCOUNT",a.code,a.name,a.adjustment]);
      for(const [label,a] of [["RECEIVABLE",s.receivables],["PAYABLE",s.payables]] as const) {
        rows.push([label,"Controls identified",a.identified,"Supported total",a.total,"Control",a.controlBalance,"Unallocated",a.unallocatedControl,"Due dates complete",a.dueDatesComplete]);
        for(const b of a.buckets) rows.push([label,"AGING BUCKET",b.bucket,b.amount]);
        rows.push([label,"Branch","Source","Party","Recognised","Retained due date","Days overdue","Bucket","Balance"]);
        for(const r of a.rows) rows.push([label,r.branchId,r.sourceId,r.partyId,r.recognitionDate,r.dueDate,r.daysOverdue,r.bucket,r.balance]);
      }
      rows.push(["BRANCH","Income","Expense","Profit","Cash movement"]);
      for(const b of s.branchPerformance) rows.push([b.branchId,b.income,b.expense,b.profit,b.cashMovement]);
      rows.push(["JOB","Branch","Name","Period income","Period expense","Profit","Current lifetime budget revenue","Current lifetime budget cost","Income minus budget","Cost minus budget"]);
      for(const j of s.jobPerformance.rows) rows.push([j.containerId,j.branchId,j.name,j.income,j.expense,j.profit,j.budgetRevenue,j.budgetCost,j.revenueVariance,j.costVariance]);
      rows.push(["UNALLOCATED JOB AMOUNTS","Income",s.jobPerformance.unallocatedIncome,"Expense",s.jobPerformance.unallocatedExpense]);
    }
  } else if(report.kind==="trial-balance") {
    rows.push(["Code","Account","Category","Active","Opening debit","Opening credit","Period debit","Period credit","Closing debit","Closing credit"]);
    for(const a of report.rows) rows.push([a.code,a.name,a.category,a.active,a.openingSides.debit,a.openingSides.credit,a.debit,a.credit,a.closingSides.debit,a.closingSides.credit]);
    rows.push(["TOTAL", "", "", "",report.totals.openingDebit,report.totals.openingCredit,report.totals.debit,report.totals.credit,report.totals.closingDebit,report.totals.closingCredit]);
  } else {
    rows.push(["Code","Account","Date","Journal","Branch","Source event","Narration","Memo","Debit","Credit","Running signed balance"]);
    for(const a of report.rows) {
      rows.push([a.code,a.name,"Opening","","","","","","","",a.opening]);
      for(const e of a.entries) rows.push([a.code,a.name,e.date,e.journalId,e.branchId,e.eventKey,e.narration,e.memo,e.debit,e.credit,e.balance]);
      rows.push([a.code,a.name,"Closing","","","","","",a.debit,a.credit,a.closing]);
    }
    rows.push(["TOTAL PERIOD MOVEMENTS","","","","","","","",report.totals.debit,report.totals.credit]);
  }
  rows.push(["DIFFERENCES","Opening",report.totals.openingDifference,"Movement",report.totals.movementDifference,"Closing",report.totals.closingDifference]);
  for(const c of report.coverage) {
    rows.push(["SOURCE COVERAGE",c.branchId,"Exceptions",c.exceptionCount,"Shown exceptions truncated",c.exceptionsTruncated,"Independent controls verified",c.independentControlsVerified]);
    rows.push(["SOURCE STATUS COUNTS",c.branchId,JSON.stringify(c.counts),"Missing control account IDs",c.missingControlAccountIds.join(";")]);
    for(const e of c.exceptions) rows.push(["EXCEPTION",c.branchId,e.eventKey,e.date,e.status,e.reason]);
  }
  return "\uFEFF"+rows.map(row=>row.map(cell).join(",")).join("\r\n");
}
