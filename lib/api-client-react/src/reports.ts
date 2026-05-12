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
  totals: {
    totalInvoiced: number;
    totalPaid: number;
    closingBalance: number;
    creditBalance: number;
    unallocatedDeposits: number;
    effectiveClosingBalance: number;
  };
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

export type ProfitLossResponse = {
  period: { from: string | null; to: string | null };
  filters: { clientId: number | null };
  costBasis?: "budgeted" | "disbursements";
  revenue: {
    totalRevenue: number;
    totalInvoicedInclVat: number;
    totalVatCollected: number;
    invoiceCount: number;
    byClient: Array<{ clientId: number; clientName: string; revenue: number; invoiceCount: number }>;
    excludesDrafts: boolean;
  };
  costOfSales: {
    total: number;
    shipping: number;
    customs: number;
    terminal: number;
    delivery: number;
    operations: number;
    extras: number;
  };
  grossProfit: number;
  grossMarginPct: number;
  overheads: {
    total: number;
    byCategory: Record<string, number>;
    appliedToNet: boolean;
  };
  netProfit: number;
  netMarginPct: number;
  containerCount: number;
  avgProfitPerContainer: number;
  monthly: Array<{
    month: string;
    revenue: number;
    costOfSales: number;
    grossProfit: number;
    overheads: number;
    netProfit: number;
    containerCount: number;
  }>;
  clients: Array<{ id: number; name: string }>;
};

export function useGetProfitLoss(params: { from?: string; to?: string; clientId?: string; costBasis?: string }) {
  return useQuery<ProfitLossResponse>({
    queryKey: ["/api/reports/pl", params.from, params.to, params.clientId, params.costBasis],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      if (params.clientId && params.clientId !== "all") qs.set("clientId", params.clientId);
      if (params.costBasis === "disbursements") qs.set("costBasis", "disbursements");
      return customFetch(`/api/reports/pl?${qs}`);
    },
  });
}

export type DisbursementReconciliationSection = {
  budgeted: number;
  disbursed: number;
  variance: number;
};

export type DisbursementReconciliationRow = {
  containerId: number;
  containerNumber: string;
  customerName: string;
  blNumber: string | null;
  status: string;
  sections: Record<string, DisbursementReconciliationSection>;
  totals: { budgeted: number; disbursed: number; variance: number };
};

export type DisbursementReconciliationResponse = {
  period: { from: string | null; to: string | null; status: string | null };
  rows: DisbursementReconciliationRow[];
  aggregate: {
    sections: Record<string, DisbursementReconciliationSection>;
    totals: { budgeted: number; disbursed: number; variance: number };
  };
};

export function useGetDisbursementReconciliation(
  params: { from?: string; to?: string; status?: string },
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};
  return useQuery<DisbursementReconciliationResponse>({
    queryKey: ["/api/reports/disbursement-reconciliation", params.from, params.to, params.status],
    enabled,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      if (params.status) qs.set("status", params.status);
      return customFetch(`/api/reports/disbursement-reconciliation?${qs}`);
    },
  });
}

export type CashFlowTxn = {
  id: string;
  date: string;
  type: "invoice_payment" | "client_deposit" | "overhead_expense" | "fund_addition" | "container_expense" | "bank_transfer";
  direction: "in" | "out";
  description: string;
  category: string | null;
  bankId: number | null;
  bankName: string | null;
  reference: string | null;
  amount: number;
};

export type CashFlowResponse = {
  period: { from: string | null; to: string | null };
  filters: { bankId: number | null };
  inflows: CashFlowTxn[];
  outflows: CashFlowTxn[];
  totals: {
    openingBalance: number;
    totalIn: number;
    totalOut: number;
    netCashFlow: number;
    closingBalance: number;
  };
  breakdown: {
    byBank: Array<{ bankId: number | null; bankName: string; totalIn: number; totalOut: number }>;
    outflowByCategory: Record<string, number>;
    inflowByType: Record<string, number>;
  };
  banks: Array<{ id: number; name: string }>;
};

export function useGetCashFlow(params: { from?: string; to?: string; bankId?: string }) {
  return useQuery<CashFlowResponse>({
    queryKey: ["/api/reports/cashflow", params.from, params.to, params.bankId],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      if (params.bankId && params.bankId !== "all") qs.set("bankId", params.bankId);
      return customFetch(`/api/reports/cashflow?${qs}`);
    },
  });
}

export type DeliveryAnalyticsItem = {
  id: number;
  containerNumber: string;
  blNumber: string | null;
  clientName: string | null;
  status: string;
  deliveredAt: string;
  deliveredAtEstimated: boolean;
  clearingCharges: number;
  daysToComplete: number | null;
  createdAt: string;
  truckNumber: string | null;
  driverName: string | null;
  dispatchOfficer: string | null;
  deliveryStatus: string;
  deliveryLocation: string | null;
  offloadingConfirmed: boolean;
  emptyReturnDate: string | null;
};

export type DeliveryAnalyticsResponse = {
  count: number;
  totalRevenue: number;
  avgDays: number | null;
  items: DeliveryAnalyticsItem[];
};

export function useDeliveryAnalyticsReport(
  params: { from?: string; to?: string },
  options?: { enabled?: boolean }
) {
  const { enabled = true } = options ?? {};
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return useQuery<DeliveryAnalyticsResponse>({
    queryKey: ["/api/analytics/deliveries", params.from, params.to],
    enabled,
    queryFn: async () => customFetch(`/api/analytics/deliveries?${qs}`),
  });
}

export type VatLiabilityMonth = {
  label: string;
  month: number;
  year: number;
  vatCollected: number;
  taxableAmount: number;
  invoiceCount: number;
};

export type VatLiabilityQuarter = {
  label: string;
  year: number;
  quarter: number;
  from: string;
  to: string;
  vatCollected: number;
  taxableAmount: number;
  invoiceCount: number;
  creditNoteVatDeduction: number;
  months?: VatLiabilityMonth[];
};

export type VatLiabilityResponse = {
  currentQuarter: VatLiabilityQuarter;
  quarters: VatLiabilityQuarter[];
  currentYearTotal: {
    vatCollected: number;
    taxableAmount: number;
    invoiceCount: number;
  };
};

export function useGetVatLiability() {
  return useQuery<VatLiabilityResponse>({
    queryKey: ["/api/reports/vat-liability"],
    queryFn: async () => customFetch("/api/reports/vat-liability"),
  });
}
