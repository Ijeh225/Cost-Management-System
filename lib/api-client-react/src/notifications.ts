import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";
import { getBranchQueryOptions, type BranchQueryScope } from "./branch-query";

export type Notification = {
  alertKey: string;
  type: string;
  severity: string;
  message: string;
  containerId?: number;
  containerNumber?: string;
  generatedAt: string;
  isRead: boolean;
  readAt: string | null;
};

export type NotificationsResponse = {
  notifications: Notification[];
  unreadCount: number;
};

export type AlertHistoryItem = {
  id: number;
  alertKey: string;
  type: string;
  severity: string;
  message: string;
  containerId?: number | null;
  containerNumber?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isResolved: boolean;
};

export type AlertHistoryResponse = {
  alerts: AlertHistoryItem[];
  total: number;
};

export type WorkflowNotification = {
  id: number;
  branchId?: number;
  type: string;
  message: string;
  actionUrl?: string | null;
  containerId?: number | null;
  containerNumber?: string | null;
  targetUserId?: number | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
};

export type WorkflowNotificationsResponse = {
  notifications: WorkflowNotification[];
  unreadCount: number;
};

const NOTIFICATIONS_KEY = ["notifications"] as const;
const WORKFLOW_NOTIFICATIONS_KEY = ["workflow-notifications"] as const;

export type WorkflowNotificationFilters = {
  type?: string;
  read?: "all" | "read" | "unread";
  dateFrom?: string;
  dateTo?: string;
  targetUserId?: number | null;
  limit?: number;
};

function toWorkflowQuery(params?: WorkflowNotificationFilters) {
  const qs = new URLSearchParams();
  if (!params) return "";
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === "" || value === "all") return;
    qs.set(key, String(value));
  });
  const out = qs.toString();
  return out ? `?${out}` : "";
}

export function useGetNotifications<T = NotificationsResponse>(options?: {
  query?: { refetchInterval?: number; enabled?: boolean };
}, scope?: BranchQueryScope) {
  const { query, request } = getBranchQueryOptions(scope, NOTIFICATIONS_KEY);
  return useQuery<T>({
    ...query,
    queryFn: ({ signal }) => customFetch<T>("/api/notifications", { ...request, signal }),
    ...(options?.query ?? {}),
  });
}

export function useGetWorkflowNotifications(options?: {
  params?: WorkflowNotificationFilters;
  query?: { refetchInterval?: number; enabled?: boolean };
}, scope?: BranchQueryScope) {
  const { query, request } = getBranchQueryOptions(scope, [...WORKFLOW_NOTIFICATIONS_KEY, options?.params ?? {}]);
  return useQuery<WorkflowNotificationsResponse>({
    ...query,
    queryFn: ({ signal }) => customFetch<WorkflowNotificationsResponse>(`/api/workflow-notifications${toWorkflowQuery(options?.params)}`, { ...request, signal }),
    ...(options?.query ?? {}),
  });
}

export function useMarkWorkflowNotificationRead(scope?: BranchQueryScope) {
  const qc = useQueryClient();
  const { request } = getBranchQueryOptions(scope, WORKFLOW_NOTIFICATIONS_KEY);
  return useMutation<{ success: boolean }, Error, { id: number }>({
    mutationFn: ({ id }) =>
      customFetch(`/api/workflow-notifications/${id}/read`, { ...request, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKFLOW_NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkAllWorkflowNotificationsRead(scope?: BranchQueryScope) {
  const qc = useQueryClient();
  const { request } = getBranchQueryOptions(scope, WORKFLOW_NOTIFICATIONS_KEY);
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      customFetch("/api/workflow-notifications/read-all", { ...request, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKFLOW_NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkNotificationsViewed(scope?: BranchQueryScope) {
  const qc = useQueryClient();
  const { request } = getBranchQueryOptions(scope, NOTIFICATIONS_KEY);
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      customFetch("/api/notifications/mark-viewed", { ...request, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkNotificationRead(scope?: BranchQueryScope) {
  const qc = useQueryClient();
  const { request } = getBranchQueryOptions(scope, NOTIFICATIONS_KEY);
  return useMutation<{ success: boolean }, Error, { alertKey: string }>({
    mutationFn: ({ alertKey }) =>
      customFetch(`/api/notifications/${encodeURIComponent(alertKey)}/read`, {
        ...request,
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useGetAlertHistory(options?: {
  query?: { refetchInterval?: number; enabled?: boolean };
}, scope?: BranchQueryScope) {
  const { query, request } = getBranchQueryOptions(scope, ["notifications", "history"]);
  return useQuery<AlertHistoryResponse>({
    ...query,
    queryFn: ({ signal }) => customFetch<AlertHistoryResponse>("/api/notifications/history", { ...request, signal }),
    ...(options?.query ?? {}),
  });
}

export function useMarkAllNotificationsRead(scope?: BranchQueryScope) {
  const qc = useQueryClient();
  const { request } = getBranchQueryOptions(scope, NOTIFICATIONS_KEY);
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      customFetch("/api/notifications/read-all", { ...request, method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
