import { useState } from "react";
import { useGetOverheadExpenses, useCreateOverheadExpense, useUpdateOverheadExpense, useDeleteOverheadExpense, OVERHEAD_CATEGORIES, type OverheadExpense } from "@workspace/api-client-react";
import { useListBanks } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Pencil, Trash2, Receipt, TrendingDown, Calendar, Filter } from "lucide-react";
import { formatCurrency } from "@/lib/format";

const CATEGORY_COLORS: Record<string, string> = {
  "Salaries":     "border-blue-500/30 text-blue-400 bg-blue-500/10",
  "Office Rent":  "border-purple-500/30 text-purple-400 bg-purple-500/10",
  "Fuel":         "border-orange-500/30 text-orange-400 bg-orange-500/10",
  "Bank Charges": "border-red-500/30 text-red-400 bg-red-500/10",
  "Utilities":    "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
  "Maintenance":  "border-teal-500/30 text-teal-400 bg-teal-500/10",
  "Other":        "border-gray-500/30 text-gray-400 bg-gray-500/10",
};

type ExpenseFormValues = {
  category: string;
  description: string;
  amount: number;
  bankId: string;
  paidAt: string;
  reference: string;
};

function ExpenseFormDialog({
  open,
  onOpenChange,
  defaultValues,
  onSubmit,
  isPending,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultValues?: Partial<ExpenseFormValues>;
  onSubmit: (data: ExpenseFormValues) => void;
  isPending: boolean;
  title: string;
}) {
  const { data: banks } = useListBanks();
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ExpenseFormValues>({
    defaultValues: {
      category: defaultValues?.category ?? "Other",
      description: defaultValues?.description ?? "",
      amount: defaultValues?.amount ?? 0,
      bankId: defaultValues?.bankId ?? "",
      paidAt: defaultValues?.paidAt ?? new Date().toISOString().slice(0, 10),
      reference: defaultValues?.reference ?? "",
    },
  });

  useEffect(() => {
    if (open) {
      reset({
        category: defaultValues?.category ?? "Other",
        description: defaultValues?.description ?? "",
        amount: defaultValues?.amount ?? 0,
        bankId: defaultValues?.bankId ?? "",
        paidAt: defaultValues?.paidAt ?? new Date().toISOString().slice(0, 10),
        reference: defaultValues?.reference ?? "",
      });
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Controller name="category" control={control} rules={{ required: true }} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERHEAD_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Input {...register("description", { required: true })} placeholder="Brief description of the expense" />
            {errors.description && <p className="text-xs text-destructive">Description is required</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amount (₦)</Label>
              <Input type="number" step="0.01" min="0" {...register("amount", { required: true, valueAsNumber: true, min: 0.01 })} placeholder="0.00" />
              {errors.amount && <p className="text-xs text-destructive">Valid amount required</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date Paid</Label>
              <Input type="date" {...register("paidAt", { required: true })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Bank Account <span className="text-muted-foreground/50">(optional)</span></Label>
            <Controller name="bankId" control={control} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger><SelectValue placeholder="No bank selected" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No bank</SelectItem>
                  {(banks ?? []).map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Reference / Notes <span className="text-muted-foreground/50">(optional)</span></Label>
            <Input {...register("reference")} placeholder="Voucher number, notes, etc." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Expense
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OverheadExpensesPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OverheadExpense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  useEffect(() => { if (!isAdmin) setLocation("/"); }, [isAdmin]);
  if (!isAdmin) return null;

  const { data, isLoading } = useGetOverheadExpenses({
    category: filterCategory !== "all" ? filterCategory : undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
  });

  const createMutation = useCreateOverheadExpense();
  const updateMutation = useUpdateOverheadExpense();
  const deleteMutation = useDeleteOverheadExpense();

  const handleCreate = (values: ExpenseFormValues) => {
    createMutation.mutate({
      category: values.category,
      description: values.description,
      amount: values.amount,
      bankId: values.bankId && values.bankId !== "none" ? Number(values.bankId) : null,
      paidAt: values.paidAt,
      reference: values.reference || undefined,
    }, {
      onSuccess: () => { toast({ title: "Expense recorded." }); setCreateOpen(false); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const handleUpdate = (values: ExpenseFormValues) => {
    if (!editTarget) return;
    updateMutation.mutate({
      id: editTarget.id,
      data: {
        category: values.category,
        description: values.description,
        amount: values.amount,
        bankId: values.bankId && values.bankId !== "none" ? Number(values.bankId) : null,
        paidAt: values.paidAt,
        reference: values.reference || undefined,
      },
    }, {
      onSuccess: () => { toast({ title: "Expense updated." }); setEditTarget(null); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => { toast({ title: "Expense deleted." }); setDeleteId(null); },
      onError: (err) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const expenses = data?.expenses ?? [];
  const totalThisMonth = data?.totalThisMonth ?? 0;
  const totalThisYear = data?.totalThisYear ?? 0;
  const byCategory = data?.byCategory ?? {};

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Overhead Expenses</h1>
            <p className="text-sm text-muted-foreground">Track operational costs: salaries, rent, fuel, and more</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" /> Record Expense
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border/50 bg-card/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">This Month</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{formatCurrency(totalThisMonth)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">This Year</p>
            <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(totalThisYear)}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-card/40">
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground mb-2">By Category</p>
            <div className="space-y-1">
              {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amt]) => (
                <div key={cat} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate">{cat}</span>
                  <span className="font-medium text-foreground/80">{formatCurrency(amt)}</span>
                </div>
              ))}
              {Object.keys(byCategory).length === 0 && <p className="text-xs text-muted-foreground/50">No data yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 bg-card/40">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-44 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {OVERHEAD_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="w-3.5 h-3.5" />
              <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-xs w-36" placeholder="From" />
              <span>–</span>
              <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-xs w-36" placeholder="To" />
              {(filterFrom || filterTo) && (
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setFilterFrom(""); setFilterTo(""); }}>Clear</Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Receipt className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No expenses recorded yet.</p>
              <p className="text-xs text-muted-foreground/60">Click "Record Expense" to add your first entry.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-2 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <span>Description</span>
                <span>Category</span>
                <span>Date</span>
                <span className="text-right">Amount</span>
                <span />
              </div>
              {expenses.map(e => (
                <div key={e.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-3 items-center hover:bg-accent/20 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{e.description}</p>
                    {(e.bankName || e.reference) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[e.bankName, e.reference].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <Badge variant="outline" className={`text-[10px] font-medium shrink-0 ${CATEGORY_COLORS[e.category] ?? CATEGORY_COLORS["Other"]}`}>
                    {e.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                  <span className="text-sm font-semibold text-red-400 text-right whitespace-nowrap">
                    {formatCurrency(e.amount)}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditTarget(e)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(e.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ExpenseFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        title="Record Overhead Expense"
      />

      {editTarget && (
        <ExpenseFormDialog
          open={!!editTarget}
          onOpenChange={(v) => { if (!v) setEditTarget(null); }}
          defaultValues={{
            category: editTarget.category,
            description: editTarget.description,
            amount: editTarget.amount,
            bankId: editTarget.bankId ? String(editTarget.bankId) : "",
            paidAt: editTarget.paidAt ? editTarget.paidAt.slice(0, 10) : "",
            reference: editTarget.reference ?? "",
          }}
          onSubmit={handleUpdate}
          isPending={updateMutation.isPending}
          title="Edit Expense"
        />
      )}

      <Dialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent className="border-border/50 bg-card/95 max-w-sm">
          <DialogHeader><DialogTitle>Delete Expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteId && handleDelete(deleteId)}>
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
