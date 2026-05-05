import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type PipelineContainer = {
  id: number;
  containerNumber: string;
  blNumber: string;
  customerName: string;
  status: string;
  updatedAt: string;
  daysInStage: number;
  assignedStaffName: string | null;
  stageOwnerName?: string | null;
  nextAction?: string | null;
  nextActionDueAt?: string | null;
  delayReason?: string | null;
  paarNumber?: string | null;
  paarReleasedAt?: string | null;
  paarDelayReason?: string | null;
  duty?: number;
  dutyPaid?: number;
  dutyNotPaid?: number;
  isEarlyStart?: boolean;
  earlyStartReason?: string | null;
  earlyStartAuthorizedAt?: string | null;
  expectedReleaseDate?: string | null;
  releaseConfirmedAt?: string | null;
  releaseDelayReason?: string | null;
  releaseFinalDate?: string | null;
};

export type PipelineResponse = {
  stages: Record<string, PipelineContainer[]>;
  total: number;
};

export function useGetPipeline(options?: { query?: { refetchInterval?: number; enabled?: boolean } }) {
  return useQuery<PipelineResponse>({
    queryKey: ["containers", "pipeline"],
    queryFn: () => customFetch<PipelineResponse>("/api/containers/pipeline"),
    ...(options?.query ?? {}),
  });
}

export function useAdvanceContainerStatus() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: number; status: string }>({
    mutationFn: ({ id, status }) =>
      customFetch(`/api/containers/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
        headers: { "Content-Type": "application/json" },
      }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: [`/api/containers/${id}`] });
      const prev = qc.getQueryData([`/api/containers/${id}`]);
      qc.setQueryData([`/api/containers/${id}`], (old: any) => {
        if (!old?.container) return old;
        return { ...old, container: { ...old.container, status, updatedAt: new Date().toISOString() } };
      });
      qc.setQueryData(["containers", "pipeline"], (old: any) => {
        if (!old?.stages) return old;
        const prevStatus = (prev as any)?.container?.status;
        const stages = { ...old.stages };
        if (prevStatus && stages[prevStatus]) {
          stages[prevStatus] = stages[prevStatus].filter((c: any) => c.id !== id);
        }
        if (!stages[status]) stages[status] = [];
        const container = Object.values(old.stages).flat().find((c: any) => (c as any).id === id);
        if (container) stages[status] = [...stages[status], { ...(container as any), status }];
        return { ...old, stages };
      });
      return { prev, id };
    },
    onError: (_err, { id }, context: any) => {
      if (context?.prev !== undefined) {
        qc.setQueryData([`/api/containers/${id}`], context.prev);
      }
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
    },
    onSettled: (_data, _err, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
    },
  });
}

export type StageControlFields = {
  stageOwner?: string | null;
  nextAction?: string | null;
  nextActionDueDate?: string | null;
  delayReason?: string | null;
};

export function useUpdateStageControl() {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, Error, { id: number } & StageControlFields>({
    mutationFn: ({ id, ...fields }) =>
      customFetch(`/api/containers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type ContainerDeliveryFields = {
  deliveredAt: string | null;
  deliveredAtEstimated: boolean;
};

export type UpdateDeliveredAtRequest = {
  deliveredAt: string | null;
};

export function useUpdateDeliveredAt() {
  const qc = useQueryClient();
  return useMutation<ContainerDeliveryFields & Record<string, unknown>, Error, { id: number; deliveredAt: string | null }>({
    mutationFn: ({ id, deliveredAt }) =>
      customFetch(`/api/containers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ deliveredAt }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["analytics", "deliveries"] });
    },
  });
}

export type DeliveryExecutionFields = {
  deliveryTime?: string | null;
  deliveryLocation?: string | null;
  truckNumber?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  dispatchOfficer?: string | null;
  deliveryStatus?: "pending" | "in_transit" | "delivered";
  offloadingConfirmed?: boolean;
  emptyReturnDueDate?: string | null;
  emptyReturnDate?: string | null;
  deliveredAt?: string | null;
  deliveredAtEstimated?: boolean;
};

export function useUpdateDeliveryExecution() {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, Error, { id: number } & DeliveryExecutionFields>({
    mutationFn: ({ id, ...fields }) =>
      customFetch(`/api/containers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["analytics", "deliveries"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useVerifyContainer() {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, Error, { id: number }>({
    mutationFn: ({ id }) =>
      customFetch(`/api/containers/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type PaarStatusItem = {
  id: number;
  containerNumber: string;
  blNumber: string;
  customerName: string;
  status: string;
  paarOfficer: string | null;
  paarReleasedAt: string | null;
  paarDelayReason: string | null;
  createdAt: string;
};

export type PaarStatusResponse = {
  containers: PaarStatusItem[];
  total: number;
};

export function useGetPaarStatus(options?: { query?: { refetchInterval?: number; enabled?: boolean } }) {
  return useQuery<PaarStatusResponse>({
    queryKey: ["containers", "paar-status"],
    queryFn: () => customFetch<PaarStatusResponse>("/api/containers/paar-status"),
    ...(options?.query ?? {}),
  });
}

export type PaarFields = {
  paarNumber?: string | null;
  paarOfficer?: string | null;
  paarReleasedAt?: string | null;
  paarDelayReason?: string | null;
};

export type DocumentationCardFields = {
  stageOwner?: string | null;
  nextAction?: string | null;
  nextActionDueDate?: string | null;
  delayReason?: string | null;
  paarNumber?: string | null;
  paarReleasedAt?: string | null;
  paarDelayReason?: string | null;
};

export function useUpdateDocumentationCard() {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, Error, { id: number } & DocumentationCardFields>({
    mutationFn: ({ id, ...fields }) =>
      customFetch(`/api/containers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
    },
  });
}

export function useUpdatePaar() {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, Error, { id: number } & PaarFields>({
    mutationFn: ({ id, ...fields }) =>
      customFetch(`/api/containers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(fields),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["containers", "paar-status"] });
    },
  });
}

export type ConfirmBerthingRequest = {
  sendWhatsApp?: boolean;
};

export type ConfirmBerthingResponse = {
  container: import("./generated/api.schemas").Container;
  whatsappResult: { success: boolean; sid?: string; error?: string } | null;
};

export function useConfirmBerthing() {
  const qc = useQueryClient();
  return useMutation<ConfirmBerthingResponse, Error, { id: number } & ConfirmBerthingRequest>({
    mutationFn: ({ id, ...data }) =>
      customFetch<ConfirmBerthingResponse>(`/api/containers/${id}/confirm-berthing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export type CheckDuplicatesRequest = {
  containerNumbers: string[];
  blNumbers: string[];
};

export type CheckDuplicatesResult = {
  existingContainerNumbers: string[];
  existingBlNumbers: string[];
};

export function useCheckContainerDuplicates() {
  return useMutation<CheckDuplicatesResult, Error, CheckDuplicatesRequest>({
    mutationFn: (data) =>
      customFetch<CheckDuplicatesResult>("/api/containers/check-duplicates", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" },
      }),
  });
}

export type ContainerExtraCharge = {
  id: number;
  containerId: number;
  section: string;
  label: string;
  amount: number;
  sortOrder: number;
  createdAt: string;
};

const EXTRA_CHARGES_KEY = (containerId: number) => [`/api/containers/${containerId}/extra-charges`] as const;

export function useGetContainerExtraCharges(containerId: number | null) {
  return useQuery<ContainerExtraCharge[]>({
    queryKey: containerId ? EXTRA_CHARGES_KEY(containerId) : [],
    queryFn: () => customFetch<ContainerExtraCharge[]>(`/api/containers/${containerId}/extra-charges`),
    enabled: !!containerId,
  });
}

export function useCreateContainerExtraCharge(containerId: number) {
  const qc = useQueryClient();
  return useMutation<ContainerExtraCharge, Error, { section: string; label: string; amount: number }>({
    mutationFn: (data) =>
      customFetch<ContainerExtraCharge>(`/api/containers/${containerId}/extra-charges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXTRA_CHARGES_KEY(containerId) });
      qc.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
    },
  });
}

export function useUpdateContainerExtraCharge(containerId: number) {
  const qc = useQueryClient();
  return useMutation<ContainerExtraCharge, Error, { rowId: number; label?: string; amount?: number; sortOrder?: number }>({
    mutationFn: ({ rowId, ...data }) =>
      customFetch<ContainerExtraCharge>(`/api/containers/${containerId}/extra-charges/${rowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXTRA_CHARGES_KEY(containerId) });
      qc.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
    },
  });
}

export function useReorderContainerExtraCharges(containerId: number) {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: number; sortOrder: number }[]>({
    mutationFn: async (items) => {
      await Promise.all(
        items.map(({ id, sortOrder }) =>
          customFetch(`/api/containers/${containerId}/extra-charges/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sortOrder }),
          })
        )
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXTRA_CHARGES_KEY(containerId) });
    },
  });
}

export function useDeleteContainerExtraCharge(containerId: number) {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, number>({
    mutationFn: (rowId) =>
      customFetch<{ success: boolean }>(`/api/containers/${containerId}/extra-charges/${rowId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: EXTRA_CHARGES_KEY(containerId) });
      qc.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
    },
  });
}

export type StageActionRequest = {
  id: number;
  action: "set_expected_date" | "mark_released" | "record_delay" | "update_stage_owner";
  expectedDate?: string | null;
  delayReason?: string | null;
  finalDate?: string | null;
  stageOwner?: string | null;
};

export function useStageAction() {
  const qc = useQueryClient();
  return useMutation<import("./generated/api.schemas").Container, Error, StageActionRequest>({
    mutationFn: ({ id, ...body }) =>
      customFetch(`/api/containers/${id}/stage-action`, {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
      qc.invalidateQueries({ queryKey: ["workflow-notifications"] });
    },
  });
}

export function useAuthorizeEarlyStart() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: number; reason: string }>({
    mutationFn: ({ id, reason }) =>
      customFetch(`/api/containers/${id}/early-start`, {
        method: "POST",
        body: JSON.stringify({ reason }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
    },
  });
}

export function useRevokeEarlyStart() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: number }>({
    mutationFn: ({ id }) =>
      customFetch(`/api/containers/${id}/early-start`, { method: "DELETE" }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [`/api/containers/${id}`] });
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
    },
  });
}

