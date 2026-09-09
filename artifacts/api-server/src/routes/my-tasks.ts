import { Router } from "express";
import { db, sectionApprovalsTable, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, containerTasksTable, userClientAssignmentsTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import { requireAuth, AuthRequest, getBranchScope } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";
import { hasAuthority, hasWorkspace, hasCapability } from "../lib/authorization.js";
import { buildJobOverview, localWorkDate, prioritizeTasks } from "../lib/job-overview.js";

const router = Router();

function formatContainer(c: any, staffName?: string | null) {
  let lockedSections: string[] = [];
  try { lockedSections = JSON.parse(c.lockedSections ?? "[]"); } catch {}
  return {
    id: c.id,
    customerName: c.customerName,
    containerNumber: c.containerNumber,
    blNumber: c.blNumber,
    declaration: c.declaration ?? "",
    size: c.size ?? "",
    vessel: c.vessel ?? "",
    status: c.status,
    isLocked: c.isLocked,
    lockedSections,
    assignedStaffId: c.assignedStaffId ?? null,
    assignedStaffName: staffName ?? null,
    branchId: c.branchId ?? null,
    totalCost: 0,
    clearingCharges: parseFloat(c.clearingCharges ?? "0"),
    grossProfit: 0,
    dutyNotPaid: 0,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

router.get("/my-tasks", requireAuth, async (req: AuthRequest, res) => {
  try {
    const user = req.user!;

    // Modern access profiles are the only source of section visibility.
    const profile = user.accessProfile;
    const isElevated = hasAuthority(profile, "admin");
    const mySections = isElevated
      ? ["shipping", "customs", "terminal", "delivery", "operations"]
      : [
          ...(hasWorkspace(profile, "shipping") ? ["shipping"] : []),
          ...(hasWorkspace(profile, "documentation") || hasWorkspace(profile, "accounts") ? ["customs"] : []),
          ...(hasWorkspace(profile, "terminal") ? ["terminal"] : []),
          ...(hasWorkspace(profile, "delivery") ? ["delivery"] : []),
          ...(profile.jobFunction === "operations" || hasWorkspace(profile, "terminal_manager") ? ["operations"] : []),
        ];

    // My Tasks is an assigned-work queue. A user's general container ownership
    // belongs in the operational workspaces, not in this task list.
    const branchScope = getBranchScope(req);
    const taskConditions = [eq(containerTasksTable.assignedStaffId, user.id)];
    if (branchScope !== null) taskConditions.push(eq(containerTasksTable.branchId, branchScope));
    const myContainerTasks = await db.select().from(containerTasksTable)
      .where(taskConditions.length === 1 ? taskConditions[0] : and(...taskConditions));
    let openTasks = prioritizeTasks(myContainerTasks);
    const containerIds = [...new Set(openTasks.map(t => t.containerId))];
    let assignedContainerRows = containerIds.length > 0
      ? await db.select().from(containersTable).where(inArray(containersTable.id, containerIds))
      : [];
    const assignments = isElevated ? [] : await db.select().from(userClientAssignmentsTable).where(eq(userClientAssignmentsTable.userId, user.id));
    assignedContainerRows = assignedContainerRows.filter(c => (branchScope === null || c.branchId === branchScope)
      && (!assignments.length || assignments.some(a => a.clientId === c.clientId)));
    const visible = new Map(assignedContainerRows.map(c => [c.id, c]));
    openTasks = openTasks.filter(t => visible.get(t.containerId)?.branchId === t.branchId);
    const canFinance = hasCapability(profile, "finance.access");
    const staffMap: Record<number, string> = {};
    const staffIds = [...new Set(assignedContainerRows.map(r => r.assignedStaffId).filter(Boolean))] as number[];
    if (staffIds.length > 0) {
      const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(inArray(usersTable.id, staffIds));
      users.forEach(u => { staffMap[u.id] = u.name; });
    }

    let totalsMap: Record<number, number> = {};
    if (containerIds.length > 0 && canFinance) {
      const allShipping = await db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, containerIds));
      const allCustoms = await db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, containerIds));
      const allTerminal = await db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, containerIds));
      const allDelivery = await db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, containerIds));
      const allOps = await db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, containerIds));
      const idx = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
      const sMap = idx(allShipping), cMap = idx(allCustoms), tMap = idx(allTerminal), dMap = idx(allDelivery), oMap = idx(allOps);
      for (const id of containerIds) {
        totalsMap[id] = calcTotalCost(sMap[id] ?? {}, cMap[id] ?? {}, tMap[id] ?? {}, dMap[id] ?? {}, oMap[id] ?? {});
      }
    }

    const assignedContainers = assignedContainerRows.map(c => ({
      ...formatContainer(c, c.assignedStaffId ? staffMap[c.assignedStaffId] ?? null : null),
      clearingCharges: canFinance ? Number(c.clearingCharges) : 0,
      totalCost: totalsMap[c.id] ?? 0,
      grossProfit: canFinance ? parseFloat(c.clearingCharges ?? "0") - (totalsMap[c.id] ?? 0) : 0,
    }));

    // Get section approvals relevant to user
    let sectionApprovals: any[] = [];
    if (containerIds.length > 0) {
      const rows = await db.select().from(sectionApprovalsTable)
        .where(inArray(sectionApprovalsTable.containerId, containerIds));
      sectionApprovals = rows
        .filter(r => visible.has(r.containerId) && mySections.includes(r.section))
        .map(r => ({
          id: r.id,
          containerId: r.containerId,
          section: r.section,
          status: r.status,
          submittedById: r.submittedById ?? null,
          submittedByName: null,
          submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt ?? null,
          reviewedById: r.reviewedById ?? null,
          reviewedByName: null,
          reviewedAt: r.reviewedAt instanceof Date ? r.reviewedAt.toISOString() : r.reviewedAt ?? null,
          rejectionReason: r.rejectionReason ?? null,
          updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        }));
    }

    const correctionTasks = openTasks
      .map(t => ({
        id: t.id,
        containerId: t.containerId,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        status: t.status,
        dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : t.dueDate ?? null,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        isRejectionTask: t.title.startsWith("Resubmit "),
      }));

    const dailyQueue = openTasks.map(t => {
      const c = visible.get(t.containerId)!;
      const overview = buildJobOverview(c);
      return { id: t.id, containerId: c.id, containerNumber: c.containerNumber, blNumber: c.blNumber,
        branchId: c.branchId, customerName: c.customerName, title: t.title, notes: t.notes,
        priority: t.priority, status: t.status, dueDate: t.dueDate, bucket: t.bucket,
        workflowStage: overview.workflowStage, blockers: overview.blockers,
        missingFinalPrerequisites: overview.missingFinalPrerequisites,
        href: `/containers/${c.id}?tab=tasks&taskId=${t.id}` };
    });
    return res.json({ assignedContainers, sectionApprovals, mySections, correctionTasks, dailyQueue,
      workDate: localWorkDate(new Date()), timeZone: "Africa/Lagos", asOf: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

export { router as myTasksRouter };
