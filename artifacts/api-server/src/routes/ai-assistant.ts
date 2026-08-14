import { NextFunction, Response, Router } from "express";
import {
  aiAssistantAuditLogsTable,
  branchesTable,
  containersTable,
  db,
  expensePaymentsTable,
  invoicePaymentsTable,
  invoicesTable,
  overheadExpensesTable,
  paymentSchedulesTable,
  settingsTable,
} from "@workspace/db";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { AuthRequest, getBranchScope, requireAdmin } from "../lib/auth.js";

export const aiAssistantRouter = Router();

type AiAssistantDataDomain = "dashboard" | "operations" | "documentation" | "containers" | "finance" | "banking" | "reports" | "notifications" | "documents";
type AiAssistantGovernance = {
  accessRoles: Array<"admin" | "super_admin">;
  mode: "read_only";
  dataDomains: AiAssistantDataDomain[];
  monthlyBudgetNgn: number;
  auditRetentionDays: number;
  actionPolicy: "human_confirmation_required";
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

    return {
      accessRoles: [...new Set(parsed.accessRoles)] as AiAssistantGovernance["accessRoles"],
      mode: "read_only",
      dataDomains: [...new Set(parsed.dataDomains)],
      monthlyBudgetNgn: Number(parsed.monthlyBudgetNgn),
      auditRetentionDays: Number(parsed.auditRetentionDays),
      actionPolicy: "human_confirmation_required",
    };
  } catch {
    return DEFAULT_GOVERNANCE;
  }
}

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
  { id: "overdue_containers", title: "Overdue containers", description: "Find containers past ETA whose vessel berthing is still unconfirmed.", domain: "containers" as const },
  { id: "delayed_jobs", title: "Delayed jobs", description: "Find Transire, Shipping, Terminal, and Pullout jobs whose expected date has passed.", domain: "operations" as const },
  { id: "documentation_checks", title: "Documentation checks", description: "Identify open jobs without a PAAR number and link to their container record.", domain: "documentation" as const },
  { id: "container_lookup", title: "Container investigation", description: "Look up one container by exact container number or ID and inspect its live workflow state.", domain: "containers" as const, requiresContainer: true },
  { id: "receivables_overview", title: "Receivables overview", description: "Review invoiced, collected, outstanding, and overdue client balances.", domain: "finance" as const },
  { id: "approved_payment_schedules", title: "Approved schedules awaiting payment", description: "Show approved or partially approved payment schedules with an unpaid balance.", domain: "finance" as const },
  { id: "overhead_overview", title: "Overhead expense overview", description: "Review recorded overhead, actual payments, and outstanding overhead balances.", domain: "finance" as const },
  { id: "branch_performance", title: "Branch performance", description: "Compare scoped branches using container volume, invoices, collections, and outstanding balances.", domain: "reports" as const },
] as const;

type ToolId = typeof TOOL_CATALOG[number]["id"];
const TOOL_IDS = new Set<string>(TOOL_CATALOG.map((tool) => tool.id));

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
      customerName: containersTable.customerName,
    }).from(containersTable), branchId);
    const result = createResult(toolId, tool.title, branchId);
    const terminalStatuses = new Set(["terminal", "pull_out", "gate_in", "examination", "final_release"]);
    result.facts = [
      { label: "Open containers", value: rows.filter((row) => row.status !== "closed").length },
      { label: "In terminal workflow", value: rows.filter((row) => terminalStatuses.has(row.status)).length },
      { label: "Awaiting verification", value: rows.filter((row) => row.status === "pending_verification").length },
      { label: "Awaiting berthing", value: rows.filter((row) => !row.berthed && !!row.eta).length },
    ];
    result.records = rows.filter((row) => row.status !== "closed").slice(0, limit).map((row) => ({
      title: row.containerNumber,
      detail: `${row.customerName} - ${row.status.replace(/_/g, " ")}`,
      href: `/containers/${row.id}`,
      badges: [row.status.replace(/_/g, " ")],
    }));
    result.sources = result.records.map((record, index) => ({ type: "container", id: rows.filter((row) => row.status !== "closed")[index]?.id, label: record.title, href: record.href }));
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

aiAssistantRouter.get("/ai-assistant/status", requireAdmin, foundationRateLimit, async (_req: AuthRequest, res) => {
  try {
    const [setting] = await db.select({ value: settingsTable.value })
      .from(settingsTable)
      .where(eq(settingsTable.key, "aiAssistantGovernance"))
      .limit(1);
    const governance = parseGovernance(setting?.value);
    return res.json({
      phase: "approved_data_tools",
      available: true,
      modelConnected: false,
      governance,
      approvedToolCount: TOOL_CATALOG.filter((tool) => governance.dataDomains.includes(tool.domain)).length,
      safeguards: [
        "Admin and Super Admin access only",
        "Read-only mode",
        "No direct database access",
        "Only approved, permission-scoped tools can read live data",
        "Human confirmation required for future actions",
        "Every tool result records its sources and audit event",
      ],
    });
  } catch (error) {
    console.error("[ai-assistant] Failed to load foundation status", error);
    return res.status(500).json({ error: "Unable to load AI assistant status" });
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
