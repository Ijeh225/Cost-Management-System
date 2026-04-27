import { Router } from "express";
import { db, containersTable, customsChargesTable, auditLogTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or, desc, sql, type SQL } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

export const dutyPaymentsRouter = Router();

const ALLOWED_ROLES = new Set(["admin", "super_admin", "accounts_user"]);

function deriveDutyStatus(duty: number, paid: number, outstanding: number): "paid" | "partial" | "unpaid" | "not_assessed" {
  if (duty <= 0) return "not_assessed";
  if (outstanding <= 0 && paid > 0) return "paid";
  if (paid > 0 && outstanding > 0) return "partial";
  return "unpaid";
}

const toNum = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

dutyPaymentsRouter.get("/duty-payments", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) {
    res.status(403).json({ error: "Duty Payments access required" });
    return;
  }

  try {
    const status   = (req.query.status   as string | undefined)?.trim();
    const search   = (req.query.search   as string | undefined)?.trim();
    const dateFrom = (req.query.dateFrom as string | undefined)?.trim();
    const dateTo   = (req.query.dateTo   as string | undefined)?.trim();
    const page     = Math.max(1, parseInt((req.query.page  as string) ?? "1", 10) || 1);
    const limit    = Math.min(500, Math.max(1, parseInt((req.query.limit as string) ?? "50", 10) || 50));
    const offset   = (page - 1) * limit;

    const conds: SQL[] = [];
    if (search) {
      conds.push(or(
        ilike(containersTable.containerNumber, `%${search}%`),
        ilike(containersTable.blNumber,        `%${search}%`),
        ilike(containersTable.customerName,    `%${search}%`),
      ) as SQL);
    }
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) conds.push(gte(containersTable.createdAt, d));
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        conds.push(lte(containersTable.createdAt, d));
      }
    }
    const whereClause: SQL | undefined =
      conds.length === 0 ? undefined : (conds.length === 1 ? conds[0] : and(...conds));

    // Pull all matching rows joined with customs_charges (left join — containers without a customs row treated as not_assessed)
    const baseQuery = db
      .select({
        containerId:     containersTable.id,
        containerNumber: containersTable.containerNumber,
        blNumber:        containersTable.blNumber,
        customerName:    containersTable.customerName,
        containerStatus: containersTable.status,
        createdAt:       containersTable.createdAt,
        duty:            customsChargesTable.duty,
        dutyPaid:        customsChargesTable.dutyPaid,
        dutyNotPaid:     customsChargesTable.dutyNotPaid,
        customsUpdated:  customsChargesTable.updatedAt,
      })
      .from(containersTable)
      .leftJoin(customsChargesTable, eq(customsChargesTable.containerId, containersTable.id));

    const baseRows = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
      .orderBy(desc(containersTable.updatedAt));

    // Derive status & filter in-memory (status filter can't be pushed to DB easily because it's derived)
    type Row = {
      containerId: number;
      containerNumber: string;
      blNumber: string;
      customerName: string;
      status: string;
      duty: number;
      dutyPaid: number;
      dutyNotPaid: number;
      dutyStatus: "paid" | "partial" | "unpaid" | "not_assessed";
      updatedAt: string | null;
      createdAt: string;
    };

    const allRows: Row[] = baseRows.map(r => {
      const duty = toNum(r.duty);
      const paid = toNum(r.dutyPaid);
      const stored = r.dutyNotPaid != null ? toNum(r.dutyNotPaid) : Math.max(duty - paid, 0);
      const outstanding = duty > 0 ? Math.max(duty - paid, 0) : stored;
      return {
        containerId:     r.containerId,
        containerNumber: r.containerNumber,
        blNumber:        r.blNumber,
        customerName:    r.customerName,
        status:          r.containerStatus,
        duty,
        dutyPaid: paid,
        dutyNotPaid: outstanding,
        dutyStatus: deriveDutyStatus(duty, paid, outstanding),
        updatedAt: r.customsUpdated instanceof Date ? r.customsUpdated.toISOString() : (r.customsUpdated ?? null),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
    });

    const filtered = status && status !== "all"
      ? allRows.filter(r => r.dutyStatus === status)
      : allRows;

    const summary = {
      totalAssessed:    0,
      totalPaid:        0,
      totalOutstanding: 0,
      countPaid:        0,
      countPartial:     0,
      countUnpaid:      0,
      countNotAssessed: 0,
    };
    for (const r of filtered) {
      summary.totalAssessed    += r.duty;
      summary.totalPaid        += r.dutyPaid;
      summary.totalOutstanding += r.dutyNotPaid;
      if (r.dutyStatus === "paid")         summary.countPaid++;
      else if (r.dutyStatus === "partial") summary.countPartial++;
      else if (r.dutyStatus === "unpaid")  summary.countUnpaid++;
      else                                 summary.countNotAssessed++;
    }

    const total = filtered.length;
    const rows  = filtered.slice(offset, offset + limit);

    res.json({ rows, summary, total, page, limit });
  } catch (err) {
    console.error("[duty-payments][list]", err);
    res.status(500).json({ error: "Server error" });
  }
});

dutyPaymentsRouter.patch("/duty-payments/:containerId", requireAuth, async (req: AuthRequest, res) => {
  if (!req.user || !ALLOWED_ROLES.has(req.user.role)) {
    res.status(403).json({ error: "Duty Payments access required" });
    return;
  }

  const containerId = parseInt(req.params.containerId, 10);
  if (!Number.isFinite(containerId) || containerId <= 0) {
    res.status(400).json({ error: "Invalid containerId" });
    return;
  }

  const { amount, paymentDate, notes } = req.body ?? {};
  const amt = typeof amount === "number" ? amount : parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    res.status(400).json({ error: "Amount must be greater than zero" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [container] = await tx.select({
        id:              containersTable.id,
        containerNumber: containersTable.containerNumber,
        blNumber:        containersTable.blNumber,
        customerName:    containersTable.customerName,
        status:          containersTable.status,
        createdAt:       containersTable.createdAt,
      }).from(containersTable).where(eq(containersTable.id, containerId));
      if (!container) return { error: { code: 404, message: "Container not found" } } as const;

      // Lock or insert the customs row to prevent concurrent duplicate writes.
      type CustomsRow = { duty: string | null; dutyPaid: string | null; duty_paid?: string | null };
      const lockOnce = async (): Promise<CustomsRow | undefined> => {
        const r = await tx.execute(
          sql`SELECT duty, "dutyPaid" FROM customs_charges WHERE container_id = ${containerId} FOR UPDATE`
        );
        const list = (Array.isArray(r) ? r : (r as { rows?: unknown[] })?.rows ?? []) as CustomsRow[];
        return list[0];
      };
      let customs: CustomsRow | undefined = await lockOnce();
      if (!customs) {
        try {
          const [inserted] = await tx.insert(customsChargesTable).values({ containerId }).returning();
          customs = { duty: inserted.duty, dutyPaid: inserted.dutyPaid };
        } catch {
          // Lost insert race — re-select with lock.
          customs = await lockOnce();
        }
      }

      const duty = toNum(customs?.duty);
      if (duty <= 0) {
        return { error: { code: 400, message: "Duty has not been assessed for this container yet." } } as const;
      }
      const currentPaid = toNum(customs?.dutyPaid);
      const outstanding = Math.max(duty - currentPaid, 0);
      if (outstanding <= 0) {
        return { error: { code: 400, message: "Duty is already fully paid for this container." } } as const;
      }
      if (amt > outstanding + 0.005) {
        return { error: { code: 400, message: `Amount (${amt}) exceeds outstanding balance (${outstanding}).` } } as const;
      }

      const newPaid = currentPaid + amt;
      const newOutstanding = Math.max(duty - newPaid, 0);

      const [updated] = await tx.update(customsChargesTable)
        .set({
          dutyPaid:    String(newPaid),
          dutyNotPaid: String(newOutstanding),
          updatedAt:   new Date(),
        })
        .where(eq(customsChargesTable.containerId, containerId))
        .returning();

      const reasonParts: string[] = [];
      if (paymentDate) reasonParts.push(`date=${paymentDate}`);
      if (notes && String(notes).trim()) reasonParts.push(String(notes).trim());

      await tx.insert(auditLogTable).values({
        containerId,
        userId:       req.user!.id,
        action:       "duty_payment_recorded",
        section:      "customs",
        fieldChanged: "dutyPaid",
        oldValue:     String(currentPaid),
        newValue:     String(newPaid),
        reason:       reasonParts.length > 0 ? reasonParts.join(" | ") : null,
      });

      return {
        ok: {
          container,
          duty,
          dutyPaid: newPaid,
          dutyNotPaid: newOutstanding,
          dutyStatus: deriveDutyStatus(duty, newPaid, newOutstanding),
          updatedAt: updated.updatedAt instanceof Date ? updated.updatedAt.toISOString() : null,
        },
      } as const;
    });

    if ("error" in result) {
      res.status(result.error.code).json({ error: result.error.message });
      return;
    }

    const ok = result.ok;
    res.json({
      containerId,
      containerNumber: ok.container.containerNumber,
      blNumber:        ok.container.blNumber,
      customerName:    ok.container.customerName,
      status:          ok.container.status,
      duty:            ok.duty,
      dutyPaid:        ok.dutyPaid,
      dutyNotPaid:     ok.dutyNotPaid,
      dutyStatus:      ok.dutyStatus,
      updatedAt:       ok.updatedAt,
      createdAt:       ok.container.createdAt instanceof Date ? ok.container.createdAt.toISOString() : String(ok.container.createdAt),
    });
  } catch (err) {
    console.error("[duty-payments][record]", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default dutyPaymentsRouter;
