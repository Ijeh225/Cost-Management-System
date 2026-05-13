import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";

export const expensePaymentsTable = pgTable("expense_payments", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  bankId: integer("bank_id"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  notes: text("notes"),
  recordedBy: integer("recorded_by"),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ExpensePayment = typeof expensePaymentsTable.$inferSelect;
export type InsertExpensePayment = typeof expensePaymentsTable.$inferInsert;
