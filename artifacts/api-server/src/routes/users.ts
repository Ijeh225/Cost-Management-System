import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest, hashPassword } from "../lib/auth.js";

const router = Router();

const userFields = {
  id: usersTable.id,
  email: usersTable.email,
  name: usersTable.name,
  role: usersTable.role,
  sectionPermission: usersTable.sectionPermission,
  sectionPermissions: usersTable.sectionPermissions,
  isActive: usersTable.isActive,
  createdAt: usersTable.createdAt,
};

const formatUser = (u: any) => ({
  ...u,
  sectionPermission: u.sectionPermission ?? null,
  sectionPermissions: u.sectionPermissions ?? null,
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

router.post("/users", requireAdmin, async (req, res) => {
  try {
    const { email, name, password, role, sectionPermission, sectionPermissions } = req.body;
    if (!email || !name || !password || !role) {
      res.status(400).json({ error: "All fields required" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      email, name, passwordHash, role,
      sectionPermission: sectionPermission ?? null,
      sectionPermissions: sectionPermissions ?? null,
      isActive: true,
    }).returning();
    res.status(201).json(formatUser(user));
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: "Email already exists" });
      return;
    }
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/users/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [user] = await db.select(userFields).from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, role, isActive, password, sectionPermission, sectionPermissions } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;
    if (password) updates.passwordHash = await hashPassword(password);
    if (sectionPermission !== undefined) updates.sectionPermission = sectionPermission || null;
    if (sectionPermissions !== undefined) updates.sectionPermissions = sectionPermissions || null;
    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    res.json(formatUser(user));
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

export { router as usersRouter };
