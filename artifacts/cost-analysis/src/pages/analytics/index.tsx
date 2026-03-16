import { useEffect } from "react";
import { useGetAnalytics } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, BarChart2, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Box, Users, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line, ReferenceLine,
} from "recharts";

const SECTION_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(220 70% 50%)",
];

const PROFIT_COLOR    = "hsl(142 71% 45%)";
const LOSS_COLOR      = "hsl(0 84% 60%)";
const REVENUE_COLOR   = "hsl(var(--primary))";
const COST_COLOR      = "hsl(var(--chart-2))";

function KpiCard({ title, value, sub, icon: Icon, colorClass = "" }: {
  title: string; value: string; sub?: string; icon: React.ElementType; colorClass?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-border/50">
          <Icon className={`h-4 w-4 ${colorClass || "text-muted-foreground group-hover:text-primary"} transition-colors`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tracking-tight ${colorClass || "text-foreground"}`}>{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const customTooltipStyle = {
  backgroundColor: "hsl(var(--card))",
  borderColor: "hsl(var(--border))",
  borderRadius: "8px",
  fontSize: "12px",
};

export default function AnalyticsPage() {
  const { isAdmin, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (!authLoading && !isAdmin) setLocation("/"); }, [isAdmin, authLoading]);
  const { data, isLoading, isError } = useGetAnalytics();

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  if (isError || !data) return (
    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
      <AlertTriangle className="w-10 h-10 text-destructive/50" />
      <p>Failed to load analytics data.</p>
    </div>
  );

  const { summary, profitByCustomer, costBySection, profitByVessel, monthlyTrend, negativeProfitContainers, staffProductivity } = data as any;

  const isProfitable = (summary.grossProfit ?? 0) >= 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" /> Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Financial performance, cost breakdown, and staff productivity.</p>
        </div>
        <Link href="/reports">
          <button className="text-xs text-primary hover:underline flex items-center gap-1">
            View Reports <ArrowRight className="w-3 h-3" />
          </button>
        </Link>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard title="Containers" value={String(summary.containerCount ?? 0)} icon={Box} />
        <KpiCard title="Total Revenue" value={formatCurrency(summary.totalRevenue ?? 0)} icon={DollarSign} colorClass="text-primary" />
        <KpiCard title="Total Cost" value={formatCurrency(summary.totalCost ?? 0)} icon={DollarSign} colorClass="text-orange-400" />
        <KpiCard
          title="Gross Profit"
          value={formatCurrency(summary.grossProfit ?? 0)}
          icon={isProfitable ? TrendingUp : TrendingDown}
          colorClass={isProfitable ? "text-emerald-400" : "text-destructive"}
        />
        <KpiCard
          title="Profit Margin"
          value={`${summary.profitMargin ?? 0}%`}
          icon={isProfitable ? TrendingUp : TrendingDown}
          colorClass={isProfitable ? "text-emerald-400" : "text-destructive"}
        />
      </div>

      {/* Row 1: Cost by Section + Monthly Trend */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cost by Section — Pie */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Cost by Section</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={costBySection}
                    cx="50%" cy="45%"
                    innerRadius={60} outerRadius={85}
                    paddingAngle={3}
                    dataKey="cost"
                    nameKey="section"
                    stroke="none"
                    label={({ section, pct }) => pct > 5 ? `${pct}%` : ""}
                    labelLine={false}
                  >
                    {costBySection?.map((_: any, i: number) => (
                      <Cell key={i} fill={SECTION_COLORS[i % SECTION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => [formatCurrency(v), "Cost"]} />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend — Line */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Monthly Revenue vs Cost</CardTitle>
          </CardHeader>
          <CardContent>
            {monthlyTrend?.length === 0 ? (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No monthly data yet.</div>
            ) : (
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis tickFormatter={(v) => `₦${(v / 1000000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Line type="monotone" dataKey="revenue" stroke={REVENUE_COLOR} name="Revenue" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="cost" stroke={COST_COLOR} name="Cost" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="grossProfit" stroke={PROFIT_COLOR} name="Profit" strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3 }} />
                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Profit by Customer */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Profit / Loss by Customer</CardTitle>
        </CardHeader>
        <CardContent>
          {profitByCustomer?.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No data yet.</p>
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitByCustomer} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis type="number" tickFormatter={(v) => `₦${(v / 1000000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis dataKey="customer" type="category" width={110} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="revenue" fill={REVENUE_COLOR} name="Revenue" radius={[0, 2, 2, 0]} />
                  <Bar dataKey="grossProfit" name="Gross Profit"
                    fill={PROFIT_COLOR}
                    radius={[0, 2, 2, 0]}
                    label={{ position: "right", formatter: (v: number) => v < 0 ? "LOSS" : "", fontSize: 10, fill: LOSS_COLOR }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Row 3: Negative Profit + Staff Productivity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Negative Profit Containers */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Loss-Making Containers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!negativeProfitContainers?.length ? (
              <div className="px-6 py-10 text-center text-sm text-emerald-500">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                All containers are profitable!
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {negativeProfitContainers.map((c: any) => (
                  <Link key={c.id} href={`/containers/${c.id}`}>
                    <div className="flex items-center justify-between px-5 py-3 hover:bg-accent/30 transition-colors cursor-pointer group">
                      <div>
                        <div className="font-mono text-sm font-medium group-hover:text-primary transition-colors">{c.containerNumber}</div>
                        <div className="text-xs text-muted-foreground">{c.customerName}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-destructive">{formatCurrency(c.grossProfit)}</div>
                        <div className="text-[10px] text-muted-foreground">Rev: {formatCurrency(c.clearingCharges)}</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Productivity */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Staff Productivity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!staffProductivity?.length ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">No staff data yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-2.5 text-left font-medium">Staff</th>
                      <th className="px-4 py-2.5 text-center font-medium">Containers</th>
                      <th className="px-4 py-2.5 text-center font-medium">Submitted</th>
                      <th className="px-4 py-2.5 text-center font-medium">Approved</th>
                      <th className="px-4 py-2.5 text-center font-medium">Rejected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {staffProductivity.map((s: any) => (
                      <tr key={s.userId} className="hover:bg-accent/30 transition-colors">
                        <td className="px-5 py-3 font-medium">{s.name}</td>
                        <td className="px-4 py-3 text-center font-mono">{s.containersAssigned}</td>
                        <td className="px-4 py-3 text-center font-mono text-amber-400">{s.sectionsSubmitted}</td>
                        <td className="px-4 py-3 text-center font-mono text-emerald-400">{s.sectionsApproved}</td>
                        <td className="px-4 py-3 text-center font-mono text-destructive">{s.sectionsRejected}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profit by Vessel */}
      {profitByVessel?.length > 0 && (
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Revenue by Vessel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={profitByVessel} margin={{ top: 5, right: 20, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="vessel" stroke="hsl(var(--muted-foreground))" fontSize={11} angle={-30} textAnchor="end" />
                  <YAxis tickFormatter={(v) => `₦${(v / 1000000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip contentStyle={customTooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="revenue" fill={REVENUE_COLOR} name="Revenue" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="grossProfit" fill={PROFIT_COLOR} name="Gross Profit" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
