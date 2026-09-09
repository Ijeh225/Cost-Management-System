import { describe, expect, it } from "vitest";
import type { Container } from "@workspace/db";
import { buildJobOverview, prioritizeTasks, taskBucket } from "../lib/job-overview.js";

const now = new Date("2026-09-09T23:10:00Z"); // Already September 10 in Lagos.
const visit = { id: 32, status: "shipping", stageOwner: "Legacy", transireStageOwner: "Transire only",
  shippingStageOwner: null, terminalStageOwner: "Terminal only", verifiedAt: new Date(), paarNumber: "PAAR",
  paarReleasedAt: new Date(), transireReleasedAt: new Date(), doReleasedAt: null, tdoReleasedAt: null,
  pulloutReleasedAt: null, deliveredAt: null, gateOutDate: null, delayReason: null } as Container;

describe("CAP-01 shared job and work-date rules", () => {
  it("uses Lagos calendar days, including UTC midnight crossover", () => {
    expect(taskBucket("2026-09-09T22:59:00Z", now)).toBe("overdue");
    expect(taskBucket("2026-09-10T00:00:00Z", now)).toBe("today");
    expect(taskBucket("2026-09-11", now)).toBe("upcoming");
    expect(taskBucket(null, now)).toBe("undated");
    expect(taskBucket("bad-date", now)).toBe("undated");
  });
  it("shows every open task once, excludes completed/cancelled and preserves source IDs", () => {
    const task = (id: number, dueDate: string | null, priority = "medium", status = "pending") => ({ id, dueDate: dueDate ? new Date(dueDate) : null, priority, status });
    const rows = [task(1, "2026-09-11"), task(2, null), task(3, "2026-09-10"), task(4, "2026-09-09"),
      task(5, "2026-09-09", "urgent"), task(6, null, "urgent", "completed"), task(7, null, "high", "cancelled")];
    expect(prioritizeTasks(rows, now).map(t => t.id)).toEqual([5, 4, 3, 2, 1]);
    expect(rows).toHaveLength(7);
  });
  it("never copies the generic owner into another department", () => {
    const result = buildJobOverview(visit);
    expect(result.nextAction.owner).toBeNull();
    expect(result.milestones.find(m => m.key === "transire")?.owner).toBe("Transire only");
    expect(result.milestones.find(m => m.key === "terminal")?.owner).toBe("Terminal only");
    expect(result.milestones.find(m => m.key === "shipping")?.owner).toBeNull();
  });
  it("parallel completion does not imply physical presence, delivery or closure", () => {
    const result = buildJobOverview({ ...visit, doReleasedAt: new Date(), tdoReleasedAt: new Date(), pulloutReleasedAt: new Date() });
    expect(result.missingFinalPrerequisites).toEqual([]);
    expect(result.physical.inTerminal).toBe(false);
    expect(result.physical.deliveredAt).toBeNull();
    expect(result.physical.closed).toBe(false);
  });
  it("uses canonical gate presence and separates delivery from closure", () => {
    expect(buildJobOverview({ ...visit, status: "gate_in" }).physical.inTerminal).toBe(true);
    const result = buildJobOverview({ ...visit, status: "gate_in", gateOutDate: new Date(), deliveredAt: new Date() });
    expect(result.physical.inTerminal).toBe(false);
    expect(result.physical.closed).toBe(false);
  });
  it("keeps missing prerequisites distinct from explicitly recorded blockers", () => {
    const result = buildJobOverview({ ...visit, doDelayReason: "Awaiting line release", delayReason: "Confirm job reference" });
    expect(result.blockers).toContain("Shipping / DO: Awaiting line release");
    expect(result.missingFinalPrerequisites).toContain("Shipping / DO release");
    expect(result).not.toHaveProperty("tasks");
  });
});
