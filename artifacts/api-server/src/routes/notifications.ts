import { Router } from "express";
import { db, notificationsReadTable, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable, settingsTable, auditLogTable, workflowNotificationsTable, systemAlertsHistoryTable } from "@workspace/db";
import { eq, lt, sql, max, isNotNull, desc, inArray, notInArray, and } from "drizzle-orm";
import { requireAuth, requireBranchAdminOrAbove, AuthRequest, getBranchScope, userCanAccessBranch } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery } from "../lib/calculations.js";

export const notificationsRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;

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
  delivery_user:           new Set(["overdue", "empty_gate_out", "document_uploaded"]),
  terminal_manager:        new Set(["overdue", "stage_complete", "delay_recorded", "gate_in", "gate_out", "empty_gate_in", "empty_gate_out", "berthing_confirmed", "document_uploaded"]),
  terminal_user:           new Set(["stage_complete", "gate_in", "gate_out", "empty_gate_in", "document_uploaded"]),
  security_user:           new Set(["new_job", "stage_complete", "gate_in"]),
  operations_user:         new Set(["new_job", "stage_complete", "overdue", "delay_recorded", "gate_out", "empty_gate_in", "berthing_confirmed", "document_uploaded"]),
  staff:                   new Set(["new_job", "stage_complete", "overdue", "delay_recorded", "task_assigned", "section_submitted", "container_verified"]),
  accounts_user:           new Set(["invoice_created", "invoice_paid", "berthing_confirmed"]),
  documentation_user:      new Set(["new_job", "section_submitted", "container_verified", "document_uploaded", "task_assigned"]),
  shipping_user:           new Set(["new_job", "stage_complete", "berthing_confirmed", "document_uploaded"]),
  shipping_terminal_user:  new Set(["new_job", "stage_complete", "berthing_confirmed", "gate_in", "gate_out", "document_uploaded"]),
  customs_user:            new Set(["new_job", "stage_complete", "berthing_confirmed", "document_uploaded"]),
  transire_user:           new Set(["new_job", "stage_complete", "document_uploaded"]),
  pull_out_user:           new Set(["stage_complete", "gate_out", "empty_gate_out", "document_uploaded"]),
};

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
    return { id: c.id, containerNumber: c.containerNumber, customerName: c.customerName, status: c.status, revenue, totalCost, grossProfit, margin, terminalCost, deliveryCost, dutyNotPaid, createdAt: c.createdAt, ageDays, stageOwner: c.stageOwner ?? null, nextActionDueDate, isActionOverdue, emptyReturnDueDate, emptyReturnDate, eta, berthed, paarReleasedAt, paarNumber };
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

  type Alert = { alertKey: string; type: string; severity: string; message: string; containerId?: number; containerNumber?: string; generatedAt: string };
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
    if (allowed) return alerts.filter(a => allowed.has(a.type));
    return [];
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

notificationsRouter.post("/notifications/:alertKey/read", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const branchId = (req as AuthRequest).user!.branchId;
    const { alertKey } = req.params;
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

notificationsRouter.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user!.id;
    const role   = (req as AuthRequest).user!.role;
    const branchId = (req as AuthRequest).user!.branchId;
    const branchScope = getBranchScope(req as AuthRequest);
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

notificationsRouter.post("/notifications/send-email-digest", requireAuth, requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    // Branch isolation (Task #74): scope alert computation. Super-admin must
    // pick a specific branch via X-Branch-Id; non-super-admins are pinned to
    // their own branch.
    const branchScope = getBranchScope(req);
    if (branchScope === null && req.user?.role === "super_admin") {
      return res.status(400).json({ error: "Select a specific branch before sending the digest." });
    }
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Email service is not configured. Please set up the Resend integration in Settings." });
    }
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
        from: "Cost Analysis <alerts@updates.costanalysis.app>",
        to,
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

    return res.json({ success: true, sent: to.length, alertCount: relevant.length });
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
notificationsRouter.get("/workflow-notifications", requireAuth, async (req, res) => {
  try {
    const role = (req as AuthRequest).user.role;
    const branchScope = getBranchScope(req as AuthRequest);

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
        if (c.status !== check.stage) continue;
        const expectedDate = c[check.expectedField] as Date | null;
        const releasedAt = c[check.releasedField] as Date | null;
        if (!expectedDate || releasedAt) continue;
        const exp = new Date(expectedDate); exp.setUTCHours(0, 0, 0, 0);
        if (exp.getTime() < today.getTime()) {
          const overdueDays = Math.floor((today.getTime() - exp.getTime()) / 86_400_000);
          const message = `${check.label} overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}: ${c.containerNumber}`;
          // Check if an identical unread notification already exists today
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const [existing] = await db.select({ id: workflowNotificationsTable.id })
            .from(workflowNotificationsTable)
            .where(
              eq(workflowNotificationsTable.containerId, c.id)
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
          .limit(500)
      : await db.select()
          .from(workflowNotificationsTable)
          .orderBy(desc(workflowNotificationsTable.createdAt))
          .limit(500);

    // Deduplicate: keep only the latest notification per container — one message per job
    const seenContainers = new Set<number>();
    const deduped = allWorkflow.filter(n => {
      if (n.containerId == null) return true;
      if (seenContainers.has(n.containerId)) return false;
      seenContainers.add(n.containerId);
      return true;
    });

    let notifications = deduped;
    if (role && !ADMIN_ROLES.has(role)) {
      const userId = req.user!.id;
      const allowed = ROLE_WORKFLOW_TYPES[role];
      notifications = notifications.filter(n => {
        if (n.targetUserId != null) return n.targetUserId === userId;
        return allowed ? allowed.has(n.type) : false;
      });
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
    const id = parseInt(req.params.id);
    const [existing] = await db.select({ branchId: workflowNotificationsTable.branchId })
      .from(workflowNotificationsTable).where(eq(workflowNotificationsTable.id, id));
    if (!existing || !userCanAccessBranch(req, existing.branchId)) {
      return res.status(404).json({ error: "Notification not found" });
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
    const whereClause = branchScope !== null
      ? and(eq(workflowNotificationsTable.isRead, false), eq(workflowNotificationsTable.branchId, branchScope))
      : eq(workflowNotificationsTable.isRead, false);
    await db.update(workflowNotificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(whereClause);
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
    const allAlerts = await computeAlerts();
    const agingTypes = ["aging_warn", "aging_high", "aging_critical", "inactive", "negative_profit"];
    const relevant = allAlerts.filter((a: any) => agingTypes.includes(a.type));

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Cost Analysis <alerts@updates.costanalysis.app>",
        to,
        subject: `[Scheduled] Container Alert Digest — ${relevant.filter((a: any) => a.severity === "critical").length} critical`,
        html: `<p>Scheduled digest: ${relevant.length} alerts. Log in to Cost Analysis to review.</p>`,
      }),
    });

    if (emailRes.ok) {
      const sent = new Date();
      await db.insert(settingsTable)
        .values({ key: "digestLastSentAt", value: sent.toISOString(), updatedAt: sent })
        .onConflictDoUpdate({ target: settingsTable.key, set: { value: sent.toISOString(), updatedAt: sent } });
      console.log(`[digest-scheduler] Sent to ${to.length} recipients, ${relevant.length} alerts`);
    } else {
      console.error("[digest-scheduler] Resend error:", await emailRes.text().catch(() => "unknown"));
    }
  } catch (err) {
    console.error("[digest-scheduler] Error:", err);
  }
}
