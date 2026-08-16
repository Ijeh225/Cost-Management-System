import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

/** Immutable, read-only snapshots prepared from approved AI report tools. */
export const aiAssistantReportDraftsTable = pgTable("ai_assistant_report_drafts", {
  id: serial("id").primaryKey(),
  requestedById: integer("requested_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  reportType: text("report_type").notNull(),
  title: text("title").notNull(),
  filters: text("filters").notNull().default("{}"),
  facts: text("facts").notNull().default("[]"),
  records: text("records").notNull().default("[]"),
  sourceRecords: text("source_records").notNull().default("[]"),
  notes: text("notes").notNull().default("[]"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
}, (table) => [
  index("ai_assistant_report_drafts_user_idx").on(table.requestedById),
  index("ai_assistant_report_drafts_branch_idx").on(table.branchId),
  index("ai_assistant_report_drafts_generated_idx").on(table.generatedAt),
]);

export type AiAssistantReportDraft = typeof aiAssistantReportDraftsTable.$inferSelect;
