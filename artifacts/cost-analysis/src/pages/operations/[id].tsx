import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  useGetContainer,
  getGetContainerQueryKey,
  useUpdateContainer,
  useAdvanceContainerStatus,
  useGetContainerAuditLog,
  useUpdatePaar,
  useUpdateDeliveryExecution,
  type Container,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import {
  WORKFLOW_STAGES,
  getStatusLabel,
  getStatusColor,
  getNextStage,
  getStageIndex,
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
  Phone,
  MapPin,
  Package,
  Navigation,
  Pencil,
  CheckSquare,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

const PIPELINE_STAGES = WORKFLOW_STAGES.filter(
  (s) => s.value !== "pending_verification"
);

const OPS_STAGES      = ["transire_processing", "shipping_terminal_payment", "pull_out"];
const DOCS_STAGES     = ["registered", "documentation", "duty_assessment"];
const ACCOUNTS_STAGES = ["duty_payment"];
const TERMINAL_STAGES = ["gate_in", "examination", "final_release"];
const DELIVERY_STAGES = ["delivery", "empty_return"];

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
    delivery:     "Proceed to Empty Return",
    empty_return: "Mark as Closed",
  },
  operations_user: {
    transire_processing:       "Submit to Shipping",
    shipping_terminal_payment: "Submit to Pull-Out",
    pull_out:                  "Submit to Terminal Manager",
  },
};

function OperationalForm({
  container,
  isAdmin,
  isOperationsUser,
  isDocumentationUser,
  isAccountsUser,
  isTerminalManager,
  isDeliveryUser,
}: {
  container: Container;
  isAdmin: boolean;
  isOperationsUser: boolean;
  isDocumentationUser: boolean;
  isAccountsUser: boolean;
  isTerminalManager: boolean;
  isDeliveryUser: boolean;
}) {
  const { toast } = useToast();
  const updateMutation = useUpdateContainer();
  const advanceMutation = useAdvanceContainerStatus();

  const [delayReason, setDelayReason] = useState(container.delayReason ?? "");
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setDelayReason(container.delayReason ?? "");
    setIsDirty(false);
  }, [container.id, container.updatedAt]);

  const markDirty = () => setIsDirty(true);

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        id: container.id,
        data: {
          delayReason: delayReason || null,
        },
      });
      setIsDirty(false);
      toast({ title: "Stage notes updated" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleReset = () => {
    setDelayReason(container.delayReason ?? "");
    setIsDirty(false);
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

  const isDeptUser = isOperationsUser || isDocumentationUser || isAccountsUser || isTerminalManager || isDeliveryUser;
  const isEditable = isAdmin || isDeptUser;
  const daysInStage = daysAgo(container.updatedAt);

  return (
    <div className="space-y-4">
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
                Save Notes
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

      {isEditable && nextStage && (() => {
        const deptRole = isDocumentationUser ? "documentation_user"
          : isAccountsUser    ? "accounts_user"
          : isTerminalManager ? "terminal_manager"
          : isDeliveryUser    ? "delivery_user"
          : isOperationsUser  ? "operations_user"
          : null;
        const deptLabel = deptRole
          ? DEPT_SUBMIT_LABELS[deptRole]?.[container.status]
          : undefined;
        const isClose = container.status === "empty_return";
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

const SHIPPING_STAGES = ["transire_processing", "shipping_terminal_payment"];
const TERMINAL_OPS_STAGES = ["gate_in", "examination", "final_release"];

function ShippingSection({ container }: { container: Container }) {
  const isActive = SHIPPING_STAGES.includes(container.status);
  const isPast = getStageIndex(container.status) > getStageIndex("shipping_terminal_payment");
  const stageColor = isActive
    ? "border-blue-500/30 bg-blue-500/5"
    : isPast
    ? "border-emerald-500/20 bg-emerald-500/5"
    : "border-border/40 bg-card/30";
  return (
    <Card className={`backdrop-blur-sm ${stageColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Ship className={`w-4 h-4 ${isActive ? "text-blue-400" : isPast ? "text-emerald-400" : "text-muted-foreground"}`} />
            Shipping Operations
          </CardTitle>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isActive
              ? "text-blue-400 bg-blue-500/10 border-blue-500/30"
              : isPast
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              : "text-muted-foreground bg-muted/40 border-border/40"
          }`}>
            {isActive ? <Activity className="w-2.5 h-2.5 animate-pulse" /> : isPast ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
            {isActive ? "Active" : isPast ? "Completed" : "Upcoming"}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Transire processing and shipping payment — managed by Operations</p>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {container.vessel && (
            <div className="flex items-center gap-1.5">
              <Ship className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Vessel:</span>
              <span className="text-foreground/80 font-medium truncate">{container.vessel}</span>
            </div>
          )}
          {container.blNumber && (
            <div className="flex items-center gap-1.5">
              <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">B/L:</span>
              <span className="text-foreground/80 font-mono">{container.blNumber}</span>
            </div>
          )}
          {container.size && (
            <div className="flex items-center gap-1.5">
              <ContainerIcon className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-muted-foreground">Size:</span>
              <span className="text-foreground/80">{container.size}</span>
            </div>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap pt-1">
          {SHIPPING_STAGES.map(s => {
            const idx = getStageIndex(container.status);
            const sIdx = getStageIndex(s);
            const done = idx > sIdx;
            const curr = idx === sIdx;
            return (
              <span key={s} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-medium ${
                done ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : curr ? "text-blue-400 border-blue-500/30 bg-blue-500/10"
                : "text-muted-foreground/50 border-border/30 bg-muted/20"
              }`}>
                {done ? <CheckCircle2 className="w-2.5 h-2.5" /> : curr ? <Activity className="w-2.5 h-2.5 animate-pulse" /> : <Circle className="w-2.5 h-2.5" />}
                {getStatusLabel(s)}
              </span>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TerminalSection({ container }: { container: Container }) {
  const isActive = TERMINAL_OPS_STAGES.includes(container.status);
  const isPast = getStageIndex(container.status) > getStageIndex("final_release");
  const stageColor = isActive
    ? "border-cyan-500/30 bg-cyan-500/5"
    : isPast
    ? "border-emerald-500/20 bg-emerald-500/5"
    : "border-border/40 bg-card/30";
  return (
    <Card className={`backdrop-blur-sm ${stageColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ContainerIcon className={`w-4 h-4 ${isActive ? "text-cyan-400" : isPast ? "text-emerald-400" : "text-muted-foreground"}`} />
            Terminal Operations
          </CardTitle>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            isActive
              ? "text-cyan-400 bg-cyan-500/10 border-cyan-500/30"
              : isPast
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              : "text-muted-foreground bg-muted/40 border-border/40"
          }`}>
            {isActive ? <Activity className="w-2.5 h-2.5 animate-pulse" /> : isPast ? <CheckCircle2 className="w-2.5 h-2.5" /> : <Circle className="w-2.5 h-2.5" />}
            {isActive ? "Active" : isPast ? "Completed" : "Upcoming"}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">Bonded terminal gate-in, examination and release — managed by Operations</p>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <div className="flex gap-1.5 flex-wrap">
          {TERMINAL_OPS_STAGES.map(s => {
            const idx = getStageIndex(container.status);
            const sIdx = getStageIndex(s);
            const done = idx > sIdx;
            const curr = idx === sIdx;
            return (
              <span key={s} className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border font-medium ${
                done ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                : curr ? "text-cyan-400 border-cyan-500/30 bg-cyan-500/10"
                : "text-muted-foreground/50 border-border/30 bg-muted/20"
              }`}>
                {done ? <CheckCircle2 className="w-2.5 h-2.5" /> : curr ? <Activity className="w-2.5 h-2.5 animate-pulse" /> : <Circle className="w-2.5 h-2.5" />}
                {getStatusLabel(s)}
              </span>
            );
          })}
        </div>
        {container.declaration && (
          <div className="flex items-center gap-1.5">
            <FileCheck2 className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-muted-foreground">Declaration:</span>
            <span className="text-foreground/80 font-mono">{container.declaration}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function OperationDetailPage({ params }: { params: { id: string } }) {
  const containerId = parseInt(params.id, 10);
  const { isAdmin, isOperationsUser, isDocumentationUser, isAccountsUser, isTerminalManager, isDeliveryUser } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const navMutation = useAdvanceContainerStatus();
  const updateDeliveryExecution = useUpdateDeliveryExecution();

  const [editingDeliveryExec, setEditingDeliveryExec] = useState(false);
  const [dex, setDex] = useState({
    deliveryTime: "", deliveryLocation: "", truckNumber: "", driverName: "",
    driverPhone: "", dispatchOfficer: "", deliveryStatus: "pending" as "pending" | "in_transit" | "delivered",
    offloadingConfirmed: false, emptyReturnDueDate: "", emptyReturnDate: "",
    deliveredAt: "", deliveredAtEstimated: false,
  });

  const { data, isLoading, isError } = useGetContainer(containerId, {
    query: { queryKey: getGetContainerQueryKey(containerId), refetchInterval: 30_000 },
  });

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

  const handleStageNavigate = async (targetStage: string) => {
    try {
      await navMutation.mutateAsync({ id: container.id, status: targetStage });
      toast({ title: `Moved to ${getStatusLabel(targetStage)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change stage";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  const handleOpenDeliveryExec = () => {
    setDex({
      deliveryTime: container.deliveryTime ?? "",
      deliveryLocation: container.deliveryLocation ?? "",
      truckNumber: container.truckNumber ?? "",
      driverName: container.driverName ?? "",
      driverPhone: container.driverPhone ?? "",
      dispatchOfficer: container.dispatchOfficer ?? "",
      deliveryStatus: container.deliveryStatus ?? "pending",
      offloadingConfirmed: container.offloadingConfirmed ?? false,
      emptyReturnDueDate: container.emptyReturnDueDate ? container.emptyReturnDueDate.slice(0, 10) : "",
      emptyReturnDate: container.emptyReturnDate ? container.emptyReturnDate.slice(0, 10) : "",
      deliveredAt: container.deliveredAt ? container.deliveredAt.slice(0, 10) : "",
      deliveredAtEstimated: container.deliveredAtEstimated ?? false,
    });
    setEditingDeliveryExec(true);
  };

  const handleSaveDeliveryExec = () => {
    updateDeliveryExecution.mutate(
      {
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
      },
      {
        onSuccess: () => {
          toast({ title: "Delivery details saved." });
          setEditingDeliveryExec(false);
        },
        onError: (err: Error) => {
          toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Could not save delivery details" });
        },
      }
    );
  };

  const canEditDelivery = isAdmin || isDeliveryUser;
  const isDeliveryStage = DELIVERY_STAGES.includes(container.status);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href={
          isDocumentationUser ? "/workspace/documentation"
          : isAccountsUser    ? "/workspace/accounts"
          : isTerminalManager ? "/workspace/terminal"
          : isDeliveryUser    ? "/workspace/delivery"
          : isOperationsUser  ? "/workspace/operations"
          : "/operations"
        }>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground h-8 px-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            {isDocumentationUser ? "My Jobs"
              : isAccountsUser    ? "Duty Payments"
              : isTerminalManager ? "Terminal Workspace"
              : isDeliveryUser    ? "Deliveries"
              : isOperationsUser  ? "My Jobs"
              : "Operations Board"}
          </Button>
        </Link>
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

      {isPipeline && (
        <Card className="border-border/50 bg-card/40 backdrop-blur-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              Pipeline Progress
            </p>
            <StageRail
              currentStatus={container.status}
              onNavigate={(isAdmin || isOperationsUser || isDocumentationUser || isAccountsUser || isTerminalManager || isDeliveryUser) ? handleStageNavigate : undefined}
              isAdmin={isAdmin ?? false}
              isOperationsUser={isOperationsUser ?? false}
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

          {/* ── Delivery Execution — PRIMARY ────────────────────────────── */}
          {(isDeliveryStage || isAdmin || isDeliveryUser) && (
            <Card className="border-primary/20 bg-card/60 backdrop-blur-sm">
              <CardHeader className="pb-3 border-b border-border/40">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Truck className="w-4 h-4 text-primary" /> Delivery Execution
                    {!isDeliveryStage && isAdmin && (
                      <span className="text-[10px] font-normal text-muted-foreground border border-border/50 rounded-full px-2 py-0.5 ml-1">pre-delivery</span>
                    )}
                  </CardTitle>
                  {canEditDelivery && !editingDeliveryExec && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" onClick={handleOpenDeliveryExec}>
                      <Pencil className="w-3 h-3" /> Edit
                    </Button>
                  )}
                  {editingDeliveryExec && (
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs px-3 gap-1" onClick={handleSaveDeliveryExec} disabled={updateDeliveryExecution.isPending}>
                        {updateDeliveryExecution.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditingDeliveryExec(false)}>Cancel</Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-4">
                {editingDeliveryExec ? (
                  <div className="space-y-5">
                    {/* ─ Delivery Details sub-section ─ */}
                    <div className="space-y-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Truck className="w-3 h-3" /> Delivery Details
                      </p>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Navigation className="w-3 h-3" /> Delivery Status</Label>
                        <div className="flex gap-2 flex-wrap">
                          {(["pending", "in_transit", "delivered"] as const).map(s => (
                            <button
                              key={s}
                              onClick={() => setDex(d => ({ ...d, deliveryStatus: s }))}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                dex.deliveryStatus === s
                                  ? s === "delivered" ? "bg-green-500/20 border-green-500/40 text-green-400" : s === "in_transit" ? "bg-blue-500/20 border-blue-500/40 text-blue-400" : "bg-muted/70 border-border text-muted-foreground"
                                  : "border-border/50 text-muted-foreground hover:border-border hover:text-foreground"
                              }`}
                            >
                              {s === "pending" ? "Pending" : s === "in_transit" ? "In Transit" : "Delivered"}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Truck className="w-3 h-3" /> Truck Number</Label>
                          <input value={dex.truckNumber} onChange={e => setDex(d => ({ ...d, truckNumber: e.target.value }))} placeholder="e.g. LAG-123AB" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="w-3 h-3" /> Driver Name</Label>
                          <input value={dex.driverName} onChange={e => setDex(d => ({ ...d, driverName: e.target.value }))} placeholder="Driver's full name" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" /> Driver Phone</Label>
                          <input value={dex.driverPhone} onChange={e => setDex(d => ({ ...d, driverPhone: e.target.value }))} placeholder="+234..." className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><User className="w-3 h-3" /> Dispatch Officer</Label>
                          <input value={dex.dispatchOfficer} onChange={e => setDex(d => ({ ...d, dispatchOfficer: e.target.value }))} placeholder="Officer name" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="w-3 h-3" /> Delivery Time</Label>
                          <input value={dex.deliveryTime} onChange={e => setDex(d => ({ ...d, deliveryTime: e.target.value }))} placeholder="e.g. 09:30" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Delivery Location</Label>
                          <input value={dex.deliveryLocation} onChange={e => setDex(d => ({ ...d, deliveryLocation: e.target.value }))} placeholder="e.g. Apapa Wharf" className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" /> Delivery Date (Actual)</Label>
                          <input type="date" value={dex.deliveredAt} onChange={e => setDex(d => ({ ...d, deliveredAt: e.target.value }))} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                        <div className="flex items-center gap-3 pt-6">
                          <Switch checked={dex.deliveredAtEstimated} onCheckedChange={v => setDex(d => ({ ...d, deliveredAtEstimated: v }))} id="ops-delivered-estimated-switch" />
                          <Label htmlFor="ops-delivered-estimated-switch" className="text-xs cursor-pointer">Date is estimated</Label>
                        </div>
                      </div>
                    </div>

                    {/* ─ Empty Return sub-section ─ */}
                    <div className="border-t border-border/40 pt-4 space-y-3">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Package className="w-3 h-3" /> Empty Return
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" /> Empty Return Due Date</Label>
                          <input type="date" value={dex.emptyReturnDueDate} onChange={e => setDex(d => ({ ...d, emptyReturnDueDate: e.target.value }))} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Package className="w-3 h-3" /> Actual Return Date</Label>
                          <input type="date" value={dex.emptyReturnDate} onChange={e => setDex(d => ({ ...d, emptyReturnDate: e.target.value }))} className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Switch checked={dex.offloadingConfirmed} onCheckedChange={v => setDex(d => ({ ...d, offloadingConfirmed: v }))} id="ops-offloading-switch" />
                        <Label htmlFor="ops-offloading-switch" className="text-xs cursor-pointer">Offloading Confirmed</Label>
                      </div>
                    </div>
                  </div>
                ) : (() => {
                  const statusColor: Record<string, string> = {
                    pending: "text-muted-foreground bg-muted/50 border-border/50",
                    in_transit: "text-blue-400 bg-blue-500/10 border-blue-500/30",
                    delivered: "text-green-400 bg-green-500/10 border-green-500/30",
                  };
                  const statusLabel: Record<string, string> = { pending: "Pending", in_transit: "In Transit", delivered: "Delivered" };
                  const ds = container.deliveryStatus ?? "pending";
                  const hasDeliveryData = container.truckNumber || container.driverName || container.driverPhone || container.dispatchOfficer || container.deliveryLocation || container.deliveryTime || container.deliveredAt;
                  const hasReturnData = container.emptyReturnDueDate || container.emptyReturnDate;
                  return (
                    <div className="space-y-4">
                      {/* Delivery Details view */}
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Truck className="w-3 h-3" /> Delivery Details
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${statusColor[ds]}`}>
                            {ds === "in_transit" && <Truck className="w-3 h-3" />}
                            {ds === "delivered" && <CheckCircle2 className="w-3 h-3" />}
                            {statusLabel[ds]}
                          </span>
                          {container.offloadingConfirmed && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border text-green-400 bg-green-500/10 border-green-500/30">
                              <CheckSquare className="w-3 h-3" /> Offloading Confirmed
                            </span>
                          )}
                        </div>
                        {hasDeliveryData ? (
                          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs">
                            {container.truckNumber && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Truck className="w-3 h-3 shrink-0" />
                                <span className="text-foreground font-medium">{container.truckNumber}</span>
                              </div>
                            )}
                            {container.driverName && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="text-foreground">{container.driverName}</span>
                                {container.driverPhone && <span className="text-muted-foreground">· {container.driverPhone}</span>}
                              </div>
                            )}
                            {container.dispatchOfficer && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <User className="w-3 h-3 shrink-0" />
                                <span className="text-foreground">{container.dispatchOfficer}</span>
                              </div>
                            )}
                            {container.deliveryLocation && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="text-foreground">{container.deliveryLocation}</span>
                                {container.deliveryTime && <span className="text-muted-foreground">· {container.deliveryTime}</span>}
                              </div>
                            )}
                            {container.deliveredAt && (
                              <div className="col-span-2 flex items-center gap-1.5 text-muted-foreground">
                                <CheckCircle2 className="w-3 h-3 shrink-0 text-green-400" />
                                <span>Delivered: <span className="font-medium text-foreground">{new Date(container.deliveredAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                                {container.deliveredAtEstimated && <span className="text-amber-400 text-[10px] border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 rounded-full font-medium">estimated</span>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/60">{canEditDelivery ? "No delivery details yet — click Edit to add truck, driver and dispatch info." : "No delivery details recorded yet."}</p>
                        )}
                      </div>

                      {/* Empty Return view */}
                      <div className="border-t border-border/40 pt-3 space-y-2">
                        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Package className="w-3 h-3" /> Empty Return
                        </p>
                        {hasReturnData ? (
                          <div className="space-y-1.5 text-xs">
                            {container.emptyReturnDueDate && (
                              <div className="flex items-center gap-1.5 text-muted-foreground">
                                <Package className="w-3 h-3 shrink-0" />
                                <span>Due: <span className={`font-medium ${container.emptyReturnDate ? "text-green-400" : new Date(container.emptyReturnDueDate) < new Date() ? "text-orange-400" : "text-foreground"}`}>{new Date(container.emptyReturnDueDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</span></span>
                                {container.emptyReturnDate && (
                                  <span className="text-green-400 font-medium">· Returned {new Date(container.emptyReturnDate).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</span>
                                )}
                              </div>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/60">{canEditDelivery ? "No empty return dates set yet." : "No empty return data."}</p>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <OperationalForm
            container={container}
            isAdmin={isAdmin ?? false}
            isOperationsUser={isOperationsUser ?? false}
            isDocumentationUser={isDocumentationUser ?? false}
            isAccountsUser={isAccountsUser ?? false}
            isTerminalManager={isTerminalManager ?? false}
            isDeliveryUser={isDeliveryUser ?? false}
          />

          <PaarPanel
            container={container}
            isAdmin={isAdmin ?? false}
          />

          {/* ── Shipping Operations ────────────────────────────────────── */}
          {(isAdmin || isOperationsUser) && (
            <ShippingSection container={container} />
          )}

          {/* ── Terminal Operations ────────────────────────────────────── */}
          {(isAdmin || isOperationsUser) && (
            <TerminalSection container={container} />
          )}
        </div>

        <div className="space-y-4">
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
