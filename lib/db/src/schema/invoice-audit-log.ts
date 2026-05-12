import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { invoicesTable } from "./invoices";
import { usersTable } from "./users";

export const invoiceAuditLogTable = pgTable("invoice_audit_log", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  details: text("details"),
  performedBy: integer("performed_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InvoiceAuditLog = typeof invoiceAuditLogTable.$inferSelect;
export type InsertInvoiceAuditLog = typeof invoiceAuditLogTable.$inferInsert;
