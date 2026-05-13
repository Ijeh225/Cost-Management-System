import { Router } from "express";
import { db, usersTable, clientsTable, userClientAssignmentsTable, branchesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin, AuthRequest, hashPassword, parseRoles } from "../lib/auth.js";

const router = Router();

const userFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  roles: usersTable.roles,
  sectionPermission: usersTable.sectionPermission,
  sectionPermissions: usersTable.sectionPermissions,
  canUpload: usersTable.canUpload,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
  branchId: usersTable.branchId,
};

type UserRow = {
  id: number;
  email: string;
  name: string;
  role: string;
  roles: string | null;
  sectionPermission: string | null;
  sectionPermissions: string | null;
  canUpload: boolean;
  isActive: boolean;
  createdAt: Date;
  branchId: number;
};

const ELEVATED_ROLES = new Set(["admin", "super_admin"]);

const formatUser = (u: UserRow) => ({
  ...u,
  roles: parseRoles(u.role, u.roles),
  sectionPermission: u.sectionPermission ?? null,
  sectionPermissions: u.sectionPermissions ?? null,
  canUpload: ELEVATED_ROLES.has(u.role) ? true : (u.canUpload ?? false),
  createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
});

router.get("/users", requireAdmin, async (req: AuthRequest, res) => {
  try {
    // Branch isolation (Task #74): non-super-admins see users only in their own branch.
    // Super-admin: respects X-Branch-Id (null = all branches).
    const u = req.user!;
    const branchScope = u.role === "super_admin"
      ? (() => {
          const raw = (req.headers["x-branch-id"] as string | undefined)?.trim();
          if (!raw || raw.toLowerCase() === "all") return null;
          const n = Number(raw);
          return Number.isFinite(n) ? n : null;
        })()
      : u.branchId;
    const baseQ = db.select(userFields).from(usersTable).$dynamic();
    const users = await (branchScope !== null
      ? baseQ.where(eq(usersTable.branchId, branchScope))
      : baseQ).orderBy(usersTable.createdAt);
    res.json(users.map(formatUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/users", requireSuperAdmin, async (req: AuthRequest, res) => {
  try {
    const { email, name, password, role, roles, sectionPermission, sectionPermissions, canUpload, branchId } = req.body;
    if (!email || !name || !password || !role) {
      res.status(400).json({ error: "All fields required" });
      return;
    }
    if (typeof password !== "string" || password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    // Resolve target branch: caller-supplied branchId (Super Admin only path),
    // else fall back to the requester's branch, else the first branch.
    let resolvedBranchId: number | null = null;
    if (branchId != null) {
      const parsed = Number(branchId);
      if (!Number.isInteger(parsed)) {
        res.status(400).json({ error: "Invalid branchId" });
        return;
      }
      const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, parsed)).limit(1);
      if (!b) {
        res.status(400).json({ error: "Branch not found" });
        return;
      }
      resolvedBranchId = b.id;
    } else if (req.user?.branchId) {
      resolvedBranchId = req.user.branchId;
    } else {
      const [first] = await db.select().from(branchesTable).orderBy(asc(branchesTable.id)).limit(1);
      resolvedBranchId = first?.id ?? null;
    }
    if (!resolvedBranchId) {
      res.status(400).json({ error: "No branch available to assign user to" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const rolesJson = Array.isArray(roles) && roles.length > 0 ? JSON.stringify(roles) : null;
    const [user] = await db.insert(usersTable).values({
      email, name, passwordHash, role,
      roles: rolesJson,
      sectionPermission: sectionPermission ?? null,
      sectionPermissions: sectionPermissions ?? null,
      canUpload: ELEVATED_ROLES.has(role) ? true : (canUpload === true),
      isActive: true,
      branchId: resolvedBranchId,
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
    const { name, role, roles, isActive, password, sectionPermission, sectionPermissions, canUpload, branchId } = req.body;
    if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const updates: Partial<typeof usersTable.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (roles !== undefined) {
      updates.roles = Array.isArray(roles) && roles.length > 0 ? JSON.stringify(roles) : null;
    }
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = await hashPassword(password);
    if (sectionPermission !== undefined) updates.sectionPermission = sectionPermission || null;
    if (sectionPermissions !== undefined) updates.sectionPermissions = sectionPermissions || null;
    if (canUpload !== undefined) updates.canUpload = ELEVATED_ROLES.has(updates.role ?? "") ? true : (canUpload === true);
    if (branchId !== undefined) {
      const parsed = Number(branchId);
      if (!Number.isInteger(parsed)) {
        res.status(400).json({ error: "Invalid branchId" });
        return;
      }
      const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, parsed)).limit(1);
      if (!b) {
        res.status(400).json({ error: "Branch not found" });
        return;
      }
      updates.branchId = b.id;
    }
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

router.post("/users/:id/client-assignments", requireAdmin, async (req: AuthRequest, res) => {
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
    const [client] = await db.select({ branchId: clientsTable.branchId }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client) { res.status(404).json({ error: "Client not found" }); return; }
    const [row] = await db.insert(userClientAssignmentsTable).values({ userId, clientId, branchId: client.branchId }).returning();
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
