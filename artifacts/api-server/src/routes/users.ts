import { Router } from "express";
import { db, usersTable, clientsTable, userClientAssignmentsTable, branchesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireAdmin, requireSuperAdmin, requireBranchAdminOrAbove, AuthRequest, hashPassword, parseRoles, getBranchScope, userCanAccessBranch } from "../lib/auth.js";

// Roles a branch_admin is permitted to assign to users they create/edit (Task #75).
// Explicitly excludes super_admin, admin, and branch_admin itself — branch admins
// can never elevate users to peer or higher privilege levels.
const BRANCH_ADMIN_ASSIGNABLE_ROLES = new Set([
  "staff",
  "documentation_user", "accounts_user", "operations_user",
  "transire_user", "shipping_user", "terminal_user", "pull_out_user",
  "shipping_terminal_user", "terminal_manager", "delivery_user", "security_user",
]);

function rolesAllowedForActor(actorRole: string | undefined): (role: string) => boolean {
  if (actorRole === "branch_admin") return (r) => BRANCH_ADMIN_ASSIGNABLE_ROLES.has(r);
  // admin / super_admin can assign any role (existing behavior).
  return () => true;
}

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

router.get("/users", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    // Branch isolation (Task #74): use shared getBranchScope helper.
    const branchScope = getBranchScope(req);
    const baseQ = db.select(userFields).from(usersTable).$dynamic();
    const users = await (branchScope !== null
      ? baseQ.where(eq(usersTable.branchId, branchScope))
      : baseQ).orderBy(usersTable.createdAt);
    return res.json(users.map(formatUser));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/users", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const { email, name, password, role, roles, sectionPermission, sectionPermissions, canUpload, branchId } = req.body;
    if (!email || !name || !password || !role) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    // Task #75: branch_admin can only assign non-elevated roles.
    const allowRole = rolesAllowedForActor(req.user?.role);
    if (!allowRole(role)) {
      return res.status(403).json({ error: "You are not allowed to assign that role." });
    }
    if (Array.isArray(roles)) {
      for (const r of roles) {
        if (!allowRole(r)) { res.status(403).json({ error: "You are not allowed to assign that role." }); return; }
      }
    }
    // Resolve target branch. If the caller explicitly supplies branchId in the
    // body (form branch picker), use it directly — no need to also have the
    // global switcher set to a specific branch. When branchId is omitted, fall
    // back to the active scope from the switcher, then the actor's own branch.
    const _scope = getBranchScope(req);
    let resolvedBranchId: number | null = null;
    if (branchId != null) {
      const parsed = Number(branchId);
      if (!Number.isInteger(parsed)) {
        return res.status(400).json({ error: "Invalid branchId" });
      }
      if (_scope !== null && parsed !== _scope) {
        return res.status(400).json({ error: "branchId must match the active branch scope." });
      }
      const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, parsed)).limit(1);
      if (!b) {
        return res.status(400).json({ error: "Branch not found" });
      }
      resolvedBranchId = b.id;
    } else {
      if (_scope === null && req.user?.role === "super_admin") {
        return res.status(400).json({ error: "Select a specific branch from the switcher before creating a user." });
      }
      resolvedBranchId = _scope ?? req.user?.branchId ?? null;
    }
    if (!resolvedBranchId) {
      return res.status(400).json({ error: "No branch available to assign user to" });
    }
    // Task #75: branch_admin can never create users in another branch.
    if (req.user?.role === "branch_admin" && resolvedBranchId !== req.user.branchId) {
      return res.status(403).json({ error: "You can only create users within your own branch." });
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
    return res.status(201).json(formatUser(user));
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "23505") {
      return res.status(400).json({ error: "Email already exists" });
    }
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/users/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    if (!ELEVATED_ROLES.has(req.user?.role ?? "") && req.user?.id !== id) {
      return res.status(403).json({ error: "Access denied" });
    }
    const [user] = await db.select(userFields).from(usersTable).where(eq(usersTable.id, id));
    if (!user || !userCanAccessBranch(req, user.branchId)) { res.status(404).json({ error: "User not found" }); return; }
    return res.json(formatUser(user));
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/users/:id", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const [_target] = await db.select({ branchId: usersTable.branchId, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, id));
    if (!_target || !userCanAccessBranch(req, _target.branchId)) { res.status(404).json({ error: "User not found" }); return; }
    const { name, role, roles, isActive, password, sectionPermission, sectionPermissions, canUpload, branchId } = req.body;
    // Task #75: branch_admin restrictions.
    //  - Cannot edit users with admin/super_admin/branch_admin role.
    //  - Cannot assign elevated roles.
    //  - Cannot move users to another branch.
    //  - Cannot edit own role / branch / active status.
    if (req.user?.role === "branch_admin") {
      if (["admin", "super_admin", "branch_admin"].includes(_target.role)) {
        return res.status(403).json({ error: "You cannot edit a user with this role." });
      }
      const allowRole = rolesAllowedForActor("branch_admin");
      if (role !== undefined && !allowRole(role)) {
        return res.status(403).json({ error: "You are not allowed to assign that role." });
      }
      if (Array.isArray(roles)) {
        for (const r of roles) {
          if (!allowRole(r)) { res.status(403).json({ error: "You are not allowed to assign that role." }); return; }
        }
      }
      if (branchId !== undefined && Number(branchId) !== req.user.branchId) {
        return res.status(403).json({ error: "You cannot move users to another branch." });
      }
    }
    if (req.user?.id === id) {
      if (role !== undefined && role !== _target.role) {
        return res.status(400).json({ error: "You cannot change your own role." });
      }
      if (branchId !== undefined && Number(branchId) !== _target.branchId) {
        return res.status(400).json({ error: "You cannot change your own branch assignment." });
      }
      if (isActive === false) {
        return res.status(400).json({ error: "You cannot deactivate your own account." });
      }
    }
    if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
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
        return res.status(400).json({ error: "Invalid branchId" });
      }
      const [b] = await db.select().from(branchesTable).where(eq(branchesTable.id, parsed)).limit(1);
      if (!b) {
        return res.status(400).json({ error: "Branch not found" });
      }
      updates.branchId = b.id;
    }
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    return res.json(formatUser(user));
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/users/:id/client-assignments", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const [_target] = await db.select({ branchId: usersTable.branchId }).from(usersTable).where(eq(usersTable.id, userId));
    if (!_target || !userCanAccessBranch(req, _target.branchId)) { res.status(404).json({ error: "User not found" }); return; }
    const rows = await db
      .select({ id: clientsTable.id, name: clientsTable.name })
      .from(userClientAssignmentsTable)
      .innerJoin(clientsTable, eq(userClientAssignmentsTable.clientId, clientsTable.id))
      .where(eq(userClientAssignmentsTable.userId, userId));
    return res.json(rows);
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/users/:id/client-assignments", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    if (isNaN(userId)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const { clientId } = req.body;
    if (!clientId) { res.status(400).json({ error: "clientId required" }); return; }
    const [_target] = await db.select({ branchId: usersTable.branchId }).from(usersTable).where(eq(usersTable.id, userId));
    if (!_target || !userCanAccessBranch(req, _target.branchId)) { res.status(404).json({ error: "User not found" }); return; }
    const existing = await db
      .select()
      .from(userClientAssignmentsTable)
      .where(and(eq(userClientAssignmentsTable.userId, userId), eq(userClientAssignmentsTable.clientId, clientId)));
    if (existing.length > 0) { res.status(409).json({ error: "Already assigned" }); return; }
    const [client] = await db.select({ branchId: clientsTable.branchId }).from(clientsTable).where(eq(clientsTable.id, clientId));
    if (!client || !userCanAccessBranch(req, client.branchId)) { res.status(404).json({ error: "Client not found" }); return; }
    if (client.branchId !== _target.branchId) { res.status(400).json({ error: "User and client must belong to the same branch" }); return; }
    const [row] = await db.insert(userClientAssignmentsTable).values({ userId, clientId, branchId: client.branchId }).returning();
    return res.status(201).json(row);
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/users/:id/client-assignments/:clientId", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const userId = parseInt(String(req.params.id));
    const clientId = parseInt(String(req.params.clientId));
    if (isNaN(userId) || isNaN(clientId)) { res.status(400).json({ error: "Invalid IDs" }); return; }
    const [_target] = await db.select({ branchId: usersTable.branchId }).from(usersTable).where(eq(usersTable.id, userId));
    if (!_target || !userCanAccessBranch(req, _target.branchId)) { res.status(404).json({ error: "User not found" }); return; }
    await db
      .delete(userClientAssignmentsTable)
      .where(and(eq(userClientAssignmentsTable.userId, userId), eq(userClientAssignmentsTable.clientId, clientId)));
    return res.json({ ok: true });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };
