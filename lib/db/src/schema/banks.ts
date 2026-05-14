import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const banksTable = pgTable("banks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  accountNumber: text("account_number"),
  bankCode: text("bank_code"),
  isActive: boolean("is_active").notNull().default(true),
  branchId: integer("branch_id").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type Bank = typeof banksTable.$inferSelect;
export type InsertBank = typeof banksTable.$inferInsert;
