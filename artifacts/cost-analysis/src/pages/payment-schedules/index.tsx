import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/components/layout/auth-provider";
import { useBranchScope } from "@/components/layout/branch-provider";
import { BranchChip } from "@/components/layout/branch-chip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import {
  useAddPaymentScheduleComment,
  useApprovePaymentSchedule,
  useCancelPaymentSchedule,
  useCompletePaymentSchedule,
  useCreatePaymentSchedule,
  useGetPaymentSchedule,
  useGetPaymentSchedules,
  usePartialApprovePaymentSchedule,
  usePayPaymentSchedule,
  useRejectPaymentSchedule,
  useReschedulePaymentSchedule,
  useUploadPaymentScheduleDocument,
  useListBanks,
  type PaymentSchedule,
  type PaymentScheduleBucket,
  type PaymentSchedulePriority,
  type PaymentScheduleStatus,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Search,
  WalletCards,
  XCircle,
} from "lucide-react";

const STATUS_LABELS: Record<PaymentScheduleStatus, string> = {
  pending_approval: "Pending Approval",
  partially_approved: "Partially Approved",
  approved: "Approved",
  paid: "Paid",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<PaymentScheduleStatus, string> = {
  pending_approval: "border-amber-500/30 text-amber-500 bg-amber-500/10",
  partially_approved: "border-blue-500/30 text-blue-500 bg-blue-500/10",
  approved: "border-emerald-500/30 text-emerald-500 bg-emerald-500/10",
  paid: "border-green-500/30 text-green-500 bg-green-500/10",
  completed: "border-slate-500/30 text-slate-500 bg-slate-500/10",
  rejected: "border-red-500/30 text-red-500 bg-red-500/10",
  cancelled: "border-zinc-500/30 text-zinc-500 bg-zinc-500/10",
};

const PRIORITY_COLORS: Record<PaymentSchedulePriority, string> = {
  low: "border-slate-500/30 text-slate-500 bg-slate-500/10",
  normal: "border-blue-500/30 text-blue-500 bg-blue-500/10",
  urgent: "border-red-500/30 text-red-500 bg-red-500/10",
};

const OVERDUE_COLORS = {
  yellow: "border-yellow-500/40 text-yellow-600 bg-yellow-500/10",
  orange: "border-orange-500/40 text-orange-600 bg-orange-500/10",
  red: "border-red-500/40 text-red-600 bg-red-500/10",
};

const BUCKETS: Array<{ value: PaymentScheduleBucket; label: string }> = [
  { value: "today", label: "Today's Schedule" },
  { value: "tomorrow", label: "Tomorrow's Schedule" },
  { value: "upcoming", label: "Upcoming Schedules" },
  { value: "completed", label: "Completed Schedules" },
  { value: "cancelled", label: "Cancelled Schedules" },
];

type CreateForm = {
  scheduleDate: string;
  vendorBeneficiary: string;
  clientName: string;
  description: string;
  amountRequested: string;
  priority: PaymentSchedulePriority;
};

type ActionDialog = {
  type: "approve" | "partial" | "reject" | "pay" | "comment" | "reschedule" | "cancel" | "complete";
  schedule: PaymentSchedule;
} | null;

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
}

function canApprove(role: string | null) {
  return role === "admin" || role === "super_admin";
}

function canPay(role: string | null, roles: string[]) {
  return canApprove(role) || roles.includes("accounts_user");
}

function SummaryCard({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <Card className="border-border/60 bg-card/70 shadow-sm shadow-black/5">
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className={`text-2xl font-bold mt-2 tracking-tight ${tone ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function CreateScheduleDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: CreateForm, file: File | null) => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<CreateForm>({
    scheduleDate: todayInputValue(),
    vendorBeneficiary: "",
    clientName: "",
    description: "",
    amountRequested: "",
    priority: "normal",
  });
  const [file, setFile] = useState<File | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit(form, file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border/50 bg-card/95 max-w-lg">
        <DialogHeader><DialogTitle>Create Payment Schedule</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Schedule Date</Label>
              <Input type="date" value={form.scheduleDate} onChange={(e) => setForm(f => ({ ...f, scheduleDate: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm(f => ({ ...f, priority: v as PaymentSchedulePriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Vendor / Beneficiary</Label>
            <Input value={form.vendorBeneficiary} onChange={(e) => setForm(f => ({ ...f, vendorBeneficiary: e.target.value }))} placeholder="Who should be paid?" required />
          </div>
          <div className="space-y-1.5">
            <Label>Client <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={form.clientName} onChange={(e) => setForm(f => ({ ...f, clientName: e.target.value }))} placeholder="Related client or job" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What is this payment for?" required />
          </div>
          <div className="space-y-1.5">
            <Label>Amount Requested</Label>
            <Input type="number" min="0.01" step="0.01" value={form.amountRequested} onChange={(e) => setForm(f => ({ ...f, amountRequested: e.target.value }))} required />
          </div>
          <div className="space-y-1.5">
            <Label>Supporting Document <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Submit Request</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialogView({
  action,
  onClose,
  isPending,
  onSubmit,
}: {
  action: ActionDialog;
  onClose: () => void;
  isPending: boolean;
  onSubmit: (payload: { amount?: number; scheduleDate?: string; comment?: string; paymentMethod?: "cash" | "bank"; bankId?: number | null; paidAt?: string; notes?: string }) => void;
}) {
  const [amount, setAmount] = useState("");
  const [scheduleDate, setScheduleDate] = useState(todayInputValue());
  const [comment, setComment] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("bank");
  const [bankId, setBankId] = useState("");
  const [paidAt, setPaidAt] = useState(todayInputValue());
  const [notes, setNotes] = useState("");
  const { data: banks = [] } = useListBanks();

  if (!action) return null;
  const titleMap: Record<NonNullable<ActionDialog>["type"], string> = {
    approve: "Approve Schedule",
    partial: "Partial Approve",
    reject: "Reject Schedule",
    pay: "Mark as Paid",
    comment: "Add Comment",
    reschedule: "Reschedule",
    cancel: "Cancel Schedule",
    complete: "Complete Schedule",
  };
  const needsAmount = action.type === "partial" || action.type === "pay";
  const needsDate = action.type === "reschedule";
  const commentRequired = action.type === "reject";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      amount: needsAmount ? Number(amount) : undefined,
      scheduleDate: needsDate ? scheduleDate : undefined,
      comment: comment.trim() || undefined,
      paymentMethod: action.type === "pay" ? paymentMethod : undefined,
      bankId: action.type === "pay" && bankId ? Number(bankId) : null,
      paidAt: action.type === "pay" ? paidAt : undefined,
      notes: action.type === "pay" ? notes.trim() || undefined : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 max-w-md">
        <DialogHeader><DialogTitle>{titleMap[action.type]}</DialogTitle></DialogHeader>
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-sm">
          <p className="font-medium">{action.schedule.vendorBeneficiary}</p>
          <p className="text-xs text-muted-foreground">{action.schedule.description}</p>
          <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
            <span>Requested: <b>{formatCurrency(action.schedule.amountRequested)}</b></span>
            <span>Paid: <b>{formatCurrency(action.schedule.amountPaid)}</b></span>
            <span>Balance: <b>{formatCurrency(action.schedule.balance)}</b></span>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {needsAmount && (
            <div className="space-y-1.5">
              <Label>{action.type === "partial" ? "Approved Amount" : "Payment Amount"}</Label>
              <Input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
          )}
          {needsDate && (
            <div className="space-y-1.5">
              <Label>New Schedule Date</Label>
              <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} required />
            </div>
          )}
          {action.type === "pay" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={(value) => setPaymentMethod(value as "cash" | "bank")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Date</Label>
                  <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
                </div>
              </div>
              {paymentMethod === "bank" && (
                <div className="space-y-1.5">
                  <Label>Bank Account</Label>
                  <Select value={bankId} onValueChange={setBankId}>
                    <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                    <SelectContent>
                      {banks.map((bank) => <SelectItem key={bank.id} value={String(bank.id)}>{bank.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Payment Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reference, teller number, or note" />
              </div>
            </>
          )}
          <div className="space-y-1.5">
            <Label>Comment {commentRequired && <span className="text-destructive">*</span>}</Label>
            <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Instruction, reason, or note..." required={commentRequired} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={isPending}>{isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDetailDialog({
  scheduleId,
  onClose,
  onAction,
  canMdApprove,
  canAccountsPay,
}: {
  scheduleId: number | null;
  onClose: () => void;
  onAction: (type: NonNullable<ActionDialog>["type"], schedule: PaymentSchedule) => void;
  canMdApprove: boolean;
  canAccountsPay: boolean;
}) {
  const { data, isLoading } = useGetPaymentSchedule(scheduleId);
  const upload = useUploadPaymentScheduleDocument();
  const { toast } = useToast();

  if (scheduleId == null) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Payment Schedule Details</DialogTitle></DialogHeader>
        {isLoading || !data ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl border border-border/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-lg">{data.vendorBeneficiary}</h3>
                  <p className="text-sm text-muted-foreground">{data.description}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="outline" className="text-[10px]">{data.sourceLabel}</Badge>
                    {data.overheadExpenseId && (
                      <span className="text-xs text-muted-foreground">Overhead #{data.overheadExpenseId}{data.overheadCategory ? ` · ${data.overheadCategory}` : ""}</span>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={STATUS_COLORS[data.status]}>{STATUS_LABELS[data.status]}</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Schedule Date</p><p>{dateLabel(data.scheduleDate)}</p></div>
                <div><p className="text-xs text-muted-foreground">Requested By</p><p>{data.requestedByName}</p></div>
                <div><p className="text-xs text-muted-foreground">Branch</p><p><BranchChip branchId={data.branchId} /></p></div>
                <div><p className="text-xs text-muted-foreground">Priority</p><Badge variant="outline" className={PRIORITY_COLORS[data.priority]}>{data.priority}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Requested</p><p>{formatCurrency(data.amountRequested)}</p></div>
                <div><p className="text-xs text-muted-foreground">Approved</p><p>{formatCurrency(data.amountApproved)}</p></div>
                <div><p className="text-xs text-muted-foreground">Paid</p><p>{formatCurrency(data.amountPaid)}</p></div>
                <div><p className="text-xs text-muted-foreground">Balance</p><p>{formatCurrency(data.balance)}</p></div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                {data.status !== "completed" && data.status !== "rejected" && data.status !== "cancelled" && (
                  <>
                    {canMdApprove && (
                      <>
                        <Button size="sm" onClick={() => onAction("approve", data)}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => onAction("partial", data)}>Partial Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => onAction("reject", data)}>Reject</Button>
                        <Button size="sm" variant="outline" onClick={() => onAction("reschedule", data)}>Reschedule</Button>
                        <Button size="sm" variant="outline" onClick={() => onAction("cancel", data)}>Cancel</Button>
                      </>
                    )}
                    {canAccountsPay && (data.status === "approved" || data.status === "partially_approved" || data.status === "paid") && (
                      <Button size="sm" variant="outline" onClick={() => onAction("pay", data)}>Mark as Paid</Button>
                    )}
                  </>
                )}
                <Button size="sm" variant="outline" onClick={() => onAction("comment", data)}>Add Comment</Button>
                {canAccountsPay && data.status === "paid" && <Button size="sm" onClick={() => onAction("complete", data)}>Complete</Button>}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <h4 className="font-medium flex items-center gap-2"><Paperclip className="w-4 h-4" /> Supporting Documents</h4>
                <Input
                  type="file"
                  className="max-w-xs"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    upload.mutate({ id: data.id, file }, {
                      onSuccess: () => toast({ title: "Document uploaded." }),
                      onError: (err) => toast({ variant: "destructive", title: "Upload failed", description: err.message }),
                    });
                    event.currentTarget.value = "";
                  }}
                />
              </div>
              <div className="rounded-lg border border-border/40 divide-y divide-border/30">
                {data.documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-3">No documents uploaded.</p>
                ) : data.documents.map((doc) => (
                  <a key={doc.id} href={`/api/payment-schedules/${data.id}/documents/${doc.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 text-sm hover:bg-accent/30">
                    <FileText className="w-4 h-4 text-primary" /> {doc.originalName}
                    <span className="ml-auto text-xs text-muted-foreground">{Math.ceil(doc.size / 1024)} KB</span>
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium flex items-center gap-2 mb-2"><MessageSquare className="w-4 h-4" /> Timeline</h4>
              <div className="space-y-2">
                {data.events.map((event) => (
                  <div key={event.id} className="rounded-lg border border-border/40 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium capitalize">{event.type.replace(/_/g, " ")}</span>
                      <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">By {event.actorName ?? "System"}</p>
                    {event.amount != null && <p className="text-xs mt-1">Amount: {formatCurrency(event.amount)}</p>}
                    {event.comment && <p className="text-sm mt-2">{event.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function PaymentSchedulesPage() {
  const { userRole, userRoles } = useAuth();
  const { activeBranchId, isSuperAdmin } = useBranchScope();
  const { toast } = useToast();
  const [location] = useLocation();
  const [bucket, setBucket] = useState<PaymentScheduleBucket>("today");
  const [requestedById, setRequestedById] = useState<number | null>(null);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [vendor, setVendor] = useState("");
  const [client, setClient] = useState("");
  const [amountMin, setAmountMin] = useState("");
  const [amountMax, setAmountMax] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [action, setAction] = useState<ActionDialog>(null);
  const [createdUpload, setCreatedUpload] = useState<{ id: number; file: File } | null>(null);

  useEffect(() => {
    const query = location.includes("?") ? location.split("?")[1] : window.location.search.replace(/^\?/, "");
    const scheduleId = Number(new URLSearchParams(query).get("scheduleId"));
    if (Number.isFinite(scheduleId) && scheduleId > 0) setDetailId(scheduleId);
  }, [location]);

  const filters = useMemo(() => ({
    bucket,
    requestedById,
    status,
    search,
    vendor,
    client,
    amountMin,
    amountMax,
    dateFrom,
    dateTo,
    branchId: isSuperAdmin && activeBranchId !== "all" ? Number(activeBranchId) : null,
  }), [bucket, requestedById, status, search, vendor, client, amountMin, amountMax, dateFrom, dateTo, isSuperAdmin, activeBranchId]);

  const { data, isLoading } = useGetPaymentSchedules(filters);
  const createSchedule = useCreatePaymentSchedule();
  const uploadDocument = useUploadPaymentScheduleDocument();
  const approve = useApprovePaymentSchedule();
  const partialApprove = usePartialApprovePaymentSchedule();
  const reject = useRejectPaymentSchedule();
  const pay = usePayPaymentSchedule();
  const complete = useCompletePaymentSchedule();
  const reschedule = useReschedulePaymentSchedule();
  const cancel = useCancelPaymentSchedule();
  const comment = useAddPaymentScheduleComment();
  const canMdApprove = canApprove(userRole);
  const canAccountsPay = canPay(userRole, userRoles);

  const schedules = data?.schedules ?? [];
  const summary = data?.summary;
  const pendingAction = approve.isPending || partialApprove.isPending || reject.isPending || pay.isPending || complete.isPending || reschedule.isPending || cancel.isPending || comment.isPending;
  const hasActiveFilters = requestedById != null || status !== "all" || search.trim() !== "" || vendor.trim() !== "" || client.trim() !== "" || amountMin !== "" || amountMax !== "" || dateFrom !== "" || dateTo !== "";

  const clearFilters = () => {
    setRequestedById(null);
    setStatus("all");
    setSearch("");
    setVendor("");
    setClient("");
    setAmountMin("");
    setAmountMax("");
    setDateFrom("");
    setDateTo("");
  };

  const handleCreate = (form: CreateForm, file: File | null) => {
    createSchedule.mutate({
      scheduleDate: form.scheduleDate,
      vendorBeneficiary: form.vendorBeneficiary,
      clientName: form.clientName || undefined,
      description: form.description,
      amountRequested: Number(form.amountRequested),
      priority: form.priority,
    }, {
      onSuccess: (created) => {
        toast({ title: "Payment schedule submitted for MD approval." });
        setCreateOpen(false);
        if (file) {
          setCreatedUpload({ id: created.id, file });
          uploadDocument.mutate({ id: created.id, file }, {
            onSuccess: () => setCreatedUpload(null),
            onError: (err) => {
              setCreatedUpload(null);
              toast({ variant: "destructive", title: "Schedule created, but document upload failed", description: err.message });
            },
          });
        }
      },
      onError: (err) => toast({ variant: "destructive", title: "Failed to create schedule", description: err.message }),
    });
  };

  const handleActionSubmit = (payload: { amount?: number; scheduleDate?: string; comment?: string; paymentMethod?: "cash" | "bank"; bankId?: number | null; paidAt?: string; notes?: string }) => {
    if (!action) return;
    const id = action.schedule.id;
    const options = {
      onSuccess: () => {
        toast({ title: "Schedule updated." });
        setAction(null);
      },
      onError: (err: Error) => toast({ variant: "destructive", title: "Action failed", description: err.message }),
    };
    if ((action.type === "approve" || action.type === "partial" || action.type === "reject" || action.type === "reschedule") && !canMdApprove) {
      toast({ variant: "destructive", title: "MD approval access required" });
      return;
    }
    if ((action.type === "pay" || action.type === "complete") && !canAccountsPay) {
      toast({ variant: "destructive", title: "Accounts access required" });
      return;
    }
    if (action.type === "approve") approve.mutate({ id, data: { comment: payload.comment } }, options);
    if (action.type === "partial") partialApprove.mutate({ id, data: { approvedAmount: payload.amount ?? 0, comment: payload.comment } }, options);
    if (action.type === "reject") reject.mutate({ id, data: { comment: payload.comment ?? "" } }, options);
    if (action.type === "pay") pay.mutate({
      id,
      data: {
        amount: payload.amount ?? 0,
        paymentMethod: payload.paymentMethod ?? "bank",
        bankId: payload.paymentMethod === "bank" ? payload.bankId ?? null : null,
        paidAt: payload.paidAt,
        notes: payload.notes,
        comment: payload.comment,
      },
    }, options);
    if (action.type === "complete") complete.mutate({ id, data: { comment: payload.comment } }, options);
    if (action.type === "reschedule") reschedule.mutate({ id, data: { scheduleDate: payload.scheduleDate ?? todayInputValue(), comment: payload.comment } }, options);
    if (action.type === "cancel") cancel.mutate({ id, data: { comment: payload.comment } }, options);
    if (action.type === "comment") comment.mutate({ id, comment: payload.comment ?? "" }, options);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/65 p-5 shadow-sm shadow-black/5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">Payment Schedule</h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Submit payment requests for MD approval, payment tracking, and rollover visibility.
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 self-start px-5 sm:self-center">
          <Plus className="w-4 h-4" /> New Schedule
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard label="Total Scheduled Today" value={summary?.totalScheduledToday ?? 0} tone="text-primary" />
        <SummaryCard label="Pending Approval" value={summary?.totalPendingApproval ?? 0} tone="text-amber-500" />
        <SummaryCard label="Approved" value={summary?.totalApproved ?? 0} tone="text-emerald-500" />
        <SummaryCard label="Paid Today" value={summary?.totalPaidToday ?? 0} tone="text-green-500" />
        <SummaryCard label="Overdue Schedules" value={summary?.overdueSchedules ?? 0} tone="text-red-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 items-start">
        <div className="space-y-4">
          <Card className="border-border/60 bg-card/70 shadow-sm shadow-black/5">
            <CardHeader className="px-5 pb-2 pt-5">
              <CardTitle className="text-sm font-semibold">Schedules By Staff</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-5 pb-5">
              <button onClick={() => setRequestedById(null)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors ${requestedById == null ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"}`}>
                <span className="font-medium">All staff</span>
                <span className="text-xs">{data?.byStaff?.reduce((sum, staff) => sum + staff.count, 0) ?? 0}</span>
              </button>
              {(data?.byStaff ?? []).map((staff) => (
                <button key={staff.userId ?? "unknown"} onClick={() => setRequestedById(staff.userId)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${requestedById === staff.userId ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"}`}>
                  <span className="font-medium">{staff.name}</span>
                  <span className="text-xs">{staff.count}</span>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-card/55 shadow-sm shadow-black/5">
            <CardHeader className="px-5 pb-2 pt-5">
              <CardTitle className="text-sm font-semibold">Schedules By Branch</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-5 pb-5">
              {(data?.byBranch ?? []).map((branch) => (
                <div key={branch.branchId} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2.5 text-sm">
                  <span className="truncate">{branch.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{branch.count}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden border-border/60 bg-card/70 shadow-sm shadow-black/5">
          <CardHeader className="border-b border-border/40 space-y-5 p-5">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {BUCKETS.map((item) => (
                <button key={item.value} onClick={() => setBucket(item.value)} className={`whitespace-nowrap rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${bucket === item.value ? "border-primary/30 bg-primary/10 text-primary" : "border-transparent text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground"}`}>
                  {item.label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_220px_auto]">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="h-11 pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search description, staff, vendor, branch..." />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="h-11 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {hasActiveFilters && (
                  <Button type="button" variant="outline" className="h-11 shrink-0" onClick={clearFilters}>
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <Input className="h-11" value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Vendor" />
                <Input className="h-11" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Client" />
                <Input className="h-11" type="number" value={amountMin} onChange={(e) => setAmountMin(e.target.value)} placeholder="Min amount" />
                <Input className="h-11" type="number" value={amountMax} onChange={(e) => setAmountMax(e.target.value)} placeholder="Max amount" />
                <Input className="h-11 min-w-0" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <Input className="h-11 min-w-0" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
            ) : schedules.length === 0 ? (
              <div className="flex min-h-[360px] items-center justify-center px-6 py-12">
                <div className="mx-auto flex max-w-md flex-col items-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-8 py-10 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border/60 bg-background/70">
                    <Clock className="w-7 h-7 text-muted-foreground/70" />
                  </div>
                  <h3 className="text-lg font-semibold tracking-tight">No payment schedules found</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {hasActiveFilters
                      ? "Try clearing your filters or switching schedule tabs to see more requests."
                      : "Create a schedule when a payment needs approval, tracking, or future processing."}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-3">
                    {hasActiveFilters && <Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
                    <Button onClick={() => setCreateOpen(true)} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Create Schedule</Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="p-6 hover:bg-accent/20 transition-colors">
                    <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <button onClick={() => setDetailId(schedule.id)} className="text-lg font-semibold hover:text-primary text-left">{schedule.vendorBeneficiary}</button>
                        </div>
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          {schedule.overheadExpenseId && <Badge variant="outline" className="text-[10px]">Source: Overhead Expense</Badge>}
                          <Badge variant="outline" className={STATUS_COLORS[schedule.status]}>{STATUS_LABELS[schedule.status]}</Badge>
                          <Badge variant="outline" className={PRIORITY_COLORS[schedule.priority]}>{schedule.priority}</Badge>
                          {schedule.overdueLevel && <Badge variant="outline" className={OVERDUE_COLORS[schedule.overdueLevel]}><AlertTriangle className="w-3 h-3 mr-1" /> {schedule.overdueDays} days overdue</Badge>}
                          <BranchChip branchId={schedule.branchId} />
                        </div>
                        <p className="text-sm text-muted-foreground mt-3 leading-6">{schedule.description}</p>
                        <div className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 xl:grid-cols-5">
                          <div className="rounded-xl bg-muted/25 px-4 py-3"><span className="block text-xs text-muted-foreground">Schedule</span><b>{dateLabel(schedule.scheduleDate)}</b></div>
                          <div className="rounded-xl bg-muted/25 px-4 py-3"><span className="block text-xs text-muted-foreground">Requested By</span><b>{schedule.requestedByName}</b></div>
                          <div className="rounded-xl bg-muted/25 px-4 py-3"><span className="block text-xs text-muted-foreground">Requested</span><b>{formatCurrency(schedule.amountRequested)}</b></div>
                          <div className="rounded-xl bg-muted/25 px-4 py-3"><span className="block text-xs text-muted-foreground">Paid</span><b>{formatCurrency(schedule.amountPaid)}</b></div>
                          <div className="rounded-xl bg-muted/25 px-4 py-3"><span className="block text-xs text-muted-foreground">Balance</span><b>{formatCurrency(schedule.balance)}</b></div>
                        </div>
                        {schedule.clientName && <p className="text-xs text-muted-foreground mt-1">Client: {schedule.clientName}</p>}
                      </div>
                      <div className="flex shrink-0 flex-row gap-2 xl:flex-col">
                        <Button size="sm" variant="outline" onClick={() => setDetailId(schedule.id)}>Details</Button>
                        <div className="flex gap-1">
                          {canMdApprove && schedule.status === "pending_approval" && (
                            <>
                              <Button size="icon" className="w-8 h-8" title="Approve" onClick={() => setAction({ type: "approve", schedule })}><CheckCircle2 className="w-4 h-4" /></Button>
                              <Button size="icon" variant="destructive" className="w-8 h-8" title="Reject" onClick={() => setAction({ type: "reject", schedule })}><XCircle className="w-4 h-4" /></Button>
                            </>
                          )}
                          {canAccountsPay && (schedule.status === "approved" || schedule.status === "partially_approved") && (
                            <Button size="icon" variant="outline" className="w-8 h-8" title="Pay" onClick={() => setAction({ type: "pay", schedule })}><WalletCards className="w-4 h-4" /></Button>
                          )}
                          <Button size="icon" variant="outline" className="w-8 h-8" title="Comment" onClick={() => setAction({ type: "comment", schedule })}><MessageSquare className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <CreateScheduleDialog open={createOpen} onOpenChange={setCreateOpen} onSubmit={handleCreate} isPending={createSchedule.isPending || createdUpload != null} />
      <ScheduleDetailDialog
        scheduleId={detailId}
        onClose={() => setDetailId(null)}
        onAction={(type, schedule) => setAction({ type, schedule })}
        canMdApprove={canMdApprove}
        canAccountsPay={canAccountsPay}
      />
      <ActionDialogView action={action} onClose={() => setAction(null)} isPending={pendingAction} onSubmit={handleActionSubmit} />
    </div>
  );
}
