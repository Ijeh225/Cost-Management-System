import { describe, expect, it } from "vitest";
import { invoiceAging } from "../lib/financial-reporting";
import { parsePaymentClassification } from "../lib/payment-classification-rules";
import { getEffectiveInvoiceStatus } from "../lib/invoice-status";

describe("Nigeria-calendar receivable aging", () => {
  it.each([[0,"current"],[1,"days1to30"],[30,"days1to30"],[31,"days31to60"],[60,"days31to60"],[61,"days61to90"],[90,"days61to90"],[91,"days90plus"]] as const)("age %i is %s at Lagos midnight", (age, bucket) => {
    const due = new Date(Date.parse("2026-10-10") - age * 86400000).toISOString().slice(0, 10);
    expect(invoiceAging(due, new Date("2026-10-09T23:00:00Z"))).toEqual({ daysOverdue: age, bucket });
    expect(invoiceAging(due, new Date("2026-10-10T22:59:59Z")).bucket).toBe(bucket);
  });
  it("keeps future or absent due dates current", () => {
    expect(invoiceAging(null).bucket).toBe("current");
    expect(invoiceAging("2099-01-01").bucket).toBe("current");
  });
  it("keeps invoice overdue status aligned with aging at the Nigeria day boundary", () => {
    expect(getEffectiveInvoiceStatus({ status: "sent", total: 10, totalPaid: 0, dueDate: "2026-10-09", now: new Date("2026-10-09T23:00:00Z") })).toBe("overdue");
    expect(getEffectiveInvoiceStatus({ status: "sent", total: 10, totalPaid: 0, dueDate: "2026-10-10", now: new Date("2026-10-09T23:00:00Z") })).toBe("sent");
  });
});

describe("evidence-led standalone classification", () => {
  it("never guesses an expense from a missing category", () => expect(parsePaymentClassification({ notes: "supplier" }).classification).toBe("unclassified"));
  it("rejects an unknown category", () => expect(() => parsePaymentClassification({ classification: "income" })).toThrow());
  it("requires evidence and an expense head", () => {
    expect(() => parsePaymentClassification({ classification: "asset" })).toThrow("evidence");
    expect(() => parsePaymentClassification({ classification: "operating_expense", classificationReason: "receipt" })).toThrow("head");
  });
  it("does not retain an expense head for a non-expense", () => expect(parsePaymentClassification({ classification: "asset", expenseHead: "supplies", classificationReason: "Equipment invoice" }).expenseHead).toBeNull());
});
