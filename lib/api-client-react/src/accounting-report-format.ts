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
  if(report.kind==="trial-balance") {
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
