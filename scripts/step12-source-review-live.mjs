// Explicit TEST ONLY live source-review acceptance. UI decisions remain browser-driven.
import assert from 'node:assert/strict';
import {readFile,writeFile,appendFile} from 'node:fs/promises';
const mode=process.argv[2];assert(['create','verify'].includes(mode));
assert(process.argv.includes('--confirm=STEP12-LIVE-TEST-20261014'));
let input='';for await(const chunk of process.stdin)input+=chunk;
const credential=JSON.parse(input);input='';
const evidence='docs/evidence/2026-10-14-step12-source-review-live.json';
const root='/accounting/books/1/source-review',scope=path=>path+(path.includes('?')?'&':'?')+'branchId=2';
async function session(email,password){
  const cookies=new Map();let csrf;
  async function request(method,path,body,expected=200,branch='2'){
    const headers={'Content-Type':'application/json','X-Branch-Id':branch};
    if(cookies.size)headers.Cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
    if(csrf)headers['X-CSRF-Token']=csrf;
    const r=await fetch('https://donclimaxmanagementapp.com/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
    for(const raw of r.headers.getSetCookie()){const pair=raw.split(';')[0],at=pair.indexOf('=');cookies.set(pair.slice(0,at),pair.slice(at+1));}
    assert(r.headers.get('content-type')?.includes('application/json'),'Actual deployed JSON API required');
    const value=await r.json();if(r.status!==expected){console.error(JSON.stringify({method,path,status:r.status,code:value.code,error:value.error}));throw Error('Unexpected live review result');}
    return value;
  }
  const login=await request('POST','/auth/login',{email,password},200,'all');
  csrf=(await request('GET','/auth/csrf')).token;return {user:login.user,request};
}
const owner=await session(credential.email,credential.password);
assert.equal(owner.user.id,1);assert.equal(owner.user.authorityLevel,'super_admin');
async function snapshot(){
  const pack=await owner.request('GET','/accounting/books/1/reports/management-accounts?branchId=2&from=2026-10-14&to=2026-10-31');
  const bank5=(await owner.request('GET','/banks/5/transactions')).closingBalance,bank6=(await owner.request('GET','/banks/6/transactions')).closingBalance;
  const totals=pack.statements;
  assert.equal(totals.profitAndLoss.profit,'230.50');assert.equal(totals.balanceSheet.difference,'0.00');
  assert.equal(totals.cashFlow.closing,'10177.50');
  return {bank5,bank6,profit:totals.profitAndLoss.profit,cash:totals.cashFlow.closing};
}
try{
  const workspace=await owner.request('GET',scope(root));
  assert.equal(workspace.book.policyVersion,'step12-dummy-20261014-v1');assert.equal(workspace.branchId,2);
  assert(workspace.book.name.includes('TEST ONLY'));
  if(mode==='create'){
    await assert.rejects(readFile(evidence),'Inspect retained fixture evidence; do not duplicate');
    const before=await snapshot();assert.equal(before.bank5,10152.50);assert.equal(before.bank6,25);
    const transfers=await owner.request('GET','/banks/transfers');
    const rows=Array.isArray(transfers)?transfers:transfers.transfers;assert(Array.isArray(rows));
    const references=['STEP12-REVIEW-UI-OUT-20261014','STEP12-REVIEW-UI-BACK-20261014'];
    assert(!rows.some(r=>references.includes(r.reference)),'Previously created review fixture found; resume, never duplicate');
    const created=[];
    await writeFile(evidence,JSON.stringify({time:new Date().toISOString(),state:'creating',before,created},null,2)+'\n',{flag:'wx'});
    for(const [i,reference] of references.entries()){
      const transfer=await owner.request('POST','/banks/transfers',{fromBankId:i===0?5:6,toBankId:i===0?6:5,amount:0.01,reference,narration:'STEP12 TEST ONLY staff review acceptance; internal record, no external banking instruction'},201);
      created.push({id:transfer.id,reference,fromBankId:transfer.fromBankId,toBankId:transfer.toBankId,amount:transfer.amount});
      await writeFile(evidence,JSON.stringify({time:new Date().toISOString(),state:created.length===2?'sources_created_waiting_UI':'creating',before,created},null,2)+'\n');
      await appendFile('docs/evidence/2026-10-14-step12-live-events.jsonl',JSON.stringify({time:new Date().toISOString(),pass:'New bounded staff-review dummy source created',...created.at(-1)})+'\n');
    }
    const after=await snapshot();assert.equal(after.bank5,before.bank5);assert.equal(after.bank6,before.bank6);
    console.log(JSON.stringify({mode,created,before,after,warning:'Two traceable opposite one-penny dummy transfers. Not a linked reversal. Native posting still requires actual independent UI decisions.'}));
  }else{
    const saved=JSON.parse(await readFile(evidence,'utf8'));assert.equal(saved.created.length,2);
    const results=[],preparer=await session('step12.preparer.20261014@donclimax.test',credential.testPassword),reviewer=await session('step12.reviewer.20261014@donclimax.test',credential.testPassword);
    assert.equal(preparer.user.id,15);assert.equal(reviewer.user.id,16);
    for(const src of saved.created){
      const reviews=workspace.reviews.filter(r=>r.source.kind==='bank_transfer'&&r.source.id===src.id);
      const posted=reviews.filter(r=>r.state==='posted');assert.equal(posted.length,1);assert.equal(posted[0].preparedBy,15);assert.equal(posted[0].reviewedBy,16);
      const detail=await owner.request('GET',scope(root+'/'+posted[0].id));
      assert.equal(detail.audit.filter(a=>a.action==='source_review_posted').length,1);assert.equal(detail.payload.cashMovement,'0.00');
      const retry=await preparer.request('POST',scope(root+'/prepare'),detail.payload.request);assert.equal(retry.id,posted[0].id);
      const repeated=await reviewer.request('POST',scope(root+'/'+posted[0].id+'/action'),{action:'post',reason:detail.reason});assert.equal(repeated.journalId,posted[0].journalId);
      await preparer.request('POST',scope(root+'/'+posted[0].id+'/action'),{action:'post',reason:'Must deny preparer self-post'},403);
      const unchanged=await owner.request('GET',scope(root+'/'+posted[0].id));assert.equal(unchanged.audit.length,detail.audit.length);
      const candidate=await owner.request('GET',scope(root+'/sources/bank_transfer/'+src.id));assert.equal(candidate.journalStatus,'posted');assert.equal(candidate.journalId,posted[0].journalId);
      results.push({sourceId:src.id,reviewId:posted[0].id,journalId:posted[0].journalId,states:reviews.map(r=>({id:r.id,state:r.state,replacesReviewId:r.replacesReviewId})),onePostedDecision:true});
    }
    assert(results[0].states.some(r=>r.state==='returned'));assert(results[0].states.some(r=>r.state==='posted'&&r.replacesReviewId));
    const after=await snapshot();assert.equal(after.bank5,saved.before.bank5);assert.equal(after.bank6,saved.before.bank6);
    for(const actor of [preparer,reviewer])await actor.request('POST','/auth/logout',{},200,'all');
    const operations=await session('e2e.operations.20260904@donclimax.test',credential.testPassword),foreign=await session('step12.foreign.20261014@donclimax.test',credential.testPassword);
    const denied={requestId:'step12_review_role_negative',source:{kind:'bank_transfer',id:saved.created[0].id},mapping:{currency:'NGN',policyVersion:'step12-dummy-20261014-v1',evidence:'TEST ONLY negative role check; must not prepare',effect:'transfer',bankAccounts:{5:2,6:28}}};
    for(const actor of [operations,foreign]){await actor.request('GET',scope(root),undefined,403);await actor.request('POST',scope(root+'/prepare'),denied,403);await actor.request('POST','/auth/logout',{},200,'all');}
    const final={...saved,time:new Date().toISOString(),state:'live_UI_and_API_verified',results,after,actualRoleNegatives:true,method:'Actual browser preparer/reviewer initial decisions; helper verifies retained history/reports and public same-record idempotent retries. No programmatic initial native posting.'};
    await writeFile(evidence,JSON.stringify(final,null,2)+'\n');console.log(JSON.stringify(final));
  }
}finally{await owner.request('POST','/auth/logout',{},200,'all');}
