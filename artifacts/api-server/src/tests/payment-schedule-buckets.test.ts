import { describe, expect, it } from "vitest";
import { getPaymentScheduleBucket } from "../lib/payment-schedule-buckets.js";

const today = new Date("2026-09-04T00:00:00");

describe("payment schedule buckets", () => {
  it("keeps an overdue open schedule out of today's queue", () => {
    expect(getPaymentScheduleBucket(new Date("2026-08-27T12:00:00"), "approved", today)).toBe("overdue");
  });

  it("separates exact today, tomorrow, and future schedules", () => {
    expect(getPaymentScheduleBucket(new Date("2026-09-04T12:00:00"), "pending_approval", today)).toBe("today");
    expect(getPaymentScheduleBucket(new Date("2026-09-05T12:00:00"), "pending_approval", today)).toBe("tomorrow");
    expect(getPaymentScheduleBucket(new Date("2026-09-06T12:00:00"), "pending_approval", today)).toBe("upcoming");
  });
});
