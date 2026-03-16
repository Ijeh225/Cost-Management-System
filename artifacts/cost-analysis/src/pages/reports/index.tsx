import { useState, useEffect } from "react";
import { useGetContainerReport } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileDown, Filter, AlertTriangle, RefreshCw } from "lucide-react";
import { formatCurrency, getStatusColor, getStatusLabel, WORKFLOW_STAGES } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

const ALL_STATUSES = WORKFLOW_STAGES.map(s => s.value);

function buildQueryString(params: Record<string, string>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, v); });
  return q.toString();
}

export default function ReportsPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  useEffect(() => { if (!isAdmin) setLocation("/"); }, [isAdmin]);
  const { toast } = useToast();
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ status: string; from: string; to: string }>({ status: "", from: "", to: "" });
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, refetch } = useGetContainerReport(
    { status: applied.status || undefined, from: applied.from || undefined, to: applied.to || undefined },
    { query: { enabled: true } }
  );

  const containers = (data as any)?.containers ?? [];

  const handleApply = () => setApplied({ status, from, to });
  const handleReset = () => { setStatus(""); setFrom(""); setTo(""); setApplied({ status: "", from: "", to: "" }); };

  const handleExport = async () => {
    setExporting(true);
    try {
      const qs = buildQueryString({ status: applied.status, from: applied.from, to: applied.to });
      const resp = await fetch(`/api/reports/export${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `containers_report_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete.", description: `${containers.length} containers exported.` });
    } catch {
      toast({ variant: "destructive", title: "Export failed", description: "Please try again." });
    } finally {
      setExporting(false);
    }
  };

  const totalRevenue  = containers.reduce((s: number, c: any) => s + (c.clearingCharges ?? 0), 0);
  const totalCost     = containers.reduce((s: number, c: any) => s + (c.totalCost ?? 0), 0);
  const totalProfit   = totalRevenue - totalCost;
  const lossMakers    = containers.filter((c: any) => c.grossProfit < 0).length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileDown className="w-6 h-6 text-primary" /> Reports
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Filter and export container financials to CSV.</p>
        </div>
        <Button onClick={handleExport} disabled={exporting || containers.length === 0} className="gap-2 shadow-md">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          Export CSV ({containers.length})
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
            <Filter className="w-4 h-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status || "all"} onValueChange={v => setStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {WORKFLOW_STAGES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
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
      {!isLoading && containers.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
            <div className="text-xs text-muted-foreground mb-1">Containers</div>
            <div className="font-bold text-lg">{containers.length}</div>
          </div>
          <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
            <div className="text-xs text-muted-foreground mb-1">Total Revenue</div>
            <div className="font-bold font-mono text-primary">{formatCurrency(totalRevenue)}</div>
          </div>
          <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
            <div className="text-xs text-muted-foreground mb-1">Total Cost</div>
            <div className="font-bold font-mono text-orange-400">{formatCurrency(totalCost)}</div>
          </div>
          <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
            <div className="text-xs text-muted-foreground mb-1">Net Profit</div>
            <div className={`font-bold font-mono ${totalProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>{formatCurrency(totalProfit)}</div>
            {lossMakers > 0 && <div className="text-[10px] text-destructive/70 mt-0.5">{lossMakers} loss-making</div>}
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
          ) : isError ? (
            <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
              <AlertTriangle className="w-9 h-9 text-destructive/50" />
              <p className="text-sm">Failed to load report data.</p>
            </div>
          ) : containers.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">No containers match the current filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Container / BL</th>
                    <th className="px-5 py-3 text-left font-medium">Customer</th>
                    <th className="px-5 py-3 text-left font-medium">Vessel / Size</th>
                    <th className="px-5 py-3 text-left font-medium">Status</th>
                    <th className="px-5 py-3 text-left font-medium">Assigned To</th>
                    <th className="px-5 py-3 text-right font-medium">Revenue (₦)</th>
                    <th className="px-5 py-3 text-right font-medium">Total Cost (₦)</th>
                    <th className="px-5 py-3 text-right font-medium">Gross Profit (₦)</th>
                    <th className="px-5 py-3 text-right font-medium">Unpaid Duty (₦)</th>
                    <th className="px-5 py-3 text-left font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {containers.map((c: any) => (
                    <tr key={c.id} className={`hover:bg-accent/30 transition-colors ${c.grossProfit < 0 ? "bg-destructive/5" : ""}`}>
                      <td className="px-5 py-3">
                        <div className="font-mono font-medium text-primary">{c.containerNumber}</div>
                        <div className="text-xs text-muted-foreground">{c.blNumber}</div>
                      </td>
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
                      <td className="px-5 py-3 text-muted-foreground text-xs">{c.assignedTo || "—"}</td>
                      <td className="px-5 py-3 text-right font-mono">{formatCurrency(c.clearingCharges)}</td>
                      <td className="px-5 py-3 text-right font-mono text-orange-400">{formatCurrency(c.totalCost)}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold">
                        <span className={c.grossProfit >= 0 ? "text-emerald-400" : "text-destructive"}>
                          {formatCurrency(c.grossProfit)}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-xs">
                        {c.dutyNotPaid > 0 ? (
                          <span className="text-amber-400">{formatCurrency(c.dutyNotPaid)}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground font-mono">{c.createdAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
