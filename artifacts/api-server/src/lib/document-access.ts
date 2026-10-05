import { db, containersTable, userClientAssignmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getBranchScope, userCanAccessBranch, type AuthRequest } from "./auth.js";
import { hasAuthority, hasWorkspace } from "./authorization.js";

export async function getDocumentContainer(req: AuthRequest, id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
  const scope = getBranchScope(req);
  if (!container || !userCanAccessBranch(req, container.branchId) || (scope !== null && scope !== container.branchId)) return null;
  if (!hasAuthority(req.user!.accessProfile, "admin")) {
    const assignments = await db.select().from(userClientAssignmentsTable).where(eq(userClientAssignmentsTable.userId, req.user!.id));
    if (assignments.length && !assignments.some(a => a.clientId === container.clientId)) return null;
  }
  return container;
}
export function canReviewDocuments(req: AuthRequest) {
  return hasAuthority(req.user!.accessProfile, "branch_admin") || hasWorkspace(req.user!.accessProfile, "documentation");
}
