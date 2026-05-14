import { useState, useMemo } from "react";
import { useGetDisbursementReconciliation, type DisbursementReconciliationRow } from "@workspace/api-client-react";
import { useBranchScope } from "@/components/layout/branch-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { Loader2, Filter, TrendingUp, TrendingDown, Scale, AlertTriangle, RefreshCw, Download, ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { WORKFLOW_STAGES } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";

const SECTIONS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
const SECTION_LABELS: Record<string, string> = {
  shipping: "Shipping", customs: "Customs", terminal: "Terminal",
  delivery: "Delivery", operations: "Operations",
};

type SortKey = "containerNumber" | "status" | "budgeted" | "disbursed" | "variance";
type SortDir = "asc" | "desc";

function VarianceCell({ variance, size = "sm" }: { variance: number; size?: "sm" | "xs" }) {
  const textSize = size === "xs" ? "text-[10px]" : "text-xs";
  if (variance === 0) return <span className={`${textSize} text-muted-foreground font-mono`}>—</span>;
  const over = variance > 0;
  return (
    <span className={`${textSize} font-mono font-semibold flex items-center justify-end gap-0.5 ${over ? "text-red-400" : "text-emerald-400"}`}>
      {over ? <TrendingUp className="w-3 h-3 shrink-0" /> : <TrendingDown className="w-3 h-3 shrink-0" />}
      {over ? "+" : ""}{formatCurrency(variance)}
    </span>
  );
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 opacity-40 inline ml-1" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 inline ml-1" />
    : <ChevronDown className="w-3 h-3 inline ml-1" />;
}

function AggCard({ label, budgeted, disbursed, variance }: { label: string; budgeted: number; disbursed: number; variance: number }) {
  const over = variance > 0;
  const under = variance < 0;
  return (
    <div className="bg-card/40 border border-border/40 rounded-lg p-3 space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
        <div>
          <div>Budgeted</div>
          <div className="font-mono font-semibold text-foreground text-xs">{formatCurrency(budgeted)}</div>
        </div>
        <div>
          <div>Disbursed</div>
          <div className="font-mono font-semibold text-foreground text-xs">{formatCurrency(disbursed)}</div>
        </div>
        <div>
          <div>Variance</div>
          <div className={`font-mono font-bold text-xs ${over ? "text-red-400" : under ? "text-emerald-400" : "text-muted-foreground"}`}>
            {variance === 0 ? "—" : `${over ? "+" : ""}${formatCurrency(variance)}`}
          </div>
        </div>
      </div>
    </div>
  );
}

function ContainerRow({ row, showBranch }: { row: DisbursementReconciliationRow; showBranch?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const over = row.totals.variance > 0;
  const under = row.totals.variance < 0;
  const colCount = showBranch ? 7 : 6;
  return (
    <>
      <tr
        className="border-b border-border/20 hover:bg-muted/5 cursor-pointer transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <td className="px-4 py-3">
          <div className="font-mono font-semibold text-sm text-primary">{row.containerNumber}</div>
          <div className="text-[10px] text-muted-foreground">{row.customerName}</div>
          {row.blNumber && <div className="text-[9px] text-muted-foreground/60 font-mono">BL: {row.blNumber}</div>}
        </td>
        <td className="px-4 py-3">
          <Badge className="text-[9px] capitalize">{row.status?.replace(/_/g, " ")}</Badge>
        </td>
        {showBranch && (
          <td className="px-4 py-3 text-xs text-muted-foreground">{row.branchName ?? "—"}</td>
        )}
        <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground">{formatCurrency(row.totals.budgeted)}</td>
        <td className="px-4 py-3 text-right font-mono text-sm">{formatCurrency(row.totals.disbursed)}</td>
        <td className="px-4 py-3 text-right">
          <VarianceCell variance={row.totals.variance} />
        </td>
        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
          {expanded ? "▲" : "▼"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/10 bg-muted/5">
          <td colSpan={colCount} className="px-6 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left pb-1 font-medium">Section</th>
                  <th className="text-right pb-1 font-medium">Budgeted</th>
                  <th className="text-right pb-1 font-medium">Disbursed</th>
                  <th className="text-right pb-1 font-medium">Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {SECTIONS.map(sec => {
                  const s = row.sections[sec] ?? { budgeted: 0, disbursed: 0, variance: 0 };
                  return (
                    <tr key={sec}>
                      <td className="py-1 capitalize font-medium">{SECTION_LABELS[sec]}</td>
                      <td className="py-1 text-right font-mono text-muted-foreground">{formatCurrency(s.budgeted)}</td>
                      <td className="py-1 text-right font-mono">{formatCurrency(s.disbursed)}</td>
                      <td className="py-1 text-right"><VarianceCell variance={s.variance} size="xs" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function exportCsv(rows: DisbursementReconciliationRow[], filename: string) {
  const esc = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "Container", "Customer", "BL Number", "Status",
    "Total Budgeted (₦)", "Total Disbursed (₦)", "Variance (₦)",
    ...SECTIONS.flatMap(sec => [
      `${SECTION_LABELS[sec]} Budgeted (₦)`,
      `${SECTION_LABELS[sec]} Disbursed (₦)`,
      `${SECTION_LABELS[sec]} Variance (₦)`,
    ]),
  ];
  const dataRows = rows.map(r => [
    esc(r.containerNumber), esc(r.customerName), esc(r.blNumber ?? ""), esc(r.status),
    r.totals.budgeted.toFixed(2), r.totals.disbursed.toFixed(2), r.totals.variance.toFixed(2),
    ...SECTIONS.flatMap(sec => {
      const s = r.sections[sec] ?? { budgeted: 0, disbursed: 0, variance: 0 };
      return [s.budgeted.toFixed(2), s.disbursed.toFixed(2), s.variance.toFixed(2)];
    }),
  ].join(","));
  const csv = [headers.join(","), ...dataRows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function DisbursementReconciliationPage() {
  const { toast } = useToast();
  const { activeBranchId, isSuperAdmin, branches, setActiveBranch } = useBranchScope();
  const showBranchColumn = isSuperAdmin && activeBranchId === "all";
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [applied, setApplied] = useState<{ from: string; to: string; status: string } | null>(null);
  const [generated, setGenerated] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("variance");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data, isLoading, isError, refetch } = useGetDisbursementReconciliation(
    applied
      ? {
          from: applied.from || undefined,
          to: applied.to || undefined,
          status: applied.status !== "all" ? applied.status : undefined,
        }
      : { from: undefined, to: undefined, status: undefined },
    { enabled: generated }
  );

  const handleGenerate = () => {
    setApplied({ from, to, status: statusFilter });
    setGenerated(true);
  };

  const handleReset = () => {
    setFrom(""); setTo(""); setStatusFilter("all");
    setApplied(null); setGenerated(false);
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "variance" ? "desc" : "asc"); }
  };

  const sortedRows = useMemo(() => {
    const rows = [...(data?.rows ?? [])];
    rows.sort((a, b) => {
      let av: number | string;
      let bv: number | string;
      switch (sortKey) {
        case "containerNumber": av = a.containerNumber; bv = b.containerNumber; break;
        case "status":          av = a.status;          bv = b.status;          break;
        case "budgeted":        av = a.totals.budgeted;  bv = b.totals.budgeted; break;
        case "disbursed":       av = a.totals.disbursed; bv = b.totals.disbursed; break;
        case "variance":
        default:                av = Math.abs(a.totals.variance); bv = Math.abs(b.totals.variance); break;
      }
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return rows;
  }, [data?.rows, sortKey, sortDir]);

  const agg = data?.aggregate;

  const thClass = "px-4 py-3 text-left font-medium cursor-pointer hover:text-foreground select-none";
  const thRClass = "px-4 py-3 text-right font-medium cursor-pointer hover:text-foreground select-none";

  return (
    <div className="max-w-6xl mx-auto space-y-6 py-6 px-4">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          Disbursement vs Budget Reconciliation
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Compare budgeted charges to actual disbursements (money paid out) per container and section.
          Filter by payment date range and container status.
        </p>
      </div>

      {/* Filters */}
      <Card className="border-border/40 bg-card/40">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            {isSuperAdmin && (
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Building2 className="w-3 h-3" /> Branch</Label>
                <Select value={String(activeBranchId)} onValueChange={v => setActiveBranch(v === "all" ? "all" : Number(v))}>
                  <SelectTrigger className="h-8 text-xs border-border/50 w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Payment Date From</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-8 text-xs w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment Date To</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-8 text-xs w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Container Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-xs w-44 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {WORKFLOW_STAGES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleGenerate} disabled={isLoading}>
              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Filter className="w-3 h-3" />}
              {generated ? "Refresh" : "Generate Report"}
            </Button>
            {generated && (
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleReset}>Reset</Button>
            )}
            {data && sortedRows.length > 0 && (
              <Button
                size="sm" variant="outline" className="h-8 text-xs gap-1.5 ml-auto"
                onClick={() => {
                  exportCsv(sortedRows, `disbursement-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`);
                  toast({ title: "CSV exported", description: `${sortedRows.length} containers exported.` });
                }}
              >
                <Download className="w-3 h-3" /> Export CSV
              </Button>
            )}
          </div>
          {!generated && (
            <p className="text-xs text-muted-foreground mt-3">
              Leave dates blank to include <span className="font-semibold">all disbursements across all time</span>, or filter by a specific payment period and/or status.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Error state */}
      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive">Failed to load reconciliation data</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-16">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading reconciliation data…</span>
          </div>
        </div>
      )}

      {/* Aggregate summary */}
      {data && agg && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="col-span-2 sm:col-span-3 lg:col-span-1 bg-card/40 border border-border/40 rounded-lg p-3 flex flex-col justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Containers</div>
              <div className="font-bold text-2xl mt-1">{sortedRows.length}</div>
              <div className={`text-xs font-semibold mt-1 ${agg.totals.variance > 0 ? "text-red-400" : agg.totals.variance < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                {agg.totals.variance === 0 ? "On budget" : agg.totals.variance > 0 ? "Over budget" : "Under budget"}
              </div>
            </div>
            {SECTIONS.map(sec => (
              <AggCard
                key={sec}
                label={SECTION_LABELS[sec]}
                budgeted={agg.sections[sec]?.budgeted ?? 0}
                disbursed={agg.sections[sec]?.disbursed ?? 0}
                variance={agg.sections[sec]?.variance ?? 0}
              />
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground/70 -mt-1">
            Section cards show the 5 standard cost categories. The grand total below includes any payments recorded without a category (unallocated disbursements).
          </p>

          {/* Grand total bar */}
          <div className="bg-card/40 border border-border/40 rounded-lg p-4 flex flex-wrap gap-6 items-center">
            <div>
              <div className="text-xs text-muted-foreground">Total Budgeted</div>
              <div className="font-mono font-bold text-lg text-muted-foreground">{formatCurrency(agg.totals.budgeted)}</div>
            </div>
            <div className="text-muted-foreground/40 text-xl">vs</div>
            <div>
              <div className="text-xs text-muted-foreground">Total Disbursed</div>
              <div className="font-mono font-bold text-lg">{formatCurrency(agg.totals.disbursed)}</div>
            </div>
            <div className="ml-auto">
              <div className="text-xs text-muted-foreground">Net Variance</div>
              <div className={`font-mono font-bold text-lg ${agg.totals.variance > 0 ? "text-red-400" : agg.totals.variance < 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                {agg.totals.variance === 0 ? "₦0.00" : `${agg.totals.variance > 0 ? "+" : ""}${formatCurrency(agg.totals.variance)}`}
              </div>
              <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                {agg.totals.variance > 0
                  ? <><TrendingUp className="w-3 h-3 text-red-400" /> Over budget</>
                  : agg.totals.variance < 0
                  ? <><TrendingDown className="w-3 h-3 text-emerald-400" /> Under budget</>
                  : "On budget"}
              </div>
            </div>
          </div>

          {/* Container table */}
          {sortedRows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-sm">
              No disbursements found for the selected filters.
            </div>
          ) : (
            <Card className="border-border/40 bg-card/40">
              <CardHeader className="pb-3 border-b border-border/30">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" />
                  Container Reconciliation
                  <span className="text-xs text-muted-foreground font-normal ml-1">— click a row to expand section breakdown</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className={thClass} onClick={() => handleSort("containerNumber")}>
                          Container <SortIcon col="containerNumber" sortKey={sortKey} sortDir={sortDir} />
                        </th>
                        <th className={thClass} onClick={() => handleSort("status")}>
                          Status <SortIcon col="status" sortKey={sortKey} sortDir={sortDir} />
                        </th>
                        {showBranchColumn && (
                          <th className={thClass}>Branch</th>
                        )}
                        <th className={thRClass} onClick={() => handleSort("budgeted")}>
                          Budgeted (₦) <SortIcon col="budgeted" sortKey={sortKey} sortDir={sortDir} />
                        </th>
                        <th className={thRClass} onClick={() => handleSort("disbursed")}>
                          Disbursed (₦) <SortIcon col="disbursed" sortKey={sortKey} sortDir={sortDir} />
                        </th>
                        <th className={thRClass} onClick={() => handleSort("variance")}>
                          Variance (₦) <SortIcon col="variance" sortKey={sortKey} sortDir={sortDir} />
                        </th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map(row => (
                        <ContainerRow key={row.containerId} row={row} showBranch={showBranchColumn} />
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-border/40 bg-muted/10">
                      <tr>
                        <td className="px-4 py-3 font-bold text-sm" colSpan={showBranchColumn ? 3 : 2}>Totals ({sortedRows.length} containers)</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-muted-foreground">{formatCurrency(agg.totals.budgeted)}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">{formatCurrency(agg.totals.disbursed)}</td>
                        <td className="px-4 py-3 text-right">
                          <VarianceCell variance={agg.totals.variance} />
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!generated && !isLoading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted/20 border border-border/30 flex items-center justify-center">
            <Scale className="w-6 h-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">Set your filters above and click Generate Report</p>
          <p className="text-xs text-muted-foreground/60">Or leave all filters blank to see all-time reconciliation across every container</p>
        </div>
      )}
    </div>
  );
}
