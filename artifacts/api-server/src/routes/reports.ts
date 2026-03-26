import { Router } from "express";
import { db, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, invoicesTable, invoicePaymentsTable, clientsTable } from "@workspace/db";
import { eq, gte, lte, and, inArray, type SQL } from "drizzle-orm";
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

reportsRouter.get("/reports/client-statement", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { clientId, from, to } = req.query as Record<string, string>;
    if (!clientId) return res.status(400).json({ error: "clientId is required" });

    const id = parseInt(clientId, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid clientId" });

    const [client] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, contactName: clientsTable.contactName, contactPhone: clientsTable.contactPhone, contactEmail: clientsTable.contactEmail, address: clientsTable.address })
      .from(clientsTable)
      .where(eq(clientsTable.id, id));

    if (!client) return res.status(404).json({ error: "Client not found" });

    const conditions: SQL[] = [eq(invoicesTable.clientId, id)];
    if (from) conditions.push(gte(invoicesTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to + "T23:59:59");
      conditions.push(lte(invoicesTable.createdAt, toDate));
    }

    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .where(and(...conditions))
      .orderBy(invoicesTable.createdAt);

    const invoiceIds = invoices.map(i => i.id);
    const payments = invoiceIds.length > 0
      ? await db.select().from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds)).orderBy(invoicePaymentsTable.paidAt)
      : [];

    const paymentsByInvoice = new Map<number, typeof payments>();
    for (const p of payments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    let totalInvoiced = 0;
    let totalPaid = 0;

    const formattedInvoices = invoices.map(inv => {
      const invPayments = paymentsByInvoice.get(inv.id) ?? [];
      const paid = invPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
      const total = parseFloat(inv.total ?? "0");
      const outstanding = Math.max(0, total - paid);
      totalInvoiced += total;
      totalPaid += paid;

      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        subtotal: parseFloat(inv.subtotal ?? "0"),
        vatAmount: parseFloat(inv.vatAmount ?? "0"),
        total,
        totalPaid: paid,
        outstanding,
        dueDate: inv.dueDate ?? null,
        notes: inv.notes,
        createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
        payments: invPayments.map(p => ({
          id: p.id,
          amount: parseFloat(p.amount ?? "0"),
          paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
        })),
      };
    });

    return res.json({
      client,
      period: { from: from ?? null, to: to ?? null },
      invoices: formattedInvoices,
      totals: { totalInvoiced, totalPaid, closingBalance: Math.max(0, totalInvoiced - totalPaid) },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/vat-summary", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;

    const conditions: SQL[] = [];
    if (from) conditions.push(gte(invoicesTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to + "T23:59:59");
      conditions.push(lte(invoicesTable.createdAt, toDate));
    }

    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        clientName: clientsTable.name,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(invoicesTable.createdAt);

    let totalSubtotal = 0;
    let totalVat = 0;
    let totalInvoiced = 0;

    const rows = invoices.map(inv => {
      const subtotal = parseFloat(inv.subtotal ?? "0");
      const vat = parseFloat(inv.vatAmount ?? "0");
      const total = parseFloat(inv.total ?? "0");
      totalSubtotal += subtotal;
      totalVat += vat;
      totalInvoiced += total;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        clientName: inv.clientName ?? "Unknown",
        subtotal,
        vatAmount: vat,
        total,
        createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
      };
    });

    return res.json({
      period: { from: from ?? null, to: to ?? null },
      invoices: rows,
      totals: { totalSubtotal, totalVat, totalInvoiced },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/invoice-aging", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const now = new Date();

    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        clientName: clientsTable.name,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .orderBy(invoicesTable.dueDate);

    const invoiceIds = invoices.map(i => i.id);
    const payments = invoiceIds.length > 0
      ? await db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
      : [];

    const paidMap = new Map<number, number>();
    for (const p of payments) {
      paidMap.set(p.invoiceId, (paidMap.get(p.invoiceId) ?? 0) + parseFloat(p.amount ?? "0"));
    }

    type AgingRow = { id: number; invoiceNumber: string; clientName: string; total: number; outstanding: number; dueDate: string | null; daysOverdue: number; createdAt: string };
    const buckets: Record<"current" | "days1to30" | "days31to60" | "days61to90" | "days90plus", AgingRow[]> = {
      current: [], days1to30: [], days31to60: [], days61to90: [], days90plus: [],
    };
    const bucketTotals: Record<string, number> = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };

    for (const inv of invoices) {
      const total = parseFloat(inv.total ?? "0");
      const paid = paidMap.get(inv.id) ?? 0;
      const outstanding = Math.max(0, total - paid);
      if (outstanding <= 0) continue;

      const dueDate = inv.dueDate ?? null;
      let daysOverdue = 0;
      let bucket: keyof typeof buckets = "current";

      if (dueDate) {
        const due = new Date(dueDate);
        daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 90) bucket = "days90plus";
        else if (daysOverdue > 60) bucket = "days61to90";
        else if (daysOverdue > 30) bucket = "days31to60";
        else if (daysOverdue > 0) bucket = "days1to30";
      }

      const row: AgingRow = {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        clientName: inv.clientName ?? "Unknown",
        total,
        outstanding,
        dueDate,
        daysOverdue: Math.max(0, daysOverdue),
        createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
      };
      buckets[bucket].push(row);
      bucketTotals[bucket] += outstanding;
    }

    const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

    return res.json({
      generatedAt: now.toISOString(),
      buckets,
      totals: { ...bucketTotals, grandTotal },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
