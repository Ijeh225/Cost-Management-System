export type AiRolloutStage = "super_admin_only" | "selected_admins" | "all_authorized_admins";

export function canUseAiAssistantRollout(input: {
  userId: number;
  role: string;
  rolloutStage: AiRolloutStage;
  selectedAdminUserIds: number[];
}): boolean {
  if (input.role === "super_admin") return true;
  if (input.role !== "admin") return false;
  if (input.rolloutStage === "all_authorized_admins") return true;
  return input.rolloutStage === "selected_admins" && input.selectedAdminUserIds.includes(input.userId);
}
