import { useState, useMemo, useRef, useEffect } from "react";
import { useGetDashboardStats, useListContainers, useGetIntelligenceAlerts, useGetArLedger, useListBanks, useGetVatLiability } from "@workspace/api-client-react";
import { formatCurrency, formatNumber, getStatusColor, getStatusLabel } from "@/lib/format";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Box, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Activity,
  FileText, CheckCircle2, ArrowRight, ClipboardCheck, ListTodo,
  Brain, ShieldAlert, Clock, ExternalLink, X, ChevronDown, ChevronUp,
  Wallet, CreditCard, ReceiptText, ShieldCheck, Landmark, Percent,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
];

type AlertCfg = {
  icon: React.ElementType;
  color: string;
  accent: string;
  label: string;
  severity: "critical" | "warning" | "info";
};

const ALERT_CONFIG: Record<string, AlertCfg> = {
  negative_profit:      { icon: TrendingDown,  color: "text-red-400",    accent: "border-l-red-500",    label: "Loss-Making",         severity: "critical" },
  low_margin:           { icon: AlertTriangle, color: "text-orange-400", accent: "border-l-orange-500", label: "Low Margin",          severity: "warning"  },
  high_terminal:        { icon: AlertTriangle, color: "text-amber-400",  accent: "border-l-amber-500",  label: "High Terminal Cost",  severity: "warning"  },
  high_delivery:        { icon: AlertTriangle, color: "text-amber-400",  accent: "border-l-amber-500",  label: "High Delivery Cost",  severity: "warning"  },
  unpaid_duty:          { icon: DollarSign,    color: "text-amber-400",  accent: "border-l-amber-500",  label: "Outstanding Duty",    severity: "warning"  },
  delayed:              { icon: Clock,         color: "text-blue-400",   accent: "border-l-blue-500",   label: "Possible Delay",      severity: "info"     },
  stale_approval:       { icon: ShieldAlert,   color: "text-violet-400", accent: "border-l-violet-500", label: "Stale Approval",      severity: "warning"  },
  overdue_task:         { icon: ListTodo,      color: "text-rose-400",   accent: "border-l-rose-500",   label: "Overdue Task",        severity: "warning"  },
  action_overdue:       { icon: ShieldAlert,   color: "text-rose-400",   accent: "border-l-rose-500",   label: "Action Overdue",      severity: "warning"  },
  empty_return_overdue: { icon: AlertTriangle, color: "text-red-400",    accent: "border-l-red-500",    label: "Empty Return Overdue", severity: "critical" },
};

const ALERT_ACTIONS: Record<string, { label: string; href: string }> = {
  stale_approval: { label: "Review Queue", href: "/approvals" },
  overdue_task:   { label: "My Tasks",     href: "/my-tasks"  },
};

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const SEEN_KEY = "intel_alerts_seen_v1";

function alertKey(a: { type: string; containerId?: number | null }) {
  return `${a.type}:${a.containerId ?? "global"}`;
}
function getSeenKey(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; }
}
function setSeenKey(k: string) {
  try { localStorage.setItem(SEEN_KEY, k); } catch {}
}

type RawAlert = {
  type: string;
  severity: string;
  message: string;
  containerId?: number | null;
  containerNumber?: string | null;
};

function AlertBeacon() {
  const { data, isLoading } = useGetIntelligenceAlerts();
  const rawAlerts: RawAlert[] = (data as any)?.alerts ?? [];

  const [open, setOpen] = useState(false);
  const [seenKey, setSeenKeyState] = useState(getSeenKey);
  const panelRef = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...rawAlerts].sort((a, b) => {
      const ao = SEVERITY_ORDER[ALERT_CONFIG[a.type]?.severity ?? "info"] ?? 2;
      const bo = SEVERITY_ORDER[ALERT_CONFIG[b.type]?.severity ?? "info"] ?? 2;
      return ao - bo;
    }),
    [rawAlerts]
  );

  const currentKey = useMemo(
    () => sorted.map(alertKey).join("|"),
    [sorted]
  );

  const isBlinking = !isLoading && sorted.length > 0 && currentKey !== seenKey;
  const hasCritical = sorted.some(a => ALERT_CONFIG[a.type]?.severity === "critical");

  const handleOpen = () => {
    if (!open) {
      setSeenKey(currentKey);
      setSeenKeyState(currentKey);
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (isLoading) return null;

  if (sorted.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 font-medium">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">All systems healthy</span>
      </div>
    );
  }

  const beaconColor = hasCritical
    ? "bg-red-500 border-red-400 shadow-red-500/40"
    : "bg-orange-500 border-orange-400 shadow-orange-500/40";
  const ringColor = hasCritical ? "bg-red-500" : "bg-orange-500";
  const glowColor = hasCritical
    ? "shadow-[0_0_18px_4px_rgba(239,68,68,0.55)]"
    : "shadow-[0_0_18px_4px_rgba(249,115,22,0.55)]";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className={`
          relative flex items-center gap-2.5 px-4 py-2 rounded-xl border
          font-semibold text-sm text-white transition-all duration-200
          ${beaconColor}
          ${isBlinking ? `${glowColor} hover:scale-[1.03] active:scale-[0.97]` : "opacity-90 hover:opacity-100"}
        `}
      >
        {isBlinking && (
          <span className={`absolute inset-0 rounded-xl ${ringColor} animate-ping opacity-30 pointer-events-none`} />
        )}

        <div className="relative w-4 h-4 shrink-0">
          <Brain className="w-4 h-4" />
          {isBlinking && (
            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-white animate-pulse" />
          )}
        </div>

        <span>
          {sorted.length} Alert{sorted.length !== 1 ? "s" : ""}
        </span>

        {hasCritical && (
          <Badge className="text-[10px] px-1.5 py-0 bg-white/20 text-white border-white/30 border">
            Critical
          </Badge>
        )}

        {open ? <ChevronUp className="w-3.5 h-3.5 opacity-70" /> : <ChevronDown className="w-3.5 h-3.5 opacity-70" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="absolute right-0 top-full mt-2 w-[420px] max-w-[90vw] z-50 rounded-xl border border-border/60 bg-card/95 backdrop-blur-md shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/80">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">Intelligence Alerts</span>
                {hasCritical && (
                  <Badge className="text-[10px] px-1.5 py-0 bg-red-500/20 text-red-400 border border-red-500/30">
                    Critical
                  </Badge>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/30">
              {sorted.map((alert) => {
                const cfg = ALERT_CONFIG[alert.type] ?? { icon: AlertTriangle, color: "text-amber-400", accent: "border-l-amber-500", label: alert.type, severity: "warning" as const };
                const Icon = cfg.icon;
                const action = !alert.containerNumber ? ALERT_ACTIONS[alert.type] : null;
                return (
                  <div
                    key={alertKey(alert)}
                    className={`flex items-start gap-3 px-4 py-3.5 border-l-[3px] ${cfg.accent} group hover:bg-accent/20 transition-colors`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-background/60 border border-border/40 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {alert.containerNumber && (
                          <Link
                            href={`/containers/${alert.containerId}`}
                            onClick={() => setOpen(false)}
                            className="text-[11px] font-mono text-muted-foreground hover:text-primary transition-colors flex items-center gap-0.5"
                          >
                            {alert.containerNumber}
                            <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
                          </Link>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.message}</p>
                      {action && (
                        <Link
                          href={action.href}
                          onClick={() => setOpen(false)}
                          className={`inline-flex items-center gap-1 mt-1.5 text-[11px] font-medium ${cfg.color} hover:underline`}
                        >
                          {action.label}
                          <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-2.5 border-t border-border/50 bg-card/60">
              <p className="text-[11px] text-muted-foreground/60 text-center">
                Auto-refreshes every 60 seconds · Click any container to investigate
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, isCurrency = false, colorClass = "" }: {
  title: string;
  value: number;
  icon: React.ElementType;
  isCurrency?: boolean;
  colorClass?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-border/50">
          <Icon className={`h-4 w-4 ${colorClass || "text-muted-foreground group-hover:text-primary"} transition-colors`} />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className={`text-2xl font-bold tracking-tight ${colorClass ? colorClass : "text-foreground"}`}>
          {isCurrency ? formatCurrency(value) : formatNumber(value)}
        </div>
      </CardContent>
    </Card>
  );
}

function TerminalDrillDown({ list, onClose }: {
  list: { id: number; containerNumber: string; blNumber: string; customerName: string; size: string; command: string | null; status: string; gateInDate: string | null }[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-card border border-border/50 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="font-semibold text-sm">Containers in Terminal</h2>
            <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">{list.length}</span>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-accent/50 transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-border/30">
          {list.length === 0 && (
            <div className="py-10 text-center text-muted-foreground text-sm">No containers currently in terminal.</div>
          )}
          {list.map(c => (
            <Link key={c.id} href={`/containers/${c.id}`} onClick={onClose} className="block hover:bg-accent/20 transition-colors px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-foreground">{c.containerNumber}</span>
                    {c.size && <span className="text-[10px] bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded font-medium">{c.size}</span>}
                    {c.command && <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-medium">{c.command}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{c.customerName} · B/L {c.blNumber}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-[10px] font-bold uppercase tracking-wider ${getStatusColor(c.status)}`}>{getStatusLabel(c.status)}</div>
                  {c.gateInDate && (
                    <div className="text-[10px] text-muted-foreground/60 mt-0.5">In: {new Date(c.gateInDate).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}</div>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function DashboardScopeLabel() {
  const { isSuperAdmin, activeBranchId, branches } = useBranchScope();
  if (!isSuperAdmin) return null;
  const label = activeBranchId === "all"
    ? "All Branches — Consolidated"
    : (branches.find((b: { id: number; name: string }) => b.id === activeBranchId)?.name ?? `Branch #${activeBranchId}`);
  return (
    <span className="ml-2 text-[11px] uppercase tracking-wider text-primary/80 font-semibold">
      · Scope: {label}
    </span>
  );
}

function BankBalanceBar() {
  const { data: banks, isLoading } = useListBanks();
  const activeBanks = (banks ?? []).filter((b: any) => b.isActive);
  if (isLoading) return (
    <div className="flex gap-3 overflow-x-auto pb-1">
      {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-44 shrink-0 rounded-xl" />)}
    </div>
  );
  if (!activeBanks.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-thin">
      {activeBanks.map((b: any) => {
        const bal = Number(b.currentBalance ?? 0);
        const isPositive = bal >= 0;
        return (
          <Link key={b.id} href={`/banks/${b.id}`}>
            <div className="shrink-0 min-w-[160px] rounded-xl border border-border/40 bg-card/60 backdrop-blur-sm px-4 py-3 hover:bg-card/80 transition-colors cursor-pointer group">
              <div className="flex items-center gap-2 mb-1">
                <Landmark className="w-3.5 h-3.5 text-primary shrink-0" />
                <p className="text-xs font-medium text-muted-foreground truncate max-w-[120px] group-hover:text-foreground transition-colors">{b.name}</p>
              </div>
              <p className={`text-sm font-bold font-mono tracking-tight ${isPositive ? "text-emerald-400" : "text-destructive"}`}>
                {formatCurrency(bal)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [terminalDrillOpen, setTerminalDrillOpen] = useState(false);

  const { data: stats, isLoading, isError } = useGetDashboardStats();
  const { data: arData } = useGetArLedger();
  const { data: vatLiability } = useGetVatLiability();
  const { data: recentData, isLoading: recentLoading } = useListContainers(
    { page: 1, limit: 5 }
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-border/40 bg-card/50">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-muted-foreground">
        <AlertTriangle className="w-12 h-12 mb-4 text-destructive/50" />
        <p>Failed to load dashboard statistics.</p>
      </div>
    );
  }

  const grossProfit = stats.totalGrossProfit ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Bank balance quick-view bar */}
      <BankBalanceBar />

      {/* Header row: title + alert beacon + search */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              Real-time insights into container logistics and financials.
              <DashboardScopeLabel />
            </p>
          </div>
          <AlertBeacon />
        </div>

      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Containers"       value={stats.totalContainers}        icon={Box} />
        <StatCard title="In Progress"            value={stats.inProgress}             icon={Activity}    colorClass="text-blue-400" />
        <StatCard title="Completed"              value={stats.completed}              icon={CheckCircle2} colorClass="text-emerald-400" />
        <StatCard title="Total Cost"             value={stats.totalCost}              icon={DollarSign}  isCurrency />
        <StatCard title="Total Clearing Charges" value={stats.totalClearingCharges}   icon={FileText}    isCurrency />
        <StatCard
          title="Gross Profit"
          value={grossProfit}
          icon={grossProfit >= 0 ? TrendingUp : TrendingDown}
          isCurrency
          colorClass={grossProfit >= 0 ? "text-emerald-400" : "text-destructive"}
        />
        <StatCard title="Total Invoiced"         value={stats.totalInvoiced ?? 0}     icon={ReceiptText} isCurrency />
        <StatCard title="Total Collected"        value={stats.totalCollected ?? 0}    icon={Wallet}      isCurrency colorClass="text-emerald-400" />
        <StatCard
          title="Outstanding Receivables"
          value={stats.totalOutstanding ?? 0}
          icon={CreditCard}
          isCurrency
          colorClass={(stats.totalOutstanding ?? 0) > 0 ? "text-amber-400" : "text-muted-foreground"}
        />
        {/* Containers in Terminal KPI — clickable drill-down */}
        <button type="button" className="text-left w-full" onClick={() => setTerminalDrillOpen(true)}>
          <Card className="border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm overflow-hidden relative group hover:bg-emerald-500/10 transition-colors h-full cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
              <CardTitle className="text-sm font-medium text-muted-foreground">Containers in Terminal</CardTitle>
              <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-emerald-500/30">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold tracking-tight text-emerald-400">
                {formatNumber(stats.containersInTerminal ?? 0)}
              </div>
              <p className="text-[11px] text-muted-foreground/60 mt-1">Click to view list</p>
            </CardContent>
          </Card>
        </button>
      </div>

      {terminalDrillOpen && (
        <TerminalDrillDown
          list={stats.containersInTerminalList ?? []}
          onClose={() => setTerminalDrillOpen(false)}
        />
      )}

      {/* Role-aware action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {isAdmin && (stats.pendingApprovals ?? 0) > 0 && (
          <Link href="/approvals" className="block">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-4 hover:bg-amber-500/15 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-amber-400 text-sm">Sections Awaiting Approval</div>
                <div className="text-xs text-amber-400/70 mt-0.5">{stats.pendingApprovals} section{(stats.pendingApprovals ?? 0) !== 1 ? "s" : ""} submitted for review</div>
              </div>
              <ArrowRight className="w-4 h-4 text-amber-400/60" />
            </div>
          </Link>
        )}
        {!isAdmin && (stats.myPendingSections ?? 0) > 0 && (
          <Link href="/my-tasks" className="block">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 flex items-center gap-4 hover:bg-blue-500/15 transition-colors cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                <ListTodo className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-blue-400 text-sm">Sections to Submit</div>
                <div className="text-xs text-blue-400/70 mt-0.5">{stats.myPendingSections} section{(stats.myPendingSections ?? 0) !== 1 ? "s" : ""} ready to submit for review</div>
              </div>
              <ArrowRight className="w-4 h-4 text-blue-400/60" />
            </div>
          </Link>
        )}
      </div>

      {/* AR Aging Widget */}
      {arData && (
        <Link href="/accounts-receivable" className="block">
          <Card className="border-border/40 bg-card/40 backdrop-blur-sm hover:bg-card/60 transition-colors cursor-pointer group">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" /> Receivables Aging
              </CardTitle>
              <span className="text-xs text-muted-foreground group-hover:text-primary flex items-center gap-1 transition-colors">
                View full ledger <ArrowRight className="w-3 h-3" />
              </span>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Current", value: arData.aging.current,    color: "text-foreground",  bg: "bg-muted/40" },
                  { label: "30d",     value: arData.aging.days1to30,  color: "text-amber-400",   bg: "bg-amber-500/10" },
                  { label: "60d",     value: arData.aging.days31to60, color: "text-orange-400",  bg: "bg-orange-500/10" },
                  { label: "90d+",    value: arData.aging.days61to90 + arData.aging.days90plus, color: "text-red-500", bg: "bg-red-500/15" },
                ].map(b => (
                  <div key={b.label} className={`rounded-lg p-3 ${b.bg} border border-border/20`}>
                    <div className="text-[10px] text-muted-foreground font-medium mb-1 truncate">{b.label}</div>
                    <div className={`text-sm font-bold ${b.color}`}>{formatCurrency(b.value)}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* VAT Liability Widget — admin only */}
      {isAdmin && vatLiability && (
        <Card className="border-blue-500/25 bg-blue-500/5 backdrop-blur-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Percent className="w-4 h-4 text-blue-400" />
              VAT Liability
              <span className="text-[11px] font-normal text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                {vatLiability.currentQuarter.label}
              </span>
            </CardTitle>
            <Link href="/reports#vat-summary" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
              View VAT Summary <ArrowRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded-lg p-3 bg-blue-500/10 border border-blue-500/20 sm:col-span-2">
                <div className="text-[10px] text-muted-foreground font-medium mb-1">Current Quarter VAT</div>
                <div className="text-xl font-bold font-mono text-blue-400">
                  {formatCurrency(vatLiability.currentQuarter.vatCollected)}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  on {formatCurrency(vatLiability.currentQuarter.taxableAmount)} taxable turnover · {vatLiability.currentQuarter.invoiceCount} invoice{vatLiability.currentQuarter.invoiceCount !== 1 ? "s" : ""}
                </div>
              </div>
              <div className="rounded-lg p-3 bg-muted/30 border border-border/20">
                <div className="text-[10px] text-muted-foreground font-medium mb-1">{new Date().getFullYear()} YTD VAT</div>
                <div className="text-base font-bold font-mono text-foreground">
                  {formatCurrency(vatLiability.currentYearTotal.vatCollected)}
                </div>
              </div>
              <div className="rounded-lg p-3 bg-muted/30 border border-border/20">
                <div className="text-[10px] text-muted-foreground font-medium mb-1">Filing Reminder</div>
                <div className="text-[11px] text-amber-400 font-medium leading-snug mt-0.5">
                  FIRS VAT due 21st of following month
                </div>
              </div>
            </div>
            {/* Monthly breakdown for current quarter */}
            {vatLiability.currentQuarter.months && vatLiability.currentQuarter.months.length > 0 && (
              <div className="mb-3">
                <div className="text-[10px] text-muted-foreground font-medium mb-1.5 uppercase tracking-wider">
                  {vatLiability.currentQuarter.label} — Monthly Breakdown
                </div>
                <div className="flex gap-2">
                  {vatLiability.currentQuarter.months.map(m => (
                    <div key={m.label} className="flex-1 rounded-lg px-3 py-2 bg-blue-500/8 border border-blue-500/15 text-center">
                      <div className="text-[10px] text-muted-foreground font-medium">{m.label}</div>
                      <div className="text-xs font-bold font-mono text-blue-400 mt-0.5">{formatCurrency(m.vatCollected)}</div>
                      <div className="text-[9px] text-muted-foreground/60 mt-0.5">{m.invoiceCount} inv</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Prior-quarter trend chips */}
            {vatLiability.quarters.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {vatLiability.quarters.slice(0, 4).map(q => (
                  <div key={q.label} className={`shrink-0 rounded-lg px-3 py-2 border text-center min-w-[90px] ${q.label === vatLiability.currentQuarter.label ? "bg-blue-500/15 border-blue-500/30" : "bg-muted/20 border-border/20"}`}>
                    <div className="text-[10px] text-muted-foreground font-medium">{q.label}</div>
                    <div className={`text-xs font-bold font-mono mt-0.5 ${q.label === vatLiability.currentQuarter.label ? "text-blue-400" : "text-foreground"}`}>
                      {formatCurrency(q.vatCollected)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Monthly Revenue vs Cost Trend */}
      {(stats.monthlyTrend ?? []).length > 0 && (
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-primary" /> Monthly Revenue vs Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.monthlyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis tickFormatter={(v) => `₦${(v / 1_000_000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={12} width={60} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === "revenue" ? "Revenue" : name === "cost" ? "Total Cost" : "Gross Profit",
                    ]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} formatter={(v) => v === "revenue" ? "Revenue" : v === "cost" ? "Total Cost" : "Gross Profit"} />
                  <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cost" fill="hsl(var(--chart-3))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="grossProfit" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Containers by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.containersByStatus}
                    cx="50%" cy="50%"
                    innerRadius={65} outerRadius={85}
                    paddingAngle={4}
                    dataKey="count" nameKey="status"
                    stroke="none"
                  >
                    {stats.containersByStatus.map((_, index) => (
                      <Cell key={index} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [value, "Containers"]}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/40 bg-card/40 backdrop-blur-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top Customers by Clearing Charges</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.profitByCustomer} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis type="number" tickFormatter={(val) => `₦${(val / 1000000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis dataKey="customer" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted)/0.3)" }}
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number) => [formatCurrency(value), "Charges"]}
                  />
                  <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Containers Table */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" /> Recent Containers
          </CardTitle>
          <Link href="/containers" className="text-xs text-primary hover:underline flex items-center gap-1">
            View All <ArrowRight className="w-3 h-3" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-y border-border/50 bg-secondary/20">
                <tr className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                  <th className="px-6 py-3 text-left font-medium">Container / BL</th>
                  <th className="px-6 py-3 text-left font-medium">Customer</th>
                  <th className="px-6 py-3 text-left font-medium">Size</th>
                  <th className="px-6 py-3 text-left font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Gross Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {recentLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="px-6 py-4"><div className="h-4 bg-muted/50 rounded w-28" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted/50 rounded w-32" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-muted/50 rounded w-12" /></td>
                      <td className="px-6 py-4"><div className="h-5 bg-muted/50 rounded-full w-20" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 bg-muted/50 rounded w-20 ml-auto" /></td>
                    </tr>
                  ))
                ) : recentData?.containers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-muted-foreground text-sm">
                      No containers yet. <Link href="/containers/upload" className="text-primary hover:underline">Upload your first batch</Link>.
                    </td>
                  </tr>
                ) : (
                  recentData?.containers.map((c) => (
                    <Link key={c.id} href={`/containers/${c.id}`} asChild>
                      <tr className="hover:bg-accent/40 cursor-pointer transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-mono font-medium group-hover:text-primary transition-colors">{c.containerNumber}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">BL: {c.blNumber}</div>
                        </td>
                        <td className="px-6 py-4 font-medium">{c.customerName}</td>
                        <td className="px-6 py-4 text-muted-foreground">{c.size || "—"}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border uppercase tracking-wider ${getStatusColor(c.status)}`}>
                            {getStatusLabel(c.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-mono font-semibold ${c.grossProfit < 0 ? "text-destructive" : "text-emerald-400"}`}>
                            {formatCurrency(c.grossProfit)}
                          </span>
                        </td>
                      </tr>
                    </Link>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
