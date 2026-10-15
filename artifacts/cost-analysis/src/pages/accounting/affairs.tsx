import { useState } from "react";
import { Link } from "wouter";
import { useAccountingCatalog,useAffairsWorkspace,useAffairsVersion,useAffairsCommand,affairsCsv,formatAccountingMoney,
  type AccountingScope,type AffairsRequest,type AffairsDetails,type AffairsLine,type AffairsCommand } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { Button } from "@/components/ui/button";
import { PdfDownloadButton } from "./pdf-download";
const field="w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
const fresh=():AffairsRequest=>({requestId:crypto.randomUUID(),asOf:"",title:"",scopeEvidence:"",limitations:"",lines:[]});
const line=():AffairsLine=>({key:crypto.randomUUID(),category:"asset",name:"",value:"",bookValue:null,basis:"estimate",basisExplanation:"",evidence:""});
function Notice({children,error=false}:{children:React.ReactNode;error?:boolean}){return <div role={error?"alert":"status"} className={`rounded-xl border p-4 text-sm ${error?"border-destructive/30":"bg-muted/30"}`}>{children}</div>;}
const failure=(e:unknown)=>e instanceof Error?e.message:"Unable to load valuation schedule";
function Snapshot({entry}:{entry:AffairsDetails}){const p=entry.payload,r=p.request,t=p.totals;return <article className="space-y-4 min-w-0 break-words affairs-snapshot">
  <header><h2 className="text-xl font-semibold">Statement of Affairs: {r.title}</h2><p>As of {r.asOf} | {p.currency} | Book #{p.bookId} | Branch #{p.branchId} | Version #{entry.id}</p>
    <p><strong>{entry.state.toUpperCase()}{entry.superseded?" - HISTORICAL / SUPERSEDED":""}</strong> | Preparer #{entry.preparedBy} | Reviewer {entry.reviewedBy===null?"Not reviewed":`#${entry.reviewedBy}`}</p>
    <p>Prepared {entry.createdAt} | Reviewed {entry.reviewedAt??"Not recorded"}{entry.replacesId?` | Replaces #${entry.replacesId}`:""}</p></header>
  <div className="grid gap-3 sm:grid-cols-3">{[["Assets",t.assets],["Liabilities",t.liabilities],["Net Assets / (Deficiency)",t.netAssets]].map(([label,value])=><div key={label} className="rounded-xl border p-4"><h3 className="text-sm text-muted-foreground">{label}</h3><p className="text-xl font-semibold tabular-nums">{formatAccountingMoney(value!)}</p></div>)}</div>
  <dl className="text-sm space-y-2"><dt className="font-semibold">Scope / supporting schedule</dt><dd>{r.scopeEvidence}</dd><dt className="font-semibold">Limitations / missing records</dt><dd>{r.limitations}</dd><dt className="font-semibold">Review decision evidence</dt><dd>{entry.decisionReason??"Pending independent review"}</dd></dl>
  <div className="rounded-lg border p-3 text-sm space-y-1">{p.warnings.map(w=><p key={w}>{w}</p>)}<p>{t.estimatedLines} estimated lines; {t.unknownBookValues} unknown book values. Declared book asset subtotal {formatAccountingMoney(t.declaredBookAssets)}, liability subtotal {formatAccountingMoney(t.declaredBookLiabilities)}.</p></div>
  {(["asset","liability"] as const).map(category=><section key={category} className="space-y-2"><h3 className="font-semibold capitalize">{category} Schedule</h3>
    {r.lines.filter(l=>l.category===category).map(l=><div key={l.key} className="rounded-lg border p-3 text-sm space-y-1 break-inside-avoid"><h4 className="font-semibold">{l.name}</h4><p>Valuation: {formatAccountingMoney(l.value)} | Basis: <strong>{l.basis==="estimate"?"ESTIMATED":"DECLARED BOOK VALUE"}</strong> | Book carrying amount: {l.bookValue===null?"Unknown (not zero)":formatAccountingMoney(l.bookValue)}</p><p>Basis: {l.basisExplanation}</p><p>Evidence: {l.evidence}</p><p className="text-muted-foreground">Schedule identity: {l.key}</p></div>)}
    {!r.lines.some(l=>l.category===category)&&<p className="text-sm">No {category} lines supplied. This is not evidence of a zero balance or complete records.</p>}
  </section>)}
  <section className="text-sm break-inside-avoid"><h3 className="font-semibold">Audit History</h3>{entry.audit.map((a,i)=><p key={i} className="border-t py-2">{a.createdAt}: {a.action} by #{a.actorId} | {a.reason}</p>)}</section>
</article>;}
function Workspace({scope,userId}:{scope:AccountingScope;userId:number}) {
  const query=useAffairsWorkspace(scope),command=useAffairsCommand(scope);
  const [draft,setDraft]=useState(fresh),[editing,setEditing]=useState(false),[selected,setSelected]=useState<number|null>(null),[reason,setReason]=useState("");
  const detail=useAffairsVersion(scope,selected),data=query.data,entry=detail.data,busy=command.isPending||query.isFetching||!!query.error;
  const change=(next:AffairsRequest)=>setDraft({...next,requestId:crypto.randomUUID()});
  function begin(previous?:AffairsDetails){setDraft(previous?{...previous.payload.request,requestId:crypto.randomUUID(),replacesId:previous.id}:{...fresh(),lines:[line()]});setEditing(true);setSelected(null);setReason("");command.reset();}
  async function run(c:AffairsCommand){try{const result=await command.mutateAsync(c);setSelected(result.id);setReason("");if(c.kind==="prepare")setEditing(false);}catch{/* Keep form and stable identity for safe retry. */}}
  function download(){if(!entry)return;const blob=new Blob([affairsCsv(entry)],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`statement-of-affairs-${entry.id}.csv`;a.click();URL.revokeObjectURL(url);}
  return <section className="space-y-5 min-w-0">
    <div className="print:hidden space-y-4">
    {query.isLoading&&<Notice>Loading valuation versions...</Notice>}{query.isFetching&&data&&<Notice>Refreshing this branch; retained data stays visible and decisions are disabled.</Notice>}
    {query.error&&<Notice error>{failure(query.error)}</Notice>}{command.error&&<Notice error>{failure(command.error)}</Notice>}
    {data&&<><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}>Refresh Valuations</Button>{data.permissions.includes("prepare")&&<Button onClick={()=>begin()} disabled={busy||editing}>Prepare Statement of Affairs</Button>}</div>
      {editing&&<form className="rounded-xl border p-4 space-y-4 min-w-0" onSubmit={e=>{e.preventDefault();void run({kind:"prepare",request:draft});}}><fieldset disabled={busy} className="space-y-4 min-w-0">
        <h2 className="font-semibold">New {draft.replacesId?`Replacement for #${draft.replacesId}`:"Valuation Schedule"}</h2><p className="text-sm">No amounts are guessed. Unknown book values remain unknown. Supplied carrying amounts require supporting references; they are not automatically reconciled. Submission does not post a journal.</p>
        <div className="grid gap-3 sm:grid-cols-2"><label>Valuation date<input className={field} type="date" required value={draft.asOf} readOnly={!!draft.replacesId} onChange={e=>change({...draft,asOf:e.target.value})}/></label><label>Statement title<input className={field} required maxLength={200} value={draft.title} onChange={e=>change({...draft,title:e.target.value})}/></label></div>
        {([['scopeEvidence','Scope and supporting schedule reference'],['limitations','Limitations and missing records']] as const).map(([key,label])=><label className="block text-sm" key={key}>{label}<textarea className={field} required maxLength={1000} value={draft[key]} onChange={e=>change({...draft,[key]:e.target.value})}/></label>)}
        {draft.lines.map((l,i)=>{const update=(values:Partial<AffairsLine>)=>change({...draft,lines:draft.lines.map(row=>row.key===l.key?{...row,...values}:row)});return <fieldset key={l.key} className="rounded-lg border p-3 space-y-3 min-w-0"><legend>Schedule item {i+1}</legend><div className="grid gap-3 sm:grid-cols-2">
          <label>Category<select aria-label={`Category ${i+1}`} className={field} value={l.category} onChange={e=>update({category:e.target.value as AffairsLine['category']})}><option value="asset">Asset</option><option value="liability">Liability</option></select></label>
          <label>Name<input aria-label={`Name ${i+1}`} className={field} required maxLength={200} value={l.name} onChange={e=>update({name:e.target.value})}/></label>
          <label>Valuation amount<input aria-label={`Valuation ${i+1}`} className={field} required inputMode="decimal" value={l.value} onChange={e=>update({value:e.target.value})}/></label>
          <label>Basis<select aria-label={`Basis ${i+1}`} className={field} value={l.basis} onChange={e=>update({basis:e.target.value as AffairsLine['basis']})}><option value="estimate">Estimated value</option><option value="book">Declared book value</option></select></label>
          <label>Declared book amount (leave blank if unknown)<input aria-label={`Book value ${i+1}`} className={field} inputMode="decimal" required={l.basis==="book"} value={l.bookValue??""} onChange={e=>update({bookValue:e.target.value===""?null:e.target.value})}/></label>
          <label>Valuation basis explanation<textarea aria-label={`Basis explanation ${i+1}`} className={field} required maxLength={1000} value={l.basisExplanation} onChange={e=>update({basisExplanation:e.target.value})}/></label>
          <label className="sm:col-span-2">Supporting evidence reference<textarea aria-label={`Evidence ${i+1}`} className={field} required maxLength={1000} value={l.evidence} onChange={e=>update({evidence:e.target.value})}/></label>
        </div><Button type="button" variant="outline" aria-label={`Remove item ${i+1}`} disabled={draft.lines.length===1} onClick={()=>change({...draft,lines:draft.lines.filter(row=>row.key!==l.key)})}>Remove item</Button></fieldset>;})}
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={draft.lines.length>=200} onClick={()=>change({...draft,lines:[...draft.lines,line()]})}>Add Schedule Item</Button><Button type="submit">Submit for Independent Review</Button><Button type="button" variant="outline" disabled={command.isPending} onClick={()=>setEditing(false)}>Discard Unsaved Form</Button></div>
      </fieldset></form>}
      <section className="rounded-xl border p-4"><h2 className="font-semibold">Retained Valuation Versions</h2>{data.truncated&&<p>Latest 200 versions shown; older IDs remain retrievable.</p>}{data.versions.map(v=><div className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm" key={v.id}><p>#{v.id} {v.title} | {v.asOf} | <strong>{v.state}</strong>{v.superseded?" - historical / superseded":""}</p><Button variant="outline" onClick={()=>{setSelected(v.id);setReason("");command.reset();}}>Inspect Valuation #{v.id}</Button></div>)}{!data.versions.length&&<p className="text-sm">No valuation entered. This does not mean assets or liabilities are zero.</p>}</section>
    </>}
    {detail.isLoading&&<Notice>Loading retained evidence...</Notice>}{detail.error&&<Notice error>{failure(detail.error)}</Notice>}
    {entry&&!detail.error&&<div className="flex flex-wrap gap-2"><Button variant="outline" disabled={detail.isFetching||busy} onClick={download}>Export Valuation CSV</Button><PdfDownloadButton source={entry} disabled={detail.isFetching||busy}/><Button variant="outline" disabled={detail.isFetching||busy} onClick={()=>window.print()}>Print Valuation</Button></div>}
    </div>
    {entry&&!detail.error&&<><Snapshot entry={entry}/><div className="print:hidden space-y-3">
      {entry.state==="pending"&&<><label className="block">Decision reason / review evidence<textarea className={field} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="flex flex-wrap gap-2">
        {data?.permissions.includes("post")&&entry.preparedBy!==userId&&<><Button disabled={busy||detail.isFetching||!reason.trim()} onClick={()=>void run({kind:"action",id:entry.id,request:{action:"approve",reason}})}>Approve Valuation (No Posting)</Button><Button variant="outline" disabled={busy||detail.isFetching||!reason.trim()} onClick={()=>void run({kind:"action",id:entry.id,request:{action:"reject",reason}})}>Reject Valuation</Button></>}
        {entry.preparedBy===userId&&<p className="text-sm">A different authorised reviewer must approve this version.</p>}
        {data?.permissions.includes("prepare")&&entry.preparedBy===userId&&<Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void run({kind:"action",id:entry.id,request:{action:"cancel",reason}})}>Cancel Pending Valuation</Button>}
      </div></>}
      {entry.state!=="pending"&&!entry.superseded&&data?.permissions.includes("prepare")&&<Button disabled={busy||detail.isFetching||data.versions.some(v=>v.replacesId===entry.id&&v.state==="pending")} onClick={()=>begin(entry)}>Prepare Retained Replacement</Button>}
    </div></>}
  </section>;
}
function Page({userId,activeBranchId}:{userId:number;activeBranchId:number|"all"}){
  const [bookId,setBookId]=useState<number|undefined>(),[branchId,setBranchId]=useState<number|"all">(activeBranchId),scope={userId,activeBranchId,bookId,branchId};
  const catalog=useAccountingCatalog(scope),books=[...new Map((catalog.data?.books??[]).map(b=>[b.id,b])).values()];
  return <div className="space-y-6 min-w-0"><style>{`@media print {
    @page{size:A4 portrait;margin:12mm}
    body{background:white!important;color:black!important}
    body *:not(:has(.affairs-snapshot)):not(.affairs-snapshot):not(.affairs-snapshot *){display:none!important}
    body *:has(.affairs-snapshot){display:block!important;position:static!important;height:auto!important;min-height:0!important;max-height:none!important;width:auto!important;overflow:visible!important;padding:0!important;margin:0!important;background:white!important}
    .affairs-snapshot{width:100%;color:black}.affairs-snapshot *{color:black!important;background:transparent!important;box-shadow:none!important}
    .affairs-snapshot .grid,.affairs-snapshot .break-inside-avoid{break-inside:avoid}.affairs-snapshot h3,.affairs-snapshot h4{break-after:avoid}
  }`}</style>
    <header className="print:hidden"><h1 className="text-2xl font-bold">Statement of Affairs</h1><p className="text-muted-foreground">Dated asset and liability valuations, supporting evidence and independent review. Separate from the posted Balance Sheet.</p><Link href="/accounting/balance-sheet" className="text-primary underline text-sm">View Posted Balance Sheet</Link></header>
    {catalog.isLoading?<Notice>Checking accounting access...</Notice>:catalog.error?<Notice error>{failure(catalog.error)}</Notice>:catalog.data?.status==="inactive"?<Notice>Official accounting is inactive. Valuation preparation is unavailable until separately approved setup. No postings or activation occur here.</Notice>:<>
      <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 print:hidden"><label>Accounting book<select aria-label="Accounting book" className={field} value={bookId??""} onChange={e=>{setBookId(Number(e.target.value)||undefined);setBranchId(activeBranchId);}}><option value="">Select authorised approved book</option>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label>Valuation branch<select aria-label="Valuation branch" className={field} value={branchId} disabled={activeBranchId!=="all"} onChange={e=>setBranchId(Number(e.target.value)||"all")}><option value="all">Select one branch</option>{catalog.data?.books.filter(b=>b.id===bookId).map(b=><option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</select></label></div>
      {bookId&&branchId!=="all"?<Workspace key={`${bookId}:${branchId}`} scope={scope} userId={userId}/>:<Notice>Select one authorised book and branch. Different company books and locations are not silently consolidated.</Notice>}
    </>}
  </div>;
}
export default function StatementOfAffairsPage(){const {user}=useAuth(),{activeBranchId}=useBranchScope();return user?<Page key={`${user.id}:${activeBranchId}`} userId={user.id} activeBranchId={activeBranchId}/>:null;}
