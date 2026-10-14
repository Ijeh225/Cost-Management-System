import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { getBranchScope, requireFinanceAccess, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { AccountingError, requireAccounting, requireAccountingEnabled } from "../lib/accounting-rules.js";
import { affairsRequestSchema } from "../lib/accounting-affairs.js";
import { NativeAccounting } from "../lib/native-accounting.js";
export const accountingAffairsRouter=Router();
const engine=new NativeAccounting(pool);
const id=z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
function branch(req:AuthRequest) {
  const active=getBranchScope(req),selected=z.object({branchId:id.optional()}).strict().parse(req.query).branchId??active;
  requireAccounting(typeof selected==="number"&&(active===null||active===selected)&&userCanAccessBranch(req,selected),"FORBIDDEN","Select one authorised valuation branch; no All Branches writes");
  return selected;
}
function failed(res:import("express").Response,error:unknown) {
  if(error instanceof z.ZodError)return res.status(400).json({error:"Invalid valuation schedule request",code:"INVALID_REQUEST"});
  if(error instanceof AccountingError)return res.status(error.code==="FORBIDDEN"?403:error.code==="NOT_FOUND"?404:error.code==="ACCOUNTING_DISABLED"?503:400).json({error:error.message,code:error.code});
  console.error("[statement of affairs]",error);return res.status(500).json({error:"Unable to complete valuation workflow",code:"ACCOUNTING_UNAVAILABLE"});
}
const path="/accounting/books/:bookId/statement-of-affairs";
accountingAffairsRouter.use(path,requireFinanceAccess,(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
accountingAffairsRouter.get(path,async(req:AuthRequest,res)=>{try{return res.json(await engine.affairsWorkspace(id.parse(req.params.bookId),branch(req),req.user!.id));}catch(e){return failed(res,e);}});
accountingAffairsRouter.get(path+"/:versionId",async(req:AuthRequest,res)=>{try{return res.json(await engine.affairsDetails(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.versionId)));}catch(e){return failed(res,e);}});
accountingAffairsRouter.post(path,async(req:AuthRequest,res)=>{try{requireAccountingEnabled();return res.json(await engine.prepareAffairs(id.parse(req.params.bookId),branch(req),req.user!.id,affairsRequestSchema.parse(req.body)));}catch(e){return failed(res,e);}});
accountingAffairsRouter.post(path+"/:versionId/action",async(req:AuthRequest,res)=>{try{requireAccountingEnabled();const body=z.object({action:z.enum(["approve","reject","cancel"]),reason:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
  return res.json(await engine.affairsAction(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.versionId),body.action,body.reason));}catch(e){return failed(res,e);}});
