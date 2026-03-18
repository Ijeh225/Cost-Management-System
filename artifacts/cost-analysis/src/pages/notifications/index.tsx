import { useState, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetNotifications, useMarkAllNotificationsRead, useMarkNotificationsViewed,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, BellOff, AlertTriangle, TrendingDown, DollarSign,
  Clock, ShieldAlert, ListTodo, Activity, CheckCheck,
  ExternalLink, Loader2, RefreshCw,
} from "lucide-react";

const ALERT_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
  negative_profit: { icon: TrendingDown, color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Negative Profit"   },
  low_margin:      { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Low Profit Margin" },
  high_terminal:   { icon: DollarSign,   color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "High Terminal Cost"},
  high_delivery:   { icon: DollarSign,   color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "High Delivery Cost"},
  unpaid_duty:     { icon: DollarSign,   color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", label: "Unpaid Duty"       },
  delayed:         { icon: Clock,        color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "Delayed Container" },
  aging_warn:      { icon: Clock,        color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "Clearing Delay"    },
  aging_high:      { icon: Clock,        color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Long Delay"        },
  aging_critical:  { icon: Clock,        color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Critical Delay"    },
  inactive:        { icon: Activity,     color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "No Activity"       },
  overdue_task:    { icon: ListTodo,     color: "text-rose-400",   bg: "bg-rose-400/10",   border: "border-rose-400/20",   label: "Overdue Task"      },
  stale_approval:  { icon: ShieldAlert,  color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20", label: "Stale Approval"    },
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

function NotificationRow({ notif }: { notif: Notification }) {
  const cfg = ALERT_CONFIG[notif.type] ?? ALERT_CONFIG.low_margin;
  const sev = SEVERITY_CONFIG[notif.severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 transition-colors ${notif.isRead ? "opacity-60" : "bg-primary/[0.02]"}`}
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
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
          <span className="text-[11px] text-muted-foreground shrink-0">{formatTime(notif.generatedAt)}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{notif.message}</p>
        {notif.containerId && (
          <div className="mt-2">
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

export default function NotificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useGetNotifications({
    query: { refetchInterval: 60_000 },
  });

  const markViewed = useMarkNotificationsViewed();
  const markAll = useMarkAllNotificationsRead();

  const notifications: Notification[] = data?.notifications ?? [];
  const unreadCount: number = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!isLoading && notifications.length > 0) {
      markViewed.mutate(undefined, {
        onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/notifications"] }),
      });
    }
  }, [isLoading]);

  const filtered = notifications.filter(n => {
    if (filter === "unread" && n.isRead) return false;
    if (filter === "read" && !n.isRead) return false;
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    return true;
  });

  const handleMarkAll = () => {
    markAll.mutate(undefined, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ["/api/notifications"] });
        toast({ title: "All notifications marked as read" });
      },
      onError: () => toast({ variant: "destructive", title: "Failed to mark all as read" }),
    });
  };

  const allTypes = Array.from(new Set(notifications.map(n => n.type)));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Notifications
            {unreadCount > 0 && (
              <Badge className="ml-1 text-xs px-2 py-0 bg-primary/20 text-primary border border-primary/30">
                {unreadCount} unread
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Financial alerts, delays, and operational warnings across all containers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-1.5 text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {unreadCount > 0 && (
            <Button
              variant="outline" size="sm"
              onClick={handleMarkAll}
              disabled={markAll.isPending}
              className="gap-1.5 text-xs h-8"
            >
              {markAll.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
          {(["all", "unread", "read"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {f}
              {f === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 bg-primary/20 text-primary text-[10px] px-1.5 rounded-full">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
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
      </div>

      {/* List */}
      <Card className="border-border/50 bg-card/40 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {notifications.length === 0 ? (
              <>
                <BellOff className="w-12 h-12 text-muted-foreground/20 mb-3" />
                <p className="font-medium text-muted-foreground">No alerts</p>
                <p className="text-sm text-muted-foreground/60 mt-1">All containers are within normal parameters.</p>
              </>
            ) : (
              <>
                <Activity className="w-10 h-10 text-muted-foreground/20 mb-3" />
                <p className="text-muted-foreground text-sm">No notifications match this filter.</p>
              </>
            )}
          </div>
        ) : (
          <AnimatePresence>
            {filtered.map(n => (
              <NotificationRow key={n.alertKey} notif={n} />
            ))}
          </AnimatePresence>
        )}
      </Card>

      {filtered.length > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          Showing {filtered.length} of {notifications.length} notifications · Auto-refreshes every 60 seconds
        </p>
      )}
    </motion.div>
  );
}
