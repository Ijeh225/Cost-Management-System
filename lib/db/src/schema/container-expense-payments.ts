import { pgTable, serial, integer, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const PAYMENT_SECTIONS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
export type PaymentSection = typeof PAYMENT_SECTIONS[number];

export const PAYMENT_SECTION_LABELS: Record<PaymentSection, string> = {
  shipping: "Shipping",
  customs: "Customs",
  terminal: "Terminal",
  delivery: "Delivery",
  operations: "Operations",
};

export const containerExpensePaymentsTable = pgTable("container_expense_payments", {
  id: serial("id").primaryKey(),
  containerId: integer("container_id").notNull(),
  categoryId: integer("category_id"),
  section: text("section"),
  amount: numeric("amount", { precision: 15, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("cash"),
  bankId: integer("bank_id"),
  reference: text("reference"),
  narration: text("narration"),
  paidAt: timestamp("paid_at").notNull().defaultNow(),
  recordedBy: integer("recorded_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type ContainerExpensePayment = typeof containerExpensePaymentsTable.$inferSelect;
export type InsertContainerExpensePayment = typeof containerExpensePaymentsTable.$inferInsert;
