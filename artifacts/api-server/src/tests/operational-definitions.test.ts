import { describe, expect, it } from "vitest";
import { getDeliveryCounts, getOperationalStatusCounts, isContainerPhysicallyInTerminal, operationalStageLabel } from "../lib/operational-definitions.js";

describe("operational business definitions", () => {
  it("partitions delivered and undelivered independently of workflow closure", () => {
    const rows = [
      { status: "registered", deliveredAt: new Date("2026-09-09") },
      { status: "pending_verification", deliveredAt: null },
      { status: "closed", deliveredAt: new Date("2026-09-08") },
      { status: "closed", deliveredAt: null },
    ];
    const counts = getDeliveryCounts(rows);
    expect(counts).toEqual({ completed: 2, inProgress: 2 });
    expect(counts.completed + counts.inProgress).toBe(rows.length);
    expect(rows[0].status).toBe("registered");
    expect(rows[3].deliveredAt).toBeNull();
  });

  it("handles empty scopes and delivery correction without overlapping counts", () => {
    expect(getDeliveryCounts([])).toEqual({ completed: 0, inProgress: 0 });
    expect(getDeliveryCounts([{ deliveredAt: "2026-09-09" }])).toEqual({ completed: 1, inProgress: 0 });
    expect(getDeliveryCounts([{ deliveredAt: null }])).toEqual({ completed: 0, inProgress: 1 });
  });
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
