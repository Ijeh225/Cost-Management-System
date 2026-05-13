import { useState } from "react";
import {
  useListBanks, useCreateBank, useUpdateBank, useDeleteBank,
  useListBankTransfers, useCreateBankTransfer, useCreateBankFundAddition,
  type Bank, type BankTransfer,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "wouter";
import { BranchChip } from "@/components/layout/branch-chip";
import {
  Landmark, Plus, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight, Building2,
  ArrowLeftRight, ArrowRight, User, Calendar, FileText, PlusCircle,
} from "lucide-react";

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Bank Form Dialog ────────────────────────────────────────────────────────

type BankFormState = { name: string; accountNumber: string; bankCode: string };
const EMPTY_FORM: BankFormState = { name: "", accountNumber: "", bankCode: "" };

function BankFormDialog({
  open, onOpenChange, initial, onSave, isPending, title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: BankFormState;
  onSave: (data: BankFormState) => void;
  isPending: boolean;
  title: string;
}) {
  const [form, setForm] = useState<BankFormState>(initial);
  const set = (k: keyof BankFormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleOpen = (v: boolean) => {
    if (v) setForm(initial);
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Bank Name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. Zenith Bank" value={form.name} onChange={set("name")} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="e.g. 1234567890" value={form.accountNumber} onChange={set("accountNumber")} />
          </div>
          <div className="space-y-1.5">
            <Label>Bank Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="e.g. 057" value={form.bankCode} onChange={set("bankCode")} />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={isPending || !form.name.trim()}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save Bank
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Transfer Dialog ─────────────────────────────────────────────────────────

function TransferDialog({
  open, onOpenChange, banks,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  banks: Bank[];
}) {
  const { toast } = useToast();
  const createTransfer = useCreateBankTransfer();
  const [form, setForm] = useState({ fromBankId: "", toBankId: "", amount: "", narration: "", reference: "" });

  const handleOpen = (v: boolean) => {
    if (!v) setForm({ fromBankId: "", toBankId: "", amount: "", narration: "", reference: "" });
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    const fromId = parseInt(form.fromBankId);
    const toId = parseInt(form.toBankId);
    const amt = parseFloat(form.amount);

    if (!form.fromBankId) { toast({ variant: "destructive", title: "Select a source bank" }); return; }
    if (!form.toBankId) { toast({ variant: "destructive", title: "Select a destination bank" }); return; }
    if (fromId === toId) { toast({ variant: "destructive", title: "Source and destination must be different" }); return; }
    if (!form.amount || isNaN(amt) || amt <= 0) { toast({ variant: "destructive", title: "Enter a valid amount" }); return; }

    try {
      await createTransfer.mutateAsync({
        fromBankId: fromId,
        toBankId: toId,
        amount: amt,
        narration: form.narration || undefined,
        reference: form.reference || undefined,
      });
      toast({ title: "Transfer recorded successfully" });
      handleOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Transfer failed", description: e?.message ?? "Unknown error" });
    }
  };

  const activeBanks = banks.filter(b => b.isActive);

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="w-4 h-4 text-primary" />
            Record Internal Transfer
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>From Bank <span className="text-destructive">*</span></Label>
            <Select value={form.fromBankId} onValueChange={v => setForm(f => ({ ...f, fromBankId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select source bank..." />
              </SelectTrigger>
              <SelectContent>
                {activeBanks.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.name}{b.accountNumber ? ` — ${b.accountNumber}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>To Bank <span className="text-destructive">*</span></Label>
            <Select value={form.toBankId} onValueChange={v => setForm(f => ({ ...f, toBankId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select destination bank..." />
              </SelectTrigger>
              <SelectContent>
                {activeBanks
                  .filter(b => String(b.id) !== form.fromBankId)
                  .map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>
                      {b.name}{b.accountNumber ? ` — ${b.accountNumber}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Amount (₦) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="font-mono"
            />
            {form.amount && !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) > 0 && (
              <p className="text-xs text-muted-foreground font-mono">= {formatCurrency(parseFloat(form.amount))}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Narration <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              placeholder="Reason for transfer..."
              value={form.narration}
              onChange={e => setForm(f => ({ ...f, narration: e.target.value }))}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              placeholder="e.g. TRF-2024-001"
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={createTransfer.isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createTransfer.isPending}>
            {createTransfer.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Record Transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Funds Dialog ─────────────────────────────────────────────────────────

function AddFundsDialog({
  bank, open, onOpenChange,
}: {
  bank: Bank | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const addFunds = useCreateBankFundAddition();
  const [form, setForm] = useState({ amount: "", narration: "", reference: "" });

  const handleOpen = (v: boolean) => {
    if (!v) setForm({ amount: "", narration: "", reference: "" });
    onOpenChange(v);
  };

  const handleSubmit = async () => {
    if (!bank) return;
    const amt = parseFloat(form.amount);
    if (!form.amount || isNaN(amt) || amt <= 0) {
      toast({ variant: "destructive", title: "Enter a valid amount" });
      return;
    }
    try {
      await addFunds.mutateAsync({
        bankId: bank.id,
        data: { amount: amt, narration: form.narration || undefined, reference: form.reference || undefined },
      });
      toast({ title: `₦${amt.toLocaleString()} added to ${bank.name}` });
      handleOpen(false);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Failed to add funds", description: e?.message ?? "Unknown error" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-emerald-400" />
            Add Funds — {bank?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>Amount (₦) <span className="text-destructive">*</span></Label>
            <Input
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="font-mono"
              autoFocus
            />
            {form.amount && !isNaN(parseFloat(form.amount)) && parseFloat(form.amount) > 0 && (
              <p className="text-xs text-muted-foreground font-mono">= {formatCurrency(parseFloat(form.amount))}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Narration <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea
              placeholder="e.g. Opening balance, Cash lodgement..."
              value={form.narration}
              onChange={e => setForm(f => ({ ...f, narration: e.target.value }))}
              rows={2}
              className="resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Reference <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              placeholder="e.g. DEPO-001"
              value={form.reference}
              onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => handleOpen(false)} disabled={addFunds.isPending}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={addFunds.isPending}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {addFunds.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Add Funds
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bank Card ───────────────────────────────────────────────────────────────

function BankCard({
  bank, onEdit, onToggle, onDelete, onAddFunds,
}: {
  bank: Bank;
  onEdit: (b: Bank) => void;
  onToggle: (b: Bank) => void;
  onDelete: (b: Bank) => void;
  onAddFunds: (b: Bank) => void;
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
      <Card className={`border-border/40 bg-card/40 backdrop-blur-sm transition-all ${!bank.isActive ? "opacity-50" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate flex items-center">{bank.name}<BranchChip branchId={(bank as { branchId?: number }).branchId} /></p>
                  {bank.isActive
                    ? <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Active</Badge>
                    : <Badge className="text-[10px] px-1.5 py-0 bg-muted/60 text-muted-foreground border-border/40">Inactive</Badge>
                  }
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {bank.accountNumber && <p className="text-xs text-muted-foreground font-mono">{bank.accountNumber}</p>}
                  {bank.bankCode && <p className="text-xs text-muted-foreground">Code: {bank.bankCode}</p>}
                  {!bank.accountNumber && !bank.bankCode && <p className="text-xs text-muted-foreground italic">No account details</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {bank.isActive && (
                <Button
                  variant="ghost" size="icon"
                  className="w-8 h-8 text-emerald-500 hover:text-emerald-400"
                  onClick={() => onAddFunds(bank)}
                  title="Add Funds"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                </Button>
              )}
              <Link href={`/banks/${bank.id}`}>
                <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" title="View Statement">
                  <FileText className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground" onClick={() => onEdit(bank)} title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                className={`w-8 h-8 ${bank.isActive ? "text-amber-400 hover:text-amber-300" : "text-emerald-400 hover:text-emerald-300"}`}
                onClick={() => onToggle(bank)}
                title={bank.isActive ? "Disable" : "Enable"}
              >
                {bank.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-destructive/60 hover:text-destructive" onClick={() => onDelete(bank)} title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Transfer Row ─────────────────────────────────────────────────────────────

function TransferRow({ transfer }: { transfer: BankTransfer }) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-4 h-4 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground truncate">{transfer.fromBankName ?? "—"}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground truncate">{transfer.toBankName ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {transfer.narration && (
                    <p className="text-xs text-muted-foreground truncate max-w-[240px]">{transfer.narration}</p>
                  )}
                  {transfer.reference && (
                    <p className="text-xs font-mono text-muted-foreground">Ref: {transfer.reference}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {transfer.createdByName && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="w-3 h-3" /> {transfer.createdByName}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3" /> {formatDate(transfer.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono font-semibold text-foreground">{formatCurrency(transfer.amount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BanksPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: banks = [], isLoading: banksLoading } = useListBanks();
  const { data: transfers = [], isLoading: transfersLoading } = useListBankTransfers();
  const createBank = useCreateBank();
  const updateBank = useUpdateBank();
  const deleteBank = useDeleteBank();

  const [tab, setTab] = useState<"banks" | "transfers">("banks");
  const [createOpen, setCreateOpen] = useState(false);
  const [editBank, setEditBank] = useState<Bank | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bank | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [addFundsTarget, setAddFundsTarget] = useState<Bank | null>(null);

  const handleCreate = (form: BankFormState) => {
    createBank.mutate(
      { name: form.name, accountNumber: form.accountNumber || undefined, bankCode: form.bankCode || undefined },
      {
        onSuccess: () => { toast({ title: `${form.name} added successfully` }); setCreateOpen(false); },
        onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleEdit = (form: BankFormState) => {
    if (!editBank) return;
    updateBank.mutate(
      { id: editBank.id, data: { name: form.name, accountNumber: form.accountNumber || undefined, bankCode: form.bankCode || undefined } },
      {
        onSuccess: () => { toast({ title: "Bank updated" }); setEditBank(null); },
        onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleToggle = (bank: Bank) => {
    updateBank.mutate(
      { id: bank.id, data: { isActive: !bank.isActive } },
      {
        onSuccess: () => toast({ title: `${bank.name} ${bank.isActive ? "disabled" : "enabled"}` }),
        onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteBank.mutate(deleteTarget.id, {
      onSuccess: () => { toast({ title: `${deleteTarget.name} deleted` }); setDeleteTarget(null); },
      onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
    });
  };

  const active = banks.filter(b => b.isActive);
  const inactive = banks.filter(b => !b.isActive);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Bank Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage company bank accounts and internal transfers
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            {tab === "banks" && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Bank
              </Button>
            )}
            {tab === "transfers" && (
              <Button onClick={() => setTransferOpen(true)} disabled={banks.filter(b => b.isActive).length < 2}>
                <ArrowLeftRight className="w-4 h-4 mr-2" />
                New Transfer
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/40 border border-border/40 w-fit">
        {(["banks", "transfers"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              tab === t
                ? "bg-background text-foreground shadow-sm border border-border/40"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "banks" ? `Banks (${banks.length})` : `Transfers (${transfers.length})`}
          </button>
        ))}
      </div>

      {/* Banks Tab */}
      {tab === "banks" && (
        banksLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : banks.length === 0 ? (
          <Card className="border-border/40 bg-card/40">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted/40 border border-border/40 flex items-center justify-center">
                <Building2 className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">No banks added yet</p>
                <p className="text-sm text-muted-foreground mt-1">Add your company bank accounts to get started</p>
              </div>
              {isAdmin && (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" /> Add First Bank
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {active.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Active Banks ({active.length})
                </p>
                <AnimatePresence mode="popLayout">
                  {active.map(bank => (
                    <BankCard key={bank.id} bank={bank} onEdit={setEditBank} onToggle={handleToggle} onDelete={setDeleteTarget} onAddFunds={setAddFundsTarget} />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {inactive.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
                  Inactive Banks ({inactive.length})
                </p>
                <AnimatePresence mode="popLayout">
                  {inactive.map(bank => (
                    <BankCard key={bank.id} bank={bank} onEdit={setEditBank} onToggle={handleToggle} onDelete={setDeleteTarget} onAddFunds={setAddFundsTarget} />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )
      )}

      {/* Transfers Tab */}
      {tab === "transfers" && (
        transfersLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : transfers.length === 0 ? (
          <Card className="border-border/40 bg-card/40">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
              <div className="w-14 h-14 rounded-2xl bg-muted/40 border border-border/40 flex items-center justify-center">
                <ArrowLeftRight className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-medium text-foreground">No transfers recorded yet</p>
                <p className="text-sm text-muted-foreground mt-1">Record movements between company bank accounts</p>
              </div>
              {isAdmin && banks.filter(b => b.isActive).length >= 2 && (
                <Button onClick={() => setTransferOpen(true)}>
                  <ArrowLeftRight className="w-4 h-4 mr-2" /> Record First Transfer
                </Button>
              )}
              {isAdmin && banks.filter(b => b.isActive).length < 2 && (
                <p className="text-xs text-muted-foreground">You need at least 2 active banks to record a transfer.</p>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              All Transfers ({transfers.length})
            </p>
            <AnimatePresence>
              {transfers.map(t => <TransferRow key={t.id} transfer={t} />)}
            </AnimatePresence>
          </div>
        )
      )}

      {/* Dialogs */}
      <BankFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        initial={EMPTY_FORM}
        onSave={handleCreate}
        isPending={createBank.isPending}
        title="Add New Bank"
      />

      {editBank && (
        <BankFormDialog
          open={!!editBank}
          onOpenChange={(v) => { if (!v) setEditBank(null); }}
          initial={{ name: editBank.name, accountNumber: editBank.accountNumber ?? "", bankCode: editBank.bankCode ?? "" }}
          onSave={handleEdit}
          isPending={updateBank.isPending}
          title={`Edit — ${editBank.name}`}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the bank from the system. This action cannot be undone.
              Consider disabling it instead to preserve existing records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleteBank.isPending}
            >
              {deleteBank.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} banks={banks} />

      <AddFundsDialog
        bank={addFundsTarget}
        open={!!addFundsTarget}
        onOpenChange={(v) => { if (!v) setAddFundsTarget(null); }}
      />
    </div>
  );
}
