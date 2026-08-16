import { describe, expect, it } from "vitest";
import { understandAiQuestion } from "../lib/ai-question-understanding.js";

const NOW = new Date("2026-08-16T12:00:00.000Z");

describe("AI question understanding", () => {
  it("extracts operational intent, stage, release state, and a relative date range", () => {
    expect(understandAiQuestion("How many Shipping jobs were released this month?", NOW)).toMatchObject({
      intent: "count", stage: "shipping", stageStatus: "released",
      timeframe: { label: "this month", from: "2026-08-01", to: "2026-08-31" },
    });
  });

  it("extracts exact container and invoice identifiers without guessing", () => {
    expect(understandAiQuestion("Show documents for ABCD1234567", NOW)).toMatchObject({ containerNumber: "ABCD1234567", asksForDocuments: true });
    expect(understandAiQuestion("What is the status of INV-202606-001?", NOW)).toMatchObject({ invoiceNumber: "INV-202606-001", intent: "status" });
  });

  it("distinguishes an active stage list from a delayed stage review", () => {
    expect(understandAiQuestion("List active Terminal / TDO jobs", NOW)).toMatchObject({ intent: "list", stage: "terminal", stageStatus: "active", asksForDelays: false });
    expect(understandAiQuestion("Which Pullout jobs are overdue this week?", NOW)).toMatchObject({ stage: "pull_out", asksForDelays: true, timeframe: { label: "this week", from: "2026-08-10", to: "2026-08-16" } });
  });
});
