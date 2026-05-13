import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";

export const containerExpenseCategoriesTable = pgTable("container_expense_categories", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  name: text("name").notNull().unique(),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContainerExpenseCategory = typeof containerExpenseCategoriesTable.$inferSelect;
export type InsertContainerExpenseCategory = typeof containerExpenseCategoriesTable.$inferInsert;
