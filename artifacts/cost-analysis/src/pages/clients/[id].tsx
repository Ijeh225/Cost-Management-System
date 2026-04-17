import { useState, useMemo } from "react";
import { useParams, Link } from "wouter";
import {
  useGetClient, useUpdateClient, useGetClientReceivables,
  useGetClientWalletSummary, useGetClientDeposits,
  useCreateClientDeposit, useDeleteClientDeposit,
  type ClientWithContainers,
} from "@workspace/api-client-react";
import { formatCurrency, getStatusColor, getStatusLabel, WORKFLOW_STAGES } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin,
  Pencil, Check, X, Loader2, Box, Search,
  ReceiptText, Wallet, CreditCard, ChevronDown, ChevronUp, History,
  PlusCircle, Trash2, TrendingDown, TrendingUp, AlertTriangle, SlidersHorizontal,
} from "lucide-react";

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "Cheque"];
const DONE_STATUSES = new Set(["completed", "closed"]);

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-4">
        <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-mono font-bold text-foreground mt-1">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RecordDepositDialog({
  open, onOpenChange, clientId,
}: { open: boolean; onOpenChange: (v: boolean) => void; clientId: number }) {
  const { toast } = useToast();
  const createDeposit = useCreateClientDeposit(clientId);
  const [form, setForm] = useState({
    amount: "",
    paymentMethod: "",
    reference: "",
    notes: "",
  });

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    if (!form.paymentMethod) {
      toast({ variant: "destructive", title: "Select a payment method" });
      return;
    }
    try {
      await createDeposit.mutateAsync({
        amount,
        paymentMethod: form.paymentMethod,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      toast({ title: "Deposit recorded successfully" });
      setForm({ amount: "", paymentMethod: "", reference: "", notes: "" });
      onOpenChange(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to record deposit" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Record Deposit
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Amount (₦) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 100000000"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="font-mono"
            />
            {form.amount && !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) > 0 && (
              <p className="text-xs text-muted-foreground font-mono">
                = {formatCurrency(parseFloat(form.amount))}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Payment Method *</Label>
            <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select method..." />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Reference / Receipt No.</Label>
            <Input
              placeholder="e.g. TRX-2024-001"
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Notes</Label>
            <Textarea
              placeholder="Optional notes..."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createDeposit.isPending} className="gap-2">
            {createDeposit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Record Deposit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const clientId = parseInt(id ?? "");
  const { toast } = useToast();
  const { data: client, isLoading } = useGetClient(isNaN(clientId) ? null : clientId);
  const { data: receivables } = useGetClientReceivables(isNaN(clientId) ? null : clientId);
  const { data: walletSummary } = useGetClientWalletSummary(isNaN(clientId) ? null : clientId);
  const { data: deposits } = useGetClientDeposits(isNaN(clientId) ? null : clientId);
  const deleteDeposit = useDeleteClientDeposit(isNaN(clientId) ? 0 : clientId);
  const updateMutation = useUpdateClient();

  const [showInvoices, setShowInvoices] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showDepositHistory, setShowDepositHistory] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [deleteDepositId, setDeleteDepositId] = useState<number | null>(null);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: "", contactName: "", contactEmail: "", contactPhone: "", address: "", notes: "", agreedClearingRate: "",
  });

  const startEdit = () => {
    if (!client) return;
    setForm({
      name: client.name,
      contactName: client.contactName,
      contactEmail: client.contactEmail,
      contactPhone: client.contactPhone,
      address: client.address,
      notes: client.notes,
      agreedClearingRate: client.agreedClearingRate != null ? String(client.agreedClearingRate) : "",
    });
    setEditing(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    try {
      const payload = {
        ...form,
        agreedClearingRate: form.agreedClearingRate !== "" ? parseFloat(form.agreedClearingRate) : null,
      };
      await updateMutation.mutateAsync({ id: clientId, data: payload });
      toast({ title: "Client updated" });
      setEditing(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to update client" });
    }
  };

  const handleDeleteDeposit = async () => {
    if (!deleteDepositId) return;
    try {
      await deleteDeposit.mutateAsync(deleteDepositId);
      toast({ title: "Deposit removed" });
    } catch {
      toast({ variant: "destructive", title: "Failed to remove deposit" });
    } finally {
      setDeleteDepositId(null);
    }
  };

  const set = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  // ─── Container filter state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"active" | "all">("active");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const containers = client?.containers ?? [];
  const totalRevenue = containers.reduce((s, c) => s + parseFloat(c.clearingCharges ?? "0"), 0);
  const totalContainers = containers.length;
  const sizes: Record<string, number> = {};
  containers.forEach(c => { if (c.size) sizes[c.size] = (sizes[c.size] ?? 0) + 1; });

  const filteredContainers = useMemo(() => {
    let list = containers;
    if (activeTab === "active") {
      list = list.filter(c => !DONE_STATUSES.has(c.status));
    }
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      list = list.filter(c =>
        c.containerNumber.toLowerCase().includes(term) ||
        c.blNumber.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== "all") {
      list = list.filter(c => c.status === statusFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      list = list.filter(c => new Date(c.createdAt) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      list = list.filter(c => new Date(c.createdAt) <= to);
    }
    return list;
  }, [containers, activeTab, searchTerm, statusFilter, dateFrom, dateTo]);

  const hasActiveFilters = searchTerm.trim() || statusFilter !== "all" || dateFrom || dateTo;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <Building2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
        <p>Client not found.</p>
        <Link href="/clients"><Button variant="link" className="mt-2">Back to Clients</Button></Link>
      </div>
    );
  }

  const balance = walletSummary?.balance ?? 0;
  const isOverdrawn = balance < 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/clients">
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Clients
          </Button>
        </Link>
        <div className="flex items-center gap-2 ml-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{client.name}</h1>
        </div>
        {!editing && (
          <Button variant="outline" size="sm" onClick={startEdit} className="ml-auto gap-2">
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Containers" value={String(totalContainers)} />
        <StatCard label="Total Revenue" value={formatCurrency(totalRevenue)} sub="Clearing charges" />
        <StatCard label="Container Sizes" value={Object.entries(sizes).map(([k, v]) => `${v}×${k}`).join(", ") || "—"} />
        <StatCard label="Since" value={new Date(client.createdAt).toLocaleDateString("en-NG", { month: "short", year: "numeric" })} />
      </div>

      {/* ─── Wallet ─────────────────────────────────────────────────────────── */}
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="border-b border-border/40 pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wallet className="w-4 h-4 text-primary" /> Client Wallet
            </CardTitle>
            <Button size="sm" onClick={() => setDepositDialogOpen(true)} className="h-7 text-xs gap-1.5">
              <PlusCircle className="w-3.5 h-3.5" /> Record Deposit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            {/* Total Deposited */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-400" /> Total Deposited
              </p>
              <p className="font-mono font-bold text-lg text-emerald-400">
                {formatCurrency(walletSummary?.totalDeposited ?? 0)}
              </p>
            </div>
            {/* Total Expenses */}
            <div className="text-center border-x border-border/40">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <TrendingDown className="w-3 h-3 text-amber-400" /> Total Expenses
              </p>
              <p className="font-mono font-bold text-lg text-amber-400">
                {formatCurrency(walletSummary?.totalExpenses ?? 0)}
              </p>
            </div>
            {/* Balance */}
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                <CreditCard className="w-3 h-3" /> Current Balance
              </p>
              <p className={`font-mono font-bold text-lg ${isOverdrawn ? "text-red-400" : "text-emerald-400"}`}>
                {formatCurrency(Math.abs(balance))}
                {isOverdrawn ? " (Overdrawn)" : ""}
              </p>
            </div>
          </div>

          {isOverdrawn && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4 text-xs text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
              Outstanding liability of {formatCurrency(Math.abs(balance))} — expenses exceed deposited funds.
            </div>
          )}

          {/* Deposit History Toggle */}
          <div className="border-t border-border/40 pt-3">
            <button
              onClick={() => setShowDepositHistory(v => !v)}
              className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <History className="w-3.5 h-3.5" />
              {showDepositHistory ? "Hide" : "Show"} deposit history
              ({deposits?.length ?? 0} deposit{(deposits?.length ?? 0) !== 1 ? "s" : ""})
              {showDepositHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showDepositHistory && (
              <div className="mt-3">
                {!deposits || deposits.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-4 text-center">
                    No deposits recorded yet.
                  </p>
                ) : (
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/30 border-b border-border/40">
                        <tr className="text-muted-foreground font-mono uppercase tracking-wider">
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-left font-medium">Method</th>
                          <th className="px-3 py-2 text-left font-medium">Reference</th>
                          <th className="px-3 py-2 text-left font-medium">Notes</th>
                          <th className="px-3 py-2 text-center font-medium">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {deposits.map(d => (
                          <tr key={d.id} className="hover:bg-accent/10 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {new Date(d.createdAt).toLocaleDateString("en-NG", {
                                day: "numeric", month: "short", year: "numeric",
                              })}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-400 font-semibold">
                              {formatCurrency(d.amount)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground capitalize">{d.paymentMethod}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{d.reference ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[160px] truncate">{d.notes ?? "—"}</td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => setDeleteDepositId(d.id)}
                                className="text-muted-foreground hover:text-red-400 transition-colors p-0.5 rounded"
                                title="Remove deposit"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ─── Accounts Receivable ─────────────────────────────────────────────── */}
      {receivables && (receivables.totalInvoiced > 0) && (
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="border-b border-border/40 pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <ReceiptText className="w-4 h-4 text-primary" /> Accounts Receivable
              </CardTitle>
              {receivables.invoices.length > 0 && (
                <button
                  onClick={() => setShowInvoices(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showInvoices ? "Hide invoices" : `Show ${receivables.invoices.length} invoice${receivables.invoices.length !== 1 ? "s" : ""}`}
                  {showInvoices ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  <ReceiptText className="w-3 h-3" /> Invoiced
                </p>
                <p className="font-mono font-bold text-lg text-foreground">{formatCurrency(receivables.totalInvoiced)}</p>
              </div>
              <div className="text-center border-x border-border/40">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  <Wallet className="w-3 h-3" /> Collected
                </p>
                <p className="font-mono font-bold text-lg text-emerald-400">{formatCurrency(receivables.totalCollected)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1 flex items-center justify-center gap-1">
                  <CreditCard className="w-3 h-3" /> Outstanding
                </p>
                <p className={`font-mono font-bold text-lg ${receivables.totalOutstanding > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                  {formatCurrency(receivables.totalOutstanding)}
                </p>
              </div>
            </div>

            {showInvoices && receivables.invoices.length > 0 && (
              <div className="border border-border/40 rounded-lg overflow-hidden mt-2">
                <table className="w-full text-xs">
                  <thead className="bg-secondary/30 border-b border-border/40">
                    <tr className="text-muted-foreground font-mono uppercase tracking-wider">
                      <th className="px-3 py-2 text-left font-medium">Invoice #</th>
                      <th className="px-3 py-2 text-left font-medium">Container</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                      <th className="px-3 py-2 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {receivables.invoices.map(inv => (
                      <tr key={inv.id} className={`hover:bg-accent/10 transition-colors ${inv.outstanding === 0 && inv.paid > 0 ? "opacity-70" : ""}`}>
                        <td className="px-3 py-2 font-mono text-primary">{inv.invoiceNumber}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {inv.containerNumber ? (
                            <Link href={`/containers/${inv.containerId}`} className="hover:text-primary transition-colors">
                              {inv.containerNumber}
                            </Link>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{formatCurrency(inv.total)}</td>
                        <td className="px-3 py-2 text-right font-mono text-emerald-400">{formatCurrency(inv.paid)}</td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${inv.outstanding > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                          {inv.outstanding > 0 ? formatCurrency(inv.outstanding) : "Cleared"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge variant="secondary" className="text-[10px] py-0 capitalize">{inv.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Payment History */}
            {(receivables.paymentHistory ?? []).length > 0 && (
              <div className="mt-4 border-t border-border/40 pt-4">
                <button
                  onClick={() => setShowPaymentHistory(v => !v)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <History className="w-3.5 h-3.5" />
                  {showPaymentHistory ? "Hide" : "Show"} payment history ({receivables.paymentHistory.length} payment{receivables.paymentHistory.length !== 1 ? "s" : ""})
                  {showPaymentHistory ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showPaymentHistory && (
                  <div className="border border-border/40 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/30 border-b border-border/40">
                        <tr className="text-muted-foreground font-mono uppercase tracking-wider">
                          <th className="px-3 py-2 text-left font-medium">Date</th>
                          <th className="px-3 py-2 text-left font-medium">Invoice</th>
                          <th className="px-3 py-2 text-left font-medium">Container</th>
                          <th className="px-3 py-2 text-right font-medium">Amount</th>
                          <th className="px-3 py-2 text-left font-medium">Method</th>
                          <th className="px-3 py-2 text-left font-medium">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {receivables.paymentHistory.map(p => (
                          <tr key={p.id} className="hover:bg-accent/10 transition-colors">
                            <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                              {new Date(p.paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                            </td>
                            <td className="px-3 py-2 font-mono text-primary">{p.invoiceNumber}</td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {p.containerNumber ? (
                                <Link href={`/containers/${p.containerId}`} className="hover:text-primary transition-colors">
                                  {p.containerNumber}
                                </Link>
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-400 font-semibold">
                              {formatCurrency(p.amount)}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground capitalize">{p.paymentMethod ?? "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground font-mono">{p.reference ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Client Info */}
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="border-b border-border/40 pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" /> Client Info
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {editing ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Company Name *</Label>
                  <Input value={form.name} onChange={e => set({ name: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Contact Person</Label>
                  <Input value={form.contactName} onChange={e => set({ contactName: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.contactPhone} onChange={e => set({ contactPhone: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={form.contactEmail} onChange={e => set({ contactEmail: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Address</Label>
                  <Input value={form.address} onChange={e => set({ address: e.target.value })} className="h-8 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Agreed Clearing Rate (₦)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.agreedClearingRate}
                    onChange={e => set({ agreedClearingRate: e.target.value })}
                    placeholder="Leave blank to use container rate"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea value={form.notes} onChange={e => set({ notes: e.target.value })} rows={2} className="resize-none text-sm" />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} className="h-7 text-xs gap-1">
                    <X className="w-3 h-3" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={!form.name.trim() || updateMutation.isPending} className="h-7 text-xs gap-1">
                    {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {client.contactName && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{client.contactName}</span>
                  </div>
                )}
                {client.contactPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span>{client.contactPhone}</span>
                  </div>
                )}
                {client.contactEmail && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="truncate">{client.contactEmail}</span>
                  </div>
                )}
                {client.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <span>{client.address}</span>
                  </div>
                )}
                {client.agreedClearingRate != null && (
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-0.5">Agreed Clearing Rate</p>
                    <p className="text-sm font-mono font-semibold text-primary">{formatCurrency(client.agreedClearingRate)}</p>
                    <p className="text-[10px] text-muted-foreground">Auto-applied on new invoices</p>
                  </div>
                )}
                {client.notes && (
                  <div className="pt-2 border-t border-border/40">
                    <p className="text-xs text-muted-foreground italic">{client.notes}</p>
                  </div>
                )}
                {!client.contactName && !client.contactPhone && !client.contactEmail && !client.address && !client.notes && client.agreedClearingRate == null && (
                  <p className="text-sm text-muted-foreground italic">No contact details. Click Edit to add them.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Containers */}
        <Card className="border-border/50 bg-card/50 lg:col-span-2">
          <CardHeader className="border-b border-border/40 pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Box className="w-4 h-4 text-primary" /> Containers ({totalContainers})
              </CardTitle>
              {/* Active / All tabs */}
              <div className="flex items-center gap-1 bg-secondary/40 rounded-lg p-0.5">
                {(["active", "all"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      activeTab === tab
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "active" ? "Active" : "All"}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          {containers.length === 0 ? (
            <CardContent className="p-0">
              <div className="px-6 py-10 text-center text-muted-foreground">
                <Box className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm font-medium">No containers linked</p>
                <p className="text-xs mt-1">Open a container and link it to this client from the container details.</p>
              </div>
            </CardContent>
          ) : (
            <>
              {/* Filter bar */}
              <div className="px-4 py-3 border-b border-border/40 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder="Search container # or BL…"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  {/* Status */}
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8 text-xs w-[160px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {WORKFLOW_STAGES.map(s => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Date range */}
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    className="h-8 text-xs w-[140px]"
                    title="From date"
                  />
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    className="h-8 text-xs w-[140px]"
                    title="To date"
                  />
                  {hasActiveFilters && (
                    <button
                      onClick={() => { setSearchTerm(""); setStatusFilter("all"); setDateFrom(""); setDateTo(""); }}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2 whitespace-nowrap"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {/* Results count */}
                <p className="text-[11px] text-muted-foreground font-mono">
                  {filteredContainers.length} container{filteredContainers.length !== 1 ? "s" : ""}
                  {activeTab === "active" ? " (active)" : ""}
                  {hasActiveFilters ? " matching filters" : ""}
                </p>
              </div>

              <CardContent className="p-0">
                {filteredContainers.length === 0 ? (
                  <div className="px-6 py-10 text-center text-muted-foreground">
                    <SlidersHorizontal className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm font-medium">No containers match your filters</p>
                    <p className="text-xs mt-1">
                      {activeTab === "active"
                        ? "Try switching to 'All' or adjusting your search."
                        : "Try adjusting the search or date range."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {filteredContainers.map(c => (
                      <Link key={c.id} href={`/containers/${c.id}?from=/clients/${clientId}`}>
                        <div className="flex items-center justify-between px-4 py-3 hover:bg-accent/10 transition-colors cursor-pointer group">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-accent/30 flex items-center justify-center flex-shrink-0">
                              <Box className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-mono font-medium truncate group-hover:text-primary transition-colors">
                                {c.containerNumber}
                              </p>
                              <p className="text-xs text-muted-foreground">{c.blNumber}</p>
                            </div>
                            {c.size && (
                              <Badge variant="outline" className="text-[10px] py-0 px-1.5 hidden sm:flex">{c.size}</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase border ${getStatusColor(c.status)}`}>
                              {getStatusLabel(c.status)}
                            </span>
                            <div className="text-right hidden sm:block">
                              <p className="text-xs font-mono font-semibold text-primary">
                                {formatCurrency(parseFloat(c.clearingCharges ?? "0"))}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                {new Date(c.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </>
          )}
        </Card>
      </div>

      {/* Record Deposit Dialog */}
      <RecordDepositDialog
        open={depositDialogOpen}
        onOpenChange={setDepositDialogOpen}
        clientId={clientId}
      />

      {/* Delete Deposit Confirmation */}
      <AlertDialog open={!!deleteDepositId} onOpenChange={open => !open && setDeleteDepositId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this deposit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the deposit record and update the wallet balance. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteDeposit} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
