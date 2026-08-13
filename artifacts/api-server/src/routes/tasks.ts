import { Router } from "express";
import { db, containerTasksTable, containersTable, usersTable, workflowNotificationsTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { requireAuth, AuthRequest, userCanAccessBranch } from "../lib/auth.js";

export const tasksRouter = Router();

async function getAccessibleContainer(req: AuthRequest, containerId: number) {
  if (!Number.isInteger(containerId) || containerId <= 0) return null;
  const [container] = await db.select({
    id: containersTable.id,
    branchId: containersTable.branchId,
    containerNumber: containersTable.containerNumber,
  }).from(containersTable).where(eq(containersTable.id, containerId)).limit(1);
  return container && userCanAccessBranch(req, container.branchId) ? container : null;
}

tasksRouter.get("/containers/:id/tasks", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const tasks = await db.select({
      id: containerTasksTable.id,
      containerId: containerTasksTable.containerId,
      title: containerTasksTable.title,
      assignedStaffId: containerTasksTable.assignedStaffId,
      assignedStaffName: usersTable.name,
      dueDate: containerTasksTable.dueDate,
      priority: containerTasksTable.priority,
      status: containerTasksTable.status,
      notes: containerTasksTable.notes,
      createdById: containerTasksTable.createdById,
      createdAt: containerTasksTable.createdAt,
      updatedAt: containerTasksTable.updatedAt,
    }).from(containerTasksTable)
      .leftJoin(usersTable, eq(containerTasksTable.assignedStaffId, usersTable.id))
      .where(eq(containerTasksTable.containerId, containerId))
      .orderBy(asc(containerTasksTable.createdAt));

    return res.json(tasks.map(t => ({
      ...t,
      assignedStaffName: t.assignedStaffName ?? null,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

tasksRouter.post("/containers/:id/tasks", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  const { title, assignedStaffId, dueDate, priority = "medium", notes = "" } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const assigneeId = assignedStaffId ? parseInt(assignedStaffId) : null;
    if (assignedStaffId && (!Number.isInteger(assigneeId) || !assigneeId)) {
      return res.status(400).json({ error: "assignedStaffId must be a valid user id" });
    }
    if (assigneeId) {
      const [assignee] = await db.select({ branchId: usersTable.branchId, isActive: usersTable.isActive })
        .from(usersTable).where(eq(usersTable.id, assigneeId)).limit(1);
      if (!assignee || !assignee.isActive || assignee.branchId !== container.branchId) {
        return res.status(400).json({ error: "Assigned staff must be an active user in the same branch" });
      }
    }
    const [task] = await db.insert(containerTasksTable).values({
      containerId,
      branchId: container.branchId,
      title,
      assignedStaffId: assigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
      priority, notes, status: "pending",
      createdById: req.user!.id,
    }).returning();
    if (task.assignedStaffId) {
      try {
        await db.insert(workflowNotificationsTable).values({
          type: "task_assigned", branchId: container.branchId,
          message: `Task assigned: "${title}" — ${container.containerNumber}`,
          containerId, containerNumber: container.containerNumber,
          targetUserId: task.assignedStaffId,
        });
      } catch {}
    }
    return res.status(201).json({ ...task, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

tasksRouter.patch("/containers/:id/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  const taskId = parseInt(String(req.params.taskId));
  const { title, assignedStaffId, dueDate, priority, status, notes } = req.body;
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const [existingTask] = await db.select().from(containerTasksTable)
      .where(eq(containerTasksTable.id, taskId)).limit(1);
    if (!existingTask || existingTask.containerId !== containerId || existingTask.branchId !== container.branchId) {
      return res.status(404).json({ error: "Task not found" });
    }
    if (assignedStaffId !== undefined && assignedStaffId) {
      const assigneeId = parseInt(assignedStaffId);
      const [assignee] = await db.select({ branchId: usersTable.branchId, isActive: usersTable.isActive })
        .from(usersTable).where(eq(usersTable.id, assigneeId)).limit(1);
      if (!Number.isInteger(assigneeId) || !assignee || !assignee.isActive || assignee.branchId !== container.branchId) {
        return res.status(400).json({ error: "Assigned staff must be an active user in the same branch" });
      }
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId ? parseInt(assignedStaffId) : null;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const [task] = await db.update(containerTasksTable).set(updates)
      .where(eq(containerTasksTable.id, taskId)).returning();
    if (assignedStaffId) {
      try {
        const [c] = await db.select({ containerNumber: containersTable.containerNumber }).from(containersTable).where(eq(containersTable.id, task.containerId));
        await db.insert(workflowNotificationsTable).values({
          type: "task_assigned", branchId: task.branchId,
          message: `Task assigned: "${task.title}" — ${c?.containerNumber ?? `#${task.containerId}`}`,
          containerId: task.containerId, containerNumber: c?.containerNumber ?? null,
          targetUserId: parseInt(assignedStaffId),
        });
      } catch {}
    }
    return res.json({ ...task, dueDate: task.dueDate?.toISOString() ?? null, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

tasksRouter.delete("/containers/:id/tasks/:taskId", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(String(req.params.id));
  const taskId = parseInt(String(req.params.taskId));
  try {
    const container = await getAccessibleContainer(req, containerId);
    if (!container) return res.status(404).json({ error: "Container not found" });
    const [task] = await db.select().from(containerTasksTable).where(eq(containerTasksTable.id, taskId)).limit(1);
    if (!task || task.containerId !== containerId || task.branchId !== container.branchId) {
      return res.status(404).json({ error: "Task not found" });
    }
    await db.delete(containerTasksTable).where(eq(containerTasksTable.id, taskId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
