// Loopback-only built UI acceptance. Dummy writes; external requests are blocked.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir,readFile } from "node:fs/promises";
import { extname,resolve,sep } from "node:path";
import { pathToFileURL } from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH??process.argv[2]).href);
const root=resolve(import.meta.dirname,"../artifacts/cost-analysis/dist/public"),out=resolve(import.meta.dirname,"../tmp/tax-ui");await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{const path=new URL(req.url,"http://localhost").pathname,file=path.startsWith('/assets/')?resolve(root,`.${path}`):resolve(root,'index.html');
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,'127.0.0.1',done));const origin=`http://127.0.0.1:${server.address().port}`;
const branches=[{id:1,name:'QA Head Office',isActive:true},{id:2,name:'QA Lagos',isActive:true}],book={id:1,name:'Dummy reviewed book',currency:'NGN',cutoverDate:'2026-10-01',policyVersion:'dummy-v1'};
const accounts=[[101,'1010','Dummy bank','asset'],[110,'1100','Dummy AR','asset'],[120,'1400','Dummy input VAT','asset'],[220,'2200','Dummy output VAT','liability'],[400,'4000','Dummy service revenue','income'],[500,'5000','Dummy duty','expense'],[501,'5010','Dummy shipping','expense'],[502,'5020','Dummy terminal','expense']].map(([id,code,name,category])=>({id,code,name,category,active:true}));
let browser,page,userId=1,inactive=false,fail=false,delay=0,firstConfiguration=true,version=null,journal=null;
const writes=[],errors=[];
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/Missing.*Description|aria-describedby|PageErrorBoundary/.test(m.text()))errors.push(m.text());});
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==origin){await route.abort();return;}if(!url.pathname.startsWith('/api/')){await route.continue();return;}
    const active=req.headers()['x-branch-id']??'all',branch=url.searchParams.get('branchId')??active;let data=[],status=200;
    if(req.method()==='POST') {
      assert.ok(url.pathname.startsWith('/api/accounting/books/1/tax-configuration'));assert.notEqual(branch,'all');const body=req.postDataJSON();writes.push({path:url.pathname,body,branch});
      if(url.pathname.endsWith('/tax-configuration')) {
        version??={id:10,state:'pending',effectiveFrom:body.effectiveFrom,preparedBy:userId,reviewedBy:null,decisionReason:null,payload:body};
        if(firstConfiguration){firstConfiguration=false;status=500;data={error:'Dummy interrupted response; retry stable configuration'};}else data={id:10};
      }else if(url.pathname.endsWith('/10/action')) {
        assert.notEqual(userId,version.preparedBy);assert.equal(body.action,'approve');version.state='approved';version.reviewedBy=userId;version.decisionReason=body.reason;data={id:10};
      }else if(url.pathname.endsWith('/sources/preview')||url.pathname.endsWith('/sources/prepare')) {
        if(body.kind==='invoice') {
          assert.ok(url.pathname.endsWith('/preview'));assert.equal(body.id,6);assert.equal(body.taxCode,'EXEMPT');assert.equal(body.receivableAccountId,110);assert.equal(body.incomeAccountId,400);
          assert.deepEqual(body.items,[{itemId:10,code:'EXEMPT'},{itemId:11,code:'ZERO'}]);
          data={kind:'preview',cashMovement:'0.00',input:{accountingDate:'2026-10-10',eventKey:'source:invoice:6:v1',narration:'Dummy exempt/zero invoice',evidence:JSON.stringify(body),lines:[{accountId:110,debit:'100.00',credit:'0.00'},{accountId:400,debit:'0.00',credit:'100.00'}]}};
        }else{
        assert.equal(body.id,4);assert.equal(body.taxCode,'STANDARD');assert.equal(body.basis,'inclusive');assert.equal(body.taxAmount,'107.50');assert.equal(body.settlementAccountId,101);
        const input={accountingDate:'2026-10-10',eventKey:'source:duty_payment:4:v1',narration:'Dummy reviewed duty',evidence:JSON.stringify({source:{kind:'duty_payment',id:4},mapping:{purchaseTax:{code:'STANDARD'}}}),
          lines:[{accountId:500,debit:'100.00',credit:'0.00'},{accountId:120,debit:'7.50',credit:'0.00'},{accountId:101,debit:'0.00',credit:'107.50'}]};
        if(url.pathname.endsWith('/preview'))data={kind:'preview',input,cashMovement:'-107.50'};
        else{journal={id:20,status:'draft',preparedBy:userId,date:input.accountingDate,eventKey:input.eventKey,narration:input.narration,evidence:input.evidence,lines:input.lines.map(l=>({...l,memo:''}))};data={kind:'prepared',id:20};}}
      }else if(url.pathname.endsWith('/journals/20/post')){assert.notEqual(userId,journal.preparedBy);assert.ok(body.reason.trim());journal.status='posted';data={id:20};}
      else throw Error('Unexpected dummy tax write');
    }else{
      assert.equal(req.method(),'GET');
      if(url.pathname==='/api/auth/setup-required')data={required:false};else if(url.pathname==='/api/auth/csrf')data={token:'dummy-loopback-csrf'};
      else if(url.pathname==='/api/auth/me')data={id:userId,name:'QA Owner',email:'ui-only@example.test',role:'super_admin',branchId:1,accessProfile:{source:'modern',authorityLevel:'super_admin',jobFunction:'general_staff',workspaces:[],errors:[]}};
      else if(url.pathname==='/api/branches')data=branches;else if(url.pathname==='/api/notifications'||url.pathname==='/api/workflow-notifications')data={notifications:[],unreadCount:0};else if(url.pathname==='/api/settings')data={};
      else if(url.pathname==='/api/accounting/catalog')data=inactive?{status:'inactive',books:[]}:{status:'active',books:branches.filter(b=>active==='all'||String(b.id)===active).map(b=>({...book,branchId:b.id,branchName:b.name}))};
      else if(url.pathname.endsWith('/tax-configuration')){if(fail){status=500;data={error:'Dummy scoped tax workspace unavailable'};}else data={book,branchId:Number(branch),permissions:['configure','prepare','post','reverse'],accounts,versions:branch==='1'&&version?[version]:[],journals:branch==='1'&&journal?[journal]:[],truncated:false};}
      else if(url.pathname.endsWith('/sources/duty_payment/4'))data={id:4,kind:'duty_payment',status:'payment',total:'107.50',date:'2026-10-10',bankId:7,items:[]};
      else if(url.pathname.endsWith('/sources/invoice/6'))data={id:6,kind:'invoice',status:'sent',subtotal:'100.00',vat:'0.00',total:'100.00',items:[{id:10,amount:'60.00'},{id:11,amount:'40.00'}]};
      else if(url.pathname.endsWith('/journals/20'))data=journal;
      else if(url.pathname.endsWith('/register'))data={from:url.searchParams.get('from'),to:url.searchParams.get('to'),branchId:Number(branch),basis:'Posted native journals; reviewed tax classifications only',unclassified:0,limitation:'Dummy report, not an official VAT return',
        rows:journal?.status==='posted'?[{journalId:20,date:'2026-10-10',sourceKind:'duty_payment',sourceId:4,configurationId:10,code:'STANDARD',treatment:'taxable',net:'100.00',vat:'7.50',gross:'107.50',recoverable:'7.50',nonRecoverable:'0.00',direction:'purchase',reversal:false}]:[],
        totals:{netPurchases:'100.00',purchaseVat:'7.50',recoverable:'7.50',nonRecoverable:'0.00',netSales:'0.00',outputVat:'0.00'}};
      else if(url.pathname.includes('/accounting/'))throw Error('Unexpected dummy accounting read '+url.pathname);
    }
    if(url.pathname.includes('/accounting/')&&delay)await new Promise(done=>setTimeout(done,delay));await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  async function setup(){await page.goto(`${origin}/accounting/tax-configuration`);await page.getByLabel('Accounting book',{exact:true}).selectOption('1');await page.getByLabel('Configuration branch',{exact:true}).selectOption('1');await page.getByRole('button',{name:'New Configuration',exact:true}).waitFor();}
  await setup();await page.getByRole('button',{name:'New Configuration',exact:true}).click();
  assert.equal(await page.getByLabel('Effective from',{exact:true}).inputValue(),'','No guessed real commencement date');
  await page.getByLabel('Effective from',{exact:true}).fill('2026-10-01');await page.getByLabel('Owner policy reference',{exact:true}).fill('Dummy owner reference');await page.getByLabel('Accountant tax approval reference',{exact:true}).fill('Dummy accountant reference');
  for(const [label,id] of [['Input VAT (asset)',120],['Output VAT (liability)',220],['Duty direct expense',500],['Shipping direct expense',501],['Terminal direct expense',502]])await page.getByLabel(label,{exact:true}).selectOption(String(id));
  for(const input of await page.getByLabel('Legal / recovery basis reference',{exact:true}).all())await input.fill('Dummy reviewed legal and recovery reference');
  await page.getByLabel('Recoverable input VAT %',{exact:true}).nth(0).fill('100');await page.getByRole('button',{name:'Submit Configuration for Review',exact:true}).click();await page.getByRole('alert').filter({hasText:'Dummy interrupted response'}).waitFor();
  await page.getByRole('button',{name:'Submit Configuration for Review',exact:true}).click();await page.getByRole('button',{name:'Inspect Configuration #10',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Approve Configuration',exact:true}).count(),0);
  const attempts=writes.filter(w=>w.path.endsWith('/tax-configuration'));assert.equal(attempts[0].body.requestId,attempts[1].body.requestId);
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{const r=document.querySelector('[role="dialog"]')?.getBoundingClientRect();return !!r&&r.x>=0&&r.right<=innerWidth+1;});
  assert.ok(await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');return d.scrollWidth<=d.clientWidth+1;}));
  await page.screenshot({path:resolve(out,'configuration-mobile-dialog.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();userId=2;await page.setViewportSize({width:1440,height:1000});await setup();await page.getByRole('button',{name:'Inspect Configuration #10',exact:true}).click();await page.getByLabel('Configuration decision reason',{exact:true}).fill('Dummy independent configuration review');await page.getByRole('button',{name:'Approve Configuration',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.getByLabel('Source record ID',{exact:true}).fill('4');await page.getByRole('button',{name:'Load Existing Source',exact:true}).click();await page.getByRole('status').filter({hasText:'#4: payment'}).waitFor();
  await page.getByLabel('Approved configuration',{exact:true}).selectOption('10');await page.getByLabel('VAT treatment / default code',{exact:true}).selectOption('STANDARD');await page.getByLabel('Amount on supplier document',{exact:true}).fill('107.50');await page.getByLabel('Recorded cash / bank GL account',{exact:true}).selectOption('101');await page.getByLabel('Transaction review / supplier tax reference',{exact:true}).fill('Dummy full voucher review');
  await page.getByRole('button',{name:'Preview Tax and Posting',exact:true}).click();await page.getByRole('region',{name:'Source journal preview'}).waitFor();await page.screenshot({path:resolve(out,'tax-desktop-preview.png'),fullPage:true});assert.equal(journal,null);
  await page.getByLabel('Amount on supplier document',{exact:true}).fill('100');assert.equal(await page.getByRole('region',{name:'Source journal preview'}).count(),0);await page.getByLabel('Amount on supplier document',{exact:true}).fill('107.50');
  await page.getByRole('button',{name:'Prepare Existing Source Once',exact:true}).click();await page.getByRole('heading',{name:'Source Journal #20',exact:true}).waitFor();await page.getByText('Dummy duty: Debit',{exact:false}).count();assert.equal(await page.getByRole('button',{name:'Approve and Post Source',exact:true}).count(),0);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();userId=3;await setup();await page.getByRole('button',{name:'Inspect Journal #20',exact:true}).click();await page.getByLabel('Independent posting evidence',{exact:true}).fill('Dummy independent supplier voucher approval');await page.getByRole('button',{name:'Approve and Post Source',exact:true}).click();await page.getByRole('dialog').getByText(/posted \| 2026-10-10/).waitFor();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByLabel('VAT register from',{exact:true}).fill('2026-10-01');await page.getByLabel('VAT register to',{exact:true}).fill('2026-10-13');await page.getByRole('button',{name:'Generate Posted Register',exact:true}).click();await page.getByRole('status').filter({hasText:'0 source journals lack structured tax classification'}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByRole('heading',{name:'Posted VAT Register',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,'tax-mobile-register.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByLabel('Source type',{exact:true}).selectOption('invoice');await page.getByLabel('Source record ID',{exact:true}).fill('6');await page.getByRole('button',{name:'Load Existing Source',exact:true}).click();await page.getByRole('status').filter({hasText:'#6: sent'}).waitFor();
  await page.getByLabel('Approved configuration',{exact:true}).selectOption('10');await page.getByLabel('VAT treatment / default code',{exact:true}).selectOption('EXEMPT');await page.getByLabel('Recognition date',{exact:true}).fill('2026-10-10');await page.getByLabel('Receivables control',{exact:true}).selectOption('110');await page.getByLabel('Service revenue account',{exact:true}).selectOption('400');await page.getByLabel('Invoice item #11 VAT code',{exact:true}).selectOption('ZERO');await page.getByLabel('Transaction review / supplier tax reference',{exact:true}).fill('Dummy exempt/zero invoice item evidence');
  await page.getByRole('button',{name:'Preview Tax and Posting',exact:true}).click();await page.getByRole('region',{name:'Source journal preview'}).getByText(/Cash movement 0.00/).waitFor();
  delay=650;await page.getByRole('button',{name:'Refresh Configuration',exact:true}).click();await page.getByRole('status').filter({hasText:'Refreshing this branch'}).waitFor();assert.equal(await page.getByRole('button',{name:'Inspect Journal #20',exact:true}).count(),1);await page.getByRole('status').filter({hasText:'Refreshing this branch'}).waitFor({state:'hidden'});delay=0;
  await page.getByLabel('Configuration branch',{exact:true}).selectOption('2');await page.getByText('No approved tax configuration yet.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Inspect Journal #20',exact:true}).count(),0);assert.equal(await page.getByLabel('Source record ID',{exact:true}).inputValue(),'');assert.equal(await page.getByLabel('Amount on supplier document',{exact:true}).inputValue(),'');
  inactive=true;await page.reload();await page.getByRole('status').filter({hasText:'Official accounting is inactive'}).waitFor();assert.equal(await page.getByRole('button',{name:'New Configuration',exact:true}).count(),0);
  inactive=false;fail=true;await page.reload();await page.getByLabel('Accounting book',{exact:true}).selectOption('1');await page.getByLabel('Configuration branch',{exact:true}).selectOption('1');await page.getByRole('alert').filter({hasText:'Dummy scoped tax workspace unavailable'}).waitFor();assert.deepEqual(errors,[]);
  console.log('PASS: built VAT/direct expense configuration, stable retry, independent review/post, existing source preview, invalidation, posted register, branch clearing, refresh, desktop/mobile dialogs, OFF/error; loopback dummy writes only');
}catch(e){console.error('UI errors:',errors);if(page&&!page.isClosed())console.error('UI text:',await page.locator('body').innerText());throw e;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
