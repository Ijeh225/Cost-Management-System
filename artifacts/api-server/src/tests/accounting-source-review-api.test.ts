import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({select:vi.fn(),connect:vi.fn(),workspace:vi.fn(),preview:vi.fn(),prepare:vi.fn(),details:vi.fn(),action:vi.fn(),candidate:vi.fn()}));
vi.mock('@workspace/db',async()=>({...await import('../../../../lib/db/src/schema/index.js'),db:{select:mocks.select},pool:{connect:mocks.connect}}));
vi.mock('../lib/native-accounting.js',()=>({NativeAccounting:class{sourceReviewWorkspace=mocks.workspace;previewSourceReview=mocks.preview;prepareSourceReview=mocks.prepare;sourceReviewDetails=mocks.details;sourceReviewAction=mocks.action;sourceReviewCandidate=mocks.candidate;}}));
import * as tables from '@workspace/db';
import { accountingSourceReviewRouter } from '../routes/accounting-source-review.js';
import { signToken,createCsrfToken } from '../lib/auth.js';
import { AccountingError } from '../lib/accounting-rules.js';
import { sourceReviewRequestSchema } from '../lib/accounting-source-review.js';
const user={id:12,isActive:true,sessionToken:'source-review-unit',branchId:2,authorityLevel:'staff',jobFunction:'accounts',workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',accountingSourceReviewRouter);
const cookie=`cost_analysis_session=${signToken(user.id,user.sessionToken)}`,url='/api/accounting/books/1/source-review';
const post=(path:string)=>request(app).post(path).set('Cookie',cookie).set('X-CSRF-Token',createCsrfToken(user.sessionToken));
const body={requestId:'source-review-test',source:{kind:'bank_transfer',id:4},mapping:{currency:'NGN',policyVersion:'test-only',evidence:'Voucher',effect:'transfer',bankAccounts:{5:2,6:28}}};
let owner=false,operations=false;
beforeEach(()=>{vi.clearAllMocks();process.env.NATIVE_ACCOUNTING_ENABLED='true';owner=false;operations=false;
  mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable?[{...user,authorityLevel:owner?'super_admin':'staff',jobFunction:operations?'operations':'accounts',workspaceAccess:operations?'["shipping"]':'["accounts"]'}]:[{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));
  mocks.workspace.mockResolvedValue({reviews:[]});mocks.preview.mockResolvedValue({cashMovement:'0.00'});mocks.prepare.mockResolvedValue({id:1,state:'draft'});mocks.details.mockResolvedValue({id:1,state:'submitted'});mocks.action.mockResolvedValue({id:1,state:'posted'});
});
describe('selected source review HTTP controls',()=>{
  it('requires authenticated finance access and actual CSRF before any review write',async()=>{
    expect((await request(app).post(url+'/prepare').send(body)).status).toBe(401);
    expect((await request(app).post(url+'/prepare').set('Cookie',cookie).send(body)).status).toBe(403);
    operations=true;expect((await post(url+'/prepare').send(body)).status).toBe(403);expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('rejects scope ambiguity and hidden source/actor/state injection',async()=>{
    for(const query of ['?branchId=all','?branchId=3','?branchId=2&branchId=2','?unsafe=1'])expect((await post(url+'/prepare'+query).send(body)).status).toBeGreaterThanOrEqual(400);
    for(const add of [{actorId:1},{state:'posted'},{journalId:3},{source:{kind:'invoice',id:4}},{mapping:{...body.mapping,purchaseTax:{}}}])expect((await post(url+'/prepare').send({...body,...add})).status).toBe(400);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it('allows an explicit authorised branch from All without overriding an active branch',async()=>{
    owner=true;expect((await post(url+'/prepare?branchId=3').set('X-Branch-Id','2').send(body)).status).toBe(403);
    expect((await post(url+'/prepare').set('X-Branch-Id','all').send(body)).status).toBe(403);
    expect((await post(url+'/prepare?branchId=3').set('X-Branch-Id','all').send(body)).status).toBe(200);expect(mocks.prepare).toHaveBeenCalledWith(1,3,12,body);
  });
  it('fails all inactive routes before engine/database calls',async()=>{
    delete process.env.NATIVE_ACCOUNTING_ENABLED;
    for(const path of ['', '/1','/sources/bank_transfer/4'])expect((await request(app).get(url+path).set('Cookie',cookie)).status).toBe(503);
    for(const path of ['/preview','/prepare','/1/action'])expect((await post(url+path).send({})).status).toBe(503);
    for(const fn of [mocks.connect,mocks.workspace,mocks.preview,mocks.prepare,mocks.details,mocks.action,mocks.candidate])expect(fn).not.toHaveBeenCalled();
  });
  it('retains no-store, read-only preview and separately scoped audited decisions',async()=>{
    const preview=await post(url+'/preview').send(body);expect(preview.body.cashMovement).toBe('0.00');expect(preview.headers['cache-control']).toBe('no-store');expect(mocks.prepare).not.toHaveBeenCalled();
    expect((await request(app).get(url+'/1').set('Cookie',cookie)).body.state).toBe('submitted');expect(mocks.details).toHaveBeenCalledWith(1,2,12,1);
    expect((await post(url+'/1/action').send({action:'post',reason:'Independently reviewed'})).status).toBe(200);expect(mocks.action).toHaveBeenCalledWith(1,2,12,1,'post','Independently reviewed');
    expect((await post(url+'/1/action').send({action:'post',reason:'Reviewed',reviewedBy:12})).status).toBe(400);
    mocks.action.mockRejectedValue(new AccountingError('FORBIDDEN','Different reviewer required'));expect((await post(url+'/1/action').send({action:'post',reason:'Self'})).status).toBe(403);
  });
  it('validates all eleven supported families without permitting direct-tax bypass or unsafe mapping identity',()=>{
    for(const kind of ['credit_note','client_credit_application','invoice_writeoff','overhead','overhead_topup','expense_payment','schedule_payment','bank_funding','bank_transfer'])expect(sourceReviewRequestSchema.safeParse({...body,source:{kind,id:4}}).success).toBe(true);
    const receipt={currency:'NGN',policyVersion:'test-only',evidence:'Voucher',bankAccounts:{},receivableAccountId:3,depositLiabilityAccountId:9};
    for(const kind of ['client_deposit','invoice_payment']){
      expect(sourceReviewRequestSchema.safeParse({...body,source:{kind,id:4},mapping:receipt}).success).toBe(true);
      expect(sourceReviewRequestSchema.safeParse({...body,source:{kind,id:4}}).success).toBe(false);
    }
    for(const kind of ['invoice','duty_payment','container_payment','duty_reversal'])expect(sourceReviewRequestSchema.safeParse({...body,source:{kind,id:4}}).success).toBe(false);
    expect(sourceReviewRequestSchema.safeParse({...body,mapping:{...body.mapping,bankAccounts:{5:2,6:28,7:30}}}).success).toBe(false);
    expect(sourceReviewRequestSchema.safeParse({...body,mapping:{...body.mapping,bankAccounts:{0:2}}}).success).toBe(false);
  });
  it('looks up older exact source IDs without cross-family tax or branch leakage',async()=>{
    mocks.candidate.mockResolvedValue({id:4,kind:'bank_transfer',journalStatus:'posted'});
    const r=await request(app).get(url+'/sources/bank_transfer/4').set('Cookie',cookie);expect(r.status).toBe(200);expect(mocks.candidate).toHaveBeenCalledWith(1,2,12,'bank_transfer',4);
    expect((await request(app).get(url+'/sources/duty_payment/4').set('Cookie',cookie)).status).toBe(400);
    expect((await request(app).get(url+'/sources/bank_transfer/4?branchId=3').set('Cookie',cookie)).status).toBe(403);
  });
});
