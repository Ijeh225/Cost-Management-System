import { Router } from "express";
import { db, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable } from "@workspace/db";
import { eq, lt } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery, sumCustoms } from "../lib/calculations.js";

export const intelligenceRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;
const NEGATIVE_PROFIT_THRESHOLD = 0;

intelligenceRouter.get("/intelligence/alerts", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allContainers = await db.select().from(containersTable);
    if (allContainers.length === 0) return res.json({ alerts: [], insights: [] });

    const allShipping   = await db.select().from(shippingChargesTable);
    const allCustoms    = await db.select().from(customsChargesTable);
    const allTerminal   = await db.select().from(terminalChargesTable);
    const allDelivery   = await db.select().from(deliveryChargesTable);
    const allOps        = await db.select().from(operationsChargesTable);

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

    const totals = containerData.reduce((acc, c) => ({ revenue: acc.revenue + c.revenue, cost: acc.cost + c.totalCost, terminal: acc.terminal + c.terminalCost, delivery: acc.delivery + c.deliveryCost }), { revenue: 0, cost: 0, terminal: 0, delivery: 0 });
    const count = containerData.length || 1;
    const avgTerminal = totals.terminal / count;
    const avgDelivery = totals.delivery / count;

    const alerts: Array<{ type: string; severity: string; message: string; containerId?: number; containerNumber?: string }> = [];
    const insights: Array<{ type: string; value: string | number }> = [];

    for (const c of containerData) {
      if (c.grossProfit < NEGATIVE_PROFIT_THRESHOLD) {
        alerts.push({ type: "negative_profit", severity: "critical", message: `Negative profit: ${c.containerNumber} (${c.customerName}) — ₦${c.grossProfit.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber });
      } else if (c.margin > 0 && c.margin < LOW_MARGIN_PCT && c.revenue > 0) {
        alerts.push({ type: "low_margin", severity: "warning", message: `Low margin ${(c.margin * 100).toFixed(1)}%: ${c.containerNumber} (${c.customerName})`, containerId: c.id, containerNumber: c.containerNumber });
      }
      if (avgTerminal > 0 && c.terminalCost > avgTerminal * AVG_THRESHOLD) {
        alerts.push({ type: "high_terminal", severity: "warning", message: `High terminal cost: ${c.containerNumber} — ₦${c.terminalCost.toLocaleString("en-NG", { minimumFractionDigits: 2 })} (avg ₦${avgTerminal.toFixed(0)})`, containerId: c.id, containerNumber: c.containerNumber });
      }
      if (avgDelivery > 0 && c.deliveryCost > avgDelivery * AVG_THRESHOLD) {
        alerts.push({ type: "high_delivery", severity: "warning", message: `High delivery cost: ${c.containerNumber} — ₦${c.deliveryCost.toLocaleString("en-NG", { minimumFractionDigits: 2 })} (avg ₦${avgDelivery.toFixed(0)})`, containerId: c.id, containerNumber: c.containerNumber });
      }
      if (c.dutyNotPaid > 0 && !["closed", "completed"].includes(c.status)) {
        alerts.push({ type: "unpaid_duty", severity: "warning", message: `Unpaid duty: ${c.containerNumber} — ₦${c.dutyNotPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber });
      }
    }

    // Delay alerts: containers in early stages older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const c of containerData) {
      if (!["completed", "closed"].includes(c.status) && new Date(c.createdAt) < thirtyDaysAgo) {
        alerts.push({ type: "delayed", severity: "warning", message: `Delayed container: ${c.containerNumber} has been in '${c.status}' for over 30 days`, containerId: c.id, containerNumber: c.containerNumber });
      }
    }

    // Overdue tasks
    const overdueTasks = await db.select({ containerId: containerTasksTable.containerId, title: containerTasksTable.title })
      .from(containerTasksTable)
      .where(lt(containerTasksTable.dueDate, new Date()));
    for (const t of overdueTasks) {
      if (["pending", "in_progress"].includes(t.title)) {
        alerts.push({ type: "overdue_task", severity: "warning", message: `Overdue task on container #${t.containerId}: ${t.title}` });
      }
    }

    // Pending approvals > 3 days
    const allApprovals = await db.select().from(sectionApprovalsTable);
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const stalePending = allApprovals.filter(a => a.status === "submitted" && a.submittedAt && new Date(a.submittedAt) < threeDaysAgo);
    if (stalePending.length > 0) {
      alerts.push({ type: "stale_approval", severity: "info", message: `${stalePending.length} section approval(s) waiting more than 3 days` });
    }

    // Insights
    const negCount = containerData.filter(c => c.grossProfit < 0).length;
    const lowMarginCount = containerData.filter(c => c.margin > 0 && c.margin < LOW_MARGIN_PCT).length;
    const totalUnpaidDuty = containerData.reduce((s, c) => s + c.dutyNotPaid, 0);
    insights.push({ type: "negative_profit_count", value: negCount });
    insights.push({ type: "low_margin_count", value: lowMarginCount });
    insights.push({ type: "total_unpaid_duty", value: totalUnpaidDuty });
    insights.push({ type: "avg_profit_margin", value: totals.revenue > 0 ? Math.round(((totals.revenue - totals.cost) / totals.revenue) * 100) : 0 });

    return res.json({ alerts: alerts.slice(0, 50), insights });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
