import { pgTable, serial, integer, text, numeric, timestamp, date } from "drizzle-orm/pg-core";
import { containersTable } from "./containers";
import { clientsTable } from "./clients";
import { banksTable } from "./banks";

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  containerId: integer("container_id").references(() => containersTable.id, { onDelete: "set null" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  invoiceNumber: text("invoice_number").notNull().unique(),
  status: text("status").notNull().default("draft"),
  subtotal: numeric("subtotal", { precision: 15, scale: 2 }).notNull().default("0"),
  vatAmount: numeric("vat_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 15, scale: 2 }).notNull().default("0"),
  dueDate: date("due_date"),
  notes: text("notes").notNull().default(""),
  writtenOffAmount: numeric("written_off_amount", { precision: 15, scale: 2 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const invoiceItemsTable = pgTable("invoice_items", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  containerId: integer("container_id").references(() => containersTable.id, { onDelete: "set null" }),
  description: text("description").notNull().default("Clearing Charges"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invoicePaymentsTable = pgTable("invoice_payments", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  paymentMethod: text("payment_method").notNull().default("transfer"),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;
export type InvoiceItem = typeof invoiceItemsTable.$inferSelect;
export type InvoicePayment = typeof invoicePaymentsTable.$inferSelect;
