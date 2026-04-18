import { Router } from "express";
import { db, containersTable, clientsTable, invoicesTable } from "@workspace/db";
import { ilike, or, desc } from "drizzle-orm";
import { requireAuth } from "../lib/auth.js";

const router = Router();

router.get("/search", requireAuth, async (req, res) => {
  const q = (req.query["q"] as string ?? "").trim();
  if (!q || q.length < 2) {
    return res.json({ containers: [], clients: [], invoices: [] });
  }

  const pattern = `%${q}%`;

  try {
    const [containers, clients, invoices] = await Promise.all([
      db
        .select({
          id: containersTable.id,
          containerNumber: containersTable.containerNumber,
          blNumber: containersTable.blNumber,
          customerName: containersTable.customerName,
          status: containersTable.status,
        })
        .from(containersTable)
        .where(
          or(
            ilike(containersTable.containerNumber, pattern),
            ilike(containersTable.blNumber, pattern),
            ilike(containersTable.customerName, pattern),
          )
        )
        .orderBy(desc(containersTable.createdAt))
        .limit(5),

      db
        .select({
          id: clientsTable.id,
          name: clientsTable.name,
          contactName: clientsTable.contactName,
          contactEmail: clientsTable.contactEmail,
        })
        .from(clientsTable)
        .where(
          or(
            ilike(clientsTable.name, pattern),
            ilike(clientsTable.contactName, pattern),
            ilike(clientsTable.contactEmail, pattern),
          )
        )
        .orderBy(clientsTable.name)
        .limit(5),

      db
        .select({
          id: invoicesTable.id,
          invoiceNumber: invoicesTable.invoiceNumber,
          status: invoicesTable.status,
          total: invoicesTable.total,
          clientId: invoicesTable.clientId,
        })
        .from(invoicesTable)
        .where(
          ilike(invoicesTable.invoiceNumber, pattern)
        )
        .orderBy(desc(invoicesTable.createdAt))
        .limit(5),
    ]);

    return res.json({ containers, clients, invoices });
  } catch (err) {
    console.error("[search] error:", err);
    return res.status(500).json({ error: "Search failed" });
  }
});

export const searchRouter = router;
