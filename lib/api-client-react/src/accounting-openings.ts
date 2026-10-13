import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AccountingScope } from "./accounting";
import type { OpeningSetupWorkspace,OpeningSetupDetails,OpeningSetupRequest,OpeningSetupResult,OpeningSetupPreview,OpeningSetupAction } from "./generated/api.schemas";
function url(scope:AccountingScope,suffix="") {return `/api/accounting/books/${scope.bookId}/opening-balances${suffix}?branchId=${scope.branchId}`;}
function headers(scope:AccountingScope) {return {"X-Branch-Id":String(scope.activeBranchId)};}
export function useOpeningWorkspace(scope:AccountingScope) {
  return useQuery({queryKey:["native-accounting","opening",scope],enabled:!!scope.bookId && scope.branchId!=="all",retry:false,
    queryFn:({signal})=>customFetch<OpeningSetupWorkspace>(url(scope),{signal,headers:headers(scope)})});
}
export function useOpeningVersion(scope:AccountingScope,id:number|null) {
  return useQuery({queryKey:["native-accounting","opening-detail",scope,id],enabled:!!scope.bookId && scope.branchId!=="all" && !!id,retry:false,
    queryFn:({signal})=>customFetch<OpeningSetupDetails>(url(scope,`/${id}`),{signal,headers:headers(scope)})});
}
export type OpeningCommand = {kind:"preview";request:OpeningSetupRequest} | {kind:"prepare";request:OpeningSetupRequest}
  | {kind:"action";id:number;request:OpeningSetupAction};
export function useOpeningCommand(scope:AccountingScope) {
  const client=useQueryClient();
  return useMutation({mutationFn:async(command:OpeningCommand)=>{
    const options={method:"POST",headers:{...headers(scope),"Content-Type":"application/json"},body:JSON.stringify(command.request)};
    if(command.kind==="preview") return {kind:"preview" as const,value:await customFetch<OpeningSetupPreview>(url(scope,"/preview"),options)};
    return {kind:"write" as const,value:await customFetch<OpeningSetupResult>(url(scope,command.kind==="prepare"?"":`/${command.id}/action`),options)};
  },retry:false,onSuccess:result=>result.kind==="write" ? client.invalidateQueries({queryKey:["native-accounting"]}) : undefined});
}
