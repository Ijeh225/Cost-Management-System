import { describe, expect, it } from "vitest";
import { GATE_EVENTS, gateEventError, type GateEvent, type GateEventContainer } from "../lib/gate-events.js";

const date = new Date("2026-09-07T10:00:00Z");
const ready: GateEventContainer = {
  status: "shipping", paarNumber: "PAAR-QA", paarReleasedAt: date,
  transireReleasedAt: date, doReleasedAt: date, tdoReleasedAt: date,
  pulloutReleasedAt: date, gateInDate: null, gateOutDate: null,
  emptyGateInDate: null, emptyGateOutDate: null,
};

describe("gate event invariants", () => {
  it.each(["paarNumber", "paarReleasedAt", "transireReleasedAt", "doReleasedAt", "tdoReleasedAt", "pulloutReleasedAt"] as const)("requires %s even at Shipping", field => {
    expect(gateEventError({ ...ready, [field]: null }, "gate-in")?.missingStages?.length).toBeGreaterThan(0);
  });

  it("requires a nonblank PAAR and allows complete releases", () => {
    expect(gateEventError({ ...ready, paarNumber: "  " }, "gate-in")?.missingStages).toContain("Documentation / PAAR");
    expect(gateEventError(ready, "gate-in")).toBeNull();
  });

  it.each(Object.keys(GATE_EVENTS) as GateEvent[])("rejects duplicate %s before changing anything", event => {
    const field = GATE_EVENTS[event].field;
    expect(gateEventError({ ...ready, [field]: date }, event)?.error).toContain("already been recorded");
  });

  it("requires the complete loaded/empty sequence", () => {
    expect(gateEventError(ready, "gate-out")?.error).toContain("Gate-In must");
    expect(gateEventError(ready, "empty-gate-in")?.error).toContain("Gate-In must");
    const entered = { ...ready, gateInDate: date };
    expect(gateEventError(entered, "gate-out")).toBeNull();
    expect(gateEventError(entered, "empty-gate-in")?.error).toContain("Gate-Out must");
    const exited = { ...entered, gateOutDate: date };
    expect(gateEventError(exited, "empty-gate-in")).toBeNull();
    expect(gateEventError(exited, "empty-gate-out")?.error).toContain("Empty Gate-In must");
    expect(gateEventError({ ...exited, emptyGateInDate: date }, "empty-gate-out")).toBeNull();
  });

  it("does not silently fill gaps in inconsistent historical movement records", () => {
    expect(gateEventError({ ...ready, gateOutDate: date }, "gate-in")?.error).toContain("Review");
    expect(gateEventError({ ...ready, gateOutDate: date }, "empty-gate-in")?.error).toContain("Gate-In must");
    expect(gateEventError({ ...ready, gateInDate: date, emptyGateInDate: date }, "gate-out")?.error).toContain("Review");
    expect(gateEventError({ ...ready, gateInDate: date, gateOutDate: date, emptyGateOutDate: date }, "empty-gate-in")?.error).toContain("Review");
  });

  it.each(["delivery", "empty_return", "closed"])("does not move %s jobs backwards", status => {
    expect(gateEventError({ ...ready, status }, "gate-in")?.error).toContain("delivery or completion");
  });
});
