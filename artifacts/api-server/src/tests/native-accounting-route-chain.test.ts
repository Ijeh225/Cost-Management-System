import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({select:vi.fn(),read:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),db:{select:mocks.select},pool:{connect:vi.fn()}}));
vi.mock("../lib/native-accounting.js",()=>({NativeAccounting:class{
  reportCatalog=mocks.read;reportOptions=mocks.read;accountingReport=mocks.read;reportJournal=mocks.read;
  openingWorkspace=mocks.read;manualWorkspace=mocks.read;taxWorkspace=mocks.read;affairsWorkspace=mocks.read;
}}));
import * as tables from "@workspace/db";
import router from "../routes/index.js";
import {signToken} from "../lib/auth.js";
const app=express();app.use(express.json());app.use(cookieParser());app.use("/api",router);
const base={id:15,isActive:true,branchId:2,sessionToken:"route-chain-dummy",authorityLevel:"staff",jobFunction:"accounts",workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
let operations=false;
beforeEach(()=>{vi.clearAllMocks();process.env.NATIVE_ACCOUNTING_ENABLED="true";operations=false;mocks.read.mockResolvedValue({ok:true});
 mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable?[{...base,jobFunction:operations?"operations":"accounts",workspaceAccess:operations?'["shipping"]':'["accounts"]'}]:table===tables.settingsTable?[]:[{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));});
const cookie=()=>`cost_analysis_session=${signToken(base.id,base.sessionToken)}`;
const paths=["/accounting/catalog","/accounting/books/1/options?branchId=2","/accounting/books/1/opening-balances?branchId=2",
 "/accounting/books/1/manual?branchId=2","/accounting/books/1/tax-configuration?branchId=2","/accounting/books/1/statement-of-affairs?branchId=2",
 "/accounting/books/1/reports/trial-balance?branchId=2&from=2026-10-14&to=2026-10-31"];
describe("Native accounting through the entire real sibling-router chain",()=>{
 it.each(paths)("does not apply AI admin/rollout guards to finance staff route %s",async path=>{const r=await request(app).get("/api"+path).set("Cookie",cookie());expect(r.status).toBe(200);expect(r.body).toEqual({ok:true});expect(mocks.read).toHaveBeenCalled();});
 it("retains AI admin restrictions and accounting finance/branch authentication",async()=>{
  expect((await request(app).get("/api/ai-assistant/status").set("Cookie",cookie())).status).toBe(403);
  expect((await request(app).get("/api/accounting/catalog")).status).toBe(401);
  expect((await request(app).get("/api/accounting/books/1/opening-balances?branchId=3").set("Cookie",cookie())).status).toBe(403);
  operations=true;expect((await request(app).get("/api/accounting/catalog").set("Cookie",cookie())).status).toBe(403);
 });
 it("does not apply AI guards to unrelated routes registered after AI",async()=>{expect((await request(app).get("/api/not-a-route").set("Cookie",cookie())).status).toBe(404);expect(mocks.read).not.toHaveBeenCalled();});
});
