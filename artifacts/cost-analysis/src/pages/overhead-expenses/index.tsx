import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useBranchScope } from "@/components/layout/branch-provider";
import {
  useGetOverheadExpenses, useCreateOverheadExpense, useUpdateOverheadExpense,
  useDeleteOverheadExpense, useCreateExpensePayment, useGetExpenseCategories,
  useCreateExpenseCategory, useUpdateExpenseCategory, useDeleteExpenseCategory,
  useCreateOverheadExpenseTopup, useScheduleOverheadExpensePayment, usePayPaymentSchedule,
  type OverheadExpense, type ExpenseCategory, type OverheadExpensePaymentSchedule,
} from "@workspace/api-client-react";
import { useListBanks } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useForm, Controller } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Plus, Pencil, Trash2, Receipt, TrendingDown, Filter,
  CreditCard, Banknote, ChevronDown, ChevronRight, Lock, Tag,
  Search, WalletCards, CalendarClock,
} from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { BranchChip } from "@/components/layout/branch-chip";

const STATUS_COLORS: Record<string, string> = {
  unpaid:  "border-red-500/30 text-red-400 bg-red-500/10",
  partial: "border-amber-500/30 text-amber-400 bg-amber-500/10",
  paid:    "border-green-500/30 text-green-400 bg-green-500/10",
};
const STATUS_LABELS: Record<string, string> = {
  unpaid: "Unpaid", partial: "Partial", paid: "Paid",
};

const SCHEDULE_STATUS_LABELS: Record<string, string> = {
  pending_approval: "Pending MD Approval",
  partially_approved: "Partially Approved",
  approved: "Approved",
  paid: "Partially Paid",
  completed: "Paid",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const SCHEDULE_STATUS_COLORS: Record<string, string> = {
  pending_approval: "border-amber-500/30 text-amber-500 bg-amber-500/10",
  partially_approved: "border-blue-500/30 text-blue-500 bg-blue-500/10",
  approved: "border-emerald-500/30 text-emerald-500 bg-emerald-500/10",
  paid: "border-green-500/30 text-green-500 bg-green-500/10",
  completed: "border-slate-500/30 text-slate-500 bg-slate-500/10",
  rejected: "border-red-500/30 text-red-500 bg-red-500/10",
  cancelled: "border-zinc-500/30 text-zinc-500 bg-zinc-500/10",
};

function scheduleDisplayLabel(schedule: { status: string; amountApproved: number; amountPaid: number }) {
  const pendingApproved = Math.max(0, schedule.amountApproved - schedule.amountPaid);
  if (["approved", "partially_approved"].includes(schedule.status) && pendingApproved > 0) {
    return `Approved ${formatCurrency(pendingApproved)} - Awaiting Payment`;
  }
  return SCHEDULE_STATUS_LABELS[schedule.status] ?? schedule.status.replace(/_/g, " ");
}

function getPayableSchedule(expense: OverheadExpense) {
  return expense.paymentSchedules.find(s =>
    ["approved", "partially_approved", "paid"].includes(s.status) &&
    Math.max(0, s.amountApproved - s.amountPaid) > 0
  ) ?? null;
}

const CATEGORY_PALETTE = [
  "border-blue-500/30 text-blue-400 bg-blue-500/10",
  "border-purple-500/30 text-purple-400 bg-purple-500/10",
  "border-orange-500/30 text-orange-400 bg-orange-500/10",
  "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
  "border-teal-500/30 text-teal-400 bg-teal-500/10",
  "border-indigo-500/30 text-indigo-400 bg-indigo-500/10",
  "border-pink-500/30 text-pink-400 bg-pink-500/10",
  "border-gray-500/30 text-gray-400 bg-gray-500/10",
];
function catColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return CATEGORY_PALETTE[Math.abs(h) % CATEGORY_PALETTE.length];
}

type ExpenseFormValues = { category: string; description: string; amount: number; reference: string };
type PaymentFormValues = { amount: number; paymentMethod: "cash" | "bank"; bankId: string; paidAt: string; notes: string };
type TopupFormValues = { amount: number; description: string };
type SchedulePaymentFormValues = { amountRequested: number; scheduleDate: string; priority: "low" | "normal" | "urgent"; vendorBeneficiary: string; description: string; clientName: string };
type ApprovedPaymentFormValues = { paymentMethod: "cash" | "bank"; bankId: string; notes: string };
type ApprovedPaymentTarget = { expense: OverheadExpense; schedule: OverheadExpensePaymentSchedule };

function ExpenseForm({ categories, defaultValues, onSubmit, onCancel, isPending, submitLabel }: {
  categories: ExpenseCategory[];
  defaultValues?: Partial<ExpenseFormValues>;
  onSubmit: (v: ExpenseFormValues) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<ExpenseFormValues>({
    defaultValues: { category: defaultValues?.category ?? (categories[0]?.name ?? "Other"), description: defaultValues?.description ?? "", amount: defaultValues?.amount ?? 0, reference: defaultValues?.reference ?? "" },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Category</Label>
        <Controller name="category" control={control} rules={{ required: true }} render={({ field }) => (
          <Select onValueChange={field.onChange} value={field.value}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        )} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Description</Label>
        <Input {...register("description", { required: true })} placeholder="Brief description of expense" />
        {errors.description && <p className="text-xs text-destructive">Required</p>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Total Amount (₦)</Label>
        <Input type="number" step="0.01" min="0" {...register("amount", { required: true, valueAsNumber: true, min: 0.01 })} placeholder="0.00" />
        {errors.amount && <p className="text-xs text-destructive">Valid amount required</p>}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Reference / Notes <span className="text-muted-foreground/50">(optional)</span></Label>
        <Input {...register("reference")} placeholder="Voucher number, notes, etc." />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}

function MakePaymentDialog({ expense, onOpenChange, onSubmit, isPending }: {
  expense: OverheadExpense | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: PaymentFormValues) => void;
  isPending: boolean;
}) {
  const { data: banks } = useListBanks();
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<PaymentFormValues>({
    defaultValues: { amount: 0, paymentMethod: "bank", bankId: "", paidAt: new Date().toISOString().slice(0, 10), notes: "" },
  });
  const paymentMethod = watch("paymentMethod");
  useEffect(() => {
    if (expense) reset({ amount: Number(expense.balance.toFixed(2)), paymentMethod: "bank", bankId: "", paidAt: new Date().toISOString().slice(0, 10), notes: "" });
  }, [expense?.id]);

  if (!expense) return null;
  const progressPct = expense.amount > 0 ? Math.min(100, (expense.totalPaid / expense.amount) * 100) : 0;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium flex items-center">{expense.description}<BranchChip branchId={expense.branchId} /></p>
              <p className="text-xs text-muted-foreground">{expense.category}</p>
            </div>
            <Badge variant="outline" className={`text-[10px] shrink-0 ${STATUS_COLORS[expense.status]}`}>{STATUS_LABELS[expense.status]}</Badge>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all ${expense.status === "paid" ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${progressPct}%` }} />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-muted-foreground">Paid: <span className="text-green-400 font-medium">{formatCurrency(expense.totalPaid)}</span></span>
            <span className="text-muted-foreground">Balance: <span className="text-red-400 font-medium">{formatCurrency(expense.balance)}</span></span>
            <span className="text-muted-foreground">Total: <span className="font-medium">{formatCurrency(expense.amount)}</span></span>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Amount Paying (₦)</Label>
              <Input type="number" step="0.01" min="0.01" {...register("amount", { required: true, valueAsNumber: true, min: 0.01 })} />
              {errors.amount && <p className="text-xs text-destructive">Required</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Payment Date</Label>
              <Input type="date" {...register("paidAt", { required: true })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment Method</Label>
            <Controller name="paymentMethod" control={control} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank / Card</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>
          {paymentMethod === "bank" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bank Account</Label>
              <Controller name="bankId" control={control} rules={{ required: paymentMethod === "bank" }} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>{(banks ?? []).map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {errors.bankId && <p className="text-xs text-destructive">Bank required for bank payments</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes <span className="text-muted-foreground/50">(optional)</span></Label>
            <Input {...register("notes")} placeholder="Cheque no., reference, etc." />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Record Payment</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayApprovedPaymentDialog({ target, onOpenChange, onSubmit, isPending }: {
  target: ApprovedPaymentTarget | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: ApprovedPaymentFormValues) => void;
  isPending: boolean;
}) {
  const { data: banks } = useListBanks();
  const { register, handleSubmit, control, reset, watch, formState: { errors } } = useForm<ApprovedPaymentFormValues>({
    defaultValues: { paymentMethod: "bank", bankId: "", notes: "" },
  });
  const paymentMethod = watch("paymentMethod");

  useEffect(() => {
    if (target) reset({ paymentMethod: "bank", bankId: "", notes: "" });
  }, [target?.schedule.id]);

  if (!target) return null;

  const { expense, schedule } = target;
  const approvedRemaining = Math.max(0, schedule.amountApproved - schedule.amountPaid);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] border-border/50 bg-card/95 backdrop-blur sm:max-w-2xl">
        <DialogHeader><DialogTitle>Pay Approved Payment</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1 text-sm font-medium break-words">
                <span className="min-w-0 break-words">{expense.description}</span>
                <BranchChip branchId={expense.branchId} />
              </p>
              <p className="text-xs text-muted-foreground">{expense.category}</p>
            </div>
            <Badge variant="outline" className={`w-fit max-w-full whitespace-normal break-words text-left text-[10px] sm:shrink-0 ${SCHEDULE_STATUS_COLORS[schedule.status] ?? ""}`}>{scheduleDisplayLabel(schedule)}</Badge>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-md bg-background/60 p-2">
              <p className="text-muted-foreground">MD Approved</p>
              <p className="break-words font-semibold text-emerald-500">{formatCurrency(schedule.amountApproved)}</p>
            </div>
            <div className="rounded-md bg-background/60 p-2">
              <p className="text-muted-foreground">Pay Now</p>
              <p className="break-words font-semibold">{formatCurrency(approvedRemaining)}</p>
            </div>
            <div className="rounded-md bg-background/60 p-2">
              <p className="text-muted-foreground">Already Paid</p>
              <p className="break-words font-semibold text-green-400">{formatCurrency(schedule.amountPaid)}</p>
            </div>
            <div className="rounded-md bg-background/60 p-2">
              <p className="text-muted-foreground">Expense Balance</p>
              <p className="break-words font-semibold text-red-400">{formatCurrency(expense.balance)}</p>
            </div>
          </div>
          {schedule.latestComment && (
            <p className="break-words text-xs text-muted-foreground">MD instruction: {schedule.latestComment}</p>
          )}
          <p className="text-[11px] text-muted-foreground">Payment date will be captured automatically when you click Pay.</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Payment Source</Label>
            <Controller name="paymentMethod" control={control} render={({ field }) => (
              <Select onValueChange={field.onChange} value={field.value}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank Account</SelectItem>
                </SelectContent>
              </Select>
            )} />
          </div>
          {paymentMethod === "bank" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Bank Account</Label>
              <Controller name="bankId" control={control} rules={{ required: paymentMethod === "bank" }} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>{(banks ?? []).map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
              {errors.bankId && <p className="text-xs text-destructive">Bank required for bank payments</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes <span className="text-muted-foreground/50">(optional)</span></Label>
            <Input className="w-full" {...register("notes")} placeholder="Reference, cheque no., or payment note" />
          </div>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending || approvedRemaining <= 0}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Pay {formatCurrency(approvedRemaining)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddMoneyDialog({ expense, onOpenChange, onSubmit, isPending }: {
  expense: OverheadExpense | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: TopupFormValues) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TopupFormValues>({
    defaultValues: { amount: 0, description: "" },
  });

  useEffect(() => {
    if (expense) reset({ amount: 0, description: "" });
  }, [expense?.id]);

  if (!expense) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle>Add Money to Existing Expense</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-1">
          <p className="text-sm font-medium flex items-center">{expense.description}<BranchChip branchId={expense.branchId} /></p>
          <p className="text-xs text-muted-foreground">{expense.category}</p>
          <p className="text-xs text-muted-foreground">Current total: <span className="font-medium text-foreground">{formatCurrency(expense.amount)}</span></p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Amount to Add (NGN)</Label>
            <Input type="number" step="0.01" min="0.01" {...register("amount", { required: true, valueAsNumber: true, min: 0.01 })} placeholder="30000" />
            {errors.amount && <p className="text-xs text-destructive">Valid amount required</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea rows={3} className="resize-none" {...register("description", { required: true })} placeholder="What is this additional money for?" />
            {errors.description && <p className="text-xs text-destructive">Description is required</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add Money</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SchedulePaymentDialog({ expense, onOpenChange, onSubmit, isPending }: {
  expense: OverheadExpense | null;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: SchedulePaymentFormValues) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<SchedulePaymentFormValues>({
    defaultValues: { amountRequested: 0, scheduleDate: new Date().toISOString().slice(0, 10), priority: "normal", vendorBeneficiary: "", description: "", clientName: "" },
  });

  useEffect(() => {
    if (expense) {
      reset({
        amountRequested: Number(expense.balance.toFixed(2)),
        scheduleDate: new Date().toISOString().slice(0, 10),
        priority: "normal",
        vendorBeneficiary: expense.category,
        description: expense.description,
        clientName: "",
      });
    }
  }, [expense?.id]);

  if (!expense) return null;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle>Schedule Payment for MD Approval</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 space-y-1">
          <p className="text-sm font-medium flex items-center">{expense.description}<BranchChip branchId={expense.branchId} /></p>
          <p className="text-xs text-muted-foreground">Outstanding balance: <span className="font-medium text-foreground">{formatCurrency(expense.balance)}</span></p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Schedule Date</Label>
              <Input type="date" {...register("scheduleDate", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <select {...register("priority", { required: true })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Vendor / Beneficiary</Label>
            <Input {...register("vendorBeneficiary", { required: true })} />
            {errors.vendorBeneficiary && <p className="text-xs text-destructive">Required</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea rows={3} className="resize-none" {...register("description", { required: true })} />
            {errors.description && <p className="text-xs text-destructive">Required</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client <span className="text-muted-foreground/50">(optional)</span></Label>
            <Input {...register("clientName")} placeholder="Related client or job" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Amount to Schedule</Label>
            <Input type="number" step="0.01" min="0.01" max={expense.balance} {...register("amountRequested", { required: true, valueAsNumber: true, min: 0.01, max: expense.balance })} />
            {errors.amountRequested && <p className="text-xs text-destructive">Amount must not exceed outstanding balance</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Schedule Payment</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function OverheadExpensesPage() {
  const { isAdmin } = useAuth();
  const { activeBranchId, isSuperAdmin } = useBranchScope();
  const showBranchColumn = isSuperAdmin && activeBranchId === "all";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [mainTab, setMainTab] = useState<"expenses" | "categories">("expenses");
  const [statusTab, setStatusTab] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [topupTarget, setTopupTarget] = useState<OverheadExpense | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<OverheadExpense | null>(null);
  const [approvedPaymentTarget, setApprovedPaymentTarget] = useState<ApprovedPaymentTarget | null>(null);
  const [scheduleTarget, setScheduleTarget] = useState<OverheadExpense | null>(null);
  const [editTarget, setEditTarget] = useState<OverheadExpense | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  useEffect(() => { if (!isAdmin) setLocation("/"); }, [isAdmin]);
  if (!isAdmin) return null;

  const { data, isLoading } = useGetOverheadExpenses({
    category: filterCategory !== "all" ? filterCategory : undefined,
    from: filterFrom || undefined,
    to: filterTo || undefined,
    status: statusTab !== "all" ? statusTab : undefined,
  });
  const { data: categories = [] } = useGetExpenseCategories();

  const createMutation = useCreateOverheadExpense();
  const updateMutation = useUpdateOverheadExpense();
  const deleteMutation = useDeleteOverheadExpense();
  const topupMutation = useCreateOverheadExpenseTopup();
  const paymentMutation = useCreateExpensePayment();
  const schedulePaymentMutation = useScheduleOverheadExpensePayment();
  const payScheduleMutation = usePayPaymentSchedule();
  const createCatMutation = useCreateExpenseCategory();
  const updateCatMutation = useUpdateExpenseCategory();
  const deleteCatMutation = useDeleteExpenseCategory();

  const expenses = data?.expenses ?? [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleExpenses = normalizedSearch
    ? expenses.filter(e => [
        e.description,
        e.category,
        e.reference ?? "",
        e.recordedByName ?? "",
        e.branchName ?? "",
        ...e.payments.flatMap(p => [p.notes ?? "", p.bankName ?? "", p.recordedByName ?? ""]),
        ...e.topups.flatMap(t => [t.description, t.recordedByName ?? ""]),
        ...e.paymentSchedules.flatMap(s => [s.status, s.latestComment ?? ""]),
      ].some(value => value.toLowerCase().includes(normalizedSearch)))
    : expenses;
  const totalOutstanding = data?.totalOutstanding ?? 0;
  const totalPaidThisMonth = data?.totalPaidThisMonth ?? 0;
  const byCategory = data?.byCategory ?? {};

  const handleCreate = (v: ExpenseFormValues) => {
    createMutation.mutate({ category: v.category, description: v.description, amount: v.amount, reference: v.reference || undefined }, {
      onSuccess: () => { toast({ title: "Expense recorded." }); setCreateOpen(false); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleUpdate = (v: ExpenseFormValues) => {
    if (!editTarget) return;
    updateMutation.mutate({ id: editTarget.id, data: { category: v.category, description: v.description, amount: v.amount, reference: v.reference || undefined } }, {
      onSuccess: () => { toast({ title: "Expense updated." }); setEditTarget(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handlePayment = (v: PaymentFormValues) => {
    if (!paymentTarget) return;
    paymentMutation.mutate({
      expenseId: paymentTarget.id,
      amount: v.amount,
      paymentMethod: v.paymentMethod,
      bankId: v.paymentMethod === "bank" && v.bankId ? Number(v.bankId) : null,
      paidAt: v.paidAt || undefined,
      notes: v.notes || undefined,
    }, {
      onSuccess: () => { toast({ title: "Payment recorded. Bank balance updated." }); setPaymentTarget(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleSchedulePayment = (v: SchedulePaymentFormValues) => {
    if (!scheduleTarget) return;
    schedulePaymentMutation.mutate({
      expenseId: scheduleTarget.id,
      scheduleDate: v.scheduleDate,
      vendorBeneficiary: v.vendorBeneficiary,
      clientName: v.clientName || undefined,
      description: v.description,
      amountRequested: v.amountRequested,
      priority: v.priority,
    }, {
      onSuccess: () => { toast({ title: "Payment scheduled for MD approval." }); setScheduleTarget(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleApprovedPayment = (v: ApprovedPaymentFormValues) => {
    if (!approvedPaymentTarget) return;
    const amount = Math.max(0, approvedPaymentTarget.schedule.amountApproved - approvedPaymentTarget.schedule.amountPaid);
    payScheduleMutation.mutate({
      id: approvedPaymentTarget.schedule.id,
      data: {
        amount,
        paymentMethod: v.paymentMethod,
        bankId: v.paymentMethod === "bank" && v.bankId ? Number(v.bankId) : null,
        notes: v.notes || `Paid approved overhead payment for ${approvedPaymentTarget.expense.description}`,
      },
    }, {
      onSuccess: () => { toast({ title: "Approved payment recorded. Overhead balance updated." }); setApprovedPaymentTarget(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleTopup = (v: TopupFormValues) => {
    if (!topupTarget) return;
    topupMutation.mutate({
      expenseId: topupTarget.id,
      amount: v.amount,
      description: v.description,
    }, {
      onSuccess: () => { toast({ title: "Money added to expense." }); setTopupTarget(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onSuccess: () => { toast({ title: "Expense deleted." }); setDeleteId(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleAddCat = () => {
    if (!newCatName.trim()) return;
    createCatMutation.mutate({ name: newCatName.trim() }, {
      onSuccess: () => { toast({ title: "Category added." }); setNewCatName(""); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleRenameCat = (id: number) => {
    if (!editingCatName.trim()) return;
    updateCatMutation.mutate({ id, name: editingCatName.trim() }, {
      onSuccess: () => { toast({ title: "Category renamed." }); setEditingCatId(null); },
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const handleDeleteCat = (id: number) => {
    deleteCatMutation.mutate(id, {
      onSuccess: () => toast({ title: "Category deleted." }),
      onError: (e) => toast({ variant: "destructive", title: "Error", description: e.message }),
    });
  };

  const statusTabs = [
    { value: "all", label: "All" },
    { value: "unpaid", label: "Unpaid" },
    { value: "partial", label: "Partial" },
    { value: "paid", label: "Paid" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <TrendingDown className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Overhead Expenses</h1>
            <p className="text-sm text-muted-foreground">Track costs with partial payment support and bank sync</p>
          </div>
        </div>
        {mainTab === "expenses" && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Record Expense
          </Button>
        )}
      </div>

      {/* Main Tabs */}
      <div className="flex gap-1 border-b border-border/40">
        {([{ v: "expenses", label: "Expenses", Icon: Receipt }, { v: "categories", label: "Categories", Icon: Tag }] as const).map(t => (
          <button key={t.v} onClick={() => setMainTab(t.v)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${mainTab === t.v ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.Icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── EXPENSES TAB ── */}
      {mainTab === "expenses" && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border/50 bg-card/40">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Outstanding Balance</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{formatCurrency(totalOutstanding)}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Unpaid + partially paid</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/40">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Paid This Month</p>
                <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(totalPaidThisMonth)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 bg-card/40">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground mb-2">By Category (total billed)</p>
                <div className="space-y-1">
                  {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, amt]) => (
                    <div key={cat} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground truncate">{cat}</span>
                      <span className="font-medium">{formatCurrency(amt)}</span>
                    </div>
                  ))}
                  {Object.keys(byCategory).length === 0 && <p className="text-xs text-muted-foreground/50">No data yet</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* List Card */}
          <Card className="border-border/50 bg-card/40">
            <CardHeader className="pb-0 border-b border-border/40 space-y-3 pt-4">
              {/* Status sub-tabs */}
              <div className="flex gap-1">
                {statusTabs.map(t => (
                  <button key={t.value} onClick={() => setStatusTab(t.value)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${statusTab === t.value ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-accent/30"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              {/* Filters */}
              <div className="flex items-center gap-2 flex-wrap pb-3">
                <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Search description, SA, notes..."
                    className="h-8 text-xs pl-8"
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-xs w-36" />
                  <span>–</span>
                  <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-xs w-36" />
                  {(filterFrom || filterTo) && <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => { setFilterFrom(""); setFilterTo(""); }}>Clear</Button>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : visibleExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <Receipt className="w-10 h-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No expenses found.</p>
                  <p className="text-xs text-muted-foreground/60">Adjust filters/search or click "Record Expense".</p>
                </div>
              ) : (
                <div className="divide-y divide-border/30">
                  {visibleExpenses.map(e => {
                    const isExpanded = expandedId === e.id;
                    const progressPct = e.amount > 0 ? Math.min(100, (e.totalPaid / e.amount) * 100) : 0;
                    const payableSchedule = getPayableSchedule(e);
                    return (
                      <div key={e.id}>
                        <div className="px-3 py-3 hover:bg-accent/10 transition-colors">
                          <div className="flex items-start gap-2">
                            <button onClick={() => setExpandedId(isExpanded ? null : e.id)} className="mt-1 text-muted-foreground hover:text-foreground transition-colors shrink-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-foreground">{e.description}</span>
                                <Badge variant="outline" className={`text-[10px] font-medium shrink-0 ${catColor(e.category)}`}>{e.category}</Badge>
                                <Badge variant="outline" className={`text-[10px] font-medium shrink-0 ${STATUS_COLORS[e.status]}`}>{STATUS_LABELS[e.status]}</Badge>
                                {e.hasApprovedPendingPayment && (
                                  <Badge variant="outline" className="text-[10px] font-medium shrink-0 border-emerald-500/40 text-emerald-500 bg-emerald-500/10">
                                    MD Approved Pending: {formatCurrency(e.scheduledPendingApprovedTotal)}
                                  </Badge>
                                )}
                                {showBranchColumn && <BranchChip branchId={e.branchId} />}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                                {e.reference && <span>Ref: {e.reference}</span>}
                                <span>{new Date(e.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                                {e.recordedByName && <span>· {e.recordedByName}</span>}
                              </div>
                              <div className="mt-2 space-y-1">
                                <div className="w-full bg-muted rounded-full h-1.5">
                                  <div className={`h-1.5 rounded-full transition-all ${e.status === "paid" ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${progressPct}%` }} />
                                </div>
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                  <span>Paid: <span className="text-green-400 font-medium">{formatCurrency(e.totalPaid)}</span></span>
                                  {e.balance > 0 && <span>Balance: <span className="text-red-400 font-medium">{formatCurrency(e.balance)}</span></span>}
                                  <span>Total: <span className="font-medium text-foreground/80">{formatCurrency(e.amount)}</span></span>
                                </div>
                                {e.hasApprovedPendingPayment && (
                                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-[11px]">
                                    <span className="font-medium text-emerald-500">Awaiting payment: {formatCurrency(e.scheduledPendingApprovedTotal)}</span>
                                    <span className="text-muted-foreground">MD approved this amount. Paid and balance update after Accounts records payment.</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-[11px] gap-1"
                                onClick={() => window.open(`/overhead-expenses/${e.id}/print`, "_blank", "noopener,noreferrer")}
                              >
                                <Receipt className="w-3 h-3" /> Generate Statement
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1 text-blue-400 border-blue-500/30 hover:bg-blue-500/10" onClick={() => setTopupTarget(e)}>
                                <WalletCards className="w-3 h-3" /> Add Money
                              </Button>
                              {e.status !== "paid" && (
                                <>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1 text-green-400 border-green-500/30 hover:bg-green-500/10" onClick={() => setPaymentTarget(e)}>
                                    <CreditCard className="w-3 h-3" /> Pay Now
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10" onClick={() => setScheduleTarget(e)}>
                                    <CalendarClock className="w-3 h-3" /> Schedule Payment
                                  </Button>
                                  {payableSchedule && (
                                    <Button size="sm" className="h-7 px-2 text-[11px] gap-1" onClick={() => setApprovedPaymentTarget({ expense: e, schedule: payableSchedule })}>
                                      <CreditCard className="w-3 h-3" /> Pay Approved Payment
                                    </Button>
                                  )}
                                </>
                              )}
                              <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditTarget(e)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => setDeleteId(e.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="pl-9 pr-3 pb-3 bg-muted/20 border-t border-border/20">
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-2 pb-1">Money Added ({e.topups.length})</p>
                            {e.topups.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">No extra money added to this record yet.</p>
                            ) : (
                              <div className="space-y-1 mb-3">
                                {e.topups.map(t => (
                                  <div key={t.id} className="flex items-center gap-3 text-xs py-1 border-t border-border/20 first:border-t-0">
                                    <WalletCards className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span className="font-semibold text-blue-400">{formatCurrency(t.amount)}</span>
                                    <span className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    <span className="text-muted-foreground/70 truncate">- {t.description}</span>
                                    {t.recordedByName && <span className="text-muted-foreground/50 ml-auto shrink-0">by {t.recordedByName}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-2 pb-1">Payment History ({e.payments.length})</p>
                            {e.payments.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">No payments recorded yet.</p>
                            ) : (
                              <div className="space-y-2">
                                {e.payments.map(p => (
                                  <div key={p.id} className="flex items-center gap-3 text-xs py-1 border-t border-border/20 first:border-t-0">
                                    <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                                      {p.paymentMethod === "bank" ? <CreditCard className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
                                      <span>{p.paymentMethod === "bank" ? (p.bankName ?? "Bank") : "Cash"}</span>
                                    </div>
                                    <span className="font-semibold text-green-400">{formatCurrency(p.amount)}</span>
                                    <span className="text-muted-foreground">{new Date(p.paidAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    {p.notes && <span className="text-muted-foreground/70 truncate">· {p.notes}</span>}
                                    {p.recordedByName && <span className="text-muted-foreground/50 ml-auto shrink-0">by {p.recordedByName}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider pt-3 pb-1">Scheduled Payments ({e.paymentSchedules.length})</p>
                            {e.paymentSchedules.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">No payment schedules linked to this expense yet.</p>
                            ) : (
                              <div className="space-y-1">
                                {e.paymentSchedules.map(s => (
                                  <div key={s.id} className="flex items-center gap-3 text-xs py-1 border-t border-border/20 first:border-t-0">
                                    <CalendarClock className="w-3 h-3 text-primary shrink-0" />
                                    <span className="font-semibold">{formatCurrency(s.amountRequested)}</span>
                                    <span className="text-muted-foreground">{new Date(s.scheduleDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    <Badge variant="outline" className={`text-[10px] ${SCHEDULE_STATUS_COLORS[s.status] ?? ""}`}>{scheduleDisplayLabel(s)}</Badge>
                                    <span className="text-muted-foreground">Approved {formatCurrency(s.amountApproved)}</span>
                                    {s.latestComment && <span className="text-muted-foreground/70 truncate">MD: {s.latestComment}</span>}
                                    {Math.max(0, s.amountApproved - s.amountPaid) > 0 && (
                                      <Button size="sm" variant="outline" className="ml-auto h-6 px-2 text-[10px]" onClick={() => setApprovedPaymentTarget({ expense: e, schedule: s })}>
                                        Pay Approved Payment
                                      </Button>
                                    )}
                                    <span className="text-muted-foreground ml-auto">Paid {formatCurrency(s.amountPaid)} · Balance {formatCurrency(s.balance)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── CATEGORIES TAB ── */}
      {mainTab === "categories" && (
        <Card className="border-border/50 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Expense Categories</span>
              <span className="text-xs text-muted-foreground/60">· Default categories cannot be deleted</span>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex gap-2">
              <Input value={newCatName} onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCat(); } }}
                placeholder="New category name (e.g. Diesel Advance, Emergency Repairs)" className="flex-1" />
              <Button onClick={handleAddCat} disabled={!newCatName.trim() || createCatMutation.isPending} className="gap-2 shrink-0">
                {createCatMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}Add
              </Button>
            </div>
            <div className="divide-y divide-border/30">
              {categories.map(cat => (
                <div key={cat.id} className="flex items-center gap-3 py-2.5">
                  {editingCatId === cat.id ? (
                    <>
                      <Input value={editingCatName} onChange={e => setEditingCatName(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleRenameCat(cat.id); if (e.key === "Escape") setEditingCatId(null); }}
                        className="flex-1 h-8 text-sm" autoFocus />
                      <Button size="sm" className="h-7 px-3 text-xs" onClick={() => handleRenameCat(cat.id)} disabled={updateCatMutation.isPending}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingCatId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <Badge variant="outline" className={`text-[10px] font-medium shrink-0 ${catColor(cat.name)}`}>{cat.name}</Badge>
                      <span className="flex-1 text-sm">{cat.name}</span>
                      {cat.isDefault ? (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground/40"><Lock className="w-3 h-3" /><span>Default</span></div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name); }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleDeleteCat(cat.id)} disabled={deleteCatMutation.isPending}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── DIALOGS ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
          <DialogHeader><DialogTitle>Record Overhead Expense</DialogTitle></DialogHeader>
          <ExpenseForm categories={categories} onSubmit={handleCreate} onCancel={() => setCreateOpen(false)} isPending={createMutation.isPending} submitLabel="Save Expense" />
        </DialogContent>
      </Dialog>

      {editTarget && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
          <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
            <DialogHeader><DialogTitle>Edit Expense</DialogTitle></DialogHeader>
            <ExpenseForm categories={categories}
              defaultValues={{ category: editTarget.category, description: editTarget.description, amount: editTarget.amount, reference: editTarget.reference ?? "" }}
              onSubmit={handleUpdate} onCancel={() => setEditTarget(null)} isPending={updateMutation.isPending} submitLabel="Update Expense" />
          </DialogContent>
        </Dialog>
      )}

      <MakePaymentDialog expense={paymentTarget} onOpenChange={(v) => { if (!v) setPaymentTarget(null); }} onSubmit={handlePayment} isPending={paymentMutation.isPending} />
      <PayApprovedPaymentDialog target={approvedPaymentTarget} onOpenChange={(v) => { if (!v) setApprovedPaymentTarget(null); }} onSubmit={handleApprovedPayment} isPending={payScheduleMutation.isPending} />
      <AddMoneyDialog expense={topupTarget} onOpenChange={(v) => { if (!v) setTopupTarget(null); }} onSubmit={handleTopup} isPending={topupMutation.isPending} />
      <SchedulePaymentDialog expense={scheduleTarget} onOpenChange={(v) => { if (!v) setScheduleTarget(null); }} onSubmit={handleSchedulePayment} isPending={schedulePaymentMutation.isPending} />

      <Dialog open={deleteId !== null} onOpenChange={(v) => { if (!v) setDeleteId(null); }}>
        <DialogContent className="border-border/50 bg-card/95 max-w-sm">
          <DialogHeader><DialogTitle>Delete Expense?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">All payment history for this expense will also be removed. This cannot be undone.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteId && handleDelete(deleteId)}>
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
