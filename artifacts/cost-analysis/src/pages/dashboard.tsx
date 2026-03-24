import { useState, useMemo, useRef, useEffect } from "react";
import { useGetDashboardStats, useListContainers, useGetIntelligenceAlerts } from "@workspace/api-client-react";
import { formatCurrency, formatNumber, getStatusColor, getStatusLabel } from "@/lib/format";
import { useAuth } from "@/components/layout/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import {
  Box, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Activity,
  FileText, Search, CheckCircle2, ArrowRight, ClipboardCheck, ListTodo,
  Brain, ShieldAlert, Clock, ExternalLink, X, ChevronDown, ChevronUp,
  Wallet, CreditCard, ReceiptText,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
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
  loss_making:    { icon: TrendingDown,  color: "text-red-400",    accent: "border-l-red-500",    label: "Loss-Making",      severity: "critical" },
  low_profit:     { icon: AlertTriangle, color: "text-orange-400", accent: "border-l-orange-500", label: "Low Margin",       severity: "warning"  },
  overdue_duty:   { icon: DollarSign,    color: "text-amber-400",  accent: "border-l-amber-500",  label: "Outstanding Duty", severity: "warning"  },
  delayed:        { icon: Clock,         color: "text-blue-400",   accent: "border-l-blue-500",   label: "Possible Delay",   severity: "info"     },
  stale_approval: { icon: ShieldAlert,   color: "text-violet-400", accent: "border-l-violet-500", label: "Stale Approval",   severity: "warning"  },
  overdue_task:   { icon: ListTodo,      color: "text-rose-400",   accent: "border-l-rose-500",   label: "Overdue Task",     severity: "warning"  },
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
                const cfg = ALERT_CONFIG[alert.type] ?? ALERT_CONFIG.low_profit;
                const Icon = cfg.icon;
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

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const [searchInput, setSearchInput] = useState("");
  const { isAdmin } = useAuth();

  const { data: stats, isLoading, isError } = useGetDashboardStats();
  const { data: recentData, isLoading: recentLoading } = useListContainers(
    { page: 1, limit: 5 },
    { query: { staleTime: 30000 } }
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      sessionStorage.setItem("containerSearch", searchInput.trim());
      setLocation("/containers");
    }
  };

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
      {/* Header row: title + alert beacon + search */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">Real-time insights into container logistics and financials.</p>
          </div>
          <AlertBeacon />
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full sm:max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Quick search containers…"
              className="pl-9 bg-background border-border/60"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" size="sm" className="shrink-0 hover-elevate">
            Search
          </Button>
        </form>
      </div>

      {/* 9 KPI Cards */}
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
      </div>

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

      {/* Monthly Collections Trend */}
      {(stats.monthlyCollectionsTrend ?? []).length > 0 && (
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-primary" /> Monthly Collections Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.monthlyCollectionsTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis tickFormatter={(v) => `₦${(v / 1_000_000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={12} width={60} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))", borderRadius: "8px" }}
                    formatter={(value: number, name: string) => [formatCurrency(value), name === "invoiced" ? "Invoiced" : "Collected"]}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: "12px" }} formatter={(v) => v === "invoiced" ? "Invoiced" : "Collected"} />
                  <Line type="monotone" dataKey="invoiced" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  <Line type="monotone" dataKey="collected" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                </LineChart>
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
