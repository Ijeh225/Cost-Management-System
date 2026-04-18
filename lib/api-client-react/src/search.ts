import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type SearchContainerResult = {
  id: number;
  containerNumber: string;
  blNumber: string;
  customerName: string;
  status: string;
};

export type SearchClientResult = {
  id: number;
  name: string;
  contactName: string;
  contactEmail: string;
};

export type SearchInvoiceResult = {
  id: number;
  invoiceNumber: string;
  status: string;
  total: string;
  clientId: number | null;
  clientName: string | null;
};

export type SearchResponse = {
  containers: SearchContainerResult[];
  clients: SearchClientResult[];
  invoices: SearchInvoiceResult[];
};

export function useSearch(query: string) {
  const enabled = query.trim().length >= 2;

  return useQuery<SearchResponse>({
    queryKey: ["/api/search", query],
    enabled,
    staleTime: 10_000,
    queryFn: async () => {
      const qs = new URLSearchParams({ q: query.trim() });
      return customFetch(`/api/search?${qs}`);
    },
  });
}
