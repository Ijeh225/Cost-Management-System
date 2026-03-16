import { Router } from "express";
import { db, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable } from "@workspace/db";
import { eq, gte, lte, and, type SQL } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";

export const reportsRouter = Router();

reportsRouter.get("/reports/containers", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status, from, to } = req.query as Record<string, string>;

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(containersTable.status, status));
    if (from)   conditions.push(gte(containersTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(containersTable.createdAt, toDate));
    }

    const containers = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      blNumber: containersTable.blNumber,
      customerName: containersTable.customerName,
      vessel: containersTable.vessel,
      size: containersTable.size,
      status: containersTable.status,
      clearingCharges: containersTable.clearingCharges,
      assignedStaffId: containersTable.assignedStaffId,
      isLocked: containersTable.isLocked,
      createdAt: containersTable.createdAt,
    }).from(containersTable).where(conditions.length > 0 ? and(...conditions) : undefined);

    if (containers.length === 0) return res.json({ containers: [] });

    const ids = containers.map(c => c.id);

    const [allS, allC, allT, allD, allO, allUsers] = await Promise.all([
      db.select().from(shippingChargesTable),
      db.select().from(customsChargesTable),
      db.select().from(terminalChargesTable),
      db.select().from(deliveryChargesTable),
      db.select().from(operationsChargesTable),
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
    ]);

    const idx = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
    const sMap = idx(allS); const cMap = idx(allC); const tMap = idx(allT); const dMap = idx(allD); const oMap = idx(allO);
    const userMap: Record<number, string> = {};
    allUsers.forEach(u => { userMap[u.id] = u.name; });

    const rows = containers.map(c => {
      const cost = calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
      const revenue = parseFloat(c.clearingCharges as string ?? "0");
      return {
        id: c.id,
        containerNumber: c.containerNumber,
        blNumber: c.blNumber,
        customerName: c.customerName,
        vessel: c.vessel ?? "",
        size: c.size ?? "",
        status: c.status,
        assignedTo: c.assignedStaffId ? (userMap[c.assignedStaffId] ?? "") : "",
        isLocked: c.isLocked,
        clearingCharges: revenue,
        totalCost: cost,
        grossProfit: revenue - cost,
        shippingCost: calcTotalCost(sMap[c.id] ?? {}, {}, {}, {}, {}),
        customsCost:  calcTotalCost({}, cMap[c.id] ?? {}, {}, {}, {}),
        terminalCost: calcTotalCost({}, {}, tMap[c.id] ?? {}, {}, {}),
        deliveryCost: calcTotalCost({}, {}, {}, dMap[c.id] ?? {}, {}),
        operationsCost: calcTotalCost({}, {}, {}, {}, oMap[c.id] ?? {}),
        dutyNotPaid: parseFloat(cMap[c.id]?.dutyNotPaid ?? "0"),
        createdAt: c.createdAt.toISOString().slice(0, 10),
      };
    });

    return res.json({ containers: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/export", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { status, from, to } = req.query as Record<string, string>;

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(containersTable.status, status));
    if (from)   conditions.push(gte(containersTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(containersTable.createdAt, toDate));
    }

    const containers = await db.select().from(containersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);

    const [allS, allC, allT, allD, allO, allUsers] = await Promise.all([
      db.select().from(shippingChargesTable),
      db.select().from(customsChargesTable),
      db.select().from(terminalChargesTable),
      db.select().from(deliveryChargesTable),
      db.select().from(operationsChargesTable),
      db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable),
    ]);

    const idx = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
    const sMap = idx(allS); const cMap = idx(allC); const tMap = idx(allT); const dMap = idx(allD); const oMap = idx(allO);
    const userMap: Record<number, string> = {};
    allUsers.forEach(u => { userMap[u.id] = u.name; });

    const headers = [
      "Container No.", "BL Number", "Customer", "Vessel", "Size", "Status",
      "Assigned To", "Clearing Charges (₦)", "Total Cost (₦)", "Gross Profit (₦)",
      "Shipping (₦)", "Customs (₦)", "Terminal (₦)", "Delivery (₦)", "Operations (₦)",
      "Unpaid Duty (₦)", "Date Created",
    ];

    const csvRows = [headers.join(",")];

    for (const c of containers) {
      const cost = calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
      const revenue = parseFloat(c.clearingCharges ?? "0");
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const fmt = (n: number) => n.toFixed(2);
      csvRows.push([
        esc(c.containerNumber), esc(c.blNumber), esc(c.customerName), esc(c.vessel ?? ""),
        esc(c.size ?? ""), esc(c.status),
        esc(c.assignedStaffId ? (userMap[c.assignedStaffId] ?? "") : ""),
        fmt(revenue), fmt(cost), fmt(revenue - cost),
        fmt(calcTotalCost(sMap[c.id] ?? {}, {}, {}, {}, {})),
        fmt(calcTotalCost({}, cMap[c.id] ?? {}, {}, {}, {})),
        fmt(calcTotalCost({}, {}, tMap[c.id] ?? {}, {}, {})),
        fmt(calcTotalCost({}, {}, {}, dMap[c.id] ?? {}, {})),
        fmt(calcTotalCost({}, {}, {}, {}, oMap[c.id] ?? {})),
        fmt(parseFloat(cMap[c.id]?.dutyNotPaid ?? "0")),
        esc(c.createdAt.toISOString().slice(0, 10)),
      ].join(","));
    }

    const filename = `containers_report_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(csvRows.join("\n"));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
