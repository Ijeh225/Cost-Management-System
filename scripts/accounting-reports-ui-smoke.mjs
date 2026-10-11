// Built UI with loopback-only, read-only dummy responses. Never hits production or a database.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir,readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname,resolve,sep } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath=process.env.PLAYWRIGHT_MODULE_PATH??process.argv[2];
const {chromium}=await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const {buildAccountingReport}=createRequire(import.meta.url)("../artifacts/api-server/dist/accounting-foundation.cjs");
const root=resolve(import.meta.dirname,"../artifacts/cost-analysis/dist/public"),out=resolve(import.meta.dirname,"../tmp/step8-ui");
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,"http://localhost").pathname,file=path.startsWith("/assets/") ? resolve(root,`.${path}`) : resolve(root,"index.html");
  if(!file.startsWith(`${root}${sep}`)) {res.writeHead(403).end();return;}
  try{res.setHeader("Content-Type",({".js":"text/javascript",".css":"text/css",".html":"text/html"})[extname(file)]??"application/octet-stream");res.end(await readFile(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,"127.0.0.1",done));
const origin=`http://127.0.0.1:${server.address().port}`;
const branches=[{id:1,name:"QA Head Office",isActive:true},{id:2,name:"QA Lagos",isActive:true}];
const book={id:1,name:"Dummy Reviewed Book",currency:"NGN",cutoverDate:"2026-10-01",policyVersion:"UI-only-not-approval"};
const accounts=[{id:1,code:"1000",name:"Dummy Cash",category:"asset",active:true},{id:2,code:"2100",name:"Dummy Deposits",category:"liability",active:false}];
const fact=(id,accountId,debitMinor,creditMinor,branchId,date)=>({id,accountId,journalId:Math.ceil(id/2),branchId,date,status:"posted",kind:"standard",eventKey:`manual:dummy:${Math.ceil(id/2)}`,narration:"Dummy source fixture",memo:"UI only",debitMinor,creditMinor});
const facts=[fact(1,1,"10000","0",1,"2026-10-02"),fact(2,2,"0","10000",1,"2026-10-02"),fact(3,1,"2500","0",1,"2026-10-10"),fact(4,2,"0","2500",1,"2026-10-10"),fact(5,1,"720","0",2,"2026-10-10"),fact(6,2,"0","720",2,"2026-10-10")];
let browser,page,inactive=false,fail=false,delay=0;
const errors=[],requested=[];
try{
  browser=await chromium.launch({headless:true,channel:"chrome"});page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  page.on("pageerror",e=>errors.push(e.message));page.on("console",m=>{if(/Missing.*Description|aria-describedby|PageErrorBoundary/.test(m.text())) errors.push(m.text());});
  await page.route("**/*",async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin){await route.abort();return;}
    if(!url.pathname.startsWith("/api/")){await route.continue();return;}
    assert.equal(req.method(),"GET","Built reports must never send a write request");
    const active=req.headers()["x-branch-id"]??"all",branch=url.searchParams.get("branchId")??active;
    requested.push({path:url.pathname,active,branch});
    let data=[],status=200;
    if(url.pathname==="/api/auth/setup-required") data={required:false};
    else if(url.pathname==="/api/auth/me") data={id:1,name:"QA Owner",email:"ui-only@example.test",role:"super_admin",branchId:1,accessProfile:{source:"modern",authorityLevel:"super_admin",jobFunction:"general_staff",workspaces:[],errors:[]}};
    else if(url.pathname==="/api/branches") data=branches;
    else if(url.pathname==="/api/notifications"||url.pathname==="/api/workflow-notifications") data={notifications:[],unreadCount:0};
    else if(url.pathname==="/api/settings") data={};
    else if(url.pathname==="/api/accounting/catalog") data=inactive?{status:"inactive",books:[],message:"Dummy inactive state: official accounting remains off"}:{status:"active",books:branches.filter(b=>active==="all"||String(b.id)===active).map(b=>({...book,branchId:b.id,branchName:b.name}))};
    else if(url.pathname.endsWith("/options")) data={book,accounts,branches:branches.filter(b=>branch==="all"||String(b.id)===branch),periods:[{id:1,name:"October",from:"2026-10-01",to:"2026-10-31",status:"closed"}]};
    else if(url.pathname.includes("/journals/")) data={id:Number(url.pathname.split("/").at(-1)),branchId:1,date:"2026-10-10",eventKey:"manual:dummy:2",kind:"standard",narration:"Dummy source fixture",evidence:"Dummy original source and independent approval; not a real transaction",reversalOf:null,postedAt:"2026-10-10T12:00:00Z",preparedBy:2,postedBy:3,lines:[{code:"1000",name:"Dummy Cash",memo:"Dummy",debit:"25.00",credit:"0.00"},{code:"2100",name:"Dummy Deposits",memo:"Dummy",debit:"0.00",credit:"25.00"}]};
    else if(url.pathname.includes("/reports/")){
      if(fail){status=500;data={error:"Dummy report unavailable"};} else {
        const kind=url.pathname.split("/").at(-1),filter={from:url.searchParams.get("from"),to:url.searchParams.get("to"),accountId:Number(url.searchParams.get("accountId"))||undefined,periodId:Number(url.searchParams.get("periodId"))||undefined,includeZero:url.searchParams.get("includeZero")==="true",includeInactive:url.searchParams.get("includeInactive")==="true"};
        data={...buildAccountingReport(accounts,facts.filter(f=>branch==="all"||String(f.branchId)===branch),filter,kind),book,branches:branches.filter(b=>branch==="all"||String(b.id)===branch),scope:branch==="all"?"whole_book":"branch",asOf:filter.to,generatedAt:"2026-10-11T21:00:00Z",warnings:["Dummy source review remains incomplete","Equality is not source completeness"],sourceCompletenessConfirmed:false,limit:50000,truncated:false,coverage:[{branchId:1,counts:{missing:1},exceptionCount:1,exceptionsTruncated:false,missingControlAccountIds:[1,2],independentControlsVerified:false,exceptions:[{eventKey:"source:dummy:9:v1",kind:"dummy",id:9,date:"2026-10-10",status:"missing",reason:"Not posted - UI only"}]}]};
      }
    }
    if(url.pathname.startsWith("/api/accounting/")&&delay) await new Promise(done=>setTimeout(done,delay));
    try{await route.fulfill({status,contentType:"application/json",body:JSON.stringify(data)});}catch(e){if(!req.failure()&&!page.isClosed()) throw e;}
  });
  const setup=async(kind="trial-balance")=>{
    await page.goto(`${origin}/accounting/${kind}?bookId=1&from=2026-10-10&to=2026-10-11`);
    await page.getByLabel("Accounting period",{exact:true}).selectOption("");
    await page.getByRole("button",{name:"Apply Filters",exact:true}).click();
    await page.locator("#native-accounting-report").waitFor();
  };
  await setup();
  assert.match(await page.locator("#native-accounting-report").innerText(),/132\.20/);
  assert.match(await page.locator("#native-accounting-report").innerText(),/Not independently confirmed/);
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export Snapshot CSV"}).click();
  const csv=await download;const csvPath=resolve(out,"trial-balance.csv");await csv.saveAs(csvPath);
  const text=await readFile(csvPath,"utf8");assert.match(text,/"132\.20"/);assert.match(text,/Dummy source review remains incomplete/);assert.match(text,/source:dummy:9:v1/);
  await page.screenshot({path:resolve(out,"trial-balance-desktop.png"),fullPage:true});
  console.log("PASS built TB / exact snapshot CSV / visible source warnings");
  await page.getByRole("link",{name:"View account ledger"}).first().click();
  await page.getByRole("button",{name:"Apply Filters",exact:true}).click();await page.locator("#native-accounting-report").waitFor();
  assert.match(await page.locator("#native-accounting-report").innerText(),/132\.20/);
  await page.getByRole("button",{name:"Journal #2",exact:true}).click();await page.getByRole("heading",{name:"Posted Journal #2"}).waitFor();
  await page.getByText("Original source / review evidence",{exact:true}).click();await page.getByText("Dummy original source and independent approval; not a real transaction",{exact:true}).waitFor();
  await page.getByRole("button",{name:"Close dialog",exact:true}).click();
  await page.emulateMedia({media:"print"});assert.equal(await page.locator("#native-accounting-report").evaluate(el=>getComputedStyle(el).visibility),"visible");
  assert.equal(await page.locator("main").evaluate(el=>getComputedStyle(el).overflow),"visible","Print must escape the scrolling viewport");
  assert.equal(await page.locator("nav[aria-label='Accounting reports']").evaluate(el=>getComputedStyle(el).display),"none");
  await page.pdf({path:resolve(out,"general-ledger-print.pdf"),landscape:true,format:"A4",printBackground:true});await page.emulateMedia({media:"screen"});
  console.log("PASS TB account drilldown / accessible journal/source dialog / snapshot print");
  delay=700;await page.getByRole("combobox").first().click();await page.getByRole("option",{name:"QA Lagos",exact:true}).click();
  assert.equal(await page.locator("#native-accounting-report").count(),0,"Previous branch figures must disappear immediately");
  await page.getByLabel("Accounting book",{exact:true}).selectOption("1");await page.getByRole("button",{name:"Apply Filters",exact:true}).click();await page.locator("#native-accounting-report").waitFor();
  assert.match(await page.locator("#native-accounting-report").innerText(),/7\.20/);assert.doesNotMatch(await page.locator("#native-accounting-report").innerText(),/132\.20/);
  const before=await page.locator("#native-accounting-report").innerText();await page.getByRole("button",{name:"Refresh",exact:true}).click();
  assert.equal(await page.locator("#native-accounting-report").innerText(),before);await page.getByRole("status").filter({hasText:"Refreshing this scope"}).waitFor({state:"hidden"});
  console.log("PASS new-scope old figures hidden / same-scope refresh retains snapshot");
  delay=0;await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,"general-ledger-mobile.png"),fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),"No page-level mobile overflow");
  console.log("PASS mobile layout / horizontal report tables stay inside page");
  inactive=true;await page.reload();await page.getByText("Official Accounting Is Inactive",{exact:true}).waitFor();assert.equal(await page.locator("#native-accounting-report").count(),0);
  console.log("PASS inactive state is not misleading zero accounting totals");
  inactive=false;fail=true;
  await page.goto(`${origin}/accounting/general-ledger?bookId=1&from=2026-10-10&to=2026-10-11`);
  await page.getByLabel("Accounting period",{exact:true}).selectOption("");
  await page.getByRole("button",{name:"Apply Filters",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"Dummy report unavailable"}).waitFor();assert.equal(await page.locator("#native-accounting-report").count(),0);
  assert.ok(requested.some(r=>r.path.includes("/reports/")&&r.active==="2"&&r.branch==="2"));assert.deepEqual(errors,[]);
  console.log("PASS error versus empty / explicit branch headers / GET only / no page or dialog accessibility errors");
} catch(error){console.error("UI errors:",errors);console.error("UI URL:",page?.url());if(page&&!page.isClosed()) console.error("UI text:",await page.locator("body").innerText());throw error;}
finally{await browser?.close();await new Promise(done=>server.close(done));}
