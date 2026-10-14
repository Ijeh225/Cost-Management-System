// Owner-authorised Step12 deployed test-book setup. No credentials or sessions persisted.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const cli=process.env.RAILWAY_CLI_PATH;
assert(cli,'Authenticated Railway CLI required');
const mode=process.argv[2]??'inspect';
assert(['inspect','setup','bank-chart','periods','reconcile','reconcile-final'].includes(mode));
if(mode!=='inspect')assert(process.argv.includes('--confirm=STEP12-LIVE-TEST-20261014'),'Explicit live fixture confirmation required');
const remote=async(mode)=>{
 const assert=require('node:assert/strict'),{createRequire}=require('node:module');
 const {Pool}=createRequire(process.cwd()+'/lib/db/package.json')('pg');
 const native=require(process.cwd()+'/artifacts/api-server/dist/accounting-foundation.cjs');
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try{
  assert.equal((await pool.query('SELECT current_database() name')).rows[0].name,'railway');
  const branches=(await pool.query('SELECT id,name,is_active AS active FROM branches ORDER BY id')).rows;
  const users=(await pool.query(`SELECT id,name,email,branch_id AS "branchId",authority_level AS authority,job_function AS job,
   is_active AS active FROM users WHERE is_active OR email LIKE 'step12.%@donclimax.test' ORDER BY id`)).rows;
  const exists=(await pool.query("SELECT to_regclass('public.accounting_books') name")).rows[0].name;
  if(mode==='inspect'){
   const books=exists?(await pool.query('SELECT id,name,status FROM accounting_books ORDER BY id')).rows:[];
   console.log(JSON.stringify({mode,accountingEnabled:native.accountingEnabled(),schemaEnabled:process.env.NATIVE_ACCOUNTING_SCHEMA_ENABLED==='true',branches,users,books}));return;
  }
  assert.equal(native.accountingEnabled(),true,'Native live gate not enabled');
  assert(exists,'Native schema migration must complete first');
  const owner=users.find(u=>u.email==='ijehifeany@gmail.com'&&u.active&&u.authority==='super_admin');assert(owner,'Active existing owner required');
  const preparer=users.find(u=>u.email==='step12.preparer.20261014@donclimax.test'&&u.active&&u.job==='accounts');
  const reviewer=users.find(u=>u.email==='step12.reviewer.20261014@donclimax.test'&&u.active&&u.job==='accounts');
  assert(preparer&&reviewer&&preparer.id!==reviewer.id,'Two controlled independent API-created accounts required');
  const label='STEP12 TEST ONLY - 20261014 - NOT OFFICIAL COMPANY BOOKS';
  const old=(await pool.query('SELECT id,name FROM accounting_books WHERE name=$1',[label])).rows;
  if(mode==='bank-chart'||mode==='periods'||mode==='reconcile'||mode==='reconcile-final'){
   assert.equal(old.length,1);assert.equal(old[0].id,1);const engine=new native.NativeAccounting(pool);
   if(mode==='reconcile'||mode==='reconcile-final'){
    const accounts=(await pool.query('SELECT id,code FROM accounting_accounts WHERE book_id=1 ORDER BY code')).rows;
    const debit={'1010':'10152.50','1011':'25.00','1200':'50.00','1400':'3.00','5010':'107.50','5020':'107.50','5030':'104.50','6000':'150.00','6100':'200.00'},credit={'3000':'10000.00','4000':'900.00'};
    const controls=accounts.map(r=>({accountId:r.id,debit:debit[r.code]??'0',credit:credit[r.code]??'0',evidence:'Independently expected TEST ONLY fixture amounts: recorded receipts, direct obligations, classified payments, recoveries, credit/writeoff; not old company/history controls'}));
    const result=await engine.reconcileSources(1,2,preparer.id,'2026-10-14',controls);
    assert(result.controls.every(c=>c.difference==='0.00'));assert.equal(result.missingControls.length,0);assert.equal(result.sources.filter(s=>s.status==='stale'||s.status==='missing'||s.status==='draft').length,0);
    const statuses=Object.fromEntries([...new Set(result.sources.map(s=>s.status))].map(k=>[k,result.sources.filter(s=>s.status===k).length]));
    assert.equal(result.complete,false,'Pre-cutover/test historical classifications must not be hidden');
    console.log(JSON.stringify({mode,bookId:1,through:'2026-10-14',accountControls:controls.length,zeroControlDifferences:true,noMissingControls:true,noNewMissingDraftStaleSources:true,complete:false,statuses,limitation:'Historical pre-cutover and unclassified test sources remain disclosed; no real company certification',method:'Actual deployed source revalidation with independently expected fixture controls; report UI does not persist these controls'}));return;
   }
   if(mode==='bank-chart'){
    const account=await engine.addAccount(1,2,owner.id,'1011','STEP12 TEST ONLY second own bank','asset');
    console.log(JSON.stringify({mode,bookId:1,accountId:account,code:'1011',warning:'New zero-balance bank head; original verified openings and posted journals unchanged'}));return;
   }
   const existing=(await pool.query("SELECT id FROM accounting_periods WHERE book_id=1 AND name='STEP12 TEST ONLY empty November period'")).rows;assert.equal(existing.length,0,'Inspect prior period proof instead of repeating it');
   const period=await engine.createPeriod(1,2,owner.id,'STEP12 TEST ONLY empty November period','2026-11-01','2026-11-30');
   const review={evidence:'TEST ONLY empty future period has no dated sources/journals; no certification of October or historical/company completeness',sourceCoverageComplete:true,reconciled:true,unresolvedMappings:0};
   await assert.rejects(engine.changePeriod(1,reviewer.id,period,'close',review),e=>e.code==='FORBIDDEN');
   await assert.rejects(engine.changePeriod(1,owner.id,period,'close',{...review,sourceCoverageComplete:false}),e=>e.code==='CLOSE_REVIEW_REQUIRED');
   await engine.changePeriod(1,owner.id,period,'close',review);
   const candidate={bookId:1,branchId:2,currency:'NGN',accountingDate:'2026-11-10',eventKey:'step12:closed-period-proof',narration:'Closed period negative only',evidence:'Must refuse without financial write',lines:[{accountId:20,debit:'0.01',credit:'0'},{accountId:7,debit:'0',credit:'0.01'}]};
   await assert.rejects(engine.prepareJournal(preparer.id,candidate),e=>e.code==='PERIOD_CLOSED');
   assert.equal((await pool.query('SELECT count(*)::int n FROM accounting_journals WHERE event_key=$1',[candidate.eventKey])).rows[0].n,0);
   await engine.changePeriod(1,owner.id,period,'reopen',review);
   const audit=(await pool.query("SELECT action,count(*)::int n FROM accounting_audit WHERE period_id=$1 AND action IN ('period_closed','period_reopened') GROUP BY action",[period])).rows;
   assert.equal(audit.length,2);assert(audit.every(r=>r.n===1));
   console.log(JSON.stringify({mode,periodId:period,finalState:'open',scope:'Empty future period only; October remains open',negativeClosedPrepare:'PERIOD_CLOSED',noCandidateJournal:true,audit,method:'Actual deployed service with named grants, not period UI'}));return;
  }
  assert.equal(old.length,0,'Test book exists: inspect and resume it, do not recreate');
  const branchIds=branches.filter(b=>b.active&&[2,3].includes(b.id)&&b.name.startsWith('E2E-')).map(b=>b.id);
  assert.equal(branchIds.length,2,'Only the two existing test branches belong to this rehearsal book');assert(branchIds.includes(preparer.branchId)&&preparer.branchId===reviewer.branchId);
  const engine=new native.NativeAccounting(pool),book=await engine.createDraftBook(owner.id,label,'NGN',branchIds);
  const evidence='Owner authorised live dummy-data rehearsal 2026-10-14; TEST ONLY, no actual professional/company certification';
  for(const br of branchIds)for(const p of native.ACCOUNTING_PERMISSIONS)await engine.grantAccess(book,br,owner.id,owner.id,p,evidence);
  for(const [user,permissions] of [[preparer,['read','prepare','reverse']],[reviewer,['read','post','configure','close','reopen']]])
   for(const p of permissions)await engine.grantAccess(book,user.branchId,owner.id,user.id,p,evidence);
  const accounts={};
  for(const [code,name,category] of native.DRAFT_CHART)accounts[code]=await engine.addAccount(book,preparer.branchId,owner.id,code,'TEST ONLY '+name,category);
  for(const [code,name,category] of [['1400','Test input VAT','asset'],['2210','Test output VAT','liability'],['5010','Test Duty expense','expense'],['5020','Test Shipping expense','expense'],['5030','Test Terminal expense','expense'],['6010','Test accrued overhead','expense'],['2310','Test adjustment accrual','liability']])
   accounts[code]=await engine.addAccount(book,preparer.branchId,owner.id,code,name,category);
  const policy=Object.fromEntries(native.ACCOUNTING_POLICY_KEYS.map(k=>[k,'TEST ONLY dummy rehearsal policy; not actual accountant approval: '+k]));
  policy.cutoverDate='2026-10-14';policy.financialYearEnd='12-31';policy.legalEntity=label;
  policy.revenueRecognition='TEST ONLY gross bundled clearing fees on issued invoices; source-backed accrual; not real launch policy';
  policy.passThroughCosts='TEST ONLY company-borne direct Duty/Shipping/Terminal expense, per owner requested model; no agent trust assumption';
  policy.vat='TEST ONLY service exempt scenario plus reviewed dummy taxable/zero/exempt purchase cases; no legal certification';
  await engine.approveBook(book,preparer.branchId,owner.id,{policy,version:'step12-dummy-20261014-v1',ownerEvidence:evidence,
   accountantEvidence:'TEST FIXTURE ONLY - simulated review for acceptance; no actual accountant sign-off supplied'});
  const period=await engine.createPeriod(book,preparer.branchId,owner.id,'STEP12 TEST October2026','2026-10-14','2026-10-31');
  console.log(JSON.stringify({mode,bookId:book,periodId:period,ownerId:owner.id,preparerId:preparer.id,reviewerId:reviewer.id,
    testBranchId:preparer.branchId,branchIds,accounts,warning:'TEST ONLY. Opening verification, tax configuration and journal workflows must run through deployed API/UI. No source/backfill/import/openings posted by setup.'}));
 }finally{await pool.end();}
};
const code=`(${remote.toString()})(${JSON.stringify(mode)}).catch(()=>{console.error('Step12 native operation failed; inspect retained fixture before retry; secrets withheld');process.exitCode=1;})`;
const encoded=Buffer.from(code).toString('base64');
const result=spawnSync(cli,['ssh','--project','30166120-54e6-4f58-86ed-18ab396913f1','--environment','ecfbfac8-ec44-4257-990f-8a348e126f63','--service','95352cd0-c586-4e39-a35e-fb3c23ad9e52','--',`node -e "eval(Buffer.from('${encoded}','base64').toString())"`],
 {encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:4*1024*1024});
assert.equal(result.status,0,'Live test setup/inspection failed; diagnostic output withheld');
console.log(result.stdout);
if(mode!=='inspect'){
 const row=result.stdout.split(/\r?\n/).find(l=>l.startsWith('{'));
 assert(row,'Setup evidence missing');const data=JSON.parse(row);
 writeFileSync(`docs/evidence/2026-10-14-step12-native-${mode}.json`,JSON.stringify(data,null,2)+'\n',{flag:'wx'});
}
