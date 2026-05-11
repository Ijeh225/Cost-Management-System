import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type Bank = {
  id: number;
  name: string;
  accountNumber: string | null;
  bankCode: string | null;
  isActive: boolean;
  currentBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type CreateBankBody = {
  name: string;
  accountNumber?: string;
  bankCode?: string;
};

export type UpdateBankBody = Partial<CreateBankBody> & { isActive?: boolean };

export type BankTransfer = {
  id: number;
  fromBankId: number | null;
  fromBankName: string | null;
  toBankId: number | null;
  toBankName: string | null;
  amount: number;
  narration: string;
  reference: string | null;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
};

export type CreateBankTransferBody = {
  fromBankId: number;
  toBankId: number;
  amount: number;
  narration?: string;
  reference?: string;
};

export type BankTransaction = {
  id: string;
  date: string;
  type: "payment" | "deposit" | "transfer_in" | "transfer_out";
  description: string;
  reference: string | null;
  clientName: string | null;
  invoiceNumber: string | null;
  debit: number;
  credit: number;
  balance: number;
};

export type BankTransactionResponse = {
  bank: Bank;
  transactions: BankTransaction[];
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
};

export const BANKS_QUERY_KEY = ["/api/banks"];
export const BANK_TRANSFERS_QUERY_KEY = ["/api/banks/transfers"];

export function useListBanks() {
  return useQuery({
    queryKey: BANKS_QUERY_KEY,
    queryFn: () => customFetch<Bank[]>("/api/banks"),
  });
}

export function useListActiveBanks() {
  return useQuery({
    queryKey: [...BANKS_QUERY_KEY, "active"],
    queryFn: () => customFetch<Bank[]>("/api/banks?active=true"),
  });
}

export function useCreateBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankBody) =>
      customFetch<Bank>("/api/banks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: BANKS_QUERY_KEY }); },
  });
}

export function useUpdateBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBankBody }) =>
      customFetch<Bank>(`/api/banks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: BANKS_QUERY_KEY }); },
  });
}

export function useDeleteBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      customFetch<{ success: boolean }>(`/api/banks/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: BANKS_QUERY_KEY }); },
  });
}

export function useListBankTransfers() {
  return useQuery({
    queryKey: BANK_TRANSFERS_QUERY_KEY,
    queryFn: () => customFetch<BankTransfer[]>("/api/banks/transfers"),
  });
}

export function useGetBankTransactions(
  id: number | null,
  params?: { from?: string; to?: string; type?: string }
) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to)   qs.set("to", params.to);
  if (params?.type) qs.set("type", params.type);
  const url = `/api/banks/${id}/transactions${qs.toString() ? `?${qs}` : ""}`;
  return useQuery<BankTransactionResponse>({
    queryKey: [...BANKS_QUERY_KEY, id, "transactions", params?.from ?? "", params?.to ?? "", params?.type ?? ""],
    queryFn: () => customFetch<BankTransactionResponse>(url),
    enabled: !!id,
  });
}

export function useCreateBankTransfer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBankTransferBody) =>
      customFetch<BankTransfer>("/api/banks/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: BANK_TRANSFERS_QUERY_KEY });
    },
  });
}
