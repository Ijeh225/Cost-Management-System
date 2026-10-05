import { pgTable, serial, integer, text, timestamp, date, uniqueIndex, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { containersTable } from "./containers";
import { usersTable } from "./users";
import { branchesTable } from "./branches";

export const containerDocumentsTable = pgTable("container_documents", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1),
  containerId: integer("container_id").notNull().references(() => containersTable.id, { onDelete: "cascade" }),
  section: text("section"),
  documentType: text("document_type").notNull().default("other"),
  issuer: text("issuer"),
  expiresOn: date("expires_on"),
  previousVersionId: integer("previous_version_id").references((): AnyPgColumn => containerDocumentsTable.id),
  versionNumber: integer("version_number").notNull().default(1),
  retained: integer("retained").notNull().default(0),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("application/octet-stream"),
  size: integer("size").notNull().default(0),
  uploadedById: integer("uploaded_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [uniqueIndex("document_previous_version_unique").on(table.previousVersionId)]);

// Profiles, applications and reviews are append-only; existing uploads stay unreviewed.
export const documentProfilesTable = pgTable("document_profiles", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  name: text("name").notNull(),
  jobType: text("job_type").notNull(),
  cargoType: text("cargo_type").notNull(),
  requiredTypes: text("required_types").notNull(),
  createdById: integer("created_by_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export const documentChecklistsTable = pgTable("document_checklists", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull().references(() => containersTable.id),
  profileId: integer("profile_id").notNull().references(() => documentProfilesTable.id),
  appliedById: integer("applied_by_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [index("document_checklist_container_idx").on(table.containerId)]);
export const documentReviewsTable = pgTable("document_reviews", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id").notNull().references(() => containerDocumentsTable.id),
  reviewerId: integer("reviewer_id").notNull().references(() => usersTable.id),
  status: text("status").notNull(),
  documentType: text("document_type").notNull(),
  issuer: text("issuer").notNull(),
  expiresOn: date("expires_on"),
  acceptedFields: text("accepted_fields").notNull(),
  extractionSnapshot: text("extraction_snapshot").notNull(),
  notes: text("notes").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, table => [index("document_review_document_idx").on(table.documentId)]);

export const insertDocumentSchema = createInsertSchema(containerDocumentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type ContainerDocument = typeof containerDocumentsTable.$inferSelect;
