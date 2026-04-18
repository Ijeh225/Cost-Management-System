import { Router } from "express";
import {
  db, clientsTable, containersTable, invoicesTable, invoicePaymentsTable,
  clientDepositsTable, shippingChargesTable, customsChargesTable,
  terminalChargesTable, deliveryChargesTable, operationsChargesTable,
} from "@workspace/db";
import { eq, desc, sum, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";

export const clientsRouter = Router();

clientsRouter.get("/clients", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    let rows = await db.select().from(clientsTable).orderBy(desc(clientsTable.createdAt));
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.contactName.toLowerCase().includes(term) ||
        c.contactEmail.toLowerCase().includes(term)
      );
    }

    const allInvoices = await db.select().from(invoicesTable);
    const allPayments = await db.select().from(invoicePaymentsTable);
    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }
    const outstandingByClient = new Map<number, number>();
    for (const inv of allInvoices) {
      if (!inv.clientId) continue;
      const total = parseFloat(inv.total ?? "0");
      const paid = (paymentsByInvoice.get(inv.id) ?? []).reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
      const outstanding = Math.max(0, total - paid);
      outstandingByClient.set(inv.clientId, (outstandingByClient.get(inv.clientId) ?? 0) + outstanding);
    }

    const result = rows.map(c => ({
      ...c,
      agreedClearingRate: c.agreedClearingRate != null ? parseFloat(c.agreedClearingRate) : null,
      totalOutstanding: outstandingByClient.get(c.id) ?? 0,
    }));

    return res.json(result);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.post("/clients", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { name, contactName = "", contactEmail = "", contactPhone = "", address = "", notes = "", agreedClearingRate } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "Client name is required" });
    }
    let rate: string | null = null;
    if (agreedClearingRate != null && agreedClearingRate !== "") {
      const parsed = parseFloat(String(agreedClearingRate));
      if (isNaN(parsed) || parsed < 0) return res.status(400).json({ error: "Agreed clearing rate must be a non-negative number" });
      rate = String(parsed);
    }
    const [client] = await db.insert(clientsTable).values({
      name: name.trim(), contactName, contactEmail, contactPhone, address, notes,
      agreedClearingRate: rate,
    }).returning();
    return res.status(201).json({
      ...client,
      agreedClearingRate: client.agreedClearingRate != null ? parseFloat(client.agreedClearingRate) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.get("/clients/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const [raw] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!raw) return res.status(404).json({ error: "Client not found" });
    const client = { ...raw, agreedClearingRate: raw.agreedClearingRate != null ? parseFloat(raw.agreedClearingRate) : null };
    const containers = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      blNumber: containersTable.blNumber,
      customerName: containersTable.customerName,
      vessel: containersTable.vessel,
      size: containersTable.size,
      status: containersTable.status,
      clearingCharges: containersTable.clearingCharges,
      createdAt: containersTable.createdAt,
    }).from(containersTable).where(eq(containersTable.clientId, id)).orderBy(desc(containersTable.createdAt));
    return res.json({ ...client, containers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.patch("/clients/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const { name, contactName, contactEmail, contactPhone, address, notes, agreedClearingRate } = req.body;
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      return res.status(400).json({ error: "Client name cannot be empty" });
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (contactName !== undefined) updates.contactName = contactName;
    if (contactEmail !== undefined) updates.contactEmail = contactEmail;
    if (contactPhone !== undefined) updates.contactPhone = contactPhone;
    if (address !== undefined) updates.address = address;
    if (notes !== undefined) updates.notes = notes;
    if (agreedClearingRate !== undefined) {
      if (agreedClearingRate === "" || agreedClearingRate === null) {
        updates.agreedClearingRate = null;
      } else {
        const parsed = parseFloat(String(agreedClearingRate));
        if (isNaN(parsed) || parsed < 0) return res.status(400).json({ error: "Agreed clearing rate must be a non-negative number" });
        updates.agreedClearingRate = String(parsed);
      }
    }
    const [updated] = await db
      .update(clientsTable)
      .set(updates)
      .where(eq(clientsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Client not found" });
    if (name !== undefined) {
      await db.update(containersTable)
        .set({ customerName: updated.name, updatedAt: new Date() })
        .where(eq(containersTable.clientId, id));
    }
    return res.json({
      ...updated,
      agreedClearingRate: updated.agreedClearingRate != null ? parseFloat(updated.agreedClearingRate) : null,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.delete("/clients/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await db.update(containersTable).set({ clientId: null }).where(eq(containersTable.clientId, id));
    await db.delete(clientsTable).where(eq(clientsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.patch("/clients/:id/link-container", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const { containerId } = req.body as { containerId: number };
    if (isNaN(clientId) || !containerId) return res.status(400).json({ error: "Invalid IDs" });
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return res.status(404).json({ error: "Client not found" });
    await db.update(containersTable)
      .set({ clientId, customerName: client.name, updatedAt: new Date() })
      .where(eq(containersTable.id, containerId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.patch("/containers/:id/unlink-client", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await db.update(containersTable).set({ clientId: null, updatedAt: new Date() }).where(eq(containersTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.get("/clients/:id/receivables", requireAuth, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid ID" });

    const clientInvoices = await db
      .select({
        id: invoicesTable.id,
        invoiceNumber: invoicesTable.invoiceNumber,
        status: invoicesTable.status,
        containerId: invoicesTable.containerId,
        containerNumber: containersTable.containerNumber,
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .leftJoin(containersTable, eq(invoicesTable.containerId, containersTable.id))
      .where(eq(invoicesTable.clientId, clientId))
      .orderBy(desc(invoicesTable.createdAt));

    const allPayments = await db.select().from(invoicePaymentsTable);
    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    let totalInvoiced = 0;
    let totalCollected = 0;

    const invoices = clientInvoices.map(inv => {
      const total = parseFloat(inv.total ?? "0");
      const payments = paymentsByInvoice.get(inv.id) ?? [];
      const paid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
      const outstanding = Math.max(0, total - paid);
      totalInvoiced += total;
      totalCollected += paid;
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        containerId: inv.containerId,
        containerNumber: inv.containerNumber ?? null,
        subtotal: parseFloat(inv.subtotal ?? "0"),
        vatAmount: parseFloat(inv.vatAmount ?? "0"),
        total,
        paid,
        outstanding,
        dueDate: inv.dueDate ?? null,
        createdAt: inv.createdAt instanceof Date ? inv.createdAt.toISOString() : inv.createdAt,
        payments: payments.map(p => ({
          id: p.id,
          amount: parseFloat(p.amount ?? "0"),
          paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt,
          paymentMethod: p.paymentMethod,
          reference: p.reference,
          notes: p.notes,
        })),
      };
    });

    // Build consolidated payment history sorted by paidAt
    const paymentHistory: Array<{
      id: number; amount: number; paidAt: string; paymentMethod: string | null;
      reference: string | null; notes: string | null; invoiceId: number;
      invoiceNumber: string; containerId: number | null; containerNumber: string | null;
    }> = [];
    for (const inv of clientInvoices) {
      const payments = paymentsByInvoice.get(inv.id) ?? [];
      for (const p of payments) {
        paymentHistory.push({
          id: p.id,
          amount: parseFloat(p.amount ?? "0"),
          paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt ?? "",
          paymentMethod: p.paymentMethod ?? null,
          reference: p.reference ?? null,
          notes: p.notes ?? null,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber ?? "",
          containerId: inv.containerId ?? null,
          containerNumber: inv.containerNumber ?? null,
        });
      }
    }
    paymentHistory.sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());

    return res.json({
      totalInvoiced,
      totalCollected,
      totalOutstanding: Math.max(0, totalInvoiced - totalCollected),
      invoices,
      paymentHistory,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.post("/clients/bulk", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = req.body as { rows: Array<{ name: string; contactName?: string; contactEmail?: string; contactPhone?: string; address?: string; notes?: string }> };
    if (!Array.isArray(rows)) return res.status(400).json({ error: "rows must be an array" });
    let created = 0;
    const duplicates: string[] = [];
    const errors: string[] = [];
    for (const row of rows) {
      if (!row.name?.trim()) { errors.push(`Skipped row with missing name`); continue; }
      try {
        await db.insert(clientsTable).values({
          name: row.name.trim(),
          contactName: row.contactName ?? "",
          contactEmail: row.contactEmail ?? "",
          contactPhone: row.contactPhone ?? "",
          address: row.address ?? "",
          notes: row.notes ?? "",
        });
        created++;
      } catch (err: any) {
        if (err.code === "23505") {
          duplicates.push(row.name);
        } else {
          errors.push(`Error for "${row.name}": ${err.message}`);
        }
      }
    }
    return res.json({ created, duplicates, errors });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Wallet / Deposits ─────────────────────────────────────────────────────

clientsRouter.get("/clients/:id/deposits", requireAuth, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid ID" });
    const deposits = await db
      .select()
      .from(clientDepositsTable)
      .where(eq(clientDepositsTable.clientId, clientId))
      .orderBy(desc(clientDepositsTable.createdAt));
    return res.json(deposits.map(d => ({
      id: d.id,
      clientId: d.clientId,
      amount: parseFloat(d.amount),
      paymentMethod: d.paymentMethod,
      reference: d.reference ?? null,
      notes: d.notes ?? null,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

const ALLOWED_PAYMENT_METHODS = ["Cash", "Bank Transfer", "Cheque"] as const;

clientsRouter.post("/clients/:id/deposits", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid ID" });
    const { amount, paymentMethod, reference, notes } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: `Payment method must be one of: ${ALLOWED_PAYMENT_METHODS.join(", ")}` });
    }
    const [deposit] = await db.insert(clientDepositsTable).values({
      clientId,
      amount: String(parseFloat(amount)),
      paymentMethod,
      reference: reference ?? null,
      notes: notes ?? null,
    }).returning();
    return res.status(201).json({
      id: deposit.id,
      clientId: deposit.clientId,
      amount: parseFloat(deposit.amount),
      paymentMethod: deposit.paymentMethod,
      reference: deposit.reference ?? null,
      notes: deposit.notes ?? null,
      createdAt: deposit.createdAt instanceof Date ? deposit.createdAt.toISOString() : deposit.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.delete("/clients/:id/deposits/:depositId", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const depositId = parseInt(req.params.depositId);
    if (isNaN(clientId) || isNaN(depositId)) return res.status(400).json({ error: "Invalid ID" });
    const [existing] = await db.select().from(clientDepositsTable)
      .where(eq(clientDepositsTable.id, depositId));
    if (!existing || existing.clientId !== clientId) return res.status(404).json({ error: "Deposit not found" });
    await db.delete(clientDepositsTable).where(eq(clientDepositsTable.id, depositId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.get("/clients/:id/wallet-summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid ID" });

    const [depositSumRow] = await db
      .select({ total: sum(clientDepositsTable.amount) })
      .from(clientDepositsTable)
      .where(eq(clientDepositsTable.clientId, clientId));
    const totalDeposited = parseFloat(depositSumRow?.total ?? "0");

    const clientContainers = await db
      .select({ id: containersTable.id })
      .from(containersTable)
      .where(eq(containersTable.clientId, clientId));
    const containerIds = clientContainers.map(c => c.id);

    let totalExpenses = 0;
    if (containerIds.length > 0) {
      const [shippingRows, customsRows, terminalRows, deliveryRows, opsRows] = await Promise.all([
        db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, containerIds)),
        db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, containerIds)),
        db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, containerIds)),
        db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, containerIds)),
        db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, containerIds)),
      ]);
      const indexBy = (arr: { containerId: number }[]) => {
        const m: Record<number, any> = {};
        arr.forEach(r => { m[r.containerId] = r; });
        return m;
      };
      const sMap = indexBy(shippingRows);
      const cMap = indexBy(customsRows);
      const tMap = indexBy(terminalRows);
      const dMap = indexBy(deliveryRows);
      const oMap = indexBy(opsRows);
      for (const cId of containerIds) {
        totalExpenses += calcTotalCost(sMap[cId] ?? {}, cMap[cId] ?? {}, tMap[cId] ?? {}, dMap[cId] ?? {}, oMap[cId] ?? {});
      }
    }

    return res.json({
      totalDeposited,
      totalExpenses,
      balance: totalDeposited - totalExpenses,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
