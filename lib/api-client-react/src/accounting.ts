import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AccountingCatalog, AccountingOptions, AccountingReport, AccountingJournal } from "./generated/api.schemas";

export type AccountingScope = { userId:number; activeBranchId:number|"all"; bookId?:number; branchId:number|"all" };
export type NativeReportFilters = {from:string;to:string;accountId?:number;periodId?:number;includeZero:boolean;includeInactive:boolean};
export function accountingReportQuery(filters:NativeReportFilters) {
  const query=new URLSearchParams({from:filters.from,to:filters.to,includeZero:String(filters.includeZero),includeInactive:String(filters.includeInactive)});
  if(filters.accountId) query.set("accountId",String(filters.accountId));
  if(filters.periodId) query.set("periodId",String(filters.periodId));
  return query;
}
function read<T>(url:string,scope:AccountingScope,signal:AbortSignal) {
  const separator=url.includes("?") ? "&" : "?";
  return customFetch<T>(`${url}${separator}branchId=${scope.branchId}`,{signal,headers:{"X-Branch-Id":String(scope.activeBranchId)}});
}
export function useAccountingCatalog(scope:AccountingScope) {
  return useQuery({queryKey:["native-accounting","catalog",scope.userId,scope.activeBranchId],
    queryFn:({signal})=>read<AccountingCatalog>("/api/accounting/catalog",{...scope,branchId:scope.activeBranchId},signal),retry:false});
}
export function useAccountingOptions(scope:AccountingScope,enabled:boolean) {
  return useQuery({queryKey:["native-accounting","options",scope],enabled:enabled && !!scope.bookId,
    queryFn:({signal})=>read<AccountingOptions>(`/api/accounting/books/${scope.bookId}/options`,scope,signal),retry:false});
}
export function useNativeAccountingReport(scope:AccountingScope,kind:AccountingReport["kind"],filters:NativeReportFilters|null,enabled:boolean) {
  return useQuery({queryKey:["native-accounting","report",scope,kind,filters],enabled:enabled && !!filters,
    queryFn:({signal})=>read<AccountingReport>(`/api/accounting/books/${scope.bookId}/reports/${kind}?${accountingReportQuery(filters!)}`,scope,signal),retry:false});
}
export function useAccountingJournal(scope:AccountingScope,id:number|null) {
  return useQuery({queryKey:["native-accounting","journal",scope,id],enabled:!!id && !!scope.bookId,
    queryFn:({signal})=>read<AccountingJournal>(`/api/accounting/books/${scope.bookId}/journals/${id}`,scope,signal),retry:false});
}
