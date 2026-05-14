import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const containerStageNotesTable = pgTable("container_stage_notes", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull(),
  stage: text("stage").notNull(),
  note: text("note").notNull(),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  branchId: integer("branch_id").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContainerStageNote = typeof containerStageNotesTable.$inferSelect;
