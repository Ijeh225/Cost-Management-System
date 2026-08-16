import { describe, expect, it } from "vitest";
import { buildAiInvestigationPlan } from "../lib/ai-investigation-plan.js";
import { understandAiQuestion } from "../lib/ai-question-understanding.js";

describe("AI investigation plans", () => {
  it("builds the fixed read-only investigation plan for an exact delayed container", () => {
    const plan = buildAiInvestigationPlan(understandAiQuestion("Why is ABCD1234567 delayed?"));
    expect(plan).toMatchObject({
      id: "container_delay_investigation",
      containerNumber: "ABCD1234567",
      steps: [
        { toolId: "container_lookup" },
        { toolId: "container_documents" },
        { toolId: "container_payment_history" },
      ],
    });
  });

  it("does not create a multi-step plan without an exact container or investigation question", () => {
    expect(buildAiInvestigationPlan(understandAiQuestion("Show all overdue containers"))).toBeNull();
    expect(buildAiInvestigationPlan(understandAiQuestion("Show documents for ABCD1234567"))).toBeNull();
  });
});
