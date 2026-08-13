import { describe, expect, it } from "vitest";
import { exceedsApprovedPaymentBalance, exceedsOverheadPaymentBalance, isScheduleReadyToComplete } from "../lib/payment-rules.js";

describe("payment rules", () => {
  it("allows a payment up to the remaining approved amount and rejects overpayment", () => {
    expect(exceedsApprovedPaymentBalance(400_000, 600_000, 1_000_000)).toBe(false);
    expect(exceedsApprovedPaymentBalance(400_000, 600_000.01, 1_000_000)).toBe(true);
  });

  it("protects an overhead expense from being paid above its outstanding balance", () => {
    expect(exceedsOverheadPaymentBalance(60_000, 100_000, 40_000)).toBe(false);
    expect(exceedsOverheadPaymentBalance(60_000.01, 100_000, 40_000)).toBe(true);
  });

  it("only completes a schedule once the approved amount has been paid", () => {
    expect(isScheduleReadyToComplete(999_999.99, 1_000_000)).toBe(false);
    expect(isScheduleReadyToComplete(1_000_000, 1_000_000)).toBe(true);
  });
});
