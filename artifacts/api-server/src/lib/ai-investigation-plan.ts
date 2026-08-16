import { AiQuestionUnderstanding } from "./ai-question-understanding.js";

export type AiInvestigationStep = {
  toolId: "container_lookup" | "container_documents" | "container_payment_history";
  label: string;
};

export type AiInvestigationPlan = {
  id: "container_delay_investigation";
  title: string;
  containerNumber: string;
  steps: AiInvestigationStep[];
};

/**
 * Produces only a fixed, permission-safe read plan. It intentionally does not
 * let a provider select arbitrary database operations or add new tool calls.
 */
export function buildAiInvestigationPlan(understanding: AiQuestionUnderstanding): AiInvestigationPlan | null {
  if (!understanding.containerNumber || (understanding.intent !== "investigate" && !understanding.asksForDelays)) {
    return null;
  }

  return {
    id: "container_delay_investigation",
    title: "Container delay investigation",
    containerNumber: understanding.containerNumber,
    steps: [
      { toolId: "container_lookup", label: "Check workflow, stage dates, PAAR, and berthing" },
      { toolId: "container_documents", label: "Check attached supporting documents" },
      { toolId: "container_payment_history", label: "Check recorded container payments" },
    ],
  };
}
