import { describe, expect, it } from "vitest";
import { settlementAmount, settlementRequestKey } from "../lib/invoice-cash";

describe("settlement inputs", () => {
  it("accepts only positive, finite two-decimal currency values", () => {
    for (const value of [1, 0.01, "12.30", " 12.30 "]) expect(settlementAmount(value)).not.toBeNull();
    for (const value of [0, -1, 0.001, "1.001", "10junk", "Infinity", Infinity, NaN, null, true, {}, "1e3", ""]) {
      expect(settlementAmount(value)).toBeNull();
    }
    expect(settlementAmount("12.30")).toBe(12.3);
  });
  it("allows optional retry keys but rejects malformed or oversized keys", () => {
    expect(settlementRequestKey(undefined)).toBeNull();
    expect(settlementRequestKey(null)).toBeNull();
    expect(settlementRequestKey("retry-key_2026")).toBe("retry-key_2026");
    for (const key of ["", "short", "bad key with space", "x".repeat(129), 123]) expect(settlementRequestKey(key)).toBe(false);
  });
});
