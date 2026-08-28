export type DepartmentStageOwnerField =
  | "stageOwner"
  | "transireStageOwner"
  | "shippingStageOwner"
  | "terminalStageOwner"
  | "pulloutStageOwner";

type StageOwnerValues = Partial<Record<DepartmentStageOwnerField, string | null | undefined>>;

const OWNER_FIELD_BY_STAGE: Record<string, DepartmentStageOwnerField> = {
  transire_processing: "transireStageOwner",
  shipping: "shippingStageOwner",
  terminal: "terminalStageOwner",
  pull_out: "pulloutStageOwner",
};

export function stageOwnerFieldFor(stage: string): DepartmentStageOwnerField {
  return OWNER_FIELD_BY_STAGE[stage] ?? "stageOwner";
}

export function stageOwnerFor(
  stage: string,
  owners: StageOwnerValues,
): string | null {
  return owners[stageOwnerFieldFor(stage)] ?? null;
}
