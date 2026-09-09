import type { Container, ContainerTask } from "@workspace/db";
import { stageOwnerFor } from "./department-stage-owners.js";
import { getFinalWorkflowMissingStages } from "./workflow-readiness.js";
import { isContainerPhysicallyInTerminal, operationalStageLabel } from "./operational-definitions.js";

export function localWorkDate(value: Date | string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function taskBucket(due: Date | string | null, now = new Date()) {
  if (!due || Number.isNaN(new Date(due).getTime())) return "undated" as const;
  const day = localWorkDate(due), today = localWorkDate(now);
  return day < today ? "overdue" as const : day === today ? "today" as const : "upcoming" as const;
}

export function prioritizeTasks<T extends Pick<ContainerTask, "id" | "status" | "priority" | "dueDate">>(tasks: T[], now = new Date()) {
  const order = { overdue: 0, today: 1, undated: 2, upcoming: 3 };
  const priorities: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return tasks.filter(t => !["completed", "cancelled"].includes(t.status)).map(t => ({ ...t, bucket: taskBucket(t.dueDate, now) }))
    .sort((a, b) => order[a.bucket] - order[b.bucket]
      || (priorities[a.priority] ?? 2) - (priorities[b.priority] ?? 2)
      || (a.dueDate ? new Date(a.dueDate).getTime() : Infinity) - (b.dueDate ? new Date(b.dueDate).getTime() : Infinity)
      || a.id - b.id);
}

export function buildJobOverview(c: Container) {
  const milestone = (key: string, label: string, owner: string | null, expected: Date | null, actual: Date | null, delay: string | null, href: string) => ({
    key, label, owner, expected, actual, delay, href,
    state: actual ? "recorded" : delay?.trim() ? "blocked" : "pending",
  });
  const milestones = [
    milestone("documentation", "Documentation / PAAR", c.paarOfficer, c.eta, c.paarReleasedAt, c.paarDelayReason, "/documentation"),
    milestone("transire", "Transire", c.transireStageOwner, c.expectedTransireDate, c.transireReleasedAt, c.transireDelayReason, "/workspace/transire"),
    milestone("shipping", "Shipping / DO", c.shippingStageOwner, c.expectedDoDate, c.doReleasedAt, c.doDelayReason, "/workspace/shipping"),
    milestone("terminal", "Terminal / TDO", c.terminalStageOwner, c.expectedTdoDate, c.tdoReleasedAt, c.tdoDelayReason, "/workspace/terminal-ops"),
    milestone("pullout", "Pullout", c.pulloutStageOwner, c.expectedPulloutDate, c.pulloutReleasedAt, c.pulloutDelayReason, "/workspace/pull-out"),
    milestone("release", "Bonded terminal release", null, c.expectedReleaseDate, c.releaseConfirmedAt, c.releaseDelayReason, "/workspace/terminal"),
  ];
  const blockers = milestones.filter(m => m.state === "blocked").map(m => `${m.label}: ${m.delay}`);
  if (!c.verifiedAt) blockers.unshift("Container verification not recorded");
  if (c.delayReason?.trim()) blockers.push(`Current action: ${c.delayReason}`);
  const missing = getFinalWorkflowMissingStages(c);
  // Missing prerequisites are facts, not proof that every parallel department is blocked.
  return {
    containerId: c.id, containerNumber: c.containerNumber, blNumber: c.blNumber,
    clientId: c.clientId, customerName: c.customerName, branchId: c.branchId,
    workflowStage: operationalStageLabel(c.status),
    physical: {
      inTerminal: isContainerPhysicallyInTerminal(c), gateIn: c.gateInDate, gateOut: c.gateOutDate,
      deliveredAt: c.deliveredAt, emptyReturnedAt: c.emptyReturnDate, closed: c.status === "closed",
    },
    milestones, blockers, missingFinalPrerequisites: missing,
    nextAction: { text: c.nextAction, owner: stageOwnerFor(c.status, c), dueAt: c.nextActionDueDate },
    unassignedMilestones: milestones.filter(m => m.key !== "release" && !m.actual && !m.owner?.trim()).length,
  };
}
