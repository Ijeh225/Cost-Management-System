import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetInvoice, useUpdateInvoice, useRecordPayment, useDeletePayment,
  type RecordPaymentBody,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText, ArrowLeft, Phone, Loader2, Trash2, CheckCircle2,
  Clock, AlertTriangle, CreditCard, Send, PlusCircle, Building2,
  Box, Calendar, StickyNote, MessageCircle,
} from "lucide-react";

function statusConfig(status: string) {
  switch (status) {
    case "paid":
      return { label: "Paid", color: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50", icon: CheckCircle2 };
    case "partial":
      return { label: "Partially Paid", color: "bg-blue-500/20 text-blue-400 border-blue-500/50", icon: CreditCard };
    case "sent":
      return { label: "Sent", color: "bg-amber-500/20 text-amber-400 border-amber-500/50", icon: Clock };
    case "overdue":
      return { label: "Overdue", color: "bg-red-500/20 text-red-400 border-red-500/50", icon: AlertTriangle };
    default:
      return { label: "Draft", color: "bg-slate-500/20 text-slate-400 border-slate-500/50", icon: FileText };
  }
}

function buildWhatsAppLink(phone: string, invoice: {
  invoiceNumber: string;
  containerNumber: string | null;
  blNumber: string | null;
  clientName: string | null;
  total: number;
  outstanding: number;
  dueDate: string | null;
}) {
  const normalized = phone.replace(/\D/g, "");
  const e164 = normalized.startsWith("0") ? "234" + normalized.slice(1) : normalized;

  const lines = [
    `Hello ${invoice.clientName ?? ""},`,
    ``,
    `Please find below the invoice details for your container clearance:`,
    ``,
    `📄 Invoice No: *${invoice.invoiceNumber}*`,
    invoice.containerNumber ? `📦 Container: *${invoice.containerNumber}*` : null,
    invoice.blNumber ? `📋 B/L Number: *${invoice.blNumber}*` : null,
    ``,
    `💰 Invoice Total: *${formatCurrency(invoice.total)}*`,
    invoice.outstanding > 0 ? `⏳ Outstanding Balance: *${formatCurrency(invoice.outstanding)}*` : `✅ Balance: *Fully Settled*`,
    invoice.dueDate ? `📅 Due Date: *${invoice.dueDate}*` : null,
    ``,
    `For any queries, please do not hesitate to reach out.`,
    ``,
    `Thank you for your business.`,
  ].filter(l => l !== null).join("\n");

  return `https://wa.me/${e164}?text=${encodeURIComponent(lines)}`;
}

function RecordPaymentDialog({
  open,
  onClose,
  invoiceId,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: number;
}) {
  const { toast } = useToast();
  const recordMutation = useRecordPayment();
  const [form, setForm] = useState<RecordPaymentBody>({
    amount: 0,
    paymentMethod: "transfer",
    reference: "",
    notes: "",
    paidAt: new Date().toISOString().split("T")[0],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || form.amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    try {
      await recordMutation.mutateAsync({ invoiceId, data: form });
      toast({ title: "Payment recorded" });
      onClose();
      setForm({ amount: 0, paymentMethod: "transfer", reference: "", notes: "", paidAt: new Date().toISOString().split("T")[0] });
    } catch {
      toast({ variant: "destructive", title: "Failed to record payment" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Record Payment
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="amount">Amount (₦) *</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={form.amount || ""}
              onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="method">Payment Method</Label>
            <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="transfer">Bank Transfer</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="paidAt">Date Paid</Label>
            <Input
              id="paidAt"
              type="date"
              value={form.paidAt}
              onChange={e => setForm(f => ({ ...f, paidAt: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="ref">Reference / Teller Number</Label>
            <Input
              id="ref"
              placeholder="e.g. NXG2024112301"
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={2}
              placeholder="Optional note..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={recordMutation.isPending}>
              {recordMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Record Payment
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = parseInt(params.id, 10);
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: invoice, isLoading } = useGetInvoice(isNaN(invoiceId) ? null : invoiceId);
  const updateMutation = useUpdateInvoice();
  const deletePaymentMutation = useDeletePayment();
  const [paymentOpen, setPaymentOpen] = useState(false);

  const handleStatusChange = async (status: string) => {
    try {
      await updateMutation.mutateAsync({ id: invoiceId, data: { status } });
      toast({ title: "Status updated" });
    } catch {
      toast({ variant: "destructive", title: "Failed to update status" });
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm("Remove this payment record?")) return;
    try {
      await deletePaymentMutation.mutateAsync({ invoiceId, paymentId });
      toast({ title: "Payment removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove payment" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto opacity-30 mb-2" />
        <p>Invoice not found.</p>
        <Link href="/invoices"><Button variant="link" className="mt-2">Back to Invoices</Button></Link>
      </div>
    );
  }

  const cfg = statusConfig(invoice.status);
  const StatusIcon = cfg.icon;
  const paidPct = invoice.total > 0 ? Math.min(100, (invoice.totalPaid / invoice.total) * 100) : 0;
  const whatsappLink = invoice.clientPhone
    ? buildWhatsAppLink(invoice.clientPhone, invoice)
    : null;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/invoices">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground font-mono">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-muted-foreground">Invoice Details</p>
        </div>
        <Badge className={`text-xs border px-2.5 py-1 flex items-center gap-1.5 ${cfg.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {cfg.label}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Box className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Container:</span>
              {invoice.containerId ? (
                <Link href={`/containers/${invoice.containerId}`}>
                  <span className="text-primary hover:underline font-mono">
                    {invoice.containerNumber ?? `#${invoice.containerId}`}
                  </span>
                </Link>
              ) : <span className="text-foreground">—</span>}
            </div>
            {invoice.blNumber && (
              <div className="flex items-center gap-2 text-sm">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">B/L Number:</span>
                <span className="text-foreground font-mono">{invoice.blNumber}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Client:</span>
              <span className="text-foreground">{invoice.clientName ?? "No client linked"}</span>
            </div>
            {invoice.clientPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Phone:</span>
                <span className="text-foreground">{invoice.clientPhone}</span>
              </div>
            )}
            {invoice.dueDate && (
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">Due Date:</span>
                <span className="text-foreground">{invoice.dueDate}</span>
              </div>
            )}
            {invoice.notes && (
              <div className="flex items-start gap-2 text-sm">
                <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Notes:</span>
                <span className="text-foreground">{invoice.notes}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground">{formatCurrency(invoice.subtotal)}</span>
            </div>
            {invoice.vatAmount > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">VAT</span>
                <span className="text-foreground">{formatCurrency(invoice.vatAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm border-t border-border/50 pt-3">
              <span className="font-semibold text-foreground">Total</span>
              <span className="font-bold text-lg text-foreground">{formatCurrency(invoice.total)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Total Paid</span>
              <span className="text-emerald-400 font-semibold">{formatCurrency(invoice.totalPaid)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Outstanding</span>
              <span className={`font-bold ${invoice.outstanding > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {formatCurrency(invoice.outstanding)}
              </span>
            </div>
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Payment progress</span>
                <span>{Math.round(paidPct)}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{ width: `${paidPct}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setPaymentOpen(true)} className="gap-2">
          <PlusCircle className="w-4 h-4" />
          Record Payment
        </Button>

        {whatsappLink && (
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" className="gap-2 border-green-600 text-green-500 hover:bg-green-500/10">
              <MessageCircle className="w-4 h-4" />
              Send via WhatsApp
            </Button>
          </a>
        )}

        {isAdmin && invoice.status === "draft" && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => handleStatusChange("sent")}
            disabled={updateMutation.isPending}
          >
            <Send className="w-4 h-4" />
            Mark as Sent
          </Button>
        )}
        {isAdmin && invoice.status !== "overdue" && invoice.outstanding > 0 && invoice.status !== "draft" && (
          <Button
            variant="outline"
            className="gap-2 border-red-600 text-red-500 hover:bg-red-500/10"
            onClick={() => handleStatusChange("overdue")}
            disabled={updateMutation.isPending}
          >
            <AlertTriangle className="w-4 h-4" />
            Mark as Overdue
          </Button>
        )}
      </div>

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Payment History
            {invoice.payments.length > 0 && (
              <Badge variant="secondary" className="ml-1">{invoice.payments.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-8 h-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {invoice.payments.map(payment => (
                <div
                  key={payment.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/30"
                >
                  <div className="w-7 h-7 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-400">{formatCurrency(payment.amount)}</span>
                      <Badge variant="secondary" className="text-xs capitalize">{payment.paymentMethod}</Badge>
                      {payment.reference && (
                        <span className="text-xs text-muted-foreground font-mono">Ref: {payment.reference}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(payment.paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {payment.notes && (
                        <span className="text-xs text-muted-foreground">· {payment.notes}</span>
                      )}
                    </div>
                  </div>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeletePayment(payment.id)}
                      disabled={deletePaymentMutation.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <RecordPaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoiceId={invoiceId}
      />
    </div>
  );
}
