import { useState } from "react";
import { Link } from "wouter";
import { useAccountingCatalog,useManualAccountingWorkspace,useManualAccountingJournal,useManualAccountingCommand,
  formatAccountingMoney,type AccountingScope,type ManualAccountingRequest,type ManualAccountingJournal,type ManualCommand } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";

const field="w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const fresh=():ManualAccountingRequest=>({requestId:crypto.randomUUID(),accountingDate:today(),narration:"",evidence:"",adjustmentType:"correction",
  calculationEvidence:"",evidenceReferences:[],lines:[{accountId:0,debit:"0",credit:"0",memo:""},{accountId:0,debit:"0",credit:"0",memo:""}]});
function Notice({children,error=false}:{children:React.ReactNode;error?:boolean}) {return <div role={error?"alert":"status"} className={`rounded-xl border p-4 text-sm ${error?"border-destructive/30 bg-destructive/5":"bg-muted/30"}`}>{children}</div>;}
function failure(error:unknown) {return error instanceof Error ? error.message : "Unable to complete accounting request";}
function Queue({scope,userId}:{scope:AccountingScope;userId:number}) {
  const {isSuperAdmin}=useAuth();
  const query=useManualAccountingWorkspace(scope,true),command=useManualAccountingCommand(scope);
  const [selected,setSelected]=useState<number|null>(null),detail=useManualAccountingJournal(scope,selected);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(fresh),[references,setReferences]=useState("");
  const [action,setAction]=useState<"submit"|"reject"|"post"|"cancel"|"reversal"|null>(null),[reason,setReason]=useState(""),[date,setDate]=useState(today);
  const [reviewOpen,setReviewOpen]=useState(false),[roles,setRoles]=useState<Record<number,"adjustment"|"protected">>({});
  const [ownerEvidence,setOwnerEvidence]=useState(""),[accountantEvidence,setAccountantEvidence]=useState("");
  const [message,setMessage]=useState("");
  const workspace=query.data,busy=command.isPending || query.isFetching || !!query.error,entry=detail.data;
  const allowed=(p:string)=>!!workspace?.permissions.includes(p);
  const change=(next:ManualAccountingRequest)=>setDraft({...next,requestId:crypto.randomUUID()});
  async function run(c:ManualCommand) {
    setMessage("");try {
      const result=await command.mutateAsync(c);setMessage(c.kind==="review" ? "Reviewed classifications saved; no journal was posted." : `Journal #${result.id}: request completed. Review the refreshed state.`);
      setAction(null);setReason("");setReviewOpen(false);
      if(c.kind==="prepare" || c.kind==="reversal"){setEditing(false);setSelected(result.id);setDraft(fresh());setReferences("");}
    }catch{/* The mutation error is rendered without discarding the user's request identity. */}
  }
  function revise(j:ManualAccountingJournal) {
    const saved=JSON.parse(j.evidence).manualReview;
    setDraft({...fresh(),accountingDate:j.date,narration:j.narration,evidence:saved.evidence,adjustmentType:saved.adjustmentType,
      calculationEvidence:saved.calculationEvidence,evidenceReferences:saved.evidenceReferences,lines:j.lines,replacesJournalId:j.id});
    setReferences(saved.evidenceReferences.join("\n"));setSelected(null);setEditing(true);
  }
  return <section className="space-y-5 min-w-0">
    {query.isLoading && <Notice>Loading authorised manual journal workspace...</Notice>}
    {query.error && <Notice error>{failure(query.error)}</Notice>}
    {command.error && <Notice error>{failure(command.error)}</Notice>}{message && <Notice>{message}</Notice>}
    {workspace && <>
      <div className="flex flex-wrap items-center gap-3"><p className="mr-auto text-sm">{workspace.book.name} | {workspace.book.currency} | Branch #{scope.branchId}</p>
        <Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}>Refresh queue</Button>
        {allowed("prepare") && <Button disabled={busy || !workspace.accountReviewComplete} onClick={()=>{setDraft(fresh());setReferences("");setEditing(true);}}>Prepare adjustment</Button>}
        {isSuperAdmin && allowed("configure") && <Button variant="outline" disabled={busy} onClick={()=>{setRoles(Object.fromEntries(workspace.accounts.filter(a=>a.role).map(a=>[a.id,a.role!])));setReviewOpen(true);}}>Review account protection</Button>}
      </div>
      {!workspace.accountReviewComplete && <Notice>Manual preparation is blocked until the owner records the accountant's complete chart review. Bank, customer, supplier and tax control accounts must be protected. No account role is inferred.</Notice>}
      <p className="text-sm text-muted-foreground">Drafts do not affect the General Ledger or Trial Balance. Approve and Post requires a different named authorised reviewer. Posted versions cannot be edited or deleted.</p>
      <div className="flex gap-4 text-sm"><Link className="text-primary underline" href="/accounting/general-ledger">General Ledger</Link><Link className="text-primary underline" href="/accounting/trial-balance">Trial Balance</Link></div>
      {query.isFetching && <Notice>Refreshing the same branch; existing entries remain visible. Changes are temporarily disabled.</Notice>}
      {workspace.truncated && <Notice>Only the latest 200 manual versions are shown; older posted entries remain in the General Ledger.</Notice>}
      <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[620px] text-sm"><caption className="sr-only">Manual journal versions in the selected branch</caption>
        <thead><tr>{["Journal","Date","Narration","State","Preparer","Links"].map(h=><th key={h} scope="col" className="p-3 text-left">{h}</th>)}</tr></thead>
        <tbody>{workspace.journals.map(j=><tr key={j.id} className="border-t"><th scope="row" className="p-3 text-left"><button className="text-primary underline" onClick={()=>{setSelected(j.id);command.reset();}}>Journal #{j.id}</button></th><td>{j.date}</td><td className="max-w-xs break-words p-2">{j.narration}</td><td>{j.state}</td><td>#{j.preparedBy}</td><td>{j.replacesJournalId&&`Revises #${j.replacesJournalId}`}{j.reversalOf&&`Reverses #${j.reversalOf}`}</td></tr>)}</tbody>
      </table>{workspace.journals.length===0 && <p className="p-5 text-center text-muted-foreground">No manual adjustments recorded in this branch.</p>}</div>
      {editing && <form className="space-y-4 rounded-xl border bg-card p-4 sm:p-6" onSubmit={e=>{e.preventDefault();void run({kind:"prepare",request:{...draft,evidenceReferences:references.split("\n").map(r=>r.trim()).filter(Boolean)}});}}>
        <h2 className="text-lg font-semibold">{draft.replacesJournalId ? `Revise draft #${draft.replacesJournalId}` : "Prepare Manual Adjustment"}</h2>
        <p className="text-sm text-muted-foreground">A revision cancels the old unposted version and creates a linked immutable draft atomically. Attach evidence by durable document/voucher references; files stay in their existing repository. No calculation is guessed.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Adjustment type<select aria-label="Adjustment type" className={field} value={draft.adjustmentType} onChange={e=>change({...draft,adjustmentType:e.target.value as ManualAccountingRequest["adjustmentType"]})}>{["accrual","depreciation","prepayment","reclassification","correction"].map(t=><option key={t}>{t}</option>)}</select></label>
          <label className="space-y-1 text-sm">Accounting date<input className={field} type="date" required value={draft.accountingDate} onChange={e=>change({...draft,accountingDate:e.target.value})}/></label>
          <label className="space-y-1 text-sm sm:col-span-2">Narration<input className={field} required maxLength={4000} value={draft.narration} onChange={e=>change({...draft,narration:e.target.value})}/></label>
          <label className="space-y-1 text-sm sm:col-span-2">Adjustment purpose / evidence<textarea className={field} required maxLength={1000} value={draft.evidence} onChange={e=>change({...draft,evidence:e.target.value})}/></label>
          <label className="space-y-1 text-sm sm:col-span-2">Reviewed calculation / supporting schedule<textarea className={field} required maxLength={1500} value={draft.calculationEvidence} onChange={e=>change({...draft,calculationEvidence:e.target.value})}/></label>
          <label className="space-y-1 text-sm sm:col-span-2">Evidence references (one per line)<textarea className={field} required value={references} onChange={e=>{setReferences(e.target.value);change(draft);}} placeholder="Document #11, retained version 1; accountant schedule reference..."/></label>
        </div>
        <div className="space-y-3">{draft.lines.map((line,i)=><fieldset key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4"><legend className="px-2 text-sm">Journal line {i+1}</legend>
          <label className="text-sm">Account<select aria-label={`Line ${i+1} Account`} className={field} required value={line.accountId||""} onChange={e=>change({...draft,lines:draft.lines.map((l,n)=>n===i?{...l,accountId:Number(e.target.value)}:l)})}><option value="">Select approved account</option>{workspace.accounts.filter(a=>a.active && a.role==="adjustment").map(a=><option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></label>
          {(["debit","credit","memo"] as const).map(name=><label key={name} className="text-sm">{name}<input aria-label={`Line ${i+1} ${name}`} className={field} inputMode={name==="memo"?"text":"decimal"} value={line[name]??""} onChange={e=>change({...draft,lines:draft.lines.map((l,n)=>n===i?{...l,[name]:e.target.value}:l)})}/></label>)}
          {draft.lines.length>2 && <Button type="button" variant="outline" onClick={()=>change({...draft,lines:draft.lines.filter((_,n)=>n!==i)})}>Remove line {i+1}</Button>}
        </fieldset>)}</div>
        <p className="text-sm">Enter exact decimal amounts. Each line has either Debit or Credit, not both; total debits must equal credits. No entry is posted by saving.</p>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="outline" disabled={draft.lines.length>=200} onClick={()=>change({...draft,lines:[...draft.lines,{accountId:0,debit:"0",credit:"0",memo:""}]})}>Add line</Button>
          <Button type="submit" disabled={busy}>Save draft</Button><Button type="button" variant="outline" disabled={command.isPending} onClick={()=>setEditing(false)}>Discard form</Button></div>
      </form>}
    </>}
    <Dialog open={selected!==null} onOpenChange={open=>{if(!open&&!command.isPending){setSelected(null);setAction(null);}}}><DialogContent className="min-w-0 max-w-3xl max-h-[85vh] overflow-y-auto break-words [&>*]:min-w-0">
      <DialogHeader><DialogTitle>Manual Journal #{selected}</DialogTitle><DialogDescription>Review this exact version, retained evidence, lines and audit history. No posted entry can be silently changed.</DialogDescription></DialogHeader>
      {detail.isLoading ? <Notice>Loading journal...</Notice> : detail.error ? <Notice error>{failure(detail.error)}</Notice> : entry && <>
        <p className="text-sm">{entry.date} | {entry.state} | Preparer #{entry.preparedBy}{entry.postedBy&&` | Poster #${entry.postedBy}`}{entry.reversalOf&&` | Reverses #${entry.reversalOf}`}{entry.replacesJournalId&&` | Revises #${entry.replacesJournalId}`}</p><p>{entry.narration}</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Exact journal debit and credit lines</caption><thead><tr><th>Account</th><th>Debit</th><th>Credit</th><th>Memo</th></tr></thead><tbody>{entry.lines.map((l,i)=><tr key={i} className="border-t"><td className="p-2">{workspace?.accounts.find(a=>a.id===l.accountId)?.name??`#${l.accountId}`}</td><td>{formatAccountingMoney(l.debit)}</td><td>{formatAccountingMoney(l.credit)}</td><td>{l.memo}</td></tr>)}</tbody></table></div>
        <details><summary>Retained evidence and calculation references</summary><pre className="whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{entry.evidence}</pre></details>
        <ul className="space-y-1 text-xs">{entry.audit.map((a,i)=><li key={i} className="break-words">{a.createdAt} | #{a.actorId} | {a.action}: {a.reason}</li>)}</ul>
        <div className="flex flex-wrap gap-2">
          {entry.preparedBy===userId && ["draft","rejected"].includes(entry.state) && allowed("prepare") && <>
            {!entry.reversalOf && <Button variant="outline" disabled={busy || detail.isFetching} onClick={()=>revise(entry)}>Revise draft</Button>}
            <Button variant="outline" disabled={busy || detail.isFetching} onClick={()=>{setAction("cancel");setReason("");}}>Cancel draft</Button>
            {entry.state==="draft"&&<Button disabled={busy || detail.isFetching} onClick={()=>{setAction("submit");setReason("");}}>Submit for review</Button>}
          </>}
          {entry.state==="submitted" && entry.preparedBy!==userId && allowed("post") && <><Button disabled={busy || detail.isFetching} onClick={()=>{setAction("post");setReason("");}}>Approve and Post</Button><Button variant="outline" disabled={busy || detail.isFetching} onClick={()=>{setAction("reject");setReason("");}}>Reject</Button></>}
          {entry.state==="posted" && !entry.reversalOf && allowed("reverse") && allowed("prepare") && <Button variant="outline" disabled={busy || detail.isFetching} onClick={()=>{setAction("reversal");setDate(today());setReason("");}}>Prepare full reversal</Button>}
        </div>
        {action && <form className="space-y-3 rounded border p-3" onSubmit={e=>{e.preventDefault();void run(action==="reversal"?{kind:"reversal",id:entry.id,request:{date,reason}}:{kind:"action",id:entry.id,request:{action,reason}});}}>
          <p className="font-semibold">Confirm {action==="post"?"independent approval and posting":action}</p>
          {action==="reversal"&&<label className="block text-sm">Reversal accounting date<input className={field} type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label>}
          <label className="block text-sm">Required reason / review evidence<textarea className={field} required maxLength={4000} value={reason} onChange={e=>setReason(e.target.value)}/></label>
          <Button type="submit" disabled={busy || detail.isFetching}>Confirm {action}</Button>
        </form>}
        {command.error&&<Notice error>{failure(command.error)}</Notice>}
      </>}
    </DialogContent></Dialog>
    <Dialog open={reviewOpen} onOpenChange={open=>{if(!command.isPending)setReviewOpen(open);}}><DialogContent className="min-w-0 max-w-3xl max-h-[85vh] overflow-y-auto break-words [&>*]:min-w-0">
      <DialogHeader><DialogTitle>Complete Chart Protection Review</DialogTitle><DialogDescription>Whole-book owner review with actual accountant evidence. Do not label bank, customer, supplier or tax control accounts as freehand adjustment accounts. Approved roles cannot be silently changed.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e=>{e.preventDefault();void run({kind:"review",request:{ownerEvidence,accountantEvidence,accounts:(workspace?.accounts??[]).map(a=>({accountId:a.id,role:roles[a.id]!}))}});}}>
        {workspace?.accounts.map(a=><label key={a.id} className="block text-sm">{a.code} {a.name} ({a.category})<select className={field} required disabled={!!a.role} value={roles[a.id]??""} onChange={e=>setRoles({...roles,[a.id]:e.target.value as "adjustment"|"protected"})}><option value="">Accountant must classify</option><option value="protected">Protected source / control account</option><option value="adjustment">Reviewed non-control adjustment account</option></select></label>)}
        <label className="block text-sm">Actual owner approval evidence<textarea className={field} required maxLength={1000} value={ownerEvidence} onChange={e=>setOwnerEvidence(e.target.value)}/></label>
        <label className="block text-sm">Actual accountant review evidence<textarea className={field} required maxLength={1000} value={accountantEvidence} onChange={e=>setAccountantEvidence(e.target.value)}/></label>
        <Button type="submit" disabled={busy}>Record approved classifications</Button>{command.error&&<Notice error>{failure(command.error)}</Notice>}
      </form>
    </DialogContent></Dialog>
  </section>;
}
function Page({userId,activeBranchId}:{userId:number;activeBranchId:number|"all"}) {
  const [bookId,setBookId]=useState<number|undefined>(),[branchId,setBranchId]=useState<number|"all">(activeBranchId);
  const scope={userId,activeBranchId,bookId,branchId},catalog=useAccountingCatalog(scope);
  const books=[...new Map((catalog.data?.books??[]).map(b=>[b.id,b])).values()];
  return <div className="space-y-6 min-w-0"><header><h1 className="text-2xl font-bold">Manual Journals and Adjustments</h1><p className="text-muted-foreground">Evidence-backed draft, review, posting and reversal through the existing accounting engine.</p></header>
    {catalog.isLoading ? <Notice>Checking approved accounting access...</Notice> : catalog.error ? <Notice error>{failure(catalog.error)}</Notice> : catalog.data?.status==="inactive" ? <Notice>Official native accounting is inactive pending approved rules, reviewed opening balances and cutover. Existing operational finance is unchanged. No manual posting is available.</Notice> : <>
      <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2"><label className="text-sm">Accounting book<select aria-label="Accounting book" className={field} value={bookId??""} onChange={e=>{setBookId(Number(e.target.value)||undefined);setBranchId(activeBranchId);}}><option value="">Select authorised approved book</option>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-sm">Journal branch<select aria-label="Journal branch" className={field} value={branchId} disabled={activeBranchId!=="all"} onChange={e=>setBranchId(Number(e.target.value)||"all")}><option value="all">Select one branch (writes cannot use All)</option>{catalog.data?.books.filter(b=>b.id===bookId).map(b=><option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</select></label></div>
      {bookId && branchId!=="all" ? <Queue key={`${bookId}:${branchId}`} scope={scope} userId={userId}/> : <Notice>Select one authorised book and branch before preparing or reviewing journals.</Notice>}
    </>}
  </div>;
}
export default function ManualAccountingPage(){const {user}=useAuth();const {activeBranchId}=useBranchScope();return user ? <Page key={`${user.id}:${activeBranchId}`} userId={user.id} activeBranchId={activeBranchId}/> : null;}
