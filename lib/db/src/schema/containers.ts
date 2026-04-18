import { pgTable, serial, text, boolean, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { clientsTable } from "./clients";

export const containersTable = pgTable("containers", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  containerNumber: text("container_number").notNull().unique(),
  blNumber: text("bl_number").notNull().unique(),
  declaration: text("declaration").notNull().default(""),
  size: text("size").notNull().default(""),
  vessel: text("vessel").notNull().default(""),
  status: text("status").notNull().default("new_upload"),
  isLocked: boolean("is_locked").notNull().default(false),
  lockedSections: text("locked_sections").notNull().default("[]"),
  clientId: integer("client_id").references(() => clientsTable.id),
  assignedStaffId: integer("assigned_staff_id").references(() => usersTable.id),
  clearingCharges: numeric("clearing_charges", { precision: 15, scale: 2 }).notNull().default("0"),
  deliveredAt: timestamp("delivered_at"),
  deliveredAtEstimated: boolean("delivered_at_estimated").notNull().default(false),
  stageOwner: text("stage_owner"),
  nextAction: text("next_action"),
  nextActionDueDate: timestamp("next_action_due_date"),
  delayReason: text("delay_reason"),
  deliveryTime: text("delivery_time"),
  deliveryLocation: text("delivery_location"),
  truckNumber: text("truck_number"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  dispatchOfficer: text("dispatch_officer"),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  offloadingConfirmed: boolean("offloading_confirmed").notNull().default(false),
  emptyReturnDueDate: timestamp("empty_return_due_date"),
  emptyReturnDate: timestamp("empty_return_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContainerSchema = createInsertSchema(containersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertContainer = z.infer<typeof insertContainerSchema>;
export type Container = typeof containersTable.$inferSelect;
