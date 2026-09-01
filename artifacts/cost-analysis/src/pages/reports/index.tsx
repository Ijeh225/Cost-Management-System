import { useEffect, useState, useRef } from "react";
import { useGetContainerReport, useListClients, useDeliveryAnalyticsReport, useListBanks, useGetFxHistory, useGetInvoiceAging, customFetch, type DeliveryAnalyticsResponse, type FxHistoryEntry, type AgingRow } from "@workspace/api-client-react";
import { useBranchScope } from "@/components/layout/branch-provider";
import { useLocation } from "wouter";

type WithBranchName = { branchName?: string | null };
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, FileDown, Filter, AlertTriangle, RefreshCw,
  TrendingDown, TrendingUp, DollarSign, CheckCircle2,
  Users, BarChart3, PieChart, CalendarRange, FileSpreadsheet, Printer,
  FileText, Receipt, Clock, ExternalLink, Truck, Scale, ArrowRight,
  Globe, ClipboardCheck, Landmark, Workflow, Trash2, Mail,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, getStatusColor, getStatusLabel, WORKFLOW_STAGES } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

type ReportRow = {
  id: number;
  containerNumber: string;
  blNumber: string;
  customerName: string;
  vessel: string;
  size: string;
  status: string;
  assignedTo: string;
  isLocked: boolean;
  clearingCharges: number;
  totalCost: number;
  grossProfit: number;
  shippingCost: number;
  customsCost: number;
  terminalCost: number;
  deliveryCost: number;
  operationsCost: number;
  dutyNotPaid: number;
  createdAt: string;
};

function buildQueryString(params: Record<string, string>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  return q.toString();
}

function SumCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`font-bold font-mono text-lg ${color ?? ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ContainersTable({ rows, showBranch }: { rows: ReportRow[]; showBranch?: boolean }) {
  if (rows.length === 0) return (
    <div className="py-12 text-center text-muted-foreground text-sm">No containers match the current filters.</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[960px]">
        <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="px-5 py-3 text-left font-medium">Container / BL</th>
            {showBranch && <th className="px-5 py-3 text-left font-medium">Branch</th>}
            <th className="px-5 py-3 text-left font-medium">Customer</th>
            <th className="px-5 py-3 text-left font-medium">Vessel / Size</th>
            <th className="px-5 py-3 text-left font-medium">Status</th>
            <th className="px-5 py-3 text-right font-medium">Revenue (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Total Cost (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Gross Profit (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Unpaid Duty (₦)</th>
            <th className="px-5 py-3 text-left font-medium">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {rows.map(c => (
            <tr key={c.id} className={`hover:bg-accent/30 transition-colors ${c.grossProfit < 0 ? "bg-destructive/5" : ""}`}>
              <td className="px-5 py-3">
                <div className="font-mono font-medium text-primary">{c.containerNumber}</div>
                <div className="text-xs text-muted-foreground">{c.blNumber}</div>
              </td>
              {showBranch && (
                <td className="px-5 py-3 text-xs">
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                    {(c as ReportRow & WithBranchName).branchName ?? "—"}
                  </span>
                </td>
              )}
              <td className="px-5 py-3 font-medium">{c.customerName}</td>
              <td className="px-5 py-3 text-muted-foreground">
                <div>{c.vessel || "—"}</div>
                <div className="text-xs">{c.size || ""}</div>
              </td>
              <td className="px-5 py-3">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getStatusColor(c.status)}`}>
                  {getStatusLabel(c.status)}
                </span>
              </td>
              <td className="px-5 py-3 text-right font-mono">{formatCurrency(c.clearingCharges)}</td>
              <td className="px-5 py-3 text-right font-mono text-orange-400">{formatCurrency(c.totalCost)}</td>
              <td className="px-5 py-3 text-right font-mono font-semibold">
                <span className={c.grossProfit >= 0 ? "text-emerald-400" : "text-destructive"}>
                  {formatCurrency(c.grossProfit)}
                </span>
              </td>
              <td className="px-5 py-3 text-right font-mono text-xs">
                {c.dutyNotPaid > 0 ? <span className="text-amber-400">{formatCurrency(c.dutyNotPaid)}</span> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{c.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ClientReportsTable({ rows }: { rows: ReportRow[] }) {
  const grouped: Record<string, ReportRow[]> = {};
  rows.forEach(r => {
    const key = r.customerName || "Unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });
  const clients = Object.entries(grouped).sort((a, b) => b[1].length - a[1].length);

  if (clients.length === 0) return <div className="py-12 text-center text-muted-foreground text-sm">No data available.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="px-5 py-3 text-left font-medium">Client / Customer</th>
            <th className="px-5 py-3 text-right font-medium">Containers</th>
            <th className="px-5 py-3 text-right font-medium">Total Revenue (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Total Cost (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Gross Profit (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Avg Profit / Container</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {clients.map(([name, rows]) => {
            const rev = rows.reduce((s, r) => s + r.clearingCharges, 0);
            const cost = rows.reduce((s, r) => s + r.totalCost, 0);
            const profit = rev - cost;
            return (
              <tr key={name} className={`hover:bg-accent/30 transition-colors ${profit < 0 ? "bg-destructive/5" : ""}`}>
                <td className="px-5 py-3 font-semibold">{name}</td>
                <td className="px-5 py-3 text-right font-mono">{rows.length}</td>
                <td className="px-5 py-3 text-right font-mono text-primary">{formatCurrency(rev)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-400">{formatCurrency(cost)}</td>
                <td className="px-5 py-3 text-right font-mono font-semibold">
                  <span className={profit >= 0 ? "text-emerald-400" : "text-destructive"}>{formatCurrency(profit)}</span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">
                  {formatCurrency(rows.length > 0 ? profit / rows.length : 0)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OperationsReport({ rows }: { rows: ReportRow[] }) {
  const byVessel: Record<string, number> = {};
  const bySize: Record<string, number> = {};
  rows.forEach(r => {
    const v = r.vessel || "Unknown Vessel";
    byVessel[v] = (byVessel[v] ?? 0) + 1;
    const s = r.size || "Unknown";
    bySize[s] = (bySize[s] ?? 0) + 1;
  });
  const vessels = Object.entries(byVessel).sort((a, b) => b[1] - a[1]);
  const sizes = Object.entries(bySize).sort((a, b) => b[1] - a[1]);

  if (rows.length === 0) return <div className="py-12 text-center text-muted-foreground text-sm">No data available.</div>;

  const totalContainers = rows.length;
  const completedCount = rows.filter(r => r.status === "closed").length;
  const lockedCount = rows.filter(r => r.isLocked).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SumCard label="Total Containers" value={String(totalContainers)} />
        <SumCard label="Completed" value={String(completedCount)} sub={`${((completedCount / totalContainers) * 100).toFixed(0)}% of total`} color="text-emerald-400" />
        <SumCard label="Locked / Closed" value={String(lockedCount)} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold">By Vessel</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Vessel</th>
                  <th className="px-4 py-2.5 text-right font-medium">Containers</th>
                  <th className="px-4 py-2.5 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {vessels.map(([name, count]) => (
                  <tr key={name} className="hover:bg-accent/10 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{name}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{count}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {((count / totalContainers) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold">By Container Size</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Size</th>
                  <th className="px-4 py-2.5 text-right font-medium">Count</th>
                  <th className="px-4 py-2.5 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {sizes.map(([size, count]) => (
                  <tr key={size} className="hover:bg-accent/10 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{size}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{count}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {((count / totalContainers) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FinancialReport({ rows }: { rows: ReportRow[] }) {
  const totalRev = rows.reduce((s, r) => s + r.clearingCharges, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalProfit = totalRev - totalCost;
  const shipping = rows.reduce((s, r) => s + r.shippingCost, 0);
  const customs = rows.reduce((s, r) => s + r.customsCost, 0);
  const terminal = rows.reduce((s, r) => s + r.terminalCost, 0);
  const delivery = rows.reduce((s, r) => s + r.deliveryCost, 0);
  const operations = rows.reduce((s, r) => s + r.operationsCost, 0);
  const unpaidDuty = rows.reduce((s, r) => s + r.dutyNotPaid, 0);

  const cats = [
    { label: "Shipping / Freight", value: shipping },
    { label: "Customs & Duties", value: customs },
    { label: "Terminal Charges", value: terminal },
    { label: "Delivery & Haulage", value: delivery },
    { label: "Operations & Misc", value: operations },
  ];

  if (rows.length === 0) return <div className="py-12 text-center text-muted-foreground text-sm">No data available.</div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SumCard label="Total Clearing Revenue" value={formatCurrency(totalRev)} color="text-primary" />
        <SumCard label="Total Operational Expenses" value={formatCurrency(totalCost)} color="text-orange-400" />
        <SumCard label="Net Gross Profit" value={formatCurrency(totalProfit)} color={totalProfit >= 0 ? "text-emerald-400" : "text-destructive"} sub={`${rows.length} containers`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold">Cost Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount (₦)</th>
                  <th className="px-4 py-2.5 text-right font-medium">% of Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {cats.map(c => (
                  <tr key={c.label} className="hover:bg-accent/10 transition-colors">
                    <td className="px-4 py-2.5 font-medium">{c.label}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-orange-400">{formatCurrency(c.value)}</td>
                    <td className="px-4 py-2.5 text-right text-xs text-muted-foreground">
                      {totalCost > 0 ? ((c.value / totalCost) * 100).toFixed(1) : "0.0"}%
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border/50 font-bold bg-secondary/10">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right font-mono text-orange-400">{formatCurrency(totalCost)}</td>
                  <td className="px-4 py-2.5 text-right text-xs">100%</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/40">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold">Key Financial Metrics</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">Total Clearing Charges</span>
              <span className="font-mono font-semibold text-primary">{formatCurrency(totalRev)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">Total Clearing Cost</span>
              <span className="font-mono font-semibold text-orange-400">{formatCurrency(totalCost)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">Gross Profit / Loss</span>
              <span className={`font-mono font-bold text-lg ${totalProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>{formatCurrency(totalProfit)}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-border/30">
              <span className="text-sm text-muted-foreground">Profit Margin</span>
              <span className="font-mono font-semibold">{totalRev > 0 ? ((totalProfit / totalRev) * 100).toFixed(1) : "0.0"}%</span>
            </div>
            {unpaidDuty > 0 && (
              <div className="flex justify-between items-center py-2 bg-amber-500/10 rounded-md px-3">
                <span className="text-sm text-amber-500 font-medium">Outstanding Duty</span>
                <span className="font-mono font-semibold text-amber-500">{formatCurrency(unpaidDuty)}</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MonthlySummary({ rows }: { rows: ReportRow[] }) {
  const monthly: Record<string, ReportRow[]> = {};
  rows.forEach(r => {
    const month = r.createdAt.slice(0, 7);
    if (!monthly[month]) monthly[month] = [];
    monthly[month].push(r);
  });
  const months = Object.entries(monthly).sort((a, b) => b[0].localeCompare(a[0]));

  if (months.length === 0) return <div className="py-12 text-center text-muted-foreground text-sm">No data available.</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
          <tr>
            <th className="px-5 py-3 text-left font-medium">Month</th>
            <th className="px-5 py-3 text-right font-medium">Containers</th>
            <th className="px-5 py-3 text-right font-medium">Total Revenue (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Total Expenses (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Net Profit (₦)</th>
            <th className="px-5 py-3 text-right font-medium">Outstanding Duty (₦)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/40">
          {months.map(([month, mRows]) => {
            const rev = mRows.reduce((s, r) => s + r.clearingCharges, 0);
            const cost = mRows.reduce((s, r) => s + r.totalCost, 0);
            const profit = rev - cost;
            const duty = mRows.reduce((s, r) => s + r.dutyNotPaid, 0);
            const label = new Date(month + "-01").toLocaleDateString("en-NG", { month: "long", year: "numeric" });
            return (
              <tr key={month} className={`hover:bg-accent/30 transition-colors ${profit < 0 ? "bg-destructive/5" : ""}`}>
                <td className="px-5 py-3 font-semibold">{label}</td>
                <td className="px-5 py-3 text-right font-mono">{mRows.length}</td>
                <td className="px-5 py-3 text-right font-mono text-primary">{formatCurrency(rev)}</td>
                <td className="px-5 py-3 text-right font-mono text-orange-400">{formatCurrency(cost)}</td>
                <td className="px-5 py-3 text-right font-mono font-semibold">
                  <span className={profit >= 0 ? "text-emerald-400" : "text-destructive"}>{formatCurrency(profit)}</span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs">
                  {duty > 0 ? <span className="text-amber-400">{formatCurrency(duty)}</span> : <span className="text-muted-foreground">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DeliveryReportSection() {
  const { activeBranchId, isSuperAdmin } = useBranchScope();
  const showBranchColumn = isSuperAdmin && activeBranchId === "all";
  const [drFrom, setDrFrom] = useState("");
  const [drTo, setDrTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [generated, setGenerated] = useState(false);

  const { data, isLoading } = useDeliveryAnalyticsReport(
    { from: applied.from || undefined, to: applied.to || undefined },
    { enabled: generated }
  );

  const openReport = (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.open(`${base}${path}?${qs}`, "_blank", "noopener");
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-1">
          <Truck className="w-4 h-4 text-emerald-400" /> Delivery Tracking Report
        </h2>
        <p className="text-xs text-muted-foreground">Track containers that have been physically delivered. Filter by delivery date range.</p>
      </div>
      <Card className="border-border/50 bg-card/40">
        <CardContent className="p-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Delivered From</Label>
              <Input type="date" value={drFrom} onChange={e => setDrFrom(e.target.value)} className="h-8 text-xs w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Delivered To</Label>
              <Input type="date" value={drTo} onChange={e => setDrTo(e.target.value)} className="h-8 text-xs w-40" />
            </div>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => { setApplied({ from: drFrom, to: drTo }); setGenerated(true); }}>
              <Filter className="w-3 h-3" /> Generate Report
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setDrFrom(""); setDrTo(""); setApplied({ from: "", to: "" }); setGenerated(false); }}>Reset</Button>
            {data && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5 ml-auto"
                onClick={() => openReport("/reports/delivery-report/print", { from: applied.from, to: applied.to })}
              >
                <ExternalLink className="w-3 h-3" /> Print Report
              </Button>
            )}
          </div>

          {/* Summary Stats */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : data ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
                  <div className="text-xs text-muted-foreground mb-1">Total Deliveries</div>
                  <div className="font-bold text-xl">{data.count}</div>
                </div>
                <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
                  <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
                  <div className="font-bold font-mono text-lg text-primary">{formatCurrency(data.totalRevenue)}</div>
                </div>
                <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
                  <div className="text-xs text-muted-foreground mb-1">Avg. Days to Deliver</div>
                  <div className="font-bold text-xl">{data.avgDays !== null ? `${data.avgDays} days` : "N/A"}</div>
                </div>
              </div>

              {/* Breakdown table */}
              {items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No deliveries found for the selected period.</div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border/40">
                  <table className="w-full text-sm min-w-[900px]">
                    <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Container / BL</th>
                        {showBranchColumn && <th className="px-4 py-2.5 text-left font-medium">Branch</th>}
                        <th className="px-4 py-2.5 text-left font-medium">Customer</th>
                        <th className="px-4 py-2.5 text-left font-medium">Truck / Driver</th>
                        <th className="px-4 py-2.5 text-left font-medium">Dispatch</th>
                        <th className="px-4 py-2.5 text-left font-medium">Delivered</th>
                        <th className="px-4 py-2.5 text-right font-medium">Days</th>
                        <th className="px-4 py-2.5 text-left font-medium">Gate-In Date</th>
                        <th className="px-4 py-2.5 text-left font-medium">Empty Return</th>
                        <th className="px-4 py-2.5 text-right font-medium">Custody</th>
                        <th className="px-4 py-2.5 text-right font-medium">Revenue (₦)</th>
                        <th className="px-4 py-2.5 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {items.map(item => (
                        <tr key={item.id} className="hover:bg-accent/20 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="font-mono font-medium text-primary text-xs">{item.containerNumber}</div>
                            <div className="text-[11px] text-muted-foreground">{item.blNumber}</div>
                          </td>
                          {showBranchColumn && (
                            <td className="px-4 py-2.5 text-xs">
                              <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                {item.branchName ?? "—"}
                              </span>
                            </td>
                          )}
                          <td className="px-4 py-2.5 font-medium">{item.clientName}</td>
                          <td className="px-4 py-2.5">
                            {item.truckNumber
                              ? <div className="font-semibold text-xs">{item.truckNumber}</div>
                              : <span className="text-muted-foreground/40">—</span>}
                            {item.driverName && <div className="text-[11px] text-muted-foreground">{item.driverName}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-xs">
                            {item.dispatchOfficer ?? <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="text-xs font-semibold text-emerald-400">
                              {new Date(item.deliveredAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                            </div>
                            {item.deliveredAtEstimated && (
                              <span className="text-[10px] text-amber-400 border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-medium">estimated</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {item.daysToComplete !== null ? item.daysToComplete : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">
                            {(item as any).gateInDate
                              ? new Date((item as any).gateInDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
                              : <span className="text-muted-foreground/30">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-mono">
                            {(item as any).emptyReturnDate
                              ? <span className="text-green-400">{new Date((item as any).emptyReturnDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                              : <span className="text-amber-400/60 text-[10px]">Pending</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs">
                            {(item as any).totalCustodyDays != null ? (
                              <span className={
                                (item as any).custodyClosed ? "text-slate-400" :
                                (item as any).totalCustodyDays >= 21 ? "text-red-400 font-semibold" :
                                (item as any).totalCustodyDays >= 14 ? "text-amber-400 font-semibold" :
                                "text-teal-400"
                              }>
                                {(item as any).totalCustodyDays}d{!(item as any).custodyClosed && " ▶"}
                              </span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{formatCurrency(item.clearingCharges)}</td>
                          <td className="px-4 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getStatusColor(item.status)}`}>
                              {getStatusLabel(item.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : !generated ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Truck className="w-7 h-7 opacity-30" />
              <p className="text-sm">Click <span className="font-medium text-foreground">Generate Report</span> to load delivery data</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

type FxSortKey = "containerNumber" | "section" | "usdAmount" | "exchangeRate" | "ngnEquivalent" | "recordedAt";

function FxHistorySection() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [sortKey, setSortKey] = useState<FxSortKey>("recordedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin } = useBranchScope();
  const showBranchColumn = isSuperAdmin && activeBranchId === "all";

  const { data, isLoading } = useGetFxHistory(
    { from: applied.from || undefined, to: applied.to || undefined }
  );

  const rawEntries = data?.entries ?? [];
  const totals = data?.totals ?? { totalUsd: 0, totalNgn: 0 };

  const entries = [...rawEntries].sort((a, b) => {
    let av: any = a[sortKey];
    let bv: any = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      av = av.toLowerCase(); bv = bv.toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const handleSort = (key: FxSortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: FxSortKey }) => {
    if (sortKey !== col) return <span className="opacity-20 ml-1">↕</span>;
    return <span className="ml-1 text-blue-400">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const SECTION_LABELS: Record<string, string> = {
    shipping: "Shipping",
    customs: "Customs",
    terminal: "Terminal",
    delivery: "Delivery",
    operations: "Operations",
  };

  const exportCsv = () => {
    if (entries.length === 0) { toast({ variant: "destructive", title: "No data to export" }); return; }
    const headers = ["Container No.", "Section", "USD Amount", "Exchange Rate (₦/$)", "NGN Equivalent", "Recorded At"];
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      headers.join(","),
      ...entries.map(e => [
        esc(e.containerNumber),
        esc(SECTION_LABELS[e.section] ?? e.section),
        e.usdAmount.toFixed(2),
        e.exchangeRate.toFixed(6),
        e.ngnEquivalent.toFixed(2),
        esc(new Date(e.recordedAt).toLocaleDateString("en-NG")),
      ].join(",")),
    ];
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fx_history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${entries.length} FX entries exported.` });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-blue-400" /> Exchange Rate History
        </h2>
        <p className="text-xs text-muted-foreground">USD/NGN exchange rates used across all containers in a period.</p>
      </div>
      <Card className="border-border/50 bg-card/40">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-xs w-36" />
            </div>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setApplied({ from, to })}>
              <Filter className="w-3.5 h-3.5" /> Apply
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => { setFrom(""); setTo(""); setApplied({ from: "", to: "" }); }}>
              <RefreshCw className="w-3.5 h-3.5" /> Reset
            </Button>
            {entries.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto" onClick={exportCsv}>
                <FileDown className="w-3.5 h-3.5" /> Export CSV
              </Button>
            )}
          </div>

          {entries.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
                <div className="text-xs text-muted-foreground mb-1">Total USD Recorded</div>
                <div className="font-bold font-mono text-lg text-blue-400">${totals.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
                <div className="text-xs text-muted-foreground mb-1">Total NGN Equivalent</div>
                <div className="font-bold font-mono text-lg">{formatCurrency(totals.totalNgn)}</div>
              </div>
              <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
                <div className="text-xs text-muted-foreground mb-1">FX Entries</div>
                <div className="font-bold font-mono text-lg">{entries.length}</div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground text-sm">
              <Globe className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No FX entries found{applied.from || applied.to ? " for the selected period" : ""}. USD amounts are recorded in the charge sections on each container.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("containerNumber")}>Container<SortIcon col="containerNumber" /></th>
                    {showBranchColumn && <th className="px-4 py-3 text-left font-medium">Branch</th>}
                    <th className="px-4 py-3 text-left font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("section")}>Section<SortIcon col="section" /></th>
                    <th className="px-4 py-3 text-right font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("usdAmount")}>USD Amount<SortIcon col="usdAmount" /></th>
                    <th className="px-4 py-3 text-right font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("exchangeRate")}>Rate (₦/$)<SortIcon col="exchangeRate" /></th>
                    <th className="px-4 py-3 text-right font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("ngnEquivalent")}>NGN Equivalent<SortIcon col="ngnEquivalent" /></th>
                    <th className="px-4 py-3 text-left font-medium cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("recordedAt")}>Recorded<SortIcon col="recordedAt" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {entries.map((e: FxHistoryEntry, i: number) => (
                    <tr key={i} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">{e.containerNumber}</td>
                      {showBranchColumn && (
                        <td className="px-4 py-3 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            {(e as FxHistoryEntry & WithBranchName).branchName ?? "—"}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-[10px] font-semibold border border-blue-500/20">
                          {SECTION_LABELS[e.section] ?? e.section}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-blue-400 font-semibold">
                        ${e.usdAmount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {e.exchangeRate.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold">
                        {formatCurrency(e.ngnEquivalent)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(e.recordedAt).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InvoiceAgingSection() {
  const { activeBranchId, isSuperAdmin } = useBranchScope();
  const showBranchColumn = isSuperAdmin && activeBranchId === "all";
  const [generated, setGenerated] = useState(false);
  const { data, isLoading, isError, refetch } = useGetInvoiceAging({ enabled: generated });

  const openReport = (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.open(`${base}${path}?${qs}`, "_blank", "noopener");
  };

  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";

  const BUCKET_DEFS = [
    { key: "current" as const, label: "Current (Not Yet Overdue)", color: "text-emerald-400", badgeClass: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    { key: "days1to30" as const, label: "1–30 Days Overdue", color: "text-amber-400", badgeClass: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    { key: "days31to60" as const, label: "31–60 Days Overdue", color: "text-orange-400", badgeClass: "bg-orange-500/10 text-orange-400 border-orange-500/30" },
    { key: "days61to90" as const, label: "61–90 Days Overdue", color: "text-red-400", badgeClass: "bg-red-500/10 text-red-400 border-red-500/30" },
    { key: "days90plus" as const, label: "90+ Days Overdue", color: "text-destructive", badgeClass: "bg-destructive/10 text-destructive border-destructive/30" },
  ] as const;

  const buckets = data?.buckets;
  const totals = data?.totals;
  const totalCount = buckets ? Object.values(buckets).reduce((s, rows) => s + rows.length, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-400" /> Invoice Aging Analysis
          </h2>
          <p className="text-xs text-muted-foreground">Live snapshot of all unpaid invoices grouped by days overdue.</p>
        </div>
        <div className="flex gap-2">
          {data && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => openReport("/reports/invoice-aging/print", {})}>
              <ExternalLink className="w-3.5 h-3.5" /> Print
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={isLoading}
            onClick={() => { if (!generated) setGenerated(true); else refetch(); }}
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Filter className="w-3 h-3" />}
            {generated ? "Refresh" : "Generate Aging Report"}
          </Button>
        </div>
      </div>

      {isError && (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">Failed to load aging data. Please retry.</p>
        </div>
      )}

      {data && totalCount === 0 && (
        <div className="py-8 text-center">
          <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-400/50 mb-2" />
          <p className="text-sm text-muted-foreground">No outstanding invoices — all invoices are current or paid.</p>
        </div>
      )}

      {data && totalCount > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {BUCKET_DEFS.map(b => (
              <SumCard key={b.key} label={b.label} value={formatCurrency(totals![b.key])} color={b.color} />
            ))}
          </div>

          {BUCKET_DEFS.map(b => {
            const rows: AgingRow[] = buckets![b.key];
            if (rows.length === 0) return null;
            return (
              <div key={b.key}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className={`text-[10px] ${b.badgeClass}`}>{b.label}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {rows.length} invoice{rows.length !== 1 ? "s" : ""} — {formatCurrency(totals![b.key])} outstanding
                  </span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/30">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead className="bg-secondary/20 border-b border-border/30 text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-medium">Invoice</th>
                        <th className="px-4 py-2.5 text-left font-medium">Client</th>
                        <th className="px-4 py-2.5 text-right font-medium">Outstanding</th>
                        <th className="px-4 py-2.5 text-right font-medium">Due Date</th>
                        <th className="px-4 py-2.5 text-right font-medium">Days Overdue</th>
                        {showBranchColumn && <th className="px-4 py-2.5 text-left font-medium">Branch</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                      {rows.map(r => (
                        <tr key={r.id} className="hover:bg-muted/5">
                          <td className="px-4 py-2.5 font-mono font-medium text-primary">{r.invoiceNumber}</td>
                          <td className="px-4 py-2.5 text-foreground">{r.clientName}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-semibold text-amber-400">{formatCurrency(r.outstanding)}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{fmtDate(r.dueDate)}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold ${b.color}`}>
                            {r.daysOverdue > 0 ? `${r.daysOverdue}d` : "—"}
                          </td>
                          {showBranchColumn && (
                            <td className="px-4 py-2.5 text-muted-foreground">{r.branchName ?? "—"}</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}

          <p className="text-[11px] text-muted-foreground text-right">
            Grand total outstanding: <span className="font-semibold text-foreground">{formatCurrency(totals!.grandTotal)}</span>
            {data.generatedAt && ` · Generated ${new Date(data.generatedAt).toLocaleString()}`}
          </p>
        </>
      )}
    </div>
  );
}

function PrintableReportsSection() {
  const { data: clients = [] } = useListClients();
  const { data: banks = [] } = useListBanks();
  const [csClientId, setCsClientId] = useState("");
  const [csFrom, setCsFrom] = useState("");
  const [csTo, setCsTo] = useState("");
  const [vatFrom, setVatFrom] = useState("");
  const [vatTo, setVatTo] = useState("");
  const [cfFrom, setCfFrom] = useState("");
  const [cfTo, setCfTo] = useState("");
  const [cfBankId, setCfBankId] = useState("all");
  const [plFrom, setPlFrom] = useState("");
  const [plTo, setPlTo] = useState("");
  const [plClientId, setPlClientId] = useState("all");
  const [plCostBasis, setPlCostBasis] = useState<"budgeted" | "actual_paid">("budgeted");
  const [, setLocation] = useLocation();

  const openReport = (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.open(`${base}${path}?${qs}`, "_blank", "noopener");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-bold text-foreground flex items-center gap-2 mb-1">
          <Printer className="w-4 h-4 text-primary" /> Printable Reports
        </h2>
        <p className="text-xs text-muted-foreground">Generate formatted documents that open in a new tab, ready to print or save as PDF.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Client Statement */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Client Statement
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">All invoices & payments for a client in a period, with closing balance.</p>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Client *</Label>
              <Select value={csClientId} onValueChange={setCsClientId}>
                <SelectTrigger className="h-8 text-xs border-border/50">
                  <SelectValue placeholder={clients.length === 0 ? "No clients yet" : "Select client…"} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={csFrom} onChange={e => setCsFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={csTo} onChange={e => setCsTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              disabled={!csClientId}
              onClick={() => openReport("/reports/client-statement/print", { clientId: csClientId, from: csFrom, to: csTo })}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Generate Statement
            </Button>
          </CardContent>
        </Card>

        {/* VAT Summary */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-400" /> VAT Summary
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Total VAT collected for a period — formatted for FIRS filing.</p>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={vatFrom} onChange={e => setVatFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={vatTo} onChange={e => setVatTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              Leave blank to include all invoices across all time.
            </div>
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              onClick={() => openReport("/reports/vat-summary/print", { from: vatFrom, to: vatTo })}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Generate VAT Summary
            </Button>
          </CardContent>
        </Card>

        {/* Invoice Aging */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" /> Invoice Aging Report
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">All unpaid invoices grouped by overdue bucket (0-30 / 31-60 / 61-90 / 90+).</p>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="rounded-lg bg-secondary/40 border border-border/40 p-3 text-xs text-muted-foreground leading-relaxed">
              This report is always a live snapshot — it shows the current outstanding balance on all unpaid invoices as of today, sorted by days overdue.
            </div>
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              onClick={() => openReport("/reports/invoice-aging/print", {})}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Generate Aging Report
            </Button>
          </CardContent>
        </Card>

        {/* Cash Flow */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" /> Cash Flow Statement
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Opening balance → cash in/out by category → closing balance, with bank breakdown.</p>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={cfFrom} onChange={e => setCfFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={cfTo} onChange={e => setCfTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Bank</Label>
              <Select value={cfBankId} onValueChange={setCfBankId}>
                <SelectTrigger className="h-8 text-xs border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Banks</SelectItem>
                  {banks.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              onClick={() => {
                const p = new URLSearchParams({ from: cfFrom, to: cfTo });
                if (cfBankId && cfBankId !== "all") p.set("bankId", cfBankId);
                setLocation(`/reports/cashflow?${p.toString()}`);
              }}
            >
              <ArrowRight className="w-3.5 h-3.5" /> View Cash Flow Report
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-2 text-xs h-8"
              onClick={() => openReport("/reports/cashflow/print", { from: cfFrom, to: cfTo, bankId: cfBankId })}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          </CardContent>
        </Card>

        {/* P&L / Income Statement */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" /> Profit &amp; Loss
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Revenue minus cost of sales and overheads — true Net Profit with monthly trend.</p>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={plFrom} onChange={e => setPlFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={plTo} onChange={e => setPlTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Client</Label>
              <Select value={plClientId} onValueChange={setPlClientId}>
                <SelectTrigger className="h-8 text-xs border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cost Basis</Label>
              <div className="flex gap-1.5">
                {(["budgeted", "actual_paid"] as const).map(v => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setPlCostBasis(v)}
                    className={`flex-1 h-7 rounded border text-[10px] font-medium transition-all ${
                      plCostBasis === v
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/30"
                    }`}
                  >
                    {v === "budgeted" ? "Budgeted Costs" : "Actual Paid Costs"}
                  </button>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              onClick={() => openReport("/reports/pl/print", { from: plFrom, to: plTo, clientId: plClientId, costBasis: plCostBasis })}
            >
              <ExternalLink className="w-3.5 h-3.5" /> Generate P&amp;L
            </Button>
          </CardContent>
        </Card>

        {/* Disbursement Reconciliation */}
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-teal-400" /> Disbursement Reconciliation
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Compare budgeted charges to actual disbursements per container and section. Filter by payment date.</p>
          </CardHeader>
          <CardContent className="p-4">
            <div className="rounded-lg bg-secondary/40 border border-border/40 p-3 text-xs text-muted-foreground leading-relaxed mb-3">
              Shows every container's budgeted vs actual spend, sorted by largest variance. Click any row to expand section-level detail.
            </div>
            <Button
              size="sm"
              className="w-full gap-2 text-xs h-8"
              onClick={() => setLocation("/reports/disbursement-reconciliation")}
            >
              <ArrowRight className="w-3.5 h-3.5" /> Open Reconciliation Report
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

type DutyLedgerReport = {
  summary: { transactionCount: number; totalPaid: number; bankPaid: number; cashPaid: number };
  transactions: Array<{ id: number; amount: number; paymentMethod: string; paidAt: string | null; reference: string | null; notes: string | null; containerId: number | null; containerNumber: string | null; customerName: string | null; bankName: string | null; recordedByName: string | null; sourceLink: string | null }>;
  evidenceNote: string;
};
type WorkflowLedgerReport = { stages: Array<{ id: string; label: string; total: number; active: number; released: number; overdue: number; rows: Array<{ id: number; containerNumber: string; customerName: string; expectedDate: string | null; actualDate: string | null; state: string; sourceLink: string }> }>; evidenceNote: string };
type ReconciliationReport = { summary: { matched: number; historicalUnledgered: number; attention: number }; rows: Array<{ id: number; containerNumber: string; customerName: string; snapshotPaid: number; ledgerPaid: number; historicalUnledgeredAmount: number; state: string; sourceLink: string }>; evidenceNote: string };
type ReportSubscription = { id: number; reportKind: "duty_payment_ledger" | "workflow_stage_summary"; frequency: "daily" | "weekly"; recipients: string[]; filters: { from?: string; to?: string }; sendAt: string; timezone: string; sendDayOfWeek: number; isActive: boolean; archivedAt: string | null; lastSentAt: string | null; createdAt: string };
type ReportDeliveryLog = { id: number; status: "sent" | "failed" | "test_sent" | "test_failed"; itemCount: number; error: string | null; deliveredAt: string; recipients: string[] };

function isoDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("en-NG") : "Not recorded";
}

type FinancialLedgerReport = {
  summary: { entries: number; totalIn: number; totalOut: number; net: number };
  entries: Array<{ id: string; date: string; direction: "in" | "out"; source: string; description: string; amount: number; method: string; bankName: string | null; reference: string | null; sourceLink: string }>;
  evidenceNote: string;
};
type FinancialControlExceptions = {
  summary: { needsReview: number; missingBankAccount: number };
  exceptions: Array<{ id: string; date: string; source: string; description: string; amount: number; sourceLink: string }>;
  evidenceNote: string;
};

function FinancialControlSection({ from, to }: { from: string; to: string }) {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ledger, setLedger] = useState<FinancialLedgerReport | null>(null);
  const [exceptions, setExceptions] = useState<FinancialControlExceptions | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = buildQueryString({ from, to });
    setLoading(true); setError("");
    Promise.all([
      customFetch<FinancialLedgerReport>(`/api/reports/financial-ledger${query ? `?${query}` : ""}`),
      customFetch<FinancialControlExceptions>(`/api/reports/financial-control-exceptions${query ? `?${query}` : ""}`),
    ]).then(([ledgerResult, exceptionResult]) => {
      if (!cancelled) { setLedger(ledgerResult); setExceptions(exceptionResult); }
    }).catch(() => { if (!cancelled) setError("Accounting control reports could not load. Please retry."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  const exportLedgerCsv = () => {
    if (!ledger?.entries.length) return;
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [["Date", "Direction", "Source", "Description", "Amount", "Method", "Bank", "Reference"], ...ledger.entries.map(entry => [isoDate(entry.date), entry.direction, entry.source, entry.description, entry.amount.toFixed(2), entry.method, entry.bankName ?? "Cash / unassigned", entry.reference ?? ""])].map(row => row.map(esc).join(","));
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `financial-ledger-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  return <section className="border-t border-border/40 pt-6 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold flex items-center gap-2"><Landmark className="w-4 h-4 text-primary" /> Accounting Control</h2><p className="text-xs text-muted-foreground mt-1">A source-linked ledger of actual money movement, plus only the records that need review.</p></div><Badge variant="outline" className="font-normal text-[10px]">Actual dated transactions only</Badge></div>
    {loading ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : error ? <Card><CardContent className="py-7 text-sm text-destructive">{error}</CardContent></Card> : <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="border-border/40 bg-card/40"><CardHeader className="pb-3 border-b border-border/40 flex-row items-start justify-between space-y-0 gap-3"><div><CardTitle className="text-sm">Financial Ledger</CardTitle><p className="text-xs text-muted-foreground mt-1">Invoice collections, duty, overhead, disbursements, funding, and both sides of bank transfers.</p></div><Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportLedgerCsv} disabled={!ledger?.entries.length}><FileDown className="w-3.5 h-3.5" /> Export CSV</Button></CardHeader><CardContent className="p-0"><div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">{[["Entries", ledger?.summary.entries ?? 0], ["Money in", formatCurrency(ledger?.summary.totalIn ?? 0)], ["Money out", formatCurrency(ledger?.summary.totalOut ?? 0)], ["Net movement", formatCurrency(ledger?.summary.net ?? 0)]].map(([label, value]) => <div key={String(label)} className="bg-card px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="font-mono font-semibold text-sm mt-1">{value}</p></div>)}</div>{!ledger?.entries.length ? <div className="py-10 text-center text-sm text-muted-foreground">No dated financial transactions match this period.</div> : <div className="max-h-[460px] overflow-auto"><table className="w-full min-w-[800px] text-sm"><thead className="sticky top-0 bg-muted/80 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Source</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-right">In</th><th className="px-4 py-3 text-right">Out</th></tr></thead><tbody className="divide-y divide-border/40">{ledger.entries.map(entry => <tr key={entry.id} className="hover:bg-muted/20 cursor-pointer" onClick={() => setLocation(entry.sourceLink)}><td className="px-4 py-3 text-xs whitespace-nowrap">{isoDate(entry.date)}</td><td className="px-4 py-3 text-xs"><p>{entry.source}</p><p className="text-muted-foreground">{entry.bankName ?? entry.method}</p></td><td className="px-4 py-3"><p className="text-xs">{entry.description}</p>{entry.reference && <p className="text-[11px] text-muted-foreground">{entry.reference}</p>}</td><td className="px-4 py-3 text-right font-mono text-xs text-emerald-600">{entry.direction === "in" ? formatCurrency(entry.amount) : "—"}</td><td className="px-4 py-3 text-right font-mono text-xs text-destructive">{entry.direction === "out" ? formatCurrency(entry.amount) : "—"}</td></tr>)}</tbody></table></div>}<p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/40">{ledger?.evidenceNote}</p></CardContent></Card>
      <Card className="border-border/40 bg-card/40"><CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm">Finance Review Queue</CardTitle><p className="text-xs text-muted-foreground mt-1">Data-quality checks. These are prompts for review, not accusations or automatic corrections.</p></CardHeader><CardContent className="p-0"><div className="p-4 border-b border-border/40"><p className="text-2xl font-mono font-semibold">{exceptions?.summary.needsReview ?? 0}</p><p className="text-xs text-muted-foreground mt-1">Bank payments missing a bank account</p></div>{!exceptions?.exceptions.length ? <div className="py-8 px-4 text-center text-sm text-muted-foreground">No financial data-quality exceptions match this period.</div> : <div className="divide-y divide-border/40 max-h-[380px] overflow-auto">{exceptions.exceptions.map(exception => <button key={exception.id} className="w-full text-left px-4 py-3 hover:bg-muted/20" onClick={() => setLocation(exception.sourceLink)}><p className="text-xs font-medium">{exception.source}</p><p className="text-xs text-muted-foreground mt-1">{exception.description}</p><p className="mt-1 text-xs font-mono text-destructive">{formatCurrency(exception.amount)} · {isoDate(exception.date)}</p></button>)}</div>}<p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/40">{exceptions?.evidenceNote}</p></CardContent></Card>
    </div>}
  </section>;
}

function ReportCentreSection({ from, to }: { from: string; to: string }) {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState("duty-ledger");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [duty, setDuty] = useState<DutyLedgerReport | null>(null);
  const [workflow, setWorkflow] = useState<WorkflowLedgerReport | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [subscriptions, setSubscriptions] = useState<ReportSubscription[]>([]);
  const [archivedSubscriptions, setArchivedSubscriptions] = useState<ReportSubscription[]>([]);
  const [subscriptionsAllowed, setSubscriptionsAllowed] = useState(true);
  const [deliveryKind, setDeliveryKind] = useState<ReportSubscription["reportKind"]>("duty_payment_ledger");
  const [deliveryFrequency, setDeliveryFrequency] = useState<ReportSubscription["frequency"]>("daily");
  const [deliveryRecipients, setDeliveryRecipients] = useState("");
  const [deliverySendAt, setDeliverySendAt] = useState("08:00");
  const [deliverySendDayOfWeek, setDeliverySendDayOfWeek] = useState("1");
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<number | null>(null);
  const [deliveryLogs, setDeliveryLogs] = useState<ReportDeliveryLog[]>([]);

  useEffect(() => {
    let cancelled = false;
    const query = buildQueryString({ from, to });
    setLoading(true); setError("");
    Promise.all([
      customFetch<DutyLedgerReport>(`/api/reports/duty-payment-ledger${query ? `?${query}` : ""}`),
      customFetch<WorkflowLedgerReport>("/api/reports/workflow-stage-ledger"),
      customFetch<ReconciliationReport>("/api/reports/reconciliation"),
    ]).then(([d, w, r]) => {
      if (!cancelled) { setDuty(d); setWorkflow(w); setReconciliation(r); }
    }).catch(() => { if (!cancelled) setError("The Report Centre could not load its evidence. Please retry."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [from, to]);

  const loadSubscriptions = () => customFetch<{ subscriptions: ReportSubscription[] }>("/api/reports/subscriptions")
    .then(result => {
      setSubscriptions(result.subscriptions.filter(subscription => !subscription.archivedAt));
      setArchivedSubscriptions(result.subscriptions.filter(subscription => subscription.archivedAt));
      setSubscriptionsAllowed(true);
    })
    .catch((error: { status?: number }) => { if (error?.status === 401 || error?.status === 403) setSubscriptionsAllowed(false); });
  useEffect(() => { void loadSubscriptions(); }, []);

  const createSubscription = async () => {
    const recipients = deliveryRecipients.split(",").map(item => item.trim()).filter(Boolean);
    if (!recipients.length) { setError("Enter at least one recipient email address for the scheduled report."); return; }
    setDeliveryBusy(true);
    try {
      await customFetch("/api/reports/subscriptions", { method: "POST", body: JSON.stringify({ reportKind: deliveryKind, frequency: deliveryFrequency, recipients, filters: { from, to }, sendAt: deliverySendAt, sendDayOfWeek: Number(deliverySendDayOfWeek) }) });
      setDeliveryRecipients(""); await loadSubscriptions();
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to save the report schedule."); }
    finally { setDeliveryBusy(false); }
  };
  const updateSubscription = async (id: number, body: object) => {
    setDeliveryBusy(true);
    try { await customFetch(`/api/reports/subscriptions/${id}`, { method: "PATCH", body: JSON.stringify(body) }); await loadSubscriptions(); }
    catch { setError("Unable to update the report schedule."); }
    finally { setDeliveryBusy(false); }
  };
  const deleteSubscription = async (id: number) => {
    if (!window.confirm("Archive this scheduled report? Its delivery history will be kept permanently.")) return;
    setDeliveryBusy(true);
    try { await customFetch(`/api/reports/subscriptions/${id}`, { method: "DELETE" }); await loadSubscriptions(); }
    catch { setError("Unable to archive the report schedule."); }
    finally { setDeliveryBusy(false); }
  };
  const sendTest = async (id: number) => {
    setDeliveryBusy(true); setError("");
    try {
      const result = await customFetch<{ status: "sent" | "failed"; error?: string }>(`/api/reports/subscriptions/${id}/send-test`, { method: "POST" });
      if (result.status !== "sent") throw new Error(result.error || "The email provider did not accept the test.");
      await loadSubscriptions(); await showHistory(id);
    } catch (error) { setError(error instanceof Error ? error.message : "The test email could not be sent."); }
    finally { setDeliveryBusy(false); }
  };
  const showHistory = async (id: number) => {
    setSelectedHistoryId(id);
    try { const result = await customFetch<{ logs: ReportDeliveryLog[] }>(`/api/reports/subscriptions/${id}/logs`); setDeliveryLogs(result.logs); }
    catch { setError("Unable to load this delivery history."); }
  };

  const exportDutyCsv = () => {
    if (!duty?.transactions.length) return;
    const esc = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const lines = [["Payment date", "Container", "Customer", "Amount", "Method", "Bank / cash source", "Reference", "Notes", "Recorded by"], ...duty.transactions.map(row => [
      isoDate(row.paidAt), row.containerNumber, row.customerName, row.amount.toFixed(2), row.paymentMethod, row.bankName ?? "Cash", row.reference, row.notes, row.recordedByName,
    ])].map(row => row.map(esc).join(","));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `duty-payment-ledger-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const weekdayLabel = (day: number) => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? "Monday";

  return <section className="border-t border-border/40 pt-6 space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-primary" /> Report Centre</h2>
        <p className="text-xs text-muted-foreground mt-1">Source-linked actual payment, stage-progress, and reconciliation evidence.</p>
      </div>
      <Badge variant="outline" className="font-normal text-[10px]">Actual records only. Planned dates are not payments.</Badge>
    </div>
    {loading ? <div className="py-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div> : error ? <Card><CardContent className="py-8 text-sm text-destructive">{error}</CardContent></Card> : <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="bg-card/40 border border-border/50 h-auto flex-wrap justify-start">
        <TabsTrigger value="duty-ledger" className="gap-1.5 text-xs"><Landmark className="w-3.5 h-3.5" /> Duty Payment Ledger</TabsTrigger>
        <TabsTrigger value="workflow-ledger" className="gap-1.5 text-xs"><Workflow className="w-3.5 h-3.5" /> Department Workflow</TabsTrigger>
        <TabsTrigger value="reconciliation" className="gap-1.5 text-xs"><Scale className="w-3.5 h-3.5" /> Duty Reconciliation</TabsTrigger>
      </TabsList>
      <TabsContent value="duty-ledger" className="mt-4">
        <Card className="border-border/40 bg-card/40"><CardHeader className="pb-3 border-b border-border/40 flex-row items-start justify-between space-y-0 gap-3"><div><CardTitle className="text-sm">Duty Payment Ledger</CardTitle><p className="text-xs text-muted-foreground mt-1">Every new duty payment has a date, amount, source, recorder, and container link.</p></div><Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={exportDutyCsv} disabled={!duty?.transactions.length}><FileDown className="w-3.5 h-3.5" /> Export CSV</Button></CardHeader><CardContent className="p-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border/30">{[["Transactions", duty?.summary.transactionCount ?? 0], ["Actual paid", formatCurrency(duty?.summary.totalPaid ?? 0)], ["Bank paid", formatCurrency(duty?.summary.bankPaid ?? 0)], ["Cash paid", formatCurrency(duty?.summary.cashPaid ?? 0)]].map(([label, value]) => <div key={String(label)} className="bg-card px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="font-mono font-semibold text-sm mt-1">{value}</p></div>)}</div>
          {!duty?.transactions.length ? <div className="py-10 text-center text-sm text-muted-foreground">No dated duty-payment ledger entries match this period.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Container</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3 text-left">Source</th><th className="px-4 py-3 text-left">Reference</th><th className="px-4 py-3 text-left">Recorded by</th></tr></thead><tbody className="divide-y divide-border/40">{duty.transactions.map(row => <tr key={row.id}><td className="px-4 py-3 text-xs">{isoDate(row.paidAt)}</td><td className="px-4 py-3"><button className="text-primary font-mono hover:underline" onClick={() => row.sourceLink && setLocation(row.sourceLink)}>{row.containerNumber ?? "Unknown container"}</button><div className="text-xs text-muted-foreground">{row.customerName}</div></td><td className="px-4 py-3 text-right font-mono font-semibold">{formatCurrency(row.amount)}</td><td className="px-4 py-3 text-xs">{row.paymentMethod === "bank" ? row.bankName ?? "Bank" : "Cash"}</td><td className="px-4 py-3 text-xs text-muted-foreground">{row.reference || row.notes || "—"}</td><td className="px-4 py-3 text-xs">{row.recordedByName || "—"}</td></tr>)}</tbody></table></div>}
          <p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/40">{duty?.evidenceNote}</p>
        </CardContent></Card>
      </TabsContent>
      <TabsContent value="workflow-ledger" className="mt-4"><Card className="border-border/40 bg-card/40"><CardHeader className="pb-3"><CardTitle className="text-sm">Department Workflow Evidence</CardTitle><p className="text-xs text-muted-foreground mt-1">Expected dates leave a job active. Actual release dates complete only that department.</p></CardHeader><CardContent className="space-y-4">{workflow?.stages.map(stage => <div key={stage.id} className="rounded-lg border border-border/50 overflow-hidden"><div className="p-3 bg-muted/20 flex flex-wrap justify-between gap-3"><div><p className="font-medium text-sm">{stage.label}</p><p className="text-xs text-muted-foreground mt-0.5">{stage.active} active · {stage.released} released · {stage.overdue} overdue</p></div><Badge variant={stage.overdue ? "destructive" : "secondary"}>{stage.total} tracked</Badge></div>{stage.rows.length ? <div className="divide-y divide-border/40">{stage.rows.slice(0, 8).map(row => <button key={row.id} onClick={() => setLocation(row.sourceLink)} className="w-full text-left px-3 py-2.5 hover:bg-muted/20 flex justify-between gap-3"><span><span className="font-mono text-primary text-sm">{row.containerNumber}</span><span className="text-xs text-muted-foreground ml-2">{row.customerName}</span></span><span className="text-xs text-muted-foreground">{row.state === "released" ? `Released ${isoDate(row.actualDate)}` : `Expected ${isoDate(row.expectedDate)}`}</span></button>)}</div> : <p className="p-3 text-xs text-muted-foreground">No expected or actual dates recorded yet.</p>}</div>)}</CardContent></Card></TabsContent>
      <TabsContent value="reconciliation" className="mt-4"><Card className="border-border/40 bg-card/40"><CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm">Duty Snapshot Reconciliation</CardTitle><p className="text-xs text-muted-foreground mt-1">Separates genuine data issues from older duty balances that have no individual payment record.</p></CardHeader><CardContent className="p-0"><div className="grid grid-cols-3 gap-px bg-border/30">{[["Matched", reconciliation?.summary.matched ?? 0], ["Historical / unledgered", reconciliation?.summary.historicalUnledgered ?? 0], ["Needs attention", reconciliation?.summary.attention ?? 0]].map(([label, value]) => <div key={String(label)} className="bg-card px-4 py-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="font-mono font-semibold text-sm mt-1">{value}</p></div>)}</div>{!reconciliation?.rows.length ? <div className="py-10 text-center text-sm text-muted-foreground">No duty snapshot or ledger balances require reporting.</div> : <div className="divide-y divide-border/40">{reconciliation.rows.map(row => <button key={row.id} onClick={() => setLocation(row.sourceLink)} className="w-full text-left p-4 hover:bg-muted/20 flex flex-wrap justify-between gap-3"><span><span className="font-mono text-primary">{row.containerNumber}</span><span className="text-xs text-muted-foreground ml-2">{row.customerName}</span></span><span className="text-xs">Snapshot {formatCurrency(row.snapshotPaid)} · Ledger {formatCurrency(row.ledgerPaid)} · <span className={row.state === "attention" ? "text-destructive font-medium" : row.state === "historical_unledgered" ? "text-amber-500" : "text-emerald-500"}>{row.state === "historical_unledgered" ? `Historical ${formatCurrency(row.historicalUnledgeredAmount)}` : row.state === "attention" ? "Review required" : "Matched"}</span></span></button>)}</div>}<p className="px-4 py-3 text-[11px] text-muted-foreground border-t border-border/40">{reconciliation?.evidenceNote}</p></CardContent></Card></TabsContent>
    </Tabs>}
    {subscriptionsAllowed && <Card className="border-border/40 bg-card/40"><CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm">Delivery timing</CardTitle><p className="text-xs text-muted-foreground mt-1">New schedules run at this fixed Africa/Lagos time. They do not send immediately when saved.</p></CardHeader><CardContent className="pt-4"><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label className="text-xs">Send at (Lagos time)</Label><Input className="h-9" type="time" value={deliverySendAt} onChange={event => setDeliverySendAt(event.target.value)} /></div><div className="space-y-1.5"><Label className="text-xs">Weekly day</Label><Select value={deliverySendDayOfWeek} onValueChange={setDeliverySendDayOfWeek} disabled={deliveryFrequency !== "weekly"}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day, index) => <SelectItem key={day} value={String(index)}>{day}</SelectItem>)}</SelectContent></Select></div><p className="self-end pb-2 text-xs text-muted-foreground">{deliveryFrequency === "weekly" ? `Weekly schedules send every ${weekdayLabel(Number(deliverySendDayOfWeek))} at ${deliverySendAt}.` : `Daily schedules send every day at ${deliverySendAt}.`}</p></div></CardContent></Card>}
    {subscriptionsAllowed && <Card className="border-border/40 bg-card/40"><CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm flex items-center gap-2"><Mail className="w-4 h-4 text-primary" /> Scheduled Report Delivery</CardTitle><p className="text-xs text-muted-foreground mt-1">Branch administrators can email a daily or weekly Duty Ledger or Workflow Summary. Delivery attempts are retained as evidence.</p></CardHeader><CardContent className="pt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-[1fr_140px_1.4fr_auto] items-end"><div className="space-y-1.5"><Label className="text-xs">Report</Label><Select value={deliveryKind} onValueChange={value => setDeliveryKind(value as ReportSubscription["reportKind"])}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="duty_payment_ledger">Duty Payment Ledger</SelectItem><SelectItem value="workflow_stage_summary">Workflow Stage Summary</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">Frequency</Label><Select value={deliveryFrequency} onValueChange={value => setDeliveryFrequency(value as ReportSubscription["frequency"])}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="daily">Daily</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div><div className="space-y-1.5"><Label className="text-xs">Recipients</Label><Input className="h-9" value={deliveryRecipients} onChange={event => setDeliveryRecipients(event.target.value)} placeholder="finance@example.com, manager@example.com" /></div><Button className="h-9" onClick={createSubscription} disabled={deliveryBusy}>Save schedule</Button></div>{subscriptions.length ? <div className="rounded-lg border border-border/50 divide-y divide-border/40">{subscriptions.map(subscription => <div key={subscription.id} className="p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{subscription.reportKind === "duty_payment_ledger" ? "Duty Payment Ledger" : "Workflow Stage Summary"} <Badge variant="secondary" className="ml-2 text-[10px]">{subscription.frequency}</Badge>{!subscription.isActive && <Badge variant="outline" className="ml-2 text-[10px]">Paused</Badge>}</p><p className="text-xs text-muted-foreground mt-1">{subscription.recipients.join(", ")} · Last sent: {subscription.lastSentAt ? isoDate(subscription.lastSentAt) : "Not sent yet"}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-8 text-xs" disabled={deliveryBusy} onClick={() => sendTest(subscription.id)}>Send test</Button><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => showHistory(subscription.id)}>History</Button><Button size="sm" variant="outline" className="h-8 text-xs" disabled={deliveryBusy} onClick={() => updateSubscription(subscription.id, { isActive: !subscription.isActive })}>{subscription.isActive ? "Pause" : "Resume"}</Button><Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={deliveryBusy} onClick={() => deleteSubscription(subscription.id)}><Trash2 className="w-3.5 h-3.5" /></Button></div></div>{selectedHistoryId === subscription.id && <div className="mt-3 rounded border border-border/40 bg-muted/20 divide-y divide-border/40">{deliveryLogs.length ? deliveryLogs.map(log => <div key={log.id} className="px-3 py-2 text-xs flex flex-wrap justify-between gap-2"><span><Badge variant={log.status === "sent" || log.status === "test_sent" ? "secondary" : "destructive"} className="mr-2 text-[10px]">{log.status === "test_sent" ? "test sent" : log.status === "test_failed" ? "test failed" : log.status}</Badge>{isoDate(log.deliveredAt)} · {log.itemCount} item(s)</span><span className="text-muted-foreground">{log.error || log.recipients.join(", ")}</span></div>) : <p className="px-3 py-3 text-xs text-muted-foreground">No delivery attempts have been recorded yet.</p>}</div>}</div>)}</div> : <p className="text-xs text-muted-foreground">No scheduled reports yet.</p>}</CardContent></Card>}
    {subscriptionsAllowed && archivedSubscriptions.length > 0 && <Card className="border-border/40 bg-card/30"><CardHeader className="pb-3 border-b border-border/40"><CardTitle className="text-sm">Archived report schedules</CardTitle><p className="text-xs text-muted-foreground mt-1">Archived schedules are paused and kept with their delivery history as audit evidence. Restore returns a schedule in a paused state.</p></CardHeader><CardContent className="pt-4 space-y-2">{archivedSubscriptions.map(subscription => <div key={subscription.id} className="rounded-lg border border-border/50 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium">{subscription.reportKind === "duty_payment_ledger" ? "Duty Payment Ledger" : "Workflow Stage Summary"} <Badge variant="outline" className="ml-2 text-[10px]">Archived</Badge></p><p className="text-xs text-muted-foreground mt-1">Archived {isoDate(subscription.archivedAt)} · {subscription.frequency === "weekly" ? `Every ${weekdayLabel(subscription.sendDayOfWeek)}` : "Daily"} at {subscription.sendAt} Lagos · {subscription.recipients.join(", ")}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => showHistory(subscription.id)}>History</Button><Button size="sm" variant="outline" className="h-8 text-xs" disabled={deliveryBusy} onClick={() => updateSubscription(subscription.id, { restore: true })}>Restore paused</Button></div></div>{selectedHistoryId === subscription.id && <div className="mt-3 rounded border border-border/40 bg-muted/20 divide-y divide-border/40">{deliveryLogs.length ? deliveryLogs.map(log => <div key={log.id} className="px-3 py-2 text-xs flex flex-wrap justify-between gap-2"><span><Badge variant={log.status === "sent" || log.status === "test_sent" ? "secondary" : "destructive"} className="mr-2 text-[10px]">{log.status === "test_sent" ? "test sent" : log.status === "test_failed" ? "test failed" : log.status}</Badge>{isoDate(log.deliveredAt)} · {log.itemCount} item(s)</span><span className="text-muted-foreground">{log.error || log.recipients.join(", ")}</span></div>) : <p className="px-3 py-3 text-xs text-muted-foreground">No delivery attempts have been recorded yet.</p>}</div>}</div>)}</CardContent></Card>}
  </section>;
}

export default function ReportsPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ status: string; from: string; to: string }>({ status: "", from: "", to: "" });
  const [mainTab, setMainTab] = useState("containers");
  const [containerTab, setContainerTab] = useState("all");
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useGetContainerReport(
    { status: applied.status || undefined, from: applied.from || undefined, to: applied.to || undefined }
  );

  const { activeBranchId, isSuperAdmin, branches, setActiveBranch } = useBranchScope();
  const showBranchColumn = isSuperAdmin && activeBranchId === "all";

  const allRows = (((data as { containers?: ReportRow[] } | undefined)?.containers) ?? []) as ReportRow[];
  const filteredRows = allRows.filter((c: ReportRow) => {
    if (containerTab === "loss") return c.grossProfit < 0;
    if (containerTab === "profitable") return c.grossProfit > 0;
    if (containerTab === "duty") return c.dutyNotPaid > 0;
    if (containerTab === "completed") return c.status === "closed";
    return true;
  });

  const handleApply = () => setApplied({ status, from, to });
  const handleReset = () => { setStatus(""); setFrom(""); setTo(""); setApplied({ status: "", from: "", to: "" }); };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const qs = buildQueryString({ status: applied.status, from: applied.from, to: applied.to });
      const blob = await customFetch<Blob>(`/api/reports/export${qs ? `?${qs}` : ""}`, { responseType: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "CSV exported", description: `${allRows.length} containers exported.` });
    } catch {
      toast({ variant: "destructive", title: "Export failed" });
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    const mainData = allRows.map(r => ({
      "Container No.": r.containerNumber,
      "BL Number": r.blNumber,
      "Customer": r.customerName,
      "Vessel": r.vessel,
      "Size": r.size,
      "Status": r.status,
      "Assigned To": r.assignedTo,
      "Revenue (₦)": r.clearingCharges,
      "Total Cost (₦)": r.totalCost,
      "Gross Profit (₦)": r.grossProfit,
      "Shipping (₦)": r.shippingCost,
      "Customs (₦)": r.customsCost,
      "Terminal (₦)": r.terminalCost,
      "Delivery (₦)": r.deliveryCost,
      "Operations (₦)": r.operationsCost,
      "Unpaid Duty (₦)": r.dutyNotPaid,
      "Date Created": r.createdAt,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mainData), "All Containers");

    const clientMap: Record<string, ReportRow[]> = {};
    allRows.forEach(r => {
      const k = r.customerName || "Unknown";
      if (!clientMap[k]) clientMap[k] = [];
      clientMap[k].push(r);
    });
    const clientData = Object.entries(clientMap).map(([name, rows]) => ({
      "Client": name,
      "Containers": rows.length,
      "Total Revenue (₦)": rows.reduce((s, r) => s + r.clearingCharges, 0),
      "Total Cost (₦)": rows.reduce((s, r) => s + r.totalCost, 0),
      "Gross Profit (₦)": rows.reduce((s, r) => s + r.grossProfit, 0),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientData), "Client Report");

    const monthMap: Record<string, ReportRow[]> = {};
    allRows.forEach(r => {
      const m = r.createdAt.slice(0, 7);
      if (!monthMap[m]) monthMap[m] = [];
      monthMap[m].push(r);
    });
    const monthlyData = Object.entries(monthMap).sort((a, b) => b[0].localeCompare(a[0])).map(([month, rows]) => ({
      "Month": new Date(month + "-01").toLocaleDateString("en-NG", { month: "long", year: "numeric" }),
      "Containers Processed": rows.length,
      "Total Revenue (₦)": rows.reduce((s, r) => s + r.clearingCharges, 0),
      "Total Expenses (₦)": rows.reduce((s, r) => s + r.totalCost, 0),
      "Net Profit (₦)": rows.reduce((s, r) => s + r.grossProfit, 0),
      "Outstanding Duty (₦)": rows.reduce((s, r) => s + r.dutyNotPaid, 0),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyData), "Monthly Summary");

    const finData = [{
      "Total Clearing Revenue (₦)": allRows.reduce((s, r) => s + r.clearingCharges, 0),
      "Total Shipping (₦)": allRows.reduce((s, r) => s + r.shippingCost, 0),
      "Total Customs (₦)": allRows.reduce((s, r) => s + r.customsCost, 0),
      "Total Terminal (₦)": allRows.reduce((s, r) => s + r.terminalCost, 0),
      "Total Delivery (₦)": allRows.reduce((s, r) => s + r.deliveryCost, 0),
      "Total Operations (₦)": allRows.reduce((s, r) => s + r.operationsCost, 0),
      "Total Cost (₦)": allRows.reduce((s, r) => s + r.totalCost, 0),
      "Net Profit (₦)": allRows.reduce((s, r) => s + r.grossProfit, 0),
    }];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(finData), "Financial Summary");

    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `cost_analysis_report_${date}.xlsx`);
    toast({ title: "Excel exported", description: "All 4 report sheets included." });
  };

  const exportPDF = () => {
    window.print();
  };

  const totalRevenue = allRows.reduce((s, r) => s + r.clearingCharges, 0);
  const totalCost = allRows.reduce((s, r) => s + r.totalCost, 0);
  const totalProfit = totalRevenue - totalCost;
  const lossMakers = allRows.filter(r => r.grossProfit < 0).length;

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #print-report, #print-report * { visibility: visible !important; }
          #print-report { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" /> Reports
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Comprehensive financial reports — export as CSV, Excel, or PDF.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={exportCSV} disabled={exporting || allRows.length === 0} variant="outline" size="sm" className="gap-2">
              {exporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              CSV
            </Button>
            <Button onClick={exportExcel} disabled={allRows.length === 0} variant="outline" size="sm" className="gap-2">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
            </Button>
            <Button onClick={exportPDF} disabled={allRows.length === 0} variant="outline" size="sm" className="gap-2">
              <Printer className="w-3.5 h-3.5" /> PDF
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
              <Filter className="w-4 h-4" /> Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-end">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {WORKFLOW_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">From Date</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To Date</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
              </div>
              {isSuperAdmin && branches.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Branch</Label>
                  <Select value={String(activeBranchId)} onValueChange={v => setActiveBranch(v === "all" ? "all" : Number(v))}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleApply} size="sm" className="flex-1 h-9">Apply</Button>
                <Button onClick={handleReset} size="sm" variant="outline" className="h-9 px-3">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Row */}
        {!isLoading && allRows.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <SumCard label="Total Containers" value={String(allRows.length)} />
            <SumCard label="Total Revenue" value={formatCurrency(totalRevenue)} color="text-primary" />
            <SumCard label="Total Expenses" value={formatCurrency(totalCost)} color="text-orange-400" />
            <SumCard label="Net Profit" value={formatCurrency(totalProfit)} color={totalProfit >= 0 ? "text-emerald-400" : "text-destructive"} sub={lossMakers > 0 ? `${lossMakers} loss-making` : undefined} />
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : isError ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
            <AlertTriangle className="w-9 h-9 text-destructive/50" />
            <p className="text-sm">Failed to load report data.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : (
          <div id="print-report">
            <Tabs value={mainTab} onValueChange={setMainTab}>
              <TabsList className="bg-card/40 border border-border/50 flex-wrap h-auto">
                <TabsTrigger value="containers" className="gap-2 text-xs">
                  <FileDown className="w-3.5 h-3.5" /> All Containers
                </TabsTrigger>
                <TabsTrigger value="clients" className="gap-2 text-xs">
                  <Users className="w-3.5 h-3.5" /> Client Report
                </TabsTrigger>
                <TabsTrigger value="operations" className="gap-2 text-xs">
                  <BarChart3 className="w-3.5 h-3.5" /> Operations
                </TabsTrigger>
                <TabsTrigger value="financial" className="gap-2 text-xs">
                  <PieChart className="w-3.5 h-3.5" /> Financial
                </TabsTrigger>
                <TabsTrigger value="monthly" className="gap-2 text-xs">
                  <CalendarRange className="w-3.5 h-3.5" /> Monthly Summary
                </TabsTrigger>
              </TabsList>

              <TabsContent value="containers" className="mt-4 space-y-4">
                <Tabs value={containerTab} onValueChange={setContainerTab}>
                  <TabsList className="bg-card/40 border border-border/50 flex-wrap h-auto">
                    <TabsTrigger value="all" className="gap-1.5 text-xs">
                      All <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-0.5">{allRows.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="profitable" className="gap-1.5 text-xs text-emerald-400">
                      <TrendingUp className="w-3 h-3" /> Profitable
                    </TabsTrigger>
                    <TabsTrigger value="loss" className="gap-1.5 text-xs text-destructive">
                      <TrendingDown className="w-3 h-3" /> Loss-Making
                    </TabsTrigger>
                    <TabsTrigger value="duty" className="gap-1.5 text-xs text-amber-400">
                      <DollarSign className="w-3 h-3" /> Outstanding Duty
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-1.5 text-xs">
                      <CheckCircle2 className="w-3 h-3" /> Closed
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
                <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
                  <CardContent className="p-0">
                    <ContainersTable rows={filteredRows} showBranch={showBranchColumn} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="clients" className="mt-4">
                <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
                  <CardHeader className="border-b border-border/40 pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Users className="w-4 h-4 text-primary" /> Client Report
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Revenue, cost and gross profit grouped by client.</p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ClientReportsTable rows={allRows} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="operations" className="mt-4">
                <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
                  <CardHeader className="border-b border-border/40 pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-primary" /> Operations Report
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Container volumes by vessel and size.</p>
                  </CardHeader>
                  <CardContent className="p-4">
                    <OperationsReport rows={allRows} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="financial" className="mt-4">
                <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
                  <CardHeader className="border-b border-border/40 pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-primary" /> Financial Report
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Expense breakdown by category and key financial metrics.</p>
                  </CardHeader>
                  <CardContent className="p-4">
                    <FinancialReport rows={allRows} />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="monthly" className="mt-4">
                <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
                  <CardHeader className="border-b border-border/40 pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <CalendarRange className="w-4 h-4 text-primary" /> Monthly Summary
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Month-by-month breakdown of containers, revenue, expenses and profit.</p>
                  </CardHeader>
                  <CardContent className="p-0">
                    <MonthlySummary rows={allRows} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
        <ReportCentreSection from={applied.from} to={applied.to} />
        <FinancialControlSection from={applied.from} to={applied.to} />
        {/* Delivery Tracking Report */}
        <div className="border-t border-border/40 pt-6">
          <DeliveryReportSection />
        </div>

        {/* FX Rate History Section */}
        <div className="border-t border-border/40 pt-6">
          <FxHistorySection />
        </div>

        {/* Invoice Aging Section */}
        <div className="border-t border-border/40 pt-6">
          <InvoiceAgingSection />
        </div>

        {/* Printable Reports Section */}
        <div className="border-t border-border/40 pt-6">
          <PrintableReportsSection />
        </div>
      </motion.div>
    </>
  );
}
