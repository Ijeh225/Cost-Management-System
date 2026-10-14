// Built UI, loopback dummy fixtures only. Abort all external requests; no live writes.
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir,readFile} from "node:fs/promises";
import {extname,resolve,sep} from "node:path";
import {pathToFileURL} from "node:url";
import {createRequire} from "node:module";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH??process.argv[2]).href);
const {buildAffairs}=createRequire(import.meta.url)("../artifacts/api-server/dist/accounting-foundation.cjs");
const root=resolve(import.meta.dirname,"../artifacts/cost-analysis/dist/public"),out=resolve(import.meta.dirname,"../tmp/affairs-ui");await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{const path=new URL(req.url,"http://localhost").pathname,file=path.startsWith("/assets/")?resolve(root,`.${path}`):resolve(root,"index.html");if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}try{res.setHeader("Content-Type",({".js":"text/javascript",".css":"text/css",".html":"text/html"})[extname(file)]??"application/octet-stream");res.end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const origin=`http://127.0.0.1:${server.address().port}`;
const branches=[{id:1,name:"QA Head Office",isActive:true},{id:2,name:"QA Lagos",isActive:true}],book={id:1,name:"Dummy reviewed book",currency:"NGN"};
let browser,page,userId=1,inactive=false,fail=false,firstPrepare=true,entry=null,delay=0;
const errors=[],writes=[];
try{
 browser=await chromium.launch({headless:true,channel:"chrome"});page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(/Missing.*Description|aria-describedby|PageErrorBoundary/.test(m.text()))errors.push(m.text());});
 await page.route("**/*",async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==origin){await route.abort();return;}if(!url.pathname.startsWith("/api/")){await route.continue();return;}
  const active=req.headers()["x-branch-id"]??"all",branch=url.searchParams.get("branchId")??active;let data=[],status=200;
  if(req.method()==="POST"){
   assert.ok(url.pathname.startsWith("/api/accounting/books/1/statement-of-affairs"));assert.notEqual(branch,"all");const payload=req.postDataJSON();writes.push({path:url.pathname,branch,payload});
   if(url.pathname.endsWith("/statement-of-affairs")){
    if(!entry)entry={id:10,state:"pending",preparedBy:userId,reviewedBy:null,createdAt:"2026-10-14T12:00:00Z",replacesId:null,superseded:false,reviewedAt:null,decisionReason:null,
      payload:buildAffairs(1,Number(branch),"NGN",payload).payload,audit:[{actorId:userId,action:"affairs_prepared",reason:"Dummy schedule",createdAt:"2026-10-14T12:00:00Z"}]};
    if(firstPrepare){firstPrepare=false;status=500;data={error:"Dummy interrupted response; retry same valuation"};}else data={id:10};
   }else if(url.pathname.endsWith("/action")){assert.notEqual(userId,entry.preparedBy);assert.equal(payload.action,"approve");assert.ok(payload.reason.trim());entry.state="approved";entry.reviewedBy=userId;entry.reviewedAt="2026-10-14T12:01:00Z";entry.decisionReason=payload.reason;
    entry.audit.push({actorId:userId,action:"affairs_approved",reason:payload.reason,createdAt:entry.reviewedAt});data={id:10};
   }else throw new Error("Unexpected dummy valuation write");
  }else{
   assert.equal(req.method(),"GET");
   if(url.pathname==="/api/auth/setup-required")data={required:false};else if(url.pathname==="/api/auth/csrf")data={token:"loopback-dummy-csrf"};
   else if(url.pathname==="/api/auth/me")data={id:userId,name:"QA Owner",email:"ui-only@example.test",role:"super_admin",branchId:1,accessProfile:{source:"modern",authorityLevel:"super_admin",jobFunction:"general_staff",workspaces:[],errors:[]}};
   else if(url.pathname==="/api/branches")data=branches;
   else if(url.pathname==="/api/notifications"||url.pathname==="/api/workflow-notifications")data={notifications:[],unreadCount:0};
   else if(url.pathname==="/api/settings")data={};
   else if(url.pathname==="/api/accounting/catalog")data=inactive?{status:"inactive",books:[]}:{status:"active",books:branches.filter(b=>active==="all"||String(b.id)===active).map(b=>({...book,branchId:b.id,branchName:b.name}))};
   else if(url.pathname.endsWith("/statement-of-affairs")){if(fail){status=500;data={error:"Dummy valuation workspace unavailable"};}else data={book,permissions:["prepare","post"],versions:branch==="1"&&entry?[{...entry,asOf:entry.payload.request.asOf,title:entry.payload.request.title}]:[],truncated:false};}
   else if(url.pathname.endsWith("/statement-of-affairs/10"))data=entry;
  }
  if(url.pathname.includes("/accounting/")&&delay)await new Promise(done=>setTimeout(done,delay));
  try{await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});}catch(e){if(!req.failure()&&!page.isClosed())throw e;}
 });
 async function setup(){await page.goto(`${origin}/accounting/statement-of-affairs`);await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByLabel("Valuation branch",{exact:true}).selectOption("1");await page.getByRole("button",{name:"Prepare Statement of Affairs",exact:true}).waitFor();}
 await setup();await page.getByRole("button",{name:"Prepare Statement of Affairs",exact:true}).click();
 assert.equal(await page.getByLabel("Valuation 1",{exact:true}).inputValue(),"");assert.equal(await page.getByLabel("Book value 1",{exact:true}).inputValue(),"");
 await page.getByLabel("Valuation date",{exact:true}).fill("2026-10-14");await page.getByLabel("Statement title",{exact:true}).fill("=Dummy valuation title");
 for(const label of ["Scope and supporting schedule reference","Limitations and missing records"])await page.getByLabel(label,{exact:true}).fill("Dummy incomplete schedule, no statutory certification");
 await page.getByLabel("Name 1",{exact:true}).fill("Dummy equipment");await page.getByLabel("Valuation 1",{exact:true}).fill("100.01");
 await page.getByLabel("Basis explanation 1",{exact:true}).fill("Dummy market estimate");await page.getByLabel("Evidence 1",{exact:true}).fill("Dummy dated survey");
 await page.getByRole("button",{name:"Add Schedule Item",exact:true}).click();await page.getByLabel("Category 2",{exact:true}).selectOption("liability");
 await page.getByLabel("Name 2",{exact:true}).fill("Dummy supplier");await page.getByLabel("Valuation 2",{exact:true}).fill("20.00");await page.getByLabel("Book value 2",{exact:true}).fill("20");await page.getByLabel("Basis 2",{exact:true}).selectOption("book");
 await page.getByLabel("Basis explanation 2",{exact:true}).fill("Dummy carrying amount");await page.getByLabel("Evidence 2",{exact:true}).fill("Dummy supplier confirmation");
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(out,"form-mobile.png"),fullPage:true});
 await page.getByRole("button",{name:"Submit for Independent Review",exact:true}).click();await page.getByRole("alert").filter({hasText:"Dummy interrupted response"}).waitFor();
 await page.getByRole("button",{name:"Submit for Independent Review",exact:true}).click();await page.getByRole("heading",{name:"Statement of Affairs: =Dummy valuation title",exact:true}).waitFor();
 const preparations=writes.filter(w=>w.path.endsWith("/statement-of-affairs"));assert.equal(preparations[0].payload.requestId,preparations[1].payload.requestId);assert.equal(await page.getByRole("button",{name:"Approve Valuation (No Posting)",exact:true}).count(),0);
 assert.ok(await page.locator(".affairs-snapshot").innerText().then(t=>t.includes("80.01")&&t.includes("Unknown (not zero)")));
 userId=2;await page.setViewportSize({width:1440,height:1000});await setup();await page.getByRole("button",{name:"Inspect Valuation #10",exact:true}).click();await page.getByLabel("Decision reason / review evidence",{exact:true}).fill("Dummy independently checked values");
 await page.getByRole("button",{name:"Approve Valuation (No Posting)",exact:true}).click();await page.locator(".affairs-snapshot").getByText(/APPROVED/).waitFor();
 const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export Valuation CSV",exact:true}).click();const file=await download;const csv=await readFile(await file.path(),"utf8");assert.ok(csv.includes("\"'\u003dDummy valuation title\""));assert.ok(csv.includes("80.01")&&csv.includes("affairs_approved")&&csv.includes("Unknown")===false);assert.ok(csv.includes("blank = unknown"));
 await page.emulateMedia({media:"print"});assert.equal(await page.evaluate(()=>getComputedStyle(document.body).backgroundColor),"rgb(255, 255, 255)");assert.equal(await page.getByRole("button",{name:"Prepare Statement of Affairs",exact:true}).isVisible(),false);assert.equal(await page.getByRole("heading",{name:"Statement of Affairs: =Dummy valuation title",exact:true}).isVisible(),true);
 await page.pdf({path:resolve(out,"affairs-print.pdf"),preferCSSPageSize:true,printBackground:true});await page.emulateMedia({media:"screen"});await page.screenshot({path:resolve(out,"reviewed-desktop.png"),fullPage:true});
 delay=650;await page.getByRole("button",{name:"Refresh Valuations",exact:true}).click();await page.getByRole("status").filter({hasText:"Refreshing this branch"}).waitFor();assert.equal(await page.locator(".affairs-snapshot").count(),1);assert.equal(await page.getByRole("button",{name:"Export Valuation CSV",exact:true}).isDisabled(),true);await page.getByRole("status").filter({hasText:"Refreshing this branch"}).waitFor({state:"hidden"});
 await page.getByLabel("Valuation branch",{exact:true}).selectOption("2");assert.equal(await page.locator(".affairs-snapshot").count(),0);await page.getByText(/No valuation entered/).waitFor();
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 delay=0;inactive=true;await page.reload();await page.getByRole("status").filter({hasText:"Official accounting is inactive"}).waitFor();assert.equal(await page.getByRole("button",{name:"Prepare Statement of Affairs",exact:true}).count(),0);
 inactive=false;fail=true;await page.reload();await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByLabel("Valuation branch",{exact:true}).selectOption("1");await page.getByRole("alert").filter({hasText:"Dummy valuation workspace unavailable"}).waitFor();
 assert.deepEqual(errors,[]);console.log("PASS: built loopback affairs explicit/unknown values, independent review, stable retry, CSV formula protection, print, branch clearing, refresh, mobile, inactive/error controls; dummy writes only");
}catch(e){console.error("UI errors:",errors);if(page&&!page.isClosed())console.error("UI text:",await page.locator("body").innerText());throw e;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
