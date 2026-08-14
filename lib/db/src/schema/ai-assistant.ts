import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { usersTable } from "./users";

/**
 * Phase 1 foundation only. Sessions and audit records are intentionally
 * separate from operational audit logs because they can contain AI-specific
 * metadata, source references, and later approved action history.
 */
export const aiAssistantSessionsTable = pgTable("ai_assistant_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  title: text("title").notNull().default("New assistant session"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("ai_assistant_sessions_user_idx").on(table.userId),
  index("ai_assistant_sessions_branch_idx").on(table.branchId),
]);

export const aiAssistantAuditLogsTable = pgTable("ai_assistant_audit_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => aiAssistantSessionsTable.id, { onDelete: "set null" }),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").references(() => branchesTable.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(),
  requestSummary: text("request_summary"),
  responseSummary: text("response_summary"),
  toolName: text("tool_name"),
  recordReferences: text("record_references").notNull().default("[]"),
  metadata: text("metadata").notNull().default("{}"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ai_assistant_audit_user_idx").on(table.userId),
  index("ai_assistant_audit_branch_idx").on(table.branchId),
  index("ai_assistant_audit_session_idx").on(table.sessionId),
  index("ai_assistant_audit_created_at_idx").on(table.createdAt),
]);

export type AiAssistantSession = typeof aiAssistantSessionsTable.$inferSelect;
export type AiAssistantAuditLog = typeof aiAssistantAuditLogsTable.$inferSelect;
