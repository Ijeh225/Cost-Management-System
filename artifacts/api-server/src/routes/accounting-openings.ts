import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { getBranchScope, requireFinanceAccess, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { AccountingError, requireAccounting, requireAccountingEnabled } from "../lib/accounting-rules.js";
import { NativeAccounting } from "../lib/native-accounting.js";

export const accountingOpeningsRouter = Router();
const engine = new NativeAccounting(pool);
const id = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
const query = z.object({branchId:id.optional()}).strict();
const evidence = z.string().trim().min(1).max(500);
const request = z.object({requestId:z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),cutoverDate:z.string(),policyVersion:evidence,
  ownerEvidence:evidence,accountantEvidence:evidence,sourceCoverageEvidence:evidence,
  balances:z.array(z.object({accountId:z.number().int().positive().refine(Number.isSafeInteger),debit:z.string(),credit:z.string(),evidence}).strict()).min(1).max(200)}).strict();
function branch(req:AuthRequest) {
  const active = getBranchScope(req), selected = query.parse(req.query).branchId ?? active;
  requireAccounting(typeof selected === "number" && (active === null || active === selected) && userCanAccessBranch(req,selected),
    "FORBIDDEN","Select one authorised opening branch; writes cannot use All Branches");
  return selected;
}
function failed(res:import("express").Response,error:unknown) {
  if(error instanceof z.ZodError) return res.status(400).json({error:"Invalid opening request",code:"INVALID_REQUEST"});
  if(error instanceof AccountingError) return res.status(error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "ACCOUNTING_DISABLED" ? 503 : 400).json({error:error.message,code:error.code});
  console.error("[opening setup]",error);
  return res.status(500).json({error:"Unable to complete opening setup",code:"ACCOUNTING_UNAVAILABLE"});
}
const path = "/accounting/books/:bookId/opening-balances";
accountingOpeningsRouter.use(path,requireFinanceAccess,(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
accountingOpeningsRouter.get(path,async(req:AuthRequest,res)=>{
  try {return res.json(await engine.openingWorkspace(id.parse(req.params.bookId),branch(req),req.user!.id));} catch(error){return failed(res,error);}
});
accountingOpeningsRouter.get(path+"/:openingId",async(req:AuthRequest,res)=>{
  try {return res.json(await engine.openingDetails(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.openingId)));} catch(error){return failed(res,error);}
});
accountingOpeningsRouter.post(path+"/preview",async(req:AuthRequest,res)=>{
  try {requireAccountingEnabled();return res.json(await engine.previewOpeningSetup(id.parse(req.params.bookId),branch(req),req.user!.id,request.parse(req.body)));} catch(error){return failed(res,error);}
});
accountingOpeningsRouter.post(path,async(req:AuthRequest,res)=>{
  try {requireAccountingEnabled();return res.json(await engine.prepareOpeningSetup(id.parse(req.params.bookId),branch(req),req.user!.id,request.parse(req.body)));} catch(error){return failed(res,error);}
});
accountingOpeningsRouter.post(path+"/:openingId/action",async(req:AuthRequest,res)=>{
  try {
    requireAccountingEnabled();const body=z.object({action:z.enum(["verify","reject","cancel"]),reason:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
    return res.json(await engine.openingAction(id.parse(req.params.bookId),branch(req),req.user!.id,id.parse(req.params.openingId),body.action,body.reason));
  } catch(error){return failed(res,error);}
});
