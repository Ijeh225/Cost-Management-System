import { describe, expect, it } from "vitest";
import { creditNoteSplit, financialDateBoundary, financialDateKey } from "../lib/financial-reporting";

describe("credit-note currency allocation", () => {
  it("separates gross credit from net revenue and VAT", () => {
    expect(creditNoteSplit(107.5, 1075, 75)).toEqual({ amount: 107.5, netAmount: 100, vatAmount: 7.5 });
  });
  it("does not invent VAT on a zero-VAT invoice", () => {
    expect(creditNoteSplit(700, 1000, 0)).toEqual({ amount: 700, netAmount: 700, vatAmount: 0 });
  });
  it("allocates fractional VAT across notes without a rounding remainder", () => {
    const notes = [creditNoteSplit(0.03, 0.1, 0.01), creditNoteSplit(0.03, 0.1, 0.01, 0.03), creditNoteSplit(0.04, 0.1, 0.01, 0.06)];
    expect(notes.map(note => note.vatAmount)).toEqual([0, 0.01, 0]);
    expect(notes.map(note => note.netAmount)).toEqual([0.03, 0.02, 0.04]);
  });
  it("uses the invoice VAT amount, not a guessed current tax rate", () => {
    expect(creditNoteSplit(100, 1200, 200)).toEqual({ amount: 100, netAmount: 83.33, vatAmount: 16.67 });
  });
});

describe("Lagos financial periods", () => {
  it("includes the first Lagos hour even when UTC is the preceding day", () => {
    expect(financialDateBoundary("2026-10-01").toISOString()).toBe("2026-09-30T23:00:00.000Z");
    expect(financialDateBoundary("2026-10-01", true).toISOString()).toBe("2026-10-01T22:59:59.999Z");
    expect(financialDateKey(new Date("2026-09-30T23:15:00Z"))).toBe("2026-10-01");
  });
  it("rejects invalid calendar dates rather than silently normalising them", () => {
    for (const value of ["2026-02-30", "2026-13-01", "bad", "2026-01-01T00:00:00Z"]) expect(Number.isNaN(financialDateBoundary(value).getTime())).toBe(true);
  });
});
