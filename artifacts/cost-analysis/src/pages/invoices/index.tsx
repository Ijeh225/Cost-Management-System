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
import {
  FileText, Search, Loader2, Trash2, ChevronRight, Plus,
  CheckCircle2, Clock, AlertTriangle, XCircle, CreditCard,
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
    default:
      return { label: "Draft", color: "bg-slate-500/20 text-slate-400 border-slate-500/50", icon: FileText };
  }
}

function InvoiceRow({ invoice, isAdmin }: { invoice: Invoice; isAdmin: boolean }) {
  const { toast } = useToast();
  const deleteMutation = useDeleteInvoice();
  const cfg = statusConfig(invoice.status);
  const StatusIcon = cfg.icon;

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
            <p className="text-xs text-muted-foreground truncate">{invoice.containerNumber ?? "—"}</p>
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
          <div className="sm:col-span-1 flex items-center justify-between sm:justify-start gap-2">
            <Badge className={`text-xs border px-2 py-0.5 flex items-center gap-1 w-fit ${cfg.color}`}>
              <StatusIcon className="w-3 h-3" />
              {cfg.label}
            </Badge>
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

  const filtered = (invoices ?? []).filter(inv => {
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.clientName ?? "").toLowerCase().includes(q) ||
      (inv.containerNumber ?? "").toLowerCase().includes(q)
    );
  });

  const totalOutstanding = (invoices ?? []).reduce((s, i) => s + i.outstanding, 0);
  const totalPaid = (invoices ?? []).reduce((s, i) => s + i.totalPaid, 0);
  const paidCount = (invoices ?? []).filter(i => i.status === "paid").length;
  const overdueCount = (invoices ?? []).filter(i => i.status === "overdue").length;

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
        <Link href="/containers">
          <Button size="sm" className="gap-2">
            <Plus className="w-4 h-4" />
            New Invoice
          </Button>
        </Link>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by invoice number, client or container..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground space-y-2">
          <FileText className="w-10 h-10 mx-auto opacity-30" />
          <p className="text-sm">
            {search ? "No invoices match your search." : "No invoices yet — create one from a container page."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inv => (
            <InvoiceRow key={inv.id} invoice={inv} isAdmin={!!isAdmin} />
          ))}
        </div>
      )}
    </div>
  );
}
