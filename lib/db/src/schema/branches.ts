import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  shortCode: text("short_code").notNull().default(""),
  location: text("location").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactPhone: text("contact_phone").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  whatsappMode: text("whatsapp_mode").notNull().default("head_office"),
  whatsappNumber: text("whatsapp_number"),
  emailMode: text("email_mode").notNull().default("head_office"),
  emailFromAddress: text("email_from_address"),
  emailReplyTo: text("email_reply_to"),
  alertAdminNumber: text("alert_admin_number"),
  alertOnStuck: text("alert_on_stuck").notNull().default("false"),
  alertOnOverdue: text("alert_on_overdue").notNull().default("false"),
  alertOnNegativeProfit: text("alert_on_negative_profit").notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBranchSchema = createInsertSchema(branchesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Branch = typeof branchesTable.$inferSelect;
