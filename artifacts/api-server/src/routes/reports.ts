import { Router } from "express";
import { db, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, containerExtraChargesTable, invoicesTable, invoiceItemsTable, invoicePaymentsTable, clientsTable, clientDepositsTable, overheadExpensesTable, expensePaymentsTable, banksTable, containerExpensePaymentsTable, bankFundAdditionsTable, bankTransfersTable, creditNotesTable, branchesTable, type ShippingCharges, type CustomsCharges, type TerminalCharges, type DeliveryCharges, type OperationsCharges } from "@workspace/db";
import { eq, gte, lte, lt, and, inArray, gt, ne, isNotNull, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAuth, requireBranchAdminOrAbove, requireBranchMemberOrAbove, requireSuperAdmin, getBranchScope, AuthRequest } from "../lib/auth.js";
import { calcTotalCost, sumShipping, sumCustoms, sumTerminal, sumDelivery, sumOperations } from "../lib/calculations.js";

export const reportsRouter = Router();

// ─── Branch scope helper ────────────────────────────────────────────────────
// Resolves the active branch scope for a report request. Returns:
//   { id: null, name: "All Branches — Consolidated" } when super-admin in All mode
//   { id: <n>,  name: <branch name> }                  otherwise.
async function resolveBranchScopeInfo(req: AuthRequest): Promise<{ id: number | null; name: string }> {
  const id = getBranchScope(req);
  if (id === null) return { id: null, name: "All Branches — Consolidated" };
  const [b] = await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, id)).limit(1);
  return { id, name: b?.name ?? `Branch ${id}` };
}

// Cached lookup of branch id → name (used for itemised report rows in All mode).
async function loadBranchNameMap(): Promise<Map<number, string>> {
  const rows = await db.select({ id: branchesTable.id, name: branchesTable.name }).from(branchesTable);
  return new Map(rows.map(r => [r.id, r.name]));
}

reportsRouter.get("/reports/containers", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { status, from, to } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(containersTable.status, status));
    if (from)   conditions.push(gte(containersTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(containersTable.createdAt, toDate));
    }
    if (branchScope.id !== null) conditions.push(eq(containersTable.branchId, branchScope.id));

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
      branchId: containersTable.branchId,
      createdAt: containersTable.createdAt,
    }).from(containersTable).where(conditions.length > 0 ? and(...conditions) : undefined);

    if (containers.length === 0) return res.json({ containers: [], branchScope });
    const branchNameMap = branchScope.id === null ? await loadBranchNameMap() : null;

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
        branchId: c.branchId,
        branchName: branchNameMap ? (branchNameMap.get(c.branchId) ?? null) : branchScope.name,
        createdAt: c.createdAt.toISOString().slice(0, 10),
      };
    });

    return res.json({ containers: rows, branchScope });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/export", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { status, from, to } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);

    const conditions: SQL[] = [];
    if (status) conditions.push(eq(containersTable.status, status));
    if (from)   conditions.push(gte(containersTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      conditions.push(lte(containersTable.createdAt, toDate));
    }
    if (branchScope.id !== null) conditions.push(eq(containersTable.branchId, branchScope.id));

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
      "Shipping USD ($)", "Shipping FX Rate (₦/$)",
      "Customs USD ($)", "Customs FX Rate (₦/$)",
      "Terminal USD ($)", "Terminal FX Rate (₦/$)",
      "Delivery USD ($)", "Delivery FX Rate (₦/$)",
      "Operations USD ($)", "Operations FX Rate (₦/$)",
    ];

    const csvRows = [headers.join(",")];

    const fxCol = (row: any) => {
      const usd = row?.usdAmount ? parseFloat(row.usdAmount) : null;
      const rate = row?.exchangeRate ? parseFloat(row.exchangeRate) : null;
      return [usd != null ? usd.toFixed(2) : "", rate != null ? rate.toFixed(6) : ""];
    };

    for (const c of containers) {
      const cost = calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
      const revenue = parseFloat(c.clearingCharges ?? "0");
      const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const fmt = (n: number) => n.toFixed(2);
      const [sUsd, sRate] = fxCol(sMap[c.id]);
      const [cUsd, cRate] = fxCol(cMap[c.id]);
      const [tUsd, tRate] = fxCol(tMap[c.id]);
      const [dUsd, dRate] = fxCol(dMap[c.id]);
      const [oUsd, oRate] = fxCol(oMap[c.id]);
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
        sUsd, sRate, cUsd, cRate, tUsd, tRate, dUsd, dRate, oUsd, oRate,
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

reportsRouter.get("/reports/client-statement", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { clientId, from, to } = req.query as Record<string, string>;
    if (!clientId) return res.status(400).json({ error: "clientId is required" });

    const id = parseInt(clientId, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid clientId" });

    const branchScope = await resolveBranchScopeInfo(req);

    // Branch-scope the client lookup so non-super-admins cannot read client
    // metadata for clients in other branches.
    const clientConds: SQL[] = [eq(clientsTable.id, id)];
    if (branchScope.id !== null) clientConds.push(eq(clientsTable.branchId, branchScope.id));
    const [client] = await db
      .select({ id: clientsTable.id, name: clientsTable.name, contactName: clientsTable.contactName, contactPhone: clientsTable.contactPhone, contactEmail: clientsTable.contactEmail, address: clientsTable.address })
      .from(clientsTable)
      .where(and(...clientConds));

    if (!client) return res.status(404).json({ error: "Client not found" });
    const conditions: SQL[] = [eq(invoicesTable.clientId, id)];
    if (from) conditions.push(gte(invoicesTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to + "T23:59:59");
      conditions.push(lte(invoicesTable.createdAt, toDate));
    }
    if (branchScope.id !== null) conditions.push(eq(invoicesTable.branchId, branchScope.id));

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
    const [payments, allStatementItems] = await Promise.all([
      invoiceIds.length > 0
        ? db.select().from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds)).orderBy(invoicePaymentsTable.paidAt)
        : Promise.resolve([] as Array<{ id: number; invoiceId: number; amount: string; paidAt: Date; paymentMethod: string; reference: string; notes: string; bankId: number | null; createdAt: Date }>),
      invoiceIds.length > 0
        ? db.select({
            id: invoiceItemsTable.id,
            invoiceId: invoiceItemsTable.invoiceId,
            containerId: invoiceItemsTable.containerId,
            containerNumber: containersTable.containerNumber,
            blNumber: containersTable.blNumber,
            description: invoiceItemsTable.description,
            amount: invoiceItemsTable.amount,
            sortOrder: invoiceItemsTable.sortOrder,
          })
          .from(invoiceItemsTable)
          .leftJoin(containersTable, eq(invoiceItemsTable.containerId, containersTable.id))
          .where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
          .orderBy(invoiceItemsTable.sortOrder)
        : Promise.resolve([] as Array<{ id: number; invoiceId: number; containerId: number | null; containerNumber: string | null; blNumber: string | null; description: string; amount: string; sortOrder: number }>),
    ]);

    const paymentsByInvoice = new Map<number, typeof payments>();
    for (const p of payments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    const statementItemsByInvoice = new Map<number, typeof allStatementItems>();
    for (const item of allStatementItems) {
      if (!statementItemsByInvoice.has(item.invoiceId)) statementItemsByInvoice.set(item.invoiceId, []);
      statementItemsByInvoice.get(item.invoiceId)!.push(item);
    }

    let totalInvoiced = 0;
    let totalPaid = 0;

    const formattedInvoices = invoices.map(inv => {
      const invPayments = paymentsByInvoice.get(inv.id) ?? [];
      const paid = invPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
      const total = parseFloat(inv.total ?? "0");
      // Written-off invoices have zero effective outstanding — their balance was absorbed as bad debt
      const outstanding = inv.status === "written_off" ? 0 : Math.max(0, total - paid);
      totalInvoiced += total;
      totalPaid += paid;

      const items = (statementItemsByInvoice.get(inv.id) ?? []).map(it => ({
        id: it.id,
        containerId: it.containerId ?? null,
        containerNumber: it.containerNumber ?? null,
        blNumber: it.blNumber ?? null,
        description: it.description,
        amount: parseFloat(it.amount ?? "0"),
        sortOrder: it.sortOrder,
      }));

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
        items,
      };
    });

    // Include credit balance and unallocated deposits in the statement closing balance
    const [clientRow] = await db.select({ creditBalance: clientsTable.creditBalance }).from(clientsTable).where(eq(clientsTable.id, id));
    const creditBalance = parseFloat(clientRow?.creditBalance ?? "0");

    const allDeposits = await db
      .select({ amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount })
      .from(clientDepositsTable)
      .where(eq(clientDepositsTable.clientId, id));
    const unallocatedDeposits = allDeposits.reduce((s, d) => {
      return s + Math.max(0, parseFloat(d.amount ?? "0") - parseFloat(d.allocatedAmount ?? "0"));
    }, 0);

    // Sum per-invoice outstanding; written_off invoices already have outstanding=0 above,
    // so they are correctly excluded from the receivable balance.
    const grossOutstanding = formattedInvoices.reduce((s, inv) => s + inv.outstanding, 0);
    const effectiveClosingBalance = Math.max(0, grossOutstanding - creditBalance - unallocatedDeposits);

    // Split totalPaid into cash collections vs credit-note adjustments for transparent reporting
    const totalCreditNoteAdjustments = formattedInvoices.reduce((s, inv) => {
      return s + inv.payments
        .filter(p => p.paymentMethod === "credit_note")
        .reduce((ps, p) => ps + p.amount, 0);
    }, 0);
    const totalCashCollected = totalPaid - totalCreditNoteAdjustments;

    return res.json({
      client,
      period: { from: from ?? null, to: to ?? null },
      branchScope,
      invoices: formattedInvoices,
      totals: {
        totalInvoiced,
        totalPaid,
        totalCashCollected,
        totalCreditNoteAdjustments,
        closingBalance: grossOutstanding,
        creditBalance,
        unallocatedDeposits,
        effectiveClosingBalance,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/vat-summary", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);

    const conditions: SQL[] = [];
    if (from) conditions.push(gte(invoicesTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to + "T23:59:59");
      conditions.push(lte(invoicesTable.createdAt, toDate));
    }
    if (branchScope.id !== null) conditions.push(eq(invoicesTable.branchId, branchScope.id));

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
      branchScope,
      invoices: rows,
      totals: { totalSubtotal, totalVat, totalInvoiced },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/vat-liability", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const branchScope = await resolveBranchScopeInfo(req);
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentQuarterNum = Math.floor(currentMonth / 3) + 1;

    const quarterDefs: Array<{ label: string; year: number; quarter: number; from: Date; to: Date }> = [];
    for (let i = 0; i < 5; i++) {
      let q = currentQuarterNum - i;
      let y = currentYear;
      while (q <= 0) { q += 4; y--; }
      const qStartMonth = (q - 1) * 3;
      const from = new Date(y, qStartMonth, 1);
      const to = new Date(y, qStartMonth + 3, 0, 23, 59, 59, 999);
      quarterDefs.push({ label: `Q${q} ${y}`, year: y, quarter: q, from, to });
    }

    const earliestFrom = quarterDefs[quarterDefs.length - 1].from;

    // Fetch non-draft, non-cancelled invoices in the window
    const invoices = await db.select({
      id: invoicesTable.id,
      subtotal: invoicesTable.subtotal,
      vatAmount: invoicesTable.vatAmount,
      total: invoicesTable.total,
      status: invoicesTable.status,
      createdAt: invoicesTable.createdAt,
    })
      .from(invoicesTable)
      .where(
        and(
          gte(invoicesTable.createdAt, earliestFrom),
          ne(invoicesTable.status, "draft"),
          ne(invoicesTable.status, "cancelled"),
          ...(branchScope.id !== null ? [eq(invoicesTable.branchId, branchScope.id)] : []),
        )
      );

    // Fetch credit notes for invoices in this window to derive VAT reduction
    const invoiceIds = invoices.map(inv => inv.id);
    type CreditNoteVatRow = { invoiceId: number; creditAmount: number; invoiceTotal: number; invoiceVat: number };
    let creditNoteRows: CreditNoteVatRow[] = [];
    if (invoiceIds.length > 0) {
      const cnRows = await db.select({
        invoiceId: creditNotesTable.invoiceId,
        amount: creditNotesTable.amount,
        status: creditNotesTable.status,
        createdAt: creditNotesTable.createdAt,
        invoiceTotal: invoicesTable.total,
        invoiceVat: invoicesTable.vatAmount,
      })
        .from(creditNotesTable)
        .innerJoin(invoicesTable, eq(creditNotesTable.invoiceId, invoicesTable.id))
        .where(
          and(
            inArray(creditNotesTable.invoiceId, invoiceIds),
            ne(creditNotesTable.status, "voided"),
          )
        );
      // VAT credit = pro-rata of invoice VAT based on credit note amount vs invoice total
      creditNoteRows = cnRows.map(cn => ({
        invoiceId: cn.invoiceId,
        creditAmount: parseFloat(cn.amount ?? "0"),
        invoiceTotal: parseFloat(cn.invoiceTotal ?? "1"),
        invoiceVat: parseFloat(cn.invoiceVat ?? "0"),
      }));
    }

    // Helper: get quarter index for a date
    const getQuarterIdx = (d: Date): number => {
      for (let i = 0; i < quarterDefs.length; i++) {
        if (d >= quarterDefs[i].from && d <= quarterDefs[i].to) return i;
      }
      return -1;
    };

    // Build per-quarter accumulators
    type QAcc = { grossVat: number; creditVat: number; taxable: number; count: number };
    const qAccs: QAcc[] = quarterDefs.map(() => ({ grossVat: 0, creditVat: 0, taxable: 0, count: 0 }));

    for (const inv of invoices) {
      const d = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt!);
      const qi = getQuarterIdx(d);
      if (qi < 0) continue;
      qAccs[qi].grossVat += parseFloat(inv.vatAmount ?? "0");
      qAccs[qi].taxable += parseFloat(inv.subtotal ?? "0");
      qAccs[qi].count++;
    }

    // Build a lookup: invoiceId -> invoice createdAt quarter index
    const invQuarterMap: Record<number, number> = {};
    for (const inv of invoices) {
      const d = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt!);
      invQuarterMap[inv.id] = getQuarterIdx(d);
    }

    for (const cn of creditNoteRows) {
      const qi = invQuarterMap[cn.invoiceId] ?? -1;
      if (qi < 0) continue;
      const invTotal = cn.invoiceTotal > 0 ? cn.invoiceTotal : 1;
      const vatCredit = (cn.creditAmount / invTotal) * cn.invoiceVat;
      qAccs[qi].creditVat += vatCredit;
    }

    // Build monthly breakdown for the current quarter
    const cqDef = quarterDefs[0];
    const cqStartMonth = (cqDef.quarter - 1) * 3;
    const months = [0, 1, 2].map(offset => {
      const mNum = cqStartMonth + offset;
      const mFrom = new Date(cqDef.year, mNum, 1);
      const mTo = new Date(cqDef.year, mNum + 1, 0, 23, 59, 59, 999);
      const mLabel = mFrom.toLocaleString("en-NG", { month: "short" });
      const mInvs = invoices.filter(inv => {
        const d = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt!);
        return d >= mFrom && d <= mTo;
      });
      const mGrossVat = mInvs.reduce((s, inv) => s + parseFloat(inv.vatAmount ?? "0"), 0);
      const mTaxable = mInvs.reduce((s, inv) => s + parseFloat(inv.subtotal ?? "0"), 0);
      // Credit VAT credit attributable to this month's invoices
      const mInvIds = new Set(mInvs.map(inv => inv.id));
      const mCreditVat = creditNoteRows
        .filter(cn => mInvIds.has(cn.invoiceId))
        .reduce((s, cn) => {
          const invTotal = cn.invoiceTotal > 0 ? cn.invoiceTotal : 1;
          return s + (cn.creditAmount / invTotal) * cn.invoiceVat;
        }, 0);
      return {
        label: mLabel,
        month: mNum + 1,
        year: cqDef.year,
        vatCollected: Math.max(0, mGrossVat - mCreditVat),
        taxableAmount: mTaxable,
        invoiceCount: mInvs.length,
      };
    });

    const quarterData = quarterDefs.map((q, i) => ({
      label: q.label,
      year: q.year,
      quarter: q.quarter,
      from: q.from.toISOString().slice(0, 10),
      to: q.to.toISOString().slice(0, 10),
      vatCollected: Math.max(0, qAccs[i].grossVat - qAccs[i].creditVat),
      taxableAmount: qAccs[i].taxable,
      invoiceCount: qAccs[i].count,
      creditNoteVatDeduction: qAccs[i].creditVat,
      ...(i === 0 ? { months } : {}),
    }));

    const currentQuarter = quarterData[0];
    const currentYearQuarters = quarterData.filter(q => q.year === currentYear);
    const currentYearTotal = {
      vatCollected: currentYearQuarters.reduce((s, q) => s + q.vatCollected, 0),
      taxableAmount: currentYearQuarters.reduce((s, q) => s + q.taxableAmount, 0),
      invoiceCount: currentYearQuarters.reduce((s, q) => s + q.invoiceCount, 0),
    };

    return res.json({ currentQuarter, quarters: quarterData, currentYearTotal, branchScope });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/pl", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { from, to, clientId, costBasis } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
    }
    if (to) {
      toDate = new Date(to + "T23:59:59");
      if (isNaN(toDate.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: "'from' must be on or before 'to'" });
    }

    let clientIdNum: number | null = null;
    if (clientId && clientId !== "all") {
      if (!/^\d+$/.test(clientId)) return res.status(400).json({ error: "Invalid clientId" });
      clientIdNum = parseInt(clientId, 10);
      if (!Number.isFinite(clientIdNum) || clientIdNum <= 0) return res.status(400).json({ error: "Invalid clientId" });
    }

    // ===== REVENUE: issued invoices in period (excludes drafts; uses ex-VAT net sales) =====
    const invConds: SQL[] = [ne(invoicesTable.status, "draft")];
    if (fromDate) invConds.push(gte(invoicesTable.createdAt, fromDate));
    if (toDate)   invConds.push(lte(invoicesTable.createdAt, toDate));
    if (clientIdNum !== null) invConds.push(eq(invoicesTable.clientId, clientIdNum));
    if (branchScope.id !== null) invConds.push(eq(invoicesTable.branchId, branchScope.id));

    const invoiceRows = await db
      .select({
        id: invoicesTable.id,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(and(...invConds));

    let totalRevenue = 0;          // ex-VAT net sales (recognised revenue)
    let totalInvoicedInclVat = 0;  // gross invoiced (for reference)
    let totalVatCollected = 0;
    const revenueByClient: Record<string, { clientId: number; clientName: string; revenue: number; invoiceCount: number }> = {};
    for (const inv of invoiceRows) {
      const subtotal = parseFloat(inv.subtotal ?? "0");
      const vat = parseFloat(inv.vatAmount ?? "0");
      const total = parseFloat(inv.total ?? "0");
      totalRevenue += subtotal;
      totalInvoicedInclVat += total;
      totalVatCollected += vat;
      const key = String(inv.clientId);
      if (!revenueByClient[key]) revenueByClient[key] = {
        clientId: inv.clientId ?? 0, clientName: inv.clientName ?? "Unknown", revenue: 0, invoiceCount: 0,
      };
      revenueByClient[key].revenue += subtotal;
      revenueByClient[key].invoiceCount += 1;
    }

    // ===== COST OF SALES: attributed to each container's first-ever invoice date =====
    // We query ALL non-draft invoice items globally (optionally filtered by client) to find
    // the earliest-ever invoice date per container. COGS is recognised exactly ONCE — in the
    // period that first-ever date falls in. This prevents double-counting when a container
    // appears on multiple invoices across different periods.
    const allInvoiceItemConds: SQL[] = [isNotNull(invoiceItemsTable.containerId), ne(invoicesTable.status, "draft")];
    if (clientIdNum !== null) allInvoiceItemConds.push(eq(invoicesTable.clientId, clientIdNum));
    if (branchScope.id !== null) allInvoiceItemConds.push(eq(invoicesTable.branchId, branchScope.id));

    const allNonDraftInvoiceItemRows = await db
      .select({
        containerId: invoiceItemsTable.containerId,
        invoiceCreatedAt: invoicesTable.createdAt,
      })
      .from(invoiceItemsTable)
      .innerJoin(invoicesTable, eq(invoiceItemsTable.invoiceId, invoicesTable.id))
      .where(and(...allInvoiceItemConds));

    // Build: containerId -> earliest-ever non-draft invoice date (all time)
    const containerFirstInvoiceDate = new Map<number, Date>();
    for (const row of allNonDraftInvoiceItemRows) {
      if (row.containerId === null) continue;
      const d = row.invoiceCreatedAt instanceof Date ? row.invoiceCreatedAt : new Date(row.invoiceCreatedAt);
      const existing = containerFirstInvoiceDate.get(row.containerId);
      if (!existing || d < existing) containerFirstInvoiceDate.set(row.containerId, d);
    }

    // Only include containers whose first-ever invoice date falls within the requested period.
    // This ensures each container's COGS is recognised in exactly one period.
    const containerToInvoiceDate = new Map<number, Date>();
    for (const [containerId, firstDate] of containerFirstInvoiceDate) {
      const afterFrom = !fromDate || firstDate >= fromDate;
      const beforeTo  = !toDate   || firstDate <= toDate;
      if (afterFrom && beforeTo) containerToInvoiceDate.set(containerId, firstDate);
    }
    const invoicedIds = [...containerToInvoiceDate.keys()];

    // allInvoicedContainerIds: ALL containers ever on a non-draft invoice (for uninvoiced detection)
    const allInvoicedContainerIds = new Set(containerFirstInvoiceDate.keys());

    // Step 3: Uninvoiced containers created in the period (no non-draft invoice ever raised)
    const uninvConds: SQL[] = [];
    if (fromDate) uninvConds.push(gte(containersTable.createdAt, fromDate));
    if (toDate)   uninvConds.push(lte(containersTable.createdAt, toDate));
    if (clientIdNum !== null) uninvConds.push(eq(containersTable.clientId, clientIdNum));
    if (branchScope.id !== null) uninvConds.push(eq(containersTable.branchId, branchScope.id));

    const allPeriodContainers = await db
      .select({ id: containersTable.id, createdAt: containersTable.createdAt })
      .from(containersTable)
      .where(uninvConds.length > 0 ? and(...uninvConds) : undefined);
    const uninvoicedContainers = allPeriodContainers.filter(c => !allInvoicedContainerIds.has(c.id));
    const uninvoicedIds = uninvoicedContainers.map(c => c.id);
    const uninvoicedCreatedAt = new Map(
      uninvoicedContainers.map(c => [c.id, c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)])
    );

    // All container IDs we need charges for (invoiced + uninvoiced)
    const allCostIds = [...new Set([...invoicedIds, ...uninvoicedIds])];
    const containerCount = allCostIds.length;
    const invoicedIdSet = new Set(invoicedIds);

    // Section cost accumulators — only for INVOICED containers (recognized COGS matching revenue)
    let costShipping = 0, costCustoms = 0, costTerminal = 0, costDelivery = 0, costOperations = 0, costExtras = 0;
    // Uninvoiced COGS is informational — not included in totalCostOfSales / grossProfit
    let uninvoicedCogs = 0;
    const extrasByContainer: Map<number, number> = new Map();
    const totalCostByContainer: Map<number, number> = new Map();

    if (allCostIds.length > 0) {
      if (costBasis === "disbursements") {
        // Use actual disbursements (container_expense_payments) instead of charge-table budgets
        const disbPayments = await db
          .select({
            containerId: containerExpensePaymentsTable.containerId,
            section: containerExpensePaymentsTable.section,
            total: sql<string>`sum(${containerExpensePaymentsTable.amount})`,
          })
          .from(containerExpensePaymentsTable)
          .where(inArray(containerExpensePaymentsTable.containerId, allCostIds))
          .groupBy(containerExpensePaymentsTable.containerId, containerExpensePaymentsTable.section);

        const disbMap = new Map<number, Map<string, number>>();
        for (const r of disbPayments) {
          if (!disbMap.has(r.containerId)) disbMap.set(r.containerId, new Map());
          disbMap.get(r.containerId)!.set(r.section ?? "other", parseFloat(r.total ?? "0"));
        }

        for (const id of allCostIds) {
          const secMap = disbMap.get(id) ?? new Map<string, number>();
          const s = secMap.get("shipping")   ?? 0;
          const c = secMap.get("customs")    ?? 0;
          const t = secMap.get("terminal")   ?? 0;
          const d = secMap.get("delivery")   ?? 0;
          const o = secMap.get("operations") ?? 0;
          // Sum ALL section entries (including null-section → "other") so no payment is dropped
          const total = [...secMap.values()].reduce((sum, v) => sum + v, 0);
          const unallocated = total - (s + c + t + d + o);
          if (invoicedIdSet.has(id)) {
            costShipping   += s;
            costCustoms    += c;
            costTerminal   += t;
            costDelivery   += d;
            costOperations += o;
            costExtras     += unallocated; // unallocated payments go into extras bucket
          }
          totalCostByContainer.set(id, total);
          if (uninvoicedCreatedAt.has(id)) uninvoicedCogs += total;
        }
        // costExtras captures unallocated (null/other-section) payments when using disbursements
      } else {
        const [allS, allC, allT, allD, allO, allE] = await Promise.all([
          db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, allCostIds)),
          db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, allCostIds)),
          db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, allCostIds)),
          db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, allCostIds)),
          db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, allCostIds)),
          db.select({ containerId: containerExtraChargesTable.containerId, amount: containerExtraChargesTable.amount })
            .from(containerExtraChargesTable).where(inArray(containerExtraChargesTable.containerId, allCostIds)),
        ]);
        const sMap2 = new Map<number, any>(allS.map(r => [r.containerId, r]));
        const cMap2 = new Map<number, any>(allC.map(r => [r.containerId, r]));
        const tMap2 = new Map<number, any>(allT.map(r => [r.containerId, r]));
        const dMap2 = new Map<number, any>(allD.map(r => [r.containerId, r]));
        const oMap2 = new Map<number, any>(allO.map(r => [r.containerId, r]));

        for (const r of allS) { if (invoicedIdSet.has(r.containerId)) costShipping   += sumShipping(r as any); }
        for (const r of allC) { if (invoicedIdSet.has(r.containerId)) costCustoms    += sumCustoms(r as any); }
        for (const r of allT) { if (invoicedIdSet.has(r.containerId)) costTerminal   += sumTerminal(r as any); }
        for (const r of allD) { if (invoicedIdSet.has(r.containerId)) costDelivery   += sumDelivery(r as any); }
        for (const r of allO) { if (invoicedIdSet.has(r.containerId)) costOperations += sumOperations(r as any); }
        for (const r of allE) {
          const amt = parseFloat(r.amount as string ?? "0");
          extrasByContainer.set(r.containerId, (extrasByContainer.get(r.containerId) ?? 0) + amt);
          if (invoicedIdSet.has(r.containerId)) costExtras += amt;
        }
        for (const id of allCostIds) {
          const base = calcTotalCost(sMap2.get(id) ?? {}, cMap2.get(id) ?? {}, tMap2.get(id) ?? {}, dMap2.get(id) ?? {}, oMap2.get(id) ?? {});
          const extras = extrasByContainer.get(id) ?? 0;
          totalCostByContainer.set(id, base + extras);
          if (uninvoicedCreatedAt.has(id)) uninvoicedCogs += base + extras;
        }
      }
    }

    // totalCostOfSales = only invoiced containers' costs (aligned with recognized revenue)
    const totalCostOfSales = costShipping + costCustoms + costTerminal + costDelivery + costOperations + costExtras;
    const grossProfit = totalRevenue - totalCostOfSales;
    const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // ===== OVERHEAD EXPENSES =====
    // Note: overheads are organisation-wide; when a client filter is set we still show
    // company overheads (a client filter on overheads would be meaningless).
    const ohConds: SQL[] = [];
    if (fromDate) ohConds.push(gte(overheadExpensesTable.paidAt, fromDate));
    if (toDate)   ohConds.push(lte(overheadExpensesTable.paidAt, toDate));
    if (branchScope.id !== null) ohConds.push(eq(overheadExpensesTable.branchId, branchScope.id));

    const overheadRows = await db
      .select({
        id: overheadExpensesTable.id,
        amount: overheadExpensesTable.amount,
        paidAt: overheadExpensesTable.paidAt,
        category: overheadExpensesTable.category,
      })
      .from(overheadExpensesTable)
      .where(ohConds.length > 0 ? and(...ohConds) : undefined);

    let totalOverheads = 0;
    const overheadByCategory: Record<string, number> = {};
    for (const r of overheadRows) {
      const amt = parseFloat(r.amount as string ?? "0");
      totalOverheads += amt;
      const cat = r.category ?? "Other";
      overheadByCategory[cat] = (overheadByCategory[cat] ?? 0) + amt;
    }

    // When a client filter is applied, do NOT subtract company-wide overheads from that
    // client's gross profit — Net Profit only makes sense at the company level.
    const netProfit = clientIdNum !== null ? grossProfit : grossProfit - totalOverheads;
    const netMarginPct = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    const avgProfitPerContainer = containerCount > 0 ? grossProfit / containerCount : 0;

    // ===== MONTHLY BREAKDOWN =====
    const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const months: Record<string, {
      month: string; revenue: number; costOfSales: number; grossProfit: number; overheads: number; netProfit: number; containerCount: number;
    }> = {};
    const ensureMonth = (k: string) => {
      if (!months[k]) months[k] = { month: k, revenue: 0, costOfSales: 0, grossProfit: 0, overheads: 0, netProfit: 0, containerCount: 0 };
      return months[k];
    };

    for (const inv of invoiceRows) {
      const d = inv.createdAt instanceof Date ? inv.createdAt : new Date(inv.createdAt);
      ensureMonth(monthKey(d)).revenue += parseFloat(inv.subtotal ?? "0");
    }

    // Monthly COGS: invoiced containers attributed to their invoice month
    // Uninvoiced containers are excluded from the monthly breakdown (captured in costOfSales.uninvoicedCogs)
    for (const [containerId, invoiceDate] of containerToInvoiceDate) {
      const cost = totalCostByContainer.get(containerId) ?? 0;
      const m = ensureMonth(monthKey(invoiceDate));
      m.costOfSales += cost;
      m.containerCount += 1;
    }

    for (const r of overheadRows) {
      const d = r.paidAt instanceof Date ? r.paidAt : new Date(r.paidAt as any);
      ensureMonth(monthKey(d)).overheads += parseFloat(r.amount as string ?? "0");
    }

    for (const m of Object.values(months)) {
      m.grossProfit = m.revenue - m.costOfSales;
      m.netProfit = clientIdNum !== null ? m.grossProfit : m.grossProfit - m.overheads;
    }
    const monthly = Object.values(months).sort((a, b) => a.month.localeCompare(b.month));

    // Per-client gross profit (only when no specific client filter is applied)
    const clientsList = await db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable);

    return res.json({
      period: { from: from ?? null, to: to ?? null },
      branchScope,
      filters: { clientId: clientIdNum },
      costBasis: costBasis === "disbursements" ? "disbursements" : "budgeted",
      revenue: {
        totalRevenue,                 // ex-VAT (recognised revenue)
        totalInvoicedInclVat,         // gross invoiced (informational)
        totalVatCollected,            // VAT liability (not revenue)
        invoiceCount: invoiceRows.length,
        byClient: Object.values(revenueByClient).sort((a, b) => b.revenue - a.revenue),
        excludesDrafts: true,
      },
      costOfSales: {
        total: totalCostOfSales,
        shipping: costShipping,
        customs: costCustoms,
        terminal: costTerminal,
        delivery: costDelivery,
        operations: costOperations,
        extras: costExtras,
        uninvoicedCogs,
        invoicedContainerCount: invoicedIds.length,
        uninvoicedContainerCount: uninvoicedIds.length,
      },
      grossProfit,
      grossMarginPct,
      overheads: {
        total: totalOverheads,
        byCategory: overheadByCategory,
        appliedToNet: clientIdNum === null,
      },
      netProfit,
      netMarginPct,
      containerCount,
      avgProfitPerContainer,
      monthly,
      clients: clientsList,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/cashflow", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { from, to, bankId } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
    }
    if (to) {
      toDate = new Date(to + "T23:59:59");
      if (isNaN(toDate.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: "'from' must be on or before 'to'" });
    }

    let bankIdNum: number | null = null;
    if (bankId && bankId !== "all") {
      if (!/^\d+$/.test(bankId)) return res.status(400).json({ error: "Invalid bankId" });
      bankIdNum = parseInt(bankId, 10);
      if (!Number.isFinite(bankIdNum) || bankIdNum <= 0) return res.status(400).json({ error: "Invalid bankId" });
    }

    // INFLOWS — invoice_payments
    const invPayConds: SQL[] = [];
    if (fromDate) invPayConds.push(gte(invoicePaymentsTable.paidAt, fromDate));
    if (toDate)   invPayConds.push(lte(invoicePaymentsTable.paidAt, toDate));
    if (bankIdNum !== null) invPayConds.push(eq(invoicePaymentsTable.bankId, bankIdNum));
    if (branchScope.id !== null) invPayConds.push(eq(invoicePaymentsTable.branchId, branchScope.id));

    const invoicePaymentRows = await db
      .select({
        id: invoicePaymentsTable.id,
        amount: invoicePaymentsTable.amount,
        paidAt: invoicePaymentsTable.paidAt,
        paymentMethod: invoicePaymentsTable.paymentMethod,
        reference: invoicePaymentsTable.reference,
        notes: invoicePaymentsTable.notes,
        bankId: invoicePaymentsTable.bankId,
        bankName: banksTable.name,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientName: clientsTable.name,
      })
      .from(invoicePaymentsTable)
      .leftJoin(banksTable, eq(invoicePaymentsTable.bankId, banksTable.id))
      .leftJoin(invoicesTable, eq(invoicePaymentsTable.invoiceId, invoicesTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(invPayConds.length > 0 ? and(...invPayConds) : undefined)
      .orderBy(invoicePaymentsTable.paidAt);

    // INFLOWS — client_deposits
    const depConds: SQL[] = [];
    if (fromDate) depConds.push(gte(clientDepositsTable.createdAt, fromDate));
    if (toDate)   depConds.push(lte(clientDepositsTable.createdAt, toDate));
    if (bankIdNum !== null) depConds.push(eq(clientDepositsTable.bankId, bankIdNum));
    if (branchScope.id !== null) depConds.push(eq(clientDepositsTable.branchId, branchScope.id));

    const depositRows = await db
      .select({
        id: clientDepositsTable.id,
        amount: clientDepositsTable.amount,
        createdAt: clientDepositsTable.createdAt,
        paymentMethod: clientDepositsTable.paymentMethod,
        reference: clientDepositsTable.reference,
        notes: clientDepositsTable.notes,
        bankId: clientDepositsTable.bankId,
        bankName: banksTable.name,
        clientName: clientsTable.name,
      })
      .from(clientDepositsTable)
      .leftJoin(banksTable, eq(clientDepositsTable.bankId, banksTable.id))
      .leftJoin(clientsTable, eq(clientDepositsTable.clientId, clientsTable.id))
      .where(depConds.length > 0 ? and(...depConds) : undefined)
      .orderBy(clientDepositsTable.createdAt);

    // OUTFLOWS — overhead expense payments (actual bank cash movements, not expense records)
    const ohConds: SQL[] = [];
    if (fromDate) ohConds.push(gte(expensePaymentsTable.paidAt, fromDate));
    if (toDate)   ohConds.push(lte(expensePaymentsTable.paidAt, toDate));
    if (bankIdNum !== null) ohConds.push(eq(expensePaymentsTable.bankId, bankIdNum));
    if (branchScope.id !== null) ohConds.push(eq(expensePaymentsTable.branchId, branchScope.id));

    const overheadRows = await db
      .select({
        id: expensePaymentsTable.id,
        amount: expensePaymentsTable.amount,
        paidAt: expensePaymentsTable.paidAt,
        category: overheadExpensesTable.category,
        description: overheadExpensesTable.description,
        reference: sql<string | null>`null`,
        bankId: expensePaymentsTable.bankId,
        bankName: banksTable.name,
      })
      .from(expensePaymentsTable)
      .leftJoin(overheadExpensesTable, eq(expensePaymentsTable.expenseId, overheadExpensesTable.id))
      .leftJoin(banksTable, eq(expensePaymentsTable.bankId, banksTable.id))
      .where(ohConds.length > 0 ? and(...ohConds) : undefined)
      .orderBy(expensePaymentsTable.paidAt);

    // INFLOWS — bank fund additions
    const fundAddConds: SQL[] = [];
    if (fromDate) fundAddConds.push(gte(bankFundAdditionsTable.createdAt, fromDate));
    if (toDate)   fundAddConds.push(lte(bankFundAdditionsTable.createdAt, toDate));
    if (bankIdNum !== null) fundAddConds.push(eq(bankFundAdditionsTable.bankId, bankIdNum));
    if (branchScope.id !== null) fundAddConds.push(eq(bankFundAdditionsTable.branchId, branchScope.id));

    const fundAddRows = await db
      .select({
        id: bankFundAdditionsTable.id,
        amount: bankFundAdditionsTable.amount,
        createdAt: bankFundAdditionsTable.createdAt,
        narration: bankFundAdditionsTable.narration,
        reference: bankFundAdditionsTable.reference,
        bankId: bankFundAdditionsTable.bankId,
        bankName: banksTable.name,
      })
      .from(bankFundAdditionsTable)
      .leftJoin(banksTable, eq(bankFundAdditionsTable.bankId, banksTable.id))
      .where(fundAddConds.length > 0 ? and(...fundAddConds) : undefined)
      .orderBy(bankFundAdditionsTable.createdAt);

    // OUTFLOWS — container expense disbursements
    const cepConds: SQL[] = [];
    if (fromDate) cepConds.push(gte(containerExpensePaymentsTable.paidAt, fromDate));
    if (toDate)   cepConds.push(lte(containerExpensePaymentsTable.paidAt, toDate));
    if (bankIdNum !== null) cepConds.push(eq(containerExpensePaymentsTable.bankId, bankIdNum));
    if (branchScope.id !== null) cepConds.push(eq(containerExpensePaymentsTable.branchId, branchScope.id));

    const cepRows = await db
      .select({
        id: containerExpensePaymentsTable.id,
        amount: containerExpensePaymentsTable.amount,
        paidAt: containerExpensePaymentsTable.paidAt,
        section: containerExpensePaymentsTable.section,
        narration: containerExpensePaymentsTable.narration,
        reference: containerExpensePaymentsTable.reference,
        bankId: containerExpensePaymentsTable.bankId,
        bankName: banksTable.name,
        containerNumber: containersTable.containerNumber,
      })
      .from(containerExpensePaymentsTable)
      .leftJoin(banksTable, eq(containerExpensePaymentsTable.bankId, banksTable.id))
      .leftJoin(containersTable, eq(containerExpensePaymentsTable.containerId, containersTable.id))
      .where(cepConds.length > 0 ? and(...cepConds) : undefined)
      .orderBy(containerExpensePaymentsTable.paidAt);

    // List of banks — queried early so builders can look up names by id
    const allBanks = await db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable);
    const bankNameById = (id: number | null) => allBanks.find(b => b.id === id)?.name ?? null;

    type Txn = {
      id: string;
      date: string;
      type: "invoice_payment" | "client_deposit" | "overhead_expense" | "fund_addition" | "container_expense" | "bank_transfer";
      direction: "in" | "out";
      description: string;
      category: string | null;
      bankId: number | null;
      bankName: string | null;
      reference: string | null;
      amount: number;
    };

    const inflows: Txn[] = [];
    const outflows: Txn[] = [];

    for (const r of invoicePaymentRows) {
      inflows.push({
        id: `ip-${r.id}`,
        date: r.paidAt instanceof Date ? r.paidAt.toISOString() : String(r.paidAt),
        type: "invoice_payment",
        direction: "in",
        description: `Invoice ${r.invoiceNumber ?? ""} payment${r.clientName ? ` — ${r.clientName}` : ""}`,
        category: r.paymentMethod ?? null,
        bankId: r.bankId,
        bankName: r.bankName,
        reference: r.reference ?? null,
        amount: parseFloat(r.amount as string ?? "0"),
      });
    }

    for (const r of depositRows) {
      inflows.push({
        id: `cd-${r.id}`,
        date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        type: "client_deposit",
        direction: "in",
        description: `Wallet deposit${r.clientName ? ` — ${r.clientName}` : ""}`,
        category: r.paymentMethod ?? null,
        bankId: r.bankId,
        bankName: r.bankName,
        reference: r.reference ?? null,
        amount: parseFloat(r.amount as string ?? "0"),
      });
    }

    for (const r of overheadRows) {
      outflows.push({
        id: `oh-${r.id}`,
        date: r.paidAt instanceof Date ? r.paidAt.toISOString() : String(r.paidAt),
        type: "overhead_expense",
        direction: "out",
        description: r.description ?? "",
        category: r.category ?? null,
        bankId: r.bankId,
        bankName: r.bankName,
        reference: r.reference ?? null,
        amount: parseFloat(r.amount as string ?? "0"),
      });
    }

    for (const r of fundAddRows) {
      inflows.push({
        id: `fa-${r.id}`,
        date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        type: "fund_addition",
        direction: "in",
        description: r.narration || "Bank fund addition",
        category: "Fund Addition",
        bankId: r.bankId ?? null,
        bankName: r.bankName ?? null,
        reference: r.reference ?? null,
        amount: parseFloat(r.amount as string ?? "0"),
      });
    }

    for (const r of cepRows) {
      const sectionLabel = r.section
        ? r.section.charAt(0).toUpperCase() + r.section.slice(1)
        : "Container Expense";
      outflows.push({
        id: `cep-${r.id}`,
        date: r.paidAt instanceof Date ? r.paidAt.toISOString() : String(r.paidAt),
        type: "container_expense",
        direction: "out",
        description: `${sectionLabel} disbursement${r.containerNumber ? ` — ${r.containerNumber}` : ""}${r.narration ? ` (${r.narration})` : ""}`,
        category: sectionLabel,
        bankId: r.bankId ?? null,
        bankName: r.bankName ?? null,
        reference: r.reference ?? null,
        amount: parseFloat(r.amount as string ?? "0"),
      });
    }

    // Bank transfers — only for specific-bank view (inter-bank transfers net to zero across all banks)
    if (bankIdNum !== null) {
      const xferTimeConds = (primary: SQL): SQL[] => {
        const c: SQL[] = [primary];
        if (fromDate) c.push(gte(bankTransfersTable.createdAt, fromDate));
        if (toDate)   c.push(lte(bankTransfersTable.createdAt, toDate));
        if (branchScope.id !== null) c.push(eq(bankTransfersTable.branchId, branchScope.id));
        return c;
      };
      const fromBankAlias = alias(banksTable, "from_bank");
      const toBankAlias = alias(banksTable, "to_bank");
      const [xferIn, xferOut] = await Promise.all([
        db.select({
            id: bankTransfersTable.id,
            amount: bankTransfersTable.amount,
            createdAt: bankTransfersTable.createdAt,
            narration: bankTransfersTable.narration,
            reference: bankTransfersTable.reference,
            counterpartName: fromBankAlias.name,
          })
          .from(bankTransfersTable)
          .leftJoin(fromBankAlias, eq(bankTransfersTable.fromBankId, fromBankAlias.id))
          .where(and(...xferTimeConds(eq(bankTransfersTable.toBankId, bankIdNum))))
          .orderBy(bankTransfersTable.createdAt),
        db.select({
            id: bankTransfersTable.id,
            amount: bankTransfersTable.amount,
            createdAt: bankTransfersTable.createdAt,
            narration: bankTransfersTable.narration,
            reference: bankTransfersTable.reference,
            counterpartName: toBankAlias.name,
          })
          .from(bankTransfersTable)
          .leftJoin(toBankAlias, eq(bankTransfersTable.toBankId, toBankAlias.id))
          .where(and(...xferTimeConds(eq(bankTransfersTable.fromBankId, bankIdNum))))
          .orderBy(bankTransfersTable.createdAt),
      ]);
      for (const r of xferIn) {
        inflows.push({
          id: `xfi-${r.id}`,
          date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          type: "bank_transfer",
          direction: "in",
          description: `Transfer in${r.counterpartName ? ` from ${r.counterpartName}` : ""}${r.narration ? ` — ${r.narration}` : ""}`,
          category: "Bank Transfer",
          bankId: bankIdNum,
          bankName: bankNameById(bankIdNum),
          reference: r.reference ?? null,
          amount: parseFloat(r.amount as string ?? "0"),
        });
      }
      for (const r of xferOut) {
        outflows.push({
          id: `xfo-${r.id}`,
          date: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
          type: "bank_transfer",
          direction: "out",
          description: `Transfer out${r.counterpartName ? ` to ${r.counterpartName}` : ""}${r.narration ? ` — ${r.narration}` : ""}`,
          category: "Bank Transfer",
          bankId: bankIdNum,
          bankName: bankNameById(bankIdNum),
          reference: r.reference ?? null,
          amount: parseFloat(r.amount as string ?? "0"),
        });
      }
    }

    inflows.sort((a, b) => a.date.localeCompare(b.date));
    outflows.sort((a, b) => a.date.localeCompare(b.date));

    const totalIn = inflows.reduce((s, t) => s + t.amount, 0);
    const totalOut = outflows.reduce((s, t) => s + t.amount, 0);

    // Opening balance — sum of all matched transaction types BEFORE the period start
    let openingBalance = 0;
    if (fromDate) {
      const prevInvPayConds: SQL[] = [lt(invoicePaymentsTable.paidAt, fromDate)];
      if (bankIdNum !== null) prevInvPayConds.push(eq(invoicePaymentsTable.bankId, bankIdNum));
      if (branchScope.id !== null) prevInvPayConds.push(eq(invoicePaymentsTable.branchId, branchScope.id));
      const prevDepConds: SQL[] = [lt(clientDepositsTable.createdAt, fromDate)];
      if (bankIdNum !== null) prevDepConds.push(eq(clientDepositsTable.bankId, bankIdNum));
      if (branchScope.id !== null) prevDepConds.push(eq(clientDepositsTable.branchId, branchScope.id));
      const prevOhConds: SQL[] = [lt(expensePaymentsTable.paidAt, fromDate)];
      if (bankIdNum !== null) prevOhConds.push(eq(expensePaymentsTable.bankId, bankIdNum));
      if (branchScope.id !== null) prevOhConds.push(eq(expensePaymentsTable.branchId, branchScope.id));
      const prevFundAddConds: SQL[] = [lt(bankFundAdditionsTable.createdAt, fromDate)];
      if (bankIdNum !== null) prevFundAddConds.push(eq(bankFundAdditionsTable.bankId, bankIdNum));
      if (branchScope.id !== null) prevFundAddConds.push(eq(bankFundAdditionsTable.branchId, branchScope.id));
      const prevCepConds: SQL[] = [lt(containerExpensePaymentsTable.paidAt, fromDate)];
      if (bankIdNum !== null) prevCepConds.push(eq(containerExpensePaymentsTable.bankId, bankIdNum));
      if (branchScope.id !== null) prevCepConds.push(eq(containerExpensePaymentsTable.branchId, branchScope.id));

      const promises: Promise<Array<{ s: string }>>[] = [
        db.select({ s: sql<string>`coalesce(sum(${invoicePaymentsTable.amount}), 0)` })
          .from(invoicePaymentsTable).where(and(...prevInvPayConds)),
        db.select({ s: sql<string>`coalesce(sum(${clientDepositsTable.amount}), 0)` })
          .from(clientDepositsTable).where(and(...prevDepConds)),
        db.select({ s: sql<string>`coalesce(sum(${expensePaymentsTable.amount}), 0)` })
          .from(expensePaymentsTable).where(and(...prevOhConds)),
        db.select({ s: sql<string>`coalesce(sum(${bankFundAdditionsTable.amount}), 0)` })
          .from(bankFundAdditionsTable).where(and(...prevFundAddConds)),
        db.select({ s: sql<string>`coalesce(sum(${containerExpensePaymentsTable.amount}), 0)` })
          .from(containerExpensePaymentsTable).where(and(...prevCepConds)),
      ];
      const [prevInvPay, prevDep, prevOh, prevFundAdd, prevCep] = await Promise.all(promises);
      openingBalance += parseFloat(prevInvPay[0]?.s ?? "0");
      openingBalance += parseFloat(prevDep[0]?.s ?? "0");
      openingBalance -= parseFloat(prevOh[0]?.s ?? "0");
      openingBalance += parseFloat(prevFundAdd[0]?.s ?? "0");
      openingBalance -= parseFloat(prevCep[0]?.s ?? "0");

      // Bank transfers (specific-bank view only)
      if (bankIdNum !== null) {
        const xferBranchCond = branchScope.id !== null ? [eq(bankTransfersTable.branchId, branchScope.id)] : [];
        const [prevXferIn, prevXferOut] = await Promise.all([
          db.select({ s: sql<string>`coalesce(sum(${bankTransfersTable.amount}), 0)` })
            .from(bankTransfersTable).where(and(eq(bankTransfersTable.toBankId, bankIdNum), lt(bankTransfersTable.createdAt, fromDate), ...xferBranchCond)),
          db.select({ s: sql<string>`coalesce(sum(${bankTransfersTable.amount}), 0)` })
            .from(bankTransfersTable).where(and(eq(bankTransfersTable.fromBankId, bankIdNum), lt(bankTransfersTable.createdAt, fromDate), ...xferBranchCond)),
        ]);
        openingBalance += parseFloat(prevXferIn[0]?.s ?? "0");
        openingBalance -= parseFloat(prevXferOut[0]?.s ?? "0");
      }
    }
    const closingBalance = openingBalance + totalIn - totalOut;

    // Per-bank breakdown
    const bankBreakdown: Record<string, { bankId: number | null; bankName: string; totalIn: number; totalOut: number }> = {};
    const bumpBank = (bankId: number | null, bankName: string | null, amount: number, dir: "in" | "out") => {
      const key = bankId === null ? "unassigned" : String(bankId);
      const label = bankName ?? "Unassigned";
      if (!bankBreakdown[key]) bankBreakdown[key] = { bankId, bankName: label, totalIn: 0, totalOut: 0 };
      if (dir === "in") bankBreakdown[key].totalIn += amount;
      else bankBreakdown[key].totalOut += amount;
    };
    inflows.forEach(t => bumpBank(t.bankId, t.bankName, t.amount, "in"));
    outflows.forEach(t => bumpBank(t.bankId, t.bankName, t.amount, "out"));

    // Per-category outflow breakdown
    const outflowByCategory: Record<string, number> = {};
    for (const t of outflows) {
      const cat = t.category ?? "Other";
      outflowByCategory[cat] = (outflowByCategory[cat] ?? 0) + t.amount;
    }

    // Per-type inflow breakdown
    const inflowByType: Record<string, number> = {
      invoice_payment: 0,
      client_deposit: 0,
      fund_addition: 0,
      bank_transfer: 0,
    };
    for (const t of inflows) inflowByType[t.type] = (inflowByType[t.type] ?? 0) + t.amount;

    return res.json({
      period: { from: from ?? null, to: to ?? null },
      branchScope,
      filters: { bankId: bankIdNum },
      inflows,
      outflows,
      totals: {
        openingBalance,
        totalIn,
        totalOut,
        netCashFlow: totalIn - totalOut,
        closingBalance,
      },
      breakdown: {
        byBank: Object.values(bankBreakdown),
        outflowByCategory,
        inflowByType,
      },
      banks: allBanks,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /reports/disbursement-reconciliation ────────────────────────────────

reportsRouter.get("/reports/disbursement-reconciliation", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { from, to, status } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);

    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
    }
    if (to) {
      toDate = new Date(to + "T23:59:59");
      if (isNaN(toDate.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });
    }

    const emptyResponse = {
      period: { from: from ?? null, to: to ?? null, status: status ?? null },
      rows: [] as ReturnType<typeof buildRow>[],
      aggregate: {
        sections: {
          shipping:   { budgeted: 0, disbursed: 0, variance: 0 },
          customs:    { budgeted: 0, disbursed: 0, variance: 0 },
          terminal:   { budgeted: 0, disbursed: 0, variance: 0 },
          delivery:   { budgeted: 0, disbursed: 0, variance: 0 },
          operations: { budgeted: 0, disbursed: 0, variance: 0 },
        },
        totals: { budgeted: 0, disbursed: 0, variance: 0 },
      },
    };

    // Fetch containers, filtered by status if provided
    const containerConds: SQL[] = [];
    if (status) containerConds.push(eq(containersTable.status, status));
    if (branchScope.id !== null) containerConds.push(eq(containersTable.branchId, branchScope.id));
    const allContainers = await db
      .select({
        id: containersTable.id,
        containerNumber: containersTable.containerNumber,
        customerName: containersTable.customerName,
        blNumber: containersTable.blNumber,
        status: containersTable.status,
        branchId: containersTable.branchId,
        branchName: branchesTable.name,
      })
      .from(containersTable)
      .leftJoin(branchesTable, eq(containersTable.branchId, branchesTable.id))
      .where(containerConds.length > 0 ? and(...containerConds) : undefined)
      .orderBy(containersTable.id);

    if (allContainers.length === 0) {
      return res.json({ ...emptyResponse, branchScope });
    }

    const allIds = allContainers.map(c => c.id);
    const SECTIONS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;

    // Payment conditions — filter by paidAt date if provided
    const payConds: SQL[] = [inArray(containerExpensePaymentsTable.containerId, allIds)];
    if (fromDate) payConds.push(gte(containerExpensePaymentsTable.paidAt, fromDate));
    if (toDate)   payConds.push(lte(containerExpensePaymentsTable.paidAt, toDate));

    // Fetch disbursements grouped by container + section
    const disbPayments = await db
      .select({
        containerId: containerExpensePaymentsTable.containerId,
        section: containerExpensePaymentsTable.section,
        total: sql<string>`sum(${containerExpensePaymentsTable.amount})`,
      })
      .from(containerExpensePaymentsTable)
      .where(and(...payConds))
      .groupBy(containerExpensePaymentsTable.containerId, containerExpensePaymentsTable.section);

    // Build disbursements map: containerId -> section -> amount (only for payments within the date range)
    const disbMap = new Map<number, Map<string, number>>();
    for (const r of disbPayments) {
      if (!disbMap.has(r.containerId)) disbMap.set(r.containerId, new Map());
      disbMap.get(r.containerId)!.set(r.section ?? "other", parseFloat(r.total ?? "0"));
    }

    // Always include ALL containers matching the status filter.
    // Date filters only affect which disbursements are counted — not which containers appear.
    // This ensures containers with budget but zero disbursements in the period still show up
    // with disbursed=0, correctly surfacing unexpended budget as variance.
    const [allS, allC, allT, allD, allO, allE] = await Promise.all([
      db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, allIds)),
      db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, allIds)),
      db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, allIds)),
      db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, allIds)),
      db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, allIds)),
      db.select({ containerId: containerExtraChargesTable.containerId, section: containerExtraChargesTable.section, amount: containerExtraChargesTable.amount })
        .from(containerExtraChargesTable).where(inArray(containerExtraChargesTable.containerId, allIds)),
    ]);

    const EXCLUDE_KEYS = new Set(["id", "containerId", "updatedAt"]);
    function sumRow(row: Record<string, unknown>): number {
      return Object.entries(row).reduce((s, [k, v]) => {
        if (EXCLUDE_KEYS.has(k)) return s;
        const n = parseFloat(String(v ?? "0"));
        return s + (isNaN(n) ? 0 : n);
      }, 0);
    }

    function buildRow(id: number, c: typeof allContainers[number] | undefined) {
      const extras = extraMap.get(id) ?? {};
      const budgeted: Record<string, number> = {
        shipping:   (sMap.get(id) ? sumRow(sMap.get(id) as Record<string, unknown>) : 0) + (extras.shipping   ?? 0),
        customs:    (cMap.get(id) ? sumRow(cMap.get(id) as Record<string, unknown>) : 0) + (extras.customs    ?? 0),
        terminal:   (tMap.get(id) ? sumRow(tMap.get(id) as Record<string, unknown>) : 0) + (extras.terminal   ?? 0),
        delivery:   (dMap.get(id) ? sumRow(dMap.get(id) as Record<string, unknown>) : 0) + (extras.delivery   ?? 0),
        operations: (oMap.get(id) ? sumRow(oMap.get(id) as Record<string, unknown>) : 0) + (extras.operations ?? 0),
      };
      const secDisb = disbMap.get(id) ?? new Map<string, number>();
      const disbursed: Record<string, number> = {
        shipping:   secDisb.get("shipping")   ?? 0,
        customs:    secDisb.get("customs")    ?? 0,
        terminal:   secDisb.get("terminal")   ?? 0,
        delivery:   secDisb.get("delivery")   ?? 0,
        operations: secDisb.get("operations") ?? 0,
      };
      const sections: Record<string, { budgeted: number; disbursed: number; variance: number }> = {};
      for (const sec of SECTIONS) {
        sections[sec] = { budgeted: budgeted[sec], disbursed: disbursed[sec], variance: disbursed[sec] - budgeted[sec] };
        aggBudgeted[sec]  += budgeted[sec];
        aggDisbursed[sec] += disbursed[sec];
      }
      const totalBudgeted = SECTIONS.reduce((s, sec) => s + budgeted[sec], 0);
      // Sum ALL entries in secDisb (including null-section → "other") so no payment is dropped
      const totalDisbursed = [...secDisb.values()].reduce((s, v) => s + v, 0);
      return {
        containerId: id,
        containerNumber: c?.containerNumber ?? "",
        customerName: c?.customerName ?? "",
        blNumber: c?.blNumber ?? null,
        status: c?.status ?? "",
        branchId: c?.branchId ?? null,
        branchName: c?.branchName ?? null,
        sections,
        totals: { budgeted: totalBudgeted, disbursed: totalDisbursed, variance: totalDisbursed - totalBudgeted },
      };
    }

    const sMap = new Map<number, ShippingCharges>(allS.map(r => [r.containerId, r]));
    const cMap = new Map<number, CustomsCharges>(allC.map(r => [r.containerId, r]));
    const tMap = new Map<number, TerminalCharges>(allT.map(r => [r.containerId, r]));
    const dMap = new Map<number, DeliveryCharges>(allD.map(r => [r.containerId, r]));
    const oMap = new Map<number, OperationsCharges>(allO.map(r => [r.containerId, r]));
    const extraMap = new Map<number, Record<string, number>>();
    for (const r of allE) {
      if (!extraMap.has(r.containerId)) extraMap.set(r.containerId, {});
      const sec = r.section ?? "other";
      extraMap.get(r.containerId)![sec] = (extraMap.get(r.containerId)![sec] ?? 0) + parseFloat(r.amount ?? "0");
    }

    const containerMap = new Map(allContainers.map(c => [c.id, c]));

    // Aggregate totals — mutated by buildRow
    const aggBudgeted: Record<string, number> = { shipping: 0, customs: 0, terminal: 0, delivery: 0, operations: 0 };
    const aggDisbursed: Record<string, number> = { shipping: 0, customs: 0, terminal: 0, delivery: 0, operations: 0 };

    const rows = allIds
      .map((id): ReturnType<typeof buildRow> => buildRow(id, containerMap.get(id)))
      .sort((a, b) => Math.abs(b.totals.variance) - Math.abs(a.totals.variance));

    const aggSections: Record<string, { budgeted: number; disbursed: number; variance: number }> = {};
    for (const sec of SECTIONS) {
      aggSections[sec] = { budgeted: aggBudgeted[sec], disbursed: aggDisbursed[sec], variance: aggDisbursed[sec] - aggBudgeted[sec] };
    }
    // Totals derived from rows to guarantee consistency: sum(rows.totals.X) === aggregate.totals.X
    // aggDisbursed only tracks 5 named sections; rows.totals.disbursed includes all sections (incl. null/"other")
    const aggTotalBudgeted  = rows.reduce((s, r) => s + r.totals.budgeted,  0);
    const aggTotalDisbursed = rows.reduce((s, r) => s + r.totals.disbursed, 0);

    return res.json({
      period: { from: from ?? null, to: to ?? null, status: status ?? null },
      branchScope,
      rows,
      aggregate: {
        sections: aggSections,
        totals: { budgeted: aggTotalBudgeted, disbursed: aggTotalDisbursed, variance: aggTotalDisbursed - aggTotalBudgeted },
      },
    });
  } catch (err) {
    console.error("GET /reports/disbursement-reconciliation error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/invoice-aging", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const branchScope = await resolveBranchScopeInfo(req);
    const branchNameMap = branchScope.id === null ? await loadBranchNameMap() : null;
    const now = new Date();

    const invoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        clientName: clientsTable.name,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        branchId: invoicesTable.branchId,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(branchScope.id !== null ? eq(invoicesTable.branchId, branchScope.id) : undefined)
      .orderBy(invoicesTable.dueDate);

    const invoiceIds = invoices.map(i => i.id);
    const payments = invoiceIds.length > 0
      ? await db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount }).from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
      : [];

    const paidMap = new Map<number, number>();
    for (const p of payments) {
      paidMap.set(p.invoiceId, (paidMap.get(p.invoiceId) ?? 0) + parseFloat(p.amount ?? "0"));
    }

    type AgingRow = { id: number; invoiceNumber: string; clientName: string; total: number; outstanding: number; dueDate: string | null; daysOverdue: number; createdAt: string; branchId: number; branchName: string | null };
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
        branchId: inv.branchId,
        branchName: branchNameMap ? (branchNameMap.get(inv.branchId) ?? null) : branchScope.name,
      };
      buckets[bucket].push(row);
      bucketTotals[bucket] += outstanding;
    }

    const grandTotal = Object.values(bucketTotals).reduce((s, v) => s + v, 0);

    return res.json({
      generatedAt: now.toISOString(),
      branchScope,
      buckets,
      totals: { ...bucketTotals, grandTotal },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

reportsRouter.get("/reports/fx-history", requireAuth, requireBranchMemberOrAbove, async (req: AuthRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    const branchScope = await resolveBranchScopeInfo(req);
    const branchNameMap = branchScope.id === null ? await loadBranchNameMap() : null;

    const sections: Array<{ table: typeof shippingChargesTable | typeof customsChargesTable | typeof terminalChargesTable | typeof deliveryChargesTable | typeof operationsChargesTable; name: string }> = [
      { table: shippingChargesTable, name: "shipping" },
      { table: customsChargesTable, name: "customs" },
      { table: terminalChargesTable, name: "terminal" },
      { table: deliveryChargesTable, name: "delivery" },
      { table: operationsChargesTable, name: "operations" },
    ];

    const allEntries: Array<{
      containerId: number;
      containerNumber: string;
      section: string;
      usdAmount: number;
      exchangeRate: number;
      ngnEquivalent: number;
      recordedAt: string;
      branchId: number;
      branchName: string | null;
    }> = [];

    await Promise.all(sections.map(async ({ table, name }) => {
      const fxConds: SQL[] = [isNotNull(table.usdAmount), isNotNull(table.exchangeRate)];
      if (branchScope.id !== null) fxConds.push(eq(containersTable.branchId, branchScope.id));
      const rows = await db
        .select({
          containerId: table.containerId,
          containerNumber: containersTable.containerNumber,
          usdAmount: table.usdAmount,
          exchangeRate: table.exchangeRate,
          updatedAt: table.updatedAt,
          branchId: containersTable.branchId,
        })
        .from(table)
        .innerJoin(containersTable, eq(table.containerId, containersTable.id))
        .where(and(...fxConds));

      for (const row of rows) {
        const usd = parseFloat(row.usdAmount!);
        const rate = parseFloat(row.exchangeRate!);
        if (isNaN(usd) || isNaN(rate) || usd <= 0 || rate <= 0) continue;
        allEntries.push({
          containerId: row.containerId,
          containerNumber: row.containerNumber,
          section: name,
          usdAmount: usd,
          exchangeRate: rate,
          ngnEquivalent: usd * rate,
          recordedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
          branchId: row.branchId,
          branchName: branchNameMap ? (branchNameMap.get(row.branchId) ?? null) : branchScope.name,
        });
      }
    }));

    let entries = allEntries;
    if (from) {
      const fromDate = new Date(from);
      entries = entries.filter(e => new Date(e.recordedAt) >= fromDate);
    }
    if (to) {
      const toDate = new Date(to + "T23:59:59");
      entries = entries.filter(e => new Date(e.recordedAt) <= toDate);
    }

    entries.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

    const totalUsd = entries.reduce((s, e) => s + e.usdAmount, 0);
    const totalNgn = entries.reduce((s, e) => s + e.ngnEquivalent, 0);

    return res.json({
      entries,
      period: { from: from ?? null, to: to ?? null },
      branchScope,
      totals: { totalUsd, totalNgn },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /reports/branch-comparison (super-admin only) ──────────────────────
// Cross-branch aggregate KPIs for the executive overview.
reportsRouter.get("/reports/branch-comparison", requireAuth, requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { from, to } = req.query as Record<string, string>;
    let fromDate: Date | null = null;
    let toDate: Date | null = null;
    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) return res.status(400).json({ error: "Invalid 'from' date" });
    }
    if (to) {
      toDate = new Date(to + "T23:59:59");
      if (isNaN(toDate.getTime())) return res.status(400).json({ error: "Invalid 'to' date" });
    }

    // Active branches only — inactive branches are not part of the comparison.
    const branches = await db
      .select({ id: branchesTable.id, name: branchesTable.name, isActive: branchesTable.isActive })
      .from(branchesTable)
      .where(eq(branchesTable.isActive, true));

    // Container counts + revenue + costs per branch
    const containerConds: SQL[] = [];
    if (fromDate) containerConds.push(gte(containersTable.createdAt, fromDate));
    if (toDate)   containerConds.push(lte(containersTable.createdAt, toDate));

    const containers = await db.select({
      id: containersTable.id,
      branchId: containersTable.branchId,
      clearingCharges: containersTable.clearingCharges,
      status: containersTable.status,
      createdAt: containersTable.createdAt,
      gateInDate: containersTable.gateInDate,
      deliveredAt: containersTable.deliveredAt,
    }).from(containersTable).where(containerConds.length > 0 ? and(...containerConds) : undefined);

    const containerIds = containers.map(c => c.id);

    // Costs = charges (shipping + customs + terminal + delivery + operations + extras)
    //         + expenses (container_expense_payments).
    // Charges are the contracted/budgeted cost categories per container; expenses are
    // additional disbursed costs tied to the container outside of the standard charge sets.
    const [sRows, cRows, tRows, dRows, oRows, exRows, cepRows] = containerIds.length > 0
      ? await Promise.all([
          db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, containerIds)),
          db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, containerIds)),
          db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, containerIds)),
          db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, containerIds)),
          db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, containerIds)),
          db.select({ containerId: containerExtraChargesTable.containerId, amount: containerExtraChargesTable.amount })
            .from(containerExtraChargesTable).where(inArray(containerExtraChargesTable.containerId, containerIds)),
          db.select({ containerId: containerExpensePaymentsTable.containerId, amount: containerExpensePaymentsTable.amount })
            .from(containerExpensePaymentsTable).where(inArray(containerExpensePaymentsTable.containerId, containerIds)),
        ])
      : [[], [], [], [], [], [], []] as const;

    const sMap: Record<number, ShippingCharges> = {};   for (const r of sRows) sMap[r.containerId] = r as ShippingCharges;
    const cMap: Record<number, CustomsCharges> = {};    for (const r of cRows) cMap[r.containerId] = r as CustomsCharges;
    const tMap: Record<number, TerminalCharges> = {};   for (const r of tRows) tMap[r.containerId] = r as TerminalCharges;
    const dMap: Record<number, DeliveryCharges> = {};   for (const r of dRows) dMap[r.containerId] = r as DeliveryCharges;
    const oMap: Record<number, OperationsCharges> = {}; for (const r of oRows) oMap[r.containerId] = r as OperationsCharges;

    const extrasByContainer = new Map<number, number>();
    for (const r of exRows) {
      extrasByContainer.set(r.containerId, (extrasByContainer.get(r.containerId) ?? 0) + parseFloat(r.amount as string ?? "0"));
    }
    const expensesByContainer = new Map<number, number>();
    for (const r of cepRows) {
      expensesByContainer.set(r.containerId, (expensesByContainer.get(r.containerId) ?? 0) + parseFloat(r.amount as string ?? "0"));
    }

    const costByContainer = new Map<number, number>();
    for (const c of containers) {
      const charges = calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
      const extras  = extrasByContainer.get(c.id) ?? 0;
      const expenses = expensesByContainer.get(c.id) ?? 0;
      costByContainer.set(c.id, charges + extras + expenses);
    }

    // Outstanding receivables per branch (sum of unpaid invoice balances).
    // Period-filtered to match container metrics: only invoices issued within range.
    const arInvoiceConds: SQL[] = [ne(invoicesTable.status, "draft"), ne(invoicesTable.status, "cancelled")];
    if (fromDate) arInvoiceConds.push(gte(invoicesTable.createdAt, fromDate));
    if (toDate)   arInvoiceConds.push(lte(invoicesTable.createdAt, toDate));
    const arInvoices = await db.select({
      id: invoicesTable.id,
      branchId: invoicesTable.branchId,
      total: invoicesTable.total,
    }).from(invoicesTable).where(and(...arInvoiceConds));

    const invoiceIds = arInvoices.map(i => i.id);
    const arPayments = invoiceIds.length > 0
      ? await db.select({ invoiceId: invoicePaymentsTable.invoiceId, amount: invoicePaymentsTable.amount })
          .from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
      : [];
    const paidByInvoice = new Map<number, number>();
    for (const p of arPayments) {
      paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + parseFloat(p.amount as string ?? "0"));
    }
    const outstandingByBranch = new Map<number, number>();
    for (const inv of arInvoices) {
      const paid = paidByInvoice.get(inv.id) ?? 0;
      const out = Math.max(0, parseFloat(inv.total ?? "0") - paid);
      if (out > 0) outstandingByBranch.set(inv.branchId, (outstandingByBranch.get(inv.branchId) ?? 0) + out);
    }

    // Build per-branch rows
    const rows = branches.map(b => {
      const branchContainers = containers.filter(c => c.branchId === b.id);
      const containerCount = branchContainers.length;
      const revenue = branchContainers.reduce((s, c) => s + parseFloat(c.clearingCharges ?? "0"), 0);
      const costs = branchContainers.reduce((s, c) => s + (costByContainer.get(c.id) ?? 0), 0);
      const grossProfit = revenue - costs;
      const marginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

      // Turnaround = gate-in → delivered (operational lifecycle), not created → closed.
      const delivered = branchContainers.filter(c => c.gateInDate !== null && c.deliveredAt !== null);
      const turnaroundDays = delivered.length > 0
        ? delivered.reduce((s, c) => {
            const gateIn = c.gateInDate as Date;
            const delivAt = c.deliveredAt as Date;
            return s + (delivAt.getTime() - gateIn.getTime()) / (1000 * 60 * 60 * 24);
          }, 0) / delivered.length
        : 0;

      return {
        branchId: b.id,
        branchName: b.name,
        isActive: b.isActive,
        containers: containerCount,
        revenue,
        costs,
        grossProfit,
        marginPct,
        avgTurnaroundDays: Math.round(turnaroundDays * 10) / 10,
        outstandingReceivables: outstandingByBranch.get(b.id) ?? 0,
      };
    });

    const totals = {
      containers: rows.reduce((s, r) => s + r.containers, 0),
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      costs: rows.reduce((s, r) => s + r.costs, 0),
      grossProfit: rows.reduce((s, r) => s + r.grossProfit, 0),
      outstandingReceivables: rows.reduce((s, r) => s + r.outstandingReceivables, 0),
    };

    return res.json({
      period: { from: from ?? null, to: to ?? null },
      rows,
      totals,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GET /reports/branch-comparison error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
