import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { containersTable } from "./containers";
import { usersTable } from "./users";

export const containerDocumentsTable = pgTable("container_documents", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  section: text("section"),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  uploadedById: integer("uploaded_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(containerDocumentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type ContainerDocument = typeof containerDocumentsTable.$inferSelect;
