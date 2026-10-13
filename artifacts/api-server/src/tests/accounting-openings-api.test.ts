import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({select:vi.fn(),connect:vi.fn(),workspace:vi.fn(),details:vi.fn(),preview:vi.fn(),prepare:vi.fn(),action:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),db:{select:mocks.select},pool:{connect:mocks.connect}}));
vi.mock("../lib/native-accounting.js",()=>({NativeAccounting:class{openingWorkspace=mocks.workspace;openingDetails=mocks.details;previewOpeningSetup=mocks.preview;prepareOpeningSetup=mocks.prepare;openingAction=mocks.action;}}));
import * as tables from "@workspace/db";
import { accountingOpeningsRouter } from "../routes/accounting-openings.js";
import { signToken,createCsrfToken } from "../lib/auth.js";
import { AccountingError } from "../lib/accounting-rules.js";
const user={id:12,isActive:true,sessionToken:"opening-unit",branchId:2,authorityLevel:"staff",jobFunction:"accounts",workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use("/api",accountingOpeningsRouter);
const cookie=`cost_analysis_session=${signToken(user.id,user.sessionToken)}`,url="/api/accounting/books/1/opening-balances";
const post=(target:string)=>request(app).post(target).set("Cookie",cookie).set("X-CSRF-Token",createCsrfToken(user.sessionToken));
const body={requestId:"dummy_only_123",cutoverDate:"2026-10-01",policyVersion:"dummy",ownerEvidence:"Dummy",accountantEvidence:"Dummy",sourceCoverageEvidence:"Dummy",
  balances:[{accountId:1,debit:"0",credit:"0",evidence:"Explicit dummy zero"}]};
let owner=false,operations=false;
beforeEach(()=>{
  vi.clearAllMocks();process.env.NATIVE_ACCOUNTING_ENABLED="true";owner=false;operations=false;
  mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable?[{...user,authorityLevel:owner?"super_admin":"staff",jobFunction:operations?"operations":"accounts",workspaceAccess:operations?'["shipping"]':'["accounts"]'}]:[{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));
  mocks.workspace.mockResolvedValue({ready:false});mocks.details.mockResolvedValue({id:4});mocks.prepare.mockResolvedValue({id:4});mocks.preview.mockResolvedValue({zero:true,debitTotal:"0.00",creditTotal:"0.00",accountCount:1});mocks.action.mockResolvedValue({id:4});
});
describe("opening setup public controls",()=>{
  it("requires authentication, finance access and real CSRF",async()=>{expect((await request(app).post(url).send(body)).status).toBe(401);expect((await request(app).post(url).set("Cookie",cookie).send(body)).status).toBe(403);operations=true;expect((await post(url).send(body)).status).toBe(403);expect(mocks.prepare).not.toHaveBeenCalled();});
  it("strictly scopes branches and forbids client approver/state injection",async()=>{for(const suffix of ["?branchId=all","?branchId=3","?branchId=2&branchId=2","?unsafe=1"])expect((await post(url+suffix).send(body)).status).toBeGreaterThanOrEqual(400);for(const change of [{reviewedBy:12},{state:"verified"},{balances:[{...body.balances[0],accountId:0}]}])expect((await post(url).send({...body,...change})).status).toBe(400);expect(mocks.prepare).not.toHaveBeenCalled();});
  it("respects selected owner scope while allowing one explicit branch from All",async()=>{owner=true;expect((await post(url+"?branchId=3").set("X-Branch-Id","2").send(body)).status).toBe(403);expect((await post(url).set("X-Branch-Id","all").send(body)).status).toBe(403);expect((await post(url+"?branchId=3").set("X-Branch-Id","all").send(body)).body).toEqual({id:4});expect(mocks.prepare).toHaveBeenCalledWith(1,3,12,body);});
  it("fails inactive previews and writes before any engine call",async()=>{delete process.env.NATIVE_ACCOUNTING_ENABLED;for(const target of [url,url+"/preview",url+"/4/action"])expect((await post(target).send({})).status).toBe(503);for(const fn of [mocks.prepare,mocks.preview,mocks.action,mocks.connect])expect(fn).not.toHaveBeenCalled();});
  it("supports read-only preview and controlled review results/errors",async()=>{expect((await post(url+"/preview").send(body)).body.zero).toBe(true);expect(mocks.prepare).not.toHaveBeenCalled();mocks.action.mockRejectedValue(new AccountingError("SELF_APPROVAL","Independent reviewer required"));expect((await post(url+"/4/action").send({action:"verify",reason:"Dummy review"})).status).toBe(400);expect((await post(url+"/4/action").send({action:"delete",reason:"Dummy"})).status).toBe(400);});
  it("retains no-store and rejects unrelated details",async()=>{const r=await request(app).get(url+"/4").set("Cookie",cookie);expect(r.status).toBe(200);expect(r.headers['cache-control']).toBe('no-store');mocks.details.mockRejectedValue(new AccountingError("NOT_FOUND","Unrelated opening"));expect((await request(app).get(url+"/4").set("Cookie",cookie)).status).toBe(404);});
});
