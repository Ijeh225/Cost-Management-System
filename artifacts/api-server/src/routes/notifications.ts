import { Router } from "express";
import { db, notificationsReadTable, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable, settingsTable, auditLogTable, workflowNotificationsTable, systemAlertsHistoryTable, branchesTable } from "@workspace/db";
import { eq, lt, sql, max, isNotNull, desc, inArray, notInArray, and } from "drizzle-orm";
import { requireAuth, requireBranchAdminOrAbove, AuthRequest, getBranchScope, userCanAccessBranch } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery } from "../lib/calculations.js";

export const notificationsRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;
const RESEND_TEST_FROM = "Cost Management <onboarding@resend.dev>";

const ADMIN_ROLES = new Set(["admin", "super_admin", "branch_admin"]);

const ROLE_ALERT_TYPES: Record<string, Set<string>> = {
  delivery_user: new Set([
    "high_delivery",
    "empty_return_overdue",
    "rejected_section",
  ]),
  terminal_manager: new Set([
    "high_terminal",
    "berthing_confirmation_needed",
    "aging_warn",
    "aging_high",
    "aging_critical",
    "inactive",
    "action_overdue",
    "stage_stall",
    "rejected_section",
  ]),
  operations_user: new Set([
    "aging_warn",
    "aging_high",
    "aging_critical",
    "inactive",
    "action_overdue",
    "rejected_section",
  ]),
  staff: new Set([
    "aging_warn",
    "aging_high",
    "aging_critical",
    "inactive",
    "action_overdue",
    "rejected_section",
  ]),
  accounts_user: new Set([
    "negative_profit",
    "low_margin",
    "unpaid_duty",
    "rejected_section",
  ]),
  documentation_user: new Set([
    "overdue_task",
    "stale_approval",
    "rejected_section",
    "paar_overdue",
  ]),
};

const ROLE_WORKFLOW_TYPES: Record<string, Set<string>> = {
  delivery_user:           new Set(["overdue", "empty_gate_out"]),
  terminal_manager:        new Set(["overdue", "stage_complete", "delay_recorded", "gate_in", "gate_out", "empty_gate_in", "empty_gate_out", "berthing_confirmed"]),
  terminal_user:           new Set(["stage_complete", "gate_in", "gate_out", "empty_gate_in"]),
  security_user:           new Set(["new_job", "stage_complete", "gate_in"]),
  operations_user:         new Set(["new_job", "stage_complete", "overdue", "delay_recorded", "gate_out", "empty_gate_in", "berthing_confirmed"]),
  staff:                   new Set(["new_job", "stage_complete", "overdue", "delay_recorded", "payment_schedule_created", "payment_schedule_rejected", "payment_schedule_paid", "payment_schedule_completed", "payment_schedule_rescheduled", "payment_schedule_cancelled", "payment_schedule_comment"]),
  accounts_user:           new Set(["invoice_created", "invoice_paid", "berthing_confirmed", "payment_schedule_approved", "payment_schedule_paid", "payment_schedule_completed", "payment_schedule_comment"]),
  documentation_user:      new Set(["new_job"]),
  shipping_user:           new Set(["stage_complete", "delay_recorded", "overdue", "berthing_confirmed"]),
  shipping_terminal_user:  new Set(["stage_complete", "delay_recorded", "overdue", "berthing_confirmed", "gate_in", "gate_out"]),
  customs_user:            new Set(["new_job", "stage_complete", "berthing_confirmed"]),
  transire_user:           new Set(["stage_complete", "delay_recorded", "overdue"]),
  pull_out_user:           new Set(["stage_complete", "delay_recorded", "overdue", "gate_out", "empty_gate_out"]),
};

const ROLE_WORKFLOW_STAGES: Record<string, Set<string>> = {
  transire_user: new Set(["transire_processing"]),
  shipping_user: new Set(["shipping"]),
  terminal_user: new Set(["terminal"]),
  pull_out_user: new Set(["pull_out"]),
  shipping_terminal_user: new Set(["shipping", "terminal"]),
  terminal_manager: new Set(["gate_in", "examination", "final_release"]),
};

function getAllowedWorkflowTypes(roles: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const r of roles) {
    for (const t of ROLE_WORKFLOW_TYPES[r] ?? []) allowed.add(t);
  }
  return allowed;
}

function getAllowedWorkflowStages(roles: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const r of roles) {
    for (const s of ROLE_WORKFLOW_STAGES[r] ?? []) allowed.add(s);
  }
  return allowed;
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

function isWorkflowNotificationVisibleToUser(
  notification: { type: string; message: string; targetUserId: number | null },
  roles: string[],
  userId: number,
): boolean {
  if (notification.targetUserId != null) return notification.targetUserId === userId;

  const allowedTypes = getAllowedWorkflowTypes(roles);
  if (!allowedTypes.has(notification.type)) return false;

  const allowedStages = getAllowedWorkflowStages(roles);
  if (allowedStages.size === 0) return true;

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
  };
}

async function computeAlerts(userId?: number, role?: string, branchScope?: number | null) {
  const settingRows = await db.select().from(settingsTable);
  const settingsMap: Record<string, string> = {};
  for (const r of settingRows) settingsMap[r.key] = r.value;
  const configuredBerthingOfficerId = Number.parseInt(settingsMap["berthingOfficerUserId"] ?? "", 10);
  const fallbackBerthingOfficerId = Number.isFinite(configuredBerthingOfficerId) && configuredBerthingOfficerId > 0
    ? configuredBerthingOfficerId
    : null;
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
    return { id: c.id, containerNumber: c.containerNumber, customerName: c.customerName, status: c.status, revenue, totalCost, grossProfit, margin, terminalCost, deliveryCost, dutyNotPaid, createdAt: c.createdAt, ageDays, stageOwner: c.stageOwner ?? null, nextActionDueDate, isActionOverdue, emptyReturnDueDate, emptyReturnDate, eta, berthingOfficerId: c.berthingOfficerId ?? null, berthed, paarReleasedAt, paarNumber };
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
      const effectiveBerthingOfficerId = c.berthingOfficerId ?? fallbackBerthingOfficerId;
      if (!effectiveBerthingOfficerId || effectiveBerthingOfficerId !== userId) continue;
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
          targetUserId: effectiveBerthingOfficerId,
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

  if (role && !ADMIN_ROLES.has(role)) {
    const allowed = ROLE_ALERT_TYPES[role];
    if (allowed) return alerts.filter(a => allowed.has(a.type) || a.targetUserId === userId);
    return alerts.filter(a => a.targetUserId === userId);
  }

  return alerts;
}

notificationsRouter.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const role   = (req as AuthRequest).user!.role;
    const branchScope = getBranchScope(req as AuthRequest);
    // Persist alerts under the active scope so /notifications/history filtering
    // returns the correct slice (Task #74). Super-admin in "All" mode falls
    // back to user.branchId so the row still satisfies the NOT NULL column.
    const persistBranchId = branchScope ?? (req as AuthRequest).user!.branchId;
    // Always compute against ALL alerts (no role filter) for history persistence
    const allAlerts = await computeAlerts(userId, role, branchScope);
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
    const role   = req.user!.role;
    const branchId = req.user!.branchId;
    const branchScope = getBranchScope(req);
    const alerts = await computeAlerts(userId, role, branchScope);
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
    const alerts = await computeAlerts(req.user?.id, req.user?.role, branchScope);
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
    const role   = (req as AuthRequest).user!.role;
    const branchScope = getBranchScope(req as AuthRequest);
    const branchId = branchScope ?? (req as AuthRequest).user!.branchId;
    const alerts = await computeAlerts(userId, role, branchScope);
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
    const role = req.user!.role;
    const roles = req.user!.roles?.length ? req.user!.roles : [role];
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

    let notifications = allWorkflow;
    if (role && !roles.some(r => ADMIN_ROLES.has(r))) {
      notifications = notifications.filter(n => isWorkflowNotificationVisibleToUser(n, roles, userId));
    }
    if (typeFilter !== "all") notifications = notifications.filter(n => n.type === typeFilter);
    if (readFilter === "read") notifications = notifications.filter(n => n.isRead);
    if (readFilter === "unread") notifications = notifications.filter(n => !n.isRead);
    if (dateFrom && !Number.isNaN(dateFrom.getTime())) notifications = notifications.filter(n => new Date(n.createdAt).getTime() >= dateFrom.getTime());
    if (dateTo && !Number.isNaN(dateTo.getTime())) notifications = notifications.filter(n => new Date(n.createdAt).getTime() <= dateTo.getTime());
    if (targetUserId != null && Number.isFinite(targetUserId)) {
      if (!roles.some(r => ADMIN_ROLES.has(r)) && targetUserId !== userId) return res.status(403).json({ error: "Cannot filter another user's notifications" });
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
    const isAdmin = ADMIN_ROLES.has(req.user!.role);
    const roles = req.user!.roles?.length ? req.user!.roles : [req.user!.role];
    if (!isAdmin && !isWorkflowNotificationVisibleToUser(existing, roles, req.user!.id)) {
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
    const isAdmin = ADMIN_ROLES.has(req.user!.role);
    const userId = req.user!.id;
    const roles = req.user!.roles?.length ? req.user!.roles : [req.user!.role];
    const unreadClause = eq(workflowNotificationsTable.isRead, false);
    const branchClause = branchScope !== null ? eq(workflowNotificationsTable.branchId, branchScope) : undefined;
    const baseWhere = and(unreadClause, branchClause);

    if (isAdmin) {
      await db.update(workflowNotificationsTable)
        .set({ isRead: true, readAt: new Date() })
        .where(baseWhere);
    } else {
      const rows = await db.select()
        .from(workflowNotificationsTable)
        .where(baseWhere)
        .limit(1000);
      const visibleIds = rows
        .filter(n => isWorkflowNotificationVisibleToUser(n, roles, userId))
        .map(n => n.id);
      if (visibleIds.length > 0) {
        await db.update(workflowNotificationsTable)
          .set({ isRead: true, readAt: new Date() })
          .where(inArray(workflowNotificationsTable.id, visibleIds));
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export async function runScheduledDigest(): Promise<void> {
  try {
    const rows = await db.select().from(settingsTable);
    const s: Record<string, string> = {};
    for (const r of rows) s[r.key] = r.value;

    const freq = s["digestFrequency"] ?? "none";
    if (freq === "none") return;

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;

    const emailTo = s["agingEmailTo"] ?? "";
    if (!emailTo.trim()) return;

    const [hhStr, mmStr] = (s["digestTime"] ?? "08:00").split(":");
    const hh = parseInt(hhStr ?? "8");
    const mm = parseInt(mmStr ?? "0");

    const now = new Date();
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const targetMins = (isNaN(hh) ? 8 : hh) * 60 + (isNaN(mm) ? 0 : mm);
    if (nowMins < targetMins) return;

    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const lastSentStr = s["digestLastSentAt"];
    if (lastSentStr) {
      const lastSent = new Date(lastSentStr);
      if (freq === "daily" && lastSent >= startOfToday) return;
      if (freq === "weekly") {
        if (now.getDay() !== 1) return;
        const monday = new Date(startOfToday);
        monday.setDate(startOfToday.getDate() - ((startOfToday.getDay() + 6) % 7));
        if (lastSent >= monday) return;
      }
    }

    const to = emailTo.split(",").map((e: string) => e.trim()).filter(Boolean);

    // Resolve the from address: the scheduled digest is a system-wide send.
    // Recipient/schedule settings live in the global settings table (not per-branch),
    // so there is no single authoritative branch context. We look for a branch with
    // emailMode="own" and a set emailFromAddress only when there is exactly one such
    // branch — this keeps the address unambiguous. With multiple or zero own-mode
    // branches we fall back to the system default to avoid cross-branch identity leakage.
    const sender = await resolveEmailSender(null);

    const allAlerts = await computeAlerts();
    const agingTypes = ["aging_warn", "aging_high", "aging_critical", "inactive", "negative_profit"];
    const relevant = allAlerts.filter((a: any) => agingTypes.includes(a.type));

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: sender.fromAddress,
        to,
        ...(sender.replyTo ? { reply_to: sender.replyTo } : {}),
        subject: `[Scheduled] Container Alert Digest — ${relevant.filter((a: any) => a.severity === "critical").length} critical`,
        html: `<p>Scheduled digest: ${relevant.length} alerts. Log in to Cost Analysis to review.</p>`,
      }),
    });

    if (emailRes.ok) {
      const sent = new Date();
      await db.insert(settingsTable)
        .values({ key: "digestLastSentAt", value: sent.toISOString(), updatedAt: sent })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: sent.toISOString(), updatedAt: sent } });
      console.log(`[digest-scheduler] Sent to ${to.length} recipients, ${relevant.length} alerts, from: ${sender.fromAddress}, productionReady=${sender.productionReady}`);
    } else {
      console.error("[digest-scheduler] Resend error:", await emailRes.text().catch(() => "unknown"));
    }
  } catch (err) {
    console.error("[digest-scheduler] Error:", err);
  }
}
