import { useState } from "react";
import { Link, useParams } from "wouter";
import {
  useGetInvoice, useUpdateInvoice, useRecordPayment, useDeletePayment,
  useGetInvoiceWhatsAppLog, useSendInvoiceWhatsApp, useSendInvoiceReminder, useSendInvoiceReceipt,
  useAddInvoiceItem, useEditInvoiceItem, useRemoveInvoiceItem,
  useListActiveBanks, useApplyClientCredit, useGetClientWalletSummary,
  useGetClientDeposits, useAllocateDeposit,
  useRaiseCreditNote, useWriteOffInvoice,
  type RecordPaymentBody, type InvoiceItem, type CreditNote,
} from "@workspace/api-client-react";
import { useListContainers, getListContainersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, ArrowLeft, Phone, Loader2, Trash2, CheckCircle2,
  Clock, AlertTriangle, CreditCard, Send, PlusCircle, Building2,
  Box, Calendar, StickyNote, MessageCircle, Bell, ChevronDown, ChevronUp, Printer, Receipt,
  Pencil, ChevronsUpDown, Check, Banknote, FileX, ReceiptText,
} from "lucide-react";

function ApplyDepositDialog({
  open, onClose, invoiceId, clientId, invoiceOutstanding,
}: {
  open: boolean; onClose: () => void;
  invoiceId: number; clientId: number; invoiceOutstanding: number;
}) {
  const { toast } = useToast();
  const allocate = useAllocateDeposit(clientId);
  const { data: deposits = [] } = useGetClientDeposits(open ? clientId : null);
  const [selectedDepositId, setSelectedDepositId] = useState<string>("");
  const [amount, setAmount] = useState("");

  const unallocated = deposits.filter(d => d.remainingAmount > 0);
  const selected = unallocated.find(d => String(d.id) === selectedDepositId);
  const maxApply = selected ? Math.min(selected.remainingAmount, invoiceOutstanding) : invoiceOutstanding;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) { toast({ variant: "destructive", title: "Select a deposit" }); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }
    try {
      const res = await allocate.mutateAsync({ depositId: selected.id, invoiceId, amount: amt });
      toast({ title: `₦${res.allocationAmount.toLocaleString()} applied from deposit. Remaining on deposit: ₦${res.remainingOnDeposit.toLocaleString()}` });
      onClose();
      setSelectedDepositId("");
      setAmount("");
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "Failed to allocate deposit" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-blue-400" />
            Apply Deposit to Invoice
          </DialogTitle>
        </DialogHeader>
        {unallocated.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">No unallocated deposits available for this client.</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            <div>
              <Label>Select Deposit</Label>
              <Select value={selectedDepositId} onValueChange={v => { setSelectedDepositId(v); setAmount(""); }}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Choose a deposit..." />
                </SelectTrigger>
                <SelectContent>
                  {unallocated.map(d => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      ₦{d.remainingAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })} remaining
                      {d.reference ? ` · ${d.reference}` : ""} ({new Date(d.createdAt).toLocaleDateString("en-NG")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected && (
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-sm">
                <p className="text-xs text-muted-foreground mb-0.5">Remaining on Deposit</p>
                <p className="font-mono font-bold text-blue-400">
                  ₦{selected.remainingAmount.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                </p>
              </div>
            )}
            <div>
              <Label>Amount to Apply (₦) *</Label>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                max={maxApply}
                placeholder={`Max ₦${maxApply.toLocaleString()}`}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="mt-1 font-mono"
                disabled={!selected}
              />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={allocate.isPending || !selected} className="gap-2 bg-blue-600 hover:bg-blue-700">
                {allocate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Apply Deposit
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApplyCreditDialog({
  open, onClose, invoiceId, clientId, invoiceOutstanding,
}: {
  open: boolean; onClose: () => void;
  invoiceId: number; clientId: number; invoiceOutstanding: number;
}) {
  const { toast } = useToast();
  const applyCredit = useApplyClientCredit();
  const { data: walletSummary } = useGetClientWalletSummary(open ? clientId : null);
  const [amount, setAmount] = useState("");

  const creditBalance = walletSummary?.creditBalance ?? 0;
  const maxApply = Math.min(creditBalance, invoiceOutstanding);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }
    try {
      const res = await applyCredit.mutateAsync({ invoiceId, amount: amt });
      toast({ title: `₦${res.appliedAmount.toLocaleString()} credit applied. Remaining credit: ₦${res.remainingCredit.toLocaleString()}` });
      onClose();
      setAmount("");
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "Failed to apply credit" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="w-4 h-4 text-violet-400" />
            Apply Credit Balance
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-1">
          <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">Available Credit Balance</p>
            <p className="font-mono font-bold text-violet-400">
              ₦{creditBalance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <Label>Amount to Apply (₦) *</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              max={maxApply}
              placeholder={`Max ₦${maxApply.toLocaleString()}`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={applyCredit.isPending || creditBalance <= 0} className="gap-2 bg-violet-600 hover:bg-violet-700">
              {applyCredit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Apply Credit
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RaiseCreditNoteDialog({
  open, onClose, invoiceId, outstanding,
}: {
  open: boolean; onClose: () => void;
  invoiceId: number; outstanding: number;
}) {
  const { toast } = useToast();
  const raise = useRaiseCreditNote();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const handleClose = () => { setAmount(""); setReason(""); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }
    if (!reason.trim()) { toast({ variant: "destructive", title: "Reason is required" }); return; }
    try {
      const cn = await raise.mutateAsync({ invoiceId, data: { amount: amt, reason: reason.trim() } });
      toast({ title: `Credit note ${cn.creditNoteNumber} raised for ${formatCurrency(cn.amount)}` });
      handleClose();
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message ?? "Failed to raise credit note" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-cyan-400" />
            Raise Credit Note
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="bg-muted/40 border border-border/40 rounded-lg p-3 text-sm">
            <p className="text-xs text-muted-foreground mb-0.5">Outstanding Balance</p>
            <p className="font-mono font-bold text-amber-400">{formatCurrency(outstanding)}</p>
          </div>
          <div>
            <Label htmlFor="cn-amount">Amount (₦) *</Label>
            <Input
              id="cn-amount"
              type="number"
              min="0.01"
              step="0.01"
              max={outstanding}
              placeholder={`Max ${formatCurrency(outstanding)}`}
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="mt-1 font-mono"
            />
          </div>
          <div>
            <Label htmlFor="cn-reason">Reason *</Label>
            <Textarea
              id="cn-reason"
              rows={3}
              placeholder="e.g. Overcharge on clearing fees, billing error..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="mt-1"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            A credit note reduces the outstanding balance. The original invoice is preserved for audit purposes.
          </p>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={raise.isPending} className="gap-2 bg-cyan-600 hover:bg-cyan-700">
              {raise.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ReceiptText className="w-4 h-4" />}
              Raise Credit Note
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
    case "written_off":
      return { label: "Written Off", color: "bg-zinc-500/20 text-zinc-400 border-zinc-500/50", icon: FileX };
    default:
      return { label: "Draft", color: "bg-slate-500/20 text-slate-400 border-slate-500/50", icon: FileText };
  }
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
  const { data: banks = [] } = useListActiveBanks();
  const [form, setForm] = useState<RecordPaymentBody>({
    amount: 0,
    paymentMethod: "transfer",
    reference: "",
    notes: "",
    paidAt: new Date().toISOString().split("T")[0],
    bankId: null,
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
      setForm({ amount: 0, paymentMethod: "transfer", reference: "", notes: "", paidAt: new Date().toISOString().split("T")[0], bankId: null });
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
            <Select value={form.paymentMethod} onValueChange={v => setForm(f => ({ ...f, paymentMethod: v, bankId: null }))}>
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
          {form.paymentMethod === "transfer" && banks.length > 0 && (
            <div>
              <Label htmlFor="bank">Bank Account</Label>
              <Select
                value={form.bankId != null ? String(form.bankId) : ""}
                onValueChange={v => setForm(f => ({ ...f, bankId: v ? parseInt(v) : null }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select bank (optional)..." />
                </SelectTrigger>
                <SelectContent>
                  {banks.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}{b.accountNumber ? ` — ${b.accountNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
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

function AddItemDialog({
  open, onClose, invoiceId, existingContainerIds,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: number;
  existingContainerIds: number[];
}) {
  const { toast } = useToast();
  const addMutation = useAddInvoiceItem();
  const { data: allContainersData, isLoading: containersLoading } = useListContainers(
    { limit: 1000 },
    { query: { queryKey: getListContainersQueryKey({ limit: 1000 }), enabled: open } },
  );
  const allContainers = allContainersData?.containers ?? [];
  const available = allContainers.filter(c => !existingContainerIds.includes(c.id));

  const [containerId, setContainerId] = useState<string>("");
  const [comboOpen, setComboOpen] = useState(false);
  const selected = available.find(c => String(c.id) === containerId);

  const handleClose = () => { setContainerId(""); setComboOpen(false); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!containerId) {
      toast({ variant: "destructive", title: "Please select a container" });
      return;
    }
    try {
      await addMutation.mutateAsync({
        invoiceId,
        data: { containerId: Number(containerId) },
      });
      toast({ title: "Container added to invoice" });
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to add container";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-primary" />
            Add Container to Invoice
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label className="mb-1.5 block">Search Container</Label>
            <Popover open={comboOpen} onOpenChange={setComboOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={comboOpen}
                  disabled={available.length === 0 && !containersLoading}
                  className="w-full justify-between font-normal"
                >
                  {selected ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-mono font-medium truncate">{selected.containerNumber}</span>
                      {selected.blNumber && (
                        <span className="text-muted-foreground text-xs truncate">· {selected.blNumber}</span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {containersLoading ? "Loading containers…" : "Search by container # or B/L…"}
                    </span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[420px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type container # or B/L number…" />
                  <CommandList className="max-h-60">
                    <CommandEmpty>
                      {containersLoading ? "Loading…" : "No containers found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {available.map(c => (
                        <CommandItem
                          key={c.id}
                          value={`${c.containerNumber ?? ""} ${c.blNumber ?? ""} ${c.customerName ?? ""}`}
                          onSelect={() => {
                            setContainerId(String(c.id));
                            setComboOpen(false);
                          }}
                          className="flex items-center gap-2 py-2"
                        >
                          <Check
                            className={`h-3.5 w-3.5 shrink-0 ${containerId === String(c.id) ? "opacity-100" : "opacity-0"}`}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-mono font-medium text-sm">{c.containerNumber}</span>
                            <span className="text-xs text-muted-foreground flex gap-2">
                              {c.blNumber && <span>B/L: {c.blNumber}</span>}
                              {c.customerName && <span>· {c.customerName}</span>}
                            </span>
                          </div>
                          <span className="ml-auto font-mono text-xs text-muted-foreground shrink-0">
                            {formatCurrency(c.clearingCharges ?? 0)}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {available.length === 0 && !containersLoading && (
              <p className="text-xs text-muted-foreground mt-1.5">All containers are already on this invoice.</p>
            )}
          </div>

          {selected && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-1.5 text-sm">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pulled from container record</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Container #</span>
                <span className="font-mono font-medium">{selected.containerNumber}</span>
              </div>
              {selected.blNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">B/L Number</span>
                  <span className="font-mono text-muted-foreground">{selected.blNumber}</span>
                </div>
              )}
              {selected.customerName && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{selected.customerName}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1">
                <span className="text-muted-foreground">Clearing Charges</span>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(selected.clearingCharges ?? 0)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={addMutation.isPending || !containerId}>
              {addMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add to Invoice
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditItemDialog({
  open, onClose, invoiceId, item,
}: {
  open: boolean;
  onClose: () => void;
  invoiceId: number;
  item: InvoiceItem | null;
}) {
  const { toast } = useToast();
  const editMutation = useEditInvoiceItem();
  const [description, setDescription] = useState(item?.description ?? "");
  const [amount, setAmount] = useState<number>(item?.amount ?? 0);

  const handleClose = () => { onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    try {
      await editMutation.mutateAsync({ invoiceId, itemId: item.id, data: { description, amount } });
      toast({ title: "Line item updated" });
      handleClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update item";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary" />
            Edit Line Item
            {item.containerNumber && <span className="font-mono text-muted-foreground text-sm font-normal">· {item.containerNumber}</span>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div>
            <Label htmlFor="edit-desc">Description</Label>
            <Input
              id="edit-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Clearing Charges"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="edit-amount">Amount (₦)</Label>
            <Input
              id="edit-amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(parseFloat(e.target.value) || 0)}
              className="mt-1 font-mono"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
            <Button type="submit" disabled={editMutation.isPending}>
              {editMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Changes
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
  const sendWhatsAppMutation = useSendInvoiceWhatsApp();
  const sendReminderMutation = useSendInvoiceReminder();
  const sendReceiptMutation = useSendInvoiceReceipt();
  const removeItemMutation = useRemoveInvoiceItem();
  const writeOffMutation = useWriteOffInvoice();
  const { data: whatsappLog } = useGetInvoiceWhatsAppLog(isNaN(invoiceId) ? null : invoiceId);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [creditNoteOpen, setCreditNoteOpen] = useState(false);
  const [whatsappLogOpen, setWhatsappLogOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InvoiceItem | null>(null);

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

  const handleSendWhatsApp = async (type: "invoice" | "reminder") => {
    try {
      const fn = type === "invoice" ? sendWhatsAppMutation : sendReminderMutation;
      const result = await fn.mutateAsync(invoiceId);
      const preview = result.messageBody.split("\n").slice(0, 2).join(" · ").slice(0, 120);
      toast({
        title: type === "invoice" ? "Invoice sent via WhatsApp" : "Payment reminder sent via WhatsApp",
        description: preview,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send WhatsApp message";
      toast({ variant: "destructive", title: "WhatsApp error", description: msg });
    }
  };

  const handleRemoveItem = async (itemId: number) => {
    if (!confirm("Remove this line item from the invoice?")) return;
    try {
      await removeItemMutation.mutateAsync({ invoiceId, itemId });
      toast({ title: "Line item removed" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to remove item";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleSendReceipt = async () => {
    try {
      const result = await sendReceiptMutation.mutateAsync(invoiceId);
      const preview = result.messageBody.split("\n").slice(0, 2).join(" · ").slice(0, 120);
      toast({ title: "Payment receipt sent via WhatsApp", description: preview });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send receipt";
      toast({ variant: "destructive", title: "WhatsApp error", description: msg });
    }
  };

  const handleWriteOff = async () => {
    if (!confirm(`Write off invoice ${invoice?.invoiceNumber}? This will create a Bad Debt expense entry and mark the invoice as unrecoverable. This cannot be undone.`)) return;
    try {
      await writeOffMutation.mutateAsync({ invoiceId });
      toast({ title: "Invoice written off", description: "A Bad Debt expense entry has been created." });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to write off invoice";
      toast({ variant: "destructive", title: "Error", description: msg });
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
  const hasPhone = !!invoice.clientPhone;
  const waIsPending = sendWhatsAppMutation.isPending || sendReminderMutation.isPending || sendReceiptMutation.isPending;
  const isWrittenOff = invoice.status === "written_off";
  const canRaiseCreditNote = isAdmin && !isWrittenOff && invoice.status !== "draft" && invoice.outstanding > 0;
  const canWriteOff = isAdmin && !isWrittenOff && invoice.status !== "paid" && invoice.outstanding > 0;

  const regularPayments = (invoice.payments ?? []).filter(p => p.paymentMethod !== "credit_note");
  const creditNotePayments = (invoice.payments ?? []).filter(p => p.paymentMethod === "credit_note");

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

      {isWrittenOff && (
        <div className="bg-zinc-500/10 border border-zinc-500/30 rounded-lg p-4 flex items-center gap-3">
          <FileX className="w-5 h-5 text-zinc-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-zinc-300">This invoice has been written off as a bad debt.</p>
            <p className="text-xs text-muted-foreground mt-0.5">It is excluded from the active accounts receivable balance. A Bad Debt expense entry has been recorded.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {invoice.items && invoice.items.length > 0 ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-sm mb-2">
                  <Box className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground font-medium">Containers ({invoice.items.length})</span>
                  {isAdmin && !isWrittenOff && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto h-6 text-xs gap-1 px-2"
                      onClick={() => setAddItemOpen(true)}
                    >
                      <PlusCircle className="w-3 h-3" />
                      Add Container
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border/50">
                        <th className="text-left text-muted-foreground font-medium pb-1.5 pr-3">Container #</th>
                        <th className="text-left text-muted-foreground font-medium pb-1.5 pr-3">B/L Number</th>
                        <th className="text-left text-muted-foreground font-medium pb-1.5 pr-3">Description</th>
                        <th className="text-right text-muted-foreground font-medium pb-1.5">Amount</th>
                        {isAdmin && !isWrittenOff && <th className="pb-1.5 w-16" />}
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map(item => (
                        <tr key={item.id} className="border-b border-border/30 last:border-0">
                          <td className="py-2 pr-3">
                            {item.containerId ? (
                              <Link href={`/containers/${item.containerId}`}>
                                <span className="text-primary hover:underline font-mono">{item.containerNumber ?? `#${item.containerId}`}</span>
                              </Link>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-2 pr-3 font-mono text-muted-foreground">{item.blNumber ?? "—"}</td>
                          <td className="py-2 pr-3 text-foreground">{item.description}</td>
                          <td className="py-2 text-right font-mono font-semibold text-foreground">{formatCurrency(item.amount)}</td>
                          {isAdmin && !isWrittenOff && (
                            <td className="py-2 pl-2">
                              <div className="flex items-center gap-1 justify-end">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => setEditingItem(item)}
                                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit description or amount</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={() => handleRemoveItem(item.id)}
                                      disabled={removeItemMutation.isPending || invoice.items.length <= 1}
                                      className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {invoice.items.length <= 1 ? "Cannot remove the last line item" : "Remove container from invoice"}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <>
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
              </>
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
            {creditNotePayments.length > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground">Credit Notes Applied</span>
                <span className="text-cyan-400 font-semibold">
                  {formatCurrency(creditNotePayments.reduce((s, p) => s + p.amount, 0))}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground">Outstanding</span>
              <span className={`font-bold ${invoice.outstanding > 0 ? (isWrittenOff ? "text-zinc-400" : "text-amber-400") : "text-emerald-400"}`}>
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

      {!isWrittenOff && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setPaymentOpen(true)} className="gap-2">
            <PlusCircle className="w-4 h-4" />
            Record Payment
          </Button>

          {canRaiseCreditNote && (
            <Button
              variant="outline"
              className="gap-2 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
              onClick={() => setCreditNoteOpen(true)}
            >
              <ReceiptText className="w-4 h-4" />
              Raise Credit Note
            </Button>
          )}

          {isAdmin && invoice.outstanding > 0 && (
            <Button
              variant="outline"
              className="gap-2 border-blue-500/50 text-blue-400 hover:bg-blue-500/10"
              onClick={() => setDepositOpen(true)}
            >
              <CreditCard className="w-4 h-4" />
              Apply Deposit
            </Button>
          )}

          {isAdmin && invoice.outstanding > 0 && (
            <Button
              variant="outline"
              className="gap-2 border-violet-500/50 text-violet-400 hover:bg-violet-500/10"
              onClick={() => setCreditOpen(true)}
            >
              <Banknote className="w-4 h-4" />
              Apply Credit
            </Button>
          )}

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => window.open(`${window.location.pathname}/print`, "_blank")}
          >
            <Printer className="w-4 h-4" />
            Print Receipt
          </Button>

          {isAdmin && invoice.totalPaid > 0 && (
            hasPhone ? (
              <Button
                variant="outline"
                className="gap-2 border-teal-600 text-teal-500 hover:bg-teal-500/10"
                onClick={handleSendReceipt}
                disabled={waIsPending}
              >
                {sendReceiptMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Receipt className="w-4 h-4" />
                }
                Send Receipt
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" className="gap-2 border-teal-600/40 text-teal-500/40 cursor-not-allowed" disabled>
                      <Receipt className="w-4 h-4" />
                      Send Receipt
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Add a phone number to this client first</TooltipContent>
              </Tooltip>
            )
          )}

          {isAdmin && (
            hasPhone ? (
              <Button
                variant="outline"
                className="gap-2 border-green-600 text-green-500 hover:bg-green-500/10"
                onClick={() => handleSendWhatsApp("invoice")}
                disabled={waIsPending}
              >
                {sendWhatsAppMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <MessageCircle className="w-4 h-4" />
                }
                Send Invoice
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" className="gap-2 border-green-600/40 text-green-500/40 cursor-not-allowed" disabled>
                      <MessageCircle className="w-4 h-4" />
                      Send Invoice
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Add a phone number to this client first</TooltipContent>
              </Tooltip>
            )
          )}

          {isAdmin && invoice.outstanding > 0 && (
            hasPhone ? (
              <Button
                variant="outline"
                className="gap-2 border-amber-600 text-amber-500 hover:bg-amber-500/10"
                onClick={() => handleSendWhatsApp("reminder")}
                disabled={waIsPending}
              >
                {sendReminderMutation.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Bell className="w-4 h-4" />
                }
                Send Reminder
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="outline" className="gap-2 border-amber-600/40 text-amber-500/40 cursor-not-allowed" disabled>
                      <Bell className="w-4 h-4" />
                      Send Reminder
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Add a phone number to this client first</TooltipContent>
              </Tooltip>
            )
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

          {canWriteOff && (
            <Button
              variant="outline"
              className="gap-2 border-zinc-500/60 text-zinc-400 hover:bg-zinc-500/10"
              onClick={handleWriteOff}
              disabled={writeOffMutation.isPending}
            >
              {writeOffMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileX className="w-4 h-4" />}
              Write Off
            </Button>
          )}
        </div>
      )}

      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Payment History
            {regularPayments.length > 0 && (
              <Badge variant="secondary" className="ml-1">{regularPayments.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {regularPayments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CreditCard className="w-8 h-8 mx-auto opacity-30 mb-2" />
              <p className="text-sm">No payments recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {regularPayments.map(payment => (
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

      {(invoice.creditNotes ?? []).length > 0 && (
        <Card className="border-cyan-500/30 bg-cyan-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-cyan-400 flex items-center gap-2">
              <ReceiptText className="w-4 h-4" />
              Credit Notes
              <Badge variant="secondary" className="ml-1">{invoice.creditNotes.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {invoice.creditNotes.map((cn: CreditNote) => (
                <div
                  key={cn.id}
                  className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20"
                >
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                    <ReceiptText className="w-3.5 h-3.5 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-semibold text-cyan-400">{cn.creditNoteNumber}</span>
                      <span className="text-sm font-semibold text-foreground">{formatCurrency(cn.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(cn.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                      {cn.reason && (
                        <span className="text-xs text-muted-foreground">· {cn.reason}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(whatsappLog && whatsappLog.length > 0) && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 cursor-pointer" onClick={() => setWhatsappLogOpen(o => !o)}>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-green-500" />
              WhatsApp Messages
              <Badge variant="secondary" className="ml-1">{whatsappLog.length}</Badge>
              <span className="ml-auto text-muted-foreground">
                {whatsappLogOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </CardTitle>
          </CardHeader>
          {whatsappLogOpen && (
            <CardContent>
              <div className="space-y-2">
                {whatsappLog.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-muted/30 border border-border/30"
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${entry.messageType === "reminder" ? "bg-amber-500/20" : entry.messageType === "receipt" ? "bg-teal-500/20" : "bg-green-500/20"}`}>
                      {entry.messageType === "reminder"
                        ? <Bell className="w-3.5 h-3.5 text-amber-400" />
                        : entry.messageType === "receipt"
                          ? <Receipt className="w-3.5 h-3.5 text-teal-400" />
                          : <MessageCircle className="w-3.5 h-3.5 text-green-400" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant="secondary"
                          className={`text-xs capitalize ${entry.messageType === "reminder" ? "text-amber-400" : entry.messageType === "receipt" ? "text-teal-400" : "text-green-400"}`}
                        >
                          {entry.messageType === "reminder" ? "Reminder" : entry.messageType === "receipt" ? "Receipt" : "Invoice"}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono">{entry.phone}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${entry.status === "sent" ? "border-green-600 text-green-500" : "border-red-600 text-red-500"}`}
                        >
                          {entry.status === "sent" ? "Sent" : "Failed"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">
                        {entry.messageBody.split("\n").slice(0, 3).join(" · ")}
                      </p>
                      <span className="text-xs text-muted-foreground mt-0.5 block">
                        {new Date(entry.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <RecordPaymentDialog
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        invoiceId={invoiceId}
      />

      {invoice.clientId != null && (
        <ApplyDepositDialog
          open={depositOpen}
          onClose={() => setDepositOpen(false)}
          invoiceId={invoiceId}
          clientId={invoice.clientId}
          invoiceOutstanding={invoice.outstanding}
        />
      )}

      {invoice.clientId != null && (
        <ApplyCreditDialog
          open={creditOpen}
          onClose={() => setCreditOpen(false)}
          invoiceId={invoiceId}
          clientId={invoice.clientId}
          invoiceOutstanding={invoice.outstanding}
        />
      )}

      <RaiseCreditNoteDialog
        open={creditNoteOpen}
        onClose={() => setCreditNoteOpen(false)}
        invoiceId={invoiceId}
        outstanding={invoice.outstanding}
      />

      <AddItemDialog
        open={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        invoiceId={invoiceId}
        existingContainerIds={invoice.items.filter(it => it.containerId != null).map(it => it.containerId!)}
      />

      <EditItemDialog
        open={!!editingItem}
        onClose={() => setEditingItem(null)}
        invoiceId={invoiceId}
        item={editingItem}
      />
    </div>
  );
}
