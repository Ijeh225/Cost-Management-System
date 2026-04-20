import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor, WORKFLOW_STAGES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Search, Building2, ChevronRight, Clock, SendHorizonal, Inbox } from "lucide-react";

const DEPT_STAGES = ["gate_in", "examination", "final_release"];

const STAGE_SUBMIT_LABEL: Record<string, string> = {
  gate_in:       "Submit to Examination",
  examination:   "Submit to Final Release",
  final_release: "Submit to Delivery",
};

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

export default function TerminalWorkspace() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
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
      onSuccess: () => toast({ title: `Job ${container.containerNumber} submitted to next stage.` }),
      onError:   (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
            <Building2 className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Terminal Workspace</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Terminal Management</p>
          </div>
        </div>
        {!isLoading && (
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold text-foreground">{allContainers.length}</p>
            <p className="text-xs text-muted-foreground">active jobs</p>
          </div>
        )}
      </div>

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
          <p className="text-sm font-medium text-muted-foreground">No active terminal jobs</p>
          <p className="text-xs text-muted-foreground/60">Jobs will appear here once containers reach Gate-In.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {DEPT_STAGES.map(stage => {
            const containers = byStage[stage] ?? [];
            const stageInfo = WORKFLOW_STAGES.find(s => s.value === stage);
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
                    {q ? "No results matching your search." : "No containers at this stage."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {containers.map(c => (
                      <Card key={c.id} className="p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
                            <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
                            <DaysChip days={c.daysInStage} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.customerName}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link href={`/operations/${c.id}`}>
                            <Button size="sm" variant="ghost" className="gap-1 text-xs">
                              View Job <ChevronRight className="w-3 h-3" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            className="gap-1 text-xs bg-cyan-600 hover:bg-cyan-700"
                            onClick={() => handleSubmit(c)}
                            disabled={advance.isPending}
                          >
                            <SendHorizonal className="w-3 h-3" />
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
  );
}
