import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { Request, Response, NextFunction } from "express";
import { db, usersTable, branchesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hasAuthority, hasCapability, resolveAccessProfile, type Capability, type ResolvedAccessProfile } from "./authorization.js";
import type { AuthorityLevel } from "./access-policy.js";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ISSUER = "cost-management-system";
const JWT_AUDIENCE = "cost-management-web";
const BCRYPT_ROUNDS = Math.max(
  process.env.NODE_ENV === "production" ? 12 : 10,
  Math.min(15, Number.parseInt(process.env.BCRYPT_ROUNDS ?? "", 10) || 10),
);

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
const CSRF_HEADER = "x-csrf-token";

export function createCsrfToken(sessionToken: string): string {
  return createHmac("sha256", SECRET).update(`csrf:${sessionToken}`).digest("base64url");
}

export function isValidCsrfToken(actual: unknown, sessionToken: string): boolean {
  if (typeof actual !== "string") return false;
  const expected = createCsrfToken(sessionToken);
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function isUnsafeMethod(method: string): boolean {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

export function isStrongPassword(password: unknown): password is string {
  return typeof password === "string"
    && password.length >= 10
    && Buffer.byteLength(password, "utf8") <= 72
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password);
}

export const STRONG_PASSWORD_MESSAGE = "Password must be 10-72 characters and include uppercase, lowercase, and a number";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateSessionToken(): string {
  return randomUUID();
}

export function signToken(userId: number, sessionToken: string): string {
  return jwt.sign({ userId, sessionToken }, SECRET, {
    algorithm: "HS256",
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
    expiresIn: "7d",
  });
}

export function setAuthCookie(res: Response, token: string) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
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
    authorityLevel: string | null;
    jobFunction: string | null;
    workspaceAccess: string | null;
    accessProfileMigratedAt: Date | null;
    accessProfile: ResolvedAccessProfile;
    canUpload: boolean;
    branchId: number;
  };
}

export function hasEffectiveAuthority(req: AuthRequest, minimum: AuthorityLevel): boolean {
  const user = req.user;
  return Boolean(user && hasAuthority(user.accessProfile, minimum));
}

export function isEffectiveSuperAdmin(req: AuthRequest): boolean {
  return hasEffectiveAuthority(req, "super_admin");
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (!token) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    const decoded = jwt.verify(token, SECRET, {
      algorithms: ["HS256"],
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER,
    }) as { userId: number; sessionToken: string };
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
    if (isUnsafeMethod(req.method) && !isValidCsrfToken(req.header(CSRF_HEADER), decoded.sessionToken)) {
      res.status(403).json({ error: "Invalid or missing CSRF token. Refresh the page and try again." });
      return;
    }
    const accessProfile = resolveAccessProfile(user);
    if (accessProfile.source !== "modern" || accessProfile.authorityLevel == null) {
      res.status(403).json({ error: "Your account access profile is not configured. Contact a Super Admin." });
      return;
    }
    const effectiveSuperAdmin = hasAuthority(accessProfile, "super_admin");
    // Task #74: hard-fail when branch scope inputs are invalid. Non-super-admin
    // users must have a branchId; super-admin's X-Branch-Id header (if any)
    // must be "all", empty, or a positive integer — never silently fall back.
    if (!effectiveSuperAdmin && (user.branchId == null || !Number.isFinite(user.branchId))) {
      res.status(403).json({ error: "Account is not assigned to a branch. Contact a super admin." });
      return;
    }
    // Task #75: reject sessions for non-super-admin users whose branch was
    // deactivated after they logged in.
    if (!effectiveSuperAdmin) {
      const [b] = await db.select({ isActive: branchesTable.isActive }).from(branchesTable).where(eq(branchesTable.id, user.branchId)).limit(1);
      if (!b || !b.isActive) {
        res.status(401).json({ error: "Your branch is currently disabled. Please contact an administrator." });
        return;
      }
    }
    if (effectiveSuperAdmin) {
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
    const isElevated = hasAuthority(accessProfile, "admin");
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      // Compatibility fields now expose only canonical authority values.
      // They are not read from legacy database role/section columns.
      role: accessProfile.authorityLevel,
      roles: [accessProfile.authorityLevel],
      sectionPermission: null,
      sectionPermissions: null,
      authorityLevel: accessProfile.authorityLevel,
      jobFunction: accessProfile.jobFunction,
      workspaceAccess: JSON.stringify(accessProfile.workspaces),
      accessProfileMigratedAt: user.accessProfileMigratedAt ?? null,
      accessProfile,
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
    if (!hasEffectiveAuthority(req, "branch_admin")) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

/**
 * Allow admin / super_admin / branch_admin / staff (Task #76). Use for report
 * routes that should be readable by all branch members (staff included),
 * with data automatically scoped to their branch via getBranchScope.
 */
export async function requireBranchMemberOrAbove(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!hasEffectiveAuthority(req, "staff")) {
      res.status(403).json({ error: "Branch member access required" });
      return;
    }
    next();
  });
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!hasEffectiveAuthority(req, "admin")) {
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
    return isEffectiveSuperAdmin(req);
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
  if (!isEffectiveSuperAdmin(req)) return req.user.branchId;
  const raw = req.header("x-branch-id") ?? req.header("X-Branch-Id");
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === "all") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Used by POST/create endpoints. A normal user must create in their resolved
 * branch. A Super Admin in All-Branches mode must explicitly choose a branch
 * supplied by the form; the value is still checked against their authority.
 */
export function resolveCreateBranch(req: AuthRequest, res: Response, requestedBranchId?: unknown): number | null {
  const scope = getBranchScope(req);
  const requested = requestedBranchId == null || requestedBranchId === "" ? null : Number(requestedBranchId);
  if (requested != null && (!Number.isInteger(requested) || requested <= 0)) {
    res.status(400).json({ error: "Select a valid branch to create this record." });
    return null;
  }
  if (scope != null) {
    if (requested != null && requested !== scope) {
      res.status(403).json({ error: "The selected branch does not match your active authorised branch." });
      return null;
    }
    return scope;
  }
  if (requested == null) {
    res.status(400).json({ error: "Select a specific branch to create records." });
    return null;
  }
  if (!userCanAccessBranch(req, requested)) {
    res.status(403).json({ error: "You are not authorised to create records in the selected branch." });
    return null;
  }
  return requested;
}

/**
 * Enforces a modern access-profile capability at the API boundary. UI route
 * guards improve navigation, but this middleware keeps direct API calls from
 * bypassing the same permission policy.
 */
export function requireCapability(capability: Capability) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      if (!req.user || !hasCapability(req.user.accessProfile, capability)) {
        res.status(403).json({ error: "You do not have permission to access this resource." });
        return;
      }
      next();
    });
  };
}

export const requireFinanceAccess = requireCapability("finance.access");

export async function requireSuperAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (!isEffectiveSuperAdmin(req)) {
      res.status(403).json({ error: "Super Admin access required" });
      return;
    }
    next();
  });
}
