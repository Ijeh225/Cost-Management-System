import { boolean, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

/** Controlled schedules for report emails. Filters and recipients are stored as JSON. */
export const reportSubscriptionsTable = pgTable("report_subscriptions", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "cascade" }),
  reportKind: text("report_kind").notNull(),
  frequency: text("frequency").notNull(),
  recipients: text("recipients").notNull().default("[]"),
  filters: text("filters").notNull().default("{}"),
  sendAt: text("send_at").notNull().default("08:00"),
  timezone: text("timezone").notNull().default("Africa/Lagos"),
  sendDayOfWeek: integer("send_day_of_week").notNull().default(1),
  isActive: boolean("is_active").notNull().default(true),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  lastSentAt: timestamp("last_sent_at"),
  archivedAt: timestamp("archived_at"),
  archivedById: integer("archived_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("report_subscriptions_branch_idx").on(table.branchId),
  index("report_subscriptions_active_idx").on(table.isActive),
  index("report_subscriptions_archived_idx").on(table.archivedAt),
]);

/** Immutable evidence of an attempted scheduled delivery. */
export const reportDeliveryLogsTable = pgTable("report_delivery_logs", {
  id: serial("id").primaryKey(),
  subscriptionId: integer("subscription_id").notNull().references(() => reportSubscriptionsTable.id, { onDelete: "restrict" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  reportKind: text("report_kind").notNull(),
  recipients: text("recipients").notNull().default("[]"),
  status: text("status").notNull(),
  itemCount: integer("item_count").notNull().default(0),
  error: text("error"),
  deliveredAt: timestamp("delivered_at").notNull().defaultNow(),
}, (table) => [
  index("report_delivery_logs_subscription_idx").on(table.subscriptionId),
  index("report_delivery_logs_delivered_idx").on(table.deliveredAt),
]);

export type ReportSubscription = typeof reportSubscriptionsTable.$inferSelect;
export type ReportDeliveryLog = typeof reportDeliveryLogsTable.$inferSelect;
