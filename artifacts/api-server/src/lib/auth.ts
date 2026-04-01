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

export interface AuthRequest extends Request {
  user?: { id: number; email: string; name: string; role: string; sectionPermission: string | null; sectionPermissions: string | null };
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
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sectionPermission: user.sectionPermission ?? null,
      sectionPermissions: user.sectionPermissions ?? null,
    };
    next();
  } catch {
    res.status(401).json({ error: "Not authenticated" });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, () => {
    if (req.user?.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}
