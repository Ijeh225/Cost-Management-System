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
  totalOutstanding?: number;
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

export type ClientReceivablesInvoice = {
  id: number;
  invoiceNumber: string;
  status: string;
  containerId: number | null;
  containerNumber: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  paid: number;
  outstanding: number;
  dueDate: string | null;
  createdAt: string;
  payments: Array<{
    id: number;
    amount: number;
    paidAt: string;
    paymentMethod: string | null;
    reference: string | null;
    notes: string | null;
  }>;
};

export type ClientReceivables = {
  totalInvoiced: number;
  totalCollected: number;
  totalOutstanding: number;
  invoices: ClientReceivablesInvoice[];
};

export const CLIENTS_QUERY_KEY = ["/api/clients"];

export function useListClients(search?: string) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, search ?? ""],
    queryFn: async () => {
      const url = search ? `/api/clients?search=${encodeURIComponent(search)}` : "/api/clients";
      return customFetch<Client[]>(url);
    },
  });
}

export function useGetClient(id: number | null) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, id],
    queryFn: async () => {
      return customFetch<ClientWithContainers>(`/api/clients/${id}`);
    },
    enabled: !!id,
  });
}

export function useGetClientReceivables(id: number | null) {
  return useQuery({
    queryKey: [...CLIENTS_QUERY_KEY, id, "receivables"],
    queryFn: async () => {
      const res = await fetch(`/api/clients/${id}/receivables`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch receivables");
      return res.json() as Promise<ClientReceivables>;
    },
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateClientBody) => {
      return customFetch<Client>("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }); },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CreateClientBody> }) => {
      return customFetch<Client>(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
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
      return customFetch<{ success: boolean }>(`/api/clients/${id}`, { method: "DELETE" });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY }); },
  });
}

export function useLinkContainerToClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ clientId, containerId }: { clientId: number; containerId: number }) => {
      return customFetch<{ success: boolean }>(`/api/clients/${clientId}/link-container`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ containerId }),
      });
    },
    onSuccess: (_, { clientId }) => {
      qc.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...CLIENTS_QUERY_KEY, clientId] });
    },
  });
}
