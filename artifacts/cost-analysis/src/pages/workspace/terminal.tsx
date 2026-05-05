import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import {
  useGetPipeline,
  useAdvanceContainerStatus,
  useStageAction,
  type PipelineContainer,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor, WORKFLOW_STAGES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Loader2, Search, Building2, ChevronRight, Clock,
  SendHorizonal, Inbox, CheckCircle2, User, Calendar,
  AlertTriangle, Flag,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompletedJobsView } from "@/components/workspace/completed-jobs-view";

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

function fmt(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fmtDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type FinalReleaseCardProps = {
  c: PipelineContainer & { stage: string };
  onAdvance: () => void;
  advancePending: boolean;
};

function FinalReleaseCard({ c, onAdvance, advancePending }: FinalReleaseCardProps) {
  const { toast } = useToast();
  const stageAction = useStageAction();

  const isReleased = !!c.releaseConfirmedAt;

  const [stageOwner, setStageOwner] = useState(c.stageOwnerName ?? "");
  const [expectedDate, setExpectedDate] = useState(fmt(c.expectedReleaseDate));
  const [delayReason, setDelayReason] = useState(c.releaseDelayReason ?? "");
  const [actualReleaseDate, setActualReleaseDate] = useState(
    isReleased ? fmt(c.releaseConfirmedAt) : fmt(new Date().toISOString())
  );

  useEffect(() => {
    setStageOwner(c.stageOwnerName ?? "");
    setExpectedDate(fmt(c.expectedReleaseDate));
    setDelayReason(c.releaseDelayReason ?? "");
    setActualReleaseDate(isReleased ? fmt(c.releaseConfirmedAt) : fmt(new Date().toISOString()));
  }, [c.id, c.stageOwnerName, c.expectedReleaseDate, c.releaseDelayReason, c.releaseConfirmedAt, isReleased]);

  const isBusy = stageAction.isPending;

  function doAction(action: Parameters<typeof stageAction.mutate>[0]["action"], extra?: object) {
    stageAction.mutate(
      { id: c.id, action, ...extra },
      {
        onSuccess: () => toast({ title: "Saved" }),
        onError: (e) => toast({ variant: "destructive", title: "Error", description: (e as Error).message }),
      }
    );
  }

  const handleSaveOwner = () => {
    doAction("update_stage_owner", { stageOwner: stageOwner || null });
  };

  const handleSaveExpected = () => {
    if (!expectedDate) { toast({ variant: "destructive", title: "Please enter an expected release date" }); return; }
    doAction("set_expected_date", { expectedDate });
  };

  const handleMarkReleased = () => {
    if (!actualReleaseDate) { toast({ variant: "destructive", title: "Please enter the actual release date" }); return; }
    doAction("mark_released", { finalDate: actualReleaseDate });
  };

  const handleSaveDelay = () => {
    if (!delayReason.trim()) { toast({ variant: "destructive", title: "Please enter a delay reason" }); return; }
    doAction("record_delay", { delayReason, finalDate: actualReleaseDate || undefined });
  };

  const isOverdue = expectedDate && !isReleased && new Date(expectedDate) < new Date();

  return (
    <Card className={`p-4 space-y-4 transition-colors ${isReleased ? "border-emerald-500/30 bg-emerald-500/5" : isOverdue ? "border-amber-500/30 bg-amber-500/5" : "hover:bg-accent/20"}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
            <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
            <DaysChip days={c.daysInStage} />
            {isReleased && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 text-emerald-400 bg-emerald-500/10 border-emerald-500/30">
                <CheckCircle2 className="w-2.5 h-2.5" /> Released {fmtDisplay(c.releaseConfirmedAt)}
              </span>
            )}
            {isOverdue && !isReleased && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 text-amber-400 bg-amber-500/10 border-amber-500/30">
                <AlertTriangle className="w-2.5 h-2.5" /> Overdue
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{c.customerName}</p>
        </div>
        <Link href={`/operations/${c.id}`}>
          <Button size="sm" variant="ghost" className="gap-1 text-xs shrink-0">
            View Job <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/40">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <User className="w-3 h-3" /> Stage Owner
          </Label>
          <div className="flex gap-1.5">
            <Input
              className="h-7 text-xs"
              placeholder="Assign owner…"
              value={stageOwner}
              onChange={e => setStageOwner(e.target.value)}
              disabled={isBusy}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs shrink-0"
              onClick={handleSaveOwner}
              disabled={isBusy}
            >
              Save
            </Button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Expected Release Date
          </Label>
          <div className="flex gap-1.5">
            <Input
              type="date"
              className="h-7 text-xs"
              value={expectedDate}
              onChange={e => setExpectedDate(e.target.value)}
              disabled={isBusy || isReleased}
            />
            {!isReleased && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs shrink-0"
                onClick={handleSaveExpected}
                disabled={isBusy}
              >
                Save
              </Button>
            )}
          </div>
        </div>
      </div>

      {!isReleased && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Delay Reason
            </Label>
            <div className="flex gap-1.5">
              <Textarea
                className="text-xs min-h-[56px] resize-none"
                placeholder="Reason for delay (if any)…"
                value={delayReason}
                onChange={e => setDelayReason(e.target.value)}
                disabled={isBusy}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs shrink-0 self-start mt-0.5"
                onClick={handleSaveDelay}
                disabled={isBusy}
              >
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Flag className="w-3 h-3" /> Actual Release Date
            </Label>
            <Input
              type="date"
              className="h-7 text-xs"
              value={actualReleaseDate}
              onChange={e => setActualReleaseDate(e.target.value)}
              disabled={isBusy}
            />
          </div>
        </div>
      )}

      {c.releaseDelayReason && !isReleased && (
        <p className="text-[11px] text-amber-400/80 flex items-start gap-1.5 pt-0.5">
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span>{c.releaseDelayReason}</span>
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
        {!isReleased ? (
          <Button
            size="sm"
            className="gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700"
            onClick={handleMarkReleased}
            disabled={isBusy}
          >
            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
            Mark as Released
          </Button>
        ) : (
          <Button
            size="sm"
            className="gap-1 text-xs bg-cyan-600 hover:bg-cyan-700"
            onClick={onAdvance}
            disabled={advancePending}
          >
            {advancePending ? <Loader2 className="w-3 h-3 animate-spin" /> : <SendHorizonal className="w-3 h-3" />}
            Submit to Delivery
          </Button>
        )}
      </div>
    </Card>
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

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="active" className="gap-1.5">
            <Building2 className="w-3.5 h-3.5" /> Active
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
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
                    ) : stage === "final_release" ? (
                      <div className="space-y-3">
                        {containers.map(c => (
                          <FinalReleaseCard
                            key={c.id}
                            c={c}
                            onAdvance={() => handleSubmit(c)}
                            advancePending={advance.isPending}
                          />
                        ))}
                      </div>
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
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <CompletedJobsView
            deptStages={DEPT_STAGES}
            emptyTitle="No jobs submitted yet"
            emptySubtitle="Once a job moves past Final Release, it will show up here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
