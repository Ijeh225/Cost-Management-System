import { Router } from "express";
import { db, notificationsReadTable, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable, settingsTable, auditLogTable, workflowNotificationsTable, systemAlertsHistoryTable, branchesTable } from "@workspace/db";
import { eq, lt, sql, max, isNotNull, desc, inArray, notInArray, and } from "drizzle-orm";
import { requireAuth, requireBranchAdminOrAbove, AuthRequest, getBranchScope, userCanAccessBranch } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery } from "../lib/calculations.js";
import { hasAuthority, hasWorkspace, type ResolvedAccessProfile } from "../lib/authorization.js";

export const notificationsRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;
const RESEND_TEST_FROM = "Cost Management <onboarding@resend.dev>";

type EmailAlertCategory = "terminal_jobs" | "overdue_containers" | "berthing_watch" | "clearing_delays" | "inactive_jobs" | "documentation_delays" | "transire_delay" | "shipping_delay" | "terminal_delay" | "pullout_delay" | "exam_release_delay" | "financial_exceptions";
type EmailAlertPreference = { enabled: boolean; recipients: string; frequency: "none" | "daily" | "weekly"; lastSentAt?: string };
type EmailAlertPreferences = Record<EmailAlertCategory, EmailAlertPreference>;

const EMAIL_ALERT_CATEGORIES: Array<{ id: EmailAlertCategory; title: string; helper: string }> = [
  { id: "terminal_jobs", title: "Terminal Jobs", helper: "Open jobs currently in Terminal and its downstream release stages." },
  { id: "overdue_containers", title: "Overdue Containers", helper: "Overdue next actions, stage stalls, and overdue empty returns." },
  { id: "berthing_watch", title: "Berthing Watch", helper: "Unberthed vessels with an ETA in the next seven days." },
  { id: "clearing_delays", title: "Clearing Delays", helper: "Jobs exceeding the configured clearing-age thresholds." },
  { id: "inactive_jobs", title: "Inactive Jobs", helper: "Jobs with no recorded activity for the configured number of days." },
  { id: "documentation_delays", title: "PAAR / Documentation Delays", helper: "Documentation jobs whose PAAR ETA has passed." },
  { id: "transire_delay", title: "Transire Delay", helper: "Transire releases that are due soon or overdue." },
  { id: "shipping_delay", title: "Shipping / DO Delay", helper: "Delivery Order releases that are due soon or overdue." },
  { id: "terminal_delay", title: "Terminal / TDO Delay", helper: "Terminal Delivery Order releases that are due soon or overdue." },
  { id: "pullout_delay", title: "Pullout Delay", helper: "Pullout actions that are due soon or overdue." },
  { id: "exam_release_delay", title: "Exam / Release Delay", helper: "Examination and final-release actions that are due soon or overdue." },
  { id: "financial_exceptions", title: "Financial Exceptions", helper: "Unpaid duty, negative-profit, and low-margin jobs." },
];

function getEmailAlertPreferences(settings: Record<string, string>): EmailAlertPreferences {
  const fallbackRecipients = settings["agingEmailTo"] ?? "";
  const legacyFrequency = (settings["digestFrequency"] === "daily" || settings["digestFrequency"] === "weekly")
    ? settings["digestFrequency"] as "daily" | "weekly"
    : "none";
  const defaults = Object.fromEntries(EMAIL_ALERT_CATEGORIES.map(({ id }) => [id, {
    enabled: settings["agingEmailEnabled"] === "true" && ["clearing_delays", "inactive_jobs", "financial_exceptions"].includes(id),
    recipients: fallbackRecipients,
    frequency: legacyFrequency,
  }])) as EmailAlertPreferences;
  try {
    const parsed = JSON.parse(settings["emailAlertPreferences"] ?? "{}");
    if (!parsed || typeof parsed !== "object") return defaults;
    for (const { id } of EMAIL_ALERT_CATEGORIES) {
      const preference = parsed[id];
      if (!preference || typeof preference !== "object") continue;
      defaults[id] = {
        enabled: preference.enabled === true,
        recipients: typeof preference.recipients === "string" ? preference.recipients : fallbackRecipients,
        frequency: preference.frequency === "daily" || preference.frequency === "weekly" ? preference.frequency : "none",
        ...(typeof preference.lastSentAt === "string" ? { lastSentAt: preference.lastSentAt } : {}),
      };
    }
  } catch {}
  return defaults;
}

function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const EMAIL_ALERT_TYPES: Record<Exclude<EmailAlertCategory, "terminal_jobs" | "berthing_watch">, string[]> = {
  overdue_containers: ["action_overdue", "empty_return_overdue", "stage_stall", "overdue_task", "stale_approval"],
  clearing_delays: ["aging_warn", "aging_high", "aging_critical"],
  inactive_jobs: ["inactive"],
  documentation_delays: ["paar_overdue"],
  transire_delay: ["transire_due"],
  shipping_delay: ["shipping_due"],
  terminal_delay: ["terminal_due"],
  pullout_delay: ["pullout_due"],
  exam_release_delay: ["exam_release_due"],
  financial_exceptions: ["unpaid_duty", "negative_profit", "low_margin", "high_terminal", "high_delivery"],
};

function formatContainerStage(status: string): string {
  const labels: Record<string, string> = {
    pending_verification: "Awaiting Verification",
    registered: "Registered",
    documentation: "Documentation",
    duty_assessment: "Duty Assessment",
    duty_payment: "Duty Payment",
    transire_processing: "Transire",
    shipping: "Shipping / DO",
    terminal: "Terminal / TDO",
    pull_out: "Pullout",
    gate_in: "Gate In",
    examination: "Examination",
    final_release: "Final Release",
    delivery: "Delivery",
    closed: "Closed",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function emailRecipients(value: string): string[] {
  return [...new Set(value.split(",").map((email) => email.trim()).filter(Boolean))];
}

function recommendationForEmailCategory(category: EmailAlertCategory): string {
  const recommendations: Record<EmailAlertCategory, string> = {
    terminal_jobs: "Review terminal progress and confirm the next release action.",
    overdue_containers: "Contact the responsible officer and update the overdue action.",
    berthing_watch: "Confirm berthing at the port or update the vessel ETA.",
    clearing_delays: "Review the delay, record the blocker, and set the next action.",
    inactive_jobs: "Update the job activity or record the blocking issue.",
    documentation_delays: "Follow up on PAAR/documentation and update the expected date.",
    transire_delay: "Follow up on the Transire release and update its expected date if delayed.",
    shipping_delay: "Follow up on the Delivery Order release and update its expected date if delayed.",
    terminal_delay: "Follow up on the TDO release and update its expected date if delayed.",
    pullout_delay: "Confirm the pullout action or update its expected date if delayed.",
    exam_release_delay: "Confirm the examination or final-release action and record the next step.",
    financial_exceptions: "Review the financial exception with Accounts before it grows.",
  };
  return recommendations[category];
}

type EmailReportRow = {
  containerNumber: string;
  customerName: string;
  stage: string;
  officer: string;
  issue: string;
  action: string;
};

async function buildEmailAlertReport(category: EmailAlertCategory, alerts: any[], branchScope?: number | null): Promise<EmailReportRow[]> {
  const containers = branchScope != null
    ? await db.select().from(containersTable).where(eq(containersTable.branchId, branchScope))
    : await db.select().from(containersTable);
  const activeContainers = containers.filter((container) => container.status !== "closed");
  const now = new Date();
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const inSevenDays = new Date(startOfToday); inSevenDays.setDate(inSevenDays.getDate() + 7);

  if (category === "terminal_jobs") {
    const terminalStatuses = new Set(["terminal", "pull_out", "gate_in", "examination", "final_release"]);
    return activeContainers
      .filter((container) => terminalStatuses.has(container.status))
      .map((container) => ({
        containerNumber: container.containerNumber,
        customerName: container.customerName,
        stage: formatContainerStage(container.status),
        officer: container.stageOwner ?? "Unassigned",
        issue: "Open job currently in terminal workflow.",
        action: recommendationForEmailCategory(category),
      }));
  }

  if (category === "berthing_watch") {
    return activeContainers
      .filter((container) => {
        if (container.berthed || !container.eta) return false;
        const eta = new Date(container.eta);
        return eta >= startOfToday && eta <= inSevenDays;
      })
      .map((container) => ({
        containerNumber: container.containerNumber,
        customerName: container.customerName,
        stage: formatContainerStage(container.status),
        officer: container.stageOwner ?? "Unassigned",
        issue: `Vessel ETA: ${new Date(container.eta!).toLocaleDateString("en-NG", { dateStyle: "medium" })}.`,
        action: recommendationForEmailCategory(category),
      }));
  }

  const containerById = new Map(activeContainers.map((container) => [container.id, container]));
  return alerts
    .filter((alert) => EMAIL_ALERT_TYPES[category].includes(alert.type))
    .map((alert) => {
      const container = alert.containerId ? containerById.get(alert.containerId) : undefined;
      return {
        containerNumber: container?.containerNumber ?? alert.containerNumber ?? "System alert",
        customerName: container?.customerName ?? "",
        stage: container ? formatContainerStage(container.status) : "System",
        officer: container?.stageOwner ?? "Unassigned",
        issue: alert.message,
        action: recommendationForEmailCategory(category),
      };
    });
}

function buildEmailAlertHtml(title: string, rows: EmailReportRow[]): string {
  const tableRows = rows.map((row) => `
    <tr style="border-bottom:1px solid #e5e7eb;vertical-align:top;">
      <td style="padding:12px 10px 12px 0;font-size:13px;color:#111827;font-weight:600;">${escapeEmailHtml(row.containerNumber)}<br><span style="font-size:11px;color:#6b7280;font-weight:400;">${escapeEmailHtml(row.customerName)}</span></td>
      <td style="padding:12px 10px;font-size:12px;color:#374151;">${escapeEmailHtml(row.stage)}<br><span style="color:#6b7280;">Owner: ${escapeEmailHtml(row.officer)}</span></td>
      <td style="padding:12px 10px;font-size:12px;color:#374151;">${escapeEmailHtml(row.issue)}</td>
      <td style="padding:12px 0 12px 10px;font-size:12px;color:#1d4ed8;">${escapeEmailHtml(row.action)}</td>
    </tr>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
      <div style="padding:24px 28px;background:#eff6ff;border-bottom:1px solid #bfdbfe;"><h1 style="margin:0;font-size:20px;">${escapeEmailHtml(title)}</h1><p style="margin:7px 0 0;font-size:13px;color:#4b5563;">${rows.length} item${rows.length === 1 ? "" : "s"} requiring review · ${escapeEmailHtml(new Date().toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }))}</p></div>
      <div style="padding:8px 28px 24px;">${rows.length === 0 ? "<p style=\"padding:28px 0;text-align:center;color:#6b7280;\">No current items in this alert category.</p>" : `<table style="width:100%;border-collapse:collapse;"><thead><tr style="text-align:left;"><th style="padding:16px 10px 10px 0;font-size:11px;color:#6b7280;text-transform:uppercase;">Container / Customer</th><th style="padding:16px 10px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;">Stage / Owner</th><th style="padding:16px 10px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;">Issue</th><th style="padding:16px 0 10px 10px;font-size:11px;color:#6b7280;text-transform:uppercase;">Recommended Action</th></tr></thead><tbody>${tableRows}</tbody></table>`}</div>
      <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:11px;color:#6b7280;">Cost Management System operational alert</div>
    </div></body></html>`;
}

async function sendEmailAlertCategory(category: EmailAlertCategory, recipients: string[], alerts: any[], branchScope?: number | null): Promise<{ count: number; fromAddress: string; productionReady: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Email service is not configured");
  const sender = await resolveEmailSender(branchScope ?? null);
  const definition = EMAIL_ALERT_CATEGORIES.find((item) => item.id === category)!;
  const rows = await buildEmailAlertReport(category, alerts, branchScope);
  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: sender.fromAddress,
      to: recipients,
      ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
      subject: `[Cost Management] ${definition.title} - ${rows.length} item${rows.length === 1 ? "" : "s"}`,
      html: buildEmailAlertHtml(definition.title, rows),
    }),
  });
  if (!emailRes.ok) {
    console.error("[email-alert] Resend error:", await emailRes.text().catch(() => "unknown"));
    throw new Error("Failed to send email via Resend. Check your API key and sender domain.");
  }
  return { count: rows.length, fromAddress: sender.fromAddress, productionReady: sender.productionReady };
}

function uniquePositiveIds(ids: Array<number | null | undefined>): number[] {
  return [...new Set(ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id) && id > 0))];
}

function parseOfficerIds(value?: string | null): number[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return uniquePositiveIds(parsed.map((id) => Number.parseInt(String(id), 10)));
    }
  } catch {}
  const single = Number.parseInt(value, 10);
  return Number.isFinite(single) && single > 0 ? [single] : [];
}

function isAdminProfile(profile: ResolvedAccessProfile): boolean {
  return hasAuthority(profile, "admin");
}

function allowedAlertTypes(profile: ResolvedAccessProfile): Set<string> | null {
  if (isAdminProfile(profile)) return null;
  const allowed = new Set<string>(["rejected_section"]);
  if (hasWorkspace(profile, "documentation")) ["overdue_task", "stale_approval", "paar_overdue"].forEach(type => allowed.add(type));
  if (hasWorkspace(profile, "accounts")) ["negative_profit", "low_margin", "unpaid_duty"].forEach(type => allowed.add(type));
  if (profile.jobFunction === "operations") ["aging_warn", "aging_high", "aging_critical", "inactive", "action_overdue"].forEach(type => allowed.add(type));
  if (hasWorkspace(profile, "terminal_manager")) ["high_terminal", "berthing_confirmation_needed", "aging_warn", "aging_high", "aging_critical", "inactive", "action_overdue", "stage_stall"].forEach(type => allowed.add(type));
  if (hasWorkspace(profile, "delivery")) ["high_delivery", "empty_return_overdue"].forEach(type => allowed.add(type));
  if (hasWorkspace(profile, "transire")) allowed.add("transire_due");
  if (hasWorkspace(profile, "shipping")) allowed.add("shipping_due");
  if (hasWorkspace(profile, "terminal")) allowed.add("terminal_due");
  if (hasWorkspace(profile, "pullout")) allowed.add("pullout_due");
  return allowed;
}

function allowedWorkflowStages(profile: ResolvedAccessProfile): Set<string> | null {
  if (isAdminProfile(profile)) return null;
  const stages = new Set<string>();
  if (hasWorkspace(profile, "transire")) stages.add("transire_processing");
  if (hasWorkspace(profile, "shipping")) stages.add("shipping");
  if (hasWorkspace(profile, "terminal")) stages.add("terminal");
  if (hasWorkspace(profile, "pullout")) stages.add("pull_out");
  if (hasWorkspace(profile, "terminal_manager")) ["gate_in", "examination", "final_release"].forEach(stage => stages.add(stage));
  if (hasWorkspace(profile, "delivery")) stages.add("delivery");
  return stages;
}

function inferWorkflowStage(notification: { type: string; message: string }): string | null {
  const message = notification.message.toLowerCase();
  if (message.includes("transire")) return "transire_processing";
  if (message.includes("delivery order") || message.includes("do released") || message.includes(" do ")) return "shipping";
  if (message.includes("tdo") || message.includes("terminal")) return "terminal";
  if (message.includes("pullout") || message.includes("pull-out") || message.includes("pull out")) return "pull_out";
  if (message.includes("gate-in") || message.includes("gate in")) return "gate_in";
  if (message.includes("examination")) return "examination";
  if (message.includes("final release")) return "final_release";
  return null;
}

export function isWorkflowNotificationVisibleToUser(
  notification: { type: string; message: string; targetUserId: number | null },
  profile: ResolvedAccessProfile,
  userId: number,
): boolean {
  if (notification.targetUserId != null) return notification.targetUserId === userId;

  if (isAdminProfile(profile)) return true;
  const allowedStages = allowedWorkflowStages(profile);
  if (!allowedStages || allowedStages.size === 0) {
    return (
      (hasWorkspace(profile, "accounts") && ["invoice_created", "invoice_paid", "payment_schedule_approved", "payment_schedule_paid", "payment_schedule_completed", "payment_schedule_comment"].includes(notification.type)) ||
      (hasWorkspace(profile, "documentation") && notification.type === "new_job")
    );
  }

  if (notification.type === "stage_complete" || notification.type === "delay_recorded" || notification.type === "overdue") {
    const notificationStage = inferWorkflowStage(notification);
    return notificationStage != null && allowedStages.has(notificationStage);
  }

  if (notification.type === "gate_in" || notification.type === "gate_out" || notification.type === "empty_gate_in" || notification.type === "empty_gate_out") {
    return allowedStages.has("gate_in") || allowedStages.has("pull_out");
  }

  if (notification.type === "berthing_confirmed") {
    return allowedStages.has("shipping") || allowedStages.has("terminal");
  }

  if (notification.type === "new_job") {
    return hasWorkspace(profile, "documentation") || hasWorkspace(profile, "transire") || hasWorkspace(profile, "shipping") || hasWorkspace(profile, "terminal");
  }

  return false;
}

type EmailSenderInfo = {
  fromAddress: string;
  replyTo: string | null;
  productionReady: boolean;
  source: "branch" | "system" | "resend_test";
};

function isResendTestSender(fromAddress: string): boolean {
  return fromAddress.toLowerCase().includes("@resend.dev");
}

async function resolveEmailSender(branchScope: number | null): Promise<EmailSenderInfo> {
  const systemFrom = process.env.RESEND_DEFAULT_FROM?.trim();
  const systemReplyTo = process.env.RESEND_REPLY_TO?.trim() || null;
  if (systemFrom) {
    return {
      fromAddress: systemFrom,
      replyTo: systemReplyTo,
      productionReady: !isResendTestSender(systemFrom),
      source: "system",
    };
  }

  if (branchScope !== null) {
    const [branch] = await db
      .select({
        emailFromAddress: branchesTable.emailFromAddress,
        emailReplyTo: branchesTable.emailReplyTo,
        emailMode: branchesTable.emailMode,
      })
      .from(branchesTable)
      .where(eq(branchesTable.id, branchScope))
      .limit(1);
    if (branch?.emailMode === "own" && branch.emailFromAddress?.trim()) {
      const fromAddress = branch.emailFromAddress.trim();
      return {
        fromAddress,
        replyTo: branch.emailReplyTo?.trim() || null,
        productionReady: !isResendTestSender(fromAddress),
        source: "branch",
      };
    }
  } else {
    const ownBranches = await db
      .select({
        emailFromAddress: branchesTable.emailFromAddress,
        emailReplyTo: branchesTable.emailReplyTo,
      })
      .from(branchesTable)
      .where(and(eq(branchesTable.emailMode, "own"), isNotNull(branchesTable.emailFromAddress)));
    const validOwn = ownBranches.filter(b => b.emailFromAddress?.trim());
    if (validOwn.length === 1) {
      const fromAddress = validOwn[0].emailFromAddress!.trim();
      return {
        fromAddress,
        replyTo: validOwn[0].emailReplyTo?.trim() || null,
        productionReady: !isResendTestSender(fromAddress),
        source: "branch",
      };
    }
  }

  return {
    fromAddress: RESEND_TEST_FROM,
    replyTo: systemReplyTo,
    productionReady: false,
    source: "resend_test",
  };
}

async function getAgingThresholds() {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    inactivityDays: parseInt(map["agingInactivityDays"] ?? "7"),
    days1: parseInt(map["agingDays1"] ?? "30"),
    days2: parseInt(map["agingDays2"] ?? "60"),
    days3: parseInt(map["agingDays3"] ?? "90"),
    notifyBeforeDueDays: parseInt(map["notifyBeforeDueDays"] ?? "7"),
  };
}

async function computeAlerts(userId?: number, profile?: ResolvedAccessProfile, branchScope?: number | null) {
  const settingRows = await db.select().from(settingsTable);
  const settingsMap: Record<string, string> = {};
  for (const r of settingRows) settingsMap[r.key] = r.value;
  const configuredBerthingOfficerIds = parseOfficerIds(settingsMap["berthingOfficerUserIds"]);
  const fallbackBerthingOfficerIds = configuredBerthingOfficerIds.length > 0
    ? configuredBerthingOfficerIds
    : parseOfficerIds(settingsMap["berthingOfficerUserId"]);
  const allContainers = branchScope != null
    ? await db.select().from(containersTable).where(eq(containersTable.branchId, branchScope))
    : await db.select().from(containersTable);
  if (allContainers.length === 0) return [];

  const allShipping = await db.select().from(shippingChargesTable);
  const allCustoms  = await db.select().from(customsChargesTable);
  const allTerminal = await db.select().from(terminalChargesTable);
  const allDelivery = await db.select().from(deliveryChargesTable);
  const allOps      = await db.select().from(operationsChargesTable);

  const idx = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
  const sMap = idx(allShipping); const cMap = idx(allCustoms); const tMap = idx(allTerminal);
  const dMap = idx(allDelivery); const oMap = idx(allOps);

  const containerData = allContainers.map(c => {
    const s = sMap[c.id] ?? {}; const cu = cMap[c.id] ?? {}; const t = tMap[c.id] ?? {};
    const d = dMap[c.id] ?? {}; const o = oMap[c.id] ?? {};
    const totalCost = calcTotalCost(s, cu, t, d, o);
    const revenue = parseFloat(c.clearingCharges as string ?? "0");
    const grossProfit = revenue - totalCost;
    const margin = revenue > 0 ? grossProfit / revenue : 0;
    const terminalCost = sumTerminal(t);
    const deliveryCost = sumDelivery(d);
    const dutyNotPaid = parseFloat(cu.dutyNotPaid ?? "0");
    const ageDays = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const nextActionDueDate = c.nextActionDueDate ? new Date(c.nextActionDueDate) : null;
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const isActionOverdue = nextActionDueDate !== null && nextActionDueDate.getTime() < startOfToday.getTime() && c.status !== "closed";
    const emptyReturnDueDate = c.emptyReturnDueDate ? new Date(c.emptyReturnDueDate) : null;
    const emptyReturnDate = c.emptyReturnDate ? new Date(c.emptyReturnDate) : null;
    const eta = c.eta ? new Date(c.eta) : null;
    const berthed = c.berthed ?? false;
    const paarReleasedAt = c.paarReleasedAt ? new Date(c.paarReleasedAt) : null;
    const paarNumber = c.paarNumber ?? null;
    return { id: c.id, containerNumber: c.containerNumber, customerName: c.customerName, status: c.status, revenue, totalCost, grossProfit, margin, terminalCost, deliveryCost, dutyNotPaid, createdAt: c.createdAt, ageDays, stageOwner: c.stageOwner ?? null, nextActionDueDate, isActionOverdue, emptyReturnDueDate, emptyReturnDate, eta, berthingOfficerId: c.berthingOfficerId ?? null, berthingOfficerIds: parseOfficerIds(c.berthingOfficerIds), berthed, paarReleasedAt, paarNumber };
  });

  const totals = containerData.reduce((acc, c) => ({ terminal: acc.terminal + c.terminalCost, delivery: acc.delivery + c.deliveryCost }), { terminal: 0, delivery: 0 });
  const count = containerData.length || 1;
  const avgTerminal = totals.terminal / count;
  const avgDelivery = totals.delivery / count;

  const thresholds = await getAgingThresholds();

  const lastActivityRows = await db
    .select({ containerId: auditLogTable.containerId, lastActivity: max(auditLogTable.createdAt) })
    .from(auditLogTable)
    .where(isNotNull(auditLogTable.containerId))
    .groupBy(auditLogTable.containerId);
  const lastActivityMap: Record<number, Date> = {};
  for (const row of lastActivityRows) {
    if (row.containerId != null && row.lastActivity) {
      lastActivityMap[row.containerId] = new Date(row.lastActivity);
    }
  }

  type Alert = { alertKey: string; type: string; severity: string; message: string; containerId?: number; containerNumber?: string; targetUserId?: number; generatedAt: string };
  const alerts: Alert[] = [];
  const now = new Date().toISOString();

  for (const c of containerData) {
    if (c.grossProfit < 0) {
      alerts.push({ alertKey: `negative_profit_${c.id}`, type: "negative_profit", severity: "critical", message: `Negative profit: ${c.containerNumber} (${c.customerName}) — ₦${c.grossProfit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
    } else if (c.margin > 0 && c.margin < LOW_MARGIN_PCT && c.revenue > 0) {
      alerts.push({ alertKey: `low_margin_${c.id}`, type: "low_margin", severity: "warning", message: `Low margin ${(c.margin * 100).toFixed(1)}%: ${c.containerNumber} (${c.customerName})`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
    }
    if (avgTerminal > 0 && c.terminalCost > avgTerminal * AVG_THRESHOLD) {
      alerts.push({ alertKey: `high_terminal_${c.id}`, type: "high_terminal", severity: "warning", message: `High terminal cost: ${c.containerNumber} — ₦${c.terminalCost.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
    }
    if (avgDelivery > 0 && c.deliveryCost > avgDelivery * AVG_THRESHOLD) {
      alerts.push({ alertKey: `high_delivery_${c.id}`, type: "high_delivery", severity: "warning", message: `High delivery cost: ${c.containerNumber} — ₦${c.deliveryCost.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
    }
    if (c.dutyNotPaid > 0 && c.status !== "closed") {
      alerts.push({ alertKey: `unpaid_duty_${c.id}`, type: "unpaid_duty", severity: "warning", message: `Unpaid duty: ${c.containerNumber} — ₦${c.dutyNotPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
    }

    if (c.status !== "closed") {
      if (c.ageDays >= thresholds.days3) {
        alerts.push({ alertKey: `aging_critical_${c.id}`, type: "aging_critical", severity: "critical", message: `Critical delay: ${c.containerNumber} (${c.customerName}) has been clearing for ${c.ageDays} days — immediate attention required`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
      } else if (c.ageDays >= thresholds.days2) {
        alerts.push({ alertKey: `aging_high_${c.id}`, type: "aging_high", severity: "warning", message: `Long delay: ${c.containerNumber} (${c.customerName}) has been clearing for ${c.ageDays} days`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
      } else if (c.ageDays >= thresholds.days1) {
        alerts.push({ alertKey: `aging_warn_${c.id}`, type: "aging_warn", severity: "warning", message: `Clearing delay: ${c.containerNumber} (${c.customerName}) has been clearing for ${c.ageDays} days`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
      }

      const lastActivity = lastActivityMap[c.id] ?? new Date(c.createdAt);
      const inactiveDays = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
      if (inactiveDays >= thresholds.inactivityDays) {
        alerts.push({ alertKey: `inactive_${c.id}`, type: "inactive", severity: "warning", message: `No activity for ${inactiveDays} day${inactiveDays === 1 ? "" : "s"}: ${c.containerNumber} (${c.customerName}) — last updated ${inactiveDays} days ago`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
      }
    }
  }

  const stageDueAlerts: Array<{ type: "transire_due" | "shipping_due" | "terminal_due" | "pullout_due" | "exam_release_due"; label: string; expected: keyof typeof allContainers[number]; released: keyof typeof allContainers[number]; eligible: (container: typeof allContainers[number]) => boolean }> = [
    { type: "transire_due", label: "Transire release", expected: "expectedTransireDate", released: "transireReleasedAt", eligible: () => true },
    { type: "shipping_due", label: "Delivery Order release", expected: "expectedDoDate", released: "doReleasedAt", eligible: () => true },
    { type: "terminal_due", label: "Terminal Delivery Order release", expected: "expectedTdoDate", released: "tdoReleasedAt", eligible: () => true },
    { type: "pullout_due", label: "Pullout", expected: "expectedPulloutDate", released: "pulloutReleasedAt", eligible: (container) => !!container.tdoReleasedAt },
    { type: "exam_release_due", label: "Examination / final release", expected: "expectedReleaseDate", released: "releaseConfirmedAt", eligible: (container) => ["examination", "final_release"].includes(container.status) },
  ];
  const startOfTodayForDueDates = new Date(); startOfTodayForDueDates.setHours(0, 0, 0, 0);
  const thresholdsForDueDates = await getAgingThresholds();
  const dueWindowEnd = new Date(startOfTodayForDueDates); dueWindowEnd.setDate(dueWindowEnd.getDate() + Math.max(0, thresholdsForDueDates.notifyBeforeDueDays));
  for (const container of allContainers) {
    if (container.status === "closed") continue;
    for (const check of stageDueAlerts) {
      if (!check.eligible(container) || container[check.released]) continue;
      const expectedDate = container[check.expected] as Date | null;
      if (!expectedDate) continue;
      const expected = new Date(expectedDate); expected.setHours(0, 0, 0, 0);
      if (expected > dueWindowEnd) continue;
      const deltaDays = Math.floor((expected.getTime() - startOfTodayForDueDates.getTime()) / 86_400_000);
      const timing = deltaDays < 0
        ? `overdue by ${Math.abs(deltaDays)} day${Math.abs(deltaDays) === 1 ? "" : "s"}`
        : deltaDays === 0 ? "due today" : `due in ${deltaDays} day${deltaDays === 1 ? "" : "s"}`;
      alerts.push({
        alertKey: `${check.type}_${container.id}`,
        type: check.type,
        severity: deltaDays < 0 ? "warning" : "info",
        message: `${check.label} ${timing}: ${container.containerNumber} (${container.customerName})${container.stageOwner ? ` - owner: ${container.stageOwner}` : ""}`,
        containerId: container.id,
        containerNumber: container.containerNumber,
        generatedAt: now,
      });
    }
  }

  for (const c of containerData) {
    if (c.isActionOverdue && c.nextActionDueDate) {
      const overdueDays = Math.floor((Date.now() - c.nextActionDueDate.getTime()) / (1000 * 60 * 60 * 24));
      alerts.push({
        alertKey: `action_overdue_${c.id}`,
        type: "action_overdue",
        severity: "warning",
        message: `Next action overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}: ${c.containerNumber} (${c.customerName})${c.stageOwner ? ` — owner: ${c.stageOwner}` : ""}`,
        containerId: c.id,
        containerNumber: c.containerNumber,
        generatedAt: now,
      });
    }
    if (c.emptyReturnDueDate && !c.emptyReturnDate) {
      const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
      if (c.emptyReturnDueDate.getTime() < startOfToday.getTime()) {
        const overdueDays = Math.floor((startOfToday.getTime() - c.emptyReturnDueDate.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({
          alertKey: `empty_return_overdue_${c.id}`,
          type: "empty_return_overdue",
          severity: "warning",
          message: `Empty container return overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}: ${c.containerNumber} (${c.customerName}) — empty return not yet recorded`,
          containerId: c.id,
          containerNumber: c.containerNumber,
          generatedAt: now,
        });
      }
    }
  }

  const TERMINAL_STALL_DAYS: Record<string, number> = {
    gate_in: 3,
    examination: 4,
    final_release: 5,
  };
  for (const c of allContainers) {
    if (c.status === "closed") continue;
    const stallDays = TERMINAL_STALL_DAYS[c.status];
    if (stallDays == null) continue;
    const lastActivity = lastActivityMap[c.id] ?? new Date(c.createdAt);
    const idleDays = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    if (idleDays >= stallDays) {
      const stageLabel: Record<string, string> = { gate_in: "Gate-In", examination: "Examination", final_release: "Final Release" };
      alerts.push({
        alertKey: `stage_stall_${c.id}`,
        type: "stage_stall",
        severity: idleDays >= stallDays * 2 ? "critical" : "warning",
        message: `${stageLabel[c.status]} stage stalled for ${idleDays} day${idleDays === 1 ? "" : "s"}: ${c.containerNumber} (${c.customerName})${c.stageOwner ? ` — owner: ${c.stageOwner}` : ""}`,
        containerId: c.id,
        containerNumber: c.containerNumber,
        generatedAt: now,
      });
    }
  }

  for (const c of containerData) {
    if (c.eta && !c.berthed && c.status !== "closed") {
      const effectiveBerthingOfficerIds = c.berthingOfficerIds.length > 0
        ? c.berthingOfficerIds
        : c.berthingOfficerId
          ? [c.berthingOfficerId]
          : fallbackBerthingOfficerIds;
      if (effectiveBerthingOfficerIds.length === 0 || !userId || !effectiveBerthingOfficerIds.includes(userId)) continue;
      const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
      const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
      const etaDay = new Date(c.eta); etaDay.setUTCHours(0, 0, 0, 0);
      if (etaDay.getTime() < startOfTomorrow.getTime()) {
        const overdueDays = Math.floor((startOfToday.getTime() - etaDay.getTime()) / (1000 * 60 * 60 * 24));
        const message = overdueDays > 0
          ? `ETA passed ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago — confirm if vessel has berthed: ${c.containerNumber} (${c.customerName})`
          : `Vessel ETA is today — confirm berthing when vessel arrives: ${c.containerNumber} (${c.customerName})`;
        alerts.push({
          alertKey: `berthing_${c.id}`,
          type: "berthing_confirmation_needed",
          severity: "warning",
          message,
          containerId: c.id,
          containerNumber: c.containerNumber,
          targetUserId: userId,
          generatedAt: now,
        });
      }
    }
  }

  // PAAR overdue — fires when PAAR ETA has passed and PAAR has not been released yet
  const DOC_STAGES = new Set(["registered", "documentation", "duty_assessment"]);
  const startOfToday2 = new Date(); startOfToday2.setUTCHours(0, 0, 0, 0);
  for (const c of containerData) {
    if (!DOC_STAGES.has(c.status)) continue;
    if (c.paarReleasedAt) continue;
    if (!c.nextActionDueDate) continue;
    if (c.nextActionDueDate.getTime() >= startOfToday2.getTime()) continue;
    const overdueDays = Math.floor((startOfToday2.getTime() - c.nextActionDueDate.getTime()) / (1000 * 60 * 60 * 24));
    alerts.push({
      alertKey: `paar_overdue_${c.id}`,
      type: "paar_overdue",
      severity: overdueDays >= 3 ? "critical" : "warning",
      message: `PAAR overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}: ${c.containerNumber} (${c.customerName}) — PAAR ETA has passed with no release recorded`,
      containerId: c.id,
      containerNumber: c.containerNumber,
      generatedAt: now,
    });
  }

  // Branch isolation (Task #74): scope tasks/approvals to the same containers
  // already filtered above. Without this, a branch-scoped user would receive
  // overdue-task and stale-approval alerts derived from other branches.
  const scopedContainerIds = allContainers.map(c => c.id);
  const overdueTasks = scopedContainerIds.length > 0
    ? await db.select({ id: containerTasksTable.id, containerId: containerTasksTable.containerId, title: containerTasksTable.title })
        .from(containerTasksTable)
        .where(and(lt(containerTasksTable.dueDate, new Date()), inArray(containerTasksTable.containerId, scopedContainerIds)))
    : [];
  for (const t of overdueTasks) {
    alerts.push({ alertKey: `overdue_task_${t.id}`, type: "overdue_task", severity: "warning", message: `Overdue task: "${t.title}"`, containerId: t.containerId ?? undefined, generatedAt: now });
  }

  const allApprovals = scopedContainerIds.length > 0
    ? await db.select().from(sectionApprovalsTable).where(inArray(sectionApprovalsTable.containerId, scopedContainerIds))
    : [];
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const stalePending = allApprovals.filter(a => a.status === "submitted" && a.submittedAt && new Date(a.submittedAt) < threeDaysAgo);
  if (stalePending.length > 0) {
    alerts.push({ alertKey: `stale_approval_${stalePending.length}`, type: "stale_approval", severity: "info", message: `${stalePending.length} section approval(s) waiting more than 3 days`, generatedAt: now });
  }

  if (userId) {
    const SECTION_NAME: Record<string, string> = {
      shipping: "Shipping", customs: "Customs", terminal: "Terminal",
      delivery: "Delivery", operations: "Operations",
    };
    const myRejected = allApprovals.filter(a => a.status === "rejected" && a.submittedById === userId);
    const containerMap: Record<number, string> = {};
    for (const c of allContainers) containerMap[c.id] = c.containerNumber;
    for (const a of myRejected) {
      const sectionLabel = SECTION_NAME[a.section] ?? a.section;
      const containerNumber = containerMap[a.containerId] ?? `#${a.containerId}`;
      const reasonSnippet = a.rejectionReason ? `: "${a.rejectionReason}"` : "";
      alerts.push({
        alertKey: `rejected_section_${a.id}`,
        type: "rejected_section",
        severity: "critical",
        message: `${sectionLabel} section rejected for ${containerNumber}${reasonSnippet}`,
        containerId: a.containerId,
        containerNumber,
        generatedAt: now,
      });
    }
  }

  if (profile && !isAdminProfile(profile)) {
    const allowed = allowedAlertTypes(profile);
    if (allowed) return alerts.filter(a => allowed.has(a.type) || a.targetUserId === userId);
    return alerts.filter(a => a.targetUserId === userId);
  }

  return alerts;
}

notificationsRouter.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const profile = (req as AuthRequest).user!.accessProfile;
    const branchScope = getBranchScope(req as AuthRequest);
    // Persist alerts under the active scope so /notifications/history filtering
    // returns the correct slice (Task #74). Super-admin in "All" mode falls
    // back to user.branchId so the row still satisfies the NOT NULL column.
    const persistBranchId = branchScope ?? (req as AuthRequest).user!.branchId;
    // Always compute against ALL alerts (no role filter) for history persistence
    const allAlerts = await computeAlerts(userId, profile, branchScope);
    const now = new Date();

    // Persist every active alert into history (upsert: first_seen_at stays, last_seen_at updated).
    // Task #74: each row's branchId must reflect the alert's true branch — never bucket
    // cross-branch alerts under the super-admin's home branch.
    if (allAlerts.length > 0) {
      try {
        const alertContainerIds = Array.from(new Set(allAlerts.map(a => a.containerId).filter((x): x is number => x != null)));
        const containerBranchMap = new Map<number, number>();
        if (alertContainerIds.length > 0) {
          const rows = await db.select({ id: containersTable.id, branchId: containersTable.branchId })
            .from(containersTable).where(inArray(containersTable.id, alertContainerIds));
          for (const r of rows) containerBranchMap.set(r.id, r.branchId);
        }
        const valuesToInsert = allAlerts
          .map(a => {
            const trueBranch = a.containerId != null ? containerBranchMap.get(a.containerId) : undefined;
            const branchId = trueBranch ?? branchScope ?? null;
            return branchId == null ? null : {
              alertKey: a.alertKey,
              branchId,
              type: a.type,
              severity: a.severity,
              message: a.message,
              containerId: a.containerId ?? null,
              containerNumber: a.containerNumber ?? null,
              firstSeenAt: now,
              lastSeenAt: now,
            };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);
        if (valuesToInsert.length === 0) {
          // nothing safe to persist (e.g. super-admin all-mode aggregate-only alerts)
        } else {
        await db.insert(systemAlertsHistoryTable)
          .values(valuesToInsert)
          .onConflictDoUpdate({
            target: systemAlertsHistoryTable.alertKey,
            set: {
              lastSeenAt: now,
              // Update message so it stays current (e.g. updated amounts)
              message: sql`EXCLUDED.message`,
              severity: sql`EXCLUDED.severity`,
            },
          });
        }
      } catch { /* non-fatal — history write should not break the response */ }
    }

    const readRows = await db.select().from(notificationsReadTable).where(eq(notificationsReadTable.userId, userId));
    const readMap: Record<string, { isRead: boolean; readAt: string | null }> = {};
    for (const r of readRows) {
      readMap[r.alertKey] = { isRead: r.isRead, readAt: r.readAt ? r.readAt.toISOString() : null };
    }
    const result = allAlerts.map(a => ({
      ...a,
      isRead: readMap[a.alertKey]?.isRead ?? false,
      readAt: readMap[a.alertKey]?.readAt ?? null,
    }));
    const unreadCount = result.filter(a => !a.isRead).length;
    return res.json({ notifications: result, unreadCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Full historical log of all system alerts ever detected
notificationsRouter.get("/notifications/history", requireAuth, async (req: AuthRequest, res) => {
  try {
    const staleThresholdMs = 2 * 60 * 60 * 1000; // 2 hours — alert not seen recently = resolved
    const branchScope = getBranchScope(req);
    const baseQ = db.select().from(systemAlertsHistoryTable).$dynamic();
    const rows = await (branchScope !== null
      ? baseQ.where(eq(systemAlertsHistoryTable.branchId, branchScope))
      : baseQ).orderBy(desc(systemAlertsHistoryTable.lastSeenAt)).limit(500);

    const now = Date.now();
    const alerts = rows.map(r => ({
      id: r.id,
      alertKey: r.alertKey,
      type: r.type,
      severity: r.severity,
      message: r.message,
      containerId: r.containerId,
      containerNumber: r.containerNumber,
      firstSeenAt: r.firstSeenAt instanceof Date ? r.firstSeenAt.toISOString() : String(r.firstSeenAt),
      lastSeenAt: r.lastSeenAt instanceof Date ? r.lastSeenAt.toISOString() : String(r.lastSeenAt),
      isResolved: (now - new Date(r.lastSeenAt).getTime()) > staleThresholdMs,
    }));

    return res.json({ alerts, total: alerts.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/:alertKey/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const branchId = req.user!.branchId;
    const alertKey = String(req.params.alertKey);
    const now = new Date();
    await db.insert(notificationsReadTable)
      .values({ alertKey, userId, branchId, isRead: true, readAt: now })
      .onConflictDoUpdate({
        target: [notificationsReadTable.alertKey, notificationsReadTable.userId],
        set: { isRead: true, readAt: now },
      });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const branchId = req.user!.branchId;
    const branchScope = getBranchScope(req);
    const alerts = await computeAlerts(userId, req.user!.accessProfile, branchScope);
    if (alerts.length === 0) return res.json({ success: true });

    const now = new Date();
    await db.insert(notificationsReadTable)
      .values(alerts.map(a => ({ alertKey: a.alertKey, userId, branchId, isRead: true, readAt: now })))
      .onConflictDoUpdate({
        target: [notificationsReadTable.alertKey, notificationsReadTable.userId],
        set: { isRead: true, readAt: now },
      });
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.get("/notifications/email-status", requireAuth, requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const sender = await resolveEmailSender(getBranchScope(req));
    return res.json({
      configured: !!process.env.RESEND_API_KEY,
      fromAddress: sender.fromAddress,
      productionReady: sender.productionReady,
      source: sender.source,
    });
  } catch (err) {
    console.error("[email-status] error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/send-email-digest", requireAuth, requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    {
      const branchScope = getBranchScope(req);
      if (!process.env.RESEND_API_KEY) {
        return res.status(503).json({ error: "Email service is not configured. Please set up the Resend integration in Settings." });
      }
      const rows = await db.select().from(settingsTable);
      const settingsMap: Record<string, string> = {};
      for (const row of rows) settingsMap[row.key] = row.value;
      if (settingsMap["agingEmailEnabled"] !== "true") {
        return res.status(400).json({ error: "Email alerts are disabled in Settings." });
      }
      const preferences = getEmailAlertPreferences(settingsMap);
      const configured = EMAIL_ALERT_CATEGORIES
        .map(({ id }) => ({ id, recipients: emailRecipients(preferences[id].recipients) }))
        .filter(({ id, recipients }) => preferences[id].enabled && recipients.length > 0);
      if (configured.length === 0) {
        return res.status(400).json({ error: "Enable at least one alert category and add its recipients in Settings." });
      }
      const alerts = await computeAlerts(undefined, undefined, branchScope);
      const results = await Promise.all(configured.map(({ id, recipients }) => sendEmailAlertCategory(id, recipients, alerts, branchScope)));
      const nowSent = new Date();
      for (const { id } of configured) preferences[id].lastSentAt = nowSent.toISOString();
      await db.insert(settingsTable)
        .values({ key: "emailAlertPreferences", value: JSON.stringify(preferences), updatedAt: nowSent })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(preferences), updatedAt: nowSent } });
      return res.json({
        success: true,
        sent: configured.reduce((total, entry) => total + entry.recipients.length, 0),
        categoriesSent: configured.length,
        alertCount: results.reduce((total, result) => total + result.count, 0),
        fromAddress: results[0]?.fromAddress,
        productionReady: results[0]?.productionReady,
      });
    }
    // Branch isolation (Task #74): scope alert computation. Super-admin must
    // pick a specific branch via X-Branch-Id; non-super-admins are pinned to
    // their own branch.
    const branchScope = getBranchScope(req);
    // super_admin with "All branches" selected sends a global digest — allowed.
    // Non-super-admins are always pinned to their own branch via getBranchScope.
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Email service is not configured. Please set up the Resend integration in Settings." });
    }

    const sender = await resolveEmailSender(branchScope);
    const rows = await db.select().from(settingsTable);
    const settingsMap: Record<string, string> = {};
    for (const r of rows) settingsMap[r.key] = r.value;
    const emailTo = settingsMap["agingEmailTo"] ?? "";
    if (!emailTo.trim()) {
      return res.status(400).json({ error: "No email recipients configured. Add recipients in Settings." });
    }
    const to = emailTo.split(",").map(e => e.trim()).filter(Boolean);
    const alerts = await computeAlerts(req.user?.id, req.user?.accessProfile, branchScope);
    const agingTypes = ["aging_warn", "aging_high", "aging_critical", "inactive", "negative_profit"];
    const relevant = alerts.filter(a => agingTypes.includes(a.type));
    const criticalAlerts = relevant.filter(a => a.severity === "critical");
    const warningAlerts = relevant.filter(a => a.severity === "warning");

    const alertRows = (list: typeof alerts, label: string, color: string) =>
      list.length === 0 ? "" : `
        <tr><td colspan="2" style="padding:12px 0 6px;font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.5px;">${label}</td></tr>
        ${list.map(a => `<tr style="border-bottom:1px solid #2a2a2a;">
          <td style="padding:8px 12px 8px 0;font-size:13px;color:#e5e5e5;">${a.containerNumber ?? "—"}</td>
          <td style="padding:8px 0;font-size:13px;color:#a3a3a3;">${a.message}</td>
        </tr>`).join("")}
      `;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:40px auto;background:#141414;border-radius:12px;border:1px solid #262626;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:28px 32px;border-bottom:1px solid #262626;">
      <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">Container Alert Digest</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#737373;">${new Date().toLocaleString("en-NG", { dateStyle: "full", timeStyle: "short" })}</p>
    </div>
    <div style="padding:24px 32px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
        <div style="background:#2a0000;border:1px solid #7f1d1d;border-radius:8px;padding:14px;">
          <div style="font-size:28px;font-weight:700;color:#f87171;">${criticalAlerts.length}</div>
          <div style="font-size:12px;color:#fca5a5;margin-top:2px;">Critical Alerts</div>
        </div>
        <div style="background:#1c1000;border:1px solid #92400e;border-radius:8px;padding:14px;">
          <div style="font-size:28px;font-weight:700;color:#fb923c;">${warningAlerts.length}</div>
          <div style="font-size:12px;color:#fdba74;margin-top:2px;">Warnings</div>
        </div>
      </div>
      ${relevant.length === 0 ? `<p style="color:#737373;font-size:14px;text-align:center;padding:20px 0;">No aging or critical alerts at this time. All containers are on track.</p>` : `
      <table style="width:100%;border-collapse:collapse;">
        ${alertRows(criticalAlerts, "Critical", "#f87171")}
        ${alertRows(warningAlerts, "Warnings", "#fb923c")}
      </table>`}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #262626;background:#0f0f0f;">
      <p style="margin:0;font-size:11px;color:#525252;text-align:center;">Sent by Cost Analysis — Bonded Terminal Management</p>
    </div>
  </div>
</body>
</html>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender.fromAddress,
        to,
        ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
        subject: `Container Alert Digest — ${criticalAlerts.length} critical, ${warningAlerts.length} warnings`,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.json().catch(() => ({}));
      console.error("Resend error:", errBody);
      return res.status(502).json({ error: "Failed to send email via Resend. Check your API key and sender domain." });
    }

    const nowSent = new Date();
    await db.insert(settingsTable)
      .values({ key: "digestLastSentAt", value: nowSent.toISOString(), updatedAt: nowSent })
      .onConflictDoUpdate({ target: settingsTable.key, set: { value: nowSent.toISOString(), updatedAt: nowSent } });

    return res.json({
      success: true,
      sent: to.length,
      alertCount: relevant.length,
      fromAddress: sender.fromAddress,
      productionReady: sender.productionReady,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/mark-viewed", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const branchScope = getBranchScope(req as AuthRequest);
    const branchId = branchScope ?? (req as AuthRequest).user!.branchId;
    const alerts = await computeAlerts(userId, (req as AuthRequest).user!.accessProfile, branchScope);
    if (alerts.length === 0) return res.json({ success: true, marked: 0 });

    const now = new Date();
    await db.insert(notificationsReadTable)
      .values(alerts.map(a => ({ alertKey: a.alertKey, userId, branchId, isRead: true, readAt: now })))
      .onConflictDoUpdate({
        target: [notificationsReadTable.alertKey, notificationsReadTable.userId],
        set: { isRead: true, readAt: sql`CASE WHEN ${notificationsReadTable.isRead} THEN ${notificationsReadTable.readAt} ELSE ${now} END` },
      });
    return res.json({ success: true, marked: alerts.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Workflow notifications (event-based: new_job, stage_complete, overdue, delay_recorded)
notificationsRouter.get("/workflow-notifications", requireAuth, async (req: AuthRequest, res) => {
  try {
    const profile = req.user!.accessProfile;
    const branchScope = getBranchScope(req);
    const userId = req.user!.id;
    const typeFilter = String(req.query.type ?? "all");
    const readFilter = String(req.query.read ?? "all");
    const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
    const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);
    const targetUserId = req.query.targetUserId != null && req.query.targetUserId !== ""
      ? Number(req.query.targetUserId)
      : null;
    const requestedLimit = Number(req.query.limit ?? 500);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 1000) : 500;

    // Check for overdue stages and auto-create notifications (deduplicated by checking recent ones)
    const containers = branchScope !== null
      ? await db.select().from(containersTable).where(eq(containersTable.branchId, branchScope))
      : await db.select().from(containersTable);
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const STAGE_OVERDUE_CHECK: Array<{
      stage: string;
      expectedField: keyof typeof containers[0];
      releasedField: keyof typeof containers[0];
      label: string;
    }> = [
      { stage: "transire_processing", expectedField: "expectedTransireDate", releasedField: "transireReleasedAt", label: "Transire" },
      { stage: "shipping",            expectedField: "expectedDoDate",       releasedField: "doReleasedAt",       label: "Delivery Order (DO)" },
      { stage: "terminal",            expectedField: "expectedTdoDate",      releasedField: "tdoReleasedAt",      label: "TDO" },
      { stage: "pull_out",            expectedField: "expectedPulloutDate",  releasedField: "pulloutReleasedAt",  label: "Pullout" },
      { stage: "final_release",       expectedField: "expectedReleaseDate",  releasedField: "releaseConfirmedAt", label: "Final Release" },
    ];
    for (const c of containers) {
      if (c.status === "closed") continue;
      for (const check of STAGE_OVERDUE_CHECK) {
        const expectedDate = c[check.expectedField] as Date | null;
        const releasedAt = c[check.releasedField] as Date | null;
        if (!expectedDate || releasedAt) continue;
        if (check.stage === "pull_out" && !c.tdoReleasedAt) continue;
        const exp = new Date(expectedDate); exp.setUTCHours(0, 0, 0, 0);
        if (exp.getTime() <= today.getTime()) {
          const overdueDays = Math.floor((today.getTime() - exp.getTime()) / 86_400_000);
          const message = overdueDays > 0
            ? `${check.label} overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}: ${c.containerNumber}`
            : `${check.label} due today: ${c.containerNumber}`;
          // Keep generated overdue reminders deduped; user/business action
          // notifications are inserted elsewhere and must remain as full history.
          const [existing] = await db.select({ id: workflowNotificationsTable.id })
            .from(workflowNotificationsTable)
            .where(
              and(
                eq(workflowNotificationsTable.containerId, c.id),
                eq(workflowNotificationsTable.type, "overdue")
              )
            )
            .limit(1);
          if (!existing) {
            await db.insert(workflowNotificationsTable).values({
              type: "overdue",
              message,
              containerId: c.id,
              branchId: c.branchId,
              containerNumber: c.containerNumber,
            });
          }
        }
      }
    }

    const allWorkflow = branchScope !== null
      ? await db.select()
          .from(workflowNotificationsTable)
          .where(eq(workflowNotificationsTable.branchId, branchScope))
          .orderBy(desc(workflowNotificationsTable.createdAt))
          .limit(limit)
      : await db.select()
          .from(workflowNotificationsTable)
          .orderBy(desc(workflowNotificationsTable.createdAt))
          .limit(limit);

    // Targeted rows are personal. This also hides historic recipient fan-out
    // copies from admins, while untargeted role events stay visible by policy.
    let notifications = allWorkflow.filter(n => isWorkflowNotificationVisibleToUser(n, profile, userId));
    if (typeFilter !== "all") notifications = notifications.filter(n => n.type === typeFilter);
    if (readFilter === "read") notifications = notifications.filter(n => n.isRead);
    if (readFilter === "unread") notifications = notifications.filter(n => !n.isRead);
    if (dateFrom && !Number.isNaN(dateFrom.getTime())) notifications = notifications.filter(n => new Date(n.createdAt).getTime() >= dateFrom.getTime());
    if (dateTo && !Number.isNaN(dateTo.getTime())) notifications = notifications.filter(n => new Date(n.createdAt).getTime() <= dateTo.getTime());
    if (targetUserId != null && Number.isFinite(targetUserId)) {
      if (!isAdminProfile(profile) && targetUserId !== userId) return res.status(403).json({ error: "Cannot filter another user's notifications" });
      notifications = notifications.filter(n => n.targetUserId === targetUserId);
    }

    const unreadCount = notifications.filter(n => !n.isRead).length;
    return res.json({ notifications, unreadCount });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/workflow-notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    const [existing] = await db.select({
      branchId: workflowNotificationsTable.branchId,
      targetUserId: workflowNotificationsTable.targetUserId,
      type: workflowNotificationsTable.type,
      message: workflowNotificationsTable.message,
    })
      .from(workflowNotificationsTable).where(eq(workflowNotificationsTable.id, id));
    if (!existing || !userCanAccessBranch(req, existing.branchId)) {
      return res.status(404).json({ error: "Notification not found" });
    }
    if (!isWorkflowNotificationVisibleToUser(existing, req.user!.accessProfile, req.user!.id)) {
      return res.status(403).json({ error: "Cannot mark another user's notification as read" });
    }
    await db.update(workflowNotificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(eq(workflowNotificationsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/workflow-notifications/read-all", requireAuth, async (req: AuthRequest, res) => {
  try {
    const branchScope = getBranchScope(req);
    const userId = req.user!.id;
    const unreadClause = eq(workflowNotificationsTable.isRead, false);
    const branchClause = branchScope !== null ? eq(workflowNotificationsTable.branchId, branchScope) : undefined;
    const baseWhere = and(unreadClause, branchClause);

    const rows = await db.select()
      .from(workflowNotificationsTable)
      .where(baseWhere)
      .limit(1000);
    const visibleIds = rows
      .filter(n => isWorkflowNotificationVisibleToUser(n, req.user!.accessProfile, userId))
      .map(n => n.id);
    if (visibleIds.length > 0) {
      await db.update(workflowNotificationsTable)
        .set({ isRead: true, readAt: new Date() })
        .where(inArray(workflowNotificationsTable.id, visibleIds));
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export async function runScheduledDigest(): Promise<void> {
  try {
    {
      const rows = await db.select().from(settingsTable);
      const settings: Record<string, string> = {};
      for (const row of rows) settings[row.key] = row.value;
      if (settings["agingEmailEnabled"] !== "true" || !process.env.RESEND_API_KEY) return;

      const [hours, minutes] = (settings["digestTime"] ?? "08:00").split(":").map((part) => Number.parseInt(part, 10));
      const now = new Date();
      const targetMinutes = (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0);
      if (now.getHours() * 60 + now.getMinutes() < targetMinutes) return;

      const preferences = getEmailAlertPreferences(settings);
      const alerts = await computeAlerts();
      const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
      const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
      let changed = false;

      for (const { id, title } of EMAIL_ALERT_CATEGORIES) {
        const preference = preferences[id];
        const recipients = preference.enabled ? emailRecipients(preference.recipients) : [];
        if (preference.frequency === "none" || recipients.length === 0) continue;
        const lastSent = preference.lastSentAt ? new Date(preference.lastSentAt) : null;
        if (preference.frequency === "daily" && lastSent && lastSent >= startOfToday) continue;
        if (preference.frequency === "weekly" && (now.getDay() !== 1 || (lastSent && lastSent >= startOfWeek))) continue;
        try {
          const result = await sendEmailAlertCategory(id, recipients, alerts);
          preference.lastSentAt = now.toISOString();
          changed = true;
          console.log(`[email-alert-scheduler] Sent ${title} to ${recipients.length} recipient(s), ${result.count} item(s).`);
        } catch (error) {
          console.error(`[email-alert-scheduler] ${title} failed:`, error);
        }
      }
      if (changed) {
        await db.insert(settingsTable)
          .values({ key: "emailAlertPreferences", value: JSON.stringify(preferences), updatedAt: now })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: JSON.stringify(preferences), updatedAt: now } });
      }
      return;
    }
  } catch (err) {
    console.error("[digest-scheduler] Error:", err);
  }
}
