import { describe, expect, it } from "vitest";
import { paymentScheduleLookupQuery } from "../lib/ai-payment-schedule-lookup.js";

describe("AI payment schedule lookup parsing", () => {
  it("uses an exact vendor name without requiring a schedule id", () => {
    expect(paymentScheduleLookupQuery("Show payment schedule E2E Scheduled Test Vendor.")).toBe("E2E Scheduled Test Vendor");
  });

  it("keeps broad plural requests as broad schedule queries", () => {
    expect(paymentScheduleLookupQuery("Show approved payment schedules awaiting payment.")).toBeNull();
  });

  it("preserves an explicitly quoted vendor name", () => {
    expect(paymentScheduleLookupQuery('Find the schedule for "E2E Scheduled Test Vendor".')).toBe("E2E Scheduled Test Vendor");
  });
});
