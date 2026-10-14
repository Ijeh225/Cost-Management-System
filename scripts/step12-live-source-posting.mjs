// Deployed NativeAccounting service acceptance, not raw journal writes or UI simulation.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
export function postLiveSource(fixture,ref,mapping){
 const cli=process.env.RAILWAY_CLI_PATH;assert(cli);
 assert.equal(fixture.bookId,1);assert.equal(fixture.testBranchId,2);assert(Number.isSafeInteger(ref.id)&&ref.id>0);
 const remote=async(data)=>{
  const assert=require('node:assert/strict'),{createRequire}=require('node:module');
  const {Pool}=createRequire(process.cwd()+'/lib/db/package.json')('pg');
  const {NativeAccounting,accountingEnabled}=require(process.cwd()+'/artifacts/api-server/dist/accounting-foundation.cjs');
  assert(accountingEnabled());const pool=new Pool({connectionString:process.env.DATABASE_URL});
  try{
   assert.equal((await pool.query('SELECT current_database() name')).rows[0].name,'railway');
   const {fixture:f,ref,mapping}=data,book=(await pool.query('SELECT name FROM accounting_books WHERE id=$1',[f.bookId])).rows[0];
   assert(book.name.startsWith('STEP12 TEST ONLY'),'Only retained Step12 dummy book is writable');
   const engine=new NativeAccounting(pool),settlement=['invoice_payment','client_deposit'].includes(ref.kind);
   if(ref.kind==='configured_journal'){
    await engine.postConfiguredSource(f.bookId,2,f.reviewerId,ref.id,'Independent TEST ONLY configured source review; actual recorded facts');
    await engine.postConfiguredSource(f.bookId,2,f.reviewerId,ref.id,'Independent TEST ONLY configured source review; actual recorded facts');
    const read=await engine.readJournal(f.bookId,2,f.reviewerId,ref.id);assert.equal(read.status,'posted');
    console.log(JSON.stringify({journalId:ref.id,status:read.status,method:'Actual deployed configured-source review service, not signed-in approval UI'}));return;
   }
   const preview=settlement?await engine.previewSettlement(f.bookId,2,f.preparerId,ref,mapping):await engine.previewOperational(f.bookId,2,f.preparerId,ref,mapping);
   const before=(await pool.query('SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1 AND event_key=$2',[f.bookId,preview.input.eventKey])).rows[0].n;
   const prepare=()=>settlement?engine.prepareSettlement(f.bookId,2,f.preparerId,ref,mapping):engine.prepareOperational(f.bookId,2,f.preparerId,ref,mapping);
   const j=await prepare(),retry=await prepare();assert.equal(j.id,retry.id);
   const approval='Independent TEST ONLY source reviewer checked source facts, policy and exact mapping; not actual company certification';
   await engine.approveAndPost(f.bookId,2,f.reviewerId,j.id,approval);await engine.approveAndPost(f.bookId,2,f.reviewerId,j.id,approval);
   const read=await engine.readJournal(f.bookId,2,f.reviewerId,j.id);assert.equal(read.status,'posted');
   assert.equal((await pool.query('SELECT count(*)::int n FROM accounting_journals WHERE book_id=$1 AND event_key=$2',[f.bookId,preview.input.eventKey])).rows[0].n,1);
   assert.equal((await pool.query("SELECT count(*)::int n FROM accounting_audit WHERE journal_id=$1 AND action='posted'",[j.id])).rows[0].n,1);
   console.log(JSON.stringify({source:ref,journalId:j.id,eventKey:read.event_key,cashMovement:preview.cashMovement,lines:read.lines,existedBefore:before===1,
    method:'deployed NativeAccounting service with named preparer/reviewer grants, not direct SQL posting or signed-in source-review UI'}));
  }finally{await pool.end();}
 };
 const encoded=Buffer.from(`(${remote.toString()})(${JSON.stringify({fixture,ref,mapping})}).catch(error=>{console.log(JSON.stringify({failed:true,code:error.name==='AccountingError'?error.code:'UNAVAILABLE',error:error.name==='AccountingError'?error.message:'Details withheld'}));process.exitCode=1;})`).toString('base64');
 const result=spawnSync(cli,['ssh','--project','30166120-54e6-4f58-86ed-18ab396913f1','--environment','ecfbfac8-ec44-4257-990f-8a348e126f63','--service','95352cd0-c586-4e39-a35e-fb3c23ad9e52','--',`node -e "eval(Buffer.from('${encoded}','base64').toString())"`],
  {encoding:'utf8',timeout:90000,windowsHide:true,maxBuffer:2*1024*1024});
 if(result.status!==0){const line=result.stdout.split(/\r?\n/).find(l=>l.startsWith('{'));if(line){const failure=JSON.parse(line);console.error(JSON.stringify({source:ref,code:failure.code,error:failure.error}));}throw new Error('Live source acceptance failed; retained source must not be recreated');}
 const line=result.stdout.split(/\r?\n/).find(l=>l.startsWith('{'));assert(line);return JSON.parse(line);
}
