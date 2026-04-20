import { Router } from "express";
import { db, usersTable, clientsTable, userClientAssignmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin, AuthRequest, hashPassword } from "../lib/auth.js";

const router = Router();

const userFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  sectionPermission: usersTable.sectionPermission,
  sectionPermissions: usersTable.sectionPermissions,
  canUpload: usersTable.canUpload,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
};

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  sectionPermission: string | null;
  sectionPermissions: string | null;
  canUpload: boolean;
  isActive: boolean;
  createdAt: Date;
};

const ELEVATED_ROLES = new Set(["admin", "super_admin"]);

const formatUser = (u: UserRow) => ({
  ...u,
  sectionPermission: u.sectionPermission ?? null,
  sectionPermissions: u.sectionPermissions ?? null,
  canUpload: ELEVATED_ROLES.has(u.role) ? true : (u.canUpload ?? false),
  createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
});

router.get("/users", requireAdmin, async (_req, res) => {
  try {
    const users = await db.select(userFields).from(usersTable).orderBy(usersTable.createdAt);
    res.json(users.map(formatUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/users", requireSuperAdmin, async (req, res) => {
  try {
    const { email, name, password, role, sectionPermission, sectionPermissions, canUpload } = req.body;
    if (!email || !name || !password || !role) {
      res.status(400).json({ error: "All fields required" });
      return;
    }
    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email, name, passwordHash, role,
      sectionPermission: sectionPermission ?? null,
      sectionPermissions: sectionPermissions ?? null,
      canUpload: ELEVATED_ROLES.has(role) ? true : (canUpload === true),
      isActive: true,
    }).returning();
    res.status(201).json(formatUser(user));
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "23505") {
      res.status(400).json({ error: "Email already exists" });
      return;
    }
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/users/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    if (!ELEVATED_ROLES.has(req.user?.role ?? "") && req.user?.id !== id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const [user] = await db.select(userFields).from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/users/:id", requireSuperAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const { name, role, isActive, password, sectionPermission, sectionPermissions, canUpload } = req.body;
    if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const updates: Partial<typeof usersTable.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = await hashPassword(password);
    if (sectionPermission !== undefined) updates.sectionPermission = sectionPermission || null;
    if (sectionPermissions !== undefined) updates.sectionPermissions = sectionPermissions || null;
    if (canUpload !== undefined) updates.canUpload = ELEVATED_ROLES.has(updates.role ?? "") ? true : (canUpload === true);
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/users/:id/client-assignments", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const rows = await db
      .select({ id: clientsTable.id, name: clientsTable.name })
      .from(userClientAssignmentsTable)
      .innerJoin(clientsTable, eq(userClientAssignmentsTable.clientId, clientsTable.id))
      .where(eq(userClientAssignmentsTable.userId, userId));
    res.json(rows);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/users/:id/client-assignments", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const { clientId } = req.body;
    if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
    const existing = await db
      .select()
      .from(userClientAssignmentsTable)
      .where(and(eq(userClientAssignmentsTable.userId, userId), eq(userClientAssignmentsTable.clientId, clientId)));
    if (existing.length > 0) { res.status(409).json({ error: "Already assigned" }); return; }
    const [row] = await db.insert(userClientAssignmentsTable).values({ userId, clientId }).returning();
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.delete("/users/:id/client-assignments/:clientId", requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const clientId = parseInt(req.params.clientId);
    if (isNaN(userId) || isNaN(clientId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
    await db
      .delete(userClientAssignmentsTable)
      .where(and(eq(userClientAssignmentsTable.userId, userId), eq(userClientAssignmentsTable.clientId, clientId)));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };
