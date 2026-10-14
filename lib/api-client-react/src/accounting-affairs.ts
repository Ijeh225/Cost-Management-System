import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AccountingScope } from "./accounting";
import type { AffairsWorkspace,AffairsDetails,AffairsRequest,AffairsAction,OpeningSetupResult } from "./generated/api.schemas";
import { accountingCsvCell } from "./accounting-report-format";
function url(s:AccountingScope,suffix=""){return `/api/accounting/books/${s.bookId}/statement-of-affairs${suffix}?branchId=${s.branchId}`;}
const headers=(s:AccountingScope)=>({"X-Branch-Id":String(s.activeBranchId)});
export function useAffairsWorkspace(scope:AccountingScope){return useQuery({queryKey:["native-accounting","affairs",scope],enabled:!!scope.bookId&&scope.branchId!=="all",retry:false,
  queryFn:({signal})=>customFetch<AffairsWorkspace>(url(scope),{signal,headers:headers(scope)})});}
export function useAffairsVersion(scope:AccountingScope,id:number|null){return useQuery({queryKey:["native-accounting","affairs-version",scope,id],enabled:!!scope.bookId&&scope.branchId!=="all"&&!!id,retry:false,
  queryFn:({signal})=>customFetch<AffairsDetails>(url(scope,`/${id}`),{signal,headers:headers(scope)})});}
export type AffairsCommand={kind:"prepare";request:AffairsRequest}|{kind:"action";id:number;request:AffairsAction};
export function useAffairsCommand(scope:AccountingScope){const client=useQueryClient();return useMutation({retry:false,
  mutationFn:(c:AffairsCommand)=>customFetch<OpeningSetupResult>(url(scope,c.kind==="prepare"?"":`/${c.id}/action`),{method:"POST",headers:{...headers(scope),"Content-Type":"application/json"},body:JSON.stringify(c.request)}),
  onSuccess:()=>client.invalidateQueries({queryKey:["native-accounting"]})});}
export function affairsCsv(entry:AffairsDetails){const p=entry.payload,r=p.request,t=p.totals;
  const rows:unknown[][]=[["Statement of Affairs","Version",entry.id,"State",entry.state,"Superseded",entry.superseded],
    ["Book",p.bookId,"Branch",p.branchId,"Currency",p.currency,"As of",r.asOf],["Title",r.title],
    ["Preparer",entry.preparedBy,"Reviewer",entry.reviewedBy,"Reviewed at",entry.reviewedAt,"Decision",entry.decisionReason],
    ["Replaces",entry.replacesId],["Scope evidence",r.scopeEvidence],["Limitations",r.limitations],...p.warnings.map(w=>["WARNING",w]),
    ["Category","Identity","Name","Valuation","Basis","Declared book value (blank = unknown)","Basis explanation","Evidence"],
    ...r.lines.map(l=>[l.category,l.key,l.name,l.value,l.basis,l.bookValue,l.basisExplanation,l.evidence]),
    ...Object.entries(t).map(([k,v])=>["TOTAL / CONTROL",k,v]),
    ...entry.audit.map(a=>["AUDIT",a.createdAt,a.actorId,a.action,a.reason])];
  return "\uFEFF"+rows.map(row=>row.map(accountingCsvCell).join(",")).join("\r\n");
}
