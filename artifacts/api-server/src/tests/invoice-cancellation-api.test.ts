import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({authSelect:vi.fn(),transaction:vi.fn(),select:vi.fn(),execute:vi.fn(),update:vi.fn(),insert:vi.fn()}));
vi.mock("@workspace/db",async()=>({...await import("../../../../lib/db/src/schema/index.js"),db:{select:mocks.authSelect,transaction:mocks.transaction}}));
import {invoicesRouter,formatInvoice} from "../routes/invoices.js";
import {signToken,createCsrfToken} from "../lib/auth.js";
const user={id:1,isActive:true,sessionToken:'cancel-unit',branchId:2,email:'fixture@example.test',name:'QA owner',
  authorityLevel:'super_admin',jobFunction:'general_staff',workspaceAccess:'[]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',invoicesRouter);
const cancel=()=>request(app).post('/api/invoices/19/cancel').set('Cookie',`cost_analysis_session=${signToken(1,user.sessionToken)}`)
  .set('X-CSRF-Token',createCsrfToken(user.sessionToken)).set('X-Branch-Id','2');
let invoice:Record<string,unknown>,payments:{amount:string}[],order:string[];
beforeEach(()=>{
  vi.clearAllMocks();order=[];invoice={id:19,branchId:2,status:'sent',invoiceNumber:'TEST-19'};payments=[];
  mocks.authSelect.mockImplementation(()=>({from:()=>({where:()=>({limit:async()=>[user]})})}));
  mocks.transaction.mockImplementation(async action=>action(mocks));
  mocks.select.mockImplementation(selection=>({from:()=>({where:()=>selection?Promise.resolve(payments):{
    for:async(lock:string)=>{order.push(lock);return [invoice];}}})}));
  mocks.execute.mockImplementation(async()=>{order.push('native');return {rows:[{relation:'accounting_journals',retained:false}]};});
  mocks.update.mockImplementation(()=>({set:(fields:Record<string,unknown>)=>({where:async()=>{order.push('write');Object.assign(invoice,fields);}})}));
  mocks.insert.mockImplementation(()=>({values:async()=>{order.push('audit');}}));
});
describe('actual invoice cancellation route',()=>{
  it.each(['cancelled','written_off'])('displays zero collectible balance for %s while preserving original value',async status=>{
    const result=await formatInvoice({...invoice,status,total:'0.01'},[]);
    expect(result.outstanding).toBe(0);expect(result.total).toBe(0.01);expect(result.status).toBe(status);
  });
  it('retains draft estimates and active unpaid balances',async()=>{
    for(const status of ['draft','sent'])expect((await formatInvoice({...invoice,status,total:'0.01'},[])).outstanding).toBe(0.01);
  });
  it('refuses retained recognition before any operational cancellation or audit',async()=>{
    mocks.execute.mockResolvedValueOnce({rows:[{relation:'accounting_journals'}]}).mockResolvedValueOnce({rows:[{retained:true}]});
    const r=await cancel().send({});
    expect(r.status).toBe(409);expect(r.body.error).toContain('native accounting');
    expect(order[0]).toBe('update');expect(invoice.status).toBe('sent');expect(mocks.update).not.toHaveBeenCalled();expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('preserves ordinary unpaid cancellation within one row-locked transaction',async()=>{
    const r=await cancel().send({});
    expect(r.status).toBe(200);expect(invoice.status).toBe('cancelled');expect(order).toEqual(['update','native','native','write','audit']);
  });
  it('allows inactive installations with no native schema',async()=>{
    mocks.execute.mockResolvedValue({rows:[{relation:null}]});
    const r=await cancel().send({});
    expect(r.status).toBe(200);expect(mocks.execute).toHaveBeenCalledOnce();
  });
  it('keeps payment and invoice-state restrictions',async()=>{
    payments=[{amount:'1.00'}];
    expect((await cancel().send({})).status).toBe(400);
    invoice.status='draft';
    expect((await cancel().send({})).status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('retains real auth/CSRF/branch restrictions',async()=>{
    expect((await request(app).post('/api/invoices/19/cancel').send({})).status).toBe(401);
    expect((await cancel().set('X-CSRF-Token','invalid').send({})).status).toBe(403);
    expect((await cancel().set('X-Branch-Id','3').send({})).status).toBe(404);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
