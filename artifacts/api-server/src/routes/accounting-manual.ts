import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { getBranchScope, requireFinanceAccess, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { AccountingError, requireAccounting, requireAccountingEnabled } from "../lib/accounting-rules.js";
import { ADJUSTMENT_TYPES } from "../lib/accounting-manual.js";
import { NativeAccounting } from "../lib/native-accounting.js";

export const accountingManualRouter=Router();
const engine=new NativeAccounting(pool);
const positive=z.number().int().positive().refine(Number.isSafeInteger);
const id=z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
const query=z.object({branchId:id.optional()}).strict();
const line=z.object({accountId:positive,debit:z.string(),credit:z.string(),memo:z.string().max(1000).optional()}).strict();
const prepare=z.object({requestId:z.string(),accountingDate:z.string(),narration:z.string(),evidence:z.string(),adjustmentType:z.enum(ADJUSTMENT_TYPES),
  calculationEvidence:z.string(),evidenceReferences:z.array(z.string()),lines:z.array(line).min(2).max(200),replacesJournalId:positive.optional()}).strict();
const evidence=z.string().trim().min(1).max(4000);
function branch(req:AuthRequest) {
  const requested=query.parse(req.query).branchId,active=getBranchScope(req),chosen=requested??active;
  requireAccounting(typeof chosen==="number" && (active===null || active===chosen) && userCanAccessBranch(req,chosen),"FORBIDDEN","Select one authorised branch; manual writes never use All Branches");
  return chosen;
}
function failed(res:import("express").Response,error:unknown) {
  if(error instanceof z.ZodError) return res.status(400).json({error:"Invalid manual journal request",code:"INVALID_REQUEST"});
  if(error instanceof AccountingError) return res.status(error.code==="FORBIDDEN" ? 403 : error.code==="NOT_FOUND" ? 404 : error.code==="ACCOUNTING_DISABLED" ? 503 : 400).json({error:error.message,code:error.code});
  console.error("[manual accounting]",error);
  return res.status(500).json({error:"Unable to complete manual accounting request",code:"ACCOUNTING_UNAVAILABLE"});
}
accountingManualRouter.use("/accounting/books/:bookId/manual",requireFinanceAccess,(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
accountingManualRouter.get("/accounting/books/:bookId/manual",async(req:AuthRequest,res)=>{
  try{return res.json(await engine.manualWorkspace(id.parse(req.params.bookId),branch(req),req.user!.id));}catch(error){return failed(res,error);}
});
accountingManualRouter.get("/accounting/books/:bookId/manual/:journalId",async(req:AuthRequest,res)=>{
  try{return res.json(await engine.manualDetails(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.journalId)));}catch(error){return failed(res,error);}
});
accountingManualRouter.post("/accounting/books/:bookId/manual",async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();const result=await engine.prepareManual(id.parse(req.params.bookId),branch(req),req.user!.id,prepare.parse(req.body));return res.json({id:result.id});}catch(error){return failed(res,error);}
});
accountingManualRouter.post("/accounting/books/:bookId/manual/accounts/review",async(req:AuthRequest,res)=>{
  try {
    requireAccountingEnabled();branch(req);
    const body=z.object({ownerEvidence:evidence.max(1000),accountantEvidence:evidence.max(1000),accounts:z.array(z.object({accountId:positive,role:z.enum(["adjustment","protected"])}).strict()).min(2).max(1000)}).strict().parse(req.body);
    return res.json(await engine.reviewManualAccounts(id.parse(req.params.bookId),req.user!.id,body));
  }catch(error){return failed(res,error);}
});
accountingManualRouter.post("/accounting/books/:bookId/manual/:journalId/action",async(req:AuthRequest,res)=>{
  try {
    requireAccountingEnabled();const body=z.object({action:z.enum(["submit","reject","post","cancel"]),reason:evidence}).strict().parse(req.body);
    const result=await engine.manualAction(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.journalId),body.action,body.reason);return res.json({id:result.id});
  }catch(error){return failed(res,error);}
});
accountingManualRouter.post("/accounting/books/:bookId/manual/:journalId/reversal",async(req:AuthRequest,res)=>{
  try {
    requireAccountingEnabled();const body=z.object({date:z.string(),reason:evidence}).strict().parse(req.body);
    const result=await engine.prepareManualReversal(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.journalId),body.date,body.reason);return res.json({id:result.id});
  }catch(error){return failed(res,error);}
});
