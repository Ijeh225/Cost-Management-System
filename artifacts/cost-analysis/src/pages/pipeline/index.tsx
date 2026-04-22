import { useState } from "react";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import type { PipelineContainer } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { WORKFLOW_STAGES, getNextStage } from "@/lib/format";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ArrowRight, Clock, RefreshCw, User } from "lucide-react";

const BOARD_STAGES = WORKFLOW_STAGES.filter((s) => s.value !== "pending_verification");

const STAGE_HEADER: Record<string, string> = {
  registered:          "bg-blue-500/10 border-blue-500/30 text-blue-400",
  documentation:       "bg-purple-500/10 border-purple-500/30 text-purple-400",
  duty_assessment:     "bg-violet-500/10 border-violet-500/30 text-violet-400",
  duty_payment:        "bg-fuchsia-500/10 border-fuchsia-500/30 text-fuchsia-400",
  transire_processing:       "bg-pink-500/10 border-pink-500/30 text-pink-400",
  shipping_terminal_payment: "bg-rose-500/10 border-rose-500/30 text-rose-400",
  pull_out:                  "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
  gate_in:             "bg-lime-500/10 border-lime-500/30 text-lime-400",
  examination:         "bg-green-500/10 border-green-500/30 text-green-400",
  final_release:       "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  delivery:            "bg-teal-500/10 border-teal-500/30 text-teal-400",
  empty_return:        "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
  closed:              "bg-gray-500/10 border-gray-500/30 text-gray-400",
};

function AgingBadge({ days }: { days: number }) {
  if (days >= 14) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
        <AlertTriangle className="w-2.5 h-2.5" />
        {days}d
      </span>
    );
  }
  if (days >= 7) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
        <Clock className="w-2.5 h-2.5" />
        {days}d
      </span>
    );
  }
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/50">
      {days}d
    </span>
  );
}

function ContainerCard({
  c,
  canAdvance,
  onAdvance,
  advancing,
}: {
  c: PipelineContainer;
  canAdvance: boolean;
  onAdvance: () => void;
  advancing: boolean;
}) {
  return (
    <div className="group relative bg-background/60 border border-border/40 rounded-lg p-3 hover:border-primary/30 hover:bg-background/80 transition-all space-y-2">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/containers/${c.id}`} className="block flex-1 min-w-0">
          <div className="font-mono text-xs font-semibold text-foreground hover:text-primary transition-colors truncate">
            {c.containerNumber}
          </div>
          <div className="text-[11px] text-muted-foreground/70 truncate">{c.blNumber}</div>
        </Link>
        <AgingBadge days={c.daysInStage} />
      </div>
      <div className="text-xs text-muted-foreground truncate">{c.customerName}</div>
      {(c.stageOwnerName ?? c.assignedStaffName) && (
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
          <User className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{c.stageOwnerName ?? c.assignedStaffName}</span>
        </div>
      )}
      {canAdvance && (
        <Button
          size="sm"
          variant="outline"
          className="w-full h-6 text-[11px] gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAdvance();
          }}
          disabled={advancing}
        >
          {advancing ? (
            <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <ArrowRight className="w-2.5 h-2.5" />
          )}
          Advance
        </Button>
      )}
    </div>
  );
}

export default function PipelinePage() {
  const { isAdmin } = useAuth();
  const { data, isLoading, refetch } = useGetPipeline({ query: { refetchInterval: 60_000 } });
  const advanceMutation = useAdvanceContainerStatus();
  const { toast } = useToast();
  const [advancing, setAdvancing] = useState<number | null>(null);

  const stages = data?.stages ?? {};
  const total = data?.total ?? 0;

  const handleAdvance = async (c: PipelineContainer) => {
    const next = getNextStage(c.status);
    if (!next) return;
    setAdvancing(c.id);
    try {
      await advanceMutation.mutateAsync({ id: c.id, status: next });
      toast({ title: `${c.containerNumber} moved to ${next.replace(/_/g, " ")}` });
    } catch {
      toast({ variant: "destructive", title: "Failed to advance container" });
    } finally {
      setAdvancing(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-52 shrink-0 space-y-2">
              <Skeleton className="h-8 w-full rounded-lg" />
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Board</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} active container{total !== 1 ? "s" : ""} &middot; auto-refreshes every 60s
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-500/50 border border-amber-500/40 inline-block" />
              7+ days stuck
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-red-500/50 border border-red-500/40 inline-block" />
              14+ days stuck
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs h-8"
            onClick={() => refetch()}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      <div
        className="flex gap-3 overflow-x-auto pb-6"
        style={{ minHeight: "420px" }}
      >
        {BOARD_STAGES.map((stage) => {
          const containers = stages[stage.value] ?? [];
          const headerCls =
            STAGE_HEADER[stage.value] ??
            "bg-muted/20 border-border text-muted-foreground";

          return (
            <div key={stage.value} className="w-52 shrink-0 flex flex-col gap-2">
              <div
                className={`flex items-center justify-between px-3 py-2 rounded-lg border ${headerCls}`}
              >
                <span className="text-[11px] font-semibold tracking-tight leading-tight">
                  {stage.short}
                </span>
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-bold tabular-nums bg-background/40 border-current/20"
                >
                  {containers.length}
                </Badge>
              </div>

              {containers.length === 0 ? (
                <div className="border border-dashed border-border/25 rounded-lg py-8 text-center">
                  <p className="text-[11px] text-muted-foreground/30">—</p>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto flex-1 max-h-[calc(100vh-220px)] pr-0.5">
                  {containers.map((c) => (
                    <ContainerCard
                      key={c.id}
                      c={c}
                      canAdvance={isAdmin && stage.value !== "closed"}
                      onAdvance={() => handleAdvance(c)}
                      advancing={advancing === c.id}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
