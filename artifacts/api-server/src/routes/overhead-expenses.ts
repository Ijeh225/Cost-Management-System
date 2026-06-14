import { Router } from "express";
import { db, overheadExpensesTable, overheadExpenseTopupsTable, expenseCategoriesTable, expensePaymentsTable, banksTable, usersTable, branchesTable, paymentSchedulesTable, paymentScheduleEventsTable, workflowNotificationsTable } from "@workspace/db";
import { eq, desc, and, gte, lte, inArray, sql } from "drizzle-orm";
import { requireBranchAdminOrAbove, AuthRequest, userCanAccessBranch, getBranchScope, resolveCreateBranch } from "../lib/auth.js";

export const overheadExpensesRouter = Router();

// ─── Helper ──────────────────────────────────────────────────────────────────

async function buildExpensesWithPayments(expenseRows: (typeof overheadExpensesTable.$inferSelect)[]) {
  if (expenseRows.length === 0) return [];

  const expenseIds = expenseRows.map(r => r.id);

  const allPayments = await db.select().from(expensePaymentsTable)
    .where(inArray(expensePaymentsTable.expenseId, expenseIds))
    .orderBy(expensePaymentsTable.paidAt);
  const allTopups = await db.select().from(overheadExpenseTopupsTable)
    .where(inArray(overheadExpenseTopupsTable.expenseId, expenseIds))
    .orderBy(desc(overheadExpenseTopupsTable.createdAt));
  const allSchedules = await db.select().from(paymentSchedulesTable)
    .where(inArray(paymentSchedulesTable.overheadExpenseId, expenseIds))
    .orderBy(desc(paymentSchedulesTable.createdAt));
  const scheduleIds = allSchedules.map(s => s.id);
  const allScheduleEvents = scheduleIds.length > 0
    ? await db.select().from(paymentScheduleEventsTable)
      .where(inArray(paymentScheduleEventsTable.scheduleId, scheduleIds))
      .orderBy(desc(paymentScheduleEventsTable.createdAt))
    : [];

  const bankIds = [...new Set(allPayments.map(p => p.bankId).filter(Boolean) as number[])];
  const bankMap: Record<number, string> = {};
  if (bankIds.length > 0) {
    const banks = await db.select({ id: banksTable.id, name: banksTable.name })
      .from(banksTable).where(inArray(banksTable.id, bankIds));
    banks.forEach(b => { bankMap[b.id] = b.name; });
  }

  const expUserIds = expenseRows.map(r => r.recordedBy).filter(Boolean) as number[];
  const pmtUserIds = allPayments.map(p => p.recordedBy).filter(Boolean) as number[];
  const topupUserIds = allTopups.map(t => t.recordedBy).filter(Boolean) as number[];
  const userIds = [...new Set([...expUserIds, ...pmtUserIds, ...topupUserIds])];
  const userMap: Record<number, string> = {};
  if (userIds.length > 0) {
    const users = await db.select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable).where(inArray(usersTable.id, userIds));
    users.forEach(u => { userMap[u.id] = u.name; });
  }

  const branchIds = [...new Set(expenseRows.map(r => r.branchId).filter(Boolean) as number[])];
  const branchMap: Record<number, string> = {};
  if (branchIds.length > 0) {
    const branchRows = await db.select({ id: branchesTable.id, name: branchesTable.name })
      .from(branchesTable).where(inArray(branchesTable.id, branchIds));
    branchRows.forEach(b => { branchMap[b.id] = b.name; });
  }

  const paymentsByExpense: Record<number, typeof allPayments> = {};
  for (const p of allPayments) {
    if (!paymentsByExpense[p.expenseId]) paymentsByExpense[p.expenseId] = [];
    paymentsByExpense[p.expenseId].push(p);
  }
  const topupsByExpense: Record<number, typeof allTopups> = {};
  for (const t of allTopups) {
    if (!topupsByExpense[t.expenseId]) topupsByExpense[t.expenseId] = [];
    topupsByExpense[t.expenseId].push(t);
  }
  const schedulesByExpense: Record<number, typeof allSchedules> = {};
  for (const s of allSchedules) {
    if (!s.overheadExpenseId) continue;
    if (!schedulesByExpense[s.overheadExpenseId]) schedulesByExpense[s.overheadExpenseId] = [];
    schedulesByExpense[s.overheadExpenseId].push(s);
  }
  const latestEventBySchedule: Record<number, (typeof allScheduleEvents)[number]> = {};
  for (const event of allScheduleEvents) {
    if (!latestEventBySchedule[event.scheduleId]) latestEventBySchedule[event.scheduleId] = event;
  }

  return expenseRows.map(e => {
    const payments = paymentsByExpense[e.id] ?? [];
    const topups = topupsByExpense[e.id] ?? [];
    const schedules = schedulesByExpense[e.id] ?? [];
    const activeSchedules = schedules.filter(s => !["rejected", "cancelled"].includes(s.status));
    const approvedSchedules = activeSchedules.filter(s => ["partially_approved", "approved", "paid", "completed"].includes(s.status));
    const scheduledRequestedTotal = activeSchedules.reduce((sum, s) => sum + parseFloat(s.amountRequested ?? "0"), 0);
    const scheduledApprovedTotal = approvedSchedules.reduce((sum, s) => sum + parseFloat(s.amountApproved ?? "0"), 0);
    const scheduledPaidTotal = activeSchedules.reduce((sum, s) => sum + parseFloat(s.amountPaid ?? "0"), 0);
    const scheduledPendingApprovedTotal = approvedSchedules.reduce((sum, s) => {
      const approved = parseFloat(s.amountApproved ?? "0");
      const paid = parseFloat(s.amountPaid ?? "0");
      return sum + Math.max(0, approved - paid);
    }, 0);
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
      branchId: e.branchId,
      branchName: e.branchId ? (branchMap[e.branchId] ?? null) : null,
      recordedBy: e.recordedBy ?? null,
      recordedByName: e.recordedBy ? (userMap[e.recordedBy] ?? null) : null,
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : String(e.createdAt),
      updatedAt: e.updatedAt instanceof Date ? e.updatedAt.toISOString() : String(e.updatedAt),
      totalPaid,
      balance,
      status,
      scheduledRequestedTotal,
      scheduledApprovedTotal,
      scheduledPaidTotal,
      scheduledPendingApprovedTotal,
      hasApprovedPendingPayment: scheduledPendingApprovedTotal > 0,
      paymentSchedules: schedules.map(s => ({
        id: s.id,
        status: s.status,
        scheduleDate: s.scheduleDate instanceof Date ? s.scheduleDate.toISOString() : String(s.scheduleDate),
        amountRequested: parseFloat(s.amountRequested ?? "0"),
        amountApproved: parseFloat(s.amountApproved ?? "0"),
        amountPaid: parseFloat(s.amountPaid ?? "0"),
        balance: Math.max(0, (parseFloat(s.amountApproved ?? "0") || parseFloat(s.amountRequested ?? "0")) - parseFloat(s.amountPaid ?? "0")),
        priority: s.priority,
        latestEventType: latestEventBySchedule[s.id]?.type ?? null,
        latestComment: latestEventBySchedule[s.id]?.comment ?? null,
        latestEventAt: latestEventBySchedule[s.id]?.createdAt instanceof Date ? latestEventBySchedule[s.id].createdAt.toISOString() : latestEventBySchedule[s.id]?.createdAt ? String(latestEventBySchedule[s.id].createdAt) : null,
        createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      })),
      topups: topups.map(t => ({
        id: t.id,
        expenseId: t.expenseId,
        amount: parseFloat(t.amount ?? "0"),
        description: t.description,
        recordedBy: t.recordedBy ?? null,
        recordedByName: t.recordedBy ? (userMap[t.recordedBy] ?? null) : null,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      })),
      payments: payments.map(p => ({
        id: p.id,
        expenseId: p.expenseId,
        amount: parseFloat(p.amount ?? "0"),
        paymentMethod: (p.paymentMethod ?? "cash") as "cash" | "bank",
        bankId: p.bankId ?? null,
        bankName: p.bankId ? (bankMap[p.bankId] ?? null) : null,
        paymentScheduleId: p.paymentScheduleId ?? null,
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

overheadExpensesRouter.get("/overhead-expenses/categories", requireBranchAdminOrAbove, async (_req, res) => {
  try {
    const bScope = getBranchScope(_req as AuthRequest);
    const rows = await db.select().from(expenseCategoriesTable)
      .where(bScope !== null ? eq(expenseCategoriesTable.branchId, bScope) : undefined)
      .orderBy(expenseCategoriesTable.name);
    return res.json(rows.map(r => ({
      id: r.id, name: r.name, isDefault: r.isDefault, createdBy: r.createdBy ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })));
  } catch (err) {
    console.error("GET /overhead-expenses/categories error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses/categories", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    const [row] = await db.insert(expenseCategoriesTable).values({
      name: name.trim(), isDefault: false, createdBy: req.user?.id ?? null,
      branchId: createBranchId,
    }).returning();
    return res.status(201).json({ id: row.id, name: row.name, isDefault: row.isDefault, createdBy: row.createdBy ?? null, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt) });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Category name already exists" }); return; }
    console.error("POST /overhead-expenses/categories error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.patch("/overhead-expenses/categories/:id", requireBranchAdminOrAbove, async (_req: AuthRequest, res) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name } = _req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Category name is required" });
    }
    const [existing] = await db.select({ branchId: expenseCategoriesTable.branchId })
      .from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
    if (!existing || !userCanAccessBranch(_req, existing.branchId)) { res.status(404).json({ error: "Category not found" }); return; }
    const [row] = await db.update(expenseCategoriesTable).set({ name: name.trim() })
      .where(eq(expenseCategoriesTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Category not found" }); return; }
    return res.json({ id: row.id, name: row.name, isDefault: row.isDefault, createdBy: row.createdBy ?? null, createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt) });
  } catch (err: any) {
    if (err.code === "23505") { res.status(409).json({ error: "Category name already exists" }); return; }
    console.error("PATCH /overhead-expenses/categories/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.delete("/overhead-expenses/categories/:id", requireBranchAdminOrAbove, async (_req: AuthRequest, res) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [cat] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
    if (!cat || !userCanAccessBranch(_req, cat.branchId)) { res.status(404).json({ error: "Category not found" }); return; }
    if (cat.isDefault) { res.status(400).json({ error: "Cannot delete default categories" }); return; }
    await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /overhead-expenses/categories/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Expenses ────────────────────────────────────────────────────────────────

overheadExpensesRouter.get("/overhead-expenses", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const category = req.query.category as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const status = req.query.status as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [];
    // Task #74: branch scope from X-Branch-Id header.
    const bScope = getBranchScope(req);
    if (bScope !== null) conditions.push(eq(overheadExpensesTable.branchId, bScope));
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

    return res.json({ expenses, totalOutstanding, totalPaidThisMonth, totalPaidThisYear, byCategory });
  } catch (err) {
    console.error("GET /overhead-expenses error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const { category, description, amount, reference } = req.body;
    if (!category || !description || amount === undefined) {
      return res.status(400).json({ error: "category, description and amount are required" });
    }
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    const [row] = await db.insert(overheadExpensesTable).values({
      category, description, amount: String(amount),
      bankId: null,
      reference: reference || null, recordedBy: req.user?.id ?? null,
      branchId: createBranchId,
    }).returning();
    const [built] = await buildExpensesWithPayments([row]);
    return res.status(201).json(built);
  } catch (err) {
    console.error("POST /overhead-expenses error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.patch("/overhead-expenses/:id", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select({ branchId: overheadExpensesTable.branchId }).from(overheadExpensesTable).where(eq(overheadExpensesTable.id, id));
    if (!existing || !userCanAccessBranch(req, existing.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
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
    return res.json(built);
  } catch (err) {
    console.error("PATCH /overhead-expenses/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.delete("/overhead-expenses/:id", requireBranchAdminOrAbove, async (_req: AuthRequest, res) => {
  try {
    const id = Number(_req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select({ branchId: overheadExpensesTable.branchId }).from(overheadExpensesTable).where(eq(overheadExpensesTable.id, id));
    if (!existing || !userCanAccessBranch(_req, existing.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
    await db.delete(overheadExpensesTable).where(eq(overheadExpensesTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /overhead-expenses/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Payments ────────────────────────────────────────────────────────────────

overheadExpensesRouter.post("/overhead-expenses/:id/topups", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const expenseId = Number(req.params.id);
    if (isNaN(expenseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { amount, description } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!description || typeof description !== "string" || !description.trim()) {
      return res.status(400).json({ error: "Description is required" });
    }

    const [expense] = await db.select().from(overheadExpensesTable)
      .where(eq(overheadExpensesTable.id, expenseId));
    if (!expense || !userCanAccessBranch(req, expense.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
    const scope = getBranchScope(req);
    if (scope !== null && expense.branchId !== scope) { res.status(404).json({ error: "Expense not found" }); return; }
    if (scope === null && req.user?.role === "super_admin") {
      return res.status(400).json({ error: "Select a specific branch to add money to this expense." });
    }

    await db.insert(overheadExpenseTopupsTable).values({
      expenseId,
      amount: String(amount),
      description: description.trim(),
      recordedBy: req.user?.id ?? null,
      branchId: expense.branchId,
    });

    const [updated] = await db.update(overheadExpensesTable)
      .set({
        amount: sql`${overheadExpensesTable.amount} + ${String(amount)}`,
        updatedAt: new Date(),
      })
      .where(eq(overheadExpensesTable.id, expenseId))
      .returning();

    const [built] = await buildExpensesWithPayments([updated]);
    return res.status(201).json(built);
  } catch (err) {
    console.error("POST /overhead-expenses/:id/topups error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses/:id/payment-schedules", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const expenseId = Number(req.params.id);
    if (isNaN(expenseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [expense] = await db.select().from(overheadExpensesTable)
      .where(eq(overheadExpensesTable.id, expenseId));
    if (!expense || !userCanAccessBranch(req, expense.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
    const scope = getBranchScope(req);
    if (scope !== null && expense.branchId !== scope) { res.status(404).json({ error: "Expense not found" }); return; }
    if (scope === null && req.user?.role === "super_admin") {
      return res.status(400).json({ error: "Select a specific branch to schedule this expense." });
    }

    const [builtExpense] = await buildExpensesWithPayments([expense]);
    const outstanding = builtExpense.balance;
    if (outstanding <= 0.005) {
      return res.status(400).json({ error: "This overhead expense is already fully paid." });
    }

    const amount = req.body.amountRequested != null ? Number(req.body.amountRequested) : outstanding;
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount requested must be greater than zero" });
    }
    if (amount > outstanding + 0.005) {
      return res.status(400).json({ error: "Cannot schedule more than the outstanding overhead balance" });
    }

    const scheduleDate = req.body.scheduleDate ? new Date(String(req.body.scheduleDate)) : new Date();
    if (Number.isNaN(scheduleDate.getTime())) {
      return res.status(400).json({ error: "Valid scheduleDate is required" });
    }
    const priority = ["low", "normal", "urgent"].includes(req.body.priority) ? req.body.priority : "normal";
    const vendorBeneficiary = typeof req.body.vendorBeneficiary === "string" && req.body.vendorBeneficiary.trim()
      ? req.body.vendorBeneficiary.trim()
      : expense.category;
    const description = typeof req.body.description === "string" && req.body.description.trim()
      ? req.body.description.trim()
      : expense.description;

    const [schedule] = await db.insert(paymentSchedulesTable).values({
      branchId: expense.branchId,
      scheduleDate,
      originalRequestDate: new Date(),
      requestedById: req.user?.id ?? null,
      overheadExpenseId: expense.id,
      vendorBeneficiary,
      clientName: req.body.clientName?.trim() || null,
      description,
      amountRequested: String(amount),
      amountApproved: "0",
      amountPaid: "0",
      priority,
      status: "pending_approval",
    }).returning();

    await db.insert(paymentScheduleEventsTable).values({
      branchId: expense.branchId,
      scheduleId: schedule.id,
      type: "created_from_overhead",
      actorUserId: req.user?.id ?? null,
      comment: `Scheduled from overhead expense #${expense.id}.`,
      newStatus: "pending_approval",
    });

    try {
      const adminUsers = await db.select({ id: usersTable.id, role: usersTable.role, branchId: usersTable.branchId })
        .from(usersTable)
        .where(eq(usersTable.isActive, true));
      const targets = adminUsers
        .filter(u => u.role === "super_admin" || (u.role === "admin" && u.branchId === expense.branchId))
        .map(u => u.id);
      if (targets.length > 0) {
        await db.insert(workflowNotificationsTable).values([...new Set(targets)].map(targetUserId => ({
          branchId: expense.branchId,
          type: "payment_schedule_created",
          message: `${req.user?.name ?? "A user"} scheduled overhead payment ${amount.toLocaleString("en-NG")} for ${vendorBeneficiary}`,
          targetUserId,
        })));
      }
    } catch (notifyErr) {
      console.warn("[overhead-expenses] payment schedule notification warning:", notifyErr);
    }

    const [updatedExpense] = await buildExpensesWithPayments([expense]);
    return res.status(201).json({ schedule, expense: updatedExpense });
  } catch (err) {
    console.error("POST /overhead-expenses/:id/payment-schedules error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

overheadExpensesRouter.post("/overhead-expenses/:id/payments", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const expenseId = Number(req.params.id);
    if (isNaN(expenseId)) { res.status(400).json({ error: "Invalid id" }); return; }

    const { amount, paymentMethod, bankId, paidAt, notes } = req.body;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }
    if (!paymentMethod || !["cash", "bank"].includes(paymentMethod)) {
      return res.status(400).json({ error: "paymentMethod must be 'cash' or 'bank'" });
    }
    if (paymentMethod === "bank" && !bankId) {
      return res.status(400).json({ error: "bankId is required for bank payments" });
    }

    const [expense] = await db.select().from(overheadExpensesTable)
      .where(eq(overheadExpensesTable.id, expenseId));
    if (!expense || !userCanAccessBranch(req, expense.branchId)) { res.status(404).json({ error: "Expense not found" }); return; }
    {
      const _scope = getBranchScope(req);
      if (_scope !== null && expense.branchId !== _scope) { res.status(404).json({ error: "Expense not found" }); return; }
      if (_scope === null && req.user?.role === "super_admin") {
        return res.status(400).json({ error: "Select a specific branch to record a payment." });
      }
    }
    if (paymentMethod === "bank" && bankId) {
      const [bk] = await db.select({ branchId: banksTable.branchId }).from(banksTable).where(eq(banksTable.id, Number(bankId)));
      if (bk && bk.branchId !== expense.branchId) {
        return res.status(400).json({ error: "Selected bank belongs to a different branch than the expense." });
      }
    }

    const paymentDate = paidAt ? new Date(paidAt) : new Date();

    const [payment] = await db.insert(expensePaymentsTable).values({
      expenseId,
      amount: String(amount),
      paymentMethod,
      bankId: paymentMethod === "bank" && bankId ? Number(bankId) : null,
      paidAt: paymentDate,
      notes: notes || null,
      recordedBy: req.user?.id ?? null,
      branchId: expense.branchId,
    }).returning();

    // Set paidAt on the parent expense to the date of the first payment recorded
    if (expense.paidAt === null) {
      await db.update(overheadExpensesTable)
        .set({ paidAt: paymentDate, updatedAt: new Date() })
        .where(eq(overheadExpensesTable.id, expenseId));
    }

    const [refreshedExpense] = await db.select().from(overheadExpensesTable)
      .where(eq(overheadExpensesTable.id, expenseId));
    const [updatedExpense] = await buildExpensesWithPayments([refreshedExpense]);
    return res.status(201).json({ payment, expense: updatedExpense });
  } catch (err) {
    console.error("POST /overhead-expenses/:id/payments error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
