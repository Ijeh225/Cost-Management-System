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
