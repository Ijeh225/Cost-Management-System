// Controlled live HTTP acceptance. Run only with explicit owner authorisation.
import assert from 'node:assert/strict';
import {readFile,appendFile,writeFile} from 'node:fs/promises';
const mode=process.argv[2]??'inspect';
assert(['users','inspect','accounting'].includes(mode));
assert(process.argv.includes('--confirm=STEP12-LIVE-TEST-20261014'));
let input='';for await(const chunk of process.stdin)input+=chunk;
const credential=JSON.parse(input);input='';
const origin='https://donclimaxmanagementapp.com/api',branch='2';
async function session(email,password){
 const cookies=new Map();let csrf;
 async function request(method,path,body,expected=200,scope=branch){
  const headers={'Content-Type':'application/json','X-Branch-Id':scope};
  if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
  if(csrf)headers['X-CSRF-Token']=csrf;
  const r=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
  for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
  const data=await r.json();
  if(r.status!==expected){console.error(JSON.stringify({method,path,status:r.status,error:data.error,code:data.code}));throw new Error('Unexpected HTTP acceptance result');}
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
}else{
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
