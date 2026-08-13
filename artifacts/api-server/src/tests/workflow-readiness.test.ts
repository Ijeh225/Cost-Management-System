import { describe, expect, it } from "vitest";
import { getFinalWorkflowMissingStages, isReadyForFinalWorkflow } from "../lib/workflow-readiness.js";

const completeWorkflow = {
  paarNumber: "PAAR-123",
  paarReleasedAt: new Date("2026-08-01"),
  transireReleasedAt: new Date("2026-08-02"),
  doReleasedAt: new Date("2026-08-03"),
  tdoReleasedAt: new Date("2026-08-04"),
  pulloutReleasedAt: new Date("2026-08-05"),
};

describe("final workflow readiness", () => {
  it("blocks Terminal Manager handover and explains every incomplete department", () => {
    const missing = getFinalWorkflowMissingStages({
      ...completeWorkflow,
      paarReleasedAt: null,
      transireReleasedAt: null,
      doReleasedAt: null,
    });

    expect(missing).toEqual(["Documentation / PAAR", "Transire release", "Shipping / DO release"]);
    expect(isReadyForFinalWorkflow({ ...completeWorkflow, pulloutReleasedAt: null })).toBe(false);
  });

  it("allows final workflow only after every required release is recorded", () => {
    expect(getFinalWorkflowMissingStages(completeWorkflow)).toEqual([]);
    expect(isReadyForFinalWorkflow(completeWorkflow)).toBe(true);
  });
});
