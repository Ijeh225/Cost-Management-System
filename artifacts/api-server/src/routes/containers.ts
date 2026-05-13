import { Router } from "express";
import { db, containersTable, usersTable, clientsTable, shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable, auditLogTable, sectionApprovalsTable, containerTasksTable, containerTimelineTable, containerDocumentsTable, customFieldValuesTable, invoicesTable, invoicePaymentsTable, containerExtraChargesTable, userClientAssignmentsTable, workflowNotificationsTable } from "@workspace/db";
import { eq, ilike, or, sql, desc, and, inArray, ne, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth.js";
import { calcTotalCost } from "../lib/calculations.js";
import { FX_TARGET_FIELD, FX_TARGET_LABEL, FX_TOLERANCE_NGN } from "../config/fxFieldMapping.js";

const router = Router();

function canUserEditSection(
  user: { role: string; sectionPermission: string | null; sectionPermissions: string | null },
  section: string
): boolean {
  if (user.role === "admin" || user.role === "super_admin") return true;
  // Granular permissions: only explicit "edit" level grants write access ("view" and "no_access" do not)
  if (user.sectionPermissions) {
    try {
      const perms = JSON.parse(user.sectionPermissions) as Record<string, string>;
      if (Object.keys(perms).length > 0) {
        return perms[section] === "edit";
      }
    } catch {}
  }
  // Legacy single-section permission: staff can only edit their assigned section
  if (user.sectionPermission) {
    return user.sectionPermission === section;
  }
  // No permission restrictions configured: allow (matches PUT /charges behavior for unrestricted staff)
  return true;
}

function formatContainer(c: any, staffName?: string | null, clientName?: string | null, berthingConfirmedByName?: string | null) {
  let lockedSections: string[] = [];
  try { lockedSections = JSON.parse(c.lockedSections ?? "[]"); } catch {}
  return {
    id: c.id,
    customerName: clientName ?? c.customerName,
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
    deliveredAt: c.deliveredAt instanceof Date ? c.deliveredAt.toISOString() : (c.deliveredAt ?? null),
    deliveredAtEstimated: c.deliveredAtEstimated ?? false,
    stageOwner: c.stageOwner ?? null,
    nextAction: c.nextAction ?? null,
    nextActionDueDate: c.nextActionDueDate instanceof Date ? c.nextActionDueDate.toISOString() : (c.nextActionDueDate ?? null),
    delayReason: c.delayReason ?? null,
    deliveryTime: c.deliveryTime ?? null,
    deliveryLocation: c.deliveryLocation ?? null,
    truckNumber: c.truckNumber ?? null,
    driverName: c.driverName ?? null,
    driverPhone: c.driverPhone ?? null,
    dispatchOfficer: c.dispatchOfficer ?? null,
    deliveryStatus: c.deliveryStatus ?? "pending",
    offloadingConfirmed: c.offloadingConfirmed ?? false,
    emptyReturnDueDate: c.emptyReturnDueDate instanceof Date ? c.emptyReturnDueDate.toISOString() : (c.emptyReturnDueDate ?? null),
    emptyReturnDate: c.emptyReturnDate instanceof Date ? c.emptyReturnDate.toISOString() : (c.emptyReturnDate ?? null),
    paarNumber: c.paarNumber ?? null,
    paarOfficer: c.paarOfficer ?? null,
    paarReleasedAt: c.paarReleasedAt instanceof Date ? c.paarReleasedAt.toISOString() : (c.paarReleasedAt ?? null),
    paarDelayReason: c.paarDelayReason ?? null,
    eta: c.eta instanceof Date ? c.eta.toISOString() : (c.eta ?? null),
    command: c.command ?? null,
    consignee: c.consignee ?? null,
    berthed: c.berthed ?? false,
    berthingConfirmedAt: c.berthingConfirmedAt instanceof Date ? c.berthingConfirmedAt.toISOString() : (c.berthingConfirmedAt ?? null),
    berthingConfirmedById: c.berthingConfirmedById ?? null,
    berthingConfirmedByName: berthingConfirmedByName ?? null,
    verifiedAt: c.verifiedAt instanceof Date ? c.verifiedAt.toISOString() : (c.verifiedAt ?? null),
    verifiedBy: c.verifiedBy ?? null,
    createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
    updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : c.updatedAt,
    expectedTransireDate: c.expectedTransireDate instanceof Date ? c.expectedTransireDate.toISOString() : (c.expectedTransireDate ?? null),
    transireReleasedAt: c.transireReleasedAt instanceof Date ? c.transireReleasedAt.toISOString() : (c.transireReleasedAt ?? null),
    transireDelayReason: c.transireDelayReason ?? null,
    transireFinalDate: c.transireFinalDate instanceof Date ? c.transireFinalDate.toISOString() : (c.transireFinalDate ?? null),
    expectedDoDate: c.expectedDoDate instanceof Date ? c.expectedDoDate.toISOString() : (c.expectedDoDate ?? null),
    doReleasedAt: c.doReleasedAt instanceof Date ? c.doReleasedAt.toISOString() : (c.doReleasedAt ?? null),
    doDelayReason: c.doDelayReason ?? null,
    doFinalDate: c.doFinalDate instanceof Date ? c.doFinalDate.toISOString() : (c.doFinalDate ?? null),
    expectedTdoDate: c.expectedTdoDate instanceof Date ? c.expectedTdoDate.toISOString() : (c.expectedTdoDate ?? null),
    tdoReleasedAt: c.tdoReleasedAt instanceof Date ? c.tdoReleasedAt.toISOString() : (c.tdoReleasedAt ?? null),
    tdoDelayReason: c.tdoDelayReason ?? null,
    tdoFinalDate: c.tdoFinalDate instanceof Date ? c.tdoFinalDate.toISOString() : (c.tdoFinalDate ?? null),
    expectedPulloutDate: c.expectedPulloutDate instanceof Date ? c.expectedPulloutDate.toISOString() : (c.expectedPulloutDate ?? null),
    pulloutReleasedAt: c.pulloutReleasedAt instanceof Date ? c.pulloutReleasedAt.toISOString() : (c.pulloutReleasedAt ?? null),
    pulloutDelayReason: c.pulloutDelayReason ?? null,
    pulloutFinalDate: c.pulloutFinalDate instanceof Date ? c.pulloutFinalDate.toISOString() : (c.pulloutFinalDate ?? null),
    expectedReleaseDate: c.expectedReleaseDate instanceof Date ? c.expectedReleaseDate.toISOString() : (c.expectedReleaseDate ?? null),
    releaseConfirmedAt: c.releaseConfirmedAt instanceof Date ? c.releaseConfirmedAt.toISOString() : (c.releaseConfirmedAt ?? null),
    releaseDelayReason: c.releaseDelayReason ?? null,
    releaseFinalDate: c.releaseFinalDate instanceof Date ? c.releaseFinalDate.toISOString() : (c.releaseFinalDate ?? null),
    earlyStartAuthorized: c.earlyStartAuthorized ?? false,
    earlyStartAuthorizedById: c.earlyStartAuthorizedById ?? null,
    earlyStartAuthorizedAt: c.earlyStartAuthorizedAt instanceof Date ? c.earlyStartAuthorizedAt.toISOString() : (c.earlyStartAuthorizedAt ?? null),
    earlyStartReason: c.earlyStartReason ?? null,
    gateInDate: c.gateInDate instanceof Date ? c.gateInDate.toISOString() : (c.gateInDate ?? null),
    gateOutDate: c.gateOutDate instanceof Date ? c.gateOutDate.toISOString() : (c.gateOutDate ?? null),
    emptyGateInDate: c.emptyGateInDate instanceof Date ? c.emptyGateInDate.toISOString() : (c.emptyGateInDate ?? null),
    emptyGateOutDate: c.emptyGateOutDate instanceof Date ? c.emptyGateOutDate.toISOString() : (c.emptyGateOutDate ?? null),
    stageEnteredAt: c.stageEnteredAt instanceof Date ? c.stageEnteredAt.toISOString() : (c.stageEnteredAt ?? null),
    // Computed: total custody days from gate-in to empty return (or running if not yet returned)
    lifespanDays: (() => {
      const start = c.gateInDate instanceof Date ? c.gateInDate : (c.gateInDate ? new Date(c.gateInDate) : null);
      if (!start) return null;
      const end = c.emptyReturnDate instanceof Date ? c.emptyReturnDate : (c.emptyReturnDate ? new Date(c.emptyReturnDate) : null);
      const ref = end ?? new Date();
      return Math.max(0, Math.floor((ref.getTime() - start.getTime()) / 86_400_000));
    })(),
    lifespanClosed: !!(c.emptyReturnDate),
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
    const val = row[key];
    obj[key] = val == null ? null : parseFloat(val);
  }
  return obj;
}

const VALID_COMMANDS = ["PTML", "TinCan", "Apapa", "Lekki"] as const;
type CommandValue = typeof VALID_COMMANDS[number];

function normalizeCommand(raw: string): CommandValue | null {
  const map: Record<string, CommandValue> = {
    ptml: "PTML",
    tincan: "TinCan", "tin can": "TinCan", tinccan: "TinCan",
    apapa: "Apapa",
    lekki: "Lekki",
  };
  return map[raw.toLowerCase().trim()] ?? null;
}

router.get("/containers", requireAuth, async (req: AuthRequest, res) => {
  try {
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const berthedFilter = req.query.berthed as string | undefined;
    const commandFilter = req.query.command as string | undefined;
    const dutyPaymentStatus = (req.query.dutyPaymentStatus as string | undefined)?.trim();
    const page = parseInt((req.query.page as string) ?? "1");
    const limit = Math.min(parseInt((req.query.limit as string) ?? "20"), 1000);
    const offset = (page - 1) * limit;

    let query = db.select().from(containersTable).$dynamic();
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(containersTable).$dynamic();

    const conditions: any[] = [];

    // If non-admin user has client assignments, restrict to assigned clients only
    if (req.user && req.user.role !== "admin" && req.user.role !== "super_admin") {
      const assignments = await db
        .select({ clientId: userClientAssignmentsTable.clientId })
        .from(userClientAssignmentsTable)
        .where(eq(userClientAssignmentsTable.userId, req.user.id));
      if (assignments.length > 0) {
        const assignedClientIds = assignments.map(a => a.clientId);
        conditions.push(inArray(containersTable.clientId, assignedClientIds));
      }
    }
    if (search) {
      conditions.push(or(
        ilike(containersTable.customerName, `%${search}%`),
        ilike(containersTable.containerNumber, `%${search}%`),
        ilike(containersTable.blNumber, `%${search}%`),
      ));
    }
    // Non-admins never see pending_verification containers — they are pre-pipeline
    // and must be reviewed by an admin before entering operations. This gate is
    // applied unconditionally so it cannot be bypassed via the status parameter.
    const isAdmin = req.user?.role === "admin" || req.user?.role === "super_admin";
    if (!isAdmin) {
      conditions.push(ne(containersTable.status, "pending_verification"));
    }
    if (status && status !== "all") {
      const parts = status.split(",").map(s => s.trim()).filter(Boolean);
      if (parts.length > 1) {
        conditions.push(inArray(containersTable.status, parts));
      } else if (parts.length === 1) {
        conditions.push(eq(containersTable.status, parts[0]));
      }
    }
    if (berthedFilter === "true") {
      conditions.push(eq(containersTable.berthed, true));
    } else if (berthedFilter === "false") {
      conditions.push(eq(containersTable.berthed, false));
    }
    if (dutyPaymentStatus && dutyPaymentStatus !== "all") {
      // Push duty-payment status filter down to SQL via a correlated subquery on customs_charges.
      if (dutyPaymentStatus === "paid") {
        conditions.push(sql`EXISTS (SELECT 1 FROM customs_charges cc WHERE cc.container_id = ${containersTable.id} AND cc.duty > 0 AND cc."dutyPaid" > 0 AND (cc.duty - cc."dutyPaid") <= 0)`);
      } else if (dutyPaymentStatus === "partial") {
        conditions.push(sql`EXISTS (SELECT 1 FROM customs_charges cc WHERE cc.container_id = ${containersTable.id} AND cc."dutyPaid" > 0 AND (cc.duty - cc."dutyPaid") > 0)`);
      } else if (dutyPaymentStatus === "unpaid") {
        conditions.push(sql`EXISTS (SELECT 1 FROM customs_charges cc WHERE cc.container_id = ${containersTable.id} AND cc.duty > 0 AND COALESCE(cc."dutyPaid", 0) = 0)`);
      } else if (dutyPaymentStatus === "not_assessed") {
        conditions.push(sql`NOT EXISTS (SELECT 1 FROM customs_charges cc WHERE cc.container_id = ${containersTable.id} AND cc.duty > 0)`);
      }
    }
    if (commandFilter && commandFilter !== "all") {
      conditions.push(eq(containersTable.command, commandFilter));
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

    // Fetch linked client names (preferred over stored customerName)
    const clientIds = [...new Set(rows.map(r => r.clientId).filter(Boolean))];
    const clientMap: Record<number, string> = {};
    if (clientIds.length > 0) {
      const clientRows = await db.select({ id: clientsTable.id, name: clientsTable.name })
        .from(clientsTable)
        .where(inArray(clientsTable.id, clientIds as number[]));
      clientRows.forEach(cl => { clientMap[cl.id] = cl.name; });
    }

    // For each container we need total cost from charges
    const containerIds = rows.map(r => r.id);
    const totalsMap: Record<number, number> = {};
    const dutyMap: Record<number, number> = {};
    const dutyAssessedMap: Record<number, number> = {};
    const dutyPaidMap: Record<number, number> = {};
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

      const extraRows = await db.select({ containerId: containerExtraChargesTable.containerId, amount: containerExtraChargesTable.amount })
        .from(containerExtraChargesTable).where(inArray(containerExtraChargesTable.containerId, containerIds));
      const extraTotalsMap: Record<number, number> = {};
      for (const r of extraRows) {
        extraTotalsMap[r.containerId] = (extraTotalsMap[r.containerId] ?? 0) + parseFloat(r.amount ?? "0");
      }

      for (const id of containerIds) {
        totalsMap[id] = calcTotalCost(sMap[id] ?? {}, cMap[id] ?? {}, tMap[id] ?? {}, dMap[id] ?? {}, oMap[id] ?? {}) + (extraTotalsMap[id] ?? 0);
        dutyMap[id] = parseFloat(cMap[id]?.dutyNotPaid ?? "0");
        dutyAssessedMap[id] = parseFloat(cMap[id]?.duty ?? "0");
        dutyPaidMap[id] = parseFloat(cMap[id]?.dutyPaid ?? "0");
      }
    }

    const containers = rows.map(c => ({
      ...formatContainer(c, c.assignedStaffId ? staffMap[c.assignedStaffId] ?? null : null, c.clientId ? clientMap[c.clientId] ?? null : null),
      totalCost: totalsMap[c.id] ?? 0,
      grossProfit: parseFloat(c.clearingCharges ?? "0") - (totalsMap[c.id] ?? 0),
      dutyNotPaid: dutyMap[c.id] ?? 0,
      duty:        dutyAssessedMap[c.id] ?? 0,
      dutyPaid:    dutyPaidMap[c.id] ?? 0,
    }));

    res.json({ containers, total: Number(count), page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { customerName, containerNumber, blNumber, command, declaration, size, vessel, clearingCharges, clientId, eta, consignee } = req.body;
    const trimmedCustomer = typeof customerName === "string" ? customerName.trim() : "";
    const parsedClientId = clientId ? Number(clientId) : null;
    if (!containerNumber || !blNumber) {
      res.status(400).json({ error: "containerNumber and blNumber are required" });
      return;
    }
    if (!command || !(VALID_COMMANDS as readonly string[]).includes(command)) {
      res.status(400).json({ error: `Command is required. Must be one of: ${VALID_COMMANDS.join(", ")}` });
      return;
    }
    let resolvedCustomerName = trimmedCustomer;
    if (!resolvedCustomerName && parsedClientId) {
      const [linkedClient] = await db
        .select({ name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.id, parsedClientId));
      if (linkedClient?.name) {
        resolvedCustomerName = linkedClient.name;
      }
    }
    if (!resolvedCustomerName) {
      res.status(400).json({ error: "customerName is required (or pick a client to auto-fill)" });
      return;
    }
    const [container] = await db.insert(containersTable).values({
      customerName: resolvedCustomerName,
      containerNumber,
      blNumber,
      command,
      declaration: declaration ?? "",
      size: size ?? "",
      vessel: vessel ?? "",
      clearingCharges: String(clearingCharges ?? 0),
      clientId: parsedClientId,
      eta: eta ? new Date(eta) : null,
      consignee: consignee || null,
    }).returning();
    await getOrCreateCharges(container.id);
    // Notify: new job created
    await db.insert(workflowNotificationsTable).values({
      type: "new_job",
      message: `New job created: ${containerNumber} (${resolvedCustomerName})`,
      containerId: container.id,
      containerNumber: container.containerNumber,
    });
    res.status(201).json(formatContainer(container));
  } catch (err: any) {
    if (err.code === "23505") {
      res.status(400).json({ error: "Container number or BL number already exists" });
      return;
    }
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/check-duplicates", requireAuth, async (_req, res) => {
  const req = _req as AuthRequest;
  const { containerNumbers, blNumbers } = req.body;
  if (!Array.isArray(containerNumbers) || !Array.isArray(blNumbers)) {
    res.status(400).json({ error: "containerNumbers and blNumbers must be arrays" });
    return;
  }
  try {
    const [existingCons, existingBls] = await Promise.all([
      containerNumbers.length > 0
        ? db
            .select({ containerNumber: containersTable.containerNumber })
            .from(containersTable)
            .where(inArray(containersTable.containerNumber, containerNumbers))
        : Promise.resolve([]),
      blNumbers.length > 0
        ? db
            .select({ blNumber: containersTable.blNumber })
            .from(containersTable)
            .where(inArray(containersTable.blNumber, blNumbers))
        : Promise.resolve([]),
    ]);
    res.json({
      existingContainerNumbers: existingCons.map((r) => r.containerNumber),
      existingBlNumbers: existingBls.map((r) => r.blNumber),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/upload", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user!.canUpload) {
    return res.status(403).json({ error: "You don't have permission to upload data." });
  }
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

    // Pre-validate: reject entire upload if any row is missing a valid command
    const missingCommandRows: number[] = [];
    rows.forEach((row: any, idx: number) => {
      const normalized = row.command ? normalizeCommand(String(row.command)) : null;
      if (!normalized) missingCommandRows.push(idx + 1);
    });
    if (missingCommandRows.length > 0) {
      return res.status(400).json({
        error: `Upload rejected: The "Command" field is required for every row. ` +
          `${missingCommandRows.length} row${missingCommandRows.length === 1 ? "" : "s"} ` +
          `${missingCommandRows.length === 1 ? "is" : "are"} missing a valid Command ` +
          `(row${missingCommandRows.length === 1 ? "" : "s"} ${missingCommandRows.slice(0, 10).join(", ")}` +
          `${missingCommandRows.length > 10 ? "…" : ""}). ` +
          `Valid values: ${VALID_COMMANDS.join(", ")}. Please add the Command column and re-upload.`,
      });
    }

    for (const row of rows) {
      if (!row.containerNumber || !row.blNumber) {
        errors.push(`Missing required fields for row: ${JSON.stringify(row)}`);
        continue;
      }
      const customerName = row.customerName || "";
      const normalizedCommand = normalizeCommand(String(row.command ?? "")) ?? row.command;
      try {
        let etaDate: Date | null = null;
        if (row.eta) {
          const parsed = new Date(row.eta);
          if (!isNaN(parsed.getTime())) etaDate = parsed;
        }
        const [container] = await db.insert(containersTable).values({
          customerName,
          containerNumber: row.containerNumber,
          blNumber: row.blNumber,
          command: normalizedCommand,
          declaration: row.declaration ?? "",
          size: row.size ?? "",
          vessel: row.vessel ?? "",
          clearingCharges: String(row.clearingCharges ?? 0),
          clientId: linkedClientId,
          eta: etaDate,
          consignee: row.consignee ?? null,
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

router.get("/containers/paar-status", requireAuth, async (req, res) => {
  try {
    const rows = await db
      .select({
        id: containersTable.id,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        customerName: containersTable.customerName,
        status: containersTable.status,
        paarOfficer: containersTable.paarOfficer,
        paarReleasedAt: containersTable.paarReleasedAt,
        paarDelayReason: containersTable.paarDelayReason,
        createdAt: containersTable.createdAt,
      })
      .from(containersTable)
      .where(isNotNull(containersTable.verifiedAt))
      .orderBy(desc(containersTable.createdAt));

    const items = rows.map(r => ({
      id: r.id,
      containerNumber: r.containerNumber,
      blNumber: r.blNumber,
      customerName: r.customerName,
      status: r.status,
      paarOfficer: r.paarOfficer ?? null,
      paarReleasedAt: r.paarReleasedAt instanceof Date ? r.paarReleasedAt.toISOString() : (r.paarReleasedAt ?? null),
      paarDelayReason: r.paarDelayReason ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

    res.json({ containers: items, total: items.length });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/containers/pipeline", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const rows = await db.select({
      id: containersTable.id,
      containerNumber: containersTable.containerNumber,
      blNumber: containersTable.blNumber,
      customerName: containersTable.customerName,
      status: containersTable.status,
      updatedAt: containersTable.updatedAt,
      stageEnteredAt: containersTable.stageEnteredAt,
      assignedStaffName: usersTable.name,
      stageOwner: containersTable.stageOwner,
      nextAction: containersTable.nextAction,
      nextActionDueDate: containersTable.nextActionDueDate,
      delayReason: containersTable.delayReason,
      paarNumber: containersTable.paarNumber,
      paarReleasedAt: containersTable.paarReleasedAt,
      paarDelayReason: containersTable.paarDelayReason,
      duty:        customsChargesTable.duty,
      dutyPaid:    customsChargesTable.dutyPaid,
      dutyNotPaid: customsChargesTable.dutyNotPaid,
      earlyStartAuthorized: containersTable.earlyStartAuthorized,
      earlyStartReason: containersTable.earlyStartReason,
      earlyStartAuthorizedAt: containersTable.earlyStartAuthorizedAt,
      expectedReleaseDate: containersTable.expectedReleaseDate,
      releaseConfirmedAt: containersTable.releaseConfirmedAt,
      releaseDelayReason: containersTable.releaseDelayReason,
      releaseFinalDate: containersTable.releaseFinalDate,
      tdoReleasedAt: containersTable.tdoReleasedAt,
      gateInDate: containersTable.gateInDate,
      emptyReturnDate: containersTable.emptyReturnDate,
      emptyReturnDueDate: containersTable.emptyReturnDueDate,
    })
      .from(containersTable)
      .leftJoin(usersTable, eq(containersTable.assignedStaffId, usersTable.id))
      .leftJoin(customsChargesTable, eq(customsChargesTable.containerId, containersTable.id))
      .where(isNotNull(containersTable.verifiedAt));

    // The three field-ops stages run in parallel — a container in any one of them
    // appears in all three tabs of the ops workspace simultaneously.
    const PARALLEL_OPS_STAGES = ["transire_processing", "shipping", "terminal"] as const;
    const PARALLEL_OPS_SET   = new Set<string>(PARALLEL_OPS_STAGES);

    // Doc-adjacent stages: containers here that have earlyStartAuthorized also
    // appear virtually in all three ops workspace tabs simultaneously.
    const EARLY_START_STAGES = new Set(["registered", "documentation", "duty_assessment", "duty_payment"]);

    const stages: Record<string, Array<{
      id: number;
      containerNumber: string;
      blNumber: string;
      customerName: string;
      status: string;
      updatedAt: string;
      daysInStage: number;
      assignedStaffName: string | null;
      stageOwnerName: string | null;
      nextAction: string | null;
      nextActionDueAt: string | null;
      delayReason: string | null;
      paarNumber: string | null;
      paarReleasedAt: string | null;
      paarDelayReason: string | null;
      duty: number;
      dutyPaid: number;
      dutyNotPaid: number;
      isEarlyStart?: boolean;
      earlyStartReason?: string | null;
      earlyStartAuthorizedAt?: string | null;
      expectedReleaseDate?: string | null;
      releaseConfirmedAt?: string | null;
      releaseDelayReason?: string | null;
      releaseFinalDate?: string | null;
      tdoReleasedAt?: string | null;
    }>> = {};

    for (const c of rows) {
      // Use stageEnteredAt for accuracy — falls back to updatedAt for legacy rows
      const stageStart = c.stageEnteredAt ?? c.updatedAt;
      const daysInStage = Math.floor(
        (now.getTime() - new Date(stageStart).getTime()) / (1000 * 60 * 60 * 24)
      );
      // Compute lifespan: gate-in → empty return (or running)
      const gateIn = c.gateInDate instanceof Date ? c.gateInDate : (c.gateInDate ? new Date(c.gateInDate) : null);
      const emptyReturn = c.emptyReturnDate instanceof Date ? c.emptyReturnDate : (c.emptyReturnDate ? new Date(c.emptyReturnDate) : null);
      const lifespanDays = gateIn ? Math.max(0, Math.floor(((emptyReturn ?? now).getTime() - gateIn.getTime()) / 86_400_000)) : null;
      if (!stages[c.status]) stages[c.status] = [];
      const duty = parseFloat(c.duty ?? "0") || 0;
      const dutyPaid = parseFloat(c.dutyPaid ?? "0") || 0;
      const dutyNotPaid = c.dutyNotPaid != null ? (parseFloat(c.dutyNotPaid) || 0) : Math.max(duty - dutyPaid, 0);
      const entry = {
        id: c.id,
        containerNumber: c.containerNumber,
        blNumber: c.blNumber,
        customerName: c.customerName,
        status: c.status,
        updatedAt: c.updatedAt instanceof Date ? c.updatedAt.toISOString() : String(c.updatedAt),
        daysInStage,
        assignedStaffName: c.assignedStaffName ?? null,
        stageOwnerName: c.stageOwner ?? null,
        nextAction: c.nextAction ?? null,
        nextActionDueAt: c.nextActionDueDate instanceof Date ? c.nextActionDueDate.toISOString() : (c.nextActionDueDate ?? null),
        delayReason: c.delayReason ?? null,
        paarNumber: c.paarNumber ?? null,
        paarReleasedAt: c.paarReleasedAt instanceof Date ? c.paarReleasedAt.toISOString() : (c.paarReleasedAt ?? null),
        paarDelayReason: c.paarDelayReason ?? null,
        duty,
        dutyPaid,
        dutyNotPaid,
        expectedReleaseDate: c.expectedReleaseDate instanceof Date ? c.expectedReleaseDate.toISOString() : (c.expectedReleaseDate ?? null),
        releaseConfirmedAt: c.releaseConfirmedAt instanceof Date ? c.releaseConfirmedAt.toISOString() : (c.releaseConfirmedAt ?? null),
        releaseDelayReason: c.releaseDelayReason ?? null,
        releaseFinalDate: c.releaseFinalDate instanceof Date ? c.releaseFinalDate.toISOString() : (c.releaseFinalDate ?? null),
        tdoReleasedAt: c.tdoReleasedAt instanceof Date ? c.tdoReleasedAt.toISOString() : (c.tdoReleasedAt ?? null),
        gateInDate: c.gateInDate instanceof Date ? c.gateInDate.toISOString() : (c.gateInDate ?? null),
        emptyReturnDate: c.emptyReturnDate instanceof Date ? c.emptyReturnDate.toISOString() : (c.emptyReturnDate ?? null),
        emptyReturnDueDate: c.emptyReturnDueDate instanceof Date ? c.emptyReturnDueDate.toISOString() : (c.emptyReturnDueDate ?? null),
        lifespanDays,
        lifespanClosed: !!(c.emptyReturnDate),
      };
      stages[c.status].push(entry);

      // Parallel ops: if the container is in any of the three field-ops stages,
      // mirror it into the other two so all departments see it simultaneously.
      if (PARALLEL_OPS_SET.has(c.status)) {
        for (const opsStage of PARALLEL_OPS_STAGES) {
          if (opsStage !== c.status) {
            if (!stages[opsStage]) stages[opsStage] = [];
            stages[opsStage].push(entry);
          }
        }
      }

      // Early Start: inject into all three parallel ops stages (not just transire).
      if (c.earlyStartAuthorized && EARLY_START_STAGES.has(c.status)) {
        const earlyEntry = {
          ...entry,
          isEarlyStart: true,
          earlyStartReason: c.earlyStartReason ?? null,
          earlyStartAuthorizedAt: c.earlyStartAuthorizedAt instanceof Date
            ? c.earlyStartAuthorizedAt.toISOString()
            : (c.earlyStartAuthorizedAt ?? null),
        };
        for (const opsStage of PARALLEL_OPS_STAGES) {
          if (!stages[opsStage]) stages[opsStage] = [];
          stages[opsStage].push(earlyEntry);
        }
      }
    }

    for (const status of Object.keys(stages)) {
      stages[status].sort((a, b) => b.daysInStage - a.daysInStage);
    }

    res.json({ stages, total: rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /containers/:id/early-start — authorize early start (admin only)
router.post("/containers/:id/early-start", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const reason: string | undefined = req.body?.reason?.trim();
    if (!reason) {
      res.status(400).json({ error: "A reason is required to authorize Early Start." });
      return;
    }
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Container not found" }); return; }
    const [updated] = await db.update(containersTable)
      .set({
        earlyStartAuthorized: true,
        earlyStartAuthorizedById: req.user!.id,
        earlyStartAuthorizedAt: new Date(),
        earlyStartReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "early_start_authorized",
      section: "basic_info",
    });
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// DELETE /containers/:id/early-start — revoke early start (admin only)
router.delete("/containers/:id/early-start", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Container not found" }); return; }
    const [updated] = await db.update(containersTable)
      .set({
        earlyStartAuthorized: false,
        earlyStartAuthorizedById: null,
        earlyStartAuthorizedAt: null,
        earlyStartReason: null,
        updatedAt: new Date(),
      })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "early_start_revoked",
      section: "basic_info",
    });
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

const PIPELINE_STAGE_ORDER = [
  "registered",
  "documentation",
  "duty_assessment",
  "duty_payment",
  "transire_processing",
  "shipping",
  "terminal",
  "pull_out",
  "gate_in",
  "examination",
  "final_release",
  "delivery",
  "closed",
];

const DEPT_OWNED_STAGES: Record<string, string[]> = {
  documentation_user: ["registered", "documentation", "duty_assessment"],
  accounts_user: ["duty_payment"],
  operations_user: ["transire_processing", "shipping", "terminal", "pull_out"],
  transire_user: ["transire_processing"],
  shipping_user: ["shipping"],
  terminal_user: ["terminal"],
  pull_out_user: ["pull_out"],
  shipping_terminal_user: ["shipping", "terminal"],
  terminal_manager: ["gate_in", "examination", "final_release"],
  security_user: ["gate_in"],
  delivery_user: ["delivery"],
};

// Roles permitted to perform status ADVANCEMENT (moving the container to the next stage).
// transire_user and operations_user are data-entry only — they may NOT advance pipeline status.
const STAGE_ADVANCE_ALLOWED: Record<string, string[]> = {
  documentation_user: ["registered", "documentation", "duty_assessment"],
  accounts_user: ["duty_payment"],
  shipping_user: ["shipping"],
  terminal_user: ["terminal"],
  pull_out_user: ["pull_out"],
  shipping_terminal_user: ["shipping", "terminal"],
  terminal_manager: ["gate_in", "examination", "final_release"],
  delivery_user: ["delivery"],
};

router.patch("/containers/:id/status", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const requestedStatus: string | undefined = req.body?.status;

    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Container not found" });
      return;
    }

    const currentIdx = PIPELINE_STAGE_ORDER.indexOf(existing.status);
    if (currentIdx === -1) {
      res.status(400).json({ error: `Unknown current status: ${existing.status}` });
      return;
    }

    // Determine whether this is a navigation (jump to a specific stage) or a forward advance.
    // If the requested status is the natural next stage, treat it as a forward advance so that
    // the "Submit" / "Advance" buttons still work with the usual permission checks.
    const naturalNext = PIPELINE_STAGE_ORDER[currentIdx + 1];
    const isNavigation = !!(
      requestedStatus &&
      PIPELINE_STAGE_ORDER.includes(requestedStatus) &&
      requestedStatus !== existing.status &&
      requestedStatus !== naturalNext
    );
    const nextStatus = isNavigation ? requestedStatus : naturalNext;

    if (!nextStatus) {
      res.status(400).json({ error: "Container is already at the final stage" });
      return;
    }

    if (!isAdmin) {
      // Non-admin dept users: arbitrary stage navigation is not permitted.
      // Only the natural forward advance from a stage the user is allowed to advance is permitted.
      if (isNavigation) {
        res.status(403).json({ error: "Stage navigation is restricted to administrators." });
        return;
      }
      const userRoles: string[] = req.user!.roles ?? [userRole];
      const advanceAllowed = [...new Set(userRoles.flatMap(r => STAGE_ADVANCE_ALLOWED[r] ?? []))];
      // Forward advance: current stage must be in the user's advancement-allowed stages
      if (!advanceAllowed.includes(existing.status)) {
        res.status(403).json({ error: "You don't have permission to advance this container from its current stage" });
        return;
      }
    }
    const [updated] = await db.update(containersTable)
      .set({ status: nextStatus, updatedAt: new Date(), stageEnteredAt: new Date(), nextAction: null, nextActionDueDate: null })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "status_advanced",
      section: "basic_info",
    });
    // Notify: stage completed — replace any previous stage_complete for this container
    try {
      const STAGE_LABELS: Record<string, string> = {
        registered: "Registered", documentation: "Documentation", duty_assessment: "Duty Assessment",
        duty_payment: "Duty Payment", transire_processing: "Transire", shipping: "Shipping",
        terminal: "Terminal", pull_out: "Pull-Out", gate_in: "Gate In", examination: "Examination",
        final_release: "Final Release", delivery: "Delivery", closed: "Closed",
      };
      const fromLabel = STAGE_LABELS[existing.status] ?? existing.status;
      const toLabel = STAGE_LABELS[nextStatus] ?? nextStatus;
      await db.delete(workflowNotificationsTable)
        .where(eq(workflowNotificationsTable.containerId, id));
      await db.insert(workflowNotificationsTable).values({
        type: "stage_complete",
        message: `${existing.containerNumber} advanced from ${fromLabel} → ${toLabel}`,
        containerId: id,
        containerNumber: existing.containerNumber,
      });
    } catch {}
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/verify", requireAdmin, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    if (existing.status !== "pending_verification") {
      res.status(400).json({ error: "Container is not in pending verification state" });
      return;
    }
    const [updated] = await db.update(containersTable)
      .set({ status: "registered", verifiedAt: new Date(), verifiedBy: req.user!.id, updatedAt: new Date() })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "container_verified",
      section: "basic_info",
      reason: "Container verified and moved to Registered stage",
    });
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/confirm-berthing", requireAuth, async (req: AuthRequest, res) => {
  const userRole = req.user?.role;
  if (userRole !== "admin" && userRole !== "super_admin" && userRole !== "operations_user") {
    return res.status(403).json({ error: "Only admin and operations users can confirm berthing." });
  }
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    const confirmedByUserId = req.user!.id;
    const confirmedByName = req.user!.name ?? req.user!.email ?? "Unknown";
    const now = new Date();
    const [updated] = await db.update(containersTable)
      .set({ berthed: true, berthingConfirmedAt: now, berthingConfirmedById: confirmedByUserId, updatedAt: now })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "berthing_confirmed",
      section: "basic_info",
      reason: `Vessel berthing confirmed by ${confirmedByName}`,
    });
    const { sendWhatsApp } = req.body;
    let whatsappResult: { success: boolean; sid?: string; error?: string } | null = null;
    if (sendWhatsApp && existing.clientId) {
      const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, existing.clientId));
      if (client?.phone) {
        const { toE164Nigerian, sendViaTwilio } = await import("../lib/whatsapp.js");
        const phone = toE164Nigerian(client.phone);
        const vesselInfo = existing.vessel ? ` (Vessel: ${existing.vessel})` : "";
        const message = `Hello! We're pleased to inform you that the vessel carrying your container ${existing.containerNumber}${vesselInfo} has berthed at the terminal. Clearing is now underway. — Cost Analysis Team`;
        whatsappResult = await sendViaTwilio(phone, message);
      }
    }
    res.json({ container: formatContainer(updated), whatsappResult });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

router.post("/containers/:id/stage-action", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    const {
      action, expectedDate, delayReason, finalDate,
    } = req.body;
    if (!action) {
      res.status(400).json({ error: "action is required" });
      return;
    }
    const status = existing.status;
    const STAGE_ACTION_FIELDS: Record<string, { expected: string; releasedAt: string; delayReason: string; finalDate: string; label: string }> = {
      transire_processing: { expected: "expectedTransireDate", releasedAt: "transireReleasedAt", delayReason: "transireDelayReason", finalDate: "transireFinalDate", label: "Transire" },
      shipping:            { expected: "expectedDoDate",       releasedAt: "doReleasedAt",       delayReason: "doDelayReason",       finalDate: "doFinalDate",       label: "Delivery Order (DO)" },
      terminal:            { expected: "expectedTdoDate",      releasedAt: "tdoReleasedAt",      delayReason: "tdoDelayReason",      finalDate: "tdoFinalDate",      label: "TDO" },
      pull_out:            { expected: "expectedPulloutDate",  releasedAt: "pulloutReleasedAt",  delayReason: "pulloutDelayReason",  finalDate: "pulloutFinalDate",  label: "Pullout" },
      final_release:       { expected: "expectedReleaseDate",  releasedAt: "releaseConfirmedAt", delayReason: "releaseDelayReason",  finalDate: "releaseFinalDate",  label: "Final Release" },
    };
    const fields = STAGE_ACTION_FIELDS[status];
    if (!fields) {
      res.status(400).json({ error: `Stage action not supported for status: ${status}` });
      return;
    }

    const userRoles: string[] = req.user!.roles;
    const isAdmin = userRoles.some(r => r === "admin" || r === "super_admin");
    if (!isAdmin) {
      const STAGE_ALLOWED_ROLES: Record<string, string[]> = {
        transire_processing: ["transire_user", "operations_user"],
        shipping:            ["shipping_user", "shipping_terminal_user"],
        terminal:            ["terminal_user", "shipping_terminal_user"],
        pull_out:            ["pull_out_user"],
        final_release:       ["terminal_manager"],
      };
      const allowedRoles = STAGE_ALLOWED_ROLES[status] ?? [];
      const hasRole = userRoles.some(r => allowedRoles.includes(r));
      if (!hasRole) {
        res.status(403).json({ error: "You do not have permission to perform actions at this stage." });
        return;
      }
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    let notifMsg: string | null = null;
    if (action === "set_expected_date") {
      if (!expectedDate) { res.status(400).json({ error: "expectedDate required" }); return; }
      updates[fields.expected] = new Date(expectedDate);
    } else if (action === "mark_released") {
      updates[fields.releasedAt] = finalDate ? new Date(finalDate) : new Date();
      notifMsg = `${fields.label} released for ${existing.containerNumber}`;
    } else if (action === "record_delay") {
      if (!delayReason) { res.status(400).json({ error: "delayReason required" }); return; }
      updates[fields.delayReason] = delayReason;
      if (finalDate) updates[fields.finalDate] = new Date(finalDate);
      notifMsg = `Delay recorded for ${existing.containerNumber} at ${fields.label}: ${delayReason}`;
    } else if (action === "update_stage_owner") {
      updates.stageOwner = req.body.stageOwner || null;
    } else {
      res.status(400).json({ error: `Unknown action: ${action}` }); return;
    }
    const [updated] = await db.update(containersTable).set(updates).where(eq(containersTable.id, id)).returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "stage_control",
      section: "basic_info",
      reason: `Stage action: ${action} for ${fields.label}${delayReason ? ` — ${delayReason}` : ""}`,
    });
    if (notifMsg) {
      await db.delete(workflowNotificationsTable)
        .where(eq(workflowNotificationsTable.containerId, id));
      await db.insert(workflowNotificationsTable).values({
        type: action === "mark_released" ? "stage_complete" : "delay_recorded",
        message: notifMsg,
        containerId: id,
        containerNumber: existing.containerNumber,
      });
    }
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /containers/gate-log — gate events log (security + admin)
router.get("/containers/gate-log", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const userRoles: string[] = (req.user as any).roles ?? [userRole];
    const isSecurityUser = userRoles.includes("security_user");
    if (!isAdmin && !isSecurityUser) {
      res.status(403).json({ error: "Access denied" });
      return;
    }
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;
    const csv = req.query.csv === "1";

    let rows = await db.select().from(containersTable)
      .where(or(
        isNotNull(containersTable.gateInDate),
        isNotNull(containersTable.gateOutDate),
        inArray(containersTable.status, ["gate_in", "examination", "final_release"]),
        eq(containersTable.earlyStartAuthorized, true),
      ))
      .orderBy(desc(containersTable.gateInDate));

    if (fromStr) {
      const from = new Date(fromStr);
      if (!isNaN(from.getTime())) {
        rows = rows.filter(r =>
          r.earlyStartAuthorized ||
          (r.gateInDate && new Date(r.gateInDate) >= from) ||
          (r.gateOutDate && new Date(r.gateOutDate) >= from)
        );
      }
    }
    if (toStr) {
      const to = new Date(toStr);
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        rows = rows.filter(r => r.earlyStartAuthorized || !r.gateInDate || new Date(r.gateInDate) <= to);
      }
    }

    const data = rows.map(c => ({
      id: c.id,
      containerNumber: c.containerNumber,
      blNumber: c.blNumber,
      customerName: c.customerName,
      size: c.size ?? "",
      command: c.command ?? "",
      status: c.status,
      gateInDate: c.gateInDate instanceof Date ? c.gateInDate.toISOString() : (c.gateInDate ?? null),
      gateOutDate: c.gateOutDate instanceof Date ? c.gateOutDate.toISOString() : (c.gateOutDate ?? null),
      emptyGateInDate: c.emptyGateInDate instanceof Date ? c.emptyGateInDate.toISOString() : (c.emptyGateInDate ?? null),
      emptyGateOutDate: c.emptyGateOutDate instanceof Date ? c.emptyGateOutDate.toISOString() : (c.emptyGateOutDate ?? null),
      emptyReturnDate: c.emptyReturnDate instanceof Date ? c.emptyReturnDate.toISOString() : (c.emptyReturnDate ?? null),
      earlyStartAuthorized: c.earlyStartAuthorized ?? false,
      earlyStartReason: c.earlyStartReason ?? null,
    }));

    if (csv) {
      const header = "Container No,B/L No,Customer,Size,Command,Status,Gate-In Date,Gate-Out Date,Empty Gate-In Date,Empty Gate-Out Date\r\n";
      const rowsCsv = data.map(r =>
        [r.containerNumber, r.blNumber, r.customerName, r.size, r.command, r.status,
          r.gateInDate ?? "", r.gateOutDate ?? "", r.emptyGateInDate ?? "", r.emptyGateOutDate ?? ""]
          .map(v => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      ).join("\r\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="gate-log-${Date.now()}.csv"`);
      return res.send(header + rowsCsv);
    }

    res.json({ entries: data, total: data.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /containers/:id/gate-in — Security records container entry with exact timestamp
router.post("/containers/:id/gate-in", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const userRoles: string[] = (req.user as any).roles ?? [userRole];
    const isSecurityUser = userRoles.includes("security_user");
    if (!isAdmin && !isSecurityUser) {
      res.status(403).json({ error: "Only security personnel or administrators can record Gate-In" });
      return;
    }
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Container not found" }); return; }

    const now = new Date();
    let nextStatus = existing.status;
    if (["shipping", "pull_out"].includes(existing.status)) {
      nextStatus = "gate_in";
    } else if (!["gate_in", "examination", "final_release"].includes(existing.status)) {
      res.status(409).json({ error: `Container is at "${existing.status}" stage — Gate-In can only be recorded from shipping, pull_out, or once already in the terminal` });
      return;
    }

    const [updated] = await db.update(containersTable)
      .set({ status: nextStatus, gateInDate: now, updatedAt: now })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "gate_in_recorded",
      section: "basic_info",
      reason: `Gate-In recorded at ${now.toISOString()} by security`,
    });
    try {
      await db.delete(workflowNotificationsTable).where(eq(workflowNotificationsTable.containerId, id));
      await db.insert(workflowNotificationsTable).values({
        type: "gate_in",
        message: `${existing.containerNumber} gated in — ready for terminal processing`,
        containerId: id,
        containerNumber: existing.containerNumber,
      });
    } catch {}
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /containers/:id/gate-out — Security records container exit (timestamp only, no stage change)
router.post("/containers/:id/gate-out", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const userRoles: string[] = (req.user as any).roles ?? [userRole];
    const isSecurityUser = userRoles.includes("security_user");
    if (!isAdmin && !isSecurityUser) {
      res.status(403).json({ error: "Only security personnel or administrators can record Gate-Out" });
      return;
    }
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Container not found" }); return; }
    if (existing.gateOutDate) {
      res.status(409).json({ error: "Gate-Out has already been recorded for this container" });
      return;
    }
    const now = new Date();
    const [updated] = await db.update(containersTable)
      .set({ gateOutDate: now, updatedAt: now })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "gate_out_recorded",
      section: "basic_info",
      reason: `Gate-Out recorded at ${now.toISOString()} by security`,
    });
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /containers/:id/empty-gate-in — Security records empty container return to terminal (Scenario B step 1)
router.post("/containers/:id/empty-gate-in", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const userRoles: string[] = (req.user as any).roles ?? [userRole];
    const isSecurityUser = userRoles.includes("security_user");
    if (!isAdmin && !isSecurityUser) {
      res.status(403).json({ error: "Only security personnel or administrators can record Empty Gate-In" });
      return;
    }
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Container not found" }); return; }
    if (existing.emptyGateInDate) {
      res.status(409).json({ error: "Empty Gate-In has already been recorded for this container" });
      return;
    }
    const now = new Date();
    const [updated] = await db.update(containersTable)
      .set({ emptyGateInDate: now, updatedAt: now })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "empty_gate_in_recorded",
      section: "basic_info",
      reason: `Empty Gate-In recorded at ${now.toISOString()} by security — empty container returned to terminal`,
    });
    res.json(formatContainer(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /containers/:id/empty-gate-out — Security records empty container exit to port (Scenario B step 2 — auto-sets emptyReturnDate)
router.post("/containers/:id/empty-gate-out", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const userRoles: string[] = (req.user as any).roles ?? [userRole];
    const isSecurityUser = userRoles.includes("security_user");
    if (!isAdmin && !isSecurityUser) {
      res.status(403).json({ error: "Only security personnel or administrators can record Empty Gate-Out" });
      return;
    }
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Container not found" }); return; }
    if (!existing.emptyGateInDate) {
      res.status(409).json({ error: "Empty Gate-In must be recorded before Empty Gate-Out" });
      return;
    }
    if (existing.emptyGateOutDate) {
      res.status(409).json({ error: "Empty Gate-Out has already been recorded for this container" });
      return;
    }
    const now = new Date();
    // Auto-set emptyReturnDate: empty has left terminal, custody lifespan closes
    const [updated] = await db.update(containersTable)
      .set({ emptyGateOutDate: now, emptyReturnDate: now, updatedAt: now })
      .where(eq(containersTable.id, id))
      .returning();
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "empty_gate_out_recorded",
      section: "basic_info",
      reason: `Empty Gate-Out recorded at ${now.toISOString()} by security — empty container returned to port, custody closed`,
    });
    res.json(formatContainer(updated));
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
    let berthingConfirmedByName: string | null = null;
    if (c.berthingConfirmedById) {
      const [bcu] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, c.berthingConfirmedById));
      berthingConfirmedByName = bcu?.name ?? null;
    }
    const charges = await getOrCreateCharges(id);
    const extraChargeRows = await db.select().from(containerExtraChargesTable)
      .where(eq(containerExtraChargesTable.containerId, id))
      .orderBy(containerExtraChargesTable.sortOrder, containerExtraChargesTable.createdAt);
    const extraTotal = extraChargeRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const totalCost = calcTotalCost(charges.shipping, charges.customs, charges.terminal, charges.delivery, charges.operations) + extraTotal;
    const dutyNotPaid = parseFloat(charges.customs.dutyNotPaid ?? "0");

    const containerFormatted = {
      ...formatContainer(c, staffName, clientName, berthingConfirmedByName),
      totalCost,
      grossProfit: parseFloat(c.clearingCharges ?? "0") - totalCost,
      dutyNotPaid,
    };

    const sectionApprovalRows = await db.select().from(sectionApprovalsTable)
      .where(eq(sectionApprovalsTable.containerId, id));
    const sectionApprovals = await Promise.all(sectionApprovalRows.map(formatSectionApproval));

    const extraCharges = extraChargeRows.map(r => ({
      id: r.id,
      containerId: r.containerId,
      section: r.section,
      label: r.label,
      amount: parseFloat(r.amount ?? "0"),
      sortOrder: r.sortOrder,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    }));

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
        extraCharges,
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
    const userRole = req.user!.role;
    const isAdmin = userRole === "admin" || userRole === "super_admin";
    const { customerName, containerNumber, blNumber, declaration, size, vessel, status, assignedStaffId, clearingCharges, deliveredAt, eta, consignee } = req.body;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (customerName !== undefined) updates.customerName = customerName;
    if (containerNumber !== undefined) updates.containerNumber = containerNumber;
    if (blNumber !== undefined) updates.blNumber = blNumber;
    if (declaration !== undefined) updates.declaration = declaration;
    if (size !== undefined) updates.size = size;
    if (vessel !== undefined) updates.vessel = vessel;
    // Status changes via PUT: admins can set any status freely.
    // Non-admin dept users may only perform the natural forward advance from stages they're allowed to advance.
    if (status !== undefined) {
      if (!isAdmin) {
        const userRoles: string[] = req.user!.roles ?? [userRole];
        const advanceAllowed = [...new Set(userRoles.flatMap(r => STAGE_ADVANCE_ALLOWED[r] ?? []))];
        const currentIdx = PIPELINE_STAGE_ORDER.indexOf(existing.status);
        const naturalNext = currentIdx !== -1 ? PIPELINE_STAGE_ORDER[currentIdx + 1] : undefined;
        // Allow only if: current stage is in advancement-allowed set AND requested status is the natural next stage
        if (!advanceAllowed.includes(existing.status) || status !== naturalNext) {
          res.status(403).json({ error: "You can only advance this container from its current stage to the next stage." });
          return;
        }
      }
      updates.status = status;
    }
    if (assignedStaffId !== undefined) updates.assignedStaffId = assignedStaffId;
    if (clearingCharges !== undefined) updates.clearingCharges = String(clearingCharges);
    if (deliveredAt !== undefined) {
      updates.deliveredAt = deliveredAt ? new Date(deliveredAt) : null;
      updates.deliveredAtEstimated = false;
    }
    if (eta !== undefined) updates.eta = eta ? new Date(eta) : null;
    if (consignee !== undefined) updates.consignee = consignee || null;

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

router.patch("/containers/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "Container not found" });
      return;
    }
    const {
      deliveredAt, stageOwner, nextAction, nextActionDueDate, delayReason,
      deliveryTime, deliveryLocation, truckNumber, driverName, driverPhone,
      dispatchOfficer, deliveryStatus, offloadingConfirmed, emptyReturnDueDate, emptyReturnDate,
      paarNumber, paarOfficer, paarReleasedAt, paarDelayReason,
      eta, consignee, tdoReleasedAt,
    } = req.body;
    if (deliveredAt !== undefined && deliveredAt !== null) {
      if (typeof deliveredAt !== "string" || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(deliveredAt) || isNaN(new Date(deliveredAt).getTime())) {
        res.status(400).json({ error: "Invalid deliveredAt — expected YYYY-MM-DD format" });
        return;
      }
    }
    const VALID_DELIVERY_STATUSES = ["pending", "in_transit", "delivered"];
    if (deliveryStatus !== undefined && !VALID_DELIVERY_STATUSES.includes(deliveryStatus)) {
      res.status(400).json({ error: `Invalid deliveryStatus — must be one of: ${VALID_DELIVERY_STATUSES.join(", ")}` });
      return;
    }
    for (const [field, val] of [["emptyReturnDueDate", emptyReturnDueDate], ["emptyReturnDate", emptyReturnDate]] as [string, unknown][]) {
      if (val !== undefined && val !== null && val !== "") {
        if (typeof val !== "string" || isNaN(new Date(val as string).getTime())) {
          res.status(400).json({ error: `Invalid ${field} — expected ISO 8601 date format` });
          return;
        }
      }
    }
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (deliveredAt !== undefined) {
      updates.deliveredAt = deliveredAt ? new Date(deliveredAt as string) : null;
      updates.deliveredAtEstimated = false;
    }
    if (deliveryTime !== undefined) updates.deliveryTime = deliveryTime || null;
    if (deliveryLocation !== undefined) updates.deliveryLocation = deliveryLocation || null;
    if (truckNumber !== undefined) updates.truckNumber = truckNumber || null;
    if (driverName !== undefined) updates.driverName = driverName || null;
    if (driverPhone !== undefined) updates.driverPhone = driverPhone || null;
    if (dispatchOfficer !== undefined) updates.dispatchOfficer = dispatchOfficer || null;
    if (deliveryStatus !== undefined) updates.deliveryStatus = deliveryStatus;
    if (offloadingConfirmed !== undefined) updates.offloadingConfirmed = !!offloadingConfirmed;
    if (emptyReturnDueDate !== undefined) updates.emptyReturnDueDate = emptyReturnDueDate ? new Date(emptyReturnDueDate as string) : null;
    if (emptyReturnDate !== undefined) updates.emptyReturnDate = emptyReturnDate ? new Date(emptyReturnDate as string) : null;
    const changed: string[] = [];
    if (stageOwner !== undefined) {
      const prev = existing.stageOwner ?? null;
      updates.stageOwner = stageOwner || null;
      if (prev !== (stageOwner || null)) changed.push(`Stage Owner: "${prev ?? "—"}" → "${stageOwner || "—"}"`);
    }
    if (nextAction !== undefined) {
      const prev = existing.nextAction ?? null;
      updates.nextAction = nextAction || null;
      if (prev !== (nextAction || null)) changed.push(`Next Action: "${prev ?? "—"}" → "${nextAction || "—"}"`);
    }
    if (nextActionDueDate !== undefined) {
      if (nextActionDueDate !== null && nextActionDueDate !== "") {
        if (typeof nextActionDueDate !== "string" || isNaN(new Date(nextActionDueDate as string).getTime())) {
          res.status(400).json({ error: "Invalid nextActionDueDate — expected ISO 8601 date format" });
          return;
        }
      }
      updates.nextActionDueDate = nextActionDueDate ? new Date(nextActionDueDate as string) : null;
      changed.push("Next Action Due Date updated");
    }
    if (delayReason !== undefined) {
      const prev = existing.delayReason ?? null;
      updates.delayReason = delayReason || null;
      if (prev !== (delayReason || null)) changed.push(`Delay Reason: "${prev ?? "—"}" → "${delayReason || "—"}"`);
    }
    if (paarNumber !== undefined) {
      const prev = existing.paarNumber ?? null;
      updates.paarNumber = paarNumber || null;
      if (prev !== (paarNumber || null)) changed.push(`PAAR Number: "${prev ?? "—"}" → "${paarNumber || "—"}"`);
    }
    if (paarOfficer !== undefined) {
      updates.paarOfficer = paarOfficer || null;
      changed.push(`PAAR Officer: "${paarOfficer || "—"}"`);
    }
    if (paarReleasedAt !== undefined) {
      if (paarReleasedAt !== null && paarReleasedAt !== "") {
        if (typeof paarReleasedAt !== "string" || isNaN(new Date(paarReleasedAt as string).getTime())) {
          res.status(400).json({ error: "Invalid paarReleasedAt — expected ISO 8601 date format" });
          return;
        }
        updates.paarReleasedAt = new Date(paarReleasedAt as string);
        changed.push(`PAAR Released: ${paarReleasedAt}`);
      } else {
        updates.paarReleasedAt = null;
      }
    }
    if (paarDelayReason !== undefined) {
      updates.paarDelayReason = paarDelayReason || null;
      if (paarDelayReason) changed.push(`PAAR Delay: "${paarDelayReason}"`);
    }
    if (eta !== undefined) {
      updates.eta = eta ? new Date(eta as string) : null;
      changed.push("ETA updated");
    }
    if (consignee !== undefined) {
      updates.consignee = consignee || null;
      changed.push(`Consignee: "${consignee || "cleared"}"`);
    }
    if (tdoReleasedAt !== undefined) {
      if (tdoReleasedAt !== null && tdoReleasedAt !== "") {
        if (typeof tdoReleasedAt !== "string" || isNaN(new Date(tdoReleasedAt as string).getTime())) {
          res.status(400).json({ error: "Invalid tdoReleasedAt — expected ISO 8601 date format" });
          return;
        }
        updates.tdoReleasedAt = new Date(tdoReleasedAt as string);
        changed.push(`TDO Released: ${tdoReleasedAt}`);
      } else {
        updates.tdoReleasedAt = null;
      }
    }
    if (Object.keys(updates).length === 1) {
      res.status(400).json({ error: "No valid fields to update" });
      return;
    }
    const finalDueDate = "nextActionDueDate" in updates
      ? (updates.nextActionDueDate as Date | null)
      : existing.nextActionDueDate;
    const finalDelayReason = "delayReason" in updates
      ? (updates.delayReason as string | null)
      : existing.delayReason;
    const isActiveStatus = existing.status !== "closed";
    const startOfToday = new Date(); startOfToday.setUTCHours(0, 0, 0, 0);
    if (isActiveStatus && finalDueDate instanceof Date && finalDueDate.getTime() < startOfToday.getTime() && !finalDelayReason) {
      res.status(400).json({ error: "Delay Reason is required when the Next Action Due Date is overdue" });
      return;
    }
    const [updated] = await db.update(containersTable).set(updates).where(eq(containersTable.id, id)).returning();
    const reasons: string[] = [];
    if (deliveredAt !== undefined) reasons.push(deliveredAt ? `Delivery date set to ${deliveredAt}` : "Delivery date cleared");
    if (truckNumber !== undefined && (existing.truckNumber ?? null) !== (truckNumber || null)) reasons.push(`Truck: ${truckNumber || "cleared"}`);
    if (driverName !== undefined && (existing.driverName ?? null) !== (driverName || null)) reasons.push(`Driver: ${driverName || "cleared"}`);
    if (dispatchOfficer !== undefined && (existing.dispatchOfficer ?? null) !== (dispatchOfficer || null)) reasons.push(`Dispatch Officer: ${dispatchOfficer || "cleared"}`);
    if (deliveryStatus !== undefined && existing.deliveryStatus !== deliveryStatus) reasons.push(`Delivery status changed to "${deliveryStatus}"`);
    reasons.push(...changed);
    await db.insert(auditLogTable).values({
      containerId: id,
      userId: req.user!.id,
      action: "update_container",
      section: "basic_info",
      reason: reasons.join("; ") || "Container updated",
    });
    const timelineEntries = [];
    if (deliveryStatus !== undefined && existing.deliveryStatus !== deliveryStatus) {
      const statusLabel: Record<string, string> = { pending: "Pending", in_transit: "In Transit", delivered: "Delivered" };
      timelineEntries.push({
        containerId: id,
        userId: req.user!.id,
        title: `Delivery status changed to "${statusLabel[deliveryStatus] ?? deliveryStatus}"`,
        eventType: "delivery",
        description: `Delivery execution status updated from "${statusLabel[existing.deliveryStatus] ?? existing.deliveryStatus}" to "${statusLabel[deliveryStatus] ?? deliveryStatus}"`,
        status: "completed" as const,
      });
    }
    if (changed.length > 0) {
      if (stageOwner !== undefined && (existing.stageOwner ?? null) !== (stageOwner || null)) {
        timelineEntries.push({
          containerId: id,
          userId: req.user!.id,
          title: stageOwner ? `Stage owner set to "${stageOwner}"` : "Stage owner cleared",
          eventType: "stage_control",
          description: stageOwner ? `Responsibility assigned to ${stageOwner}` : "Stage owner removed",
          status: "completed" as const,
        });
      }
      if (nextAction !== undefined && (existing.nextAction ?? null) !== (nextAction || null)) {
        timelineEntries.push({
          containerId: id,
          userId: req.user!.id,
          title: nextAction ? `Next action set: "${nextAction}"` : "Next action cleared",
          eventType: "stage_control",
          description: nextAction || "Next action removed",
          status: "completed" as const,
        });
      }
      if (delayReason !== undefined && (existing.delayReason ?? null) !== (delayReason || null)) {
        timelineEntries.push({
          containerId: id,
          userId: req.user!.id,
          title: delayReason ? `Delay reason recorded` : "Delay reason cleared",
          eventType: "stage_control",
          description: delayReason || "Delay reason removed",
          status: "completed" as const,
        });
      }
    }
    if (timelineEntries.length > 0) {
      await db.insert(containerTimelineTable).values(timelineEntries);
    }
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

router.get("/containers/:id/extra-charges", requireAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [container] = await db.select({ id: containersTable.id }).from(containersTable).where(eq(containersTable.id, id));
    if (!container) return res.status(404).json({ error: "Container not found" });
    const rows = await db.select().from(containerExtraChargesTable)
      .where(eq(containerExtraChargesTable.containerId, id))
      .orderBy(containerExtraChargesTable.sortOrder, containerExtraChargesTable.createdAt);
    return res.json(rows.map(r => ({
      id: r.id, containerId: r.containerId, section: r.section, label: r.label,
      amount: parseFloat(r.amount ?? "0"), sortOrder: r.sortOrder,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

const VALID_SECTIONS = new Set(["shipping", "customs", "terminal", "delivery", "operations"]);

router.post("/containers/:id/extra-charges", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!container) return res.status(404).json({ error: "Container not found" });
    if (container.isLocked) return res.status(403).json({ error: "Container is locked" });
    const { section, label, amount } = req.body;
    if (!section || !VALID_SECTIONS.has(section)) return res.status(400).json({ error: "Invalid section" });
    if (!canUserEditSection(req.user!, section)) return res.status(403).json({ error: "You do not have permission to edit this section" });
    // Enforce section-level lock (same rule as PUT /charges — covers manual locks and approvals)
    let lockedSections: string[] = [];
    try { lockedSections = JSON.parse(container.lockedSections ?? "[]"); } catch {}
    if (lockedSections.includes(section)) return res.status(403).json({ error: `The ${section} section is locked.` });
    if (!label || typeof label !== "string" || !label.trim()) return res.status(400).json({ error: "Label is required" });
    const parsedAmount = parseFloat(String(amount ?? 0)) || 0;
    const [row] = await db.insert(containerExtraChargesTable)
      .values({ containerId: id, section, label: label.trim(), amount: parsedAmount.toFixed(2) })
      .returning();
    return res.status(201).json({
      id: row.id, containerId: row.containerId, section: row.section, label: row.label,
      amount: parseFloat(row.amount ?? "0"), sortOrder: row.sortOrder,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.put("/containers/:id/extra-charges/:rowId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const rowId = parseInt(req.params.rowId);
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!container) return res.status(404).json({ error: "Container not found" });
    if (container.isLocked) return res.status(403).json({ error: "Container is locked" });
    const [existing] = await db.select().from(containerExtraChargesTable)
      .where(and(eq(containerExtraChargesTable.id, rowId), eq(containerExtraChargesTable.containerId, id)));
    if (!existing) return res.status(404).json({ error: "Extra charge not found" });
    if (!canUserEditSection(req.user!, existing.section)) return res.status(403).json({ error: "You do not have permission to edit this section" });
    // Enforce section-level lock (covers manual locks and approvals)
    let lockedSections: string[] = [];
    try { lockedSections = JSON.parse(container.lockedSections ?? "[]"); } catch {}
    if (lockedSections.includes(existing.section)) return res.status(403).json({ error: `The ${existing.section} section is locked.` });
    const updates: { label?: string; amount?: string; sortOrder?: number } = {};
    if (req.body.label !== undefined) {
      const trimmed = String(req.body.label).trim();
      if (!trimmed) return res.status(400).json({ error: "Label cannot be empty" });
      updates.label = trimmed;
    }
    if (req.body.amount !== undefined) updates.amount = (parseFloat(String(req.body.amount ?? 0)) || 0).toFixed(2);
    if (req.body.sortOrder !== undefined) updates.sortOrder = parseInt(String(req.body.sortOrder));
    if (Object.keys(updates).length === 0) return res.status(400).json({ error: "Nothing to update" });
    const [row] = await db.update(containerExtraChargesTable).set(updates)
      .where(eq(containerExtraChargesTable.id, rowId)).returning();
    return res.json({
      id: row.id, containerId: row.containerId, section: row.section, label: row.label,
      amount: parseFloat(row.amount ?? "0"), sortOrder: row.sortOrder,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.delete("/containers/:id/extra-charges/:rowId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params.id);
    const rowId = parseInt(req.params.rowId);
    const [container] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    if (!container) return res.status(404).json({ error: "Container not found" });
    if (container.isLocked) return res.status(403).json({ error: "Container is locked" });
    // Fetch the row to know its section for lock check
    const [existing] = await db.select().from(containerExtraChargesTable)
      .where(and(eq(containerExtraChargesTable.id, rowId), eq(containerExtraChargesTable.containerId, id)));
    if (!existing) return res.status(404).json({ error: "Extra charge not found" });
    if (!canUserEditSection(req.user!, existing.section)) return res.status(403).json({ error: "You do not have permission to edit this section" });
    // Enforce section-level lock (covers manual locks and approvals)
    let lockedSections: string[] = [];
    try { lockedSections = JSON.parse(container.lockedSections ?? "[]"); } catch {}
    if (lockedSections.includes(existing.section)) return res.status(403).json({ error: `The ${existing.section} section is locked.` });
    await db.delete(containerExtraChargesTable)
      .where(and(eq(containerExtraChargesTable.id, rowId), eq(containerExtraChargesTable.containerId, id)));
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
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
    const extraRows = await db.select().from(containerExtraChargesTable)
      .where(eq(containerExtraChargesTable.containerId, id));
    const extraTotal = extraRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const baseTotal = calcTotalCost(charges.shipping, charges.customs, charges.terminal, charges.delivery, charges.operations);
    const totalCost = baseTotal + extraTotal;
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
    const { section, clearingCharges, reason } = req.body;
    let { shipping, customs, terminal, delivery, operations } = req.body;

    // Check section-level lock
    if (section) {
      let lockedSections: string[] = [];
      try { lockedSections = JSON.parse(c.lockedSections ?? "[]"); } catch {}
      if (lockedSections.includes(section)) {
        res.status(403).json({ error: `The ${section} section is locked.` });
        return;
      }
    }

    const strNums = (obj: any) => {
      if (!obj) return undefined;
      const out: any = {};
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        out[k] = (v === null || v === undefined) ? null : String(v);
      }
      return out;
    };

    const validateFx = (obj: any, sectionName: string): string | null => {
      if (!obj) return null;
      const hasUsd = obj.usdAmount != null && obj.usdAmount !== "" && !isNaN(parseFloat(obj.usdAmount)) && parseFloat(obj.usdAmount) > 0;
      const hasRate = obj.exchangeRate != null && obj.exchangeRate !== "" && !isNaN(parseFloat(obj.exchangeRate)) && parseFloat(obj.exchangeRate) > 0;
      if (!hasUsd && !hasRate) return null;
      if (hasUsd && !hasRate) return `${sectionName}: Exchange rate is required when a USD amount is entered`;
      if (!hasUsd && hasRate) return `${sectionName}: USD amount is required when an exchange rate is entered`;
      const usd = parseFloat(obj.usdAmount);
      const rate = parseFloat(obj.exchangeRate);
      const expectedNgn = usd * rate;
      const target = FX_TARGET_FIELD[sectionName.toLowerCase()];
      if (target) {
        const actualNgn = parseFloat(obj[target] ?? "");
        if (isNaN(actualNgn)) {
          return `${sectionName}: ${FX_TARGET_LABEL[sectionName.toLowerCase()]} must be provided when using USD denomination`;
        }
        if (Math.abs(expectedNgn - actualNgn) > FX_TOLERANCE_NGN) {
          return `${sectionName}: USD ${usd} \u00d7 \u20a6${rate.toLocaleString()} = \u20a6${expectedNgn.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} does not match ${FX_TARGET_LABEL[sectionName.toLowerCase()]} \u20a6${actualNgn.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (tolerance \u20a6${FX_TOLERANCE_NGN})`;
        }
      }
      return null;
    };

    const fxErrors: string[] = [];
    if (section === "shipping" && shipping) { const e = validateFx(shipping, "Shipping"); if (e) fxErrors.push(e); }
    if (section === "customs" && customs)   { const e = validateFx(customs, "Customs");  if (e) fxErrors.push(e); }
    if (section === "terminal" && terminal) { const e = validateFx(terminal, "Terminal"); if (e) fxErrors.push(e); }
    if (section === "delivery" && delivery) { const e = validateFx(delivery, "Delivery"); if (e) fxErrors.push(e); }
    if (section === "operations" && operations) { const e = validateFx(operations, "Operations"); if (e) fxErrors.push(e); }
    if (fxErrors.length > 0) {
      res.status(422).json({ error: fxErrors.join("; ") });
      return;
    }

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
    const extraRows = await db.select().from(containerExtraChargesTable).where(eq(containerExtraChargesTable.containerId, id));
    const extraTotal = extraRows.reduce((s, r) => s + parseFloat(r.amount ?? "0"), 0);
    const totalCost = calcTotalCost(charges.shipping, charges.customs, charges.terminal, charges.delivery, charges.operations) + extraTotal;
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
      // Full container review approval — advance status to closed
      if (container && container.status !== "closed") {
        await db.update(containersTable).set({ status: "closed", updatedAt: new Date() }).where(eq(containersTable.id, id));
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

    const CHARGE_SECTION_NAME: Record<string, string> = {
      shipping: "Shipping", customs: "Customs", terminal: "Terminal",
      delivery: "Delivery", operations: "Operations",
    };
    const sectionLabel = CHARGE_SECTION_NAME[section];
    if (approval.submittedById && sectionLabel) {
      const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      await db.insert(containerTasksTable).values({
        containerId: id,
        title: `Resubmit ${sectionLabel} — correction needed`,
        assignedStaffId: approval.submittedById,
        createdById: user.id,
        priority: "high",
        status: "pending",
        notes: reason,
        dueDate,
      });
    }

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
    const inProgress = allContainers.filter(c => c.status !== "closed").length;
    const completed = 0;
    const closed = allContainers.filter(c => c.status === "closed").length;
    const terminalStages = new Set(["gate_in", "examination", "final_release"]);
    const containersInTerminalList = allContainers
      .filter(c => terminalStages.has(c.status) && !c.gateOutDate)
      .map(c => ({
        id: c.id,
        containerNumber: c.containerNumber,
        blNumber: c.blNumber,
        customerName: c.customerName,
        size: c.size ?? "",
        command: c.command ?? null,
        status: c.status,
        gateInDate: c.gateInDate instanceof Date ? c.gateInDate.toISOString() : (c.gateInDate ?? null),
      }));
    const containersInTerminal = containersInTerminalList.length;

    const containerIds = allContainers.map(c => c.id);
    let totalCost = 0;
    let totalClearingCharges = 0;
    let totalDutyNotPaid = 0;
    let lowProfitContainers = 0;

    const customsByContainer: Record<number, any> = {};
    let sMap: Record<number, any> = {};
    let cMap: Record<number, any> = {};
    let tMap: Record<number, any> = {};
    let dMap: Record<number, any> = {};
    let oMap: Record<number, any> = {};

    if (containerIds.length > 0) {
      const allShipping = await db.select().from(shippingChargesTable);
      const allCustoms = await db.select().from(customsChargesTable);
      const allTerminal = await db.select().from(terminalChargesTable);
      const allDelivery = await db.select().from(deliveryChargesTable);
      const allOps = await db.select().from(operationsChargesTable);

      const indexBy = (arr: any[]) => { const m: Record<number, any> = {}; arr.forEach(r => { m[r.containerId] = r; }); return m; };
      sMap = indexBy(allShipping);
      cMap = indexBy(allCustoms);
      tMap = indexBy(allTerminal);
      dMap = indexBy(allDelivery);
      oMap = indexBy(allOps);

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

    // Cost by vessel (top 10) — fixed: reuse already-fetched maps (no N+1)
    const vesselCost: Record<string, number> = {};
    for (const c of allContainers) {
      if (!c.vessel) continue;
      const cost = calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
      vesselCost[c.vessel] = (vesselCost[c.vessel] ?? 0) + cost;
    }
    const costByVessel = Object.entries(vesselCost)
      .map(([vessel, cost]) => ({ vessel, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    // Invoice AR metrics
    const allInvoices = await db.select().from(invoicesTable);
    const allPayments = await db.select().from(invoicePaymentsTable);
    const paymentsByInvoice = new Map<number, typeof allPayments>();
    for (const p of allPayments) {
      if (!paymentsByInvoice.has(p.invoiceId)) paymentsByInvoice.set(p.invoiceId, []);
      paymentsByInvoice.get(p.invoiceId)!.push(p);
    }
    let totalInvoiced = 0;
    let totalCollected = 0;
    for (const inv of allInvoices) {
      const total = parseFloat(inv.total ?? "0");
      const paid = (paymentsByInvoice.get(inv.id) ?? []).reduce((s, p) => s + parseFloat(p.amount ?? "0"), 0);
      totalInvoiced += total;
      totalCollected += paid;
    }
    const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);

    // Monthly revenue vs cost trend (last 6 months, using container data)
    const now = new Date();
    const monthlyTrend: { month: string; label: string; revenue: number; cost: number; grossProfit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const monthKey = `${yyyy}-${mm}`;
      const label = d.toLocaleString("default", { month: "short", year: "2-digit" });
      let mRevenue = 0;
      let mCost = 0;
      for (const c of allContainers) {
        const created = new Date(c.createdAt);
        const cy = created.getFullYear();
        const cm = String(created.getMonth() + 1).padStart(2, "0");
        if (`${cy}-${cm}` === monthKey) {
          mRevenue += parseFloat(c.clearingCharges ?? "0");
          mCost += calcTotalCost(sMap[c.id] ?? {}, cMap[c.id] ?? {}, tMap[c.id] ?? {}, dMap[c.id] ?? {}, oMap[c.id] ?? {});
        }
      }
      monthlyTrend.push({ month: monthKey, label, revenue: mRevenue, cost: mCost, grossProfit: mRevenue - mCost });
    }

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

    if (user.role !== "admin" && user.role !== "super_admin") {
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
      totalInvoiced,
      totalCollected,
      totalOutstanding,
      monthlyTrend,
      containersInTerminal,
      containersInTerminalList,
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

router.delete("/containers/bulk", requireAuth, requireAdmin, async (req: AuthRequest, res) => {
  const { ids } = req.body as { ids?: unknown };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "ids must be a non-empty array" });
  }
  const numIds = ids.map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (numIds.length === 0) return res.status(400).json({ error: "No valid ids provided" });

  try {
    await db.delete(customFieldValuesTable).where(inArray(customFieldValuesTable.containerId, numIds));
    await db.delete(containerDocumentsTable).where(inArray(containerDocumentsTable.containerId, numIds));
    await db.delete(containerTimelineTable).where(inArray(containerTimelineTable.containerId, numIds));
    await db.delete(containerTasksTable).where(inArray(containerTasksTable.containerId, numIds));
    await db.delete(auditLogTable).where(inArray(auditLogTable.containerId, numIds));
    await db.delete(sectionApprovalsTable).where(inArray(sectionApprovalsTable.containerId, numIds));
    await db.delete(shippingChargesTable).where(inArray(shippingChargesTable.containerId, numIds));
    await db.delete(customsChargesTable).where(inArray(customsChargesTable.containerId, numIds));
    await db.delete(terminalChargesTable).where(inArray(terminalChargesTable.containerId, numIds));
    await db.delete(deliveryChargesTable).where(inArray(deliveryChargesTable.containerId, numIds));
    await db.delete(operationsChargesTable).where(inArray(operationsChargesTable.containerId, numIds));
    await db.delete(containersTable).where(inArray(containersTable.id, numIds));
    res.json({ deleted: numIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

export { router as containersRouter };
