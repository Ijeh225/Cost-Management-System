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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
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

