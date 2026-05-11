import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const expenseCategoriesTable = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;
export type InsertExpenseCategory = typeof expenseCategoriesTable.$inferInsert;
