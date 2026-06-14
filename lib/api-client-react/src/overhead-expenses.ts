import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type ExpenseCategory = {
  id: number;
  name: string;
  isDefault: boolean;
  createdBy: number | null;
  createdAt: string;
};

export type ExpensePayment = {
  id: number;
  expenseId: number;
  paymentScheduleId?: number | null;
  amount: number;
  paymentMethod: "cash" | "bank";
  bankId: number | null;
  bankName: string | null;
  paidAt: string;
  notes: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

export type OverheadExpenseTopup = {
  id: number;
  expenseId: number;
  amount: number;
  description: string;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
};

export type OverheadExpensePaymentSchedule = {
  id: number;
  status: string;
  scheduleDate: string;
  amountRequested: number;
  amountApproved: number;
  amountPaid: number;
  balance: number;
  priority: string;
  latestEventType: string | null;
  latestComment: string | null;
  latestEventAt: string | null;
  createdAt: string;
};

export type OverheadExpense = {
  id: number;
  category: string;
  description: string;
  amount: number;
  reference: string | null;
  branchId: number | null;
  branchName: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  createdAt: string;
  updatedAt: string;
  totalPaid: number;
  balance: number;
  status: "unpaid" | "partial" | "paid";
  scheduledRequestedTotal: number;
  scheduledApprovedTotal: number;
  scheduledPaidTotal: number;
  scheduledPendingApprovedTotal: number;
  hasApprovedPendingPayment: boolean;
  paymentSchedules: OverheadExpensePaymentSchedule[];
  topups: OverheadExpenseTopup[];
  payments: ExpensePayment[];
};

export type OverheadExpensesResponse = {
  expenses: OverheadExpense[];
  totalOutstanding: number;
  totalPaidThisMonth: number;
  totalPaidThisYear: number;
  byCategory: Record<string, number>;
};

export type CreateOverheadExpenseBody = {
  category: string;
  description: string;
  amount: number;
  reference?: string;
};

export type UpdateOverheadExpenseBody = Partial<CreateOverheadExpenseBody>;

export type CreateExpensePaymentBody = {
  expenseId: number;
  amount: number;
  paymentMethod: "cash" | "bank";
  bankId?: number | null;
  paidAt?: string;
  notes?: string;
};

export type CreateOverheadExpenseTopupBody = {
  expenseId: number;
  amount: number;
  description: string;
};

export type ScheduleOverheadExpensePaymentBody = {
  expenseId: number;
  scheduleDate?: string;
  vendorBeneficiary?: string;
  clientName?: string;
  description?: string;
  amountRequested?: number;
  priority?: "low" | "normal" | "urgent";
};

const QK = "/api/overhead-expenses";
const CATS_QK = "/api/overhead-expenses/categories";

export function useGetOverheadExpenses(params?: {
  category?: string;
  from?: string;
  to?: string;
  status?: string;
}) {
  const search = new URLSearchParams();
  if (params?.category && params.category !== "all") search.set("category", params.category);
  if (params?.from) search.set("from", params.from);
  if (params?.to) search.set("to", params.to);
  if (params?.status && params.status !== "all") search.set("status", params.status);
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

export function useCreateExpensePayment() {
  const qc = useQueryClient();
  return useMutation<{ payment: ExpensePayment; expense: OverheadExpense }, Error, CreateExpensePaymentBody>({
    mutationFn: ({ expenseId, ...data }) => customFetch(`/api/overhead-expenses/${expenseId}/payments`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
      qc.invalidateQueries({ queryKey: ["/api/banks"] });
    },
  });
}

export function useCreateOverheadExpenseTopup() {
  const qc = useQueryClient();
  return useMutation<OverheadExpense, Error, CreateOverheadExpenseTopupBody>({
    mutationFn: ({ expenseId, ...data }) => customFetch<OverheadExpense>(`/api/overhead-expenses/${expenseId}/topups`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
    },
  });
}

export function useScheduleOverheadExpensePayment() {
  const qc = useQueryClient();
  return useMutation<{ schedule: unknown; expense: OverheadExpense }, Error, ScheduleOverheadExpensePaymentBody>({
    mutationFn: ({ expenseId, ...data }) => customFetch<{ schedule: unknown; expense: OverheadExpense }>(`/api/overhead-expenses/${expenseId}/payment-schedules`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [QK] });
      qc.invalidateQueries({ queryKey: ["/api/payment-schedules"] });
    },
  });
}

export function useGetExpenseCategories() {
  return useQuery<ExpenseCategory[]>({
    queryKey: [CATS_QK],
    queryFn: () => customFetch<ExpenseCategory[]>("/api/overhead-expenses/categories"),
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ExpenseCategory, Error, { name: string }>({
    mutationFn: (data) => customFetch<ExpenseCategory>("/api/overhead-expenses/categories", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CATS_QK] }); },
  });
}

export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<ExpenseCategory, Error, { id: number; name: string }>({
    mutationFn: ({ id, name }) => customFetch<ExpenseCategory>(`/api/overhead-expenses/categories/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CATS_QK] }); },
  });
}

export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, number>({
    mutationFn: (id) => customFetch<{ ok: boolean }>(`/api/overhead-expenses/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CATS_QK] }); },
  });
}
