import { Router } from "express";
import { db, usersTable, clientsTable, userClientAssignmentsTable, branchesTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireSuperAdmin, requireBranchAdminOrAbove, AuthRequest, hashPassword, isStrongPassword, STRONG_PASSWORD_MESSAGE, getBranchScope, userCanAccessBranch } from "../lib/auth.js";
import { hasAuthority, resolveAccessProfile, summarizeAccessProfileMigration, validateAccessProfileUpdate } from "../lib/authorization.js";

// Roles a branch_admin is permitted to assign to users they create/edit (Task #75).
// Explicitly excludes super_admin, admin, and branch_admin itself — branch admins
// can never elevate users to peer or higher privilege levels.
const router = Router();

const userFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  roles: usersTable.roles,
  sectionPermission: usersTable.sectionPermission,
  sectionPermissions: usersTable.sectionPermissions,
  authorityLevel: usersTable.authorityLevel,
  jobFunction: usersTable.jobFunction,
  workspaceAccess: usersTable.workspaceAccess,
  accessProfileMigratedAt: usersTable.accessProfileMigratedAt,
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
  authorityLevel: string | null;
  jobFunction: string | null;
  workspaceAccess: string | null;
  accessProfileMigratedAt: Date | null;
  canUpload: boolean;
  isActive: boolean;
  createdAt: Date;
  branchId: number;
};

const formatUser = (u: UserRow) => {
  const accessProfile = resolveAccessProfile(u);
  return {
    ...u,
    role: accessProfile.authorityLevel,
    roles: accessProfile.authorityLevel ? [accessProfile.authorityLevel] : [],
    sectionPermission: null,
    sectionPermissions: null,
    authorityLevel: accessProfile.authorityLevel,
    jobFunction: accessProfile.jobFunction,
    workspaceAccess: accessProfile.source === "modern" ? JSON.stringify(accessProfile.workspaces) : null,
    accessProfileMigratedAt: u.accessProfileMigratedAt instanceof Date ? u.accessProfileMigratedAt.toISOString() : u.accessProfileMigratedAt ?? null,
    accessProfile,
    canUpload: hasAuthority(accessProfile, "admin") ? true : (u.canUpload ?? false),
    createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
  };
};

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

/** Read-only cutover status for Super Admins. */
router.get("/users/rbac-migration-audit", requireSuperAdmin, async (_req: AuthRequest, res) => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        branchId: usersTable.branchId,
        branchName: branchesTable.name,
        isActive: usersTable.isActive,
        role: usersTable.role,
        roles: usersTable.roles,
        sectionPermission: usersTable.sectionPermission,
        sectionPermissions: usersTable.sectionPermissions,
        authorityLevel: usersTable.authorityLevel,
        jobFunction: usersTable.jobFunction,
        workspaceAccess: usersTable.workspaceAccess,
        accessProfileMigratedAt: usersTable.accessProfileMigratedAt,
        canUpload: usersTable.canUpload,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .innerJoin(branchesTable, eq(usersTable.branchId, branchesTable.id))
      .orderBy(asc(branchesTable.name), asc(usersTable.name));

    const migration = summarizeAccessProfileMigration(rows);

    return res.json({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      summary: {
        totalUsers: rows.length,
        activeUsers: rows.filter((user) => user.isActive).length,
        invalidProfiles: migration.invalidProfiles,
        migration,
      },
      users: rows.map(formatUser),
    });
  } catch (error) {
    console.error("Failed to generate RBAC migration audit", error);
    return res.status(500).json({ error: "Failed to generate RBAC migration audit" });
  }
});

/**
 * Access profiles are the only supported authorization configuration.
 */
router.get("/users/:id/access-profile", requireSuperAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user ID" });

  try {
    const [user] = await db.select(userFields).from(usersTable).where(eq(usersTable.id, id)).limit(1);
    if (!user || !userCanAccessBranch(req, user.branchId)) return res.status(404).json({ error: "User not found" });

    return res.json({
      user: formatUser(user),
    });
  } catch (error) {
    console.error("Failed to read user access profile", error);
    return res.status(500).json({ error: "Failed to read user access profile" });
  }
});

router.put("/users/:id/access-profile", requireSuperAdmin, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid user ID" });

  const validated = validateAccessProfileUpdate({
    authorityLevel: req.body?.authorityLevel,
    jobFunction: req.body?.jobFunction,
    workspaceAccess: req.body?.workspaceAccess,
  });
  if (!validated.value) {
    return res.status(400).json({ error: "Invalid access profile", details: validated.errors });
  }

  try {
    const [target] = await db.select({ id: usersTable.id, branchId: usersTable.branchId })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!target || !userCanAccessBranch(req, target.branchId)) return res.status(404).json({ error: "User not found" });

    const [updated] = await db.update(usersTable).set({
      // Keep compatibility columns canonical for integrations that still read
      // them, but do not use them for authorization.
      role: validated.value.authorityLevel,
      roles: JSON.stringify([validated.value.authorityLevel]),
      sectionPermission: null,
      sectionPermissions: null,
      authorityLevel: validated.value.authorityLevel,
      jobFunction: validated.value.jobFunction,
      workspaceAccess: JSON.stringify(validated.value.workspaceAccess),
      accessProfileMigratedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, id)).returning();

    if (!updated) return res.status(404).json({ error: "User not found" });
    return res.json({
      user: formatUser(updated),
      message: "Access profile saved.",
    });
  } catch (error) {
    console.error("Failed to save user access profile", error);
    return res.status(500).json({ error: "Failed to save user access profile" });
  }
});

router.post("/users", requireBranchAdminOrAbove, async (req: AuthRequest, res) => {
  try {
    const { email, name, password, authorityLevel, jobFunction, workspaceAccess, canUpload, branchId } = req.body;
    if (!email || !name || !password) {
      return res.status(400).json({ error: "All fields required" });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: STRONG_PASSWORD_MESSAGE });
    }
    const validated = validateAccessProfileUpdate({ authorityLevel, jobFunction, workspaceAccess });
    if (!validated.value) return res.status(400).json({ error: "Invalid access profile", details: validated.errors });
    if (req.user?.accessProfile.authorityLevel === "branch_admin" && validated.value.authorityLevel !== "staff") {
      return res.status(403).json({ error: "Branch Admins can only create Staff authority accounts." });
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
    const [user] = await db.insert(usersTable).values({
      email: String(email).trim().toLowerCase(),
      name,
      passwordHash,
      role: validated.value.authorityLevel,
      roles: JSON.stringify([validated.value.authorityLevel]),
      sectionPermission: null,
      sectionPermissions: null,
      authorityLevel: validated.value.authorityLevel,
      jobFunction: validated.value.jobFunction,
      workspaceAccess: JSON.stringify(validated.value.workspaceAccess),
      accessProfileMigratedAt: new Date(),
      canUpload: validated.value.authorityLevel === "admin" || validated.value.authorityLevel === "super_admin" ? true : (canUpload === true),
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
    if (!hasAuthority(req.user!.accessProfile, "admin") && req.user?.id !== id) {
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
    const [_target] = await db.select(userFields).from(usersTable).where(eq(usersTable.id, id));
    if (!_target || !userCanAccessBranch(req, _target.branchId)) { res.status(404).json({ error: "User not found" }); return; }
    const { name, isActive, password, canUpload, branchId } = req.body;
    if (["role", "roles", "sectionPermission", "sectionPermissions"].some((field) => req.body?.[field] !== undefined)) {
      return res.status(400).json({ error: "Legacy role and section-permission fields have been retired. Use Access Profile settings instead." });
    }
    const targetProfile = resolveAccessProfile(_target);
    if (req.user?.role === "branch_admin") {
      if (targetProfile.source !== "modern" || targetProfile.authorityLevel !== "staff") {
        return res.status(403).json({ error: "You cannot edit a user with this role." });
      }
      if (branchId !== undefined && Number(branchId) !== req.user.branchId) {
        return res.status(403).json({ error: "You cannot move users to another branch." });
      }
    }
    if (req.user?.id === id) {
      if (branchId !== undefined && Number(branchId) !== _target.branchId) {
        return res.status(400).json({ error: "You cannot change your own branch assignment." });
      }
      if (isActive === false) {
        return res.status(400).json({ error: "You cannot deactivate your own account." });
      }
    }
    if (password !== undefined && password !== "" && !isStrongPassword(password)) {
      return res.status(400).json({ error: STRONG_PASSWORD_MESSAGE });
    }
    const updates: Partial<typeof usersTable.$inferInsert> & { updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (name !== undefined) updates.name = name;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = await hashPassword(password);
    if (canUpload !== undefined) updates.canUpload = hasAuthority(targetProfile, "admin") ? true : (canUpload === true);
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
