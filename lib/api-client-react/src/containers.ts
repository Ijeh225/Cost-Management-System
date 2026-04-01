import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { DeliveryReportResponse } from "./generated/api.schemas";

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

export function useGetDeliveryReport(
  from?: string,
  to?: string,
  options?: { query?: { enabled?: boolean } }
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  return useQuery<DeliveryReportResponse>({
    queryKey: ["analytics", "deliveries", from, to],
    queryFn: () => customFetch<DeliveryReportResponse>(`/api/analytics/deliveries${qs ? `?${qs}` : ""}`),
    enabled: options?.query?.enabled,
  });
}
