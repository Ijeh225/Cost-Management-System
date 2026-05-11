import { Router } from "express";
import { db, containerExpenseCategoriesTable, containerExpensePaymentsTable, banksTable, containersTable, usersTable, auditLogTable } from "@workspace/db";
import { eq, desc, inArray, isNotNull } from "drizzle-orm";
import { requireAdmin, AuthRequest } from "../lib/auth.js";

export const containerExpensesRouter = Router();

// ─── Categories ──────────────────────────────────────────────────────────────

containerExpensesRouter.get("/container-expense-categories", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(containerExpenseCategoriesTable).orderBy(containerExpenseCategoriesTable.name);
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      isDefault: r.isDefault,
      createdBy: r.createdBy ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })));
  } catch (err) {
    console.error("GET /container-expense-categories error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

containerExpensesRouter.post("/container-expense-categories", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Category name is required" }); return;
    }
    const [row] = await db.insert(containerExpenseCategoriesTable).values({
      name: name.trim(), isDefault: false, createdBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json({
      id: row.id, name: row.name, isDefault: row.isDefault,
      createdBy: row.createdBy ?? null,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Category name already exists" }); return; }
    console.error("POST /container-expense-categories error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

containerExpensesRouter.delete("/container-expense-categories/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [cat] = await db.select().from(containerExpenseCategoriesTable).where(eq(containerExpenseCategoriesTable.id, id));
    if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
    if (cat.isDefault) { res.status(400).json({ error: "Cannot delete default categories" }); return; }
    await db.delete(containerExpenseCategoriesTable).where(eq(containerExpenseCategoriesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /container-expense-categories/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Batch Payment ────────────────────────────────────────────────────────────

containerExpensesRouter.post("/container-expense-payments/batch", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { items, categoryId, bankId, paymentMethod, reference, narration, paidAt } = req.body as {
      items: { containerId: number; amount: number }[];
      categoryId: number;
      bankId?: number | null;
      paymentMethod: "cash" | "bank";
      reference?: string;
      narration?: string;
      paidAt?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array is required" }); return;
    }
    if (!categoryId || isNaN(Number(categoryId))) {
      res.status(400).json({ error: "categoryId is required" }); return;
    }
    if (!paymentMethod || !["cash", "bank"].includes(paymentMethod)) {
      res.status(400).json({ error: "paymentMethod must be 'cash' or 'bank'" }); return;
    }
    if (paymentMethod === "bank" && !bankId) {
      res.status(400).json({ error: "bankId is required for bank payments" }); return;
    }
    for (const item of items) {
      if (!item.containerId || isNaN(Number(item.containerId))) {
        res.status(400).json({ error: "Each item must have a valid containerId" }); return;
      }
      if (!item.amount || isNaN(Number(item.amount)) || Number(item.amount) <= 0) {
        res.status(400).json({ error: "Each item must have a positive amount" }); return;
      }
    }

    const [cat] = await db.select().from(containerExpenseCategoriesTable)
      .where(eq(containerExpenseCategoriesTable.id, Number(categoryId)));
    if (!cat) { res.status(404).json({ error: "Category not found" }); return; }

    if (paymentMethod === "bank" && bankId) {
      const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, Number(bankId)));
      if (!bank) { res.status(404).json({ error: "Bank not found" }); return; }
    }

    const paidAtDate = paidAt ? new Date(paidAt) : new Date();
    const resolvedBankId = paymentMethod === "bank" && bankId ? Number(bankId) : null;
    const actorId = req.user?.id ?? null;

    // Wrap both inserts in a single transaction so a failure in either rolls
    // back all writes atomically — essential for a financial sync operation.
    const inserted = await db.transaction(async (tx) => {
      const payments = await tx.insert(containerExpensePaymentsTable).values(
        items.map(item => ({
          containerId: Number(item.containerId),
          categoryId: Number(categoryId),
          amount: String(item.amount),
          paymentMethod,
          bankId: resolvedBankId,
          reference: reference || null,
          narration: narration || null,
          paidAt: paidAtDate,
          recordedBy: actorId,
        }))
      ).returning();

      // Write one audit log entry per container so the event appears in each
      // container's Audit Trail tab.
      if (actorId && payments.length > 0) {
        await tx.insert(auditLogTable).values(
          payments.map(p => ({
            containerId: p.containerId,
            userId: actorId,
            action: "expense_payment_recorded" as const,
            section: "payments",
            newValue: JSON.stringify({
              paymentId: p.id,
              category: cat.name,
              amount: parseFloat(p.amount ?? "0"),
              paymentMethod,
              bankId: resolvedBankId ?? null,
              reference: reference || null,
              narration: narration || null,
              paidAt: paidAtDate.toISOString(),
            }),
          }))
        );
      }

      return payments;
    });

    res.status(201).json({ ok: true, count: inserted.length, payments: inserted.map(p => ({
      id: p.id,
      containerId: p.containerId,
      categoryId: p.categoryId,
      amount: parseFloat(p.amount ?? "0"),
      paymentMethod: p.paymentMethod,
      bankId: p.bankId ?? null,
      reference: p.reference ?? null,
      narration: p.narration ?? null,
      paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
      recordedBy: p.recordedBy ?? null,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    }))});
  } catch (err) {
    console.error("POST /container-expense-payments/batch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Container Payment History ────────────────────────────────────────────────

containerExpensesRouter.get("/containers/:id/expense-payments", requireAdmin, async (req, res) => {
  try {
    const containerId = Number(req.params.id);
    if (isNaN(containerId)) { res.status(400).json({ error: "Invalid container id" }); return; }

    const payments = await db.select().from(containerExpensePaymentsTable)
      .where(eq(containerExpensePaymentsTable.containerId, containerId))
      .orderBy(desc(containerExpensePaymentsTable.paidAt));

    if (payments.length === 0) {
      res.json({ payments: [], totalPaid: 0 }); return;
    }

    const categoryIds = [...new Set(payments.map(p => p.categoryId))];
    const bankIds = [...new Set(payments.map(p => p.bankId).filter(Boolean) as number[])];
    const userIds = [...new Set(payments.map(p => p.recordedBy).filter(Boolean) as number[])];

    const [cats, banks, users] = await Promise.all([
      db.select({ id: containerExpenseCategoriesTable.id, name: containerExpenseCategoriesTable.name })
        .from(containerExpenseCategoriesTable).where(inArray(containerExpenseCategoriesTable.id, categoryIds)),
      bankIds.length > 0
        ? db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable).where(inArray(banksTable.id, bankIds))
        : Promise.resolve([]),
      userIds.length > 0
        ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
        : Promise.resolve([]),
    ]);

    const catMap: Record<number, string> = {};
    cats.forEach(c => { catMap[c.id] = c.name; });
    const bankMap: Record<number, string> = {};
    banks.forEach(b => { bankMap[b.id] = b.name; });
    const userMap: Record<number, string> = {};
    users.forEach(u => { userMap[u.id] = u.name; });

    const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);

    res.json({
      payments: payments.map(p => ({
        id: p.id,
        containerId: p.containerId,
        categoryId: p.categoryId,
        categoryName: catMap[p.categoryId] ?? "Unknown",
        amount: parseFloat(p.amount ?? "0"),
        paymentMethod: p.paymentMethod as "cash" | "bank",
        bankId: p.bankId ?? null,
        bankName: p.bankId ? (bankMap[p.bankId] ?? null) : null,
        reference: p.reference ?? null,
        narration: p.narration ?? null,
        paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
        recordedBy: p.recordedBy ?? null,
        recordedByName: p.recordedBy ? (userMap[p.recordedBy] ?? null) : null,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      })),
      totalPaid,
    });
  } catch (err) {
    console.error("GET /containers/:id/expense-payments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Recent Payments (for module page) ───────────────────────────────────────

containerExpensesRouter.get("/container-expense-payments/recent", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);

    const payments = await db.select().from(containerExpensePaymentsTable)
      .orderBy(desc(containerExpensePaymentsTable.paidAt))
      .limit(limit);

    if (payments.length === 0) {
      res.json([]); return;
    }

    const containerIds = [...new Set(payments.map(p => p.containerId))];
    const categoryIds  = [...new Set(payments.map(p => p.categoryId))];
    const bankIds      = [...new Set(payments.map(p => p.bankId).filter(Boolean) as number[])];
    const userIds      = [...new Set(payments.map(p => p.recordedBy).filter(Boolean) as number[])];

    const [containers, cats, banks, users] = await Promise.all([
      db.select({ id: containersTable.id, containerNumber: containersTable.containerNumber, customerName: containersTable.customerName })
        .from(containersTable).where(inArray(containersTable.id, containerIds)),
      db.select({ id: containerExpenseCategoriesTable.id, name: containerExpenseCategoriesTable.name })
        .from(containerExpenseCategoriesTable).where(inArray(containerExpenseCategoriesTable.id, categoryIds)),
      bankIds.length > 0
        ? db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable).where(inArray(banksTable.id, bankIds))
        : Promise.resolve([]),
      userIds.length > 0
        ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
        : Promise.resolve([]),
    ]);

    const containerMap: Record<number, { containerNumber: string; customerName: string }> = {};
    containers.forEach(c => { containerMap[c.id] = { containerNumber: c.containerNumber, customerName: c.customerName }; });
    const catMap: Record<number, string> = {};
    cats.forEach(c => { catMap[c.id] = c.name; });
    const bankMap: Record<number, string> = {};
    banks.forEach(b => { bankMap[b.id] = b.name; });
    const userMap: Record<number, string> = {};
    users.forEach(u => { userMap[u.id] = u.name; });

    res.json(payments.map(p => ({
      id: p.id,
      containerId: p.containerId,
      containerNumber: containerMap[p.containerId]?.containerNumber ?? "—",
      customerName: containerMap[p.containerId]?.customerName ?? "—",
      categoryId: p.categoryId,
      categoryName: catMap[p.categoryId] ?? "Unknown",
      amount: parseFloat(p.amount ?? "0"),
      paymentMethod: p.paymentMethod as "cash" | "bank",
      bankId: p.bankId ?? null,
      bankName: p.bankId ? (bankMap[p.bankId] ?? null) : null,
      reference: p.reference ?? null,
      narration: p.narration ?? null,
      paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
      recordedBy: p.recordedBy ?? null,
      recordedByName: p.recordedBy ? (userMap[p.recordedBy] ?? null) : null,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    })));
  } catch (err) {
    console.error("GET /container-expense-payments/recent error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
