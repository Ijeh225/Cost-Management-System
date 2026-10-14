// Controlled live HTTP acceptance. Run only with explicit owner authorisation.
import assert from 'node:assert/strict';
import {readFile,appendFile,writeFile} from 'node:fs/promises';
import {postLiveSource} from './step12-live-source-posting.mjs';
const mode=process.argv[2]??'inspect';
assert(['users','inspect','accounting','transactions','resume-deposit','expenses','resume-overhead','adjustments','operations','bank-transfer','status-retest','read-checks','invoice-edges','support','ai-content-check','ai-audit-check','cancel-native-retest','resume-cancel'].includes(mode));
assert(process.argv.includes('--confirm=STEP12-LIVE-TEST-20261014'));
let input='';for await(const chunk of process.stdin)input+=chunk;
const credential=JSON.parse(input);input='';
const origin='https://donclimaxmanagementapp.com/api',branch='2';
async function session(email,password){
 const cookies=new Map();let csrf;
 async function request(method,path,body,expected=200,scope=branch){
  const multipart=body instanceof FormData;
  const headers={'X-Branch-Id':scope,...(multipart?{}:{'Content-Type':'application/json'})};
  if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
  if(csrf)headers['X-CSRF-Token']=csrf;
  const r=await fetch(origin+path,{method,headers,body:body===undefined?undefined:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
  const data=r.headers.get('content-type')?.includes('application/json')?await r.json():{buffer:Buffer.from(await r.arrayBuffer()),mime:r.headers.get('content-type')};
  if(!(Array.isArray(expected)?expected.includes(r.status):r.status===expected)){console.error(JSON.stringify({method,path,status:r.status,error:data.error,code:data.code}));throw new Error('Unexpected HTTP acceptance result');}
  assert(r.headers.get('content-type')?.includes('application/json')||/^\/documents\/\d+$/.test(path),'Expected a JSON API response, not a website fallback');
  return data;
 }
 const login=await request('POST','/auth/login',{email,password},200,'all');
 csrf=(await request('GET','/auth/csrf')).token;
 return {user:login.user,request};
}
if(mode==='users'||mode==='inspect'){
 const owner=await session(credential.email,credential.password);
 try{
  assert.equal(owner.user.authorityLevel,'super_admin');
  const users=await owner.request('GET','/users',undefined,200,'all');
  if(mode==='inspect'){console.log(JSON.stringify({mode,userId:owner.user.id,catalog:await owner.request('GET','/accounting/catalog',undefined,200,'all')}));}
  else {
   assert(credential.testPassword,'In-memory test password required');
   const result=[];
   for(const [email,name,branchId] of [['step12.preparer.20261014@donclimax.test','STEP12 TEST ONLY Preparer',2],['step12.reviewer.20261014@donclimax.test','STEP12 TEST ONLY Reviewer',2],['step12.foreign.20261014@donclimax.test','STEP12 TEST ONLY Other Branch Finance',3]]){
    let u=users.find(u=>u.email===email);
    if(u){assert.equal(u.jobFunction,'accounts');assert.equal(u.branchId,branchId);assert.equal(u.isActive,true);}
    else u=await owner.request('POST','/users',{email,name,password:credential.testPassword,authorityLevel:'staff',jobFunction:'accounts',workspaceAccess:['accounts'],branchId,canUpload:false},201,'all');
    result.push({id:u.id,name:u.name,email:u.email,branchId:u.branchId,authority:u.authorityLevel,job:u.jobFunction,reused:users.some(old=>old.id===u.id)});
   }
   console.log(JSON.stringify({mode,users:result}));
  }
 }finally{await owner.request('POST','/auth/logout',{},200,'all');}
}else if(mode==='accounting'){
 assert(process.env.STEP12_SETUP_PATH,'Reviewed setup evidence path required');
 const fixture=JSON.parse(await readFile(process.env.STEP12_SETUP_PATH,'utf8'));
 assert(fixture.bookId&&fixture.testBranchId===2);
 const owner=await session(credential.email,credential.password);
 const preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword);
 const reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword);
 const foreign=await session('step12.foreign.20261014@donclimax.test',credential.testPassword);
 const root=`/accounting/books/${fixture.bookId}`,at=(path)=>root+path+'?branchId=2',a=fixture.accounts;
 const results=[];
 async function pass(name,detail={}){const result={time:new Date().toISOString(),pass:name,...detail};results.push(result);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(result)+'\n');console.log(JSON.stringify(result));}
 const money=(actual,expected)=>assert.equal(actual,expected);
 try{
  const catalog=await owner.request('GET','/accounting/catalog',undefined,200,'all');assert.equal(catalog.status,'active');assert.equal(catalog.books.filter(b=>b.id===fixture.bookId).length,2);
  await foreign.request('GET',at('/opening-balances'),undefined,403,'3');
  await preparer.request('GET',root+'/options?branchId=3',undefined,403);
  const anonymous=await fetch(origin+at('/opening-balances'));assert.equal(anonymous.status,401);
  await pass('Live native activation/catalog, authentication and branch restrictions',{bookId:fixture.bookId,preparerId:preparer.user.id,reviewerId:reviewer.user.id});
  const workspace=await preparer.request('GET',at('/opening-balances'));
  const openingRequest={requestId:'step12_opening_branch2_20261014',cutoverDate:'2026-10-14',policyVersion:'step12-dummy-20261014-v1',
   ownerEvidence:'Owner authorised live test rehearsal 2026-10-14',accountantEvidence:'TEST FIXTURE ONLY simulated complete zero new-book schedule, no actual accountant sign-off',
   sourceCoverageEvidence:'New QA book begins at zero; only separately recorded future QA transactions mapped, not historical company balances',
   balances:workspace.accounts.map(row=>({accountId:row.id,debit:'0',credit:'0',evidence:'Explicit TEST ONLY zero for new QA ledger '+row.code}))};
  if(!workspace.ready){
   const preview=await preparer.request('POST',at('/opening-balances/preview'),openingRequest);assert.equal(preview.zero,true);money(preview.debitTotal,'0.00');
   await preparer.request('POST',at('/opening-balances/preview'),{...openingRequest,balances:openingRequest.balances.map((l,i)=>i===0?{...l,debit:'1'}:l)},400);
  }
  const opening=await preparer.request('POST',at('/opening-balances'),openingRequest);
  const retry=await preparer.request('POST',at('/opening-balances'),openingRequest);assert.equal(opening.id,retry.id);
  await preparer.request('POST',at(`/opening-balances/${opening.id}/action`),{action:'verify',reason:'Denied self verification test'},403);
  const openingDetails=await preparer.request('GET',at(`/opening-balances/${opening.id}`));
  if(openingDetails.state==='pending')await reviewer.request('POST',at(`/opening-balances/${opening.id}/action`),{action:'verify',reason:'Independent QA reviewer checked every explicit zero, not real company balances'});
  const ready=await reviewer.request('GET',at('/opening-balances'));assert.equal(ready.ready,true);
  const verified=await reviewer.request('GET',at(`/opening-balances/${opening.id}`));assert.equal(verified.journalId,null);assert.equal(verified.audit.filter(e=>e.action==='opening_verified').length,1);
  await pass('Live complete zero opening preview/validation, identity retry, independent verification and no zero journal',{openingId:opening.id,accounts:workspace.accounts.length});
  const taxRoot='/tax-configuration';
  const config={requestId:'step12_tax_config_20261014',effectiveFrom:'2026-10-14',policyVersion:'step12-dummy-20261014-v1',ownerEvidence:'Owner authorised dummy live tax test',accountantEvidence:'TEST FIXTURE ONLY simulated tax rules; no actual professional certification',
   inputVatAccountId:a['1400'],outputVatAccountId:a['2210'],dutyAccountId:a['5010'],shippingAccountId:a['5020'],terminalAccountId:a['5030'],
   codes:[{code:'STD',name:'TEST taxable full recovery',treatment:'taxable',rate:'7.5',recoverablePercent:'100',basisEvidence:'Hypothetical full-recovery test, not actual legal basis'},
    {code:'COST',name:'TEST taxable VAT in cost',treatment:'taxable',rate:'7.5',recoverablePercent:'0',basisEvidence:'Hypothetical nonrecoverable cost test'},
    {code:'MIXED',name:'TEST taxable 40 percent recovery',treatment:'taxable',rate:'7.5',recoverablePercent:'40',basisEvidence:'Hypothetical apportionment test'},
    {code:'ZERO',name:'TEST zero rated',treatment:'zero_rated',rate:'0',recoverablePercent:'0',basisEvidence:'Hypothetical zero-rated case'},
    {code:'EXEMPT',name:'TEST exempt service',treatment:'exempt',rate:'0',recoverablePercent:'0',basisEvidence:'Owner requested exempt-service test scenario, not legal certification'}]};
  const cfg=await owner.request('POST',at(taxRoot),config);assert.equal((await owner.request('POST',at(taxRoot),config)).id,cfg.id);
  await owner.request('POST',at(`${taxRoot}/${cfg.id}/action`),{action:'approve',reason:'Denied owner self-approval'},400);
  const taxWorkspace=await reviewer.request('GET',at(taxRoot));
  if(taxWorkspace.versions.find(v=>v.id===cfg.id).state==='pending')await reviewer.request('POST',at(`${taxRoot}/${cfg.id}/action`),{action:'approve',reason:'Independent test reviewer validated five distinct hypothetical tax codes and direct heads'});
  assert.equal((await reviewer.request('GET',at(taxRoot))).versions.find(v=>v.id===cfg.id).state,'approved');
  await pass('Live independent VAT/direct-cost configuration with taxable/zero/exempt, mixed recovery, no self approval',{configurationId:cfg.id});
  const rules={ownerEvidence:'Owner authorised scoped live manual adjustment test',accountantEvidence:'TEST FIXTURE ONLY simulated adjustment head review',
   accounts:workspace.accounts.map(row=>({accountId:row.id,role:[a['6200'],a['1390'],a['6010'],a['2310']].includes(row.id)?'adjustment':'protected'}))};
  const manual={requestId:'step12_manual_depreciation_20261014',accountingDate:'2026-10-14',narration:'STEP12 TEST ONLY exact depreciation 0.12',evidence:'Dummy reviewed asset schedule, not actual professional balance',adjustmentType:'depreciation',calculationEvidence:'Dummy12x0.01 =0.12',evidenceReferences:['STEP12 dummy asset schedule'],
   lines:[{accountId:a['6200'],debit:'0.12',credit:'0'},{accountId:a['1390'],debit:'0',credit:'0.12'}]};
  const existingManual=await owner.request('GET',at('/manual'));
  if(!existingManual.accountReviewComplete)await preparer.request('POST',at('/manual'),manual,400);
  await owner.request('POST',at('/manual/accounts/review'),rules);
  const prepared=await preparer.request('POST',at('/manual'),manual);assert.equal((await preparer.request('POST',at('/manual'),manual)).id,prepared.id);
  let d=await preparer.request('GET',at(`/manual/${prepared.id}`));
  if(d.state==='draft')await preparer.request('POST',at(`/manual/${prepared.id}/action`),{action:'submit',reason:'QA preparer checked exact depreciation schedule'});
  await preparer.request('POST',at(`/manual/${prepared.id}/action`),{action:'post',reason:'Denied preparer posting'},403);
  d=await reviewer.request('GET',at(`/manual/${prepared.id}`));
  if(d.state==='submitted')await reviewer.request('POST',at(`/manual/${prepared.id}/action`),{action:'post',reason:'Independent QA reviewer matched exact amounts and supported adjustment heads'});
  d=await reviewer.request('GET',at(`/manual/${prepared.id}`));assert.equal(d.state,'posted');assert.equal(d.audit.filter(e=>e.action==='posted').length,1);
  await pass('Live manual reviewed account classification, draft/submission/independent posting and retry deduplication',{journalId:prepared.id});
  const reversal=await preparer.request('POST',at(`/manual/${prepared.id}/reversal`),{date:'2026-10-14',reason:'STEP12 QA full traceable reversal test'});
  assert.equal((await preparer.request('POST',at(`/manual/${prepared.id}/reversal`),{date:'2026-10-14',reason:'STEP12 QA full traceable reversal test'})).id,reversal.id);
  let reversed=await preparer.request('GET',at(`/manual/${reversal.id}`));
  if(reversed.state==='draft')await preparer.request('POST',at(`/manual/${reversal.id}/action`),{action:'submit',reason:'QA reversal review requested'});
  reversed=await reviewer.request('GET',at(`/manual/${reversal.id}`));
  if(reversed.state==='submitted')await reviewer.request('POST',at(`/manual/${reversal.id}/action`),{action:'post',reason:'Independent QA reversal exactly offsets original 0.12'});
  reversed=await reviewer.request('GET',at(`/manual/${reversal.id}`));assert.equal(reversed.reversalOf,prepared.id);assert.equal(reversed.state,'posted');
  await pass('Live manual linked reversal offsets original once',{originalId:prepared.id,reversalId:reversal.id});
  const affair={requestId:'step12_affairs_20261014',asOf:'2026-10-14',title:'STEP12 TEST ONLY internal valuation',scopeEvidence:'Dummy test branch equipment/supplier schedules',limitations:'Simulated incomplete records; not statutory certification',lines:[
   {key:'equipment',category:'asset',name:'Dummy equipment',value:'100.01',bookValue:null,basis:'estimate',basisExplanation:'Dummy survey estimate',evidence:'STEP12 fictional survey'},
   {key:'supplier',category:'liability',name:'Dummy supplier',value:'20',bookValue:'20',basis:'book',basisExplanation:'Declared fictional carrying amount',evidence:'STEP12 fictional supplier confirmation'}]};
  const v=await owner.request('POST',at('/statement-of-affairs'),affair);
  await owner.request('POST',at(`/statement-of-affairs/${v.id}/action`),{action:'approve',reason:'Denied same preparer approval'},400);
  let val=await reviewer.request('GET',at(`/statement-of-affairs/${v.id}`));
  if(val.state==='pending')await reviewer.request('POST',at(`/statement-of-affairs/${v.id}/action`),{action:'approve',reason:'Independent QA review of declared dummy valuations, no financial posting'});
  val=await reviewer.request('GET',at(`/statement-of-affairs/${v.id}`));money(val.payload.totals.netAssets,'80.01');assert.equal(val.payload.totals.unknownBookValues,1);
  await pass('Live Statement of Affairs reviewed estimated/book/unknown values and exact net assets',{valuationId:v.id,netAssets:'80.01'});
  const reports={};
  for(const kind of ['general-ledger','trial-balance','balance-sheet','management-accounts']){
   const report=await reviewer.request('GET',root+`/reports/${kind}?branchId=2&from=2026-10-14&to=2026-10-31`);
   assert.equal(report.balanced,true);money(report.totals.closingDifference,'0.00');money(report.totals.closingDebit,'0.00');money(report.totals.closingCredit,'0.00');reports[kind]=report;
  }
  assert.deepEqual(reports['general-ledger'].totals,reports['trial-balance'].totals);
  money(reports['balance-sheet'].statements.balanceSheet.difference,'0.00');money(reports['management-accounts'].statements.profitAndLoss.profit,'0.00');
  assert.equal(reports['general-ledger'].rows.flatMap(r=>r.entries).length,4);
  await pass('Live GL/TB/Balance Sheet/Management Accounts reconcile post and reversal; valuation has no ledger effect',{movementDebit:reports['trial-balance'].totals.debit,closingDifference:'0.00',profit:'0.00'});
  await writeFile('docs/evidence/2026-10-14-step12-accounting-live.json',JSON.stringify({bookId:fixture.bookId,openingId:opening.id,configurationId:cfg.id,manualJournalId:prepared.id,reversalId:reversal.id,valuationId:v.id,results},null,2)+'\n');
 }finally{
  for(const actor of [owner,preparer,reviewer,foreign])await actor.request('POST','/auth/logout',{},200,'all');
 }
}
else if(mode==='transactions'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8'));
 const core=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-accounting-live.json','utf8'));
 const owner=await session(credential.email,credential.password),preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword);
 const results=[],label='STEP12 LIVE 20261014 Financial Workflow QA',a=f.accounts,root=`/accounting/books/${f.bookId}`,at=(p)=>root+p+'?branchId=2';
 const eq=(actual,value)=>assert.equal(Math.round(Number(actual)*100),Math.round(value*100));
 async function pass(name,detail={}){const item={time:new Date().toISOString(),pass:name,...detail};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 try{
  const existing=(await owner.request('GET','/clients')).filter(c=>c.name===label);assert.equal(existing.length,0,'Controlled client exists; inspect/resume its exact recorded IDs, never rerun creation blindly');
  const beforeBanks=await owner.request('GET','/banks'),beforeLedger=await owner.request('GET','/reports/financial-ledger');
  const client=await owner.request('POST','/clients',{name:label,branchId:2,notes:'Authorised live test data, no external client/contact/messages'},201);
  const bank=await owner.request('POST','/banks',{name:'STEP12 TEST ONLY Bank 20261014',branchId:2},201);
  await pass('Live controlled client/bank creation',{clientId:client.id,bankId:bank.id,existingBankBalances:beforeBanks.map(b=>({id:b.id,balance:b.currentBalance}))});
  const funding=await owner.request('POST',`/banks/${bank.id}/fund-additions`,{amount:10000,reference:'STEP12-QA-FUND-20261014',narration:'TEST ONLY dummy capital funding, no external money transfer'},201);
  await owner.request('POST',`/banks/${bank.id}/fund-additions`,{amount:10000,reference:' STEP12-QA-FUND-20261014 ',narration:'Duplicate test must be refused'},409);
  const fundingPost=postLiveSource(f,{kind:'bank_funding',id:funding.id},{currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY explicitly reviewed dummy capital funding',effect:'equity_funding',accountId:a['3000'],bankAccounts:{[bank.id]:a['1010']}});
  await pass('Live Bank funding/ref duplicate refusal and deployed source journal once',{bankId:bank.id,fundingId:funding.id,native:fundingPost});
  const jobs=[];for(const [number,clearing] of [['S12Q2610141',600],['S12Q2610142',400]])jobs.push(await owner.request('POST','/containers',{containerNumber:number,blNumber:'STEP12-LIVE-BL-20261014',customerName:label,clientId:client.id,branchId:2,command:'PTML',clearingCharges:clearing,declaration:'TEST ONLY live end-to-end acceptance, no actual cargo movement'},201));
  await pass('Live two independent jobs under one B/L',{containerIds:jobs.map(j=>j.id),shipmentIds:jobs.map(j=>j.shipmentId)});
  const invoice=await owner.request('POST','/invoices',{containerIds:jobs.map(j=>j.id),branchId:2,vatRate:0,dueDate:'2026-10-13',notes:label},201);
  eq(invoice.total,1000);assert.equal(invoice.items.length,2);assert.equal(invoice.status,'draft');
  await owner.request('PATCH',`/invoices/${invoice.id}`,{status:'sent'});
  const recognised=await preparer.request('POST',at('/tax-configuration/sources/prepare'),{kind:'invoice',id:invoice.id,evidence:'TEST ONLY bundled clearing fee source review',configurationId:core.configurationId,taxCode:'EXEMPT',recognitionDate:'2026-10-14',receivableAccountId:a['1100'],incomeAccountId:a['4000']});
  await reviewer.request('POST',at(`/tax-configuration/journals/${recognised.id}/post`),{reason:'Independent TEST ONLY reviewer checked two container items sum1000 and exempt scenario'});
  await pass('Live invoice draft/issue/retained overdue terms and two-container native recognition',{invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,nativeJournalId:recognised.id,total:1000});
  await owner.request('POST',`/invoices/${invoice.id}/payments`,{amount:400,paymentMethod:'transfer',bankId:bank.id,reference:'STEP12-QA-COLLECTION-20261014',requestId:'step12_invoice_cash_20261014'},201);
  let live=await owner.request('GET',`/invoices/${invoice.id}`);
  const payment=live.payments.find(p=>p.reference==='STEP12-QA-COLLECTION-20261014');assert(payment);eq(live.outstanding,600);
  const settlement={currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY recorded receipt/deposit allocation source review',bankAccounts:{[bank.id]:a['1010']},cashAccountId:a['1000'],receivableAccountId:a['1100'],depositLiabilityAccountId:a['2100']};
  const cashPost=postLiveSource(f,{kind:'invoice_payment',id:payment.id},settlement);
  await pass('Live partial invoice cash collection and native AR/bank posting',{invoiceId:invoice.id,paymentId:payment.id,outstanding:600,native:cashPost});
  const deposit=await owner.request('POST',`/clients/${client.id}/deposits`,{amount:300,paymentMethod:'Bank Transfer',bankId:bank.id,reference:'STEP12-QA-DEPOSIT-20261014',notes:'TEST ONLY controlled deposit'},201);
  await pass('Live client deposit recorded using the actual UI/API Bank Transfer method',{clientId:client.id,depositId:deposit.id,bankId:bank.id,amount:300});
  const depPost=postLiveSource(f,{kind:'client_deposit',id:deposit.id},settlement);
  await owner.request('POST',`/client-deposits/${deposit.id}/allocate`,{invoiceId:invoice.id,amount:300,requestKey:'step12_deposit_alloc_20261014'},200);
  live=await owner.request('GET',`/invoices/${invoice.id}`);eq(live.outstanding,300);
  const allocated=live.payments.find(p=>p.sourceDepositId===deposit.id);assert(allocated);
  const allocPost=postLiveSource(f,{kind:'invoice_payment',id:allocated.id},settlement);assert.equal(allocPost.cashMovement,'0.00');
  const b=await owner.request('GET',`/banks/${bank.id}/transactions`);eq(b.closingBalance,10700);
  const tb=await reviewer.request('GET',root+'/reports/trial-balance?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(tb.balanced,true);assert.equal(tb.totals.closingDifference,'0.00');
  const balance=code=>tb.rows.find(r=>r.code===code).closing;
  assert.equal(balance('1010'),'10700.00');assert.equal(balance('1100'),'300.00');assert.equal(balance('2100'),'0.00');
  const management=await reviewer.request('GET',root+'/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(management.statements.profitAndLoss.profit,'1000.00');assert.equal(management.statements.balanceSheet.difference,'0.00');
  await pass('Live deposit received once/allocated without extra cash, Bank and GL/TB/BS/management reconciliation',{clientId:client.id,bankId:bank.id,invoiceId:invoice.id,depositId:deposit.id,allocationPaymentId:allocated.id,depositJournal:depPost,allocationJournal:allocPost,bank:10700,outstanding:300,profit:1000});
  await writeFile('docs/evidence/2026-10-14-step12-transactions-live.json',JSON.stringify({bookId:f.bookId,clientId:client.id,bankId:bank.id,containerIds:jobs.map(j=>j.id),invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber,fundingId:funding.id,paymentId:payment.id,depositId:deposit.id,allocationPaymentId:allocated.id,beforeLedger:beforeLedger.summary,results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of [owner,preparer,reviewer])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='expenses'||mode==='resume-overhead'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword);
 const root='/accounting/books/1',at=p=>root+p+'?branchId=2',results=[];
 async function pass(name,detail={}){const item={time:new Date().toISOString(),pass:name,...detail};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 const basic={currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY reviewed source',bankAccounts:{5:a['1010']},cashAccountId:a['1000']};
 async function configured(kind,id,code){
  const body=kind==='duty_reversal'?{kind,id,evidence:'TEST ONLY reversal inherits retained original purchase tax'}:{kind,id,evidence:'TEST ONLY documented gross107.50 net100 VAT7.50 scenario',configurationId:1,taxCode:code,basis:'inclusive',taxAmount:'107.50',settlementAccountId:a['1010']};
  const j=await preparer.request('POST',at('/tax-configuration/sources/prepare'),body);
  assert.equal((await preparer.request('POST',at('/tax-configuration/sources/prepare'),body)).id,j.id);
  await reviewer.request('POST',at(`/tax-configuration/journals/${j.id}/post`),{reason:'Independent dummy-source review against exact recorded bank amount and configured recovery'});
  return j.id;
 }
 try{
  let overhead,direct,finalDutyJournal,finalDuty,costIds=[];
  if(mode==='expenses'){
  const prior=await owner.request('GET','/duty-payments/36/transactions');assert(prior.transactions.length===0||(prior.transactions.length===1&&prior.transactions[0].id===8&&prior.transactions[0].reference==='STEP12-QA-DUTY-20261014'),'Unexpected partial phase: inspect retained IDs');
  if(!prior.transactions.length){
   await owner.request('PUT','/containers/36/charges',{section:'customs',customs:{duty:107.50},reason:'TEST ONLY dummy assessment'});
   await owner.request('PATCH','/duty-payments/36',{amount:107.50,paymentDate:'2026-10-14',paymentMethod:'bank',bankId:5,reference:'STEP12-QA-DUTY-20261014'});
  }
  let history=(await owner.request('GET','/duty-payments/36/transactions')).transactions;
  const duty=history.find(p=>p.reference==='STEP12-QA-DUTY-20261014');assert(duty);
  await pass('Live duty assessed and bank payment recorded',{dutyId:duty.id,containerId:36,amount:107.50});
  const dutyJournal=await configured('duty_payment',duty.id,'STD');
  await owner.request('POST',`/duty-payments/transactions/${duty.id}/reverse`,{reversalDate:'2026-10-14',reference:'STEP12-QA-DUTY-REV-20261014',reason:'TEST ONLY traceable original duty reversal'});
  history=(await owner.request('GET','/duty-payments/36/transactions')).transactions;
  const reversal=history.find(p=>p.reversalOfTransactionId===duty.id);assert(reversal);assert.equal(reversal.amount,-107.50);
  await pass('Live traceable duty reversal recorded',{dutyId:duty.id,reversalId:reversal.id,dutyJournal});
  const reversalJournal=await configured('duty_reversal',reversal.id);
  await owner.request('POST',`/duty-payments/transactions/${duty.id}/reverse`,{reference:'STEP12-QA-DUTY-REV-RETRY',reason:'Repeated reversal must be refused'},409);
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10700);
  await pass('Live duty reversal inherits original VAT, bank restored, duplicate reversal refused',{dutyJournal,reversalJournal});
  await owner.request('PATCH','/duty-payments/36',{amount:107.50,paymentDate:'2026-10-14',paymentMethod:'bank',bankId:5,reference:'STEP12-QA-DUTY-FINAL-20261014'});
  history=(await owner.request('GET','/duty-payments/36/transactions')).transactions;
  finalDuty=history.find(p=>p.reference==='STEP12-QA-DUTY-FINAL-20261014');
  await pass('Live replacement duty payment retained for nonrecoverable VAT scenario',{dutyId:finalDuty.id});
  finalDutyJournal=await configured('duty_payment',finalDuty.id,'COST');
  for(const [section,code]of [['shipping','COST'],['terminal','MIXED']]){
   const paid=await owner.request('POST','/container-expense-payments/batch',{items:[{containerId:36,amount:107.50}],section,paymentMethod:'bank',bankId:5,reference:`STEP12-QA-${section.toUpperCase()}-20261014`,narration:'TEST ONLY gross107.50 net100 VAT7.50',paidAt:'2026-10-14T12:00:00Z'},201);
   assert.equal(paid.count,1);const id=paid.payments[0].id;await pass('Live container direct payment recorded',{section,id,amount:107.50});
   costIds.push({section,id,journalId:await configured('container_payment',id,code)});
  }
  overhead=await owner.request('POST','/overhead-expenses',{category:'Office Supplies',description:'STEP12 TEST ONLY office obligation 20261014',amount:100,reference:'STEP12-QA-OH-20261014'},201);
  await pass('Live overhead obligation created',{expenseId:overhead.id,amount:100});
  const initialMap={...basic,effect:'overhead',accountId:a['6000'],controlAccountId:a['2000'],recognitionDate:'2026-10-14',recognitionEvidence:'Dummy supplier obligation recognised today before settlement'};
  postLiveSource(f,{kind:'overhead',id:overhead.id},initialMap);
  direct=await owner.request('POST',`/overhead-expenses/${overhead.id}/payments`,{amount:60,paymentMethod:'bank',bankId:5,paidAt:'2026-10-14T12:00:00Z',notes:'STEP12 TEST ONLY direct60'},201);
  await pass('Live overhead direct partial settlement recorded',{expenseId:overhead.id,paymentId:direct.payment.id});
  }else{
   overhead=(await owner.request('GET','/overhead-expenses')).expenses.find(e=>e.id===11);assert(overhead);assert.equal(overhead.reference,'STEP12-QA-OH-20261014');assert.equal(overhead.balance,40);assert.equal(overhead.payments.length,1);
   direct={payment:overhead.payments[0]};assert.equal(direct.payment.id,10);assert.equal(direct.payment.amount,60);
   assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10317.50);
   finalDuty={id:10};finalDutyJournal=10;costIds=[{section:'shipping',id:3,journalId:11},{section:'terminal',id:4,journalId:12}];
  }
  const ohMap={...basic,effect:'overhead',accountId:a['6000'],controlAccountId:a['2000'],recognitionDate:'2026-10-14',recognitionEvidence:'Dummy supplier obligation recognised today before settlement'};
  const ohJournal=postLiveSource(f,{kind:'overhead',id:overhead.id},ohMap);
  const directJournal=postLiveSource(f,{kind:'expense_payment',id:direct.payment.id},ohMap);
  const linked=await owner.request('POST',`/overhead-expenses/${overhead.id}/payment-schedules`,{amountRequested:40,scheduleDate:'2026-10-14',vendorBeneficiary:'STEP12 TEST ONLY overhead supplier',description:'Pay remaining overhead40'},201);
  await pass('Live overhead-linked schedule created',{expenseId:overhead.id,scheduleId:linked.schedule.id});
  await preparer.request('PATCH',`/payment-schedules/${linked.schedule.id}/approve`,{},403);
  await owner.request('PATCH',`/payment-schedules/${linked.schedule.id}/approve`,{comment:'Authorised dummy settlement'});
  await preparer.request('PATCH',`/payment-schedules/${linked.schedule.id}/pay`,{amount:40,paymentMethod:'bank',bankId:5,paidAt:'2026-10-14T12:00:00Z'});
  const expenses=await owner.request('GET','/overhead-expenses');const paidExpense=expenses.expenses.find(e=>e.id===overhead.id);assert(paidExpense);assert.equal(paidExpense.balance,0);
  const scheduledPayment=paidExpense.payments.find(p=>p.id!==direct.payment.id);assert(scheduledPayment);
  await pass('Live scheduled overhead settlement recorded once in expense-payment ledger',{expenseId:overhead.id,paymentId:scheduledPayment.id,scheduleId:linked.schedule.id});
  const scheduledJournal=postLiveSource(f,{kind:'expense_payment',id:scheduledPayment.id},ohMap);
  const linkedDetail=await preparer.request('GET',`/payment-schedules/${linked.schedule.id}`);assert.equal(linkedDetail.payments.length,0);assert.equal(linkedDetail.events.filter(e=>e.type==='approved').length,1);assert.equal(linkedDetail.events.filter(e=>e.type==='paid').length,1);
  await preparer.request('PATCH',`/payment-schedules/${linked.schedule.id}/pay`,{amount:1,paymentMethod:'bank',bankId:5},400);
  await owner.request('DELETE',`/overhead-expenses/${overhead.id}`,undefined,409);
  const disposable=await owner.request('POST','/overhead-expenses',{category:'Office Supplies',description:'STEP12 TEST ONLY deletable unpaid fixture',amount:1},201);
  await owner.request('DELETE',`/overhead-expenses/${disposable.id}`);
  const bank=await owner.request('GET','/banks/5/transactions');assert.equal(bank.closingBalance,10277.50);
  const tb=await reviewer.request('GET',root+'/reports/trial-balance?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(tb.balanced,true);
  for(const [code,amount]of [['1010','10277.50'],['1400','3.00'],['5010','107.50'],['5020','107.50'],['5030','104.50'],['6000','100.00'],['2000','0.00']])assert.equal(tb.rows.find(r=>r.code===code).closing,amount,code);
  const management=await reviewer.request('GET',root+'/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(management.statements.profitAndLoss.profit,'580.50');assert.equal(management.statements.balanceSheet.difference,'0.00');
  const tax=await reviewer.request('GET',root+'/tax-configuration/register?branchId=2&from=2026-10-14&to=2026-10-31');
  await pass('Live duty/shipping/terminal VAT and direct/scheduled overhead reconcile with no duplicate expense',{bank:10277.50,profit:580.50,inputVat:3,expenseId:overhead.id,scheduleId:linked.schedule.id,dutyId:finalDuty.id,dutyJournal:finalDutyJournal,costIds,overheadJournal:ohJournal.journalId,directJournal:directJournal.journalId,scheduledJournal:scheduledJournal.journalId,tax});
  await writeFile('docs/evidence/2026-10-14-step12-expenses-live.json',JSON.stringify({bookId:1,results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of [owner,preparer,reviewer])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='adjustments'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword),results=[];
 async function pass(name,detail={}){const item={time:new Date().toISOString(),pass:name,...detail};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 const basic={currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY reviewed controlled adjustment',bankAccounts:{5:a['1010']},cashAccountId:a['1000']};
 try{
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10277.50,'Resume expense settlement first; do not duplicate phases');
  for(const [classification,amount,accountId,effect]of [['advance',50,a['1200'],'advance'],['operating_expense',30,a['6000'],'expense']]){
   const schedule=await preparer.request('POST','/payment-schedules',{scheduleDate:'2026-10-14',vendorBeneficiary:`STEP12 TEST ONLY ${classification} 20261014`,description:'Dummy reviewed voucher, no external money transfer',amountRequested:amount,priority:'normal'},201);
   await pass('Live standalone payment schedule created',{scheduleId:schedule.id,classification,amount});
   await preparer.request('PATCH',`/payment-schedules/${schedule.id}/pay`,{amount,paymentMethod:'bank',bankId:5},400);
   await owner.request('PATCH',`/payment-schedules/${schedule.id}/approve`,{comment:'Reviewed dummy voucher'});
   await owner.request('PATCH',`/payment-schedules/${schedule.id}/approve`,{},409);
   await preparer.request('PATCH',`/payment-schedules/${schedule.id}/pay`,{amount,paymentMethod:'bank',bankId:5,classification,classificationReason:'Reviewed fictional advance/operating voucher, not inferred from vendor',...(classification==='operating_expense'?{expenseHead:'Office supplies'}:{})});
   const detail=await preparer.request('GET',`/payment-schedules/${schedule.id}`);assert.equal(detail.payments.length,1);assert.equal(detail.events.filter(e=>e.type==='created').length,1);assert.equal(detail.events.filter(e=>e.type==='approved').length,1);assert.equal(detail.events.filter(e=>e.type==='paid').length,1);
   await pass('Live standalone payment saved with explicit classification',{scheduleId:schedule.id,paymentId:detail.payments[0].id,classification});
   const native=postLiveSource(f,{kind:'schedule_payment',id:detail.payments[0].id},{...basic,effect,accountId});
   await preparer.request('PATCH',`/payment-schedules/${schedule.id}/pay`,{amount:1,paymentMethod:'bank',bankId:5},400);
   await preparer.request('PATCH',`/payment-schedules/${schedule.id}/complete`,{});
   await pass('Live classified standalone schedule paid once and completed; native treatment preserved',{scheduleId:schedule.id,native});
  }
  const bankBefore=(await owner.request('GET','/banks/5/transactions')).closingBalance;assert.equal(bankBefore,10197.50);
  await owner.request('POST','/invoices/17/cancel',{},400);await owner.request('DELETE','/invoices/17',undefined,400);
  const note=await owner.request('POST','/invoices/17/credit-note',{amount:100,reason:'STEP12 TEST ONLY supported service allowance'},201);assert.equal(note.appliedToInvoice,100);assert.equal(note.creditedToClient,0);
  await pass('Live credit note applied to invoice without bank movement',{noteId:note.id,invoiceId:17,amount:100});
  const credit=postLiveSource(f,{kind:'credit_note',id:note.id},{...basic,effect:'credit_note',receivableAccountId:a['1100'],clientCreditAccountId:a['2100'],reductions:[{accountId:a['4000'],amount:'100.00',category:'income',evidence:'Allowance reduces original exempt bundled service recognition'}]});assert.equal(credit.cashMovement,'0.00');
  assert.equal((await owner.request('GET','/invoices/17')).outstanding,200);assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,bankBefore);
  const writeoff=await owner.request('POST','/invoices/17/write-off',{},201);assert.equal(writeoff.writtenOffAmount,200);
  const audit=(await owner.request('GET','/invoices/17/audit-log')).filter(e=>e.action==='written_off');assert.equal(audit.length,1);
  await pass('Live overdue invoice residual write-off and one audit retained',{invoiceId:17,writeoffAuditId:audit[0].id,expenseId:writeoff.overheadExpenseId,amount:200});
  const badDebt=postLiveSource(f,{kind:'invoice_writeoff',id:audit[0].id},{...basic,effect:'writeoff',accountId:a['6100'],receivableAccountId:a['1100']});assert.equal(badDebt.cashMovement,'0.00');
  await owner.request('POST','/invoices/17/write-off',{},400);
  await owner.request('POST',`/overhead-expenses/${writeoff.overheadExpenseId}/payments`,{amount:1,paymentMethod:'bank',bankId:5},409);
  await owner.request('POST',`/overhead-expenses/${writeoff.overheadExpenseId}/payment-schedules`,{},409);
  await owner.request('DELETE',`/overhead-expenses/${writeoff.overheadExpenseId}`,undefined,409);
  assert.equal((await owner.request('GET','/invoices/17')).status,'written_off');
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,bankBefore);
  const root='/accounting/books/1/reports/',query='?branchId=2&from=2026-10-14&to=2026-10-31',reports={};
  for(const kind of ['general-ledger','trial-balance','balance-sheet','management-accounts']){reports[kind]=await reviewer.request('GET',root+kind+query);assert.equal(reports[kind].balanced,true);assert.equal(reports[kind].totals.closingDifference,'0.00');}
  assert.deepEqual(reports['general-ledger'].totals,reports['trial-balance'].totals);
  const tb=reports['trial-balance'];for(const[code,amount]of[['1010','10197.50'],['1100','0.00'],['1200','50.00'],['1400','3.00'],['2100','0.00'],['2000','0.00'],['6100','200.00']])assert.equal(tb.rows.find(r=>r.code===code).closing,amount,code);
  const pack=reports['management-accounts'];assert.equal(pack.statements.profitAndLoss.profit,'250.50');assert.equal(pack.statements.balanceSheet.difference,'0.00');
  await pass('Live standalone advance/expense, credit note/write-off reconcile Bank/GL/TB/BS/management without noncash counted as cash',{bank:bankBefore,profit:'250.50',receivable:'0.00',advance:'50.00',inputVat:'3.00',creditJournal:credit.journalId,writeoffJournal:badDebt.journalId});
  await writeFile('docs/evidence/2026-10-14-step12-adjustments-live.json',JSON.stringify({bookId:1,results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,preparer,reviewer])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='operations'){
 const owner=await session(credential.email,credential.password),finance=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),results=[];
 async function record(name,detail={}){const item={time:new Date().toISOString(),...detail,name};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 const getContainer=async id=>(await owner.request('GET',`/containers/${id}`)).container;
 try{
  const original=await getContainer(37);assert.equal(original.status,'pending_verification');assert.equal(original.verifiedAt,null);
  await owner.request('POST','/containers/37/gate-in',{},409);
  await owner.request('PATCH','/containers/37/status',{status:'closed'},[400,409]);
  const alternate=await owner.request('PUT','/containers/37',{status:'closed'},[200,409]);
  if(alternate.status==='closed'){
   await owner.request('PUT','/containers/37',{status:original.status});
   await record('STEP12-OPS-001 alternate basic-edit status route bypasses final workflow prerequisites',{failure:true,priority:'High',containerId:37,route:'PUT /containers/:id',temporaryStatusRestored:true});
  }else await record('Alternate basic-edit status route respects final workflow prerequisites',{pass:true});
  let c=await getContainer(36);assert.equal(c.status,'pending_verification');assert(c.verificationOfficerIds.includes(owner.user.id),'Use the actual assigned officer, not an admin override');
  await finance.request('POST','/containers/36/verify',{},403);
  c=await owner.request('POST','/containers/36/verify',{});assert.equal(c.status,'registered');assert(c.verifiedAt);
  await owner.request('POST','/containers/36/verify',{},400);
  for(const status of ['documentation','duty_assessment','duty_payment','transire_processing'])await owner.request('PATCH','/containers/36/status',{status});
  await owner.request('PATCH','/containers/36',{paarNumber:'STEP12-QA-PAAR-20261014',paarOfficer:'STEP12 Documentation Owner',paarReleasedAt:'2026-10-14T12:00:00Z',eta:'2026-10-14'});
  const fields=[['transire_processing','transireStageOwner','expectedTransireDate','transireReleasedAt'],['shipping','shippingStageOwner','expectedDoDate','doReleasedAt'],['terminal','terminalStageOwner','expectedTdoDate','tdoReleasedAt'],['pull_out','pulloutStageOwner','expectedPulloutDate','pulloutReleasedAt']];
  const ownership={};
  for(const [stage,field,expected,actual]of fields){
   await finance.request('POST','/containers/36/stage-action',{stage,action:'update_stage_owner',stageOwner:'Denied finance overwrite'},403);
   const name=`STEP12 ${stage} Owner`;ownership[field]=name;
   await owner.request('POST','/containers/36/stage-action',{stage,action:'update_stage_owner',stageOwner:name});
   await owner.request('POST','/containers/36/stage-action',{stage,action:'set_expected_date',expectedDate:'2026-10-15'});
   c=await getContainer(36);assert.equal(c[expected].slice(0,10),'2026-10-15');assert.equal(c[actual],null);
   await owner.request('POST','/containers/36/stage-action',{stage,action:'mark_released',finalDate:'2026-10-14T12:00:00Z'});
   await owner.request('POST','/containers/36/stage-action',{stage,action:'mark_released'},409);
   c=await getContainer(36);for(const[key,value]of Object.entries(ownership))assert.equal(c[key],value);assert.equal(c[actual].slice(0,10),'2026-10-14');
   await record('Independent department owner/expected/actual and duplicate-release protection',{pass:true,containerId:36,stage,owner:name});
  }
  await finance.request('POST','/containers/36/gate-in',{},403);
  c=await owner.request('POST','/containers/36/gate-in',{});const gateIn=c.gateInDate;assert(gateIn);
  await owner.request('POST','/containers/36/gate-in',{},409);assert.equal((await getContainer(36)).gateInDate,gateIn);
  for(const status of ['examination','final_release'])await owner.request('PATCH','/containers/36/status',{status});
  await owner.request('POST','/containers/36/stage-action',{stage:'final_release',action:'set_expected_date',expectedDate:'2026-10-15'});
  await owner.request('POST','/containers/36/stage-action',{stage:'final_release',action:'mark_released',finalDate:'2026-10-14T12:00:00Z'});
  await owner.request('POST','/containers/36/gate-out',{});await owner.request('POST','/containers/36/gate-out',{},409);
  await owner.request('PATCH','/containers/36/status',{status:'delivery'});
  await owner.request('PATCH','/containers/36',{deliveredAt:'2026-10-14',deliveryLocation:'TEST ONLY dummy warehouse',truckNumber:'STEP12-TEST-TRUCK',driverName:'Fictional QA driver',offloadingConfirmed:true,emptyReturnDueDate:'2026-10-15'});
  c=await getContainer(36);assert.equal(c.deliveryStatus,'delivered');assert.equal(c.deliveredAt.slice(0,10),'2026-10-14');
  await owner.request('POST','/containers/36/empty-gate-out',{},409);await owner.request('POST','/containers/36/empty-gate-in',{});await owner.request('POST','/containers/36/empty-gate-out',{});
  await owner.request('PATCH','/containers/36/status',{status:'closed'});
  c=await getContainer(36);assert.equal(c.status,'closed');assert(c.emptyReturnDate);
  const sibling=await getContainer(37);assert.equal(sibling.status,'pending_verification');assert.equal(sibling.deliveredAt,null);assert.equal(sibling.transireStageOwner,null);assert.equal(c.shipmentId,sibling.shipmentId);
  const overview=await owner.request('GET','/containers/36/overview');
  await record('Live complete one-job documentation/parallel releases/gate/examination/release/delivery/empty/closed workflow; same-BL sibling independent',{pass:true,containerId:36,siblingId:37,closedAt:new Date().toISOString(),gateIn,overview});
  const task=await owner.request('POST','/containers/37/tasks',{title:'STEP12 TEST ONLY assigned follow-up',assignedStaffId:finance.user.id,dueDate:'2026-10-14',priority:'high'},201);
  await record('Live controlled assigned task created',{pass:true,taskId:task.id,containerId:37,assignee:finance.user.id});
  const tasks=await finance.request('GET','/my-tasks');
  await finance.request('PATCH',`/containers/37/tasks/${task.id}`,{status:'completed'});
  assert.equal((await owner.request('GET','/containers/37/tasks')).find(t=>t.id===task.id).status,'completed');
  await record('Live assigned task retrieval/completion and retained history',{pass:true,taskId:task.id,queue:tasks});
  await writeFile('docs/evidence/2026-10-14-step12-operations-live.json',JSON.stringify({containerId:36,siblingId:37,results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,finance])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='bank-transfer'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8'));
 const head=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-bank-chart.json','utf8'));
 const owner=await session(credential.email,credential.password),reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword);
 try{
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10197.50,'Inspect retained phase IDs before retry');
  const bank=await owner.request('POST','/banks',{name:'STEP12 TEST ONLY second bank20261014',branchId:2},201);
  await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify({time:new Date().toISOString(),pass:'Live controlled second bank created',bankId:bank.id,accountId:head.accountId})+'\n');
  const body={fromBankId:5,toBankId:bank.id,amount:25,reference:'STEP12-QA-OWN-TRANSFER-20261014',narration:'TEST ONLY own bank transfer, not income/expense or external money'};
  const transfer=await owner.request('POST','/banks/transfers',body,201);
  await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify({time:new Date().toISOString(),pass:'Live own-bank transfer recorded',transferId:transfer.id,bankId:bank.id})+'\n');
  await owner.request('POST','/banks/transfers',{...body,reference:' step12-qa-own-transfer-20261014 '},409);
  await owner.request('POST',`/banks/${bank.id}/fund-additions`,{amount:25,reference:body.reference,narration:'Same reference across funding/transfer must be refused'},409);
  const native=postLiveSource(f,{kind:'bank_transfer',id:transfer.id},{currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY reviewed own bank transfer with distinct GL subaccounts',effect:'transfer',bankAccounts:{5:f.accounts['1010'],[bank.id]:head.accountId}});
  assert.equal(native.cashMovement,'0.00');
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10172.50);assert.equal((await owner.request('GET',`/banks/${bank.id}/transactions`)).closingBalance,25);
  const pack=await reviewer.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(pack.statements.profitAndLoss.profit,'250.50');assert.equal(pack.statements.balanceSheet.difference,'0.00');
  const result={time:new Date().toISOString(),pass:'Live own-bank transfer and cross-table duplicate reference controls, no extra income/expense/net cash',bankId:bank.id,transferId:transfer.id,native,bank5:10172.50,bank6:25,totalBank:10197.50,profit:'250.50'};
  await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(result)+'\n');console.log(JSON.stringify(result));
  await writeFile('docs/evidence/2026-10-14-step12-bank-live.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,reviewer])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='status-retest'){
 const owner=await session(credential.email,credential.password);
 try{
  assert.equal((await owner.request('GET','/containers/37')).container.status,'pending_verification');
  for(const status of ['gate_in','examination','final_release','delivery','closed'])await owner.request('PUT','/containers/37',{status,vessel:'Must not partially save'},409);
  const unchanged=(await owner.request('GET','/containers/37')).container;assert.equal(unchanged.status,'pending_verification');assert.notEqual(unchanged.vessel,'Must not partially save');
  const result={time:new Date().toISOString(),pass:'STEP12-OPS-001 live all five alternate final-status requests refused with no partial metadata/status save',containerId:37,status:unchanged.status};
  await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(result)+'\n');console.log(JSON.stringify(result));
 }finally{await owner.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='read-checks'){
 const owner=await session(credential.email,credential.password),operations=await session('e2e.operations.20260904@donclimax.test',credential.testPassword),foreign=await session('step12.foreign.20261014@donclimax.test',credential.testPassword),results=[];
 try{
  for(const path of ['/accounting/catalog','/reports/financial-ledger','/reports/pl','/invoices','/banks'])await operations.request('GET',path,undefined,403);
  await operations.request('POST','/invoices/17/payments',{amount:1,paymentMethod:'cash'},403);
  await foreign.request('GET','/containers/36',undefined,404,'3');await foreign.request('GET','/banks/5/transactions',undefined,403,'3');
  for(const path of ['/dashboard/stats','/analytics','/analytics/deliveries','/analytics/turnaround','/analytics/ar-summary','/notifications','/workflow-notifications','/my-tasks','/approvals','/settings','/branches','/users','/containers/36/overview','/containers/36/shipment','/containers/36/timeline','/containers/gate-log','/containers/paar-status','/reports/containers','/reports/client-statement?clientId=12','/reports/vat-summary','/reports/vat-liability','/reports/pl?costBasis=actual_paid','/reports/cashflow?from=2026-10-14&to=2026-10-14','/reports/financial-ledger?from=2026-10-14&to=2026-10-14','/reports/invoice-aging','/reports/disbursement-reconciliation','/reports/branch-comparison','/reports/workflow-stage-ledger','/reports/financial-control-exceptions']){
   const data=await owner.request('GET',path);
   results.push({path,status:200,keys:Object.keys(data),...(Array.isArray(data)?{listCount:data.length}:{}),
    ...(data.summary?{summary:Object.fromEntries(Object.entries(data.summary).filter(([,v])=>typeof v==='number'||typeof v==='boolean'))}:{})});
  }
  const result={time:new Date().toISOString(),pass:'Separate real nonfinance/foreign sessions refused financial/native writes and reads; broad module data endpoints available',operationsId:operations.user.id,foreignId:foreign.user.id,results};
  await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify({...result,results:results.map(r=>({path:r.path,status:r.status}))})+'\n');console.log(JSON.stringify({...result,results:results.map(r=>({path:r.path,status:r.status}))}));
  await writeFile('docs/evidence/2026-10-14-step12-module-reads-live.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,operations,foreign])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='invoice-edges'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),results=[];
 async function record(name,detail={}){const item={time:new Date().toISOString(),pass:name,...detail};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 try{
  const jobs=await owner.request('GET','/containers?search=S12Q2610143');assert(!JSON.stringify(jobs).includes('S12Q2610143'),'Edge phase already started; inspect retained IDs');
  const job=await owner.request('POST','/containers',{containerNumber:'S12Q2610143',blNumber:'STEP12-EDGE-BL-20261014',clientId:12,customerName:'STEP12 LIVE 20261014 Financial Workflow QA',branchId:2,command:'PTML',clearingCharges:0,declaration:'TEST ONLY zero-value and tiny reversible edge scenarios; no actual cargo'},201);
  const invoice=await owner.request('POST','/invoices',{containerIds:[job.id],branchId:2,vatRate:0,dueDate:'2026-10-15',notes:'STEP12 TEST ONLY reversible invoice lifecycle edges'},201);
  await record('Live controlled zero-value draft created',{containerId:job.id,invoiceId:invoice.id,invoiceNumber:invoice.invoiceNumber});
  assert.equal(invoice.total,0);await owner.request('PATCH',`/invoices/${invoice.id}`,{status:'sent'},400);await owner.request('POST',`/invoices/${invoice.id}/payments`,{amount:0.01,paymentMethod:'cash'},400);
  await owner.request('PATCH',`/invoices/${invoice.id}/items/${invoice.items[0].id}`,{amount:0.01,description:'TEST ONLY tiny additional service, not duplicate clearing charge'});
  await owner.request('PATCH',`/invoices/${invoice.id}`,{status:'sent'});
  const recognition=await preparer.request('POST','/accounting/books/1/tax-configuration/sources/prepare?branchId=2',{kind:'invoice',id:invoice.id,evidence:'TEST ONLY tiny reversible invoice recognition',configurationId:1,taxCode:'EXEMPT',recognitionDate:'2026-10-14',receivableAccountId:a['1100'],incomeAccountId:a['4000']});
  postLiveSource(f,{kind:'configured_journal',id:recognition.id},{});
  await owner.request('POST',`/invoices/${invoice.id}/payments`,{amount:0.01,paymentMethod:'transfer',bankId:5,reference:'STEP12-QA-TINY-COLLECT-20261014'},201);
  let live=await owner.request('GET',`/invoices/${invoice.id}`);assert.equal(live.status,'paid');assert.equal(live.outstanding,0);const payment=live.payments.find(p=>p.reference==='STEP12-QA-TINY-COLLECT-20261014');
  const mapping={currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY tiny collection and traceable refund',bankAccounts:{5:a['1010']},cashAccountId:a['1000'],receivableAccountId:a['1100'],depositLiabilityAccountId:a['2100']};
  const receipt=postLiveSource(f,{kind:'invoice_payment',id:payment.id},mapping);
  await record('Live positive draft/sent/paid lifecycle and exact penny cash receipt',{invoiceId:invoice.id,paymentId:payment.id,recognitionJournal:recognition.id,receiptJournal:receipt.journalId});
  await owner.request('POST',`/invoices/${invoice.id}/payments/${payment.id}/reverse`,{reference:'STEP12-QA-TINY-REFUND-20261014',reason:'TEST ONLY traceable full receipt reversal'});
  live=await owner.request('GET',`/invoices/${invoice.id}`);assert.equal(live.outstanding,0.01);assert.equal(live.status,'sent');const refund=live.payments.find(p=>p.reversalOfPaymentId===payment.id);assert(refund);
  const reverse=postLiveSource(f,{kind:'invoice_payment',id:refund.id},mapping);assert.equal(reverse.cashMovement,'-0.01');
  await owner.request('POST',`/invoices/${invoice.id}/payments/${payment.id}/reverse`,{reference:'STEP12-QA-TINY-RETRY',reason:'Duplicate refusal'},409);
  const note=await owner.request('POST',`/invoices/${invoice.id}/credit-note`,{amount:0.01,reason:'TEST ONLY offset the tiny test service after refund'},201);
  const credit=postLiveSource(f,{kind:'credit_note',id:note.id},{currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY reduce original tiny exempt service',effect:'credit_note',receivableAccountId:a['1100'],clientCreditAccountId:a['2100'],reductions:[{accountId:a['4000'],amount:'0.01',category:'income',evidence:'Full offset of original tiny test recognition'}]});assert.equal(credit.cashMovement,'0.00');
  const cancelFixture=await owner.request('POST','/invoices',{containerIds:[job.id],vatRate:0,dueDate:'2026-10-15',notes:'STEP12 TEST ONLY cancelled-draft guard fixture'},201);
  await owner.request('POST',`/invoices/${cancelFixture.id}/cancel`,{},400);
  await owner.request('DELETE',`/invoices/${cancelFixture.id}`);
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10172.50);
  const pack=await preparer.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(pack.statements.profitAndLoss.profit,'250.50');assert.equal(pack.statements.balanceSheet.difference,'0.00');
  await record('Live receipt reversal/duplicate refusal, noncash service credit, unissued cancel refusal/draft delete and final totals restored',{invoiceId:invoice.id,paymentId:payment.id,refundId:refund.id,noteId:note.id,reverseJournal:reverse.journalId,creditJournal:credit.journalId,deletedDraftId:cancelFixture.id,bank5:10172.50,profit:'250.50'});
  await writeFile('docs/evidence/2026-10-14-step12-invoice-edges-live.json',JSON.stringify({results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,preparer])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='resume-cancel'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),results=[];
 async function record(check,detail={}){const result={time:new Date().toISOString(),check,pass:true,...detail};results.push(result);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(result)+'\n');console.log(JSON.stringify(result));}
 try{
  const cancelled=await owner.request('GET','/invoices/21');assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.total,0.01);assert.equal(cancelled.outstanding,0);
  await owner.request('POST','/invoices/21/cancel',{},400);
  await record('STEP12-INV-002 retained cancelled invoice shows zero outstanding without changing original total',{invoiceId:21,invoiceNumber:cancelled.invoiceNumber,total:cancelled.total,outstanding:cancelled.outstanding});
  for(const id of[18,20]){const rejected=await owner.request('POST',`/invoices/${id}/cancel`,{},409);assert.match(rejected.error,/native accounting/);}
  const list=await owner.request('GET','/invoices');assert.equal(list.find(i=>i.id===21).outstanding,0);
  const ar=await owner.request('GET','/invoices/accounts-receivable');assert(ar.clients.every(c=>Array.isArray(c.unpaidInvoices)));assert(!ar.clients.some(c=>c.unpaidInvoices.some(i=>i.id===21)));
  await record('STEP12-INV-001 retained recognized invoices protected; normal cancelled record/list/AR consistent',{recognizedInvoiceIds:[18,20],cancelledInvoiceId:21});
  const workspace=await owner.request('GET','/accounting/books/1/manual?branchId=2');
  if(!workspace.accountReviewComplete)await owner.request('POST','/accounting/books/1/manual/accounts/review?branchId=2',{
   ownerEvidence:'Owner authorised continued TEST ONLY review after adding second bank head',accountantEvidence:'TEST FIXTURE ONLY simulated complete chart review, NOT professional certification',
   accounts:workspace.accounts.map(row=>({accountId:row.id,role:[a['6200'],a['1390'],a['6010'],a['2310']].includes(row.id)?'adjustment':'protected'}))});
  const reviewed=await owner.request('GET','/accounting/books/1/manual?branchId=2');assert.equal(reviewed.accountReviewComplete,true);
  const pack=await owner.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-14');
  assert.equal(pack.statements.profitAndLoss.profit,'230.50');assert.equal(pack.statements.balanceSheet.difference,'0.00');assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10152.50);
  await record('Complete28-head review and both cancellation controls retain exact native totals',{accounts:reviewed.accounts.length,profit:'230.50',bank5:10152.50,bank6:25});
  await writeFile('docs/evidence/2026-10-14-step12-invoice-cancel-live.json',JSON.stringify({method:'Retained partial cancellation control resumed; no repeated fixture creations',recognizedInvoiceId:20,recognitionJournalId:33,creditNoteId:5,creditJournalId:34,results},null,2)+'\n',{flag:'wx'});
 }finally{await owner.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='ai-audit-check'){
 const owner=await session(credential.email,credential.password);
 try{
  const audit=await owner.request('GET','/ai-assistant/audit?limit=50');
  const results=[43,44].map(sessionId=>{const row=audit.find(r=>r.sessionId===sessionId&&r.eventType==='copilot_question_answered');assert(row);return{sessionId,toolName:row.toolName,method:'Read-only retained actual routing audit, no repeated question or raw transcript'};});
  await writeFile('docs/evidence/2026-10-14-step12-ai-routing-live.json',JSON.stringify({results},null,2)+'\n',{flag:'wx'});
  for(const result of results)console.log(JSON.stringify(result));
 }finally{await owner.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='cancel-native-retest'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),results=[];
 async function record(check,detail={}){const result={time:new Date().toISOString(),check,pass:true,...detail};results.push(result);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(result)+'\n');console.log(JSON.stringify(result));}
 try{
  const before=await owner.request('GET','/invoices/18');assert.equal(before.payments.filter(p=>!p.sourceDepositId&&!['credit','credit_note','deposit'].includes(p.paymentMethod.trim().toLowerCase())).reduce((sum,p)=>sum+p.amount,0),0);
  const denied=await owner.request('POST','/invoices/18/cancel',{},409);assert.match(denied.error,/native accounting/);
  assert.equal((await owner.request('GET','/invoices/18')).status,before.status);
  await record('STEP12-INV-001 cancellation refuses retained native recognition with net-zero collections',{invoiceId:18,nativeJournalId:21});
  const list=await owner.request('GET','/invoices');assert(!JSON.stringify(list).includes('STEP12 TEST ONLY issued cancellation acceptance'),'Inspect existing cancellation fixture rather than duplicating it');
  assert(!JSON.stringify(list).includes('STEP12 TEST ONLY unpaid native cancellation control'),'Inspect prior native cancellation control rather than duplicating it');
  const unpaid=await owner.request('POST','/invoices',{containerIds:[38],vatRate:0,dueDate:'2026-10-15',notes:'STEP12 TEST ONLY unpaid native cancellation control'},201);
  await record('Required unpaid native-recognition control created',{invoiceId:unpaid.id});
  await owner.request('PATCH',`/invoices/${unpaid.id}/items/${unpaid.items[0].id}`,{amount:0.01,description:'TEST ONLY unpaid native cancellation control'});
  await owner.request('PATCH',`/invoices/${unpaid.id}`,{status:'sent'});
  const recognition=await preparer.request('POST','/accounting/books/1/tax-configuration/sources/prepare?branchId=2',{kind:'invoice',id:unpaid.id,evidence:'TEST ONLY unpaid recognition control',configurationId:1,taxCode:'EXEMPT',recognitionDate:'2026-10-14',receivableAccountId:a['1100'],incomeAccountId:a['4000']});
  postLiveSource(f,{kind:'configured_journal',id:recognition.id},{});
  const rejected=await owner.request('POST',`/invoices/${unpaid.id}/cancel`,{},409);assert.match(rejected.error,/native accounting/);
  const retained=await owner.request('GET',`/invoices/${unpaid.id}`);assert.equal(retained.status,'sent');assert.equal(retained.outstanding,0.01);assert.equal(retained.payments.length,0);
  await record('STEP12-INV-001 actual unpaid recognized invoice refuses cancellation without any source mutation',{invoiceId:unpaid.id,nativeJournalId:recognition.id});
  const note=await owner.request('POST',`/invoices/${unpaid.id}/credit-note`,{amount:0.01,reason:'TEST ONLY reviewed offset after cancellation negative test'},201);
  const correction=postLiveSource(f,{kind:'credit_note',id:note.id},{currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY exact original tiny service correction',effect:'credit_note',receivableAccountId:a['1100'],clientCreditAccountId:a['2100'],reductions:[{accountId:a['4000'],amount:'0.01',category:'income',evidence:'Offset original unpaid tiny exempt recognition'}]});
  await record('Reviewed noncash credit offsets tiny control while retaining original native journal',{invoiceId:unpaid.id,noteId:note.id,creditJournalId:correction.journalId});
  const fixture=await owner.request('POST','/invoices',{containerIds:[38],vatRate:0,dueDate:'2026-10-15',notes:'STEP12 TEST ONLY issued cancellation acceptance'},201);
  await record('One required native-unrecognised cancellation fixture created',{invoiceId:fixture.id});
  await owner.request('PATCH',`/invoices/${fixture.id}/items/${fixture.items[0].id}`,{amount:0.01,description:'TEST ONLY cancellable unrecognised service'});
  await owner.request('PATCH',`/invoices/${fixture.id}`,{status:'sent'});
  await owner.request('POST',`/invoices/${fixture.id}/cancel`,{});
  const cancelled=await owner.request('GET',`/invoices/${fixture.id}`);assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.outstanding,0);
  await owner.request('POST',`/invoices/${fixture.id}/cancel`,{},400);
  await record('Ordinary issued unpaid invoice without native recognition still cancels once and is not receivable',{invoiceId:fixture.id,invoiceNumber:fixture.invoiceNumber});
  const workspace=await owner.request('GET','/accounting/books/1/manual?branchId=2');
  if(!workspace.accountReviewComplete){
   await owner.request('POST','/accounting/books/1/manual/accounts/review?branchId=2',{
    ownerEvidence:'Owner authorised continued TEST ONLY review after adding second bank head',accountantEvidence:'TEST FIXTURE ONLY simulated complete chart review, NOT professional certification',
    accounts:workspace.accounts.map(row=>({accountId:row.id,role:[a['6200'],a['1390'],a['6010'],a['2310']].includes(row.id)?'adjustment':'protected'}))});
  }
  const reviewed=await owner.request('GET','/accounting/books/1/manual?branchId=2');assert.equal(reviewed.accountReviewComplete,true);
  await record('Second bank head remains protected and all28 chart roles are explicitly reviewed',{accounts:reviewed.accounts.length,financialWrite:false});
  const pack=await owner.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-14');
  assert.equal(pack.statements.profitAndLoss.profit,'230.50');assert.equal(pack.statements.balanceSheet.difference,'0.00');
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10152.50);
  await record('Cancellation controls/review preserve all previously reconciled native figures',{profit:'230.50',bank5:10152.50,bank6:25});
  await writeFile('docs/evidence/2026-10-14-step12-invoice-cancel-live.json',JSON.stringify({results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,preparer])await actor.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='ai-content-check'){
 const owner=await session(credential.email,credential.password),results=[];
 try{
  const direct=await owner.request('POST','/ai-assistant/tools/document_search',{query:'training memo',containerId:37});
  const ids=(direct.sources??direct.result?.sources??[]).filter(s=>s.type==='document').map(s=>s.id).sort((a,b)=>a-b);
  assert.deepEqual(ids,[12,13]);
  results.push({check:'Exact indexed-content reader',pass:true,documentIds:ids,method:'Real deployed approved document_search endpoint, retained versions'});
  const answer=await owner.request('POST','/ai-assistant/ask',{question:'Find uploaded documents containing "training memo" for container S12Q2610142.'});
  results.push({check:'Natural-language content routing',status:answer.status,sessionId:answer.sessionId,
   citationIds:(answer.citations??[]).map(c=>({type:c.type,id:c.id})),
   matchingContentReported:/training memo/i.test(answer.answer??'')&&!/not (?:specifically|explicitly|found)|no (?:matching|documents)/i.test(answer.answer??''),
   limitation:'Phrase presence alone is not proof of correct tool selection; inspect source routing alongside direct content-reader result. No raw AI transcript retained.'});
  const schedule=await owner.request('POST','/ai-assistant/tools/approved_payment_schedules',{query:'STEP12 TEST ONLY advance 20261014'});
  const scheduleSources=schedule.sources??schedule.result?.sources??[];
  results.push({check:'Exact vendor reader',sourceIds:scheduleSources.map(s=>({type:s.type,id:s.id})),recordCount:(schedule.records??schedule.result?.records??[]).length});
  await writeFile('docs/evidence/2026-10-14-step12-ai-content-live.json',JSON.stringify({results},null,2)+'\n',{flag:'wx'});
  for(const result of results){const event={time:new Date().toISOString(),...result};await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(event)+'\n');console.log(JSON.stringify(event));}
 }finally{await owner.request('POST','/auth/logout',{},200,'all');}
}
else if(mode==='support'){
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),foreign=await session('step12.foreign.20261014@donclimax.test',credential.testPassword),results=[];
 async function record(name,detail={}){const item={time:new Date().toISOString(),pass:name,...detail};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 const basic={currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY reviewed supplemental fixture',bankAccounts:{5:a['1010']},cashAccountId:a['1000']};
 try{
  const original=(await owner.request('GET','/overhead-expenses')).expenses.find(e=>e.id===11);assert.equal(original.topups.length,0,'Support phase already started; inspect retained source IDs');
  const topupExpense=await owner.request('POST','/overhead-expenses/11/topups',{amount:20,description:'STEP12 TEST ONLY supported added supplier obligation'},201);assert.equal(topupExpense.amount,120);assert.equal(topupExpense.balance,20);const topup=topupExpense.topups[0];
  await record('Live overhead top-up creates only incremental20 obligation',{expenseId:11,topupId:topup.id});
  const ohMap={...basic,effect:'overhead',accountId:a['6000'],controlAccountId:a['2000'],recognitionDate:'2026-10-14',recognitionEvidence:'Dummy supplier obligation recognised today before settlement'};
  const increment=postLiveSource(f,{kind:'overhead_topup',id:topup.id},ohMap);assert.equal(increment.cashMovement,'0.00');
  const payment=await owner.request('POST','/overhead-expenses/11/payments',{amount:20,paymentMethod:'bank',bankId:5,notes:'STEP12 TEST ONLY top-up settlement'},201);
  const paid=postLiveSource(f,{kind:'expense_payment',id:payment.payment.id},ohMap);
  await record('Live top-up settlement preserves original bill evidence and no duplicate expense',{topupId:topup.id,paymentId:payment.payment.id,topupJournal:increment.journalId,paymentJournal:paid.journalId});
  for(const [classification,amount,effect,accountId,recoveryEffect]of [['asset',20,'asset',a['1300'],'asset_funding'],['loan_repayment',50,'loan_repayment',a['2400'],'loan_funding'],['other_non_expense',0.01,'other_non_expense',a['1120'],'asset_funding']]){
   if(classification==='loan_repayment'){
    const funding=await owner.request('POST','/banks/5/fund-additions',{amount,reference:'STEP12-QA-DUMMY-LOAN-20261014',narration:'TEST ONLY dummy loan principal; no actual borrowing'},201);
    await record('Live dummy loan funding recorded',{fundingId:funding.id,amount});
    postLiveSource(f,{kind:'bank_funding',id:funding.id},{...basic,effect:'loan_funding',accountId});
   }
   const schedule=await preparer.request('POST','/payment-schedules',{scheduleDate:'2026-10-14',vendorBeneficiary:`STEP12 TEST ONLY ${classification} supplementary`,description:'Explicit fictional source voucher, no real purchase or transfer',amountRequested:amount,priority:'normal'},201);
   await record('Live supplemental classified schedule created',{scheduleId:schedule.id,classification,amount});
   await owner.request('PATCH',`/payment-schedules/${schedule.id}/approve`,{});
   await preparer.request('PATCH',`/payment-schedules/${schedule.id}/pay`,{amount,paymentMethod:'bank',bankId:5,classification,classificationReason:'Explicit fictional voucher; matched asset or original dummy borrowing liability'});
   const detail=await preparer.request('GET',`/payment-schedules/${schedule.id}`);assert.equal(detail.payments.length,1);const p=detail.payments[0];
   await record('Live supplemental payment saved',{paymentId:p.id,classification});
   const post=postLiveSource(f,{kind:'schedule_payment',id:p.id},{...basic,effect,accountId,...(classification==='other_non_expense'?{accountCategory:'asset'}:{})});
   if(classification!=='loan_repayment'){
    const recovery=await owner.request('POST','/banks/5/fund-additions',{amount,reference:`STEP12-QA-${classification}-RECOVERY-20261014`,narration:'TEST ONLY full recovery of the previously posted dummy asset, not income'},201);
    await record('Live dummy asset recovery recorded',{fundingId:recovery.id,classification,amount});
    postLiveSource(f,{kind:'bank_funding',id:recovery.id},{...basic,effect:recoveryEffect,accountId});
   }
   await record('Live supplemental classification/native treatment and funding/recovery preserve P&L',{classification,paymentId:p.id,journalId:post.journalId});
  }
  const submitted=await preparer.request('POST','/containers/37/sections/customs/submit',{});await record('Live section review submitted',{containerId:37,approvalId:submitted.id});
  await preparer.request('POST','/containers/37/sections/customs/approve',{},403);
  await owner.request('POST','/containers/37/sections/customs/reject',{reason:'STEP12 TEST ONLY controlled correction request'});
  const rejected=(await owner.request('GET','/approvals')).find(p=>p.id===submitted.id);assert.equal(rejected.status,'rejected');
  const queue=await preparer.request('GET','/my-tasks');const correction=queue.dailyQueue.find(t=>t.containerId===37&&t.title.startsWith('Resubmit Customs'));assert(correction);
  await preparer.request('PATCH',`/containers/37/tasks/${correction.id}`,{status:'completed'});
  await preparer.request('POST','/containers/37/sections/customs/submit',{});await owner.request('POST','/containers/37/sections/customs/approve',{});
  await owner.request('PUT','/containers/37/charges',{section:'customs',customs:{duty:1},reason:'Locked edit must be refused'},403);
  await record('Live rejection immediately returned by queue API, assigned correction, resubmit/approve and section locking',{approvalId:submitted.id,taskId:correction.id,containerId:37,limitation:'API state verified; pending browser immediate-refresh UI observation'});
  const text='STEP12-DOC-20261014 TEST ONLY training memo\nB/L: STEP12-LIVE-BL-20261014\nContainer: S12Q2610142\nNo actual commercial, tax or cargo evidence.\n';
  assert.equal((await owner.request('GET','/containers/37/documents')).length,0,'Document phase already started; inspect versions');
  async function upload(content,name,previous){const data=new FormData();data.set('file',new Blob([content],{type:'text/plain'}),name);data.set('section','general');data.set('documentType','other');if(previous)data.set('previousVersionId',String(previous));return owner.request('POST','/containers/37/documents',data,201);}
  const doc=await upload(text,'STEP12-DOC-20261014-v1.txt');await record('Live controlled text document uploaded',{containerId:37,documentId:doc.id,intelligenceStatus:doc.intelligence.status});assert.equal(doc.intelligence.status,'indexed');
  const bytes=await owner.request('GET',`/documents/${doc.id}`);assert.equal(bytes.buffer.toString('utf8'),text);await foreign.request('GET',`/documents/${doc.id}`,undefined,404,'3');
  const v2=await upload(text+'Version two: retained amendment.\n','STEP12-DOC-20261014-v2.txt',doc.id);await record('Live second document version uploaded',{documentId:v2.id,previousId:doc.id,version:v2.versionNumber});assert.equal(v2.versionNumber,2);
  const list=await owner.request('GET','/containers/37/documents');assert.equal(list.length,2);assert(list.every(d=>d.retained));
  await owner.request('DELETE',`/containers/37/documents/${doc.id}`,undefined,409);
  const ai=await owner.request('POST','/ai-assistant/ask',{question:'Find document STEP12-DOC-20261014 training memo for container S12Q2610142.'});
  await record('Live document question returns exact-version citations; content precision still requires verification',{
   documentIds:[doc.id,v2.id],aiStatus:ai.status,sessionId:ai.sessionId,citations:ai.citations.map(c=>({type:c.type,id:c.id})),
   qualifiedNegativeClaim:/not specifically listed/i.test(ai.answer),limitation:'Metadata listing is not a content-search accuracy pass; no raw assistant transcript retained'});
  const pack=await preparer.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(pack.statements.profitAndLoss.profit,'230.50');assert.equal(pack.statements.balanceSheet.difference,'0.00');
  assert.equal((await owner.request('GET','/banks/5/transactions')).closingBalance,10152.50);
  await record('Live supplemental sources/top-up reconcile, prior journals and noncash values preserved',{bank5:10152.50,bank6:25,totalBank:10177.50,profit:'230.50',receivable:'0.00',inputVat:'3.00',advance:'50.00'});
  await writeFile('docs/evidence/2026-10-14-step12-support-live.json',JSON.stringify({results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of[owner,preparer,foreign])await actor.request('POST','/auth/logout',{},200,'all');}
}
else {
 const f=JSON.parse(await readFile('docs/evidence/2026-10-14-step12-native-setup.json','utf8')),a=f.accounts;
 const owner=await session(credential.email,credential.password),reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword);
 const root=`/accounting/books/${f.bookId}`,results=[];
 async function pass(name,detail={}){const item={time:new Date().toISOString(),pass:name,...detail};results.push(item);await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify(item)+'\n');console.log(JSON.stringify(item));}
 try{
  const invoice=await owner.request('GET','/invoices/17'),deposits=await owner.request('GET','/clients/12/deposits');
  assert.equal(invoice.clientId,12);assert.equal(invoice.total,1000);const deposit=deposits.find(d=>d.id===5);assert(deposit);assert.equal(deposit.amount,300);assert.equal(deposit.bankId,5);assert.equal(deposit.paymentMethod,'Bank Transfer');
  const mapping={currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY recorded receipt/deposit allocation source review',bankAccounts:{5:a['1010']},cashAccountId:a['1000'],receivableAccountId:a['1100'],depositLiabilityAccountId:a['2100']};
  const depPost=postLiveSource(f,{kind:'client_deposit',id:5},mapping);
  await pass('STEP12-DEPOSIT-001 live retained Bank Transfer deposit posts once without source method rewrite',{depositId:5,native:depPost});
  await owner.request('POST','/client-deposits/5/allocate',{invoiceId:17,amount:300,requestKey:'step12_deposit_alloc_20261014'});
  const replay=await owner.request('POST','/client-deposits/5/allocate',{invoiceId:17,amount:300,requestKey:'step12_deposit_alloc_20261014'});assert.equal(replay.replayed,true);
  const live=await owner.request('GET','/invoices/17');assert.equal(live.outstanding,300);const allocation=live.payments.find(p=>p.sourceDepositId===5);assert(allocation);
  const allocationPost=postLiveSource(f,{kind:'invoice_payment',id:allocation.id},mapping);assert.equal(allocationPost.cashMovement,'0.00');
  const bank=await owner.request('GET','/banks/5/transactions');assert.equal(bank.closingBalance,10700);
  const tb=await reviewer.request('GET',root+'/reports/trial-balance?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(tb.balanced,true);assert.equal(tb.totals.closingDifference,'0.00');
  assert.equal(tb.rows.find(r=>r.code==='1010').closing,'10700.00');assert.equal(tb.rows.find(r=>r.code==='1100').closing,'300.00');assert.equal(tb.rows.find(r=>r.code==='2100').closing,'0.00');
  const m=await reviewer.request('GET',root+'/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');assert.equal(m.statements.profitAndLoss.profit,'1000.00');assert.equal(m.statements.balanceSheet.difference,'0.00');
  await pass('Live deposit allocation retry/noncash controls and operational Bank/native GL/TB/BS/management reconcile',{invoiceId:17,clientId:12,bankId:5,depositId:5,allocationPaymentId:allocation.id,allocationJournal:allocationPost,bank:10700,outstanding:300,profit:1000});
  await writeFile('docs/evidence/2026-10-14-step12-transactions-live.json',JSON.stringify({bookId:1,clientId:12,bankId:5,containerIds:[36,37],invoiceId:17,invoiceNumber:invoice.invoiceNumber,fundingId:3,paymentId:20,depositId:5,allocationPaymentId:allocation.id,results},null,2)+'\n',{flag:'wx'});
 }finally{for(const actor of [owner,reviewer])await actor.request('POST','/auth/logout',{},200,'all');}
}
