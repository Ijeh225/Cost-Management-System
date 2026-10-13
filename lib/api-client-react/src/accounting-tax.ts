import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { AccountingScope } from "./accounting";
import type { TaxConfigurationWorkspace,TaxConfigurationRequest,TaxConfigurationAction,TaxSourceRequest,TaxSource,TaxSourceResult,TaxSourceJournal,PostedTaxRegister,OpeningSetupResult } from "./generated/api.schemas";
const headers=(s:AccountingScope)=>({"X-Branch-Id":String(s.activeBranchId)});
const url=(s:AccountingScope,path="")=>`/api/accounting/books/${s.bookId}/tax-configuration${path}?branchId=${s.branchId}`;
export function useTaxWorkspace(s:AccountingScope){return useQuery({queryKey:["native-accounting","tax",s],enabled:!!s.bookId&&s.branchId!=="all",retry:false,
  queryFn:({signal})=>customFetch<TaxConfigurationWorkspace>(url(s),{signal,headers:headers(s)})});}
export function useTaxSource(s:AccountingScope,kind:TaxSource['kind'],id:number|null){return useQuery({queryKey:["native-accounting","tax-source",s,kind,id],enabled:!!id&&!!s.bookId,retry:false,
  queryFn:({signal})=>customFetch<TaxSource>(url(s,`/sources/${kind}/${id}`),{signal,headers:headers(s)})});}
export function useTaxJournal(s:AccountingScope,id:number|null){return useQuery({queryKey:["native-accounting","tax-journal",s,id],enabled:!!id&&!!s.bookId,retry:false,
  queryFn:({signal})=>customFetch<TaxSourceJournal>(url(s,`/journals/${id}`),{signal,headers:headers(s)})});}
export function useTaxRegister(s:AccountingScope,dates:{from:string;to:string}|null){return useQuery({queryKey:["native-accounting","tax-register",s,dates],enabled:!!dates&&!!s.bookId,retry:false,
  queryFn:({signal})=>customFetch<PostedTaxRegister>(url(s,"/register")+`&from=${encodeURIComponent(dates!.from)}&to=${encodeURIComponent(dates!.to)}`,{signal,headers:headers(s)})});}
export type TaxCommand={kind:"configure";request:TaxConfigurationRequest}|{kind:"decision";id:number;request:TaxConfigurationAction}
  |{kind:"preview"|"prepare";request:TaxSourceRequest}|{kind:"post";id:number;request:{reason:string}};
export function useTaxCommand(s:AccountingScope){const cache=useQueryClient();return useMutation({retry:false,mutationFn:async(c:TaxCommand)=>{
  const path=c.kind==="configure"?"":c.kind==="decision"?`/${c.id}/action`:c.kind==="post"?`/journals/${c.id}/post`:`/sources/${c.kind}`;
  const value=await customFetch<TaxSourceResult|OpeningSetupResult>(url(s,path),{method:"POST",headers:{...headers(s),"Content-Type":"application/json"},body:JSON.stringify(c.request)});
  return {command:c.kind,value};
},onSuccess:r=>r.command!=="preview"?cache.invalidateQueries({queryKey:["native-accounting"]}):undefined});}
