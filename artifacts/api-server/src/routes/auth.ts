import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db, usersTable, branchesTable } from "@workspace/db";
import { eq, sql, asc } from "drizzle-orm";
import {
  hashPassword,
  verifyPassword,
  signToken,
  generateSessionToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  AuthRequest,
} from "../lib/auth.js";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  // Key by email so each account has its own bucket (avoids shared-IP proxy issues).
  // Falls back to IP — use ipKeyGenerator helper so IPv6 addresses are normalised.
  keyGenerator: (req) => {
    const email = (req.body?.email ?? "").toString().toLowerCase().trim();
    if (email) return email;
    return ipKeyGenerator(req.ip ?? "") || "unknown";
  },
});

router.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }
    const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    const user = users[0];
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const [loginBranch] = await db.select().from(branchesTable).where(eq(branchesTable.id, user.branchId)).limit(1);
    // Task #75: branch_admin (and any non-super_admin) cannot log in if their
    // branch has been deactivated. Check BEFORE issuing a session cookie.
    if (user.role !== "super_admin" && (!loginBranch || !loginBranch.isActive)) {
      return res.status(401).json({ error: "Your branch is currently disabled. Please contact an administrator." });
    }
    const sessionToken = generateSessionToken();
    await db
      .update(usersTable)
      .set({ sessionToken, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    const token = signToken(user.id, sessionToken);
    setAuthCookie(res, token);
    let parsedRoles: string[] = [user.role];
    if (user.roles) {
      try {
        const arr = JSON.parse(user.roles);
        if (Array.isArray(arr) && arr.length > 0) parsedRoles = arr;
      } catch {}
    }
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        roles: parsedRoles,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        branchId: user.branchId,
        branchName: loginBranch?.name ?? null,
      },
      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/auth/logout", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.user) {
      await db
        .update(usersTable)
        .set({ sessionToken: null, updatedAt: new Date() })
        .where(eq(usersTable.id, req.user.id));
    }
  } catch (err) {
    console.error("Logout session clear error:", err);
  }
  clearAuthCookie(res);
  return res.json({ message: "Logged out" });
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    if (!u) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    let parsedRoles: string[] = [u.role];
    if (u.roles) {
      try {
        const arr = JSON.parse(u.roles);
        if (Array.isArray(arr) && arr.length > 0) parsedRoles = arr;
      } catch {}
    }
    const [meBranch] = await db.select().from(branchesTable).where(eq(branchesTable.id, u.branchId)).limit(1);
    return res.json({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      roles: parsedRoles,
      sectionPermission: u.sectionPermission ?? null,
      sectionPermissions: u.sectionPermissions ?? null,
      canUpload: (u.role === "admin" || u.role === "super_admin") ? true : (u.canUpload ?? false),
      isActive: u.isActive,
      createdAt: u.createdAt.toISOString(),
      branchId: u.branchId,
      branchName: meBranch?.name ?? null,
    });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/auth/setup-required", async (_req, res) => {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    return res.json({ required: Number(count) === 0 });
  } catch {
    return res.status(500).json({ error: "Server error" });
  }
});

router.post("/auth/setup", async (req, res) => {
  try {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable);
    if (Number(count) > 0) {
      return res.status(403).json({ error: "Setup already completed. Please log in." });
    }
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    const passwordHash = await hashPassword(password);
    const sessionToken = generateSessionToken();
    // Setup runs after the multi-branch migration, so the default
    // "Head Office" branch exists. Assign the first super_admin to it.
    const [defaultBranch] = await db.select().from(branchesTable).orderBy(asc(branchesTable.id)).limit(1);
    if (!defaultBranch) {
      return res.status(500).json({ error: "No branches exist. Please restart the server." });
    }
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      role: "super_admin",
      isActive: true,
      sessionToken,
      branchId: defaultBranch.id,
    }).returning();

    const token = signToken(user.id, sessionToken);
    setAuthCookie(res, token);
    return res.status(201).json({
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
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "23505") {
      return res.status(400).json({ error: "An account with this email already exists" });
    }
    return res.status(500).json({ error: "Server error" });
  }
});


export { router as authRouter };
export { hashPassword };
