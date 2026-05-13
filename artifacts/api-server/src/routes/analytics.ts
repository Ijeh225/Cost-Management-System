import { Router } from "express";
import { db, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, containerExtraChargesTable, sectionApprovalsTable } from "@workspace/db";
import { eq, desc, gte, lte, and, isNotNull, type SQL } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";

export const analyticsRouter = Router();

function sumFields(obj: Record<string, any>, keys: string[]): number {
  return keys.reduce((s, k) => s + parseFloat(obj?.[k] ?? "0"), 0);
}

analyticsRouter.get("/analytics", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const allContainers = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName,
      vessel: containersTable.vessel,
      status: containersTable.status,
      clearingCharges: containersTable.clearingCharges,
      assignedStaffId: containersTable.assignedStaffId,
      createdAt: containersTable.createdAt,
    }).from(containersTable);

    if (allContainers.length === 0) {
      return res.json({
        profitByCustomer: [], costBySection: [], profitByVessel: [],
        monthlyTrend: [], negativeProfitContainers: [], staffProductivity: [],
        summary: { totalRevenue: 0, totalCost: 0, grossProfit: 0, profitMargin: 0, containerCount: 0 },
      });
    }

    const [allShipping, allCustoms, allTerminal, allDelivery, allOps, allExtrasRaw] = await Promise.all([
      db.select().from(shippingChargesTable),
      db.select().from(customsChargesTable),
      db.select().from(terminalChargesTable),
      db.select().from(deliveryChargesTable),
      db.select().from(operationsChargesTable),
      db.select({ containerId: containerExtraChargesTable.containerId, amount: containerExtraChargesTable.amount })
        .from(containerExtraChargesTable),
    ]);

    const idx = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
    const sMap = idx(allShipping);
    const cMap = idx(allCustoms);
    const tMap = idx(allTerminal);
    const dMap = idx(allDelivery);
    const oMap = idx(allOps);

    // Build a per-container extras total map
    const extrasMap: Record<number, number> = {};
    for (const r of allExtrasRaw) {
      extrasMap[r.containerId] = (extrasMap[r.containerId] ?? 0) + parseFloat(r.amount as string ?? "0");
    }

    const SHIPPING_KEYS   = ["shippingCompany","shippingPaymentVat","consignee","finalInvoiceShippingCompany","telexCharge","shippingRunnings","shippingDetentionToBePaidByCustomer"];
    // `dutyPaid`/`dutyNotPaid` are payment-status fields that together equal `duty`,
    // not additional cost lines — including them would double-count the paid portion.
    const CUSTOMS_KEYS    = ["duty","valuation","ciu","upCountryCustom","dciu","mdReleasingPackage","ocSettlement","ocReleaseLocal","dcEnforcementForTransire","complianceTeam","cacSettlement","crffn","soncap","alerts","examinationBonus"];
    const TERMINAL_KEYS   = ["terminalCharges","terminalAdditions1","ikorouduTerminalAdditions2","terminalDemurrageToBePaidByCustomer","terminalPaymentVat","wharfageFeeForNpa","sifaxGmtSigning","tsDcAdmin","tincanBond","bond","manifest"];
    const DELIVERY_KEYS   = ["passingOfTruck","passingOfTruckForEmptyReturn","parkingForPullout","pullout","delivery","emptyReturn","unchainingTruck","emptyCallUp","pulloutExpenses","transferToIkorodu","transportAllowance"];
    const OPERATIONS_KEYS = ["fouBooking","fou","scanningToPhysical","security","additionalDeliveryExpenses","miscellaneous","abandoned","agenciesBlocks","callUp","transireRunnings","officePtml","freshPayment"];

    let totalRevenue = 0;
    let totalCost = 0;
    let sectionTotals = { shipping: 0, customs: 0, terminal: 0, delivery: 0, operations: 0, extras: 0 };

    const customerData: Record<string, { revenue: number; cost: number; count: number }> = {};
    const vesselData:   Record<string, { revenue: number; cost: number; count: number }> = {};
    const monthlyData:  Record<string, { count: number; revenue: number; cost: number }> = {};
    const containerResults: Array<{ id: number; containerNumber: string; customerName: string; vessel: string | null; clearingCharges: number; totalCost: number; grossProfit: number; status: string }> = [];

    for (const c of allContainers) {
      const s = sMap[c.id] ?? {};
      const cu = cMap[c.id] ?? {};
      const t = tMap[c.id] ?? {};
      const d = dMap[c.id] ?? {};
      const o = oMap[c.id] ?? {};
      const extras = extrasMap[c.id] ?? 0;
      const cost = calcTotalCost(s, cu, t, d, o) + extras;
      const revenue = parseFloat(c.clearingCharges as string ?? "0");
      const grossProfit = revenue - cost;

      totalRevenue += revenue;
      totalCost += cost;
      sectionTotals.shipping   += sumFields(s, SHIPPING_KEYS);
      sectionTotals.customs    += sumFields(cu, CUSTOMS_KEYS);
      sectionTotals.terminal   += sumFields(t, TERMINAL_KEYS);
      sectionTotals.delivery   += sumFields(d, DELIVERY_KEYS);
      sectionTotals.operations += sumFields(o, OPERATIONS_KEYS);
      sectionTotals.extras     += extras;

      // Customer
      const cust = c.customerName || "Unknown";
      if (!customerData[cust]) customerData[cust] = { revenue: 0, cost: 0, count: 0 };
      customerData[cust].revenue += revenue;
      customerData[cust].cost    += cost;
      customerData[cust].count++;

      // Vessel
      const vessel = c.vessel || "Unknown";
      if (!vesselData[vessel]) vesselData[vessel] = { revenue: 0, cost: 0, count: 0 };
      vesselData[vessel].revenue += revenue;
      vesselData[vessel].cost    += cost;
      vesselData[vessel].count++;

      // Monthly trend (by createdAt)
      const month = c.createdAt.toISOString().slice(0, 7); // "YYYY-MM"
      if (!monthlyData[month]) monthlyData[month] = { count: 0, revenue: 0, cost: 0 };
      monthlyData[month].count++;
      monthlyData[month].revenue += revenue;
      monthlyData[month].cost    += cost;

      containerResults.push({
        id: c.id,
        containerNumber: c.containerNumber,
        customerName: c.customerName,
        vessel: c.vessel,
        clearingCharges: revenue,
        totalCost: cost,
        grossProfit,
        status: c.status,
      });
    }

    // Staff productivity
    const allUsers = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
    }).from(usersTable).where(eq(usersTable.isActive, true));

    const allApprovals = await db.select().from(sectionApprovalsTable);
    const staffProductivity = allUsers
      .filter(u => u.role === "staff")
      .map(u => {
        const assigned = allContainers.filter(c => c.assignedStaffId === u.id).length;
        const submitted = allApprovals.filter(a => a.submittedById === u.id).length;
        const approved  = allApprovals.filter(a => a.reviewedById === u.id && a.status === "approved").length;
        const rejected  = allApprovals.filter(a => a.status === "rejected" && a.submittedById === u.id).length;
        return { userId: u.id, name: u.name, containersAssigned: assigned, sectionsSubmitted: submitted, sectionsApproved: approved, sectionsRejected: rejected };
      })
      .sort((a, b) => b.containersAssigned - a.containersAssigned);

    const profitByCustomer = Object.entries(customerData)
      .map(([customer, d]) => ({ customer, revenue: d.revenue, cost: d.cost, grossProfit: d.revenue - d.cost, count: d.count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const profitByVessel = Object.entries(vesselData)
      .filter(([v]) => v !== "Unknown")
      .map(([vessel, d]) => ({ vessel, revenue: d.revenue, cost: d.cost, grossProfit: d.revenue - d.cost, count: d.count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const costBySection = [
      { section: "Shipping",   cost: sectionTotals.shipping,   pct: totalCost ? Math.round(sectionTotals.shipping / totalCost * 100) : 0 },
      { section: "Customs",    cost: sectionTotals.customs,    pct: totalCost ? Math.round(sectionTotals.customs / totalCost * 100) : 0 },
      { section: "Terminal",   cost: sectionTotals.terminal,   pct: totalCost ? Math.round(sectionTotals.terminal / totalCost * 100) : 0 },
      { section: "Delivery",   cost: sectionTotals.delivery,   pct: totalCost ? Math.round(sectionTotals.delivery / totalCost * 100) : 0 },
      { section: "Operations", cost: sectionTotals.operations, pct: totalCost ? Math.round(sectionTotals.operations / totalCost * 100) : 0 },
      ...(sectionTotals.extras > 0
        ? [{ section: "Extra Charges", cost: sectionTotals.extras, pct: totalCost ? Math.round(sectionTotals.extras / totalCost * 100) : 0 }]
        : []),
    ];

    const monthlyTrend = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        label: new Date(month + "-01").toLocaleString("en-US", { month: "short", year: "2-digit" }),
        count: d.count,
        revenue: d.revenue,
        cost: d.cost,
        grossProfit: d.revenue - d.cost,
      }));

    const negativeProfitContainers = containerResults
      .filter(c => c.grossProfit < 0)
      .sort((a, b) => a.grossProfit - b.grossProfit)
      .slice(0, 10);

    const grossProfit = totalRevenue - totalCost;
    const summary = {
      totalRevenue,
      totalCost,
      grossProfit,
      profitMargin: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 100) : 0,
      containerCount: allContainers.length,
    };

    return res.json({
      summary,
      profitByCustomer,
      costBySection,
      profitByVessel,
      monthlyTrend,
      negativeProfitContainers,
      staffProductivity,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

function parseIsoDate(val: string | undefined): Date | null | "invalid" {
  if (!val) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return "invalid";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "invalid";
  return d;
}

analyticsRouter.get("/analytics/deliveries", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;

    const fromDate = parseIsoDate(fromStr);
    const toDate = parseIsoDate(toStr);
    if (fromDate === "invalid") {
      res.status(400).json({ error: "Invalid 'from' date — expected YYYY-MM-DD format" });
      return;
    }
    if (toDate === "invalid") {
      res.status(400).json({ error: "Invalid 'to' date — expected YYYY-MM-DD format" });
      return;
    }

    const conditions: SQL[] = [isNotNull(containersTable.deliveredAt)];
    if (fromDate) conditions.push(gte(containersTable.deliveredAt, fromDate));
    if (toDate) {
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(containersTable.deliveredAt, toDate));
    }
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);

    const rows = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      blNumber: containersTable.blNumber,
      customerName: containersTable.customerName,
      status: containersTable.status,
      deliveredAt: containersTable.deliveredAt,
      deliveredAtEstimated: containersTable.deliveredAtEstimated,
      clearingCharges: containersTable.clearingCharges,
      createdAt: containersTable.createdAt,
      truckNumber: containersTable.truckNumber,
      driverName: containersTable.driverName,
      dispatchOfficer: containersTable.dispatchOfficer,
      deliveryStatus: containersTable.deliveryStatus,
      deliveryLocation: containersTable.deliveryLocation,
      offloadingConfirmed: containersTable.offloadingConfirmed,
      emptyReturnDate: containersTable.emptyReturnDate,
      gateInDate: containersTable.gateInDate,
    }).from(containersTable).where(where);

    let totalRevenue = 0;
    let totalDays = 0;
    let countWithDays = 0;

    const toCalendarDay = (d: Date): number => {
      return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    };
    const DAY_MS = 1000 * 60 * 60 * 24;

    const items = rows.map(c => {
      const revenue = parseFloat(c.clearingCharges ?? "0");
      totalRevenue += revenue;
      const delivDate = c.deliveredAt instanceof Date ? c.deliveredAt : (c.deliveredAt ? new Date(String(c.deliveredAt)) : null);
      const createDate = c.createdAt instanceof Date ? c.createdAt : new Date(String(c.createdAt));
      let daysToComplete: number | null = null;
      if (delivDate) {
        const rawDays = Math.round((toCalendarDay(delivDate) - toCalendarDay(createDate)) / DAY_MS);
        daysToComplete = Math.max(0, rawDays);
        totalDays += daysToComplete;
        countWithDays++;
      }
      const gateIn = c.gateInDate instanceof Date ? c.gateInDate : (c.gateInDate ? new Date(c.gateInDate) : null);
      const emptyRet = c.emptyReturnDate instanceof Date ? c.emptyReturnDate : (c.emptyReturnDate ? new Date(c.emptyReturnDate) : null);
      const totalCustodyDays = gateIn
        ? Math.max(0, Math.floor(((emptyRet ?? new Date()).getTime() - gateIn.getTime()) / 86_400_000))
        : null;
      return {
        id: c.id,
        containerNumber: c.containerNumber,
        blNumber: c.blNumber,
        clientName: c.customerName,
        status: c.status,
        deliveredAt: delivDate ? delivDate.toISOString() : "",
        deliveredAtEstimated: c.deliveredAtEstimated ?? false,
        clearingCharges: revenue,
        daysToComplete,
        createdAt: createDate.toISOString(),
        truckNumber: c.truckNumber ?? null,
        driverName: c.driverName ?? null,
        dispatchOfficer: c.dispatchOfficer ?? null,
        deliveryStatus: c.deliveryStatus ?? "pending",
        deliveryLocation: c.deliveryLocation ?? null,
        offloadingConfirmed: c.offloadingConfirmed ?? false,
        emptyReturnDate: emptyRet ? emptyRet.toISOString() : null,
        gateInDate: gateIn ? gateIn.toISOString() : null,
        totalCustodyDays,
        custodyClosed: !!(c.emptyReturnDate),
      };
    });

    items.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());

    return res.json({
      count: items.length,
      totalRevenue,
      avgDays: countWithDays > 0 ? Math.round(totalDays / countWithDays) : null,
      items,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
