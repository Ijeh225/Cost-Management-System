import { Router } from "express";
import { db, invoicesTable, invoicePaymentsTable, containersTable, clientsTable, whatsappMessagesTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
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

function buildInvoiceMessage(inv: {
  invoiceNumber: string;
  clientName: string | null;
  containerNumber: string | null;
  blNumber: string | null;
  total: number;
  outstanding: number;
  dueDate: string | null;
}): string {
  const lines: string[] = [
    `Hello ${inv.clientName ?? ""},`,
    ``,
    `Your invoice for container clearance is ready:`,
    ``,
    `📄 Invoice No: *${inv.invoiceNumber}*`,
  ];
  if (inv.containerNumber) lines.push(`📦 Container: *${inv.containerNumber}*`);
  if (inv.blNumber) lines.push(`📋 B/L No: *${inv.blNumber}*`);
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
  if (inv.containerNumber) lines.push(`📦 Container: *${inv.containerNumber}*`);
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

    const phone = toE164Nigerian(row.clientPhone);
    const messageBody = buildInvoiceMessage({
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName ?? null,
      containerNumber: row.containerNumber ?? null,
      blNumber: row.blNumber ?? null,
      total: parseFloat(row.total as unknown as string ?? "0"),
      outstanding: Number(row.outstanding ?? 0),
      dueDate: row.dueDate ?? null,
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

    const phone = toE164Nigerian(row.clientPhone);
    const messageBody = buildReminderMessage({
      invoiceNumber: row.invoiceNumber,
      clientName: row.clientName ?? null,
      containerNumber: row.containerNumber ?? null,
      total: parseFloat(row.total as unknown as string ?? "0"),
      outstanding,
      dueDate: row.dueDate ?? null,
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
