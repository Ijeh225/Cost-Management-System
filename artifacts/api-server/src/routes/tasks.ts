import { Router } from "express";
import { db, containerTasksTable, containersTable, usersTable, workflowNotificationsTable } from "@workspace/db";
import { eq, asc, desc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

export const tasksRouter = Router();

tasksRouter.get("/containers/:id/tasks", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.id);
  try {
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
  const containerId = parseInt(req.params.id);
  const { title, assignedStaffId, dueDate, priority = "medium", notes = "" } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    const [container] = await db.select({ branchId: containersTable.branchId, containerNumber: containersTable.containerNumber }).from(containersTable).where(eq(containersTable.id, containerId));
    if (!container) return res.status(404).json({ error: "Container not found" });
    const [task] = await db.insert(containerTasksTable).values({
      containerId,
      branchId: container.branchId,
      title,
      assignedStaffId: assignedStaffId ? parseInt(assignedStaffId) : null,
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
  const taskId = parseInt(req.params.taskId);
  const { title, assignedStaffId, dueDate, priority, status, notes } = req.body;
  try {
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId ? parseInt(assignedStaffId) : null;
    if (dueDate !== undefined) updates.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) updates.priority = priority;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;

    const [task] = await db.update(containerTasksTable).set(updates).where(eq(containerTasksTable.id, taskId)).returning();
    if (assignedStaffId) {
      try {
        const [c] = await db.select({ containerNumber: containersTable.containerNumber }).from(containersTable).where(eq(containersTable.id, task.containerId));
        await db.insert(workflowNotificationsTable).values({
          type: "task_assigned", branchId: task.branchId,
          message: `Task assigned: "${task.title}" — ${c?.containerNumber ?? `#${task.containerId}`}`,
          containerId: task.containerId, containerNumber: c?.containerNumber ?? null,
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
  const taskId = parseInt(req.params.taskId);
  try {
    await db.delete(containerTasksTable).where(eq(containerTasksTable.id, taskId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
