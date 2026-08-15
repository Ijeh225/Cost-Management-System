import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

/**
 * Confirmation-gated assistant drafts. Payloads are stored as JSON text so the
 * preview, source evidence, confirmation, and execution result remain auditable.
 */
export const aiAssistantActionDraftsTable = pgTable("ai_assistant_action_drafts", {
  id: serial("id").primaryKey(),
  requestedById: integer("requested_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("draft"),
  payload: text("payload").notNull().default("{}"),
  sourceRecords: text("source_records").notNull().default("[]"),
  preview: text("preview").notNull().default("{}"),
  confirmationNote: text("confirmation_note"),
  confirmedAt: timestamp("confirmed_at"),
  executedAt: timestamp("executed_at"),
  executionResult: text("execution_result"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ai_assistant_action_drafts_user_idx").on(table.requestedById),
  index("ai_assistant_action_drafts_branch_idx").on(table.branchId),
  index("ai_assistant_action_drafts_status_idx").on(table.status),
]);

export type AiAssistantActionDraft = typeof aiAssistantActionDraftsTable.$inferSelect;
