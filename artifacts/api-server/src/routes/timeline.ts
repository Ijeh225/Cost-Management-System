import { Router } from "express";
import { db, containerTimelineTable, usersTable, containersTable } from "@workspace/db";
import { eq, desc, asc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

export const timelineRouter = Router();

timelineRouter.get("/containers/:id/timeline", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.id);
  try {
    const events = await db.select({
      id: containerTimelineTable.id,
      containerId: containerTimelineTable.containerId,
      title: containerTimelineTable.title,
      eventType: containerTimelineTable.eventType,
      description: containerTimelineTable.description,
      userId: containerTimelineTable.userId,
      userName: usersTable.name,
      status: containerTimelineTable.status,
      createdAt: containerTimelineTable.createdAt,
    }).from(containerTimelineTable)
      .leftJoin(usersTable, eq(containerTimelineTable.userId, usersTable.id))
      .where(eq(containerTimelineTable.containerId, containerId))
      .orderBy(asc(containerTimelineTable.createdAt));

    return res.json(events.map(e => ({ ...e, createdAt: e.createdAt.toISOString(), userName: e.userName ?? "System" })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

timelineRouter.post("/containers/:id/timeline", requireAuth, async (req: AuthRequest, res) => {
  const containerId = parseInt(req.params.id);
  const { title, eventType = "note", description = "", status = "completed" } = req.body;
  if (!title) return res.status(400).json({ error: "title required" });
  try {
    const [event] = await db.insert(containerTimelineTable).values({
      containerId, title, eventType, description, status,
      userId: req.user!.id,
    }).returning();
    return res.status(201).json({ ...event, createdAt: event.createdAt.toISOString() });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

timelineRouter.delete("/containers/:id/timeline/:eventId", requireAuth, async (req: AuthRequest, res) => {
  const eventId = parseInt(req.params.eventId);
  try {
    await db.delete(containerTimelineTable).where(eq(containerTimelineTable.id, eventId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
