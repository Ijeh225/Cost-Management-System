import { Router } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { db, containersTable, userClientAssignmentsTable, containerTasksTable, usersTable,
  containerDocumentsTable, sectionApprovalsTable, invoicesTable, invoiceItemsTable, invoicePaymentsTable,
  shippingChargesTable, customsChargesTable, terminalChargesTable, deliveryChargesTable, operationsChargesTable,
  containerExtraChargesTable, containerExpensePaymentsTable, dutyPaymentTransactionsTable } from "@workspace/db";
import { requireAuth, getBranchScope, userCanAccessBranch, type AuthRequest } from "../lib/auth.js";
import { hasAuthority, hasCapability } from "../lib/authorization.js";
import { buildJobOverview, prioritizeTasks } from "../lib/job-overview.js";
import { calcTotalCost } from "../lib/calculations.js";
import { getInvoiceFinancialEffect } from "../lib/invoice-status.js";

export const jobOverviewRouter = Router();

jobOverviewRouter.get("/containers/:id/overview", requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Invalid container ID" });
    const [c] = await db.select().from(containersTable).where(eq(containersTable.id, id));
    const scope = getBranchScope(req);
    if (!c || !userCanAccessBranch(req, c.branchId) || (scope !== null && scope !== c.branchId)) {
      return res.status(404).json({ error: "Container not found" });
    }
    if (!hasAuthority(req.user!.accessProfile, "admin")) {
      const assigned = await db.select().from(userClientAssignmentsTable).where(eq(userClientAssignmentsTable.userId, req.user!.id));
      if (assigned.length && !assigned.some(a => a.clientId === c.clientId)) return res.status(404).json({ error: "Container not found" });
    }
    const canFinance = hasCapability(req.user!.accessProfile, "finance.access");
    const taskRows = await db.select().from(containerTasksTable)
      .where(and(eq(containerTasksTable.containerId, id), eq(containerTasksTable.branchId, c.branchId)));
    const staffIds = [...new Set(taskRows.flatMap(t => t.assignedStaffId ? [t.assignedStaffId] : []))];
    const staff = staffIds.length ? await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, staffIds)) : [];
    const names = new Map(staff.map(s => [s.id, s.name]));
    const tasks = prioritizeTasks(taskRows).map(t => ({ id: t.id, title: t.title, status: t.status,
      priority: t.priority, dueDate: t.dueDate, bucket: t.bucket, assignedStaffId: t.assignedStaffId,
      assignedStaffName: t.assignedStaffId ? names.get(t.assignedStaffId) ?? null : null,
      href: `/containers/${id}?tab=tasks&taskId=${t.id}` }));
    const docs = await db.select({ id: containerDocumentsTable.id, name: containerDocumentsTable.originalName,
      section: containerDocumentsTable.section }).from(containerDocumentsTable)
      .where(and(eq(containerDocumentsTable.containerId, id), eq(containerDocumentsTable.branchId, c.branchId)));
    const approvals = await db.select({ id: sectionApprovalsTable.id, section: sectionApprovalsTable.section,
      status: sectionApprovalsTable.status, rejectionReason: sectionApprovalsTable.rejectionReason }).from(sectionApprovalsTable)
      .where(eq(sectionApprovalsTable.containerId, id));
    let finance = null;
    if (canFinance) {
      const [shipping] = await db.select().from(shippingChargesTable).where(eq(shippingChargesTable.containerId, id));
      const [customs] = await db.select().from(customsChargesTable).where(eq(customsChargesTable.containerId, id));
      const [terminal] = await db.select().from(terminalChargesTable).where(eq(terminalChargesTable.containerId, id));
      const [delivery] = await db.select().from(deliveryChargesTable).where(eq(deliveryChargesTable.containerId, id));
      const [operations] = await db.select().from(operationsChargesTable).where(eq(operationsChargesTable.containerId, id));
      const extras = await db.select().from(containerExtraChargesTable).where(eq(containerExtraChargesTable.containerId, id));
      const payments = await db.select().from(containerExpensePaymentsTable).where(and(eq(containerExpensePaymentsTable.containerId, id), eq(containerExpensePaymentsTable.branchId, c.branchId)));
      const duties = await db.select().from(dutyPaymentTransactionsTable).where(and(eq(dutyPaymentTransactionsTable.containerId, id), eq(dutyPaymentTransactionsTable.branchId, c.branchId)));
      const itemRows = await db.select({ invoiceId: invoiceItemsTable.invoiceId }).from(invoiceItemsTable).where(eq(invoiceItemsTable.containerId, id));
      const ids = [...new Set(itemRows.map(i => i.invoiceId))];
      const invoices = await db.select().from(invoicesTable).where(and(eq(invoicesTable.branchId, c.branchId),
        or(eq(invoicesTable.containerId, id), ...(ids.length ? [inArray(invoicesTable.id, ids)] : []))));
      const invoiceIds = invoices.map(i => i.id);
      const collections = invoiceIds.length ? await db.select().from(invoicePaymentsTable)
        .where(and(inArray(invoicePaymentsTable.invoiceId, invoiceIds), eq(invoicePaymentsTable.branchId, c.branchId))) : [];
      finance = {
        clearingBudget: Number(c.clearingCharges),
        costBudget: calcTotalCost(shipping ?? {}, customs ?? {}, terminal ?? {}, delivery ?? {}, operations ?? {}) + extras.reduce((sum, r) => sum + Number(r.amount), 0),
        actualPaidCost: [...payments, ...duties].reduce((sum, r) => sum + Number(r.amount), 0),
        invoices: invoices.map(i => ({ id: i.id, number: i.invoiceNumber, status: i.status,
          ...getInvoiceFinancialEffect(i.status, Number(i.total), collections.filter(p => p.invoiceId === i.id).reduce((sum, p) => sum + Number(p.amount), 0)) })),
        note: "Budgets and actual paid costs belong to this visit only. Each linked invoice is shown once at its FULL invoice value including VAT; it may cover other containers. Collections are net recorded invoice payments, including reversals. Do not sum these invoice values across visits. No allocation or profit is inferred. Draft/cancelled/written-off invoices have zero financial effect. Costs are all-time payments, not period-matched P&L costs.",
      };
    }
    return res.json({ ...buildJobOverview(c), asOf: new Date().toISOString(), tasks, documents: docs,
      approvals: canFinance ? approvals : approvals.filter(a => a.section === "container_review"), finance });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Unable to load job overview" });
  }
});
