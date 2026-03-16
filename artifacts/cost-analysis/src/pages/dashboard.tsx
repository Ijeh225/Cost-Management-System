import { useGetDashboardStats } from "@workspace/api-client-react";
import { formatCurrency, formatNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { Box, Anchor, ArrowRight, AlertTriangle, TrendingUp, TrendingDown, DollarSign, Activity, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion } from "framer-motion";

const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

export default function Dashboard() {
  const { data: stats, isLoading, isError } = useGetDashboardStats();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-border/40 bg-card/50">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-border/40"><CardContent className="h-[300px] p-6 flex items-center justify-center"><Skeleton className="h-full w-full" /></CardContent></Card>
          <Card className="border-border/40"><CardContent className="h-[300px] p-6 flex items-center justify-center"><Skeleton className="h-full w-full" /></CardContent></Card>
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

  const StatCard = ({ title, value, icon: Icon, isCurrency = false, trend }: any) => (
    <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden relative group">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center border border-border/50">
          <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </CardHeader>
      <CardContent className="relative z-10">
        <div className="text-2xl font-bold tracking-tight text-foreground">
          {isCurrency ? formatCurrency(value) : formatNumber(value)}
        </div>
        {trend !== undefined && (
          <p className={`text-xs mt-1 font-medium flex items-center gap-1 ${trend >= 0 ? "text-emerald-500" : "text-destructive"}`}>
            {trend >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}% from last month
          </p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Overview</h1>
          <p className="text-muted-foreground mt-1">Real-time insights into container logistics and financial performance.</p>
        </div>
        <Link href="/containers" className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium transition-colors bg-primary/10 text-primary border border-primary/20 rounded-md hover:bg-primary/20 hover-elevate">
          View All Containers <ArrowRight className="ml-2 w-4 h-4" />
        </Link>
      </div>

      {/* Alerts Section */}
      {(stats.alerts.lowProfitContainers > 0 || stats.alerts.outstandingDuty > 0 || stats.alerts.delayedContainers > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {stats.alerts.lowProfitContainers > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-4">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-destructive text-sm">Low Profit Margin</h4>
                <p className="text-xs text-destructive/80 mt-1">{stats.alerts.lowProfitContainers} containers currently flag a negative or zero profit margin.</p>
              </div>
            </div>
          )}
          {stats.alerts.outstandingDuty > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 flex items-start gap-4">
              <DollarSign className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-amber-500 text-sm">Outstanding Duty</h4>
                <p className="text-xs text-amber-500/80 mt-1">{stats.alerts.outstandingDuty} containers have unpaid customs duties.</p>
              </div>
            </div>
          )}
          {stats.alerts.delayedContainers > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 flex items-start gap-4">
              <Activity className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-blue-500 text-sm">Process Delays</h4>
                <p className="text-xs text-blue-500/80 mt-1">{stats.alerts.delayedContainers} containers stuck in current status for 5+ days.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Containers" value={stats.inProgress} icon={Box} />
        <StatCard title="Total Cost" value={stats.totalCost} icon={DollarSign} isCurrency />
        <StatCard title="Clearing Charges" value={stats.totalClearingCharges} icon={FileText} isCurrency />
        <StatCard title="Gross Profit" value={stats.totalGrossProfit} icon={TrendingUp} isCurrency trend={12.5} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Chart */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Containers by Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.containersByStatus}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="count"
                    nameKey="status"
                    stroke="none"
                  >
                    {stats.containersByStatus.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    formatter={(value: number) => [value, 'Containers']}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Profit by Customer Chart */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center justify-between">
              <span>Top Customers by Profit</span>
              <UsersIcon className="w-4 h-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.profitByCustomer} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis type="number" tickFormatter={(val) => `₦${(val/1000000).toFixed(1)}M`} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis dataKey="customer" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <Tooltip 
                    cursor={{fill: 'hsl(var(--muted)/0.3)'}}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value: number) => [formatCurrency(value), 'Profit']}
                  />
                  <Bar dataKey="profit" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                    {stats.profitByCustomer.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? "hsl(var(--primary))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Recent Activity Table (Preview) */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.recentActivity.slice(0, 5).map((activity) => (
              <div key={activity.id} className="flex items-center justify-between border-b border-border/50 pb-4 last:border-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-xs font-medium">{activity.userName.charAt(0)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{activity.userName} <span className="text-muted-foreground font-normal">{activity.action.toLowerCase()}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activity.section ? `Section: ${activity.section} ` : ''} 
                      {activity.fieldChanged ? `Field: ${activity.fieldChanged}` : ''}
                    </p>
                  </div>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  {new Date(activity.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))}
            {stats.recentActivity.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No recent activity found.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Temporary icon component since Users wasn't imported at top to avoid conflict
function UsersIcon(props: any) {
  return <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinelinejoin="round" {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
}
