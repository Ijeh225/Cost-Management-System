import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "JWT_SECRET environment variable must be set in production. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    );
  }
  console.warn(
    "[auth] WARNING: JWT_SECRET is not set. Using an insecure dev fallback. " +
    "Set JWT_SECRET as an environment secret before deploying to production."
  );
}

const SECRET = JWT_SECRET ?? "cost-analysis-dev-only-secret-never-use-in-production";
const COOKIE_NAME = "cost_analysis_session";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken(): string {
  return randomUUID();
}

export function signToken(userId: number, sessionToken: string): string {
  return jwt.sign({ userId, sessionToken }, SECRET, { expiresIn: "7d" });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME);
}

export function parseRoles(role: string, rolesJson: string | null | undefined): string[] {
  if (rolesJson) {
    try {
      const parsed = JSON.parse(rolesJson);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
    } catch {}
  }
  return [role];
}

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    name: string;
    role: string;
    roles: string[];
    sectionPermission: string | null;
    sectionPermissions: string | null;
    canUpload: boolean;
    branchId: number;
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const decoded = jwt.verify(token, SECRET) as { userId: number; sessionToken: string };
    const users = await db.select().from(usersTable).where(eq(usersTable.id, decoded.userId)).limit(1);
    const user = users[0];
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!decoded.sessionToken || user.sessionToken !== decoded.sessionToken) {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }
    // Task #74: hard-fail when branch scope inputs are invalid. Non-super-admin
    // users must have a branchId; super-admin's X-Branch-Id header (if any)
    // must be "all", empty, or a positive integer — never silently fall back.
    if (user.role !== "super_admin" && (user.branchId == null || !Number.isFinite(user.branchId))) {
      res.status(403).json({ error: "Account is not assigned to a branch. Contact a super admin." });
      return;
    }
    if (user.role === "super_admin") {
      const hdr = req.header("x-branch-id") ?? req.header("X-Branch-Id");
      if (hdr != null) {
        const t = String(hdr).trim();
        if (t !== "" && t.toLowerCase() !== "all") {
          const n = Number(t);
          if (!Number.isInteger(n) || n <= 0) {
            res.status(400).json({ error: "Invalid X-Branch-Id header. Use 'all' or a positive branch id." });
            return;
          }
        }
      }
    }
    const isElevated = user.role === "admin" || user.role === "super_admin";
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roles: parseRoles(user.role, user.roles),
      sectionPermission: user.sectionPermission ?? null,
      sectionPermissions: user.sectionPermissions ?? null,
      canUpload: isElevated ? true : (user.canUpload ?? false),
      branchId: user.branchId,
    };
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

/**
 * Allow admin / super_admin / branch_admin (Task #75). Use for operational
 * routes (containers, clients, invoices, banks, expenses, sections,
 * approvals, reports, etc.) that should be accessible to a branch admin
 * within their own branch. Branch scoping is enforced separately via
 * getBranchScope / userCanAccessBranch on each handler.
 */
export async function requireBranchAdminOrAbove(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    const role = req.user?.role;
    if (role !== "admin" && role !== "super_admin" && role !== "branch_admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    const role = req.user?.role;
    if (role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

/**
 * Branch-scope authorization (Task #149). Returns true if the request user
 * may operate on the given branchId. Super admins bypass; everyone else must
 * match. When false, the caller should return 403 (this helper does NOT
 * write to the response).
 */
export function userCanAccessBranch(req: AuthRequest, branchId: number | null | undefined): boolean {
  if (!req.user) return false;
  if (branchId == null) return false;
  // Task #74: enforce active branch scope on every access. For super-admin in
  // "All Branches" mode (scope === null) any branch is allowed; otherwise the
  // record's branchId must match the resolved scope.
  const scope = getBranchScope(req);
  if (scope === null) {
    // Only super-admin can be in null scope (non-super-admin always has scope).
    return req.user.role === "super_admin";
  }
  return scope === branchId;
}

/**
 * Resolve the active branch scope for a request (Task #74).
 *
 * - Non super-admin: always returns the user's own branchId.
 * - Super admin: reads the X-Branch-Id header.
 *     - missing / "" / "all" → null  (All-Branches mode, no filter)
 *     - numeric value        → that branch id
 *
 * Returns null only when the super admin is in All-Branches mode.
 */
export function getBranchScope(req: AuthRequest): number | null {
  if (!req.user) return null;
  if (req.user.role !== "super_admin") return req.user.branchId;
  const raw = req.header("x-branch-id") ?? req.header("X-Branch-Id");
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Used by POST/create endpoints. If the resolved scope is null (super admin
 * in All-Branches mode), responds with 400 and returns false. Otherwise
 * returns the resolved branch id.
 */
export function resolveCreateBranch(req: AuthRequest, res: Response): number | null {
  const scope = getBranchScope(req);
  if (scope == null) {
    res.status(400).json({ error: "Select a specific branch to create records." });
    return null;
  }
  return scope;
}

export async function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (req.user?.role !== "super_admin") {
      res.status(403).json({ error: "Super Admin access required" });
      return;
    }
    next();
  });
}
