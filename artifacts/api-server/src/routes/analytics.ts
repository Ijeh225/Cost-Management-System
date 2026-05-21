import { Router } from "express";
import { db, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, containerExtraChargesTable, sectionApprovalsTable, branchesTable, invoicesTable, invoicePaymentsTable } from "@workspace/db";
import { eq, desc, gte, lte, and, inArray, isNotNull, ne, type SQL } from "drizzle-orm";
import { requireAuth, requireBranchAdminOrAbove, requireBranchMemberOrAbove, AuthRequest, getBranchScope } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";

async function resolveBranchScopeInfo(req: AuthRequest): Promise<{ id: number | null; name: string }> {
  const id = getBranchScope(req);
  if (id === null) return { id: null, name: "All Branches — Consolidated" };
  const [b] = await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, id)).limit(1);
  return { id, name: b?.name ?? `Branch ${id}` };
}

export const analyticsRouter = Router();

function sumFields(obj: Record<string, any>, keys: string[]): number {
  return keys.reduce((s, k) => s + parseFloat(obj?.[k] ?? "0"), 0);
}

analyticsRouter.get("/analytics", requireAuth, requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const _scope = getBranchScope(req);
    const allContainers = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName,
      vessel: containersTable.vessel,
      status: containersTable.status,
      clearingCharges: containersTable.clearingCharges,
      assignedStaffId: containersTable.assignedStaffId,
      createdAt: containersTable.createdAt,
    }).from(containersTable).where(_scope === null ? undefined : eq(containersTable.branchId, _scope));

    if (allContainers.length === 0) {
      return res.json({
        profitByCustomer: [], costBySection: [], profitByVessel: [],
        monthlyTrend: [], negativeProfitContainers: [], staffProductivity: [],
        summary: { totalRevenue: 0, totalCost: 0, grossProfit: 0, profitMargin: 0, containerCount: 0 },
      });
    }

    const containerIds = allContainers.map(c => c.id);
    const inIds = (col: any) => inArray(col, containerIds);
    const [allShipping, allCustoms, allTerminal, allDelivery, allOps, allExtrasRaw] = await Promise.all([
      db.select().from(shippingChargesTable).where(inIds(shippingChargesTable.containerId)),
      db.select().from(customsChargesTable).where(inIds(customsChargesTable.containerId)),
      db.select().from(terminalChargesTable).where(inIds(terminalChargesTable.containerId)),
      db.select().from(deliveryChargesTable).where(inIds(deliveryChargesTable.containerId)),
      db.select().from(operationsChargesTable).where(inIds(operationsChargesTable.containerId)),
      db.select({ containerId: containerExtraChargesTable.containerId, amount: containerExtraChargesTable.amount })
        .from(containerExtraChargesTable).where(inIds(containerExtraChargesTable.containerId)),
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

    // Staff productivity — scope users by branch when scope is set.
    const userWhere = _scope === null
      ? eq(usersTable.isActive, true)
      : and(eq(usersTable.isActive, true), eq(usersTable.branchId, _scope));
    const allUsers = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      role: usersTable.role,
    }).from(usersTable).where(userWhere);

    const allApprovals = containerIds.length > 0
      ? await db.select().from(sectionApprovalsTable).where(inArray(sectionApprovalsTable.containerId, containerIds))
      : [];
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

analyticsRouter.get("/analytics/deliveries", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
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

    const branchScope = await resolveBranchScopeInfo(req);
    const conditions: SQL[] = [isNotNull(containersTable.deliveredAt)];
    if (branchScope.id !== null) conditions.push(eq(containersTable.branchId, branchScope.id));
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
      branchId: containersTable.branchId,
      branchName: branchesTable.name,
    }).from(containersTable).leftJoin(branchesTable, eq(containersTable.branchId, branchesTable.id)).where(where);

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
        branchId: c.branchId,
        branchName: c.branchName ?? null,
      };
    });

    items.sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime());

    return res.json({
      count: items.length,
      totalRevenue,
      avgDays: countWithDays > 0 ? Math.round(totalDays / countWithDays) : null,
      items,
      branchScope: { id: branchScope.id, name: branchScope.name },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

analyticsRouter.get("/analytics/berthing", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const branchScope = await resolveBranchScopeInfo(req);
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const conditions: SQL[] = [];
    if (branchScope.id !== null) conditions.push(eq(containersTable.branchId, branchScope.id));

    const rows = await db.select({
      id:                  containersTable.id,
      containerNumber:     containersTable.containerNumber,
      customerName:        containersTable.customerName,
      vessel:              containersTable.vessel,
      eta:                 containersTable.eta,
      berthed:             containersTable.berthed,
      berthingConfirmedAt: containersTable.berthingConfirmedAt,
      status:              containersTable.status,
      branchId:            containersTable.branchId,
    }).from(containersTable)
      .where(
        conditions.length > 0
          ? and(isNotNull(containersTable.eta), ...conditions)
          : isNotNull(containersTable.eta)
      );

    const awaiting = rows
      .filter(r => !r.berthed && r.eta && new Date(r.eta as Date) <= in7Days)
      .sort((a, b) => new Date(a.eta as Date).getTime() - new Date(b.eta as Date).getTime());

    const berthed = rows
      .filter(r => r.berthed && r.berthingConfirmedAt && new Date(r.berthingConfirmedAt as Date) >= startOfToday)
      .sort((a, b) => new Date(b.berthingConfirmedAt as Date).getTime() - new Date(a.berthingConfirmedAt as Date).getTime());

    const upcoming = rows
      .filter(r => !r.berthed && r.eta && new Date(r.eta as Date) > in7Days)
      .sort((a, b) => new Date(a.eta as Date).getTime() - new Date(b.eta as Date).getTime())
      .slice(0, 5);

    const fmt = (r: typeof rows[0]) => ({
      id:                  r.id,
      containerNumber:     r.containerNumber,
      customerName:        r.customerName,
      vessel:              r.vessel || null,
      eta:                 r.eta instanceof Date ? r.eta.toISOString() : (r.eta ?? null),
      berthed:             r.berthed,
      berthingConfirmedAt: r.berthingConfirmedAt instanceof Date ? r.berthingConfirmedAt.toISOString() : (r.berthingConfirmedAt ?? null),
      status:              r.status,
    });

    return res.json({
      awaiting:   awaiting.map(fmt),
      berthed:    berthed.map(fmt),
      upcoming:   upcoming.map(fmt),
      branchScope: { id: branchScope.id, name: branchScope.name },
    });
  } catch (err) {
    console.error("[analytics/berthing]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

analyticsRouter.get("/analytics/turnaround", requireAuth, requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const _scope = getBranchScope(req);
    const DAY_MS = 86_400_000;
    const toDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const diffDays = (a: Date | null, b: Date | null): number | null => {
      if (!a || !b) return null;
      return Math.max(0, Math.round((toDay(b) - toDay(a)) / DAY_MS));
    };
    const toDate = (v: unknown): Date | null => {
      if (!v) return null;
      return v instanceof Date ? v : new Date(String(v));
    };

    const rows = await db.select({
      id: containersTable.id,
      createdAt: containersTable.createdAt,
      paarReleasedAt: containersTable.paarReleasedAt,
      doReleasedAt: containersTable.doReleasedAt,
      tdoReleasedAt: containersTable.tdoReleasedAt,
      pulloutReleasedAt: containersTable.pulloutReleasedAt,
      deliveredAt: containersTable.deliveredAt,
    }).from(containersTable)
      .where(_scope === null ? undefined : eq(containersTable.branchId, _scope));

    const completedRows = rows.filter(r => r.deliveredAt != null);
    const clearanceDays: number[] = completedRows
      .map(r => diffDays(toDate(r.createdAt), toDate(r.deliveredAt)))
      .filter((d): d is number => d !== null);

    const avgClearanceDays = clearanceDays.length > 0
      ? Math.round(clearanceDays.reduce((s, d) => s + d, 0) / clearanceDays.length)
      : null;

    const dist: Record<string, number> = { "0–7d": 0, "8–14d": 0, "15–30d": 0, "31–60d": 0, "60+d": 0 };
    for (const d of clearanceDays) {
      if (d <= 7) dist["0–7d"]++;
      else if (d <= 14) dist["8–14d"]++;
      else if (d <= 30) dist["15–30d"]++;
      else if (d <= 60) dist["31–60d"]++;
      else dist["60+d"]++;
    }
    const clearanceDistribution = Object.entries(dist).map(([label, count]) => ({ label, count }));

    const stageAcc = [
      { stage: "Documentation",  durations: [] as number[] },
      { stage: "DO / Shipping",  durations: [] as number[] },
      { stage: "TDO / Terminal", durations: [] as number[] },
      { stage: "Pull-Out",       durations: [] as number[] },
      { stage: "Delivery",       durations: [] as number[] },
    ];

    for (const r of rows) {
      const created  = toDate(r.createdAt);
      const paar     = toDate(r.paarReleasedAt);
      const doR      = toDate(r.doReleasedAt);
      const tdoR     = toDate(r.tdoReleasedAt);
      const pullout  = toDate(r.pulloutReleasedAt);
      const delivered = toDate(r.deliveredAt);

      const d0 = diffDays(created, paar);
      const d1 = diffDays(paar, doR);
      const d2 = diffDays(doR, tdoR);
      const d3 = diffDays(tdoR, pullout);
      const d4 = diffDays(pullout, delivered);

      if (d0 !== null) stageAcc[0].durations.push(d0);
      if (d1 !== null) stageAcc[1].durations.push(d1);
      if (d2 !== null) stageAcc[2].durations.push(d2);
      if (d3 !== null) stageAcc[3].durations.push(d3);
      if (d4 !== null) stageAcc[4].durations.push(d4);
    }

    const stageTurnaround = stageAcc
      .map(s => ({
        stage: s.stage,
        avgDays: s.durations.length > 0
          ? parseFloat((s.durations.reduce((a, b) => a + b, 0) / s.durations.length).toFixed(1))
          : null,
        sampleCount: s.durations.length,
      }))
      .filter(s => s.avgDays !== null);

    return res.json({
      avgClearanceDays,
      completedCount: completedRows.length,
      totalCount: rows.length,
      stageTurnaround,
      clearanceDistribution,
    });
  } catch (err) {
    console.error("[analytics/turnaround]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

analyticsRouter.get("/analytics/ar-summary", requireAuth, requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const _scope = getBranchScope(req);
    const invWhere = _scope === null
      ? ne(invoicesTable.status, "draft")
      : and(ne(invoicesTable.status, "draft"), eq(invoicesTable.branchId, _scope));

    const invoices = await db
      .select({ id: invoicesTable.id, total: invoicesTable.total })
      .from(invoicesTable)
      .where(invWhere);

    const invoiceIds = invoices.map(i => i.id);
    const payments = invoiceIds.length > 0
      ? await db.select({ amount: invoicePaymentsTable.amount })
          .from(invoicePaymentsTable)
          .where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
      : [];

    const totalInvoiced = invoices.reduce((s, i) => s + parseFloat(i.total ?? "0"), 0);
    const totalCollected = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const outstanding = Math.max(0, totalInvoiced - totalCollected);

    return res.json({ totalInvoiced, totalCollected, outstanding, invoiceCount: invoices.length });
  } catch (err) {
    console.error("[analytics/ar-summary]", err);
    return res.status(500).json({ error: "Server error" });
  }
});
