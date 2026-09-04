import { NextFunction, Response, Router } from "express";
import {
  aiAssistantAuditLogsTable,
  aiAssistantEvaluationCasesTable,
  aiAssistantEvaluationRunsTable,
  aiAssistantActionDraftsTable,
  aiAssistantBriefingsTable,
  aiAssistantReportDraftsTable,
  aiAssistantSessionsTable,
  branchesTable,
  banksTable,
  bankFundAdditionsTable,
  bankTransfersTable,
  containersTable,
  containerDocumentsTable,
  containerTasksTable,
  containerExpensePaymentsTable,
  clientDepositsTable,
  clientsTable,
  customsChargesTable,
  documentIntelligenceIndexTable,
  db,
  expensePaymentsTable,
  invoicePaymentsTable,
  invoicesTable,
  overheadExpensesTable,
  overheadExpenseTopupsTable,
  paymentSchedulesTable,
  paymentScheduleEventsTable,
  settingsTable,
  usersTable,
  workflowNotificationsTable,
} from "@workspace/db";
import { and, desc, eq, gte, ilike, inArray, ne, or } from "drizzle-orm";
import { AuthRequest, getBranchScope, requireAdmin } from "../lib/auth.js";
import { formatProactiveBriefing, generateProactiveBriefing } from "../lib/ai-proactive-intelligence.js";
import { AiProviderUsage, generateEvidenceBasedAnswer, isNaturalLanguageRoutingConfigured, selectToolWithNaturalLanguage } from "../lib/ai-tool-selection.js";
import { AiConversationContext, buildAiConversationContext, parseAiConversationContext, resolveConversationFollowUp } from "../lib/ai-conversation-context.js";
import { isPhysicalTerminalPresenceQuestion, resolveAiOperationalStage } from "../lib/ai-business-definitions.js";
import { understandAiQuestion } from "../lib/ai-question-understanding.js";
import { buildAiInvestigationPlan } from "../lib/ai-investigation-plan.js";
import { buildAiAnswerPresentation } from "../lib/ai-answer-presentation.js";
import { describeDocumentSearchMatch } from "../lib/ai-document-search-match.js";
import { analyseAccountantControls } from "../lib/ai-accountant-intelligence.js";
import { paymentScheduleLookupQuery } from "../lib/ai-payment-schedule-lookup.js";
import { canUseAiAssistantRollout } from "../lib/ai-rollout-policy.js";
import { getOperationalStatusCounts, isContainerPhysicallyInTerminal, operationalStageLabel } from "../lib/operational-definitions.js";
import { hasAuthority, resolveAccessProfile } from "../lib/authorization.js";
import { stageOwnerFor } from "../lib/department-stage-owners.js";
import { isInvoiceFinanciallyActive } from "../lib/invoice-status.js";
import { isWorkflowNotificationVisibleToUser } from "./notifications.js";

export const aiAssistantRouter = Router();

type AiAssistantDataDomain = "dashboard" | "operations" | "documentation" | "containers" | "finance" | "banking" | "reports" | "notifications" | "documents";
type AiAssistantGovernance = {
  accessRoles: Array<"admin" | "super_admin">;
  mode: "read_only";
  dataDomains: AiAssistantDataDomain[];
  monthlyBudgetNgn: number;
  auditRetentionDays: number;
  actionPolicy: "human_confirmation_required";
  providerEnabled: boolean;
  rolloutStage: "super_admin_only" | "selected_admins" | "all_authorized_admins";
  selectedAdminUserIds: number[];
  providerInputCostPerMillionNgn: number;
  providerOutputCostPerMillionNgn: number;
};

const ALLOWED_DOMAINS = new Set<AiAssistantDataDomain>([
  "dashboard", "operations", "documentation", "containers", "finance", "banking", "reports", "notifications", "documents",
]);

const DEFAULT_GOVERNANCE: AiAssistantGovernance = {
  accessRoles: ["admin", "super_admin"],
  mode: "read_only",
  dataDomains: ["dashboard", "operations", "documentation", "containers", "finance", "banking", "reports", "notifications", "documents"],
  monthlyBudgetNgn: 100_000,
  auditRetentionDays: 365,
  actionPolicy: "human_confirmation_required",
  providerEnabled: false,
  rolloutStage: "super_admin_only",
  selectedAdminUserIds: [],
  providerInputCostPerMillionNgn: 0,
  providerOutputCostPerMillionNgn: 0,
};

function parseGovernance(value: string | undefined): AiAssistantGovernance {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<AiAssistantGovernance>;
    if (
      !parsed ||
      parsed.mode !== "read_only" ||
      parsed.actionPolicy !== "human_confirmation_required" ||
      !Array.isArray(parsed.accessRoles) ||
      parsed.accessRoles.length === 0 ||
      !parsed.accessRoles.every((role) => role === "admin" || role === "super_admin") ||
      !Array.isArray(parsed.dataDomains) ||
      parsed.dataDomains.length === 0 ||
      !parsed.dataDomains.every((domain): domain is AiAssistantDataDomain => typeof domain === "string" && ALLOWED_DOMAINS.has(domain)) ||
      !Number.isInteger(parsed.monthlyBudgetNgn) ||
      Number(parsed.monthlyBudgetNgn) < 0 ||
      Number(parsed.monthlyBudgetNgn) > 50_000_000 ||
      !Number.isInteger(parsed.auditRetentionDays) ||
      Number(parsed.auditRetentionDays) < 30 ||
      Number(parsed.auditRetentionDays) > 3650
    ) return DEFAULT_GOVERNANCE;

    const rolloutStage = parsed.rolloutStage === "super_admin_only" || parsed.rolloutStage === "selected_admins" || parsed.rolloutStage === "all_authorized_admins"
      ? parsed.rolloutStage
      // Existing saved configurations predate rollout controls. Preserve their current access.
      : "all_authorized_admins";
    const selectedAdminUserIds = Array.isArray(parsed.selectedAdminUserIds)
      ? [...new Set(parsed.selectedAdminUserIds.map(Number))].filter((id) => Number.isInteger(id) && id > 0)
      : [];
    return {
      accessRoles: [...new Set(parsed.accessRoles)] as AiAssistantGovernance["accessRoles"],
      mode: "read_only",
      dataDomains: [...new Set(parsed.dataDomains)],
      monthlyBudgetNgn: Number(parsed.monthlyBudgetNgn),
      auditRetentionDays: Number(parsed.auditRetentionDays),
      actionPolicy: "human_confirmation_required",
      providerEnabled: typeof parsed.providerEnabled === "boolean" ? parsed.providerEnabled : true,
      rolloutStage,
      selectedAdminUserIds,
      providerInputCostPerMillionNgn: Number.isFinite(Number(parsed.providerInputCostPerMillionNgn)) && Number(parsed.providerInputCostPerMillionNgn) >= 0 ? Number(parsed.providerInputCostPerMillionNgn) : 0,
      providerOutputCostPerMillionNgn: Number.isFinite(Number(parsed.providerOutputCostPerMillionNgn)) && Number(parsed.providerOutputCostPerMillionNgn) >= 0 ? Number(parsed.providerOutputCostPerMillionNgn) : 0,
    };
  } catch {
    return DEFAULT_GOVERNANCE;
  }
}

function providerCostNgn(usages: AiProviderUsage[], governance: AiAssistantGovernance): number {
  return usages.reduce((total, usage) => total + (usage.inputTokens / 1_000_000) * governance.providerInputCostPerMillionNgn + (usage.outputTokens / 1_000_000) * governance.providerOutputCostPerMillionNgn, 0);
}

function parseAuditMetadata(value: string): Record<string, unknown> {
  try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; }
}

function providerUsageTokens(metadata: Record<string, unknown>, field: "inputTokens" | "outputTokens"): number {
  const usages = metadata.providerUsage;
  if (!Array.isArray(usages)) return 0;
  return usages.reduce<number>((total, usage) => {
    if (!usage || typeof usage !== "object" || Array.isArray(usage)) return total;
    const value = Number((usage as Record<string, unknown>)[field]);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
}

async function currentMonthProviderCostNgn(): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await db.select({ metadata: aiAssistantAuditLogsTable.metadata }).from(aiAssistantAuditLogsTable).where(gte(aiAssistantAuditLogsTable.createdAt, monthStart));
  return rows.reduce((total, row) => total + Math.max(0, Number(parseAuditMetadata(row.metadata).estimatedProviderCostNgn) || 0), 0);
}

async function getAiGovernance(): Promise<AiAssistantGovernance> {
  const [setting] = await db.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "aiAssistantGovernance"))
    .limit(1);
  return parseGovernance(setting?.value);
}

async function requireAiAssistantRollout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const governance = await getAiGovernance();
    if (!req.user || !canUseAiAssistantRollout({ userId: req.user.id, role: req.user.role, rolloutStage: governance.rolloutStage, selectedAdminUserIds: governance.selectedAdminUserIds })) {
      return res.status(403).json({ error: "AI Assistant access is not enabled for your account in the current rollout stage." });
    }
    return next();
  } catch (error) {
    console.error("[ai-assistant] Failed to check rollout access", error);
    return res.status(500).json({ error: "Unable to verify AI Assistant access." });
  }
}

aiAssistantRouter.use(requireAdmin, requireAiAssistantRollout);

type RateBucket = { startedAt: number; count: number };
const rateBuckets = new Map<number, RateBucket>();

type AssistantSource = { type: string; id?: number; label: string; href: string };
type AssistantFact = { label: string; value: string | number; detail?: string };
type AssistantRecord = { title: string; detail: string; href: string; badges?: string[] };
type AssistantToolResult = {
  toolId: string;
  title: string;
  generatedAt: string;
  scope: { branchId: number | null; label: string };
  facts: AssistantFact[];
  records: AssistantRecord[];
  sources: AssistantSource[];
  notes: string[];
};

const TOOL_CATALOG = [
  { id: "operations_overview", title: "Operations overview", description: "Count current containers, terminal activity, verification backlog, and current workflow work.", domain: "operations" as const },
  { id: "stage_count", title: "Stage job count", description: "Count active or released jobs for one approved operational stage.", domain: "operations" as const, requiresStage: true },
  { id: "stage_jobs", title: "Stage job list", description: "List active or released jobs for one approved operational stage.", domain: "operations" as const, requiresStage: true },
  { id: "stage_delays", title: "Stage delay review", description: "Find overdue expected dates for one approved operational stage.", domain: "operations" as const, requiresStage: true },
  { id: "overdue_containers", title: "Overdue containers", description: "Find containers past ETA whose vessel berthing is still unconfirmed.", domain: "containers" as const },
  { id: "delayed_jobs", title: "Delayed jobs", description: "Find Transire, Shipping, Terminal, and Pullout jobs whose expected date has passed.", domain: "operations" as const },
  { id: "documentation_checks", title: "Documentation checks", description: "Identify open jobs without a PAAR number and link to their container record.", domain: "documentation" as const },
  { id: "container_lookup", title: "Container investigation", description: "Look up one container by exact container number or ID and inspect its live workflow state.", domain: "containers" as const, requiresContainer: true },
  { id: "container_delay_investigation", title: "Container delay investigation", description: "Run the fixed read-only checks for one exact container: workflow state, documents, and payment history.", domain: "containers" as const, requiresContainer: true },
  { id: "container_documents", title: "Container documents", description: "List every uploaded document attached to one exact container, including files that are not text-searchable.", domain: "documents" as const, requiresContainer: true },
  { id: "container_payment_history", title: "Container payment history", description: "Show recorded container disbursements for one exact container.", domain: "finance" as const, requiresContainer: true },
  { id: "duty_payments_overview", title: "Duty payments overview", description: "Review assessed customs duty, recorded duty payments, and unpaid duty by authorised container.", domain: "finance" as const },
  { id: "invoice_status", title: "Invoice status", description: "Show the total, collections, balance, and linked record for one exact invoice.", domain: "finance" as const, requiresInvoice: true },
  { id: "client_balance", title: "Client balance", description: "Show receivable balance and credit for one authorised client.", domain: "finance" as const, requiresClient: true },
  { id: "client_wallet_overview", title: "Client wallet activity", description: "Review client deposits, allocations, and remaining wallet credit in the authorised branch scope.", domain: "finance" as const },
  { id: "receivables_overview", title: "Receivables overview", description: "Review invoiced, collected, outstanding, and overdue client balances.", domain: "finance" as const },
  { id: "approved_payment_schedules", title: "Approved schedules awaiting payment", description: "Show approved or partially approved payment schedules with an unpaid balance.", domain: "finance" as const },
  { id: "overhead_overview", title: "Overhead expense overview", description: "Review recorded overhead, actual payments, and outstanding overhead balances.", domain: "finance" as const },
  { id: "overhead_statements", title: "Overhead expense statements", description: "Prepare a read-only statement of overhead amounts, top-ups, actual payments, and balances.", domain: "reports" as const },
  { id: "payment_summary", title: "Payment summary", description: "Summarise recorded client collections, deposits, overhead payments, and container disbursements for a reporting period.", domain: "reports" as const },
  { id: "client_statements", title: "Client statements", description: "Prepare read-only client statements of invoices, collections, outstanding balances, and wallet credits.", domain: "reports" as const },
  { id: "branch_performance", title: "Branch performance", description: "Compare scoped branches using container volume, invoices, collections, and outstanding balances.", domain: "reports" as const },
  { id: "document_search", title: "Search uploaded documents", description: "Search readable uploaded documents and return permission-scoped file and page references.", domain: "documents" as const, requiresQuery: true },
  { id: "notifications_summary", title: "Notification summary", description: "Summarise recent workflow notifications in the current authorised branch.", domain: "notifications" as const },
  { id: "monthly_financial_report", title: "Monthly financial report", description: "Prepare a read-only monthly income, collections, expense, and net-cash report from live records.", domain: "reports" as const },
  { id: "receivables_ageing", title: "Receivables ageing", description: "Group unpaid invoice balances by age and show overdue collection priorities.", domain: "finance" as const },
  { id: "bank_ledger_reconciliation", title: "Bank ledger reconciliation", description: "Reconcile recorded bank-ledger inflows, outflows, transfers, and balances. This is not a bank-statement confirmation.", domain: "banking" as const },
  { id: "bank_transfer_activity", title: "Bank transfer activity", description: "List recent recorded transfers between company bank accounts.", domain: "banking" as const },
  { id: "open_job_tasks", title: "Open job tasks", description: "List outstanding operational tasks, their due dates, priority, and linked containers.", domain: "operations" as const },
  { id: "financial_control_review", title: "Financial control review", description: "Find explainable review prompts for possible duplicates, overpayments, unallocated funds, delayed collections, unusual expenses, and incomplete payment controls.", domain: "finance" as const },
] as const;

type ToolId = typeof TOOL_CATALOG[number]["id"];
const TOOL_IDS = new Set<string>(TOOL_CATALOG.map((tool) => tool.id));

type CopilotIntent = { toolId: ToolId; args: Record<string, unknown>; label: string; clarification?: never } | { toolId: null; args: Record<string, never>; label: string; clarification?: string };
type CopilotAnswer = {
  sessionId: number;
  question: string;
  answer: string;
  facts: AssistantFact[];
  calculations: string[];
  findings: string[];
  recordedCauses: string[];
  recommendations: string[];
  limitations: string[];
  evidenceNotice: string;
  evidenceFactLabels: string[];
  evidenceRecordHrefs: string[];
  assumptions: string[];
  citations: AssistantSource[];
  records: AssistantRecord[];
  status: "answered" | "unsupported" | "no_data";
};

const CONTEXT_TTL_MS = 20 * 60 * 1000;

const SUGGESTED_QUESTIONS = [
  "How many containers are currently in the terminal?",
  "Show me all overdue containers.",
  "Which jobs are delayed at the Transire, Shipping, Terminal, or Pullout stage?",
  "Show outstanding invoices and overdue balances.",
  "Show approved payment schedules awaiting payment.",
  "Show overhead expenses that are still outstanding.",
  "Compare branch performance.",
  "Find \"PAAR\" in uploaded documents.",
  "Prepare this month's financial report.",
  "Show receivables ageing and overdue collections.",
  "Run a financial control review for unusual expenses or overpayments.",
  "Show the bank ledger reconciliation.",
  "Show customs duty payments that are still outstanding.",
  "Show client wallet deposits that have not been fully allocated.",
  "Show recent bank transfers.",
  "Show my recent workflow notifications.",
  "Show outstanding job tasks.",
];

function documentSearchQuery(question: string): string {
  const quoted = question.match(/["']([^"']{2,160})["']/);
  if (quoted?.[1]) return quoted[1].trim();
  return question
    .replace(/\b(search|find|show|list|documents?|files?|attachments?|for|in|containing|contains|that|the)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

function documentJobIdentifier(question: string): string | null {
  const candidates = question.toUpperCase().match(/\b[A-Z0-9-]{6,32}\b/g) ?? [];
  return candidates.find((candidate) => /[A-Z]/.test(candidate) && /\d/.test(candidate)) ?? null;
}

function interpretQuestionFallback(question: string): CopilotIntent {
  const understanding = understandAiQuestion(question);
  const normalised = question.trim().toLowerCase();
  const containerMatch = understanding.containerNumber;
  if (isPhysicalTerminalPresenceQuestion(question)) return { toolId: "operations_overview", args: {}, label: "physical terminal presence" };
  const investigationPlan = buildAiInvestigationPlan(understanding);
  if (investigationPlan) {
    return { toolId: "container_delay_investigation", args: { containerNumber: investigationPlan.containerNumber }, label: investigationPlan.title.toLowerCase() };
  }
  if (/\b(documents?|docs?|files?|attachments?)\b/.test(normalised)) {
    const jobIdentifier = containerMatch ?? documentJobIdentifier(question);
    if (jobIdentifier) return { toolId: "container_documents", args: { containerNumber: jobIdentifier }, label: "container documents" };
  }
  if (/(document|file|attachment)/.test(normalised) && /(search|find|contain|mention|show|list)/.test(normalised)) {
    const query = documentSearchQuery(question);
    return query.length >= 2
      ? { toolId: "document_search", args: { query }, label: "uploaded document search" }
      : { toolId: null, args: {}, label: "unsupported question" };
  }
  if (containerMatch && /\b(payment|paid|receipt|transaction|history)\b/.test(normalised)) {
    return { toolId: "container_payment_history", args: { containerNumber: containerMatch }, label: "container payment history" };
  }
  if (containerMatch) {
    return { toolId: "container_lookup", args: { containerNumber: containerMatch }, label: "container investigation" };
  }
  if (understanding.invoiceNumber) return { toolId: "invoice_status", args: { invoiceNumber: understanding.invoiceNumber }, label: "invoice status" };
  if (/(overdue|late).*(container|vessel|berthing)|(container|vessel|berthing).*(overdue|late)/.test(normalised)) return { toolId: "overdue_containers", args: {}, label: "overdue containers" };
  if (/(documentation|paar).*(delay|missing|pending|check)|(delay|missing|pending).*(documentation|paar)/.test(normalised)) return { toolId: "documentation_checks", args: {}, label: "documentation checks" };
  if (/(delay|delayed|late|stalled).*(job|transire|shipping|do|terminal|tdo|pullout)|(job|transire|shipping|do|terminal|tdo|pullout).*(delay|delayed|late|stalled)/.test(normalised)) return { toolId: "delayed_jobs", args: {}, label: "delayed jobs" };
  const stage = understanding.stage ?? resolveAiOperationalStage(question);
  const stageArgs = stage
    ? {
        stage,
        status: understanding.stageStatus,
        ...(understanding.timeframe
          ? { from: understanding.timeframe.from, to: understanding.timeframe.to }
          : {}),
      }
    : null;
  if (stage && understanding.asksForDelays) return { toolId: "stage_delays", args: stageArgs!, label: `${stage} delay review` };
  if (stage && understanding.intent === "count") return { toolId: "stage_count", args: stageArgs!, label: `${stage} job count` };
  if (stage && understanding.intent === "list") return { toolId: "stage_jobs", args: stageArgs!, label: `${stage} jobs` };
  if (/\b(payment summary|payments summary|payment report|payments report)\b/.test(normalised)) return { toolId: "payment_summary", args: {}, label: "payment summary" };
  if (/\b(client statement|client statements)\b/.test(normalised)) return { toolId: "client_statements", args: {}, label: "client statements" };
  if (/\b(overhead statement|overhead statements|expense statement|expense statements)\b/.test(normalised)) return { toolId: "overhead_statements", args: {}, label: "overhead statements" };
  if (/(receivable|invoice|collection).*(ageing|aging)|(ageing|aging).*(receivable|invoice|collection)/.test(normalised)) return { toolId: "receivables_ageing", args: {}, label: "receivables ageing" };
  if (/(duty|customs).*(payment|paid|outstanding|unpaid|assessment)|(payment|paid|outstanding|unpaid|assessment).*(duty|customs)/.test(normalised)) return { toolId: "duty_payments_overview", args: {}, label: "duty payments overview" };
  if (/(wallet|deposit|deposits).*(client|unallocated|allocation|credit)|(client|unallocated|allocation|credit).*(wallet|deposit|deposits)/.test(normalised)) return { toolId: "client_wallet_overview", args: {}, label: "client wallet activity" };
  if (/(outstanding|overdue|receivable|invoice|collected).*(invoice|balance|payment|receivable)|(invoice|balance|payment|receivable).*(outstanding|overdue|receivable|collected)/.test(normalised)) return { toolId: "receivables_overview", args: {}, label: "receivables overview" };
  if (/\b(payment\s+schedule|schedule)\b/.test(normalised)) {
    const query = paymentScheduleLookupQuery(question);
    return { toolId: "approved_payment_schedules", args: query ? { query } : {}, label: query ? "payment schedule lookup" : "approved payment schedules" };
  }
  if (/(overhead|expense).*(outstanding|paid|payment|balance)|(outstanding|paid|payment|balance).*(overhead|expense)/.test(normalised)) return { toolId: "overhead_overview", args: {}, label: "overhead overview" };
  if (/(financial|profit|loss|revenue|cashflow|cash flow).*(report|month|summary)|(report|month|summary).*(financial|profit|loss|revenue|cashflow|cash flow)/.test(normalised)) return { toolId: "monthly_financial_report", args: {}, label: "monthly financial report" };
  if (/(bank|ledger).*(reconciliation|reconcile|balance)|(reconciliation|reconcile).*(bank|ledger)/.test(normalised)) return { toolId: "bank_ledger_reconciliation", args: {}, label: "bank ledger reconciliation" };
  if (/(bank|account).*(transfer|transfers)|(transfer|transfers).*(bank|account)/.test(normalised)) return { toolId: "bank_transfer_activity", args: {}, label: "bank transfer activity" };
  if (/\b(notification|notifications|alert|alerts)\b/.test(normalised)) return { toolId: "notifications_summary", args: {}, label: "notification summary" };
  if (/\b(task|tasks|to[ -]?do|todo)\b/.test(normalised)) return { toolId: "open_job_tasks", args: {}, label: "open job tasks" };
  if (/(control|duplicate|unusual|overpayment|unallocated).*(review|expense|payment|fund|transaction)|(review|expense|payment|fund|transaction).*(control|duplicate|unusual|overpayment|unallocated)/.test(normalised)) return { toolId: "financial_control_review", args: {}, label: "financial control review" };
  if (/(branch|branches).*(compare|performance)|(compare|performance).*(branch|branches)/.test(normalised)) return { toolId: "branch_performance", args: {}, label: "branch performance" };
  if (/(terminal|operations|container).*(count|summary|currently|how many)|(count|summary|currently|how many).*(terminal|operations|container)/.test(normalised)) return { toolId: "operations_overview", args: {}, label: "operations overview" };
  return { toolId: null, args: {}, label: "unsupported question" };
}

async function interpretNaturalLanguageQuestion(question: string, req: AuthRequest, context: AiConversationContext | null, onUsage?: (usage: AiProviderUsage) => void): Promise<CopilotIntent> {
  // This must run before model/context routing: “in the terminal” is the
  // dashboard's physical-location metric, not the Terminal/TDO work queue.
  if (isPhysicalTerminalPresenceQuestion(question)) {
    return { toolId: "operations_overview", args: {}, label: "physical terminal presence" };
  }
  const understanding = understandAiQuestion(question);
  const deterministicIntent = interpretQuestionFallback(question);
  // A named schedule has an exact-match reader. Do not let the model reduce it
  // to the generic approved-schedules question.
  if (deterministicIntent.toolId === "approved_payment_schedules" && paymentScheduleLookupQuery(question)) {
    return deterministicIntent;
  }
  if (deterministicIntent.toolId && (understanding.containerNumber || understanding.invoiceNumber || understanding.stage || understanding.asksForDelays)) {
    return deterministicIntent;
  }
  const contextualIntent = resolveConversationFollowUp(question, context, new Set(Object.keys(STAGE_TOOL_FIELDS)));
  if (contextualIntent && TOOL_IDS.has(contextualIntent.toolId)) {
    return { toolId: contextualIntent.toolId as ToolId, args: contextualIntent.args, label: contextualIntent.label };
  }
  const governance = await getAiGovernance();
  if (!governance.providerEnabled || !isNaturalLanguageRoutingConfigured()) return interpretQuestionFallback(question);
  const approvedTools = TOOL_CATALOG
    .filter((tool) => governance.dataDomains.includes(tool.domain))
    .map((tool) => ({ id: tool.id, title: tool.title, description: tool.description }));

  try {
    const selection = await selectToolWithNaturalLanguage({
      question,
      tools: approvedTools,
      role: req.user!.role,
      branchScope: getBranchScope(req),
      understanding,
      conversationContext: context ? { lastToolId: context.lastToolId, lastToolArgs: context.lastToolArgs, records: context.records.map(({ title, href }) => ({ title, href })) } : undefined,
      onUsage,
    });
    if (selection.kind === "tool" && TOOL_IDS.has(selection.toolId)) {
      const tool = TOOL_CATALOG.find((candidate) => candidate.id === selection.toolId)!;
      const query = tool.id === "approved_payment_schedules" ? paymentScheduleLookupQuery(question) : null;
      return { toolId: tool.id, args: query ? { ...selection.args, query } : selection.args, label: tool.title.toLowerCase() };
    }
    if (selection.kind === "tool") {
      return { toolId: null, args: {}, label: "unsupported question", clarification: "I could not safely match that request to an approved read-only tool." };
    }
    return { toolId: null, args: {}, label: selection.label, clarification: selection.message };
  } catch (error) {
    // A provider outage must not broaden access or block the already-approved local fallback.
    console.warn("[ai-assistant] Natural-language routing unavailable; using constrained local fallback", error);
    return interpretQuestionFallback(question);
  }
}

function toAmount(value: string | number | null | undefined): number {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value);
}

function dateOnly(value: Date | string | null | undefined): string {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "Not set" : date.toISOString().slice(0, 10);
}

function dateFilterBound(value: unknown, endOfDay = false): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRequestedLimit(value: unknown): number {
  const limit = Number(value);
  return Number.isInteger(limit) ? Math.max(1, Math.min(limit, 50)) : 20;
}

const STAGE_TOOL_FIELDS = {
  transire_processing: { expected: "expectedTransireDate", released: "transireReleasedAt" },
  shipping: { expected: "expectedDoDate", released: "doReleasedAt" },
  terminal: { expected: "expectedTdoDate", released: "tdoReleasedAt" },
  pull_out: { expected: "expectedPulloutDate", released: "pulloutReleasedAt" },
} as const;
type StageToolId = keyof typeof STAGE_TOOL_FIELDS;

function getStageToolId(value: unknown): StageToolId {
  if (typeof value !== "string" || !(value in STAGE_TOOL_FIELDS)) {
    throw new Error("Choose one approved stage: transire_processing, shipping, terminal, or pull_out.");
  }
  return value as StageToolId;
}

function getLookupId(value: unknown, label: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`Provide a valid ${label} ID.`);
  return id;
}

function stageState(row: Record<string, unknown>, stage: StageToolId): "active" | "released" {
  return row[STAGE_TOOL_FIELDS[stage].released] ? "released" : "active";
}

function getReportPeriod(value: Record<string, unknown>): { from: Date; to: Date; label: string } {
  const now = new Date();
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const defaultTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const from = typeof value.from === "string" ? new Date(`${value.from}T00:00:00.000Z`) : defaultFrom;
  const to = typeof value.to === "string" ? new Date(`${value.to}T23:59:59.999Z`) : defaultTo;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new Error("Provide a valid report date range.");
  const maxDays = 366;
  if ((to.getTime() - from.getTime()) / 86_400_000 > maxDays) throw new Error("Report date range cannot exceed 366 days.");
  return { from, to, label: `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}` };
}

function occursWithin(value: Date | string | null | undefined, period: { from: Date; to: Date }): boolean {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date >= period.from && date <= period.to;
}

function scoped<T extends { branchId: unknown }>(rows: T[], branchId: number | null): T[] {
  return branchId == null ? rows : rows.filter((row) => row.branchId === branchId);
}

function createResult(toolId: ToolId, title: string, branchId: number | null): AssistantToolResult {
  return {
    toolId,
    title,
    generatedAt: new Date().toISOString(),
    scope: { branchId, label: branchId == null ? "All branches" : `Branch ${branchId}` },
    facts: [],
    records: [],
    sources: [],
    notes: ["Live, read-only data. Confirm source records before acting."],
  };
}

function foundationRateLimit(req: AuthRequest, res: Response, next: NextFunction) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });
  const now = Date.now();
  const current = rateBuckets.get(userId);
  const bucket = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
  bucket.count += 1;
  rateBuckets.set(userId, bucket);
  if (bucket.count > 60) {
    res.setHeader("Retry-After", String(Math.ceil((60_000 - (now - bucket.startedAt)) / 1000)));
    return res.status(429).json({ error: "Too many AI assistant requests. Please try again shortly." });
  }
  return next();
}

export async function recordAiAssistantAuditEvent(input: {
  userId: number;
  branchId?: number | null;
  sessionId?: number | null;
  eventType: string;
  requestSummary?: string | null;
  responseSummary?: string | null;
  toolName?: string | null;
  recordReferences?: unknown[];
  metadata?: Record<string, unknown>;
}) {
  const compact = (value: string | null | undefined, limit = 5000) => value ? value.slice(0, limit) : null;
  const serialiseAuditValue = (value: unknown, limit = 20_000) => {
    const serialised = JSON.stringify(value);
    return serialised.length <= limit
      ? serialised
      : JSON.stringify({ truncated: true, itemCount: Array.isArray(value) ? value.length : undefined });
  };
  await db.insert(aiAssistantAuditLogsTable).values({
    userId: input.userId,
    branchId: input.branchId ?? null,
    sessionId: input.sessionId ?? null,
    eventType: input.eventType.slice(0, 100),
    requestSummary: compact(input.requestSummary),
    responseSummary: compact(input.responseSummary),
    toolName: compact(input.toolName, 200),
    recordReferences: serialiseAuditValue(input.recordReferences ?? []),
    metadata: serialiseAuditValue(input.metadata ?? {}),
  });
}

async function getOrCreateSession(req: AuthRequest, sessionId: unknown, question: string) {
  const requestedId = Number(sessionId);
  const branchScope = getBranchScope(req);
  if (Number.isInteger(requestedId) && requestedId > 0) {
    const [existing] = await db.select().from(aiAssistantSessionsTable)
      .where(and(eq(aiAssistantSessionsTable.id, requestedId), eq(aiAssistantSessionsTable.userId, req.user!.id)))
      .limit(1);
    if (!existing) throw new Error("AI assistant session was not found.");
    const contextExpired = !!existing.contextExpiresAt && existing.contextExpiresAt.getTime() <= Date.now();
    const branchChanged = existing.branchId !== branchScope;
    if (contextExpired || branchChanged) {
      const [reset] = await db.update(aiAssistantSessionsTable).set({
        branchId: branchScope,
        conversationContext: null,
        contextExpiresAt: null,
        updatedAt: new Date(),
      }).where(eq(aiAssistantSessionsTable.id, existing.id)).returning();
      return reset;
    }
    return existing;
  }

  const title = question.trim().replace(/\s+/g, " ").slice(0, 100) || "New assistant session";
  const [created] = await db.insert(aiAssistantSessionsTable).values({
    userId: req.user!.id,
    branchId: branchScope,
    title,
  }).returning();
  return created;
}

function deterministicEvidenceAnswer(intent: CopilotIntent, noData: boolean) {
  return {
    directAnswer: noData
      ? `I checked the current authorised data for ${intent.label} and found no matching records.`
      : `I checked the current authorised data for ${intent.label}. The facts and linked source records are below.`,
    recommendations: noData ? [] : ["Review the cited source records before taking action through the normal workflow."],
    evidenceNotice: "This answer is based only on the live, permission-scoped tool result shown below.",
    factLabels: [] as string[],
    recordHrefs: [] as string[],
  };
}

function evidenceConfidenceNotice(result: AssistantToolResult): string {
  if (!result.facts.length && !result.records.length) {
    return "Evidence is limited: the live tool returned no facts or source records for this question.";
  }
  if (!result.records.length) {
    return "Evidence is limited: this live result contains summary facts but no individual source record to open.";
  }
  return "Evidence is current at the time of this request and is limited to the cited records within your authorised branch scope.";
}

async function makeCopilotAnswer(sessionId: number, question: string, intent: CopilotIntent, result: AssistantToolResult | undefined, providerEnabled: boolean, onUsage?: (usage: AiProviderUsage) => void): Promise<CopilotAnswer> {
  if (!intent.toolId || !result) {
    return {
      sessionId,
      question,
      status: "unsupported",
      answer: intent.clarification ?? "I can currently help with approved container status, overdue and delayed jobs, PAAR checks, receivables, approved payment schedules, overhead balances, and branch performance. Try one of the suggested questions.",
      facts: [],
      calculations: [],
      findings: [],
      recordedCauses: [],
      recommendations: [],
      limitations: ["No approved data tool was run for this question."],
      evidenceNotice: "No data tool was run because the question needs clarification or is outside the approved scope.",
      evidenceFactLabels: [],
      evidenceRecordHrefs: [],
      assumptions: ["I do not guess, run arbitrary database searches, or take actions outside the approved read-only tools."],
      citations: [],
      records: [],
    };
  }

  const noData = result.facts.every((fact) => fact.value === 0 || fact.value === "₦0.00") && result.records.length === 0;
  const calculations = result.facts.filter((fact) => /invoiced|collected|outstanding|balance|overhead|payments/i.test(fact.label))
    .map((fact) => `${fact.label}: ${fact.value}`);
  const presentation = buildAiAnswerPresentation({ facts: result.facts, notes: result.notes, recordCount: result.records.length, noData });
  const evidence = (providerEnabled ? await generateEvidenceBasedAnswer({
    question,
    toolTitle: result.title,
    scopeLabel: result.scope.label,
    facts: result.facts,
    records: result.records,
    notes: result.notes,
    onUsage,
  }) : null) ?? deterministicEvidenceAnswer(intent, noData);
  return {
    sessionId,
    question,
    status: noData ? "no_data" : "answered",
    answer: evidence.directAnswer,
    facts: result.facts,
    calculations,
    findings: presentation.keyFindings,
    recordedCauses: presentation.recordedCauses,
    recommendations: presentation.recommendations,
    limitations: presentation.limitations,
    evidenceNotice: evidenceConfidenceNotice(result),
    evidenceFactLabels: evidence.factLabels,
    evidenceRecordHrefs: evidence.recordHrefs,
    assumptions: [
      "Figures and statuses are live at the time shown and use your current branch scope.",
      "Amounts marked as paid are actual recorded payments; approved-but-unpaid schedules remain separate.",
      "Use the cited source record to confirm or act through the normal workflow.",
    ],
    citations: result.sources,
    records: result.records,
  };
}

function firstFactValue(result: AssistantToolResult, label: string): string | number | null {
  return result.facts.find((fact) => fact.label === label)?.value ?? null;
}

async function runContainerDelayInvestigation(req: AuthRequest, body: Record<string, unknown>): Promise<AssistantToolResult> {
  const requestedNumber = typeof body.containerNumber === "string" ? body.containerNumber.trim().toUpperCase() : "";
  const requestedId = Number(body.containerId);
  if ((!Number.isInteger(requestedId) || requestedId <= 0) && !requestedNumber) {
    throw new Error("Provide an exact container number or container ID for an investigation.");
  }

  const lookup = await runApprovedTool("container_lookup", req, body);
  const result = createResult("container_delay_investigation", "Container delay investigation", getBranchScope(req));
  const containerSource = lookup.sources.find((source) => source.type === "container" && typeof source.id === "number");
  if (!containerSource?.id) {
    result.facts = [{ label: "Investigation checks completed", value: 1 }];
    result.notes = ["The workflow check found no authorised container matching that exact identifier. No further checks were run."];
    return result;
  }

  const stepFailures: string[] = [];
  const runOptionalCheck = async (toolId: "container_documents" | "container_payment_history") => {
    try {
      return await runApprovedTool(toolId, req, { containerId: containerSource.id });
    } catch (error) {
      stepFailures.push(`${toolId}: ${error instanceof Error ? error.message : "check failed"}`);
      return null;
    }
  };
  const [documents, payments] = await Promise.all([
    runOptionalCheck("container_documents"),
    runOptionalCheck("container_payment_history"),
  ]);

  const fact = (label: string) => firstFactValue(lookup, label);
  result.facts = [
    { label: "Investigation checks completed", value: 1 + (documents ? 1 : 0) + (payments ? 1 : 0) },
    { label: "Container", value: containerSource.label },
    ...(fact("Workflow status") != null ? [{ label: "Workflow status", value: fact("Workflow status")! }] : []),
    ...(fact("Berthing") != null ? [{ label: "Berthing", value: fact("Berthing")! }] : []),
    ...(fact("PAAR") != null ? [{ label: "PAAR", value: fact("PAAR")! }] : []),
    ...lookup.facts
      .filter((item) => /delay reason$/i.test(item.label))
      .map((item) => ({ label: item.label, value: item.value })),
    ...(documents ? [{ label: "Attached documents", value: firstFactValue(documents, "Attached documents") ?? 0 }] : []),
    ...(payments ? [{ label: "Recorded payments", value: firstFactValue(payments, "Recorded payments") ?? 0 }] : []),
    ...(payments ? [{ label: "Total paid", value: firstFactValue(payments, "Total paid") ?? money(0) }] : []),
  ];
  const allRecords = [
    ...lookup.records,
    ...(documents?.records ?? []),
    ...(payments?.records ?? []),
  ];
  result.records = allRecords.filter((record, index) => allRecords.findIndex((candidate) => candidate.href === record.href && candidate.title === record.title) === index).slice(0, 30);
  const allSources = [
    ...lookup.sources,
    ...(documents?.sources ?? []),
    ...(payments?.sources ?? []),
  ];
  result.sources = allSources.filter((source, index) => allSources.findIndex((candidate) => candidate.href === source.href && candidate.label === source.label) === index);
  result.notes = [
    "Completed fixed read-only checks for workflow state, supporting documents, and recorded payments.",
    ...(fact("Berthing") === "Not confirmed" ? ["Potential blocker: vessel berthing is not confirmed."] : []),
    ...(fact("PAAR") === "Not recorded" ? ["Potential blocker: PAAR is not recorded."] : []),
    ...lookup.facts
      .filter((item) => /delay reason$/i.test(item.label))
      .map((item) => `Recorded ${item.label.toLowerCase()}: ${item.value}.`),
    ...(documents && firstFactValue(documents, "Attached documents") === 0 ? ["No supporting documents are attached to this container."] : []),
    ...stepFailures.map((failure) => `Evidence incomplete: ${failure}`),
  ];
  return result;
}

async function runApprovedTool(toolId: ToolId, req: AuthRequest, body: Record<string, unknown>): Promise<AssistantToolResult> {
  const branchId = getBranchScope(req);
  const limit = getRequestedLimit(body.limit);
  const tool = TOOL_CATALOG.find((candidate) => candidate.id === toolId)!;

  const [setting] = await db.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "aiAssistantGovernance"))
    .limit(1);
  const governance = parseGovernance(setting?.value);
  if (!governance.dataDomains.includes(tool.domain)) {
    throw new Error("This data domain is disabled by AI Assistant governance.");
  }

  if (toolId === "container_delay_investigation") {
    return runContainerDelayInvestigation(req, body);
  }

  if (toolId === "operations_overview") {
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, status: containersTable.status,
      berthed: containersTable.berthed, eta: containersTable.eta, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, gateOutDate: containersTable.gateOutDate,
    }).from(containersTable), branchId);
    const result = createResult(toolId, tool.title, branchId);
    const statusCounts = getOperationalStatusCounts(rows);
    const inTerminal = rows.filter(isContainerPhysicallyInTerminal);
    const awaitingPullout = rows.filter((row) => row.status === "pull_out");
    const citedRows = [...inTerminal, ...awaitingPullout, ...rows.filter((row) => row.status !== "closed" && !isContainerPhysicallyInTerminal(row) && row.status !== "pull_out")].slice(0, limit);
    result.facts = [
      { label: "Open containers", value: rows.filter((row) => row.status !== "closed").length },
      { label: "Containers in Terminal", value: inTerminal.length, detail: "Physically gate-in, in examination, or final release; excludes gate-out containers." },
      { label: "Awaiting Pullout", value: awaitingPullout.length, detail: "Pullout is reported separately and is not counted as being in Terminal." },
      { label: "At Gate-In", value: statusCounts.gate_in ?? 0 },
      { label: "In Examination", value: statusCounts.examination ?? 0 },
      { label: "At Final Release", value: statusCounts.final_release ?? 0 },
      { label: "Awaiting verification", value: rows.filter((row) => row.status === "pending_verification").length },
      { label: "Awaiting berthing", value: rows.filter((row) => !row.berthed && !!row.eta).length },
    ];
    result.records = citedRows.map((row) => ({
      title: row.containerNumber,
      detail: `${row.customerName} - ${operationalStageLabel(row.status)}`,
      href: `/containers/${row.id}`,
      badges: [operationalStageLabel(row.status)],
    }));
    result.sources = citedRows.map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}` }));
    return result;
  }

  if (toolId === "stage_count" || toolId === "stage_jobs" || toolId === "stage_delays") {
    const stage = getStageToolId(body.stage);
    const requestedState = typeof body.status === "string" ? body.status : "all";
    if (!["all", "active", "released"].includes(requestedState)) throw new Error("Stage status must be all, active, or released.");
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, status: containersTable.status,
      transireStageOwner: containersTable.transireStageOwner, shippingStageOwner: containersTable.shippingStageOwner,
      terminalStageOwner: containersTable.terminalStageOwner, pulloutStageOwner: containersTable.pulloutStageOwner,
      expectedTransireDate: containersTable.expectedTransireDate, transireReleasedAt: containersTable.transireReleasedAt,
      expectedDoDate: containersTable.expectedDoDate, doReleasedAt: containersTable.doReleasedAt,
      expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt,
      expectedPulloutDate: containersTable.expectedPulloutDate, pulloutReleasedAt: containersTable.pulloutReleasedAt,
    }).from(containersTable), branchId).filter((row) => row.status !== "closed");
    const from = dateFilterBound(body.from);
    const to = dateFilterBound(body.to, true);
    const stageRows = rows.filter((row) => {
      const data = row as unknown as Record<string, unknown>;
      const state = stageState(data, stage);
      if (requestedState !== "all" && state !== requestedState) return false;
      if (!from && !to) return true;
      const dateForState = state === "released" ? data[STAGE_TOOL_FIELDS[stage].released] : data[STAGE_TOOL_FIELDS[stage].expected];
      if (!(dateForState instanceof Date)) return false;
      return (!from || dateForState >= from) && (!to || dateForState <= to);
    });
    const route = stage === "transire_processing" ? "/transire" : stage === "pull_out" ? "/pull-out" : `/${stage}`;
    const result = createResult(toolId, tool.title, branchId);
    if (toolId === "stage_delays") {
      const rawOverdueDays = body.overdueDays == null ? 0 : Number(body.overdueDays);
      if (!Number.isInteger(rawOverdueDays) || rawOverdueDays < 0 || rawOverdueDays > 365) throw new Error("Overdue days must be a whole number from 0 to 365.");
      const overdueDays = rawOverdueDays;
      const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - overdueDays);
      const delayed = stageRows.filter((row) => {
        const data = row as unknown as Record<string, unknown>;
        const expected = data[STAGE_TOOL_FIELDS[stage].expected];
        return stageState(data, stage) === "active" && expected instanceof Date && expected.getTime() < cutoff.getTime();
      });
      result.facts = [{ label: `${operationalStageLabel(stage)} overdue jobs`, value: delayed.length }, { label: "Overdue after", value: `${overdueDays} day(s)` }, ...(from || to ? [{ label: "Date range", value: `${typeof body.from === "string" ? body.from : "Any date"} to ${typeof body.to === "string" ? body.to : "Any date"}` }] : [])];
      result.records = delayed.slice(0, limit).map((row) => ({
        title: row.containerNumber,
        detail: `${row.customerName} - expected ${dateOnly((row as unknown as Record<string, unknown>)[STAGE_TOOL_FIELDS[stage].expected] as Date)}.`,
        href: `${route}?container=${row.id}`, badges: ["Overdue"],
      }));
      result.sources = delayed.slice(0, limit).map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}` }));
      return result;
    }
    const activeCount = stageRows.filter((row) => stageState(row as unknown as Record<string, unknown>, stage) === "active").length;
    const releasedCount = stageRows.length - activeCount;
    result.facts = [{ label: `${operationalStageLabel(stage)} active`, value: activeCount }, { label: `${operationalStageLabel(stage)} released`, value: releasedCount }, ...(from || to ? [{ label: "Date range", value: `${typeof body.from === "string" ? body.from : "Any date"} to ${typeof body.to === "string" ? body.to : "Any date"}` }] : [])];
    if (toolId === "stage_jobs") {
      result.records = stageRows.slice(0, limit).map((row) => {
        const data = row as unknown as Record<string, unknown>;
        const state = stageState(data, stage);
        const owner = stageOwnerFor(stage, row);
        const timing = state === "released"
          ? `released ${dateOnly(data[STAGE_TOOL_FIELDS[stage].released] as Date)}`
          : `expected ${dateOnly(data[STAGE_TOOL_FIELDS[stage].expected] as Date)}`;
        return { title: row.containerNumber, detail: `${row.customerName} - ${timing}; owner ${owner ?? "Unassigned"}.`, href: `${route}?container=${row.id}`, badges: [state] };
      });
      result.sources = stageRows.slice(0, limit).map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}` }));
    }
    return result;
  }

  if (toolId === "delayed_jobs") {
    const now = new Date();
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName,
      transireStageOwner: containersTable.transireStageOwner, shippingStageOwner: containersTable.shippingStageOwner,
      terminalStageOwner: containersTable.terminalStageOwner, pulloutStageOwner: containersTable.pulloutStageOwner,
      expectedTransireDate: containersTable.expectedTransireDate, transireReleasedAt: containersTable.transireReleasedAt,
      expectedDoDate: containersTable.expectedDoDate, doReleasedAt: containersTable.doReleasedAt,
      expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt,
      expectedPulloutDate: containersTable.expectedPulloutDate, pulloutReleasedAt: containersTable.pulloutReleasedAt,
    }).from(containersTable), branchId);
    const result = createResult(toolId, tool.title, branchId);
    const delayed = rows.flatMap((row) => [
      { stage: "Transire", stageId: "transire_processing", expected: row.expectedTransireDate, actual: row.transireReleasedAt },
      { stage: "Shipping / DO", stageId: "shipping", expected: row.expectedDoDate, actual: row.doReleasedAt },
      { stage: "Terminal / TDO", stageId: "terminal", expected: row.expectedTdoDate, actual: row.tdoReleasedAt },
      { stage: "Pullout", stageId: "pull_out", expected: row.expectedPulloutDate, actual: row.pulloutReleasedAt },
    ].filter((stage) => stage.expected && !stage.actual && new Date(stage.expected).getTime() < now.getTime()).map((stage) => ({ ...stage, row })));
    result.facts = [{ label: "Delayed stage actions", value: delayed.length }, { label: "Affected containers", value: new Set(delayed.map((item) => item.row.id)).size }];
    result.records = delayed.slice(0, limit).map((item) => ({
      title: `${item.row.containerNumber} - ${item.stage}`,
      detail: `Expected ${dateOnly(item.expected)}. Owner: ${stageOwnerFor(item.stageId, item.row) ?? "Unassigned"}.`,
      href: `/containers/${item.row.id}`,
      badges: ["Overdue", item.stage],
    }));
    result.sources = delayed.slice(0, limit).map((item) => ({ type: "container", id: item.row.id, label: item.row.containerNumber, href: `/containers/${item.row.id}` }));
    return result;
  }

  if (toolId === "open_job_tasks") {
    const [allTasks, allContainers, allUsers] = await Promise.all([
      db.select({ id: containerTasksTable.id, branchId: containerTasksTable.branchId, containerId: containerTasksTable.containerId, title: containerTasksTable.title, assignedStaffId: containerTasksTable.assignedStaffId, dueDate: containerTasksTable.dueDate, priority: containerTasksTable.priority, status: containerTasksTable.status, notes: containerTasksTable.notes }).from(containerTasksTable),
      db.select({ id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber, customerName: containersTable.customerName }).from(containersTable),
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
    ]);
    const containers = scoped(allContainers, branchId);
    const containerById = new Map(containers.map((container) => [container.id, container]));
    const userById = new Map(allUsers.map((user) => [user.id, user]));
    const now = new Date();
    const tasks = scoped(allTasks, branchId).filter((task) => task.status !== "completed" && containerById.has(task.containerId));
    const overdue = tasks.filter((task) => task.dueDate && task.dueDate.getTime() < now.getTime());
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Open tasks", value: tasks.length },
      { label: "Overdue tasks", value: overdue.length },
      { label: "High-priority tasks", value: tasks.filter((task) => task.priority === "high" || task.priority === "urgent").length },
    ];
    result.records = tasks.sort((a, b) => (a.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) - (b.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER)).slice(0, limit).map((task) => {
      const container = containerById.get(task.containerId)!;
      const assignee = task.assignedStaffId ? userById.get(task.assignedStaffId)?.name ?? "Unassigned" : "Unassigned";
      return {
        title: task.title,
        detail: `${container.containerNumber} - ${container.customerName}. Due ${dateOnly(task.dueDate)}; assigned to ${assignee}${task.notes ? `; ${task.notes}` : ""}.`,
        href: `/containers/${container.id}?tab=tasks`,
        badges: [task.priority, task.dueDate && task.dueDate.getTime() < now.getTime() ? "Overdue" : "Open"],
      };
    });
    result.sources = result.records.map((record) => {
      const containerId = Number(record.href.match(/^\/containers\/(\d+)/)?.[1]);
      const container = containers.find((candidate) => candidate.id === containerId)!;
      return { type: "container", id: container.id, label: container.containerNumber, href: record.href };
    });
    return result;
  }

  if (toolId === "overdue_containers") {
    const now = new Date();
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, eta: containersTable.eta, stageOwner: containersTable.stageOwner,
      berthed: containersTable.berthed, status: containersTable.status,
    }).from(containersTable), branchId).filter((row) => !row.berthed && !!row.eta && new Date(row.eta).getTime() < now.getTime() && row.status !== "closed");
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [{ label: "Overdue containers", value: rows.length }];
    result.records = rows.sort((a, b) => new Date(a.eta!).getTime() - new Date(b.eta!).getTime()).slice(0, limit).map((row) => ({
      title: row.containerNumber,
      detail: `${row.customerName} - ETA ${dateOnly(row.eta)}. Owner: ${row.stageOwner ?? "Unassigned"}.`,
      href: `/containers/${row.id}?section=berthing`,
      badges: ["Berthing overdue"],
    }));
    result.sources = rows.slice(0, limit).map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}?section=berthing` }));
    return result;
  }

  if (toolId === "documentation_checks") {
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, paarNumber: containersTable.paarNumber,
      paarOfficer: containersTable.paarOfficer, paarDelayReason: containersTable.paarDelayReason,
      status: containersTable.status,
    }).from(containersTable), branchId).filter((row) => row.status !== "pending_verification" && row.status !== "closed" && !row.paarNumber?.trim());
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [{ label: "Open jobs without PAAR", value: rows.length }];
    result.records = rows.slice(0, limit).map((row) => ({
      title: row.containerNumber,
      detail: `${row.customerName} - Officer: ${row.paarOfficer ?? "Unassigned"}${row.paarDelayReason ? `. Delay: ${row.paarDelayReason}` : ""}`,
      href: `/documentation?containerId=${row.id}`,
      badges: ["PAAR pending"],
    }));
    result.sources = rows.slice(0, limit).map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/documentation?containerId=${row.id}` }));
    return result;
  }

  if (toolId === "container_lookup") {
    const requestedId = Number(body.containerId);
    const requestedNumber = typeof body.containerNumber === "string" ? body.containerNumber.trim().toUpperCase() : "";
    if ((!Number.isInteger(requestedId) || requestedId <= 0) && !requestedNumber) throw new Error("Provide an exact container number or container ID.");
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, blNumber: containersTable.blNumber, vessel: containersTable.vessel,
      status: containersTable.status, eta: containersTable.eta, berthed: containersTable.berthed, stageOwner: containersTable.stageOwner,
      transireStageOwner: containersTable.transireStageOwner, shippingStageOwner: containersTable.shippingStageOwner,
      terminalStageOwner: containersTable.terminalStageOwner, pulloutStageOwner: containersTable.pulloutStageOwner,
      delayReason: containersTable.delayReason, paarNumber: containersTable.paarNumber, paarDelayReason: containersTable.paarDelayReason,
      expectedTransireDate: containersTable.expectedTransireDate, transireDelayReason: containersTable.transireDelayReason,
      transireReleasedAt: containersTable.transireReleasedAt, expectedDoDate: containersTable.expectedDoDate,
      doReleasedAt: containersTable.doReleasedAt, doDelayReason: containersTable.doDelayReason,
      expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt,
      tdoDelayReason: containersTable.tdoDelayReason, expectedPulloutDate: containersTable.expectedPulloutDate,
      pulloutReleasedAt: containersTable.pulloutReleasedAt, pulloutDelayReason: containersTable.pulloutDelayReason,
    }).from(containersTable), branchId);
    const row = rows.find((candidate) => candidate.id === requestedId || candidate.containerNumber.toUpperCase() === requestedNumber);
    const result = createResult(toolId, tool.title, branchId);
    if (!row) {
      result.notes = ["No authorised container matches that exact identifier."];
      return result;
    }
    result.facts = [
      { label: "Customer", value: row.customerName }, { label: "Workflow status", value: row.status.replace(/_/g, " ") },
      { label: "ETA", value: dateOnly(row.eta) }, { label: "Berthing", value: row.berthed ? "Confirmed" : "Not confirmed" },
      { label: "Berthing owner", value: row.stageOwner ?? "Unassigned" }, { label: "PAAR", value: row.paarNumber ?? "Not recorded" },
      { label: "Transire owner", value: stageOwnerFor("transire_processing", row) ?? "Unassigned" },
      { label: "Shipping owner", value: stageOwnerFor("shipping", row) ?? "Unassigned" },
      { label: "Terminal owner", value: stageOwnerFor("terminal", row) ?? "Unassigned" },
      { label: "Pullout owner", value: stageOwnerFor("pull_out", row) ?? "Unassigned" },
      ...(row.delayReason ? [{ label: "General delay reason", value: row.delayReason }] : []),
      ...(row.paarDelayReason ? [{ label: "PAAR delay reason", value: row.paarDelayReason }] : []),
      ...(row.transireDelayReason ? [{ label: "Transire delay reason", value: row.transireDelayReason }] : []),
      ...(row.doDelayReason ? [{ label: "DO delay reason", value: row.doDelayReason }] : []),
      ...(row.tdoDelayReason ? [{ label: "TDO delay reason", value: row.tdoDelayReason }] : []),
      ...(row.pulloutDelayReason ? [{ label: "Pullout delay reason", value: row.pulloutDelayReason }] : []),
      { label: "Transire", value: row.transireReleasedAt ? `Released ${dateOnly(row.transireReleasedAt)}` : `Expected ${dateOnly(row.expectedTransireDate)}` },
      { label: "DO", value: row.doReleasedAt ? `Released ${dateOnly(row.doReleasedAt)}` : `Expected ${dateOnly(row.expectedDoDate)}` },
      { label: "TDO", value: row.tdoReleasedAt ? `Released ${dateOnly(row.tdoReleasedAt)}` : `Expected ${dateOnly(row.expectedTdoDate)}` },
      { label: "Pullout", value: row.pulloutReleasedAt ? `Released ${dateOnly(row.pulloutReleasedAt)}` : `Expected ${dateOnly(row.expectedPulloutDate)}` },
    ];
    result.records = [{ title: row.containerNumber, detail: `B/L ${row.blNumber} - Vessel ${row.vessel || "Not recorded"}`, href: `/containers/${row.id}`, badges: [row.status.replace(/_/g, " ")] }];
    result.sources = [{ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}` }];
    return result;
  }

  if (toolId === "container_documents") {
    const requestedId = Number(body.containerId);
    const requestedNumber = typeof body.containerNumber === "string" ? body.containerNumber.trim().toUpperCase() : "";
    if ((!Number.isInteger(requestedId) || requestedId <= 0) && !requestedNumber) throw new Error("Provide an exact container number or container ID.");
    const containers = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber, customerName: containersTable.customerName,
    }).from(containersTable), branchId);
    const container = containers.find((row) => (Number.isInteger(requestedId) && row.id === requestedId) || (!!requestedNumber && row.containerNumber.toUpperCase() === requestedNumber));
    if (!container) throw new Error("Container not found in your authorised branch scope.");
    const documents = await db.select({
      id: containerDocumentsTable.id,
      section: containerDocumentsTable.section,
      originalName: containerDocumentsTable.originalName,
      mimeType: containerDocumentsTable.mimeType,
      size: containerDocumentsTable.size,
      createdAt: containerDocumentsTable.createdAt,
      intelligenceStatus: documentIntelligenceIndexTable.status,
      intelligenceError: documentIntelligenceIndexTable.errorMessage,
    }).from(containerDocumentsTable)
      .leftJoin(documentIntelligenceIndexTable, eq(documentIntelligenceIndexTable.documentId, containerDocumentsTable.id))
      .where(and(eq(containerDocumentsTable.containerId, container.id), eq(containerDocumentsTable.branchId, container.branchId)))
      .orderBy(desc(containerDocumentsTable.createdAt));
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Attached documents", value: documents.length },
      { label: "Container", value: container.containerNumber, detail: container.customerName || "No customer recorded" },
    ];
    result.records = documents.map((document) => ({
      title: document.originalName,
      detail: `${container.containerNumber} - ${document.section || "General"} - ${document.intelligenceStatus === "indexed" ? "Searchable" : document.intelligenceStatus === "unsupported" ? "Stored; OCR/text search unavailable" : document.intelligenceStatus === "failed" ? "Stored; indexing failed" : "Stored; not indexed"}`,
      href: `/containers/${container.id}?tab=documents&previewDocument=${document.id}`,
      badges: ["Document", document.section || "General"],
    }));
    result.sources = documents.map((document) => ({
      type: "document",
      id: document.id,
      label: `${document.originalName} (${container.containerNumber})`,
      href: `/containers/${container.id}?tab=documents&previewDocument=${document.id}`,
    }));
    result.notes = documents.length
      ? ["These are all files attached to the authorised container. This list does not depend on OCR or document-text indexing."]
      : ["No files are currently attached to this authorised container."];
    return result;
  }

  if (toolId === "container_payment_history") {
    const requestedId = Number(body.containerId);
    const requestedNumber = typeof body.containerNumber === "string" ? body.containerNumber.trim().toUpperCase() : "";
    if ((!Number.isInteger(requestedId) || requestedId <= 0) && !requestedNumber) throw new Error("Provide an exact container number or container ID.");
    const containers = scoped(await db.select({ id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber, customerName: containersTable.customerName }).from(containersTable), branchId);
    const container = containers.find((row) => row.id === requestedId || row.containerNumber.toUpperCase() === requestedNumber);
    const result = createResult(toolId, tool.title, branchId);
    if (!container) { result.notes = ["No authorised container matches that ID."]; return result; }
    const containerId = container.id;
    const payments = scoped(await db.select({ id: containerExpensePaymentsTable.id, branchId: containerExpensePaymentsTable.branchId, containerId: containerExpensePaymentsTable.containerId, amount: containerExpensePaymentsTable.amount, section: containerExpensePaymentsTable.section, paymentMethod: containerExpensePaymentsTable.paymentMethod, reference: containerExpensePaymentsTable.reference, narration: containerExpensePaymentsTable.narration, paidAt: containerExpensePaymentsTable.paidAt }).from(containerExpensePaymentsTable), branchId)
      .filter((row) => row.containerId === containerId);
    result.facts = [{ label: "Container", value: container.containerNumber }, { label: "Recorded payments", value: payments.length }, { label: "Total paid", value: money(payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0)) }];
    result.records = payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()).slice(0, limit).map((payment) => ({ title: money(toAmount(payment.amount)), detail: `${payment.section ?? "Uncategorised"} - ${payment.paymentMethod} on ${dateOnly(payment.paidAt)}${payment.reference ? `; ref ${payment.reference}` : ""}.`, href: `/containers/${containerId}?tab=payment-history`, badges: [payment.section ?? "payment"] }));
    result.sources = [{ type: "container", id: container.id, label: container.containerNumber, href: `/containers/${container.id}?tab=payment-history` }];
    return result;
  }

  if (toolId === "duty_payments_overview") {
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, duty: customsChargesTable.duty,
      dutyPaid: customsChargesTable.dutyPaid, dutyNotPaid: customsChargesTable.dutyNotPaid,
    }).from(containersTable).leftJoin(customsChargesTable, eq(customsChargesTable.containerId, containersTable.id)), branchId)
      .map((row) => {
        const assessed = toAmount(row.duty);
        const paid = toAmount(row.dutyPaid);
        const outstanding = assessed > 0 ? Math.max(0, assessed - paid) : Math.max(0, toAmount(row.dutyNotPaid));
        return { ...row, assessed, paid, outstanding };
      });
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Duty assessed", value: money(rows.reduce((sum, row) => sum + row.assessed, 0)) },
      { label: "Duty paid", value: money(rows.reduce((sum, row) => sum + row.paid, 0)) },
      { label: "Duty outstanding", value: money(rows.reduce((sum, row) => sum + row.outstanding, 0)) },
      { label: "Containers with unpaid duty", value: rows.filter((row) => row.outstanding > 0).length },
    ];
    result.records = rows.filter((row) => row.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, limit).map((row) => ({
      title: row.containerNumber,
      detail: `${row.customerName} - assessed ${money(row.assessed)}, paid ${money(row.paid)}, balance ${money(row.outstanding)}.`,
      href: `/duty-payments?container=${row.id}`,
      badges: [row.paid > 0 ? "Partial duty payment" : "Duty unpaid"],
    }));
    result.sources = result.records.map((record) => {
      const row = rows.find((candidate) => candidate.containerNumber === record.title)!;
      return { type: "container", id: row.id, label: row.containerNumber, href: record.href };
    });
    return result;
  }

  if (toolId === "invoice_status") {
    const invoiceId = body.invoiceId == null ? null : getLookupId(body.invoiceId, "invoice");
    const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
    if (!invoiceId && !invoiceNumber) throw new Error("Provide an exact invoice number or invoice ID.");
    const invoices = scoped(await db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, containerId: invoicesTable.containerId, clientId: invoicesTable.clientId, invoiceNumber: invoicesTable.invoiceNumber, status: invoicesTable.status, total: invoicesTable.total, dueDate: invoicesTable.dueDate }).from(invoicesTable), branchId);
    const invoice = invoices.find((row) => row.id === invoiceId || row.invoiceNumber.toLowerCase() === invoiceNumber.toLowerCase());
    const result = createResult(toolId, tool.title, branchId);
    if (!invoice) { result.notes = ["No authorised invoice matches that exact identifier."]; return result; }
    const payments = await db.select({ amount: invoicePaymentsTable.amount, paidAt: invoicePaymentsTable.paidAt }).from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoice.id));
    const paid = payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const balance = Math.max(0, toAmount(invoice.total) - paid);
    result.facts = [{ label: "Invoice", value: invoice.invoiceNumber }, { label: "Status", value: invoice.status }, { label: "Total", value: money(toAmount(invoice.total)) }, { label: "Collected", value: money(paid) }, { label: "Outstanding", value: money(balance) }, { label: "Due date", value: dateOnly(invoice.dueDate) }];
    result.records = [{ title: invoice.invoiceNumber, detail: `${money(balance)} outstanding from ${payments.length} recorded payment(s).`, href: `/invoices/${invoice.id}`, badges: [invoice.status] }];
    result.sources = [{ type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/invoices/${invoice.id}` }];
    return result;
  }

  if (toolId === "client_balance") {
    const clientId = body.clientId == null ? null : getLookupId(body.clientId, "client");
    const clientName = typeof body.clientName === "string" ? body.clientName.trim() : "";
    if (!clientId && clientName.length < 2) throw new Error("Provide an exact client ID or at least two characters of the client name.");
    const clients = scoped(await db.select({ id: clientsTable.id, branchId: clientsTable.branchId, name: clientsTable.name, creditBalance: clientsTable.creditBalance }).from(clientsTable), branchId);
    const matchingClients = clients.filter((row) => row.id === clientId || row.name.toLowerCase().includes(clientName.toLowerCase())).slice(0, limit);
    const result = createResult(toolId, tool.title, branchId);
    if (!matchingClients.length) { result.notes = ["No authorised client matches that identifier."]; return result; }
    const invoices = scoped(await db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, clientId: invoicesTable.clientId, total: invoicesTable.total }).from(invoicesTable), branchId);
    const invoiceIds = invoices.filter((row) => matchingClients.some((client) => client.id === row.clientId)).map((row) => row.id);
    const payments = invoiceIds.length ? await db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds)) : [];
    const paidByInvoice = new Map<number, number>(); payments.forEach((payment) => paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + toAmount(payment.amount)));
    const clientBalances = matchingClients.map((client) => {
      const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
      const outstanding = clientInvoices.reduce((sum, invoice) => sum + Math.max(0, toAmount(invoice.total) - (paidByInvoice.get(invoice.id) ?? 0)), 0);
      return { client, outstanding };
    });
    result.records = clientBalances.map(({ client, outstanding }) => ({ title: client.name, detail: `${money(outstanding)} outstanding; ${money(toAmount(client.creditBalance))} credit balance.`, href: `/accounts-receivable?client=${client.id}`, badges: ["Client balance"] }));
    result.facts = [{ label: "Matching clients", value: matchingClients.length }, { label: "Outstanding receivables", value: money(clientBalances.reduce((sum, item) => sum + item.outstanding, 0)) }];
    result.sources = matchingClients.map((client) => ({ type: "client", id: client.id, label: client.name, href: `/accounts-receivable?client=${client.id}` }));
    return result;
  }

  if (toolId === "client_wallet_overview") {
    const [allClients, allDeposits] = await Promise.all([
      db.select({ id: clientsTable.id, branchId: clientsTable.branchId, name: clientsTable.name, creditBalance: clientsTable.creditBalance }).from(clientsTable),
      db.select({ id: clientDepositsTable.id, branchId: clientDepositsTable.branchId, clientId: clientDepositsTable.clientId, amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount, paymentMethod: clientDepositsTable.paymentMethod, reference: clientDepositsTable.reference, createdAt: clientDepositsTable.createdAt }).from(clientDepositsTable),
    ]);
    const clients = scoped(allClients, branchId);
    const deposits = scoped(allDeposits, branchId).filter((deposit) => clients.some((client) => client.id === deposit.clientId));
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const rows = deposits.map((deposit) => ({ ...deposit, remaining: Math.max(0, toAmount(deposit.amount) - toAmount(deposit.allocatedAmount)) }));
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Client deposits", value: money(rows.reduce((sum, row) => sum + toAmount(row.amount), 0)) },
      { label: "Allocated deposits", value: money(rows.reduce((sum, row) => sum + toAmount(row.allocatedAmount), 0)) },
      { label: "Unallocated deposits", value: money(rows.reduce((sum, row) => sum + row.remaining, 0)) },
      { label: "Deposits awaiting allocation", value: rows.filter((row) => row.remaining > 0).length },
    ];
    result.records = rows.filter((row) => row.remaining > 0).sort((a, b) => b.remaining - a.remaining).slice(0, limit).map((row) => {
      const client = clientById.get(row.clientId);
      return {
        title: client?.name ?? `Client ${row.clientId}`,
        detail: `${money(row.remaining)} unallocated from ${money(toAmount(row.amount))} ${row.paymentMethod} deposit on ${dateOnly(row.createdAt)}${row.reference ? `; ref ${row.reference}` : ""}.`,
        href: `/clients/${row.clientId}`,
        badges: ["Wallet credit"],
      };
    });
    result.sources = result.records.map((record) => {
      const client = clients.find((candidate) => candidate.name === record.title);
      return { type: "client", id: client?.id, label: record.title, href: record.href };
    });
    return result;
  }

  if (toolId === "notifications_summary") {
    const notifications = scoped(await db.select({
      id: workflowNotificationsTable.id, branchId: workflowNotificationsTable.branchId, type: workflowNotificationsTable.type,
      message: workflowNotificationsTable.message, actionUrl: workflowNotificationsTable.actionUrl,
      containerId: workflowNotificationsTable.containerId, containerNumber: workflowNotificationsTable.containerNumber,
      targetUserId: workflowNotificationsTable.targetUserId, isRead: workflowNotificationsTable.isRead, createdAt: workflowNotificationsTable.createdAt,
    }).from(workflowNotificationsTable).orderBy(desc(workflowNotificationsTable.createdAt)).limit(500), branchId)
      .filter((row) => hasAuthority(req.user!.accessProfile, "admin") || isWorkflowNotificationVisibleToUser(row, req.user!.accessProfile, req.user!.id));
    const result = createResult(toolId, tool.title, branchId);
    const typeCounts = notifications.reduce<Record<string, number>>((counts, notification) => { counts[notification.type] = (counts[notification.type] ?? 0) + 1; return counts; }, {});
    result.facts = [
      { label: "Notification view", value: "Workflow History" },
      { label: "Visible notifications", value: notifications.length },
      { label: "Unread notifications", value: notifications.filter((notification) => !notification.isRead).length },
      { label: "Notification types", value: Object.keys(typeCounts).length },
    ];
    result.records = notifications.slice(0, limit).map((notification) => ({
      title: notification.type.replace(/_/g, " "), detail: notification.message,
      href: notification.actionUrl || (notification.containerId ? `/containers/${notification.containerId}` : "/notifications"),
      badges: [notification.isRead ? "Read" : "Unread"],
    }));
    result.sources = notifications.slice(0, limit).map((notification) => ({
      type: "workflow_notification", id: notification.id, label: notification.containerNumber || notification.type,
      href: notification.actionUrl || (notification.containerId ? `/containers/${notification.containerId}` : "/notifications"),
    }));
    result.notes = [
      "This summary uses the same branch-scoped Workflow History records and visibility rules as Notifications.",
      "System Alerts are calculated separately by the Notifications page and are not included in these workflow-history totals.",
    ];
    return result;
  }

  if (toolId === "receivables_overview") {
    const invoices = scoped(await db.select({
      id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber,
      total: invoicesTable.total, dueDate: invoicesTable.dueDate, status: invoicesTable.status,
    }).from(invoicesTable), branchId).filter((invoice) => isInvoiceFinanciallyActive(invoice.status));
    const payments = invoices.length ? await db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount })
      .from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoices.map((invoice) => invoice.id))) : [];
    const paidByInvoice = new Map<number, number>();
    payments.forEach((payment) => paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + toAmount(payment.amount)));
    const now = new Date();
    const balances = invoices.map((invoice) => ({ ...invoice, paid: paidByInvoice.get(invoice.id) ?? 0, outstanding: Math.max(0, toAmount(invoice.total) - (paidByInvoice.get(invoice.id) ?? 0)) }));
    const overdue = balances.filter((invoice) => invoice.outstanding > 0 && invoice.dueDate && new Date(invoice.dueDate).getTime() < now.getTime());
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Invoiced", value: money(balances.reduce((sum, invoice) => sum + toAmount(invoice.total), 0)) },
      { label: "Collected", value: money(balances.reduce((sum, invoice) => sum + invoice.paid, 0)) },
      { label: "Outstanding", value: money(balances.reduce((sum, invoice) => sum + invoice.outstanding, 0)) },
      { label: "Overdue invoices", value: overdue.length },
    ];
    result.records = balances.filter((invoice) => invoice.outstanding > 0).sort((a, b) => b.outstanding - a.outstanding).slice(0, limit).map((invoice) => ({
      title: invoice.invoiceNumber,
      detail: `${money(invoice.outstanding)} outstanding. Due ${dateOnly(invoice.dueDate)}.`,
      href: `/invoices/${invoice.id}`,
      badges: [invoice.dueDate && new Date(invoice.dueDate).getTime() < now.getTime() ? "Overdue" : "Outstanding"],
    }));
    result.sources = result.records.map((record) => {
      const invoice = balances.find((candidate) => candidate.invoiceNumber === record.title)!;
      return { type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: record.href };
    });
    return result;
  }

  if (toolId === "approved_payment_schedules") {
    const requestedQuery = typeof body.query === "string" ? body.query.trim().toLocaleLowerCase() : "";
    const schedules = scoped(await db.select({
      id: paymentSchedulesTable.id, branchId: paymentSchedulesTable.branchId, vendorBeneficiary: paymentSchedulesTable.vendorBeneficiary,
      description: paymentSchedulesTable.description, amountRequested: paymentSchedulesTable.amountRequested,
      amountApproved: paymentSchedulesTable.amountApproved, amountPaid: paymentSchedulesTable.amountPaid,
      status: paymentSchedulesTable.status, scheduleDate: paymentSchedulesTable.scheduleDate,
    }).from(paymentSchedulesTable), branchId).filter((schedule) => {
      if (requestedQuery) {
        return schedule.vendorBeneficiary.toLocaleLowerCase() === requestedQuery || schedule.description.toLocaleLowerCase() === requestedQuery;
      }
      return ["approved", "partially_approved", "paid"].includes(schedule.status) && toAmount(schedule.amountApproved) > toAmount(schedule.amountPaid);
    });
    const result = createResult(toolId, tool.title, branchId);
    if (requestedQuery) {
      result.title = "Payment Schedule Lookup";
      result.facts = [
        { label: "Exact schedule matches", value: schedules.length },
        { label: "Search term", value: requestedQuery },
      ];
      result.records = schedules.slice(0, limit).map((schedule) => ({
        title: schedule.vendorBeneficiary,
        detail: `${schedule.description} - ${schedule.status.replace(/_/g, " ")}; requested ${money(toAmount(schedule.amountRequested))}; approved ${money(toAmount(schedule.amountApproved))}; paid ${money(toAmount(schedule.amountPaid))}.`,
        href: `/payment-schedules?selected=${schedule.id}`,
        badges: [schedule.status.replace(/_/g, " ")],
      }));
      result.sources = schedules.slice(0, limit).map((schedule) => ({ type: "payment_schedule", id: schedule.id, label: schedule.vendorBeneficiary, href: `/payment-schedules?selected=${schedule.id}` }));
      result.notes = [
        schedules.length ? "Only exact vendor or description matches are returned; no unrelated schedule was substituted." : "No exact payment schedule was found in your authorised branch scope.",
      ];
      return result;
    }
    result.facts = [
      { label: "Schedules awaiting payment", value: schedules.length },
      { label: "Approved payment balance", value: money(schedules.reduce((sum, schedule) => sum + Math.max(0, toAmount(schedule.amountApproved) - toAmount(schedule.amountPaid)), 0)) },
    ];
    result.records = schedules.sort((a, b) => new Date(a.scheduleDate).getTime() - new Date(b.scheduleDate).getTime()).slice(0, limit).map((schedule) => ({
      title: schedule.vendorBeneficiary,
      detail: `${schedule.description} - ${money(Math.max(0, toAmount(schedule.amountApproved) - toAmount(schedule.amountPaid)))} awaiting payment.`,
      href: `/payment-schedules?selected=${schedule.id}`,
      badges: [schedule.status.replace(/_/g, " ")],
    }));
    result.sources = schedules.slice(0, limit).map((schedule) => ({ type: "payment_schedule", id: schedule.id, label: schedule.vendorBeneficiary, href: `/payment-schedules?selected=${schedule.id}` }));
    return result;
  }

  if (toolId === "overhead_overview") {
    const expenses = scoped(await db.select({ id: overheadExpensesTable.id, branchId: overheadExpensesTable.branchId, category: overheadExpensesTable.category, description: overheadExpensesTable.description, amount: overheadExpensesTable.amount })
      .from(overheadExpensesTable), branchId);
    const payments = expenses.length ? await db.select({ expenseId: expensePaymentsTable.expenseId, amount: expensePaymentsTable.amount })
      .from(expensePaymentsTable).where(inArray(expensePaymentsTable.expenseId, expenses.map((expense) => expense.id))) : [];
    const paidByExpense = new Map<number, number>();
    payments.forEach((payment) => paidByExpense.set(payment.expenseId, (paidByExpense.get(payment.expenseId) ?? 0) + toAmount(payment.amount)));
    const totals = expenses.map((expense) => ({ ...expense, paid: paidByExpense.get(expense.id) ?? 0, balance: Math.max(0, toAmount(expense.amount) - (paidByExpense.get(expense.id) ?? 0)) }));
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Recorded overhead", value: money(totals.reduce((sum, expense) => sum + toAmount(expense.amount), 0)) },
      { label: "Actual payments", value: money(totals.reduce((sum, expense) => sum + expense.paid, 0)) },
      { label: "Outstanding overhead", value: money(totals.reduce((sum, expense) => sum + expense.balance, 0)) },
    ];
    result.records = totals.filter((expense) => expense.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, limit).map((expense) => ({
      title: expense.description,
      detail: `${expense.category} - ${money(expense.balance)} outstanding.`,
      href: `/overhead-expenses?expenseId=${expense.id}`,
      badges: ["Outstanding"],
    }));
    result.sources = totals.filter((expense) => expense.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, limit)
      .map((expense) => ({ type: "overhead_expense", id: expense.id, label: expense.description, href: `/overhead-expenses?expenseId=${expense.id}` }));
    return result;
  }

  if (toolId === "overhead_statements") {
    const requestedExpenseId = body.expenseId == null || body.expenseId === "" ? null : getLookupId(body.expenseId, "overhead expense");
    const expenses = scoped(await db.select({
      id: overheadExpensesTable.id, branchId: overheadExpensesTable.branchId, category: overheadExpensesTable.category,
      description: overheadExpensesTable.description, amount: overheadExpensesTable.amount, createdAt: overheadExpensesTable.createdAt,
    }).from(overheadExpensesTable), branchId).filter((expense) => requestedExpenseId == null || expense.id === requestedExpenseId);
    if (requestedExpenseId != null && expenses.length === 0) throw new Error("The overhead expense was not found in your authorised branch scope.");
    const expenseIds = expenses.map((expense) => expense.id);
    const [topups, payments] = expenseIds.length ? await Promise.all([
      db.select({ expenseId: overheadExpenseTopupsTable.expenseId, amount: overheadExpenseTopupsTable.amount, description: overheadExpenseTopupsTable.description, createdAt: overheadExpenseTopupsTable.createdAt })
        .from(overheadExpenseTopupsTable).where(inArray(overheadExpenseTopupsTable.expenseId, expenseIds)),
      db.select({ expenseId: expensePaymentsTable.expenseId, amount: expensePaymentsTable.amount, paymentMethod: expensePaymentsTable.paymentMethod, paidAt: expensePaymentsTable.paidAt, notes: expensePaymentsTable.notes })
        .from(expensePaymentsTable).where(inArray(expensePaymentsTable.expenseId, expenseIds)),
    ]) : [[], []] as const;
    const totals = expenses.map((expense) => {
      const added = topups.filter((topup) => topup.expenseId === expense.id).reduce((sum, topup) => sum + toAmount(topup.amount), 0);
      const paid = payments.filter((payment) => payment.expenseId === expense.id).reduce((sum, payment) => sum + toAmount(payment.amount), 0);
      const currentTotal = toAmount(expense.amount) + added;
      return { ...expense, added, paid, currentTotal, balance: Math.max(0, currentTotal - paid) };
    });
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Overhead records", value: totals.length },
      { label: "Original recorded amount", value: money(totals.reduce((sum, expense) => sum + toAmount(expense.amount), 0)) },
      { label: "Money added", value: money(totals.reduce((sum, expense) => sum + expense.added, 0)) },
      { label: "Actual payments", value: money(totals.reduce((sum, expense) => sum + expense.paid, 0)) },
      { label: "Outstanding balance", value: money(totals.reduce((sum, expense) => sum + expense.balance, 0)) },
    ];
    result.records = totals.sort((a, b) => b.balance - a.balance).slice(0, limit).map((expense) => ({
      title: expense.description,
      detail: `${expense.category}: ${money(expense.currentTotal)} total; ${money(expense.paid)} paid; ${money(expense.balance)} outstanding.`,
      href: `/overhead-expenses?expenseId=${expense.id}`,
      badges: [expense.balance > 0 ? "Outstanding" : "Paid"],
    }));
    result.sources = totals.slice(0, limit).map((expense) => ({ type: "overhead_expense", id: expense.id, label: expense.description, href: `/overhead-expenses?expenseId=${expense.id}` }));
    result.notes = [
      "This statement separates original overhead, later money-added entries, and actual recorded payments.",
      "MD-approved but unpaid scheduled amounts are not treated as paid until an actual overhead payment is recorded.",
    ];
    return result;
  }

  if (toolId === "payment_summary") {
    const period = getReportPeriod(body);
    const [allInvoices, allInvoicePayments, allDeposits, allOverheadPayments, allContainerPayments] = await Promise.all([
      db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, status: invoicesTable.status }).from(invoicesTable),
      db.select({ id: invoicePaymentsTable.id, branchId: invoicePaymentsTable.branchId, invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount, paidAt: invoicePaymentsTable.paidAt }).from(invoicePaymentsTable),
      db.select({ id: clientDepositsTable.id, branchId: clientDepositsTable.branchId, clientId: clientDepositsTable.clientId, amount: clientDepositsTable.amount, createdAt: clientDepositsTable.createdAt }).from(clientDepositsTable),
      db.select({ id: expensePaymentsTable.id, branchId: expensePaymentsTable.branchId, expenseId: expensePaymentsTable.expenseId, amount: expensePaymentsTable.amount, paidAt: expensePaymentsTable.paidAt }).from(expensePaymentsTable),
      db.select({ id: containerExpensePaymentsTable.id, branchId: containerExpensePaymentsTable.branchId, containerId: containerExpensePaymentsTable.containerId, amount: containerExpensePaymentsTable.amount, paidAt: containerExpensePaymentsTable.paidAt }).from(containerExpensePaymentsTable),
    ]);
    const eligibleInvoiceIds = new Set(scoped(allInvoices, branchId).filter((invoice) => isInvoiceFinanciallyActive(invoice.status)).map((invoice) => invoice.id));
    const invoicePayments = scoped(allInvoicePayments, branchId).filter((payment) => eligibleInvoiceIds.has(payment.invoiceId) && occursWithin(payment.paidAt, period));
    const deposits = scoped(allDeposits, branchId).filter((deposit) => occursWithin(deposit.createdAt, period));
    const overheadPayments = scoped(allOverheadPayments, branchId).filter((payment) => occursWithin(payment.paidAt, period));
    const containerPayments = scoped(allContainerPayments, branchId).filter((payment) => occursWithin(payment.paidAt, period));
    const collections = invoicePayments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const depositTotal = deposits.reduce((sum, deposit) => sum + toAmount(deposit.amount), 0);
    const overheadTotal = overheadPayments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const containerTotal = containerPayments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Report period", value: period.label },
      { label: "Invoice collections", value: money(collections), detail: `${invoicePayments.length} recorded collection(s).` },
      { label: "Client deposits", value: money(depositTotal), detail: `${deposits.length} recorded deposit(s); may include allocations already reflected in collections.` },
      { label: "Overhead payments", value: money(overheadTotal), detail: `${overheadPayments.length} actual payment(s).` },
      { label: "Container disbursements", value: money(containerTotal), detail: `${containerPayments.length} actual payment(s).` },
      { label: "Recorded outflows", value: money(overheadTotal + containerTotal), detail: "Overhead and container payments only; excludes inter-bank transfers." },
    ];
    result.records = [
      ...invoicePayments.slice(0, Math.ceil(limit / 2)).map((payment) => ({ title: `Invoice collection #${payment.id}`, detail: `${money(toAmount(payment.amount))} recorded on ${dateOnly(payment.paidAt)}.`, href: "/accounts-receivable", badges: ["Collection"] })),
      ...overheadPayments.slice(0, Math.floor(limit / 4)).map((payment) => ({ title: `Overhead payment #${payment.id}`, detail: `${money(toAmount(payment.amount))} recorded on ${dateOnly(payment.paidAt)}.`, href: `/overhead-expenses?expenseId=${payment.expenseId}`, badges: ["Overhead"] })),
      ...containerPayments.slice(0, Math.floor(limit / 4)).map((payment) => ({ title: `Container payment #${payment.id}`, detail: `${money(toAmount(payment.amount))} recorded on ${dateOnly(payment.paidAt)}.`, href: `/containers/${payment.containerId}?tab=payment-history`, badges: ["Container"] })),
    ].slice(0, limit);
    result.sources = result.records.map((record) => ({ type: "payment", label: record.title, href: record.href }));
    result.notes = ["This report uses actual payment records in the selected period. It does not double-count approved-but-unpaid schedules or bank transfers."];
    return result;
  }

  if (toolId === "client_statements") {
    const requestedClientId = body.clientId == null || body.clientId === "" ? null : getLookupId(body.clientId, "client");
    const clients = scoped(await db.select({ id: clientsTable.id, branchId: clientsTable.branchId, name: clientsTable.name, creditBalance: clientsTable.creditBalance })
      .from(clientsTable), branchId).filter((client) => requestedClientId == null || client.id === requestedClientId);
    if (requestedClientId != null && clients.length === 0) throw new Error("The client was not found in your authorised branch scope.");
    const clientIds = clients.map((client) => client.id);
    const [invoices, payments, deposits] = clientIds.length ? await Promise.all([
      db.select({ id: invoicesTable.id, clientId: invoicesTable.clientId, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, status: invoicesTable.status })
        .from(invoicesTable).where(inArray(invoicesTable.clientId, clientIds)),
      db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable),
      db.select({ clientId: clientDepositsTable.clientId, amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount }).from(clientDepositsTable).where(inArray(clientDepositsTable.clientId, clientIds)),
    ]) : [[], [], []] as const;
    const paidByInvoice = new Map<number, number>();
    payments.forEach((payment) => paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + toAmount(payment.amount)));
    const rows = clients.map((client) => {
      const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id && isInvoiceFinanciallyActive(invoice.status));
      const invoiced = clientInvoices.reduce((sum, invoice) => sum + toAmount(invoice.total), 0);
      const collected = clientInvoices.reduce((sum, invoice) => sum + (paidByInvoice.get(invoice.id) ?? 0), 0);
      const depositsForClient = deposits.filter((deposit) => deposit.clientId === client.id);
      const depositsTotal = depositsForClient.reduce((sum, deposit) => sum + toAmount(deposit.amount), 0);
      const unallocated = depositsForClient.reduce((sum, deposit) => sum + Math.max(0, toAmount(deposit.amount) - toAmount(deposit.allocatedAmount)), 0);
      return { ...client, invoiced, collected, outstanding: Math.max(0, invoiced - collected), depositsTotal, unallocated };
    });
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Clients in statement", value: rows.length },
      { label: "Invoiced", value: money(rows.reduce((sum, client) => sum + client.invoiced, 0)) },
      { label: "Collected", value: money(rows.reduce((sum, client) => sum + client.collected, 0)) },
      { label: "Outstanding", value: money(rows.reduce((sum, client) => sum + client.outstanding, 0)) },
      { label: "Unallocated deposits", value: money(rows.reduce((sum, client) => sum + client.unallocated, 0)) },
    ];
    result.records = rows.sort((a, b) => b.outstanding - a.outstanding).slice(0, limit).map((client) => ({
      title: client.name,
      detail: `${money(client.invoiced)} invoiced; ${money(client.collected)} collected; ${money(client.outstanding)} outstanding; ${money(client.unallocated)} unallocated wallet credit.`,
      href: `/clients/${client.id}`,
      badges: [client.outstanding > 0 ? "Outstanding" : "Settled"],
    }));
    result.sources = rows.slice(0, limit).map((client) => ({ type: "client", id: client.id, label: client.name, href: `/clients/${client.id}` }));
    result.notes = ["This is a live receivables and wallet statement. Client deposits are reported separately because an allocated deposit may also be reflected in an invoice collection."];
    return result;
  }

  if (toolId === "monthly_financial_report") {
    const period = getReportPeriod(body);
    const [allInvoices, allInvoicePayments, allDeposits, allOverheadPayments, allContainerPayments] = await Promise.all([
      db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, createdAt: invoicesTable.createdAt, status: invoicesTable.status }).from(invoicesTable),
      db.select({ id: invoicePaymentsTable.id, branchId: invoicePaymentsTable.branchId, invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount, paidAt: invoicePaymentsTable.paidAt }).from(invoicePaymentsTable),
      db.select({ id: clientDepositsTable.id, branchId: clientDepositsTable.branchId, amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount, createdAt: clientDepositsTable.createdAt }).from(clientDepositsTable),
      db.select({ id: expensePaymentsTable.id, branchId: expensePaymentsTable.branchId, expenseId: expensePaymentsTable.expenseId, amount: expensePaymentsTable.amount, paidAt: expensePaymentsTable.paidAt }).from(expensePaymentsTable),
      db.select({ id: containerExpensePaymentsTable.id, branchId: containerExpensePaymentsTable.branchId, containerId: containerExpensePaymentsTable.containerId, amount: containerExpensePaymentsTable.amount, paidAt: containerExpensePaymentsTable.paidAt }).from(containerExpensePaymentsTable),
    ]);
    const invoices = scoped(allInvoices, branchId).filter((row) => occursWithin(row.createdAt, period) && isInvoiceFinanciallyActive(row.status));
    const eligibleInvoiceIds = new Set(scoped(allInvoices, branchId).filter((row) => isInvoiceFinanciallyActive(row.status)).map((row) => row.id));
    const collections = scoped(allInvoicePayments, branchId).filter((row) => eligibleInvoiceIds.has(row.invoiceId) && occursWithin(row.paidAt, period));
    const deposits = scoped(allDeposits, branchId).filter((row) => occursWithin(row.createdAt, period));
    const overheadPayments = scoped(allOverheadPayments, branchId).filter((row) => occursWithin(row.paidAt, period));
    const containerPayments = scoped(allContainerPayments, branchId).filter((row) => occursWithin(row.paidAt, period));
    const issued = invoices.reduce((sum, invoice) => sum + toAmount(invoice.total), 0);
    const collected = collections.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const depositsReceived = deposits.reduce((sum, deposit) => sum + toAmount(deposit.amount), 0);
    const overheadPaid = overheadPayments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const containerCostPaid = containerPayments.reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const totalExpenses = overheadPaid + containerCostPaid;
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Report period", value: period.label },
      { label: "Invoices issued", value: money(issued), detail: `${invoices.length} invoice(s) created in the period.` },
      { label: "Invoice collections", value: money(collected), detail: `${collections.length} recorded payment(s).` },
      { label: "Client deposits received", value: money(depositsReceived), detail: "Includes allocated and unallocated deposits." },
      { label: "Recorded operating expenses", value: money(totalExpenses), detail: `${money(overheadPaid)} overhead and ${money(containerCostPaid)} container disbursements.` },
      { label: "Net recorded cash movement", value: money(collected + depositsReceived - totalExpenses), detail: "Collections plus deposits less actual recorded payments; this is not an accrual profit figure." },
    ];
    result.records = [
      { title: "Financial Reports", detail: `Open the existing reports for the ${period.label} period, preview totals, or export PDF/Excel.`, href: `/reports?from=${period.from.toISOString().slice(0, 10)}&to=${period.to.toISOString().slice(0, 10)}`, badges: ["Report draft"] },
      ...invoices.slice(0, Math.max(0, limit - 1)).map((invoice) => ({ title: invoice.invoiceNumber, detail: `${money(toAmount(invoice.total))} issued on ${dateOnly(invoice.createdAt)}.`, href: `/invoices/${invoice.id}`, badges: ["Invoice"] })),
    ];
    result.sources = [
      { type: "report", label: "Financial reports", href: "/reports" },
      ...invoices.slice(0, Math.max(0, limit - 1)).map((invoice) => ({ type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/invoices/${invoice.id}` })),
    ];
    result.notes = [
      "This is a read-only management draft built from live records. Use the cited reports before exporting or distributing a final report.",
      "Net recorded cash movement is not a statutory profit-and-loss statement and excludes unpaid invoices, non-cash adjustments, and external bank-statement differences.",
    ];
    return result;
  }

  if (toolId === "receivables_ageing") {
    const [allInvoices, allPayments] = await Promise.all([
      db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, dueDate: invoicesTable.dueDate, status: invoicesTable.status, createdAt: invoicesTable.createdAt }).from(invoicesTable),
      db.select({ invoiceId: invoicePaymentsTable.invoiceId, branchId: invoicePaymentsTable.branchId, amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable),
    ]);
    const invoices = scoped(allInvoices, branchId).filter((invoice) => isInvoiceFinanciallyActive(invoice.status));
    const paymentMap = new Map<number, number>();
    scoped(allPayments, branchId).forEach((payment) => paymentMap.set(payment.invoiceId, (paymentMap.get(payment.invoiceId) ?? 0) + toAmount(payment.amount)));
    const now = new Date();
    const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    const balances = invoices.map((invoice) => {
      const outstanding = Math.max(0, toAmount(invoice.total) - (paymentMap.get(invoice.id) ?? 0));
      const baseDate = invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00`) : invoice.createdAt;
      const ageDays = Math.max(0, Math.floor((now.getTime() - baseDate.getTime()) / 86_400_000));
      if (outstanding > 0) {
        if (!invoice.dueDate || ageDays === 0) buckets.current += outstanding;
        else if (ageDays <= 30) buckets.days1to30 += outstanding;
        else if (ageDays <= 60) buckets.days31to60 += outstanding;
        else if (ageDays <= 90) buckets.days61to90 += outstanding;
        else buckets.days90plus += outstanding;
      }
      return { ...invoice, outstanding, ageDays };
    }).filter((invoice) => invoice.outstanding > 0);
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Outstanding receivables", value: money(balances.reduce((sum, invoice) => sum + invoice.outstanding, 0)) },
      { label: "Current / no due date", value: money(buckets.current) },
      { label: "1-30 days overdue", value: money(buckets.days1to30) },
      { label: "31-60 days overdue", value: money(buckets.days31to60) },
      { label: "61-90 days overdue", value: money(buckets.days61to90) },
      { label: "90+ days overdue", value: money(buckets.days90plus) },
    ];
    result.records = balances.sort((a, b) => b.ageDays - a.ageDays || b.outstanding - a.outstanding).slice(0, limit).map((invoice) => ({
      title: invoice.invoiceNumber,
      detail: `${money(invoice.outstanding)} outstanding${invoice.dueDate ? ` - ${invoice.ageDays} day(s) since due date` : " - due date not recorded"}.`,
      href: `/invoices/${invoice.id}`,
      badges: [invoice.ageDays > 90 ? "90+ days" : invoice.ageDays > 0 ? `${invoice.ageDays} days overdue` : "Current"],
    }));
    result.sources = result.records.map((record) => {
      const invoice = balances.find((candidate) => candidate.invoiceNumber === record.title)!;
      return { type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: record.href };
    });
    result.notes = ["Age is calculated from invoice due date. Invoices without a due date stay in Current rather than being assumed overdue."];
    return result;
  }

  if (toolId === "bank_ledger_reconciliation") {
    const [allBanks, allPayments, allDeposits, allTransfers, allFundAdditions, allOverheadPayments, allContainerPayments] = await Promise.all([
      db.select({ id: banksTable.id, branchId: banksTable.branchId, name: banksTable.name, accountNumber: banksTable.accountNumber, isActive: banksTable.isActive }).from(banksTable),
      db.select({ branchId: invoicePaymentsTable.branchId, bankId: invoicePaymentsTable.bankId, amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable),
      db.select({ branchId: clientDepositsTable.branchId, bankId: clientDepositsTable.bankId, amount: clientDepositsTable.amount }).from(clientDepositsTable),
      db.select({ branchId: bankTransfersTable.branchId, fromBankId: bankTransfersTable.fromBankId, toBankId: bankTransfersTable.toBankId, amount: bankTransfersTable.amount }).from(bankTransfersTable),
      db.select({ branchId: bankFundAdditionsTable.branchId, bankId: bankFundAdditionsTable.bankId, amount: bankFundAdditionsTable.amount }).from(bankFundAdditionsTable),
      db.select({ branchId: expensePaymentsTable.branchId, bankId: expensePaymentsTable.bankId, amount: expensePaymentsTable.amount }).from(expensePaymentsTable),
      db.select({ branchId: containerExpensePaymentsTable.branchId, bankId: containerExpensePaymentsTable.bankId, amount: containerExpensePaymentsTable.amount }).from(containerExpensePaymentsTable),
    ]);
    const banks = scoped(allBanks, branchId);
    const payments = scoped(allPayments, branchId);
    const deposits = scoped(allDeposits, branchId);
    const transfers = scoped(allTransfers, branchId);
    const fundAdditions = scoped(allFundAdditions, branchId);
    const overheadPayments = scoped(allOverheadPayments, branchId);
    const containerPayments = scoped(allContainerPayments, branchId);
    const rows = banks.map((bank) => {
      const inflows = payments.filter((item) => item.bankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0)
        + deposits.filter((item) => item.bankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0)
        + transfers.filter((item) => item.toBankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0)
        + fundAdditions.filter((item) => item.bankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0);
      const outflows = transfers.filter((item) => item.fromBankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0)
        + overheadPayments.filter((item) => item.bankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0)
        + containerPayments.filter((item) => item.bankId === bank.id).reduce((sum, item) => sum + toAmount(item.amount), 0);
      return { ...bank, inflows, outflows, ledgerBalance: inflows - outflows };
    });
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Banks in scope", value: rows.length },
      { label: "Recorded inflows", value: money(rows.reduce((sum, row) => sum + row.inflows, 0)) },
      { label: "Recorded outflows", value: money(rows.reduce((sum, row) => sum + row.outflows, 0)) },
      { label: "Ledger balance", value: money(rows.reduce((sum, row) => sum + row.ledgerBalance, 0)) },
    ];
    result.records = rows.sort((a, b) => Math.abs(b.ledgerBalance) - Math.abs(a.ledgerBalance)).slice(0, limit).map((bank) => ({
      title: bank.name,
      detail: `Ledger inflows ${money(bank.inflows)} - outflows ${money(bank.outflows)} = ${money(bank.ledgerBalance)}.`,
      href: `/banks?bankId=${bank.id}`,
      badges: [bank.isActive ? "Active" : "Inactive", "Ledger only"],
    }));
    result.sources = rows.slice(0, limit).map((bank) => ({ type: "bank", id: bank.id, label: bank.name, href: `/banks?bankId=${bank.id}` }));
    result.notes = [
      "This reconciles application ledger entries only: invoice payments, client deposits, fund additions, transfers, and recorded expenses.",
      "No imported bank statement is available, so this cannot confirm the external bank balance or detect statement-only transactions.",
    ];
    return result;
  }

  if (toolId === "bank_transfer_activity") {
    const [allTransfers, allBanks, allUsers] = await Promise.all([
      db.select({ id: bankTransfersTable.id, branchId: bankTransfersTable.branchId, fromBankId: bankTransfersTable.fromBankId, toBankId: bankTransfersTable.toBankId, amount: bankTransfersTable.amount, narration: bankTransfersTable.narration, reference: bankTransfersTable.reference, createdBy: bankTransfersTable.createdBy, createdAt: bankTransfersTable.createdAt }).from(bankTransfersTable),
      db.select({ id: banksTable.id, branchId: banksTable.branchId, name: banksTable.name }).from(banksTable),
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
    ]);
    const banks = scoped(allBanks, branchId);
    const bankById = new Map(banks.map((bank) => [bank.id, bank]));
    const userById = new Map(allUsers.map((user) => [user.id, user]));
    const transfers = scoped(allTransfers, branchId).filter((transfer) => (!transfer.fromBankId || bankById.has(transfer.fromBankId)) && (!transfer.toBankId || bankById.has(transfer.toBankId)));
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Recorded transfers", value: transfers.length },
      { label: "Transfer value", value: money(transfers.reduce((sum, transfer) => sum + toAmount(transfer.amount), 0)) },
    ];
    result.records = transfers.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit).map((transfer) => {
      const from = transfer.fromBankId ? bankById.get(transfer.fromBankId)?.name ?? "Unknown bank" : "Unspecified source";
      const to = transfer.toBankId ? bankById.get(transfer.toBankId)?.name ?? "Unknown bank" : "Unspecified destination";
      const creator = transfer.createdBy ? userById.get(transfer.createdBy)?.name : null;
      return {
        title: `${from} to ${to}`,
        detail: `${money(toAmount(transfer.amount))} on ${dateOnly(transfer.createdAt)}${transfer.reference ? `; ref ${transfer.reference}` : ""}${creator ? `; recorded by ${creator}` : ""}${transfer.narration ? `; ${transfer.narration}` : ""}.`,
        href: "/banks",
        badges: ["Bank transfer"],
      };
    });
    result.sources = result.records.map((record, index) => ({ type: "bank_transfer", id: transfers[index]?.id, label: record.title, href: record.href }));
    return result;
  }

  if (toolId === "financial_control_review") {
    const [allInvoices, allInvoicePayments, allDeposits, allExpenses, allSchedules, allContainers, allDocuments, allDuties, allTransfers, allOverheadPayments] = await Promise.all([
      db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, dueDate: invoicesTable.dueDate, createdAt: invoicesTable.createdAt, status: invoicesTable.status }).from(invoicesTable),
      db.select({ id: invoicePaymentsTable.id, branchId: invoicePaymentsTable.branchId, invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount, reference: invoicePaymentsTable.reference, paidAt: invoicePaymentsTable.paidAt }).from(invoicePaymentsTable),
      db.select({ id: clientDepositsTable.id, branchId: clientDepositsTable.branchId, clientId: clientDepositsTable.clientId, amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount, createdAt: clientDepositsTable.createdAt }).from(clientDepositsTable),
      db.select({ id: overheadExpensesTable.id, branchId: overheadExpensesTable.branchId, category: overheadExpensesTable.category, description: overheadExpensesTable.description, amount: overheadExpensesTable.amount, createdAt: overheadExpensesTable.createdAt }).from(overheadExpensesTable),
      db.select({ id: paymentSchedulesTable.id, branchId: paymentSchedulesTable.branchId, vendorBeneficiary: paymentSchedulesTable.vendorBeneficiary, description: paymentSchedulesTable.description, amountRequested: paymentSchedulesTable.amountRequested, amountApproved: paymentSchedulesTable.amountApproved, amountPaid: paymentSchedulesTable.amountPaid, scheduleDate: paymentSchedulesTable.scheduleDate, status: paymentSchedulesTable.status }).from(paymentSchedulesTable),
      db.select({ id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber, status: containersTable.status }).from(containersTable),
      db.select({ containerId: containerDocumentsTable.containerId, branchId: containerDocumentsTable.branchId }).from(containerDocumentsTable),
      db.select({ containerId: customsChargesTable.containerId, branchId: customsChargesTable.branchId, duty: customsChargesTable.duty, dutyPaid: customsChargesTable.dutyPaid }).from(customsChargesTable),
      db.select({ id: bankTransfersTable.id, branchId: bankTransfersTable.branchId, fromBankId: bankTransfersTable.fromBankId, toBankId: bankTransfersTable.toBankId, amount: bankTransfersTable.amount, reference: bankTransfersTable.reference }).from(bankTransfersTable),
      db.select({ id: expensePaymentsTable.id, branchId: expensePaymentsTable.branchId, expenseId: expensePaymentsTable.expenseId, amount: expensePaymentsTable.amount, paymentMethod: expensePaymentsTable.paymentMethod, bankId: expensePaymentsTable.bankId, paidAt: expensePaymentsTable.paidAt }).from(expensePaymentsTable),
    ]);
    const invoices = scoped(allInvoices, branchId).filter((invoice) => invoice.status !== "written_off");
    const payments = scoped(allInvoicePayments, branchId);
    const deposits = scoped(allDeposits, branchId);
    const expenses = scoped(allExpenses, branchId);
    const schedules = scoped(allSchedules, branchId);
    const containers = scoped(allContainers, branchId);
    const duties = scoped(allDuties, branchId);
    const transfers = scoped(allTransfers, branchId);
    const overheadPayments = scoped(allOverheadPayments, branchId);
    const documentedContainerIds = new Set(scoped(allDocuments, branchId).map((document) => document.containerId));
    const flags: Array<{ title: string; detail: string; href: string; badge: string; source: AssistantSource }> = [];
    const paidByInvoice = new Map<number, number>();
    payments.forEach((payment) => paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + toAmount(payment.amount)));
    for (const invoice of invoices) {
      const paid = paidByInvoice.get(invoice.id) ?? 0;
      if (paid > toAmount(invoice.total) + 0.01) flags.push({
        title: invoice.invoiceNumber,
        detail: `Review possible overpayment: ${money(paid)} recorded against an invoice total of ${money(toAmount(invoice.total))}.`,
        href: `/invoices/${invoice.id}`,
        badge: "Possible overpayment",
        source: { type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/invoices/${invoice.id}` },
      });
      if (invoice.dueDate && paid < toAmount(invoice.total) && new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now()) flags.push({
        title: invoice.invoiceNumber,
        detail: `Review delayed collection: ${money(toAmount(invoice.total) - paid)} remains after the due date ${invoice.dueDate}.`,
        href: `/invoices/${invoice.id}`,
        badge: "Overdue collection",
        source: { type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/invoices/${invoice.id}` },
      });
    }
    const duplicateGroups = new Map<string, typeof payments>();
    payments.filter((payment) => payment.reference.trim()).forEach((payment) => {
      const key = `${payment.invoiceId}|${toAmount(payment.amount).toFixed(2)}|${payment.reference.trim().toLowerCase()}`;
      duplicateGroups.set(key, [...(duplicateGroups.get(key) ?? []), payment]);
    });
    duplicateGroups.forEach((group) => {
      if (group.length < 2) return;
      const invoice = invoices.find((item) => item.id === group[0].invoiceId);
      flags.push({
        title: invoice?.invoiceNumber ?? `Invoice ${group[0].invoiceId}`,
        detail: `Review possible duplicate payment: ${group.length} payments share reference "${group[0].reference}" and amount ${money(toAmount(group[0].amount))}.`,
        href: `/invoices/${group[0].invoiceId}`,
        badge: "Possible duplicate",
        source: { type: "invoice", id: group[0].invoiceId, label: invoice?.invoiceNumber ?? `Invoice ${group[0].invoiceId}`, href: `/invoices/${group[0].invoiceId}` },
      });
    });
    deposits.forEach((deposit) => {
      const unallocated = Math.max(0, toAmount(deposit.amount) - toAmount(deposit.allocatedAmount));
      if (unallocated > 0.01) flags.push({
        title: `Client deposit ${deposit.id}`,
        detail: `Review unallocated funds: ${money(unallocated)} of ${money(toAmount(deposit.amount))} has not been allocated to an invoice.`,
        href: "/accounts-receivable",
        badge: "Unallocated deposit",
        source: { type: "client_deposit", id: deposit.id, label: `Client deposit ${deposit.id}`, href: "/accounts-receivable" },
      });
    });
    const amounts = expenses.map((expense) => toAmount(expense.amount)).filter((amount) => amount > 0).sort((a, b) => a - b);
    const median = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 0;
    if (amounts.length >= 5 && median > 0) expenses.filter((expense) => toAmount(expense.amount) >= Math.max(median * 3, 300_000)).forEach((expense) => flags.push({
      title: expense.description,
      detail: `Review unusual overhead: ${money(toAmount(expense.amount))} is at least three times the current median recorded overhead of ${money(median)}.`,
      href: `/overhead-expenses?expenseId=${expense.id}`,
      badge: "Unusual expense",
      source: { type: "overhead_expense", id: expense.id, label: expense.description, href: `/overhead-expenses?expenseId=${expense.id}` },
    }));
    schedules.filter((schedule) => ["approved", "partially_approved"].includes(schedule.status) && toAmount(schedule.amountApproved) > toAmount(schedule.amountPaid) && new Date(schedule.scheduleDate).getTime() < Date.now()).forEach((schedule) => flags.push({
      title: schedule.vendorBeneficiary,
      detail: `Review incomplete payment control: ${money(toAmount(schedule.amountApproved) - toAmount(schedule.amountPaid))} is approved but unpaid after its schedule date.`,
      href: `/payment-schedules?selected=${schedule.id}`,
      badge: "Approved payment overdue",
      source: { type: "payment_schedule", id: schedule.id, label: schedule.vendorBeneficiary, href: `/payment-schedules?selected=${schedule.id}` },
    }));
    containers.filter((container) => !["pending_verification", "closed"].includes(container.status) && !documentedContainerIds.has(container.id)).forEach((container) => flags.push({
      title: container.containerNumber,
      detail: "Review missing supporting documents: this active container has no uploaded documents. Confirm whether documentation is required before treating this as an exception.",
      href: `/containers/${container.id}?tab=documents`,
      badge: "No uploaded documents",
      source: { type: "container", id: container.id, label: container.containerNumber, href: `/containers/${container.id}?tab=documents` },
    }));
    const accountantFindings = analyseAccountantControls({ schedules, duties, bankTransfers: transfers, overheadPayments });
    for (const finding of accountantFindings) {
      if (finding.code === "schedule_overapproved" || finding.code === "schedule_overpaid") {
        const schedule = schedules.find((item) => item.id === finding.ids[0]);
        if (!schedule) continue;
        const overapproved = finding.code === "schedule_overapproved";
        flags.push({
          title: schedule.vendorBeneficiary,
          detail: overapproved
            ? `Review payment schedule control: approved amount ${money(toAmount(schedule.amountApproved))} exceeds the requested amount ${money(toAmount(schedule.amountRequested))}.`
            : `Review payment schedule control: recorded paid amount ${money(toAmount(schedule.amountPaid))} exceeds the approved amount ${money(toAmount(schedule.amountApproved))}.`,
          href: `/payment-schedules?selected=${schedule.id}`,
          badge: overapproved ? "Approval exceeds request" : "Payment exceeds approval",
          source: { type: "payment_schedule", id: schedule.id, label: schedule.vendorBeneficiary, href: `/payment-schedules?selected=${schedule.id}` },
        });
      }
      if (finding.code === "duty_overpaid") {
        const container = containers.find((item) => item.id === finding.ids[0]);
        const duty = duties.find((item) => item.containerId === finding.ids[0]);
        if (!container || !duty) continue;
        flags.push({
          title: container.containerNumber,
          detail: `Review customs-duty control: recorded duty paid ${money(toAmount(duty.dutyPaid))} exceeds assessed duty ${money(toAmount(duty.duty))}.`,
          href: `/duty-payments?container=${container.id}`,
          badge: "Duty overpayment",
          source: { type: "container", id: container.id, label: container.containerNumber, href: `/duty-payments?container=${container.id}` },
        });
      }
      if (finding.code === "duplicate_bank_transfer" || finding.code === "self_bank_transfer") {
        const transfer = transfers.find((item) => item.id === finding.ids[0]);
        if (!transfer) continue;
        flags.push({
          title: `Bank transfer ${transfer.id}`,
          detail: finding.code === "duplicate_bank_transfer"
            ? `Review possible duplicate bank transfer: ${finding.ids.length} transfers share reference "${transfer.reference}" and amount ${money(toAmount(transfer.amount))}.`
            : `Review bank transfer control: the transfer uses the same source and destination bank account.`,
          href: "/banks",
          badge: finding.code === "duplicate_bank_transfer" ? "Possible duplicate transfer" : "Self bank transfer",
          source: { type: "bank_transfer", id: transfer.id, label: `Bank transfer ${transfer.id}`, href: "/banks" },
        });
      }
      if (finding.code === "duplicate_overhead_payment") {
        const payment = overheadPayments.find((item) => item.id === finding.ids[0]);
        const expense = payment ? expenses.find((item) => item.id === payment.expenseId) : undefined;
        if (!payment || !expense) continue;
        flags.push({
          title: expense.description,
          detail: `Review possible duplicate overhead payment: ${finding.ids.length} payments of ${money(toAmount(payment.amount))} were recorded for this expense on ${dateOnly(payment.paidAt)} using the same payment source.`,
          href: `/overhead-expenses?expenseId=${expense.id}`,
          badge: "Possible duplicate overhead payment",
          source: { type: "overhead_expense", id: expense.id, label: expense.description, href: `/overhead-expenses?expenseId=${expense.id}` },
        });
      }
    }
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Review prompts", value: flags.length },
      { label: "Possible duplicate groups", value: [...duplicateGroups.values()].filter((group) => group.length > 1).length },
      { label: "Unallocated deposits", value: deposits.filter((deposit) => toAmount(deposit.amount) - toAmount(deposit.allocatedAmount) > 0.01).length },
      { label: "Approved unpaid schedules", value: schedules.filter((schedule) => ["approved", "partially_approved"].includes(schedule.status) && toAmount(schedule.amountApproved) > toAmount(schedule.amountPaid)).length },
      { label: "Active containers without uploads", value: containers.filter((container) => !["pending_verification", "closed"].includes(container.status) && !documentedContainerIds.has(container.id)).length },
      { label: "Additional accounting-control exceptions", value: accountantFindings.length },
    ];
    result.records = flags.slice(0, limit).map(({ title, detail, href, badge }) => ({ title, detail, href, badges: [badge, "Review needed"] }));
    result.sources = flags.slice(0, limit).map((flag) => flag.source);
    result.notes = [
      "These are rule-based review prompts, not accusations, final accounting conclusions, or automated corrections.",
      "Each prompt uses the rule stated in its detail. Open the source record and verify supporting evidence before taking action.",
    ];
    return result;
  }

  if (toolId === "document_search") {
    const requestedQuery = typeof body.query === "string" ? body.query.trim().slice(0, 160) : "";
    const requestedContainerId = body.containerId == null ? null : getLookupId(body.containerId, "container");
    if (requestedQuery.length < 2) throw new Error("Provide at least two characters to search uploaded documents.");
    const escapedQuery = requestedQuery.replace(/[\\%_]/g, " ").replace(/\s+/g, " ").trim();
    if (escapedQuery.length < 2) throw new Error("Provide a more specific document search term.");
    const conditions = [
      eq(documentIntelligenceIndexTable.status, "indexed"),
      or(
        ilike(documentIntelligenceIndexTable.contentText, `%${escapedQuery}%`),
        ilike(containerDocumentsTable.originalName, `%${escapedQuery}%`),
      ),
      ...(branchId == null ? [] : [eq(documentIntelligenceIndexTable.branchId, branchId)]),
      ...(requestedContainerId == null ? [] : [eq(documentIntelligenceIndexTable.containerId, requestedContainerId)]),
    ];
    const condition = and(...conditions);
    const rows = await db.select({
      documentId: documentIntelligenceIndexTable.documentId,
      containerId: documentIntelligenceIndexTable.containerId,
      originalName: containerDocumentsTable.originalName,
      section: documentIntelligenceIndexTable.section,
      pageText: documentIntelligenceIndexTable.pageText,
      contentText: documentIntelligenceIndexTable.contentText,
      pageCount: documentIntelligenceIndexTable.pageCount,
      containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName,
    }).from(documentIntelligenceIndexTable)
      .innerJoin(containerDocumentsTable, eq(documentIntelligenceIndexTable.documentId, containerDocumentsTable.id))
      .innerJoin(containersTable, eq(documentIntelligenceIndexTable.containerId, containersTable.id))
      .where(condition)
      .orderBy(desc(documentIntelligenceIndexTable.indexedAt))
      .limit(limit);
    const lowerQuery = escapedQuery.toLowerCase();
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Matching indexed documents", value: rows.length },
      { label: "Search term", value: escapedQuery },
      ...(requestedContainerId == null ? [] : [{ label: "Container filter", value: requestedContainerId }]),
    ];
    result.records = rows.map((row) => {
      const match = describeDocumentSearchMatch({
        pageText: row.pageText,
        contentText: row.contentText,
        originalName: row.originalName,
        query: lowerQuery,
      });
      const matchIndex = match.sourceText.toLowerCase().indexOf(lowerQuery);
      const start = Math.max(0, matchIndex - 110);
      const snippet = match.sourceText.slice(start, start + 280).replace(/\s+/g, " ").trim();
      return {
        title: row.originalName,
        detail: `${row.containerNumber} - ${match.label}${row.section ? ` - ${row.section}` : ""}${snippet ? `: ${snippet}` : ""}`,
        href: `/containers/${row.containerId}?tab=documents`,
        badges: ["Document", match.label],
      };
    });
    result.sources = rows.map((row) => ({
      type: "document",
      id: row.documentId,
      label: `${row.originalName} (${row.containerNumber})`,
      href: `/containers/${row.containerId}?tab=documents`,
    }));
    result.notes = [
      "Only readable, indexed documents within your authorised branch scope were searched.",
      "Open the linked container's Documents tab to view the source file; confirm wording against the original document.",
    ];
    return result;
  }

  const branches = scoped(await db.select({ id: branchesTable.id, branchId: branchesTable.id, name: branchesTable.name }).from(branchesTable), branchId);
  const containers = scoped(await db.select({ branchId: containersTable.branchId, status: containersTable.status }).from(containersTable), branchId);
  const invoices = scoped(await db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, total: invoicesTable.total }).from(invoicesTable), branchId);
  const payments = invoices.length ? await db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount })
    .from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoices.map((invoice) => invoice.id))) : [];
  const result = createResult(toolId, tool.title, branchId);
  result.records = branches.map((branch) => {
    const branchInvoices = invoices.filter((invoice) => invoice.branchId === branch.id);
    const invoiceIds = new Set(branchInvoices.map((invoice) => invoice.id));
    const invoiced = branchInvoices.reduce((sum, invoice) => sum + toAmount(invoice.total), 0);
    const collected = payments.filter((payment) => invoiceIds.has(payment.invoiceId)).reduce((sum, payment) => sum + toAmount(payment.amount), 0);
    const open = containers.filter((container) => container.branchId === branch.id && container.status !== "closed").length;
    return { title: branch.name, detail: `${open} open containers - ${money(invoiced)} invoiced - ${money(Math.max(0, invoiced - collected))} outstanding.`, href: "/branch-comparison", badges: ["Branch"] };
  });
  result.facts = [
    { label: "Branches in scope", value: branches.length },
    { label: "Open containers", value: containers.filter((container) => container.status !== "closed").length },
    { label: "Outstanding receivables", value: money(Math.max(0, invoices.reduce((sum, invoice) => sum + toAmount(invoice.total), 0) - payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0))) },
  ];
  result.sources = branches.map((branch) => ({ type: "branch", id: branch.id, label: branch.name, href: "/branch-comparison" }));
  return result;
}

type AssistantDraftType = "payment_schedule" | "workflow_notification" | "management_summary" | "follow_up_task" | "delay_follow_up_task" | "invoice_payment_reminder" | "payment_schedule_reschedule" | "debit_note";
type AssistantActionPreview = {
  title: string;
  description: string;
  confirmationText: string;
  fields: Array<{ label: string; value: string }>;
  sourceRecords: AssistantSource[];
};

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function formatActionDraft(draft: typeof aiAssistantActionDraftsTable.$inferSelect) {
  return {
    id: draft.id,
    type: draft.type,
    status: draft.status,
    payload: parseJson<Record<string, unknown>>(draft.payload, {}),
    preview: parseJson<AssistantActionPreview>(draft.preview, { title: "Draft", description: "", confirmationText: "", fields: [], sourceRecords: [] }),
    sourceRecords: parseJson<AssistantSource[]>(draft.sourceRecords, []),
    confirmationNote: draft.confirmationNote,
    confirmedAt: draft.confirmedAt?.toISOString() ?? null,
    executedAt: draft.executedAt?.toISOString() ?? null,
    executionResult: parseJson<Record<string, unknown> | null>(draft.executionResult ?? "null", null),
    expiresAt: draft.expiresAt.toISOString(),
    createdAt: draft.createdAt.toISOString(),
  };
}

function requireSpecificActionBranch(req: AuthRequest): number {
  const branchId = getBranchScope(req);
  if (branchId == null) throw new Error("Select a specific branch before preparing an assisted action.");
  return branchId;
}

async function draftPreview(type: AssistantDraftType, body: Record<string, unknown>, branchId: number): Promise<{ payload: Record<string, unknown>; preview: AssistantActionPreview }> {
  if (type === "payment_schedule") {
    const vendorBeneficiary = typeof body.vendorBeneficiary === "string" ? body.vendorBeneficiary.trim().slice(0, 200) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1_000) : "";
    const scheduleDate = typeof body.scheduleDate === "string" ? body.scheduleDate.trim() : "";
    const clientName = typeof body.clientName === "string" ? body.clientName.trim().slice(0, 200) : "";
    const amount = Number(body.amountRequested);
    const priority = ["low", "normal", "urgent"].includes(String(body.priority)) ? String(body.priority) : "normal";
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) ? new Date(`${scheduleDate}T00:00:00`) : null;
    if (!vendorBeneficiary || !description || !parsedDate || Number.isNaN(parsedDate.getTime()) || !Number.isFinite(amount) || amount <= 0) {
      throw new Error("A vendor, description, valid schedule date, and amount greater than zero are required for a payment schedule draft.");
    }
    const payload = { vendorBeneficiary, description, scheduleDate, clientName: clientName || null, amountRequested: amount, priority };
    return {
      payload,
      preview: {
        title: "Payment Schedule Draft",
        description: "This will create a Pending Approval payment schedule. It will not approve or pay any money.",
        confirmationText: "Confirm creation of this payment schedule draft? The normal MD approval workflow will still be required.",
        fields: [
          { label: "Vendor / beneficiary", value: vendorBeneficiary },
          { label: "Description", value: description },
          { label: "Requested amount", value: money(amount) },
          { label: "Schedule date", value: scheduleDate },
          { label: "Priority", value: priority },
        ],
        sourceRecords: [{ type: "payment_schedule", label: "New pending payment schedule", href: "/payment-schedules" }],
      },
    };
  }

  if (type === "workflow_notification") {
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 1_000) : "";
    const actionUrl = typeof body.actionUrl === "string" && body.actionUrl.startsWith("/") ? body.actionUrl.slice(0, 500) : "/notifications";
    if (!message) throw new Error("A notification message is required.");
    const payload = { message, actionUrl };
    return {
      payload,
      preview: {
        title: "Internal Notification Draft",
        description: "This will notify active Admin and Super Admin users in the selected branch. It does not send email, WhatsApp, or SMS.",
        confirmationText: "Confirm delivery of this internal workflow notification?",
        fields: [{ label: "Message", value: message }, { label: "Destination", value: "Selected branch administrators" }],
        sourceRecords: [{ type: "notification", label: "Notifications", href: actionUrl }],
      },
    };
  }

  if (type === "follow_up_task") {
    const containerNumber = typeof body.containerNumber === "string" ? body.containerNumber.trim().toUpperCase().slice(0, 32) : "";
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2_000) : "";
    const priority = ["low", "medium", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "medium";
    const dueDate = typeof body.dueDate === "string" && body.dueDate.trim() ? body.dueDate.trim() : null;
    const parsedDueDate = dueDate ? new Date(`${dueDate}T00:00:00`) : null;
    const assignedStaffId = body.assignedStaffId == null || body.assignedStaffId === "" ? null : Number(body.assignedStaffId);
    if (!containerNumber || !title || (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) || (assignedStaffId != null && (!Number.isInteger(assignedStaffId) || assignedStaffId <= 0))) {
      throw new Error("An exact container number and task title are required. Use a valid due date and branch staff member when provided.");
    }
    const [container] = await db.select({ id: containersTable.id, containerNumber: containersTable.containerNumber })
      .from(containersTable).where(and(eq(containersTable.branchId, branchId), eq(containersTable.containerNumber, containerNumber))).limit(1);
    if (!container) throw new Error("The container was not found in the selected branch.");
    let assigneeName: string | null = null;
    if (assignedStaffId != null) {
      const [assignee] = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(and(eq(usersTable.id, assignedStaffId), eq(usersTable.branchId, branchId), eq(usersTable.isActive, true))).limit(1);
      if (!assignee) throw new Error("The selected task assignee must be an active user in the selected branch.");
      assigneeName = assignee.name;
    }
    const payload = { containerId: container.id, containerNumber: container.containerNumber, title, notes, priority, dueDate, assignedStaffId };
    return {
      payload,
      preview: {
        title: "Container Follow-up Task Draft",
        description: "This will create an internal task only. It does not change the container's workflow stage, payments, or documentation status.",
        confirmationText: "Confirm creation of this follow-up task? The assigned staff member will receive the normal in-app task notification.",
        fields: [
          { label: "Container", value: container.containerNumber },
          { label: "Task", value: title },
          { label: "Assigned to", value: assigneeName ?? "Unassigned" },
          { label: "Due date", value: dueDate ?? "Not set" },
          { label: "Priority", value: priority },
          { label: "Notes", value: notes || "None" },
        ],
        sourceRecords: [{ type: "container", id: container.id, label: container.containerNumber, href: `/containers/${container.id}?tab=tasks` }],
      },
    };
  }

  if (type === "delay_follow_up_task") {
    const containerNumber = typeof body.containerNumber === "string" ? body.containerNumber.trim().toUpperCase().slice(0, 32) : "";
    const stage = getStageToolId(body.stage);
    const title = typeof body.title === "string" ? body.title.trim().slice(0, 300) : "";
    const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 2_000) : "";
    const priority = ["low", "medium", "high", "urgent"].includes(String(body.priority)) ? String(body.priority) : "high";
    const dueDate = typeof body.dueDate === "string" && body.dueDate.trim() ? body.dueDate.trim() : null;
    const parsedDueDate = dueDate ? new Date(`${dueDate}T00:00:00`) : null;
    const assignedStaffId = body.assignedStaffId == null || body.assignedStaffId === "" ? null : Number(body.assignedStaffId);
    if (!containerNumber || (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) || (assignedStaffId != null && (!Number.isInteger(assignedStaffId) || assignedStaffId <= 0))) {
      throw new Error("An exact container number is required. Use a valid due date and active branch staff member when provided.");
    }
    const [container] = await db.select().from(containersTable)
      .where(and(eq(containersTable.branchId, branchId), eq(containersTable.containerNumber, containerNumber))).limit(1);
    if (!container) throw new Error("The container was not found in the selected branch.");
    const containerData = container as unknown as Record<string, unknown>;
    const expectedDate = containerData[STAGE_TOOL_FIELDS[stage].expected] as Date | null;
    const releasedAt = containerData[STAGE_TOOL_FIELDS[stage].released] as Date | null;
    const stageLabel = operationalStageLabel(stage);
    if (releasedAt) throw new Error(`${stageLabel} has already been released for this container; a delay follow-up task is not appropriate.`);
    if (!expectedDate) throw new Error(`${stageLabel} has no expected date yet, so the assistant cannot classify it as overdue.`);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (expectedDate.getTime() >= startOfToday.getTime()) throw new Error(`${stageLabel} is not overdue yet. The assistant only drafts delay follow-up tasks for an overdue stage.`);
    const daysOverdue = Math.max(1, Math.floor((startOfToday.getTime() - expectedDate.getTime()) / 86_400_000));
    let assigneeName: string | null = null;
    if (assignedStaffId != null) {
      const [assignee] = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable).where(and(eq(usersTable.id, assignedStaffId), eq(usersTable.branchId, branchId), eq(usersTable.isActive, true))).limit(1);
      if (!assignee) throw new Error("The selected task assignee must be an active user in the selected branch.");
      assigneeName = assignee.name;
    }
    const taskTitle = title || `Follow up: ${stageLabel} overdue`;
    const payload = { containerId: container.id, containerNumber: container.containerNumber, stage, stageLabel, expectedDate: expectedDate.toISOString(), daysOverdue, title: taskTitle, notes, priority, dueDate, assignedStaffId };
    return {
      payload,
      preview: {
        title: "Overdue Stage Follow-up Task Draft",
        description: "This will create an internal follow-up task for a verified overdue stage only. It does not release the stage, change the job workflow, or contact an external party.",
        confirmationText: "Confirm creation of this internal overdue-stage follow-up task? The assigned staff member will receive an in-app task notification only.",
        fields: [
          { label: "Container", value: container.containerNumber },
          { label: "Overdue stage", value: stageLabel },
          { label: "Expected date", value: expectedDate.toISOString().slice(0, 10) },
          { label: "Days overdue", value: String(daysOverdue) },
          { label: "Task", value: taskTitle },
          { label: "Assigned to", value: assigneeName ?? "Unassigned" },
          { label: "Notes", value: notes || "None" },
        ],
        sourceRecords: [{ type: "container", id: container.id, label: container.containerNumber, href: `/containers/${container.id}?tab=tasks` }],
      },
    };
  }

  if (type === "invoice_payment_reminder") {
    const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim().toUpperCase().slice(0, 100) : "";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 1_000) : "";
    if (!invoiceNumber) throw new Error("Enter the exact invoice number for the internal payment reminder.");
    const [invoice] = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.branchId, branchId), eq(invoicesTable.invoiceNumber, invoiceNumber))).limit(1);
    if (!invoice) throw new Error("The invoice was not found in the selected branch.");
    if (invoice.status === "written_off") throw new Error("A written-off invoice cannot receive a payment reminder draft.");
    const payments = await db.select({ amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable)
      .where(and(eq(invoicePaymentsTable.branchId, branchId), eq(invoicePaymentsTable.invoiceId, invoice.id)));
    const paid = payments.reduce((total, payment) => total + toAmount(payment.amount), 0);
    const outstanding = Math.max(0, toAmount(invoice.total) - paid);
    if (outstanding <= 0.009) throw new Error("This invoice has no outstanding recorded balance, so no payment reminder is needed.");
    const [client] = invoice.clientId == null ? [] : await db.select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable).where(and(eq(clientsTable.id, invoice.clientId), eq(clientsTable.branchId, branchId))).limit(1);
    const payload = { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, clientName: client?.name ?? "Unlinked client", outstanding, dueDate: invoice.dueDate ?? null, note: note || null };
    return {
      payload,
      preview: {
        title: "Internal Invoice Payment Reminder Draft",
        description: "This creates an internal Accounts/Admin reminder only. It does not contact the client by email, WhatsApp, SMS, or any other external channel.",
        confirmationText: "Confirm delivery of this internal receivables reminder? Review and contact the client later through the normal approved communication workflow if needed.",
        fields: [
          { label: "Invoice", value: invoice.invoiceNumber },
          { label: "Client", value: client?.name ?? "Unlinked client" },
          { label: "Outstanding balance", value: money(outstanding) },
          { label: "Due date", value: invoice.dueDate ?? "Not set" },
          { label: "Internal note", value: note || "None" },
        ],
        sourceRecords: [{ type: "invoice", id: invoice.id, label: invoice.invoiceNumber, href: `/invoices/${invoice.id}` }],
      },
    };
  }

  if (type === "payment_schedule_reschedule") {
    const scheduleId = Number(body.scheduleId);
    const scheduleDate = typeof body.scheduleDate === "string" ? body.scheduleDate.trim() : "";
    const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 1_000) : "";
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(scheduleDate) ? new Date(`${scheduleDate}T00:00:00`) : null;
    if (!Number.isInteger(scheduleId) || scheduleId <= 0 || !parsedDate || Number.isNaN(parsedDate.getTime())) {
      throw new Error("A payment schedule ID and valid new schedule date are required.");
    }
    const [schedule] = await db.select().from(paymentSchedulesTable)
      .where(and(eq(paymentSchedulesTable.id, scheduleId), eq(paymentSchedulesTable.branchId, branchId))).limit(1);
    if (!schedule) throw new Error("The payment schedule was not found in the selected branch.");
    if (["completed", "rejected", "cancelled"].includes(schedule.status)) throw new Error("A completed, rejected, or cancelled payment schedule cannot be rescheduled.");
    const payload = { scheduleId, scheduleDate, comment: comment || null };
    return {
      payload,
      preview: {
        title: "Payment Schedule Reschedule Proposal",
        description: "This will change only the scheduled date. It will not approve, pay, cancel, or alter the requested amount.",
        confirmationText: "Confirm this new payment schedule date? The schedule owner will receive the normal reschedule notification.",
        fields: [
          { label: "Vendor / beneficiary", value: schedule.vendorBeneficiary },
          { label: "Current date", value: schedule.scheduleDate.toISOString().slice(0, 10) },
          { label: "New date", value: scheduleDate },
          { label: "Reason", value: comment || "No reason supplied" },
        ],
        sourceRecords: [{ type: "payment_schedule", id: schedule.id, label: schedule.vendorBeneficiary, href: `/payment-schedules?focus=${schedule.id}` }],
      },
    };
  }

  if (type === "debit_note") {
    const clientId = getLookupId(body.clientId, "client");
    const amount = Number(body.amount);
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1_000) : "";
    const reference = typeof body.reference === "string" ? body.reference.trim().slice(0, 200) : "";
    if (!Number.isFinite(amount) || amount <= 0 || !description) throw new Error("A client, description, and amount greater than zero are required for a debit note draft.");
    const [client] = await db.select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable).where(and(eq(clientsTable.id, clientId), eq(clientsTable.branchId, branchId))).limit(1);
    if (!client) throw new Error("The client was not found in the selected branch.");
    const payload = { clientId: client.id, clientName: client.name, amount, description, reference: reference || null };
    return {
      payload,
      preview: {
        title: "Debit Note Draft",
        description: "This is a review-only draft. It will not create an invoice, change a client balance, post an accounting entry, or send a document.",
        confirmationText: "Confirm finalisation of this draft for human review only? Issue it later through the normal reviewed finance workflow.",
        fields: [
          { label: "Client", value: client.name },
          { label: "Amount", value: money(amount) },
          { label: "Description", value: description },
          { label: "Reference", value: reference || "Not set" },
        ],
        sourceRecords: [{ type: "client", id: client.id, label: client.name, href: `/clients/${client.id}` }],
      },
    };
  }

  const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
  const content = typeof body.content === "string" ? body.content.trim().slice(0, 5_000) : "";
  if (!title || !content) throw new Error("A title and content are required for a management summary draft.");
  const payload = { title, content };
  return {
    payload,
    preview: {
      title: "Management Summary Draft",
      description: "This finalises a read-only management summary for review. It does not email, publish, or alter application records.",
      confirmationText: "Confirm finalisation of this management summary draft?",
      fields: [{ label: "Title", value: title }, { label: "Content", value: content }],
      sourceRecords: [{ type: "report", label: "Reports", href: "/reports" }],
    },
  };
}

async function activeBranchAdministrators(branchId: number): Promise<number[]> {
  const users = await db.select({ id: usersTable.id, branchId: usersTable.branchId, authorityLevel: usersTable.authorityLevel, jobFunction: usersTable.jobFunction, workspaceAccess: usersTable.workspaceAccess, accessProfileMigratedAt: usersTable.accessProfileMigratedAt })
    .from(usersTable).where(eq(usersTable.isActive, true));
  return users.filter((user) => {
    const profile = resolveAccessProfile(user);
    return hasAuthority(profile, "super_admin") || (user.branchId === branchId && profile.authorityLevel === "admin");
  }).map((user) => user.id);
}

async function activeBranchFinanceUsers(branchId: number): Promise<number[]> {
  const users = await db.select({ id: usersTable.id, branchId: usersTable.branchId, authorityLevel: usersTable.authorityLevel, jobFunction: usersTable.jobFunction, workspaceAccess: usersTable.workspaceAccess, accessProfileMigratedAt: usersTable.accessProfileMigratedAt })
    .from(usersTable).where(eq(usersTable.isActive, true));
  return users.filter((user) => {
    const profile = resolveAccessProfile(user);
    return hasAuthority(profile, "super_admin") || (user.branchId === branchId && (profile.authorityLevel === "admin" || profile.jobFunction === "accounts"));
  }).map((user) => user.id);
}

async function executeAssistantDraft(draft: typeof aiAssistantActionDraftsTable.$inferSelect, userId: number) {
  const type = draft.type as AssistantDraftType;
  const payload = parseJson<Record<string, unknown>>(draft.payload, {});
  const branchId = draft.branchId;
  if (branchId == null) throw new Error("This action draft has no branch scope.");

  if (type === "payment_schedule") {
    const prepared = await draftPreview(type, payload, branchId);
    const [schedule] = await db.insert(paymentSchedulesTable).values({
      branchId,
      scheduleDate: new Date(`${prepared.payload.scheduleDate as string}T00:00:00`),
      originalRequestDate: new Date(),
      requestedById: userId,
      vendorBeneficiary: prepared.payload.vendorBeneficiary as string,
      clientName: prepared.payload.clientName as string | null,
      description: prepared.payload.description as string,
      amountRequested: String(prepared.payload.amountRequested),
      amountApproved: "0",
      amountPaid: "0",
      priority: prepared.payload.priority as string,
      status: "pending_approval",
    }).returning();
    await db.insert(paymentScheduleEventsTable).values({
      branchId,
      scheduleId: schedule.id,
      type: "created",
      actorUserId: userId,
      comment: "Payment schedule created from a confirmed AI Assistant draft.",
      newStatus: "pending_approval",
    });
    const approvers = await activeBranchAdministrators(branchId);
    if (approvers.length) await db.insert(workflowNotificationsTable).values(approvers.map((targetUserId) => ({
      branchId,
      type: "payment_schedule_created",
      message: `AI Assistant draft confirmed: ${String(prepared.payload.vendorBeneficiary)} payment schedule awaits approval.`,
      actionUrl: `/payment-schedules?focus=${schedule.id}`,
      targetUserId,
    })));
    return { action: "payment_schedule_created", scheduleId: schedule.id, href: `/payment-schedules?focus=${schedule.id}` };
  }

  if (type === "workflow_notification") {
    const prepared = await draftPreview(type, payload, branchId);
    const recipients = await activeBranchAdministrators(branchId);
    if (!recipients.length) throw new Error("No active branch administrators are available to receive this notification.");
    await db.insert(workflowNotificationsTable).values(recipients.map((targetUserId) => ({
      branchId,
      type: "ai_assistant_notification",
      message: prepared.payload.message as string,
      actionUrl: prepared.payload.actionUrl as string,
      targetUserId,
    })));
    return { action: "workflow_notification_sent", recipientCount: recipients.length, href: prepared.payload.actionUrl as string };
  }

  if (type === "follow_up_task") {
    const prepared = await draftPreview(type, payload, branchId);
    const [task] = await db.insert(containerTasksTable).values({
      branchId,
      containerId: prepared.payload.containerId as number,
      title: prepared.payload.title as string,
      assignedStaffId: prepared.payload.assignedStaffId as number | null,
      dueDate: prepared.payload.dueDate ? new Date(`${prepared.payload.dueDate as string}T00:00:00`) : null,
      priority: prepared.payload.priority as string,
      notes: prepared.payload.notes as string,
      status: "pending",
      createdById: userId,
    }).returning();
    if (task.assignedStaffId) await db.insert(workflowNotificationsTable).values({
      branchId,
      type: "task_assigned",
      message: `Task assigned: "${task.title}" - ${prepared.payload.containerNumber as string}`,
      containerId: task.containerId,
      containerNumber: prepared.payload.containerNumber as string,
      targetUserId: task.assignedStaffId,
      actionUrl: `/containers/${task.containerId}?tab=tasks`,
    });
    return { action: "follow_up_task_created", taskId: task.id, href: `/containers/${task.containerId}?tab=tasks` };
  }

  if (type === "delay_follow_up_task") {
    const prepared = await draftPreview(type, payload, branchId);
    const [task] = await db.insert(containerTasksTable).values({
      branchId,
      containerId: prepared.payload.containerId as number,
      title: prepared.payload.title as string,
      assignedStaffId: prepared.payload.assignedStaffId as number | null,
      dueDate: prepared.payload.dueDate ? new Date(`${prepared.payload.dueDate as string}T00:00:00`) : null,
      priority: prepared.payload.priority as string,
      notes: `AI Assistant detected ${prepared.payload.stageLabel as string} overdue by ${prepared.payload.daysOverdue as number} day(s).${prepared.payload.notes ? ` ${prepared.payload.notes as string}` : ""}`,
      status: "pending",
      createdById: userId,
    }).returning();
    if (task.assignedStaffId) await db.insert(workflowNotificationsTable).values({
      branchId,
      type: "task_assigned",
      message: `Overdue ${prepared.payload.stageLabel as string} follow-up assigned: "${task.title}" - ${prepared.payload.containerNumber as string}`,
      containerId: task.containerId,
      containerNumber: prepared.payload.containerNumber as string,
      targetUserId: task.assignedStaffId,
      actionUrl: `/containers/${task.containerId}?tab=tasks`,
    });
    return { action: "delay_follow_up_task_created", taskId: task.id, href: `/containers/${task.containerId}?tab=tasks` };
  }

  if (type === "invoice_payment_reminder") {
    const prepared = await draftPreview(type, payload, branchId);
    const recipients = await activeBranchFinanceUsers(branchId);
    if (!recipients.length) throw new Error("No active Accounts, Admin, or Super Admin users are available in this branch.");
    const note = prepared.payload.note ? ` Note: ${prepared.payload.note as string}` : "";
    await db.insert(workflowNotificationsTable).values(recipients.map((targetUserId) => ({
      branchId,
      type: "ai_assistant_invoice_payment_reminder",
      message: `Internal payment follow-up: ${prepared.payload.invoiceNumber as string} for ${prepared.payload.clientName as string} has ${money(prepared.payload.outstanding as number)} outstanding.${note}`,
      targetUserId,
      actionUrl: `/invoices/${prepared.payload.invoiceId as number}`,
    })));
    return { action: "internal_invoice_payment_reminder_created", invoiceId: prepared.payload.invoiceId, recipientCount: recipients.length, href: `/invoices/${prepared.payload.invoiceId as number}` };
  }

  if (type === "payment_schedule_reschedule") {
    const prepared = await draftPreview(type, payload, branchId);
    const scheduleId = prepared.payload.scheduleId as number;
    const [schedule] = await db.select().from(paymentSchedulesTable)
      .where(and(eq(paymentSchedulesTable.id, scheduleId), eq(paymentSchedulesTable.branchId, branchId))).limit(1);
    if (!schedule || ["completed", "rejected", "cancelled"].includes(schedule.status)) throw new Error("This payment schedule is no longer eligible for rescheduling. Create a new draft from current data.");
    const nextDate = new Date(`${prepared.payload.scheduleDate as string}T00:00:00`);
    const [updated] = await db.update(paymentSchedulesTable).set({ scheduleDate: nextDate, updatedAt: new Date() })
      .where(eq(paymentSchedulesTable.id, schedule.id)).returning();
    await db.insert(paymentScheduleEventsTable).values({
      branchId,
      scheduleId: updated.id,
      type: "rescheduled",
      actorUserId: userId,
      comment: prepared.payload.comment as string | null,
      oldScheduleDate: schedule.scheduleDate,
      newScheduleDate: nextDate,
    });
    if (updated.requestedById) await db.insert(workflowNotificationsTable).values({
      branchId,
      type: "payment_schedule_rescheduled",
      message: `Payment schedule rescheduled for ${updated.vendorBeneficiary}`,
      targetUserId: updated.requestedById,
      actionUrl: `/payment-schedules?focus=${updated.id}`,
    });
    return { action: "payment_schedule_rescheduled", scheduleId: updated.id, href: `/payment-schedules?focus=${updated.id}` };
  }

  const prepared = await draftPreview(type, payload, branchId);
  if (type === "debit_note") {
    return { action: "debit_note_draft_finalised", title: "Debit Note Draft", href: `/clients/${prepared.payload.clientId as number}` };
  }
  return { action: "management_summary_finalised", title: prepared.payload.title, href: "/reports" };
}

const REPORT_REQUESTS = {
  monthly_finance: { toolId: "monthly_financial_report" as ToolId, title: "Monthly Revenue and Expense Report", needsPeriod: true },
  receivables: { toolId: "receivables_ageing" as ToolId, title: "Receivables and Ageing Report" },
  branch_performance: { toolId: "branch_performance" as ToolId, title: "Branch Performance Report" },
  operational_delays: { toolId: "delayed_jobs" as ToolId, title: "Operational Delays Report" },
  payment_schedules: { toolId: "approved_payment_schedules" as ToolId, title: "Approved Payment Schedules Report" },
  payment_summary: { toolId: "payment_summary" as ToolId, title: "Payment Summary Report", needsPeriod: true },
  client_statements: { toolId: "client_statements" as ToolId, title: "Client Statements Report" },
  overhead_statements: { toolId: "overhead_statements" as ToolId, title: "Overhead Expense Statements Report" },
  financial_controls: { toolId: "financial_control_review" as ToolId, title: "Financial Control Review" },
  management_briefing: { toolId: "financial_control_review" as ToolId, title: "Management Finance and Controls Briefing" },
} as const;

function formatReportDraft(draft: typeof aiAssistantReportDraftsTable.$inferSelect) {
  return {
    id: draft.id,
    reportType: draft.reportType,
    title: draft.title,
    branchId: draft.branchId,
    filters: parseJson<Record<string, unknown>>(draft.filters, {}),
    facts: parseJson<AssistantFact[]>(draft.facts, []),
    records: parseJson<AssistantRecord[]>(draft.records, []),
    sources: parseJson<AssistantSource[]>(draft.sourceRecords, []),
    notes: parseJson<string[]>(draft.notes, []),
    generatedAt: draft.generatedAt.toISOString(),
  };
}

aiAssistantRouter.get("/ai-assistant/status", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  try {
    const governance = await getAiGovernance();
    const providerAvailable = governance.providerEnabled && isNaturalLanguageRoutingConfigured();
    return res.json({
      phase: "evaluation_monitoring_and_rollout",
      available: true,
      modelConnected: providerAvailable,
      copilotMode: providerAvailable ? "natural_language_read_only_with_confirmed_actions" : "guided_read_only_with_confirmed_actions",
      naturalLanguageRouting: {
        configured: providerAvailable,
        provider: providerAvailable ? "OpenAI" : null,
        configurationHint: !governance.providerEnabled ? "Natural-language provider requests are disabled in AI Governance. Approved tools and report requests remain available." : isNaturalLanguageRoutingConfigured() ? null : "Set AI_ASSISTANT_OPENAI_API_KEY in Railway to enable natural-language tool selection.",
      },
      governance,
      canViewMonitoring: req.user!.role === "super_admin",
      approvedToolCount: TOOL_CATALOG.filter((tool) => governance.dataDomains.includes(tool.domain)).length,
      safeguards: [
        "Admin and Super Admin access only",
        "Read-only answers with a small, confirmation-gated action set",
        "No direct database access",
        "Only approved, permission-scoped tools can read live data",
        "Each permitted action is previewed, confirmation-gated, branch-scoped, and audited",
        "Every tool result records its sources and audit event",
        "Natural-language provider can be disabled immediately without affecting approved tools or reports",
        "Rollout access, questions, feedback, and failures are monitored in the audit trail",
      ],
    });
  } catch (error) {
    console.error("[ai-assistant] Failed to load foundation status", error);
    return res.status(500).json({ error: "Unable to load AI assistant status" });
  }
});

aiAssistantRouter.get("/ai-assistant/reports/drafts", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const branchId = getBranchScope(req);
  const rows = await db.select().from(aiAssistantReportDraftsTable)
    .where(eq(aiAssistantReportDraftsTable.requestedById, req.user!.id))
    .orderBy(desc(aiAssistantReportDraftsTable.generatedAt)).limit(20);
  return res.json(rows.filter((row) => row.branchId === branchId).map(formatReportDraft));
});

aiAssistantRouter.post("/ai-assistant/reports/drafts", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const reportType = typeof body.reportType === "string" ? body.reportType : "";
  const requested = REPORT_REQUESTS[reportType as keyof typeof REPORT_REQUESTS];
  if (!requested) return res.status(400).json({ error: "Choose a supported report type." });
  try {
    const filters = ("needsPeriod" in requested && requested.needsPeriod === true)
      ? (() => { const period = getReportPeriod(body); return { from: period.from.toISOString().slice(0, 10), to: period.to.toISOString().slice(0, 10), limit: 50 }; })()
      : { limit: 50 };
    const result = await runApprovedTool(requested.toolId, req, filters);
    const [draft] = await db.insert(aiAssistantReportDraftsTable).values({
      requestedById: req.user!.id,
      branchId: getBranchScope(req),
      reportType,
      title: requested.title,
      filters: JSON.stringify(filters),
      facts: JSON.stringify(result.facts),
      records: JSON.stringify(result.records),
      sourceRecords: JSON.stringify(result.sources),
      notes: JSON.stringify(result.notes),
    }).returning();
    await recordAiAssistantAuditEvent({
      userId: req.user!.id, branchId: getBranchScope(req), eventType: "report_draft_generated",
      requestSummary: `Generated ${requested.title}`, responseSummary: `${result.facts.length} facts and ${result.records.length} records`,
      toolName: `report:${requested.toolId}`, recordReferences: result.sources,
      metadata: { reportDraftId: draft.id, reportType, filters, generatedAt: draft.generatedAt.toISOString() },
    });
    return res.status(201).json(formatReportDraft(draft));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare report draft.";
    return res.status(message.includes("disabled by AI Assistant governance") ? 403 : 400).json({ error: message });
  }
});

aiAssistantRouter.get("/ai-assistant/tools", requireAdmin, foundationRateLimit, async (_req: AuthRequest, res) => {
  try {
    const [setting] = await db.select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "aiAssistantGovernance"))
      .limit(1);
    const governance = parseGovernance(setting?.value);
    return res.json(TOOL_CATALOG.filter((tool) => governance.dataDomains.includes(tool.domain)));
  } catch (error) {
    console.error("[ai-assistant] Failed to load approved tool catalogue", error);
    return res.status(500).json({ error: "Unable to load approved AI data tools" });
  }
});

aiAssistantRouter.get("/ai-assistant/suggestions", requireAdmin, foundationRateLimit, (_req: AuthRequest, res) => {
  return res.json(SUGGESTED_QUESTIONS);
});

aiAssistantRouter.get("/ai-assistant/briefings", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  try {
    const limit = getRequestedLimit(req.query.limit);
    const branchId = getBranchScope(req);
    const rows = branchId == null
      ? await db.select().from(aiAssistantBriefingsTable).orderBy(desc(aiAssistantBriefingsTable.generatedAt)).limit(limit)
      : await db.select().from(aiAssistantBriefingsTable).where(eq(aiAssistantBriefingsTable.branchId, branchId)).orderBy(desc(aiAssistantBriefingsTable.generatedAt)).limit(limit);
    return res.json(rows.map(formatProactiveBriefing));
  } catch (error) {
    console.error("[ai-assistant] Failed to load proactive briefings", error);
    return res.status(500).json({ error: "Unable to load proactive briefings" });
  }
});

aiAssistantRouter.post("/ai-assistant/briefings/generate", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  try {
    const branchId = requireSpecificActionBranch(req);
    const briefing = await generateProactiveBriefing(branchId, "on_demand", true);
    await recordAiAssistantAuditEvent({
      userId: req.user!.id,
      branchId,
      eventType: "proactive_briefing_generated",
      requestSummary: "Generated an on-demand finance and control briefing",
      responseSummary: briefing.summary,
      toolName: "proactive_briefing",
      metadata: { briefingId: briefing.id, insightCount: briefing.insightCount },
    });
    return res.status(201).json(formatProactiveBriefing(briefing));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to generate proactive briefing";
    return res.status(400).json({ error: message });
  }
});

aiAssistantRouter.get("/ai-assistant/actions/drafts", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  try {
    const requestedLimit = Number(req.query.limit ?? 20);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
    const branchScope = getBranchScope(req);
    const conditions = branchScope == null
      ? eq(aiAssistantActionDraftsTable.requestedById, req.user!.id)
      : and(eq(aiAssistantActionDraftsTable.requestedById, req.user!.id), eq(aiAssistantActionDraftsTable.branchId, branchScope));
    const drafts = await db.select().from(aiAssistantActionDraftsTable).where(conditions)
      .orderBy(desc(aiAssistantActionDraftsTable.createdAt)).limit(limit);
    return res.json(drafts.map(formatActionDraft));
  } catch (error) {
    console.error("[ai-assistant] Failed to load action drafts", error);
    return res.status(500).json({ error: "Unable to load assistant action drafts" });
  }
});

aiAssistantRouter.post("/ai-assistant/actions/drafts", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const type = String(body.type ?? "") as AssistantDraftType;
  if (!["payment_schedule", "workflow_notification", "management_summary", "follow_up_task", "delay_follow_up_task", "invoice_payment_reminder", "payment_schedule_reschedule", "debit_note"].includes(type)) {
    return res.status(400).json({ error: "Unsupported assisted action type." });
  }
  try {
    const branchId = requireSpecificActionBranch(req);
    const [setting] = await db.select({ value: settingsTable.value }).from(settingsTable)
      .where(eq(settingsTable.key, "aiAssistantGovernance")).limit(1);
    const governance = parseGovernance(setting?.value);
    if (governance.actionPolicy !== "human_confirmation_required") return res.status(403).json({ error: "Assisted actions are disabled by AI Assistant governance." });
    const prepared = await draftPreview(type, body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {}, branchId);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const [draft] = await db.insert(aiAssistantActionDraftsTable).values({
      requestedById: req.user!.id,
      branchId,
      type,
      status: "draft",
      payload: JSON.stringify(prepared.payload),
      sourceRecords: JSON.stringify(prepared.preview.sourceRecords),
      preview: JSON.stringify(prepared.preview),
      expiresAt,
    }).returning();
    await recordAiAssistantAuditEvent({
      userId: req.user!.id,
      branchId,
      eventType: "assisted_action_draft_created",
      requestSummary: `Created ${type} draft`,
      responseSummary: prepared.preview.title,
      toolName: `draft:${type}`,
      recordReferences: prepared.preview.sourceRecords,
      metadata: { draftId: draft.id, type, expiresAt: expiresAt.toISOString() },
    });
    return res.status(201).json(formatActionDraft(draft));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to prepare assisted action draft";
    console.error("[ai-assistant] Draft creation failed", error);
    return res.status(400).json({ error: message });
  }
});

aiAssistantRouter.post("/ai-assistant/actions/drafts/:id/confirm", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid action draft id." });
  const confirmationNote = typeof req.body?.confirmationNote === "string" ? req.body.confirmationNote.trim().slice(0, 500) : null;
  let lockedDraft: typeof aiAssistantActionDraftsTable.$inferSelect | undefined;
  try {
    const [existing] = await db.select().from(aiAssistantActionDraftsTable)
      .where(and(eq(aiAssistantActionDraftsTable.id, id), eq(aiAssistantActionDraftsTable.requestedById, req.user!.id)))
      .limit(1);
    if (!existing) return res.status(404).json({ error: "Action draft not found." });
    const branchScope = getBranchScope(req);
    if (branchScope != null && existing.branchId !== branchScope) return res.status(404).json({ error: "Action draft not found." });
    if (existing.status !== "draft") return res.status(409).json({ error: "This draft has already been confirmed, cancelled, or processed." });
    if (existing.expiresAt.getTime() <= Date.now()) {
      await db.update(aiAssistantActionDraftsTable).set({ status: "expired", updatedAt: new Date() }).where(eq(aiAssistantActionDraftsTable.id, existing.id));
      return res.status(410).json({ error: "This action draft has expired. Create a new draft from current data." });
    }
    const [locked] = await db.update(aiAssistantActionDraftsTable).set({ status: "executing", updatedAt: new Date() })
      .where(and(eq(aiAssistantActionDraftsTable.id, existing.id), eq(aiAssistantActionDraftsTable.status, "draft"))).returning();
    if (!locked) return res.status(409).json({ error: "This action draft is already being processed." });
    lockedDraft = locked;
    const executionResult = await executeAssistantDraft(locked, req.user!.id);
    const now = new Date();
    const [confirmed] = await db.update(aiAssistantActionDraftsTable).set({
      status: "confirmed",
      confirmationNote,
      confirmedAt: now,
      executedAt: now,
      executionResult: JSON.stringify(executionResult),
      updatedAt: now,
    }).where(eq(aiAssistantActionDraftsTable.id, locked.id)).returning();
    await recordAiAssistantAuditEvent({
      userId: req.user!.id,
      branchId: locked.branchId,
      eventType: "assisted_action_confirmed",
      requestSummary: `Confirmed ${locked.type} draft ${locked.id}`,
      responseSummary: String(executionResult.action),
      toolName: `confirm:${locked.type}`,
      recordReferences: parseJson<AssistantSource[]>(locked.sourceRecords, []),
      metadata: { draftId: locked.id, executionResult },
    });
    return res.json({ success: true, draft: formatActionDraft(confirmed), executionResult });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to confirm assisted action";
    console.error("[ai-assistant] Draft confirmation failed", error);
    if (lockedDraft) {
      await db.update(aiAssistantActionDraftsTable).set({
        status: "failed",
        executionResult: JSON.stringify({ error: message }),
        updatedAt: new Date(),
      }).where(eq(aiAssistantActionDraftsTable.id, lockedDraft.id));
    }
    return res.status(400).json({ error: message });
  }
});

aiAssistantRouter.post("/ai-assistant/actions/drafts/:id/cancel", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid action draft id." });
  const [cancelled] = await db.update(aiAssistantActionDraftsTable).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(aiAssistantActionDraftsTable.id, id), eq(aiAssistantActionDraftsTable.requestedById, req.user!.id), eq(aiAssistantActionDraftsTable.status, "draft")))
    .returning();
  if (!cancelled) return res.status(404).json({ error: "Active action draft not found." });
  await recordAiAssistantAuditEvent({ userId: req.user!.id, branchId: cancelled.branchId, eventType: "assisted_action_cancelled", requestSummary: `Cancelled ${cancelled.type} draft ${cancelled.id}`, toolName: `cancel:${cancelled.type}` });
  return res.json({ success: true, draft: formatActionDraft(cancelled) });
});

aiAssistantRouter.post("/ai-assistant/ask", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 1_000) return res.status(400).json({ error: "Ask a question between 1 and 1,000 characters." });

  let activeSessionId: number | null = null;
  const startedAt = Date.now();
  try {
    const session = await getOrCreateSession(req, body.sessionId, question);
    activeSessionId = session.id;
    const sessionContext = !session.contextExpiresAt || session.contextExpiresAt.getTime() > Date.now()
      ? parseAiConversationContext(session.conversationContext, getBranchScope(req), TOOL_IDS)
      : null;
    const governance = await getAiGovernance();
    if (governance.providerEnabled && isNaturalLanguageRoutingConfigured() && governance.monthlyBudgetNgn > 0 && await currentMonthProviderCostNgn() >= governance.monthlyBudgetNgn) {
      return res.status(429).json({ error: "The configured monthly AI budget has been reached. Approved local tools and reports remain available after the provider is disabled in Settings." });
    }
    const providerUsages: AiProviderUsage[] = [];
    const trackUsage = (usage: AiProviderUsage) => providerUsages.push(usage);
    const intent = await interpretNaturalLanguageQuestion(question, req, sessionContext, trackUsage);
    const result = intent.toolId ? await runApprovedTool(intent.toolId, req, intent.args) : undefined;
    const answer = await makeCopilotAnswer(session.id, question, intent, result, governance.providerEnabled && isNaturalLanguageRoutingConfigured(), trackUsage);
    const now = new Date();
    const nextContext = intent.toolId && result ? buildAiConversationContext({
      branchId: getBranchScope(req),
      lastToolId: intent.toolId,
      lastToolArgs: intent.args,
      records: [
        ...result.records.map((record) => ({ id: null, title: record.title, href: record.href })),
        ...result.sources.map((source) => ({ id: source.id ?? null, title: source.label, href: source.href })),
      ],
      updatedAt: now.toISOString(),
    }) : null;
    await db.update(aiAssistantSessionsTable).set({
      updatedAt: now,
      ...(nextContext
        ? { conversationContext: JSON.stringify(nextContext), contextExpiresAt: new Date(now.getTime() + CONTEXT_TTL_MS) }
        : { conversationContext: null, contextExpiresAt: null }),
    }).where(eq(aiAssistantSessionsTable.id, session.id));
    await recordAiAssistantAuditEvent({
      userId: req.user!.id,
      branchId: getBranchScope(req),
      sessionId: session.id,
      eventType: "copilot_question_answered",
      requestSummary: question,
      responseSummary: answer.answer,
      toolName: intent.toolId ?? "none",
      recordReferences: answer.citations,
      metadata: { intent: intent.label, status: answer.status, factCount: answer.facts.length, citationCount: answer.citations.length, naturalLanguageRoutingConfigured: governance.providerEnabled && isNaturalLanguageRoutingConfigured(), providerEnabled: governance.providerEnabled, latencyMs: Date.now() - startedAt, contextUsed: !!sessionContext, providerUsage: providerUsages, estimatedProviderCostNgn: providerCostNgn(providerUsages, governance), contextExpiresAt: nextContext ? new Date(now.getTime() + CONTEXT_TTL_MS).toISOString() : session.contextExpiresAt?.toISOString() ?? null },
    });
    return res.json(answer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to answer the assistant question";
    console.error("[ai-assistant] Copilot question failed", error);
    try {
      await recordAiAssistantAuditEvent({
        userId: req.user!.id,
        branchId: getBranchScope(req),
        sessionId: activeSessionId,
        eventType: "copilot_question_failed",
        requestSummary: question,
        responseSummary: message,
        metadata: { sessionId: activeSessionId, latencyMs: Date.now() - startedAt },
      });
    } catch (auditError) {
      console.error("[ai-assistant] Failed to audit copilot error", auditError);
    }
    return res.status(message.includes("disabled by AI Assistant governance") ? 403 : 400).json({ error: message });
  }
});

aiAssistantRouter.post("/ai-assistant/feedback", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const rating = body.rating === "helpful" || body.rating === "not_helpful" ? body.rating : null;
  const sessionId = Number(body.sessionId);
  const comment = typeof body.comment === "string" ? body.comment.trim().slice(0, 500) : "";
  if (!rating || !Number.isInteger(sessionId) || sessionId <= 0) return res.status(400).json({ error: "Provide a valid answer session and feedback rating." });
  const [session] = await db.select().from(aiAssistantSessionsTable).where(and(eq(aiAssistantSessionsTable.id, sessionId), eq(aiAssistantSessionsTable.userId, req.user!.id))).limit(1);
  if (!session) return res.status(404).json({ error: "AI Assistant session was not found." });
  await recordAiAssistantAuditEvent({ userId: req.user!.id, branchId: getBranchScope(req), sessionId, eventType: "copilot_feedback", requestSummary: rating, responseSummary: comment || null, metadata: { rating } });
  return res.status(201).json({ success: true });
});

aiAssistantRouter.get("/ai-assistant/monitoring", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  if (req.user!.role !== "super_admin") return res.status(403).json({ error: "Only Super Admins can view AI monitoring." });
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db.select().from(aiAssistantAuditLogsTable).orderBy(desc(aiAssistantAuditLogsTable.createdAt)).limit(1000);
  const recent = rows.filter((row) => row.createdAt >= since && (getBranchScope(req) == null || row.branchId === getBranchScope(req)));
  const questions = recent.filter((row) => row.eventType === "copilot_question_answered");
  const failures = recent.filter((row) => row.eventType === "copilot_question_failed");
  const feedback = recent.filter((row) => row.eventType === "copilot_feedback");
  const meta = parseAuditMetadata;
  const latencies = questions.map((row) => Number(meta(row.metadata).latencyMs)).filter(Number.isFinite);
  const inputTokens = questions.reduce((total, row) => total + providerUsageTokens(meta(row.metadata), "inputTokens"), 0);
  const outputTokens = questions.reduce((total, row) => total + providerUsageTokens(meta(row.metadata), "outputTokens"), 0);
  const estimatedCostNgn = questions.reduce((total, row) => total + (Number(meta(row.metadata).estimatedProviderCostNgn) || 0), 0);
  return res.json({ periodDays: 30, questions: questions.length, failures: failures.length, unsupported: questions.filter((row) => meta(row.metadata).status === "unsupported").length, averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null, providerRequests: questions.filter((row) => meta(row.metadata).naturalLanguageRoutingConfigured === true).length, providerCost: { currency: "NGN", amount: estimatedCostNgn, inputTokens, outputTokens, note: "Estimated from provider usage returned for each request and the token prices configured in AI Governance." }, feedback: { helpful: feedback.filter((row) => meta(row.metadata).rating === "helpful").length, notHelpful: feedback.filter((row) => meta(row.metadata).rating === "not_helpful").length } });
});

function requireEvaluationAdministrator(req: AuthRequest, res: Response): boolean {
  if (req.user?.role === "super_admin") return true;
  res.status(403).json({ error: "Only Super Admins can manage AI Assistant evaluation cases." });
  return false;
}

function formatEvaluationCase(
  evaluationCase: typeof aiAssistantEvaluationCasesTable.$inferSelect,
  latestRun?: typeof aiAssistantEvaluationRunsTable.$inferSelect,
) {
  return {
    id: evaluationCase.id,
    caseKey: evaluationCase.caseKey,
    question: evaluationCase.question,
    businessInterpretation: evaluationCase.businessInterpretation,
    expectedTool: evaluationCase.expectedTool,
    expectedStatus: evaluationCase.expectedStatus,
    expectedAnswer: evaluationCase.expectedAnswer,
    correctionGuidance: evaluationCase.correctionGuidance,
    isActive: evaluationCase.isActive,
    updatedAt: evaluationCase.updatedAt.toISOString(),
    latestRun: latestRun ? {
      id: latestRun.id,
      mode: latestRun.mode,
      outcome: latestRun.outcome,
      actualTool: latestRun.actualTool,
      actualStatus: latestRun.actualStatus,
      actualInterpretation: latestRun.actualInterpretation,
      correctionRequired: latestRun.correctionRequired,
      correctionNote: latestRun.correctionNote,
      runAt: latestRun.runAt.toISOString(),
    } : null,
  };
}

aiAssistantRouter.get("/ai-assistant/evaluations", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  if (!requireEvaluationAdministrator(req, res)) return;
  try {
    const cases = await db.select().from(aiAssistantEvaluationCasesTable).orderBy(aiAssistantEvaluationCasesTable.caseKey).limit(250);
    const runs = await db.select().from(aiAssistantEvaluationRunsTable).orderBy(desc(aiAssistantEvaluationRunsTable.runAt)).limit(1000);
    const latestRuns = new Map<number, typeof aiAssistantEvaluationRunsTable.$inferSelect>();
    for (const run of runs) if (!latestRuns.has(run.caseId)) latestRuns.set(run.caseId, run);
    const recentRuns = runs.filter((run) => run.runAt >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const failed = recentRuns.filter((run) => run.outcome === "failed");
    return res.json({
      cases: cases.map((evaluationCase) => formatEvaluationCase(evaluationCase, latestRuns.get(evaluationCase.id))),
      summary: {
        activeCases: cases.filter((evaluationCase) => evaluationCase.isActive).length,
        recentRuns: recentRuns.length,
        passed: recentRuns.filter((run) => run.outcome === "passed").length,
        failed: failed.length,
        correctionsRequired: failed.filter((run) => run.correctionRequired).length,
      },
    });
  } catch (error) {
    console.error("[ai-assistant] Failed to load evaluation library", error);
    return res.status(500).json({ error: "Unable to load AI Assistant evaluation library" });
  }
});

aiAssistantRouter.post("/ai-assistant/evaluations/cases", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  if (!requireEvaluationAdministrator(req, res)) return;
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const caseKey = typeof body.caseKey === "string" ? body.caseKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100) : "";
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  const businessInterpretation = typeof body.businessInterpretation === "string" ? body.businessInterpretation.trim().slice(0, 2000) : "";
  const expectedTool = typeof body.expectedTool === "string" && TOOL_IDS.has(body.expectedTool) ? body.expectedTool : null;
  const expectedStatus = body.expectedStatus === "unsupported" ? "unsupported" : "answered";
  const expectedAnswer = typeof body.expectedAnswer === "string" ? body.expectedAnswer.trim().slice(0, 2000) || null : null;
  const correctionGuidance = typeof body.correctionGuidance === "string" ? body.correctionGuidance.trim().slice(0, 2000) : "";
  if (!caseKey || !question || !businessInterpretation || (expectedStatus === "answered" && !expectedTool)) {
    return res.status(400).json({ error: "Provide a case key, question, business interpretation, and an expected approved tool for answered cases." });
  }
  try {
    const [created] = await db.insert(aiAssistantEvaluationCasesTable).values({
      caseKey, question, businessInterpretation, expectedTool, expectedStatus, expectedAnswer, correctionGuidance, createdById: req.user!.id,
    }).returning();
    await recordAiAssistantAuditEvent({ userId: req.user!.id, eventType: "evaluation_case_created", requestSummary: question, responseSummary: caseKey, metadata: { caseId: created.id, expectedTool, expectedStatus } });
    return res.status(201).json(formatEvaluationCase(created));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create evaluation case";
    return res.status(400).json({ error: message.includes("unique") ? "That evaluation case key already exists." : message });
  }
});

aiAssistantRouter.patch("/ai-assistant/evaluations/cases/:id", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  if (!requireEvaluationAdministrator(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid evaluation case id." });
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
  const fields: Partial<typeof aiAssistantEvaluationCasesTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof body.businessInterpretation === "string") fields.businessInterpretation = body.businessInterpretation.trim().slice(0, 2000);
  if (typeof body.expectedAnswer === "string") fields.expectedAnswer = body.expectedAnswer.trim().slice(0, 2000) || null;
  if (typeof body.correctionGuidance === "string") fields.correctionGuidance = body.correctionGuidance.trim().slice(0, 2000);
  if (typeof body.isActive === "boolean") fields.isActive = body.isActive;
  if (typeof body.expectedTool === "string" && TOOL_IDS.has(body.expectedTool)) fields.expectedTool = body.expectedTool;
  if (body.expectedStatus === "answered" || body.expectedStatus === "unsupported") fields.expectedStatus = body.expectedStatus;
  try {
    const [updated] = await db.update(aiAssistantEvaluationCasesTable).set(fields).where(eq(aiAssistantEvaluationCasesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Evaluation case not found." });
    await recordAiAssistantAuditEvent({ userId: req.user!.id, eventType: "evaluation_case_updated", requestSummary: updated.caseKey, responseSummary: updated.correctionGuidance || null, metadata: { caseId: updated.id } });
    return res.json(formatEvaluationCase(updated));
  } catch (error) {
    console.error("[ai-assistant] Failed to update evaluation case", error);
    return res.status(400).json({ error: "Unable to update evaluation case" });
  }
});

aiAssistantRouter.post("/ai-assistant/evaluations/run", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  if (!requireEvaluationAdministrator(req, res)) return;
  try {
    const cases = await db.select().from(aiAssistantEvaluationCasesTable).where(eq(aiAssistantEvaluationCasesTable.isActive, true)).orderBy(aiAssistantEvaluationCasesTable.caseKey).limit(250);
    const runs = [] as Array<typeof aiAssistantEvaluationRunsTable.$inferSelect>;
    for (const evaluationCase of cases) {
      // Deliberately deterministic: the suite tests business routing without an
      // OpenAI request, live data query, or external side effect.
      const intent = interpretQuestionFallback(evaluationCase.question);
      const actualTool = intent.toolId;
      const actualStatus = actualTool ? "answered" : "unsupported";
      const passed = actualTool === evaluationCase.expectedTool && actualStatus === evaluationCase.expectedStatus;
      const [run] = await db.insert(aiAssistantEvaluationRunsTable).values({
        caseId: evaluationCase.id,
        runById: req.user!.id,
        mode: "deterministic",
        outcome: passed ? "passed" : "failed",
        actualTool,
        actualStatus,
        actualInterpretation: intent.label,
        correctionRequired: !passed,
        correctionNote: passed ? null : `Expected ${evaluationCase.expectedStatus}${evaluationCase.expectedTool ? ` via ${evaluationCase.expectedTool}` : " without a tool"}; received ${actualStatus}${actualTool ? ` via ${actualTool}` : " without a tool"}.`,
      }).returning();
      runs.push(run);
    }
    const failed = runs.filter((run) => run.outcome === "failed");
    await recordAiAssistantAuditEvent({ userId: req.user!.id, eventType: "evaluation_suite_run", requestSummary: `Ran ${runs.length} active evaluation cases`, responseSummary: `${runs.length - failed.length} passed, ${failed.length} failed`, metadata: { total: runs.length, passed: runs.length - failed.length, failed: failed.length, mode: "deterministic" } });
    return res.status(201).json({ total: runs.length, passed: runs.length - failed.length, failed: failed.length, runs: runs.map((run) => ({ caseId: run.caseId, outcome: run.outcome, actualTool: run.actualTool, actualStatus: run.actualStatus, correctionNote: run.correctionNote })) });
  } catch (error) {
    console.error("[ai-assistant] Evaluation suite failed", error);
    return res.status(500).json({ error: "Unable to run AI Assistant evaluation suite" });
  }
});

aiAssistantRouter.post("/ai-assistant/tools/:toolId", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  const toolId = String(req.params.toolId ?? "");
  if (!TOOL_IDS.has(toolId)) return res.status(404).json({ error: "Unknown AI data tool" });

  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
    const result = await runApprovedTool(toolId as ToolId, req, body);
    await recordAiAssistantAuditEvent({
      userId: req.user!.id,
      branchId: getBranchScope(req),
      eventType: "approved_data_tool_used",
      requestSummary: `Ran approved data tool: ${toolId}`,
      responseSummary: `${result.facts.map((fact) => `${fact.label}: ${fact.value}`).join("; ")}`,
      toolName: toolId,
      recordReferences: result.sources,
      metadata: { toolId, recordCount: result.records.length, scope: result.scope },
    });
    return res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to run approved AI data tool";
    console.error("[ai-assistant] Approved data tool failed", { toolId, error });
    return res.status(message.includes("disabled by AI Assistant governance") ? 403 : 400).json({ error: message });
  }
});

aiAssistantRouter.get("/ai-assistant/audit", requireAdmin, foundationRateLimit, async (req: AuthRequest, res) => {
  try {
    const requestedLimit = Number(req.query.limit ?? 50);
    const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
    const branchScope = getBranchScope(req);
    const conditions = req.user?.role === "super_admin"
      ? (branchScope == null ? undefined : eq(aiAssistantAuditLogsTable.branchId, branchScope))
      : and(eq(aiAssistantAuditLogsTable.userId, req.user!.id), eq(aiAssistantAuditLogsTable.branchId, req.user!.branchId));
    const rows = conditions
      ? await db.select().from(aiAssistantAuditLogsTable).where(conditions).orderBy(desc(aiAssistantAuditLogsTable.createdAt)).limit(limit)
      : await db.select().from(aiAssistantAuditLogsTable).orderBy(desc(aiAssistantAuditLogsTable.createdAt)).limit(limit);
    return res.json(rows);
  } catch (error) {
    console.error("[ai-assistant] Failed to list audit events", error);
    return res.status(500).json({ error: "Unable to load AI assistant audit history" });
  }
});
