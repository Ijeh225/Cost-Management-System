import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "./custom-fetch";

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

export type WorkflowNotification = {
  id: number;
  type: string;
  message: string;
  containerId?: number | null;
  containerNumber?: string | null;
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

export function useGetNotifications<T = NotificationsResponse>(options?: {
  query?: { refetchInterval?: number; enabled?: boolean };
}) {
  return useQuery<T>({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => customFetch<T>("/api/notifications"),
    ...(options?.query ?? {}),
  });
}

export function useGetWorkflowNotifications(options?: {
  query?: { refetchInterval?: number; enabled?: boolean };
}) {
  return useQuery<WorkflowNotificationsResponse>({
    queryKey: WORKFLOW_NOTIFICATIONS_KEY,
    queryFn: () => customFetch<WorkflowNotificationsResponse>("/api/workflow-notifications"),
    ...(options?.query ?? {}),
  });
}

export function useMarkWorkflowNotificationRead() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { id: number }>({
    mutationFn: ({ id }) =>
      customFetch(`/api/workflow-notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKFLOW_NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkAllWorkflowNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      customFetch("/api/workflow-notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WORKFLOW_NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkNotificationsViewed() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      customFetch("/api/notifications/mark-viewed", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, { alertKey: string }>({
    mutationFn: ({ alertKey }) =>
      customFetch(`/api/notifications/${encodeURIComponent(alertKey)}/read`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean }, Error, void>({
    mutationFn: () =>
      customFetch("/api/notifications/read-all", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
}
