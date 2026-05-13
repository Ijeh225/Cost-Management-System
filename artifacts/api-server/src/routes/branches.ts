import { Router } from "express";
import { db, branchesTable, usersTable, containersTable, clientsTable, invoicesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireSuperAdmin, AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/branches", requireAuth, async (req: AuthRequest, res) => {
  // Any authenticated user may list branches (needed by /users page,
  // creation forms, branch-pickers, etc.). Only mutations are super-admin.
  void req;
  try {
    const rows = await db.select().from(branchesTable).orderBy(branchesTable.id);
    res.json(rows.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    })));
  } catch (err) {
    console.error("[branches] list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/branches", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, shortCode, location, contactEmail, contactPhone } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "Branch name is required" });
      return;
    }
    const [row] = await db.insert(branchesTable).values({
      name: name.trim(),
      shortCode: (shortCode ?? "").toString().trim(),
      location: (location ?? "").toString().trim(),
      contactEmail: (contactEmail ?? "").toString().trim(),
      contactPhone: (contactPhone ?? "").toString().trim(),
      isActive: true,
    }).returning();
    res.status(201).json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(400).json({ error: "A branch with this name already exists" });
      return;
    }
    console.error("[branches] create error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/branches/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid branch ID" });
      return;
    }
    const { name, shortCode, location, contactEmail, contactPhone, isActive } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        res.status(400).json({ error: "Branch name cannot be empty" });
        return;
      }
      updates.name = trimmed;
    }
    if (shortCode !== undefined) updates.shortCode = String(shortCode).trim();
    if (location !== undefined) updates.location = String(location).trim();
    if (contactEmail !== undefined) updates.contactEmail = String(contactEmail).trim();
    if (contactPhone !== undefined) updates.contactPhone = String(contactPhone).trim();
    if (isActive !== undefined) updates.isActive = !!isActive;
    const [row] = await db.update(branchesTable).set(updates).where(eq(branchesTable.id, id)).returning();
    if (!row) {
      res.status(404).json({ error: "Branch not found" });
      return;
    }
    res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(400).json({ error: "A branch with this name already exists" });
      return;
    }
    console.error("[branches] update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/branches/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid branch ID" });
      return;
    }
    // Branch id=1 is the always-present "Head Office" used as the table-default
    // fallback for legacy insert sites that haven't yet been updated to stamp
    // the active branch. Removing it would break those inserts with FK errors.
    if (id === 1) {
      res.status(400).json({
        error: "The default branch cannot be deleted. You may rename or deactivate it instead.",
      });
      return;
    }
    // Refuse to delete a branch that still has any data attached.
    const counts = await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(usersTable).where(eq(usersTable.branchId, id)),
      db.select({ c: sql<number>`count(*)` }).from(containersTable).where(eq(containersTable.branchId, id)),
      db.select({ c: sql<number>`count(*)` }).from(clientsTable).where(eq(clientsTable.branchId, id)),
      db.select({ c: sql<number>`count(*)` }).from(invoicesTable).where(eq(invoicesTable.branchId, id)),
    ]);
    const total = counts.reduce((s, [r]) => s + Number(r?.c ?? 0), 0);
    if (total > 0) {
      res.status(400).json({
        error: "Cannot delete a branch that still has users, containers, clients, or invoices. Deactivate it instead.",
      });
      return;
    }
    await db.delete(branchesTable).where(eq(branchesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    console.error("[branches] delete error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as branchesRouter };
