import { useQuery, useMutation } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

export type BerthingRow = {
  id: number;
  containerNumber: string;
  customerName: string;
  vessel: string | null;
  eta: string | null;
  berthed: boolean;
  berthingConfirmedAt: string | null;
  status: string;
};

export type BerthingOverviewResponse = {
  awaiting: BerthingRow[];
  berthed: BerthingRow[];
  upcoming: BerthingRow[];
  branchScope: { id: number | null; name: string };
};

export function useGetBerthingOverview() {
  return useQuery<BerthingOverviewResponse>({
    queryKey: ["analytics", "berthing"],
    queryFn: () => customFetch("/api/analytics/berthing"),
    staleTime: 60_000,
  });
}

export type DigestResult = {
  sent: number;
  skipped: number;
  errors: string[];
};

export function useSendAlertDigest() {
  return useMutation<DigestResult, Error>({
    mutationFn: () =>
      customFetch<DigestResult>("/api/intelligence/send-digest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
  });
}
