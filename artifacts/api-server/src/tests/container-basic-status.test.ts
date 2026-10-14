import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({select:vi.fn(),update:vi.fn(),insert:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),
  db:{select:mocks.select,update:mocks.update,insert:mocks.insert}}));
vi.mock("../lib/auth.js",async()=>({...await vi.importActual<typeof import("../lib/auth.js")>("../lib/auth.js"),
  requireAuth:(req:import("../lib/auth.js").AuthRequest,_res:unknown,next:()=>void)=>{
    req.user={id:1,branchId:2,role:"super_admin",roles:["super_admin"],email:"fixture@example.test",name:"QA owner",
      sectionPermission:null,sectionPermissions:null,authorityLevel:"super_admin",jobFunction:"general_staff",workspaceAccess:"[]",
      accessProfileMigratedAt:new Date(),canUpload:false,
      accessProfile:{source:"modern",authorityLevel:"super_admin",jobFunction:"general_staff",workspaces:[],errors:[]}};
    next();
  }}));
import {containersRouter} from "../routes/containers.js";
const app=express();app.use(express.json());app.use("/api",containersRouter);
const readyDate=new Date("2026-10-14T12:00:00Z");
let existing:Record<string,unknown>;
beforeEach(()=>{
  vi.clearAllMocks();existing={id:37,branchId:2,status:"shipping",isLocked:false,
    paarNumber:null,paarReleasedAt:null,transireReleasedAt:null,doReleasedAt:null,tdoReleasedAt:null,pulloutReleasedAt:null};
  mocks.select.mockImplementation(()=>({from:()=>({where:async()=>[existing]})}));
  mocks.update.mockImplementation(()=>({set:(fields:Record<string,unknown>)=>({where:()=>({returning:async()=>[{...existing,...fields}]})})}));
  mocks.insert.mockImplementation(()=>({values:async()=>undefined}));
});
describe("Basic-edit route cannot bypass the final-workflow prerequisites",()=>{
  it.each(["gate_in","examination","final_release","delivery","closed"])("refuses %s for an unfinished job even for owner",async status=>{
    const r=await request(app).put("/api/containers/37").set("X-Branch-Id","2").send({status,vessel:"Must not partially save"});
    expect(r.status).toBe(409);expect(r.body.missingStages).toContain("Documentation / PAAR");
    expect(mocks.update).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("permits administrator navigation after all required departments submitted",async()=>{
    existing={...existing,paarNumber:"QA-PAAR",paarReleasedAt:readyDate,transireReleasedAt:readyDate,doReleasedAt:readyDate,tdoReleasedAt:readyDate,pulloutReleasedAt:readyDate};
    const r=await request(app).put("/api/containers/37").set("X-Branch-Id","2").send({status:"closed"});
    expect(r.status).toBe(200);expect(r.body.status).toBe("closed");expect(mocks.insert).toHaveBeenCalledOnce();
  });
  it("preserves ordinary basic edits and existing-status metadata updates",async()=>{
    existing.status="closed";
    const r=await request(app).put("/api/containers/37").set("X-Branch-Id","2").send({status:"closed",vessel:"QA vessel"});
    expect(r.status).toBe(200);expect(r.body.vessel).toBe("QA vessel");
  });
});
