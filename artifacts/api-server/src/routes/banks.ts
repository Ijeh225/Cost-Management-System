import { Router } from "express";
import { db, banksTable, bankTransfersTable, usersTable, invoicePaymentsTable, invoicesTable, clientDepositsTable, clientsTable, overheadExpensesTable, bankFundAdditionsTable, expensePaymentsTable, containerExpensePaymentsTable, containerExpenseCategoriesTable, containersTable } from "@workspace/db";
import { eq, desc, and, gte, lte, or, SQL, sum, isNotNull, sql } from "drizzle-orm";
import { requireAuth, requireBranchAdminOrAbove, AuthRequest, userCanAccessBranch, getBranchScope, resolveCreateBranch } from "../lib/auth.js";

export const banksRouter = Router();

banksRouter.get("/banks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const activeOnly = req.query.active === "true";
    // Branch scoping (Task #74): X-Branch-Id header → numeric scope or null = all.
    const branchScope = getBranchScope(req);
    const allRows = await db.select().from(banksTable).orderBy(banksTable.name);
    const scoped = branchScope === null ? allRows : allRows.filter(b => b.branchId === branchScope);
    const filtered = activeOnly ? scoped.filter(b => b.isActive) : scoped;

    // Compute current balance for each bank from all transaction sources
    const [paymentsRows, depositsRows, transfersInRows, transfersOutRows, expensesRows, fundAddRows, containerExpRows] = await Promise.all([
      db.select({ bankId: invoicePaymentsTable.bankId, total: sum(invoicePaymentsTable.amount) })
        .from(invoicePaymentsTable).where(isNotNull(invoicePaymentsTable.bankId)).groupBy(invoicePaymentsTable.bankId),
      db.select({ bankId: clientDepositsTable.bankId, total: sum(clientDepositsTable.amount) })
        .from(clientDepositsTable).where(isNotNull(clientDepositsTable.bankId)).groupBy(clientDepositsTable.bankId),
      db.select({ bankId: bankTransfersTable.toBankId, total: sum(bankTransfersTable.amount) })
        .from(bankTransfersTable).where(isNotNull(bankTransfersTable.toBankId)).groupBy(bankTransfersTable.toBankId),
      db.select({ bankId: bankTransfersTable.fromBankId, total: sum(bankTransfersTable.amount) })
        .from(bankTransfersTable).where(isNotNull(bankTransfersTable.fromBankId)).groupBy(bankTransfersTable.fromBankId),
      db.select({ bankId: expensePaymentsTable.bankId, total: sum(expensePaymentsTable.amount) })
        .from(expensePaymentsTable).where(isNotNull(expensePaymentsTable.bankId)).groupBy(expensePaymentsTable.bankId),
      db.select({ bankId: bankFundAdditionsTable.bankId, total: sum(bankFundAdditionsTable.amount) })
        .from(bankFundAdditionsTable).groupBy(bankFundAdditionsTable.bankId),
      db.select({ bankId: containerExpensePaymentsTable.bankId, total: sum(containerExpensePaymentsTable.amount) })
        .from(containerExpensePaymentsTable).where(isNotNull(containerExpensePaymentsTable.bankId)).groupBy(containerExpensePaymentsTable.bankId),
    ]);

    const toMap = (arr: { bankId: number | null; total: string | null }[]) =>
      Object.fromEntries(arr.map(r => [r.bankId!, parseFloat(r.total ?? "0")]));

    const pmtMap       = toMap(paymentsRows);
    const depMap       = toMap(depositsRows);
    const tinMap       = toMap(transfersInRows);
    const toutMap      = toMap(transfersOutRows);
    const expMap       = toMap(expensesRows);
    const fadMap       = toMap(fundAddRows);
    const cExpMap      = toMap(containerExpRows);

    const result = filtered.map(b => ({
      ...b,
      currentBalance:
        (pmtMap[b.id] ?? 0) +
        (depMap[b.id] ?? 0) +
        (tinMap[b.id] ?? 0) +
        (fadMap[b.id] ?? 0) -
        (toutMap[b.id] ?? 0) -
        (expMap[b.id] ?? 0) -
        (cExpMap[b.id] ?? 0),
    }));

    return res.json(result);
  } catch (err) {
    console.error("GET /banks error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

banksRouter.post("/banks", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const { name, accountNumber, bankCode } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Bank name is required" });
    }
    const createBranchId = resolveCreateBranch(req, res);
    if (createBranchId == null) return;
    const [bank] = await db.insert(banksTable).values({
      name: name.trim(),
      accountNumber: accountNumber?.trim() || null,
      bankCode: bankCode?.trim() || null,
      isActive: true,
      branchId: createBranchId,
    }).returning();
    return res.status(201).json(bank);
  } catch (err) {
    console.error("POST /banks error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

banksRouter.patch("/banks/:id", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select({ branchId: banksTable.branchId }).from(banksTable).where(eq(banksTable.id, id));
    if (!existing || !userCanAccessBranch(req, existing.branchId)) { res.status(404).json({ error: "Bank not found" }); return; }
    const { name, accountNumber, bankCode, isActive } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (accountNumber !== undefined) updates.accountNumber = accountNumber?.trim() || null;
    if (bankCode !== undefined) updates.bankCode = bankCode?.trim() || null;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    const [updated] = await db.update(banksTable).set(updates).where(eq(banksTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Bank not found" }); return; }
    return res.json(updated);
  } catch (err) {
    console.error("PATCH /banks/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

banksRouter.delete("/banks/:id", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select({ branchId: banksTable.branchId }).from(banksTable).where(eq(banksTable.id, id));
    if (!existing || !userCanAccessBranch(req, existing.branchId)) { res.status(404).json({ error: "Bank not found" }); return; }
    await db.delete(banksTable).where(eq(banksTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error("DELETE /banks/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Bank Transfers ────────────────────────────────────────────────────────

banksRouter.get("/banks/transfers", requireAuth, async (req: AuthRequest, res) => {
  try {
    // Task #74: branch scope from X-Branch-Id header.
    const bScope = getBranchScope(req);
    const branchFilter: SQL | undefined = bScope !== null
      ? eq(bankTransfersTable.branchId, bScope)
      : undefined;
    const rows = await db
      .select({
        id: bankTransfersTable.id,
        fromBankId: bankTransfersTable.fromBankId,
        toBankId: bankTransfersTable.toBankId,
        amount: bankTransfersTable.amount,
        narration: bankTransfersTable.narration,
        reference: bankTransfersTable.reference,
        createdBy: bankTransfersTable.createdBy,
        createdByName: usersTable.name,
        createdAt: bankTransfersTable.createdAt,
      })
      .from(bankTransfersTable)
      .leftJoin(usersTable, eq(bankTransfersTable.createdBy, usersTable.id))
      .where(branchFilter ?? sql`TRUE`)
      .orderBy(desc(bankTransfersTable.createdAt));

    const bankRows = await db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable);
    const bankMap = new Map(bankRows.map(b => [b.id, b.name]));

    return res.json(rows.map(r => ({
      id: r.id,
      fromBankId: r.fromBankId ?? null,
      fromBankName: r.fromBankId ? (bankMap.get(r.fromBankId) ?? null) : null,
      toBankId: r.toBankId ?? null,
      toBankName: r.toBankId ? (bankMap.get(r.toBankId) ?? null) : null,
      amount: parseFloat(r.amount),
      narration: r.narration,
      reference: r.reference ?? null,
      createdBy: r.createdBy ?? null,
      createdByName: r.createdByName ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })));
  } catch (err) {
    console.error("GET /banks/transfers error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Bank Detail ───────────────────────────────────────────────────────────

banksRouter.get("/banks/:id", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, id));
    if (!bank || !userCanAccessBranch(req, bank.branchId)) { res.status(404).json({ error: "Bank not found" }); return; }
    return res.json(bank);
  } catch (err) {
    console.error("GET /banks/:id error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Bank Transaction History ───────────────────────────────────────────────

banksRouter.get("/banks/:id/transactions", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, id));
    if (!bank || !userCanAccessBranch(req, bank.branchId)) { res.status(404).json({ error: "Bank not found" }); return; }

    const fromDate = req.query.from ? new Date(req.query.from as string) : null;
    const toDate   = req.query.to   ? new Date(req.query.to as string)   : null;
    const typeFilter = req.query.type as string | undefined;

    type RawTx = {
      id: string;
      date: Date;
      type: "payment" | "deposit" | "transfer_in" | "transfer_out" | "fund_addition" | "expense_payment" | "container_expense_payment";
      description: string;
      reference: string | null;
      clientName: string | null;
      invoiceNumber: string | null;
      debit: number;
      credit: number;
    };

    const txs: RawTx[] = [];

    // 1. Invoice payments credited to this bank
    if (!typeFilter || typeFilter === "payment") {
      const paymentConditions: SQL<unknown>[] = [eq(invoicePaymentsTable.bankId, id)];
      if (fromDate) paymentConditions.push(gte(invoicePaymentsTable.paidAt, fromDate));
      if (toDate)   paymentConditions.push(lte(invoicePaymentsTable.paidAt, toDate));

      const payments = await db
        .select({
          id: invoicePaymentsTable.id,
          amount: invoicePaymentsTable.amount,
          paidAt: invoicePaymentsTable.paidAt,
          reference: invoicePaymentsTable.reference,
          notes: invoicePaymentsTable.notes,
          paymentMethod: invoicePaymentsTable.paymentMethod,
          invoiceId: invoicePaymentsTable.invoiceId,
          invoiceNumber: invoicesTable.invoiceNumber,
          clientId: invoicesTable.clientId,
          clientName: clientsTable.name,
        })
        .from(invoicePaymentsTable)
        .leftJoin(invoicesTable, eq(invoicePaymentsTable.invoiceId, invoicesTable.id))
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(and(...paymentConditions));

      for (const p of payments) {
        txs.push({
          id: `payment_${p.id}`,
          date: p.paidAt,
          type: "payment",
          description: `Invoice payment — ${p.invoiceNumber ?? `INV-${p.invoiceId}`}${p.notes ? ` (${p.notes})` : ""}`,
          reference: p.reference || null,
          clientName: p.clientName ?? null,
          invoiceNumber: p.invoiceNumber ?? null,
          debit: 0,
          credit: parseFloat(p.amount),
        });
      }
    }

    // 2. Client deposits credited to this bank
    if (!typeFilter || typeFilter === "deposit") {
      const depositConditions: SQL<unknown>[] = [eq(clientDepositsTable.bankId, id)];
      if (fromDate) depositConditions.push(gte(clientDepositsTable.createdAt, fromDate));
      if (toDate)   depositConditions.push(lte(clientDepositsTable.createdAt, toDate));

      const deposits = await db
        .select({
          id: clientDepositsTable.id,
          amount: clientDepositsTable.amount,
          createdAt: clientDepositsTable.createdAt,
          reference: clientDepositsTable.reference,
          notes: clientDepositsTable.notes,
          paymentMethod: clientDepositsTable.paymentMethod,
          clientName: clientsTable.name,
        })
        .from(clientDepositsTable)
        .leftJoin(clientsTable, eq(clientDepositsTable.clientId, clientsTable.id))
        .where(and(...depositConditions));

      for (const d of deposits) {
        txs.push({
          id: `deposit_${d.id}`,
          date: d.createdAt,
          type: "deposit",
          description: `Client deposit${d.notes ? ` — ${d.notes}` : ""}`,
          reference: d.reference ?? null,
          clientName: d.clientName ?? null,
          invoiceNumber: null,
          debit: 0,
          credit: parseFloat(d.amount),
        });
      }
    }

    // 3. Internal transfers in (this bank is the destination)
    if (!typeFilter || typeFilter === "transfer_in") {
      const inConditions: SQL<unknown>[] = [eq(bankTransfersTable.toBankId, id)];
      if (fromDate) inConditions.push(gte(bankTransfersTable.createdAt, fromDate));
      if (toDate)   inConditions.push(lte(bankTransfersTable.createdAt, toDate));

      const transfersIn = await db
        .select({
          id: bankTransfersTable.id,
          amount: bankTransfersTable.amount,
          createdAt: bankTransfersTable.createdAt,
          reference: bankTransfersTable.reference,
          narration: bankTransfersTable.narration,
          fromBankId: bankTransfersTable.fromBankId,
        })
        .from(bankTransfersTable)
        .where(and(...inConditions));

      const fromBankIds = [...new Set(transfersIn.map(t => t.fromBankId).filter(Boolean))];
      const fromBankMap: Record<number, string> = {};
      if (fromBankIds.length > 0) {
        const bRows = await db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable);
        bRows.forEach(b => { fromBankMap[b.id] = b.name; });
      }

      for (const t of transfersIn) {
        const fromName = t.fromBankId ? (fromBankMap[t.fromBankId] ?? "Unknown") : "Unknown";
        txs.push({
          id: `transfer_in_${t.id}`,
          date: t.createdAt,
          type: "transfer_in",
          description: `Transfer in from ${fromName}${t.narration ? ` — ${t.narration}` : ""}`,
          reference: t.reference ?? null,
          clientName: null,
          invoiceNumber: null,
          debit: 0,
          credit: parseFloat(t.amount),
        });
      }
    }

    // 4. Internal transfers out (this bank is the source)
    if (!typeFilter || typeFilter === "transfer_out") {
      const outConditions: SQL<unknown>[] = [eq(bankTransfersTable.fromBankId, id)];
      if (fromDate) outConditions.push(gte(bankTransfersTable.createdAt, fromDate));
      if (toDate)   outConditions.push(lte(bankTransfersTable.createdAt, toDate));

      const transfersOut = await db
        .select({
          id: bankTransfersTable.id,
          amount: bankTransfersTable.amount,
          createdAt: bankTransfersTable.createdAt,
          reference: bankTransfersTable.reference,
          narration: bankTransfersTable.narration,
          toBankId: bankTransfersTable.toBankId,
        })
        .from(bankTransfersTable)
        .where(and(...outConditions));

      const toBankIds = [...new Set(transfersOut.map(t => t.toBankId).filter(Boolean))];
      const toBankMap: Record<number, string> = {};
      if (toBankIds.length > 0) {
        const bRows = await db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable);
        bRows.forEach(b => { toBankMap[b.id] = b.name; });
      }

      for (const t of transfersOut) {
        const toName = t.toBankId ? (toBankMap[t.toBankId] ?? "Unknown") : "Unknown";
        txs.push({
          id: `transfer_out_${t.id}`,
          date: t.createdAt,
          type: "transfer_out",
          description: `Transfer out to ${toName}${t.narration ? ` — ${t.narration}` : ""}`,
          reference: t.reference ?? null,
          clientName: null,
          invoiceNumber: null,
          debit: parseFloat(t.amount),
          credit: 0,
        });
      }
    }

    // 5. Manual fund additions credited to this bank
    if (!typeFilter || typeFilter === "fund_addition") {
      const fadConditions: SQL<unknown>[] = [eq(bankFundAdditionsTable.bankId, id)];
      if (fromDate) fadConditions.push(gte(bankFundAdditionsTable.createdAt, fromDate));
      if (toDate)   fadConditions.push(lte(bankFundAdditionsTable.createdAt, toDate));

      const additions = await db
        .select({
          id: bankFundAdditionsTable.id,
          amount: bankFundAdditionsTable.amount,
          narration: bankFundAdditionsTable.narration,
          reference: bankFundAdditionsTable.reference,
          createdAt: bankFundAdditionsTable.createdAt,
        })
        .from(bankFundAdditionsTable)
        .where(and(...fadConditions));

      for (const f of additions) {
        txs.push({
          id: `fund_addition_${f.id}`,
          date: f.createdAt,
          type: "fund_addition" as const,
          description: `Fund addition${f.narration ? ` — ${f.narration}` : ""}`,
          reference: f.reference ?? null,
          clientName: null,
          invoiceNumber: null,
          debit: 0,
          credit: parseFloat(f.amount),
        });
      }
    }

    // 6. Container expense payments debited from this bank
    if (!typeFilter || typeFilter === "container_expense_payment") {
      const cepConditions: SQL<unknown>[] = [eq(containerExpensePaymentsTable.bankId, id)];
      if (fromDate) cepConditions.push(gte(containerExpensePaymentsTable.paidAt, fromDate));
      if (toDate)   cepConditions.push(lte(containerExpensePaymentsTable.paidAt, toDate));

      const cepRows = await db
        .select({
          id: containerExpensePaymentsTable.id,
          amount: containerExpensePaymentsTable.amount,
          paidAt: containerExpensePaymentsTable.paidAt,
          reference: containerExpensePaymentsTable.reference,
          narration: containerExpensePaymentsTable.narration,
          categoryName: containerExpenseCategoriesTable.name,
          containerNumber: containersTable.containerNumber,
        })
        .from(containerExpensePaymentsTable)
        .leftJoin(containerExpenseCategoriesTable, eq(containerExpensePaymentsTable.categoryId, containerExpenseCategoriesTable.id))
        .leftJoin(containersTable, eq(containerExpensePaymentsTable.containerId, containersTable.id))
        .where(and(...cepConditions));

      for (const cep of cepRows) {
        txs.push({
          id: `container_expense_payment_${cep.id}`,
          date: cep.paidAt,
          type: "container_expense_payment" as const,
          description: `${cep.categoryName ?? "Container Expense"} — ${cep.containerNumber ?? "Container"}${cep.narration ? ` (${cep.narration})` : ""}`,
          reference: cep.reference ?? null,
          clientName: null,
          invoiceNumber: null,
          debit: parseFloat(cep.amount),
          credit: 0,
        });
      }
    }

    // 7. Overhead expense payments debited from this bank
    if (!typeFilter || typeFilter === "expense_payment") {
      const epConditions: SQL<unknown>[] = [eq(expensePaymentsTable.bankId, id)];
      if (fromDate) epConditions.push(gte(expensePaymentsTable.paidAt, fromDate));
      if (toDate)   epConditions.push(lte(expensePaymentsTable.paidAt, toDate));

      const expPayments = await db
        .select({
          id: expensePaymentsTable.id,
          amount: expensePaymentsTable.amount,
          paidAt: expensePaymentsTable.paidAt,
          notes: expensePaymentsTable.notes,
          description: overheadExpensesTable.description,
          category: overheadExpensesTable.category,
        })
        .from(expensePaymentsTable)
        .leftJoin(overheadExpensesTable, eq(expensePaymentsTable.expenseId, overheadExpensesTable.id))
        .where(and(...epConditions));

      for (const ep of expPayments) {
        txs.push({
          id: `expense_payment_${ep.id}`,
          date: ep.paidAt,
          type: "expense_payment" as const,
          description: `Expense — ${ep.category ?? "Overhead"}${ep.description ? `: ${ep.description}` : ""}${ep.notes ? ` (${ep.notes})` : ""}`,
          reference: null,
          clientName: null,
          invoiceNumber: null,
          debit: parseFloat(ep.amount),
          credit: 0,
        });
      }
    }

    // Sort all transactions by date ascending to compute running balance
    txs.sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = 0;
    let totalCredits = 0;
    let totalDebits = 0;
    const openingBalance = 0;

    const result = txs.map(tx => {
      balance += tx.credit - tx.debit;
      totalCredits += tx.credit;
      totalDebits += tx.debit;
      return {
        id: tx.id,
        date: tx.date instanceof Date ? tx.date.toISOString() : tx.date,
        type: tx.type,
        description: tx.description,
        reference: tx.reference,
        clientName: tx.clientName,
        invoiceNumber: tx.invoiceNumber,
        debit: tx.debit,
        credit: tx.credit,
        balance,
      };
    });

    // Return in descending date order for display (most recent first)
    result.reverse();

    return res.json({
      bank: {
        id: bank.id,
        name: bank.name,
        accountNumber: bank.accountNumber,
        bankCode: bank.bankCode,
        isActive: bank.isActive,
        createdAt: bank.createdAt instanceof Date ? bank.createdAt.toISOString() : bank.createdAt,
        updatedAt: bank.updatedAt instanceof Date ? bank.updatedAt.toISOString() : bank.updatedAt,
      },
      transactions: result,
      openingBalance,
      closingBalance: balance,
      totalCredits,
      totalDebits,
    });
  } catch (err) {
    console.error("GET /banks/:id/transactions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ─── Fund Additions ──────────────────────────────────────────────────────────

banksRouter.post("/banks/:id/fund-additions", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const bankId = Number(req.params.id);
    if (isNaN(bankId)) { res.status(400).json({ error: "Invalid bank id" }); return; }

    const { amount, narration, reference } = req.body as {
      amount: number;
      narration?: string;
      reference?: string;
    };

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const [bank] = await db.select().from(banksTable).where(eq(banksTable.id, bankId));
    if (!bank || !userCanAccessBranch(req, bank.branchId)) { res.status(404).json({ error: "Bank not found" }); return; }
    {
      const _scope = getBranchScope(req);
      if (_scope !== null && bank.branchId !== _scope) { res.status(404).json({ error: "Bank not found" }); return; }
      if (_scope === null && req.user?.role === "super_admin") { res.status(400).json({ error: "Select a specific branch to fund a bank." }); return; }
    }

    const userId = req.user?.id ?? null;
    const [addition] = await db.insert(bankFundAdditionsTable).values({
      bankId,
      amount: String(amount),
      narration: narration ?? "",
      reference: reference ?? null,
      addedBy: userId,
      branchId: bank.branchId,
    }).returning();

    return res.status(201).json(addition);
  } catch (err) {
    console.error("POST /banks/:id/fund-additions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

banksRouter.post("/banks/transfers", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const { fromBankId, toBankId, amount, narration, reference } = req.body as {
      fromBankId: number;
      toBankId: number;
      amount: number;
      narration?: string;
      reference?: string;
    };

    if (!fromBankId || !toBankId) {
      return res.status(400).json({ error: "Both source and destination banks are required" });
    }
    if (fromBankId === toBankId) {
      return res.status(400).json({ error: "Source and destination banks must be different" });
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    const [fromBank] = await db.select().from(banksTable).where(eq(banksTable.id, fromBankId));
    if (!fromBank || !userCanAccessBranch(req, fromBank.branchId)) { res.status(404).json({ error: "Source bank not found" }); return; }

    const [toBank] = await db.select().from(banksTable).where(eq(banksTable.id, toBankId));
    if (!toBank || !userCanAccessBranch(req, toBank.branchId)) { res.status(404).json({ error: "Destination bank not found" }); return; }

    {
      const _scope = getBranchScope(req);
      if (_scope !== null && (fromBank.branchId !== _scope || toBank.branchId !== _scope)) {
        return res.status(404).json({ error: "Bank not found" });
      }
      if (_scope === null && req.user?.role === "super_admin") {
        return res.status(400).json({ error: "Select a specific branch to record a transfer." });
      }
    }
    if (fromBank.branchId !== toBank.branchId) {
      return res.status(400).json({ error: "Cross-branch transfers are not allowed." });
    }

    const userId = req.user?.id ?? null;

    const [transfer] = await db.insert(bankTransfersTable).values({
      fromBankId,
      toBankId,
      amount: String(amount),
      narration: narration ?? "",
      reference: reference ?? null,
      createdBy: userId,
      branchId: fromBank.branchId,
    }).returning();

    let createdByName: string | null = null;
    if (userId) {
      const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
      createdByName = u?.name ?? null;
    }

    return res.status(201).json({
      id: transfer.id,
      fromBankId: transfer.fromBankId ?? null,
      fromBankName: fromBank.name,
      toBankId: transfer.toBankId ?? null,
      toBankName: toBank.name,
      amount: parseFloat(transfer.amount),
      narration: transfer.narration,
      reference: transfer.reference ?? null,
      createdBy: transfer.createdBy ?? null,
      createdByName,
      createdAt: transfer.createdAt instanceof Date ? transfer.createdAt.toISOString() : transfer.createdAt,
    });
  } catch (err) {
    console.error("POST /banks/transfers error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});
