import { Router, Request, Response } from "express";
import {
  db, branchesTable, usersTable, containersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireSuperAdmin, AuthRequest } from "../lib/auth.js";

const router = Router();

type BranchRow = typeof branchesTable.$inferSelect;

type BranchPayload = {
  name?: string;
  shortCode?: string | null;
  location?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

function serialize(b: BranchRow) {
  return {
    ...b,
    createdAt: b.createdAt instanceof Date ? b.createdAt.toISOString() : b.createdAt,
    updatedAt: b.updatedAt instanceof Date ? b.updatedAt.toISOString() : b.updatedAt,
  };
}

// GET /branches — list with operational counts. Super-admin only.
router.get("/branches", requireSuperAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const rows = await db.select().from(branchesTable).orderBy(branchesTable.id);

    const userCounts = await db
      .select({ branchId: usersTable.branchId, c: sql<number>`count(*)` })
      .from(usersTable)
      .groupBy(usersTable.branchId);
    const containerCounts = await db
      .select({ branchId: containersTable.branchId, c: sql<number>`count(*)` })
      .from(containersTable)
      .where(sql`${containersTable.status} <> 'archived'`)
      .groupBy(containersTable.branchId);

    const userMap = new Map<number, number>();
    for (const r of userCounts) userMap.set(r.branchId, Number(r.c ?? 0));
    const containerMap = new Map<number, number>();
    for (const r of containerCounts) containerMap.set(r.branchId, Number(r.c ?? 0));

    res.json(rows.map((b) => ({
      ...serialize(b),
      userCount: userMap.get(b.id) ?? 0,
      activeContainerCount: containerMap.get(b.id) ?? 0,
    })));
  } catch (err) {
    console.error("[branches] list error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /branches/:id — super-admin only.
router.get("/branches/:id", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid branch ID" }); return; }
    const [row] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
    if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
    res.json(serialize(row));
  } catch (err) {
    console.error("[branches] get error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /branches — create
router.post("/branches", requireSuperAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { name, shortCode, location, contactEmail, contactPhone } = req.body as BranchPayload;
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
    res.status(201).json(serialize(row));
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(400).json({ error: "A branch with this name already exists" });
      return;
    }
    console.error("[branches] create error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

async function applyBranchUpdate(id: number, body: BranchPayload, res: Response) {
  const { name, shortCode, location, contactEmail, contactPhone } = body;
  const updates: Partial<typeof branchesTable.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (!trimmed) { res.status(400).json({ error: "Branch name cannot be empty" }); return; }
    updates.name = trimmed;
  }
  if (shortCode !== undefined) updates.shortCode = String(shortCode ?? "").trim();
  if (location !== undefined) updates.location = String(location ?? "").trim();
  if (contactEmail !== undefined) updates.contactEmail = String(contactEmail ?? "").trim();
  if (contactPhone !== undefined) updates.contactPhone = String(contactPhone ?? "").trim();
  const [row] = await db.update(branchesTable).set(updates).where(eq(branchesTable.id, id)).returning();
  if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
  res.json(serialize(row));
}

// PATCH /branches/:id — rename / change code / location / contact info.
// PUT kept as alias so the existing client (which already uses PUT) keeps working.
async function updateHandler(req: Request, res: Response) {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid branch ID" }); return; }
    await applyBranchUpdate(id, req.body as BranchPayload, res);
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      res.status(400).json({ error: "A branch with this name already exists" });
      return;
    }
    console.error("[branches] update error:", err);
    res.status(500).json({ error: "Server error" });
  }
}
router.patch("/branches/:id", requireSuperAdmin, updateHandler);
router.put("/branches/:id", requireSuperAdmin, updateHandler);

// POST /branches/:id/deactivate — soft delete; data is never removed.
router.post("/branches/:id/deactivate", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid branch ID" }); return; }
    if (id === 1) {
      res.status(400).json({
        error: "The default branch (Head Office) cannot be deactivated; it is the system fallback.",
      });
      return;
    }
    const [row] = await db.update(branchesTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(branchesTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
    res.json(serialize(row));
  } catch (err) {
    console.error("[branches] deactivate error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /branches/:id/reactivate
router.post("/branches/:id/reactivate", requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid branch ID" }); return; }
    const [row] = await db.update(branchesTable)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(branchesTable.id, id))
      .returning();
    if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
    res.json(serialize(row));
  } catch (err) {
    console.error("[branches] reactivate error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as branchesRouter };
