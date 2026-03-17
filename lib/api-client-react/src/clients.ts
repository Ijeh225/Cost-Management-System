import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type Client = {
  id: number;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  address: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ClientWithContainers = Client & {
  containers: Array<{
    id: number;
    containerNumber: string;
    blNumber: string;
    customerName: string;
    vessel: string;
    size: string;
    status: string;
    clearingCharges: string;
    createdAt: string;
  }>;
};

export type CreateClientBody = {
  name: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  notes?: string;
};

export const CLIENTS_QUERY_KEY = ["/api/clients"];

export function useListClients(search?: string) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, search ?? ""],
    queryFn: async () => {
      const url = search ? `/api/clients?search=${encodeURIComponent(search)}` : "/api/clients";
      const res = await customFetch(url);
      if (!res.ok) throw new Error("Failed to fetch clients");
      return res.json() as Promise<Client[]>;
    },
  });
}

export function useGetClient(id: number | null) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, id],
    queryFn: async () => {
      const res = await customFetch(`/api/clients/${id}`);
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json() as Promise<ClientWithContainers>;
    },
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateClientBody) => {
      const res = await customFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create client");
      return res.json() as Promise<Client>;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }); },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateClientBody> }) => {
      const res = await customFetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update client");
      return res.json() as Promise<Client>;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...CLIENTS_QUERY_KEY, id] });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await customFetch(`/api/clients/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete client");
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }); },
  });
}

export function useLinkContainerToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, containerId }: { clientId: number; containerId: number }) => {
      const res = await customFetch(`/api/clients/${clientId}/link-container`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId }),
      });
      if (!res.ok) throw new Error("Failed to link container");
      return res.json();
    },
    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...CLIENTS_QUERY_KEY, clientId] });
    },
  });
}
