import { z } from "zod";
import type { JournalInput } from "./accounting-rules.js";
import type { SettlementMapping } from "./accounting-source-mapping.js";
import type { OperationalMapping } from "./accounting-operational-mapping.js";

export const SOURCE_REVIEW_KINDS = ["client_deposit", "invoice_payment", "credit_note", "client_credit_application",
  "invoice_writeoff", "overhead", "overhead_topup", "expense_payment", "schedule_payment", "bank_funding", "bank_transfer"] as const;
export type SourceReviewKind = typeof SOURCE_REVIEW_KINDS[number];
const id = z.number().int().positive().refine(Number.isSafeInteger);
const text = z.string().trim().min(1).max(300);
const money = z.string().regex(/^\d+(\.\d{1,2})?$/);
const category = z.enum(["asset", "liability", "equity", "income", "expense"]);
const bankAccounts = z.record(z.string().regex(/^[1-9]\d*$/), id).refine(v => Object.keys(v).length <= 2);
const common = { currency: z.literal("NGN"), policyVersion: text, evidence: text };
const settlement = z.object({ ...common, bankAccounts, cashAccountId: id.optional(), receivableAccountId: id, depositLiabilityAccountId: id }).strict();
const operational = z.object({ ...common,
  effect: z.enum(["expense", "asset", "advance", "loan_repayment", "other_non_expense", "equity_funding", "loan_funding", "asset_funding",
    "income_funding", "liability_funding", "overhead", "credit_note", "client_credit", "writeoff", "transfer"]),
  accountId: id.optional(), accountCategory: category.optional(), controlAccountId: id.optional(), receivableAccountId: id.optional(),
  clientCreditAccountId: id.optional(), bankAccounts: bankAccounts.optional(), cashAccountId: id.optional(),
  recognitionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), recognitionEvidence: text.optional(),
  reductions: z.array(z.object({ accountId: id, amount: money, category: z.enum(["income", "liability"]), evidence: text }).strict()).max(50).optional(),
  vatAccountId: id.optional(), vatReduction: money.optional(), vatEvidence: text.optional(),
}).strict();
export const sourceReviewRequestSchema = z.object({
  requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/),
  source: z.object({ kind: z.enum(SOURCE_REVIEW_KINDS), id }).strict(),
  mapping: z.union([settlement, operational]), replacesReviewId: id.optional(),
}).strict().superRefine((r, ctx) => {
  const receipt = r.source.kind === "client_deposit" || r.source.kind === "invoice_payment";
  if (receipt === ("effect" in r.mapping)) ctx.addIssue({code: "custom", path: ["mapping"], message: "Use the existing source family's explicit mapping"});
});
export type SourceReviewRequest = z.infer<typeof sourceReviewRequestSchema>;
export type SourceReviewPayload = { request: SourceReviewRequest; input: JournalInput; cashMovement: string; originalId: number | null };
export type SourceReviewMapping = SettlementMapping | OperationalMapping;
