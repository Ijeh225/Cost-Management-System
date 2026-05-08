import { Router } from "express";
import { db, overheadExpensesTable, banksTable, usersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { requireAdmin, AuthRequest } from "../lib/auth.js";

export const overheadExpensesRouter = Router();

type ExpenseRow = {
  id: number; category: string; description: string; amount: string | null;
  bankId: number | null; paidAt: Date | string; reference: string | null;
  recordedBy: number | null; createdAt: Date | string; updatedAt: Date | string;
};
function formatExpense(row: ExpenseRow, bankName?: string | null, recordedByName?: string | null) {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    amount: parseFloat(row.amount ?? "0"),
    bankId: row.bankId ?? null,
    bankName: bankName ?? null,
    paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : row.paidAt,
    reference: row.reference ?? null,
    recordedBy: row.recordedBy ?? null,
    recordedByName: recordedByName ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

overheadExpensesRouter.get("/overhead-expenses", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const category = req.query.category as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [];
    if (category && category !== "all") conditions.push(eq(overheadExpensesTable.category, category));
    if (from) conditions.push(gte(overheadExpensesTable.paidAt, new Date(from)));
    if (to) {
      const toDate = new Date(to);
      toDate.setDate(toDate.getDate() + 1);
      conditions.push(lte(overheadExpensesTable.paidAt, toDate));
    }

    const rows = await db.select().from(overheadExpensesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(overheadExpensesTable.paidAt));

    const bankIds = [...new Set(rows.map(r => r.bankId).filter(Boolean))] as number[];
    const userIds = [...new Set(rows.map(r => r.recordedBy).filter(Boolean))] as number[];

    const bankMap: Record<number, string> = {};
    const userMap: Record<number, string> = {};

    if (bankIds.length > 0) {
      const banks = await db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable)
        .where(sql`${banksTable.id} = ANY(ARRAY[${sql.join(bankIds.map(id => sql`${id}`), sql`, `)}]::int[])`);
      banks.forEach(b => { bankMap[b.id] = b.name; });
    }
    if (userIds.length > 0) {
      const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(sql`${usersTable.id} = ANY(ARRAY[${sql.join(userIds.map(id => sql`${id}`), sql`, `)}]::int[])`);
      users.forEach(u => { userMap[u.id] = u.name; });
    }

    const expenses = rows.map(r => formatExpense(r, r.bankId ? bankMap[r.bankId] : null, r.recordedBy ? userMap[r.recordedBy] : null));

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisYearStart = new Date(now.getFullYear(), 0, 1);

    const totalThisMonth = expenses.filter(e => new Date(e.paidAt) >= thisMonthStart).reduce((s, e) => s + e.amount, 0);
    const totalThisYear = expenses.filter(e => new Date(e.paidAt) >= thisYearStart).reduce((s, e) => s + e.amount, 0);

    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    }

    res.json({ expenses, totalThisMonth, totalThisYear, byCategory });
  } catch (err) {
    console.error("GET /overhead-expenses error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { category, description, amount, bankId, paidAt, reference } = req.body;
    if (!category || !description || amount === undefined) {
      res.status(400).json({ error: "category, description and amount are required" });
      return;
    }
    const [row] = await db.insert(overheadExpensesTable).values({
      category,
      description,
      amount: String(amount),
      bankId: bankId ? Number(bankId) : null,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      reference: reference || null,
      recordedBy: req.user?.id ?? null,
    }).returning();
    res.status(201).json(formatExpense(row));
  } catch (err) {
    console.error("POST /overhead-expenses error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.patch("/overhead-expenses/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { category, description, amount, bankId, paidAt, reference } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (category !== undefined) updates.category = category;
    if (description !== undefined) updates.description = description;
    if (amount !== undefined) updates.amount = String(amount);
    if (bankId !== undefined) updates.bankId = bankId ? Number(bankId) : null;
    if (paidAt !== undefined) updates.paidAt = new Date(paidAt);
    if (reference !== undefined) updates.reference = reference || null;
    const [row] = await db.update(overheadExpensesTable).set(updates).where(eq(overheadExpensesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Expense not found" }); return; }
    res.json(formatExpense(row));
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
