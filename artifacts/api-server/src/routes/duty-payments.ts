import { Router } from "express";
import { db, containersTable, customsChargesTable, auditLogTable, banksTable, dutyPaymentTransactionsTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, ilike, or, desc, sql, type SQL } from "drizzle-orm";
import { requireAuth, AuthRequest, getBranchScope, userCanAccessBranch } from "../lib/auth.js";
import { hasAuthority } from "../lib/authorization.js";

export const dutyPaymentsRouter = Router();

function canAccessDutyPayments(req: AuthRequest): boolean {
  const profile = req.user?.accessProfile;
  return Boolean(profile && (hasAuthority(profile, "admin") || profile.jobFunction === "accounts"));
}

function deriveDutyStatus(duty: number, paid: number, outstanding: number): "paid" | "partial" | "unpaid" | "not_assessed" {
  if (duty <= 0) return "not_assessed";
  if (outstanding <= 0 && paid > 0) return "paid";
  if (paid > 0 && outstanding > 0) return "partial";
  return "unpaid";
}

type Numericish = number | string | null | undefined;
const toNum = (v: Numericish): number => {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

dutyPaymentsRouter.get("/duty-payments", requireAuth, async (req: AuthRequest, res) => {
  if (!canAccessDutyPayments(req)) {
    return res.status(403).json({ error: "Duty Payments access required" });
  }

  try {
    const status   = (req.query.status   as string | undefined)?.trim();
    const search   = (req.query.search   as string | undefined)?.trim();
    const dateFrom = (req.query.dateFrom as string | undefined)?.trim();
    const dateTo   = (req.query.dateTo   as string | undefined)?.trim();
    const page     = Math.max(1, parseInt((req.query.page  as string) ?? "1", 10) || 1);
    const limit    = Math.min(500, Math.max(1, parseInt((req.query.limit as string) ?? "50", 10) || 50));
    const offset   = (page - 1) * limit;

    const VALID_STATUSES = new Set(["all", "paid", "partial", "unpaid", "not_assessed"]);
    if (status && !VALID_STATUSES.has(status)) {
      return res.status(400).json({ error: `Invalid status. Allowed: ${Array.from(VALID_STATUSES).join(", ")}` });
    }

    let dateFromObj: Date | null = null;
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: "Invalid dateFrom (expected ISO date)" });
      }
      dateFromObj = d;
    }
    let dateToObj: Date | null = null;
    if (dateTo) {
      const d = new Date(dateTo);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: "Invalid dateTo (expected ISO date)" });
      }
      d.setHours(23, 59, 59, 999);
      dateToObj = d;
    }
    if (dateFromObj && dateToObj && dateFromObj > dateToObj) {
      return res.status(400).json({ error: "dateFrom must be on or before dateTo" });
    }

    const conds: SQL[] = [];
    if (search) {
      conds.push(or(
        ilike(containersTable.containerNumber, `%${search}%`),
        ilike(containersTable.blNumber,        `%${search}%`),
        ilike(containersTable.customerName,    `%${search}%`),
      ) as SQL);
    }
    if (dateFromObj) conds.push(gte(containersTable.createdAt, dateFromObj));
    if (dateToObj)   conds.push(lte(containersTable.createdAt, dateToObj));
    const branchScope = getBranchScope(req);
    if (branchScope !== null) conds.push(eq(containersTable.branchId, branchScope) as SQL);
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
        branchId:        containersTable.branchId,
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
      branchId: number;
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
        branchId: r.branchId,
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

    return res.json({ rows, summary, total, page, limit });
  } catch (err) {
    console.error("[duty-payments][list]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// The transaction history is the source of truth for individual payments and
// reversals. The container's customs row remains the current running balance.
dutyPaymentsRouter.get("/duty-payments/:containerId/transactions", requireAuth, async (req: AuthRequest, res) => {
  if (!canAccessDutyPayments(req)) {
    return res.status(403).json({ error: "Duty Payments access required" });
  }

  const containerId = parseInt(String(req.params.containerId), 10);
  if (!Number.isFinite(containerId) || containerId <= 0) {
    return res.status(400).json({ error: "Invalid containerId" });
  }

  try {
    const [container] = await db.select({ id: containersTable.id, branchId: containersTable.branchId })
      .from(containersTable)
      .where(eq(containersTable.id, containerId));
    if (!container || !userCanAccessBranch(req, container.branchId)) {
      return res.status(404).json({ error: "Container not found" });
    }

    const rows = await db.select({
      id: dutyPaymentTransactionsTable.id,
      amount: dutyPaymentTransactionsTable.amount,
      entryType: dutyPaymentTransactionsTable.entryType,
      reversalOfTransactionId: dutyPaymentTransactionsTable.reversalOfTransactionId,
      reversalReason: dutyPaymentTransactionsTable.reversalReason,
      paymentMethod: dutyPaymentTransactionsTable.paymentMethod,
      bankId: dutyPaymentTransactionsTable.bankId,
      bankName: banksTable.name,
      reference: dutyPaymentTransactionsTable.reference,
      notes: dutyPaymentTransactionsTable.notes,
      paidAt: dutyPaymentTransactionsTable.paidAt,
      recordedByName: usersTable.name,
    })
      .from(dutyPaymentTransactionsTable)
      .leftJoin(banksTable, eq(dutyPaymentTransactionsTable.bankId, banksTable.id))
      .leftJoin(usersTable, eq(dutyPaymentTransactionsTable.recordedBy, usersTable.id))
      .where(eq(dutyPaymentTransactionsTable.containerId, containerId))
      .orderBy(desc(dutyPaymentTransactionsTable.paidAt), desc(dutyPaymentTransactionsTable.id));

    const reversedPaymentIds = new Set(rows
      .filter(row => row.entryType === "reversal" && row.reversalOfTransactionId != null)
      .map(row => row.reversalOfTransactionId));
    return res.json({
      transactions: rows.map(row => ({
        ...row,
        amount: toNum(row.amount),
        paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : String(row.paidAt),
        canReverse: row.entryType === "payment" && !reversedPaymentIds.has(row.id),
      })),
    });
  } catch (err) {
    console.error("[duty-payments][transactions]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

dutyPaymentsRouter.patch("/duty-payments/:containerId", requireAuth, async (req: AuthRequest, res) => {
  if (!canAccessDutyPayments(req)) {
    return res.status(403).json({ error: "Duty Payments access required" });
  }

  const containerId = parseInt(String(req.params.containerId), 10);
  if (!Number.isFinite(containerId) || containerId <= 0) {
    return res.status(400).json({ error: "Invalid containerId" });
  }

  const { amount, paymentDate, notes, paymentMethod: paymentMethodRaw, bankId: bankIdRaw, reference: referenceRaw } = req.body ?? {};
  const amt = typeof amount === "number" ? amount : parseFloat(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return res.status(400).json({ error: "Amount must be greater than zero" });
  }

  const paymentMethod = String(paymentMethodRaw ?? "cash").trim().toLowerCase();
  if (paymentMethod !== "cash" && paymentMethod !== "bank") {
    return res.status(400).json({ error: "paymentMethod must be cash or bank" });
  }
  const bankId = paymentMethod === "bank" ? Number(bankIdRaw) : null;
  if (paymentMethod === "bank" && (bankId === null || !Number.isInteger(bankId) || bankId <= 0)) {
    return res.status(400).json({ error: "An active bank account is required for bank payments" });
  }
  const notesClean = notes == null ? null : String(notes).trim();
  const referenceClean = referenceRaw == null ? null : String(referenceRaw).trim();
  if (notesClean && notesClean.length > 2_000) return res.status(400).json({ error: "Notes must be 2,000 characters or fewer" });
  if (referenceClean && referenceClean.length > 200) return res.status(400).json({ error: "Reference must be 200 characters or fewer" });

  // paymentDate is optional, but if provided must be a parseable date string.
  let paymentDateClean: string | null = null;
  if (paymentDate != null && String(paymentDate).trim() !== "") {
    const raw = String(paymentDate).trim();
    const d = new Date(raw);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: "Invalid paymentDate (expected ISO date)" });
    }
    // Normalise to YYYY-MM-DD for the audit trail.
    paymentDateClean = d.toISOString().slice(0, 10);
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
        branchId:        containersTable.branchId,
      }).from(containersTable).where(eq(containersTable.id, containerId));
      if (!container || !userCanAccessBranch(req, container.branchId)) return { error: { code: 404, message: "Container not found" } } as const;

      if (bankId) {
        const [bank] = await tx.select({ id: banksTable.id, branchId: banksTable.branchId, isActive: banksTable.isActive })
          .from(banksTable)
          .where(eq(banksTable.id, bankId));
        if (!bank || !bank.isActive || bank.branchId !== container.branchId || !userCanAccessBranch(req, bank.branchId)) {
          return { error: { code: 400, message: "Selected bank account is unavailable for this container branch" } } as const;
        }
      }

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
          const [inserted] = await tx.insert(customsChargesTable).values({ containerId, branchId: container.branchId }).returning();
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

      const paidAt = paymentDateClean ? new Date(`${paymentDateClean}T12:00:00.000Z`) : new Date();
      const [transaction] = await tx.insert(dutyPaymentTransactionsTable).values({
        branchId: container.branchId,
        containerId,
        amount: String(amt),
        entryType: "payment",
        paymentMethod,
        bankId,
        reference: referenceClean || null,
        notes: notesClean || null,
        paidAt,
        recordedBy: req.user!.id,
      }).returning();

      const reasonParts: string[] = [];
      if (paymentDateClean) reasonParts.push(`date=${paymentDateClean}`);
      reasonParts.push(`method=${paymentMethod}`);
      if (bankId) reasonParts.push(`bankId=${bankId}`);
      if (referenceClean) reasonParts.push(`reference=${referenceClean}`);
      if (notesClean) reasonParts.push(notesClean);

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
          transaction: {
            id: transaction.id,
            amount: toNum(transaction.amount),
            paymentMethod: transaction.paymentMethod,
            bankId: transaction.bankId,
            reference: transaction.reference,
            paidAt: transaction.paidAt instanceof Date ? transaction.paidAt.toISOString() : transaction.paidAt,
          },
        },
      } as const;
    });

    const error = (result as { error?: { code: number; message: string } }).error;
    if (error) {
      return res.status(error.code).json({ error: error.message });
    }

    if (!("ok" in result) || !result.ok) {
      return res.status(500).json({ error: "Unexpected duty payment result" });
    }
    const ok = result.ok;
    return res.json({
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
    return res.status(500).json({ error: "Server error" });
  }
});

dutyPaymentsRouter.post("/duty-payments/transactions/:transactionId/reverse", requireAuth, async (req: AuthRequest, res) => {
  if (!canAccessDutyPayments(req)) {
    return res.status(403).json({ error: "Duty Payments access required" });
  }

  const transactionId = parseInt(String(req.params.transactionId), 10);
  if (!Number.isFinite(transactionId) || transactionId <= 0) {
    return res.status(400).json({ error: "Invalid transactionId" });
  }

  const { reversalDate, reference: referenceRaw, reason: reasonRaw } = req.body ?? {};
  const reference = String(referenceRaw ?? "").trim();
  const reason = String(reasonRaw ?? "").trim();
  if (!reference) return res.status(400).json({ error: "A reversal reference is required" });
  if (reference.length > 200) return res.status(400).json({ error: "Reference must be 200 characters or fewer" });
  if (reason.length < 3 || reason.length > 2_000) return res.status(400).json({ error: "Reason must be between 3 and 2,000 characters" });

  let reversalDateClean: string | null = null;
  if (reversalDate != null && String(reversalDate).trim() !== "") {
    const date = new Date(String(reversalDate).trim());
    if (Number.isNaN(date.getTime())) return res.status(400).json({ error: "Invalid reversalDate (expected ISO date)" });
    reversalDateClean = date.toISOString().slice(0, 10);
  }

  try {
    const result = await db.transaction(async (tx) => {
      type PaymentRow = {
        id: number;
        branch_id: number;
        container_id: number;
        amount: string;
        payment_method: string;
        bank_id: number | null;
        entry_type: string;
        paid_at: Date | string;
      };
      const locked = await tx.execute(sql`
        SELECT id, branch_id, container_id, amount, payment_method, bank_id, entry_type, paid_at
        FROM duty_payment_transactions WHERE id = ${transactionId} FOR UPDATE
      `);
      const payment = ((Array.isArray(locked) ? locked : (locked as { rows?: unknown[] }).rows ?? []) as PaymentRow[])[0];
      if (!payment) return { error: { code: 404, message: "Duty payment transaction not found" } } as const;
      if (payment.entry_type !== "payment" || toNum(payment.amount) <= 0) {
        return { error: { code: 400, message: "Only an original duty payment can be reversed" } } as const;
      }
      if (reversalDateClean) {
        const originalDate = new Date(payment.paid_at).toISOString().slice(0, 10);
        if (reversalDateClean < originalDate) {
          return { error: { code: 400, message: "A reversal date cannot be before the original payment date" } } as const;
        }
      }

      const [container] = await tx.select({
        id: containersTable.id,
        branchId: containersTable.branchId,
        containerNumber: containersTable.containerNumber,
        blNumber: containersTable.blNumber,
        customerName: containersTable.customerName,
        status: containersTable.status,
        createdAt: containersTable.createdAt,
      })
        .from(containersTable)
        .where(eq(containersTable.id, payment.container_id));
      if (!container || !userCanAccessBranch(req, container.branchId)) {
        return { error: { code: 404, message: "Container not found" } } as const;
      }

      const existing = await tx.execute(sql`
        SELECT id FROM duty_payment_transactions
        WHERE reversal_of_transaction_id = ${transactionId} AND entry_type = 'reversal'
        FOR UPDATE
      `);
      const existingRows = (Array.isArray(existing) ? existing : (existing as { rows?: unknown[] }).rows ?? []) as Array<{ id: number }>;
      if (existingRows.length > 0) {
        return { error: { code: 409, message: "This duty payment has already been reversed" } } as const;
      }

      type CustomsRow = { duty: string | null; dutyPaid: string | null };
      const customsResult = await tx.execute(sql`SELECT duty, "dutyPaid" FROM customs_charges WHERE container_id = ${payment.container_id} FOR UPDATE`);
      const customs = ((Array.isArray(customsResult) ? customsResult : (customsResult as { rows?: unknown[] }).rows ?? []) as CustomsRow[])[0];
      if (!customs) return { error: { code: 409, message: "Current duty balance is unavailable; reversal cannot be completed safely" } } as const;

      const duty = toNum(customs.duty);
      const currentPaid = toNum(customs.dutyPaid);
      const originalAmount = toNum(payment.amount);
      if (currentPaid + 0.005 < originalAmount) {
        return { error: { code: 409, message: "Current duty balance no longer supports reversing this payment safely" } } as const;
      }

      const newPaid = Math.max(0, currentPaid - originalAmount);
      const newOutstanding = Math.max(duty - newPaid, 0);
      const [updated] = await tx.update(customsChargesTable)
        .set({ dutyPaid: String(newPaid), dutyNotPaid: String(newOutstanding), updatedAt: new Date() })
        .where(eq(customsChargesTable.containerId, payment.container_id))
        .returning();

      const paidAt = reversalDateClean ? new Date(`${reversalDateClean}T12:00:00.000Z`) : new Date();
      await tx.insert(dutyPaymentTransactionsTable).values({
        branchId: payment.branch_id,
        containerId: payment.container_id,
        amount: String(-originalAmount),
        entryType: "reversal",
        reversalOfTransactionId: payment.id,
        reversalReason: reason,
        paymentMethod: payment.payment_method,
        bankId: payment.bank_id,
        reference,
        notes: `Reversal of duty payment #${payment.id}`,
        paidAt,
        recordedBy: req.user!.id,
      });

      await tx.insert(auditLogTable).values({
        containerId: payment.container_id,
        userId: req.user!.id,
        action: "duty_payment_reversed",
        section: "customs",
        fieldChanged: "dutyPaid",
        oldValue: String(currentPaid),
        newValue: String(newPaid),
        reason: `reversalOf=${payment.id} | reference=${reference} | ${reason}`,
      });

      return { ok: { container, duty, dutyPaid: newPaid, dutyNotPaid: newOutstanding, updatedAt: updated.updatedAt } } as const;
    });

    const error = (result as { error?: { code: number; message: string } }).error;
    if (error) return res.status(error.code).json({ error: error.message });
    if (!("ok" in result) || !result.ok) return res.status(500).json({ error: "Unexpected duty payment reversal result" });
    const ok = result.ok;
    return res.json({
      containerId: ok.container.id,
      containerNumber: ok.container.containerNumber,
      blNumber: ok.container.blNumber,
      customerName: ok.container.customerName,
      status: ok.container.status,
      duty: ok.duty,
      dutyPaid: ok.dutyPaid,
      dutyNotPaid: ok.dutyNotPaid,
      dutyStatus: deriveDutyStatus(ok.duty, ok.dutyPaid, ok.dutyNotPaid),
      updatedAt: ok.updatedAt instanceof Date ? ok.updatedAt.toISOString() : null,
      createdAt: ok.container.createdAt instanceof Date ? ok.container.createdAt.toISOString() : String(ok.container.createdAt),
    });
  } catch (err) {
    console.error("[duty-payments][reverse]", err);
    return res.status(500).json({ error: "Server error" });
  }
});

export default dutyPaymentsRouter;
