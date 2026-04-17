import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { clientsTable } from "./clients";

export const clientDepositsTable = pgTable("client_deposits", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id, { onDelete: "cascade" }),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull(),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ClientDeposit = typeof clientDepositsTable.$inferSelect;
export type InsertClientDeposit = typeof clientDepositsTable.$inferInsert;
