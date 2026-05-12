import { Router } from "express";
import { db, overheadExpensesTable, expenseCategoriesTable, expensePaymentsTable, banksTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";
import { requireAdmin, AuthRequest } from "../lib/auth.js";

export const overheadExpensesRouter = Router();

// ─── Helper ──────────────────────────────────────────────────────────────────

async function buildExpensesWithPayments(expenseRows: (typeof overheadExpensesTable.$inferSelect)[]) {
  if (expenseRows.length === 0) return [];

  const expenseIds = expenseRows.map(r => r.id);

  const allPayments = await db.select().from(expensePaymentsTable)
    .where(inArray(expensePaymentsTable.expenseId, expenseIds))
    .orderBy(expensePaymentsTable.paidAt);

  const bankIds = [...new Set(allPayments.map(p => p.bankId).filter(Boolean) as number[])];
  const bankMap: Record<number, string> = {};
  if (bankIds.length > 0) {
    const banks = await db.select({ id: banksTable.id, name: banksTable.name })
      .from(banksTable).where(inArray(banksTable.id, bankIds));
    banks.forEach(b => { bankMap[b.id] = b.name; });
  }

  const expUserIds = expenseRows.map(r => r.recordedBy).filter(Boolean) as number[];
  const pmtUserIds = allPayments.map(p => p.recordedBy).filter(Boolean) as number[];
  const userIds = [...new Set([...expUserIds, ...pmtUserIds])];
  const userMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(inArray(usersTable.id, userIds));
    users.forEach(u => { userMap[u.id] = u.name; });
  }

  const paymentsByExpense: Record<number, typeof allPayments> = {};
  for (const p of allPayments) {
    if (!paymentsByExpense[p.expenseId]) paymentsByExpense[p.expenseId] = [];
    paymentsByExpense[p.expenseId].push(p);
  }

  return expenseRows.map(e => {
    const payments = paymentsByExpense[e.id] ?? [];
    const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
    const totalAmount = parseFloat(e.amount ?? "0");
    const balance = Math.max(0, totalAmount - totalPaid);
    const status: "unpaid" | "partial" | "paid" =
      totalPaid <= 0 ? "unpaid" : balance <= 0.005 ? "paid" : "partial";

    return {
      id: e.id,
      category: e.category,
      description: e.description,
      amount: totalAmount,
      reference: e.reference ?? null,
      recordedBy: e.recordedBy ?? null,
      recordedByName: e.recordedBy ? (userMap[e.recordedBy] ?? null) : null,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
      totalPaid,
      balance,
      status,
      payments: payments.map(p => ({
        id: p.id,
        expenseId: p.expenseId,
        amount: parseFloat(p.amount ?? "0"),
        paymentMethod: (p.paymentMethod ?? "cash") as "cash" | "bank",
        bankId: p.bankId ?? null,
        bankName: p.bankId ? (bankMap[p.bankId] ?? null) : null,
        paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : String(p.paidAt),
        notes: p.notes ?? null,
        recordedBy: p.recordedBy ?? null,
        recordedByName: p.recordedBy ? (userMap[p.recordedBy] ?? null) : null,
        createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      })),
    };
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────

overheadExpensesRouter.get("/overhead-expenses/categories", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
    res.json(rows.map(r => ({
      id: r.id, name: r.name, isDefault: r.isDefault, createdBy: r.createdBy ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })));
  } catch (err) {
    console.error("GET /overhead-expenses/categories error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses/categories", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Category name is required" }); return;
    }
    const [row] = await db.insert(expenseCategoriesTable).values({
      name: name.trim(), isDefault: false, createdBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json({ id: row.id, name: row.name, isDefault: row.isDefault, createdBy: row.createdBy ?? null, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt) });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Category name already exists" }); return; }
    console.error("POST /overhead-expenses/categories error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.patch("/overhead-expenses/categories/:id", requireAdmin, async (_req: AuthRequest, res) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name } = _req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Category name is required" }); return;
    }
    const [row] = await db.update(expenseCategoriesTable).set({ name: name.trim() })
      .where(eq(expenseCategoriesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Category not found" }); return; }
    res.json({ id: row.id, name: row.name, isDefault: row.isDefault, createdBy: row.createdBy ?? null, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt) });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Category name already exists" }); return; }
    console.error("PATCH /overhead-expenses/categories/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.delete("/overhead-expenses/categories/:id", requireAdmin, async (_req, res) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [cat] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
    if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
    if (cat.isDefault) { res.status(400).json({ error: "Cannot delete default categories" }); return; }
    await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /overhead-expenses/categories/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Expenses ────────────────────────────────────────────────────────────────

overheadExpensesRouter.get("/overhead-expenses", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const category = req.query.category as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const status = req.query.status as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [];
    if (category && category !== "all") conditions.push(eq(overheadExpensesTable.category, category));
    if (from) conditions.push(gte(overheadExpensesTable.createdAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      conditions.push(lte(overheadExpensesTable.createdAt, toDate));
    }

    const rows = await db.select().from(overheadExpensesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(overheadExpensesTable.createdAt));

    const allExpenses = await buildExpensesWithPayments(rows);
    const expenses = status && status !== "all"
      ? allExpenses.filter(e => e.status === status)
      : allExpenses;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYearStart = new Date(now.getFullYear(), 0, 1);

    const totalOutstanding = allExpenses.reduce((s, e) => s + e.balance, 0);
    const totalPaidThisMonth = allExpenses
      .flatMap(e => e.payments).filter(p => new Date(p.paidAt) >= thisMonthStart)
      .reduce((s, p) => s + p.amount, 0);
    const totalPaidThisYear = allExpenses
      .flatMap(e => e.payments).filter(p => new Date(p.paidAt) >= thisYearStart)
      .reduce((s, p) => s + p.amount, 0);

    const byCategory: Record<string, number> = {};
    for (const e of allExpenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    }

    res.json({ expenses, totalOutstanding, totalPaidThisMonth, totalPaidThisYear, byCategory });
  } catch (err) {
    console.error("GET /overhead-expenses error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { category, description, amount, reference } = req.body;
    if (!category || !description || amount === undefined) {
      res.status(400).json({ error: "category, description and amount are required" }); return;
    }
    const [row] = await db.insert(overheadExpensesTable).values({
      category, description, amount: String(amount),
      bankId: null,
      reference: reference || null, recordedBy: req.user?.id ?? null,
    }).returning();
    const [built] = await buildExpensesWithPayments([row]);
    res.status(201).json(built);
  } catch (err) {
    console.error("POST /overhead-expenses error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.patch("/overhead-expenses/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { category, description, amount, reference } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (amount !== undefined) updates.amount = String(amount);
    if (reference !== undefined) updates.reference = reference || null;
    const [row] = await db.update(overheadExpensesTable).set(updates)
      .where(eq(overheadExpensesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
    const [built] = await buildExpensesWithPayments([row]);
    res.json(built);
  } catch (err) {
    console.error("PATCH /overhead-expenses/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.delete("/overhead-expenses/:id", requireAdmin, async (_req, res) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(overheadExpensesTable).where(eq(overheadExpensesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /overhead-expenses/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Payments ────────────────────────────────────────────────────────────────

overheadExpensesRouter.post("/overhead-expenses/:id/payments", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const expenseId = Number(req.params.id);
    if (isNaN(expenseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { amount, paymentMethod, bankId, paidAt, notes } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      res.status(400).json({ error: "Amount must be a positive number" }); return;
    }
    if (!paymentMethod || !["cash", "bank"].includes(paymentMethod)) {
      res.status(400).json({ error: "paymentMethod must be 'cash' or 'bank'" }); return;
    }
    if (paymentMethod === "bank" && !bankId) {
      res.status(400).json({ error: "bankId is required for bank payments" }); return;
    }

    const [expense] = await db.select().from(overheadExpensesTable)
      .where(eq(overheadExpensesTable.id, expenseId));
    if (!expense) { res.status(404).json({ error: "Expense not found" }); return; }

    const [payment] = await db.insert(expensePaymentsTable).values({
      expenseId,
      amount: String(amount),
      paymentMethod,
      bankId: paymentMethod === "bank" && bankId ? Number(bankId) : null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      notes: notes || null,
      recordedBy: req.user?.id ?? null,
    }).returning();

    const [updatedExpense] = await buildExpensesWithPayments([expense]);
    res.status(201).json({ payment, expense: updatedExpense });
  } catch (err) {
    console.error("POST /overhead-expenses/:id/payments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
