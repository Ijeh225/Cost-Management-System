import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type WhatsAppLogEntry = {
  id: number;
  invoiceId: number;
  clientId: number | null;
  messageType: "invoice" | "reminder";
  phone: string;
  messageBody: string;
  status: "sent" | "failed";
  sentAt: string;
  errorMessage: string | null;
  createdAt: string;
};

export type WhatsAppSendResponse = {
  success: boolean;
  twilioSid: string | null;
  messageBody: string;
};

export type InvoicePayment = {
  id: number;
  invoiceId: number;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  createdAt: string;
};

export type Invoice = {
  id: number;
  invoiceNumber: string;
  status: "draft" | "sent" | "paid" | "partial" | "overdue";
  containerId: number;
  containerNumber: string | null;
  blNumber: string | null;
  clientId: number | null;
  clientName: string | null;
  clientPhone: string | null;
  subtotal: number;
  vatAmount: number;
  total: number;
  totalPaid: number;
  outstanding: number;
  dueDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  payments: InvoicePayment[];
};

export type CreateInvoiceBody = {
  containerId: number;
  vatRate?: number;
  dueDate?: string;
  notes?: string;
};

export type UpdateInvoiceBody = {
  status?: string;
  dueDate?: string | null;
  notes?: string;
  subtotal?: number;
  vatAmount?: number;
  total?: number;
};

export type RecordPaymentBody = {
  amount: number;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  paidAt?: string;
};

export const INVOICES_QUERY_KEY = ["/api/invoices"];

export function useListInvoices() {
  return useQuery({
    queryKey: INVOICES_QUERY_KEY,
    queryFn: () => customFetch<Invoice[]>("/api/invoices"),
  });
}

export function useGetInvoice(id: number | null) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, id],
    queryFn: () => customFetch<Invoice>(`/api/invoices/${id}`),
    enabled: !!id,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInvoiceBody) =>
      customFetch<Invoice>("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY }),
  });
}

export function useUpdateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateInvoiceBody }) =>
      customFetch<Invoice>(`/api/invoices/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, id] });
    },
  });
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/invoices/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY }),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, data }: { invoiceId: number; data: RecordPaymentBody }) =>
      customFetch<{ success: boolean; totalPaid: number; status: string }>(
        `/api/invoices/${invoiceId}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      ),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
    },
  });
}

export function useDeletePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, paymentId }: { invoiceId: number; paymentId: number }) =>
      customFetch<{ success: boolean }>(`/api/invoices/${invoiceId}/payments/${paymentId}`, {
        method: "DELETE",
      }),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
    },
  });
}

export function useGetInvoiceWhatsAppLog(invoiceId: number | null) {
  return useQuery({
    queryKey: [...INVOICES_QUERY_KEY, invoiceId, "whatsapp-log"],
    queryFn: () => customFetch<WhatsAppLogEntry[]>(`/api/invoices/${invoiceId}/whatsapp-log`),
    enabled: !!invoiceId,
  });
}

export function useSendInvoiceWhatsApp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      customFetch<WhatsAppSendResponse>(`/api/invoices/${invoiceId}/send-whatsapp`, {
        method: "POST",
      }),
    onSuccess: (_, invoiceId) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId, "whatsapp-log"] });
    },
  });
}

export function useSendInvoiceReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      customFetch<WhatsAppSendResponse>(`/api/invoices/${invoiceId}/send-reminder`, {
        method: "POST",
      }),
    onSuccess: (_, invoiceId) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId, "whatsapp-log"] });
    },
  });
}
