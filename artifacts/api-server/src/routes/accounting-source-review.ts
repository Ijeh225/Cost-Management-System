import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { getBranchScope, requireFinanceAccess, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { AccountingError, requireAccounting, requireAccountingEnabled } from "../lib/accounting-rules.js";
import { sourceReviewRequestSchema,SOURCE_REVIEW_KINDS } from "../lib/accounting-source-review.js";
import { NativeAccounting } from "../lib/native-accounting.js";

export const accountingSourceReviewRouter=Router();
const engine=new NativeAccounting(pool),path="/accounting/books/:bookId/source-review";
const id=z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
function scope(req:AuthRequest) {
  const parsed=z.object({branchId:id.optional()}).strict().parse(req.query);
  const active=getBranchScope(req),branch=parsed.branchId??active;
  requireAccounting(typeof branch==='number'&&(active===null||active===branch)&&userCanAccessBranch(req,branch),"FORBIDDEN","Select one authorised accounting branch");
  return branch;
}
function failed(res:import("express").Response,error:unknown) {
  if(error instanceof z.ZodError)return res.status(400).json({error:"Invalid transaction review request",code:"INVALID_REQUEST"});
  if(error instanceof AccountingError)return res.status(error.code==='FORBIDDEN'?403:error.code==='NOT_FOUND'?404:error.code==='ACCOUNTING_DISABLED'?503:400).json({error:error.message,code:error.code});
  console.error("[source review]",error);return res.status(500).json({error:"Unable to complete transaction review",code:"ACCOUNTING_UNAVAILABLE"});
}
accountingSourceReviewRouter.use(path,requireFinanceAccess,(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
accountingSourceReviewRouter.get(path,async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.sourceReviewWorkspace(id.parse(req.params.bookId),scope(req),req.user!.id));}catch(e){return failed(res,e);}
});
for(const action of ['preview','prepare'] as const)accountingSourceReviewRouter.post(path+'/'+action,async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();const request=sourceReviewRequestSchema.parse(req.body);
    return res.json(await engine[action==='preview'?'previewSourceReview':'prepareSourceReview'](id.parse(req.params.bookId),scope(req),req.user!.id,request));}catch(e){return failed(res,e);}
});
accountingSourceReviewRouter.get(path+'/:reviewId',async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.sourceReviewDetails(id.parse(req.params.bookId),scope(req),req.user!.id,id.parse(req.params.reviewId)));}catch(e){return failed(res,e);}
});
accountingSourceReviewRouter.get(path+'/sources/:kind/:sourceId',async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.sourceReviewCandidate(id.parse(req.params.bookId),scope(req),req.user!.id,z.enum(SOURCE_REVIEW_KINDS).parse(req.params.kind),id.parse(req.params.sourceId)));}catch(e){return failed(res,e);}
});
accountingSourceReviewRouter.post(path+'/:reviewId/action',async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();const request=z.object({action:z.enum(['submit','return','post','cancel']),reason:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
    return res.json(await engine.sourceReviewAction(id.parse(req.params.bookId),scope(req),req.user!.id,id.parse(req.params.reviewId),request.action,request.reason));}catch(e){return failed(res,e);}
});
