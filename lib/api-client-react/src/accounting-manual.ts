import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AccountingScope } from "./accounting";
import type { ManualAccountingWorkspace,ManualAccountingJournal,ManualAccountingRequest,ManualAccountingResult,ManualAccountingAction,ManualAccountingReversal,ManualAccountingAccountReview } from "./generated/api.schemas";

function url(scope:AccountingScope,suffix="") {return `/api/accounting/books/${scope.bookId}/manual${suffix}?branchId=${scope.branchId}`;}
function headers(scope:AccountingScope) {return {"X-Branch-Id":String(scope.activeBranchId)};}
export function useManualAccountingWorkspace(scope:AccountingScope,enabled:boolean) {
  return useQuery({queryKey:["native-accounting","manual",scope],enabled:enabled && !!scope.bookId && scope.branchId!=="all",
    queryFn:({signal})=>customFetch<ManualAccountingWorkspace>(url(scope),{signal,headers:headers(scope)}),retry:false});
}
export function useManualAccountingJournal(scope:AccountingScope,id:number|null) {
  return useQuery({queryKey:["native-accounting","manual-detail",scope,id],enabled:!!id && !!scope.bookId && scope.branchId!=="all",
    queryFn:({signal})=>customFetch<ManualAccountingJournal>(url(scope,`/${id}`),{signal,headers:headers(scope)}),retry:false});
}
export type ManualCommand = {kind:"prepare";request:ManualAccountingRequest} | {kind:"action";id:number;request:ManualAccountingAction}
  | {kind:"reversal";id:number;request:ManualAccountingReversal} | {kind:"review";request:ManualAccountingAccountReview};
export function useManualAccountingCommand(scope:AccountingScope) {
  const queryClient=useQueryClient();
  return useMutation({mutationFn:(command:ManualCommand)=>customFetch<ManualAccountingResult>(url(scope,command.kind==="prepare" ? "" : command.kind==="review" ? "/accounts/review" : `/${command.id}/${command.kind}`),
    {method:"POST",headers:{...headers(scope),"Content-Type":"application/json"},body:JSON.stringify(command.request)}),retry:false,
    onSuccess:()=>queryClient.invalidateQueries({queryKey:["native-accounting"]})});
}
