// Built frontend, loopback-only dummy GET/POST responses; no production or database access.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir,readFile } from "node:fs/promises";
import { extname,resolve,sep } from "node:path";
import { pathToFileURL } from "node:url";
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH??process.argv[2]).href);
const root=resolve(import.meta.dirname,"../artifacts/cost-analysis/dist/public"),out=resolve(import.meta.dirname,"../tmp/step9-ui");
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,"http://localhost").pathname,file=pathname.startsWith("/assets/")?resolve(root,`.${pathname}`):resolve(root,"index.html");
  if(!file.startsWith(`${root}${sep}`)){res.writeHead(403).end();return;}
  try{res.setHeader("Content-Type",({".js":"text/javascript",".css":"text/css",".html":"text/html"})[extname(file)]??"application/octet-stream");res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const origin=`http://127.0.0.1:${server.address().port}`;
const branches=[{id:1,name:"QA Head Office",isActive:true},{id:2,name:"QA Lagos",isActive:true}],book={id:1,name:"Dummy reviewed book",currency:"NGN",cutoverDate:"2026-10-01"};
const accounts=[{id:1,code:"6200",name:"Dummy expense",category:"expense",active:true,role:"adjustment"},{id:2,code:"1390",name:"Dummy depreciation",category:"asset",active:true,role:"adjustment"},
  {id:3,code:"1010",name:"Dummy protected bank",category:"asset",active:true,role:"protected"}];
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
      assert.ok(url.pathname.startsWith("/api/accounting/books/1/manual"),"Dummy writes must stay inside the manual accounting route");
      assert.notEqual(branch,"all");const payload=req.postDataJSON();writes.push({path:url.pathname,branch,active,payload});
      if(url.pathname.endsWith("/manual")){
        if(!entry)entry={id:10,date:payload.accountingDate,narration:payload.narration,preparedBy:userId,postedBy:null,state:"draft",reversalOf:null,replacesJournalId:null,
          currency:"NGN",evidence:JSON.stringify({manualReview:payload}),lines:payload.lines,audit:[{actorId:userId,action:"prepared",reason:payload.evidence,createdAt:"2026-10-12T17:00:00Z"}]};
        if(firstPrepare){status=500;data={error:"Dummy interrupted response; retry the same request"};firstPrepare=false;}else data={id:10};
      }else if(url.pathname.endsWith("/action")){
        assert.ok(payload.reason.trim());entry.state=payload.action==="submit"?"submitted":payload.action==="post"?"posted":payload.action==="reject"?"rejected":"cancelled";
        if(payload.action==="post"){assert.notEqual(userId,entry.preparedBy);entry.postedBy=userId;}
        entry.audit.push({actorId:userId,action:payload.action,reason:payload.reason,createdAt:"2026-10-12T17:01:00Z"});data={id:10};
      }else throw new Error(`Unexpected dummy write ${url.pathname}`);
    }else{
      assert.equal(req.method(),"GET");
      if(url.pathname==="/api/auth/setup-required")data={required:false};
      else if(url.pathname==="/api/auth/csrf")data={token:"loopback-dummy-csrf-only"};
      else if(url.pathname==="/api/auth/me")data={id:userId,name:"QA Owner",email:"ui-only@example.test",role:"super_admin",branchId:1,accessProfile:{source:"modern",authorityLevel:"super_admin",jobFunction:"general_staff",workspaces:[],errors:[]}};
      else if(url.pathname==="/api/branches")data=branches;
      else if(url.pathname==="/api/notifications"||url.pathname==="/api/workflow-notifications")data={notifications:[],unreadCount:0};
      else if(url.pathname==="/api/settings")data={};
      else if(url.pathname==="/api/accounting/catalog")data=inactive?{status:"inactive",books:[]}:{status:"active",books:branches.filter(b=>active==="all"||String(b.id)===active).map(b=>({...book,branchId:b.id,branchName:b.name}))};
      else if(url.pathname.endsWith("/manual")){if(fail){status=500;data={error:"Dummy queue unavailable"};}else data={book,branchId:Number(branch),permissions:["configure","prepare","post","reverse"],accounts,accountReviewComplete:true,journals:branch==="1"&&entry?[entry]:[],truncated:false};}
      else if(url.pathname.endsWith("/manual/10"))data=entry;
    }
    if(url.pathname.includes("/accounting/")&&delay)await new Promise(done=>setTimeout(done,delay));
    try{await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});}catch(e){if(!req.failure()&&!page.isClosed())throw e;}
  });
  async function setup(){await page.goto(`${origin}/accounting/manual-journals`);await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByLabel("Journal branch",{exact:true}).selectOption("1");await page.getByRole("button",{name:"Prepare adjustment",exact:true}).waitFor();}
  await setup();await page.getByRole("button",{name:"Prepare adjustment",exact:true}).click();
  await page.getByLabel("Narration",{exact:true}).fill("Dummy reviewed depreciation");await page.getByLabel("Adjustment purpose / evidence",{exact:true}).fill("Dummy asset adjustment purpose");
  await page.getByLabel("Reviewed calculation / supporting schedule",{exact:true}).fill("Dummy reviewed schedule 12 x 0.01");await page.getByLabel("Evidence references (one per line)",{exact:true}).fill("Dummy retained asset schedule v1");
  const lines=page.locator("fieldset");await lines.nth(0).getByLabel("Line 1 Account",{exact:true}).selectOption("1");await lines.nth(1).getByLabel("Line 2 Account",{exact:true}).selectOption("2");
  assert.equal(await lines.nth(0).locator("option").filter({hasText:"Dummy protected bank"}).count(),0,"Protected bank is never offered as a freehand account");
  await page.getByLabel("Line 1 debit",{exact:true}).fill("0.12");await page.getByLabel("Line 2 credit",{exact:true}).fill("0.12");
  await page.getByRole("button",{name:"Save draft",exact:true}).click();await page.getByRole("alert").filter({hasText:"Dummy interrupted response"}).waitFor();
  await page.getByRole("button",{name:"Save draft",exact:true}).click();await page.getByRole("heading",{name:"Manual Journal #10",exact:true}).waitFor();
  assert.equal(writes[0].payload.requestId,writes[1].payload.requestId,"Response retries preserve stable request identity");
  await page.getByRole("button",{name:"Submit for review",exact:true}).click();await page.getByLabel("Required reason / review evidence",{exact:true}).fill("Dummy exact preparer submission");await page.getByRole("button",{name:"Confirm submit",exact:true}).click();
  await page.getByText(/submitted \| Preparer #1/).waitFor();assert.equal(await page.getByRole("button",{name:"Approve and Post",exact:true}).count(),0,"Preparer cannot self approve");
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();await page.screenshot({path:resolve(out,"manual-desktop.png"),fullPage:true});
  userId=2;await setup();await page.getByRole("button",{name:"Journal #10",exact:true}).click();await page.getByRole("button",{name:"Approve and Post",exact:true}).click();
  await page.getByLabel("Required reason / review evidence",{exact:true}).fill("Dummy independent reviewed exact posting");await page.getByRole("button",{name:"Confirm post",exact:true}).click();await page.getByText(/posted \| Preparer #1 \| Poster #2/).waitFor();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>{const d=document.querySelector('[role="dialog"]')?.getBoundingClientRect();return !!d&&d.x>=0&&d.right<=innerWidth+1;});
  await page.screenshot({path:resolve(out,"manual-mobile-dialog.png"),fullPage:true});
  const bounds=await page.getByRole("dialog").boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391,`Mobile dialog must stay inside viewport: ${JSON.stringify(bounds)}; ${await page.getByRole("dialog").evaluate(el=>JSON.stringify({width:getComputedStyle(el).width,maxWidth:getComputedStyle(el).maxWidth,minWidth:getComputedStyle(el).minWidth,classes:el.className}))}`);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"No mobile page overflow");
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();delay=650;
  await page.getByRole("button",{name:"Refresh queue",exact:true}).click();await page.getByRole("status").filter({hasText:"Refreshing the same branch"}).waitFor();assert.equal(await page.getByRole("button",{name:"Journal #10",exact:true}).count(),1);
  await page.getByRole("status").filter({hasText:"Refreshing the same branch"}).waitFor({state:"hidden"});await page.getByLabel("Journal branch",{exact:true}).selectOption("2");
  assert.equal(await page.getByRole("button",{name:"Journal #10",exact:true}).count(),0,"Old branch journal disappears immediately");
  await page.getByText("No manual adjustments recorded in this branch.",{exact:true}).waitFor();await page.screenshot({path:resolve(out,"manual-mobile.png"),fullPage:true});
  delay=0;inactive=true;await page.reload();await page.getByRole("status").filter({hasText:"Official native accounting is inactive"}).waitFor();assert.equal(await page.getByRole("button",{name:"Prepare adjustment",exact:true}).count(),0);
  inactive=false;fail=true;await page.reload();await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByLabel("Journal branch",{exact:true}).selectOption("1");await page.getByRole("alert").filter({hasText:"Dummy queue unavailable"}).waitFor();
  assert.deepEqual(errors,[]);console.log("PASS: built loopback manual prepare/stable retry/submit/independent post/evidence/audit, protected account exclusion, desktop/mobile accessible dialogs, branch isolation, refresh/OFF/error; dummy writes only");
}catch(error){console.error("UI errors:",errors);if(page&&!page.isClosed())console.error("UI text:",await page.locator("body").innerText());throw error;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
