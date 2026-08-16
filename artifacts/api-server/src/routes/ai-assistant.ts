import { NextFunction, Response, Router } from "express";
import {
  aiAssistantAuditLogsTable,
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
  documentIntelligenceIndexTable,
  db,
  expensePaymentsTable,
  invoicePaymentsTable,
  invoicesTable,
  overheadExpensesTable,
  paymentSchedulesTable,
  paymentScheduleEventsTable,
  settingsTable,
  usersTable,
  workflowNotificationsTable,
} from "@workspace/db";
import { and, desc, eq, ilike, inArray, ne } from "drizzle-orm";
import { AuthRequest, getBranchScope, requireAdmin } from "../lib/auth.js";
import { formatProactiveBriefing, generateProactiveBriefing } from "../lib/ai-proactive-intelligence.js";
import { generateEvidenceBasedAnswer, isNaturalLanguageRoutingConfigured, selectToolWithNaturalLanguage } from "../lib/ai-tool-selection.js";
import { AiConversationContext, buildAiConversationContext, parseAiConversationContext, resolveConversationFollowUp } from "../lib/ai-conversation-context.js";
import { getOperationalStatusCounts, isContainerPhysicallyInTerminal, operationalStageLabel } from "../lib/operational-definitions.js";

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
    };
  } catch {
    return DEFAULT_GOVERNANCE;
  }
}

async function getAiGovernance(): Promise<AiAssistantGovernance> {
  const [setting] = await db.select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "aiAssistantGovernance"))
    .limit(1);
  return parseGovernance(setting?.value);
}

function canUseAiAssistant(user: NonNullable<AuthRequest["user"]>, governance: AiAssistantGovernance): boolean {
  if (user.role === "super_admin") return true;
  if (user.role !== "admin") return false;
  if (governance.rolloutStage === "all_authorized_admins") return true;
  return governance.rolloutStage === "selected_admins" && governance.selectedAdminUserIds.includes(user.id);
}

async function requireAiAssistantRollout(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const governance = await getAiGovernance();
    if (!req.user || !canUseAiAssistant(req.user, governance)) {
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
  { id: "container_documents", title: "Container documents", description: "List every uploaded document attached to one exact container, including files that are not text-searchable.", domain: "documents" as const, requiresContainer: true },
  { id: "container_payment_history", title: "Container payment history", description: "Show recorded container disbursements for one exact container.", domain: "finance" as const, requiresContainer: true },
  { id: "invoice_status", title: "Invoice status", description: "Show the total, collections, balance, and linked record for one exact invoice.", domain: "finance" as const, requiresInvoice: true },
  { id: "client_balance", title: "Client balance", description: "Show receivable balance and credit for one authorised client.", domain: "finance" as const, requiresClient: true },
  { id: "receivables_overview", title: "Receivables overview", description: "Review invoiced, collected, outstanding, and overdue client balances.", domain: "finance" as const },
  { id: "approved_payment_schedules", title: "Approved schedules awaiting payment", description: "Show approved or partially approved payment schedules with an unpaid balance.", domain: "finance" as const },
  { id: "overhead_overview", title: "Overhead expense overview", description: "Review recorded overhead, actual payments, and outstanding overhead balances.", domain: "finance" as const },
  { id: "branch_performance", title: "Branch performance", description: "Compare scoped branches using container volume, invoices, collections, and outstanding balances.", domain: "reports" as const },
  { id: "document_search", title: "Search uploaded documents", description: "Search readable uploaded documents and return permission-scoped file and page references.", domain: "documents" as const, requiresQuery: true },
  { id: "notifications_summary", title: "Notification summary", description: "Summarise recent workflow notifications in the current authorised branch.", domain: "notifications" as const },
  { id: "monthly_financial_report", title: "Monthly financial report", description: "Prepare a read-only monthly income, collections, expense, and net-cash report from live records.", domain: "reports" as const },
  { id: "receivables_ageing", title: "Receivables ageing", description: "Group unpaid invoice balances by age and show overdue collection priorities.", domain: "finance" as const },
  { id: "bank_ledger_reconciliation", title: "Bank ledger reconciliation", description: "Reconcile recorded bank-ledger inflows, outflows, transfers, and balances. This is not a bank-statement confirmation.", domain: "banking" as const },
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
  recommendations: string[];
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

function interpretQuestionFallback(question: string): CopilotIntent {
  const normalised = question.trim().toLowerCase();
  const containerMatch = question.toUpperCase().match(/\b[A-Z]{4}\d{7}\b/);
  if (containerMatch && /\b(documents?|docs?|files?|attachments?)\b/.test(normalised)) {
    return { toolId: "container_documents", args: { containerNumber: containerMatch[0] }, label: "container documents" };
  }
  if (/(document|file|attachment)/.test(normalised) && /(search|find|contain|mention|show|list)/.test(normalised)) {
    const query = documentSearchQuery(question);
    return query.length >= 2
      ? { toolId: "document_search", args: { query }, label: "uploaded document search" }
      : { toolId: null, args: {}, label: "unsupported question" };
  }
  if (containerMatch && /(why|status|delay|container|job|where|investigate|check)/.test(normalised)) {
    return { toolId: "container_lookup", args: { containerNumber: containerMatch[0] }, label: "container investigation" };
  }
  if (/(overdue|late).*(container|vessel|berthing)|(container|vessel|berthing).*(overdue|late)/.test(normalised)) return { toolId: "overdue_containers", args: {}, label: "overdue containers" };
  if (/(documentation|paar).*(delay|missing|pending|check)|(delay|missing|pending).*(documentation|paar)/.test(normalised)) return { toolId: "documentation_checks", args: {}, label: "documentation checks" };
  if (/(delay|delayed|late|stalled).*(job|transire|shipping|do|terminal|tdo|pullout)|(job|transire|shipping|do|terminal|tdo|pullout).*(delay|delayed|late|stalled)/.test(normalised)) return { toolId: "delayed_jobs", args: {}, label: "delayed jobs" };
  if (/(receivable|invoice|collection).*(ageing|aging)|(ageing|aging).*(receivable|invoice|collection)/.test(normalised)) return { toolId: "receivables_ageing", args: {}, label: "receivables ageing" };
  if (/(outstanding|overdue|receivable|invoice|collected).*(invoice|balance|payment|receivable)|(invoice|balance|payment|receivable).*(outstanding|overdue|receivable|collected)/.test(normalised)) return { toolId: "receivables_overview", args: {}, label: "receivables overview" };
  if (/(approved|pending).*(schedule|payment)|(schedule|payment).*(approved|awaiting)/.test(normalised)) return { toolId: "approved_payment_schedules", args: {}, label: "approved payment schedules" };
  if (/(overhead|expense).*(outstanding|paid|payment|balance)|(outstanding|paid|payment|balance).*(overhead|expense)/.test(normalised)) return { toolId: "overhead_overview", args: {}, label: "overhead overview" };
  if (/(financial|profit|loss|revenue|cashflow|cash flow).*(report|month|summary)|(report|month|summary).*(financial|profit|loss|revenue|cashflow|cash flow)/.test(normalised)) return { toolId: "monthly_financial_report", args: {}, label: "monthly financial report" };
  if (/(bank|ledger).*(reconciliation|reconcile|balance)|(reconciliation|reconcile).*(bank|ledger)/.test(normalised)) return { toolId: "bank_ledger_reconciliation", args: {}, label: "bank ledger reconciliation" };
  if (/(control|duplicate|unusual|overpayment|unallocated).*(review|expense|payment|fund|transaction)|(review|expense|payment|fund|transaction).*(control|duplicate|unusual|overpayment|unallocated)/.test(normalised)) return { toolId: "financial_control_review", args: {}, label: "financial control review" };
  if (/(branch|branches).*(compare|performance)|(compare|performance).*(branch|branches)/.test(normalised)) return { toolId: "branch_performance", args: {}, label: "branch performance" };
  if (/(terminal|operations|container).*(count|summary|currently|how many)|(count|summary|currently|how many).*(terminal|operations|container)/.test(normalised)) return { toolId: "operations_overview", args: {}, label: "operations overview" };
  return { toolId: null, args: {}, label: "unsupported question" };
}

async function interpretNaturalLanguageQuestion(question: string, req: AuthRequest, context: AiConversationContext | null): Promise<CopilotIntent> {
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
      conversationContext: context ? { lastToolId: context.lastToolId, lastToolArgs: context.lastToolArgs, records: context.records.map(({ title, href }) => ({ title, href })) } : undefined,
    });
    if (selection.kind === "tool" && TOOL_IDS.has(selection.toolId)) {
      const tool = TOOL_CATALOG.find((candidate) => candidate.id === selection.toolId)!;
      return { toolId: tool.id, args: selection.args, label: tool.title.toLowerCase() };
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

async function makeCopilotAnswer(sessionId: number, question: string, intent: CopilotIntent, result: AssistantToolResult | undefined, providerEnabled: boolean): Promise<CopilotAnswer> {
  if (!intent.toolId || !result) {
    return {
      sessionId,
      question,
      status: "unsupported",
      answer: intent.clarification ?? "I can currently help with approved container status, overdue and delayed jobs, PAAR checks, receivables, approved payment schedules, overhead balances, and branch performance. Try one of the suggested questions.",
      facts: [],
      calculations: [],
      recommendations: [],
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
  const evidence = (providerEnabled ? await generateEvidenceBasedAnswer({
    question,
    toolTitle: result.title,
    scopeLabel: result.scope.label,
    facts: result.facts,
    records: result.records,
    notes: result.notes,
  }) : null) ?? deterministicEvidenceAnswer(intent, noData);
  return {
    sessionId,
    question,
    status: noData ? "no_data" : "answered",
    answer: evidence.directAnswer,
    facts: result.facts,
    calculations,
    recommendations: noData ? [] : ["Review the cited source records before taking action through the normal workflow."],
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
      expectedTransireDate: containersTable.expectedTransireDate, transireReleasedAt: containersTable.transireReleasedAt,
      expectedDoDate: containersTable.expectedDoDate, doReleasedAt: containersTable.doReleasedAt,
      expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt,
      expectedPulloutDate: containersTable.expectedPulloutDate, pulloutReleasedAt: containersTable.pulloutReleasedAt,
    }).from(containersTable), branchId).filter((row) => row.status !== "closed");
    const stageRows = rows.filter((row) => requestedState === "all" || stageState(row as unknown as Record<string, unknown>, stage) === requestedState);
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
      result.facts = [{ label: `${operationalStageLabel(stage)} overdue jobs`, value: delayed.length }, { label: "Overdue after", value: `${overdueDays} day(s)` }];
      result.records = delayed.slice(0, limit).map((row) => ({
        title: row.containerNumber,
        detail: `${row.customerName} - expected ${dateOnly((row as unknown as Record<string, unknown>)[STAGE_TOOL_FIELDS[stage].expected] as Date)}.`,
        href: `${route}?container=${row.id}`, badges: ["Overdue"],
      }));
      result.sources = delayed.slice(0, limit).map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}` }));
      return result;
    }
    const activeCount = rows.filter((row) => stageState(row as unknown as Record<string, unknown>, stage) === "active").length;
    const releasedCount = rows.length - activeCount;
    result.facts = [{ label: `${operationalStageLabel(stage)} active`, value: activeCount }, { label: `${operationalStageLabel(stage)} released`, value: releasedCount }];
    if (toolId === "stage_jobs") {
      result.records = stageRows.slice(0, limit).map((row) => {
        const data = row as unknown as Record<string, unknown>;
        const state = stageState(data, stage);
        return { title: row.containerNumber, detail: `${row.customerName} - ${state === "released" ? `released ${dateOnly(data[STAGE_TOOL_FIELDS[stage].released] as Date)}` : `expected ${dateOnly(data[STAGE_TOOL_FIELDS[stage].expected] as Date)}`}.`, href: `${route}?container=${row.id}`, badges: [state] };
      });
      result.sources = stageRows.slice(0, limit).map((row) => ({ type: "container", id: row.id, label: row.containerNumber, href: `/containers/${row.id}` }));
    }
    return result;
  }

  if (toolId === "delayed_jobs") {
    const now = new Date();
    const rows = scoped(await db.select({
      id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName, stageOwner: containersTable.stageOwner,
      expectedTransireDate: containersTable.expectedTransireDate, transireReleasedAt: containersTable.transireReleasedAt,
      expectedDoDate: containersTable.expectedDoDate, doReleasedAt: containersTable.doReleasedAt,
      expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt,
      expectedPulloutDate: containersTable.expectedPulloutDate, pulloutReleasedAt: containersTable.pulloutReleasedAt,
    }).from(containersTable), branchId);
    const result = createResult(toolId, tool.title, branchId);
    const delayed = rows.flatMap((row) => [
      { stage: "Transire", expected: row.expectedTransireDate, actual: row.transireReleasedAt },
      { stage: "Shipping / DO", expected: row.expectedDoDate, actual: row.doReleasedAt },
      { stage: "Terminal / TDO", expected: row.expectedTdoDate, actual: row.tdoReleasedAt },
      { stage: "Pullout", expected: row.expectedPulloutDate, actual: row.pulloutReleasedAt },
    ].filter((stage) => stage.expected && !stage.actual && new Date(stage.expected).getTime() < now.getTime()).map((stage) => ({ ...stage, row })));
    result.facts = [{ label: "Delayed stage actions", value: delayed.length }, { label: "Affected containers", value: new Set(delayed.map((item) => item.row.id)).size }];
    result.records = delayed.slice(0, limit).map((item) => ({
      title: `${item.row.containerNumber} - ${item.stage}`,
      detail: `Expected ${dateOnly(item.expected)}. Owner: ${item.row.stageOwner ?? "Unassigned"}.`,
      href: `/containers/${item.row.id}`,
      badges: ["Overdue", item.stage],
    }));
    result.sources = delayed.slice(0, limit).map((item) => ({ type: "container", id: item.row.id, label: item.row.containerNumber, href: `/containers/${item.row.id}` }));
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
      paarNumber: containersTable.paarNumber, expectedTransireDate: containersTable.expectedTransireDate,
      transireReleasedAt: containersTable.transireReleasedAt, expectedDoDate: containersTable.expectedDoDate,
      doReleasedAt: containersTable.doReleasedAt, expectedTdoDate: containersTable.expectedTdoDate,
      tdoReleasedAt: containersTable.tdoReleasedAt, expectedPulloutDate: containersTable.expectedPulloutDate,
      pulloutReleasedAt: containersTable.pulloutReleasedAt,
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
      { label: "Stage owner", value: row.stageOwner ?? "Unassigned" }, { label: "PAAR", value: row.paarNumber ?? "Not recorded" },
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
    const containerId = getLookupId(body.containerId, "container");
    const containers = scoped(await db.select({ id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber, customerName: containersTable.customerName }).from(containersTable), branchId);
    const container = containers.find((row) => row.id === containerId);
    const result = createResult(toolId, tool.title, branchId);
    if (!container) { result.notes = ["No authorised container matches that ID."]; return result; }
    const payments = scoped(await db.select({ id: containerExpensePaymentsTable.id, branchId: containerExpensePaymentsTable.branchId, containerId: containerExpensePaymentsTable.containerId, amount: containerExpensePaymentsTable.amount, section: containerExpensePaymentsTable.section, paymentMethod: containerExpensePaymentsTable.paymentMethod, reference: containerExpensePaymentsTable.reference, narration: containerExpensePaymentsTable.narration, paidAt: containerExpensePaymentsTable.paidAt }).from(containerExpensePaymentsTable), branchId)
      .filter((row) => row.containerId === containerId);
    result.facts = [{ label: "Container", value: container.containerNumber }, { label: "Recorded payments", value: payments.length }, { label: "Total paid", value: money(payments.reduce((sum, payment) => sum + toAmount(payment.amount), 0)) }];
    result.records = payments.sort((a, b) => b.paidAt.getTime() - a.paidAt.getTime()).slice(0, limit).map((payment) => ({ title: money(toAmount(payment.amount)), detail: `${payment.section ?? "Uncategorised"} - ${payment.paymentMethod} on ${dateOnly(payment.paidAt)}${payment.reference ? `; ref ${payment.reference}` : ""}.`, href: `/containers/${containerId}?tab=payment-history`, badges: [payment.section ?? "payment"] }));
    result.sources = [{ type: "container", id: container.id, label: container.containerNumber, href: `/containers/${container.id}?tab=payment-history` }];
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

  if (toolId === "notifications_summary") {
    const notifications = scoped(await db.select({
      id: workflowNotificationsTable.id, branchId: workflowNotificationsTable.branchId, type: workflowNotificationsTable.type,
      message: workflowNotificationsTable.message, actionUrl: workflowNotificationsTable.actionUrl,
      containerId: workflowNotificationsTable.containerId, containerNumber: workflowNotificationsTable.containerNumber,
      targetUserId: workflowNotificationsTable.targetUserId, isRead: workflowNotificationsTable.isRead, createdAt: workflowNotificationsTable.createdAt,
    }).from(workflowNotificationsTable).orderBy(desc(workflowNotificationsTable.createdAt)).limit(250), branchId)
      .filter((row) => row.targetUserId == null || row.targetUserId === req.user!.id);
    const result = createResult(toolId, tool.title, branchId);
    const typeCounts = notifications.reduce<Record<string, number>>((counts, notification) => { counts[notification.type] = (counts[notification.type] ?? 0) + 1; return counts; }, {});
    result.facts = [
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
    return result;
  }

  if (toolId === "receivables_overview") {
    const invoices = scoped(await db.select({
      id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber,
      total: invoicesTable.total, dueDate: invoicesTable.dueDate, status: invoicesTable.status,
    }).from(invoicesTable).where(ne(invoicesTable.status, "written_off")), branchId);
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
    const schedules = scoped(await db.select({
      id: paymentSchedulesTable.id, branchId: paymentSchedulesTable.branchId, vendorBeneficiary: paymentSchedulesTable.vendorBeneficiary,
      description: paymentSchedulesTable.description, amountRequested: paymentSchedulesTable.amountRequested,
      amountApproved: paymentSchedulesTable.amountApproved, amountPaid: paymentSchedulesTable.amountPaid,
      status: paymentSchedulesTable.status, scheduleDate: paymentSchedulesTable.scheduleDate,
    }).from(paymentSchedulesTable), branchId).filter((schedule) => ["approved", "partially_approved", "paid"].includes(schedule.status) && toAmount(schedule.amountApproved) > toAmount(schedule.amountPaid));
    const result = createResult(toolId, tool.title, branchId);
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

  if (toolId === "monthly_financial_report") {
    const period = getReportPeriod(body);
    const [allInvoices, allInvoicePayments, allDeposits, allOverheadPayments, allContainerPayments] = await Promise.all([
      db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, createdAt: invoicesTable.createdAt, status: invoicesTable.status }).from(invoicesTable),
      db.select({ id: invoicePaymentsTable.id, branchId: invoicePaymentsTable.branchId, invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount, paidAt: invoicePaymentsTable.paidAt }).from(invoicePaymentsTable),
      db.select({ id: clientDepositsTable.id, branchId: clientDepositsTable.branchId, amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount, createdAt: clientDepositsTable.createdAt }).from(clientDepositsTable),
      db.select({ id: expensePaymentsTable.id, branchId: expensePaymentsTable.branchId, expenseId: expensePaymentsTable.expenseId, amount: expensePaymentsTable.amount, paidAt: expensePaymentsTable.paidAt }).from(expensePaymentsTable),
      db.select({ id: containerExpensePaymentsTable.id, branchId: containerExpensePaymentsTable.branchId, containerId: containerExpensePaymentsTable.containerId, amount: containerExpensePaymentsTable.amount, paidAt: containerExpensePaymentsTable.paidAt }).from(containerExpensePaymentsTable),
    ]);
    const invoices = scoped(allInvoices, branchId).filter((row) => occursWithin(row.createdAt, period) && row.status !== "written_off");
    const collections = scoped(allInvoicePayments, branchId).filter((row) => occursWithin(row.paidAt, period));
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
    const invoices = scoped(allInvoices, branchId).filter((invoice) => invoice.status !== "written_off");
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

  if (toolId === "financial_control_review") {
    const [allInvoices, allInvoicePayments, allDeposits, allExpenses, allSchedules, allContainers, allDocuments] = await Promise.all([
      db.select({ id: invoicesTable.id, branchId: invoicesTable.branchId, invoiceNumber: invoicesTable.invoiceNumber, total: invoicesTable.total, dueDate: invoicesTable.dueDate, createdAt: invoicesTable.createdAt, status: invoicesTable.status }).from(invoicesTable),
      db.select({ id: invoicePaymentsTable.id, branchId: invoicePaymentsTable.branchId, invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount, reference: invoicePaymentsTable.reference, paidAt: invoicePaymentsTable.paidAt }).from(invoicePaymentsTable),
      db.select({ id: clientDepositsTable.id, branchId: clientDepositsTable.branchId, clientId: clientDepositsTable.clientId, amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount, createdAt: clientDepositsTable.createdAt }).from(clientDepositsTable),
      db.select({ id: overheadExpensesTable.id, branchId: overheadExpensesTable.branchId, category: overheadExpensesTable.category, description: overheadExpensesTable.description, amount: overheadExpensesTable.amount, createdAt: overheadExpensesTable.createdAt }).from(overheadExpensesTable),
      db.select({ id: paymentSchedulesTable.id, branchId: paymentSchedulesTable.branchId, vendorBeneficiary: paymentSchedulesTable.vendorBeneficiary, description: paymentSchedulesTable.description, amountApproved: paymentSchedulesTable.amountApproved, amountPaid: paymentSchedulesTable.amountPaid, scheduleDate: paymentSchedulesTable.scheduleDate, status: paymentSchedulesTable.status }).from(paymentSchedulesTable),
      db.select({ id: containersTable.id, branchId: containersTable.branchId, containerNumber: containersTable.containerNumber, status: containersTable.status }).from(containersTable),
      db.select({ containerId: containerDocumentsTable.containerId, branchId: containerDocumentsTable.branchId }).from(containerDocumentsTable),
    ]);
    const invoices = scoped(allInvoices, branchId).filter((invoice) => invoice.status !== "written_off");
    const payments = scoped(allInvoicePayments, branchId);
    const deposits = scoped(allDeposits, branchId);
    const expenses = scoped(allExpenses, branchId);
    const schedules = scoped(allSchedules, branchId);
    const containers = scoped(allContainers, branchId);
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
    const result = createResult(toolId, tool.title, branchId);
    result.facts = [
      { label: "Review prompts", value: flags.length },
      { label: "Possible duplicate groups", value: [...duplicateGroups.values()].filter((group) => group.length > 1).length },
      { label: "Unallocated deposits", value: deposits.filter((deposit) => toAmount(deposit.amount) - toAmount(deposit.allocatedAmount) > 0.01).length },
      { label: "Approved unpaid schedules", value: schedules.filter((schedule) => ["approved", "partially_approved"].includes(schedule.status) && toAmount(schedule.amountApproved) > toAmount(schedule.amountPaid)).length },
      { label: "Active containers without uploads", value: containers.filter((container) => !["pending_verification", "closed"].includes(container.status) && !documentedContainerIds.has(container.id)).length },
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
      ilike(documentIntelligenceIndexTable.contentText, `%${escapedQuery}%`),
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
      let page = "Page unavailable";
      let sourceText = row.contentText ?? "";
      try {
        const pages = JSON.parse(row.pageText) as Array<{ page?: number; text?: string }>;
        const matchedPage = pages.find((item) => item.text?.toLowerCase().includes(lowerQuery));
        if (matchedPage?.page) page = `Page ${matchedPage.page}`;
        sourceText = matchedPage?.text ?? sourceText;
      } catch {
        // Older or failed metadata is still safe to show without a page number.
      }
      const matchIndex = sourceText.toLowerCase().indexOf(lowerQuery);
      const start = Math.max(0, matchIndex - 110);
      const snippet = sourceText.slice(start, start + 280).replace(/\s+/g, " ").trim();
      return {
        title: row.originalName,
        detail: `${row.containerNumber} - ${page}${row.section ? ` - ${row.section}` : ""}${snippet ? `: ${snippet}` : ""}`,
        href: `/containers/${row.containerId}?tab=documents`,
        badges: ["Document", page],
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

type AssistantDraftType = "payment_schedule" | "workflow_notification" | "management_summary" | "follow_up_task" | "payment_schedule_reschedule";
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
  const users = await db.select({ id: usersTable.id, role: usersTable.role, branchId: usersTable.branchId })
    .from(usersTable).where(eq(usersTable.isActive, true));
  return users.filter((user) => user.role === "super_admin" || (user.branchId === branchId && user.role === "admin")).map((user) => user.id);
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
  return { action: "management_summary_finalised", title: prepared.payload.title, href: "/reports" };
}

const REPORT_REQUESTS = {
  monthly_finance: { toolId: "monthly_financial_report" as ToolId, title: "Monthly Revenue and Expense Report" },
  receivables: { toolId: "receivables_ageing" as ToolId, title: "Receivables and Ageing Report" },
  branch_performance: { toolId: "branch_performance" as ToolId, title: "Branch Performance Report" },
  operational_delays: { toolId: "delayed_jobs" as ToolId, title: "Operational Delays Report" },
  payment_schedules: { toolId: "approved_payment_schedules" as ToolId, title: "Approved Payment Schedules Report" },
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

aiAssistantRouter.get("/ai-assistant/status", requireAdmin, foundationRateLimit, async (_req: AuthRequest, res) => {
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
    const filters = requested.toolId === "monthly_financial_report"
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
  if (!["payment_schedule", "workflow_notification", "management_summary", "follow_up_task", "payment_schedule_reschedule"].includes(type)) {
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
    const intent = await interpretNaturalLanguageQuestion(question, req, sessionContext);
    const result = intent.toolId ? await runApprovedTool(intent.toolId, req, intent.args) : undefined;
    const answer = await makeCopilotAnswer(session.id, question, intent, result, governance.providerEnabled && isNaturalLanguageRoutingConfigured());
    const now = new Date();
    const nextContext = intent.toolId && result ? buildAiConversationContext({
      branchId: getBranchScope(req),
      lastToolId: intent.toolId,
      lastToolArgs: intent.args,
      records: result.records.map((record) => ({
        id: Number(record.href.match(/^\/containers\/(\d+)/)?.[1]) || null,
        title: record.title,
        href: record.href,
      })),
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
      metadata: { intent: intent.label, status: answer.status, factCount: answer.facts.length, citationCount: answer.citations.length, naturalLanguageRoutingConfigured: governance.providerEnabled && isNaturalLanguageRoutingConfigured(), providerEnabled: governance.providerEnabled, latencyMs: Date.now() - startedAt, contextUsed: !!sessionContext, contextExpiresAt: nextContext ? new Date(now.getTime() + CONTEXT_TTL_MS).toISOString() : session.contextExpiresAt?.toISOString() ?? null },
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
  const meta = (value: string) => parseJson<Record<string, unknown>>(value, {});
  const latencies = questions.map((row) => Number(meta(row.metadata).latencyMs)).filter(Number.isFinite);
  return res.json({ periodDays: 30, questions: questions.length, failures: failures.length, unsupported: questions.filter((row) => meta(row.metadata).status === "unsupported").length, averageLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null, providerRequests: questions.filter((row) => meta(row.metadata).naturalLanguageRoutingConfigured === true).length, providerCost: { currency: "NGN", amount: null, note: "Token-cost metering is not enabled. Provider request counts are retained for budget review." }, feedback: { helpful: feedback.filter((row) => meta(row.metadata).rating === "helpful").length, notHelpful: feedback.filter((row) => meta(row.metadata).rating === "not_helpful").length } });
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
