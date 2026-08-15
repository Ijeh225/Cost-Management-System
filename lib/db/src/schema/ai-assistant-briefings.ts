import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";

/**
 * Evidence-based proactive briefings produced by the AI assistant scheduler.
 * The JSON payload contains the rule results and source links used to create
 * the briefing; it is intentionally stored separately from chat/audit rows.
 */
export const aiAssistantBriefingsTable = pgTable("ai_assistant_briefings", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  period: text("period").notNull(),
  briefingDate: text("briefing_date").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  insightCount: integer("insight_count").notNull().default(0),
  payload: text("payload").notNull().default("{}"),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
}, (table) => [
  index("ai_assistant_briefings_branch_idx").on(table.branchId),
  index("ai_assistant_briefings_period_date_idx").on(table.period, table.briefingDate),
]);

export type AiAssistantBriefing = typeof aiAssistantBriefingsTable.$inferSelect;
