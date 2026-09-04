import { integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Immutable payment facts for Customs duty. customs_charges keeps the running
 * balance; this table is the reportable history behind that balance.
 */
export const dutyPaymentTransactionsTable = pgTable("duty_payment_transactions", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  containerId: integer("container_id").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  // Payments are positive. A reversal is a linked negative entry so every
  // financial report can calculate the net cash movement from this ledger.
  entryType: text("entry_type").notNull().default("payment"),
  reversalOfTransactionId: integer("reversal_of_transaction_id"),
  reversalReason: text("reversal_reason"),
  paymentMethod: text("payment_method").notNull().default("cash"),
  bankId: integer("bank_id"),
  reference: text("reference"),
  notes: text("notes"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  recordedBy: integer("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type DutyPaymentTransaction = typeof dutyPaymentTransactionsTable.$inferSelect;
export type InsertDutyPaymentTransaction = typeof dutyPaymentTransactionsTable.$inferInsert;
