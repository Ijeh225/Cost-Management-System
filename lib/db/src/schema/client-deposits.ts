import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";
import { banksTable } from "./banks";
import { invoicesTable } from "./invoices";

export const clientDepositsTable = pgTable("client_deposits", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  allocatedInvoiceId: integer("allocated_invoice_id").references(() => invoicesTable.id, { onDelete: "set null" }),
  allocatedAmount: numeric("allocated_amount", { precision: 15, scale: 2 }).notNull().default("0"),
  branchId: integer("branch_id").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ClientDeposit = typeof clientDepositsTable.$inferSelect;
export type InsertClientDeposit = typeof clientDepositsTable.$inferInsert;
