import { Router } from "express";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  banksTable,
  branchesTable,
  expensePaymentsTable,
  overheadExpensesTable,
  paymentScheduleDocumentsTable,
  paymentScheduleEventsTable,
  paymentSchedulesTable,
  usersTable,
  workflowNotificationsTable,
  type PaymentSchedule,
} from "@workspace/db";
import {
  AuthRequest,
  getBranchScope,
  parseRoles,
  requireAuth,
  userCanAccessBranch,
} from "../lib/auth.js";
import { objectStorageClient } from "../lib/objectStorage.js";

export const paymentSchedulesRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const BUCKET_ID = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID ?? "";
const FINAL_STATUSES = new Set(["completed", "rejected", "cancelled"]);
const OPEN_STATUSES = new Set(["pending_approval", "partially_approved", "approved", "paid"]);
const PRIORITIES = new Set(["low", "normal", "urgent"]);

function getBucket() {
  if (!BUCKET_ID) throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  return objectStorageClient.bucket(BUCKET_ID);
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function parseDateInput(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isApprover(req: AuthRequest) {
  return req.user?.role === "admin" || req.user?.role === "super_admin";
}

function canMarkPaid(req: AuthRequest) {
  const roles = req.user?.roles ?? [];
  return isApprover(req) || roles.includes("accounts_user");
}

function bucketForSchedule(scheduleDate: Date, status: string, today = startOfDay(new Date())) {
  const day = startOfDay(scheduleDate);
  const tomorrow = addDays(today, 1);
  const dayAfterTomorrow = addDays(today, 2);
  if (status === "completed" || status === "paid") return "completed";
  if (status === "cancelled" || status === "rejected") return "cancelled";
  if (day < tomorrow) return "today";
  if (day < dayAfterTomorrow) return "tomorrow";
  return "upcoming";
}

function overdueDays(scheduleDate: Date, status: string, today = startOfDay(new Date())) {
  if (!OPEN_STATUSES.has(status)) return 0;
  const day = startOfDay(scheduleDate);
  if (day >= today) return 0;
  return Math.floor((today.getTime() - day.getTime()) / 86_400_000);
}

function overdueLevel(days: number) {
  if (days > 7) return "red";
  if (days > 3) return "orange";
  if (days > 1) return "yellow";
  return null;
}

function formatSchedule(row: PaymentSchedule & {
  requesterName?: string | null;
  branchName?: string | null;
  overheadDescription?: string | null;
  overheadCategory?: string | null;
  eventCount?: number | null;
  documentCount?: number | null;
}) {
  const requested = toNumber(row.amountRequested);
  const approved = toNumber(row.amountApproved);
  const paid = toNumber(row.amountPaid);
  const effectiveApproved = approved > 0 ? approved : requested;
  const balance = Math.max(0, effectiveApproved - paid);
  const days = overdueDays(row.scheduleDate, row.status);
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branchName ?? null,
    scheduleDate: formatDate(row.scheduleDate)!,
    originalRequestDate: formatDate(row.originalRequestDate)!,
    requestedById: row.requestedById,
    requestedByName: row.requesterName ?? "Unknown",
    overheadExpenseId: row.overheadExpenseId ?? null,
    sourceType: row.overheadExpenseId ? "overhead_expense" : "manual",
    sourceLabel: row.overheadExpenseId ? "Overhead Expense" : "Manual Schedule",
    overheadDescription: row.overheadDescription ?? null,
    overheadCategory: row.overheadCategory ?? null,
    vendorBeneficiary: row.vendorBeneficiary,
    clientName: row.clientName ?? null,
    description: row.description,
    amountRequested: requested,
    amountApproved: approved,
    amountPaid: paid,
    balance,
    priority: row.priority,
    status: row.status,
    bucket: bucketForSchedule(row.scheduleDate, row.status),
    overdueDays: days,
    overdueLevel: overdueLevel(days),
    eventCount: row.eventCount ?? 0,
    documentCount: row.documentCount ?? 0,
    completedAt: formatDate(row.completedAt),
    cancelledAt: formatDate(row.cancelledAt),
    createdAt: formatDate(row.createdAt)!,
    updatedAt: formatDate(row.updatedAt)!,
  };
}

async function addEvent(data: {
  branchId: number;
  scheduleId: number;
  type: string;
  actorUserId?: number | null;
  comment?: string | null;
  amount?: number | null;
  oldStatus?: string | null;
  newStatus?: string | null;
  oldScheduleDate?: Date | null;
  newScheduleDate?: Date | null;
}) {
  await db.insert(paymentScheduleEventsTable).values({
    branchId: data.branchId,
    scheduleId: data.scheduleId,
    type: data.type,
    actorUserId: data.actorUserId ?? null,
    comment: data.comment ?? null,
    amount: data.amount != null ? String(data.amount) : null,
    oldStatus: data.oldStatus ?? null,
    newStatus: data.newStatus ?? null,
    oldScheduleDate: data.oldScheduleDate ?? null,
    newScheduleDate: data.newScheduleDate ?? null,
  });
}

async function notifyUsers(params: {
  branchId: number;
  type: string;
  message: string;
  target: "approvers" | "accounts" | "creator";
  creatorId?: number | null;
}) {
  try {
    let targets: number[] = [];
    if (params.target === "creator") {
      targets = params.creatorId ? [params.creatorId] : [];
    } else {
      const users = await db.select({
        id: usersTable.id,
        role: usersTable.role,
        roles: usersTable.roles,
        branchId: usersTable.branchId,
      }).from(usersTable).where(eq(usersTable.isActive, true));
      targets = users
        .filter((u) => {
          const roles = parseRoles(u.role, u.roles);
          const sameBranchOrGlobal = u.role === "super_admin" || u.branchId === params.branchId;
          if (!sameBranchOrGlobal) return false;
          if (params.target === "approvers") return u.role === "admin" || u.role === "super_admin";
          return roles.includes("accounts_user") || u.role === "admin" || u.role === "super_admin";
        })
        .map((u) => u.id);
    }
    const uniqueTargets = [...new Set(targets)].filter(Boolean);
    if (uniqueTargets.length === 0) return;
    await db.insert(workflowNotificationsTable).values(uniqueTargets.map((targetUserId) => ({
      branchId: params.branchId,
      type: params.type,
      message: params.message,
      targetUserId,
    })));
  } catch (err) {
    console.warn("[payment-schedules] notification warning:", err);
  }
}

async function getScheduleForRequest(req: AuthRequest, id: number) {
  const [schedule] = await db.select().from(paymentSchedulesTable).where(eq(paymentSchedulesTable.id, id)).limit(1);
  if (!schedule || !userCanAccessBranch(req, schedule.branchId)) return null;
  return schedule;
}

async function getRows(req: AuthRequest) {
  const branchScope = getBranchScope(req);
  const query = db.select({
    id: paymentSchedulesTable.id,
    branchId: paymentSchedulesTable.branchId,
    scheduleDate: paymentSchedulesTable.scheduleDate,
    originalRequestDate: paymentSchedulesTable.originalRequestDate,
    requestedById: paymentSchedulesTable.requestedById,
    overheadExpenseId: paymentSchedulesTable.overheadExpenseId,
    vendorBeneficiary: paymentSchedulesTable.vendorBeneficiary,
    clientName: paymentSchedulesTable.clientName,
    description: paymentSchedulesTable.description,
    amountRequested: paymentSchedulesTable.amountRequested,
    amountApproved: paymentSchedulesTable.amountApproved,
    amountPaid: paymentSchedulesTable.amountPaid,
    priority: paymentSchedulesTable.priority,
    status: paymentSchedulesTable.status,
    completedAt: paymentSchedulesTable.completedAt,
    cancelledAt: paymentSchedulesTable.cancelledAt,
    createdAt: paymentSchedulesTable.createdAt,
    updatedAt: paymentSchedulesTable.updatedAt,
    requesterName: usersTable.name,
    branchName: branchesTable.name,
    overheadDescription: overheadExpensesTable.description,
    overheadCategory: overheadExpensesTable.category,
  })
    .from(paymentSchedulesTable)
    .leftJoin(usersTable, eq(paymentSchedulesTable.requestedById, usersTable.id))
    .leftJoin(branchesTable, eq(paymentSchedulesTable.branchId, branchesTable.id))
    .leftJoin(overheadExpensesTable, eq(paymentSchedulesTable.overheadExpenseId, overheadExpensesTable.id))
    .$dynamic();

  return branchScope !== null
    ? query.where(eq(paymentSchedulesTable.branchId, branchScope)).orderBy(asc(paymentSchedulesTable.scheduleDate), desc(paymentSchedulesTable.createdAt))
    : query.orderBy(asc(paymentSchedulesTable.scheduleDate), desc(paymentSchedulesTable.createdAt));
}

paymentSchedulesRouter.get("/payment-schedules", requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await getRows(req);
    const {
      bucket,
      requestedById,
      dateFrom,
      dateTo,
      status,
      vendor,
      client,
      amountMin,
      amountMax,
      branchId,
      search,
    } = req.query;

    const today = startOfDay(new Date());
    let schedules = rows.map((r) => formatSchedule(r));
    const queryBranch = branchId ? Number(branchId) : null;
    const min = amountMin ? Number(amountMin) : null;
    const max = amountMax ? Number(amountMax) : null;
    const from = dateFrom ? startOfDay(new Date(String(dateFrom))) : null;
    const to = dateTo ? addDays(startOfDay(new Date(String(dateTo))), 1) : null;
    const q = typeof search === "string" ? search.trim().toLowerCase() : "";

    schedules = schedules.filter((s) => {
      if (bucket && s.bucket !== bucket) return false;
      if (requestedById && s.requestedById !== Number(requestedById)) return false;
      if (status && status !== "all" && s.status !== status) return false;
      if (vendor && !s.vendorBeneficiary.toLowerCase().includes(String(vendor).toLowerCase())) return false;
      if (client && !(s.clientName ?? "").toLowerCase().includes(String(client).toLowerCase())) return false;
      if (queryBranch && s.branchId !== queryBranch) return false;
      if (min != null && s.amountRequested < min) return false;
      if (max != null && s.amountRequested > max) return false;
      const date = new Date(s.scheduleDate);
      if (from && date < from) return false;
      if (to && date >= to) return false;
      if (q) {
        const text = [
          s.vendorBeneficiary,
          s.clientName ?? "",
          s.description,
          s.requestedByName,
          s.branchName ?? "",
          s.status,
          s.priority,
        ].join(" ").toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    const allRows = rows.map((r) => formatSchedule(r));
    const summary = {
      totalScheduledToday: allRows.filter((s) => s.bucket === "today").length,
      totalPendingApproval: allRows.filter((s) => s.status === "pending_approval").length,
      totalApproved: allRows.filter((s) => s.status === "approved" || s.status === "partially_approved").length,
      totalPaidToday: allRows.filter((s) => {
        if (s.status !== "paid" && s.status !== "completed") return false;
        const updated = startOfDay(new Date(s.updatedAt));
        return updated.getTime() === today.getTime();
      }).length,
      overdueSchedules: allRows.filter((s) => s.overdueDays > 0).length,
      today: allRows.filter((s) => s.bucket === "today").length,
      tomorrow: allRows.filter((s) => s.bucket === "tomorrow").length,
      upcoming: allRows.filter((s) => s.bucket === "upcoming").length,
      completed: allRows.filter((s) => s.bucket === "completed").length,
      cancelled: allRows.filter((s) => s.bucket === "cancelled").length,
    };

    const byStaff = Object.values(allRows.reduce<Record<string, { userId: number | null; name: string; count: number; amount: number }>>((acc, s) => {
      const key = String(s.requestedById ?? "unknown");
      if (!acc[key]) acc[key] = { userId: s.requestedById, name: s.requestedByName, count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount += s.amountRequested;
      return acc;
    }, {})).sort((a, b) => b.count - a.count);

    const byBranch = Object.values(allRows.reduce<Record<string, { branchId: number; name: string; count: number; amount: number }>>((acc, s) => {
      const key = String(s.branchId);
      if (!acc[key]) acc[key] = { branchId: s.branchId, name: s.branchName ?? `Branch ${s.branchId}`, count: 0, amount: 0 };
      acc[key].count += 1;
      acc[key].amount += s.amountRequested;
      return acc;
    }, {})).sort((a, b) => b.count - a.count);

    return res.json({ schedules, summary, byStaff, byBranch });
  } catch (err) {
    console.error("[payment-schedules] list error:", err);
    return res.status(500).json({ error: "Failed to load payment schedules" });
  }
});

paymentSchedulesRouter.post("/payment-schedules", requireAuth, async (req: AuthRequest, res) => {
  try {
    const branchScope = getBranchScope(req);
    if (branchScope == null) return res.status(400).json({ error: "Select a specific branch to create a schedule." });
    const { scheduleDate, vendorBeneficiary, clientName, description, amountRequested, priority } = req.body;
    const parsedScheduleDate = parseDateInput(scheduleDate);
    const amount = Number(amountRequested);
    if (!parsedScheduleDate) return res.status(400).json({ error: "Valid scheduleDate is required" });
    if (!vendorBeneficiary?.trim()) return res.status(400).json({ error: "Vendor/Beneficiary is required" });
    if (!description?.trim()) return res.status(400).json({ error: "Description is required" });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Amount requested must be greater than zero" });
    const safePriority = PRIORITIES.has(priority) ? priority : "normal";

    const [schedule] = await db.insert(paymentSchedulesTable).values({
      branchId: branchScope,
      scheduleDate: parsedScheduleDate,
      originalRequestDate: new Date(),
      requestedById: req.user!.id,
      vendorBeneficiary: vendorBeneficiary.trim(),
      clientName: clientName?.trim() || null,
      description: description.trim(),
      amountRequested: String(amount),
      amountApproved: "0",
      amountPaid: "0",
      priority: safePriority,
      status: "pending_approval",
    }).returning();

    await addEvent({
      branchId: schedule.branchId,
      scheduleId: schedule.id,
      type: "created",
      actorUserId: req.user!.id,
      comment: "Payment schedule created.",
      newStatus: schedule.status,
    });
    await notifyUsers({
      branchId: schedule.branchId,
      type: "payment_schedule_created",
      message: `${req.user!.name} requested ${amount.toLocaleString("en-NG")} for ${schedule.vendorBeneficiary}`,
      target: "approvers",
    });

    return res.status(201).json(formatSchedule({ ...schedule, requesterName: req.user!.name, branchName: null }));
  } catch (err) {
    console.error("[payment-schedules] create error:", err);
    return res.status(500).json({ error: "Failed to create payment schedule" });
  }
});

paymentSchedulesRouter.get("/payment-schedules/:id", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid schedule id" });
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });

    const [requester] = schedule.requestedById
      ? await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, schedule.requestedById)).limit(1)
      : [];
    const [branch] = await db.select({ name: branchesTable.name }).from(branchesTable).where(eq(branchesTable.id, schedule.branchId)).limit(1);
    const [overheadExpense] = schedule.overheadExpenseId
      ? await db.select({ description: overheadExpensesTable.description, category: overheadExpensesTable.category })
        .from(overheadExpensesTable)
        .where(eq(overheadExpensesTable.id, schedule.overheadExpenseId))
        .limit(1)
      : [];
    const events = await db.select({
      id: paymentScheduleEventsTable.id,
      type: paymentScheduleEventsTable.type,
      actorUserId: paymentScheduleEventsTable.actorUserId,
      actorName: usersTable.name,
      comment: paymentScheduleEventsTable.comment,
      amount: paymentScheduleEventsTable.amount,
      oldStatus: paymentScheduleEventsTable.oldStatus,
      newStatus: paymentScheduleEventsTable.newStatus,
      oldScheduleDate: paymentScheduleEventsTable.oldScheduleDate,
      newScheduleDate: paymentScheduleEventsTable.newScheduleDate,
      createdAt: paymentScheduleEventsTable.createdAt,
    }).from(paymentScheduleEventsTable)
      .leftJoin(usersTable, eq(paymentScheduleEventsTable.actorUserId, usersTable.id))
      .where(eq(paymentScheduleEventsTable.scheduleId, id))
      .orderBy(asc(paymentScheduleEventsTable.createdAt));
    const documents = await db.select({
      id: paymentScheduleDocumentsTable.id,
      originalName: paymentScheduleDocumentsTable.originalName,
      mimeType: paymentScheduleDocumentsTable.mimeType,
      size: paymentScheduleDocumentsTable.size,
      uploadedById: paymentScheduleDocumentsTable.uploadedById,
      createdAt: paymentScheduleDocumentsTable.createdAt,
    }).from(paymentScheduleDocumentsTable)
      .where(eq(paymentScheduleDocumentsTable.scheduleId, id))
      .orderBy(asc(paymentScheduleDocumentsTable.createdAt));

    return res.json({
      ...formatSchedule({
        ...schedule,
        requesterName: requester?.name ?? null,
        branchName: branch?.name ?? null,
        overheadDescription: overheadExpense?.description ?? null,
        overheadCategory: overheadExpense?.category ?? null,
      }),
      events: events.map((e) => ({
        ...e,
        amount: e.amount == null ? null : toNumber(e.amount),
        oldScheduleDate: formatDate(e.oldScheduleDate),
        newScheduleDate: formatDate(e.newScheduleDate),
        createdAt: formatDate(e.createdAt)!,
      })),
      documents: documents.map((d) => ({ ...d, createdAt: formatDate(d.createdAt)! })),
    });
  } catch (err) {
    console.error("[payment-schedules] detail error:", err);
    return res.status(500).json({ error: "Failed to load payment schedule" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/approve", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!isApprover(req)) return res.status(403).json({ error: "MD approval access required" });
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    if (FINAL_STATUSES.has(schedule.status)) return res.status(400).json({ error: "Cannot approve a final schedule" });
    const [updated] = await db.update(paymentSchedulesTable).set({
      status: "approved",
      amountApproved: schedule.amountRequested,
      updatedAt: new Date(),
    }).where(eq(paymentSchedulesTable.id, id)).returning();
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "approved", actorUserId: req.user!.id, comment: req.body.comment ?? "Approved.", amount: toNumber(updated.amountApproved), oldStatus: schedule.status, newStatus: updated.status });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_approved", message: `Payment schedule approved for ${updated.vendorBeneficiary}`, target: "accounts" });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] approve error:", err);
    return res.status(500).json({ error: "Failed to approve schedule" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/partial-approve", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!isApprover(req)) return res.status(403).json({ error: "MD approval access required" });
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    if (FINAL_STATUSES.has(schedule.status)) return res.status(400).json({ error: "Cannot approve a final schedule" });
    const approvedAmount = Number(req.body.approvedAmount);
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) return res.status(400).json({ error: "approvedAmount must be greater than zero" });
    if (approvedAmount > toNumber(schedule.amountRequested)) return res.status(400).json({ error: "Approved amount cannot exceed requested amount" });
    const [updated] = await db.update(paymentSchedulesTable).set({
      status: approvedAmount < toNumber(schedule.amountRequested) ? "partially_approved" : "approved",
      amountApproved: String(approvedAmount),
      updatedAt: new Date(),
    }).where(eq(paymentSchedulesTable.id, id)).returning();
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "partial_approved", actorUserId: req.user!.id, comment: req.body.comment ?? null, amount: approvedAmount, oldStatus: schedule.status, newStatus: updated.status });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_approved", message: `Payment schedule partially approved for ${updated.vendorBeneficiary}`, target: "accounts" });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] partial approve error:", err);
    return res.status(500).json({ error: "Failed to partially approve schedule" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/reject", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!isApprover(req)) return res.status(403).json({ error: "MD approval access required" });
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    const comment = String(req.body.comment ?? req.body.reason ?? "").trim();
    if (!comment) return res.status(400).json({ error: "Rejection reason is required" });
    const [updated] = await db.update(paymentSchedulesTable).set({ status: "rejected", updatedAt: new Date() }).where(eq(paymentSchedulesTable.id, id)).returning();
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "rejected", actorUserId: req.user!.id, comment, oldStatus: schedule.status, newStatus: updated.status });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_rejected", message: `Payment schedule rejected for ${updated.vendorBeneficiary}: ${comment}`, target: "creator", creatorId: updated.requestedById });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] reject error:", err);
    return res.status(500).json({ error: "Failed to reject schedule" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/pay", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!canMarkPaid(req)) return res.status(403).json({ error: "Accounts access required" });
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    if (!["approved", "partially_approved", "paid"].includes(schedule.status)) return res.status(400).json({ error: "Schedule must be approved before payment" });
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "Payment amount must be greater than zero" });
    const paymentMethod = req.body.paymentMethod === "cash" ? "cash" : "bank";
    const bankId = req.body.bankId != null && req.body.bankId !== "" ? Number(req.body.bankId) : null;
    const paidAt = req.body.paidAt ? new Date(String(req.body.paidAt)) : new Date();
    if (Number.isNaN(paidAt.getTime())) return res.status(400).json({ error: "Valid paidAt date is required" });
    if (paymentMethod === "bank" && !bankId) return res.status(400).json({ error: "bankId is required for bank payments" });
    if (paymentMethod === "bank" && bankId) {
      const [bank] = await db.select({ branchId: banksTable.branchId }).from(banksTable).where(eq(banksTable.id, bankId)).limit(1);
      if (!bank) return res.status(400).json({ error: "Selected bank was not found" });
      if (bank.branchId !== schedule.branchId) return res.status(400).json({ error: "Selected bank belongs to a different branch than this schedule" });
    }
    const approved = toNumber(schedule.amountApproved) > 0 ? toNumber(schedule.amountApproved) : toNumber(schedule.amountRequested);
    const currentPaid = toNumber(schedule.amountPaid);
    if (currentPaid + amount > approved) return res.status(400).json({ error: "Payment exceeds approved balance" });
    if (schedule.overheadExpenseId) {
      const [expense] = await db.select().from(overheadExpensesTable).where(eq(overheadExpensesTable.id, schedule.overheadExpenseId)).limit(1);
      if (!expense || expense.branchId !== schedule.branchId) return res.status(400).json({ error: "Linked overhead expense was not found" });
      const [paidRow] = await db.select({ total: sql<string>`COALESCE(SUM(${expensePaymentsTable.amount}), 0)` })
        .from(expensePaymentsTable)
        .where(eq(expensePaymentsTable.expenseId, expense.id));
      const overheadOutstanding = Math.max(0, toNumber(expense.amount) - toNumber(paidRow?.total));
      if (amount > overheadOutstanding + 0.005) return res.status(400).json({ error: "Payment exceeds remaining overhead expense balance" });
    }
    const nextPaid = currentPaid + amount;
    const nextStatus = nextPaid >= approved ? "paid" : schedule.status;
    const [updated] = await db.update(paymentSchedulesTable).set({
      amountPaid: String(nextPaid),
      status: nextStatus,
      updatedAt: new Date(),
    }).where(eq(paymentSchedulesTable.id, id)).returning();
    if (updated.overheadExpenseId) {
      await db.insert(expensePaymentsTable).values({
        expenseId: updated.overheadExpenseId,
        paymentScheduleId: updated.id,
        amount: String(amount),
        paymentMethod,
        bankId: paymentMethod === "bank" ? bankId : null,
        paidAt,
        notes: req.body.notes || req.body.comment || `Paid via payment schedule #${updated.id}`,
        recordedBy: req.user?.id ?? null,
        branchId: updated.branchId,
      });
      const [expense] = await db.select().from(overheadExpensesTable).where(eq(overheadExpensesTable.id, updated.overheadExpenseId)).limit(1);
      if (expense && expense.paidAt === null) {
        await db.update(overheadExpensesTable)
          .set({ paidAt, updatedAt: new Date() })
          .where(eq(overheadExpensesTable.id, updated.overheadExpenseId));
      }
    }
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "paid", actorUserId: req.user!.id, comment: req.body.comment ?? null, amount, oldStatus: schedule.status, newStatus: updated.status });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_paid", message: `Payment recorded for ${updated.vendorBeneficiary}`, target: "creator", creatorId: updated.requestedById });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] pay error:", err);
    return res.status(500).json({ error: "Failed to record payment" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/complete", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!canMarkPaid(req)) return res.status(403).json({ error: "Accounts access required" });
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    const approved = toNumber(schedule.amountApproved) > 0 ? toNumber(schedule.amountApproved) : toNumber(schedule.amountRequested);
    if (toNumber(schedule.amountPaid) < approved) return res.status(400).json({ error: "Schedule cannot be completed until balance is zero" });
    const [updated] = await db.update(paymentSchedulesTable).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(paymentSchedulesTable.id, id)).returning();
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "completed", actorUserId: req.user!.id, comment: req.body.comment ?? "Completed.", oldStatus: schedule.status, newStatus: updated.status });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_completed", message: `Payment schedule completed for ${updated.vendorBeneficiary}`, target: "creator", creatorId: updated.requestedById });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] complete error:", err);
    return res.status(500).json({ error: "Failed to complete schedule" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/reschedule", requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!isApprover(req)) return res.status(403).json({ error: "MD approval access required" });
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    if (FINAL_STATUSES.has(schedule.status)) return res.status(400).json({ error: "Cannot reschedule a final schedule" });
    const nextDate = parseDateInput(req.body.scheduleDate);
    if (!nextDate) return res.status(400).json({ error: "Valid scheduleDate is required" });
    const [updated] = await db.update(paymentSchedulesTable).set({ scheduleDate: nextDate, updatedAt: new Date() }).where(eq(paymentSchedulesTable.id, id)).returning();
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "rescheduled", actorUserId: req.user!.id, comment: req.body.comment ?? null, oldScheduleDate: schedule.scheduleDate, newScheduleDate: nextDate });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_rescheduled", message: `Payment schedule rescheduled for ${updated.vendorBeneficiary}`, target: "creator", creatorId: updated.requestedById });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] reschedule error:", err);
    return res.status(500).json({ error: "Failed to reschedule" });
  }
});

paymentSchedulesRouter.patch("/payment-schedules/:id/cancel", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    const creatorCanCancel = schedule.requestedById === req.user!.id && schedule.status === "pending_approval";
    if (!isApprover(req) && !creatorCanCancel) return res.status(403).json({ error: "Only MD/admin or the creator while pending can cancel" });
    const comment = String(req.body.comment ?? req.body.reason ?? "").trim();
    const [updated] = await db.update(paymentSchedulesTable).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() }).where(eq(paymentSchedulesTable.id, id)).returning();
    await addEvent({ branchId: updated.branchId, scheduleId: id, type: "cancelled", actorUserId: req.user!.id, comment: comment || null, oldStatus: schedule.status, newStatus: updated.status });
    await notifyUsers({ branchId: updated.branchId, type: "payment_schedule_cancelled", message: `Payment schedule cancelled for ${updated.vendorBeneficiary}`, target: "creator", creatorId: updated.requestedById });
    return res.json(formatSchedule(updated));
  } catch (err) {
    console.error("[payment-schedules] cancel error:", err);
    return res.status(500).json({ error: "Failed to cancel schedule" });
  }
});

paymentSchedulesRouter.post("/payment-schedules/:id/comments", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    const comment = String(req.body.comment ?? "").trim();
    if (!comment) return res.status(400).json({ error: "Comment is required" });
    await addEvent({ branchId: schedule.branchId, scheduleId: id, type: "comment_added", actorUserId: req.user!.id, comment });
    const notifyCreator = isApprover(req) || canMarkPaid(req);
    if (notifyCreator) {
      await notifyUsers({ branchId: schedule.branchId, type: "payment_schedule_comment", message: `New comment on payment schedule for ${schedule.vendorBeneficiary}: ${comment}`, target: "creator", creatorId: schedule.requestedById });
    }
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[payment-schedules] comment error:", err);
    return res.status(500).json({ error: "Failed to add comment" });
  }
});

paymentSchedulesRouter.post("/payment-schedules/:id/documents", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const ext = path.extname(req.file.originalname).toLowerCase();
  const objectKey = `payment-schedules/${Date.now()}-${randomUUID()}${ext}`;
  try {
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    const gcsFile = getBucket().file(objectKey);
    await gcsFile.save(req.file.buffer, { metadata: { contentType: req.file.mimetype }, resumable: false });
    const [doc] = await db.insert(paymentScheduleDocumentsTable).values({
      branchId: schedule.branchId,
      scheduleId: id,
      filename: objectKey,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedById: req.user!.id,
    }).returning();
    await addEvent({ branchId: schedule.branchId, scheduleId: id, type: "document_uploaded", actorUserId: req.user!.id, comment: req.file.originalname });
    return res.status(201).json({ ...doc, createdAt: formatDate(doc.createdAt)! });
  } catch (err) {
    try { await getBucket().file(objectKey).delete({ ignoreNotFound: true }); } catch {}
    console.error("[payment-schedules] document upload error:", err);
    return res.status(500).json({ error: "Failed to upload document" });
  }
});

paymentSchedulesRouter.get("/payment-schedules/:id/documents/:docId", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const docId = Number(req.params.docId);
    const schedule = await getScheduleForRequest(req, id);
    if (!schedule) return res.status(404).json({ error: "Payment schedule not found" });
    const [doc] = await db.select().from(paymentScheduleDocumentsTable).where(and(eq(paymentScheduleDocumentsTable.id, docId), eq(paymentScheduleDocumentsTable.scheduleId, id))).limit(1);
    if (!doc) return res.status(404).json({ error: "Document not found" });
    const gcsFile = getBucket().file(doc.filename);
    const [exists] = await gcsFile.exists();
    if (!exists) return res.status(404).json({ error: "File not found in storage" });
    const [metadata] = await gcsFile.getMetadata();
    res.setHeader("Content-Type", (metadata.contentType as string) || doc.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalName)}"`);
    gcsFile.createReadStream().on("error", (err): void => {
      console.error("[payment-schedules] document stream error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Stream error" });
    }).pipe(res);
    return;
  } catch (err) {
    console.error("[payment-schedules] document serve error:", err);
    return res.status(500).json({ error: "Failed to open document" });
  }
});
