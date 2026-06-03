import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { invoicesTable } from "./invoices";
import { clientsTable } from "./clients";

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  invoiceId: integer("invoice_id").notNull().references(() => invoicesTable.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clientsTable.id, { onDelete: "set null" }),
  messageType: text("message_type").notNull(),
  phone: text("phone").notNull(),
  messageBody: text("message_body").notNull(),
  status: text("status").notNull().default("sent"),
  provider: text("provider").notNull().default("meta"),
  providerMessageId: text("provider_message_id"),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type WhatsAppMessage = typeof whatsappMessagesTable.$inferSelect;
