import { useState } from "react";
import { Link } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_STAGES } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Clock, SendHorizonal, ChevronRight, Briefcase } from "lucide-react";

const DEPT_STAGES = ["transire_processing", "shipping_payment", "terminal_payment", "pull_out"];

const STAGE_SUBMIT_LABEL: Record<string, string> = {
  transire_processing: "Submit to Shipping Payment",
  shipping_payment:    "Submit to Terminal Payment",
  terminal_payment:    "Submit to Pull-Out",
  pull_out:            "Submit to Terminal Manager",
};

const STAGE_COLOR: Record<string, string> = {
  transire_processing: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  shipping_payment:    "bg-sky-500/10 text-sky-400 border-sky-500/30",
  terminal_payment:    "bg-amber-500/10 text-amber-400 border-amber-500/30",
  pull_out:            "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

function DaysChip({ days }: { days: number }) {
  const color =
    days >= 7
      ? "text-red-400 bg-red-500/10 border-red-500/30"
      : days >= 3
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${color}`}>
      <Clock className="w-2.5 h-2.5" />
      {days}d
    </span>
  );
}

export default function OperationsWorkspace() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useGetPipeline({ query: { refetchInterval: 30_000 } });
  const advance = useAdvanceContainerStatus();

  const allContainers = DEPT_STAGES.flatMap(s =>
    (data?.stages?.[s] ?? []).map(c => ({ ...c, stage: s }))
  );

  const filtered = search.trim()
    ? allContainers.filter(c =>
        c.containerNumber.toLowerCase().includes(search.toLowerCase()) ||
        (c.blNumber ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allContainers;

  const byStage = DEPT_STAGES.reduce<Record<string, typeof filtered>>((acc, s) => {
    acc[s] = filtered.filter(c => c.stage === s);
    return acc;
  }, {});

  const totalJobs = allContainers.length;
  const searching = search.trim().length > 0;

  const handleSubmit = (container: (typeof filtered)[0]) => {
    advance.mutate(
      { id: container.id, status: container.stage },
      {
        onSuccess: () =>
          toast({ title: `Job ${container.containerNumber} submitted to next stage.` }),
        onError: e =>
          toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">My Jobs</h1>
              <p className="text-sm text-muted-foreground">
                {totalJobs} active job{totalJobs !== 1 ? "s" : ""} across your stages
              </p>
            </div>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by container number or Bill of Lading…"
            className="pl-12 h-12 text-base bg-card border-border/60 focus-visible:ring-primary/40"
            value={search}
            onChange={e => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading your jobs…</p>
          </div>
        ) : filtered.length === 0 && searching ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Search className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No jobs found for <span className="font-medium text-foreground">"{search}"</span>
            </p>
            <p className="text-xs text-muted-foreground/60">Try searching by container number or BL number</p>
          </div>
        ) : totalJobs === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Briefcase className="w-8 h-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No active jobs at this time.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {DEPT_STAGES.map(stage => {
              const containers = byStage[stage] ?? [];
              if (searching && containers.length === 0) return null;
              const stageLabel = WORKFLOW_STAGES.find(s => s.value === stage)?.label ?? stage;
              const stageColor = STAGE_COLOR[stage] ?? "";

              return (
                <div key={stage}>
                  <div className="flex items-center gap-3 mb-3">
                    <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${stageColor}`}>
                      {stageLabel}
                    </Badge>
                    <span className="text-xs text-muted-foreground/60">
                      {containers.length} job{containers.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {!searching && containers.length === 0 ? (
                    <p className="text-xs text-muted-foreground/50 italic pl-1">No jobs at this stage.</p>
                  ) : (
                    <div className="space-y-2">
                      {containers.map(c => (
                        <Card
                          key={c.id}
                          className="p-4 flex items-center gap-4 hover:bg-accent/20 transition-colors border-border/50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
                              {c.blNumber && (
                                <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
                              )}
                              <DaysChip days={c.daysInStage} />
                            </div>
                            {c.customerName && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.customerName}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Link href={`/operations/${c.id}`}>
                              <Button size="sm" variant="outline" className="gap-1 text-xs h-8">
                                View Job <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
                            <Button
                              size="sm"
                              className="gap-1.5 text-xs h-8"
                              onClick={() => handleSubmit(c)}
                              disabled={advance.isPending}
                            >
                              {advance.isPending ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <SendHorizonal className="w-3 h-3" />
                              )}
                              {STAGE_SUBMIT_LABEL[stage]}
                            </Button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
