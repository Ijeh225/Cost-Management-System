import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export const OVERHEAD_CATEGORIES = [
  "Salaries",
  "Office Rent",
  "Fuel",
  "Bank Charges",
  "Utilities",
  "Maintenance",
  "Other",
] as const;

export type OverheadCategory = typeof OVERHEAD_CATEGORIES[number];

export type OverheadExpense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  bankId: number | null;
  bankName: string | null;
  paidAt: string;
  reference: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OverheadExpensesResponse = {
  expenses: OverheadExpense[];
  totalThisMonth: number;
  totalThisYear: number;
  byCategory: Record<string, number>;
};

export type CreateOverheadExpenseBody = {
  category: string;
  description: string;
  amount: number;
  bankId?: number | null;
  paidAt?: string;
  reference?: string;
};

export type UpdateOverheadExpenseBody = Partial<CreateOverheadExpenseBody>;

const QK = "/api/overhead-expenses";

export function useGetOverheadExpenses(params?: {
  category?: string;
  from?: string;
  to?: string;
}) {
  const search = new URLSearchParams();
  if (params?.category && params.category !== "all") search.set("category", params.category);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  const qs = search.toString();
  return useQuery<OverheadExpensesResponse>({
    queryKey: [QK, params],
    queryFn: () => customFetch<OverheadExpensesResponse>(`/api/overhead-expenses${qs ? `?${qs}` : ""}`),
  });
}

export function useCreateOverheadExpense() {
  const qc = useQueryClient();
  return useMutation<OverheadExpense, Error, CreateOverheadExpenseBody>({
    mutationFn: (data) => customFetch<OverheadExpense>("/api/overhead-expenses", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK] }); },
  });
}

export function useUpdateOverheadExpense() {
  const qc = useQueryClient();
  return useMutation<OverheadExpense, Error, { id: number; data: UpdateOverheadExpenseBody }>({
    mutationFn: ({ id, data }) => customFetch<OverheadExpense>(`/api/overhead-expenses/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK] }); },
  });
}

export function useDeleteOverheadExpense() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) => customFetch<{ ok: boolean }>(`/api/overhead-expenses/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK] }); },
  });
}
