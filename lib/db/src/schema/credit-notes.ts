import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";
import { invoicesTable } from "./invoices";

export const creditNotesTable = pgTable("credit_notes", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  creditNoteNumber: text("credit_note_number").notNull().unique(),
  reason: text("reason").notNull().default(""),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type CreditNote = typeof creditNotesTable.$inferSelect;
export type InsertCreditNote = typeof creditNotesTable.$inferInsert;
