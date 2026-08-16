import { describe, expect, it } from "vitest";
import { getOperationalStatusCounts, isContainerPhysicallyInTerminal, operationalStageLabel } from "../lib/operational-definitions.js";

describe("operational business definitions", () => {
  it("counts only physical terminal statuses that have not gate-out", () => {
    expect(isContainerPhysicallyInTerminal({ status: "gate_in", gateOutDate: null })).toBe(true);
    expect(isContainerPhysicallyInTerminal({ status: "examination", gateOutDate: null })).toBe(true);
    expect(isContainerPhysicallyInTerminal({ status: "final_release", gateOutDate: null })).toBe(true);
    expect(isContainerPhysicallyInTerminal({ status: "gate_in", gateOutDate: new Date() })).toBe(false);
    expect(isContainerPhysicallyInTerminal({ status: "terminal", gateOutDate: null })).toBe(false);
    expect(isContainerPhysicallyInTerminal({ status: "pull_out", gateOutDate: null })).toBe(false);
  });

  it("keeps each workflow status in its own count", () => {
    expect(getOperationalStatusCounts([
      { status: "pull_out" }, { status: "pull_out" }, { status: "gate_in" },
    ])).toEqual({ pull_out: 2, gate_in: 1 });
  });

  it("uses one approved label for each operational stage", () => {
    expect(operationalStageLabel("pull_out")).toBe("Awaiting Pullout");
    expect(operationalStageLabel("gate_in")).toBe("Gate-In");
    expect(operationalStageLabel("final_release")).toBe("Final Release");
  });
});
