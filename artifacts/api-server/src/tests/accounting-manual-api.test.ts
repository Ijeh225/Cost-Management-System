import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({select:vi.fn(),connect:vi.fn(),workspace:vi.fn(),details:vi.fn(),prepare:vi.fn(),review:vi.fn(),action:vi.fn(),reversal:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),db:{select:mocks.select},pool:{connect:mocks.connect}}));
vi.mock("../lib/native-accounting.js",()=>({NativeAccounting:class{manualWorkspace=mocks.workspace;manualDetails=mocks.details;prepareManual=mocks.prepare;reviewManualAccounts=mocks.review;manualAction=mocks.action;prepareManualReversal=mocks.reversal;}}));
import * as tables from "@workspace/db";
import { accountingManualRouter } from "../routes/accounting-manual.js";
import { signToken,createCsrfToken } from "../lib/auth.js";
import { AccountingError } from "../lib/accounting-rules.js";
const user={id:12,isActive:true,sessionToken:"manual-unit",branchId:2,authorityLevel:"staff",jobFunction:"accounts",workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use("/api",accountingManualRouter);
const cookie=`cost_analysis_session=${signToken(user.id,user.sessionToken)}`,url="/api/accounting/books/1/manual";
const post=(target:string)=>request(app).post(target).set("Cookie",cookie).set("X-CSRF-Token",createCsrfToken(user.sessionToken));
const body={requestId:"dummy_only_123",accountingDate:"2026-10-12",narration:"Dummy adjustment",evidence:"Dummy purpose",adjustmentType:"correction",
  calculationEvidence:"Dummy reviewed schedule",evidenceReferences:["Dummy reference"],lines:[{accountId:1,debit:"1",credit:"0"},{accountId:2,debit:"0",credit:"1"}]};
let owner=false,operations=false;
beforeEach(()=>{
  vi.clearAllMocks();process.env.NATIVE_ACCOUNTING_ENABLED="true";owner=false;operations=false;
  mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable?[{...user,authorityLevel:owner?"super_admin":"staff",jobFunction:operations?"operations":"accounts",workspaceAccess:operations?'["shipping"]':'["accounts"]'}]:[{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));
  mocks.workspace.mockResolvedValue({journals:[]});mocks.details.mockResolvedValue({id:4});mocks.prepare.mockResolvedValue({id:4,payload_hash:"not public"});mocks.action.mockResolvedValue({id:4});mocks.reversal.mockResolvedValue({id:5});mocks.review.mockResolvedValue({reviewed:true});
});
describe("Step9 public manual route controls",()=>{
  it("rejects unauthenticated and non-finance staff before any native access",async()=>{
    expect((await request(app).post(url).send(body)).status).toBe(401);operations=true;
    expect((await post(url).send(body)).status).toBe(403);expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("rejects widened, all, repeated, unknown and malformed branch/body scope",async()=>{
    for(const suffix of ["?branchId=all","?branchId=3","?branchId=2&branchId=2","?unsafe=1"])
      expect((await post(url+suffix).send(body)).status).toBeGreaterThanOrEqual(400);
    for(const change of [{bookId:3},{postedBy:12},{adjustmentType:"opening"},{lines:[{accountId:0,debit:"1",credit:"0"}]},{evidenceReferences:"bad"}])
      expect((await post(url).send({...body,...change})).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("respects selected owner branch and allows an explicit single branch from All",async()=>{
    owner=true;
    expect((await post(url+"?branchId=3").set("X-Branch-Id","2").send(body)).status).toBe(403);
    expect((await post(url).set("X-Branch-Id","all").send(body)).status).toBe(403);
    const result=await post(url+"?branchId=3").set("X-Branch-Id","all").send(body);
    expect(result.status).toBe(200);expect(result.body).toEqual({id:4});expect(mocks.prepare).toHaveBeenCalledWith(1,3,12,body);
  });
  it("has explicit disabled gates before every mutating engine call",async()=>{
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    for(const target of [url,url+"/accounts/review",url+"/4/action",url+"/4/reversal"])
      expect((await post(target).send({})).status).toBe(503);
    for(const fn of [mocks.prepare,mocks.review,mocks.action,mocks.reversal,mocks.connect])expect(fn).not.toHaveBeenCalled();
  });
  it("retains native named grant/state errors and only exposes controlled result IDs",async()=>{
    mocks.action.mockRejectedValue(new AccountingError("FORBIDDEN","Named post grant required"));
    expect((await post(url+"/4/action").send({action:"post",reason:"Dummy"})).status).toBe(403);
    mocks.action.mockRejectedValue(new AccountingError("REVIEW_REQUIRED","Submit first"));expect((await post(url+"/4/action").send({action:"post",reason:"Dummy"})).status).toBe(400);
    expect((await post(url+"/4/action").send({action:"delete",reason:"Dummy"})).status).toBe(400);
    expect((await post(url+"/4/reversal").send({date:"2026-10-13",reason:"Dummy"})).body).toEqual({id:5});
    expect(mocks.reversal).toHaveBeenCalledWith(1,2,12,4,"2026-10-13","Dummy");
  });
  it("reads scoped details without caching and requires strict action evidence",async()=>{
    const result=await request(app).get(url+"/4").set("Cookie",cookie);expect(result.status).toBe(200);expect(result.headers["cache-control"]).toBe("no-store");expect(mocks.details).toHaveBeenCalledWith(1,2,12,4);
    expect((await post(url+"/4/action").send({action:"reject",reason:" "})).status).toBe(400);
    mocks.details.mockRejectedValue(new AccountingError("NOT_FOUND","Unrelated journal"));expect((await request(app).get(url+"/4").set("Cookie",cookie)).status).toBe(404);
  });
});
