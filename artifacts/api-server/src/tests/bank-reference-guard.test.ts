import { describe, expect, it } from "vitest";
import { hasExistingBankReference, normaliseBankReference } from "../lib/bank-reference-guard.js";

describe("bank reference guard", () => {
  it("accepts a new non-empty reference when neither movement query has a match", () => {
    expect(normaliseBankReference("  E2E-BANK-001  ")).toBe("E2E-BANK-001");
    expect(hasExistingBankReference([], [])).toBe(false);
  });

  it("rejects a reference when either movement source contains a match", () => {
    expect(hasExistingBankReference([{ id: 1 }], [])).toBe(true);
    expect(hasExistingBankReference([], [{ id: 1 }])).toBe(true);
  });

  it("keeps blank optional references outside duplicate-reference enforcement", () => {
    expect(normaliseBankReference("   ")).toBeNull();
    expect(normaliseBankReference(undefined)).toBeNull();
  });
});
