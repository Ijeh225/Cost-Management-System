import { describe, expect, it } from "vitest";
import { getEffectiveInvoiceStatus, isInvoiceCollectable, isInvoiceEditable, isInvoiceFinanciallyActive } from "../lib/invoice-status.js";

const now = new Date("2026-09-01T12:00:00Z");

describe("invoice status rules", () => {
  it("keeps a draft as a draft even when it has an old due date", () => {
    expect(getEffectiveInvoiceStatus({ status: "draft", total: 100, totalPaid: 0, dueDate: "2026-08-01", now })).toBe("draft");
  });

  it("treats an issued zero-value invoice as settled", () => {
    expect(getEffectiveInvoiceStatus({ status: "sent", total: 0, totalPaid: 0, dueDate: null, now })).toBe("paid");
  });

  it("derives sent, partial, paid, and overdue from payment and due-date facts", () => {
    expect(getEffectiveInvoiceStatus({ status: "sent", total: 100, totalPaid: 0, dueDate: "2026-09-15", now })).toBe("sent");
    expect(getEffectiveInvoiceStatus({ status: "sent", total: 100, totalPaid: 25, dueDate: "2026-09-15", now })).toBe("partial");
    expect(getEffectiveInvoiceStatus({ status: "partial", total: 100, totalPaid: 100, dueDate: "2026-08-01", now })).toBe("paid");
    expect(getEffectiveInvoiceStatus({ status: "partial", total: 100, totalPaid: 25, dueDate: "2026-08-01", now })).toBe("overdue");
  });

  it("never changes a cancelled or written-off invoice through date calculation", () => {
    expect(getEffectiveInvoiceStatus({ status: "cancelled", total: 100, totalPaid: 0, dueDate: "2026-08-01", now })).toBe("cancelled");
    expect(getEffectiveInvoiceStatus({ status: "written_off", total: 100, totalPaid: 0, dueDate: "2026-08-01", now })).toBe("written_off");
  });

  it("allows edits only to drafts and collection only from issued invoices", () => {
    expect(isInvoiceEditable("draft")).toBe(true);
    expect(isInvoiceEditable("sent")).toBe(false);
    expect(isInvoiceCollectable("sent")).toBe(true);
    expect(isInvoiceCollectable("partial")).toBe(true);
    expect(isInvoiceCollectable("draft")).toBe(false);
    expect(isInvoiceCollectable("cancelled")).toBe(false);
    expect(isInvoiceCollectable("written_off")).toBe(false);
  });

  it("keeps audit-only invoices out of financial totals", () => {
    expect(isInvoiceFinanciallyActive("sent")).toBe(true);
    expect(isInvoiceFinanciallyActive("paid")).toBe(true);
    expect(isInvoiceFinanciallyActive("draft")).toBe(false);
    expect(isInvoiceFinanciallyActive("cancelled")).toBe(false);
    expect(isInvoiceFinanciallyActive("written_off")).toBe(false);
  });
});
