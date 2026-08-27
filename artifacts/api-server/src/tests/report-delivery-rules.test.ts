import { describe, expect, it } from "vitest";
import { isReportDeliveryDue, normalizeReportRecipients, SCHEDULED_REPORT_FREQUENCIES, SCHEDULED_REPORT_KINDS } from "../lib/report-delivery-rules.js";

describe("scheduled report delivery rules", () => {
  it("normalizes and de-duplicates recipient addresses", () => {
    expect(normalizeReportRecipients([" Finance@Example.com ", "finance@example.com", "manager@example.com"])).toEqual(["finance@example.com", "manager@example.com"]);
  });

  it("rejects missing, invalid, and excessive recipients", () => {
    expect(normalizeReportRecipients([])).toBeNull();
    expect(normalizeReportRecipients(["not-an-email"])).toBeNull();
    expect(normalizeReportRecipients(Array.from({ length: 21 }, (_, i) => `user${i}@example.com`))).toBeNull();
  });

  it("only sends daily and weekly schedules after their due interval", () => {
    const now = new Date("2026-08-27T10:00:00.000Z");
    expect(isReportDeliveryDue("daily", null, now)).toBe(true);
    expect(isReportDeliveryDue("daily", new Date("2026-08-26T11:00:00.000Z"), now)).toBe(false);
    expect(isReportDeliveryDue("daily", new Date("2026-08-26T09:59:00.000Z"), now)).toBe(true);
    expect(isReportDeliveryDue("weekly", new Date("2026-08-21T10:00:00.000Z"), now)).toBe(false);
    expect(isReportDeliveryDue("weekly", new Date("2026-08-20T09:59:00.000Z"), now)).toBe(true);
  });

  it("limits schedules to approved report kinds and frequencies", () => {
    expect(SCHEDULED_REPORT_KINDS.has("duty_payment_ledger")).toBe(true);
    expect(SCHEDULED_REPORT_KINDS.has("unknown_report")).toBe(false);
    expect(SCHEDULED_REPORT_FREQUENCIES.has("daily")).toBe(true);
    expect(SCHEDULED_REPORT_FREQUENCIES.has("monthly")).toBe(false);
  });
});
