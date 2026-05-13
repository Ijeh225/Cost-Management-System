import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { containersTable } from "./containers";
import { branchesTable } from "./branches";

export const customSectionsTable = pgTable("custom_sections", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  containerId: integer("container_id").references(() => containersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
  icon: text("icon").notNull().default("Layers"),
  isRequired: boolean("is_required").notNull().default(false),
  isArchived: boolean("is_archived").notNull().default(false),
  sectionOrder: integer("section_order").notNull().default(0),
  permissions: text("permissions").notNull().default("{}"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const customFieldsTable = pgTable("custom_fields", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  sectionId: integer("section_id").references(() => customSectionsTable.id, { onDelete: "cascade" }),
  builtinSectionKey: text("builtin_section_key"),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull().default("text"),
  placeholder: text("placeholder").notNull().default(""),
  helpText: text("help_text").notNull().default(""),
  defaultValue: text("default_value").notNull().default(""),
  isRequired: boolean("is_required").notNull().default(false),
  includeInTotal: boolean("include_in_total").notNull().default(false),
  visibleByRole: text("visible_by_role").notNull().default("all"),
  editableByRole: text("editable_by_role").notNull().default("all"),
  dropdownOptions: text("dropdown_options").notNull().default("[]"),
  fieldOrder: integer("field_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const customFieldValuesTable = pgTable("custom_field_values", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().default(1).references(() => branchesTable.id),
  containerId: integer("container_id").notNull(),
  fieldId: integer("field_id").notNull().references(() => customFieldsTable.id, { onDelete: "cascade" }),
  value: text("value").notNull().default(""),
  updatedById: integer("updated_by_id").references(() => usersTable.id),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCustomSectionSchema = createInsertSchema(customSectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCustomFieldSchema = createInsertSchema(customFieldsTable).omit({ id: true, createdAt: true });
export const insertCustomFieldValueSchema = createInsertSchema(customFieldValuesTable).omit({ id: true, updatedAt: true });

export type CustomSection = typeof customSectionsTable.$inferSelect;
export type CustomField = typeof customFieldsTable.$inferSelect;
export type CustomFieldValue = typeof customFieldValuesTable.$inferSelect;
