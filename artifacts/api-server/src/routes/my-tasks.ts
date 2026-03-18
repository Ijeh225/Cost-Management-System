import { Router } from "express";
import { db, sectionApprovalsTable, containersTable, usersTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, containerTasksTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";

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

    // Determine which sections this user can see
    let mySections: string[] = [];
    if (user.role === "admin") {
      mySections = ["shipping", "customs", "terminal", "delivery", "operations"];
    } else {
      if (user.sectionPermissions) {
        try {
          const perms: Record<string, string> = JSON.parse(user.sectionPermissions as string);
          mySections = Object.entries(perms)
            .filter(([, v]) => v === "edit" || v === "view")
            .map(([k]) => k);
        } catch {}
      }
      if (mySections.length === 0 && user.sectionPermission) {
        mySections = [user.sectionPermission as string];
      }
    }

    // Get containers assigned to this user
    const assignedContainerRows = user.role === "admin"
      ? await db.select().from(containersTable).limit(50)
      : await db.select().from(containersTable).where(eq(containersTable.assignedStaffId, user.id));

    const containerIds = assignedContainerRows.map(c => c.id);
    const staffMap: Record<number, string> = {};
    const staffIds = [...new Set(assignedContainerRows.map(r => r.assignedStaffId).filter(Boolean))] as number[];
    if (staffIds.length > 0) {
      const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
        .where(inArray(usersTable.id, staffIds));
      users.forEach(u => { staffMap[u.id] = u.name; });
    }

    let totalsMap: Record<number, number> = {};
    if (containerIds.length > 0) {
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
      totalCost: totalsMap[c.id] ?? 0,
      grossProfit: parseFloat(c.clearingCharges ?? "0") - (totalsMap[c.id] ?? 0),
    }));

    // Get section approvals relevant to user
    let sectionApprovals: any[] = [];
    if (containerIds.length > 0) {
      const rows = await db.select().from(sectionApprovalsTable)
        .where(inArray(sectionApprovalsTable.containerId, containerIds));
      sectionApprovals = rows
        .filter(r => mySections.includes(r.section))
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

    // Get container tasks assigned to this user (pending, high-priority rejection follow-ups)
    const myContainerTasks = await db.select().from(containerTasksTable)
      .where(eq(containerTasksTable.assignedStaffId, user.id));
    const correctionTasks = myContainerTasks
      .filter(t => t.status !== "completed")
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

    res.json({ assignedContainers, sectionApprovals, mySections, correctionTasks });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as myTasksRouter };
