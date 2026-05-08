import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetContainer,
  useUpdateContainer,
  useAdvanceContainerStatus,
  useGetContainerAuditLog,
  useUpdatePaar,
  useUpdateDeliveryExecution,
  useStageAction,
  type Container,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import {
  WORKFLOW_STAGES,
  getStatusLabel,
  getStatusColor,
  getNextStage,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  Clock,
  User,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Activity,
  FileText,
  Save,
  RotateCcw,
  Container as ContainerIcon,
  Ship,
  FileCheck2,
  Truck,
  Navigation,
  Phone,
  MapPin,
  Package,
  CheckSquare,
  Pencil,
  User as UserIcon,
  ClipboardCheck,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

const PIPELINE_STAGES = WORKFLOW_STAGES.filter(
  (s) => s.value !== "pending_verification"
);

const OPS_STAGES      = ["transire_processing", "shipping", "terminal", "pull_out"];
const DOCS_STAGES     = ["registered", "documentation", "duty_assessment"];
const ACCOUNTS_STAGES = ["duty_payment"];
const TERMINAL_STAGES = ["gate_in", "examination", "final_release"];
const DELIVERY_STAGES = ["delivery"];

function daysAgo(dateStr: string): number {
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86_400_000);
}

function StageRail({
  currentStatus,
  onNavigate,
  isAdmin,
  isOperationsUser,
  isDocumentationUser,
  isAccountsUser,
  isTerminalManager,
  isDeliveryUser,
}: {
  currentStatus: string;
  onNavigate?: (stage: string) => void;
  isAdmin?: boolean;
  isOperationsUser?: boolean;
  isDocumentationUser?: boolean;
  isAccountsUser?: boolean;
  isTerminalManager?: boolean;
  isDeliveryUser?: boolean;
}) {
  const isDeptUser = isOperationsUser || isDocumentationUser || isAccountsUser || isTerminalManager || isDeliveryUser;

  const deptStageValues = isDocumentationUser ? DOCS_STAGES
    : isAccountsUser     ? ACCOUNTS_STAGES
    : isTerminalManager  ? TERMINAL_STAGES
    : isDeliveryUser     ? DELIVERY_STAGES
    : isOperationsUser   ? OPS_STAGES
    : null;

  const stages = deptStageValues
    ? WORKFLOW_STAGES.filter(s => deptStageValues.includes(s.value))
    : PIPELINE_STAGES;

  const currentIdx = stages.findIndex((s) => s.value === currentStatus);

  return (
    <div className="relative">
      <div className="flex items-center gap-0 overflow-x-auto pb-2">
        {stages.map((stage, idx) => {
          const isPast = idx < currentIdx;
          const isCurrent = idx === currentIdx;
          const isFuture = idx > currentIdx;
          const isClickable = isAdmin
            ? !isCurrent
            : isDeptUser
            ? !isCurrent
            : false;

          const dot = (
            <div
              className={`
                w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all
                ${isPast ? "bg-primary border-primary" : ""}
                ${isCurrent ? "bg-primary/20 border-primary ring-2 ring-primary/30" : ""}
                ${isFuture ? "bg-muted/30 border-border/40" : ""}
                ${isClickable ? "cursor-pointer hover:scale-110 hover:ring-2 hover:ring-amber-400/50" : ""}
              `}
              onClick={isClickable ? () => onNavigate?.(stage.value) : undefined}
              title={isClickable ? `Go to ${stage.label}` : undefined}
            >
              {isPast ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
              ) : isCurrent ? (
                <Activity className="w-3 h-3 text-primary animate-pulse" />
              ) : (
                <Circle className="w-3 h-3 text-border/40" />
              )}
            </div>
          );

          return (
            <div key={stage.value} className="flex items-center shrink-0">
              <div className="flex flex-col items-center gap-1">
                {dot}
                <span
                  className={`text-[9px] font-medium text-center max-w-[52px] leading-tight
                    ${isCurrent ? "text-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/40"}
                    ${isClickable ? "cursor-pointer hover:text-amber-400" : ""}
                  `}
                  onClick={isClickable ? () => onNavigate?.(stage.value) : undefined}
                >
                  {stage.short}
                </span>
              </div>
              {idx < stages.length - 1 && (
                <div
                  className={`h-0.5 w-6 mx-0.5 mb-4 rounded-full transition-all
                    ${idx < currentIdx ? "bg-primary" : "bg-border/30"}
                  `}
                />
              )}
            </div>
          );
        })}
      </div>
      {(isAdmin || isDeptUser) && (
        <p className="text-[9px] text-muted-foreground/50 mt-0.5">
          {isAdmin
            ? "Click any stage to move this job to that stage"
            : "Click any stage to navigate back or forward within your stages"}
        </p>
      )}
    </div>
  );
}

const DEPT_SUBMIT_LABELS: Record<string, Record<string, string>> = {
  documentation_user: {
    registered:      "Submit to Documentation",
    documentation:   "Submit to Duty Assessment",
    duty_assessment: "Submit to Accounts",
  },
  accounts_user: {
    duty_payment: "Submit to Operations",
  },
  terminal_manager: {
    gate_in:       "Submit to Examination",
    examination:   "Submit to Final Release",
    final_release: "Submit to Delivery",
  },
  delivery_user: {
    delivery: "Mark as Closed",
  },
  operations_user: {
    terminal:            "Submit to Pull-Out",
    pull_out:            "Submit to Terminal Manager",
  },
  shipping_user: {
    shipping: "Mark DO Released",
  },
  terminal_user: {
    terminal: "Submit to Pull-Out",
  },
  pull_out_user: {
    pull_out: "Release to Gate-In",
  },
};

const OPS_RELEASE_LABELS: Record<string, string> = {
  transire_processing: "Mark as Transire Out",
  shipping:            "Mark as Do Out",
  terminal:            "Mark as TDO Out",
  pull_out:            "Confirm Pullout",
};

const OPS_STAGE_CONFIG: Record<string, {
  expectedLabel: string;
  expectedField: keyof Container;
  releasedField: keyof Container;
  delayReasonField: keyof Container;
  finalDateField: keyof Container;
}> = {
  transire_processing: { expectedLabel: "Expected Transire Release Date", expectedField: "expectedTransireDate", releasedField: "transireReleasedAt", delayReasonField: "transireDelayReason", finalDateField: "transireFinalDate" },
  shipping:            { expectedLabel: "Expected DO Date",               expectedField: "expectedDoDate",       releasedField: "doReleasedAt",       delayReasonField: "doDelayReason",       finalDateField: "doFinalDate"       },
  terminal:            { expectedLabel: "Expected TDO Date",              expectedField: "expectedTdoDate",      releasedField: "tdoReleasedAt",      delayReasonField: "tdoDelayReason",      finalDateField: "tdoFinalDate"      },
  pull_out:            { expectedLabel: "Expected Pullout Date",          expectedField: "expectedPulloutDate",  releasedField: "pulloutReleasedAt",  delayReasonField: "pulloutDelayReason",  finalDateField: "pulloutFinalDate"  },
};

function OpsStageTracker({
  container, isEditable, daysInStage, stageOwner, setStageOwner,
  stageActionMut, advanceMutation, updateMutation, toast, deptScope, isAdmin,
}: {
  container: Container;
  isEditable: boolean;
  daysInStage: number;
  stageOwner: string;
  setStageOwner: (v: string) => void;
  stageActionMut: ReturnType<typeof useStageAction>;
  advanceMutation: ReturnType<typeof useAdvanceContainerStatus>;
  updateMutation: ReturnType<typeof useUpdateContainer>;
  toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"];
  deptScope: string | null;
  isAdmin: boolean;
}) {
  const cfg = OPS_STAGE_CONFIG[container.status];
  const [localExpectedDate, setLocalExpectedDate] = useState(
    (container[cfg.expectedField] as string | null) ? (container[cfg.expectedField] as string).slice(0, 10) : ""
  );
  const [showDelayForm, setShowDelayForm] = useState(false);
  const [delayReasonInput, setDelayReasonInput] = useState((container[cfg.delayReasonField] as string | null) ?? "");
  const [finalDateInput, setFinalDateInput] = useState(
    (container[cfg.finalDateField] as string | null) ? (container[cfg.finalDateField] as string).slice(0, 10) : ""
  );
  const [ownerDirty, setOwnerDirty] = useState(false);

  useEffect(() => {
    setLocalExpectedDate((container[cfg.expectedField] as string | null) ? (container[cfg.expectedField] as string).slice(0, 10) : "");
    setDelayReasonInput((container[cfg.delayReasonField] as string | null) ?? "");
    setFinalDateInput((container[cfg.finalDateField] as string | null) ? (container[cfg.finalDateField] as string).slice(0, 10) : "");
    setOwnerDirty(false);
  }, [container.id, container.updatedAt]);

  const expectedDate = container[cfg.expectedField] as string | null;
  const releasedAt   = container[cfg.releasedField] as string | null;
  const delayReason  = container[cfg.delayReasonField] as string | null;
  const finalDate    = container[cfg.finalDateField] as string | null;

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const expDate = expectedDate ? new Date(expectedDate) : null;
  if (expDate) expDate.setUTCHours(0, 0, 0, 0);
  const isOverdue = !releasedAt && expDate !== null && expDate.getTime() < today.getTime();
  const overdueDays = isOverdue && expDate ? Math.floor((today.getTime() - expDate.getTime()) / 86_400_000) : 0;

  const nextStage = getNextStage(container.status);

  const handleSaveExpectedDate = async () => {
    if (!localExpectedDate) return;
    try {
      await stageActionMut.mutateAsync({ id: container.id, action: "set_expected_date", expectedDate: localExpectedDate });
      toast({ title: "Expected date saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to save" });
    }
  };

  const handleMarkReleased = async () => {
    try {
      await stageActionMut.mutateAsync({ id: container.id, action: "mark_released" });
      toast({ title: `${getStatusLabel(container.status)} marked as released` });
      // Status advancement is handled by the explicit "Submit to Pull-Out" action,
      // not by marking a stage as released (Transire/Shipping are data-entry only).
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleRecordDelay = async () => {
    if (!delayReasonInput.trim()) {
      toast({ variant: "destructive", title: "Delay reason is required" }); return;
    }
    try {
      await stageActionMut.mutateAsync({
        id: container.id, action: "record_delay",
        delayReason: delayReasonInput,
        finalDate: finalDateInput || null,
      });
      setShowDelayForm(false);
      toast({ title: "Delay recorded" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleSaveOwner = async () => {
    try {
      await updateMutation.mutateAsync({ id: container.id, data: { stageOwner: stageOwner || null } });
      setOwnerDirty(false);
      toast({ title: "Stage owner saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const isBusy = stageActionMut.isPending || advanceMutation.isPending;

  return (
    <div className="space-y-4">
      {/* Stage Owner */}
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardContent className="pt-4">
          <div className="flex items-end gap-3">
            <div className="flex-1 space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <User className="w-3 h-3" /> Stage Owner
              </Label>
              <Input
                value={stageOwner}
                onChange={e => { setStageOwner(e.target.value); setOwnerDirty(true); }}
                placeholder="Person responsible for this stage"
                className="h-8 text-sm bg-background border-border/60"
                disabled={!isEditable}
              />
            </div>
            {isEditable && ownerDirty && (
              <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleSaveOwner} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Expected Date + Release Tracking */}
      <Card className={`border backdrop-blur-sm ${
        releasedAt ? "border-emerald-500/30 bg-emerald-500/5"
        : isOverdue ? "border-red-500/30 bg-red-500/5"
        : delayReason ? "border-amber-500/30 bg-amber-500/5"
        : "border-border/50 bg-card/40"
      }`}>
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${releasedAt ? "text-emerald-400" : isOverdue ? "text-red-400" : delayReason ? "text-amber-400" : "text-muted-foreground"}`} />
              {cfg.expectedLabel}
            </CardTitle>
            <div className="flex items-center gap-2">
              {releasedAt ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Released
                </span>
              ) : isOverdue ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" /> Overdue {overdueDays}d
                </span>
              ) : delayReason ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                  <Clock className="w-2.5 h-2.5" /> Delayed
                </span>
              ) : null}
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span className={daysInStage > 14 ? "text-red-400 font-semibold" : daysInStage > 7 ? "text-amber-400 font-semibold" : ""}>{daysInStage}d in stage</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {/* Expected Date Input */}
          {!releasedAt && (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground">{cfg.expectedLabel}</Label>
                <Input
                  type="date"
                  value={localExpectedDate}
                  onChange={e => setLocalExpectedDate(e.target.value)}
                  className={`h-8 text-sm bg-background border-border/60 ${isOverdue ? "border-red-500/50 text-red-400" : ""}`}
                  disabled={!isEditable}
                />
              </div>
              {isEditable && (
                <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleSaveExpectedDate}
                  disabled={!localExpectedDate || stageActionMut.isPending}>
                  {stageActionMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Set Date
                </Button>
              )}
            </div>
          )}

          {/* Released state */}
          {releasedAt && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Released on <strong>{new Date(releasedAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</strong></span>
            </div>
          )}

          {/* Overdue alert */}
          {!releasedAt && isOverdue && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-400">
                  {overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  The expected date has passed. Please record the reason for delay or mark as released if completed.
                </p>
              </div>
            </div>
          )}

          {/* Existing delay reason */}
          {delayReason && !showDelayForm && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Delay Recorded</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{delayReason}</p>
              {finalDate && (
                <p className="text-xs text-amber-400/80 mt-1">Final date: {new Date(finalDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
              )}
            </div>
          )}

          {/* Delay form */}
          {showDelayForm && isEditable && (
            <div className="space-y-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs font-semibold text-amber-400">Record Delay</p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Reason for Delay <span className="text-red-400">*</span></Label>
                <Textarea
                  value={delayReasonInput}
                  onChange={e => setDelayReasonInput(e.target.value)}
                  placeholder="Explain why this stage is delayed..."
                  rows={2}
                  className="text-sm bg-background border-border/60 resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">New Final Date (optional)</Label>
                <Input type="date" value={finalDateInput} onChange={e => setFinalDateInput(e.target.value)}
                  className="h-8 text-sm bg-background border-border/60" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRecordDelay} disabled={stageActionMut.isPending} className="h-7 gap-1 text-xs bg-amber-600 hover:bg-amber-700">
                  {stageActionMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                  Save Delay
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDelayForm(false)} className="h-7 text-xs text-muted-foreground">Cancel</Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!releasedAt && isEditable && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Button
                onClick={handleMarkReleased}
                disabled={isBusy}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-sm"
              >
                {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {OPS_RELEASE_LABELS[container.status] ?? "Mark as Released"}
              </Button>
              {!showDelayForm && (
                <Button
                  variant="outline"
                  onClick={() => setShowDelayForm(true)}
                  className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-sm"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Record Delay
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit to Next Stage — only for admin or non-dept views; dept users advance via their workspace page */}
      {isEditable && nextStage && ["terminal", "pull_out"].includes(container.status) && (!deptScope || isAdmin) && (() => {
        const submitLabel = DEPT_SUBMIT_LABELS["operations_user"]?.[container.status] ?? `Submit to ${getStatusLabel(nextStage)}`;
        const handleSubmit = async () => {
          try {
            await advanceMutation.mutateAsync({ id: container.id, status: nextStage });
            toast({ title: submitLabel });
          } catch (err) {
            toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to advance" });
          }
        };
        return (
          <Card className="border-primary/20 bg-primary/5 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{submitLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Move this job from{" "}
                    <span className="font-medium text-foreground/70">{getStatusLabel(container.status)}</span>
                    {" → "}
                    <span className="font-medium text-primary">{getStatusLabel(nextStage)}</span>
                  </p>
                </div>
                <Button
                  onClick={handleSubmit}
                  disabled={advanceMutation.isPending}
                  className="gap-2 shrink-0"
                >
                  {advanceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  {submitLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}

function TerminalStageTracker({
  container,
  isEditable,
  daysInStage,
  advanceMutation,
  toast,
}: {
  container: Container;
  isEditable: boolean;
  daysInStage: number;
  advanceMutation: ReturnType<typeof useAdvanceContainerStatus>;
  toast: ReturnType<typeof import("@/hooks/use-toast").useToast>["toast"];
}) {
  const updateMutation  = useUpdateContainer();
  const stageActionMut  = useStageAction();
  const isFinalRelease  = container.status === "final_release";

  const [stageOwner, setStageOwner]     = useState(container.stageOwner ?? "");
  const [stageDate, setStageDate]       = useState(container.nextActionDueDate ? container.nextActionDueDate.slice(0, 10) : "");
  const [delayReason, setDelayReason]   = useState(container.delayReason ?? "");
  const [isDirty, setIsDirty]           = useState(false);

  const [expectedDate, setExpectedDate]         = useState((container.expectedReleaseDate as string | null) ? (container.expectedReleaseDate as string).slice(0, 10) : "");
  const [showDelayForm, setShowDelayForm]       = useState(false);
  const [delayInput, setDelayInput]             = useState((container.releaseDelayReason as string | null) ?? "");
  const [releaseDateInput, setReleaseDateInput] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    setStageOwner(container.stageOwner ?? "");
    setStageDate(container.nextActionDueDate ? container.nextActionDueDate.slice(0, 10) : "");
    setDelayReason(container.delayReason ?? "");
    setIsDirty(false);
    setExpectedDate((container.expectedReleaseDate as string | null) ? (container.expectedReleaseDate as string).slice(0, 10) : "");
    setDelayInput((container.releaseDelayReason as string | null) ?? "");
  }, [container.id, container.updatedAt]);

  const nextStage = getNextStage(container.status);
  const submitLabel = DEPT_SUBMIT_LABELS["terminal_manager"]?.[container.status] ?? "Submit";

  const stageDateLabel: Record<string, string> = {
    gate_in:     "Gate-In Date",
    examination: "Expected Exam Date",
  };

  const handleSaveGeneric = async () => {
    try {
      await updateMutation.mutateAsync({ id: container.id, data: { stageOwner: stageOwner || null, nextActionDueDate: stageDate || null, delayReason: delayReason || null } });
      setIsDirty(false);
      toast({ title: "Stage details saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to save" });
    }
  };

  const handleSetExpectedDate = async () => {
    if (!expectedDate) return;
    try {
      await stageActionMut.mutateAsync({ id: container.id, action: "set_expected_date", expectedDate });
      toast({ title: "Expected release date saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed to save" });
    }
  };

  const handleSaveOwner = async () => {
    try {
      await stageActionMut.mutateAsync({ id: container.id, action: "update_stage_owner", stageOwner: stageOwner || null });
      toast({ title: "Stage owner saved" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleMarkReleased = async () => {
    try {
      await stageActionMut.mutateAsync({ id: container.id, action: "mark_released", finalDate: releaseDateInput || undefined });
      toast({ title: "Container marked as released" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleRecordDelay = async () => {
    if (!delayInput.trim()) { toast({ variant: "destructive", title: "Please enter a delay reason" }); return; }
    try {
      await stageActionMut.mutateAsync({ id: container.id, action: "record_delay", delayReason: delayInput });
      setShowDelayForm(false);
      toast({ title: "Delay recorded" });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const handleAdvance = async () => {
    if (!nextStage) return;
    try {
      await advanceMutation.mutateAsync({ id: container.id, status: nextStage });
      toast({ title: submitLabel });
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    }
  };

  const isReleased = !!(container.releaseConfirmedAt as string | null);
  const isBusy     = stageActionMut.isPending || advanceMutation.isPending;

  if (!isFinalRelease) {
    return (
      <div className="space-y-4">
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Current Stage Actions</CardTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className={daysInStage > 14 ? "text-red-400 font-semibold" : daysInStage > 7 ? "text-amber-400 font-semibold" : ""}>{daysInStage}d in stage</span>
                {daysInStage > 7 && <AlertTriangle className={`w-3 h-3 ${daysInStage > 14 ? "text-red-400" : "text-amber-400"}`} />}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="w-3 h-3" />Stage Owner</Label>
                <Input value={stageOwner} onChange={e => { setStageOwner(e.target.value); setIsDirty(true); }} placeholder="Person responsible for this stage" className="h-8 text-sm bg-background border-border/60" disabled={!isEditable} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3 h-3" />{stageDateLabel[container.status] ?? "Stage Date"}</Label>
                <Input type="date" value={stageDate} onChange={e => { setStageDate(e.target.value); setIsDirty(true); }} className="h-8 text-sm bg-background border-border/60" disabled={!isEditable} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><AlertTriangle className="w-3 h-3" />Delay Reason <span className="text-muted-foreground/50">(optional)</span></Label>
              <Textarea value={delayReason} onChange={e => { setDelayReason(e.target.value); setIsDirty(true); }} placeholder="Document any delays or blockers" rows={2} className={`text-sm bg-background border-border/60 resize-none ${delayReason ? "border-amber-500/40 bg-amber-500/5" : ""}`} disabled={!isEditable} />
            </div>
            {isEditable && (
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={handleSaveGeneric} disabled={!isDirty || updateMutation.isPending} className="h-7 gap-1.5 text-xs">
                  {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Changes
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        {isEditable && nextStage && (
          <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{submitLabel}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">This job is ready. Confirm to send it to the next stage.</p>
                </div>
                <Button onClick={handleAdvance} disabled={advanceMutation.isPending} className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700">
                  {advanceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                  {submitLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className={`backdrop-blur-sm ${isReleased ? "bg-emerald-500/5 border-emerald-500/20" : "border-border/50 bg-card/40"}`}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              {isReleased && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              Final Release Tracker
            </CardTitle>
            <div className="flex items-center gap-2">
              {isReleased && (
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                  Released {new Date(container.releaseConfirmedAt as string).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                </span>
              )}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                <span className={daysInStage > 14 ? "text-red-400 font-semibold" : daysInStage > 7 ? "text-amber-400 font-semibold" : ""}>{daysInStage}d in stage</span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditable && (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="w-3 h-3" />Stage Owner</Label>
                <Input value={stageOwner} onChange={e => setStageOwner(e.target.value)} placeholder="Person responsible for this stage" className="h-8 text-sm bg-background border-border/60" />
              </div>
              <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleSaveOwner} disabled={stageActionMut.isPending}>
                <Save className="w-3 h-3" /> Save
              </Button>
            </div>
          )}

          {!isReleased && (
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Calendar className="w-3 h-3" />Expected Release Date</Label>
                <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} className="h-8 text-sm bg-background border-border/60" disabled={!isEditable} />
              </div>
              {isEditable && (
                <Button size="sm" className="h-8 gap-1.5 text-xs shrink-0" onClick={handleSetExpectedDate} disabled={!expectedDate || stageActionMut.isPending}>
                  {stageActionMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Set Date
                </Button>
              )}
            </div>
          )}

          {isReleased && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Released on <strong>{new Date(container.releaseConfirmedAt as string).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}</strong></span>
            </div>
          )}

          {(container.releaseDelayReason as string | null) && !showDelayForm && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Delay Recorded</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{container.releaseDelayReason as string}</p>
            </div>
          )}

          {showDelayForm && isEditable && (
            <div className="space-y-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
              <p className="text-xs font-semibold text-amber-400">Record Release Delay</p>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Reason for Delay <span className="text-red-400">*</span></Label>
                <Textarea value={delayInput} onChange={e => setDelayInput(e.target.value)} placeholder="Why is NCS release delayed?" rows={2} className="text-sm bg-background border-border/60 resize-none" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleRecordDelay} disabled={stageActionMut.isPending} className="h-7 gap-1 text-xs bg-amber-600 hover:bg-amber-700">
                  {stageActionMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save Delay
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDelayForm(false)} className="h-7 text-xs text-muted-foreground">Cancel</Button>
              </div>
            </div>
          )}

          {!isReleased && isEditable && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" />Actual Release Date</Label>
                <Input type="date" value={releaseDateInput} onChange={e => setReleaseDateInput(e.target.value)} className="h-8 text-sm bg-background border-border/60" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button onClick={handleMarkReleased} disabled={isBusy} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-sm">
                  {isBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {OPS_RELEASE_LABELS[container.status] ?? "Mark as Released"}
                </Button>
                {!showDelayForm && (
                  <Button variant="outline" onClick={() => setShowDelayForm(true)} className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 text-sm">
                    <AlertTriangle className="w-4 h-4" /> Record Delay
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {isEditable && nextStage && (
        <Card className="border-amber-500/20 bg-amber-500/5 backdrop-blur-sm">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{submitLabel}</p>
                <p className="text-xs text-muted-foreground mt-0.5">This job is ready. Confirm to send it to the next department.</p>
              </div>
              <Button onClick={handleAdvance} disabled={advanceMutation.isPending} className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700">
                {advanceMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                {submitLabel}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const DEPT_STAGE_MAP: Record<string, string> = {
  shipping: "shipping",
  terminal: "terminal",
  "pull-out": "pull_out",
  transire: "transire_processing",
};

const DEPT_LABEL_MAP: Record<string, string> = {
  shipping: "Shipping",
  terminal: "Terminal",
  "pull-out": "Pull-Out",
  transire: "Transire",
};

function OperationalForm({
  container,
  isAdmin,
  isOperationsUser,
  isDocumentationUser,
  isAccountsUser,
  isTerminalManager,
  isDeliveryUser,
  isShippingUser,
  isTerminalUser,
  isPullOutUser,
  deptScope,
}: {
  container: Container;
  isAdmin: boolean;
  isOperationsUser: boolean;
  isDocumentationUser: boolean;
  isAccountsUser: boolean;
  isTerminalManager: boolean;
  isDeliveryUser: boolean;
  isShippingUser: boolean;
  isTerminalUser: boolean;
  isPullOutUser: boolean;
  deptScope: string | null;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdateContainer();
  const advanceMutation = useAdvanceContainerStatus();

  const [stageOwner, setStageOwner] = useState(container.stageOwner ?? "");
  const [nextAction, setNextAction] = useState(container.nextAction ?? "");
  const [nextActionDueDate, setNextActionDueDate] = useState(
    container.nextActionDueDate ? container.nextActionDueDate.slice(0, 10) : ""
  );
  const [delayReason, setDelayReason] = useState(container.delayReason ?? "");
  const [isDirty, setIsDirty] = useState(false);

  const [dex, setDex] = useState({
    deliveryTime: container.deliveryTime ?? "",
    deliveryLocation: container.deliveryLocation ?? "",
    truckNumber: container.truckNumber ?? "",
    driverName: container.driverName ?? "",
    driverPhone: container.driverPhone ?? "",
    dispatchOfficer: container.dispatchOfficer ?? "",
    deliveryStatus: (container.deliveryStatus ?? "pending") as "pending" | "in_transit" | "delivered",
    offloadingConfirmed: container.offloadingConfirmed ?? false,
    emptyReturnDueDate: container.emptyReturnDueDate ? container.emptyReturnDueDate.slice(0, 10) : "",
    emptyReturnDate: container.emptyReturnDate ? container.emptyReturnDate.slice(0, 10) : "",
    deliveredAt: container.deliveredAt ? container.deliveredAt.slice(0, 10) : "",
    deliveredAtEstimated: container.deliveredAtEstimated ?? false,
  });
  const [isEditingDex, setIsEditingDex] = useState(false);
  const updateDeliveryExecution = useUpdateDeliveryExecution();

  useEffect(() => {
    setStageOwner(container.stageOwner ?? "");
    setNextAction(container.nextAction ?? "");
    setNextActionDueDate(
      container.nextActionDueDate ? container.nextActionDueDate.slice(0, 10) : ""
    );
    setDelayReason(container.delayReason ?? "");
    setIsDirty(false);
    setDex({
      deliveryTime: container.deliveryTime ?? "",
      deliveryLocation: container.deliveryLocation ?? "",
      truckNumber: container.truckNumber ?? "",
      driverName: container.driverName ?? "",
      driverPhone: container.driverPhone ?? "",
      dispatchOfficer: container.dispatchOfficer ?? "",
      deliveryStatus: (container.deliveryStatus ?? "pending") as "pending" | "in_transit" | "delivered",
      offloadingConfirmed: container.offloadingConfirmed ?? false,
      emptyReturnDueDate: container.emptyReturnDueDate ? container.emptyReturnDueDate.slice(0, 10) : "",
      emptyReturnDate: container.emptyReturnDate ? container.emptyReturnDate.slice(0, 10) : "",
      deliveredAt: container.deliveredAt ? container.deliveredAt.slice(0, 10) : "",
      deliveredAtEstimated: container.deliveredAtEstimated ?? false,
    });
  }, [container.id, container.updatedAt]);

  const markDirty = () => setIsDirty(true);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: container.id,
        data: {
          stageOwner: stageOwner || null,
          nextAction: nextAction || null,
          nextActionDueDate: nextActionDueDate || null,
          delayReason: delayReason || null,
        },
      });
      setIsDirty(false);
      toast({ title: "Workflow updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleReset = () => {
    setStageOwner(container.stageOwner ?? "");
    setNextAction(container.nextAction ?? "");
    setNextActionDueDate(
      container.nextActionDueDate ? container.nextActionDueDate.slice(0, 10) : ""
    );
    setDelayReason(container.delayReason ?? "");
    setIsDirty(false);
  };

  const handleOpenDex = () => {
    setDex({
      deliveryTime: container.deliveryTime ?? "",
      deliveryLocation: container.deliveryLocation ?? "",
      truckNumber: container.truckNumber ?? "",
      driverName: container.driverName ?? "",
      driverPhone: container.driverPhone ?? "",
      dispatchOfficer: container.dispatchOfficer ?? "",
      deliveryStatus: (container.deliveryStatus as "pending" | "in_transit" | "delivered") ?? "pending",
      offloadingConfirmed: container.offloadingConfirmed ?? false,
      emptyReturnDueDate: container.emptyReturnDueDate ? container.emptyReturnDueDate.slice(0, 10) : "",
      emptyReturnDate: container.emptyReturnDate ? container.emptyReturnDate.slice(0, 10) : "",
      deliveredAt: container.deliveredAt ? container.deliveredAt.slice(0, 10) : "",
      deliveredAtEstimated: container.deliveredAtEstimated ?? false,
    });
    setIsEditingDex(true);
  };

  const handleSaveDex = async () => {
    try {
      await updateDeliveryExecution.mutateAsync({
        id: container.id,
        deliveryTime: dex.deliveryTime || null,
        deliveryLocation: dex.deliveryLocation || null,
        truckNumber: dex.truckNumber || null,
        driverName: dex.driverName || null,
        driverPhone: dex.driverPhone || null,
        dispatchOfficer: dex.dispatchOfficer || null,
        deliveryStatus: dex.deliveryStatus,
        offloadingConfirmed: dex.offloadingConfirmed,
        emptyReturnDueDate: dex.emptyReturnDueDate || null,
        emptyReturnDate: dex.emptyReturnDate || null,
        deliveredAt: dex.deliveredAt || null,
        deliveredAtEstimated: dex.deliveredAtEstimated,
      });
      setIsEditingDex(false);
      toast({ title: "Delivery execution saved" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const nextStage = getNextStage(container.status);
  const nextStageLabel = nextStage ? getStatusLabel(nextStage) : null;

  const handleAdvance = async () => {
    if (!nextStage) return;
    try {
      await advanceMutation.mutateAsync({ id: container.id, status: nextStage });
      toast({ title: `Advanced to ${nextStageLabel}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to advance";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleNavigateStage = async (targetStage: string) => {
    try {
      await advanceMutation.mutateAsync({ id: container.id, status: targetStage });
      toast({ title: `Moved to ${getStatusLabel(targetStage)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change stage";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const isDeptUser = isOperationsUser || isDocumentationUser || isAccountsUser || isTerminalManager || isDeliveryUser || isShippingUser || isTerminalUser || isPullOutUser;
  const isEditable = isAdmin || isDeptUser;
  const daysInStage = daysAgo(container.updatedAt);
  const isOverdue =
    nextActionDueDate && new Date(nextActionDueDate) < new Date();

  const isDeliveryStage    = container.status === "delivery";
  const isDutyPaymentStage = container.status === "duty_payment";
  const isOpsStage         = OPS_STAGES.includes(container.status);
  const [, navigate] = useLocation();
  const stageActionMut = useStageAction();

  const dexStatusColor: Record<string, string> = {
    pending: "text-muted-foreground bg-muted/50 border-border/50",
    in_transit: "text-blue-400 bg-blue-500/10 border-blue-500/30",
    delivered: "text-green-400 bg-green-500/10 border-green-500/30",
  };
  const dexStatusLabel: Record<string, string> = { pending: "Pending", in_transit: "In Transit", delivered: "Delivered" };

  if (isDutyPaymentStage) {
    return (
      <Card className="border-orange-500/30 bg-orange-500/5">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <span className="text-orange-400 text-base">₦</span> Duty Payment Required
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Record the duty payment to automatically advance this job to the next stage.
              </p>
            </div>
            <Button
              onClick={() => navigate(`/duty-payments?focus=${container.id}`)}
              className="gap-2 shrink-0 bg-orange-600 hover:bg-orange-700"
            >
              <ChevronRight className="w-4 h-4" />
              Pay Duty
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Dept-scoped view: when a dept user arrives via ?dept=... param, restrict
  // the form to show only their stage. If the container has moved to a different
  // stage, display an informational notice instead of the stage tracker.
  if (deptScope && !isAdmin) {
    const expectedStage = DEPT_STAGE_MAP[deptScope];
    const deptLabel = DEPT_LABEL_MAP[deptScope] ?? deptScope;
    if (expectedStage && container.status !== expectedStage) {
      const isPast = (() => {
        const order = ["registered", "documentation", "duty_assessment", "duty_payment", "transire_processing", "shipping", "terminal", "pull_out", "gate_in", "examination", "final_release", "delivery", "closed"];
        return order.indexOf(container.status) > order.indexOf(expectedStage);
      })();
      return (
        <Card className={`border-border/50 ${isPast ? "bg-teal-500/5 border-teal-500/20" : "bg-amber-500/5 border-amber-500/20"}`}>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${isPast ? "bg-teal-500/10" : "bg-amber-500/10"}`}>
                {isPast
                  ? <CheckCircle2 className="w-4 h-4 text-teal-400" />
                  : <AlertTriangle className="w-4 h-4 text-amber-400" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {isPast ? `${deptLabel} stage is complete` : `Container not yet at ${deptLabel} stage`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isPast
                    ? `This job has already moved past the ${deptLabel} stage. No further action is needed from your department.`
                    : `This job is currently at an earlier stage. It will appear in your queue once it reaches the ${deptLabel} stage.`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  if (isOpsStage) {
    return <OpsStageTracker
      container={container}
      isEditable={isEditable}
      daysInStage={daysInStage}
      stageOwner={stageOwner}
      setStageOwner={setStageOwner}
      stageActionMut={stageActionMut}
      advanceMutation={advanceMutation}
      updateMutation={updateMutation}
      toast={toast}
      deptScope={deptScope}
      isAdmin={isAdmin}
    />;
  }

  const isTerminalStage = TERMINAL_STAGES.includes(container.status);
  if (isTerminalStage) {
    return (
      <TerminalStageTracker
        container={container}
        isEditable={isEditable}
        daysInStage={daysInStage}
        advanceMutation={advanceMutation}
        toast={toast}
      />
    );
  }

  return (
    <div className="space-y-4">
      {isDeliveryStage ? (
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Truck className="w-4 h-4 text-teal-400" /> Delivery Execution
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  <span className={daysInStage > 14 ? "text-red-400 font-semibold" : daysInStage > 7 ? "text-amber-400 font-semibold" : ""}>{daysInStage}d in stage</span>
                  {daysInStage > 7 && <AlertTriangle className={`w-3 h-3 ${daysInStage > 14 ? "text-red-400" : "text-amber-400"}`} />}
                </div>
                {(isAdmin || isDeliveryUser) && !isEditingDex && (
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={handleOpenDex}>
                    <Pencil className="w-3 h-3" /> Edit
                  </Button>
                )}
                {isEditingDex && (
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs px-3 gap-1" onClick={handleSaveDex} disabled={updateDeliveryExecution.isPending}>
                      {updateDeliveryExecution.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setIsEditingDex(false)}>Cancel</Button>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {isEditingDex ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Navigation className="w-3 h-3" /> Delivery Status</Label>
                  <div className="flex gap-2 flex-wrap">
                    {(["pending", "in_transit", "delivered"] as const).map(s => (
                      <button key={s} onClick={() => setDex(d => ({ ...d, deliveryStatus: s }))}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${dex.deliveryStatus === s ? s === "delivered" ? "bg-green-500/20 border-green-500/40 text-green-400" : s === "in_transit" ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-muted/70 border-border text-muted-foreground" : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"}`}>
                        {s === "pending" ? "Pending" : s === "in_transit" ? "In Transit" : "Delivered"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Truck className="w-3 h-3" /> Truck Number</Label>
                    <Input value={dex.truckNumber} onChange={e => setDex(d => ({ ...d, truckNumber: e.target.value }))} placeholder="e.g. LAG-123AB" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><UserIcon className="w-3 h-3" /> Driver Name</Label>
                    <Input value={dex.driverName} onChange={e => setDex(d => ({ ...d, driverName: e.target.value }))} placeholder="Driver's full name" className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /> Driver Phone</Label>
                    <Input value={dex.driverPhone} onChange={e => setDex(d => ({ ...d, driverPhone: e.target.value }))} placeholder="+234..." className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><UserIcon className="w-3 h-3" /> Dispatch Officer</Label>
                    <Input value={dex.dispatchOfficer} onChange={e => setDex(d => ({ ...d, dispatchOfficer: e.target.value }))} placeholder="Officer name" className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> Delivery Time</Label>
                    <Input value={dex.deliveryTime} onChange={e => setDex(d => ({ ...d, deliveryTime: e.target.value }))} placeholder="e.g. 09:30" className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Delivery Location</Label>
                    <Input value={dex.deliveryLocation} onChange={e => setDex(d => ({ ...d, deliveryLocation: e.target.value }))} placeholder="e.g. Apapa Wharf" className="h-8 text-xs" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" /> Empty Return Due Date</Label>
                    <Input type="date" value={dex.emptyReturnDueDate} onChange={e => setDex(d => ({ ...d, emptyReturnDueDate: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" /> Empty Return Date</Label>
                    <Input type="date" value={dex.emptyReturnDate} onChange={e => setDex(d => ({ ...d, emptyReturnDate: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={dex.offloadingConfirmed} onCheckedChange={v => setDex(d => ({ ...d, offloadingConfirmed: v }))} id="ops-offloading-switch" />
                  <Label htmlFor="ops-offloading-switch" className="text-xs cursor-pointer">Offloading Confirmed</Label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Delivery Date (Actual)</Label>
                    <Input type="date" value={dex.deliveredAt} onChange={e => setDex(d => ({ ...d, deliveredAt: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch checked={dex.deliveredAtEstimated} onCheckedChange={v => setDex(d => ({ ...d, deliveredAtEstimated: v }))} id="ops-delivered-estimated" />
                    <Label htmlFor="ops-delivered-estimated" className="text-xs cursor-pointer">Date is estimated</Label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${dexStatusColor[dex.deliveryStatus]}`}>
                    {dex.deliveryStatus === "in_transit" && <Truck className="w-3 h-3" />}
                    {dex.deliveryStatus === "delivered" && <CheckCircle2 className="w-3 h-3" />}
                    {dexStatusLabel[dex.deliveryStatus]}
                  </span>
                  {dex.offloadingConfirmed && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border text-green-400 bg-green-500/10 border-green-500/30">
                      <CheckSquare className="w-3 h-3" /> Offloading Confirmed
                    </span>
                  )}
                </div>
                {(dex.truckNumber || dex.driverName || dex.dispatchOfficer || dex.deliveryLocation || dex.emptyReturnDueDate || dex.deliveredAt) ? (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                    {dex.truckNumber && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Truck className="w-3 h-3 shrink-0" />
                        <span className="text-foreground font-medium">{dex.truckNumber}</span>
                      </div>
                    )}
                    {dex.driverName && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <UserIcon className="w-3 h-3 shrink-0" />
                        <span className="text-foreground">{dex.driverName}</span>
                        {dex.driverPhone && <span className="text-muted-foreground">· {dex.driverPhone}</span>}
                      </div>
                    )}
                    {dex.dispatchOfficer && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <ClipboardCheck className="w-3 h-3 shrink-0" />
                        <span className="text-foreground">{dex.dispatchOfficer}</span>
                      </div>
                    )}
                    {dex.deliveryLocation && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="text-foreground">{dex.deliveryLocation}</span>
                        {dex.deliveryTime && <span className="text-muted-foreground">· {dex.deliveryTime}</span>}
                      </div>
                    )}
                    {dex.emptyReturnDueDate && (
                      <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                        <Package className="w-3 h-3 shrink-0" />
                        <span>Empty return due: <span className={`font-medium ${dex.emptyReturnDate ? "text-green-400" : new Date(dex.emptyReturnDueDate) < new Date() ? "text-orange-400" : "text-foreground"}`}>{new Date(dex.emptyReturnDueDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                        {dex.emptyReturnDate && <span className="text-green-400 font-medium">· Returned {new Date(dex.emptyReturnDate).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>}
                      </div>
                    )}
                    {dex.deliveredAt && (
                      <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                        <CheckCircle2 className="w-3 h-3 shrink-0 text-green-400" />
                        <span>Delivery date: <span className="font-medium text-foreground">{new Date(dex.deliveredAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                        {dex.deliveredAtEstimated && <span className="text-amber-400 text-[10px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-medium">estimated</span>}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60">No delivery details recorded yet. {(isAdmin || isDeliveryUser) ? "Click Edit to add truck, driver and dispatch information." : ""}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
      <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Current Stage Actions
            </CardTitle>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span
                className={
                  daysInStage > 14
                    ? "text-red-400 font-semibold"
                    : daysInStage > 7
                    ? "text-amber-400 font-semibold"
                    : ""
                }
              >
                {daysInStage}d in stage
              </span>
              {daysInStage > 7 && (
                <AlertTriangle
                  className={`w-3 h-3 ${daysInStage > 14 ? "text-red-400" : "text-amber-400"}`}
                />
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <User className="w-3 h-3" />
                Stage Owner
              </Label>
              <Input
                value={stageOwner}
                onChange={(e) => {
                  setStageOwner(e.target.value);
                  markDirty();
                }}
                placeholder="Person responsible for this stage"
                className="h-8 text-sm bg-background border-border/60"
                disabled={!isEditable}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                Next Action Due Date
              </Label>
              <Input
                type="date"
                value={nextActionDueDate}
                onChange={(e) => {
                  setNextActionDueDate(e.target.value);
                  markDirty();
                }}
                className={`h-8 text-sm bg-background border-border/60 ${
                  isOverdue ? "border-red-500/50 text-red-400" : ""
                }`}
                disabled={!isEditable}
              />
              {isOverdue && (
                <p className="text-[10px] text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  Overdue
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3 h-3" />
              Next Action
            </Label>
            <Input
              value={nextAction}
              onChange={(e) => {
                setNextAction(e.target.value);
                markDirty();
              }}
              placeholder="Describe the next required action"
              className="h-8 text-sm bg-background border-border/60"
              disabled={!isEditable}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" />
              Delay Reason
              <span className="text-muted-foreground/50">(optional)</span>
            </Label>
            <Textarea
              value={delayReason}
              onChange={(e) => {
                setDelayReason(e.target.value);
                markDirty();
              }}
              placeholder="Document any delays or blockers"
              rows={2}
              className={`text-sm bg-background border-border/60 resize-none ${
                delayReason ? "border-amber-500/40 bg-amber-500/5" : ""
              }`}
              disabled={!isEditable}
            />
          </div>

          {isEditable && (
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!isDirty || updateMutation.isPending}
                className="h-7 gap-1.5 text-xs"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Save className="w-3 h-3" />
                )}
                Save Changes
              </Button>
              {isDirty && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleReset}
                  className="h-7 gap-1.5 text-xs text-muted-foreground"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {isEditable && nextStage && (!deptScope || isAdmin) && (() => {
        const deptRole = isDocumentationUser ? "documentation_user"
          : isAccountsUser    ? "accounts_user"
          : isTerminalManager ? "terminal_manager"
          : isDeliveryUser    ? "delivery_user"
          : isOperationsUser  ? "operations_user"
          : isShippingUser    ? "shipping_user"
          : isTerminalUser    ? "terminal_user"
          : isPullOutUser     ? "pull_out_user"
          : null;
        const deptLabel = deptRole
          ? DEPT_SUBMIT_LABELS[deptRole]?.[container.status]
          : undefined;
        const isClose = container.status === "delivery";
        const isFinalDept = !!deptLabel;
        const cardBorder = isClose
          ? "border-emerald-500/30 bg-emerald-500/5"
          : isFinalDept
          ? "border-amber-500/20 bg-amber-500/5"
          : "border-primary/20 bg-primary/5";
        const btnClass = isClose
          ? "bg-emerald-600 hover:bg-emerald-700"
          : isFinalDept
          ? "bg-amber-600 hover:bg-amber-700"
          : "";
        const buttonLabel = deptLabel ?? nextStageLabel;
        const cardTitle = deptLabel ?? "Advance to Next Stage";
        const cardDesc = deptLabel
          ? `This job is ready. Confirm to send it to the next department.`
          : (
            <>
              Move this container from{" "}
              <span className="font-medium text-foreground/70">
                {getStatusLabel(container.status)}
              </span>{" "}
              →{" "}
              <span className="font-medium text-primary">
                {nextStageLabel}
              </span>
            </>
          );
        return (
          <Card className={`backdrop-blur-sm ${cardBorder}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{cardTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{cardDesc}</p>
                </div>
                <Button
                  onClick={handleAdvance}
                  disabled={advanceMutation.isPending}
                  className={`gap-2 shrink-0 ${btnClass}`}
                >
                  {advanceMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  {buttonLabel}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {container.status === "closed" && (
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-400">
                  Container Closed
                </p>
                <p className="text-xs text-muted-foreground">
                  This container has completed all stages and is closed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PaarPanel({
  container,
  isAdmin,
}: {
  container: Container;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const updatePaar = useUpdatePaar();
  const [editing, setEditing] = useState(false);
  const [officer, setOfficer] = useState(container.paarOfficer ?? "");
  const [releasedAt, setReleasedAt] = useState(
    container.paarReleasedAt ? container.paarReleasedAt.slice(0, 10) : ""
  );
  const [delayReason, setDelayReason] = useState(container.paarDelayReason ?? "");

  useEffect(() => {
    setOfficer(container.paarOfficer ?? "");
    setReleasedAt(container.paarReleasedAt ? container.paarReleasedAt.slice(0, 10) : "");
    setDelayReason(container.paarDelayReason ?? "");
    setEditing(false);
  }, [container.id, container.updatedAt]);

  const handleSave = async () => {
    try {
      await updatePaar.mutateAsync({
        id: container.id,
        paarOfficer: officer || null,
        paarReleasedAt: releasedAt || null,
        paarDelayReason: delayReason || null,
      });
      toast({ title: "PAAR status updated" });
      setEditing(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const isReleased = !!container.paarReleasedAt;

  return (
    <Card className={`border backdrop-blur-sm ${isReleased ? "border-emerald-500/20 bg-emerald-500/5" : container.paarDelayReason ? "border-amber-500/20 bg-amber-500/5" : "border-border/50 bg-card/40"}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck2 className={`w-4 h-4 ${isReleased ? "text-emerald-400" : container.paarDelayReason ? "text-amber-400" : "text-muted-foreground"}`} />
            Documentation / PAAR Status
          </CardTitle>
          <div className="flex items-center gap-2">
            {isReleased ? (
              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Released
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-2 py-0.5">
                <Clock className="w-2.5 h-2.5" />
                {container.paarDelayReason ? "Delayed" : "Pending"}
              </span>
            )}
            {isAdmin && !editing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(true)}
                className="h-6 text-[10px] px-2"
              >
                Update
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {!editing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Officer:</span>
              <span className="text-foreground/80">{container.paarOfficer ?? "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Released:</span>
              <span className={container.paarReleasedAt ? "text-emerald-400 font-medium" : "text-muted-foreground/50"}>
                {container.paarReleasedAt
                  ? new Date(container.paarReleasedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
                  : "Not yet released"}
              </span>
            </div>
            {container.paarDelayReason && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <span className="text-amber-400/80 leading-relaxed">{container.paarDelayReason}</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Documentation Officer</Label>
                <Input
                  value={officer}
                  onChange={(e) => setOfficer(e.target.value)}
                  placeholder="Officer name"
                  className="h-7 text-xs bg-background border-border/60"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">PAAR Release Date</Label>
                <Input
                  type="date"
                  value={releasedAt}
                  onChange={(e) => setReleasedAt(e.target.value)}
                  className="h-7 text-xs bg-background border-border/60"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Delay Reason <span className="text-muted-foreground/50">(if PAAR not ready)</span>
              </Label>
              <Textarea
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                placeholder="State why PAAR is delayed"
                rows={2}
                className="text-xs bg-background border-border/60 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSave} disabled={updatePaar.isPending} className="h-7 gap-1 text-xs">
                {updatePaar.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs text-muted-foreground">
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AuditLog({ containerId }: { containerId: number }) {
  const { data: log, isLoading } = useGetContainerAuditLog(containerId);

  const stageEntries = (log ?? [])
    .filter((e) => e.action === "stage_change" || e.action === "stage_control" || e.fieldChanged === "status")
    .slice(0, 10);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (stageEntries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-6">
        No stage history recorded yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {stageEntries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-start gap-3 py-2 border-b border-border/30 last:border-0"
        >
          <div className="w-6 h-6 rounded-full bg-muted/40 border border-border/40 flex items-center justify-center shrink-0 mt-0.5">
            <Activity className="w-3 h-3 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-foreground">
              {entry.action === "stage_change" || entry.fieldChanged === "status" ? (
                <>
                  <span className="font-medium">{entry.userName}</span> moved to{" "}
                  <span className="font-medium text-primary">
                    {entry.newValue ? getStatusLabel(entry.newValue) : entry.newValue}
                  </span>
                </>
              ) : (
                <span>
                  <span className="font-medium">{entry.userName}</span>{" "}
                  {entry.action}
                </span>
              )}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {new Date(entry.createdAt).toLocaleString("en-NG", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OperationDetailPage({ params }: { params: { id: string } }) {
  const containerId = parseInt(params.id, 10);
  const { isAdmin, isOperationsUser, isDocumentationUser, isAccountsUser, isTerminalManager, isDeliveryUser, isSecurityUser, isShippingUser, isTerminalUser, isPullOutUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const navMutation = useAdvanceContainerStatus();

  // All hooks must run before any conditional returns
  const { data, isLoading, isError } = useGetContainer(containerId, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 30_000 } as any,
  });

  // Security users have no business on this page — redirect to gate
  useEffect(() => {
    if (isSecurityUser) navigate("/gate", { replace: true });
  }, [isSecurityUser, navigate]);

  if (isSecurityUser) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-muted-foreground text-sm">Container not found.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/operations")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Operations
        </Button>
      </div>
    );
  }

  const container: Container = data.container;
  const statusColorClass = getStatusColor(container.status);
  const currentStageLabel = getStatusLabel(container.status);
  const isPipeline = container.status !== "pending_verification";

  // Derive dept scope from the user's role(s) — role-authoritative.
  // Multi-role users (e.g. shipping_terminal_user) may honor the ?dept= query param
  // if it corresponds to one of their permitted depts. Single-role users always get
  // their fixed dept. Admins may use ?dept= freely to preview any dept view.
  const ROLE_DEPT_MAP: Record<string, string[]> = {
    shipping_user:          ["shipping"],
    shipping_terminal_user: ["shipping", "terminal"],
    terminal_user:          ["terminal"],
    pull_out_user:          ["pull-out"],
    transire_user:          ["transire"],
    operations_user:        ["transire"],
  };
  const { isShippingTerminalUser, isTransireUser } = useAuth();
  // Build the set of dept keys this user is allowed to scope to
  const allowedDepts = new Set<string>([
    ...(isShippingUser        ? ["shipping"]             : []),
    ...(isShippingTerminalUser ? ["shipping", "terminal"] : []),
    ...(isTerminalUser        ? ["terminal"]             : []),
    ...(isPullOutUser         ? ["pull-out"]             : []),
    ...(isTransireUser        ? ["transire"]             : []),
    ...(isOperationsUser      ? ["transire"]             : []),
  ]);
  const queryDept = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("dept")
    : null;
  // deptScope derivation:
  // - Admins: use ?dept= if it's a known dept key, else null (no scoping)
  // - Non-admins with no dept roles: null (no scoping, sees full view)
  // - Non-admins with exactly one allowed dept: always use that dept (ignores query param)
  // - Non-admins with multiple allowed depts (e.g. shipping_terminal_user): honor
  //   ?dept= if it matches one of their depts, else fall back to first dept
  const VALID_DEPTS = Object.values(ROLE_DEPT_MAP).flat();
  const deptScope = isAdmin
    ? (queryDept && VALID_DEPTS.includes(queryDept) ? queryDept : null)
    : allowedDepts.size === 0
      ? null
      : allowedDepts.size === 1
        ? [...allowedDepts][0]
        : (queryDept && allowedDepts.has(queryDept) ? queryDept : [...allowedDepts][0]);

  const handleStageNavigate = async (targetStage: string) => {
    try {
      await navMutation.mutateAsync({ id: container.id, status: targetStage });
      toast({ title: `Moved to ${getStatusLabel(targetStage)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change stage";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        {(() => {
          const fromUrl = typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("from")
            : null;
          const defaultHref = isDocumentationUser ? "/workspace/documentation"
            : isAccountsUser    ? "/workspace/accounts"
            : isTerminalManager ? "/workspace/terminal"
            : isDeliveryUser    ? "/workspace/delivery"
            : isOperationsUser  ? "/workspace/operations"
            : isShippingUser    ? "/workspace/shipping"
            : isTerminalUser    ? "/workspace/terminal-ops"
            : isPullOutUser     ? "/workspace/pull-out"
            : "/operations";
          const defaultLabel = isDocumentationUser ? "My Jobs"
            : isAccountsUser    ? "Duty Payments"
            : isTerminalManager ? "Terminal Workspace"
            : isDeliveryUser    ? "Deliveries"
            : isOperationsUser  ? "My Jobs"
            : isShippingUser    ? "Shipping Jobs"
            : isTerminalUser    ? "Terminal Jobs"
            : isPullOutUser     ? "Pull-Out Jobs"
            : "Operations Board";
          return (
            <Link href={fromUrl ?? defaultHref}>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground h-8 px-2">
                <ArrowLeft className="w-3.5 h-3.5" />
                {fromUrl ? "Back" : defaultLabel}
              </Button>
            </Link>
          );
        })()}
        <span className="text-border/40">/</span>
        <span className="text-sm text-muted-foreground font-mono">
          {container.containerNumber}
        </span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <ContainerIcon className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold font-mono text-foreground tracking-tight">
                {container.containerNumber}
              </h1>
              {container.blNumber && (
                <p className="text-sm text-muted-foreground font-mono">
                  BL: {container.blNumber}
                </p>
              )}
            </div>
            <Badge className={`border text-xs ${statusColorClass}`}>
              {currentStageLabel}
            </Badge>
          </div>

          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
            {container.customerName && (
              <span className="flex items-center gap-1.5">
                <User className="w-3 h-3" />
                {container.customerName}
              </span>
            )}
            {container.vessel && (
              <span className="flex items-center gap-1.5">
                <Ship className="w-3 h-3" />
                {container.vessel}
              </span>
            )}
            {container.size && (
              <span className="flex items-center gap-1.5">
                <ContainerIcon className="w-3 h-3" />
                {container.size}
              </span>
            )}
            {container.assignedStaffName && (
              <span className="flex items-center gap-1.5">
                <User className="w-3 h-3 text-primary/60" />
                <span className="text-foreground/70">
                  {container.assignedStaffName}
                </span>
              </span>
            )}
          </div>
        </div>

        {isAdmin && (
          <Link href={`/containers/${container.id}`}>
            <Button variant="outline" size="sm" className="gap-2 shrink-0 h-8">
              <FileText className="w-3.5 h-3.5" />
              Financial Records
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </Button>
          </Link>
        )}
      </div>

      {isPipeline && !deptScope && (
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Pipeline Progress
            </p>
            <StageRail
              currentStatus={container.status}
              onNavigate={isAdmin ? handleStageNavigate : undefined}
              isAdmin={isAdmin ?? false}
              isOperationsUser={(isOperationsUser || isShippingUser || isTerminalUser || isPullOutUser) ?? false}
              isDocumentationUser={isDocumentationUser ?? false}
              isAccountsUser={isAccountsUser ?? false}
              isTerminalManager={isTerminalManager ?? false}
              isDeliveryUser={isDeliveryUser ?? false}
            />
          </CardContent>
        </Card>
      )}

      {!isPipeline && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">
            This container is pending verification and has not entered the pipeline.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <OperationalForm
            container={container}
            isAdmin={isAdmin ?? false}
            isOperationsUser={isOperationsUser ?? false}
            isDocumentationUser={isDocumentationUser ?? false}
            isAccountsUser={isAccountsUser ?? false}
            isTerminalManager={isTerminalManager ?? false}
            isDeliveryUser={isDeliveryUser ?? false}
            isShippingUser={isShippingUser ?? false}
            isTerminalUser={isTerminalUser ?? false}
            isPullOutUser={isPullOutUser ?? false}
            deptScope={deptScope}
          />
          {(!deptScope || isAdmin) && (
            <PaarPanel
              container={container}
              isAdmin={isAdmin ?? false}
            />
          )}
        </div>

        <div className="space-y-4">
          {(!deptScope || isAdmin) && (
            <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  Stage History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AuditLog containerId={container.id} />
              </CardContent>
            </Card>
          )}

          <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {container.declaration && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Declaration</span>
                  <span className="font-mono text-foreground/80">{container.declaration}</span>
                </div>
              )}
              <Separator className="my-1 bg-border/30" />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span className="text-foreground/80">
                  {new Date(container.createdAt).toLocaleDateString("en-NG", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              {container.stageOwner && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stage Owner</span>
                  <span className="text-foreground/80 truncate max-w-[120px] text-right">
                    {container.stageOwner}
                  </span>
                </div>
              )}
              {container.nextActionDueDate && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Action Due</span>
                  <span
                    className={
                      new Date(container.nextActionDueDate) < new Date()
                        ? "text-red-400 font-medium"
                        : "text-foreground/80"
                    }
                  >
                    {new Date(container.nextActionDueDate).toLocaleDateString(
                      "en-NG",
                      { day: "numeric", month: "short" }
                    )}
                  </span>
                </div>
              )}
              {container.delayReason && (
                <>
                  <Separator className="my-1 bg-border/30" />
                  <div>
                    <span className="text-amber-400 text-[10px] font-medium flex items-center gap-1 mb-1">
                      <AlertTriangle className="w-2.5 h-2.5" />
                      Delay Noted
                    </span>
                    <p className="text-muted-foreground text-[10px] leading-relaxed">
                      {container.delayReason}
                    </p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
