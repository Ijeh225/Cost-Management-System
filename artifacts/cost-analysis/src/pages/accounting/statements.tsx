import { Link } from "wouter";
import { formatAccountingMoney, type AccountingReport } from "@workspace/api-client-react";

const value=(v:string|null)=>v===null ? "Not available" : formatAccountingMoney(v);
function Table({title,headers,rows}:{title:string;headers:string[];rows:React.ReactNode[][]}) {
  return <div className="min-w-0 overflow-x-auto report-table"><table className="w-full min-w-[640px] text-sm"><caption className="text-left font-semibold py-3">{title}</caption>
    <thead><tr>{headers.map(h=><th key={h} scope="col" className="p-2 text-left">{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr className="border-t" key={i}>{row.map((cell,j)=><td className="p-2 align-top" key={j}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
export function StatementSnapshot({report,onJournal}:{report:AccountingReport;onJournal:(id:number)=>void}) {
  const s=report.statements;if(!s) return <p role="alert">Statement snapshot is unavailable. No accounting totals are inferred.</p>;
  const bs=s.balanceSheet,pl=s.profitAndLoss,cf=s.cashFlow;
  const ledger=(id:number,label:string)=><Link className="text-primary underline no-print" href={`/accounting/general-ledger?bookId=${report.book.id}&branchId=${report.scope==="whole_book"?"all":report.branches[0]!.id}&accountId=${id}&from=${report.book.cutoverDate}&to=${report.asOf}`}>{label}</Link>;
  const metrics=report.kind==="balance-sheet"?[["Assets",bs.assets],["Liabilities",bs.liabilities],["Equity including earnings",bs.equityIncludingEarnings],["Equation difference",bs.difference]]:
    [["Posted accrual income",pl.income],["Posted accrual expenses",pl.expense],["Posted accrual net profit",pl.profit],["Identified cash movement",cf.identified?cf.movement:null]];
  return <div className="min-w-0 space-y-6">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(([label,v])=><div className="min-w-0 rounded-xl border bg-muted/30 p-4" key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 overflow-x-auto font-mono text-xl font-bold">{value(v!)}</p></div>)}</div>
    <section><h3 className="text-lg font-semibold">Balance Sheet at {report.asOf}</h3><p className="text-sm">Assets = Liabilities + Equity: <strong>{bs.balanced?"Equation reconciles":"Does not reconcile"}</strong>. This is not certification of complete company balances.</p>
      <Table title="Posted assets, liabilities and equity" headers={["Account / ledger","Category","Normal-side balance"]} rows={bs.rows.map(a=>[<>{a.code} {a.name}<br/>{ledger(a.accountId,"View posted account")}</>,a.category,value(a.amount)])}/>
      <dl className="grid gap-2 rounded-lg bg-muted/30 p-4 text-sm sm:grid-cols-2">{[["Posted equity (including posted retained earnings)",bs.postedEquity],["Prior-year unclosed income / expense balances",bs.priorUnclosedEarnings],[`Current financial-year earnings from ${bs.financialYearStart}`,bs.currentYearEarnings],["Equity including unclosed earnings",bs.equityIncludingEarnings],["Assets less liabilities and equity",bs.difference]].map(([label,v])=><div key={label}><dt>{label}</dt><dd className="font-mono font-semibold">{value(v!)}</dd></div>)}</dl>
    </section>
    {report.kind==="management-accounts"&&<>
      <section><h3 className="text-lg font-semibold">Accrual Profit and Loss</h3><p className="text-sm text-muted-foreground">{report.filter.from} through {report.asOf}: posted income and expenses include recognised unpaid obligations and non-cash adjustments. Collections are not a second income posting.</p>
        <Table title="Posted accrual performance by account" headers={["Account / ledger","Category","Period amount"]} rows={pl.rows.map(a=>[<>{a.code} {a.name}<br/>{ledger(a.accountId,"View posted account")}</>,a.category,value(a.amount)])}/>
      </section>
      <section><h3 className="text-lg font-semibold">Accounting Cash Flow and Profit Bridge</h3><p className="text-sm">Cash identified: <strong>{cf.identified?"From reviewed source mappings":"Not configured; zero is not a confirmed balance"}</strong>. Classification: <strong>{cf.classificationsComplete?"All identified movements classified":"Review required"}</strong>.</p>
        <Table title="Identified cash reconciliation" headers={["Measure","Amount"]} rows={[["Opening cash (including reviewed opening journal)",value(cf.opening)],["Operating",value(cf.operating)],["Investing",value(cf.investing)],["Financing",value(cf.financing)],["Internal transfers (net)",value(cf.transfers)],["Unclassified movement",value(cf.unclassified)],["Net movement",value(cf.movement)],["Closing identified cash",value(cf.closing)],["Opening + movement versus closing difference",value(cf.difference)]]}/>
        <Table title="Profit-to-cash bridge: balance movements, not a second cash calculation" headers={["Account","Adjustment to accrual profit"]} rows={cf.profitBridge.adjustments.map(a=>[<>{a.code} {a.name}<br/>{ledger(a.accountId,"Inspect movement")}</>,value(a.adjustment)])}/>
        <p className="text-sm">Profit {value(cf.profitBridge.profit)} + bridge adjustments = cash movement {value(cf.profitBridge.cashMovement)}. Bridge difference: {value(cf.profitBridge.difference)}.</p>
        <Table title="Cash source drilldown" headers={["Date","Journal / source","Branch","Classification","Net cash"]} rows={cf.entries.map(e=>[e.date,<><button className="text-primary underline no-print" onClick={()=>onJournal(e.journalId)}>Journal #{e.journalId}</button><p className="break-all text-xs">{e.eventKey}</p></>,e.branchId,e.classification,value(e.amount)])}/>
      </section>
      {([['Receivables',s.receivables],['Payables',s.payables]] as const).map(([title,aging])=><section key={title}><h3 className="text-lg font-semibold">{title}: Posted Open Items</h3>
        <p className="text-sm">Controls: <strong>{aging.identified?"Identified from reviewed posted mappings":"Not configured; zeros are not confirmed customer/supplier balances"}</strong>.</p>
        <p className="text-sm">Supported open items {value(aging.total)} | Identified control accounts {value(aging.controlBalance)} | Unallocated control difference {value(aging.unallocatedControl)}.</p>
        <p className="text-sm text-muted-foreground">{aging.dueDatesComplete?"Retained due dates available for displayed open items.":"Due dates were not retained in some posted source evidence; those items remain Undated, never guessed overdue."} Opening/customer/supplier detail is not invented.</p>
        <Table title={`${title} aging buckets`} headers={["Bucket","Balance"]} rows={aging.buckets.map(b=>[b.bucket,value(b.amount)])}/>
        <Table title={`${title} source balances`} headers={["Branch","Source ID","Party ID","Recognised","Retained due date","Bucket","Balance"]} rows={aging.rows.map(r=>[r.branchId,r.sourceId,r.partyId??"Unspecified",r.recognitionDate,r.dueDate??"Not retained",r.bucket,value(r.balance)])}/>
      </section>)}
      <Table title="Posted branch performance (one selected book, not legal-group consolidation)" headers={["Branch","Accrual income","Accrual expense","Net profit","Identified cash movement"]} rows={s.branchPerformance.map(b=>[report.branches.find(x=>x.id===b.branchId)?.name??b.branchId,value(b.income),value(b.expense),value(b.profit),value(b.cashMovement)])}/>
      <section><h3 className="text-lg font-semibold">Job Performance and Budget Context</h3><p className="text-sm text-muted-foreground">Period posted actuals versus current lifetime operational estimates; not historical approved-budget variance. Missing costs remain unavailable. Shared B/L/invoice totals are not repeated for every container.</p>
        <Table title="Item-allocated income and source-allocated expenses" headers={["Container / branch","Income","Expense","Profit","Current budget revenue","Current budget cost","Income minus budget","Cost minus budget"]} rows={s.jobPerformance.rows.map(j=>[<><Link href={`/containers/${j.containerId}`} className="text-primary underline">{j.name}</Link><p>Branch #{j.branchId}</p></>,value(j.income),value(j.expense),value(j.profit),value(j.budgetRevenue),value(j.budgetCost),value(j.revenueVariance),value(j.costVariance)])}/>
        <p className="text-sm">Unallocated income / adjustments: {value(s.jobPerformance.unallocatedIncome)}. Unallocated expenses / overhead: {value(s.jobPerformance.unallocatedExpense)}. These remain included in full P&L.</p>
      </section>
    </>}
  </div>;
}
