import { describe, expect, it } from "vitest";
import { buildAiAnswerPresentation } from "../lib/ai-answer-presentation.js";

describe("AI answer presentation", () => {
  it("turns verified facts and recorded blockers into a concise answer structure", () => {
    const presentation = buildAiAnswerPresentation({
      facts: [{ label: "Attached documents", value: 2 }, { label: "PAAR", value: "Not recorded" }, { label: "Total paid", value: "₦0.00" }],
      notes: ["Potential blocker: PAAR is not recorded.", "Recorded transire delay reason: Shipping line has not released documents."],
      recordCount: 2,
      noData: false,
    });

    expect(presentation.keyFindings).toEqual(["Attached documents: 2", "PAAR: Not recorded"]);
    expect(presentation.recordedCauses).toEqual(["Potential blocker: PAAR is not recorded.", "Recorded transire delay reason: Shipping line has not released documents."]);
    expect(presentation.recommendations).toContain("Resolve the recorded blocker, then update the normal workflow record.");
    expect(presentation.recommendations).toContain("Open the cited record(s) below to confirm the live details before acting.");
  });

  it("states the evidence limitation when no data is returned", () => {
    expect(buildAiAnswerPresentation({ facts: [], notes: [], recordCount: 0, noData: true }).limitations).toEqual([
      "No matching source records were returned in your current authorised branch scope.",
    ]);
  });
});
