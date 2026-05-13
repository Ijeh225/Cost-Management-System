import { pgTable, serial, integer, text, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { containersTable } from "./containers";
import { branchesTable } from "./branches";

export const notificationsReadTable = pgTable("notifications_read", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
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
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  type: text("type").notNull(), // new_job | stage_complete | overdue | delay_recorded
  message: text("message").notNull(),
  containerId: integer("container_id").references(() => containersTable.id, { onDelete: "cascade" }),
  containerNumber: text("container_number"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Persistent log of every system alert that has ever been detected.
// On each poll, active alerts are upserted (last_seen_at updated).
// When an alert is no longer detected it is automatically considered resolved.
export const systemAlertsHistoryTable = pgTable("system_alerts_history", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  alertKey: text("alert_key").notNull().unique(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  message: text("message").notNull(),
  containerId: integer("container_id").references(() => containersTable.id, { onDelete: "set null" }),
  containerNumber: text("container_number"),
  firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
});
