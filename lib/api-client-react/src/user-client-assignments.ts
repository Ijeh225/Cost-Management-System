import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type ClientAssignment = { id: number; name: string };

export function useGetUserClientAssignments(userId: number | null) {
  return useQuery<ClientAssignment[]>({
    queryKey: [`/api/users/${userId}/client-assignments`],
    queryFn: () => customFetch<ClientAssignment[]>(`/api/users/${userId}/client-assignments`),
    enabled: userId != null,
  });
}

export function useAddClientAssignment(userId: number) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { clientId: number }>({
    mutationFn: ({ clientId }) =>
      customFetch(`/api/users/${userId}/client-assignments`, {
        method: "POST",
        body: JSON.stringify({ clientId }),
        headers: { "Content-Type": "application/json" },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/users/${userId}/client-assignments`] });
    },
  });
}

export function useRemoveClientAssignment(userId: number) {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { clientId: number }>({
    mutationFn: ({ clientId }) =>
      customFetch(`/api/users/${userId}/client-assignments/${clientId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/users/${userId}/client-assignments`] });
    },
  });
}
