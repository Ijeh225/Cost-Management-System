import { useState } from "react";
import { Link } from "wouter";
import { useAccountingCatalog,useOpeningWorkspace,useOpeningVersion,useOpeningCommand,formatAccountingMoney,
  type AccountingScope,type OpeningSetupRequest,type OpeningCommand } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription } from "@/components/ui/dialog";
const field="w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm";
const fresh=():OpeningSetupRequest=>({requestId:crypto.randomUUID(),cutoverDate:"",policyVersion:"",ownerEvidence:"",accountantEvidence:"",sourceCoverageEvidence:"",balances:[]});
const evidenceLabels=[['ownerEvidence','Owner approval reference'],['accountantEvidence','Head of Accounts schedule reference'],['sourceCoverageEvidence','Bank / subledger reconciliation reference']] as const;
function Notice({children,error=false}:{children:React.ReactNode;error?:boolean}){return <div role={error?"alert":"status"} className={`rounded-xl border p-4 text-sm ${error?"border-destructive/30 bg-destructive/5":"bg-muted/30"}`}>{children}</div>;}
const failure=(e:unknown)=>e instanceof Error?e.message:"Unable to complete opening setup";
function Workspace({scope,userId}:{scope:AccountingScope;userId:number}) {
  const query=useOpeningWorkspace(scope),command=useOpeningCommand(scope);
  const [editing,setEditing]=useState(false),[draft,setDraft]=useState(fresh),[selected,setSelected]=useState<number|null>(null);
  const detail=useOpeningVersion(scope,selected),[reason,setReason]=useState(""),[message,setMessage]=useState("");
  const data=query.data,busy=command.isPending||query.isFetching||!!query.error,entry=detail.data;
  const chartMatches=!editing||!!data&&data.accounts.length===draft.balances.length&&draft.balances.every(b=>data.accounts.some(a=>a.id===b.accountId));
  const change=(next:OpeningSetupRequest)=>{setDraft({...next,requestId:crypto.randomUUID()});setMessage("");};
  function begin(previous?:OpeningSetupRequest){
    if(!data)return;
    setDraft({...fresh(),...(previous??{}),requestId:crypto.randomUUID(),cutoverDate:data.book.cutoverDate,policyVersion:data.book.policyVersion,
      balances:data.accounts.map(a=>previous?.balances.find(b=>b.accountId===a.id)??{accountId:a.id,debit:"",credit:"",evidence:""})});
    setEditing(true);setSelected(null);setReason("");setMessage("");
  }
  async function run(c:OpeningCommand){
    setMessage("");try {
      const result=await command.mutateAsync(c);
      if(result.kind==="preview")setMessage(`Validated ${result.value.accountCount} accounts: debit ${formatAccountingMoney(result.value.debitTotal)}, credit ${formatAccountingMoney(result.value.creditTotal)}.${result.value.zero?" All zero: verification will not create a journal.":""} Preview only; nothing saved or posted.`);
      else {setSelected(result.value.id);setReason("");if(c.kind==="prepare")setEditing(false);setMessage("Request completed. Inspect the refreshed version and audit below.");}
    }catch{/* Preserve entered figures and stable request identity for a response retry. */}
  }
  const updateRow=(id:number,values:Partial<OpeningSetupRequest['balances'][number]>)=>change({...draft,balances:draft.balances.map(b=>b.accountId===id?{...b,...values}:b)});
  return <section className="min-w-0 space-y-5">
    {query.isLoading&&<Notice>Loading authorised chart and opening readiness...</Notice>}
    {query.isFetching&&data&&<Notice>Refreshing the same opening branch; existing data stays visible and writes are disabled.</Notice>}
    {query.error&&<Notice error>{failure(query.error)}</Notice>}{command.error&&<Notice error>{failure(command.error)}</Notice>}{message&&<Notice>{message}</Notice>}
    {data&&<>
      <Notice>{data.ready?"Opening balances independently verified. This branch's native accounting readiness control is satisfied; this does not activate official accounting.":"Opening balances not verified. Forward native accounting preparation and posting are blocked."}</Notice>
      <div className="flex flex-wrap gap-3 items-center justify-between"><p className="text-sm">Approved start date: <strong>{data.book.cutoverDate}</strong> | Currency: {data.book.currency} | {data.accounts.length} accounts</p><div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={()=>query.refetch()} disabled={query.isFetching}>Refresh openings</Button>
        {data.permissions.includes("prepare")&&<Button onClick={()=>begin()} disabled={busy||editing||data.ready||data.versions.some(v=>v.state==="pending")||data.accounts.length>200}>Enter Opening Balances</Button>}
      </div></div>
      <p className="text-sm text-muted-foreground">Enter actual reviewed figures at launch. Test figures are not official opening balances. Bank, customer, supplier and deposit schedules must support their ledger accounts; this page does not change operational bank balances or invent subledger links.</p>
      {data.accounts.length>200&&<Notice error>This chart exceeds the current 200-account setup limit. Do not omit accounts; arrange a reviewed extension before setup.</Notice>}
      {editing&&<form className="rounded-xl border bg-card p-4 space-y-4 min-w-0" onSubmit={e=>{e.preventDefault();void run({kind:"prepare",request:draft});}}>
        <fieldset disabled={busy} className="space-y-4 min-w-0">
        {!chartMatches&&<Notice error>Chart changed while this form was open. Update the form before submitting; matching figures are retained and new accounts start blank. <Button type="button" variant="outline" onClick={()=>begin(draft)}>Update Form to Current Chart</Button></Notice>}
        <h2 className="font-semibold text-lg">Complete Opening Schedule</h2><p className="text-sm text-muted-foreground">Every account needs an explicit debit/credit balance and supporting reference, including zeros. Saving submits an immutable version for a different reviewer; it does not post or enable accounting.</p>
        <div className="grid gap-3 md:grid-cols-3">{evidenceLabels.map(([key,label])=><label key={key} className="text-sm block">{label}<textarea className={field} required maxLength={500} value={draft[key]} onChange={e=>change({...draft,[key]:e.target.value})}/></label>)}</div>
        <div className="overflow-x-auto min-w-0"><table className="w-full min-w-[700px] text-sm"><caption className="sr-only">All ledger account opening debit, credit and evidence inputs</caption><thead><tr className="text-left"><th scope="col">Account</th><th scope="col">Debit</th><th scope="col">Credit</th><th scope="col">Supporting reference</th><th scope="col">Zero</th></tr></thead><tbody>
          {draft.balances.map(b=>{const a=data.accounts.find(a=>a.id===b.accountId)??{code:`#${b.accountId}`,name:"No longer in the current chart",active:false};return <tr key={b.accountId} className="border-t"><th scope="row" className="py-3 pr-2 max-w-[230px] break-words">{a.code} {a.name}{!a.active&&" (inactive, zero only)"}</th>
            <td className="p-1"><input aria-label={`Debit ${a.code}`} className={field} inputMode="decimal" required value={b.debit} onChange={e=>updateRow(b.accountId,{debit:e.target.value})}/></td>
            <td className="p-1"><input aria-label={`Credit ${a.code}`} className={field} inputMode="decimal" required value={b.credit} onChange={e=>updateRow(b.accountId,{credit:e.target.value})}/></td>
            <td className="p-1"><input aria-label={`Evidence ${a.code}`} className={field} required maxLength={500} value={b.evidence} onChange={e=>updateRow(b.accountId,{evidence:e.target.value})}/></td>
            <td className="p-1"><Button type="button" variant="outline" aria-label={`Set ${a.code} to explicit zero`} onClick={()=>updateRow(b.accountId,{debit:"0",credit:"0"})}>Zero</Button></td></tr>;})}
        </tbody></table></div>
        <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={busy||!chartMatches} onClick={()=>void run({kind:"preview",request:draft})}>Validate Preview</Button><Button type="submit" disabled={busy||!chartMatches}>Submit for Verification</Button><Button type="button" variant="outline" disabled={command.isPending} onClick={()=>setEditing(false)}>Discard Unsaved Form</Button></div>
        </fieldset></form>}
      <section className="rounded-xl border p-4 min-w-0"><h2 className="font-semibold">Retained Opening Versions</h2>{data.truncated&&<p className="text-sm">Latest 200 versions shown; older IDs remain retrievable.</p>}
        {data.versions.length?data.versions.map(v=><div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-sm"><p>Version #{v.id}: <strong>{v.state}</strong> | Preparer #{v.preparedBy}{v.journalId?` | Journal #${v.journalId}`:" | No financial journal"}</p><Button variant="outline" onClick={()=>{setSelected(v.id);setReason("");}}>Inspect Opening #{v.id}</Button></div>):<p className="text-sm text-muted-foreground mt-2">No opening version has been entered. This is not confirmation that balances are zero.</p>}
      </section><Link href="/accounting/trial-balance" className="text-primary underline text-sm">View posted Trial Balance</Link>
    </>}
    <Dialog open={selected!==null} onOpenChange={open=>{if(!open){setSelected(null);setReason("");}}}><DialogContent className="max-w-3xl min-w-0 [&>*]:min-w-0 break-words"><DialogHeader><DialogTitle>Opening Version #{selected}</DialogTitle><DialogDescription>Inspect immutable account figures, supporting references and independent decision history.</DialogDescription></DialogHeader>
      {detail.isLoading&&<Notice>Loading opening evidence...</Notice>}{detail.error&&<Notice error>{failure(detail.error)}</Notice>}
      {entry&&<><p className="text-sm"><strong>{entry.state}</strong> | Preparer #{entry.preparedBy} | {entry.journalId?`Journal #${entry.journalId}`:"No financial journal (explicit zero schedule)"}</p>
        <dl className="text-sm space-y-2"><div><dt className="font-medium">Date / policy</dt><dd>{entry.payload.request.cutoverDate} / {entry.payload.request.policyVersion}</dd></div>{evidenceLabels.map(([k,label])=><div key={k}><dt className="font-medium">{label}</dt><dd>{entry.payload.request[k]}</dd></div>)}</dl>
        <div className="space-y-2">{entry.payload.request.balances.map(b=>{const a=entry.payload.chart.find(a=>a.id===b.accountId);return <div key={b.accountId} className="border rounded-lg p-2 text-sm"><strong>{a?.code} {a?.name}</strong><p>Debit {formatAccountingMoney(b.debit)} | Credit {formatAccountingMoney(b.credit)}</p><p>{b.evidence}</p></div>;})}</div>
        <section className="text-sm"><h3 className="font-semibold">Audit History</h3>{entry.audit.map((a,i)=><p className="border-t py-2" key={i}>{a.createdAt}: {a.action} by #{a.actorId} | {a.reason}</p>)}</section>
        {entry.state==="pending"&&<><label className="text-sm">Decision reason / verification evidence<textarea aria-label="Opening decision reason" className={field} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="flex flex-wrap gap-2">
          {data?.permissions.includes("post")&&entry.preparedBy!==userId&&<><Button disabled={busy||detail.isFetching||!!detail.error||!reason.trim()} onClick={()=>void run({kind:"action",id:entry.id,request:{action:"verify",reason}})}>Verify and Initialise</Button><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void run({kind:"action",id:entry.id,request:{action:"reject",reason}})}>Reject Opening</Button></>}
          {data?.permissions.includes("prepare")&&entry.preparedBy===userId&&<><p className="text-sm">A different authorised reviewer must verify this version.</p><Button variant="outline" disabled={busy||!reason.trim()} onClick={()=>void run({kind:"action",id:entry.id,request:{action:"cancel",reason}})}>Cancel Pending Opening</Button></>}
        </div></>}
        {['rejected','cancelled'].includes(entry.state)&&data?.permissions.includes("prepare")&&!data.ready&&!data.versions.some(v=>v.state==='pending')&&<Button disabled={busy} onClick={()=>begin(entry.payload.request)}>Use as New Correction</Button>}
        {command.error&&<Notice error>{failure(command.error)}</Notice>}
      </>}
    </DialogContent></Dialog>
  </section>;
}
function Page({userId,activeBranchId}:{userId:number;activeBranchId:number|"all"}) {
  const [bookId,setBookId]=useState<number|undefined>(),[branchId,setBranchId]=useState<number|"all">(activeBranchId);
  const scope={userId,activeBranchId,bookId,branchId},catalog=useAccountingCatalog(scope);
  const books=[...new Map((catalog.data?.books??[]).map(b=>[b.id,b])).values()];
  return <div className="min-w-0 space-y-6"><header><h1 className="text-2xl font-bold">Opening Balances</h1><p className="text-muted-foreground">Enter and independently verify the complete starting ledger schedule before accounting transactions.</p></header>
    {catalog.isLoading?<Notice>Checking accounting access...</Notice>:catalog.error?<Notice error>{failure(catalog.error)}</Notice>:catalog.data?.status==='inactive'?<Notice>Official accounting is inactive. Opening entry will be available only for authorised approved books after separately controlled setup. No live balances, posting or activation occur on this page.</Notice>:<>
      <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><label className="text-sm">Accounting book<select aria-label="Accounting book" className={field} value={bookId??""} onChange={e=>{setBookId(Number(e.target.value)||undefined);setBranchId(activeBranchId);}}><option value="">Select authorised approved book</option>{books.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-sm">Opening branch<select aria-label="Opening branch" className={field} value={branchId} disabled={activeBranchId!=='all'} onChange={e=>setBranchId(Number(e.target.value)||'all')}><option value="all">Select one branch</option>{catalog.data?.books.filter(b=>b.id===bookId).map(b=><option key={b.branchId} value={b.branchId}>{b.branchName}</option>)}</select></label></div>
      {bookId&&branchId!=='all'?<Workspace key={`${bookId}:${branchId}`} scope={scope} userId={userId}/>:<Notice>Select one authorised book and branch. No opening is shared across branches.</Notice>}
    </>}
  </div>;
}
export default function OpeningBalancesPage(){const {user}=useAuth();const {activeBranchId}=useBranchScope();return user?<Page key={`${user.id}:${activeBranchId}`} userId={user.id} activeBranchId={activeBranchId}/>:null;}
