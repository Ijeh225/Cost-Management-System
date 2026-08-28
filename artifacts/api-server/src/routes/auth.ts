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
  createCsrfToken,
  requireAuth,
  AuthRequest,
  isStrongPassword,
  STRONG_PASSWORD_MESSAGE,
} from "../lib/auth.js";
import { hasAuthority, resolveAccessProfile } from "../lib/authorization.js";

const router = Router();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatAuthenticatedUser(user: typeof usersTable.$inferSelect, branchName: string | null) {
  const accessProfile = resolveAccessProfile(user);
  const isElevated = hasAuthority(accessProfile, "admin");

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: accessProfile.authorityLevel,
    roles: accessProfile.authorityLevel ? [accessProfile.authorityLevel] : [],
    sectionPermission: null,
    sectionPermissions: null,
    authorityLevel: accessProfile.authorityLevel,
    jobFunction: accessProfile.jobFunction,
    workspaceAccess: accessProfile.source === "modern" ? JSON.stringify(accessProfile.workspaces) : null,
    accessProfileMigratedAt: user.accessProfileMigratedAt instanceof Date
      ? user.accessProfileMigratedAt.toISOString()
      : user.accessProfileMigratedAt ?? null,
    accessProfile,
    canUpload: isElevated ? true : (user.canUpload ?? false),
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    branchId: user.branchId,
    branchName,
  };
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
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

const loginIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  message: { error: "Too many login attempts from this network. Please try again in 15 minutes." },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => ipKeyGenerator(req.ip ?? "") || "unknown",
});

router.post("/auth/login", loginIpLimiter, loginLimiter, async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password || email.length > 254 || password.length > 256) {
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
    const accessProfile = resolveAccessProfile(user);
    if (accessProfile.source !== "modern") {
      return res.status(403).json({ error: "Your account access profile is not configured. Contact a Super Admin." });
    }
    const isSuperAdmin = accessProfile.authorityLevel === "super_admin";
    if (!isSuperAdmin && (!loginBranch || !loginBranch.isActive)) {
      return res.status(401).json({ error: "Your branch is currently disabled. Please contact an administrator." });
    }
    const sessionToken = generateSessionToken();
    await db
      .update(usersTable)
      .set({ sessionToken, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));
    const token = signToken(user.id, sessionToken);
    setAuthCookie(res, token);
    return res.json({
      user: formatAuthenticatedUser(user, loginBranch?.name ?? null),
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

router.get("/auth/csrf", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db.select({ sessionToken: usersTable.sessionToken }).from(usersTable).where(eq(usersTable.id, req.user!.id)).limit(1);
  if (!user?.sessionToken) return res.status(401).json({ error: "Not authenticated" });
  return res.json({ token: createCsrfToken(user.sessionToken) });
});

router.get("/auth/me", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    if (!u) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const [meBranch] = await db.select().from(branchesTable).where(eq(branchesTable.id, u.branchId)).limit(1);
    return res.json(formatAuthenticatedUser(u, meBranch?.name ?? null));
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
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!name || !email || !password || name.length > 120 || email.length > 254 || !EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ error: STRONG_PASSWORD_MESSAGE });
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
      authorityLevel: "super_admin",
      jobFunction: "general_staff",
      workspaceAccess: "[]",
      accessProfileMigratedAt: new Date(),
      role: "super_admin",
      roles: JSON.stringify(["super_admin"]),
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
