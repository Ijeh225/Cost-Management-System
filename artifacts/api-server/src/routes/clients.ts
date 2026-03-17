import { Router } from "express";
import { db, clientsTable, containersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";

export const clientsRouter = Router();

clientsRouter.get("/clients", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { search } = req.query as Record<string, string>;
    let rows = await db.select().from(clientsTable).orderBy(desc(clientsTable.createdAt));
    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.contactName.toLowerCase().includes(term) ||
        c.contactEmail.toLowerCase().includes(term)
      );
    }
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.post("/clients", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { name, contactName = "", contactEmail = "", contactPhone = "", address = "", notes = "" } = req.body;
    if (!name || typeof name !== "string" || name.trim() === "") {
      return res.status(400).json({ error: "Client name is required" });
    }
    const [client] = await db.insert(clientsTable).values({
      name: name.trim(), contactName, contactEmail, contactPhone, address, notes,
    }).returning();
    return res.status(201).json(client);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.get("/clients/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) return res.status(404).json({ error: "Client not found" });
    const containers = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      blNumber: containersTable.blNumber,
      customerName: containersTable.customerName,
      vessel: containersTable.vessel,
      size: containersTable.size,
      status: containersTable.status,
      clearingCharges: containersTable.clearingCharges,
      createdAt: containersTable.createdAt,
    }).from(containersTable).where(eq(containersTable.clientId, id)).orderBy(desc(containersTable.createdAt));
    return res.json({ ...client, containers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.patch("/clients/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    const { name, contactName, contactEmail, contactPhone, address, notes } = req.body;
    if (name !== undefined && (typeof name !== "string" || name.trim() === "")) {
      return res.status(400).json({ error: "Client name cannot be empty" });
    }
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name.trim();
    if (contactName !== undefined) updates.contactName = contactName;
    if (contactEmail !== undefined) updates.contactEmail = contactEmail;
    if (contactPhone !== undefined) updates.contactPhone = contactPhone;
    if (address !== undefined) updates.address = address;
    if (notes !== undefined) updates.notes = notes;
    const [updated] = await db
      .update(clientsTable)
      .set(updates)
      .where(eq(clientsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Client not found" });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.delete("/clients/:id", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await db.update(containersTable).set({ clientId: null }).where(eq(containersTable.clientId, id));
    await db.delete(clientsTable).where(eq(clientsTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.patch("/clients/:id/link-container", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const clientId = parseInt(req.params.id);
    const { containerId } = req.body as { containerId: number };
    if (isNaN(clientId) || !containerId) return res.status(400).json({ error: "Invalid IDs" });
    await db.update(containersTable).set({ clientId, updatedAt: new Date() }).where(eq(containersTable.id, containerId));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

clientsRouter.patch("/containers/:id/unlink-client", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid ID" });
    await db.update(containersTable).set({ clientId: null, updatedAt: new Date() }).where(eq(containersTable.id, id));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});
