import { useState } from "react";
import { useLocation } from "wouter";
import { useGetCashFlow, useListBanks, type CashFlowTxn } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Printer, Filter, RefreshCw, ArrowLeft, TrendingUp, TrendingDown, Wallet, ArrowRightLeft, ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { motion } from "framer-motion";

const TYPE_LABEL: Record<CashFlowTxn["type"], string> = {
  invoice_payment: "Invoice Payment",
  client_deposit: "Wallet Deposit",
  overhead_expense: "Overhead",
  duty_payment: "Customs Duty",
};

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function getDefaultDates() {
  const now = new Date();
  const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

function StatCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="bg-card/40 border border-border/40 rounded-lg px-4 py-3">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`font-bold font-mono text-base ${color ?? ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function StatementSection({
  openingBalance, totalIn, totalOut, netCashFlow, closingBalance,
  inflowByType, outflowByCategory,
}: {
  openingBalance: number;
  totalIn: number;
  totalOut: number;
  netCashFlow: number;
  closingBalance: number;
  inflowByType: Record<string, number>;
  outflowByCategory: Record<string, number>;
}) {
  return (
    <Card className="border-border/50 bg-card/40">
      <CardHeader className="border-b border-border/40 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-primary" /> Statement of Cash Flows
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <tbody>
            <tr className="border-b border-border/30 bg-secondary/10">
              <td className="px-5 py-3 font-semibold text-muted-foreground">Opening Balance (b/f)</td>
              <td className="px-5 py-3 text-right font-mono font-bold text-blue-400">{formatCurrency(openingBalance)}</td>
            </tr>
            <tr className="border-b border-border/20">
              <td className="px-5 py-3 font-semibold text-emerald-400">Cash Received in Period</td>
              <td className="px-5 py-3 text-right font-mono font-bold text-emerald-400">{formatCurrency(totalIn)}</td>
            </tr>
            {(inflowByType.invoice_payment ?? 0) > 0 && (
              <tr className="border-b border-border/10">
                <td className="px-5 py-2.5 pl-10 text-xs text-muted-foreground">Invoice payments received</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{formatCurrency(inflowByType.invoice_payment ?? 0)}</td>
              </tr>
            )}
            {(inflowByType.client_deposit ?? 0) > 0 && (
              <tr className="border-b border-border/10">
                <td className="px-5 py-2.5 pl-10 text-xs text-muted-foreground">Wallet / client deposits</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">{formatCurrency(inflowByType.client_deposit ?? 0)}</td>
              </tr>
            )}
            <tr className="border-b border-border/20">
              <td className="px-5 py-3 font-semibold text-destructive">Cash Paid Out in Period</td>
              <td className="px-5 py-3 text-right font-mono font-bold text-destructive">({formatCurrency(totalOut)})</td>
            </tr>
            {Object.entries(outflowByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
              <tr key={cat} className="border-b border-border/10">
                <td className="px-5 py-2.5 pl-10 text-xs text-muted-foreground">{cat}</td>
                <td className="px-5 py-2.5 text-right font-mono text-xs text-muted-foreground">({formatCurrency(amt)})</td>
              </tr>
            ))}
            <tr className="border-b border-border/30 bg-secondary/5">
              <td className="px-5 py-3 font-medium text-muted-foreground">Net Movement</td>
              <td className={`px-5 py-3 text-right font-mono font-semibold ${netCashFlow >= 0 ? "text-emerald-400" : "text-destructive"}`}>{formatCurrency(netCashFlow)}</td>
            </tr>
            <tr className="bg-secondary/20">
              <td className="px-5 py-3 font-bold text-base">Closing Balance (c/f)</td>
              <td className={`px-5 py-3 text-right font-mono font-bold text-lg ${closingBalance >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(closingBalance)}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TxnTable({ rows, direction }: { rows: CashFlowTxn[]; direction: "in" | "out" }) {
  const [open, setOpen] = useState(false);
  if (rows.length === 0) return null;
  const label = direction === "in" ? "Inflows" : "Outflows";
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card className="border-border/50 bg-card/40">
      <button
        type="button"
        className="w-full flex items-center justify-between px-5 py-3 border-b border-border/40 hover:bg-accent/10 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        <span className="text-sm font-semibold flex items-center gap-2">
          {direction === "in" ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-destructive" />}
          {label}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-0.5">{rows.length}</Badge>
        </span>
        <div className="flex items-center gap-3">
          <span className={`font-mono font-semibold text-sm ${direction === "in" ? "text-emerald-400" : "text-destructive"}`}>{formatCurrency(total)}</span>
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {open && (
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Date</th>
                  <th className="px-4 py-2.5 text-left font-medium">Type</th>
                  <th className="px-4 py-2.5 text-left font-medium">Description</th>
                  <th className="px-4 py-2.5 text-left font-medium">Bank</th>
                  <th className="px-4 py-2.5 text-left font-medium">Reference</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount (₦)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {rows.map(t => (
                  <tr key={t.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{fmtDate(t.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground">{TYPE_LABEL[t.type]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm max-w-[260px] truncate" title={t.description}>{t.description}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{t.bankName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground">{t.reference ?? "—"}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-semibold text-sm ${direction === "in" ? "text-emerald-400" : "text-destructive"}`}>
                      {formatCurrency(t.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function BankBreakdownCard({ byBank, totalIn, totalOut }: {
  byBank: Array<{ bankId: number | null; bankName: string; totalIn: number; totalOut: number }>;
  totalIn: number;
  totalOut: number;
}) {
  if (byBank.length === 0) return null;
  return (
    <Card className="border-border/50 bg-card/40">
      <CardHeader className="border-b border-border/40 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4 text-blue-400" /> Per-Bank Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border/50 bg-secondary/20 text-xs text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Bank Account</th>
              <th className="px-5 py-2.5 text-right font-medium">Inflow (₦)</th>
              <th className="px-5 py-2.5 text-right font-medium">Outflow (₦)</th>
              <th className="px-5 py-2.5 text-right font-medium">Net (₦)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {byBank.map(b => {
              const net = b.totalIn - b.totalOut;
              return (
                <tr key={`${b.bankId ?? "u"}`} className="hover:bg-accent/20 transition-colors">
                  <td className="px-5 py-2.5 font-medium">{b.bankName}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-emerald-400">{formatCurrency(b.totalIn)}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-destructive">{formatCurrency(b.totalOut)}</td>
                  <td className={`px-5 py-2.5 text-right font-mono font-semibold ${net >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(net)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-border/50">
            <tr className="bg-secondary/10">
              <td className="px-5 py-2.5 font-bold text-xs uppercase">Total</td>
              <td className="px-5 py-2.5 text-right font-mono font-bold text-emerald-400">{formatCurrency(totalIn)}</td>
              <td className="px-5 py-2.5 text-right font-mono font-bold text-destructive">{formatCurrency(totalOut)}</td>
              <td className={`px-5 py-2.5 text-right font-mono font-bold ${totalIn - totalOut >= 0 ? "text-primary" : "text-destructive"}`}>{formatCurrency(totalIn - totalOut)}</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

export default function CashFlowPage() {
  const [, setLocation] = useLocation();
  const { from: defaultFrom, to: defaultTo } = getDefaultDates();
  const [fromInput, setFromInput] = useState(defaultFrom);
  const [toInput, setToInput] = useState(defaultTo);
  const [bankIdInput, setBankIdInput] = useState("all");
  const [applied, setApplied] = useState({ from: defaultFrom, to: defaultTo, bankId: "all" });

  const { data, isLoading, isError, refetch } = useGetCashFlow({
    from: applied.from || undefined,
    to: applied.to || undefined,
    bankId: applied.bankId !== "all" ? applied.bankId : undefined,
  });
  const { data: banks = [] } = useListBanks();

  const handleApply = () => setApplied({ from: fromInput, to: toInput, bankId: bankIdInput });
  const handleReset = () => {
    const { from, to } = getDefaultDates();
    setFromInput(from); setToInput(to); setBankIdInput("all");
    setApplied({ from, to, bankId: "all" });
  };

  const openPrint = () => {
    const qs = new URLSearchParams();
    if (applied.from) qs.set("from", applied.from);
    if (applied.to) qs.set("to", applied.to);
    if (applied.bankId !== "all") qs.set("bankId", applied.bankId);
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
    window.open(`${base}/reports/cashflow/print?${qs}`, "_blank", "noopener");
  };

  const bankLabel = applied.bankId !== "all"
    ? (banks.find(b => String(b.id) === applied.bankId)?.name ?? `Bank #${applied.bankId}`)
    : "All Banks";

  const periodLabel = (() => {
    const a = applied.from ? new Date(applied.from).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null;
    const b = applied.to ? new Date(applied.to).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : null;
    if (a && b) return `${a} – ${b}`;
    if (a) return `From ${a}`;
    if (b) return `Up to ${b}`;
    return "All Time";
  })();

  return (
    <>
      <title>Cash Flow Statement</title>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="p-6 space-y-5 max-w-5xl mx-auto"
      >
        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs"
                onClick={() => setLocation("/reports")}
              >
                <ArrowLeft className="w-3 h-3" /> Reports
              </button>
            </div>
            <h1 className="text-xl font-bold text-foreground">Cash Flow Statement</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{periodLabel} · {bankLabel}</p>
          </div>
          {data && (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs h-8" onClick={openPrint}>
              <Printer className="w-3.5 h-3.5" /> Print / PDF
            </Button>
          )}
        </div>

        {/* Filter Bar */}
        <Card className="border-border/50 bg-card/40">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={fromInput} onChange={e => setFromInput(e.target.value)} className="h-8 text-xs w-38" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={toInput} onChange={e => setToInput(e.target.value)} className="h-8 text-xs w-38" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bank Account</Label>
                <Select value={bankIdInput} onValueChange={setBankIdInput}>
                  <SelectTrigger className="h-8 text-xs border-border/50 w-44">
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
              <div className="flex gap-2">
                <Button size="sm" className="h-8 text-xs gap-1.5" onClick={handleApply}>
                  <Filter className="w-3 h-3" /> Apply
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleReset}>
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center py-16 text-muted-foreground gap-3">
            <AlertTriangle className="w-9 h-9 text-destructive/50" />
            <p className="text-sm">Failed to load cash flow data.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : !data ? null : (
          <div className="space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Opening Balance"
                value={formatCurrency(data.totals.openingBalance)}
                color={data.totals.openingBalance >= 0 ? "text-blue-400" : "text-destructive"}
                sub={applied.from ? `before ${new Date(applied.from).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : "all time"}
              />
              <StatCard label="Cash Received" value={formatCurrency(data.totals.totalIn)} color="text-emerald-400" sub={`${data.inflows.length} transactions`} />
              <StatCard label="Cash Paid Out" value={formatCurrency(data.totals.totalOut)} color="text-destructive" sub={`${data.outflows.length} transactions`} />
              <StatCard
                label="Net Movement"
                value={formatCurrency(data.totals.netCashFlow)}
                color={data.totals.netCashFlow >= 0 ? "text-emerald-400" : "text-destructive"}
              />
              <StatCard
                label="Closing Balance"
                value={formatCurrency(data.totals.closingBalance)}
                color={data.totals.closingBalance >= 0 ? "text-primary" : "text-destructive"}
                sub={applied.to ? `as at ${new Date(applied.to).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}` : undefined}
              />
            </div>

            {/* Statement */}
            <StatementSection
              openingBalance={data.totals.openingBalance}
              totalIn={data.totals.totalIn}
              totalOut={data.totals.totalOut}
              netCashFlow={data.totals.netCashFlow}
              closingBalance={data.totals.closingBalance}
              inflowByType={data.breakdown.inflowByType}
              outflowByCategory={data.breakdown.outflowByCategory}
            />

            {/* Per-bank breakdown */}
            <BankBreakdownCard byBank={data.breakdown.byBank} totalIn={data.totals.totalIn} totalOut={data.totals.totalOut} />

            {/* Transaction detail */}
            <TxnTable rows={data.inflows} direction="in" />
            <TxnTable rows={data.outflows} direction="out" />

            {data.inflows.length === 0 && data.outflows.length === 0 && (
              <div className="text-center text-muted-foreground py-12 text-sm">No transactions found in this period.</div>
            )}
          </div>
        )}
      </motion.div>
    </>
  );
}
