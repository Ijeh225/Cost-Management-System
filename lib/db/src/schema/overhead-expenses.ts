import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";

export const OVERHEAD_CATEGORIES = [
  "Salaries",
  "Office Rent",
  "Fuel",
  "Bank Charges",
  "Utilities",
  "Maintenance",
  "Bad Debt",
  "Other",
] as const;

export type OverheadCategory = typeof OVERHEAD_CATEGORIES[number];

export const overheadExpensesTable = pgTable("overhead_expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull().default("0"),
  bankId: integer("bank_id"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  reference: text("reference"),
  recordedBy: integer("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type OverheadExpense = typeof overheadExpensesTable.$inferSelect;
export type InsertOverheadExpense = typeof overheadExpensesTable.$inferInsert;
