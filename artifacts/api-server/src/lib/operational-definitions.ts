/**
 * Canonical operations definitions shared by dashboards and AI tools.
 * "In Terminal" means the container is physically in the terminal and has
 * not yet been gate-out. It deliberately does not include Pullout.
 */
export const PHYSICAL_TERMINAL_STATUSES = new Set([
  "gate_in",
  "examination",
  "final_release",
]);

export const OPERATIONAL_STAGE_DEFINITIONS = {
  pending_verification: { label: "Awaiting Verification", area: "intake" },
  documentation: { label: "Documentation", area: "early_work" },
  transire_processing: { label: "Transire", area: "early_work" },
  shipping: { label: "Shipping / DO", area: "early_work" },
  terminal: { label: "Terminal / TDO", area: "early_work" },
  pull_out: { label: "Awaiting Pullout", area: "pullout" },
  gate_in: { label: "Gate-In", area: "physical_terminal" },
  examination: { label: "Examination", area: "physical_terminal" },
  final_release: { label: "Final Release", area: "physical_terminal" },
  delivery: { label: "Delivery", area: "delivery" },
  empty_return: { label: "Empty Return", area: "delivery" },
  closed: { label: "Closed", area: "completed" },
} as const;

type TerminalState = {
  status: string;
  gateOutDate?: Date | string | null;
};

export function isContainerPhysicallyInTerminal(container: TerminalState): boolean {
  return PHYSICAL_TERMINAL_STATUSES.has(container.status) && !container.gateOutDate;
}

export function getOperationalStatusCounts(containers: Array<{ status: string }>): Record<string, number> {
  return containers.reduce<Record<string, number>>((counts, container) => {
    counts[container.status] = (counts[container.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function operationalStageLabel(status: string): string {
  return OPERATIONAL_STAGE_DEFINITIONS[status as keyof typeof OPERATIONAL_STAGE_DEFINITIONS]?.label
    ?? status.replace(/_/g, " ");
}
