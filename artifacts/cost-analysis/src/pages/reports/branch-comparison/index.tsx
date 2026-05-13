import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Building2, Download, Loader2, AlertTriangle, TrendingUp, TrendingDown, ChevronUp, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/components/layout/auth-provider";
import { customFetch } from "@workspace/api-client-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

type Row = {
  branchId: number;
  branchName: string;
  isActive: boolean;
  containers: number;
  revenue: number;
  costs: number;
  grossProfit: number;
  marginPct: number;
  avgTurnaroundDays: number;
  outstandingReceivables: number;
};

type Response = {
  period: { from: string | null; to: string | null };
  rows: Row[];
  totals: { containers: number; revenue: number; costs: number; grossProfit: number; outstandingReceivables: number };
  generatedAt: string;
};

export default function BranchComparisonPage() {
  const { isSuperAdmin } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from: string; to: string }>({ from: "", to: "" });

  const { data, isLoading, isError, refetch } = useQuery<Response>({
    queryKey: ["branch-comparison", applied.from, applied.to],
    enabled: !!isSuperAdmin,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (applied.from) params.set("from", applied.from);
      if (applied.to) params.set("to", applied.to);
      const qs = params.toString();
      return customFetch<Response>(`/api/reports/branch-comparison${qs ? `?${qs}` : ""}`, { method: "GET" });
    },
  });

  type SortKey = "branchName" | "containers" | "revenue" | "costs" | "grossProfit" | "marginPct" | "avgTurnaroundDays" | "outstandingReceivables";
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />) : null;

  const totals = data?.totals;
  const rows = useMemo(() => {
    const r = [...(data?.rows ?? [])];
    r.sort((a, b) => {
      const av = a[sortKey] as number | string;
      const bv = b[sortKey] as number | string;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return r;
  }, [data?.rows, sortKey, sortDir]);

  const chartData = useMemo(
    () => rows.map(r => ({ name: r.branchName, Revenue: r.revenue, Costs: r.costs, "Gross Profit": r.grossProfit })),
    [rows]
  );

  const exportCSV = () => {
    if (!rows.length) return;
    const headers = ["Branch", "Containers", "Revenue (₦)", "Costs (₦)", "Gross Profit (₦)", "Margin %", "Avg Turnaround (days)", "Outstanding AR (₦)"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      lines.push([
        `"${r.branchName.replace(/"/g, '""')}"`,
        r.containers,
        r.revenue.toFixed(2),
        r.costs.toFixed(2),
        r.grossProfit.toFixed(2),
        r.marginPct.toFixed(2),
        r.avgTurnaroundDays.toFixed(1),
        r.outstandingReceivables.toFixed(2),
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `branch-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isSuperAdmin) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-amber-400 mb-3" />
        <p className="text-sm text-muted-foreground">Branch comparison is only available to super-administrators.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" /> Branch Comparison
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Cross-branch executive overview — revenue, costs, profit, and operations side-by-side.
          </p>
        </div>
        <Button onClick={exportCSV} disabled={!rows.length} variant="outline" size="sm" className="gap-2">
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Period filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setApplied({ from, to })} size="sm" className="flex-1 h-9">Apply</Button>
              <Button onClick={() => { setFrom(""); setTo(""); setApplied({ from: "", to: "" }); }} size="sm" variant="outline" className="h-9">Reset</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      ) : isError ? (
        <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
          <AlertTriangle className="w-9 h-9 text-destructive/50" />
          <p className="text-sm">Failed to load branch comparison.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : (
        <>
          {totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SumCard label="Total Containers" value={String(totals.containers)} />
              <SumCard label="Total Revenue" value={formatCurrency(totals.revenue)} color="text-primary" />
              <SumCard label="Total Costs" value={formatCurrency(totals.costs)} color="text-orange-400" />
              <SumCard label="Net Profit" value={formatCurrency(totals.grossProfit)} color={totals.grossProfit >= 0 ? "text-emerald-400" : "text-destructive"} />
            </div>
          )}

          <Card className="border-border/40 bg-card/40">
            <CardHeader><CardTitle className="text-sm font-semibold">Revenue vs Costs by Branch</CardTitle></CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" style={{ fontSize: 11 }} />
                    <YAxis stroke="hsl(var(--muted-foreground))" style={{ fontSize: 11 }} tickFormatter={v => `₦${(v/1_000_000).toFixed(1)}M`} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="Revenue" fill="hsl(var(--primary))" />
                    <Bar dataKey="Costs" fill="hsl(24 95% 53%)" />
                    <Bar dataKey="Gross Profit" fill="hsl(142 71% 45%)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/40 bg-card/40">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("branchName")}>Branch<SortIcon col="branchName" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("containers")}>Containers<SortIcon col="containers" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("revenue")}>Revenue<SortIcon col="revenue" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("costs")}>Costs<SortIcon col="costs" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("grossProfit")}>Gross Profit<SortIcon col="grossProfit" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("marginPct")}>Margin %<SortIcon col="marginPct" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("avgTurnaroundDays")}>Avg Turnaround<SortIcon col="avgTurnaroundDays" /></th>
                      <th className="px-4 py-3 text-right font-semibold cursor-pointer select-none hover:text-foreground" onClick={() => handleSort("outstandingReceivables")}>Outstanding AR<SortIcon col="outstandingReceivables" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.branchId} className="border-t border-border/40 hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium flex items-center gap-2">
                          {r.branchName}
                          {!r.isActive && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{r.containers}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(r.revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-orange-400">{formatCurrency(r.costs)}</td>
                        <td className={`px-4 py-3 text-right font-mono font-semibold ${r.grossProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {r.grossProfit >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {formatCurrency(r.grossProfit)}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${r.marginPct >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                          {r.marginPct.toFixed(1)}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{r.avgTurnaroundDays.toFixed(1)}d</td>
                        <td className="px-4 py-3 text-right font-mono text-amber-400">{formatCurrency(r.outstandingReceivables)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground text-sm">No branches found.</td></tr>
                    )}
                  </tbody>
                  {totals && rows.length > 0 && (
                    <tfoot className="bg-secondary/40 font-semibold">
                      <tr>
                        <td className="px-4 py-3">Total</td>
                        <td className="px-4 py-3 text-right font-mono">{totals.containers}</td>
                        <td className="px-4 py-3 text-right font-mono">{formatCurrency(totals.revenue)}</td>
                        <td className="px-4 py-3 text-right font-mono text-orange-400">{formatCurrency(totals.costs)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${totals.grossProfit >= 0 ? "text-emerald-400" : "text-destructive"}`}>
                          {formatCurrency(totals.grossProfit)}
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right font-mono text-amber-400">{formatCurrency(totals.outstandingReceivables)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>

          {data?.generatedAt && (
            <p className="text-[10px] text-muted-foreground text-right">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </p>
          )}
        </>
      )}
    </motion.div>
  );
}

function SumCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="p-4">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-xl font-bold font-mono mt-1 ${color ?? "text-foreground"}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
