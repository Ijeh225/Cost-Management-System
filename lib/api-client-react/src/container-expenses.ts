import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type ContainerSearchResult = {
  id: number;
  containerNumber: string;
  customerName: string;
  blNumber?: string | null;
  status?: string | null;
};

export function useContainerSearch(query: string) {
  return useQuery<ContainerSearchResult[]>({
    queryKey: ["/api/containers/search-lightweight", query],
    queryFn: async () => {
      if (!query.trim() || query.trim().length < 2) return [];
      const res = await customFetch<any>(`/api/containers?search=${encodeURIComponent(query)}&limit=15`);
      const list = Array.isArray(res) ? res : (res?.containers ?? res?.data ?? []);
      return list.map((c: any) => ({
        id: c.id,
        containerNumber: c.containerNumber ?? c.container_number ?? "",
        customerName: c.customerName ?? c.customer_name ?? "",
        blNumber: c.blNumber ?? c.bl_number ?? null,
        status: c.status ?? null,
      }));
    },
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  });
}

export type BankOption = {
  id: number;
  name: string;
  accountNumber: string | null;
  isActive: boolean;
  currentBalance?: number;
};

export function useActiveBanks() {
  return useQuery<BankOption[]>({
    queryKey: ["/api/banks", "active"],
    queryFn: () => customFetch<BankOption[]>("/api/banks?active=true"),
  });
}

export type ContainerExpenseCategory = {
  id: number;
  name: string;
  isDefault: boolean;
  createdBy: number | null;
  createdAt: string;
};

export type ContainerExpensePayment = {
  id: number;
  containerId: number;
  categoryId: number;
  categoryName: string;
  amount: number;
  paymentMethod: "cash" | "bank";
  bankId: number | null;
  bankName: string | null;
  reference: string | null;
  narration: string | null;
  paidAt: string;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

export type RecentContainerExpensePayment = ContainerExpensePayment & {
  containerNumber: string;
  customerName: string;
};

export type ContainerExpensePaymentsResponse = {
  payments: ContainerExpensePayment[];
  totalPaid: number;
};

export type BatchContainerExpensePaymentItem = {
  containerId: number;
  amount: number;
};

export type BatchContainerExpensePaymentPayload = {
  items: BatchContainerExpensePaymentItem[];
  categoryId: number;
  bankId?: number | null;
  paymentMethod: "cash" | "bank";
  reference?: string;
  narration?: string;
  paidAt?: string;
};

export type BatchContainerExpensePaymentResponse = {
  ok: boolean;
  count: number;
  payments: ContainerExpensePayment[];
};

const CATS_QK = "/api/container-expense-categories";
const RECENT_QK = "/api/container-expense-payments/recent";

export function useGetContainerExpenseCategories() {
  return useQuery<ContainerExpenseCategory[]>({
    queryKey: [CATS_QK],
    queryFn: () => customFetch<ContainerExpenseCategory[]>("/api/container-expense-categories"),
  });
}

export function useCreateContainerExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ContainerExpenseCategory, Error, { name: string }>({
    mutationFn: (data) => customFetch<ContainerExpenseCategory>("/api/container-expense-categories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CATS_QK] }); },
  });
}

export function useDeleteContainerExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) => customFetch<{ ok: boolean }>(`/api/container-expense-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CATS_QK] }); },
  });
}

export function useGetContainerExpensePayments(containerId: number | null) {
  return useQuery<ContainerExpensePaymentsResponse>({
    queryKey: ["/api/containers", containerId, "expense-payments"],
    queryFn: () => customFetch<ContainerExpensePaymentsResponse>(`/api/containers/${containerId}/expense-payments`),
    enabled: containerId !== null && containerId > 0,
  });
}

export function useGetRecentContainerExpensePayments(limit = 50) {
  return useQuery<RecentContainerExpensePayment[]>({
    queryKey: [RECENT_QK, limit],
    queryFn: () => customFetch<RecentContainerExpensePayment[]>(`/api/container-expense-payments/recent?limit=${limit}`),
  });
}

export function useBatchCreateContainerExpensePayment() {
  const qc = useQueryClient();
  return useMutation<BatchContainerExpensePaymentResponse, Error, BatchContainerExpensePaymentPayload>({
    mutationFn: (data) => customFetch<BatchContainerExpensePaymentResponse>("/api/container-expense-payments/batch", {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
      qc.invalidateQueries({ queryKey: [RECENT_QK] });
      qc.invalidateQueries({ queryKey: ["/api/banks"] });
    },
  });
}
