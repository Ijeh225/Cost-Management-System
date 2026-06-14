import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type PaymentScheduleStatus =
  | "pending_approval"
  | "partially_approved"
  | "approved"
  | "paid"
  | "completed"
  | "rejected"
  | "cancelled";

export type PaymentSchedulePriority = "low" | "normal" | "urgent";
export type PaymentScheduleBucket = "today" | "tomorrow" | "upcoming" | "completed" | "cancelled";

export type PaymentSchedule = {
  id: number;
  branchId: number;
  branchName: string | null;
  scheduleDate: string;
  originalRequestDate: string;
  requestedById: number | null;
  requestedByName: string;
  overheadExpenseId: number | null;
  sourceType: "overhead_expense" | "manual";
  sourceLabel: string;
  overheadDescription: string | null;
  overheadCategory: string | null;
  vendorBeneficiary: string;
  clientName: string | null;
  description: string;
  amountRequested: number;
  amountApproved: number;
  amountPaid: number;
  balance: number;
  priority: PaymentSchedulePriority;
  status: PaymentScheduleStatus;
  bucket: PaymentScheduleBucket;
  overdueDays: number;
  overdueLevel: "yellow" | "orange" | "red" | null;
  eventCount: number;
  documentCount: number;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentScheduleEvent = {
  id: number;
  type: string;
  actorUserId: number | null;
  actorName: string | null;
  comment: string | null;
  amount: number | null;
  oldStatus: string | null;
  newStatus: string | null;
  oldScheduleDate: string | null;
  newScheduleDate: string | null;
  createdAt: string;
};

export type PaymentScheduleDocument = {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedById: number | null;
  createdAt: string;
};

export type PaymentScheduleDetail = PaymentSchedule & {
  events: PaymentScheduleEvent[];
  documents: PaymentScheduleDocument[];
};

export type PaymentSchedulesResponse = {
  schedules: PaymentSchedule[];
  summary: {
    totalScheduledToday: number;
    totalPendingApproval: number;
    totalApproved: number;
    totalPaidToday: number;
    overdueSchedules: number;
    today: number;
    tomorrow: number;
    upcoming: number;
    completed: number;
    cancelled: number;
  };
  byStaff: Array<{ userId: number | null; name: string; count: number; amount: number }>;
  byBranch: Array<{ branchId: number; name: string; count: number; amount: number }>;
};

export type PaymentScheduleFilters = {
  bucket?: string;
  requestedById?: number | null;
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  vendor?: string;
  client?: string;
  amountMin?: string;
  amountMax?: string;
  branchId?: number | null;
  search?: string;
};

export type CreatePaymentScheduleBody = {
  scheduleDate: string;
  vendorBeneficiary: string;
  clientName?: string;
  description: string;
  amountRequested: number;
  priority: PaymentSchedulePriority;
};

const QK = "/api/payment-schedules";

function toQuery(params?: PaymentScheduleFilters) {
  const qs = new URLSearchParams();
  if (!params) return "";
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || value === "all") return;
    qs.set(key, String(value));
  });
  const out = qs.toString();
  return out ? `?${out}` : "";
}

export function useGetPaymentSchedules(params?: PaymentScheduleFilters) {
  return useQuery<PaymentSchedulesResponse>({
    queryKey: [QK, params],
    queryFn: () => customFetch<PaymentSchedulesResponse>(`${QK}${toQuery(params)}`),
  });
}

export function useGetPaymentSchedule(id: number | null) {
  return useQuery<PaymentScheduleDetail>({
    queryKey: [QK, id],
    enabled: id != null,
    queryFn: () => customFetch<PaymentScheduleDetail>(`${QK}/${id}`),
  });
}

export function useCreatePaymentSchedule() {
  const qc = useQueryClient();
  return useMutation<PaymentSchedule, Error, CreatePaymentScheduleBody>({
    mutationFn: (data) => customFetch<PaymentSchedule>(QK, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [QK] }); },
  });
}

function useScheduleAction<TBody extends object>(action: string) {
  const qc = useQueryClient();
  return useMutation<PaymentSchedule, Error, { id: number; data?: TBody }>({
    mutationFn: ({ id, data }) => customFetch<PaymentSchedule>(`${QK}/${id}/${action}`, {
      method: "PATCH",
      body: JSON.stringify(data ?? {}),
    }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: [QK] });
      qc.invalidateQueries({ queryKey: [QK, variables.id] });
      qc.invalidateQueries({ queryKey: ["/api/overhead-expenses"] });
    },
  });
}

export function useApprovePaymentSchedule() {
  return useScheduleAction<{ comment?: string }>("approve");
}

export function usePartialApprovePaymentSchedule() {
  return useScheduleAction<{ approvedAmount: number; comment?: string }>("partial-approve");
}

export function useRejectPaymentSchedule() {
  return useScheduleAction<{ comment: string }>("reject");
}

export function usePayPaymentSchedule() {
  return useScheduleAction<{ amount: number; paymentMethod: "cash" | "bank"; bankId?: number | null; paidAt?: string; notes?: string; comment?: string }>("pay");
}

export function useCompletePaymentSchedule() {
  return useScheduleAction<{ comment?: string }>("complete");
}

export function useReschedulePaymentSchedule() {
  return useScheduleAction<{ scheduleDate: string; comment?: string }>("reschedule");
}

export function useCancelPaymentSchedule() {
  return useScheduleAction<{ comment?: string }>("cancel");
}

export function useAddPaymentScheduleComment() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { id: number; comment: string }>({
    mutationFn: ({ id, comment }) => customFetch<{ ok: boolean }>(`${QK}/${id}/comments`, {
      method: "POST",
      body: JSON.stringify({ comment }),
    }),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: [QK] });
      qc.invalidateQueries({ queryKey: [QK, variables.id] });
    },
  });
}

export function useUploadPaymentScheduleDocument() {
  const qc = useQueryClient();
  return useMutation<PaymentScheduleDocument, Error, { id: number; file: File }>({
    mutationFn: ({ id, file }) => {
      const body = new FormData();
      body.append("file", file);
      return customFetch<PaymentScheduleDocument>(`${QK}/${id}/documents`, { method: "POST", body });
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: [QK] });
      qc.invalidateQueries({ queryKey: [QK, variables.id] });
    },
  });
}
