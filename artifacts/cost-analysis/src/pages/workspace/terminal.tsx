import { useState } from "react";
import { Link } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_STAGES } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search, Building2, ChevronRight, Clock, SendHorizonal } from "lucide-react";

const DEPT_STAGES = ["gate_in", "examination", "final_release"];

const STAGE_SUBMIT_LABEL: Record<string, string> = {
  gate_in: "Submit to Examination",
  examination: "Submit to Final Release",
  final_release: "Submit to Delivery",
};

const STAGE_DESCRIPTION: Record<string, string> = {
  gate_in: "Containers arrived at the bonded terminal",
  examination: "Containers undergoing customs examination",
  final_release: "Containers cleared, awaiting delivery handoff",
};

function DaysChip({ days }: { days: number }) {
  const color = days >= 7 ? "text-red-400 bg-red-500/10 border-red-500/30" : days >= 3 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${color}`}>
      <Clock className="w-2.5 h-2.5" />{days}d
    </span>
  );
}

export default function TerminalWorkspace() {
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
        c.blNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.customerName?.toLowerCase().includes(search.toLowerCase())
      )
    : allContainers;

  const byStage = DEPT_STAGES.reduce<Record<string, typeof filtered>>((acc, s) => {
    acc[s] = filtered.filter(c => c.stage === s);
    return acc;
  }, {});

  const handleSubmit = (container: (typeof filtered)[0]) => {
    advance.mutate({ id: container.id, status: container.stage }, {
      onSuccess: () => toast({ title: `Job ${container.containerNumber} submitted to next stage.` }),
      onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0">
          <Building2 className="w-6 h-6 text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Terminal Management</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Track container arrivals, oversee examination, and manage final releases.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by container number, BL number, or client…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          {DEPT_STAGES.map(stage => {
            const containers = byStage[stage] ?? [];
            const stageLabel = WORKFLOW_STAGES.find(s => s.value === stage)?.label ?? stage;
            return (
              <div key={stage}>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{stageLabel}</h2>
                  <span className="text-xs bg-muted rounded-full px-2 py-0.5">{containers.length}</span>
                </div>
                <p className="text-xs text-muted-foreground/70 mb-3">{STAGE_DESCRIPTION[stage]}</p>
                {containers.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 italic pl-1">No containers at this stage.</p>
                ) : (
                  <div className="space-y-2">
                    {containers.map(c => (
                      <Card key={c.id} className="p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{c.containerNumber}</span>
                            <span className="text-muted-foreground text-xs">BL: {c.blNumber}</span>
                            <DaysChip days={c.daysInStage} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{c.customerName}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Link href={`/operations/${c.id}`}>
                            <Button size="sm" variant="ghost" className="gap-1 text-xs">
                              View Details <ChevronRight className="w-3 h-3" />
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            className="gap-1 text-xs bg-blue-600 hover:bg-blue-700"
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
