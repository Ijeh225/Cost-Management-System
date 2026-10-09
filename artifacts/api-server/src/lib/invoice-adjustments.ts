import { db, creditNotesTable, invoicesTable, clientsTable, invoiceAuditLogTable, invoicePaymentsTable } from "@workspace/db";
import { and, eq, ne, sql } from "drizzle-orm";
import { creditNoteSplit } from "./financial-reporting.js";

export const INVOICE_ADJUSTMENT_POLICY = "Credit notes reduce proportional net sales and invoice VAT on the note date. Bad debt is a separate non-cash loss on the audited write-off date; it does not grant automatic VAT relief. This is a management-report convention, not a tax-filing certification.";

type Scope = { branchId?: number | null; clientId?: number | null; from?: Date | null; to?: Date | null };

export async function loadInvoiceAdjustments(scope: Scope = {}) {
  const invoiceConditions = [ne(invoicesTable.status, "draft"), ne(invoicesTable.status, "cancelled")];
  if (scope.branchId != null) invoiceConditions.push(eq(invoicesTable.branchId, scope.branchId));
  if (scope.clientId != null) invoiceConditions.push(eq(invoicesTable.clientId, scope.clientId));
  const inPeriod = (date: Date) => (!scope.from || date >= scope.from) && (!scope.to || date <= scope.to);
  const notes = await db.select({
    id: creditNotesTable.id, invoiceId: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber,
    creditNoteNumber: creditNotesTable.creditNoteNumber, amount: creditNotesTable.amount,
    createdAt: creditNotesTable.createdAt, branchId: invoicesTable.branchId,
    clientId: invoicesTable.clientId, clientName: clientsTable.name,
    invoiceTotal: invoicesTable.total, invoiceVat: invoicesTable.vatAmount,
  }).from(creditNotesTable).innerJoin(invoicesTable, eq(creditNotesTable.invoiceId, invoicesTable.id))
    .leftJoin(clientsTable, eq(invoicesTable.clientId, clientsTable.id))
    .where(and(...invoiceConditions, ne(creditNotesTable.status, "voided")))
    .orderBy(creditNotesTable.createdAt, creditNotesTable.id);
  const prior = new Map<number, number>();
  const creditNotes = notes.map(note => {
    const split = creditNoteSplit(Number(note.amount), Number(note.invoiceTotal), Number(note.invoiceVat), prior.get(note.invoiceId) ?? 0);
    prior.set(note.invoiceId, (prior.get(note.invoiceId) ?? 0) + split.amount);
    return { ...note, ...split };
  }).filter(note => inPeriod(note.createdAt));

  // The audit event is authoritative; updatedAt can change for unrelated reasons.
  // Keep outer-table qualification literal: single-table SELECT projection
  // rewriting must not resolve the correlation against the inner audit/payment id.
  const writeOffDate = sql<Date | null>`(SELECT min(a.created_at) FROM ${invoiceAuditLogTable} a WHERE a.invoice_id = invoices.id AND a.action = 'written_off')`;
  const rows = await db.select({
    invoiceId: invoicesTable.id, invoiceNumber: invoicesTable.invoiceNumber,
    branchId: invoicesTable.branchId, clientId: invoicesTable.clientId,
    writtenOffAmount: invoicesTable.writtenOffAmount, createdAt: writeOffDate,
    remaining: sql<string>`${invoicesTable.total} - coalesce((SELECT sum(p.amount) FROM ${invoicePaymentsTable} p WHERE p.invoice_id = invoices.id), 0)`,
  }).from(invoicesTable).where(and(...invoiceConditions, eq(invoicesTable.status, "written_off")));
  const undatedBadDebts = rows.filter(row => !row.createdAt).map(row => row.invoiceId);
  const badDebts = rows.filter(row => row.createdAt).map(row => ({
    ...row, createdAt: new Date(row.createdAt!),
    amount: Math.max(0, Number(row.writtenOffAmount ?? row.remaining)),
  })).filter(row => inPeriod(row.createdAt));
  return { creditNotes, badDebts, undatedBadDebts, policy: INVOICE_ADJUSTMENT_POLICY };
}
