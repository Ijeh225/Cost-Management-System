import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStageNotes } from "../lib/api-client-react/src/stage-notes-response.ts";
import { summarizeInvoices } from "../artifacts/cost-analysis/src/lib/invoice-summary.ts";
import { getInvoiceFinancialEffect } from "../artifacts/api-server/src/lib/invoice-status.ts";

describe("stage note response validation", () => {
  const note = { id: 1, containerId: 31, authorId: 2, authorName: "QA", stage: "documentation", note: "Saved", createdAt: "2026-09-08T12:00:00Z" };
  it("accepts empty and populated note arrays", () => {
    assert.deepEqual(parseStageNotes([]), []);
    assert.deepEqual(parseStageNotes([note]), [note]);
  });
  for (const value of ["<!doctype html><html>Fallback</html>", null, {}, { notes: [] }, [null], ["bad"], [{ ...note, note: {} }], [{ ...note, createdAt: "invalid" }]]) {
    it(`rejects malformed data instead of presenting a count or crashing: ${JSON.stringify(value)}`, () => {
      assert.throws(() => parseStageNotes(value), /Stage notes could not be loaded/);
    });
  }
});

describe("invoice summary populations", () => {
  it("separates the observed 180 draft value from 1000 issued outstanding", () => {
    assert.deepEqual(summarizeInvoices([
      { status: "draft", total: 180, totalPaid: 0, outstanding: 180 },
      { status: "sent", total: 1000, totalPaid: 0, outstanding: 1000 },
      { status: "cancelled", total: 500, totalPaid: 0, outstanding: 500 },
      { status: "written_off", total: 500, totalPaid: 0, outstanding: 500 },
    ]), { issuedOutstanding: 1000, draftValue: 180, totalPaid: 0, paidCount: 0, overdueCount: 0 });
  });
  for (const status of ["draft", "sent", "partial", "paid", "overdue", "cancelled", "written_off"]) {
    it(`matches the canonical API financial effect for ${status}`, () => {
      const total = 100, totalPaid = 30;
      const summary = summarizeInvoices([{ status, total, totalPaid, outstanding: total - totalPaid }]);
      const effect = getInvoiceFinancialEffect(status, total, totalPaid);
      assert.equal(summary.issuedOutstanding, effect.outstanding);
      assert.equal(summary.totalPaid, effect.paid);
    });
  }
  it("handles no invoices, zero drafts, paid and overdue counts", () => {
    assert.deepEqual(summarizeInvoices([]), { issuedOutstanding: 0, draftValue: 0, totalPaid: 0, paidCount: 0, overdueCount: 0 });
    assert.deepEqual(summarizeInvoices([
      { status: "draft", total: 0, totalPaid: 0, outstanding: 0 },
      { status: "paid", total: 100, totalPaid: 100, outstanding: 0 },
      { status: "overdue", total: 100, totalPaid: 30, outstanding: 70 },
    ]), { issuedOutstanding: 70, draftValue: 0, totalPaid: 130, paidCount: 1, overdueCount: 1 });
  });
});
