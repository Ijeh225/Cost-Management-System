import { useState } from "react";
import { Link } from "wouter";
import { BookOpen, Download, Printer, RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";
import { useAccountingCatalog,useAccountingOptions,useNativeAccountingReport,useAccountingJournal,
  accountingReportCsv,formatAccountingMoney,type AccountingReport,type AccountingScope,type NativeReportFilters } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
import { StatementSnapshot } from "./statements";
import { PdfDownloadButton } from "./pdf-download";

const reportTitle=(kind:AccountingReport["kind"])=>({"general-ledger":"General Ledger","trial-balance":"Trial Balance","balance-sheet":"Balance Sheet","management-accounts":"Management Accounts"})[kind];

const inputClass="w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";
const money=(value:string)=>formatAccountingMoney(value);
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function Status({children}:{children:React.ReactNode}) {return <div role="status" className="rounded-xl border bg-muted/30 p-5 text-sm">{children}</div>;}
function ErrorMessage({error}:{error:unknown}) {return <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">{error instanceof Error ? error.message : "Unable to load accounting report"}</div>;}
function Value({children}:{children:string}) {return <span className="whitespace-nowrap font-mono tabular-nums">{money(children)}</span>;}
function JournalDetails({scope,id,onClose}:{scope:AccountingScope;id:number|null;onClose:()=>void}) {
  const query=useAccountingJournal(scope,id);
  return <Dialog open={id!==null} onOpenChange={open=>{if(!open) onClose();}}><DialogContent className="max-w-3xl">
    <DialogHeader><DialogTitle>Posted Journal #{id}</DialogTitle><DialogDescription>Read-only original source evidence and balanced journal lines. No edit, reversal or posting occurs here.</DialogDescription></DialogHeader>
    {query.isLoading ? <Status>Loading authorised journal...</Status> : query.error ? <ErrorMessage error={query.error}/> : query.data && <>
      <div className="grid gap-2 text-sm sm:grid-cols-2"><p>Date: {query.data.date}</p><p>Branch #{query.data.branchId}</p><p className="break-all sm:col-span-2">Source event: {query.data.eventKey}</p><p className="sm:col-span-2">{query.data.narration}</p><p>Preparer #{query.data.preparedBy}</p><p>Independent poster #{query.data.postedBy}</p>
      {query.data.reversalOf && <p>Reverses journal #{query.data.reversalOf}</p>}</div>
      <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Journal debit and credit lines</caption><thead><tr><th>Account</th><th>Memo</th><th>Debit</th><th>Credit</th></tr></thead><tbody>{query.data.lines.map((line,i)=><tr key={i} className="border-t"><td className="p-2">{line.code} {line.name}</td><td>{line.memo}</td><td className="text-right"><Value>{line.debit}</Value></td><td className="text-right"><Value>{line.credit}</Value></td></tr>)}</tbody></table></div>
      <details><summary className="cursor-pointer text-sm font-medium">Original source / review evidence</summary><pre className="mt-3 whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{query.data.evidence}</pre></details>
    </>}
  </DialogContent></Dialog>;
}
function ReportSnapshot({report,onJournal}:{report:AccountingReport;onJournal:(id:number)=>void}) {
  return <article id="native-accounting-report" className="space-y-5 rounded-xl border bg-card p-4 sm:p-6">
    <header className="space-y-2 border-b pb-4"><h2 className="text-xl font-bold">{reportTitle(report.kind)} - {report.book.name}</h2>
      <p className="text-sm">Posted double entry | {report.book.currency} | {report.filter.from} through {report.asOf}</p>
      <p className="text-sm text-muted-foreground">{report.scope==="whole_book" ? "Whole selected book" : "Branch view"}: {report.branches.map(b=>b.name).join(", ")} | Policy {report.book.policyVersion} | Cutover {report.book.cutoverDate}</p>
      <p className="text-xs text-muted-foreground">Snapshot: {report.generatedAt} | Account: {report.filter.accountId??"all"} | Period: {report.filter.periodId??"custom dates"} | Zero accounts: {String(report.filter.includeZero)} | Unused inactive: {String(report.filter.includeInactive)}</p>
    </header>
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4"/>Reporting Controls</h3><ul className="mt-2 list-disc space-y-1 pl-5">{report.warnings.map(w=><li key={w}>{w}</li>)}</ul></div>
    <div className="grid gap-3 sm:grid-cols-3">{[["Period debit",report.totals.debit],["Period credit",report.totals.credit],["Closing difference",report.totals.closingDifference]].map(([label,value])=><div key={label} className="min-w-0 rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 overflow-x-auto text-lg font-bold"><Value>{value!}</Value></p></div>)}</div>
    <p className="text-sm">Displayed debit/credit equality: <strong>{report.balanced ? "Balanced" : "Not balanced"}</strong>. Source completeness: <strong>Not independently confirmed</strong>.</p>
    {report.kind==="balance-sheet"||report.kind==="management-accounts" ? <StatementSnapshot report={report} onJournal={onJournal}/> : report.rows.length===0 ? <p className="py-5 text-center text-muted-foreground">No chart accounts match this posted report scope and visibility filter.</p> : report.kind==="trial-balance" ?
      <div className="overflow-x-auto report-table"><table className="w-full min-w-[960px] text-sm"><caption className="sr-only">Trial Balance opening, period movement and closing debit/credit balances</caption>
        <thead><tr>{["Account","Category","Opening Dr","Opening Cr","Period Dr","Period Cr","Closing Dr","Closing Cr"].map(h=><th scope="col" key={h} className="p-2 text-right first:text-left">{h}</th>)}</tr></thead>
        <tbody>{report.rows.map(a=><tr key={a.id} className="border-t"><th scope="row" className="p-2 text-left font-medium"><span>{a.code} {a.name}{!a.active && " (inactive)"}</span><Link className="no-print block text-xs text-primary underline" href={`/accounting/general-ledger?accountId=${a.id}&bookId=${report.book.id}&branchId=${report.scope==="whole_book" ? "all" : report.branches[0]!.id}&from=${report.filter.from}&to=${report.filter.to}`}>View account ledger</Link></th><td>{a.category}</td>{[a.openingSides.debit,a.openingSides.credit,a.debit,a.credit,a.closingSides.debit,a.closingSides.credit].map((v,i)=><td key={i} className="p-2 text-right"><Value>{v}</Value></td>)}</tr>)}</tbody>
        <tfoot><tr className="border-t font-bold"><th colSpan={2} className="p-2 text-left">Totals</th>{[report.totals.openingDebit,report.totals.openingCredit,report.totals.debit,report.totals.credit,report.totals.closingDebit,report.totals.closingCredit].map((v,i)=><td key={i} className="p-2 text-right"><Value>{v}</Value></td>)}</tr></tfoot></table></div> :
      report.rows.map(a=><section key={a.id} className="space-y-2">
        <div className="overflow-x-auto report-table"><table className="w-full min-w-[760px] text-sm"><caption className="sr-only">{a.name} posted transactions; positive running balance is debit, negative is credit</caption>
          <thead>
            {/* Keep account context inside the repeating header, not detached across a print page break. */}
            <tr data-ledger-account={a.code}><th colSpan={6} className="pb-2 text-left font-normal"><h3 className="text-base font-semibold">{a.code} - {a.name} <span className="text-xs text-muted-foreground">{a.category}{!a.active && " / inactive"}</span></h3>
              <p className="mt-2 text-sm">Opening signed balance: <Value>{a.opening}</Value> | Closing signed balance: <Value>{a.closing}</Value></p>
            </th></tr>
            <tr>{["Date","Journal / source","Narration / memo","Debit","Credit","Running Dr (+) / Cr (-)"].map(h=><th scope="col" key={h} className="p-2 text-left">{h}</th>)}</tr></thead>
          <tbody>{a.entries.map(e=><tr key={e.id} className="border-t"><td className="p-2 whitespace-nowrap">{e.date}</td><td className="p-2"><button className="text-primary underline" onClick={()=>onJournal(e.journalId)}>Journal #{e.journalId}</button><p className="break-all text-xs">{e.eventKey}</p><p className="text-xs">Branch #{e.branchId}</p></td><td className="p-2 max-w-sm break-words">{e.narration}<p className="text-xs text-muted-foreground">{e.memo}</p></td>{[e.debit,e.credit,e.balance].map((v,i)=><td key={i} className="p-2 text-right"><Value>{v}</Value></td>)}</tr>)}</tbody>
          <tfoot><tr className="border-t font-semibold"><th colSpan={3} className="p-2 text-left">Period movements / closing</th>{[a.debit,a.credit,a.closing].map((v,i)=><td key={i} className="p-2 text-right"><Value>{v}</Value></td>)}</tr></tfoot></table></div>
      </section>)}
    <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Source Coverage and Reconciliation</h3>
      <p className="text-xs text-muted-foreground">Through {report.asOf}; independent account controls are not supplied by this report. All warnings below are included in CSV and print.</p>
      {report.coverage.map(c=><div key={c.branchId} className="rounded border p-3 text-sm"><p>Branch #{c.branchId}: {c.exceptionCount} source exceptions. Independent controls verified: {String(c.independentControlsVerified)}.</p>
        <p className="break-all text-xs">Status counts: {JSON.stringify(c.counts)} | Missing control accounts: {c.missingControlAccountIds.join(", ")||"none used"}</p>
        {c.exceptionsTruncated && <p className="text-amber-700">First 100 exceptions shown; total {c.exceptionCount}. Coverage counts are not truncated.</p>}
        <ul className="mt-2 space-y-1 text-xs">{c.exceptions.map(e=><li key={e.eventKey} className="break-words">{e.date} | {e.eventKey} | {e.status}: {e.reason||"Source not accepted as posted"}</li>)}</ul>
      </div>)}
    </section>
  </article>;
}
function AccountingPage({kind,userId,activeBranchId}:{kind:AccountingReport["kind"];userId:number;activeBranchId:number|"all"}) {
  const params=new URLSearchParams(window.location.search);
  const positive=(value:string|null)=>value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : undefined;
  const [bookId,setBookId]=useState<number|undefined>(()=>positive(params.get("bookId")));
  const [branchId,setBranchId]=useState<number|"all">(()=>activeBranchId!=="all" ? activeBranchId : positive(params.get("branchId"))??"all");
  const [filters,setFilters]=useState<NativeReportFilters>({from:params.get("from")??today(),to:params.get("to")??today(),accountId:kind==="general-ledger"||kind==="trial-balance"?positive(params.get("accountId")):undefined,includeZero:true,includeInactive:false});
  const [applied,setApplied]=useState<NativeReportFilters|null>(null);
  const [journalId,setJournalId]=useState<number|null>(null);
  const scope={userId,activeBranchId,bookId,branchId};
  const catalog=useAccountingCatalog(scope);
  const options=useAccountingOptions(scope,catalog.data?.status==="active");
  const report=useNativeAccountingReport(scope,kind,applied,!!options.data && catalog.data?.status==="active");
  const books=[...new Map((catalog.data?.books??[]).map(b=>[b.id,b])).values()];
  const changed=()=>{setApplied(null);setJournalId(null);};
  const snapshot=options.data && applied ? report.data : undefined;
  const download=()=>{if(!snapshot) return;const url=URL.createObjectURL(new Blob([accountingReportCsv(snapshot)],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${kind}_${snapshot.book.id}_${snapshot.filter.from}_${snapshot.asOf}.csv`;a.click();URL.revokeObjectURL(url);};
  return <div className="space-y-6 min-w-0">
    <style>{`@media print {
      @page { size: A4 landscape; margin: 10mm; }
      body { background:white!important; }
      body *:not(:has(#native-accounting-report)):not(#native-accounting-report):not(#native-accounting-report *) { display:none!important; }
      body *:has(#native-accounting-report) { display:block!important; position:static!important; height:auto!important; min-height:0!important; max-height:none!important; width:auto!important; overflow:visible!important; padding:0!important; margin:0!important; background:white!important; }
      #native-accounting-report { position:static; width:100%; border:0; padding:0; background:white; color:black; }
      #native-accounting-report * { color:black!important; background:transparent!important; box-shadow:none!important; }
      #native-accounting-report .no-print { display:none!important; }
      #native-accounting-report .report-table { overflow:visible; break-before:avoid; }
      #native-accounting-report table { min-width:0!important; font-size:9px; }
      #native-accounting-report thead { display:table-header-group; break-inside:avoid; }
      #native-accounting-report tr { break-inside:avoid; }
      #native-accounting-report .grid { break-inside:avoid; }
      #native-accounting-report h3, #native-accounting-report caption { break-after:avoid; }
      #native-accounting-report section > p { break-after:avoid; }
    }`}</style>
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpen className="h-6 w-6 text-primary"/>{reportTitle(kind)}</h1><p className="mt-1 text-sm text-muted-foreground">Read-only posted native accounting. Existing Financial Ledger and operational dashboards remain separate.</p></div><nav aria-label="Accounting reports" className="flex flex-wrap gap-3 text-sm">{(["general-ledger","trial-balance","balance-sheet","management-accounts"] as const).map(k=><Link key={k} className="text-primary underline" href={`/accounting/${k}`}>{reportTitle(k)}</Link>)}</nav></header>
    {catalog.isLoading ? <Status>Checking accounting availability and authorised books...</Status> : catalog.error ? <ErrorMessage error={catalog.error}/> : catalog.data?.status==="inactive" ? <Status><ShieldCheck className="mb-2 h-6 w-6 text-primary"/><strong>Official Accounting Is Inactive</strong><p className="mt-2">{catalog.data.message}</p><p className="mt-2">These screens are ready for approved native books. They do not guess balances from cash reports or create accounting entries.</p></Status> : <>
      {books.length===0 && <Status>No approved accounting book is available with your named read grants in this active branch.</Status>}
      <form className="grid gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={e=>{e.preventDefault();setApplied({...filters});setJournalId(null);}}>
        <label className="space-y-1 text-sm">Accounting book<select aria-label="Accounting book" className={inputClass} value={bookId??""} onChange={e=>{setBookId(positive(e.target.value));setFilters({...filters,accountId:undefined,periodId:undefined});changed();}}><option value="">Select an authorised book</option>{books.map(b=><option key={b.id} value={b.id}>{b.name} ({b.currency})</option>)}</select></label>
        <label className="space-y-1 text-sm">Report branch<select aria-label="Report branch" className={inputClass} value={branchId} disabled={activeBranchId!=="all"} onChange={e=>{setBranchId(e.target.value==="all" ? "all" : Number(e.target.value));changed();}}><option value="all">Whole selected book (all grants required)</option>{(catalog.data?.books??[]).filter(b=>b.id===bookId).map(b=><option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</select></label>
        <label className="space-y-1 text-sm">Account<select aria-label="Account" disabled={kind==="balance-sheet"||kind==="management-accounts"} className={inputClass} value={filters.accountId??""} onChange={e=>setFilters({...filters,accountId:positive(e.target.value)})}><option value="">All accounts</option>{options.data?.accounts.map(a=><option key={a.id} value={a.id}>{a.code} {a.name}{!a.active && " (inactive)"}</option>)}</select></label>
        <label className="space-y-1 text-sm">Accounting period<select aria-label="Accounting period" className={inputClass} value={filters.periodId??""} onChange={e=>{const p=options.data?.periods.find(p=>p.id===Number(e.target.value));setFilters({...filters,periodId:p?.id,from:p?.from??filters.from,to:p?.to??filters.to});}}><option value="">Custom date range</option>{options.data?.periods.map(p=><option key={p.id} value={p.id}>{p.name} ({p.status})</option>)}</select></label>
        <label className="space-y-1 text-sm">From<input aria-label="From" type="date" className={inputClass} required min={options.data?.book.cutoverDate} value={filters.from} onChange={e=>setFilters({...filters,from:e.target.value})}/></label>
        <label className="space-y-1 text-sm">As of / through<input aria-label="As of / through" type="date" className={inputClass} required min={filters.from} value={filters.to} onChange={e=>setFilters({...filters,to:e.target.value})}/></label>
        <div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" disabled={kind==="balance-sheet"||kind==="management-accounts"} checked={filters.includeZero} onChange={e=>setFilters({...filters,includeZero:e.target.checked})}/>Include zero accounts</label><label className="flex items-center gap-2"><input type="checkbox" disabled={kind==="balance-sheet"||kind==="management-accounts"} checked={filters.includeInactive} onChange={e=>setFilters({...filters,includeInactive:e.target.checked})}/>Include unused inactive accounts</label></div>
        <div className="flex items-end"><Button type="submit" disabled={!options.data || report.isFetching}>Apply Filters</Button></div>
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Displayed figures use the applied snapshot shown in the report header, not unapplied field edits. Earlier periods remain included in opening balances.</p>
      </form>
      {options.isLoading && bookId && <Status>Loading authorised chart and periods...</Status>}{options.error && <ErrorMessage error={options.error}/>}
      {report.isLoading && applied && <Status>Reading posted journals and checking source coverage...</Status>}{report.error && applied && <ErrorMessage error={report.error}/>}
      {snapshot && <><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={report.isFetching} onClick={()=>report.refetch()}><RefreshCw className="mr-2 h-4 w-4"/>Refresh</Button><Button variant="outline" onClick={download}><Download className="mr-2 h-4 w-4"/>Export Snapshot CSV</Button><PdfDownloadButton source={snapshot} disabled={report.isFetching || !!report.error}/><Button variant="outline" onClick={()=>window.print()}><Printer className="mr-2 h-4 w-4"/>Print Snapshot</Button>{report.isFetching && <span role="status" className="self-center text-sm">Refreshing this scope; current snapshot stays visible...</span>}</div><ReportSnapshot report={snapshot} onJournal={setJournalId}/></>}
    </>}
    <JournalDetails scope={scope} id={journalId} onClose={()=>setJournalId(null)}/>
  </div>;
}
export default function NativeAccountingPage({kind}:{kind:AccountingReport["kind"]}) {
  const {user}=useAuth();const {activeBranchId}=useBranchScope();
  return user ? <AccountingPage key={`${user.id}:${activeBranchId}:${kind}`} kind={kind} userId={user.id} activeBranchId={activeBranchId}/> : null;
}
