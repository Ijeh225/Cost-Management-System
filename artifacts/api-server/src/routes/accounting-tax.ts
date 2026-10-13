import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { getBranchScope, requireFinanceAccess, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { AccountingError, requireAccounting, requireAccountingEnabled } from "../lib/accounting-rules.js";
import { taxConfigurationSchema } from "../lib/accounting-tax.js";
import { NativeAccounting } from "../lib/native-accounting.js";

export const accountingTaxRouter=Router();const engine=new NativeAccounting(pool);
const path="/accounting/books/:bookId/tax-configuration";
const id=z.number().int().positive().refine(Number.isSafeInteger),pathId=z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
const ref=z.string().trim().min(1).max(300),code=z.string().regex(/^[A-Z][A-Z0-9_-]{0,19}$/);
const source=z.discriminatedUnion("kind",[
  z.object({kind:z.literal("duty_reversal"),id,evidence:ref}).strict(),
  z.object({kind:z.enum(["duty_payment","container_payment"]),id,evidence:ref,configurationId:id,taxCode:code,basis:z.enum(["inclusive","exclusive"]),taxAmount:z.string(),settlementAccountId:id}).strict(),
  z.object({kind:z.literal("invoice"),id,evidence:ref,configurationId:id,taxCode:code,recognitionDate:z.string(),receivableAccountId:id,incomeAccountId:id,
    items:z.array(z.object({itemId:id,code}).strict()).min(1).max(150).optional()}).strict(),
]);
function scope(req:AuthRequest,report=false) {
  const parsed=z.object({branchId:pathId.optional(),...(report?{from:z.string(),to:z.string()}: {})}).strict().parse(req.query);
  const active=getBranchScope(req),selected=parsed.branchId??active;
  requireAccounting(typeof selected==="number"&&(active===null||active===selected)&&userCanAccessBranch(req,selected),"FORBIDDEN","Select one authorised accounting branch");
  return selected;
}
function failed(res:import("express").Response,error:unknown) {
  if(error instanceof z.ZodError)return res.status(400).json({error:"Invalid tax configuration request",code:"INVALID_REQUEST"});
  if(error instanceof AccountingError)return res.status(error.code==="FORBIDDEN"?403:error.code==="NOT_FOUND"?404:error.code==="ACCOUNTING_DISABLED"?503:400).json({error:error.message,code:error.code});
  console.error("[tax configuration]",error);return res.status(500).json({error:"Unable to complete tax configuration",code:"ACCOUNTING_UNAVAILABLE"});
}
accountingTaxRouter.use(path,requireFinanceAccess,(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
accountingTaxRouter.get(path,async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.taxWorkspace(pathId.parse(req.params.bookId),scope(req),req.user!.id));}catch(e){return failed(res,e);}
});
accountingTaxRouter.post(path,async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.prepareTaxConfiguration(pathId.parse(req.params.bookId),scope(req),req.user!.id,taxConfigurationSchema.parse(req.body)));}catch(e){return failed(res,e);}
});
accountingTaxRouter.post(path+"/:configurationId/action",async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();const body=z.object({action:z.enum(["approve","reject","cancel"]),reason:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
    return res.json(await engine.taxConfigurationAction(pathId.parse(req.params.bookId),scope(req),req.user!.id,pathId.parse(req.params.configurationId),body.action,body.reason));}catch(e){return failed(res,e);}
});
accountingTaxRouter.get(path+"/sources/:kind/:sourceId",async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.configuredSource(pathId.parse(req.params.bookId),scope(req),req.user!.id,
    z.enum(["invoice","duty_payment","container_payment"]).parse(req.params.kind),pathId.parse(req.params.sourceId)));}catch(e){return failed(res,e);}
});
for(const action of ["preview","prepare"] as const)accountingTaxRouter.post(path+"/sources/"+action,async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.reviewConfiguredSource(pathId.parse(req.params.bookId),scope(req),req.user!.id,source.parse(req.body),action==="prepare"));}catch(e){return failed(res,e);}
});
accountingTaxRouter.post(path+"/journals/:journalId/post",async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();const body=z.object({reason:z.string().trim().min(1).max(2000)}).strict().parse(req.body);
    return res.json(await engine.postConfiguredSource(pathId.parse(req.params.bookId),scope(req),req.user!.id,pathId.parse(req.params.journalId),body.reason));}catch(e){return failed(res,e);}
});
accountingTaxRouter.get(path+"/journals/:journalId",async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();return res.json(await engine.configuredJournal(pathId.parse(req.params.bookId),scope(req),req.user!.id,pathId.parse(req.params.journalId)));}catch(e){return failed(res,e);}
});
accountingTaxRouter.get(path+"/register",async(req:AuthRequest,res)=>{
  try{requireAccountingEnabled();const branch=scope(req,true);
    return res.json(await engine.taxRegister(pathId.parse(req.params.bookId),branch,req.user!.id,String(req.query.from),String(req.query.to)));}catch(e){return failed(res,e);}
});
