import { pgTable, serial, text, boolean, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { clientsTable } from "./clients";

export const containersTable = pgTable("containers", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  customerName: text("customer_name").notNull(),
  containerNumber: text("container_number").notNull().unique(),
  blNumber: text("bl_number").notNull().unique(),
  declaration: text("declaration").notNull().default(""),
  size: text("size").notNull().default(""),
  vessel: text("vessel").notNull().default(""),
  status: text("status").notNull().default("pending_verification"),
  verificationOfficerId: integer("verification_officer_id").references(() => usersTable.id),
  verificationOfficerIds: text("verification_officer_ids").notNull().default("[]"),
  berthingOfficerId: integer("berthing_officer_id").references(() => usersTable.id),
  berthingOfficerIds: text("berthing_officer_ids").notNull().default("[]"),
  verifiedAt: timestamp("verified_at"),
  verifiedBy: integer("verified_by").references(() => usersTable.id),
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
  paarNumber: text("paar_number"),
  paarOfficer: text("paar_officer"),
  paarReleasedAt: timestamp("paar_released_at"),
  paarDelayReason: text("paar_delay_reason"),
  eta: timestamp("eta"),
  command: text("command"),
  consignee: text("consignee"),
  berthed: boolean("berthed").notNull().default(false),
  berthingConfirmedAt: timestamp("berthing_confirmed_at"),
  berthingConfirmedById: integer("berthing_confirmed_by_id").references(() => usersTable.id),
  // Transire stage tracking
  expectedTransireDate: timestamp("expected_transire_date"),
  transireReleasedAt: timestamp("transire_released_at"),
  transireDelayReason: text("transire_delay_reason"),
  transireFinalDate: timestamp("transire_final_date"),
  // Shipping / DO stage tracking
  expectedDoDate: timestamp("expected_do_date"),
  doReleasedAt: timestamp("do_released_at"),
  doDelayReason: text("do_delay_reason"),
  doFinalDate: timestamp("do_final_date"),
  // Terminal / TDO stage tracking
  expectedTdoDate: timestamp("expected_tdo_date"),
  tdoReleasedAt: timestamp("tdo_released_at"),
  tdoDelayReason: text("tdo_delay_reason"),
  tdoFinalDate: timestamp("tdo_final_date"),
  // Pullout stage tracking
  expectedPulloutDate: timestamp("expected_pullout_date"),
  pulloutReleasedAt: timestamp("pullout_released_at"),
  pulloutDelayReason: text("pullout_delay_reason"),
  pulloutFinalDate: timestamp("pullout_final_date"),
  // Final Release (bonded terminal) stage tracking
  expectedReleaseDate: timestamp("expected_release_date"),
  releaseConfirmedAt: timestamp("release_confirmed_at"),
  releaseDelayReason: text("release_delay_reason"),
  releaseFinalDate: timestamp("release_final_date"),
  // Gate-In / Gate-Out tracking (Security personnel)
  gateInDate: timestamp("gate_in_date"),
  gateOutDate: timestamp("gate_out_date"),
  // Empty container return tracking (after delivery, empty box returns to terminal then to port)
  emptyGateInDate: timestamp("empty_gate_in_date"),
  emptyGateOutDate: timestamp("empty_gate_out_date"),
  // Stage timing — set whenever container moves to a new pipeline stage (fixes daysInStage accuracy)
  stageEnteredAt: timestamp("stage_entered_at"),
  // Early Start authorization (allows operations to begin before documentation completes)
  earlyStartAuthorized: boolean("early_start_authorized").notNull().default(false),
  earlyStartAuthorizedById: integer("early_start_authorized_by_id").references(() => usersTable.id),
  earlyStartAuthorizedAt: timestamp("early_start_authorized_at"),
  earlyStartReason: text("early_start_reason"),
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
