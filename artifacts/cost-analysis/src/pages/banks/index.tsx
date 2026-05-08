import { useState } from "react";
import { useListBanks, useCreateBank, useUpdateBank, useDeleteBank, type Bank } from "@workspace/api-client-react";
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
  Landmark, Plus, Pencil, Trash2, Loader2, ToggleLeft, ToggleRight, Building2,
} from "lucide-react";

type BankFormState = { name: string; accountNumber: string; bankCode: string };
const EMPTY_FORM: BankFormState = { name: "", accountNumber: "", bankCode: "" };

function BankFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  isPending,
  title,
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
            <Input
              placeholder="e.g. Zenith Bank"
              value={form.name}
              onChange={set("name")}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              placeholder="e.g. 1234567890"
              value={form.accountNumber}
              onChange={set("accountNumber")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bank Code <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              placeholder="e.g. 057"
              value={form.bankCode}
              onChange={set("bankCode")}
            />
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

function BankCard({
  bank,
  onEdit,
  onToggle,
  onDelete,
}: {
  bank: Bank;
  onEdit: (b: Bank) => void;
  onToggle: (b: Bank) => void;
  onDelete: (b: Bank) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <Card className={`border-border/40 bg-card/40 backdrop-blur-sm transition-all ${!bank.isActive ? "opacity-50" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                <Landmark className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-foreground truncate">{bank.name}</p>
                  {bank.isActive
                    ? <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Active</Badge>
                    : <Badge className="text-[10px] px-1.5 py-0 bg-muted/60 text-muted-foreground border-border/40">Inactive</Badge>
                  }
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {bank.accountNumber && (
                    <p className="text-xs text-muted-foreground font-mono">{bank.accountNumber}</p>
                  )}
                  {bank.bankCode && (
                    <p className="text-xs text-muted-foreground">Code: {bank.bankCode}</p>
                  )}
                  {!bank.accountNumber && !bank.bankCode && (
                    <p className="text-xs text-muted-foreground italic">No account details</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-muted-foreground hover:text-foreground"
                onClick={() => onEdit(bank)}
                title="Edit"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={`w-8 h-8 ${bank.isActive ? "text-amber-400 hover:text-amber-300" : "text-emerald-400 hover:text-emerald-300"}`}
                onClick={() => onToggle(bank)}
                title={bank.isActive ? "Disable" : "Enable"}
              >
                {bank.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="w-8 h-8 text-destructive/60 hover:text-destructive"
                onClick={() => onDelete(bank)}
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function BanksPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const { data: banks = [], isLoading } = useListBanks();
  const createBank = useCreateBank();
  const updateBank = useUpdateBank();
  const deleteBank = useDeleteBank();

  const [createOpen, setCreateOpen] = useState(false);
  const [editBank, setEditBank] = useState<Bank | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Bank | null>(null);

  const handleCreate = (form: BankFormState) => {
    createBank.mutate(
      { name: form.name, accountNumber: form.accountNumber || undefined, bankCode: form.bankCode || undefined },
      {
        onSuccess: () => {
          toast({ title: `${form.name} added successfully` });
          setCreateOpen(false);
        },
        onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  const handleEdit = (form: BankFormState) => {
    if (!editBank) return;
    updateBank.mutate(
      { id: editBank.id, data: { name: form.name, accountNumber: form.accountNumber || undefined, bankCode: form.bankCode || undefined } },
      {
        onSuccess: () => {
          toast({ title: "Bank updated" });
          setEditBank(null);
        },
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
      onSuccess: () => {
        toast({ title: `${deleteTarget.name} deleted` });
        setDeleteTarget(null);
      },
      onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
    });
  };

  const active = banks.filter(b => b.isActive);
  const inactive = banks.filter(b => !b.isActive);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Landmark className="w-6 h-6 text-primary" />
            Bank Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage company bank accounts used across the system
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)} className="shrink-0">
            <Plus className="w-4 h-4 mr-2" />
            Add Bank
          </Button>
        )}
      </div>

      {isLoading ? (
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
                <Plus className="w-4 h-4 mr-2" />
                Add First Bank
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
                  <BankCard key={bank.id} bank={bank} onEdit={setEditBank} onToggle={handleToggle} onDelete={setDeleteTarget} />
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
                  <BankCard key={bank.id} bank={bank} onEdit={setEditBank} onToggle={handleToggle} onDelete={setDeleteTarget} />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
