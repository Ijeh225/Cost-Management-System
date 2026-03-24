import { Router } from "express";
import { db, invoicesTable, invoicePaymentsTable, containersTable, clientsTable } from "@workspace/db";
import { eq, desc, sum, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";

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

async function formatInvoice(inv: any, payments: any[]) {
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const total = parseFloat(inv.total ?? "0");
  const outstanding = Math.max(0, total - totalPaid);

  return {
    id: inv.id,
    invoiceNumber: inv.invoiceNumber,
    status: inv.status,
    containerId: inv.containerId,
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

    const invoices = await Promise.all(
      rows.map(r => formatInvoice(r, paymentsByInvoice.get(r.id) ?? []))
    );

    res.json(invoices);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

router.post("/invoices", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { containerId, vatRate, dueDate, notes } = req.body as {
      containerId: number;
      vatRate?: number;
      dueDate?: string;
      notes?: string;
    };

    if (!containerId) return res.status(400).json({ error: "containerId is required" });

    const [container] = await db
      .select()
      .from(containersTable)
      .where(eq(containersTable.id, containerId));

    if (!container) return res.status(404).json({ error: "Container not found" });

    const subtotal = parseFloat(container.clearingCharges ?? "0");
    const vat = vatRate ? subtotal * (vatRate / 100) : 0;
    const total = subtotal + vat;

    const invoiceNumber = await generateInvoiceNumber();

    const [inv] = await db.insert(invoicesTable).values({
      containerId,
      clientId: container.clientId ?? null,
      invoiceNumber,
      status: "draft",
      subtotal: String(subtotal),
      vatAmount: String(vat),
      total: String(total),
      dueDate: dueDate ?? null,
      notes: notes ?? "",
    }).returning();

    const formatted = await formatInvoice({
      ...inv,
      containerNumber: container.containerNumber,
      blNumber: container.blNumber,
      clientName: null,
      clientPhone: null,
    }, []);

    res.status(201).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create invoice" });
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

    res.json(await formatInvoice(row, payments));
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

    res.json(await formatInvoice(row, payments));
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

export { router as invoicesRouter };
