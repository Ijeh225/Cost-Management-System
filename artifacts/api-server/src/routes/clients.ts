import { Router } from "express";
import {
  db, clientsTable, containersTable, invoicesTable, invoiceItemsTable, invoicePaymentsTable,
  clientDepositsTable, shippingChargesTable, customsChargesTable,
  terminalChargesTable, deliveryChargesTable, operationsChargesTable,
  usersTable, banksTable,
} from "@workspace/db";
import { eq, desc, sum, inArray, gte, and, isNull, isNotNull, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest, verifyPassword } from "../lib/auth.js";
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
      creditBalance: parseFloat(c.creditBalance ?? "0"),
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
      branchId: req.user!.role === "super_admin" && req.body.branchId
        ? Number(req.body.branchId)
        : req.user!.branchId,
    }).returning();
    return res.status(201).json({
      ...client,
      agreedClearingRate: client.agreedClearingRate != null ? parseFloat(client.agreedClearingRate) : null,
      creditBalance: parseFloat(client.creditBalance ?? "0"),
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
    const client = {
      ...raw,
      agreedClearingRate: raw.agreedClearingRate != null ? parseFloat(raw.agreedClearingRate) : null,
      creditBalance: parseFloat(raw.creditBalance ?? "0"),
    };
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
      creditBalance: parseFloat(updated.creditBalance ?? "0"),
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
        subtotal: invoicesTable.subtotal,
        vatAmount: invoicesTable.vatAmount,
        total: invoicesTable.total,
        dueDate: invoicesTable.dueDate,
        createdAt: invoicesTable.createdAt,
      })
      .from(invoicesTable)
      .where(eq(invoicesTable.clientId, clientId))
      .orderBy(desc(invoicesTable.createdAt));

    const invoiceIds = clientInvoices.map(i => i.id);

    const [allPayments, allItems] = await Promise.all([
      invoiceIds.length > 0
        ? db.select().from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
        : Promise.resolve([] as Array<{ id: number; invoiceId: number; amount: string; paidAt: Date | null; paymentMethod: string; reference: string; notes: string; bankId: number | null; createdAt: Date }>),
      invoiceIds.length > 0
        ? db.select({
            id: invoiceItemsTable.id,
            invoiceId: invoiceItemsTable.invoiceId,
            containerId: invoiceItemsTable.containerId,
            containerNumber: containersTable.containerNumber,
            description: invoiceItemsTable.description,
            amount: invoiceItemsTable.amount,
            sortOrder: invoiceItemsTable.sortOrder,
          })
          .from(invoiceItemsTable)
          .leftJoin(containersTable, eq(invoiceItemsTable.containerId, containersTable.id))
          .where(inArray(invoiceItemsTable.invoiceId, invoiceIds))
          .orderBy(invoiceItemsTable.sortOrder)
        : Promise.resolve([] as Array<{ id: number; invoiceId: number; containerId: number | null; containerNumber: string | null; description: string; amount: string; sortOrder: number }>),
    ]);

    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }

    const itemsByInvoice = new Map<number, typeof allItems>();
    for (const item of allItems) {
      if (!itemsByInvoice.has(item.invoiceId)) itemsByInvoice.set(item.invoiceId, []);
      itemsByInvoice.get(item.invoiceId)!.push(item);
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
      const items = (itemsByInvoice.get(inv.id) ?? []).map(it => ({
        id: it.id,
        containerId: it.containerId ?? null,
        containerNumber: it.containerNumber ?? null,
        description: it.description,
        amount: parseFloat(it.amount ?? "0"),
        sortOrder: it.sortOrder,
      }));
      return {
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        containerId: inv.containerId ?? null,
        containerNumber: items.length === 1 ? (items[0].containerNumber ?? null) : null,
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
        items,
      };
    });

    // Build invoice items lookup for payment history (containerId -> first item containers per invoice)
    const invoiceContainersMap = new Map<number, Array<{ containerId: number; containerNumber: string | null }>>();
    for (const [invId, items] of itemsByInvoice) {
      invoiceContainersMap.set(
        invId,
        items.filter(it => it.containerId != null).map(it => ({
          containerId: it.containerId as number,
          containerNumber: it.containerNumber ?? null,
        }))
      );
    }

    // Build consolidated payment history sorted by paidAt
    const paymentHistory: Array<{
      id: number; amount: number; paidAt: string; paymentMethod: string | null;
      reference: string | null; notes: string | null; invoiceId: number;
      invoiceNumber: string; containerId: number | null; containerNumber: string | null;
      containers: Array<{ containerId: number; containerNumber: string | null }>;
    }> = [];
    for (const inv of clientInvoices) {
      const payments = paymentsByInvoice.get(inv.id) ?? [];
      const containers = invoiceContainersMap.get(inv.id) ?? [];
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
          containerNumber: containers.length === 1 ? (containers[0].containerNumber ?? null) : null,
          containers,
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
          branchId: req.user!.branchId,
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
      .select({
        id: clientDepositsTable.id,
        clientId: clientDepositsTable.clientId,
        amount: clientDepositsTable.amount,
        paymentMethod: clientDepositsTable.paymentMethod,
        reference: clientDepositsTable.reference,
        notes: clientDepositsTable.notes,
        bankId: clientDepositsTable.bankId,
        bankName: banksTable.name,
        allocatedInvoiceId: clientDepositsTable.allocatedInvoiceId,
        allocatedAmount: clientDepositsTable.allocatedAmount,
        allocatedInvoiceNumber: invoicesTable.invoiceNumber,
        createdAt: clientDepositsTable.createdAt,
      })
      .from(clientDepositsTable)
      .leftJoin(banksTable, eq(clientDepositsTable.bankId, banksTable.id))
      .leftJoin(invoicesTable, eq(clientDepositsTable.allocatedInvoiceId, invoicesTable.id))
      .where(eq(clientDepositsTable.clientId, clientId))
      .orderBy(desc(clientDepositsTable.createdAt));
    return res.json(deposits.map(d => {
      const amount = parseFloat(d.amount);
      const allocatedAmount = parseFloat(d.allocatedAmount ?? "0");
      return {
        id: d.id,
        clientId: d.clientId,
        amount,
        paymentMethod: d.paymentMethod,
        reference: d.reference ?? null,
        notes: d.notes ?? null,
        bankId: d.bankId ?? null,
        bankName: d.bankName ?? null,
        allocatedInvoiceId: d.allocatedInvoiceId ?? null,
        allocatedInvoiceNumber: d.allocatedInvoiceNumber ?? null,
        allocatedAmount,
        remainingAmount: amount - allocatedAmount,
        createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : d.createdAt,
      };
    }));
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
    const { amount, paymentMethod, reference, notes, bankId } = req.body;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!paymentMethod || !ALLOWED_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: `Payment method must be one of: ${ALLOWED_PAYMENT_METHODS.join(", ")}` });
    }
    const [client] = await db.select({ branchId: clientsTable.branchId }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) return res.status(404).json({ error: "Client not found" });
    const [deposit] = await db.insert(clientDepositsTable).values({
      clientId,
      amount: String(parseFloat(amount)),
      paymentMethod,
      reference: reference ?? null,
      notes: notes ?? null,
      bankId: bankId ?? null,
      branchId: client.branchId,
    }).returning();
    let bankName: string | null = null;
    if (deposit.bankId) {
      const [bank] = await db.select({ name: banksTable.name }).from(banksTable).where(eq(banksTable.id, deposit.bankId));
      bankName = bank?.name ?? null;
    }
    const depositAmount = parseFloat(deposit.amount);
    const allocatedAmount = parseFloat(deposit.allocatedAmount ?? "0");
    return res.status(201).json({
      id: deposit.id,
      clientId: deposit.clientId,
      amount: depositAmount,
      paymentMethod: deposit.paymentMethod,
      reference: deposit.reference ?? null,
      notes: deposit.notes ?? null,
      bankId: deposit.bankId ?? null,
      bankName,
      allocatedInvoiceId: null,
      allocatedInvoiceNumber: null,
      allocatedAmount,
      remainingAmount: depositAmount - allocatedAmount,
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
    const allocatedAmount = parseFloat(existing.allocatedAmount ?? "0");
    if (allocatedAmount > 0) {
      return res.status(400).json({ error: "Cannot remove a deposit that has been allocated to an invoice. Remove the invoice payment first." });
    }
    await db.delete(clientDepositsTable).where(eq(clientDepositsTable.id, depositId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Deposit Allocation ─────────────────────────────────────────────────────

clientsRouter.post("/client-deposits/:id/allocate", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const depositId = parseInt(req.params.id);
    if (isNaN(depositId)) return res.status(400).json({ error: "Invalid deposit ID" });

    const { invoiceId, amount: rawAmount } = req.body as { invoiceId: number; amount: number };
    if (!invoiceId || isNaN(invoiceId)) return res.status(400).json({ error: "invoiceId is required" });
    const allocationAmount = parseFloat(String(rawAmount));
    if (isNaN(allocationAmount) || allocationAmount <= 0) {
      return res.status(400).json({ error: "Allocation amount must be a positive number" });
    }

    const [deposit] = await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, depositId));
    if (!deposit) return res.status(404).json({ error: "Deposit not found" });

    const depositTotal = parseFloat(deposit.amount);
    const alreadyAllocated = parseFloat(deposit.allocatedAmount ?? "0");
    const remainingOnDeposit = depositTotal - alreadyAllocated;
    if (allocationAmount > remainingOnDeposit + 0.001) {
      return res.status(400).json({
        error: `Allocation amount (₦${allocationAmount.toLocaleString()}) exceeds the deposit's remaining balance (₦${remainingOnDeposit.toLocaleString()})`,
      });
    }

    const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
    if (!inv) return res.status(404).json({ error: "Invoice not found" });
    if (inv.clientId !== deposit.clientId) {
      return res.status(400).json({ error: "Deposit and invoice must belong to the same client" });
    }
    if (inv.status === "draft") return res.status(400).json({ error: "Cannot allocate a deposit against a draft invoice" });

    const existingPayments = await db.select().from(invoicePaymentsTable).where(eq(invoicePaymentsTable.invoiceId, invoiceId));
    const totalPaid = existingPayments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const invoiceTotal = parseFloat(inv.total ?? "0");
    const invoiceOutstanding = Math.max(0, invoiceTotal - totalPaid);
    if (invoiceOutstanding <= 0) {
      return res.status(400).json({ error: "Invoice is already fully paid" });
    }
    if (allocationAmount > invoiceOutstanding + 0.001) {
      return res.status(400).json({
        error: `Allocation amount exceeds invoice outstanding balance (₦${invoiceOutstanding.toLocaleString()})`,
      });
    }

    await db.transaction(async (tx) => {
      await tx.insert(invoicePaymentsTable).values({
        invoiceId,
        amount: String(allocationAmount),
        paymentMethod: deposit.paymentMethod,
        reference: deposit.reference ?? "",
        notes: `Applied from deposit #${depositId}${deposit.notes ? ` — ${deposit.notes}` : ""}`,
        paidAt: new Date(),
        bankId: deposit.bankId ?? null,
      });

      const newAllocated = alreadyAllocated + allocationAmount;
      await tx.update(clientDepositsTable)
        .set({ allocatedAmount: String(newAllocated), allocatedInvoiceId: invoiceId })
        .where(eq(clientDepositsTable.id, depositId));

      const newTotalPaid = totalPaid + allocationAmount;
      let newStatus = inv.status;
      if (newTotalPaid >= invoiceTotal) {
        newStatus = "paid";
      } else if (newTotalPaid > 0) {
        newStatus = "partial";
      }
      await tx.update(invoicesTable)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(invoicesTable.id, invoiceId));
    });

    const [updatedDeposit] = await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.id, depositId));
    const updatedAmount = parseFloat(updatedDeposit.amount);
    const updatedAllocated = parseFloat(updatedDeposit.allocatedAmount ?? "0");

    return res.json({
      success: true,
      depositId,
      invoiceId,
      allocationAmount,
      remainingOnDeposit: updatedAmount - updatedAllocated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.get("/clients/:id/wallet-summary", requireAuth, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid ID" });

    const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!clientRow) return res.status(404).json({ error: "Client not found" });

    const resetAt: Date | null = clientRow.walletResetAt ?? null;

    const depositFilter = resetAt
      ? and(eq(clientDepositsTable.clientId, clientId), gte(clientDepositsTable.createdAt, resetAt))
      : eq(clientDepositsTable.clientId, clientId);

    const [depositSumRow] = await db
      .select({ total: sum(clientDepositsTable.amount) })
      .from(clientDepositsTable)
      .where(depositFilter);
    const totalDeposited = parseFloat(depositSumRow?.total ?? "0");

    const invoiceFilter = resetAt
      ? and(eq(invoicesTable.clientId, clientId), gte(invoicesTable.createdAt, resetAt))
      : eq(invoicesTable.clientId, clientId);

    const [invoiceSumRow] = await db
      .select({ total: sum(invoicesTable.total) })
      .from(invoicesTable)
      .where(invoiceFilter);
    const totalExpenses = parseFloat(invoiceSumRow?.total ?? "0");

    // Unallocated deposits: amount - allocatedAmount > 0 (ignore wallet reset for unallocated — show true picture)
    const allDeposits = await db
      .select({ amount: clientDepositsTable.amount, allocatedAmount: clientDepositsTable.allocatedAmount })
      .from(clientDepositsTable)
      .where(eq(clientDepositsTable.clientId, clientId));
    const unallocatedDeposits = allDeposits.reduce((s, d) => {
      const amt = parseFloat(d.amount ?? "0");
      const alloc = parseFloat(d.allocatedAmount ?? "0");
      return s + Math.max(0, amt - alloc);
    }, 0);

    const creditBalance = parseFloat(clientRow.creditBalance ?? "0");

    return res.json({
      totalDeposited,
      totalExpenses,
      balance: totalDeposited - totalExpenses,
      walletResetAt: resetAt ? resetAt.toISOString() : null,
      unallocatedDeposits,
      creditBalance,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.post("/clients/:id/wallet/reset", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    if (isNaN(clientId)) return res.status(400).json({ error: "Invalid ID" });

    const [clientRow] = await db.select().from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!clientRow) return res.status(404).json({ error: "Client not found" });

    const { adminPassword } = req.body as { adminPassword?: string };
    if (!adminPassword || adminPassword.trim() === "") {
      return res.status(400).json({ error: "Admin password is required to reset wallet" });
    }

    const adminUser = req.user;
    if (!adminUser) return res.status(401).json({ error: "Not authenticated" });

    const [userRow] = await db.select().from(usersTable).where(eq(usersTable.id, adminUser.id));
    if (!userRow) return res.status(401).json({ error: "User not found" });

    const passwordMatch = await verifyPassword(adminPassword, userRow.passwordHash);
    if (!passwordMatch) return res.status(403).json({ error: "Incorrect password" });

    const now = new Date();

    // Fetch unallocated deposits before reset for count/audit
    const deposits = await db.select().from(clientDepositsTable).where(eq(clientDepositsTable.clientId, clientId));
    const unallocatedDeposits = deposits.filter(d => parseFloat(d.allocatedAmount ?? "0") < parseFloat(d.amount ?? "0"));

    await db.transaction(async (tx) => {
      // Void remaining balance on all unallocated/partial deposits
      for (const dep of unallocatedDeposits) {
        await tx.update(clientDepositsTable)
          .set({ allocatedAmount: dep.amount, notes: (dep.notes ? dep.notes + " | " : "") + `[VOIDED by wallet reset ${now.toISOString()} by user #${adminUser.id}]` })
          .where(eq(clientDepositsTable.id, dep.id));
      }

      // Append audit note to client record
      const auditLine = `[WALLET RESET ${now.toISOString()} by user #${adminUser.id} (${userRow.email})] — creditBalance zeroed; ${unallocatedDeposits.length} unallocated deposit(s) voided`;
      await tx.update(clientsTable)
        .set({
          walletResetAt: now,
          creditBalance: "0",
          notes: sql`CASE WHEN ${clientsTable.notes} = '' THEN ${auditLine} ELSE ${clientsTable.notes} || E'\n' || ${auditLine} END`,
        })
        .where(eq(clientsTable.id, clientId));
    });

    return res.json({ success: true, walletResetAt: now.toISOString(), depositVoided: unallocatedDeposits.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
