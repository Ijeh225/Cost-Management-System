import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetPipeline, useAdvanceContainerStatus,
  useGetContainer, useUpdateContainerCharges,
  useGetContainerExtraCharges, useCreateContainerExtraCharge,
  useUpdateContainerExtraCharge, useDeleteContainerExtraCharge,
  useGetSettings, BUILT_IN_SECTION_DEFAULTS,
  getBuiltInFieldLabel, isBuiltInFieldHidden,
  type ContainerExtraCharge,
  type UpdateContainerChargesRequestSection,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/components/layout/auth-provider";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, getStatusColor, WORKFLOW_STAGES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompletedJobsView } from "@/components/workspace/completed-jobs-view";
import {
  Loader2, Search, Truck, ChevronRight, Clock, SendHorizonal,
  CheckCircle2, Inbox, ChevronDown, ChevronUp, Plus, Pencil,
  Trash2, Save, X, Receipt, Lock, CheckCheck, Eye, Ban
} from "lucide-react";

const QUICKSTART_KEY = "delivery_quickstart_dismissed";

const DEPT_STAGES = ["delivery"];

const STAGE_SUBMIT_LABEL: Record<string, string> = {
  delivery: "Mark as Closed",
};

const DELIVERY_FIELDS = [
  "passingOfTruck",
  "passingOfTruckForEmptyReturn",
  "parkingForPullout",
  "pullout",
  "delivery",
  "emptyReturn",
  "unchainingTruck",
  "emptyCallUp",
  "pulloutExpenses",
  "transferToIkorodu",
  "transportAllowance",
] as const;

const deliverySchema = z.object(
  Object.fromEntries(
    DELIVERY_FIELDS.map((f) => [
      f,
      z.coerce.number({ invalid_type_error: "Must be a number" }).min(0, "Must be ≥ 0").default(0),
    ])
  ) as Record<string, z.ZodTypeAny>
);

function DaysChip({ days }: { days: number }) {
  const color =
    days >= 7  ? "text-red-400 bg-red-500/10 border-red-500/30"
    : days >= 3 ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
                : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${color}`}>
      <Clock className="w-2.5 h-2.5" />{days}d
    </span>
  );
}

function CustomLineItems({ containerId, canEdit }: { containerId: number; canEdit: boolean }) {
  const { toast } = useToast();
  const { data: allExtra = [] } = useGetContainerExtraCharges(containerId);
  const createMutation = useCreateContainerExtraCharge(containerId);
  const updateMutation = useUpdateContainerExtraCharge(containerId);
  const deleteMutation = useDeleteContainerExtraCharge(containerId);

  const rows = allExtra.filter((r: ContainerExtraCharge) => r.section === "delivery");

  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editAmount, setEditAmount] = useState("");

  const handleAdd = () => {
    if (!newLabel.trim()) {
      toast({ variant: "destructive", title: "Description is required" });
      return;
    }
    createMutation.mutate(
      { section: "delivery", label: newLabel.trim(), amount: parseFloat(newAmount) || 0 },
      {
        onSuccess: () => { setAdding(false); setNewLabel(""); setNewAmount(""); },
        onError: (err) => toast({ variant: "destructive", title: "Failed to add", description: err instanceof Error ? err.message : "Error" }),
      }
    );
  };

  const handleUpdate = (id: number) => {
    updateMutation.mutate(
      { rowId: id, label: editLabel.trim(), amount: parseFloat(editAmount) || 0 },
      {
        onSuccess: () => setEditingId(null),
        onError: (err) => toast({ variant: "destructive", title: "Failed to update", description: err instanceof Error ? err.message : "Error" }),
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id, {
      onError: (err) => toast({ variant: "destructive", title: "Failed to delete", description: err instanceof Error ? err.message : "Error" }),
    });
  };

  return (
    <div className="pt-4 border-t border-border/40">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom Line Items</span>
        {canEdit && !adding && (
          <button
            onClick={() => { setAdding(true); setNewLabel(""); setNewAmount(""); }}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add Line Item
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        {rows.length === 0 && !adding && (
          <p className="text-xs text-muted-foreground/60 italic py-1">No custom line items.</p>
        )}

        {rows.map((row: ContainerExtraCharge) => (
          <div key={row.id} className="flex items-center gap-2 text-sm">
            {editingId === row.id ? (
              <>
                <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Description" className="h-8 text-xs flex-1 bg-background border-border/60" />
                <Input value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" className="h-8 text-xs w-32 bg-background border-border/60 font-mono" />
                <Button size="sm" className="h-8 px-2 gap-1 text-xs" onClick={() => handleUpdate(row.id)} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => setEditingId(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 text-xs text-foreground truncate">{row.label}</span>
                <span className="text-xs font-mono text-foreground shrink-0">{formatCurrency(row.amount ?? 0)}</span>
                {canEdit && (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground" onClick={() => { setEditingId(row.id); setEditLabel(row.label); setEditAmount(String(row.amount ?? 0)); }}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(row.id)} disabled={deleteMutation.isPending}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        ))}

        {adding && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/30">
            <Input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="e.g. Truck hire, Driver allowance…"
              className="h-8 text-xs flex-1 bg-background border-border/60"
              onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewLabel(""); setNewAmount(""); } }}
              autoFocus
            />
            <Input value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder="0.00" type="number" min="0" step="0.01" className="h-8 text-xs w-32 bg-background border-border/60 font-mono" onKeyDown={e => { if (e.key === "Enter") handleAdd(); }} />
            <Button size="sm" className="h-8 px-2 gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white" onClick={handleAdd} disabled={createMutation.isPending}>
              {createMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs text-muted-foreground" onClick={() => { setAdding(false); setNewLabel(""); setNewAmount(""); }}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickStartBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative rounded-xl border border-teal-500/30 bg-teal-500/5 px-5 py-4 space-y-3">
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>
      <div className="flex items-center gap-2">
        <Truck className="w-4 h-4 text-teal-400 shrink-0" />
        <p className="text-sm font-semibold text-teal-400">Quick Start — Delivery Team</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted-foreground">
        <div className="flex items-start gap-2">
          <CheckCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
          <span><strong className="text-foreground/80">You can:</strong> view and advance delivery jobs, search by container or BL number, and submit containers to Empty Return or mark them as Closed.</span>
        </div>
        <div className="flex items-start gap-2">
          <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
          <span><strong className="text-foreground/80">View only:</strong> open the full job details page for any container in your queue via "View Job".</span>
        </div>
        <div className="flex items-start gap-2">
          <Ban className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
          <span><strong className="text-foreground/80">Not available:</strong> invoices, financial data, client records, analytics, or admin settings are outside your access level.</span>
        </div>
      </div>
    </div>
  );
}

function DeliveryChargesPanel({ containerId }: { containerId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: containerData, isLoading } = useGetContainer(containerId);
  const { data: settings } = useGetSettings();
  const { data: allExtra = [] } = useGetContainerExtraCharges(containerId);
  const updateMutation = useUpdateContainerCharges();

  const container = containerData?.container;
  const charges = containerData?.charges;
  const sectionApprovals = (containerData?.sectionApprovals ?? []) as Array<{ section: string; status: string }>;
  const deliveryApproval = sectionApprovals.find((a) => a.section === "delivery");
  const approvalStatus = deliveryApproval?.status ?? "draft";

  const lockedSections: string[] = (container?.lockedSections as string[] | undefined) ?? [];
  const isSectionLocked = lockedSections.includes("delivery");
  const isRecordLocked = !!container?.isLocked;
  const effectivelyLocked = isRecordLocked || isSectionLocked;
  const canEdit = isAdmin || (!effectivelyLocked && approvalStatus !== "approved");

  const sectionSettings = (settings ?? {}) as Record<string, string>;
  const initialData = (charges?.delivery ?? {}) as Record<string, number>;

  const form = useForm({
    resolver: zodResolver(deliverySchema),
    defaultValues: Object.fromEntries(DELIVERY_FIELDS.map((f) => [f, Number(initialData[f] ?? 0)])),
  });

  useEffect(() => {
    form.reset(Object.fromEntries(DELIVERY_FIELDS.map((f) => [f, Number(initialData[f] ?? 0)])));
  }, [JSON.stringify(initialData)]);

  const visibleFields = DELIVERY_FIELDS.filter((f) => !isBuiltInFieldHidden(sectionSettings, "delivery", f));

  const baseTotal = visibleFields.reduce((sum, f) => sum + Number(initialData[f] ?? 0), 0);
  const extraTotal = allExtra.filter((r: ContainerExtraCharge) => r.section === "delivery").reduce((s: number, r: ContainerExtraCharge) => s + (r.amount ?? 0), 0);
  const total = baseTotal + extraTotal;

  const onSubmit = (data: Record<string, number>) => {
    updateMutation.mutate(
      { id: containerId, data: { section: "delivery" as UpdateContainerChargesRequestSection, delivery: data, reason: "Updated from Deliveries workspace" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}/audit`] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          form.reset(data);
          toast({ title: "Delivery & Transport saved", description: "Changes are now reflected in the Account Summary." });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Save failed", description: err?.message ?? "Something went wrong" }),
      }
    );
  };

  if (isLoading || !container || !charges) {
    return (
      <div className="border-t border-border/40 px-4 py-6 bg-muted/20 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isDirty = form.formState.isDirty;

  return (
    <div className="border-t border-border/40 px-4 pt-4 pb-5 bg-muted/20">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-teal-400" />
          <span className="text-sm font-semibold text-foreground">{sectionSettings.delivery ?? BUILT_IN_SECTION_DEFAULTS.delivery ?? "Delivery & Transport"}</span>
          {effectivelyLocked && (
            <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] py-0 px-1.5">
              <Lock className="w-3 h-3 mr-1" /> Locked
            </Badge>
          )}
        </div>
        <span className="text-sm font-semibold text-teal-400 font-mono">{formatCurrency(total)}</span>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-3">
            {visibleFields.map((field) => (
              <FormField key={field} control={form.control} name={field} render={({ field: ff }) => (
                <FormItem>
                  <FormLabel className="text-xs text-muted-foreground">
                    {getBuiltInFieldLabel(sectionSettings, "delivery", field)}
                  </FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-muted-foreground text-sm font-mono">₦</span>
                      <Input
                        type="number"
                        {...ff}
                        disabled={!canEdit || updateMutation.isPending}
                        className="pl-7 font-mono text-sm bg-background/50 border-border/60 disabled:opacity-70 h-9"
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            ))}
          </div>

          <CustomLineItems containerId={containerId} canEdit={canEdit} />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40">
            <div className="text-xs text-muted-foreground">
              {!canEdit && (
                <span className="italic">
                  {approvalStatus === "approved" ? "Approved — section locked" : effectivelyLocked ? "Section locked" : "Read-only"}
                </span>
              )}
            </div>
            {canEdit && isDirty && (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => form.reset()} disabled={updateMutation.isPending}>
                  Discard
                </Button>
                <Button type="submit" size="sm" className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                  Save Changes
                </Button>
              </div>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}

function CustodyChip({ days, closed }: { days: number | null | undefined; closed?: boolean }) {
  if (days == null) return null;
  const color = closed
    ? "text-slate-400 border-slate-500/30 bg-slate-500/10"
    : days >= 21
      ? "text-red-400 border-red-500/30 bg-red-500/10"
      : days >= 14
        ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
        : "text-teal-400 border-teal-500/30 bg-teal-500/10";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${color}`}>
      Custody: {days}d{!closed && " ▶"}
    </span>
  );
}

function ContainerJobCard({
  c,
  isClose,
  stage,
  onSubmit,
  isSubmitting,
}: {
  c: { id: number; containerNumber: string; blNumber?: string | null; customerName: string; daysInStage: number; lifespanDays?: number | null; lifespanClosed?: boolean };
  isClose: boolean;
  stage: string;
  onSubmit: () => void;
  isSubmitting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden border-border/60">
      <div className="p-4 flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
            <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
            <DaysChip days={c.daysInStage} />
            <CustodyChip days={c.lifespanDays} closed={c.lifespanClosed} />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{c.customerName}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setExpanded(v => !v)}
            className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border transition-colors ${
              expanded
                ? "border-teal-500/40 bg-teal-500/10 text-teal-400 hover:bg-teal-500/20"
                : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
            }`}
          >
            <Receipt className="w-3 h-3" />
            Expenses
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <Link href={`/operations/${c.id}`}>
            <Button size="sm" variant="ghost" className="gap-1 text-xs">
              View Job <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
          <Button
            size="sm"
            className={`gap-1 text-xs ${isClose ? "bg-emerald-600 hover:bg-emerald-700" : "bg-teal-600 hover:bg-teal-700"}`}
            onClick={onSubmit}
            disabled={isSubmitting}
          >
            {isClose ? <CheckCircle2 className="w-3 h-3" /> : <SendHorizonal className="w-3 h-3" />}
            {STAGE_SUBMIT_LABEL[stage]}
          </Button>
        </div>
      </div>
      {expanded && <DeliveryChargesPanel containerId={c.id} />}
    </Card>
  );
}

export default function DeliveryWorkspace() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [showQuickStart, setShowQuickStart] = useState(() => {
    try {
      return !localStorage.getItem(QUICKSTART_KEY);
    } catch {
      return false;
    }
  });

  const handleDismissQuickStart = () => {
    try { localStorage.setItem(QUICKSTART_KEY, "1"); } catch {}
    setShowQuickStart(false);
  };
  const { data, isLoading } = useGetPipeline({ query: { refetchInterval: 30_000 } });
  const advance = useAdvanceContainerStatus();

  useEffect(() => { searchRef.current?.focus(); }, []);

  const allContainers = DEPT_STAGES.flatMap(s =>
    (data?.stages?.[s] ?? []).map(c => ({ ...c, stage: s }))
  );

  const q = search.trim().toLowerCase();
  const filtered = q
    ? allContainers.filter(c =>
        c.containerNumber.toLowerCase().includes(q) ||
        c.blNumber?.toLowerCase().includes(q)
      )
    : allContainers;

  const byStage = DEPT_STAGES.reduce<Record<string, typeof filtered>>((acc, s) => {
    acc[s] = filtered.filter(c => c.stage === s);
    return acc;
  }, {});

  const handleSubmit = (container: (typeof filtered)[0]) => {
    advance.mutate({ id: container.id, status: container.stage }, {
      onSuccess: () => toast({ title: `Job ${container.containerNumber} marked as closed.` }),
      onError:   (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {showQuickStart && <QuickStartBanner onDismiss={handleDismissQuickStart} />}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
            <Truck className="w-6 h-6 text-teal-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Deliveries</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Delivery &amp; Transport</p>
          </div>
        </div>
        {!isLoading && (
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-foreground">{allContainers.length}</p>
            <p className="text-xs text-muted-foreground">active jobs</p>
          </div>
        )}
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="active" className="gap-1.5">
            <Truck className="w-3.5 h-3.5" /> Active
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Closed Jobs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-6 mt-6">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          ref={searchRef}
          placeholder="Search by container number or BL number…"
          className="pl-11 h-12 text-base"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : allContainers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
            <Inbox className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No active deliveries</p>
          <p className="text-xs text-muted-foreground/60">Jobs will appear here once containers reach the Delivery stage.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {DEPT_STAGES.map(stage => {
            const containers = byStage[stage] ?? [];
            const stageInfo = WORKFLOW_STAGES.find(s => s.value === stage);
            const isClose = stage === "delivery";
            return (
              <div key={stage}>
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="outline" className={`text-xs ${getStatusColor(stage)}`}>
                    {stageInfo?.label ?? stage}
                  </Badge>
                  <span className="text-xs bg-muted rounded-full px-2 py-0.5 font-medium">{containers.length}</span>
                </div>
                {containers.length === 0 ? (
                  <p className="text-sm text-muted-foreground/50 italic pl-1">
                    {q ? "No results matching your search." : "No jobs at this stage."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {containers.map(c => (
                      <ContainerJobCard
                        key={c.id}
                        c={c}
                        isClose={isClose}
                        stage={stage}
                        onSubmit={() => handleSubmit(c)}
                        isSubmitting={advance.isPending}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <CompletedJobsView
            deptStages={DEPT_STAGES}
            emptyTitle="No closed deliveries yet"
            emptySubtitle="Once you mark a delivery as closed, it will appear here. You can still update its expenses anytime."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
