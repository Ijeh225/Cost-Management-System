import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { containersTable } from "./containers";
import { usersTable } from "./users";

export const containerTasksTable = pgTable("container_tasks", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  assignedStaffId: integer("assigned_staff_id").references(() => usersTable.id),
  dueDate: timestamp("due_date"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  notes: text("notes").notNull().default(""),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(containerTasksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTask = z.infer<typeof insertTaskSchema>;
export type ContainerTask = typeof containerTasksTable.$inferSelect;
