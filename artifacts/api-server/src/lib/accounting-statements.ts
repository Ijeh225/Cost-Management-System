import { accountingDate, minorToMoney, moneyToMinor, requireAccounting } from "./accounting-rules.js";
import { buildAccountingReport, type ReportAccount, type ReportFilter, type ReportLine } from "./accounting-reports.js";
import { OPERATIONAL_SOURCE_KINDS } from "./accounting-operational-mapping.js";

export interface StatementLine extends ReportLine { evidence?: string }
export interface JobBudget { id:number; branchId:number; name:string; revenue:string|null; cost:string|null }
const signed=(value:string)=>value.startsWith("-") ? -moneyToMinor(value.slice(1)) : moneyToMinor(value);
const net=(line:ReportLine)=>BigInt(line.debitMinor)-BigInt(line.creditMinor);
type Evidence={source?:Record<string,any>;mapping?:Record<string,any>};
function evidence(line:StatementLine):Evidence {
  if(!line.eventKey.startsWith("source:")) return {}; // Freehand JSON is not a reviewed source mapping.
  try {
    const value=JSON.parse(line.evidence??"{}"),s=value?.source;
    const kind=s?.kind==="client_credit_application"?"invoice_payment":s?.kind;
    if(!s||!["client_deposit","invoice_payment","invoice",...OPERATIONAL_SOURCE_KINDS].includes(s.kind)
      ||!Number.isSafeInteger(s.id)||line.eventKey!==`source:${kind}:${s.id}:v1`||s.branchId!==undefined&&s.branchId!==line.branchId) return {};
    return value;
  }
  catch {return {};}
}
function financialYearStart(to:string,yearEnd:string) {
  requireAccounting(/^\d{2}-\d{2}$/.test(yearEnd),"POLICY_REQUIRED","Approved financial year-end required");
  let year=Number(to.slice(0,4));
  // February 29 year ends fall on February 28 in non-leap years.
  const end=(y:number)=>yearEnd==="02-29" && new Date(Date.UTC(y,1,29)).getUTCMonth()!==1 ? `${y}-02-28` : `${y}-${yearEnd}`;
  accountingDate(end(year));if(to<=end(year)) year--;
  const start=new Date(`${end(year)}T00:00:00Z`);start.setUTCDate(start.getUTCDate()+1);
  return start.toISOString().slice(0,10);
}
function cashClass(e:Evidence):"operating"|"investing"|"financing"|"transfer"|"unclassified" {
  const kind=e.source?.kind,effect=e.mapping?.effect;
  if(kind==="bank_transfer") return "transfer";
  if(["equity_funding","loan_funding","loan_repayment"].includes(effect)) return "financing";
  if(kind==="schedule_payment" && effect==="asset") return "investing";
  if(["client_deposit","invoice_payment","expense_payment"].includes(kind)
    || ["expense","income_funding"].includes(effect)) return "operating";
  // Advances, asset/liability funding and freehand journals need explicit further review.
  return "unclassified";
}

// Reuses the same scoped immutable posted lines as GL/TB. No operational cash replay.
export function buildAccountingStatements(accounts:ReportAccount[],input:StatementLine[],filter:ReportFilter,yearEnd:string,budgets:JobBudget[]=[]) {
  requireAccounting(filter.accountId===undefined,"INVALID_FILTER","Statements require the entire scoped chart, not a single account");
  const facts=input.filter(l=>l.status==="posted" && l.date<=filter.to);
  requireAccounting(new Set(budgets.map(b=>`${b.branchId}:${b.id}`)).size===budgets.length,"INVALID_MAPPING","Distinct scoped job budgets required");
  requireAccounting(new Set(facts.map(l=>l.id)).size===facts.length,"DUPLICATE_SOURCE","A posted line must appear exactly once");
  requireAccounting(accounts.every(a=>["asset","liability","equity","income","expense"].includes(a.category)),"INVALID_ACCOUNT","Supported chart categories required");
  const tb=buildAccountingReport(accounts,facts,{...filter,includeZero:true,includeInactive:true},"trial-balance");
  const byAccount=new Map(accounts.map(a=>[a.id,a]));
  const fy=financialYearStart(filter.to,yearEnd);
  const profit=(lines:StatementLine[])=>lines.reduce((sum,l)=>sum+(["income","expense"].includes(byAccount.get(l.accountId)!.category)?-net(l):0n),0n);
  const movements=facts.filter(l=>l.date>=filter.from && l.kind!=="opening");
  const plRows=tb.rows.filter(a=>a.category==="income"||a.category==="expense").map(a=>{
    const own=movements.filter(l=>l.accountId===a.id),amount=own.reduce((sum,l)=>sum+net(l),0n);
    return {accountId:a.id,code:a.code,name:a.name,category:a.category,amount:minorToMoney(a.category==="income"?-amount:amount)};
  });
  const income=plRows.filter(a=>a.category==="income").reduce((n,a)=>n+signed(a.amount),0n);
  const expense=plRows.filter(a=>a.category==="expense").reduce((n,a)=>n+signed(a.amount),0n);
  const bsRows=tb.rows.filter(a=>!["income","expense"].includes(a.category)).map(a=>({accountId:a.id,code:a.code,name:a.name,
    category:a.category,amount:minorToMoney(a.category==="asset"?signed(a.closing):-signed(a.closing))}));
  const sum=(category:string)=>bsRows.filter(a=>a.category===category).reduce((n,a)=>n+signed(a.amount),0n);
  const assets=sum("asset"),liabilities=sum("liability"),postedEquity=sum("equity");
  const prior=profit(facts.filter(l=>l.date<fy)),current=profit(facts.filter(l=>l.date>=fy));
  const difference=assets-liabilities-postedEquity-prior-current;

  const journals=new Map<number,StatementLine[]>();
  for(const l of facts){const group=journals.get(l.journalId)??[];group.push(l);journals.set(l.journalId,group);}
  const cashIds=new Set<number>(),arIds=new Set<number>(),apIds=new Set<number>();
  for(const lines of journals.values()) {
    const m=evidence(lines[0]!).mapping;
    if(!m) continue;
    for(const id of [m.cashAccountId,...Object.values(m.bankAccounts??{})])
      if(Number.isSafeInteger(id)&&byAccount.get(Number(id))?.category==="asset") cashIds.add(Number(id));
    if(Number.isSafeInteger(m.receivableAccountId)&&byAccount.get(m.receivableAccountId)?.category==="asset") arIds.add(m.receivableAccountId);
    if(m.effect==="overhead"&&Number.isSafeInteger(m.controlAccountId)&&byAccount.get(m.controlAccountId)?.category==="liability") apIds.add(m.controlAccountId);
  }
  requireAccounting([...cashIds].every(id=>!arIds.has(id)),"INVALID_MAPPING","Cash and receivable controls must differ across all posted mappings");
  const openingCash=facts.filter(l=>cashIds.has(l.accountId) && (l.date<filter.from || l.kind==="opening"))
    .reduce((n,l)=>n+net(l),0n);
  const closingCash=facts.filter(l=>cashIds.has(l.accountId)).reduce((n,l)=>n+net(l),0n);
  const buckets={operating:0n,investing:0n,financing:0n,transfer:0n,unclassified:0n};
  const cashEntries:{journalId:number;branchId:number;date:string;eventKey:string;classification:string;amount:string}[]=[];
  for(const lines of journals.values()) {
    const head=lines[0]!;if(head.date<filter.from||head.kind==="opening") continue;
    const amount=lines.filter(l=>cashIds.has(l.accountId)).reduce((n,l)=>n+net(l),0n);
    if(!lines.some(l=>cashIds.has(l.accountId))) continue;
    let classification=cashClass(evidence(head));
    if(classification==="transfer" && amount!==0n) classification="unclassified";
    buckets[classification]+=amount;
    cashEntries.push({journalId:head.journalId,branchId:head.branchId,date:head.date,eventKey:head.eventKey,classification,amount:minorToMoney(amount)});
  }
  const cashMovement=Object.values(buckets).reduce((n,v)=>n+v,0n);
  const accrualProfit=income-expense;
  // Exact indirect bridge: all non-cash balance-sheet movements + non-profit cash sources.
  const bridgeAccounts=accounts.filter(a=>!["income","expense"].includes(a.category)&&!cashIds.has(a.id)).map(a=>({accountId:a.id,code:a.code,name:a.name,
    adjustment:minorToMoney(-movements.filter(l=>l.accountId===a.id).reduce((n,l)=>n+net(l),0n))}));
  const bridgeAdjustment=bridgeAccounts.reduce((n,a)=>n+signed(a.adjustment),0n);

  const openItems=new Map<string,{type:"receivable"|"payable";branchId:number;sourceId:number;partyId:number|null;recognitionDate:string;
    dueDate:string|null;balance:bigint;accountIds:Set<number>}>();
  for(const lines of journals.values()) {
    const e=evidence(lines[0]!),s=e.source,m=e.mapping;
    if(!s||!m) continue;
    const type=s.invoiceId||s.kind==="invoice" ? "receivable" : s.expenseId ? "payable" : null;
    const sourceId=type==="receivable"?s.invoiceId??s.id:s.expenseId;
    const control=type==="receivable"?m.receivableAccountId:m.effect==="overhead"?m.controlAccountId:undefined;
    if(!type||!Number.isSafeInteger(sourceId)||!Number.isSafeInteger(control)) continue;
    const key=`${type}:${lines[0]!.branchId}:${sourceId}`;
    const row=openItems.get(key)??{type,branchId:lines[0]!.branchId,sourceId,partyId:Number.isSafeInteger(s.clientId)?s.clientId:null,
      recognitionDate:lines[0]!.date,dueDate:null,balance:0n,accountIds:new Set<number>()};
    if(lines[0]!.date<row.recognitionDate) row.recognitionDate=lines[0]!.date;
    // Only a retained structured due date is acceptable for historical aging.
    if(typeof s.dueDate==="string") {accountingDate(s.dueDate);row.dueDate=s.dueDate;}
    row.accountIds.add(control);
    row.balance+=lines.filter(l=>l.accountId===control).reduce((n,l)=>n+(type==="receivable"?net(l):-net(l)),0n);
    openItems.set(key,row);
  }
  const aging=(type:"receivable"|"payable",ids:Set<number>)=>{
    const rows=[...openItems.values()].filter(r=>r.type===type&&r.balance!==0n).map(r=>{
      const days=r.dueDate ? Math.floor((Date.parse(`${filter.to}T00:00:00Z`)-Date.parse(`${r.dueDate}T00:00:00Z`))/86400000) : null;
      const bucket=days===null?"undated":days<=0?"current":days<=30?"1-30":days<=60?"31-60":days<=90?"61-90":"90+";
      return {...r,accountIds:[...r.accountIds],balance:minorToMoney(r.balance),daysOverdue:days,bucket};
    });
    const total=rows.reduce((n,r)=>n+signed(r.balance),0n);
    const control=tb.rows.filter(a=>ids.has(a.id)).reduce((n,a)=>n+(type==="receivable"?signed(a.closing):-signed(a.closing)),0n);
    return {rows,total:minorToMoney(total),controlBalance:minorToMoney(control),unallocatedControl:minorToMoney(control-total),
      buckets:["current","1-30","31-60","61-90","90+","undated"].map(bucket=>({bucket,amount:minorToMoney(rows.filter(r=>r.bucket===bucket).reduce((n,r)=>n+signed(r.balance),0n))})),
      dueDatesComplete:rows.every(r=>r.dueDate!==null),controlAccounts:[...ids],identified:ids.size>0};
  };
  const branches=new Map<number,{branchId:number;income:bigint;expense:bigint;cashMovement:bigint}>();
  for(const l of movements) {
    const row=branches.get(l.branchId)??{branchId:l.branchId,income:0n,expense:0n,cashMovement:0n};
    const category=byAccount.get(l.accountId)!.category;
    if(category==="income") row.income-=net(l);if(category==="expense") row.expense+=net(l);
    if(cashIds.has(l.accountId)) row.cashMovement+=net(l);branches.set(l.branchId,row);
  }
  const jobs=new Map<string,{containerId:number;branchId:number;income:bigint;expense:bigint}>();
  const job=(id:number,branch:number)=>{const key=`${branch}:${id}`;const row=jobs.get(key)??{containerId:id,branchId:branch,income:0n,expense:0n};jobs.set(key,row);return row;};
  for(const lines of journals.values()) {
    const head=lines[0]!;if(head.date<filter.from||head.kind==="opening") continue;
    const {source:s,mapping:m}=evidence(head);if(!s||!m) continue;
    if(s.kind==="invoice"&&Array.isArray(s.items)&&Array.isArray(m.items)) {
      for(const item of s.items) if(Number.isSafeInteger(item.containerId)) {
        const splits=m.items.find((i:any)=>i.itemId===item.id)?.splits??[];
        job(item.containerId,head.branchId).income+=splits.filter((x:any)=>x.treatment==="income").reduce((n:bigint,x:any)=>n+moneyToMinor(x.amount),0n);
      }
    } else if(Number.isSafeInteger(s.containerId)) {
      job(s.containerId,head.branchId).expense+=lines.filter(l=>byAccount.get(l.accountId)!.category==="expense").reduce((n,l)=>n+net(l),0n);
    }
  }
  const jobRows=[...jobs.values()].map(r=>{
    const budget=budgets.find(b=>b.id===r.containerId&&b.branchId===r.branchId);
    return {containerId:r.containerId,branchId:r.branchId,name:budget?.name??`Container #${r.containerId}`,income:minorToMoney(r.income),expense:minorToMoney(r.expense),profit:minorToMoney(r.income-r.expense),
      budgetRevenue:budget?.revenue??null,budgetCost:budget?.cost??null,
      revenueVariance:budget?.revenue!=null?minorToMoney(r.income-signed(budget.revenue)):null,costVariance:budget?.cost!=null?minorToMoney(r.expense-signed(budget.cost)):null};
  });
  const allocatedIncome=[...jobs.values()].reduce((n,r)=>n+r.income,0n),allocatedExpense=[...jobs.values()].reduce((n,r)=>n+r.expense,0n);
  const warnings=["Posted double-entry balances only; a balanced equation is not proof of complete assets, loans, equity, obligations or independent reconciliation.",
    "Balance Sheet includes ALL posted history through the as-of date, not only the selected P&L period; prior unclosed earnings are separate from posted equity.",
    "Cash accounts are identified only by retained reviewed source mappings. Unmapped cash accounts and ambiguous cash purposes require review; no name-based guesses.",
    "AR/AP includes supported posted source open items. Opening control balances and unsupported allocations remain in unallocated control differences; undated items are not declared overdue.",
    "Job revenue uses item-level reviewed income, not the full B/L/invoice total per container. Unallocated credit notes, adjustments and overhead remain visible at book/branch level.",
    "Budget comparisons use current operational estimates when available, NOT historical approved budgets or posted accounting. Period actuals and lifetime budgets are different bases."];
  warnings.push("Operational budgets may include gross VAT or recoverable costs; posted expense actuals follow approved net/cost treatment. These context variances are not like-for-like approved budget variance.");
  if(cashIds.size===0) warnings.push("Cash classification is not configured by any retained source mapping; zero identified cash is NOT a confirmed zero bank balance.");
  if(cashEntries.some(e=>e.classification==="unclassified")) warnings.push("Cash-flow classification contains unresolved entries; reconciled cash movement is not a fully classified statutory cash-flow statement.");
  return {balanceSheet:{rows:bsRows,assets:minorToMoney(assets),liabilities:minorToMoney(liabilities),postedEquity:minorToMoney(postedEquity),
    priorUnclosedEarnings:minorToMoney(prior),currentYearEarnings:minorToMoney(current),financialYearStart:fy,equityIncludingEarnings:minorToMoney(postedEquity+prior+current),difference:minorToMoney(difference),balanced:difference===0n},
    profitAndLoss:{basis:"posted_accrual" as const,rows:plRows,income:minorToMoney(income),expense:minorToMoney(expense),profit:minorToMoney(accrualProfit)},
    cashFlow:{basis:"posted_identified_cash" as const,accountIds:[...cashIds],opening:minorToMoney(openingCash),closing:minorToMoney(closingCash),movement:minorToMoney(cashMovement),
      operating:minorToMoney(buckets.operating),investing:minorToMoney(buckets.investing),financing:minorToMoney(buckets.financing),transfers:minorToMoney(buckets.transfer),unclassified:minorToMoney(buckets.unclassified),
      difference:minorToMoney(closingCash-openingCash-cashMovement),identified:cashIds.size>0,classificationsComplete:cashIds.size>0&&cashEntries.every(e=>e.classification!=="unclassified"),entries:cashEntries,
      profitBridge:{profit:minorToMoney(accrualProfit),adjustments:bridgeAccounts,cashMovement:minorToMoney(accrualProfit+bridgeAdjustment),difference:minorToMoney(accrualProfit+bridgeAdjustment-cashMovement)}},
    receivables:aging("receivable",arIds),payables:aging("payable",apIds),
    branchPerformance:[...branches.values()].map(r=>({branchId:r.branchId,income:minorToMoney(r.income),expense:minorToMoney(r.expense),profit:minorToMoney(r.income-r.expense),cashMovement:minorToMoney(r.cashMovement)})),
    jobPerformance:{rows:jobRows,unallocatedIncome:minorToMoney(income-allocatedIncome),unallocatedExpense:minorToMoney(expense-allocatedExpense)},warnings};
}
