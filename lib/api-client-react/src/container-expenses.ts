import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type ContainerSearchResult = {
  id: number;
  containerNumber: string;
  customerName: string;
  blNumber?: string | null;
  status?: string | null;
};

type ContainerSearchRaw = {
  id: number;
  containerNumber?: string;
  container_number?: string;
  customerName?: string;
  customer_name?: string;
  blNumber?: string | null;
  bl_number?: string | null;
  status?: string | null;
};

type ContainerSearchResponse = ContainerSearchRaw[] | { containers: ContainerSearchRaw[] } | { data: ContainerSearchRaw[] };

function toContainerSearchResult(c: ContainerSearchRaw): ContainerSearchResult {
  return {
    id: c.id,
    containerNumber: c.containerNumber ?? c.container_number ?? "",
    customerName: c.customerName ?? c.customer_name ?? "",
    blNumber: c.blNumber ?? c.bl_number ?? null,
    status: c.status ?? null,
  };
}

export function useContainerSearch(query: string) {
  return useQuery<ContainerSearchResult[]>({
    queryKey: ["/api/containers/search-lightweight", query],
    queryFn: async () => {
      if (!query.trim() || query.trim().length < 2) return [];
      const res = await customFetch<ContainerSearchResponse>(`/api/containers?search=${encodeURIComponent(query)}&limit=15`);
      const list: ContainerSearchRaw[] = Array.isArray(res)
        ? res
        : ("containers" in res ? res.containers : res.data) ?? [];
      return list.map(toContainerSearchResult);
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

export type PaymentSection = "shipping" | "customs" | "terminal" | "delivery" | "operations";

export const PAYMENT_SECTION_LABELS: Record<PaymentSection, string> = {
  shipping: "Shipping",
  customs: "Customs",
  terminal: "Terminal",
  delivery: "Delivery",
  operations: "Operations",
};

export const ALL_PAYMENT_SECTIONS: PaymentSection[] = ["shipping", "customs", "terminal", "delivery", "operations"];

export type ContainerSectionSummary = {
  section: PaymentSection;
  label: string;
  charged: number;
  paid: number;
  outstanding: number;
};

export type ContainerExpensePayment = {
  id: number;
  containerId: number;
  categoryId: number | null;
  categoryName: string;
  section: PaymentSection | null;
  sectionLabel: string | null;
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
  section?: PaymentSection | null;
  categoryId?: number | null;
  bankId?: number | null;
  paymentMethod: "cash" | "bank";
  reference?: string;
  narration?: string;
  paidAt?: string;
};

export type BatchCreatedExpensePayment = {
  id: number;
  containerId: number;
  categoryId: number | null;
  section: PaymentSection | null;
  amount: number;
  paymentMethod: "cash" | "bank";
  bankId: number | null;
  reference: string | null;
  narration: string | null;
  paidAt: string;
  recordedBy: number | null;
  createdAt: string;
};

export type BatchContainerExpensePaymentResponse = {
  ok: boolean;
  count: number;
  payments: BatchCreatedExpensePayment[];
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

export function useGetContainerExpensePaymentsBySection(containerId: number | null) {
  return useQuery<ContainerSectionSummary[]>({
    queryKey: ["/api/containers", containerId, "expense-payments", "by-section"],
    queryFn: () => customFetch<ContainerSectionSummary[]>(`/api/containers/${containerId}/expense-payments/by-section`),
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
