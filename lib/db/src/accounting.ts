import { bigint, boolean, date, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
import { branchesTable } from "./schema/branches";
import { usersTable } from "./schema/users";

// Cross-row balance, immutability and concurrency constraints live in the
// additive accounting-schema migration; Drizzle cannot express those triggers.
export const accountingBooksTable = pgTable("accounting_books", {
  id: serial("id").primaryKey(), name: text("name").notNull(), currency: text("currency").notNull(),
  status: text("status").notNull().default("draft"), policyVersion: text("policy_version"),
  policy: jsonb("policy").notNull().default({}), ownerApproval: text("owner_approval"), accountantApproval: text("accountant_approval"),
  approvedBy: integer("approved_by").references(() => usersTable.id), approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const accountingBookBranchesTable = pgTable("accounting_book_branches", {
  bookId: integer("book_id").notNull().references(() => accountingBooksTable.id),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id),
}, t => [primaryKey({ columns: [t.bookId, t.branchId] }), uniqueIndex("accounting_book_branch_unique").on(t.branchId)]);
export const accountingAccountsTable = pgTable("accounting_accounts", {
  id: serial("id").primaryKey(), bookId: integer("book_id").notNull().references(() => accountingBooksTable.id),
  code: text("code").notNull(), name: text("name").notNull(), category: text("category").notNull(), active: boolean("active").notNull().default(true),
}, t => [uniqueIndex("accounting_account_code").on(t.bookId, t.code)]);
export const accountingPeriodsTable = pgTable("accounting_periods", {
  id: serial("id").primaryKey(), bookId: integer("book_id").notNull().references(() => accountingBooksTable.id),
  name: text("name").notNull(), startsOn: date("starts_on").notNull(), endsOn: date("ends_on").notNull(), status: text("status").notNull().default("open"),
});
export const accountingGrantsTable = pgTable("accounting_grants", {
  bookId: integer("book_id").notNull().references(() => accountingBooksTable.id), branchId: integer("branch_id").notNull().references(() => branchesTable.id),
  userId: integer("user_id").notNull().references(() => usersTable.id), permission: text("permission").notNull(),
  evidence: text("evidence").notNull(), grantedBy: integer("granted_by").notNull().references(() => usersTable.id),
}, t => [primaryKey({ columns: [t.bookId, t.branchId, t.userId, t.permission] })]);
export const accountingJournalsTable = pgTable("accounting_journals", {
  id: serial("id").primaryKey(), bookId: integer("book_id").notNull().references(() => accountingBooksTable.id),
  branchId: integer("branch_id").notNull().references(() => branchesTable.id), periodId: integer("period_id").notNull().references(() => accountingPeriodsTable.id),
  currency: text("currency").notNull(), accountingDate: date("accounting_date").notNull(), eventKey: text("event_key").notNull(),
  payloadHash: text("payload_hash").notNull(), narration: text("narration").notNull(), evidence: text("evidence").notNull(),
  kind: text("kind").notNull(), reversalOf: integer("reversal_of"), status: text("status").notNull().default("draft"),
  preparedBy: integer("prepared_by").notNull().references(() => usersTable.id), postedBy: integer("posted_by").references(() => usersTable.id),
  postedAt: timestamp("posted_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex("accounting_journal_event").on(t.bookId, t.eventKey)]);
export const accountingJournalLinesTable = pgTable("accounting_journal_lines", {
  id: serial("id").primaryKey(), bookId: integer("book_id").notNull().references(() => accountingBooksTable.id),
  journalId: integer("journal_id").notNull().references(() => accountingJournalsTable.id), accountId: integer("account_id").notNull().references(() => accountingAccountsTable.id),
  debitMinor: bigint("debit_minor", { mode: "bigint" }).notNull().default(0n), creditMinor: bigint("credit_minor", { mode: "bigint" }).notNull().default(0n), memo: text("memo").notNull().default(""),
});
export const accountingSourceEventsTable = pgTable("accounting_source_events", {
  bookId: integer("book_id").notNull().references(() => accountingBooksTable.id), eventKey: text("event_key").notNull(), journalId: integer("journal_id").notNull().references(() => accountingJournalsTable.id),
}, t => [primaryKey({ columns: [t.bookId, t.eventKey] }), uniqueIndex("accounting_source_journal").on(t.journalId)]);
export const accountingAuditTable = pgTable("accounting_audit", {
  id: serial("id").primaryKey(), bookId: integer("book_id").notNull().references(() => accountingBooksTable.id), branchId: integer("branch_id").references(() => branchesTable.id),
  actorId: integer("actor_id").notNull().references(() => usersTable.id), journalId: integer("journal_id").references(() => accountingJournalsTable.id),
  periodId: integer("period_id").references(() => accountingPeriodsTable.id), action: text("action").notNull(), reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
