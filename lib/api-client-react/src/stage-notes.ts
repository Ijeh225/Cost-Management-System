import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import { parseStageNotes, type StageNote } from "./stage-notes-response";
export type { StageNote } from "./stage-notes-response";

export function useGetStageNotes(containerId: number | null) {
  return useQuery<StageNote[]>({
    queryKey: ["stage-notes", containerId],
    queryFn: async () => parseStageNotes(await customFetch<unknown>(
      `/api/containers/${containerId}/stage-notes`, { responseType: "json" },
    )),
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
