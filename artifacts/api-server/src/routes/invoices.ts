import { Router } from "express";
import { db, invoicesTable, invoiceItemsTable, invoicePaymentsTable, containersTable, clientsTable, whatsappMessagesTable } from "@workspace/db";
import { eq, desc, sql, inArray, and, gte, lte } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { toE164Nigerian, sendViaTwilio } from "../lib/whatsapp.js";

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

async function formatInvoice(inv: any, payments: any[], items?: any[]) {
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
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
    })),
  };
}

router.get("/invoices", requireAuth, async (req, res) => {
  try {
    const rows = await db
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
      .orderBy(desc(invoicesTable.createdAt));

    const allPayments = await db.select().from(invoicePaymentsTable);
    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    const invoiceIds = rows.map(r => r.id);
    const itemsByInvoice = await fetchItemsForInvoices(invoiceIds);

    const invoices = await Promise.all(
      rows.map(r => formatInvoice(r, paymentsByInvoice.get(r.id) ?? [], itemsByInvoice.get(r.id) ?? []))
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
      }).returning();

      const itemRows = containers.map((c, idx) => ({
        invoiceId: inv.id,
        containerId: c.id,
        description: "Clearing Charges",
        amount: String(itemAmountFor(c)),
        sortOrder: idx,
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

router.get("/invoices/accounts-receivable", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const { from, to } = req.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to + "T23:59:59") : null;

    const conditions = [];
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
      .where(conditions.length > 0 ? and(...conditions) : undefined)
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

    const allPaymentsForMonth = await db.select({
      amount: invoicePaymentsTable.amount,
      paidAt: invoicePaymentsTable.paidAt,
    }).from(invoicePaymentsTable).where(gte(invoicePaymentsTable.paidAt, monthStart));
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

    const clients = [...clientMap.values()].sort((a, b) => b.outstanding - a.outstanding);
    const totalOutstanding = clients.reduce((s, c) => s + c.outstanding, 0);
    const totalOverdue = summaryAging.days31to60 + summaryAging.days61to90 + summaryAging.days90plus;

    res.json({
      summary: {
        totalInvoiced: summaryInvoiced,
        totalCollected: summaryCollected,
        totalOutstanding,
        collectedThisMonth,
        openInvoiceCount,
        totalOverdue,
      },
      aging: summaryAging,
      clients,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch accounts receivable" });
  }
});

router.get("/invoices/:id", requireAuth, async (req, res) => {
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
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
      .where(eq(invoicesTable.id, id));

    if (!row) return res.status(404).json({ error: "Invoice not found" });

    const payments = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, id))
      .orderBy(invoicePaymentsTable.paidAt);

    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];

    res.json(await formatInvoice(row, payments, items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoice" });
  }
});

router.patch("/invoices/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    const { status, dueDate, notes, subtotal, vatAmount, total } = req.body as {
      status?: string;
      dueDate?: string | null;
      notes?: string;
      subtotal?: number;
      vatAmount?: number;
      total?: number;
    };

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

    const payments = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, id));

    const itemsMap = await fetchItemsForInvoices([id]);
    const items = itemsMap.get(id) ?? [];

    res.json(await formatInvoice(row, payments, items));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

router.delete("/invoices/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
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
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    let resolvedAmount = amount;
    let resolvedDescription = description ?? "Clearing Charges";
    if (containerId) {
      const [container] = await db.select().from(containersTable).where(eq(containersTable.id, containerId));
      if (!container) return res.status(404).json({ error: "Container not found" });
      if (resolvedAmount === undefined) resolvedAmount = parseFloat(container.clearingCharges ?? "0");
    }
    if (resolvedAmount === undefined || isNaN(resolvedAmount)) resolvedAmount = 0;

    const existingItems = await db.select().from(invoiceItemsTable).where(eq(invoiceItemsTable.invoiceId, invoiceId));
    const maxSort = existingItems.reduce((m, it) => Math.max(m, it.sortOrder), -1);

    await db.transaction(async (tx) => {
      await tx.insert(invoiceItemsTable).values({
        invoiceId,
        containerId: containerId ?? null,
        description: resolvedDescription,
        amount: String(resolvedAmount),
        sortOrder: maxSort + 1,
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

router.delete("/invoices/:id/items/:itemId", requireAdmin, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const itemId = parseInt(req.params.itemId, 10);
    if (isNaN(invoiceId) || isNaN(itemId)) return res.status(400).json({ error: "Invalid id" });

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

    const { amount, paymentMethod, reference, notes, paidAt } = req.body as {
      amount: number;
      paymentMethod?: string;
      reference?: string;
      notes?: string;
      paidAt?: string;
    };

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    await db.insert(invoicePaymentsTable).values({
      invoiceId,
      amount: String(amount),
      paymentMethod: paymentMethod ?? "transfer",
      reference: reference ?? "",
      notes: notes ?? "",
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    });

    const payments = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoiceId));

    const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
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

    res.status(201).json({ success: true, totalPaid, status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

router.delete("/invoices/:id/payments/:paymentId", requireAdmin, async (req, res) => {
  try {
    const invoiceId = parseInt(req.params.id, 10);
    const paymentId = parseInt(req.params.paymentId, 10);
    if (isNaN(invoiceId) || isNaN(paymentId)) return res.status(400).json({ error: "Invalid id" });

    await db.delete(invoicePaymentsTable).where(eq(invoicePaymentsTable.id, paymentId));

    const payments = await db.select().from(invoicePaymentsTable)
      .where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (inv) {
      const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
      const total = parseFloat(inv.total);
      let newStatus = "sent";
      if (totalPaid >= total) newStatus = "paid";
      else if (totalPaid > 0) newStatus = "partial";
      else if (inv.status === "paid" || inv.status === "partial") newStatus = "sent";
      else newStatus = inv.status;
      await db.update(invoicesTable).set({ status: newStatus, updatedAt: new Date() }).where(eq(invoicesTable.id, invoiceId));
    }

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

router.post("/invoices/:id/send-whatsapp", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
      return res.status(503).json({ error: "WhatsApp not configured — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM to environment secrets" });
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

    const twilioResult = await sendViaTwilio(phone, messageBody);

    await db.insert(whatsappMessagesTable).values({
      invoiceId: id,
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

router.post("/invoices/:id/send-reminder", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
      return res.status(503).json({ error: "WhatsApp not configured — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM to environment secrets" });
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

    const twilioResult = await sendViaTwilio(phone, messageBody);

    await db.insert(whatsappMessagesTable).values({
      invoiceId: id,
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

router.post("/invoices/:id/send-receipt", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) {
      return res.status(503).json({ error: "WhatsApp not configured — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM to environment secrets" });
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
    const twilioResult = await sendViaTwilio(phone, messageBody);

    await db.insert(whatsappMessagesTable).values({
      invoiceId: id,
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

router.get("/invoices/:id/whatsapp-log", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

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

export { router as invoicesRouter };
