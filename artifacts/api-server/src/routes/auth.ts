import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  AuthRequest,
} from "../lib/auth.js";

const router = Router();

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const user = users[0];
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

router.get("/auth/me", requireAuth, (req: AuthRequest, res) => {
  const user = req.user!;
  db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1).then(([u]) => {
    if (!u) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      sectionPermission: u.sectionPermission ?? null,
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
    });
  }).catch(() => res.status(500).json({ error: "Server error" }));
});

// Check if first-time setup is needed (no users in the system)
router.get("/auth/setup-required", async (_req, res) => {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    res.json({ required: Number(count) === 0 });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

// Create the first admin account (only works when no users exist)
router.post("/auth/setup", async (req, res) => {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    if (Number(count) > 0) {
      res.status(403).json({ error: "Setup already completed. Please log in." });
      return;
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email, and password are required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const passwordHash = await hashPassword(password);
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      role: "admin",
      isActive: true,
    }).returning();

    const token = signToken(user.id);
    setAuthCookie(res, token);
    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
      },
      message: "Admin account created successfully",
    });
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: "An account with this email already exists" });
      return;
    }
    res.status(500).json({ error: "Server error" });
  }
});

export { router as authRouter };
export { hashPassword };
