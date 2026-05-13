import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { containersTable } from "./containers";
import { branchesTable } from "./branches";

export const EXTRA_CHARGE_SECTIONS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
export type ExtraChargeSection = typeof EXTRA_CHARGE_SECTIONS[number];

export const containerExtraChargesTable = pgTable("container_extra_charges", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  label: text("label").notNull(),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull().default("0"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContainerExtraCharge = typeof containerExtraChargesTable.$inferSelect;

const numericField = () => numeric({ precision: 15, scale: 2 }).notNull().default("0");

export const shippingChargesTable = pgTable("shipping_charges", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }).unique(),
  shippingCompany: numericField(),
  shippingPaymentVat: numericField(),
  consignee: numericField(),
  finalInvoiceShippingCompany: numericField(),
  telexCharge: numericField(),
  shippingRunnings: numericField(),
  shippingDetentionToBePaidByCustomer: numericField(),
  usdAmount: numeric("usd_amount", { precision: 15, scale: 2 }),
  exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customsChargesTable = pgTable("customs_charges", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }).unique(),
  duty: numericField(),
  dutyPaid: numericField(),
  dutyNotPaid: numericField(),
  valuation: numericField(),
  ciu: numericField(),
  upCountryCustom: numericField(),
  dciu: numericField(),
  mdReleasingPackage: numericField(),
  ocSettlement: numericField(),
  ocReleaseLocal: numericField(),
  dcEnforcementForTransire: numericField(),
  complianceTeam: numericField(),
  cacSettlement: numericField(),
  crffn: numericField(),
  soncap: numericField(),
  alerts: numericField(),
  examinationBonus: numericField(),
  usdAmount: numeric("usd_amount", { precision: 15, scale: 2 }),
  exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const terminalChargesTable = pgTable("terminal_charges", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }).unique(),
  terminalCharges: numericField(),
  terminalAdditions1: numericField(),
  ikorouduTerminalAdditions2: numericField(),
  terminalDemurrageToBePaidByCustomer: numericField(),
  terminalPaymentVat: numericField(),
  wharfageFeeForNpa: numericField(),
  sifaxGmtSigning: numericField(),
  tsDcAdmin: numericField(),
  tincanBond: numericField(),
  bond: numericField(),
  manifest: numericField(),
  usdAmount: numeric("usd_amount", { precision: 15, scale: 2 }),
  exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const deliveryChargesTable = pgTable("delivery_charges", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }).unique(),
  passingOfTruck: numericField(),
  passingOfTruckForEmptyReturn: numericField(),
  parkingForPullout: numericField(),
  pullout: numericField(),
  delivery: numericField(),
  emptyReturn: numericField(),
  unchainingTruck: numericField(),
  emptyCallUp: numericField(),
  pulloutExpenses: numericField(),
  transferToIkorodu: numericField(),
  transportAllowance: numericField(),
  usdAmount: numeric("usd_amount", { precision: 15, scale: 2 }),
  exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const operationsChargesTable = pgTable("operations_charges", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }).unique(),
  fouBooking: numericField(),
  fou: numericField(),
  scanningToPhysical: numericField(),
  security: numericField(),
  additionalDeliveryExpenses: numericField(),
  miscellaneous: numericField(),
  abandoned: numericField(),
  agenciesBlocks: numericField(),
  callUp: numericField(),
  transireRunnings: numericField(),
  officePtml: numericField(),
  freshPayment: numericField(),
  usdAmount: numeric("usd_amount", { precision: 15, scale: 2 }),
  exchangeRate: numeric("exchange_rate", { precision: 15, scale: 6 }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShippingChargesSchema = createInsertSchema(shippingChargesTable).omit({ id: true, updatedAt: true });
export const insertCustomsChargesSchema = createInsertSchema(customsChargesTable).omit({ id: true, updatedAt: true });
export const insertTerminalChargesSchema = createInsertSchema(terminalChargesTable).omit({ id: true, updatedAt: true });
export const insertDeliveryChargesSchema = createInsertSchema(deliveryChargesTable).omit({ id: true, updatedAt: true });
export const insertOperationsChargesSchema = createInsertSchema(operationsChargesTable).omit({ id: true, updatedAt: true });

export type ShippingCharges = typeof shippingChargesTable.$inferSelect;
export type CustomsCharges = typeof customsChargesTable.$inferSelect;
export type TerminalCharges = typeof terminalChargesTable.$inferSelect;
export type DeliveryCharges = typeof deliveryChargesTable.$inferSelect;
export type OperationsCharges = typeof operationsChargesTable.$inferSelect;

export type InsertShippingCharges = z.infer<typeof insertShippingChargesSchema>;
export type InsertCustomsCharges = z.infer<typeof insertCustomsChargesSchema>;
export type InsertTerminalCharges = z.infer<typeof insertTerminalChargesSchema>;
export type InsertDeliveryCharges = z.infer<typeof insertDeliveryChargesSchema>;
export type InsertOperationsCharges = z.infer<typeof insertOperationsChargesSchema>;
