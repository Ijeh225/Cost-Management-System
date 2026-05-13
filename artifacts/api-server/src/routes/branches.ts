import { Router, Request, Response } from "express";
import {
  db, branchesTable, usersTable, containersTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireSuperAdmin, requireBranchAdminOrAbove, AuthRequest } from "../lib/auth.js";

const router = Router();

type BranchRow = typeof branchesTable.$inferSelect;

type BranchPayload = {
  name?: string;
  shortCode?: string | null;
  location?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  whatsappMode?: "head_office" | "own";
  whatsappNumber?: string | null;
  emailMode?: "head_office" | "own";
  emailFromAddress?: string | null;
  emailReplyTo?: string | null;
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

// GET /my-branch — Task #75. Branch admin (or admin/super_admin) reads their
// own branch (super_admin must have an active branch scope set). Used by the
// Branch Settings page so a branch_admin can view/edit their branch's comm
// settings without the super-admin-only /branches list.
router.get("/my-branch", requireBranchAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.user?.role === "super_admin"
      ? Number(req.header("x-branch-id") ?? req.header("X-Branch-Id"))
      : req.user?.branchId;
    if (!id || !Number.isFinite(id)) {
      res.status(400).json({ error: "Select a specific branch first." });
      return;
    }
    const [row] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
    if (!row) { res.status(404).json({ error: "Branch not found" }); return; }
    res.json(serialize(row));
  } catch (err) {
    console.error("[branches] my-branch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// PATCH /my-branch — Task #75. Branch admin can edit comm settings + contact
// info on their own branch only. Cannot rename, change shortCode, or toggle
// active. admin/super_admin can use this too (acts on their active scope).
router.patch("/my-branch", requireBranchAdminOrAbove, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.user?.role === "super_admin"
      ? Number(req.header("x-branch-id") ?? req.header("X-Branch-Id"))
      : req.user?.branchId;
    if (!id || !Number.isFinite(id)) {
      res.status(400).json({ error: "Select a specific branch first." });
      return;
    }
    // Strip name / shortCode — these are super-admin-only via /branches/:id.
    const body = req.body as BranchPayload;
    const safe: BranchPayload = {
      location: body.location,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      whatsappMode: body.whatsappMode,
      whatsappNumber: body.whatsappNumber,
      emailMode: body.emailMode,
      emailFromAddress: body.emailFromAddress,
      emailReplyTo: body.emailReplyTo,
    };
    await applyBranchUpdate(id, safe, res);
  } catch (err) {
    console.error("[branches] my-branch update error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server error" });
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
    const {
      name, shortCode, location, contactEmail, contactPhone,
      whatsappMode, whatsappNumber, emailMode, emailFromAddress, emailReplyTo,
    } = req.body as BranchPayload;
    if (!name || typeof name !== "string" || name.trim() === "") {
      res.status(400).json({ error: "Branch name is required" });
      return;
    }
    const wMode = whatsappMode === "own" ? "own" : "head_office";
    const eMode = emailMode === "own" ? "own" : "head_office";
    if (wMode === "own" && !(whatsappNumber ?? "").trim()) {
      res.status(400).json({ error: "WhatsApp number is required when using the branch's own number." });
      return;
    }
    if (eMode === "own" && !(emailFromAddress ?? "").trim()) {
      res.status(400).json({ error: "From address is required when using the branch's own email." });
      return;
    }
    const [row] = await db.insert(branchesTable).values({
      name: name.trim(),
      shortCode: (shortCode ?? "").toString().trim(),
      location: (location ?? "").toString().trim(),
      contactEmail: (contactEmail ?? "").toString().trim(),
      contactPhone: (contactPhone ?? "").toString().trim(),
      isActive: true,
      whatsappMode: wMode,
      whatsappNumber: wMode === "own" ? (whatsappNumber ?? "").trim() : null,
      emailMode: eMode,
      emailFromAddress: eMode === "own" ? (emailFromAddress ?? "").trim() : null,
      emailReplyTo: eMode === "own" ? ((emailReplyTo ?? "").trim() || null) : null,
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
  // Look up current row so PATCH validation can consult effective mode when the
  // payload only updates the number/address (not the mode itself). Prevents the
  // data-integrity hole of mode='own' with empty number.
  const [current] = await db.select().from(branchesTable).where(eq(branchesTable.id, id));
  if (!current) { res.status(404).json({ error: "Branch not found" }); return; }
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
  if (body.whatsappMode !== undefined) {
    const wMode = body.whatsappMode === "own" ? "own" : "head_office";
    updates.whatsappMode = wMode;
    if (wMode === "own") {
      const num = (body.whatsappNumber ?? "").toString().trim();
      if (!num) { res.status(400).json({ error: "WhatsApp number is required when using the branch's own number." }); return; }
      updates.whatsappNumber = num;
    } else {
      updates.whatsappNumber = null;
    }
  } else if (body.whatsappNumber !== undefined) {
    const next = (body.whatsappNumber ?? "").toString().trim();
    if (current.whatsappMode === "own" && !next) {
      res.status(400).json({ error: "WhatsApp number cannot be cleared while mode is set to the branch's own number." });
      return;
    }
    updates.whatsappNumber = next || null;
  }
  if (body.emailFromAddress !== undefined && body.emailMode === undefined) {
    const next = (body.emailFromAddress ?? "").toString().trim();
    if (current.emailMode === "own" && !next) {
      res.status(400).json({ error: "From address cannot be cleared while email mode is set to the branch's own." });
      return;
    }
    updates.emailFromAddress = next || null;
  }
  if (body.emailReplyTo !== undefined && body.emailMode === undefined) {
    updates.emailReplyTo = (body.emailReplyTo ?? "").toString().trim() || null;
  }
  if (body.emailMode !== undefined) {
    const eMode = body.emailMode === "own" ? "own" : "head_office";
    updates.emailMode = eMode;
    if (eMode === "own") {
      const addr = (body.emailFromAddress ?? "").toString().trim();
      if (!addr) { res.status(400).json({ error: "From address is required when using the branch's own email." }); return; }
      updates.emailFromAddress = addr;
      updates.emailReplyTo = (body.emailReplyTo ?? "").toString().trim() || null;
    } else {
      updates.emailFromAddress = null;
      updates.emailReplyTo = null;
    }
  }
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
    // Protect the system fallback branch by identity (lowest-id active row)
    // rather than a hardcoded id=1 — survives reseeded/imported environments.
    const [fallback] = await db.select({ id: branchesTable.id })
      .from(branchesTable)
      .orderBy(branchesTable.id)
      .limit(1);
    if (fallback && id === fallback.id) {
      res.status(400).json({
        error: "The default branch (system fallback) cannot be deactivated.",
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
