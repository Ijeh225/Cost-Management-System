import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { banksTable } from "./banks";
import { usersTable } from "./users";
import { branchesTable } from "./branches";

export const bankTransfersTable = pgTable("bank_transfers", {
  id: serial("id").primaryKey(),
  fromBankId: integer("from_bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  toBankId: integer("to_bank_id").references(() => banksTable.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  narration: text("narration").notNull().default(""),
  reference: text("reference"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type BankTransfer = typeof bankTransfersTable.$inferSelect;
export type InsertBankTransfer = typeof bankTransfersTable.$inferInsert;
