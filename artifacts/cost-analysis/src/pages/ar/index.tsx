import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  useGetArLedger,
  type ArClientRow,
  type ArUnpaidInvoice,
  type ArAgingBuckets,
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen, Download, Search, ChevronDown, ChevronRight,
  AlertTriangle, Loader2, ExternalLink, Calendar,
  Wallet, CreditCard, ReceiptText, TrendingUp,
} from "lucide-react";

function rowHighlight(aging: ArAgingBuckets): string {
  if (aging.days90plus > 0) return "bg-red-500/5 border-l-4 border-l-red-500";
  if (aging.days61to90 > 0) return "bg-amber-500/5 border-l-4 border-l-amber-500";
  return "";
}

function AgingBadge({ amount, label, color }: { amount: number; label: string; color: string }) {
  if (amount <= 0) return <span className="text-muted-foreground/40 text-xs">—</span>;
  return (
    <span className={`text-xs font-medium ${color}`}>
      {formatCurrency(amount)}
    </span>
  );
}

function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:   { label: "Draft",   cls: "bg-muted/60 text-muted-foreground border-border/40" },
    sent:    { label: "Sent",    cls: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
    partial: { label: "Partial", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
    overdue: { label: "Overdue", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
    paid:    { label: "Paid",    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  };
  const cfg = map[status] ?? map.draft;
  return (
    <Badge className={`text-[10px] px-1.5 py-0 border ${cfg.cls}`}>
      {cfg.label}
    </Badge>
  );
}

function InvoiceSubRow({ inv }: { inv: ArUnpaidInvoice }) {
  return (
    <tr className="bg-muted/20 border-b border-border/20">
      <td className="pl-12 py-2">
        <Link href={`/invoices/${inv.id}`} className="flex items-center gap-1 text-xs font-mono text-primary hover:underline">
          {inv.invoiceNumber}
          <ExternalLink className="w-2.5 h-2.5 opacity-60" />
        </Link>
      </td>
      <td className="py-2 px-3">
        {statusBadge(inv.status)}
      </td>
      <td className="py-2 px-3 text-xs text-right font-mono">{formatCurrency(inv.total)}</td>
      <td className="py-2 px-3 text-xs text-right font-mono text-emerald-400">{formatCurrency(inv.totalPaid)}</td>
      <td className="py-2 px-3 text-xs text-right font-mono text-amber-400 font-semibold">{formatCurrency(inv.outstanding)}</td>
      <td className="py-2 px-3 text-xs text-muted-foreground">
        {inv.dueDate
          ? <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{inv.dueDate}</span>
          : <span className="text-muted-foreground/40">No due date</span>}
      </td>
      <td colSpan={4} />
    </tr>
  );
}

function ClientTableRow({ client, expanded, onToggle }: {
  client: ArClientRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const highlight = rowHighlight(client.aging);
  return (
    <>
      <tr
        className={`border-b border-border/40 cursor-pointer hover:bg-accent/30 transition-colors ${highlight}`}
        onClick={onToggle}
      >
        <td className="py-3 pl-4 pr-2 w-8">
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            {expanded
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="py-3 px-3">
          <div className="font-medium text-sm text-foreground">{client.clientName}</div>
          <div className="text-[11px] text-muted-foreground">{client.invoiceCount} invoice{client.invoiceCount !== 1 ? "s" : ""}</div>
        </td>
        <td className="py-3 px-3 text-right text-sm font-mono">{formatCurrency(client.totalInvoiced)}</td>
        <td className="py-3 px-3 text-right text-sm font-mono text-emerald-400">{formatCurrency(client.totalCollected)}</td>
        <td className="py-3 px-3 text-right text-sm font-mono font-semibold text-foreground">{formatCurrency(client.outstanding)}</td>
        <td className="py-3 px-3 text-right">
          <AgingBadge amount={client.aging.current}    label="Current" color="text-foreground" />
        </td>
        <td className="py-3 px-3 text-right">
          <AgingBadge amount={client.aging.days1to30}  label="1–30d"   color="text-amber-400" />
        </td>
        <td className="py-3 px-3 text-right">
          <AgingBadge amount={client.aging.days31to60} label="31–60d"  color="text-orange-400" />
        </td>
        <td className="py-3 px-3 text-right">
          <AgingBadge amount={client.aging.days61to90} label="61–90d"  color="text-red-400" />
        </td>
        <td className="py-3 px-3 text-right">
          <AgingBadge amount={client.aging.days90plus} label="90+d"    color="text-red-600 font-semibold" />
        </td>
      </tr>
      {expanded && client.unpaidInvoices.map(inv => (
        <InvoiceSubRow key={inv.id} inv={inv} />
      ))}
    </>
  );
}

function exportCsv(clients: ArClientRow[], fromDate: string, toDate: string) {
  const headers = [
    "Client Name", "Invoices", "Total Invoiced", "Total Collected", "Outstanding",
    "Current", "1-30 Days", "31-60 Days", "61-90 Days", "90+ Days",
  ];
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = clients.map(c => [
    escape(c.clientName),
    c.invoiceCount,
    c.totalInvoiced.toFixed(2),
    c.totalCollected.toFixed(2),
    c.outstanding.toFixed(2),
    c.aging.current.toFixed(2),
    c.aging.days1to30.toFixed(2),
    c.aging.days31to60.toFixed(2),
    c.aging.days61to90.toFixed(2),
    c.aging.days90plus.toFixed(2),
  ].join(","));

  const metaLines = [];
  if (fromDate) metaLines.push(`"From Date",${escape(fromDate)}`);
  if (toDate) metaLines.push(`"To Date",${escape(toDate)}`);
  metaLines.push(`"Generated",${escape(new Date().toISOString())}`);

  const csv = [
    ...metaLines,
    metaLines.length ? "" : null,
    headers.join(","),
    ...rows,
  ].filter(l => l !== null).join("\n");

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `accounts-receivable-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AccountsReceivablePage() {
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  const { data, isLoading, isError } = useGetArLedger(
    fromDate || toDate ? { from: fromDate || undefined, to: toDate || undefined } : undefined
  );

  const clients = data?.clients ?? [];
  const summary = data?.summary;
  const aging = data?.aging;

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.trim().toLowerCase();
    return clients.filter(c => c.clientName.toLowerCase().includes(q));
  }, [clients, search]);

  const toggleClient = (key: string) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-border/40 bg-card/40">
              <CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader>
              <CardContent><Skeleton className="h-8 w-32" /></CardContent>
            </Card>
          ))}
        </div>
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="h-[50vh] flex flex-col items-center justify-center text-muted-foreground">
        <AlertTriangle className="w-12 h-12 mb-4 text-destructive/50" />
        <p>Failed to load accounts receivable data.</p>
      </div>
    );
  }

  const agingBuckets = [
    { label: "Current",  value: aging?.current ?? 0,    color: "text-foreground",   bg: "bg-muted/40" },
    { label: "1–30 Days",value: aging?.days1to30 ?? 0,  color: "text-amber-400",    bg: "bg-amber-500/10" },
    { label: "31–60 Days",value: aging?.days31to60 ?? 0,color: "text-orange-400",   bg: "bg-orange-500/10" },
    { label: "61–90 Days",value: aging?.days61to90 ?? 0,color: "text-red-400",      bg: "bg-red-500/10" },
    { label: "90+ Days", value: aging?.days90plus ?? 0, color: "text-red-600",      bg: "bg-red-500/15" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BookOpen className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-lg font-bold text-foreground">Accounts Receivable</h1>
          <p className="text-sm text-muted-foreground">Outstanding balances by client with aging analysis</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto gap-1.5 text-xs h-8"
          onClick={() => exportCsv(filtered, fromDate, toDate)}
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Outstanding</CardTitle>
            <CreditCard className="w-4 h-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {formatCurrency(summary?.totalOutstanding ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{summary?.openInvoiceCount ?? 0} open invoices</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Overdue</CardTitle>
            <AlertTriangle className="w-4 h-4 text-red-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-400">
              {formatCurrency(summary?.totalOverdue ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Past due date</p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collected This Month</CardTitle>
            <Wallet className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">
              {formatCurrency(summary?.collectedThisMonth ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date().toLocaleString("default", { month: "long", year: "numeric" })}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
            <ReceiptText className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(summary?.totalInvoiced ?? 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrency(summary?.totalCollected ?? 0)} collected
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Breakdown */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Aging Analysis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-3">
            {agingBuckets.map(b => (
              <div key={b.label} className={`rounded-lg p-3 ${b.bg} border border-border/30`}>
                <div className="text-[11px] text-muted-foreground font-medium mb-1">{b.label}</div>
                <div className={`text-sm font-bold ${b.color}`}>{formatCurrency(b.value)}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Search client…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm bg-background border-border/60"
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span className="text-xs">From</span>
          <Input
            type="date"
            value={fromDate}
            onChange={e => setFromDate(e.target.value)}
            className="h-8 text-sm w-36 bg-background border-border/60"
          />
          <span className="text-xs">To</span>
          <Input
            type="date"
            value={toDate}
            onChange={e => setToDate(e.target.value)}
            className="h-8 text-sm w-36 bg-background border-border/60"
          />
          {(fromDate || toDate) && (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setFromDate(""); setToDate(""); }}>
              Clear
            </Button>
          )}
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} client{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/30">
                <th className="py-3 pl-4 pr-2 w-8" />
                <th className="py-3 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Client</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Invoiced</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Collected</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outstanding</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">1–30d</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">31–60d</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">61–90d</th>
                <th className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">90+d</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-muted-foreground text-sm">
                    No clients match your filters.
                  </td>
                </tr>
              ) : (
                filtered.map(client => {
                  const key = String(client.clientId ?? `unknown-${client.clientName}`);
                  return (
                    <ClientTableRow
                      key={key}
                      client={client}
                      expanded={expandedClients.has(key)}
                      onToggle={() => toggleClient(key)}
                    />
                  );
                })
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t border-border/50 bg-muted/30 font-semibold">
                  <td colSpan={2} className="py-3 px-3 text-sm text-muted-foreground">Total ({filtered.length} clients)</td>
                  <td className="py-3 px-3 text-right text-sm font-mono">
                    {formatCurrency(filtered.reduce((s, c) => s + c.totalInvoiced, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-sm font-mono text-emerald-400">
                    {formatCurrency(filtered.reduce((s, c) => s + c.totalCollected, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-sm font-mono font-bold">
                    {formatCurrency(filtered.reduce((s, c) => s + c.outstanding, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-mono">
                    {formatCurrency(filtered.reduce((s, c) => s + c.aging.current, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-mono text-amber-400">
                    {formatCurrency(filtered.reduce((s, c) => s + c.aging.days1to30, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-mono text-orange-400">
                    {formatCurrency(filtered.reduce((s, c) => s + c.aging.days31to60, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-mono text-red-400">
                    {formatCurrency(filtered.reduce((s, c) => s + c.aging.days61to90, 0))}
                  </td>
                  <td className="py-3 px-3 text-right text-xs font-mono text-red-600 font-bold">
                    {formatCurrency(filtered.reduce((s, c) => s + c.aging.days90plus, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded border-l-2 border-l-amber-500 bg-amber-500/10" />
          Amber row = has 61–90 day outstanding
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded border-l-2 border-l-red-500 bg-red-500/10" />
          Red row = has 90+ day outstanding
        </span>
      </div>
    </div>
  );
}
