import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { banksTable } from "./banks";
import { usersTable } from "./users";

export const bankFundAdditionsTable = pgTable("bank_fund_additions", {
  id: serial("id").primaryKey(),
  bankId: integer("bank_id").references(() => banksTable.id, { onDelete: "cascade" }).notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  narration: text("narration").notNull().default(""),
  reference: text("reference"),
  addedBy: integer("added_by").references(() => usersTable.id, { onDelete: "set null" }),
  branchId: integer("branch_id").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type BankFundAddition = typeof bankFundAdditionsTable.$inferSelect;
export type InsertBankFundAddition = typeof bankFundAdditionsTable.$inferInsert;
