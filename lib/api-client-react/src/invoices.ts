import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type WhatsAppLogEntry = {
  id: number;
  invoiceId: number;
  clientId: number | null;
  messageType: "invoice" | "reminder" | "receipt";
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

export type InvoiceItem = {
  id: number;
  invoiceId: number;
  containerId: number | null;
  description: string;
  amount: number;
  sortOrder: number;
  containerNumber: string | null;
  blNumber: string | null;
};

export type InvoicePayment = {
  id: number;
  invoiceId: number;
  amount: number;
  paidAt: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  bankId: number | null;
  bankName: string | null;
  createdAt: string;
};

export type InvoiceAuditLogEntry = {
  id: number;
  invoiceId: number;
  action: string;
  details: string | null;
  performedBy: number | null;
  createdAt: string;
};

export type CreditNote = {
  id: number;
  invoiceId: number;
  invoiceNumber: string | null;
  clientName: string | null;
  creditNoteNumber: string;
  reason: string;
  amount: number;
  status: string;
  createdBy: number | null;
  createdAt: string;
};

export type Invoice = {
  id: number;
  invoiceNumber: string;
  status: "draft" | "sent" | "paid" | "partial" | "overdue" | "written_off";
  containerId: number | null;
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
  items: InvoiceItem[];
  payments: InvoicePayment[];
  creditNotes: CreditNote[];
};

export type CreateInvoiceBody = {
  containerIds: number[];
  vatRate?: number;
  dueDate?: string;
  notes?: string;
  branchId?: number;
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
  bankId?: number | null;
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

export function useSendInvoiceReceipt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: number) =>
      customFetch<WhatsAppSendResponse>(`/api/invoices/${invoiceId}/send-receipt`, {
        method: "POST",
      }),
    onSuccess: (_, invoiceId) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId, "whatsapp-log"] });
    },
  });
}

export type ArAgingBuckets = {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
};

export type ArUnpaidInvoice = {
  id: number;
  invoiceNumber: string;
  status: string;
  total: number;
  totalPaid: number;
  outstanding: number;
  dueDate: string | null;
  createdAt: string;
};

export type ArClientRow = {
  clientId: number | null;
  clientName: string;
  invoiceCount: number;
  totalInvoiced: number;
  totalCollected: number;
  outstanding: number;
  effectiveOutstanding: number;
  aging: ArAgingBuckets;
  unpaidInvoices: ArUnpaidInvoice[];
  unallocatedDeposits: number;
  creditBalance: number;
};

export type ArWrittenOffInvoice = {
  id: number;
  invoiceNumber: string;
  clientId: number | null;
  clientName: string | null;
  total: number;
  writtenOffAmount: number;
  createdAt: string;
};

export type ArLedgerResponse = {
  summary: {
    totalInvoiced: number;
    totalCollected: number;
    totalOutstanding: number;
    collectedThisMonth: number;
    openInvoiceCount: number;
    totalOverdue: number;
    totalUnallocatedDeposits: number;
    totalCreditBalance: number;
    totalWrittenOff: number;
    writtenOffCount: number;
  };
  aging: ArAgingBuckets;
  clients: ArClientRow[];
  writtenOffInvoices: ArWrittenOffInvoice[];
};

export const AR_QUERY_KEY = "/api/invoices/accounts-receivable";

export function useGetArLedger(params?: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const url = qs.toString() ? `${AR_QUERY_KEY}?${qs}` : AR_QUERY_KEY;
  return useQuery<ArLedgerResponse>({
    queryKey: [AR_QUERY_KEY, params?.from ?? "", params?.to ?? ""],
    queryFn: () => customFetch<ArLedgerResponse>(url),
  });
}

export type AddInvoiceItemBody = {
  containerId?: number;
  description?: string;
  amount?: number;
};

export type EditInvoiceItemBody = {
  description?: string;
  amount?: number;
};

export function useAddInvoiceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, data }: { invoiceId: number; data: AddInvoiceItemBody }) =>
      customFetch<Invoice>(`/api/invoices/${invoiceId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}

export function useEditInvoiceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, itemId, data }: { invoiceId: number; itemId: number; data: EditInvoiceItemBody }) =>
      customFetch<Invoice>(`/api/invoices/${invoiceId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}

export function useRemoveInvoiceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, itemId }: { invoiceId: number; itemId: number }) =>
      customFetch<Invoice>(`/api/invoices/${invoiceId}/items/${itemId}`, { method: "DELETE" }),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
    },
  });
}

const CREDIT_NOTES_KEY = "/api/credit-notes";

export function useGetAllCreditNotes(invoiceId?: number) {
  const url = invoiceId ? `${CREDIT_NOTES_KEY}?invoiceId=${invoiceId}` : CREDIT_NOTES_KEY;
  return useQuery<CreditNote[]>({
    queryKey: invoiceId ? [CREDIT_NOTES_KEY, { invoiceId }] : [CREDIT_NOTES_KEY],
    queryFn: () => customFetch<CreditNote[]>(url),
  });
}

export function useGetCreditNoteById(id: number | null) {
  return useQuery<CreditNote>({
    queryKey: [CREDIT_NOTES_KEY, id],
    queryFn: () => customFetch<CreditNote>(`${CREDIT_NOTES_KEY}/${id}`),
    enabled: !!id,
  });
}

export function useRaiseCreditNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, data }: { invoiceId: number; data: { amount: number; reason: string } }) =>
      customFetch<CreditNote>(`/api/invoices/${invoiceId}/credit-note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices/accounts-receivable"] });
    },
  });
}

export function useGetInvoiceCreditNotes(invoiceId: number | null) {
  return useQuery<CreditNote[]>({
    queryKey: [...INVOICES_QUERY_KEY, invoiceId, "credit-notes"],
    queryFn: () => customFetch<CreditNote[]>(`/api/invoices/${invoiceId}/credit-notes`),
    enabled: !!invoiceId,
  });
}

export function useGetInvoiceAuditLog(invoiceId: number | null) {
  return useQuery<InvoiceAuditLogEntry[]>({
    queryKey: [...INVOICES_QUERY_KEY, invoiceId, "audit-log"],
    queryFn: () => customFetch<InvoiceAuditLogEntry[]>(`/api/invoices/${invoiceId}/audit-log`),
    enabled: !!invoiceId,
  });
}

export function useWriteOffInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId }: { invoiceId: number }) =>
      customFetch<{ success: boolean; overheadExpenseId: number }>(`/api/invoices/${invoiceId}/write-off`, {
        method: "POST",
      }),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices/accounts-receivable"] });
    },
  });
}

export function useApplyClientCredit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ invoiceId, amount }: { invoiceId: number; amount: number }) =>
      customFetch<{ success: boolean; appliedAmount: number; remainingCredit: number }>(
        `/api/invoices/${invoiceId}/apply-credit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount }),
        }
      ),
    onSuccess: (_, { invoiceId }) => {
      qc.invalidateQueries({ queryKey: INVOICES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: [...INVOICES_QUERY_KEY, invoiceId] });
      qc.invalidateQueries({ queryKey: ["/api/invoices/accounts-receivable"] });
    },
  });
}
