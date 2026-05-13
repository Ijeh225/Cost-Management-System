import { Router } from "express";
import {
  db, containerExpenseCategoriesTable, containerExpensePaymentsTable, banksTable,
  containersTable, usersTable, auditLogTable,
  shippingChargesTable, customsChargesTable, terminalChargesTable,
  deliveryChargesTable, operationsChargesTable, containerExtraChargesTable,
} from "@workspace/db";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { requireAdmin, AuthRequest, userCanAccessBranch, getBranchScope, resolveCreateBranch } from "../lib/auth.js";

export const containerExpensesRouter = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const EXCLUDE_KEYS = new Set(["id", "containerId", "updatedAt"]);

function sumRow(row: Record<string, unknown>): number {
  return Object.entries(row).reduce((s, [k, v]) => {
    if (EXCLUDE_KEYS.has(k)) return s;
    const n = parseFloat(String(v ?? "0"));
    return s + (isNaN(n) ? 0 : n);
  }, 0);
}

async function getSectionChargedTotals(containerId: number): Promise<Record<string, number>> {
  const [shippingRow, customsRow, terminalRow, deliveryRow, operationsRow, extraRows] = await Promise.all([
    db.select().from(shippingChargesTable).where(eq(shippingChargesTable.containerId, containerId)),
    db.select().from(customsChargesTable).where(eq(customsChargesTable.containerId, containerId)),
    db.select().from(terminalChargesTable).where(eq(terminalChargesTable.containerId, containerId)),
    db.select().from(deliveryChargesTable).where(eq(deliveryChargesTable.containerId, containerId)),
    db.select().from(operationsChargesTable).where(eq(operationsChargesTable.containerId, containerId)),
    db.select({ section: containerExtraChargesTable.section, amount: containerExtraChargesTable.amount })
      .from(containerExtraChargesTable).where(eq(containerExtraChargesTable.containerId, containerId)),
  ]);

  const extraBySection: Record<string, number> = {};
  for (const r of extraRows) {
    const sec = r.section;
    if (sec) {
      extraBySection[sec] = (extraBySection[sec] ?? 0) + parseFloat(r.amount ?? "0");
    }
  }

  return {
    shipping:   (shippingRow[0]   ? sumRow(shippingRow[0]   as Record<string, unknown>) : 0) + (extraBySection.shipping   ?? 0),
    customs:    (customsRow[0]    ? sumRow(customsRow[0]    as Record<string, unknown>) : 0) + (extraBySection.customs    ?? 0),
    terminal:   (terminalRow[0]   ? sumRow(terminalRow[0]   as Record<string, unknown>) : 0) + (extraBySection.terminal   ?? 0),
    delivery:   (deliveryRow[0]   ? sumRow(deliveryRow[0]   as Record<string, unknown>) : 0) + (extraBySection.delivery   ?? 0),
    operations: (operationsRow[0] ? sumRow(operationsRow[0] as Record<string, unknown>) : 0) + (extraBySection.operations ?? 0),
  };
}

// ─── Categories ──────────────────────────────────────────────────────────────

containerExpensesRouter.get("/container-expense-categories", requireAdmin, async (_req, res) => {
  try {
    const branchScope = getBranchScope(_req as AuthRequest);
    const rows = await db.select().from(containerExpenseCategoriesTable)
      .where(branchScope !== null ? eq(containerExpenseCategoriesTable.branchId, branchScope) : undefined)
      .orderBy(containerExpenseCategoriesTable.name);
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
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    const [row] = await db.insert(containerExpenseCategoriesTable).values({
      name: name.trim(), isDefault: false, createdBy: req.user?.id ?? null,
      branchId: createBranchId,
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

containerExpensesRouter.delete("/container-expense-categories/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [cat] = await db.select().from(containerExpenseCategoriesTable).where(eq(containerExpenseCategoriesTable.id, id));
    if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
    if (!userCanAccessBranch(req, cat.branchId)) { res.status(403).json({ error: "Category belongs to another branch." }); return; }
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
    const { items, categoryId, section, bankId, paymentMethod, reference, narration, paidAt } = req.body as {
      items: { containerId: number; amount: number }[];
      categoryId?: number | null;
      section?: string | null;
      bankId?: number | null;
      paymentMethod: "cash" | "bank";
      reference?: string;
      narration?: string;
      paidAt?: string;
    };

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "items array is required" }); return;
    }
    if (!section && !categoryId) {
      res.status(400).json({ error: "Either section or categoryId is required" }); return;
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

    let catName = "";
    let catBranchId: number | null = null;
    if (categoryId) {
      const [cat] = await db.select().from(containerExpenseCategoriesTable)
        .where(eq(containerExpenseCategoriesTable.id, Number(categoryId)));
      if (!cat) { res.status(404).json({ error: "Category not found" }); return; }
      catName = cat.name;
      catBranchId = cat.branchId;
    } else if (section) {
      const LABELS: Record<string, string> = {
        shipping: "Shipping", customs: "Customs", terminal: "Terminal",
        delivery: "Delivery", operations: "Operations",
      };
      catName = LABELS[section] ?? section;
    }

    if (paymentMethod === "bank" && bankId) {
      const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, Number(bankId)));
      if (!bank) { res.status(404).json({ error: "Bank not found" }); return; }
    }

    const paidAtDate = paidAt ? new Date(paidAt) : new Date();
    const resolvedBankId = paymentMethod === "bank" && bankId ? Number(bankId) : null;
    const resolvedCategoryId = categoryId ? Number(categoryId) : null;
    const resolvedSection = section ?? null;
    const actorId = req.user?.id ?? null;

    const containerIds = Array.from(new Set(items.map(i => Number(i.containerId))));
    const containerRows = await db.select({ id: containersTable.id, branchId: containersTable.branchId })
      .from(containersTable).where(inArray(containersTable.id, containerIds));
    const branchByContainer = new Map<number, number>(containerRows.map(c => [c.id, c.branchId]));
    if (branchByContainer.size !== containerIds.length) {
      res.status(404).json({ error: "One or more containers not found" }); return;
    }

    // Cross-branch posting guard (Task #149): non super-admin users may only
    // record container payments against containers in their own branch.
    if (req.user!.role !== "super_admin") {
      for (const cid of containerIds) {
        if (branchByContainer.get(cid) !== req.user!.branchId) {
          res.status(403).json({ error: "Cannot record a payment against a container in another branch." });
          return;
        }
      }
    }
    // Category guard: when a category is selected, it must belong to the same
    // branch as every container being posted against (Task #149).
    if (catBranchId !== null) {
      for (const cid of containerIds) {
        if (branchByContainer.get(cid) !== catBranchId) {
          res.status(400).json({ error: "Selected category belongs to a different branch than one of the containers." });
          return;
        }
      }
    }
    // Bank guard: chosen bank must belong to the same branch as each container.
    if (resolvedBankId) {
      const [bk] = await db.select({ branchId: banksTable.branchId }).from(banksTable).where(eq(banksTable.id, resolvedBankId));
      if (bk) {
        for (const cid of containerIds) {
          if (branchByContainer.get(cid) !== bk.branchId) {
            res.status(400).json({ error: "Selected bank belongs to a different branch than one of the containers." });
            return;
          }
        }
      }
    }

    const inserted = await db.transaction(async (tx) => {
      const payments = await tx.insert(containerExpensePaymentsTable).values(
        items.map(item => ({
          containerId: Number(item.containerId),
          branchId: branchByContainer.get(Number(item.containerId))!,
          categoryId: resolvedCategoryId,
          section: resolvedSection,
          amount: String(item.amount),
          paymentMethod,
          bankId: resolvedBankId,
          reference: reference || null,
          narration: narration || null,
          paidAt: paidAtDate,
          recordedBy: actorId,
        }))
      ).returning();

      // Sync dutyPaid in customs_charges when a customs section disbursement is recorded.
      // This keeps the Duty Payments page in sync with Container Payments.
      if (resolvedSection === "customs") {
        for (const item of items) {
          const cid = Number(item.containerId);
          const amt = Number(item.amount);
          const [customs] = await tx
            .select({ duty: customsChargesTable.duty, dutyPaid: customsChargesTable.dutyPaid })
            .from(customsChargesTable)
            .where(eq(customsChargesTable.containerId, cid));
          if (customs) {
            const duty = parseFloat(customs.duty ?? "0");
            const currentPaid = parseFloat(customs.dutyPaid ?? "0");
            const newPaid = currentPaid + amt;
            const newOutstanding = duty > 0 ? Math.max(duty - newPaid, 0) : 0;
            await tx.update(customsChargesTable)
              .set({ dutyPaid: String(newPaid), dutyNotPaid: String(newOutstanding), updatedAt: new Date() })
              .where(eq(customsChargesTable.containerId, cid));
          }
        }
      }

      if (actorId && payments.length > 0) {
        await tx.insert(auditLogTable).values(
          payments.map(p => ({
            containerId: p.containerId,
            branchId: branchByContainer.get(p.containerId)!,
            userId: actorId,
            action: "expense_payment_recorded" as const,
            section: resolvedSection ?? "payments",
            newValue: JSON.stringify({
              paymentId: p.id,
              section: resolvedSection,
              category: catName,
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
      categoryId: p.categoryId ?? null,
      section: p.section ?? null,
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

// ─── Section Payment Summary ──────────────────────────────────────────────────

containerExpensesRouter.get("/containers/:id/expense-payments/by-section", requireAdmin, async (req, res) => {
  try {
    const containerId = Number(req.params.id);
    if (isNaN(containerId)) { res.status(400).json({ error: "Invalid container id" }); return; }

    const [charged, paidRows] = await Promise.all([
      getSectionChargedTotals(containerId),
      db.select({
        section: containerExpensePaymentsTable.section,
        totalPaid: sql<string>`COALESCE(SUM(${containerExpensePaymentsTable.amount}), 0)`,
      })
        .from(containerExpensePaymentsTable)
        .where(eq(containerExpensePaymentsTable.containerId, containerId))
        .groupBy(containerExpensePaymentsTable.section),
    ]);

    const paidBySection: Record<string, number> = {};
    for (const r of paidRows) {
      if (r.section) {
        paidBySection[r.section] = parseFloat(r.totalPaid ?? "0");
      }
    }

    const LABELS: Record<string, string> = {
      shipping: "Shipping", customs: "Customs", terminal: "Terminal",
      delivery: "Delivery", operations: "Operations",
    };

    const sections = ["shipping", "customs", "terminal", "delivery", "operations"].map(sec => {
      const chargedAmt = charged[sec] ?? 0;
      const paidAmt = paidBySection[sec] ?? 0;
      return {
        section: sec,
        label: LABELS[sec],
        charged: chargedAmt,
        paid: paidAmt,
        outstanding: Math.max(0, chargedAmt - paidAmt),
      };
    });

    res.json(sections);
  } catch (err) {
    console.error("GET /containers/:id/expense-payments/by-section error:", err);
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

    const categoryIds = [...new Set(payments.map(p => p.categoryId).filter(Boolean) as number[])];
    const bankIds = [...new Set(payments.map(p => p.bankId).filter(Boolean) as number[])];
    const userIds = [...new Set(payments.map(p => p.recordedBy).filter(Boolean) as number[])];

    const SECTION_LABELS: Record<string, string> = {
      shipping: "Shipping", customs: "Customs", terminal: "Terminal",
      delivery: "Delivery", operations: "Operations",
    };

    type IdName = { id: number; name: string };
    const [cats, banks, users] = await Promise.all([
      categoryIds.length > 0
        ? db.select({ id: containerExpenseCategoriesTable.id, name: containerExpenseCategoriesTable.name })
            .from(containerExpenseCategoriesTable).where(inArray(containerExpenseCategoriesTable.id, categoryIds))
        : Promise.resolve([] as IdName[]),
      bankIds.length > 0
        ? db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable).where(inArray(banksTable.id, bankIds))
        : Promise.resolve([] as IdName[]),
      userIds.length > 0
        ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
        : Promise.resolve([] as IdName[]),
    ]);

    const catMap: Record<number, string> = {};
    cats.forEach(c => { catMap[c.id] = c.name; });
    const bankMap: Record<number, string> = {};
    banks.forEach(b => { bankMap[b.id] = b.name; });
    const userMap: Record<number, string> = {};
    users.forEach(u => { userMap[u.id] = u.name; });

    const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);

    res.json({
      payments: payments.map(p => {
        const sectionLabel = p.section ? (SECTION_LABELS[p.section] ?? p.section) : null;
        const catName = p.categoryId ? (catMap[p.categoryId] ?? "Unknown") : null;
        return {
          id: p.id,
          containerId: p.containerId,
          categoryId: p.categoryId ?? null,
          categoryName: catName ?? sectionLabel ?? "—",
          section: p.section ?? null,
          sectionLabel,
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
        };
      }),
      totalPaid,
    });
  } catch (err) {
    console.error("GET /containers/:id/expense-payments error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Recent Payments ──────────────────────────────────────────────────────────

containerExpensesRouter.get("/container-expense-payments/recent", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);

    const payments = await db.select().from(containerExpensePaymentsTable)
      .orderBy(desc(containerExpensePaymentsTable.paidAt))
      .limit(limit);

    if (payments.length === 0) { res.json([]); return; }

    const containerIds = [...new Set(payments.map(p => p.containerId))];
    const categoryIds  = [...new Set(payments.map(p => p.categoryId).filter(Boolean) as number[])];
    const bankIds      = [...new Set(payments.map(p => p.bankId).filter(Boolean) as number[])];
    const userIds      = [...new Set(payments.map(p => p.recordedBy).filter(Boolean) as number[])];

    const SECTION_LABELS: Record<string, string> = {
      shipping: "Shipping", customs: "Customs", terminal: "Terminal",
      delivery: "Delivery", operations: "Operations",
    };

    type IdName2 = { id: number; name: string };
    const [containers, cats, banks, users] = await Promise.all([
      db.select({ id: containersTable.id, containerNumber: containersTable.containerNumber, customerName: containersTable.customerName })
        .from(containersTable).where(inArray(containersTable.id, containerIds)),
      categoryIds.length > 0
        ? db.select({ id: containerExpenseCategoriesTable.id, name: containerExpenseCategoriesTable.name })
            .from(containerExpenseCategoriesTable).where(inArray(containerExpenseCategoriesTable.id, categoryIds))
        : Promise.resolve([] as IdName2[]),
      bankIds.length > 0
        ? db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable).where(inArray(banksTable.id, bankIds))
        : Promise.resolve([] as IdName2[]),
      userIds.length > 0
        ? db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, userIds))
        : Promise.resolve([] as IdName2[]),
    ]);

    const containerMap: Record<number, { containerNumber: string; customerName: string }> = {};
    containers.forEach(c => { containerMap[c.id] = { containerNumber: c.containerNumber, customerName: c.customerName }; });
    const catMap: Record<number, string> = {};
    cats.forEach(c => { catMap[c.id] = c.name; });
    const bankMap: Record<number, string> = {};
    banks.forEach(b => { bankMap[b.id] = b.name; });
    const userMap: Record<number, string> = {};
    users.forEach(u => { userMap[u.id] = u.name; });

    res.json(payments.map(p => {
      const sectionLabel = p.section ? (SECTION_LABELS[p.section] ?? p.section) : null;
      const catName = p.categoryId ? (catMap[p.categoryId] ?? null) : null;
      return {
        id: p.id,
        containerId: p.containerId,
        containerNumber: containerMap[p.containerId]?.containerNumber ?? "—",
        customerName: containerMap[p.containerId]?.customerName ?? "—",
        categoryId: p.categoryId ?? null,
        categoryName: catName ?? sectionLabel ?? "—",
        section: p.section ?? null,
        sectionLabel,
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
      };
    }));
  } catch (err) {
    console.error("GET /container-expense-payments/recent error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /containers/:id/reconciliation ──────────────────────────────────────

containerExpensesRouter.get("/containers/:id/reconciliation", requireAdmin, async (req, res) => {
  const containerId = Number(req.params.id);
  if (!Number.isFinite(containerId) || containerId <= 0) {
    return res.status(400).json({ error: "Invalid containerId" });
  }
  try {
    const [budgeted, disbPayments] = await Promise.all([
      getSectionChargedTotals(containerId),
      db.select({
        section: containerExpensePaymentsTable.section,
        total: sql<string>`sum(${containerExpensePaymentsTable.amount})`,
      })
        .from(containerExpensePaymentsTable)
        .where(eq(containerExpensePaymentsTable.containerId, containerId))
        .groupBy(containerExpensePaymentsTable.section),
    ]);

    const disbursedBySection: Record<string, number> = {};
    let totalDisbursedAllSections = 0;
    for (const r of disbPayments) {
      const amt = parseFloat(r.total ?? "0");
      disbursedBySection[r.section ?? "other"] = (disbursedBySection[r.section ?? "other"] ?? 0) + amt;
      totalDisbursedAllSections += amt;
    }

    const SECTIONS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
    const sections: Array<{ section: string; budgeted: number; disbursed: number; variance: number }> = SECTIONS.map(sec => {
      const b = budgeted[sec] ?? 0;
      const d = disbursedBySection[sec] ?? 0;
      return { section: sec, budgeted: b, disbursed: d, variance: d - b };
    });
    // Include any unallocated (null-section) payments in a separate row so totals remain accurate
    const unallocatedDisbursed = Object.entries(disbursedBySection)
      .filter(([k]) => !(SECTIONS as readonly string[]).includes(k))
      .reduce((s, [, v]) => s + v, 0);
    if (unallocatedDisbursed > 0) {
      sections.push({ section: "other", budgeted: 0, disbursed: unallocatedDisbursed, variance: unallocatedDisbursed });
    }

    const totalBudgeted = sections.filter(s => s.section !== "other").reduce((s, r) => s + r.budgeted, 0);
    const totalDisbursed = totalDisbursedAllSections;

    return res.json({
      containerId,
      sections,
      totals: { budgeted: totalBudgeted, disbursed: totalDisbursed, variance: totalDisbursed - totalBudgeted },
    });
  } catch (err) {
    console.error("GET /containers/:id/reconciliation error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
