import { describe, expect, it } from "vitest";
import { getReversibleOverpaymentCredit } from "../lib/invoice-payment-reversal.js";

describe("invoice payment reversals", () => {
  it("reverses only the part of a payment that created client credit", () => {
    expect(getReversibleOverpaymentCredit(2_000, 2_000, 1)).toBe(1);
    expect(getReversibleOverpaymentCredit(2_000, 1_000, 1_000)).toBe(0);
    expect(getReversibleOverpaymentCredit(2_000, 2_500, 100)).toBe(100);
  });
});
