import { Router } from "express";
import { db, notificationsReadTable, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable, settingsTable, auditLogTable } from "@workspace/db";
import { eq, lt, sql, max, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery } from "../lib/calculations.js";

export const notificationsRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;

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

async function computeAlerts(userId?: number) {
  const allContainers = await db.select().from(containersTable);
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
    const isActionOverdue = nextActionDueDate !== null && nextActionDueDate.getTime() < startOfToday.getTime() && !["completed", "closed"].includes(c.status);
    return { id: c.id, containerNumber: c.containerNumber, customerName: c.customerName, status: c.status, revenue, totalCost, grossProfit, margin, terminalCost, deliveryCost, dutyNotPaid, createdAt: c.createdAt, ageDays, stageOwner: c.stageOwner ?? null, nextActionDueDate, isActionOverdue };
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
    if (c.dutyNotPaid > 0 && !["closed", "completed"].includes(c.status)) {
      alerts.push({ alertKey: `unpaid_duty_${c.id}`, type: "unpaid_duty", severity: "warning", message: `Unpaid duty: ${c.containerNumber} — ₦${c.dutyNotPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
    }

    if (!["completed", "closed"].includes(c.status)) {
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
  }

  const overdueTasks = await db.select({ id: containerTasksTable.id, containerId: containerTasksTable.containerId, title: containerTasksTable.title })
    .from(containerTasksTable).where(lt(containerTasksTable.dueDate, new Date()));
  for (const t of overdueTasks) {
    alerts.push({ alertKey: `overdue_task_${t.id}`, type: "overdue_task", severity: "warning", message: `Overdue task: "${t.title}"`, containerId: t.containerId ?? undefined, generatedAt: now });
  }

  const allApprovals = await db.select().from(sectionApprovalsTable);
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

  return alerts;
}

notificationsRouter.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const alerts = await computeAlerts(userId);
    const readRows = await db.select().from(notificationsReadTable).where(eq(notificationsReadTable.userId, userId));
    const readMap: Record<string, { isRead: boolean; readAt: string | null }> = {};
    for (const r of readRows) {
      readMap[r.alertKey] = { isRead: r.isRead, readAt: r.readAt ? r.readAt.toISOString() : null };
    }
    const result = alerts.map(a => ({
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

notificationsRouter.post("/notifications/:alertKey/read", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const { alertKey } = req.params;
    const now = new Date();
    await db.insert(notificationsReadTable)
      .values({ alertKey, userId, isRead: true, readAt: now })
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
    const userId = (req as AuthRequest).user.id;
    const alerts = await computeAlerts(userId);
    if (alerts.length === 0) return res.json({ success: true });

    const now = new Date();
    await db.insert(notificationsReadTable)
      .values(alerts.map(a => ({ alertKey: a.alertKey, userId, isRead: true, readAt: now })))
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

notificationsRouter.post("/notifications/send-email-digest", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
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
    const alerts = await computeAlerts();
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

    return res.json({ success: true, sent: to.length, alertCount: relevant.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/mark-viewed", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const alerts = await computeAlerts(userId);
    if (alerts.length === 0) return res.json({ success: true, marked: 0 });

    const now = new Date();
    await db.insert(notificationsReadTable)
      .values(alerts.map(a => ({ alertKey: a.alertKey, userId, isRead: true, readAt: now })))
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
