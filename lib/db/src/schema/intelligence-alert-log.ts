import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const intelligenceAlertLogTable = pgTable("intelligence_alert_log", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull(),
  branchId: integer("branch_id").notNull().default(1),
  alertType: text("alert_type").notNull(),
  sentAt: timestamp("sent_at").notNull().defaultNow(),
});

export type IntelligenceAlertLog = typeof intelligenceAlertLogTable.$inferSelect;
