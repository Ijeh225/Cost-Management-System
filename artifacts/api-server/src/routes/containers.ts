import { Router } from "express";
import { db, containersTable, usersTable, clientsTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, auditLogTable, sectionApprovalsTable } from "@workspace/db";
import { eq, ilike, or, sql, desc, and, inArray } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";

const router = Router();

function formatContainer(c: any, staffName?: string | null, clientName?: string | null) {
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
    clientId: c.clientId ?? null,
    clientName: clientName ?? null,
    totalCost: parseFloat(c.totalCost ?? "0"),
    clearingCharges: parseFloat(c.clearingCharges ?? "0"),
    grossProfit: parseFloat(c.clearingCharges ?? "0") - parseFloat(c.totalCost ?? "0"),
    dutyNotPaid: 0,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
  };
}

async function getOrCreateSectionApproval(containerId: number, section: string) {
  let [row] = await db.select().from(sectionApprovalsTable)
    .where(and(eq(sectionApprovalsTable.containerId, containerId), eq(sectionApprovalsTable.section, section)));
  if (!row) {
    [row] = await db.insert(sectionApprovalsTable).values({ containerId, section, status: "draft" }).returning();
  }
  return row;
}

async function formatSectionApproval(row: any) {
  const submittedBy = row.submittedById
    ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.submittedById)))[0]?.name ?? null
    : null;
  const reviewedBy = row.reviewedById
    ? (await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, row.reviewedById)))[0]?.name ?? null
    : null;
  return {
    id: row.id,
    containerId: row.containerId,
    section: row.section,
    status: row.status,
    submittedById: row.submittedById ?? null,
    submittedByName: submittedBy,
    submittedAt: row.submittedAt instanceof Date ? row.submittedAt.toISOString() : row.submittedAt ?? null,
    reviewedById: row.reviewedById ?? null,
    reviewedByName: reviewedBy,
    reviewedAt: row.reviewedAt instanceof Date ? row.reviewedAt.toISOString() : row.reviewedAt ?? null,
    rejectionReason: row.rejectionReason ?? null,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

async function getOrCreateCharges(containerId: number) {
  let [shipping] = await db.select().from(shippingChargesTable).where(eq(shippingChargesTable.containerId, containerId));
  if (!shipping) {
    [shipping] = await db.insert(shippingChargesTable).values({ containerId }).returning();
  }
  let [customs] = await db.select().from(customsChargesTable).where(eq(customsChargesTable.containerId, containerId));
  if (!customs) {
    [customs] = await db.insert(customsChargesTable).values({ containerId }).returning();
  }
  let [terminal] = await db.select().from(terminalChargesTable).where(eq(terminalChargesTable.containerId, containerId));
  if (!terminal) {
    [terminal] = await db.insert(terminalChargesTable).values({ containerId }).returning();
  }
  let [delivery] = await db.select().from(deliveryChargesTable).where(eq(deliveryChargesTable.containerId, containerId));
  if (!delivery) {
    [delivery] = await db.insert(deliveryChargesTable).values({ containerId }).returning();
  }
  let [operations] = await db.select().from(operationsChargesTable).where(eq(operationsChargesTable.containerId, containerId));
  if (!operations) {
    [operations] = await db.insert(operationsChargesTable).values({ containerId }).returning();
  }
  return { shipping, customs, terminal, delivery, operations };
}

function numericToObj(row: any, exclude = ["id", "containerId", "updatedAt"]) {
  const obj: any = {};
  for (const key of Object.keys(row)) {
    if (exclude.includes(key)) continue;
    obj[key] = parseFloat(row[key] ?? "0");
  }
  return obj;
}

router.get("/containers", requireAuth, async (req, res) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const page = parseInt((req.query.page as string) ?? "1");
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20"), 100);
    const offset = (page - 1) * limit;

    let query = db.select().from(containersTable).$dynamic();
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(containersTable).$dynamic();

    const conditions: any[] = [];
    if (search) {
      conditions.push(or(
        ilike(containersTable.customerName, `%${search}%`),
        ilike(containersTable.containerNumber, `%${search}%`),
        ilike(containersTable.blNumber, `%${search}%`),
      ));
    }
    if (status && status !== "all") {
      conditions.push(eq(containersTable.status, status));
    }
    if (conditions.length > 0) {
      const where = conditions.length === 1 ? conditions[0] : and(...conditions);
      query = query.where(where);
      countQuery = countQuery.where(where);
    }

    const [{ count }] = await countQuery;
    const rows = await query.orderBy(desc(containersTable.updatedAt)).limit(limit).offset(offset);

    // Fetch assigned staff names
    const staffIds = [...new Set(rows.map(r => r.assignedStaffId).filter(Boolean))];
    const staffMap: Record<number, string> = {};
    if (staffIds.length > 0) {
      const staffRows = await db.select({ id: usersTable.id, name: usersTable.name })
        .from(usersTable)
        .where(inArray(usersTable.id, staffIds as number[]));
      staffRows.forEach(s => { staffMap[s.id] = s.name; });
    }

    // For each container we need total cost from charges
    const containerIds = rows.map(r => r.id);
    const totalsMap: Record<number, number> = {};
    const dutyMap: Record<number, number> = {};
    if (containerIds.length > 0) {
      const shippingRows = await db.select().from(shippingChargesTable).where(inArray(shippingChargesTable.containerId, containerIds));
      const customsRows  = await db.select().from(customsChargesTable).where(inArray(customsChargesTable.containerId, containerIds));
      const terminalRows = await db.select().from(terminalChargesTable).where(inArray(terminalChargesTable.containerId, containerIds));
      const deliveryRows = await db.select().from(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, containerIds));
      const opsRows      = await db.select().from(operationsChargesTable).where(inArray(operationsChargesTable.containerId, containerIds));

      const indexBy = (arr: any[]) => {
        const m: Record<number, any> = {};
        arr.forEach(r => { m[r.containerId] = r; });
        return m;
      };
      const sMap = indexBy(shippingRows);
      const cMap = indexBy(customsRows);
      const tMap = indexBy(terminalRows);
      const dMap = indexBy(deliveryRows);
      const oMap = indexBy(opsRows);

      for (const id of containerIds) {
        totalsMap[id] = calcTotalCost(sMap[id] ?? {}, cMap[id] ?? {}, tMap[id] ?? {}, dMap[id] ?? {}, oMap[id] ?? {});
        dutyMap[id] = parseFloat(cMap[id]?.dutyNotPaid ?? "0");
      }
    }

    const containers = rows.map(c => ({
      ...formatContainer(c, c.assignedStaffId ? staffMap[c.assignedStaffId] ?? null : null),
      totalCost: totalsMap[c.id] ?? 0,
      grossProfit: parseFloat(c.clearingCharges ?? "0") - (totalsMap[c.id] ?? 0),
      dutyNotPaid: dutyMap[c.id] ?? 0,
    }));

    res.json({ containers, total: Number(count), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { customerName, containerNumber, blNumber, declaration, size, vessel, clearingCharges } = req.body;
    if (!customerName || !containerNumber || !blNumber) {
      res.status(400).json({ error: "customerName, containerNumber, blNumber are required" });
      return;
    }
    const [container] = await db.insert(containersTable).values({
      customerName,
      containerNumber,
      blNumber,
      declaration: declaration ?? "",
      size: size ?? "",
      vessel: vessel ?? "",
      clearingCharges: String(clearingCharges ?? 0),
    }).returning();
    await getOrCreateCharges(container.id);
    res.status(201).json(formatContainer(container));
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: "Container number or BL number already exists" });
      return;
    }
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/upload", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const { rows, clientId } = req.body;
    if (!Array.isArray(rows)) {
      res.status(400).json({ error: "rows must be an array" });
      return;
    }
    const linkedClientId = clientId ? parseInt(clientId) : null;
    let created = 0;
    const duplicates: string[] = [];
    const errors: string[] = [];

    for (const row of rows) {
      if (!row.containerNumber || !row.blNumber) {
        errors.push(`Missing required fields for row: ${JSON.stringify(row)}`);
        continue;
      }
      const customerName = row.customerName || "";
      try {
        const [container] = await db.insert(containersTable).values({
          customerName,
          containerNumber: row.containerNumber,
          blNumber: row.blNumber,
          declaration: row.declaration ?? "",
          size: row.size ?? "",
          vessel: row.vessel ?? "",
          clearingCharges: String(row.clearingCharges ?? 0),
          clientId: linkedClientId,
        }).returning();
        await getOrCreateCharges(container.id);
        created++;
      } catch (err: any) {
        if (err.code === "23505") {
          duplicates.push(row.containerNumber || row.blNumber);
        } else {
          errors.push(`Error for ${row.containerNumber}: ${err.message}`);
        }
      }
    }

    res.json({ created, duplicates, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/containers/:id", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [c] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!c) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    let staffName: string | null = null;
    if (c.assignedStaffId) {
      const [staff] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, c.assignedStaffId));
      staffName = staff?.name ?? null;
    }
    let clientName: string | null = null;
    if (c.clientId) {
      const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(eq(clientsTable.id, c.clientId));
      clientName = client?.name ?? null;
    }
    const charges = await getOrCreateCharges(id);
    const totalCost = calcTotalCost(charges.shipping, charges.customs, charges.terminal, charges.delivery, charges.operations);
    const dutyNotPaid = parseFloat(charges.customs.dutyNotPaid ?? "0");

    const containerFormatted = {
      ...formatContainer(c, staffName, clientName),
      totalCost,
      grossProfit: parseFloat(c.clearingCharges ?? "0") - totalCost,
      dutyNotPaid,
    };

    const sectionApprovalRows = await db.select().from(sectionApprovalsTable)
      .where(eq(sectionApprovalsTable.containerId, id));
    const sectionApprovals = await Promise.all(sectionApprovalRows.map(formatSectionApproval));

    res.json({
      container: containerFormatted,
      charges: {
        containerId: id,
        shipping: numericToObj(charges.shipping),
        customs: numericToObj(charges.customs),
        terminal: numericToObj(charges.terminal),
        delivery: numericToObj(charges.delivery),
        operations: numericToObj(charges.operations),
        totalCost,
        clearingCharges: parseFloat(c.clearingCharges ?? "0"),
        grossProfit: parseFloat(c.clearingCharges ?? "0") - totalCost,
      },
      sectionApprovals,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/containers/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    if (existing.isLocked) {
      res.status(403).json({ error: "Container is locked" });
      return;
    }
    const { customerName, containerNumber, blNumber, declaration, size, vessel, status, assignedStaffId, clearingCharges } = req.body;
    const updates: any = { updatedAt: new Date() };
    if (customerName !== undefined) updates.customerName = customerName;
    if (containerNumber !== undefined) updates.containerNumber = containerNumber;
    if (blNumber !== undefined) updates.blNumber = blNumber;
    if (declaration !== undefined) updates.declaration = declaration;
    if (size !== undefined) updates.size = size;
    if (vessel !== undefined) updates.vessel = vessel;
    if (status !== undefined) updates.status = status;
    if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId;
    if (clearingCharges !== undefined) updates.clearingCharges = String(clearingCharges);

    const [updated] = await db.update(containersTable).set(updates).where(eq(containersTable.id, id)).returning();

    // Audit log
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "update_container",
      section: "basic_info",
    });

    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/lock", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const { locked, reason } = req.body;
    const [updated] = await db.update(containersTable)
      .set({ isLocked: locked, updatedAt: new Date() })
      .where(eq(containersTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: locked ? "locked" : "unlocked",
      reason: reason ?? null,
    });
    res.json(formatContainer(updated));
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/containers/:id/charges", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [c] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!c) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    const charges = await getOrCreateCharges(id);
    const totalCost = calcTotalCost(charges.shipping, charges.customs, charges.terminal, charges.delivery, charges.operations);
    res.json({
      containerId: id,
      shipping: numericToObj(charges.shipping),
      customs: numericToObj(charges.customs),
      terminal: numericToObj(charges.terminal),
      delivery: numericToObj(charges.delivery),
      operations: numericToObj(charges.operations),
      totalCost,
      clearingCharges: parseFloat(c.clearingCharges ?? "0"),
      grossProfit: parseFloat(c.clearingCharges ?? "0") - totalCost,
    });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/containers/:id/charges", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [c] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!c) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    if (c.isLocked) {
      res.status(403).json({ error: "Container is locked" });
      return;
    }
    const { section, shipping, customs, terminal, delivery, operations, clearingCharges, reason } = req.body;

    // Check section-level lock
    if (section) {
      let lockedSections: string[] = [];
      try { lockedSections = JSON.parse(c.lockedSections ?? "[]"); } catch {}
      if (lockedSections.includes(section)) {
        res.status(403).json({ error: `The ${section} section is locked.` });
        return;
      }
    }

    // Phase 2: section permission check for non-admin staff
    const user = req.user!;
    if (user.role !== "admin" && section) {
      let permsObj: Record<string, string> = {};
      try { if (user.sectionPermissions) permsObj = JSON.parse(user.sectionPermissions as string); } catch {}
      const sectionPerm = permsObj[section] ?? (user.sectionPermission === section ? "edit" : "no_access");
      if (sectionPerm !== "edit") {
        res.status(403).json({ error: `You do not have edit access to the ${section} section.` });
        return;
      }
    }

    const strNums = (obj: any) => {
      if (!obj) return undefined;
      const out: any = {};
      for (const k of Object.keys(obj)) {
        out[k] = String(obj[k] ?? 0);
      }
      return out;
    };

    if (section === "shipping" && shipping) {
      await db.insert(shippingChargesTable)
        .values({ containerId: id, ...strNums(shipping) })
        .onConflictDoUpdate({ target: shippingChargesTable.containerId, set: { ...strNums(shipping), updatedAt: new Date() } });
    }
    if (section === "customs" && customs) {
      await db.insert(customsChargesTable)
        .values({ containerId: id, ...strNums(customs) })
        .onConflictDoUpdate({ target: customsChargesTable.containerId, set: { ...strNums(customs), updatedAt: new Date() } });
    }
    if (section === "terminal" && terminal) {
      await db.insert(terminalChargesTable)
        .values({ containerId: id, ...strNums(terminal) })
        .onConflictDoUpdate({ target: terminalChargesTable.containerId, set: { ...strNums(terminal), updatedAt: new Date() } });
    }
    if (section === "delivery" && delivery) {
      await db.insert(deliveryChargesTable)
        .values({ containerId: id, ...strNums(delivery) })
        .onConflictDoUpdate({ target: deliveryChargesTable.containerId, set: { ...strNums(delivery), updatedAt: new Date() } });
    }
    if (section === "operations" && operations) {
      await db.insert(operationsChargesTable)
        .values({ containerId: id, ...strNums(operations) })
        .onConflictDoUpdate({ target: operationsChargesTable.containerId, set: { ...strNums(operations), updatedAt: new Date() } });
    }

    if (clearingCharges !== undefined) {
      await db.update(containersTable).set({ clearingCharges: String(clearingCharges), updatedAt: new Date() }).where(eq(containersTable.id, id));
    }

    // Audit log
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "update_charges",
      section: section,
      reason: reason ?? null,
    });

    // Recalculate and return
    const charges = await getOrCreateCharges(id);
    const [updated] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    const totalCost = calcTotalCost(charges.shipping, charges.customs, charges.terminal, charges.delivery, charges.operations);
    res.json({
      containerId: id,
      shipping: numericToObj(charges.shipping),
      customs: numericToObj(charges.customs),
      terminal: numericToObj(charges.terminal),
      delivery: numericToObj(charges.delivery),
      operations: numericToObj(charges.operations),
      totalCost,
      clearingCharges: parseFloat(updated.clearingCharges ?? "0"),
      grossProfit: parseFloat(updated.clearingCharges ?? "0") - totalCost,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/sections/:section/submit", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const section = req.params.section;
    const user = req.user!;
    const approval = await getOrCreateSectionApproval(id, section);
    if (approval.status === "submitted") {
      res.status(400).json({ error: "Section already submitted" });
      return;
    }
    const [updated] = await db.update(sectionApprovalsTable)
      .set({ status: "submitted", submittedById: user.id, submittedAt: new Date(), reviewedById: null, reviewedAt: null, rejectionReason: null, updatedAt: new Date() })
      .where(eq(sectionApprovalsTable.id, approval.id))
      .returning();
    await db.insert(auditLogTable).values({ containerId: id, userId: user.id, action: "section_submitted", section });
    res.json(await formatSectionApproval(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/sections/:section/approve", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const section = req.params.section;
    const user = req.user!;
    const approval = await getOrCreateSectionApproval(id, section);
    if (approval.status !== "submitted") {
      res.status(400).json({ error: "Section must be submitted before approval" });
      return;
    }
    const [updated] = await db.update(sectionApprovalsTable)
      .set({ status: "approved", reviewedById: user.id, reviewedAt: new Date(), updatedAt: new Date() })
      .where(eq(sectionApprovalsTable.id, approval.id))
      .returning();
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (section === "container_review") {
      // Full container review approval — advance status to completed
      if (container && container.status !== "completed" && container.status !== "closed") {
        await db.update(containersTable).set({ status: "completed", updatedAt: new Date() }).where(eq(containersTable.id, id));
      }
    } else {
      // Auto-lock the section after approval
      if (container) {
        let lockedSections: string[] = [];
        try { lockedSections = JSON.parse(container.lockedSections ?? "[]"); } catch {}
        if (!lockedSections.includes(section)) {
          lockedSections.push(section);
          await db.update(containersTable).set({ lockedSections: JSON.stringify(lockedSections), updatedAt: new Date() }).where(eq(containersTable.id, id));
        }
      }
    }
    await db.insert(auditLogTable).values({ containerId: id, userId: user.id, action: "section_approved", section });
    res.json(await formatSectionApproval(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/sections/:section/reject", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const section = req.params.section;
    const user = req.user!;
    const { reason } = req.body;
    if (!reason) {
      res.status(400).json({ error: "Rejection reason is required" });
      return;
    }
    const approval = await getOrCreateSectionApproval(id, section);
    if (approval.status !== "submitted") {
      res.status(400).json({ error: "Section must be submitted before rejection" });
      return;
    }
    const [updated] = await db.update(sectionApprovalsTable)
      .set({ status: "rejected", reviewedById: user.id, reviewedAt: new Date(), rejectionReason: reason, updatedAt: new Date() })
      .where(eq(sectionApprovalsTable.id, approval.id))
      .returning();
    await db.insert(auditLogTable).values({ containerId: id, userId: user.id, action: "section_rejected", section, reason });
    res.json(await formatSectionApproval(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/sections/:section/lock", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const section = req.params.section;
    const user = req.user!;
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!container) { res.status(404).json({ error: "Container not found" }); return; }
    let lockedSections: string[] = [];
    try { lockedSections = JSON.parse(container.lockedSections ?? "[]"); } catch {}
    if (!lockedSections.includes(section)) {
      lockedSections.push(section);
      await db.update(containersTable).set({ lockedSections: JSON.stringify(lockedSections), updatedAt: new Date() }).where(eq(containersTable.id, id));
    }
    await db.insert(auditLogTable).values({ containerId: id, userId: user.id, action: "section_locked", section });
    res.json({ message: `Section "${section}" locked` });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/sections/:section/unlock", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const section = req.params.section;
    const user = req.user!;
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!container) { res.status(404).json({ error: "Container not found" }); return; }
    let lockedSections: string[] = [];
    try { lockedSections = JSON.parse(container.lockedSections ?? "[]"); } catch {}
    lockedSections = lockedSections.filter(s => s !== section);
    await db.update(containersTable).set({ lockedSections: JSON.stringify(lockedSections), updatedAt: new Date() }).where(eq(containersTable.id, id));
    await db.insert(auditLogTable).values({ containerId: id, userId: user.id, action: "section_unlocked", section });
    res.json({ message: `Section "${section}" unlocked` });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/containers/:id/audit", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const logs = await db.select({
      id: auditLogTable.id,
      containerId: auditLogTable.containerId,
      userId: auditLogTable.userId,
      userName: usersTable.name,
      action: auditLogTable.action,
      section: auditLogTable.section,
      fieldChanged: auditLogTable.fieldChanged,
      oldValue: auditLogTable.oldValue,
      newValue: auditLogTable.newValue,
      reason: auditLogTable.reason,
      createdAt: auditLogTable.createdAt,
    }).from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
      .where(eq(auditLogTable.containerId, id))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(100);
    res.json(logs.map(l => ({ ...l, userName: l.userName ?? "Unknown", createdAt: l.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/dashboard/stats", requireAuth, async (req: AuthRequest, res) => {
  try {
    const allContainers = await db.select().from(containersTable);
    const totalContainers = allContainers.length;
    const inProgress = allContainers.filter(c =>
      !["completed", "closed"].includes(c.status)
    ).length;
    const completed = allContainers.filter(c => c.status === "completed").length;
    const closed = allContainers.filter(c => c.status === "closed").length;

    const containerIds = allContainers.map(c => c.id);
    let totalCost = 0;
    let totalClearingCharges = 0;
    let totalDutyNotPaid = 0;
    let lowProfitContainers = 0;

    const customsByContainer: Record<number, any> = {};

    if (containerIds.length > 0) {
      const allShipping = await db.select().from(shippingChargesTable);
      const allCustoms = await db.select().from(customsChargesTable);
      const allTerminal = await db.select().from(terminalChargesTable);
      const allDelivery = await db.select().from(deliveryChargesTable);
      const allOps = await db.select().from(operationsChargesTable);

      const indexBy = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
      const sMap = indexBy(allShipping);
      const cMap = indexBy(allCustoms);
      const tMap = indexBy(allTerminal);
      const dMap = indexBy(allDelivery);
      const oMap = indexBy(allOps);

      for (const c of allContainers) {
        const cost = calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
        const clearing = parseFloat(c.clearingCharges ?? "0");
        totalCost += cost;
        totalClearingCharges += clearing;
        totalDutyNotPaid += parseFloat(cMap[c.id]?.dutyNotPaid ?? "0");
        if (clearing - cost < 0) lowProfitContainers++;
        customsByContainer[c.id] = cMap[c.id];
      }
    }

    const totalGrossProfit = totalClearingCharges - totalCost;

    // Containers by status
    const statusCounts: Record<string, number> = {};
    allContainers.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1; });
    const containersByStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count }));

    // Profit by customer (top 10)
    const customerProfit: Record<string, number> = {};
    allContainers.forEach(c => {
      const clearing = parseFloat(c.clearingCharges ?? "0");
      customerProfit[c.customerName] = (customerProfit[c.customerName] ?? 0) + clearing;
    });
    const profitByCustomer = Object.entries(customerProfit)
      .map(([customer, profit]) => ({ customer, profit }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);

    // Cost by vessel (top 10)
    const vesselCost: Record<string, number> = {};
    for (const c of allContainers) {
      if (!c.vessel) continue;
      const allShipping2 = await db.select().from(shippingChargesTable).where(eq(shippingChargesTable.containerId, c.id));
      const allCustoms2 = await db.select().from(customsChargesTable).where(eq(customsChargesTable.containerId, c.id));
      const allTerminal2 = await db.select().from(terminalChargesTable).where(eq(terminalChargesTable.containerId, c.id));
      const allDelivery2 = await db.select().from(deliveryChargesTable).where(eq(deliveryChargesTable.containerId, c.id));
      const allOps2 = await db.select().from(operationsChargesTable).where(eq(operationsChargesTable.containerId, c.id));
      const cost = calcTotalCost(allShipping2[0] ?? {}, allCustoms2[0] ?? {}, allTerminal2[0] ?? {}, allDelivery2[0] ?? {}, allOps2[0] ?? {});
      vesselCost[c.vessel] = (vesselCost[c.vessel] ?? 0) + cost;
    }
    const costByVessel = Object.entries(vesselCost)
      .map(([vessel, cost]) => ({ vessel, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // Recent activity
    const recentLogs = await db.select({
      id: auditLogTable.id,
      containerId: auditLogTable.containerId,
      userId: auditLogTable.userId,
      userName: usersTable.name,
      action: auditLogTable.action,
      section: auditLogTable.section,
      fieldChanged: auditLogTable.fieldChanged,
      oldValue: auditLogTable.oldValue,
      newValue: auditLogTable.newValue,
      reason: auditLogTable.reason,
      createdAt: auditLogTable.createdAt,
    }).from(auditLogTable)
      .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
      .orderBy(desc(auditLogTable.createdAt))
      .limit(10);

    // Role-aware: pendingApprovals and myPendingSections
    const user = (req as AuthRequest).user!;
    let pendingApprovals = 0;
    let myPendingSections = 0;
    let mySections: string[] = [];

    const allApprovals = await db.select().from(sectionApprovalsTable);
    pendingApprovals = allApprovals.filter(a => a.status === "submitted").length;

    if (user.role !== "admin") {
      let permsObj: Record<string, string> = {};
      try { if (user.sectionPermissions) permsObj = JSON.parse(user.sectionPermissions as string); } catch {}
      mySections = Object.keys(permsObj).length > 0
        ? Object.entries(permsObj).filter(([, v]) => v !== "no_access").map(([k]) => k)
        : user.sectionPermission ? [user.sectionPermission as string] : [];

      const myContainerIds = allContainers
        .filter(c => c.assignedStaffId === user.id)
        .map(c => c.id);
      myPendingSections = allApprovals.filter(a =>
        myContainerIds.includes(a.containerId) &&
        mySections.includes(a.section) &&
        a.status === "draft"
      ).length;
    }

    res.json({
      totalContainers,
      inProgress,
      completed,
      closed,
      totalCost,
      totalClearingCharges,
      totalGrossProfit,
      totalDutyNotPaid,
      containersByStatus,
      profitByCustomer,
      costByVessel,
      recentActivity: recentLogs.map(l => ({ ...l, userName: l.userName ?? "Unknown", createdAt: l.createdAt.toISOString() })),
      alerts: {
        lowProfitContainers,
        outstandingDuty: allContainers.filter(c => parseFloat(customsByContainer[c.id]?.dutyNotPaid ?? "0") > 0).length,
        delayedContainers: 0,
      },
      pendingApprovals,
      myPendingSections,
      mySections,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as containersRouter };
