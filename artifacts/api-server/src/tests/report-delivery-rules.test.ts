import { describe, expect, it } from "vitest";
import { isReportDeliveryDue, normalizeReportRecipients, normalizeReportSendAt, normalizeReportSendDayOfWeek, SCHEDULED_REPORT_FREQUENCIES, SCHEDULED_REPORT_KINDS } from "../lib/report-delivery-rules.js";

describe("scheduled report delivery rules", () => {
  it("normalizes and de-duplicates recipient addresses", () => {
    expect(normalizeReportRecipients([" Finance@Example.com ", "finance@example.com", "manager@example.com"])).toEqual(["finance@example.com", "manager@example.com"]);
  });

  it("rejects missing, invalid, and excessive recipients", () => {
    expect(normalizeReportRecipients([])).toBeNull();
    expect(normalizeReportRecipients(["not-an-email"])).toBeNull();
    expect(normalizeReportRecipients(Array.from({ length: 21 }, (_, i) => `user${i}@example.com`))).toBeNull();
  });

  it("uses the configured Lagos wall-clock time rather than an elapsed 24-hour interval", () => {
    const beforeNineLagos = new Date("2026-08-27T07:59:00.000Z");
    const atNineLagos = new Date("2026-08-27T08:00:00.000Z");
    expect(isReportDeliveryDue("daily", null, beforeNineLagos, "09:00")).toBe(false);
    expect(isReportDeliveryDue("daily", null, atNineLagos, "09:00")).toBe(true);
    expect(isReportDeliveryDue("daily", new Date("2026-08-27T06:00:00.000Z"), atNineLagos, "09:00")).toBe(false);
    expect(isReportDeliveryDue("daily", new Date("2026-08-26T08:00:00.000Z"), atNineLagos, "09:00")).toBe(true);
  });

  it("runs weekly schedules only on their chosen Lagos weekday and never twice in the same week", () => {
    const mondayAtNineLagos = new Date("2026-08-31T08:00:00.000Z");
    const tuesdayAtNineLagos = new Date("2026-09-01T08:00:00.000Z");
    expect(isReportDeliveryDue("weekly", null, mondayAtNineLagos, "09:00", 1)).toBe(true);
    expect(isReportDeliveryDue("weekly", null, tuesdayAtNineLagos, "09:00", 1)).toBe(false);
    expect(isReportDeliveryDue("weekly", new Date("2026-08-31T08:00:00.000Z"), new Date("2026-09-07T08:00:00.000Z"), "09:00", 1)).toBe(true);
    expect(isReportDeliveryDue("weekly", new Date("2026-08-25T08:00:00.000Z"), mondayAtNineLagos, "09:00", 1)).toBe(false);
  });

  it("validates configured delivery times and weekly days", () => {
    expect(normalizeReportSendAt("08:30")).toBe("08:30");
    expect(normalizeReportSendAt("8:30")).toBeNull();
    expect(normalizeReportSendAt("25:00")).toBeNull();
    expect(normalizeReportSendDayOfWeek(0)).toBe(0);
    expect(normalizeReportSendDayOfWeek(6)).toBe(6);
    expect(normalizeReportSendDayOfWeek(7)).toBeNull();
  });

  it("limits schedules to approved report kinds and frequencies", () => {
    expect(SCHEDULED_REPORT_KINDS.has("duty_payment_ledger")).toBe(true);
    expect(SCHEDULED_REPORT_KINDS.has("unknown_report")).toBe(false);
    expect(SCHEDULED_REPORT_FREQUENCIES.has("daily")).toBe(true);
    expect(SCHEDULED_REPORT_FREQUENCIES.has("monthly")).toBe(false);
  });
});
