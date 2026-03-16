import { Router } from "express";
import { db, sectionApprovalsTable, containersTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAdmin } from "../lib/auth.js";

const router = Router();

router.get("/approvals", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select({
      id: sectionApprovalsTable.id,
      containerId: sectionApprovalsTable.containerId,
      section: sectionApprovalsTable.section,
      status: sectionApprovalsTable.status,
      submittedById: sectionApprovalsTable.submittedById,
      submittedAt: sectionApprovalsTable.submittedAt,
      rejectionReason: sectionApprovalsTable.rejectionReason,
      updatedAt: sectionApprovalsTable.updatedAt,
      containerNumber: containersTable.containerNumber,
      customerName: containersTable.customerName,
    })
      .from(sectionApprovalsTable)
      .innerJoin(containersTable, eq(sectionApprovalsTable.containerId, containersTable.id))
      .orderBy(sectionApprovalsTable.updatedAt);

    const submitterIds = [...new Set(rows.map(r => r.submittedById).filter(Boolean))] as number[];
    const nameMap: Record<number, string> = {};
    if (submitterIds.length > 0) {
      const users = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.isActive, true));
      users.forEach(u => { nameMap[u.id] = u.name; });
    }

    const result = rows.map(r => ({
      id: r.id,
      containerId: r.containerId,
      containerNumber: r.containerNumber,
      customerName: r.customerName,
      section: r.section,
      status: r.status,
      submittedByName: r.submittedById ? (nameMap[r.submittedById] ?? null) : null,
      submittedAt: r.submittedAt instanceof Date ? r.submittedAt.toISOString() : r.submittedAt ?? null,
      rejectionReason: r.rejectionReason ?? null,
      updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as approvalsRouter };
