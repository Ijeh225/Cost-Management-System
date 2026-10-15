import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { beforeEach,describe,expect,it,vi } from 'vitest';
const mocks=vi.hoisted(()=>({select:vi.fn(),query:vi.fn(),record:vi.fn()}));
vi.mock('@workspace/db',async()=>({...await import('../../../../lib/db/src/schema/index.js'),db:{select:mocks.select},pool:{query:mocks.query}}));
vi.mock('../lib/invoice-debt-recovery.js',async()=>({...await vi.importActual('../lib/invoice-debt-recovery.js'),recordDebtRecovery:mocks.record}));
import * as tables from '@workspace/db';
import { invoiceDebtRecoveryRouter } from '../routes/invoice-debt-recovery.js';
import { signToken,createCsrfToken } from '../lib/auth.js';
import { AccountingError } from '../lib/accounting-rules.js';
const user={id:15,isActive:true,sessionToken:'debt-recovery-unit',branchId:2,authorityLevel:'staff',jobFunction:'accounts',workspaceAccess:'["accounts"]',accessProfileMigratedAt:new Date()};
const app=express();app.use(express.json());app.use(cookieParser());app.use('/api',invoiceDebtRecoveryRouter);
const cookie=`cost_analysis_session=${signToken(user.id,user.sessionToken)}`,url='/api/invoices/23/recoveries';
let operations=false;
beforeEach(()=>{vi.clearAllMocks();operations=false;
  mocks.select.mockImplementation(()=>({from:(table:unknown)=>({where:()=>{const rows=table===tables.usersTable?[{...user,jobFunction:operations?'operations':'accounts',workspaceAccess:operations?'["shipping"]':'["accounts"]'}]:[{isActive:true}];return Object.assign(Promise.resolve(rows),{limit:async()=>rows});}})}));
  mocks.query.mockResolvedValue({rows:[{branch_id:2}]});mocks.record.mockResolvedValue({id:8,replayed:false});
});
const body={amount:'0.25',bankId:5,date:'2026-10-15',reference:'UNIT-RECOVERY',reason:'Controlled test',requestId:'unit-recovery-001'};
const post=(path=url)=>request(app).post(path).set('Cookie',cookie).set('X-CSRF-Token',createCsrfToken(user.sessionToken)).set('X-Branch-Id','2');
describe('written-off debt recovery HTTP controls',()=>{
  it('requires finance authentication and CSRF before recording or exposing history',async()=>{
    expect((await request(app).post(url).send(body)).status).toBe(401);
    expect((await request(app).post(url).set('Cookie',cookie).send(body)).status).toBe(403);
    operations=true;expect((await post().send(body)).status).toBe(403);expect((await request(app).get(url).set('Cookie',cookie)).status).toBe(403);
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('rejects foreign scope, unknown fields and invalid amount without recording',async()=>{
    mocks.query.mockResolvedValueOnce({rows:[{branch_id:3}]});
    expect((await post().send(body)).status).toBe(404);
    for(const changes of [{amount:'0'},{amount:'-1'},{amount:'1.001'},{amount:1},{posted:true},{bankId:null},{requestId:'bad'}]) {
      const result=await post().send({...body,...changes});expect(result.status).toBe(400);
    }
    expect(mocks.record).not.toHaveBeenCalled();
  });
  it('delegates existing source identity and actual authenticated actor without posting journals',async()=>{
    const result=await post().send(body);expect(result.status).toBe(201);expect(result.body).toEqual({id:8,replayed:false});
    expect(mocks.record).toHaveBeenCalledWith(expect.anything(),23,2,15,body,undefined);
  });
  it('requires administrator authority for linked recovery reversal',async()=>{
    expect((await post(url+'/8/reverse').send(body)).status).toBe(403);expect(mocks.record).not.toHaveBeenCalled();
  });
  it('returns safe conflict errors and no-store reads',async()=>{
    mocks.record.mockRejectedValue(new AccountingError('DUPLICATE_REFERENCE','Reference already exists'));
    expect((await post().send(body)).status).toBe(409);
    expect((await request(app).get(url).set('Cookie',cookie)).headers['cache-control']).toBe('no-store');
  });
});
