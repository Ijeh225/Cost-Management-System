import { Router } from "express";
import { db, containersTable, clientsTable, invoicesTable } from "@workspace/db";
import { ilike, or, desc, eq, and } from "drizzle-orm";
import { requireAuth, AuthRequest, getBranchScope } from "../lib/auth.js";

const router = Router();

router.get("/search", requireAuth, async (req: AuthRequest, res) => {
  const q = (req.query["q"] as string ?? "").trim();
  if (!q || q.length < 2) {
    return res.json({ containers: [], clients: [], invoices: [] });
  }

  const pattern = `%${q}%`;
  const branchScope = getBranchScope(req);
  const containerWhere = branchScope !== null
    ? and(or(ilike(containersTable.containerNumber, pattern), ilike(containersTable.blNumber, pattern), ilike(containersTable.customerName, pattern)), eq(containersTable.branchId, branchScope))
    : or(ilike(containersTable.containerNumber, pattern), ilike(containersTable.blNumber, pattern), ilike(containersTable.customerName, pattern));
  const clientWhere = branchScope !== null
    ? and(or(ilike(clientsTable.name, pattern), ilike(clientsTable.contactName, pattern), ilike(clientsTable.contactEmail, pattern)), eq(clientsTable.branchId, branchScope))
    : or(ilike(clientsTable.name, pattern), ilike(clientsTable.contactName, pattern), ilike(clientsTable.contactEmail, pattern));
  const invoiceWhere = branchScope !== null
    ? and(or(ilike(invoicesTable.invoiceNumber, pattern), ilike(clientsTable.name, pattern)), eq(invoicesTable.branchId, branchScope))
    : or(ilike(invoicesTable.invoiceNumber, pattern), ilike(clientsTable.name, pattern));

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
        .where(containerWhere)
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
        .where(clientWhere)
        .orderBy(clientsTable.name)
        .limit(5),

      db
        .select({
          id: invoicesTable.id,
          invoiceNumber: invoicesTable.invoiceNumber,
          status: invoicesTable.status,
          total: invoicesTable.total,
          clientId: invoicesTable.clientId,
          clientName: clientsTable.name,
        })
        .from(invoicesTable)
        .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
        .where(invoiceWhere)
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
