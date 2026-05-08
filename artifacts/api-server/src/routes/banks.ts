import { Router } from "express";
import { db, banksTable, bankTransfersTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";

export const banksRouter = Router();

banksRouter.get("/banks", requireAuth, async (req, res) => {
  try {
    const activeOnly = req.query.active === "true";
    const rows = await db.select().from(banksTable).orderBy(banksTable.name);
    const result = activeOnly ? rows.filter(b => b.isActive) : rows;
    res.json(result);
  } catch (err) {
    console.error("GET /banks error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

banksRouter.post("/banks", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, accountNumber, bankCode } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "Bank name is required" });
      return;
    }
    const [bank] = await db.insert(banksTable).values({
      name: name.trim(),
      accountNumber: accountNumber?.trim() || null,
      bankCode: bankCode?.trim() || null,
      isActive: true,
    }).returning();
    res.status(201).json(bank);
  } catch (err) {
    console.error("POST /banks error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

banksRouter.patch("/banks/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const { name, accountNumber, bankCode, isActive } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (accountNumber !== undefined) updates.accountNumber = accountNumber?.trim() || null;
    if (bankCode !== undefined) updates.bankCode = bankCode?.trim() || null;
    if (isActive !== undefined) updates.isActive = Boolean(isActive);
    const [updated] = await db.update(banksTable).set(updates).where(eq(banksTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Bank not found" }); return; }
    res.json(updated);
  } catch (err) {
    console.error("PATCH /banks/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

banksRouter.delete("/banks/:id", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    await db.delete(banksTable).where(eq(banksTable.id, id));
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /banks/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Bank Transfers ────────────────────────────────────────────────────────

banksRouter.get("/banks/transfers", requireAuth, async (_req, res) => {
  try {
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
      .orderBy(desc(bankTransfersTable.createdAt));

    const bankRows = await db.select({ id: banksTable.id, name: banksTable.name }).from(banksTable);
    const bankMap = new Map(bankRows.map(b => [b.id, b.name]));

    res.json(rows.map(r => ({
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
    res.status(500).json({ error: "Server error" });
  }
});

banksRouter.post("/banks/transfers", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { fromBankId, toBankId, amount, narration, reference } = req.body as {
      fromBankId: number;
      toBankId: number;
      amount: number;
      narration?: string;
      reference?: string;
    };

    if (!fromBankId || !toBankId) {
      res.status(400).json({ error: "Both source and destination banks are required" });
      return;
    }
    if (fromBankId === toBankId) {
      res.status(400).json({ error: "Source and destination banks must be different" });
      return;
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      res.status(400).json({ error: "Amount must be a positive number" });
      return;
    }

    const [fromBank] = await db.select().from(banksTable).where(eq(banksTable.id, fromBankId));
    if (!fromBank) { res.status(404).json({ error: "Source bank not found" }); return; }

    const [toBank] = await db.select().from(banksTable).where(eq(banksTable.id, toBankId));
    if (!toBank) { res.status(404).json({ error: "Destination bank not found" }); return; }

    const userId = req.user?.id ?? null;

    const [transfer] = await db.insert(bankTransfersTable).values({
      fromBankId,
      toBankId,
      amount: String(amount),
      narration: narration ?? "",
      reference: reference ?? null,
      createdBy: userId,
    }).returning();

    let createdByName: string | null = null;
    if (userId) {
      const [u] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
      createdByName = u?.name ?? null;
    }

    res.status(201).json({
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
    res.status(500).json({ error: "Server error" });
  }
});
