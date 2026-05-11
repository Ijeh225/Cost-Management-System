import { useState, useMemo } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useGetBankTransactions, type BankTransaction } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Landmark, ArrowLeft, Loader2, TrendingUp, TrendingDown, Wallet,
  ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Receipt, Download,
  ChevronRight, AlertTriangle, RefreshCw,
} from "lucide-react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric", month: "short", day: "numeric",
  });
}

function TxTypeBadge({ type }: { type: BankTransaction["type"] }) {
  const config = {
    payment:       { label: "Payment",       cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: Receipt },
    deposit:       { label: "Deposit",       cls: "bg-blue-500/10 text-blue-400 border-blue-500/30",         icon: ArrowDownLeft },
    transfer_in:   { label: "Transfer In",   cls: "bg-violet-500/10 text-violet-400 border-violet-500/30",   icon: ArrowDownLeft },
    transfer_out:  { label: "Transfer Out",  cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",      icon: ArrowUpRight },
    fund_addition:    { label: "Fund Addition",    cls: "bg-teal-500/10 text-teal-400 border-teal-500/30",   icon: ArrowDownLeft },
    expense_payment:           { label: "Expense Payment",    cls: "bg-red-500/10 text-red-400 border-red-500/30",       icon: ArrowUpRight },
    container_expense_payment: { label: "Container Expense",  cls: "bg-orange-500/10 text-orange-400 border-orange-500/30", icon: ArrowUpRight },
  }[type] ?? { label: type, cls: "bg-muted/60 text-muted-foreground border-border/40", icon: Receipt };
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 ${config.cls}`}>
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

function StatCard({ label, value, icon: Icon, colorClass, sub }: {
  label: string; value: string; icon: React.ElementType; colorClass: string; sub?: string;
}) {
  return (
    <Card className="border-border/40 bg-card/40">
      <CardContent className="p-4 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-mono font-bold text-base text-foreground leading-tight">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function downloadCSV(transactions: BankTransaction[], bankName: string) {
  const header = ["Date", "Type", "Description", "Client", "Invoice No.", "Reference", "Debit (₦)", "Credit (₦)", "Running Balance (₦)"];
  const rows = [...transactions].reverse().map(t => [
    formatDateShort(t.date),
    t.type,
    `"${t.description.replace(/"/g, '""')}"`,
    t.clientName ?? "",
    t.invoiceNumber ?? "",
    t.reference ?? "",
    t.debit > 0 ? t.debit.toFixed(2) : "",
    t.credit > 0 ? t.credit.toFixed(2) : "",
    t.balance.toFixed(2),
  ]);

  const csv = [header, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${bankName.replace(/\s+/g, "_")}_statement.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPrint(
  transactions: BankTransaction[],
  bankName: string,
  accountNumber: string | null,
  from: string,
  to: string,
  openingBalance: number,
  closingBalance: number,
  totalCredits: number,
  totalDebits: number,
) {
  const period = from && to
    ? `${from} to ${to}`
    : from ? `From ${from}` : to ? `To ${to}` : "All time";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(n);

  const rows = [...transactions].reverse().map(t => `
    <tr>
      <td>${formatDateShort(t.date)}</td>
      <td>${t.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</td>
      <td class="desc">${t.description}</td>
      <td>${t.clientName ?? ""}</td>
      <td>${t.invoiceNumber ?? ""}</td>
      <td>${t.reference ?? ""}</td>
      <td class="num">${t.debit > 0 ? fmt(t.debit) : ""}</td>
      <td class="num">${t.credit > 0 ? fmt(t.credit) : ""}</td>
      <td class="num balance">${fmt(t.balance)}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${bankName} — Bank Statement</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; padding: 30px; }
  .header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 20px; }
  .bank-name { font-size: 22px; font-weight: 700; }
  .meta { color: #555; margin-top: 4px; }
  .summary { display: flex; gap: 24px; margin-bottom: 24px; flex-wrap: wrap; }
  .summary-card { border: 1px solid #ddd; border-radius: 6px; padding: 12px 16px; min-width: 140px; }
  .summary-card .label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: .5px; }
  .summary-card .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
  .credit { color: #16a34a; }
  .debit { color: #dc2626; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #f3f4f6; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; padding: 8px 6px; text-align: left; border: 1px solid #ddd; }
  td { padding: 7px 6px; border: 1px solid #eee; vertical-align: top; }
  tr:nth-child(even) { background: #fafafa; }
  .num { text-align: right; font-family: monospace; white-space: nowrap; }
  .balance { font-weight: 600; }
  .desc { max-width: 200px; }
  .footer { margin-top: 20px; font-size: 10px; color: #888; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
<div class="header">
  <div class="bank-name">${bankName}</div>
  <div class="meta">${accountNumber ? `Account: ${accountNumber} &nbsp;|&nbsp; ` : ""}Statement Period: ${period}</div>
</div>
<div class="summary">
  <div class="summary-card"><div class="label">Opening Balance</div><div class="value">${fmt(openingBalance)}</div></div>
  <div class="summary-card"><div class="label">Total Credits</div><div class="value credit">${fmt(totalCredits)}</div></div>
  <div class="summary-card"><div class="label">Total Debits</div><div class="value debit">${fmt(totalDebits)}</div></div>
  <div class="summary-card"><div class="label">Closing Balance</div><div class="value">${fmt(closingBalance)}</div></div>
</div>
<table>
  <thead>
    <tr>
      <th>Date</th><th>Type</th><th>Description</th><th>Client</th><th>Invoice</th><th>Reference</th>
      <th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">Generated on ${new Date().toLocaleString("en-NG")} &nbsp;|&nbsp; ${bankName} — Bank Statement</div>
</body>
</html>`;

  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

export default function BankDetailPage() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const bankId = params.id ? Number(params.id) : null;

  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data, isLoading, isError, refetch } = useGetBankTransactions(bankId, {
    from: from || undefined,
    to:   to   || undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });

  const bank = data?.bank;
  const transactions = data?.transactions ?? [];

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return transactions;
    const q = search.toLowerCase();
    return transactions.filter(t =>
      t.description.toLowerCase().includes(q) ||
      (t.clientName ?? "").toLowerCase().includes(q) ||
      (t.reference ?? "").toLowerCase().includes(q) ||
      (t.invoiceNumber ?? "").toLowerCase().includes(q)
    );
  }, [transactions, search]);

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex items-start gap-4">
        <Link href="/banks">
          <Button variant="ghost" size="icon" className="w-9 h-9 shrink-0 mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                {isLoading ? "Loading…" : (bank?.name ?? "Bank Statement")}
              </h1>
              {bank && (
                <p className="text-sm text-muted-foreground">
                  {bank.accountNumber ? `Account: ${bank.accountNumber}` : "No account number"}
                  {bank.bankCode ? ` · Code: ${bank.bankCode}` : ""}
                </p>
              )}
            </div>
            {bank && (
              <Badge className={bank.isActive
                ? "text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "text-[10px] px-1.5 py-0 bg-muted/60 text-muted-foreground border-border/40"
              }>
                {bank.isActive ? "Active" : "Inactive"}
              </Badge>
            )}
          </div>
        </div>
        {data && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => downloadCSV(transactions, bank?.name ?? "Bank")}
              disabled={transactions.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => downloadPrint(
                transactions,
                bank?.name ?? "Bank",
                bank?.accountNumber ?? null,
                from, to,
                data.openingBalance,
                data.closingBalance,
                data.totalCredits,
                data.totalDebits,
              )}
              disabled={transactions.length === 0}
            >
              <Download className="w-3.5 h-3.5" />
              Print / PDF
            </Button>
          </div>
        )}
      </div>

      {/* Summary stats */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Closing Balance"
            value={formatCurrency(data.closingBalance)}
            icon={Wallet}
            colorClass="bg-primary/10 border border-primary/20 text-primary"
            sub={`Opening: ${formatCurrency(data.openingBalance)}`}
          />
          <StatCard
            label="Total Credits"
            value={formatCurrency(data.totalCredits)}
            icon={TrendingUp}
            colorClass="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            sub="Payments + Deposits + Transfers In"
          />
          <StatCard
            label="Total Debits"
            value={formatCurrency(data.totalDebits)}
            icon={TrendingDown}
            colorClass="bg-red-500/10 border border-red-500/20 text-red-400"
            sub="Transfers Out"
          />
          <StatCard
            label="Transactions"
            value={String(transactions.length)}
            icon={ArrowLeftRight}
            colorClass="bg-blue-500/10 border border-blue-500/20 text-blue-400"
            sub={filtered.length !== transactions.length ? `${filtered.length} shown` : undefined}
          />
        </div>
      )}

      {/* Filters */}
      <Card className="border-border/40 bg-card/40">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From Date</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To Date</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="payment">Invoice Payments</SelectItem>
                  <SelectItem value="deposit">Client Deposits</SelectItem>
                  <SelectItem value="transfer_in">Transfers In</SelectItem>
                  <SelectItem value="transfer_out">Transfers Out</SelectItem>
                  <SelectItem value="fund_addition">Fund Additions</SelectItem>
                  <SelectItem value="expense_payment">Expense Payments</SelectItem>
                  <SelectItem value="container_expense_payment">Container Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                placeholder="Description, client, ref…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9"
              />
            </div>
          </div>
          {(from || to || typeFilter !== "all") && (
            <div className="mt-3 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground h-7"
                onClick={() => { setFrom(""); setTo(""); setTypeFilter("all"); }}
              >
                <RefreshCw className="w-3 h-3 mr-1" /> Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transaction table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <Card className="border-border/40 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <AlertTriangle className="w-8 h-8 text-destructive/60" />
            <p className="text-sm text-muted-foreground">Failed to load transaction history.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-border/40 bg-card/40">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <ArrowLeftRight className="w-8 h-8 text-muted-foreground/40" />
            <p className="font-medium text-foreground">No transactions found</p>
            <p className="text-sm text-muted-foreground">
              {transactions.length === 0
                ? "No transactions have been recorded for this bank yet."
                : "No transactions match the current filters."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/40 bg-card/40 overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Debit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Credit</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {filtered.map((tx, i) => (
                  <tr key={tx.id} className={`transition-colors hover:bg-accent/10 ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(tx.date)}
                    </td>
                    <td className="px-4 py-3">
                      <TxTypeBadge type={tx.type} />
                    </td>
                    <td className="px-4 py-3 text-xs text-foreground max-w-[260px]">
                      <p className="truncate">{tx.description}</p>
                      {tx.invoiceNumber && (
                        <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{tx.invoiceNumber}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {tx.clientName ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                      {tx.reference ?? <span className="text-muted-foreground/40">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {tx.debit > 0
                        ? <span className="text-red-400">{formatCurrency(tx.debit)}</span>
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {tx.credit > 0
                        ? <span className="text-emerald-400">{formatCurrency(tx.credit)}</span>
                        : <span className="text-muted-foreground/30">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-foreground whitespace-nowrap">
                      {formatCurrency(tx.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-border/20">
            {filtered.map(tx => (
              <div key={tx.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <TxTypeBadge type={tx.type} />
                    <p className="text-sm font-medium text-foreground mt-1 truncate">{tx.description}</p>
                    {tx.clientName && <p className="text-xs text-muted-foreground">{tx.clientName}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    {tx.debit > 0 && <p className="text-sm font-mono font-semibold text-red-400">-{formatCurrency(tx.debit)}</p>}
                    {tx.credit > 0 && <p className="text-sm font-mono font-semibold text-emerald-400">+{formatCurrency(tx.credit)}</p>}
                    <p className="text-xs font-mono text-muted-foreground">Bal: {formatCurrency(tx.balance)}</p>
                  </div>
                </div>
                {tx.reference && (
                  <p className="text-[10px] font-mono text-muted-foreground">Ref: {tx.reference}</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
