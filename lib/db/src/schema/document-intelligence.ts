import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { branchesTable } from "./branches";
import { containersTable } from "./containers";
import { containerDocumentsTable } from "./documents";
import { usersTable } from "./users";

/**
 * A private, permission-scoped search index for uploaded container documents.
 * Document bytes remain in object storage; this stores only extracted text and
 * traceability metadata needed by the read-only assistant.
 */
export const documentIntelligenceIndexTable = pgTable("document_intelligence_index", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => containerDocumentsTable.id, { onDelete: "cascade" }),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id, { onDelete: "cascade" }),
  section: text("section"),
  uploadedById: integer("uploaded_by_id").references(() => usersTable.id, { onDelete: "set null" }),
  status: text("status").notNull().default("pending"),
  extractorVersion: text("extractor_version").notNull().default("v1"),
  contentText: text("content_text"),
  pageText: text("page_text").notNull().default("[]"),
  pageCount: integer("page_count"),
  errorMessage: text("error_message"),
  indexedAt: timestamp("indexed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("document_intelligence_document_idx").on(table.documentId),
  index("document_intelligence_branch_idx").on(table.branchId),
  index("document_intelligence_container_idx").on(table.containerId),
  index("document_intelligence_status_idx").on(table.status),
]);

export type DocumentIntelligenceIndex = typeof documentIntelligenceIndexTable.$inferSelect;
