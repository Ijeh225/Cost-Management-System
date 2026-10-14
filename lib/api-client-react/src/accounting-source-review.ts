import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AccountingScope } from "./accounting";
import type { SourceReviewWorkspace,SourceReviewDetails,SourceReviewRequest,SourceReviewPayload,SourceReviewSummary,SourceReviewAction,SourceReviewCandidate,SourceReviewRef } from "./generated/api.schemas";
const headers=(s:AccountingScope)=>({'X-Branch-Id':String(s.activeBranchId)});
const url=(s:AccountingScope,path='')=>`/api/accounting/books/${s.bookId}/source-review${path}?branchId=${s.branchId}`;
export function useSourceReviewWorkspace(s:AccountingScope){return useQuery({queryKey:['native-accounting','source-review',s],enabled:!!s.bookId&&s.branchId!=='all',retry:false,
  queryFn:({signal})=>customFetch<SourceReviewWorkspace>(url(s),{signal,headers:headers(s)})});}
export function useSourceReviewDetails(s:AccountingScope,id:number|null){return useQuery({queryKey:['native-accounting','source-review-details',s,id],enabled:!!id&&!!s.bookId&&s.branchId!=='all',retry:false,
  queryFn:({signal})=>customFetch<SourceReviewDetails>(url(s,`/${id}`),{signal,headers:headers(s)})});}
export function useSourceReviewCandidate(s:AccountingScope,ref:SourceReviewRef|null){return useQuery({queryKey:['native-accounting','source-review-candidate',s,ref],enabled:!!ref&&!!s.bookId&&s.branchId!=='all',retry:false,
  queryFn:({signal})=>customFetch<SourceReviewCandidate>(url(s,`/sources/${ref!.kind}/${ref!.id}`),{signal,headers:headers(s)})});}
export type SourceReviewCommand={kind:'preview'|'prepare';request:SourceReviewRequest}|{kind:'action';id:number;request:SourceReviewAction};
export function useSourceReviewCommand(s:AccountingScope){const cache=useQueryClient();return useMutation({retry:false,mutationFn:async(c:SourceReviewCommand)=>{
  const value=await customFetch<SourceReviewPayload|SourceReviewSummary>(url(s,c.kind==='action'?`/${c.id}/action`:`/${c.kind}`),{method:'POST',headers:{...headers(s),'Content-Type':'application/json'},body:JSON.stringify(c.request)});
  return {kind:c.kind,value};
},onSuccess:r=>r.kind!=='preview'?cache.invalidateQueries({queryKey:['native-accounting']}):undefined});}
