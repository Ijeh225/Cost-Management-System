import { useState } from "react";
import { Link } from "wouter";
import { useListInvoices, useDeleteInvoice, type Invoice } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { formatCurrency } from "@/lib/format";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { CreateInvoiceDialog } from "@/components/invoices/CreateInvoiceDialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  FileText, Search, Loader2, Trash2, ChevronRight, Plus,
  CheckCircle2, Clock, AlertTriangle, CreditCard, Package,
  ChevronUp, ChevronDown, ReceiptText,
} from "lucide-react";

function statusConfig(status: string) {
  switch (status) {
    case "paid":
      return { label: "Paid", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50", icon: CheckCircle2 };
    case "partial":
      return { label: "Part Paid", color: "bg-blue-500/20 text-blue-400 border-blue-500/50", icon: CreditCard };
    case "sent":
      return { label: "Sent", color: "bg-amber-500/20 text-amber-400 border-amber-500/50", icon: Clock };
    case "overdue":
      return { label: "Overdue", color: "bg-red-500/20 text-red-400 border-red-500/50", icon: AlertTriangle };
    case "written_off":
      return { label: "Written Off", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50", icon: FileText };
    default:
      return { label: "Draft", color: "bg-slate-500/20 text-slate-400 border-slate-500/50", icon: FileText };
  }
}

function containerSummary(invoice: Invoice): string {
  if (invoice.items && invoice.items.length > 1) {
    const nums = invoice.items.map(it => it.containerNumber ?? "?").join(", ");
    return nums;
  }
  return invoice.containerNumber ?? "—";
}

function agingBadge(invoice: Invoice): { days: number; color: string } | null {
  if (invoice.outstanding <= 0 || !invoice.dueDate) return null;
  const due = new Date(invoice.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  const days = Math.floor((today.getTime() - due.getTime()) / 86400000);
  if (days <= 0) return null;
  return {
    days,
    color: days >= 30
      ? "bg-red-500/20 text-red-400 border-red-500/40"
      : "bg-amber-500/20 text-amber-400 border-amber-500/40",
  };
}

function InvoiceRow({ invoice, isAdmin }: { invoice: Invoice; isAdmin: boolean }) {
  const { toast } = useToast();
  const deleteMutation = useDeleteInvoice();
  const cfg = statusConfig(invoice.status);
  const StatusIcon = cfg.icon;
  const isMulti = invoice.items && invoice.items.length > 1;
  const aging = agingBadge(invoice);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`)) return;
    try {
      await deleteMutation.mutateAsync(invoice.id);
      toast({ title: "Invoice deleted" });
    } catch {
      toast({ variant: "destructive", title: "Failed to delete invoice" });
    }
  };

  return (
    <Link href={`/invoices/${invoice.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4 px-4 py-3 rounded-lg border border-border/50 bg-card hover:bg-accent/30 hover:border-primary/30 cursor-pointer transition-all group"
      >
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-primary" />
        </div>

        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-5 gap-1 sm:gap-4 items-center">
          <div className="sm:col-span-1">
            <p className="text-sm font-mono font-semibold text-foreground">{invoice.invoiceNumber}</p>
            <div className="flex items-center gap-1 flex-wrap">
              {isMulti && (
                <Badge className="text-[10px] px-1.5 py-0 bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 flex items-center gap-0.5">
                  <Package className="w-2.5 h-2.5" />
                  {invoice.items.length}
                </Badge>
              )}
              <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                {containerSummary(invoice)}
              </p>
            </div>
          </div>
          <div className="sm:col-span-1">
            <p className="text-sm text-foreground truncate">{invoice.clientName ?? "No client"}</p>
            <p className="text-xs text-muted-foreground">{invoice.dueDate ? `Due ${invoice.dueDate}` : "No due date"}</p>
          </div>
          <div className="sm:col-span-1 text-right sm:text-left">
            <p className="text-sm font-semibold text-foreground">{formatCurrency(invoice.total)}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </div>
          <div className="sm:col-span-1">
            {invoice.outstanding > 0 ? (
              <>
                <p className="text-sm font-semibold text-amber-400">{formatCurrency(invoice.outstanding)}</p>
                <p className="text-xs text-muted-foreground">Outstanding</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-emerald-400">Settled</p>
                <p className="text-xs text-muted-foreground">{formatCurrency(invoice.totalPaid)} paid</p>
              </>
            )}
          </div>
          <div className="sm:col-span-1 flex items-center flex-wrap gap-1.5">
            <Badge className={`text-xs border px-2 py-0.5 flex items-center gap-1 w-fit ${cfg.color}`}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </Badge>
            {aging && (
              <Badge className={`text-[10px] border px-1.5 py-0 w-fit ${aging.color}`}>
                {aging.days}d overdue
              </Badge>
            )}
            {invoice.creditNotes && invoice.creditNotes.length > 0 && (
              <Badge className="text-[10px] border px-1.5 py-0 w-fit bg-cyan-500/20 text-cyan-400 border-cyan-500/40 flex items-center gap-0.5">
                <ReceiptText className="w-2.5 h-2.5" />
                {invoice.creditNotes.length} CN
              </Badge>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </motion.div>
    </Link>
  );
}

export default function InvoicesPage() {
  const { isAdmin } = useAuth();
  const { data: invoices, isLoading } = useListInvoices();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [writtenOffOpen, setWrittenOffOpen] = useState(false);

  const allInvoices = invoices ?? [];
  const activeInvoices = allInvoices.filter(i => i.status !== "written_off");
  const writtenOffInvoices = allInvoices.filter(i => i.status === "written_off");

  const filtered = activeInvoices.filter(inv => {
    const q = search.toLowerCase();
    const containerNums = inv.items?.map(it => it.containerNumber ?? "").join(" ") ?? (inv.containerNumber ?? "");
    const matchesSearch = (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.clientName ?? "").toLowerCase().includes(q) ||
      containerNums.toLowerCase().includes(q)
    );
    const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredWrittenOff = writtenOffInvoices.filter(inv => {
    const q = search.toLowerCase();
    const containerNums = inv.items?.map(it => it.containerNumber ?? "").join(" ") ?? (inv.containerNumber ?? "");
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.clientName ?? "").toLowerCase().includes(q) ||
      containerNums.toLowerCase().includes(q)
    );
  });

  const totalOutstanding = activeInvoices.reduce((s, i) => s + i.outstanding, 0);
  const totalPaid = activeInvoices.reduce((s, i) => s + i.totalPaid, 0);
  const paidCount = activeInvoices.filter(i => i.status === "paid").length;
  const overdueCount = activeInvoices.filter(i => i.status === "overdue").length;

  const showWrittenOffSection = (statusFilter === "all" || statusFilter === "written_off") && filteredWrittenOff.length > 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Track client invoices and payments
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            New Invoice
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Outstanding", value: formatCurrency(totalOutstanding), color: "text-amber-400" },
          { label: "Total Collected", value: formatCurrency(totalPaid), color: "text-emerald-400" },
          { label: "Fully Paid", value: String(paidCount), color: "text-emerald-400" },
          { label: "Overdue", value: String(overdueCount), color: overdueCount > 0 ? "text-red-400" : "text-muted-foreground" },
        ].map(stat => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by invoice number, client or container..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 shrink-0">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="written_off">Written Off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : statusFilter === "written_off" ? (
        filteredWrittenOff.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground space-y-2">
            <FileText className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm">No written-off invoices.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredWrittenOff.map(inv => (
              <InvoiceRow key={inv.id} invoice={inv} isAdmin={!!isAdmin} />
            ))}
          </div>
        )
      ) : filtered.length === 0 && !showWrittenOffSection ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <FileText className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm">
            {search ? "No invoices match your search." : "No invoices yet — create one using the New Invoice button."}
          </p>
        </div>
      ) : (
        <>
          {filtered.length > 0 && (
            <div className="space-y-2">
              {filtered.map(inv => (
                <InvoiceRow key={inv.id} invoice={inv} isAdmin={!!isAdmin} />
              ))}
            </div>
          )}

          {showWrittenOffSection && (
            <div className="space-y-2">
              <button
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-500/30 bg-zinc-500/5 text-zinc-400 text-sm font-medium hover:bg-zinc-500/10 transition-colors"
                onClick={() => setWrittenOffOpen(o => !o)}
              >
                <FileText className="w-4 h-4" />
                Written Off ({filteredWrittenOff.length})
                <span className="ml-auto">
                  {writtenOffOpen
                    ? <ChevronUp className="w-4 h-4" />
                    : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>
              {writtenOffOpen && (
                <div className="space-y-2 pl-2">
                  {filteredWrittenOff.map(inv => (
                    <InvoiceRow key={inv.id} invoice={inv} isAdmin={!!isAdmin} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <CreateInvoiceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </div>
  );
}
