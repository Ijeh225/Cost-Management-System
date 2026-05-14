import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type StageNote = {
  id: number;
  containerId: number;
  stage: string;
  note: string;
  authorId: number;
  authorName: string;
  createdAt: string;
};

export function useGetStageNotes(containerId: number | null) {
  return useQuery<StageNote[]>({
    queryKey: ["stage-notes", containerId],
    queryFn: () => customFetch<StageNote[]>(`/api/containers/${containerId}/stage-notes`),
    enabled: containerId != null,
    staleTime: 30_000,
  });
}

export function useAddStageNote() {
  const qc = useQueryClient();
  return useMutation<StageNote, Error, { containerId: number; stage: string; note: string }>({
    mutationFn: ({ containerId, stage, note }) =>
      customFetch<StageNote>(`/api/containers/${containerId}/stage-notes`, {
        method: "POST",
        body: JSON.stringify({ stage, note }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: (_data, { containerId }) => {
      qc.invalidateQueries({ queryKey: ["stage-notes", containerId] });
      qc.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
    },
  });
}
