import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { customFetch, getCsrfHeaders, useListActiveBanks } from '@workspace/api-client-react';
import { useBranchScope } from '@/components/layout/branch-provider';
import { useSettlementRequestKey } from '@/hooks/use-settlement-request-key';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/format';

type Recovery={id:number;amount:string;bankId:number;bankName:string;reference:string;narration:string;createdAt:string;reversalOfFundingId:number|null;writeoffAuditId:number;recordedBy:string};
export function DebtRecovery({invoiceId,writtenOffAmount,canReverse}:{invoiceId:number;writtenOffAmount:number;canReverse:boolean}) {
  const {activeBranchId}=useBranchScope(), qc=useQueryClient();
  const base=`/api/invoices/${invoiceId}/recoveries`;
  const query=useQuery<Recovery[]>({queryKey:['debt-recoveries',invoiceId,activeBranchId],queryFn:()=>customFetch(base)});
  const {data:banks=[]}=useListActiveBanks();
  const key=useSettlementRequestKey();
  const [mode,setMode]=useState<null|'record'|Recovery>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form,setForm]=useState({amount:'',bankId:'',date:new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'}),reference:'',reason:''});
  const rows=query.data??[], net=rows.reduce((s,r)=>s+Number(r.amount),0),remaining=Math.max(0,writtenOffAmount-net);
  const reversing=mode!==null&&mode!=='record';
  const open=(next:'record'|Recovery)=>{setMode(next);setError('');key.reset();setForm({amount:next==='record'?'':next.amount,bankId:next==='record'?'':String(next.bankId),date:new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Lagos'}),reference:'',reason:''});};
  const enabled=activeBranchId!=='all'&&!query.isFetching&&!query.error;
  async function save(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const payload={...form,bankId:Number(form.bankId)};
      await customFetch(base+(reversing?`/${mode.id}/reverse`:''),{method:'POST',headers:{...await getCsrfHeaders(),'Content-Type':'application/json'},body:JSON.stringify({...payload,requestId:key.forPayload({invoiceId,activeBranchId,...payload,reverseId:reversing?mode.id:null})})});
      await qc.invalidateQueries();setMode(null);key.reset();
    }catch(e){setError(e instanceof Error?e.message:'Recovery could not be saved');}finally{setBusy(false);}
  }
  return <section className="rounded-xl border p-4 space-y-3 min-w-0">
    <h2 className="font-semibold">Written-off Debt Recovery</h2>
    <p className="text-sm text-muted-foreground">Record money received into an active branch bank. The original write-off remains unchanged; this is separate recovery income, not a new invoice, VAT adjustment or reopened receivable. Cash-only recovery is not supported here. Native ledger posting requires a separate preparer and reviewer in VAT / Direct Expenses.</p>
    {query.isLoading&&<p role="status">Loading recoveries...</p>}{query.error&&<p role="alert">Unable to load recoveries; recording is disabled.</p>}
    <p>Net recovered: {formatCurrency(net)} | Remaining written-off debt: {formatCurrency(remaining)}</p>
    {activeBranchId==='all'&&<p role="status">Select the invoice branch before recording or reversing a recovery.</p>}
    <Button disabled={!enabled||remaining<=0} onClick={()=>open('record')}>Record Bank Recovery</Button>
    <ul className="space-y-2">{rows.map(r=><li key={r.id} className="rounded border p-3 text-sm break-words">
      <p>Bank source #{r.id}: {formatCurrency(Number(r.amount))} | {r.bankName} | {r.reference}</p>
      <p>{new Date(r.createdAt).toLocaleString('en-NG')} | {r.recordedBy} | Original write-off #{r.writeoffAuditId}{r.reversalOfFundingId&&` | Reversal of #${r.reversalOfFundingId}`}</p><p>{r.narration}</p>
      {canReverse&&Number(r.amount)>0&&!rows.some(x=>x.reversalOfFundingId===r.id)&&<Button variant="outline" disabled={!enabled} onClick={()=>open(r)}>Reverse Recovery #{r.id}</Button>}
    </li>)}</ul>
    <Dialog open={mode!==null} onOpenChange={value=>{if(!busy&&!value)setMode(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{reversing?'Reverse Bank Recovery':'Record Bank Recovery'}</DialogTitle><DialogDescription>Retains the original write-off and bank audit history. This records an application bank entry, not an instruction to a bank. Corrections use a linked full reversal.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-3"><fieldset disabled={busy||!enabled} className="space-y-3">
        <label className="block text-sm">Recovery amount<input aria-label="Recovery amount" className="w-full rounded border p-2" required inputMode="decimal" value={form.amount} readOnly={reversing} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
        <label className="block text-sm">Receiving bank<select aria-label="Receiving bank" required className="w-full rounded border p-2" value={form.bankId} disabled={reversing} onChange={e=>setForm({...form,bankId:e.target.value})}><option value="">Choose active branch bank</option>{banks.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="block text-sm">Recovery date<input aria-label="Recovery date" type="date" required className="w-full rounded border p-2" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
        <label className="block text-sm">Recovery reference<input aria-label="Recovery reference" required maxLength={200} className="w-full rounded border p-2" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})}/></label>
        <label className="block text-sm">Recovery reason<textarea aria-label="Recovery reason" required minLength={3} maxLength={1000} className="w-full rounded border p-2" value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></label>
        <Button type="submit">{busy?'Saving...':reversing?'Save Linked Recovery Reversal':'Save Bank Recovery'}</Button>
      </fieldset>{error&&<p role="alert">{error}</p>}</form>
    </DialogContent></Dialog>
  </section>;
}
