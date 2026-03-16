import { useState, useEffect } from "react";
import { useListContainers } from "@workspace/api-client-react";
import { formatCurrency, getStatusColor, getStatusLabel, WORKFLOW_STAGES } from "@/lib/format";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, SlidersHorizontal, ChevronLeft, ChevronRight,
  AlertCircle, FileSpreadsheet, ChevronsUpDown, ChevronUp, ChevronDown,
  X, Filter, TrendingDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type SortField = "containerNumber" | "customerName" | "declaration" | "status" | "clearingCharges" | "totalCost" | "grossProfit";
type SortDir = "asc" | "desc";

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 text-muted-foreground/50 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-primary inline" />
    : <ChevronDown className="w-3.5 h-3.5 ml-1 text-primary inline" />;
}

export default function Containers() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [profitFilter, setProfitFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("containerNumber");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const limit = 15;

  useEffect(() => {
    const stored = sessionStorage.getItem("containerSearch");
    if (stored) {
      setSearch(stored);
      sessionStorage.removeItem("containerSearch");
    }
  }, []);

  const { data, isLoading, isError } = useListContainers(
    { page, limit, ...(search ? { search } : {}), ...(status !== "all" ? { status } : {}) },
    { query: { keepPreviousData: true } }
  );

  const hasActiveFilters = status !== "all" || profitFilter !== "all" || dateFrom || dateTo;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = [...(data?.containers ?? [])].filter((c: any) => {
    if (profitFilter === "profitable" && (c.grossProfit ?? 0) <= 0) return false;
    if (profitFilter === "loss" && (c.grossProfit ?? 0) > 0) return false;
    if (profitFilter === "low" && ((c.grossProfit ?? 0) <= 0 || (c.grossProfit / (c.clearingCharges || 1)) > 0.1)) return false;
    if (dateFrom && new Date(c.createdAt) < new Date(dateFrom)) return false;
    if (dateTo && new Date(c.createdAt) > new Date(dateTo + "T23:59:59")) return false;
    return true;
  }).sort((a, b) => {
    let av: any = a[sortField as keyof typeof a] ?? "";
    let bv: any = b[sortField as keyof typeof b] ?? "";
    if (typeof av === "number" && typeof bv === "number") {
      return sortDir === "asc" ? av - bv : bv - av;
    }
    av = String(av).toLowerCase();
    bv = String(bv).toLowerCase();
    return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const Th = ({ field, label, right = false }: { field: SortField; label: string; right?: boolean }) => (
    <th
      className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-foreground transition-colors ${right ? "text-right" : "text-left"}`}
      onClick={() => handleSort(field)}
    >
      {label}
      <SortIcon field={field} sortField={sortField} sortDir={sortDir} />
    </th>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Container Directory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage and track all container clearing records.</p>
        </div>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        {/* Search + filter bar */}
        <div className="p-4 border-b border-border/50 bg-background/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by Container #, BL #, Customer, Vessel…"
                className="pl-9 bg-background border-border/60"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
              {search && (
                <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px] bg-background border-border/60">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {WORKFLOW_STAGES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={showFilters ? "default" : "outline"}
                onClick={() => setShowFilters(v => !v)}
                className="gap-1.5 shrink-0"
              >
                <Filter className="w-3.5 h-3.5" />
                Filters
                {hasActiveFilters && <Badge className="ml-0.5 h-4 px-1 text-[10px] leading-none bg-primary/30 text-primary border-0">!</Badge>}
              </Button>
            </div>
          </div>

          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 border-t border-border/40 mt-1">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Profit Status</label>
                    <Select value={profitFilter} onValueChange={(v) => { setProfitFilter(v); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs bg-background border-border/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Containers</SelectItem>
                        <SelectItem value="profitable">Profitable Only</SelectItem>
                        <SelectItem value="low">Low Margin (&lt;10%)</SelectItem>
                        <SelectItem value="loss">Loss-Making</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Created From</label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={e => { setDateFrom(e.target.value); setPage(1); }}
                      className="h-8 text-xs bg-background border-border/60"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Created To</label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={e => { setDateTo(e.target.value); setPage(1); }}
                      className="h-8 text-xs bg-background border-border/60"
                    />
                  </div>
                </div>
                {hasActiveFilters && (
                  <button
                    onClick={() => { setStatus("all"); setProfitFilter("all"); setDateFrom(""); setDateTo(""); setPage(1); }}
                    className="mt-2 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear all filters
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase tracking-wider border-b border-border/50">
              <tr>
                <Th field="containerNumber" label="Container / BL" />
                <Th field="customerName"    label="Customer" />
                <Th field="declaration"     label="Declaration" />
                <th className="px-4 py-3 font-medium text-left">Vessel / Size</th>
                <Th field="status"           label="Status" />
                <Th field="clearingCharges" label="Clearing Charges" right />
                <Th field="totalCost"       label="Total Cost" right />
                <Th field="grossProfit"     label="Gross Profit" right />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse bg-card/20">
                    {[...Array(8)].map((__, j) => (
                      <td key={j} className="px-4 py-4">
                        <div className="h-4 bg-muted/50 rounded w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-destructive">
                    <div className="flex flex-col items-center justify-center">
                      <AlertCircle className="w-8 h-8 mb-2" />
                      Failed to load containers.
                    </div>
                  </td>
                </tr>
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <FileSpreadsheet className="w-12 h-12 mb-4 text-muted-foreground/30" />
                      <p className="text-base">No containers found matching your criteria.</p>
                      <p className="text-sm mt-1">Try adjusting your search or filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                sorted.map((container) => (
                  <tr
                    key={container.id}
                    onClick={() => setLocation(`/containers/${container.id}`)}
                    className="hover:bg-accent/50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-4">
                      <div className="font-mono font-medium text-foreground group-hover:text-primary transition-colors">
                        {container.containerNumber}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">BL: {container.blNumber}</div>
                    </td>
                    <td className="px-4 py-4 font-medium max-w-[140px] truncate">{container.customerName}</td>
                    <td className="px-4 py-4 text-muted-foreground font-mono text-xs">
                      {container.declaration || <span className="italic text-muted-foreground/50">—</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-foreground">{container.vessel || "—"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{container.size || "—"}</div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border uppercase tracking-wider ${getStatusColor(container.status)}`}>
                        {getStatusLabel(container.status)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono text-sm text-foreground">
                        {formatCurrency(container.clearingCharges)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-mono text-sm text-muted-foreground">
                        {formatCurrency(container.totalCost)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={`font-mono font-semibold ${container.grossProfit < 0 ? "text-destructive" : container.grossProfit > 0 ? "text-emerald-400" : "text-muted-foreground"}`}>
                        {formatCurrency(container.grossProfit)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="p-4 border-t border-border/50 flex items-center justify-between bg-background/30 text-sm text-muted-foreground">
            <div>
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, data.total)} of{" "}
              <span className="font-medium text-foreground">{data.total}</span> entries
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="hover-elevate"
              >
                <ChevronLeft className="w-4 h-4 mr-1" /> Prev
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= data.total}
                className="hover-elevate"
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </motion.div>
  );
}
