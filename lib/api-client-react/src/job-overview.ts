import { useQuery } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import type { JobOverviewResponse, DailyQueueEntry } from "./generated/api.schemas";

export type JobOverview = JobOverviewResponse;
export type DailyQueueItem = DailyQueueEntry;
export type WorkBucket = DailyQueueEntry["bucket"];
export type DailyQueue = { dailyQueue: DailyQueueEntry[]; workDate: string; timeZone: string; asOf: string; mySections: string[] };

export function useJobOverview(id: number) {
  return useQuery({ queryKey: [`/api/containers/${id}/overview`],
    queryFn: ({ signal }) => customFetch<JobOverviewResponse>(`/api/containers/${id}/overview`, { signal }),
    staleTime: 0, refetchInterval: 60_000 });
}

export function useDailyQueue() {
  return useQuery({ queryKey: ["/api/my-tasks"], queryFn: ({ signal }) => customFetch<DailyQueue>("/api/my-tasks", { signal }),
    staleTime: 0, refetchInterval: 60_000 });
}
