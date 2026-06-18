import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/layout/auth-provider";
import {
  useGetNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkNotificationsViewed,
  useGetWorkflowNotifications,
  useMarkWorkflowNotificationRead,
  useMarkAllWorkflowNotificationsRead,
  useGetAlertHistory,
  type Notification,
  type WorkflowNotification,
  type AlertHistoryItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Bell, BellOff, AlertTriangle, TrendingDown, DollarSign,
  Clock, ShieldAlert, ListTodo, Activity, CheckCheck,
  ExternalLink, Loader2, RefreshCw, XCircle, Anchor,
  BriefcaseIcon, CheckCircle2, Filter, CalendarRange, ArrowRight,
  History, CheckCircle, Circle, ShieldCheck, FileText, CreditCard,
} from "lucide-react";

// ─── Security Container Info Modal ─────────────────────────────────────────────

type ContainerInfo = {
  containerNumber: string;
  blNumber: string;
  customerName: string;
  vessel: string;
  size: string;
  eta: string | null;
  consignee: string | null;
  berthed: boolean;
  berthingConfirmedAt: string | null;
  berthingConfirmedByName: string | null;
};

function SecurityContainerModal({ containerId, open, onClose }: { containerId: number; open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<ContainerInfo | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !containerId) return;
    setLoading(true);
    setInfo(null);
    fetch(`/api/containers/${containerId}`, { credentials: "include" })
      .then(r => r.json())
      .then(d => setInfo(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, containerId]);

  function fmtDate(iso: string | null | undefined) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-NG", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Container Information
          </DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && info && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Customer</p>
              <p className="text-sm font-bold text-foreground">{info.customerName || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Vessel</p>
              <p className="text-sm font-bold text-foreground">{info.vessel || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Size / Type</p>
              <p className="text-sm font-bold text-foreground">{info.size || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Container No.</p>
              <p className="text-sm font-bold font-mono text-foreground">{info.containerNumber}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">ETA</p>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-foreground">{info.eta ? new Date(info.eta).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</p>
                {info.berthed && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                    <CheckCircle className="w-2.5 h-2.5" /> Berthed
                  </span>
                )}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Consignee</p>
              <p className="text-sm font-bold text-foreground">{info.consignee || "—"}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Berthing Confirmed</p>
              {info.berthingConfirmedAt ? (
                <p className="text-sm font-bold text-emerald-400">
                  {fmtDate(info.berthingConfirmedAt)}{info.berthingConfirmedByName ? ` · by ${info.berthingConfirmedByName}` : ""}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground/60 italic">Not yet confirmed</p>
              )}
            </div>
          </div>
        )}
        {!loading && !info && (
          <p className="text-sm text-muted-foreground text-center py-8">Could not load container details.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Alert type config ─────────────────────────────────────────────────────────

const ALERT_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
  negative_profit:  { icon: TrendingDown,  color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Negative Profit"         },
  low_margin:       { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Low Profit Margin"       },
  high_terminal:    { icon: DollarSign,    color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "High Terminal Cost"      },
  high_delivery:    { icon: DollarSign,    color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "High Delivery Cost"      },
  unpaid_duty:      { icon: DollarSign,    color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/20", label: "Unpaid Duty"             },
  delayed:          { icon: Clock,         color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "Delayed Container"       },
  aging_warn:       { icon: Clock,         color: "text-amber-400",  bg: "bg-amber-400/10",  border: "border-amber-400/20",  label: "Clearing Delay"          },
  aging_high:       { icon: Clock,         color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Long Delay"              },
  aging_critical:   { icon: Clock,         color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Critical Delay"          },
  inactive:         { icon: Activity,      color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "No Activity"             },
  overdue_task:     { icon: ListTodo,      color: "text-rose-400",   bg: "bg-rose-400/10",   border: "border-rose-400/20",   label: "Overdue Task"            },
  stale_approval:   { icon: ShieldAlert,   color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20", label: "Stale Approval"          },
  rejected_section: { icon: XCircle,       color: "text-red-400",    bg: "bg-red-400/10",    border: "border-red-400/20",    label: "Section Rejected"        },
  action_overdue:               { icon: ShieldAlert, color: "text-rose-400",   bg: "bg-rose-400/10",   border: "border-rose-400/20",   label: "Action Overdue"          },
  empty_return_overdue:         { icon: Clock,       color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20", label: "Empty Return Overdue"    },
  berthing_confirmation_needed: { icon: Anchor,      color: "text-blue-400",   bg: "bg-blue-400/10",   border: "border-blue-400/20",   label: "Confirm Berthing"        },
};

const WORKFLOW_TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; border: string; label: string }> = {
  new_job:       { icon: BriefcaseIcon,  color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/20",    label: "New Job"         },
  container_awaiting_verification: { icon: ShieldCheck, color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20", label: "Awaiting Verification" },
  container_verified: { icon: ShieldCheck, color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "Container Verified" },
  berthing_confirmed: { icon: Anchor, color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20", label: "Vessel Berthed" },
  invoice_created: { icon: FileText, color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20", label: "Invoice Created" },
  invoice_paid: { icon: CreditCard, color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/20", label: "Payment Recorded" },
  section_submitted: { icon: ShieldAlert, color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20", label: "Section Submitted" },
  stage_complete:{ icon: CheckCircle2,   color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "Stage Completed" },
  overdue:       { icon: AlertTriangle,  color: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20",     label: "Overdue Stage"   },
  delay_recorded:{ icon: Clock,          color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   label: "Delay Recorded"  },
  payment_schedule_created:     { icon: Bell,          color: "text-blue-400",    bg: "bg-blue-400/10",    border: "border-blue-400/20",    label: "Payment Scheduled" },
  payment_schedule_approved:    { icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "Payment Approved" },
  payment_schedule_rejected:    { icon: XCircle,       color: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20",     label: "Payment Rejected" },
  payment_schedule_paid:        { icon: DollarSign,    color: "text-green-400",   bg: "bg-green-400/10",   border: "border-green-400/20",   label: "Payment Recorded" },
  payment_schedule_completed:   { icon: CheckCheck,    color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", label: "Payment Completed" },
  payment_schedule_rescheduled: { icon: CalendarRange, color: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   label: "Payment Rescheduled" },
  payment_schedule_cancelled:   { icon: XCircle,       color: "text-zinc-400",    bg: "bg-zinc-400/10",    border: "border-zinc-400/20",    label: "Payment Cancelled" },
  payment_schedule_comment:     { icon: Activity,      color: "text-violet-400",  bg: "bg-violet-400/10",  border: "border-violet-400/20",  label: "Payment Comment" },
};

const SEVERITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  warning:  { label: "Warning",  className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  info:     { label: "Info",     className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
};

// ─── URL helpers ───────────────────────────────────────────────────────────────

const FROM = encodeURIComponent("/notifications");

function getAlertUrl(type: string, containerId?: number): string {
  if (!containerId) {
    return type === "stale_approval" ? "/approval-queue" : "/notifications";
  }
  const base = `/containers/${containerId}?from=${FROM}`;
  const ops  = `/operations/${containerId}?from=${FROM}`;
  switch (type) {
    case "high_terminal":              return `${base}&section=terminal`;
    case "high_delivery":              return `${base}&section=delivery`;
    case "empty_return_overdue":       return `${base}&section=delivery`;
    case "unpaid_duty":                return `/duty-payments?focus=${containerId}&from=${FROM}`;
    case "overdue_task":               return `${base}&tab=tasks`;
    case "berthing_confirmation_needed": return `${base}&section=berthing`;
    case "aging_warn":
    case "aging_high":
    case "aging_critical":
    case "inactive":
    case "action_overdue":             return ops;
    case "stale_approval":             return "/approval-queue";
    default:                           return base;
  }
}

function getWorkflowEventUrl(notif: WorkflowNotification): string {
  if (notif.actionUrl) return notif.actionUrl;
  const { type, containerId } = notif;
  if (type.startsWith("payment_schedule_")) return "/payment-schedules";
  if (!containerId) return "/notifications";
  const ops  = `/operations/${containerId}?from=${FROM}`;
  const base = `/containers/${containerId}?from=${FROM}`;
  switch (type) {
    case "new_job":
    case "container_verified":
    case "container_awaiting_verification": return base;
    case "berthing_confirmed": return `${base}&section=berthing`;
    case "invoice_created": return `${base}&tab=charges`;
    case "invoice_paid": return `${base}&tab=payments`;
    case "section_submitted": return base;
    case "stage_complete":
    case "overdue":
    case "delay_recorded": return ops;
    default:        return ops;
  }
}

function getWorkflowActionLabel(notif: WorkflowNotification): string {
  const { type, containerId } = notif;
  if (type.startsWith("payment_schedule_")) return "View Schedule";
  if (!containerId && !notif.actionUrl) return "View";
  switch (type) {
    case "new_job": return "View Job";
    case "container_awaiting_verification": return "Verify Container";
    case "container_verified": return "View Container";
    case "berthing_confirmed": return "View Berthing";
    case "invoice_created": return "View Invoice";
    case "invoice_paid": return "View Payment";
    case "section_submitted": return "View Section";
    default: return "Open Record";
  }
}

function getAlertActionLabel(type: string, containerId?: number): string {
  if (!containerId) return "View";
  switch (type) {
    case "unpaid_duty":   return "Pay Duty";
    case "overdue_task":  return "View Tasks";
    case "stale_approval":return "Approval Queue";
    case "aging_warn":
    case "aging_high":
    case "aging_critical":
    case "inactive":
    case "action_overdue": return "Open in Operations";
    default:               return "View Container";
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function inDateRange(iso: string, from: string, to: string): boolean {
  const d = new Date(iso);
  if (from) { const f = new Date(from); f.setUTCHours(0,0,0,0); if (d < f) return false; }
  if (to)   { const t = new Date(to);   t.setUTCHours(23,59,59,999); if (d > t) return false; }
  return true;
}

// ─── System Alert Row ──────────────────────────────────────────────────────────

function NotificationRow({ notif }: { notif: Notification }) {
  const cfg = ALERT_CONFIG[notif.type] ?? ALERT_CONFIG.low_margin;
  const sev = SEVERITY_CONFIG[notif.severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  const markRead = useMarkNotificationRead();
  const [, navigate] = useLocation();
  const { isSecurityUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (!notif.isRead) markRead.mutate({ alertKey: notif.alertKey });
    if (isSecurityUser && notif.containerId) {
      setModalOpen(true);
    } else {
      navigate(getAlertUrl(notif.type, notif.containerId));
    }
  };

  return (
    <>
      {isSecurityUser && notif.containerId && (
        <SecurityContainerModal
          containerId={notif.containerId}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && handleClick()}
        className={`group flex items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 transition-colors cursor-pointer select-none ${
          notif.isRead ? "opacity-60 hover:opacity-80" : "bg-primary/[0.025] hover:bg-primary/[0.04]"
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
          {notif.containerNumber && !isSecurityUser && (
            <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-3 h-3" />
              {getAlertActionLabel(notif.type, notif.containerId)}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Workflow Event Row ────────────────────────────────────────────────────────

function WorkflowEventRow({ notif }: { notif: WorkflowNotification }) {
  const cfg = WORKFLOW_TYPE_CONFIG[notif.type] ?? WORKFLOW_TYPE_CONFIG.stage_complete;
  const Icon = cfg.icon;
  const markRead = useMarkWorkflowNotificationRead();
  const [, navigate] = useLocation();
  const { isSecurityUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (!notif.isRead) markRead.mutate({ id: notif.id });
    if (isSecurityUser && notif.containerId) {
      setModalOpen(true);
    } else {
      navigate(getWorkflowEventUrl(notif));
    }
  };

  return (
    <>
      {isSecurityUser && notif.containerId && (
        <SecurityContainerModal
          containerId={notif.containerId}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
      <motion.div
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && handleClick()}
        className={`group flex items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 transition-colors cursor-pointer select-none ${
          notif.isRead ? "opacity-60 hover:opacity-80" : "bg-primary/[0.025] hover:bg-primary/[0.04]"
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
          {!isSecurityUser && (
            <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-3 h-3" />
              {notif.type === "new_job" || notif.type === "container_awaiting_verification" ? "View Container" : "Open in Operations"} · {notif.containerNumber}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

// ─── Alert History Row ─────────────────────────────────────────────────────────

function AlertHistoryRow({ item }: { item: AlertHistoryItem }) {
  const cfg = ALERT_CONFIG[item.type] ?? ALERT_CONFIG.low_margin;
  const sev = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.info;
  const Icon = cfg.icon;
  const [, navigate] = useLocation();
  const { isSecurityUser } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = () => {
    if (isSecurityUser && item.containerId) {
      setModalOpen(true);
    } else {
      navigate(getAlertUrl(item.type, item.containerId ?? undefined));
    }
  };

  return (
    <>
      {isSecurityUser && item.containerId && (
        <SecurityContainerModal
          containerId={item.containerId}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
      <motion.div
        layout
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === "Enter" && handleClick()}
        className={`group flex items-start gap-4 px-5 py-4 border-b border-border/40 last:border-0 transition-colors cursor-pointer select-none ${
          item.isResolved ? "opacity-50 hover:opacity-70" : "hover:bg-primary/[0.025]"
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
              {item.isResolved ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
                  <CheckCircle className="w-2.5 h-2.5" /> Resolved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                  <Circle className="w-2.5 h-2.5 fill-amber-400" /> Active
                </span>
              )}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-muted-foreground">First seen: {formatTime(item.firstSeenAt)}</p>
              <p className="text-[11px] text-muted-foreground">Last seen: {formatTime(item.lastSeenAt)}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.message}</p>
          {!isSecurityUser && (
            <div className="mt-2 flex items-center gap-1 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-3 h-3" />
              {getAlertActionLabel(item.type, item.containerId ?? undefined)}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab,          setTab]          = useState<"system" | "workflow">("system");
  const [systemView,   setSystemView]   = useState<"active" | "history">("active");
  const [filter,       setFilter]       = useState<"all" | "unread" | "read">("all");
  const [typeFilter,   setTypeFilter]   = useState<string>("all");
  const [dateFrom,     setDateFrom]     = useState<string>("");
  const [dateTo,       setDateTo]       = useState<string>("");
  const [historyResFilter, setHistoryResFilter] = useState<"all" | "active" | "resolved">("all");

  const { data, isLoading, refetch, isFetching } = useGetNotifications({
    query: { refetchInterval: 30_000 },
  });
  const { data: wfData, isLoading: wfLoading, refetch: wfRefetch, isFetching: wfFetching } = useGetWorkflowNotifications({
    query: { refetchInterval: 30_000 },
  });
  const { data: historyData, isLoading: historyLoading, refetch: historyRefetch, isFetching: historyFetching } = useGetAlertHistory({
    query: { refetchInterval: 60_000 },
  });

  const markAll         = useMarkAllNotificationsRead();
  const markViewed      = useMarkNotificationsViewed();
  const markAllWorkflow = useMarkAllWorkflowNotificationsRead();

  useEffect(() => { markViewed.mutate(); }, []);

  const notifications: Notification[]           = data?.notifications    ?? [];
  const wfNotifications: WorkflowNotification[] = wfData?.notifications  ?? [];
  const unreadCount   = data?.unreadCount    ?? 0;
  const wfUnreadCount = wfData?.unreadCount  ?? 0;

  const filteredSystem = notifications.filter(n => {
    if (filter === "unread" && n.isRead) return false;
    if (filter === "read" && !n.isRead)  return false;
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (!inDateRange(n.generatedAt, dateFrom, dateTo)) return false;
    return true;
  });

  const filteredWorkflow = wfNotifications.filter(n => {
    if (filter === "unread" && n.isRead) return false;
    if (filter === "read" && !n.isRead)  return false;
    if (typeFilter !== "all" && n.type !== typeFilter) return false;
    if (!inDateRange(n.createdAt, dateFrom, dateTo)) return false;
    return true;
  });

  const handleMarkAll = () => {
    if (tab === "system") {
      markAll.mutate(undefined, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifications"] }); toast({ title: "All system alerts marked as read" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to mark all as read" }),
      });
    } else {
      markAllWorkflow.mutate(undefined, {
        onSuccess: () => { qc.invalidateQueries({ queryKey: ["workflow-notifications"] }); toast({ title: "All workflow events marked as read" }); },
        onError: () => toast({ variant: "destructive", title: "Failed to mark all as read" }),
      });
    }
  };

  const clearDateFilter = () => { setDateFrom(""); setDateTo(""); };
  const hasDateFilter   = !!(dateFrom || dateTo);
  const currentUnread   = tab === "system" ? unreadCount : wfUnreadCount;
  const currentLoading  = tab === "system" ? isLoading : wfLoading;
  const currentFetching = tab === "system" ? isFetching : wfFetching;
  const displayedItems  = tab === "system" ? filteredSystem.length : filteredWorkflow.length;
  const totalItems      = tab === "system" ? notifications.length  : wfNotifications.length;
  const allTypes        = Array.from(new Set((tab === "system" ? notifications.map(n => n.type) : wfNotifications.map(n => n.type)).sort()));

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
            Click any alert to go directly to the related issue. Alerts auto-refresh every 30 seconds.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => tab === "system" ? refetch() : wfRefetch()} disabled={currentFetching} className="gap-1.5 text-xs h-8">
            <RefreshCw className={`w-3.5 h-3.5 ${currentFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {currentUnread > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAll} disabled={markAll.isPending || markAllWorkflow.isPending} className="gap-1.5 text-xs h-8">
              {(markAll.isPending || markAllWorkflow.isPending) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-3 border-b border-border/50 pb-1">
        <button
          onClick={() => { setTab("system"); setTypeFilter("all"); }}
          className={`flex items-center gap-2 px-1 pb-2 text-sm font-medium border-b-2 transition-colors ${tab === "system" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          System Alerts
          {unreadCount > 0 && (
            <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">{unreadCount}</span>
          )}
        </button>
        <button
          onClick={() => { setTab("workflow"); setTypeFilter("all"); }}
          className={`flex items-center gap-2 px-1 pb-2 text-sm font-medium border-b-2 transition-colors ${tab === "workflow" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          Workflow History
          {wfUnreadCount > 0 && (
            <span className="text-[10px] bg-primary/80 text-white rounded-full px-1.5 py-0.5 leading-none font-bold">{wfUnreadCount}</span>
          )}
        </button>
      </div>

      {/* System Alerts sub-view toggle */}
      {tab === "system" && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            <button
              onClick={() => setSystemView("active")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${systemView === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Bell className="w-3 h-3" />
              Active Alerts
              {unreadCount > 0 && (
                <span className="bg-red-500/20 text-red-400 text-[10px] px-1.5 rounded-full">{unreadCount}</span>
              )}
            </button>
            <button
              onClick={() => setSystemView("history")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${systemView === "history" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              <History className="w-3 h-3" />
              History
              {(historyData?.total ?? 0) > 0 && (
                <span className="bg-secondary text-muted-foreground text-[10px] px-1.5 rounded-full">{historyData?.total}</span>
              )}
            </button>
          </div>

          {systemView === "history" && (
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1 ml-auto">
              {(["all", "active", "resolved"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryResFilter(f)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${historyResFilter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters (active view only) */}
      {!(tab === "system" && systemView === "history") && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-1">
            {(["all", "unread", "read"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all capitalize ${filter === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {f}
                {f === "unread" && currentUnread > 0 && (
                  <span className="ml-1.5 bg-primary/20 text-primary text-[10px] px-1.5 rounded-full">{currentUnread}</span>
                )}
              </button>
            ))}
          </div>

          {tab === "system" || tab === "workflow" ? (
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 text-xs w-44 bg-card/50 border-border/50">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{tab === "system" ? "All alert types" : "All workflow types"}</SelectItem>
                {allTypes.map(t => (
                  <SelectItem key={t} value={t}>{tab === "system" ? (ALERT_CONFIG[t]?.label ?? t) : (WORKFLOW_TYPE_CONFIG[t]?.label ?? t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <div className="flex items-center gap-1.5 ml-auto">
            <CalendarRange className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36 bg-card/50 border-border/50" title="From date" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 text-xs w-36 bg-card/50 border-border/50" title="To date" />
            {hasDateFilter && (
              <Button variant="ghost" size="sm" onClick={clearDateFilter} className="h-8 px-2 text-xs text-muted-foreground" title="Clear date filter">
                <Filter className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* List */}
      {tab === "system" && systemView === "history" ? (
        /* ── History view ── */
        (() => {
          const allHistory = historyData?.alerts ?? [];
          const filtered = allHistory.filter(a => {
            if (historyResFilter === "active"   && a.isResolved)  return false;
            if (historyResFilter === "resolved" && !a.isResolved) return false;
            return true;
          });
          return (
            <Card className="border-border/50 bg-card/40 overflow-hidden">
              {historyLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-7 h-7 animate-spin text-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <History className="w-12 h-12 text-muted-foreground/20 mb-3" />
                  <p className="font-medium text-muted-foreground">No alert history yet</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">
                    Alerts are recorded here the first time they are detected. Check back after the next refresh.
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => historyRefetch()} disabled={historyFetching} className="mt-3 gap-1.5 text-xs">
                    <RefreshCw className={`w-3.5 h-3.5 ${historyFetching ? "animate-spin" : ""}`} />
                    Refresh history
                  </Button>
                </div>
              ) : (
                <AnimatePresence>
                  {filtered.map(a => <AlertHistoryRow key={a.alertKey} item={a} />)}
                </AnimatePresence>
              )}
              {filtered.length > 0 && (
                <div className="px-5 py-3 border-t border-border/30 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    Showing {filtered.length} of {allHistory.length} records
                    {" · "}
                    <span className="text-emerald-400">{allHistory.filter(a => a.isResolved).length} resolved</span>
                    {" · "}
                    <span className="text-amber-400">{allHistory.filter(a => !a.isResolved).length} active</span>
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => historyRefetch()} disabled={historyFetching} className="gap-1.5 text-xs h-7">
                    <RefreshCw className={`w-3 h-3 ${historyFetching ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>
              )}
            </Card>
          );
        })()
      ) : (
        /* ── Active / Workflow view ── */
        <>
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
                      {tab === "system" ? "No system alerts" : "No workflow history yet"}
                    </p>
                    <p className="text-sm text-muted-foreground/60 mt-1">
                      {tab === "system"
                        ? "All containers are within normal parameters."
                        : "Events appear here as containers move through stages and payment schedules are approved or paid."}
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
                  ? filteredSystem.map(n   => <NotificationRow   key={n.alertKey} notif={n} />)
                  : filteredWorkflow.map(n => <WorkflowEventRow  key={n.id}       notif={n} />)
                }
              </AnimatePresence>
            )}
          </Card>

          {displayedItems > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Showing {displayedItems} of {totalItems} {tab === "system" ? "alerts" : "events"}
              {hasDateFilter && " · Date filter active"}
              {" · Auto-refreshes every 30 s"}
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}
