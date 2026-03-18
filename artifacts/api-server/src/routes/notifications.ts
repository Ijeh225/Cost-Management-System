import { Router } from "express";
import { db, notificationsReadTable, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable } from "@workspace/db";
import { eq, lt, and, inArray } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery } from "../lib/calculations.js";

export const notificationsRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;

async function computeAlerts() {
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
    return { id: c.id, containerNumber: c.containerNumber, customerName: c.customerName, status: c.status, revenue, totalCost, grossProfit, margin, terminalCost, deliveryCost, dutyNotPaid, createdAt: c.createdAt };
  });

  const totals = containerData.reduce((acc, c) => ({ terminal: acc.terminal + c.terminalCost, delivery: acc.delivery + c.deliveryCost }), { terminal: 0, delivery: 0 });
  const count = containerData.length || 1;
  const avgTerminal = totals.terminal / count;
  const avgDelivery = totals.delivery / count;

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
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (!["completed", "closed"].includes(c.status) && new Date(c.createdAt) < thirtyDaysAgo) {
      alerts.push({ alertKey: `delayed_${c.id}`, type: "delayed", severity: "warning", message: `Delayed container: ${c.containerNumber} has been in '${c.status}' for over 30 days`, containerId: c.id, containerNumber: c.containerNumber, generatedAt: now });
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

  return alerts;
}

notificationsRouter.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const alerts = await computeAlerts();
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
    const existing = await db.select().from(notificationsReadTable)
      .where(and(eq(notificationsReadTable.alertKey, alertKey), eq(notificationsReadTable.userId, userId)));
    if (existing.length > 0) {
      await db.update(notificationsReadTable).set({ isRead: true, readAt: new Date() })
        .where(and(eq(notificationsReadTable.alertKey, alertKey), eq(notificationsReadTable.userId, userId)));
    } else {
      await db.insert(notificationsReadTable).values({ alertKey, userId, isRead: true, readAt: new Date() });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const alerts = await computeAlerts();
    if (alerts.length === 0) return res.json({ success: true });

    const alertKeys = alerts.map(a => a.alertKey);
    const existingRows = await db.select().from(notificationsReadTable)
      .where(and(eq(notificationsReadTable.userId, userId), inArray(notificationsReadTable.alertKey, alertKeys)));
    const existingKeys = new Set(existingRows.map(r => r.alertKey));

    const now = new Date();
    for (const alert of alerts) {
      if (existingKeys.has(alert.alertKey)) {
        await db.update(notificationsReadTable).set({ isRead: true, readAt: now })
          .where(and(eq(notificationsReadTable.alertKey, alert.alertKey), eq(notificationsReadTable.userId, userId)));
      } else {
        await db.insert(notificationsReadTable).values({ alertKey: alert.alertKey, userId, isRead: true, readAt: now });
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

notificationsRouter.post("/notifications/mark-viewed", requireAuth, async (req, res) => {
  try {
    const userId = (req as AuthRequest).user.id;
    const alerts = await computeAlerts();
    if (alerts.length === 0) return res.json({ success: true, marked: 0 });

    const alertKeys = alerts.map(a => a.alertKey);
    const existingRows = await db.select().from(notificationsReadTable)
      .where(and(eq(notificationsReadTable.userId, userId), inArray(notificationsReadTable.alertKey, alertKeys)));
    const existingKeys = new Set(existingRows.map(r => r.alertKey));

    const now = new Date();
    let marked = 0;
    for (const alertKey of alertKeys) {
      if (existingKeys.has(alertKey)) {
        const row = existingRows.find(r => r.alertKey === alertKey)!;
        if (!row.isRead) {
          await db.update(notificationsReadTable).set({ isRead: true, readAt: now })
            .where(and(eq(notificationsReadTable.alertKey, alertKey), eq(notificationsReadTable.userId, userId)));
          marked++;
        }
      } else {
        await db.insert(notificationsReadTable).values({ alertKey, userId, isRead: true, readAt: now });
        marked++;
      }
    }
    return res.json({ success: true, marked });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
