export type FinalWorkflowReadinessInput = {
  paarNumber: string | null;
  paarReleasedAt: Date | string | null;
  transireReleasedAt: Date | string | null;
  doReleasedAt: Date | string | null;
  tdoReleasedAt: Date | string | null;
  pulloutReleasedAt: Date | string | null;
};

export function getFinalWorkflowMissingStages(container: FinalWorkflowReadinessInput): string[] {
  const missing: string[] = [];

  if (!container.paarNumber?.trim() || !container.paarReleasedAt) missing.push("Documentation / PAAR");
  if (!container.transireReleasedAt) missing.push("Transire release");
  if (!container.doReleasedAt) missing.push("Shipping / DO release");
  if (!container.tdoReleasedAt) missing.push("Terminal / TDO release");
  if (!container.pulloutReleasedAt) missing.push("Pullout release");

  return missing;
}

export function isReadyForFinalWorkflow(container: FinalWorkflowReadinessInput): boolean {
  return getFinalWorkflowMissingStages(container).length === 0;
}
