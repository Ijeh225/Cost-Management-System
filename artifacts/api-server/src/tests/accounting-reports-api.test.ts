import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({select:vi.fn(),connect:vi.fn(),catalog:vi.fn(),options:vi.fn(),report:vi.fn(),journal:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),db:{select:mocks.select},pool:{connect:mocks.connect}}));
vi.mock("../lib/native-accounting.js",()=>({NativeAccounting:class{reportCatalog=mocks.catalog;reportOptions=mocks.options;accountingReport=mocks.report;reportJournal=mocks.journal;}}));
import * as tables from "@workspace/db";
import { accountingReportsRouter } from "../routes/accounting-reports.js";
import { signToken } from "../lib/auth.js";
import { AccountingError } from "../lib/accounting-rules.js";
const user={id:12,isActive:true,sessionToken:"native-report-unit",branchId:2,authorityLevel:"staff",jobFunction:"accounts",workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use("/api",accountingReportsRouter);
const cookie=`cost_analysis_session=${signToken(user.id,user.sessionToken)}`;
const url="/api/accounting/books/1/reports/trial-balance?from=2026-10-01&to=2026-10-11";
let operations=false,owner=false;
beforeEach(()=>{
  vi.clearAllMocks();delete process.env.NATIVE_ACCOUNTING_ENABLED;operations=false;owner=false;
  mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable ? [{...user,authorityLevel:owner?"super_admin":"staff",jobFunction:operations?"operations":"accounts",workspaceAccess:operations?'["shipping"]':'["accounts"]'}] : [{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));
  mocks.catalog.mockResolvedValue({status:"active",books:[]});mocks.options.mockResolvedValue({accounts:[],periods:[]});mocks.report.mockResolvedValue({basis:"posted_double_entry"});mocks.journal.mockResolvedValue({id:1});
});
describe("Step8 public read-only route boundary",()=>{
  it("requires current authenticated finance access",async()=>{
    expect((await request(app).get(url)).status).toBe(401);operations=true;
    expect((await request(app).get(url).set("Cookie",cookie)).status).toBe(403);expect(mocks.report).not.toHaveBeenCalled();
  });
  it("inactive catalog never reads native tables or calls the engine",async()=>{
    const r=await request(app).get("/api/accounting/catalog").set("Cookie",cookie);
    expect(r.status).toBe(200);expect(r.body).toMatchObject({status:"inactive",books:[]});expect(r.headers["cache-control"]).toBe("no-store");
    expect(mocks.catalog).not.toHaveBeenCalled();expect(mocks.connect).not.toHaveBeenCalled();
  });
  it("passes owned branch and exact filters, never trusts a forged all-branch query",async()=>{
    expect((await request(app).get(url+"&branchId=all").set("Cookie",cookie)).status).toBe(403);
    expect((await request(app).get(url+"&branchId=3").set("Cookie",cookie)).status).toBe(403);
    expect((await request(app).get(url).set("Cookie",cookie).set("X-Branch-Id","3")).status).toBe(200);
    expect(mocks.report).toHaveBeenCalledWith(1,2,12,"trial-balance",{from:"2026-10-01",to:"2026-10-11",accountId:undefined,periodId:undefined,includeZero:true,includeInactive:false});
  });
  it("selected super-admin scope cannot be widened through query and All is one engine book",async()=>{
    owner=true;expect((await request(app).get(url+"&branchId=all").set("Cookie",cookie).set("X-Branch-Id","2")).status).toBe(403);
    expect((await request(app).get(url+"&branchId=all").set("Cookie",cookie).set("X-Branch-Id","all")).status).toBe(200);
    expect(mocks.report.mock.calls.at(-1)?.slice(0,4)).toEqual([1,null,12,"trial-balance"]);
  });
  it("strictly rejects repeated/unknown/invalid filters and unsupported reports",async()=>{
    for(const target of [url+"&includeZero=0",url+"&accountId=1.5",url+"&periodId=-1",url+"&branchId=all&branchId=2",url+"&unsafe=true",url.replace("/books/1/","/books/0/"),url.replace("trial-balance","cashflow")])
      expect((await request(app).get(target).set("Cookie",cookie)).status).toBe(400);
  });
  it("retains native grant/disabled/size errors and supports no write endpoint",async()=>{
    mocks.report.mockRejectedValue(new AccountingError("FORBIDDEN","Explicit read grant required"));expect((await request(app).get(url).set("Cookie",cookie)).status).toBe(403);
    mocks.report.mockRejectedValue(new AccountingError("ACCOUNTING_DISABLED","Inactive"));expect((await request(app).get(url).set("Cookie",cookie)).status).toBe(503);
    mocks.report.mockRejectedValue(new AccountingError("REPORT_TOO_LARGE","Narrow scope"));expect((await request(app).get(url).set("Cookie",cookie)).status).toBe(413);
    expect((await request(app).post("/api/accounting/books/1/journals").set("Cookie",cookie)).status).not.toBe(200);
  });
  it("scopes options/journal ID, hides unrelated journals and exposes no raw server error",async()=>{
    expect((await request(app).get("/api/accounting/books/1/options").set("Cookie",cookie)).status).toBe(200);
    expect(mocks.options).toHaveBeenCalledWith(1,2,12);
    expect((await request(app).get("/api/accounting/books/1/journals/5").set("Cookie",cookie)).status).toBe(200);expect(mocks.journal).toHaveBeenCalledWith(1,2,12,5);
    mocks.journal.mockRejectedValue(new AccountingError("NOT_FOUND","Posted journal not found"));expect((await request(app).get("/api/accounting/books/1/journals/5").set("Cookie",cookie)).status).toBe(404);
  });
});
