import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { containersTable } from "./containers";
import { usersTable } from "./users";

export const containerTimelineTable = pgTable("container_timeline", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventType: text("event_type").notNull().default("note"),
  description: text("description").notNull().default(""),
  userId: integer("user_id").references(() => usersTable.id),
  status: text("status").notNull().default("completed"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTimelineSchema = createInsertSchema(containerTimelineTable).omit({
  id: true,
  createdAt: true,
});

export type InsertTimeline = z.infer<typeof insertTimelineSchema>;
export type Timeline = typeof containerTimelineTable.$inferSelect;
