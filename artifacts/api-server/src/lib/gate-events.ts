import { getFinalWorkflowMissingStages, type FinalWorkflowReadinessInput } from "./workflow-readiness.js";

export const GATE_EVENTS = {
  "gate-in": { field: "gateInDate", label: "Gate-In", type: "gate_in" },
  "gate-out": { field: "gateOutDate", label: "Gate-Out", type: "gate_out" },
  "empty-gate-in": { field: "emptyGateInDate", label: "Empty Gate-In", type: "empty_gate_in" },
  "empty-gate-out": { field: "emptyGateOutDate", label: "Empty Gate-Out", type: "empty_gate_out" },
} as const;

export type GateEvent = keyof typeof GATE_EVENTS;
type GateTimestamp = Date | string | null;
export type GateEventContainer = FinalWorkflowReadinessInput & {
  status: string;
  gateInDate: GateTimestamp;
  gateOutDate: GateTimestamp;
  emptyGateInDate: GateTimestamp;
  emptyGateOutDate: GateTimestamp;
};

export function gateEventError(container: GateEventContainer, event: GateEvent): { error: string; missingStages?: string[] } | null {
  const config = GATE_EVENTS[event];
  if (container[config.field]) return { error: `${config.label} has already been recorded for this container` };

  if (event === "gate-in") {
    if (container.gateOutDate || container.emptyGateInDate || container.emptyGateOutDate) {
      return { error: "Later gate events already exist. Review the movement history before recording Gate-In." };
    }
    const missingStages = getFinalWorkflowMissingStages(container);
    if (missingStages.length) return { error: `Cannot record Gate-In. Complete: ${missingStages.join(", ")}.`, missingStages };
    if (["delivery", "empty_return", "closed"].includes(container.status)) {
      return { error: "Gate-In cannot be recorded after the job has moved to delivery or completion." };
    }
    return null;
  }

  if (!container.gateInDate) return { error: `Gate-In must be recorded before ${config.label}` };
  if (event !== "gate-out" && !container.gateOutDate) {
    return { error: `Gate-Out must be recorded before ${config.label}` };
  }
  if (event === "gate-out" && (container.emptyGateInDate || container.emptyGateOutDate)) {
    return { error: "Empty gate events already exist. Review the movement history before recording Gate-Out." };
  }
  if (event === "empty-gate-in" && container.emptyGateOutDate) {
    return { error: "Empty Gate-Out already exists. Review the movement history before recording Empty Gate-In." };
  }
  if (event === "empty-gate-out" && !container.emptyGateInDate) {
    return { error: "Empty Gate-In must be recorded before Empty Gate-Out" };
  }
  return null;
}
