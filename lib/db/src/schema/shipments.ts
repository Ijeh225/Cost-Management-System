import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { clientsTable } from "./clients";

export const shipmentsTable = pgTable("shipments", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  blNumber: text("bl_number").notNull(),
  blKey: text("bl_key").notNull(),
  clientId: integer("client_id").references(() => clientsTable.id),
  customerName: text("customer_name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [unique("shipments_branch_bl_key_unique").on(table.branchId, table.blKey)]);

// Equipment is the physical box; containers.id remains the visit/job record.
export const containerEquipmentTable = pgTable("container_equipment", {
  id: serial("id").primaryKey(),
  numberKey: text("number_key").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
