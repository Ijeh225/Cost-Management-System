import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationsViewed,
  useGetWorkflowNotifications,
  useMarkWorkflowNotificationRead,
  useMarkAllWorkflowNotificationsRead,
  type Notification,
  type WorkflowNotification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, BellOff, AlertTriangle, TrendingDown, DollarSign,
  Clock, ShieldAlert, ListTodo, Activity, CheckCheck,
  ExternalLink, Loader2, RefreshCw, XCircle, Anchor,
  BriefcaseIcon, CheckCircle2, Filter, CalendarRange,
} from "lucide-react";

const ALERT_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
  negative_profit:  { icon: TrendingDown,  color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Negative Profit"    },
  low_margin:       { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Low Profit Margin"  },
  high_terminal:    { icon: DollarSign,    color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "High Terminal Cost" },
  high_delivery:    { icon: DollarSign,    color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "High Delivery Cost" },
  unpaid_duty:      { icon: DollarSign,    color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", label: "Unpaid Duty"        },
  delayed:          { icon: Clock,         color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "Delayed Container"  },
  aging_warn:       { icon: Clock,         color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "Clearing Delay"     },
  aging_high:       { icon: Clock,         color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Long Delay"         },
  aging_critical:   { icon: Clock,         color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Critical Delay"     },
  inactive:         { icon: Activity,      color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "No Activity"        },
  overdue_task:     { icon: ListTodo,      color: "text-rose-400",   bg: "bg-rose-400/10",   border: "border-rose-400/20",   label: "Overdue Task"       },
  stale_approval:   { icon: ShieldAlert,   color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20", label: "Stale Approval"     },
  rejected_section: { icon: XCircle,       color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Section Rejected"   },
  action_overdue:               { icon: ShieldAlert, color: "text-rose-400",   bg: "bg-rose-400/10",   border: "border-rose-400/20",   label: "Action Overdue"          },
  empty_return_overdue:         { icon: Clock,       color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Empty Return Overdue"    },
  berthing_confirmation_needed: { icon: Anchor,      color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "Confirm Berthing"        },
};

const WORKFLOW_TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
  new_job:       { icon: BriefcaseIcon,  color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/20",    label: "New Job"          },
  stage_complete:{ icon: CheckCircle2,   color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "Stage Completed"  },
  overdue:       { icon: AlertTriangle,  color: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20",     label: "Overdue Stage"    },
  delay_recorded:{ icon: Clock,          color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   label: "Delay Recorded"   },
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  warning:  { label: "Warning",  className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  info:     { label: "Info",     className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso);
  if (from) {
    const f = new Date(from); f.setUTCHours(0, 0, 0, 0);
    if (d < f) return false;
  }
  if (to) {
    const t = new Date(to); t.setUTCHours(23, 59, 59, 999);
    if (d > t) return false;
  }
  return true;
}

function NotificationRow({ notif }: { notif: Notification }) {
  const cfg = ALERT_CONFIG[notif.type] ?? ALERT_CONFIG.low_margin;
  const sev = SEVERITY_CONFIG[notif.severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  const markRead = useMarkNotificationRead();

  const handleRowClick = () => {
    if (!notif.isRead) markRead.mutate({ alertKey: notif.alertKey });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleRowClick}
      className={`group flex items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 transition-colors cursor-pointer ${
        notif.isRead ? "opacity-55 hover:opacity-70" : "bg-primary/[0.025] hover:bg-primary/[0.04]"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg} ${cfg.border} border`}>
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{cfg.label}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${sev.className}`}>{sev.label}</Badge>
            {!notif.isRead && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground">{formatTime(notif.generatedAt)}</span>
            {markRead.isPending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
        {notif.containerId && (
          <div className="mt-2" onClick={e => e.stopPropagation()}>
            <Link href={`/containers/${notif.containerId}`}>
              <span className="flex items-center gap-1 text-xs text-primary hover:underline w-fit">
                View container {notif.containerNumber && `· ${notif.containerNumber}`}
                <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function WorkflowEventRow({ notif }: { notif: WorkflowNotification }) {
  const cfg = WORKFLOW_TYPE_CONFIG[notif.type] ?? WORKFLOW_TYPE_CONFIG.stage_complete;
  const Icon = cfg.icon;
  const markRead = useMarkWorkflowNotificationRead();

  const handleRowClick = () => {
    if (!notif.isRead) markRead.mutate({ id: notif.id });
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleRowClick}
      className={`group flex items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 transition-colors cursor-pointer ${
        notif.isRead ? "opacity-55 hover:opacity-70" : "bg-primary/[0.025] hover:bg-primary/[0.04]"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg} ${cfg.border} border`}>
        <Icon className={`w-4 h-4 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{cfg.label}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              Workflow Event
            </Badge>
            {!notif.isRead && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" aria-label="Unread" />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-muted-foreground">{formatTime(notif.createdAt)}</span>
            {markRead.isPending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
        {notif.containerId && (
          <div className="mt-2" onClick={e => e.stopPropagation()}>
            <Link href={`/operations/${notif.containerId}`}>
              <span className="flex items-center gap-1 text-xs text-primary hover:underline w-fit">
                View in Operations {notif.containerNumber && `· ${notif.containerNumber}`}
                <ExternalLink className="w-3 h-3" />
              </span>
            </Link>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function NotificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab,        setTab]        = useState<"system" | "workflow">("system");
  const [filter,     setFilter]     = useState<"all" | "unread" | "read">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [dateFrom,   setDateFrom]   = useState<string>("");
  const [dateTo,     setDateTo]     = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useGetNotifications({
    query: { refetchInterval: 30_000 },
  });
  const { data: wfData, isLoading: wfLoading, refetch: wfRefetch, isFetching: wfFetching } = useGetWorkflowNotifications({
    query: { refetchInterval: 30_000 },
  });

  const markAll        = useMarkAllNotificationsRead();
  const markViewed     = useMarkNotificationsViewed();
  const markAllWorkflow = useMarkAllWorkflowNotificationsRead();

  useEffect(() => {
    markViewed.mutate();
  }, []);

  const notifications: Notification[]       = data?.notifications ?? [];
  const wfNotifications: WorkflowNotification[] = wfData?.notifications ?? [];

  const unreadCount   = data?.unreadCount ?? 0;
  const wfUnreadCount = wfData?.unreadCount ?? 0;

  const filteredSystem = notifications.filter(n => {
    if (filter === "unread" && n.isRead) return false;
    if (filter === "read" && !n.isRead) return false;
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (!inDateRange(n.generatedAt, dateFrom, dateTo)) return false;
    return true;
  });

  const filteredWorkflow = wfNotifications.filter(n => {
    if (filter === "unread" && n.isRead) return false;
    if (filter === "read" && !n.isRead) return false;
    if (!inDateRange(n.createdAt, dateFrom, dateTo)) return false;
    return true;
  });

  const handleMarkAll = () => {
    if (tab === "system") {
      markAll.mutate(undefined, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          toast({ title: "All system alerts marked as read" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to mark all as read" }),
      });
    } else {
      markAllWorkflow.mutate(undefined, {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: ["workflow-notifications"] });
          toast({ title: "All workflow events marked as read" });
        },
        onError: () => toast({ variant: "destructive", title: "Failed to mark all as read" }),
      });
    }
  };

  const clearDateFilter = () => { setDateFrom(""); setDateTo(""); };
  const hasDateFilter = dateFrom || dateTo;
  const currentUnread = tab === "system" ? unreadCount : wfUnreadCount;
  const currentLoading = tab === "system" ? isLoading : wfLoading;
  const currentFetching = tab === "system" ? isFetching : wfFetching;

  const allTypes = Array.from(new Set(notifications.map(n => n.type)));
  const displayedItems = tab === "system" ? filteredSystem.length : filteredWorkflow.length;
  const totalItems = tab === "system" ? notifications.length : wfNotifications.length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Notifications
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Financial alerts, delays, and operational warnings across all containers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => tab === "system" ? refetch() : wfRefetch()}
            disabled={currentFetching}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${currentFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {currentUnread > 0 && (
            <Button
              variant="outline" size="sm"
              onClick={handleMarkAll}
              disabled={markAll.isPending || markAllWorkflow.isPending}
              className="gap-1.5 text-xs h-8"
            >
              {(markAll.isPending || markAllWorkflow.isPending)
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <CheckCheck className="w-3.5 h-3.5" />
              }
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-3 border-b border-border/50 pb-1">
        <button
          onClick={() => { setTab("system"); setTypeFilter("all"); }}
          className={`flex items-center gap-2 px-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "system"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          System Alerts
          {unreadCount > 0 && (
            <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => { setTab("workflow"); setTypeFilter("all"); }}
          className={`flex items-center gap-2 px-1 pb-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "workflow"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Workflow Events
          {wfUnreadCount > 0 && (
            <span className="text-[10px] bg-primary/80 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">
              {wfUnreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Read/Unread toggle */}
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
          {(["all", "unread", "read"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${
                filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
              {f === "unread" && currentUnread > 0 && (
                <span className="ml-1.5 bg-primary/20 text-primary text-[10px] px-1.5 rounded-full">{currentUnread}</span>
              )}
            </button>
          ))}
        </div>

        {/* Type filter — system alerts only */}
        {tab === "system" && (
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 text-xs w-44 bg-card/50 border-border/50">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All alert types</SelectItem>
              {allTypes.map(t => (
                <SelectItem key={t} value={t}>{ALERT_CONFIG[t]?.label ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date range filter */}
        <div className="flex items-center gap-1.5 ml-auto">
          <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="h-8 text-xs w-36 bg-card/50 border-border/50"
            title="From date"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="h-8 text-xs w-36 bg-card/50 border-border/50"
            title="To date"
          />
          {hasDateFilter && (
            <Button
              variant="ghost" size="sm"
              onClick={clearDateFilter}
              className="h-8 px-2 text-xs text-muted-foreground"
              title="Clear date filter"
            >
              <Filter className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Notification list */}
      <Card className="border-border/50 bg-card/40 overflow-hidden">
        {currentLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : displayedItems === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {totalItems === 0 ? (
              <>
                <BellOff className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="font-medium text-muted-foreground">
                  {tab === "system" ? "No system alerts" : "No workflow events yet"}
                </p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {tab === "system"
                    ? "All containers are within normal parameters."
                    : "Workflow events appear here as containers move through stages."}
                </p>
              </>
            ) : (
              <>
                <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No notifications match the current filters.</p>
                {hasDateFilter && (
                  <Button variant="ghost" size="sm" onClick={clearDateFilter} className="mt-2 text-xs gap-1.5">
                    <Filter className="w-3 h-3" /> Clear date filter
                  </Button>
                )}
              </>
            )}
          </div>
        ) : (
          <AnimatePresence>
            {tab === "system"
              ? filteredSystem.map(n => <NotificationRow key={n.alertKey} notif={n} />)
              : filteredWorkflow.map(n => <WorkflowEventRow key={n.id} notif={n} />)
            }
          </AnimatePresence>
        )}
      </Card>

      {displayedItems > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {displayedItems} of {totalItems} {tab === "system" ? "alerts" : "events"}
          {hasDateFilter && " · Date filter active"}
          {" · Auto-refreshes every 30 seconds"}
        </p>
      )}
    </motion.div>
  );
}
