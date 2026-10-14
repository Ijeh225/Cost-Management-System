import { Router } from "express";
import { z } from "zod";
import { pool } from "@workspace/db";
import { getBranchScope, requireFinanceAccess, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { AccountingError, accountingEnabled, requireAccounting } from "../lib/accounting-rules.js";
import { NativeAccounting } from "../lib/native-accounting.js";

export const accountingReportsRouter = Router();
const engine = new NativeAccounting(pool);
const id = z.string().regex(/^[1-9]\d*$/).transform(Number).refine(Number.isSafeInteger);
const baseQuery = z.object({branchId:z.union([z.literal("all"),id]).optional()}).strict();
const reportQuery = baseQuery.extend({from:z.string(),to:z.string(),accountId:id.optional(),periodId:id.optional(),
  includeZero:z.enum(["true","false"]).default("true"),includeInactive:z.enum(["true","false"]).default("false")});
function scope(req:AuthRequest,requested:number|"all"|undefined) {
  const active=getBranchScope(req);
  if(requested===undefined) return active;
  const branch=requested==="all" ? null : requested;
  requireAccounting(active===null || active===branch,"FORBIDDEN","Report branch must match your active authorised branch");
  requireAccounting(branch===null || userCanAccessBranch(req,branch),"FORBIDDEN","Branch is not authorised");
  return branch;
}
function failed(res:import("express").Response,error:unknown) {
  if(error instanceof z.ZodError) return res.status(400).json({error:"Invalid accounting report filters",code:"INVALID_FILTER"});
  if(error instanceof AccountingError) return res.status(error.code==="FORBIDDEN" ? 403 : error.code==="NOT_FOUND" ? 404
    : error.code==="ACCOUNTING_DISABLED" ? 503 : error.code==="REPORT_TOO_LARGE" ? 413 : 400).json({error:error.message,code:error.code});
  console.error("[accounting reports]",error);
  return res.status(500).json({error:"Unable to read accounting report",code:"REPORT_UNAVAILABLE"});
}
accountingReportsRouter.use("/accounting",requireFinanceAccess,(_req,res,next)=>{res.setHeader("Cache-Control","no-store");next();});
accountingReportsRouter.get("/accounting/catalog",async(req:AuthRequest,res)=>{
  try {
    const branch=scope(req,baseQuery.parse(req.query).branchId);
    if(!accountingEnabled()) return res.json({status:"inactive",books:[],message:"Official native accounting is inactive pending approved rules, opening balances and cutover. Existing cash reports are unchanged."});
    return res.json(await engine.reportCatalog(req.user!.id,branch));
  } catch(error){return failed(res,error);}
});
accountingReportsRouter.get("/accounting/books/:bookId/options",async(req:AuthRequest,res)=>{
  try {return res.json(await engine.reportOptions(id.parse(req.params.bookId),scope(req,baseQuery.parse(req.query).branchId),req.user!.id));}
  catch(error){return failed(res,error);}
});
accountingReportsRouter.get("/accounting/books/:bookId/reports/:kind",async(req:AuthRequest,res)=>{
  try {
    const query=reportQuery.parse(req.query),kind=z.enum(["general-ledger","trial-balance","balance-sheet","management-accounts"]).parse(req.params.kind);
    return res.json(await engine.accountingReport(id.parse(req.params.bookId),scope(req,query.branchId),req.user!.id,kind,
      {from:query.from,to:query.to,accountId:query.accountId,periodId:query.periodId,includeZero:query.includeZero==="true",includeInactive:query.includeInactive==="true"}));
  } catch(error){return failed(res,error);}
});
accountingReportsRouter.get("/accounting/books/:bookId/journals/:journalId",async(req:AuthRequest,res)=>{
  try {return res.json(await engine.reportJournal(id.parse(req.params.bookId),scope(req,baseQuery.parse(req.query).branchId),req.user!.id,id.parse(req.params.journalId)));}
  catch(error){return failed(res,error);}
});
