import { useState } from "react";
import { useGetDashboardStats, useListContainers } from "@workspace/api-client-react";
import { formatCurrency, formatNumber, getStatusColor, getStatusLabel } from "@/lib/format";
import { useAuth } from "@/components/layout/auth-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  Box, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Activity,
  FileText, Search, CheckCircle2, ArrowRight, Loader2, ClipboardCheck, ListTodo
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
];

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
      {/* Header + Quick Search */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time insights into container logistics and financials.</p>
        </div>
        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
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

      {/* Alerts */}
      {(stats.alerts.lowProfitContainers > 0 || stats.alerts.outstandingDuty > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.alerts.lowProfitContainers > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-destructive text-sm">Low Profit Margin</h4>
                <p className="text-xs text-destructive/80 mt-1">{stats.alerts.lowProfitContainers} containers have negative or zero profit.</p>
              </div>
            </div>
          )}
          {stats.alerts.outstandingDuty > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-3">
              <DollarSign className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-500 text-sm">Outstanding Duty</h4>
                <p className="text-xs text-amber-500/80 mt-1">{stats.alerts.outstandingDuty} containers have unpaid customs duties.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6 KPI Cards + Role-aware extras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Containers"     value={stats.totalContainers}       icon={Box} />
        <StatCard title="In Progress"          value={stats.inProgress}            icon={Activity} colorClass="text-blue-400" />
        <StatCard title="Completed"            value={stats.completed}             icon={CheckCircle2} colorClass="text-emerald-400" />
        <StatCard title="Total Cost"           value={stats.totalCost}             icon={DollarSign} isCurrency />
        <StatCard title="Total Clearing Charges" value={stats.totalClearingCharges} icon={FileText} isCurrency />
        <StatCard
          title="Gross Profit"
          value={grossProfit}
          icon={grossProfit >= 0 ? TrendingUp : TrendingDown}
          isCurrency
          colorClass={grossProfit >= 0 ? "text-emerald-400" : "text-destructive"}
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
