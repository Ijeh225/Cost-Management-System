import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { containersTable } from "./containers";
import { usersTable } from "./users";

export const sectionApprovalsTable = pgTable("section_approvals", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  section: text("section").notNull(),
  status: text("status").notNull().default("draft"),
  submittedById: integer("submitted_by_id").references(() => usersTable.id),
  submittedAt: timestamp("submitted_at"),
  reviewedById: integer("reviewed_by_id").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at"),
  rejectionReason: text("rejection_reason"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("unique_container_section").on(table.containerId, table.section),
]);

export const insertSectionApprovalSchema = createInsertSchema(sectionApprovalsTable).omit({
  id: true,
  updatedAt: true,
});

export type InsertSectionApproval = z.infer<typeof insertSectionApprovalSchema>;
export type SectionApproval = typeof sectionApprovalsTable.$inferSelect;
