import { Router } from "express";
import { db, containersTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, shippingChargesTable, operationsChargesTable, containerTasksTable, sectionApprovalsTable, branchesTable, intelligenceAlertLogTable } from "@workspace/db";
import { eq, lt, inArray, and, gte } from "drizzle-orm";
import { requireAuth, requireBranchMemberOrAbove, AuthRequest, getBranchScope } from "../lib/auth.js";
import { calcTotalCost, sumTerminal, sumDelivery, sumCustoms } from "../lib/calculations.js";
import { sendViaTwilio, resolveBranchWhatsAppFrom, toE164Nigerian } from "../lib/whatsapp.js";

export const intelligenceRouter = Router();

const AVG_THRESHOLD = 1.5;
const LOW_MARGIN_PCT = 0.15;
const NEGATIVE_PROFIT_THRESHOLD = 0;

intelligenceRouter.get("/intelligence/alerts", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const branchScope = getBranchScope(req);
    const allContainers = branchScope !== null
      ? await db.select().from(containersTable).where(eq(containersTable.branchId, branchScope))
      : await db.select().from(containersTable);
    if (allContainers.length === 0) return res.json({ alerts: [], insights: [] });
    const containerIds = allContainers.map(c => c.id);

    const filterByContainer = (table: any) => containerIds.length > 0
      ? db.select().from(table).where(inArray(table.containerId, containerIds))
      : Promise.resolve([] as any[]);
    const allShipping   = await filterByContainer(shippingChargesTable);
    const allCustoms    = await filterByContainer(customsChargesTable);
    const allTerminal   = await filterByContainer(terminalChargesTable);
    const allDelivery   = await filterByContainer(deliveryChargesTable);
    const allOps        = await filterByContainer(operationsChargesTable);

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
      const nextActionDueDate = c.nextActionDueDate ? new Date(c.nextActionDueDate) : null;
      const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
      const isActionOverdue = nextActionDueDate !== null && nextActionDueDate.getTime() < startOfToday.getTime() && c.status !== "closed";
      return { id: c.id, containerNumber: c.containerNumber, customerName: c.customerName, status: c.status, revenue, totalCost, grossProfit, margin, terminalCost, deliveryCost, dutyNotPaid, createdAt: c.createdAt, stageOwner: c.stageOwner ?? null, nextActionDueDate, isActionOverdue };
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
      if (c.dutyNotPaid > 0 && c.status !== "closed") {
        alerts.push({ type: "unpaid_duty", severity: "warning", message: `Unpaid duty: ${c.containerNumber} — ₦${c.dutyNotPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`, containerId: c.id, containerNumber: c.containerNumber });
      }
    }

    // Delay alerts: containers in early stages older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    for (const c of containerData) {
      if (c.status !== "closed" && new Date(c.createdAt) < thirtyDaysAgo) {
        alerts.push({ type: "delayed", severity: "warning", message: `Delayed container: ${c.containerNumber} has been in '${c.status}' for over 30 days`, containerId: c.id, containerNumber: c.containerNumber });
      }
    }

    // Action overdue alerts
    for (const c of containerData) {
      if (c.isActionOverdue && c.nextActionDueDate) {
        const overdueDays = Math.floor((Date.now() - c.nextActionDueDate.getTime()) / (1000 * 60 * 60 * 24));
        alerts.push({ type: "action_overdue", severity: "warning", message: `Next action overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}: ${c.containerNumber} (${c.customerName})${c.stageOwner ? ` — owner: ${c.stageOwner}` : ""}`, containerId: c.id, containerNumber: c.containerNumber });
      }
    }

    // Overdue tasks (scoped to branch via container ids — Task #74)
    const overdueTasks = containerIds.length > 0
      ? await db.select({ containerId: containerTasksTable.containerId, title: containerTasksTable.title })
          .from(containerTasksTable)
          .where(lt(containerTasksTable.dueDate, new Date()))
          .then(rows => rows.filter(r => r.containerId != null && containerIds.includes(r.containerId)))
      : [];
    for (const t of overdueTasks) {
      if (["pending", "in_progress"].includes(t.title)) {
        alerts.push({ type: "overdue_task", severity: "warning", message: `Overdue task on container #${t.containerId}: ${t.title}` });
      }
    }

    // Pending approvals > 3 days (scoped to branch — Task #74)
    const allApprovals = containerIds.length > 0
      ? await db.select().from(sectionApprovalsTable).where(inArray(sectionApprovalsTable.containerId, containerIds))
      : [];
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

intelligenceRouter.post("/intelligence/send-digest", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const branchScope = getBranchScope(req);
    const branchId = branchScope ?? req.user?.branchId ?? null;
    if (!branchId) return res.status(400).json({ error: "No branch scope" });

    const [branch] = await db.select().from(branchesTable).where(eq(branchesTable.id, branchId));
    if (!branch) return res.status(404).json({ error: "Branch not found" });

    const adminNumber = branch.alertAdminNumber?.trim();
    if (!adminNumber) return res.status(400).json({ error: "No alert admin number configured. Set one in Branch Settings → Alerts." });

    const sendOnStuck = branch.alertOnStuck === "true";
    const sendOnOverdue = branch.alertOnOverdue === "true";
    const sendOnNegProfit = branch.alertOnNegativeProfit === "true";

    if (!sendOnStuck && !sendOnOverdue && !sendOnNegProfit) {
      return res.status(400).json({ error: "No alert types enabled. Enable at least one in Branch Settings → Alerts." });
    }

    const allContainers = await db.select().from(containersTable).where(and(eq(containersTable.branchId, branchId)));
    const activeContainers = allContainers.filter(c => c.status !== "closed");

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentlySent = await db.select().from(intelligenceAlertLogTable)
      .where(and(eq(intelligenceAlertLogTable.branchId, branchId), gte(intelligenceAlertLogTable.sentAt, twentyFourHoursAgo)));
    const sentKey = (containerId: number, alertType: string) => `${containerId}:${alertType}`;
    const alreadySent = new Set(recentlySent.map(r => sentKey(r.containerId, r.alertType)));

    const containerIds = activeContainers.map(c => c.id);
    const allShipping = containerIds.length > 0 ? await db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, containerIds)) : [];
    const allCustoms  = containerIds.length > 0 ? await db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, containerIds)) : [];
    const allTerminal = containerIds.length > 0 ? await db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, containerIds)) : [];
    const allDelivery = containerIds.length > 0 ? await db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, containerIds)) : [];
    const allOps      = containerIds.length > 0 ? await db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, containerIds)) : [];
    const idx = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
    const sMap = idx(allShipping); const cMap = idx(allCustoms); const tMap = idx(allTerminal); const dMap = idx(allDelivery); const oMap = idx(allOps);

    const messages: { containerId: number; alertType: string; text: string }[] = [];

    for (const c of activeContainers) {
      if (sendOnStuck && new Date(c.createdAt) < thirtyDaysAgo) {
        const k = sentKey(c.id, "stuck");
        if (!alreadySent.has(k)) {
          const days = Math.floor((Date.now() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24));
          messages.push({ containerId: c.id, alertType: "stuck", text: `🚨 STUCK: ${c.containerNumber} (${c.customerName ?? "—"}) has been in stage "${c.status}" for ${days} days.` });
        }
      }
      if (sendOnOverdue && c.nextActionDueDate) {
        const due = new Date(c.nextActionDueDate);
        if (due < startOfToday) {
          const k = sentKey(c.id, "overdue");
          if (!alreadySent.has(k)) {
            const days = Math.floor((Date.now() - due.getTime()) / (1000 * 60 * 60 * 24));
            messages.push({ containerId: c.id, alertType: "overdue", text: `⚠️ OVERDUE: ${c.containerNumber} next action is overdue by ${days} day${days === 1 ? "" : "s"}. Owner: ${c.stageOwner ?? "unassigned"}.` });
          }
        }
      }
      if (sendOnNegProfit) {
        const s = sMap[c.id] ?? {}; const cu = cMap[c.id] ?? {}; const t = tMap[c.id] ?? {}; const d = dMap[c.id] ?? {}; const o = oMap[c.id] ?? {};
        const totalCost = calcTotalCost(s, cu, t, d, o);
        const revenue = parseFloat(c.clearingCharges as string ?? "0");
        if (revenue - totalCost < 0) {
          const k = sentKey(c.id, "neg_profit");
          if (!alreadySent.has(k)) {
            messages.push({ containerId: c.id, alertType: "neg_profit", text: `📉 LOSS: ${c.containerNumber} (${c.customerName ?? "—"}) is running at a loss. Revenue ₦${revenue.toLocaleString("en-NG", { maximumFractionDigits: 0 })} vs Cost ₦${totalCost.toLocaleString("en-NG", { maximumFractionDigits: 0 })}.` });
          }
        }
      }
    }

    if (messages.length === 0) return res.json({ sent: 0, skipped: 0, errors: [] });

    const { from: fromOverride, error: fromErr } = await resolveBranchWhatsAppFrom(branchId);
    if (fromErr) return res.status(400).json({ error: fromErr });

    const toNumber = toE164Nigerian(adminNumber);
    const fullBody = `*${branch.name} — Daily Alert Digest*\n${new Date().toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}\n\n` + messages.map(m => m.text).join("\n\n");

    const result = await sendViaTwilio(toNumber, fullBody, fromOverride);
    if (!result.success) return res.status(500).json({ error: result.error ?? "Failed to send WhatsApp message" });

    await db.insert(intelligenceAlertLogTable).values(
      messages.map(m => ({ containerId: m.containerId, alertType: m.alertType, branchId: branchId! }))
    );

    return res.json({ sent: messages.length, skipped: recentlySent.length, errors: [] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
