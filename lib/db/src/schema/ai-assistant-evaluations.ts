import { index, integer, pgTable, serial, text, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Anonymised business questions used to guard AI routing changes. These cases
 * contain expected interpretations, never customer data or live answers.
 */
export const aiAssistantEvaluationCasesTable = pgTable("ai_assistant_evaluation_cases", {
  id: serial("id").primaryKey(),
  caseKey: text("case_key").notNull(),
  question: text("question").notNull(),
  businessInterpretation: text("business_interpretation").notNull(),
  expectedTool: text("expected_tool"),
  expectedStatus: text("expected_status").notNull().default("answered"),
  expectedAnswer: text("expected_answer"),
  correctionGuidance: text("correction_guidance").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdById: integer("created_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("ai_assistant_evaluation_case_key_idx").on(table.caseKey),
  index("ai_assistant_evaluation_case_active_idx").on(table.isActive),
]);

/** Each run is immutable evidence of the assistant behaviour at that time. */
export const aiAssistantEvaluationRunsTable = pgTable("ai_assistant_evaluation_runs", {
  id: serial("id").primaryKey(),
  caseId: integer("case_id").notNull().references(() => aiAssistantEvaluationCasesTable.id, { onDelete: "cascade" }),
  runById: integer("run_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  mode: text("mode").notNull().default("deterministic"),
  outcome: text("outcome").notNull(),
  actualTool: text("actual_tool"),
  actualStatus: text("actual_status").notNull(),
  actualInterpretation: text("actual_interpretation").notNull().default(""),
  correctionRequired: boolean("correction_required").notNull().default(false),
  correctionNote: text("correction_note"),
  runAt: timestamp("run_at").notNull().defaultNow(),
}, (table) => [
  index("ai_assistant_evaluation_runs_case_idx").on(table.caseId),
  index("ai_assistant_evaluation_runs_outcome_idx").on(table.outcome),
  index("ai_assistant_evaluation_runs_run_at_idx").on(table.runAt),
]);

export type AiAssistantEvaluationCase = typeof aiAssistantEvaluationCasesTable.$inferSelect;
export type AiAssistantEvaluationRun = typeof aiAssistantEvaluationRunsTable.$inferSelect;
