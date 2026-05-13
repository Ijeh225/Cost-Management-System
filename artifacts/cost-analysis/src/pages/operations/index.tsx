import { useState, useRef } from "react";
import { Link } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus, type PipelineContainer } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_STAGES, getNextStage, getStatusColor, getStatusLabel } from "@/lib/format";
import { BranchChip } from "@/components/layout/branch-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Loader2, Activity, RefreshCw, Clock, AlertTriangle, ChevronRight, User, Target, Search, X,
} from "lucide-react";

const PIPELINE_STAGES = WORKFLOW_STAGES.filter(s => s.value !== "pending_verification" && s.value !== "registered");

function daysColor(days: number): string {
  if (days > 14) return "border-l-red-500 bg-red-500/5";
  if (days > 7)  return "border-l-amber-500 bg-amber-500/5";
  return "border-l-border/40 bg-card";
}

function daysBadge(days: number) {
  if (days > 14) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-1.5 py-0.5">
        <AlertTriangle className="w-2.5 h-2.5" />
        {days}d
      </span>
    );
  }
  if (days > 7) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-1.5 py-0.5">
        <Clock className="w-2.5 h-2.5" />
        {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/40 rounded-full px-1.5 py-0.5">
      {days}d
    </span>
  );
}

function NextActionRow({ dueAt }: { dueAt: string | null }) {
  if (!dueAt) {
    return (
      <div className="flex items-center gap-1 opacity-40">
        <Clock className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
        <span className="text-[10px] text-muted-foreground/60 italic truncate">No next action set</span>
      </div>
    );
  }
  const isOverdue = new Date(dueAt) < new Date();
  const formatted = new Date(dueAt).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
  return (
    <div className="flex items-center gap-1">
      <Clock className={`w-2.5 h-2.5 shrink-0 ${isOverdue ? "text-red-400" : "text-muted-foreground/50"}`} />
      <span className={`text-[10px] truncate ${isOverdue ? "text-red-400 font-medium" : "text-muted-foreground/60"}`}>
        {isOverdue ? `Overdue: ${formatted}` : `Due: ${formatted}`}
      </span>
    </div>
  );
}

function ContainerCard({
  container,
  isAdmin,
  isLast,
}: {
  container: PipelineContainer;
  isAdmin: boolean;
  isLast: boolean;
}) {
  const { toast } = useToast();
  const advanceMutation = useAdvanceContainerStatus();
  const nextStage = getNextStage(container.status);

  const handleAdvance = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!nextStage) return;
    try {
      await advanceMutation.mutateAsync({ id: container.id, status: nextStage });
      toast({ title: `Container advanced to ${getStatusLabel(nextStage)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to advance stage";
      toast({ variant: "destructive", title: "Error", description: msg });
    }
  };

  return (
    <Link href={`/operations/${container.id}`}>
      <div
        className={`
          group relative border border-l-4 rounded-lg p-3 cursor-pointer transition-all duration-150
          hover:shadow-md hover:border-primary/30
          ${daysColor(container.daysInStage)}
        `}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono font-semibold text-sm text-foreground leading-tight truncate flex items-center">
              {container.containerNumber}<BranchChip branchId={(container as { branchId?: number }).branchId} />
            </p>
            {container.blNumber && (
              <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                {container.blNumber}
              </p>
            )}
            {container.customerName && (
              <p className="text-[11px] text-muted-foreground truncate mt-1">
                {container.customerName}
              </p>
            )}
          </div>
          <div className="shrink-0 mt-0.5">
            {daysBadge(container.daysInStage)}
          </div>
        </div>

        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-1">
            <User className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
            <span className="text-[10px] text-muted-foreground/50 shrink-0 mr-0.5">Assigned:</span>
            <span className="text-[10px] text-muted-foreground/70 truncate">
              {container.assignedStaffName ?? "—"}
            </span>
          </div>
          <div className={`flex items-center gap-1 ${container.stageOwnerName ? "" : "opacity-50"}`}>
            <User className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
            <span className="text-[10px] text-muted-foreground/40 shrink-0 mr-0.5">Owner:</span>
            <span className="text-[10px] text-muted-foreground/50 italic truncate">
              {container.stageOwnerName ?? "—"}
            </span>
          </div>
          <NextActionRow dueAt={container.nextActionDueAt ?? null} />
        </div>

        {isAdmin && nextStage && (
          <div className="mt-2 flex justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={handleAdvance}
                  disabled={advanceMutation.isPending}
                  className="flex items-center gap-1 text-[10px] font-medium text-primary/70 hover:text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 rounded px-1.5 py-0.5 transition-colors disabled:opacity-40"
                >
                  {advanceMutation.isPending
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    : <ChevronRight className="w-2.5 h-2.5" />}
                  Advance
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Move to: {getStatusLabel(nextStage)}
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {isLast && !nextStage && (
          <p className="mt-2 text-[10px] text-muted-foreground">Final stage</p>
        )}
      </div>
    </Link>
  );
}

function StageColumn({
  stage,
  containers,
  isAdmin,
}: {
  stage: { value: string; label: string };
  containers: PipelineContainer[];
  isAdmin: boolean;
}) {
  const stuckOver14 = containers.filter(c => c.daysInStage > 14).length;
  const stuckOver7  = containers.filter(c => c.daysInStage > 7 && c.daysInStage <= 14).length;

  return (
    <div className="flex flex-col w-56 shrink-0">
      <div className="mb-2.5 px-1">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${getStatusColor(stage.value).split(" ")[0].replace("bg-", "bg-")}`} />
          <h3 className="text-xs font-semibold text-foreground truncate">{stage.label}</h3>
          <Badge className="ml-auto text-[10px] font-mono px-1.5 py-0 bg-muted/60 text-muted-foreground border-border/40">
            {containers.length}
          </Badge>
        </div>
        {(stuckOver14 > 0 || stuckOver7 > 0) && (
          <div className="flex gap-1.5 mt-1">
            {stuckOver14 > 0 && (
              <span className="text-[9px] text-red-400 bg-red-500/10 rounded px-1 py-0.5">
                {stuckOver14} &gt;14d
              </span>
            )}
            {stuckOver7 > 0 && (
              <span className="text-[9px] text-amber-400 bg-amber-500/10 rounded px-1 py-0.5">
                {stuckOver7} &gt;7d
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
        {containers.length === 0 ? (
          <div className="h-16 rounded-lg border border-dashed border-border/30 flex items-center justify-center">
            <span className="text-[11px] text-muted-foreground/50">Empty</span>
          </div>
        ) : (
          containers.map(c => (
            <ContainerCard
              key={c.id}
              container={c}
              isAdmin={isAdmin}
              isLast={stage.value === PIPELINE_STAGES[PIPELINE_STAGES.length - 1].value}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default function OperationsPage() {
  const { isAdmin } = useAuth();

  const { data, isLoading, refetch, isFetching, dataUpdatedAt } = useGetPipeline({
    query: { refetchInterval: 60_000 },
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");

  const lastRefreshed = dataUpdatedAt ? new Date(dataUpdatedAt) : new Date();
  const handleManualRefresh = () => { refetch(); };

  const rawStages = data?.stages ?? {};
  const total = data?.total ?? 0;
  const totalStuck = Object.values(rawStages).flat().filter(c => c.daysInStage > 7).length;

  const searchLower = search.toLowerCase();
  const stages: typeof rawStages = {};
  for (const [key, containers] of Object.entries(rawStages)) {
    let filtered = containers;
    if (search) {
      filtered = filtered.filter(c =>
        c.containerNumber.toLowerCase().includes(searchLower) ||
        c.blNumber.toLowerCase().includes(searchLower) ||
        (c.customerName ?? "").toLowerCase().includes(searchLower) ||
        (c.stageOwnerName ?? "").toLowerCase().includes(searchLower)
      );
    }
    stages[key] = filtered;
  }

  const visiblePipelineStages = stageFilter === "all"
    ? PIPELINE_STAGES
    : PIPELINE_STAGES.filter(s => s.value === stageFilter);

  const activeStages = PIPELINE_STAGES.filter(s => (rawStages[s.value] ?? []).length > 0);

  const jumpToStage = (stageValue: string) => {
    const container = scrollRef.current;
    if (container) {
      const idx = PIPELINE_STAGES.findIndex(s => s.value === stageValue);
      if (idx >= 0) {
        container.scrollTo({ left: idx * 248, behavior: "smooth" });
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-border/40 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Operations</h1>
          <p className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : `${total} approved job${total !== 1 ? "s" : ""} in pipeline${totalStuck > 0 ? ` · ${totalStuck} need attention` : ""}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {totalStuck > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1">
              <AlertTriangle className="w-3 h-3" />
              {totalStuck} stuck
            </span>
          )}
          <span className="text-xs text-muted-foreground hidden sm:block">
            Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualRefresh}
            disabled={isFetching}
            className="h-7 gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Search + Stage filter bar */}
      {!isLoading && (
        <div className="px-6 py-2.5 border-b border-border/30 shrink-0 flex items-center gap-3 bg-background/40">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search container, BL, customer…"
              className="pl-8 h-7 text-xs bg-background border-border/60"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={() => setStageFilter("all")}
              className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${stageFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border/50 hover:border-border"}`}
            >
              All Stages
            </button>
            {PIPELINE_STAGES.filter(s => s.value !== "closed").map(s => (
              <button
                key={s.value}
                onClick={() => setStageFilter(s.value === stageFilter ? "all" : s.value)}
                className={`text-[11px] px-2.5 py-0.5 rounded-full border transition-colors ${stageFilter === s.value ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground border-border/50 hover:border-border"}`}
              >
                {s.short}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active stage jump bar */}
      {!isLoading && (
        <div className="px-6 py-2 border-b border-border/30 shrink-0 flex items-center gap-2 flex-wrap bg-secondary/10">
          <Target className="w-3 h-3 text-muted-foreground shrink-0" />
          <span className="text-[11px] text-muted-foreground shrink-0">Active:</span>
          {activeStages.length === 0 ? (
            <span className="text-[11px] text-muted-foreground/50 italic">No approved jobs in pipeline yet</span>
          ) : (
            activeStages.map(s => {
              const count = (stages[s.value] ?? []).length;
              const stuck = (stages[s.value] ?? []).filter(c => c.daysInStage > 7).length;
              return (
                <button
                  key={s.value}
                  onClick={() => jumpToStage(s.value)}
                  className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2.5 py-0.5 border transition-colors cursor-pointer
                    ${stuck > 0
                      ? "text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                      : "text-primary bg-primary/10 border-primary/20 hover:bg-primary/20"
                    }`}
                >
                  {s.label}
                  <span className="font-mono">{count}</span>
                  {stuck > 0 && <AlertTriangle className="w-2.5 h-2.5" />}
                </button>
              );
            })
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-7 h-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto" ref={scrollRef}>
          <div className="flex gap-4 p-6 h-full" style={{ minWidth: `${visiblePipelineStages.length * 232}px` }}>
            {visiblePipelineStages.map(stage => (
              <StageColumn
                key={stage.value}
                stage={stage}
                containers={stages[stage.value] ?? []}
                isAdmin={isAdmin ?? false}
              />
            ))}
          </div>
        </div>
      )}

      <div className="px-6 py-2 border-t border-border/40 shrink-0 flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <User className="w-2.5 h-2.5" />
          Assigned staff shown on each card
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded border-l-2 border-l-amber-500 bg-amber-500/10" />
          Amber = stuck &gt;7 days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded border-l-2 border-l-red-500 bg-red-500/10" />
          Red = stuck &gt;14 days
        </span>
        <span className="ml-auto">Auto-refreshes every 60 seconds</span>
      </div>
    </div>
  );
}
