// Built frontend with loopback-only dummy responses; no production or database access.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir,readFile } from "node:fs/promises";
import { extname,resolve,sep } from "node:path";
import { pathToFileURL } from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH??process.argv[2]).href);
const root=resolve(import.meta.dirname,"../artifacts/cost-analysis/dist/public"),out=resolve(import.meta.dirname,"../tmp/opening-ui");
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,"http://localhost").pathname,file=path.startsWith("/assets/")?resolve(root,`.${path}`):resolve(root,"index.html");
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader("Content-Type",({".js":"text/javascript",".css":"text/css",".html":"text/html"})[extname(file)]??"application/octet-stream");res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const origin=`http://127.0.0.1:${server.address().port}`;
const branches=[{id:1,name:"QA Head Office",isActive:true},{id:2,name:"QA Lagos",isActive:true}];
const book={id:1,name:"Dummy reviewed book",currency:"NGN",cutoverDate:"2026-10-01",policyVersion:"dummy-v1"};
const accounts=[{id:1,code:"1010",name:"Dummy bank",category:"asset",active:true},{id:2,code:"3000",name:"Dummy equity",category:"equity",active:true},{id:3,code:"5000",name:"Dummy zero expense",category:"expense",active:true}];
let browser,page,userId=1,inactive=false,fail=false,firstPrepare=true,entry=null,delay=0;
const errors=[],writes=[];
try{
  browser=await chromium.launch({headless:true,channel:"chrome"});page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(/Missing.*Description|aria-describedby|PageErrorBoundary/.test(m.text()))errors.push(m.text());});
  await page.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());if(url.origin!==origin){await route.abort();return;}
    if(!url.pathname.startsWith("/api/")){await route.continue();return;}
    const active=req.headers()["x-branch-id"]??"all",branch=url.searchParams.get("branchId")??active;
    let data=[],status=200;
    if(req.method()==="POST"){
      assert.ok(url.pathname.startsWith("/api/accounting/books/1/opening-balances"));assert.notEqual(branch,"all");
      const payload=req.postDataJSON();writes.push({path:url.pathname,branch,payload});
      if(url.pathname.endsWith("/preview"))data={debitTotal:"100.00",creditTotal:"100.00",zero:false,accountCount:3};
      else if(url.pathname.endsWith("/opening-balances")){
        if(!entry)entry={id:10,state:"pending",preparedBy:userId,reviewedBy:null,journalId:20,payload:{request:payload,chart:accounts},audit:[{actorId:userId,action:"opening_prepared",reason:"Dummy schedule",createdAt:"2026-10-13T16:00:00Z"}]};
        if(firstPrepare){firstPrepare=false;status=500;data={error:"Dummy interrupted response; retry same opening"};}else data={id:10};
      }else if(url.pathname.endsWith("/action")){
        assert.notEqual(userId,entry.preparedBy);assert.equal(payload.action,"verify");assert.ok(payload.reason.trim());entry.state="verified";entry.reviewedBy=userId;
        entry.audit.push({actorId:userId,action:"opening_verified",reason:payload.reason,createdAt:"2026-10-13T16:01:00Z"});data={id:10};
      }else throw new Error("Unexpected dummy opening write");
    }else{
      assert.equal(req.method(),"GET");
      if(url.pathname==="/api/auth/setup-required")data={required:false};
      else if(url.pathname==="/api/auth/csrf")data={token:"loopback-dummy-csrf-only"};
      else if(url.pathname==="/api/auth/me")data={id:userId,name:"QA Owner",email:"ui-only@example.test",role:"super_admin",branchId:1,accessProfile:{source:"modern",authorityLevel:"super_admin",jobFunction:"general_staff",workspaces:[],errors:[]}};
      else if(url.pathname==="/api/branches")data=branches;
      else if(url.pathname==="/api/notifications"||url.pathname==="/api/workflow-notifications")data={notifications:[],unreadCount:0};
      else if(url.pathname==="/api/settings")data={};
      else if(url.pathname==="/api/accounting/catalog")data=inactive?{status:"inactive",books:[]}:{status:"active",books:branches.filter(b=>active==="all"||String(b.id)===active).map(b=>({...book,branchId:b.id,branchName:b.name}))};
      else if(url.pathname.endsWith("/opening-balances")){if(fail){status=500;data={error:"Dummy opening workspace unavailable"};}else data={book,branchId:Number(branch),permissions:["prepare","post"],accounts,ready:branch==="1"&&entry?.state==="verified",versions:branch==="1"&&entry?[entry]:[],truncated:false};}
      else if(url.pathname.endsWith("/opening-balances/10"))data=entry;
    }
    if(url.pathname.includes("/accounting/")&&delay)await new Promise(done=>setTimeout(done,delay));
    try{await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});}catch(e){if(!req.failure()&&!page.isClosed())throw e;}
  });
  async function setup(){await page.goto(`${origin}/accounting/opening-balances`);await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByLabel("Opening branch",{exact:true}).selectOption("1");await page.getByRole("button",{name:"Enter Opening Balances",exact:true}).waitFor();}
  await setup();await page.getByRole("button",{name:"Enter Opening Balances",exact:true}).click();
  assert.equal(await page.getByLabel("Debit 1010",{exact:true}).inputValue(),"","Amounts are never silently defaulted to zero");
  for(const label of ["Owner approval reference","Head of Accounts schedule reference","Bank / subledger reconciliation reference"])await page.getByLabel(label,{exact:true}).fill("Dummy reviewed schedule reference");
  await page.getByLabel("Debit 1010",{exact:true}).fill("100");await page.getByLabel("Credit 1010",{exact:true}).fill("0");
  await page.getByLabel("Debit 3000",{exact:true}).fill("0");await page.getByLabel("Credit 3000",{exact:true}).fill("100");
  await page.getByRole("button",{name:"Set 5000 to explicit zero",exact:true}).click();
  for(const code of ["1010","3000","5000"])await page.getByLabel(`Evidence ${code}`,{exact:true}).fill(`Dummy reviewed evidence ${code}`);
  await page.getByRole("button",{name:"Validate Preview",exact:true}).click();await page.getByRole("status").filter({hasText:"Preview only; nothing saved or posted"}).waitFor();
  assert.equal(entry,null);await page.screenshot({path:resolve(out,"opening-desktop-form.png"),fullPage:true});
  await page.getByRole("button",{name:"Submit for Verification",exact:true}).click();await page.getByRole("alert").filter({hasText:"Dummy interrupted response"}).waitFor();
  await page.getByRole("button",{name:"Submit for Verification",exact:true}).click();await page.getByRole("heading",{name:"Opening Version #10",exact:true}).waitFor();
  const preparations=writes.filter(w=>w.path.endsWith("/opening-balances"));assert.equal(preparations[0].payload.requestId,preparations[1].payload.requestId);
  assert.equal(await page.getByRole("button",{name:"Verify and Initialise",exact:true}).count(),0,"No preparer self verification");
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{const d=document.querySelector('[role="dialog"]')?.getBoundingClientRect();return !!d&&d.x>=0&&d.right<=innerWidth+1;});
  await page.screenshot({path:resolve(out,"opening-mobile-dialog.png"),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();userId=2;await page.setViewportSize({width:1440,height:1000});await setup();
  await page.getByRole("button",{name:"Inspect Opening #10",exact:true}).click();await page.getByLabel("Opening decision reason",{exact:true}).fill("Dummy independent exact verification");
  await page.getByRole("button",{name:"Verify and Initialise",exact:true}).click();await page.getByRole("dialog").getByText(/verified \| Preparer #1/).waitFor();await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Enter Opening Balances",exact:true}).isDisabled(),true);
  delay=650;await page.getByRole("button",{name:"Refresh openings",exact:true}).click();await page.getByRole("status").filter({hasText:"Refreshing the same opening branch"}).waitFor();assert.equal(await page.getByRole("button",{name:"Inspect Opening #10",exact:true}).count(),1);await page.getByRole("status").filter({hasText:"Refreshing the same opening branch"}).waitFor({state:"hidden"});
  await page.getByLabel("Opening branch",{exact:true}).selectOption("2");assert.equal(await page.getByRole("button",{name:"Inspect Opening #10",exact:true}).count(),0);await page.getByText(/No opening version has been entered/).waitFor();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,"opening-mobile.png"),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.getByRole("button",{name:"Enter Opening Balances",exact:true}).click();accounts.push({id:4,code:"5001",name:"Dummy added chart account",category:"expense",active:true});
  await page.getByRole("button",{name:"Refresh openings",exact:true}).click();await page.getByRole("alert").filter({hasText:"Chart changed while this form was open"}).waitFor();
  assert.equal(await page.getByRole("button",{name:"Submit for Verification",exact:true}).isDisabled(),true);await page.getByRole("button",{name:"Update Form to Current Chart",exact:true}).click();assert.equal(await page.getByLabel("Debit 5001",{exact:true}).inputValue(),"");
  delay=0;inactive=true;await page.reload();await page.getByRole("status").filter({hasText:"Official accounting is inactive"}).waitFor();assert.equal(await page.getByRole("button",{name:"Enter Opening Balances",exact:true}).count(),0);
  inactive=false;fail=true;await page.reload();await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByLabel("Opening branch",{exact:true}).selectOption("1");await page.getByRole("alert").filter({hasText:"Dummy opening workspace unavailable"}).waitFor();
  assert.deepEqual(errors,[]);console.log("PASS: built loopback opening explicit figures/zeros, read-only preview, stable retry, independent verification, scope clearing, refresh, desktop/mobile accessible dialogs, OFF/error; dummy writes only");
}catch(error){console.error("UI errors:",errors);if(page&&!page.isClosed())console.error("UI text:",await page.locator("body").innerText());throw error;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
