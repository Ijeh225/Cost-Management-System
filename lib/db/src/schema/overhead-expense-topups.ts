import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const overheadExpenseTopupsTable = pgTable("overhead_expense_topups", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull(),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  description: text("description").notNull(),
  recordedBy: integer("recorded_by"),
  branchId: integer("branch_id").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OverheadExpenseTopup = typeof overheadExpenseTopupsTable.$inferSelect;
export type InsertOverheadExpenseTopup = typeof overheadExpenseTopupsTable.$inferInsert;
