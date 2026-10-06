import { describe, expect, it } from "vitest";
import { suggestFields } from "../lib/document-readiness.js";

const fields = (text: string) => Object.fromEntries(suggestFields([{ page: 1, text, confidence: 70 }]).map(f => [f.field, f.value]));

describe("CAP02-OCR-001 conservative amount suggestions", () => {
  it.each([
    "TAX TOTAL: 1.26", "Subtotal: M31 70", "Sub-total: 44.94", "Total GST @6%: 1.26",
    "Total quantity 14", "Total Items: 12", "TOTAL a8 20\nTAX TOTAL: 1.26",
    "Subtotal: 31.70\nGST: 2.09\nCash Paid: 8.00", "Total: M31 70",
    "Amount: 12O.00", "Amount: 36.9%", "Total: 79.09 2.11", "Total: 1,23.00",
    "Total: 36.96abc", "Amount: -500.00", "Total: 100.001", "Total: 50 NGN USD",
    "GST Summary\nCode Amount\nTOTAL: 1.26", "Tax breakdown\nAmount: 1.26",
  ])("does not invent a total from %s", text => expect(fields(text).amount).toBeUndefined());

  it.each([
    ["Subtotal: 31.70\nGST: 2.09\nTotal RM36 . 96", "RM36.96"],
    ["Tax Total: 1.26\nGrand Total: NGN 46.20", "NGN 46.20"],
    ["Total Payable: 59.31", "59.31"],
    ["Amount Due = NGN 1,250.50", "NGN 1,250.50"],
    ["TOTAL: 0.00", "0.00"],
    ["Total Inclusive GST: 193.00\nTOTAL: 193.00", "193.00"],
    ["Amount: NGN500.00\nTOTAL: 500.00", "NGN500.00"],
    ["Amount: 500.00 NGN", "500.00 NGN"],
    ["Total: 46.20\nGST Summary\nTotal: 1.26", "46.20"],
  ])("extracts a fully valid labelled value: %s", (text, expected) => expect(fields(text).amount).toBe(expected));

  it("abstains from conflicting amounts/currencies across pages", () => {
    for (const second of ["Total: NGN600.00", "Total: USD500.00", "Total: unreadable"]) {
      expect(suggestFields([{ page: 1, text: "Total: NGN500.00" }, { page: 2, text: second }])
        .find(f => f.field === "amount")).toBeUndefined();
    }
  });
});

describe("CAP02-OCR-002 conservative date suggestions", () => {
  it.each([
    ["Date: 12/10/2017 [IME : Vedi od", "12/10/2017"],
    ["Date $15/01/2019 11:05:16 AM", "15/01/2019"],
    ["Date 09/02/2018 10:05", "09/02/2018"],
    ["Receipt #: CS00123488 DATE: 29/01/2018", "29/01/2018"],
    ["20/03/18 17:19 0000004001428", "20/03/18"],
    ["04:34 PM 562004 07-02-17", "07-02-17"],
    ["Issued on: 2024-02-29", "2024-02-29"],
    ["Date: 2026-10-05 Due Date: 2026-11-05", "2026-10-05"],
    ["Expiry Date: 2027-10-05\nInvoice Date: 2026-10-05", "2026-10-05"],
  ])("isolates the date without line-tail contamination: %s", (text, expected) => expect(fields(text).date).toBe(expected));

  it.each([
    "Date:07/02/i% ieiia", "Date : ANA 9:29:44 AM", "Date: 2026-02-30",
    "Date: 2025-02-29", "Date: 31/04/2026", "Date: 32/01/2026", "Date: 05/13/2026",
    "Date: 0/01/2026", "Date: 2026-00-01", "Date: 2026-10/05", "Date: 2026-10-05abc",
    "Date: 12/10/20177", "Date: 2026-10-05/22", "Due Date: 2026-10-05",
    "Date: 16/03/2017\nDD: 16/08/2017", "Date: unknown\n21/12/16",
    "Expiry Date: 2027-10-05\nDelivery Date: 2026-10-05",
  ])("abstains on invalid, conflicting or non-document dates: %s", text => expect(fields(text).date).toBeUndefined());

  it("preserves source provenance, repeated date consensus and mandatory review", () => {
    const result = suggestFields([{ page: 2, text: "Date: 2026-10-05\nTotal: NGN500.00", confidence: 45 },
      { page: 3, text: "Date: 05/10/2026\nTotal: NGN500.00", confidence: 90 }]);
    expect(result).toEqual([
      { field: "amount", value: "NGN500.00", page: 2, confidence: 45, requiresReview: true },
      { field: "date", value: "2026-10-05", page: 2, confidence: 45, requiresReview: true },
    ]);
    expect(suggestFields([{ page: 1, text: "Date: 2026-10-05" }, { page: 2, text: "Date: 2026-10-06" }])).toEqual([]);
  });
});
