import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { containersTable } from "./containers";

export const notificationsReadTable = pgTable("notifications_read", {
  id: serial("id").primaryKey(),
  alertKey: text("alert_key").notNull(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  alertKeyUserIdx: uniqueIndex("notifications_read_alert_user_idx").on(table.alertKey, table.userId),
}));

export const workflowNotificationsTable = pgTable("workflow_notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // new_job | stage_complete | overdue | delay_recorded
  message: text("message").notNull(),
  containerId: integer("container_id").references(() => containersTable.id, { onDelete: "cascade" }),
  containerNumber: text("container_number"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
