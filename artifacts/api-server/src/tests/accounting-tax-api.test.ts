import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({select:vi.fn(),connect:vi.fn(),workspace:vi.fn(),prepare:vi.fn(),action:vi.fn(),source:vi.fn(),review:vi.fn(),post:vi.fn(),register:vi.fn(),journal:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),db:{select:mocks.select},pool:{connect:mocks.connect}}));
vi.mock("../lib/native-accounting.js",()=>({NativeAccounting:class{taxWorkspace=mocks.workspace;prepareTaxConfiguration=mocks.prepare;taxConfigurationAction=mocks.action;
  configuredSource=mocks.source;reviewConfiguredSource=mocks.review;postConfiguredSource=mocks.post;taxRegister=mocks.register;configuredJournal=mocks.journal;}}));
import * as tables from "@workspace/db";
import { accountingTaxRouter } from "../routes/accounting-tax.js";
import { signToken,createCsrfToken } from "../lib/auth.js";
import { AccountingError } from "../lib/accounting-rules.js";
const user={id:12,isActive:true,sessionToken:"tax-unit",branchId:2,authorityLevel:"staff",jobFunction:"accounts",workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use("/api",accountingTaxRouter);
const cookie=`cost_analysis_session=${signToken(user.id,user.sessionToken)}`,url="/api/accounting/books/1/tax-configuration";
const post=(path:string)=>request(app).post(path).set("Cookie",cookie).set("X-CSRF-Token",createCsrfToken(user.sessionToken));
const body={kind:"duty_payment",id:4,evidence:"Dummy voucher",configurationId:3,taxCode:"STD",basis:"inclusive",taxAmount:"107.50",settlementAccountId:5};
let owner=false,operations=false;
beforeEach(()=>{vi.clearAllMocks();process.env.NATIVE_ACCOUNTING_ENABLED="true";owner=false;operations=false;
  mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable?[{...user,authorityLevel:owner?"super_admin":"staff",jobFunction:operations?"operations":"accounts",workspaceAccess:operations?'["shipping"]':'["accounts"]'}]:[{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));
  mocks.workspace.mockResolvedValue({versions:[]});mocks.review.mockResolvedValue({kind:"preview"});mocks.post.mockResolvedValue({id:4});mocks.source.mockResolvedValue({id:4});mocks.register.mockResolvedValue({rows:[]});mocks.journal.mockResolvedValue({id:4,status:'draft'});
});
describe("VAT/direct expense HTTP boundaries",()=>{
  it("requires authentication, finance access and actual CSRF for writes",async()=>{
    expect((await request(app).post(url+"/sources/prepare").send(body)).status).toBe(401);
    expect((await request(app).post(url+"/sources/prepare").set("Cookie",cookie).send(body)).status).toBe(403);
    operations=true;expect((await post(url+"/sources/prepare").send(body)).status).toBe(403);expect(mocks.review).not.toHaveBeenCalled();
  });
  it("strictly scopes every read/write and disallows hidden reviewer/state injection",async()=>{
    for(const suffix of ["?branchId=all","?branchId=3","?branchId=2&branchId=2","?unsafe=1"])expect((await post(url+"/sources/prepare"+suffix).send(body)).status).toBeGreaterThanOrEqual(400);
    for(const add of [{reviewedBy:12},{state:"posted"},{kind:"schedule_payment"},{id:0},{basis:"unknown"}])expect((await post(url+"/sources/prepare").send({...body,...add})).status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it("honours owner active scope and one authorised explicit branch from All",async()=>{
    owner=true;expect((await post(url+"/sources/prepare?branchId=3").set("X-Branch-Id","2").send(body)).status).toBe(403);
    expect((await post(url+"/sources/prepare").set("X-Branch-Id","all").send(body)).status).toBe(403);
    expect((await post(url+"/sources/prepare?branchId=3").set("X-Branch-Id","all").send(body)).status).toBe(200);expect(mocks.review).toHaveBeenCalledWith(1,3,12,body,true);
  });
  it("fails every inactive route before any engine/database call",async()=>{
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    for(const suffix of ["","/3/action","/sources/preview","/sources/prepare","/journals/4/post"])expect((await post(url+suffix).send({})).status).toBe(503);
    for(const suffix of ["","/sources/duty_payment/4","/journals/4","/register?from=2026-10-01&to=2026-10-13"])expect((await request(app).get(url+suffix).set("Cookie",cookie)).status).toBe(503);
    for(const fn of [mocks.workspace,mocks.prepare,mocks.action,mocks.source,mocks.review,mocks.post,mocks.register,mocks.journal,mocks.connect])expect(fn).not.toHaveBeenCalled();
  });
  it("returns read-only preview and controlled source/post errors",async()=>{
    expect((await post(url+"/sources/preview").send(body)).body.kind).toBe("preview");expect(mocks.review).toHaveBeenCalledWith(1,2,12,body,false);
    mocks.post.mockRejectedValue(new AccountingError("SELF_APPROVAL","Independent posting required"));expect((await post(url+"/journals/4/post").send({reason:"Dummy"})).status).toBe(400);
    expect((await post(url+"/3/action").send({action:"activate",reason:"Dummy"})).status).toBe(400);
  });
  it("keeps no-store and enforces precise supported source IDs/report dates",async()=>{
    const r=await request(app).get(url+"/sources/duty_payment/4").set("Cookie",cookie);expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('no-store');expect(mocks.source).toHaveBeenCalledWith(1,2,12,"duty_payment",4);
    expect((await request(app).get(url+"/sources/expense_payment/4").set("Cookie",cookie)).status).toBe(400);
    expect((await request(app).get(url+"/register?from=2026-10-01").set("Cookie",cookie)).status).toBe(400);
    expect((await request(app).get(url+"/register?from=2026-10-01&to=2026-10-13").set("Cookie",cookie)).status).toBe(200);expect(mocks.register).toHaveBeenCalledWith(1,2,12,"2026-10-01","2026-10-13");
    expect((await request(app).get(url+"/journals/4").set("Cookie",cookie)).body.status).toBe('draft');expect(mocks.journal).toHaveBeenCalledWith(1,2,12,4);
  });
});
