import { Router } from "express";
import { db, invoicesTable, invoiceItemsTable, invoicePaymentsTable, containersTable, clientsTable, whatsappMessagesTable, banksTable, clientDepositsTable, creditNotesTable, overheadExpensesTable, invoiceAuditLogTable } from "@workspace/db";
import { eq, desc, sql, inArray, and, gte, lte, isNull, isNotNull, ne } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest, getBranchScope, resolveCreateBranch, userCanAccessBranch } from "../lib/auth.js";
import { toE164Nigerian, sendViaTwilio, resolveBranchWhatsAppFrom } from "../lib/whatsapp.js";

const router = Router();

function pad(n: number, len = 3) {
  return String(n).padStart(len, "0");
}

async function generateInvoiceNumber(): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${yyyy}${mm}-`;

  const rows = await db
    .select({ invoiceNumber: invoicesTable.invoiceNumber })
    .from(invoicesTable)
    .where(sql`${invoicesTable.invoiceNumber} LIKE ${prefix + "%"}`)
    .orderBy(desc(invoicesTable.invoiceNumber))
    .limit(1);

  if (rows.length === 0) return `${prefix}001`;
  const last = rows[0].invoiceNumber;
  const seq = parseInt(last.replace(prefix, ""), 10) || 0;
  return `${prefix}${pad(seq + 1)}`;
}

async function fetchItemsForInvoices(invoiceIds: number[]) {
  if (invoiceIds.length === 0) return new Map<number, any[]>();
  const allItems = await db
    .select({
      id: invoiceItemsTable.id,
      invoiceId: invoiceItemsTable.invoiceId,
      containerId: invoiceItemsTable.containerId,
      description: invoiceItemsTable.description,
      amount: invoiceItemsTable.amount,
      sortOrder: invoiceItemsTable.sortOrder,
      containerNumber: containersTable.containerNumber,
      blNumber: containersTable.blNumber,
    })
    .from(invoiceItemsTable)
    .leftJoin(containersTable, eq(invoiceItemsTable.containerId, containersTable.id))
    .where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
    .orderBy(invoiceItemsTable.sortOrder);

  const map = new Map<number, any[]>();
  for (const item of allItems) {
    if (!map.has(item.invoiceId)) map.set(item.invoiceId, []);
    map.get(item.invoiceId)!.push({
      id: item.id,
      invoiceId: item.invoiceId,
      containerId: item.containerId,
      description: item.description,
      amount: parseFloat(item.amount ?? "0"),
      sortOrder: item.sortOrder,
      containerNumber: item.containerNumber ?? null,
      blNumber: item.blNumber ?? null,
    });
  }
  return map;
}

async function fetchPaymentsWithBank(invoiceId: number) {
  return db
    .select({
      id: invoicePaymentsTable.id,
      invoiceId: invoicePaymentsTable.invoiceId,
      amount: invoicePaymentsTable.amount,
      paidAt: invoicePaymentsTable.paidAt,
      paymentMethod: invoicePaymentsTable.paymentMethod,
      reference: invoicePaymentsTable.reference,
      notes: invoicePaymentsTable.notes,
      bankId: invoicePaymentsTable.bankId,
      bankName: banksTable.name,
      createdAt: invoicePaymentsTable.createdAt,
    })
    .from(invoicePaymentsTable)
    .leftJoin(banksTable, eq(invoicePaymentsTable.bankId, banksTable.id))
    .where(eq(invoicePaymentsTable.invoiceId, invoiceId))
    .orderBy(invoicePaymentsTable.paidAt);
}

async function generateCreditNoteNumber(): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `CN-${yyyy}${mm}-`;
  const rows = await db
    .select({ creditNoteNumber: creditNotesTable.creditNoteNumber })
    .from(creditNotesTable)
    .where(sql`${creditNotesTable.creditNoteNumber} LIKE ${prefix + "%"}`)
    .orderBy(desc(creditNotesTable.creditNoteNumber))
    .limit(1);
  if (rows.length === 0) return `${prefix}001`;
  const last = rows[0].creditNoteNumber;
  const seq = parseInt(last.replace(prefix, ""), 10) || 0;
  return `${prefix}${pad(seq + 1)}`;
}

async function formatInvoice(inv: any, payments: any[], items?: any[], creditNotes?: any[]) {
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const total = parseFloat(inv.total ?? "0");
  const outstanding = Math.max(0, total - totalPaid);

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    containerId: inv.containerId ?? null,
    containerNumber: inv.containerNumber ?? null,
    blNumber: inv.blNumber ?? null,
    clientId: inv.clientId ?? null,
    clientName: inv.clientName ?? null,
    clientPhone: inv.clientPhone ?? null,
    subtotal: parseFloat(inv.subtotal ?? "0"),
    vatAmount: parseFloat(inv.vatAmount ?? "0"),
    total,
    totalPaid,
    outstanding,
    dueDate: inv.dueDate ?? null,
    notes: inv.notes ?? "",
    createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
    updatedAt: inv.updatedAt instanceof Date ? inv.updatedAt.toISOString() : inv.updatedAt,
    items: (items ?? []).map(it => ({
      id: it.id,
      invoiceId: it.invoiceId,
      containerId: it.containerId,
      description: it.description,
      amount: typeof it.amount === "string" ? parseFloat(it.amount) : it.amount,
      sortOrder: it.sortOrder,
      containerNumber: it.containerNumber ?? null,
      blNumber: it.blNumber ?? null,
    })),
    payments: payments.map(p => ({
      id: p.id,
      invoiceId: p.invoiceId,
      amount: parseFloat(p.amount),
      paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt,
      paymentMethod: p.paymentMethod,
      reference: p.reference,
      notes: p.notes,
      bankId: p.bankId ?? null,
      bankName: p.bankName ?? null,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    })),
    creditNotes: (creditNotes ?? []).map(cn => ({
      id: cn.id,
      invoiceId: cn.invoiceId,
      creditNoteNumber: cn.creditNoteNumber,
      reason: cn.reason,
      amount: parseFloat(cn.amount ?? "0"),
      createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
    })),
  };
}

router.get("/invoices", requireAuth, async (req: AuthRequest, res) => {
  try {
    const branchScope = getBranchScope(req);
    const baseQuery = db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        updatedAt: invoicesTable.updatedAt,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .$dynamic();
    const rows = await (branchScope !== null
      ? baseQuery.where(eq(invoicesTable.branchId, branchScope))
      : baseQuery).orderBy(desc(invoicesTable.createdAt));

    const allPayments = await db.select().from(invoicePaymentsTable);
    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    const invoiceIds = rows.map(r => r.id);
    const itemsByInvoice = await fetchItemsForInvoices(invoiceIds);

    const allCreditNotes = invoiceIds.length > 0
      ? await db.select().from(creditNotesTable).where(inArray(creditNotesTable.invoiceId, invoiceIds))
      : [];
    const cnByInvoice = new Map<number, typeof allCreditNotes>();
    for (const cn of allCreditNotes) {
      if (!cnByInvoice.has(cn.invoiceId)) cnByInvoice.set(cn.invoiceId, []);
      cnByInvoice.get(cn.invoiceId)!.push(cn);
    }

    const invoices = await Promise.all(
      rows.map(r => formatInvoice(r, paymentsByInvoice.get(r.id) ?? [], itemsByInvoice.get(r.id) ?? [], cnByInvoice.get(r.id) ?? []))
    );

    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.post("/invoices", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { containerIds, vatRate, dueDate, notes } = req.body as {
      containerIds: number[];
      vatRate?: number;
      dueDate?: string;
      notes?: string;
    };

    if (!containerIds || !Array.isArray(containerIds) || containerIds.length === 0) {
      return res.status(400).json({ error: "containerIds array is required and must not be empty" });
    }

    const containers = await db
      .select()
      .from(containersTable)
      .where(inArray(containersTable.id, containerIds));

    if (containers.length !== containerIds.length) {
      return res.status(404).json({ error: "One or more containers not found" });
    }

    const clientIds = [...new Set(containers.map(c => c.clientId))];
    if (clientIds.length > 1) {
      return res.status(400).json({ error: "All containers must belong to the same client" });
    }

    const clientId = containers[0].clientId ?? null;

    // If client has an agreed clearing rate, use it per container instead of the container's own rate
    let agreedRate: number | null = null;
    if (clientId) {
      const [cl] = await db.select({ agreedClearingRate: clientsTable.agreedClearingRate }).from(clientsTable).where(eq(clientsTable.id, clientId));
      if (cl?.agreedClearingRate != null) {
        agreedRate = parseFloat(cl.agreedClearingRate);
      }
    }

    const itemAmountFor = (c: typeof containers[number]) =>
      agreedRate != null ? agreedRate : parseFloat(c.clearingCharges ?? "0");

    const subtotal = containers.reduce((s, c) => s + itemAmountFor(c), 0);
    const vat = vatRate ? subtotal * (vatRate / 100) : 0;
    const total = subtotal + vat;

    const invoiceNumber = await generateInvoiceNumber();

    const singleContainerId = containers.length === 1 ? containers[0].id : null;
    const containerMap = Object.fromEntries(containers.map(c => [c.id, c]));

    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;

    // Cross-branch link guard: containers must belong to the active branch.
    const wrongBranch = containers.find(c => c.branchId !== createBranchId);
    if (wrongBranch) {
      return res.status(400).json({ error: "All containers must belong to the active branch." });
    }

    const { inv, items } = await db.transaction(async (tx) => {
      const [inv] = await tx.insert(invoicesTable).values({
        containerId: singleContainerId,
        clientId,
        invoiceNumber,
        status: "draft",
        subtotal: String(subtotal),
        vatAmount: String(vat),
        total: String(total),
        dueDate: dueDate ?? null,
        notes: notes ?? "",
        branchId: createBranchId,
      }).returning();

      const itemRows = containers.map((c, idx) => ({
        invoiceId: inv.id,
        containerId: c.id,
        description: "Clearing Charges",
        amount: String(itemAmountFor(c)),
        sortOrder: idx,
        branchId: inv.branchId,
      }));
      const insertedItems = await tx.insert(invoiceItemsTable).values(itemRows).returning();

      const items = insertedItems.map(item => ({
        id: item.id,
        invoiceId: item.invoiceId,
        containerId: item.containerId,
        description: item.description,
        amount: parseFloat(String(item.amount)),
        sortOrder: item.sortOrder,
        containerNumber: containerMap[item.containerId!]?.containerNumber ?? null,
        blNumber: containerMap[item.containerId!]?.blNumber ?? null,
      }));

      return { inv, items };
    });

    let clientName: string | null = null;
    let clientPhone: string | null = null;
    if (clientId) {
      const [cl] = await db.select({ name: clientsTable.name, phone: clientsTable.contactPhone }).from(clientsTable).where(eq(clientsTable.id, clientId));
      clientName = cl?.name ?? null;
      clientPhone = cl?.phone ?? null;
    }

    const formatted = await formatInvoice({
      ...inv,
      containerNumber: containers.length === 1 ? containers[0].containerNumber : null,
      blNumber: containers.length === 1 ? containers[0].blNumber : null,
      clientName,
      clientPhone,
    }, [], items);

    res.status(201).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.get("/invoices/accounts-receivable", requireAuth, async (req: AuthRequest, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to + "T23:59:59") : null;

    const branchScope = getBranchScope(req);
    const conditions: any[] = [ne(invoicesTable.status, "written_off")];
    if (branchScope !== null) conditions.push(eq(invoicesTable.branchId, branchScope));
    if (fromDate) conditions.push(gte(invoicesTable.createdAt, fromDate));
    if (toDate) conditions.push(lte(invoicesTable.createdAt, toDate));

    const rows = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(and(...conditions))
      .orderBy(desc(invoicesTable.createdAt));

    const invoiceIds = rows.map(r => r.id);
    const allPayments = invoiceIds.length > 0
      ? await db.select({
          id: invoicePaymentsTable.id,
          invoiceId: invoicePaymentsTable.invoiceId,
          amount: invoicePaymentsTable.amount,
          paidAt: invoicePaymentsTable.paidAt,
        }).from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
      : [];

    // Branch-scoped this-month collections (Task #74).
    const monthPaymentConds: any[] = [gte(invoicePaymentsTable.paidAt, monthStart)];
    if (branchScope !== null) monthPaymentConds.push(eq(invoicePaymentsTable.branchId, branchScope));
    const allPaymentsForMonth = await db.select({
      amount: invoicePaymentsTable.amount,
      paidAt: invoicePaymentsTable.paidAt,
    }).from(invoicePaymentsTable)
      .where(monthPaymentConds.length === 1 ? monthPaymentConds[0] : and(...monthPaymentConds));
    const collectedThisMonth = allPaymentsForMonth.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);

    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    type AgingBuckets = { current: number; days1to30: number; days31to60: number; days61to90: number; days90plus: number };
    type UnpaidInvoice = { id: number; invoiceNumber: string; status: string; total: number; totalPaid: number; outstanding: number; dueDate: string | null; createdAt: string };
    type ClientRow = {
      clientId: number | null;
      clientName: string;
      invoiceCount: number;
      totalInvoiced: number;
      totalCollected: number;
      outstanding: number;
      aging: AgingBuckets;
      unpaidInvoices: UnpaidInvoice[];
    };

    const clientMap = new Map<string, ClientRow>();
    const summaryAging: AgingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
    let summaryInvoiced = 0;
    let summaryCollected = 0;
    let openInvoiceCount = 0;

    function agingKey(dueDate: string | null, outstanding: number): keyof AgingBuckets | null {
      if (outstanding <= 0) return null;
      if (!dueDate) return "current";
      const due = new Date(dueDate);
      const overdueDays = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      if (overdueDays <= 0) return "current";
      if (overdueDays <= 30) return "days1to30";
      if (overdueDays <= 60) return "days31to60";
      if (overdueDays <= 90) return "days61to90";
      return "days90plus";
    }

    for (const inv of rows) {
      const payments = paymentsByInvoice.get(inv.id) ?? [];
      const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
      const total = parseFloat(inv.total ?? "0");
      const outstanding = Math.max(0, total - totalPaid);

      const key = String(inv.clientId ?? "unknown");
      const label = inv.clientName ?? "Unknown Client";
      if (!clientMap.has(key)) {
        clientMap.set(key, {
          clientId: inv.clientId ?? null,
          clientName: label,
          invoiceCount: 0,
          totalInvoiced: 0,
          totalCollected: 0,
          outstanding: 0,
          aging: { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 },
          unpaidInvoices: [],
        });
      }
      const row = clientMap.get(key)!;
      row.invoiceCount += 1;
      row.totalInvoiced += total;
      row.totalCollected += totalPaid;
      row.outstanding += outstanding;
      summaryInvoiced += total;
      summaryCollected += totalPaid;

      const dueDateStr = inv.dueDate ?? null;
      const bucket = agingKey(dueDateStr, outstanding);
      if (bucket) {
        row.aging[bucket] += outstanding;
        summaryAging[bucket] += outstanding;
      }

      if (outstanding > 0) {
        openInvoiceCount += 1;
        row.unpaidInvoices.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          total,
          totalPaid,
          outstanding,
          dueDate: dueDateStr,
          createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : String(inv.createdAt),
        });
      }
    }

    // Fetch unallocated deposits per client (branch-scoped — Task #74)
    const depositsBase = db.select({
      clientId: clientDepositsTable.clientId,
      amount: clientDepositsTable.amount,
      allocatedAmount: clientDepositsTable.allocatedAmount,
    }).from(clientDepositsTable).$dynamic();
    const allDeposits = await (branchScope !== null
      ? depositsBase.where(eq(clientDepositsTable.branchId, branchScope))
      : depositsBase);

    const unallocatedByClient = new Map<number, number>();
    for (const d of allDeposits) {
      if (!d.clientId) continue;
      const remaining = Math.max(0, parseFloat(d.amount ?? "0") - parseFloat(d.allocatedAmount ?? "0"));
      if (remaining > 0) {
        unallocatedByClient.set(d.clientId, (unallocatedByClient.get(d.clientId) ?? 0) + remaining);
      }
    }

    // Fetch credit balances per client (branch-scoped — Task #74)
    const clientsBase = db.select({ id: clientsTable.id, creditBalance: clientsTable.creditBalance })
      .from(clientsTable).$dynamic();
    const allClientRows = await (branchScope !== null
      ? clientsBase.where(eq(clientsTable.branchId, branchScope))
      : clientsBase);
    const creditBalanceMap = new Map<number, number>();
    for (const c of allClientRows) {
      creditBalanceMap.set(c.id, parseFloat(c.creditBalance ?? "0"));
    }

    const clients = [...clientMap.values()].map(c => {
      const unallocatedDeposits = c.clientId != null ? (unallocatedByClient.get(c.clientId) ?? 0) : 0;
      const creditBalance = c.clientId != null ? (creditBalanceMap.get(c.clientId) ?? 0) : 0;
      const effectiveOutstanding = Math.max(0, c.outstanding - unallocatedDeposits - creditBalance);
      return { ...c, unallocatedDeposits, creditBalance, effectiveOutstanding };
    }).sort((a, b) => b.outstanding - a.outstanding);
    const totalOutstanding = clients.reduce((s, c) => s + c.outstanding, 0);
    const totalOverdue = summaryAging.days31to60 + summaryAging.days61to90 + summaryAging.days90plus;
    const totalUnallocatedDeposits = clients.reduce((s, c) => s + c.unallocatedDeposits, 0);
    const totalCreditBalance = clients.reduce((s, c) => s + c.creditBalance, 0);

    // Fetch written-off total for informational display (branch-scoped — Task #74)
    const writtenOffConds: any[] = [eq(invoicesTable.status, "written_off")];
    if (branchScope !== null) writtenOffConds.push(eq(invoicesTable.branchId, branchScope));
    const writtenOffRows = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        total: invoicesTable.total,
        writtenOffAmount: invoicesTable.writtenOffAmount,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(writtenOffConds.length === 1 ? writtenOffConds[0] : and(...writtenOffConds))
      .orderBy(desc(invoicesTable.createdAt));
    // Use the stored writtenOffAmount (outstanding at write-off time); fall back to total for legacy rows
    const totalWrittenOff = writtenOffRows.reduce((s, r) =>
      s + parseFloat(r.writtenOffAmount ?? r.total ?? "0"), 0);

    res.json({
      summary: {
        totalInvoiced: summaryInvoiced,
        totalCollected: summaryCollected,
        totalOutstanding,
        collectedThisMonth,
        openInvoiceCount,
        totalOverdue,
        totalUnallocatedDeposits,
        totalCreditBalance,
        totalWrittenOff,
        writtenOffCount: writtenOffRows.length,
      },
      aging: summaryAging,
      clients,
      writtenOffInvoices: writtenOffRows.map(r => ({
        id: r.id,
        invoiceNumber: r.invoiceNumber,
        clientId: r.clientId ?? null,
        clientName: r.clientName ?? null,
        total: parseFloat(r.total ?? "0"),
        writtenOffAmount: parseFloat(r.writtenOffAmount ?? r.total ?? "0"),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch accounts receivable" });
  }
});

router.get("/invoices/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [row] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        updatedAt: invoicesTable.updatedAt,
        branchId: invoicesTable.branchId,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, id));

    if (!row) return res.status(404).json({ error: "Invoice not found" });
    const branchScope = getBranchScope(req);
    if (branchScope !== null && row.branchId !== branchScope) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const payments = await fetchPaymentsWithBank(id);
    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];
    const creditNoteRows = await db.select().from(creditNotesTable).where(eq(creditNotesTable.invoiceId, id)).orderBy(creditNotesTable.createdAt);

    res.json(await formatInvoice(row, payments, items, creditNoteRows));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

router.patch("/invoices/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    const { status, dueDate, notes, subtotal, vatAmount, total } = req.body as {
      status?: string;
      dueDate?: string | null;
      notes?: string;
      subtotal?: number;
      vatAmount?: number;
      total?: number;
    };

    // written_off is a controlled transition that must go through POST /invoices/:id/write-off
    // (which enforces overdue check, creates overhead expense, and writes audit log).
    // Allowing arbitrary status mutations would bypass all those invariants.
    if (status === "written_off") {
      return res.status(400).json({ error: "Use POST /invoices/:id/write-off to write off an invoice" });
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (status !== undefined) updates.status = status;
    if (dueDate !== undefined) updates.dueDate = dueDate;
    if (notes !== undefined) updates.notes = notes;
    if (subtotal !== undefined) updates.subtotal = String(subtotal);
    if (vatAmount !== undefined) updates.vatAmount = String(vatAmount);
    if (total !== undefined) updates.total = String(total);

    const [updated] = await db.update(invoicesTable).set(updates).where(eq(invoicesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ error: "Invoice not found" });

    const [row] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        updatedAt: invoicesTable.updatedAt,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, id));

    const payments = await fetchPaymentsWithBank(id);

    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];

    res.json(await formatInvoice(row, payments, items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

router.delete("/invoices/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    await db.delete(invoicesTable).where(eq(invoicesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

async function recalcInvoiceTotals(tx: typeof db, invoiceId: number) {
  const currentInv = await tx.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!currentInv[0]) return;
  const items = await tx.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
  const subtotal = items.reduce((s, it) => s + parseFloat(String(it.amount)), 0);
  const prevSubtotal = parseFloat(String(currentInv[0].subtotal));
  const prevVat = parseFloat(String(currentInv[0].vatAmount));
  const vatRate = prevSubtotal > 0 ? prevVat / prevSubtotal : 0;
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;
  await tx.update(invoicesTable)
    .set({ subtotal: String(subtotal), vatAmount: String(vatAmount), total: String(total), updatedAt: new Date() })
    .where(eq(invoicesTable.id, invoiceId));
}

router.post("/invoices/:id/items", requireAuth, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });

    const { containerId, description, amount } = req.body as {
      containerId?: number;
      description?: string;
      amount?: number;
    };

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv || !userCanAccessBranch(req, inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    let resolvedAmount = amount;
    let resolvedDescription = description ?? "Clearing Charges";
    if (containerId) {
      const [container] = await db.select().from(containersTable).where(eq(containersTable.id, containerId));
      if (!container || !userCanAccessBranch(req, container.branchId)) return res.status(404).json({ error: "Container not found" });
      if (container.branchId !== inv.branchId) return res.status(400).json({ error: "Container and invoice must belong to the same branch" });
      if (resolvedAmount === undefined) {
        // Prefer client's agreed clearing rate over container's own rate.
        // Use container's linked clientId first; fall back to invoice's clientId.
        let agreedRate: number | null = null;
        const clientId = container.clientId ?? inv.clientId;
        if (clientId) {
          const [cl] = await db.select({ agreedClearingRate: clientsTable.agreedClearingRate }).from(clientsTable).where(eq(clientsTable.id, clientId));
          if (cl?.agreedClearingRate != null) agreedRate = parseFloat(cl.agreedClearingRate);
        }
        resolvedAmount = agreedRate != null ? agreedRate : parseFloat(container.clearingCharges ?? "0");
      }
    }
    if (resolvedAmount === undefined || isNaN(resolvedAmount)) resolvedAmount = 0;

    const existingItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    const maxSort = existingItems.reduce((m, it) => Math.max(m, it.sortOrder), -1);

    await db.transaction(async (tx) => {
      const [parentInv] = await tx.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
      await tx.insert(invoiceItemsTable).values({
        invoiceId,
        containerId: containerId ?? null,
        description: resolvedDescription,
        amount: String(resolvedAmount),
        sortOrder: maxSort + 1,
        branchId: parentInv!.branchId,
      });
      await recalcInvoiceTotals(tx, invoiceId);
    });

    const itemsMap = await fetchItemsForInvoices([invoiceId]);
    const items = itemsMap.get(invoiceId) ?? [];
    const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const [updatedRow] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        updatedAt: invoicesTable.updatedAt,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, invoiceId));
    res.status(201).json(await formatInvoice(updatedRow, payments, items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add invoice item" });
  }
});

router.patch("/invoices/:id/items/:itemId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(invoiceId) || isNaN(itemId)) return res.status(400).json({ error: "Invalid id" });

    const { description, amount } = req.body as { description?: string; amount?: number };

    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    const [item] = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.id, itemId));
    if (!item || item.invoiceId !== invoiceId) return res.status(404).json({ error: "Item not found" });

    const updates: Record<string, any> = {};
    if (description !== undefined) updates.description = description;
    if (amount !== undefined) updates.amount = String(amount);

    await db.transaction(async (tx) => {
      if (Object.keys(updates).length > 0) {
        await tx.update(invoiceItemsTable).set(updates).where(eq(invoiceItemsTable.id, itemId));
      }
      await recalcInvoiceTotals(tx, invoiceId);
    });

    const itemsMap = await fetchItemsForInvoices([invoiceId]);
    const items = itemsMap.get(invoiceId) ?? [];
    const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const [updatedRow] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        updatedAt: invoicesTable.updatedAt,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, invoiceId));
    res.json(await formatInvoice(updatedRow, payments, items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice item" });
  }
});

router.delete("/invoices/:id/items/:itemId", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(invoiceId) || isNaN(itemId)) return res.status(400).json({ error: "Invalid id" });

    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    const existingItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    if (existingItems.length <= 1) {
      return res.status(400).json({ error: "Cannot remove the last line item from an invoice. Delete the invoice instead." });
    }
    const item = existingItems.find(it => it.id === itemId);
    if (!item) return res.status(404).json({ error: "Item not found on this invoice" });

    await db.transaction(async (tx) => {
      await tx.delete(invoiceItemsTable).where(eq(invoiceItemsTable.id, itemId));
      await recalcInvoiceTotals(tx, invoiceId);
    });

    const itemsMap = await fetchItemsForInvoices([invoiceId]);
    const items = itemsMap.get(invoiceId) ?? [];
    const payments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const [updatedRow] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        notes: invoicesTable.notes,
        createdAt: invoicesTable.createdAt,
        updatedAt: invoicesTable.updatedAt,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, invoiceId));
    res.json(await formatInvoice(updatedRow, payments, items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove invoice item" });
  }
});

router.post("/invoices/:id/payments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });

    const { amount, paymentMethod, reference, notes, paidAt, bankId } = req.body as {
      amount: number;
      paymentMethod?: string;
      reference?: string;
      notes?: string;
      paidAt?: string;
      bankId?: number | null;
    };

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv || !userCanAccessBranch(req, inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    {
      const _scope = getBranchScope(req);
      if (_scope !== null && inv.branchId !== _scope) return res.status(404).json({ error: "Invoice not found" });
      if (_scope === null && req.user?.role === "super_admin") {
        return res.status(400).json({ error: "Select a specific branch to record a payment." });
      }
    }
    // Bank guard: the chosen bank must also belong to the invoice's branch.
    if (bankId) {
      const [bk] = await db.select({ branchId: banksTable.branchId }).from(banksTable).where(eq(banksTable.id, bankId));
      if (bk && bk.branchId !== inv.branchId) {
        return res.status(400).json({ error: "Selected bank belongs to a different branch than the invoice." });
      }
    }

    // Capture pre-insert total so we can compute incremental overpayment
    const preInsertPayments = await db.select({ amount: invoicePaymentsTable.amount })
      .from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const prevTotalPaid = preInsertPayments.reduce((s, p) => s + parseFloat(p.amount), 0);

    await db.insert(invoicePaymentsTable).values({
      invoiceId,
      amount: String(amount),
      paymentMethod: paymentMethod ?? "transfer",
      reference: reference ?? "",
      notes: notes ?? "",
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      bankId: bankId ?? null,
      branchId: inv.branchId,
    });

    const totalPaid = prevTotalPaid + amount;

    const total = parseFloat(inv.total);
    let newStatus = inv.status;
    if (totalPaid >= total) {
      newStatus = "paid";
    } else if (totalPaid > 0) {
      newStatus = "partial";
    }

    await db.update(invoicesTable)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(invoicesTable.id, invoiceId));

    // Capture only the incremental overpayment delta as credit balance
    let overpaymentStored = 0;
    if (inv.clientId) {
      const prevOverpaid = Math.max(0, prevTotalPaid - total);
      const nowOverpaid = Math.max(0, totalPaid - total);
      const creditIncrement = nowOverpaid - prevOverpaid;
      if (creditIncrement > 0) {
        await db.update(clientsTable)
          .set({ creditBalance: sql`${clientsTable.creditBalance}::numeric + ${String(creditIncrement)}` })
          .where(eq(clientsTable.id, inv.clientId));
        overpaymentStored = creditIncrement;
      }
    }

    res.status(201).json({ success: true, totalPaid, status: newStatus, overpaymentStored });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

// ─── Apply Client Credit to Invoice ─────────────────────────────────────────

router.post("/invoices/:id/apply-credit", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });

    const { amount: rawAmount } = req.body as { amount?: number };
    const applyAmount = parseFloat(String(rawAmount ?? 0));
    if (isNaN(applyAmount) || applyAmount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv || !userCanAccessBranch(req, inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    if (!inv.clientId) return res.status(400).json({ error: "Invoice has no linked client" });

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, inv.clientId));
    if (!client || !userCanAccessBranch(req, client.branchId)) return res.status(404).json({ error: "Client not found" });
    if (client.branchId !== inv.branchId) return res.status(400).json({ error: "Invoice and client must belong to the same branch" });

    const creditBalance = parseFloat(client.creditBalance ?? "0");
    if (creditBalance <= 0) return res.status(400).json({ error: "Client has no credit balance" });

    const applyActual = Math.min(applyAmount, creditBalance);

    const existingPayments = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const totalPaid = existingPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const invoiceTotal = parseFloat(inv.total ?? "0");
    const outstanding = Math.max(0, invoiceTotal - totalPaid);
    if (outstanding <= 0) return res.status(400).json({ error: "Invoice is already fully paid" });

    const actualApply = Math.min(applyActual, outstanding);

    await db.transaction(async (tx) => {
      await tx.insert(invoicePaymentsTable).values({
        invoiceId,
        amount: String(actualApply),
        paymentMethod: "credit",
        reference: "",
        notes: `Applied from client credit balance`,
        paidAt: new Date(),
        bankId: null,
        branchId: inv.branchId,
      });

      await tx.update(clientsTable)
        .set({ creditBalance: sql`GREATEST(0, ${clientsTable.creditBalance}::numeric - ${String(actualApply)})` })
        .where(eq(clientsTable.id, inv.clientId!));

      const newTotalPaid = totalPaid + actualApply;
      let newStatus = inv.status;
      if (newTotalPaid >= invoiceTotal) newStatus = "paid";
      else if (newTotalPaid > 0) newStatus = "partial";
      await tx.update(invoicesTable)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId));
    });

    const [updatedClient] = await db.select({ creditBalance: clientsTable.creditBalance })
      .from(clientsTable).where(eq(clientsTable.id, inv.clientId));

    res.status(201).json({
      success: true,
      appliedAmount: actualApply,
      remainingCredit: parseFloat(updatedClient?.creditBalance ?? "0"),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to apply credit" });
  }
});

router.delete("/invoices/:id/payments/:paymentId", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (isNaN(invoiceId) || isNaN(paymentId)) return res.status(400).json({ error: "Invalid id" });

    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    const [payment] = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.id, paymentId));
    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.invoiceId !== invoiceId) return res.status(400).json({ error: "Payment does not belong to this invoice" });

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    const paymentAmount = parseFloat(payment.amount ?? "0");

    await db.transaction(async (tx) => {
      await tx.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.id, paymentId));

      // Reverse credit balance if this was a credit-method payment
      if (payment.paymentMethod === "credit" && inv?.clientId) {
        await tx.update(clientsTable)
          .set({ creditBalance: sql`GREATEST(0, ${clientsTable.creditBalance}::numeric + ${String(paymentAmount)})` })
          .where(eq(clientsTable.id, inv.clientId));
      }

      // Reverse deposit allocation if this payment originated from a deposit
      const depositMatch = payment.notes?.match(/Applied from deposit #(\d+)/);
      if (depositMatch) {
        const sourceDepositId = parseInt(depositMatch[1]);
        await tx.update(clientDepositsTable)
          .set({ allocatedAmount: sql`GREATEST(0, ${clientDepositsTable.allocatedAmount}::numeric - ${String(paymentAmount)})` })
          .where(eq(clientDepositsTable.id, sourceDepositId));
      }

      // Reverse overpayment credit that was stored when this payment was recorded
      if (inv?.clientId && payment.paymentMethod !== "credit") {
        const remainingPayments = await tx.select().from(invoicePaymentsTable)
          .where(eq(invoicePaymentsTable.invoiceId, invoiceId));
        const prevTotalPaid = remainingPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
        const invoiceTotal = parseFloat(inv.total ?? "0");
        const prevOverpaidBeforeDelete = Math.max(0, prevTotalPaid + paymentAmount - invoiceTotal);
        const nowOverpaid = Math.max(0, prevTotalPaid - invoiceTotal);
        const creditToReverse = prevOverpaidBeforeDelete - nowOverpaid;
        if (creditToReverse > 0) {
          await tx.update(clientsTable)
            .set({ creditBalance: sql`GREATEST(0, ${clientsTable.creditBalance}::numeric - ${String(creditToReverse)})` })
            .where(eq(clientsTable.id, inv.clientId));
        }
      }

      if (inv) {
        const payments = await tx.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
        const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
        const total = parseFloat(inv.total);
        let newStatus = "sent";
        if (totalPaid >= total) newStatus = "paid";
        else if (totalPaid > 0) newStatus = "partial";
        else if (inv.status === "paid" || inv.status === "partial") newStatus = "sent";
        else newStatus = inv.status;
        await tx.update(invoicesTable).set({ status: newStatus, updatedAt: new Date() }).where(eq(invoicesTable.id, invoiceId));
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete payment" });
  }
});

function containerListLine(items: { containerNumber: string | null }[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0].containerNumber ? `📦 Container: *${items[0].containerNumber}*` : "";
  const nums = items.map(it => it.containerNumber ?? "?").join(", ");
  return `📦 Containers: *${nums}*`;
}

function buildInvoiceMessage(inv: {
  invoiceNumber: string;
  clientName: string | null;
  containerNumber: string | null;
  blNumber: string | null;
  total: number;
  outstanding: number;
  dueDate: string | null;
  items?: { containerNumber: string | null }[];
}): string {
  const lines: string[] = [
    `Hello ${inv.clientName ?? ""},`,
    ``,
    `Your invoice for container clearance is ready:`,
    ``,
    `📄 Invoice No: *${inv.invoiceNumber}*`,
  ];
  const itemsToUse = inv.items && inv.items.length > 0 ? inv.items : (inv.containerNumber ? [{ containerNumber: inv.containerNumber }] : []);
  const contLine = containerListLine(itemsToUse);
  if (contLine) lines.push(contLine);
  if (inv.items && inv.items.length === 1 && inv.blNumber) lines.push(`📋 B/L No: *${inv.blNumber}*`);
  lines.push(``);
  lines.push(`💰 Invoice Total: *₦${Number(inv.total).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  if (inv.dueDate) lines.push(`📅 Due Date: *${inv.dueDate}*`);
  lines.push(``);
  lines.push(`Please arrange payment at your earliest convenience.`);
  lines.push(`Thank you for your business.`);
  return lines.join("\n");
}

function buildReminderMessage(inv: {
  invoiceNumber: string;
  clientName: string | null;
  containerNumber: string | null;
  total: number;
  outstanding: number;
  dueDate: string | null;
  items?: { containerNumber: string | null }[];
}): string {
  let overdueLine = "";
  if (inv.dueDate) {
    const due = new Date(inv.dueDate);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - due.getTime()) / 86400000);
    overdueLine = diffDays > 0 ? ` (${diffDays} day${diffDays !== 1 ? "s" : ""} overdue)` : "";
  }
  const lines: string[] = [
    `Hello ${inv.clientName ?? ""},`,
    ``,
    `This is a payment reminder for your outstanding invoice:`,
    ``,
    `📄 Invoice No: *${inv.invoiceNumber}*`,
  ];
  const itemsToUse = inv.items && inv.items.length > 0 ? inv.items : (inv.containerNumber ? [{ containerNumber: inv.containerNumber }] : []);
  const contLine = containerListLine(itemsToUse);
  if (contLine) lines.push(contLine);
  lines.push(``);
  lines.push(`💰 Invoice Total: *₦${Number(inv.total).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  lines.push(`⏳ Outstanding: *₦${Number(inv.outstanding).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
  if (inv.dueDate) lines.push(`📅 Due Date: *${inv.dueDate}*${overdueLine}`);
  lines.push(``);
  lines.push(`Please settle the outstanding amount at your earliest convenience.`);
  lines.push(`Thank you.`);
  return lines.join("\n");
}

router.post("/invoices/:id/send-whatsapp", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({ error: "WhatsApp not configured — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (and either set TWILIO_WHATSAPP_FROM or configure a branch-owned WhatsApp number)." });
    }

    const [row] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        total: invoicesTable.total,
        outstanding: sql<number>`(${invoicesTable.total}::numeric - COALESCE((SELECT SUM(amount::numeric) FROM invoice_payments WHERE invoice_id = ${invoicesTable.id}), 0))`,
        dueDate: invoicesTable.dueDate,
        branchId: invoicesTable.branchId,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, id));

    if (!row) return res.status(404).json({ error: "Invoice not found" });
    if (!row.clientPhone) return res.status(400).json({ error: "Client has no phone number" });

    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];

    const phone = toE164Nigerian(row.clientPhone);
    const messageBody = buildInvoiceMessage({
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName ?? null,
      containerNumber: row.containerNumber ?? null,
      blNumber: row.blNumber ?? null,
      total: parseFloat(row.total as unknown as string ?? "0"),
      outstanding: Number(row.outstanding ?? 0),
      dueDate: row.dueDate ?? null,
      items,
    });

    const branchFrom = await resolveBranchWhatsAppFrom(row.branchId);
    if (branchFrom.error) return res.status(400).json({ error: branchFrom.error });
    const twilioResult = await sendViaTwilio(phone, messageBody, branchFrom.from);

    await db.insert(whatsappMessagesTable).values({
      invoiceId: id,
      branchId: row.branchId,
      clientId: row.clientId ?? null,
      messageType: "invoice",
      phone,
      messageBody,
      status: twilioResult.success ? "sent" : "failed",
      errorMessage: twilioResult.success ? null : twilioResult.error ?? null,
    });

    if (!twilioResult.success) {
      return res.status(500).json({ error: twilioResult.error ?? "Failed to send WhatsApp message" });
    }

    res.json({ success: true, twilioSid: twilioResult.sid ?? null, messageBody });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
});

router.post("/invoices/:id/send-reminder", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({ error: "WhatsApp not configured — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (and either set TWILIO_WHATSAPP_FROM or configure a branch-owned WhatsApp number)." });
    }

    const [row] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        total: invoicesTable.total,
        outstanding: sql<number>`(${invoicesTable.total}::numeric - COALESCE((SELECT SUM(amount::numeric) FROM invoice_payments WHERE invoice_id = ${invoicesTable.id}), 0))`,
        dueDate: invoicesTable.dueDate,
        status: invoicesTable.status,
        branchId: invoicesTable.branchId,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, id));

    if (!row) return res.status(404).json({ error: "Invoice not found" });
    if (!row.clientPhone) return res.status(400).json({ error: "Client has no phone number" });

    const outstanding = Number(row.outstanding ?? 0);
    if (outstanding <= 0) {
      return res.status(400).json({ error: "Invoice is fully paid — no reminder needed" });
    }

    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];

    const phone = toE164Nigerian(row.clientPhone);
    const messageBody = buildReminderMessage({
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName ?? null,
      containerNumber: row.containerNumber ?? null,
      total: parseFloat(row.total as unknown as string ?? "0"),
      outstanding,
      dueDate: row.dueDate ?? null,
      items,
    });

    const branchFrom = await resolveBranchWhatsAppFrom(row.branchId);
    if (branchFrom.error) return res.status(400).json({ error: branchFrom.error });
    const twilioResult = await sendViaTwilio(phone, messageBody, branchFrom.from);

    await db.insert(whatsappMessagesTable).values({
      invoiceId: id,
      branchId: row.branchId,
      clientId: row.clientId ?? null,
      messageType: "reminder",
      phone,
      messageBody,
      status: twilioResult.success ? "sent" : "failed",
      errorMessage: twilioResult.success ? null : twilioResult.error ?? null,
    });

    if (!twilioResult.success) {
      return res.status(500).json({ error: twilioResult.error ?? "Failed to send reminder" });
    }

    res.json({ success: true, twilioSid: twilioResult.sid ?? null, messageBody });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send reminder" });
  }
});

router.post("/invoices/:id/send-receipt", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({ error: "WhatsApp not configured — add TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (and either set TWILIO_WHATSAPP_FROM or configure a branch-owned WhatsApp number)." });
    }

    const [row] = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        clientId: invoicesTable.clientId,
        clientName: clientsTable.name,
        clientPhone: clientsTable.contactPhone,
        total: invoicesTable.total,
        outstanding: sql<number>`(${invoicesTable.total}::numeric - COALESCE((SELECT SUM(amount::numeric) FROM invoice_payments WHERE invoice_id = ${invoicesTable.id}), 0))`,
        totalPaid: sql<number>`COALESCE((SELECT SUM(amount::numeric) FROM invoice_payments WHERE invoice_id = ${invoicesTable.id}), 0)`,
        branchId: invoicesTable.branchId,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, id));

    if (!row) return res.status(404).json({ error: "Invoice not found" });
    if (!row.clientPhone) return res.status(400).json({ error: "Client has no phone number" });

    const totalPaid = Number(row.totalPaid ?? 0);
    if (totalPaid <= 0) {
      return res.status(400).json({ error: "No payments recorded yet — cannot send receipt" });
    }

    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];

    const mostRecentPayment = await db
      .select()
      .from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, id))
      .orderBy(desc(invoicePaymentsTable.paidAt))
      .limit(1);

    const paymentDate = mostRecentPayment[0]?.paidAt
      ? new Date(mostRecentPayment[0].paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })
      : new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });

    const outstanding = Number(row.outstanding ?? 0);
    const total = parseFloat(row.total as unknown as string ?? "0");

    const itemsToUse = items.length > 0 ? items : (row.containerNumber ? [{ containerNumber: row.containerNumber }] : []);
    const contLine = containerListLine(itemsToUse);

    const lines: string[] = [
      `Hello ${row.clientName ?? ""},`,
      ``,
      `We confirm receipt of your payment for the following:`,
      ``,
      `📄 Invoice No: *${row.invoiceNumber}*`,
    ];
    if (contLine) lines.push(contLine);
    lines.push(``);
    lines.push(`💰 Invoice Total: *₦${total.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
    lines.push(`✅ Amount Received: *₦${totalPaid.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
    lines.push(`📅 Payment Date: *${paymentDate}*`);
    if (outstanding > 0) {
      lines.push(`⏳ Remaining Balance: *₦${outstanding.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*`);
    } else {
      lines.push(`🎉 Status: *Fully Settled*`);
    }
    lines.push(``);
    lines.push(`Thank you for your payment. We appreciate your business.`);

    const messageBody = lines.join("\n");
    const phone = toE164Nigerian(row.clientPhone);
    const branchFrom = await resolveBranchWhatsAppFrom(row.branchId);
    if (branchFrom.error) return res.status(400).json({ error: branchFrom.error });
    const twilioResult = await sendViaTwilio(phone, messageBody, branchFrom.from);

    await db.insert(whatsappMessagesTable).values({
      invoiceId: id,
      branchId: row.branchId,
      clientId: row.clientId ?? null,
      messageType: "receipt",
      phone,
      messageBody,
      status: twilioResult.success ? "sent" : "failed",
      errorMessage: twilioResult.success ? null : twilioResult.error ?? null,
    });

    if (!twilioResult.success) {
      return res.status(500).json({ error: twilioResult.error ?? "Failed to send receipt" });
    }

    res.json({ success: true, twilioSid: twilioResult.sid ?? null, messageBody });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send receipt" });
  }
});

router.get("/invoices/:id/whatsapp-log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, id));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    const rows = await db
      .select()
      .from(whatsappMessagesTable)
      .where(eq(whatsappMessagesTable.invoiceId, id))
      .orderBy(desc(whatsappMessagesTable.createdAt));

    res.json(rows.map(r => ({
      id: r.id,
      invoiceId: r.invoiceId,
      clientId: r.clientId,
      messageType: r.messageType,
      phone: r.phone,
      messageBody: r.messageBody,
      status: r.status,
      sentAt: r.sentAt instanceof Date ? r.sentAt.toISOString() : r.sentAt,
      errorMessage: r.errorMessage,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch WhatsApp log" });
  }
});

// ─── Credit Notes ────────────────────────────────────────────────────────────

router.post("/invoices/:id/credit-note", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });

    const { amount: rawAmount, reason } = req.body as { amount?: number; reason?: string };
    const amount = parseFloat(String(rawAmount ?? 0));
    if (isNaN(amount) || amount <= 0) return res.status(400).json({ error: "Valid amount is required" });
    if (!reason?.trim()) return res.status(400).json({ error: "Reason is required" });

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv || !userCanAccessBranch(req, inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    if (inv.status === "written_off") return res.status(400).json({ error: "Cannot raise credit note on a written-off invoice" });
    if (inv.status === "draft") return res.status(400).json({ error: "Cannot raise credit note on a draft invoice" });
    if (inv.clientId) {
      const [cnClient] = await db.select({ branchId: clientsTable.branchId }).from(clientsTable).where(eq(clientsTable.id, inv.clientId));
      if (cnClient && cnClient.branchId !== inv.branchId) {
        return res.status(400).json({ error: "Invoice and client must belong to the same branch" });
      }
    }

    const existingPayments = await db.select({ amount: invoicePaymentsTable.amount })
      .from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const totalPaid = existingPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const invoiceTotal = parseFloat(inv.total ?? "0");
    const outstanding = Math.max(0, invoiceTotal - totalPaid);

    // Allow credit note up to full invoice value; excess beyond outstanding posts to client credit
    if (amount > invoiceTotal) {
      return res.status(400).json({ error: `Credit note cannot exceed the invoice total (₦${invoiceTotal.toLocaleString()})` });
    }

    // Amount applied to reduce invoice balance (capped at outstanding)
    const applyToInvoice = Math.min(amount, outstanding);
    // Any excess beyond outstanding becomes a client credit balance
    const excessCredit = Math.max(0, amount - outstanding);

    const creditNoteNumber = await generateCreditNoteNumber();

    const userId = (req as AuthRequest).user?.id ?? null;
    const [cn] = await db.transaction(async (tx) => {
      const [inserted] = await tx.insert(creditNotesTable).values({
        invoiceId,
        creditNoteNumber,
        reason: reason.trim(),
        amount: String(amount),
        status: "active",
        createdBy: userId,
        branchId: inv.branchId,
      }).returning();

      // Apply portion to invoice balance (first-class adjustment recorded separately from cash)
      if (applyToInvoice > 0) {
        await tx.insert(invoicePaymentsTable).values({
          invoiceId,
          amount: String(applyToInvoice),
          paymentMethod: "credit_note",
          reference: creditNoteNumber,
          notes: `Credit note adjustment: ${reason.trim()}`,
          paidAt: new Date(),
          bankId: null,
          branchId: inv.branchId,
        });
      }

      const newTotalPaid = totalPaid + applyToInvoice;
      let newStatus = inv.status;
      if (newTotalPaid >= invoiceTotal) newStatus = "paid";
      else if (newTotalPaid > 0) newStatus = "partial";
      await tx.update(invoicesTable)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId));

      // Post excess credit to client's credit balance (e.g. full CN on partially paid invoice)
      if (excessCredit > 0 && inv.clientId) {
        await tx
          .update(clientsTable)
          .set({ creditBalance: sql`coalesce(${clientsTable.creditBalance}, 0) + ${String(excessCredit)}` })
          .where(eq(clientsTable.id, inv.clientId));
      }

      await tx.insert(invoiceAuditLogTable).values({
        invoiceId,
        action: "credit_note_raised",
        details: `${creditNoteNumber} — ₦${amount.toLocaleString()} total (₦${applyToInvoice.toLocaleString()} applied to invoice${excessCredit > 0 ? `, ₦${excessCredit.toLocaleString()} to client credit` : ""}) — ${reason.trim()}`,
        performedBy: userId,
        branchId: inv.branchId,
      });

      return [inserted];
    });

    res.status(201).json({
      id: cn.id,
      invoiceId: cn.invoiceId,
      creditNoteNumber: cn.creditNoteNumber,
      reason: cn.reason,
      amount: parseFloat(cn.amount ?? "0"),
      status: cn.status,
      appliedToInvoice: applyToInvoice,
      creditedToClient: excessCredit,
      createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
    });
  } catch (err) {
    console.error("POST /invoices/:id/credit-note error:", err);
    res.status(500).json({ error: "Failed to raise credit note" });
  }
});

router.get("/invoices/:id/credit-notes", requireAuth, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    const rows = await db.select().from(creditNotesTable)
      .where(eq(creditNotesTable.invoiceId, invoiceId))
      .orderBy(creditNotesTable.createdAt);

    res.json(rows.map(cn => ({
      id: cn.id,
      invoiceId: cn.invoiceId,
      creditNoteNumber: cn.creditNoteNumber,
      reason: cn.reason,
      amount: parseFloat(cn.amount ?? "0"),
      status: cn.status,
      createdBy: cn.createdBy ?? null,
      createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
    })));
  } catch (err) {
    console.error("GET /invoices/:id/credit-notes error:", err);
    res.status(500).json({ error: "Failed to fetch credit notes" });
  }
});

// ─── Bad Debt Write-off ───────────────────────────────────────────────────────

router.post("/invoices/:id/write-off", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv || !userCanAccessBranch(req, inv.branchId)) return res.status(404).json({ error: "Invoice not found" });
    if (inv.status === "written_off") return res.status(400).json({ error: "Invoice is already written off" });
    if (inv.status === "paid") return res.status(400).json({ error: "Invoice is already fully paid" });
    if (!inv.dueDate) return res.status(400).json({ error: "Cannot write off an invoice without a due date" });
    const dueDate = new Date(inv.dueDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (dueDate >= today) return res.status(400).json({ error: "Only overdue invoices (past their due date) can be written off as bad debt" });

    const existingPayments = await db.select({ amount: invoicePaymentsTable.amount })
      .from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const totalPaid = existingPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const invoiceTotal = parseFloat(inv.total ?? "0");
    const outstanding = Math.max(0, invoiceTotal - totalPaid);

    const writeOffAmount = outstanding > 0 ? outstanding : invoiceTotal;
    const writeOffUserId = (req as AuthRequest).user?.id ?? null;
    let expenseId = 0;
    await db.transaction(async (tx) => {
      await tx.update(invoicesTable)
        .set({ status: "written_off", writtenOffAmount: String(writeOffAmount), updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId));

      const [exp] = await tx.insert(overheadExpensesTable).values({
        category: "Bad Debt",
        description: `Bad Debt Write-off: ${inv.invoiceNumber}`,
        amount: String(writeOffAmount),
        reference: inv.invoiceNumber,
        recordedBy: writeOffUserId,
        paidAt: new Date(),
        branchId: inv.branchId,
      }).returning({ id: overheadExpensesTable.id });
      expenseId = exp.id;

      await tx.insert(invoiceAuditLogTable).values({
        invoiceId,
        action: "written_off",
        details: `Bad debt write-off — ₦${writeOffAmount.toLocaleString()} — overhead expense #${exp.id}`,
        performedBy: writeOffUserId,
        branchId: inv.branchId,
      });
    });

    res.status(201).json({ success: true, overheadExpenseId: expenseId, writtenOffAmount: writeOffAmount });
  } catch (err) {
    console.error("POST /invoices/:id/write-off error:", err);
    res.status(500).json({ error: "Failed to write off invoice" });
  }
});

// ─── Invoice Audit Log ───────────────────────────────────────────────────────

router.get("/invoices/:id/audit-log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    if (isNaN(invoiceId)) return res.status(400).json({ error: "Invalid id" });
    const [_inv] = await db.select({ branchId: invoicesTable.branchId }).from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!_inv || !userCanAccessBranch(req, _inv.branchId)) return res.status(404).json({ error: "Invoice not found" });

    const rows = await db
      .select({
        id: invoiceAuditLogTable.id,
        invoiceId: invoiceAuditLogTable.invoiceId,
        action: invoiceAuditLogTable.action,
        details: invoiceAuditLogTable.details,
        performedBy: invoiceAuditLogTable.performedBy,
        createdAt: invoiceAuditLogTable.createdAt,
      })
      .from(invoiceAuditLogTable)
      .where(eq(invoiceAuditLogTable.invoiceId, invoiceId))
      .orderBy(desc(invoiceAuditLogTable.createdAt));

    res.json(rows.map(r => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })));
  } catch (err) {
    console.error("GET /invoices/:id/audit-log error:", err);
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

// ─── Flat Credit-Note Endpoints ──────────────────────────────────────────────

router.get("/credit-notes", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { invoiceId: invoiceIdParam } = req.query as { invoiceId?: string };
    const _scope = getBranchScope(req);

    const filters: any[] = [];
    if (invoiceIdParam) filters.push(eq(creditNotesTable.invoiceId, parseInt(invoiceIdParam, 10)));
    if (_scope !== null) filters.push(eq(creditNotesTable.branchId, _scope));

    const rows = await db
      .select({
        id: creditNotesTable.id,
        invoiceId: creditNotesTable.invoiceId,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientName: clientsTable.name,
        creditNoteNumber: creditNotesTable.creditNoteNumber,
        reason: creditNotesTable.reason,
        amount: creditNotesTable.amount,
        status: creditNotesTable.status,
        createdBy: creditNotesTable.createdBy,
        createdAt: creditNotesTable.createdAt,
      })
      .from(creditNotesTable)
      .leftJoin(invoicesTable, eq(creditNotesTable.invoiceId, invoicesTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(filters.length === 0 ? undefined : filters.length === 1 ? filters[0] : and(...filters))
      .orderBy(desc(creditNotesTable.createdAt));

    res.json(rows.map(cn => ({
      id: cn.id,
      invoiceId: cn.invoiceId,
      invoiceNumber: cn.invoiceNumber ?? null,
      clientName: cn.clientName ?? null,
      creditNoteNumber: cn.creditNoteNumber,
      reason: cn.reason,
      amount: parseFloat(cn.amount ?? "0"),
      status: cn.status ?? "active",
      createdBy: cn.createdBy ?? null,
      createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
    })));
  } catch (err) {
    console.error("GET /credit-notes error:", err);
    res.status(500).json({ error: "Failed to fetch credit notes" });
  }
});

router.get("/credit-notes/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const [cn] = await db
      .select({
        id: creditNotesTable.id,
        invoiceId: creditNotesTable.invoiceId,
        invoiceNumber: invoicesTable.invoiceNumber,
        clientName: clientsTable.name,
        creditNoteNumber: creditNotesTable.creditNoteNumber,
        reason: creditNotesTable.reason,
        amount: creditNotesTable.amount,
        status: creditNotesTable.status,
        createdBy: creditNotesTable.createdBy,
        createdAt: creditNotesTable.createdAt,
        branchId: creditNotesTable.branchId,
      })
      .from(creditNotesTable)
      .leftJoin(invoicesTable, eq(creditNotesTable.invoiceId, invoicesTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(creditNotesTable.id, id));

    if (!cn || !userCanAccessBranch(req, cn.branchId)) return res.status(404).json({ error: "Credit note not found" });
    {
      const _scope = getBranchScope(req);
      if (_scope !== null && cn.branchId !== _scope) return res.status(404).json({ error: "Credit note not found" });
    }

    res.json({
      id: cn.id,
      invoiceId: cn.invoiceId,
      invoiceNumber: cn.invoiceNumber ?? null,
      clientName: cn.clientName ?? null,
      creditNoteNumber: cn.creditNoteNumber,
      reason: cn.reason,
      amount: parseFloat(cn.amount ?? "0"),
      status: cn.status ?? "active",
      createdBy: cn.createdBy ?? null,
      createdAt: cn.createdAt instanceof Date ? cn.createdAt.toISOString() : cn.createdAt,
    });
  } catch (err) {
    console.error("GET /credit-notes/:id error:", err);
    res.status(500).json({ error: "Failed to fetch credit note" });
  }
});

export { router as invoicesRouter };
