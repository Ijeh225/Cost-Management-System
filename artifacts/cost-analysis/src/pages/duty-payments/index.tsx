import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  useListDutyPayments,
  useRecordDutyPayment,
  listDutyPayments,
  type DutyPaymentRow,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Banknote, Search, Filter, X, Download, FileSpreadsheet, FileText,
  Loader2, AlertCircle, ChevronLeft, ChevronRight, ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import {
  formatCurrency, getStatusColor, getStatusLabel,
  getDutyPaymentStatus, dutyPaymentChipClass, dutyPaymentLabel, type DutyPaymentStatus,
} from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const STATUS_OPTIONS: Array<{ value: "all" | DutyPaymentStatus; label: string }> = [
  { value: "all",          label: "All Statuses" },
  { value: "paid",         label: "Paid" },
  { value: "partial",      label: "Partial" },
  { value: "unpaid",       label: "Unpaid" },
  { value: "not_assessed", label: "Not Assessed" },
];

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "—";
    return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

function exportRowsToExcel(rows: DutyPaymentRow[]) {
  type ExcelRow = Record<string, string>;
  const data: ExcelRow[] = rows.map(r => ({
    "Container #":      r.containerNumber,
    "BL #":             r.blNumber,
    Customer:           r.customerName,
    Stage:              getStatusLabel(r.status),
    "Duty Assessed (₦)": r.duty.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
    "Paid (₦)":          r.dutyPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
    "Outstanding (₦)":   r.dutyNotPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
    Status:              dutyPaymentLabel(r.dutyStatus as DutyPaymentStatus),
    "Last Updated":      fmtDate(r.updatedAt ?? null),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const headers = Object.keys(data[0] ?? {});
  ws["!cols"] = headers.map(h => {
    const maxLen = Math.max(h.length, ...data.map(r => String(r[h] ?? "").length));
    return { wch: Math.min(maxLen + 2, 40) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Duty Payments");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `duty-payments-${stamp}.xlsx`);
}

function exportRowsToPdf(rows: DutyPaymentRow[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Duty Payments", 40, 40);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${new Date().toLocaleString("en-GB")}  |  Rows: ${rows.length}`, 40, 56);

  autoTable(doc, {
    startY: 76,
    head: [[
      "Container #", "BL #", "Customer", "Stage",
      "Duty Assessed (₦)", "Paid (₦)", "Outstanding (₦)", "Status", "Last Updated",
    ]],
    body: rows.map(r => [
      r.containerNumber,
      r.blNumber,
      r.customerName,
      getStatusLabel(r.status),
      r.duty.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
      r.dutyPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
      r.dutyNotPaid.toLocaleString("en-NG", { minimumFractionDigits: 2 }),
      dutyPaymentLabel(r.dutyStatus as DutyPaymentStatus),
      fmtDate(r.updatedAt ?? null),
    ]),
    styles:     { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    columnStyles: {
      4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" },
    },
  });
  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`duty-payments-${stamp}.pdf`);
}

export default function DutyPaymentsPage() {
  const { isAdmin, isAccountsUser, isAuthenticated } = useAuth();
  const allowed = isAdmin || isAccountsUser;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const [statusFilter, setStatusFilter] = useState<"all" | DutyPaymentStatus>("all");
  const [search,       setSearch]       = useState("");
  const [debounced,    setDebounced]    = useState("");
  const [dateFrom,     setDateFrom]     = useState("");
  const [dateTo,       setDateTo]       = useState("");
  const [showFilters,  setShowFilters]  = useState(false);
  const [page,         setPage]         = useState(1);
  const [recordFor,    setRecordFor]    = useState<DutyPaymentRow | null>(null);
  const limit = 25;

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  // Auto-open dialog if ?focus=ID present in querystring
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    if (focus) {
      const id = parseInt(focus, 10);
      if (Number.isFinite(id)) {
        sessionStorage.setItem("dutyPaymentsFocusId", String(id));
        // Strip query
        const url = window.location.pathname;
        window.history.replaceState({}, "", url);
      }
    }
  }, []);

  const { data, isLoading, isError } = useListDutyPayments(
    {
      page, limit,
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(debounced               ? { search: debounced }   : {}),
      ...(dateFrom                ? { dateFrom }            : {}),
      ...(dateTo                  ? { dateTo }              : {}),
    },
    {
      query: {
        queryKey: ["/api/duty-payments", { page, limit, statusFilter, debounced, dateFrom, dateTo }] as const,
        enabled:  !!isAuthenticated && allowed,
        refetchInterval: 30_000,
      },
    },
  );

  const recordMut = useRecordDutyPayment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Duty payment recorded" });
        setRecordFor(null);
        qc.invalidateQueries({ queryKey: ["/api/duty-payments"] });
        qc.invalidateQueries({ queryKey: ["containers", "pipeline"] });
        qc.invalidateQueries({ queryKey: ["/api/containers"] });
      },
      onError: (e: unknown) => {
        const msg = e instanceof Error ? e.message : "Unknown error";
        toast({ variant: "destructive", title: "Could not record payment", description: msg });
      },
    },
  });

  // Auto-open dialog after data loads
  useEffect(() => {
    if (!data?.rows || recordFor) return;
    const focusId = sessionStorage.getItem("dutyPaymentsFocusId");
    if (!focusId) return;
    const target = data.rows.find(r => r.containerId === parseInt(focusId, 10));
    if (target) {
      sessionStorage.removeItem("dutyPaymentsFocusId");
      setRecordFor(target);
    }
  }, [data, recordFor]);

  const rows    = data?.rows    ?? [];
  const summary = data?.summary ?? {
    totalAssessed: 0, totalPaid: 0, totalOutstanding: 0,
    countPaid: 0, countPartial: 0, countUnpaid: 0, countNotAssessed: 0,
  };
  const total   = data?.total   ?? 0;
  const pages   = Math.max(1, Math.ceil(total / limit));
  const hasFilters = statusFilter !== "all" || dateFrom || dateTo;
  const [exporting, setExporting] = useState(false);

  // Iterate the API page-by-page (server cap = 500 per call) and collect
  // every filtered row up to a generous hard ceiling, so exports cover the
  // full filtered dataset, not just the current page.
  async function fetchAllFilteredRows(): Promise<DutyPaymentRow[]> {
    const PAGE_SIZE  = 500;
    const HARD_CAP   = 10_000; // safety cap; warn the user if we hit it
    const baseParams = {
      ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      ...(debounced               ? { search: debounced }   : {}),
      ...(dateFrom                ? { dateFrom }            : {}),
      ...(dateTo                  ? { dateTo }              : {}),
    };

    const all: DutyPaymentRow[] = [];
    let pageN = 1;
    let total = 0;
    while (all.length < HARD_CAP) {
      const resp = await listDutyPayments({
        page:  pageN,
        limit: PAGE_SIZE,
        ...baseParams,
      });
      const batch = resp?.rows ?? [];
      total = resp?.total ?? all.length + batch.length;
      all.push(...batch);
      if (batch.length < PAGE_SIZE) break; // last page
      if (all.length >= total)       break; // covered everything
      pageN += 1;
    }

    if (total > all.length) {
      toast({
        variant: "destructive",
        title: "Export truncated",
        description: `Only the first ${all.length.toLocaleString()} of ${total.toLocaleString()} rows were exported. Apply a tighter filter to capture the rest.`,
      });
    }
    return all;
  }

  async function handleExport(kind: "excel" | "pdf") {
    setExporting(true);
    try {
      const all = await fetchAllFilteredRows();
      if (all.length === 0) {
        toast({ variant: "destructive", title: "Nothing to export", description: "No rows match the current filters." });
        return;
      }
      if (kind === "excel") exportRowsToExcel(all);
      else                  exportRowsToPdf(all);
      toast({ title: `${kind === "excel" ? "Excel" : "PDF"} exported`, description: `${all.length} row${all.length === 1 ? "" : "s"}` });
    } catch (e: unknown) {
      toast({ variant: "destructive", title: "Export failed", description: e instanceof Error ? e.message : "Export error" });
    } finally {
      setExporting(false);
    }
  }

  if (!allowed) {
    return (
      <div className="p-6 max-w-md mx-auto">
        <Card className="p-8 text-center space-y-3">
          <ShieldAlert className="w-10 h-10 mx-auto text-muted-foreground" />
          <h1 className="text-lg font-semibold">Duty Payments access required</h1>
          <p className="text-sm text-muted-foreground">
            Duty Payments is available to administrators and Accounts users.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
            <Banknote className="w-6 h-6 text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Duty Payments</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Centralised duty assessment, payments, and balances.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Assessed</p>
          <p className="font-mono text-2xl font-bold mt-1" data-testid="summary-assessed">{formatCurrency(summary.totalAssessed)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Paid</p>
          <p className="font-mono text-2xl font-bold text-emerald-400 mt-1" data-testid="summary-paid">{formatCurrency(summary.totalPaid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total Outstanding</p>
          <p className={`font-mono text-2xl font-bold mt-1 ${summary.totalOutstanding > 0 ? "text-red-400" : "text-emerald-400"}`} data-testid="summary-outstanding">
            {formatCurrency(summary.totalOutstanding)}
          </p>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40 backdrop-blur-sm shadow-lg overflow-hidden">
        <div className="p-4 border-b border-border/50 bg-background/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by Container #, BL #, Customer…"
                className="pl-9 bg-background border-border/60"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-search"
              />
              {search && (
                <button onClick={() => { setSearch(""); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as "all" | DutyPaymentStatus); setPage(1); }}>
                <SelectTrigger className="w-full sm:w-[180px] bg-background border-border/60" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
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
                More
                {(dateFrom || dateTo) && <Badge className="ml-0.5 h-4 px-1 text-[10px] leading-none bg-primary/30 text-primary border-0">!</Badge>}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 shrink-0"
                    disabled={total === 0 || exporting}
                    data-testid="button-download"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exporting ? "Exporting…" : "Download"}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Export {total} filtered row{total === 1 ? "" : "s"}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => { void handleExport("excel"); }}
                    className="gap-2 cursor-pointer"
                    data-testid="menuitem-export-excel"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                    <div className="flex-1">
                      <div className="text-sm">Excel (.xlsx)</div>
                      <div className="text-[10px] text-muted-foreground">All filtered rows</div>
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { void handleExport("pdf"); }}
                    className="gap-2 cursor-pointer"
                    data-testid="menuitem-export-pdf"
                  >
                    <FileText className="w-4 h-4 text-red-500" />
                    <div className="flex-1">
                      <div className="text-sm">PDF (.pdf)</div>
                      <div className="text-[10px] text-muted-foreground">All filtered rows</div>
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/40 mt-1">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Created From</label>
                    <Input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} className="h-8 text-xs bg-background border-border/60" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground font-medium">Created To</label>
                    <Input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} className="h-8 text-xs bg-background border-border/60" />
                  </div>
                </div>
                {hasFilters && (
                  <button
                    onClick={() => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); setPage(1); }}
                    className="mt-2 text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                  >
                    <X className="w-3 h-3" /> Clear filters
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground bg-secondary/30 uppercase tracking-wider border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-medium">Container / BL</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium text-right">Duty Assessed</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Outstanding</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last Updated</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse bg-card/20">
                    {[...Array(9)].map((__, j) => (
                      <td key={j} className="px-4 py-4"><div className="h-4 bg-muted/50 rounded w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr><td colSpan={9} className="px-6 py-12 text-center text-destructive">
                  <div className="flex flex-col items-center justify-center">
                    <AlertCircle className="w-8 h-8 mb-2" /> Failed to load duty payments.
                  </div>
                </td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-6 py-16 text-center text-muted-foreground">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Banknote className="w-12 h-12 text-muted-foreground/30" />
                    <p className="text-base">No duty payments to display.</p>
                    {(search || hasFilters) && <p className="text-sm">Try adjusting search or filters.</p>}
                  </div>
                </td></tr>
              ) : (
                rows.map(r => {
                  const status = r.dutyStatus as DutyPaymentStatus;
                  return (
                    <tr key={r.containerId} className="hover:bg-accent/40 transition-colors" data-testid={`row-${r.containerNumber}`}>
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-sm cursor-pointer hover:text-primary" onClick={() => setLocation(`/containers/${r.containerId}`)}>
                          {r.containerNumber}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">BL: {r.blNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-xs">{r.customerName}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={`text-[10px] ${getStatusColor(r.status)}`}>
                          {getStatusLabel(r.status)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-right text-xs">{formatCurrency(r.duty)}</td>
                      <td className="px-4 py-3 font-mono text-right text-xs text-emerald-400">{formatCurrency(r.dutyPaid)}</td>
                      <td className={`px-4 py-3 font-mono text-right text-xs font-semibold ${r.dutyNotPaid > 0 ? "text-red-400" : "text-emerald-400"}`}>
                        {formatCurrency(r.dutyNotPaid)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${dutyPaymentChipClass(status)}`}
                          data-testid={`chip-status-${r.containerNumber}`}
                        >
                          <Banknote className="w-2.5 h-2.5" />{dutyPaymentLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(r.updatedAt ?? null)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          disabled={status === "paid" || status === "not_assessed"}
                          onClick={() => setRecordFor(r)}
                          data-testid={`button-record-${r.containerNumber}`}
                        >
                          <Banknote className="w-3 h-3" /> Record
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 text-xs text-muted-foreground">
            <span>Page {page} of {pages}  •  {total} row{total === 1 ? "" : "s"}</span>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(p => Math.min(pages, p + 1))}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      <RecordPaymentDialog
        row={recordFor}
        onClose={() => setRecordFor(null)}
        onSubmit={(amount, paymentDate, notes) => {
          if (!recordFor) return;
          recordMut.mutate({
            containerId: recordFor.containerId,
            data: { amount, paymentDate: paymentDate || null, notes: notes || null },
          });
        }}
        isPending={recordMut.isPending}
      />
    </motion.div>
  );
}

function RecordPaymentDialog({
  row, onClose, onSubmit, isPending,
}: {
  row: DutyPaymentRow | null;
  onClose: () => void;
  onSubmit: (amount: number, paymentDate: string, notes: string) => void;
  isPending: boolean;
}) {
  const [amountStr, setAmountStr] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (row) {
      setAmountStr("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setNotes("");
    }
  }, [row]);

  const amount = useMemo(() => {
    const n = parseFloat(amountStr);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amountStr]);

  const outstanding = row?.dutyNotPaid ?? 0;
  const newPaid    = (row?.dutyPaid ?? 0) + amount;
  const newOutstanding = Math.max((row?.duty ?? 0) - newPaid, 0);

  const error = (() => {
    if (!row) return "";
    if (amountStr.trim() === "") return "";
    if (amount <= 0) return "Amount must be greater than zero.";
    if (amount > outstanding + 0.005) return `Amount exceeds outstanding (${formatCurrency(outstanding)}).`;
    return "";
  })();

  const canSubmit = !!row && amount > 0 && !error && !isPending;

  return (
    <Dialog open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-5 h-5 text-orange-400" /> Record Duty Payment
          </DialogTitle>
          <DialogDescription>
            {row && <>Container <span className="font-mono">{row.containerNumber}</span> · BL <span className="font-mono">{row.blNumber}</span></>}
          </DialogDescription>
        </DialogHeader>

        {row && (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">Duty Assessed</Label>
                <p className="font-mono font-semibold">{formatCurrency(row.duty)}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Already Paid</Label>
                <p className="font-mono font-semibold text-emerald-400">{formatCurrency(row.dutyPaid)}</p>
              </div>
              <div className="col-span-2 p-2 rounded bg-amber-500/10 border border-amber-500/30">
                <Label className="text-xs text-amber-400">Outstanding Balance</Label>
                <p className="font-mono font-bold text-amber-400">{formatCurrency(outstanding)}</p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="amount">Amount to Add (₦)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={amountStr}
                onChange={e => setAmountStr(e.target.value)}
                placeholder="0.00"
                data-testid="input-amount"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 rounded bg-muted/40 border border-border/40">
                <Label className="text-xs text-muted-foreground">New Total Paid</Label>
                <p className="font-mono font-semibold text-emerald-400">{formatCurrency(newPaid)}</p>
              </div>
              <div className="p-2 rounded bg-muted/40 border border-border/40">
                <Label className="text-xs text-muted-foreground">New Outstanding</Label>
                <p className={`font-mono font-semibold ${newOutstanding > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                  {formatCurrency(newOutstanding)}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input id="paymentDate" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Receipt #, channel, etc." />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button
            onClick={() => onSubmit(amount, paymentDate, notes)}
            disabled={!canSubmit}
            className="bg-orange-600 hover:bg-orange-700 gap-1"
            data-testid="button-confirm-payment"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
