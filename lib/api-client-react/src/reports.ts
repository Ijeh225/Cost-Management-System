import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type ClientStatementInvoice = {
  id: number;
  invoiceNumber: string;
  status: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  totalPaid: number;
  outstanding: number;
  dueDate: string | null;
  notes: string;
  createdAt: string;
  payments: Array<{
    id: number;
    amount: number;
    paidAt: string;
    paymentMethod: string;
    reference: string;
    notes: string;
  }>;
};

export type ClientStatementResponse = {
  client: {
    id: number;
    name: string;
    contactName: string;
    contactPhone: string;
    contactEmail: string;
    address: string;
  };
  period: { from: string | null; to: string | null };
  invoices: ClientStatementInvoice[];
  totals: { totalInvoiced: number; totalPaid: number; closingBalance: number };
};

export type VatSummaryInvoice = {
  id: number;
  invoiceNumber: string;
  status: string;
  clientName: string;
  subtotal: number;
  vatAmount: number;
  total: number;
  createdAt: string;
};

export type VatSummaryResponse = {
  period: { from: string | null; to: string | null };
  invoices: VatSummaryInvoice[];
  totals: { totalSubtotal: number; totalVat: number; totalInvoiced: number };
};

export type AgingRow = {
  id: number;
  invoiceNumber: string;
  clientName: string;
  total: number;
  outstanding: number;
  dueDate: string | null;
  daysOverdue: number;
  createdAt: string;
};

export type InvoiceAgingResponse = {
  generatedAt: string;
  buckets: {
    current: AgingRow[];
    days1to30: AgingRow[];
    days31to60: AgingRow[];
    days61to90: AgingRow[];
    days90plus: AgingRow[];
  };
  totals: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    grandTotal: number;
  };
};

export function useGetClientStatement(params: { clientId: number; from?: string; to?: string } | null) {
  return useQuery<ClientStatementResponse>({
    queryKey: ["/api/reports/client-statement", params?.clientId, params?.from, params?.to],
    enabled: params !== null && params.clientId > 0,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params) {
        qs.set("clientId", String(params.clientId));
        if (params.from) qs.set("from", params.from);
        if (params.to) qs.set("to", params.to);
      }
      return customFetch(`/api/reports/client-statement?${qs}`);
    },
  });
}

export function useGetVatSummary(params: { from?: string; to?: string }) {
  return useQuery<VatSummaryResponse>({
    queryKey: ["/api/reports/vat-summary", params.from, params.to],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      return customFetch(`/api/reports/vat-summary?${qs}`);
    },
  });
}

export function useGetInvoiceAging() {
  return useQuery<InvoiceAgingResponse>({
    queryKey: ["/api/reports/invoice-aging"],
    queryFn: async () => customFetch("/api/reports/invoice-aging"),
  });
}
