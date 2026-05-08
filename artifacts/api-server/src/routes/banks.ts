import { Router } from "express";
import { db, banksTable } from "@workspace/db";
import { eq } from "drizzle-orm";
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
