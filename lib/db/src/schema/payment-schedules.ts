import { pgTable, serial, text, numeric, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { branchesTable } from "./branches";
import { overheadExpensesTable } from "./overhead-expenses";

export const PAYMENT_SCHEDULE_STATUSES = [
  "pending_approval",
  "partially_approved",
  "approved",
  "paid",
  "completed",
  "rejected",
  "cancelled",
] as const;

export const PAYMENT_SCHEDULE_PRIORITIES = ["low", "normal", "urgent"] as const;

export type PaymentScheduleStatus = typeof PAYMENT_SCHEDULE_STATUSES[number];
export type PaymentSchedulePriority = typeof PAYMENT_SCHEDULE_PRIORITIES[number];

export const paymentSchedulesTable = pgTable("payment_schedules", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  scheduleDate: timestamp("schedule_date").notNull(),
  originalRequestDate: timestamp("original_request_date").notNull().defaultNow(),
  requestedById: integer("requested_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  overheadExpenseId: integer("overhead_expense_id").references(() => overheadExpensesTable.id, { onDelete: "set null" }),
  vendorBeneficiary: text("vendor_beneficiary").notNull(),
  clientName: text("client_name"),
  description: text("description").notNull(),
  amountRequested: numeric("amount_requested", { precision: 18, scale: 2 }).notNull(),
  amountApproved: numeric("amount_approved", { precision: 18, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 18, scale: 2 }).notNull().default("0"),
  priority: text("priority").notNull().default("normal"),
  status: text("status").notNull().default("pending_approval"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const paymentScheduleEventsTable = pgTable("payment_schedule_events", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  scheduleId: integer("schedule_id").notNull().references(() => paymentSchedulesTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  actorUserId: integer("actor_user_id").references(() => usersTable.id, { onDelete: "set null" }),
  comment: text("comment"),
  amount: numeric("amount", { precision: 18, scale: 2 }),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  oldScheduleDate: timestamp("old_schedule_date"),
  newScheduleDate: timestamp("new_schedule_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentScheduleDocumentsTable = pgTable("payment_schedule_documents", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  scheduleId: integer("schedule_id").notNull().references(() => paymentSchedulesTable.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  uploadedById: integer("uploaded_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type PaymentSchedule = typeof paymentSchedulesTable.$inferSelect;
export type InsertPaymentSchedule = typeof paymentSchedulesTable.$inferInsert;
export type PaymentScheduleEvent = typeof paymentScheduleEventsTable.$inferSelect;
export type PaymentScheduleDocument = typeof paymentScheduleDocumentsTable.$inferSelect;
