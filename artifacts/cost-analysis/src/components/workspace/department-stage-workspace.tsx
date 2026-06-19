import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetPipeline,
  useStageAction,
  type PipelineContainer,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_STAGES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  Search,
  SendHorizonal,
  User,
  type LucideIcon,
} from "lucide-react";

type DepartmentStage = "transire_processing" | "shipping" | "terminal" | "pull_out";

type StageField =
  | "expectedTransireDate"
  | "transireReleasedAt"
  | "transireDelayReason"
  | "transireFinalDate"
  | "expectedDoDate"
  | "doReleasedAt"
  | "doDelayReason"
  | "doFinalDate"
  | "expectedTdoDate"
  | "tdoReleasedAt"
  | "tdoDelayReason"
  | "tdoFinalDate"
  | "expectedPulloutDate"
  | "pulloutReleasedAt"
  | "pulloutDelayReason"
  | "pulloutFinalDate";

type StageConfig = {
  stage: DepartmentStage;
  title: string;
  subtitle: string;
  activeLabel: string;
  submittedLabel: string;
  emptyActive: string;
  emptySubmitted: string;
  submitLabel: string;
  expectedLabel: string;
  releasedLabel: string;
  accentClass: string;
  icon: LucideIcon;
  canAccess: boolean;
  redirectPath?: string;
  expectedField: StageField;
  releasedField: StageField;
  delayField: StageField;
  finalDateField: StageField;
  ready?: (container: DepartmentContainer) => boolean;
  notReadyMessage?: string;
};

type DepartmentContainer = PipelineContainer & { stage: DepartmentStage };

function fmtInput(iso: string | null | undefined) {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function fmtDisplay(iso: string | null | undefined) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function DaysChip({ days }: { days: number }) {
  const color =
    days >= 7
      ? "text-red-500 bg-red-500/10 border-red-500/30"
      : days >= 3
        ? "text-amber-500 bg-amber-500/10 border-amber-500/30"
        : "text-emerald-500 bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${color}`}>
      <Clock className="w-2.5 h-2.5" />
      {days}d
    </span>
  );
}

function JobSummary({ c, config }: { c: DepartmentContainer; config: StageConfig }) {
  const releasedAt = c[config.releasedField] as string | null | undefined;
  const expectedDate = c[config.expectedField] as string | null | undefined;
  const isOverdue = expectedDate && !releasedAt && new Date(expectedDate) < new Date();

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
        {c.blNumber && <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>}
        <DaysChip days={c.daysInStage} />
        {releasedAt && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 text-emerald-500 bg-emerald-500/10 border-emerald-500/30">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Submitted {fmtDisplay(releasedAt)}
          </span>
        )}
        {isOverdue && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 text-amber-500 bg-amber-500/10 border-amber-500/30">
            <AlertTriangle className="w-2.5 h-2.5" />
            Expected date overdue
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.customerName || "No customer recorded"}</p>
      <div className="flex flex-wrap gap-2 mt-2 text-[11px] text-muted-foreground">
        <span>{config.expectedLabel}: {fmtDisplay(expectedDate)}</span>
        <span>Owner: {c.stageOwnerName || "Unassigned"}</span>
      </div>
    </div>
  );
}

function StageJobCard({
  c,
  config,
}: {
  c: DepartmentContainer;
  config: StageConfig;
}) {
  const { toast } = useToast();
  const stageAction = useStageAction();
  const releasedAt = c[config.releasedField] as string | null | undefined;
  const delayReasonValue = c[config.delayField] as string | null | undefined;
  const finalDateValue = c[config.finalDateField] as string | null | undefined;

  const [expanded, setExpanded] = useState(false);
  const [stageOwner, setStageOwner] = useState(c.stageOwnerName ?? "");
  const [expectedDate, setExpectedDate] = useState(fmtInput(c[config.expectedField] as string | null | undefined));
  const [delayReason, setDelayReason] = useState(delayReasonValue ?? "");
  const [finalDate, setFinalDate] = useState(fmtInput(finalDateValue || releasedAt));

  useEffect(() => {
    setStageOwner(c.stageOwnerName ?? "");
    setExpectedDate(fmtInput(c[config.expectedField] as string | null | undefined));
    setDelayReason(delayReasonValue ?? "");
    setFinalDate(fmtInput(finalDateValue || releasedAt));
  }, [c.id, c.stageOwnerName, c[config.expectedField], delayReasonValue, finalDateValue, releasedAt]);

  const isBusy = stageAction.isPending;
  const isReady = config.ready ? config.ready(c) : true;

  function runAction(action: "set_expected_date" | "mark_released" | "record_delay" | "update_stage_owner", extra?: Record<string, unknown>) {
    stageAction.mutate(
      { id: c.id, stage: config.stage, action, ...extra },
      {
        onSuccess: () => toast({ title: "Saved", description: `${c.containerNumber} updated for ${config.title}.` }),
        onError: (e) => toast({ variant: "destructive", title: "Error", description: (e as Error).message }),
      }
    );
  }

  return (
    <Card className="p-4 space-y-4 border-border/50 hover:bg-accent/10 transition-colors">
      <div className="flex items-start gap-4">
        <JobSummary c={c} config={config} />
        <Button size="sm" variant="outline" className="gap-1 text-xs shrink-0" onClick={() => setExpanded(v => !v)}>
          {expanded ? "Hide Controls" : "Open Job"}
        </Button>
      </div>

      {expanded && (
        <div className="border-t pt-4 space-y-4">
          {!isReady && config.notReadyMessage && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              {config.notReadyMessage}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Stage owner</Label>
              <div className="flex gap-2">
                <Input value={stageOwner} onChange={e => setStageOwner(e.target.value)} placeholder="Officer or staff name" />
                <Button variant="outline" disabled={isBusy} onClick={() => runAction("update_stage_owner", { stageOwner: stageOwner || null })}>
                  <User className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{config.expectedLabel}</Label>
              <div className="flex gap-2">
                <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
                <Button variant="outline" disabled={isBusy || !expectedDate} onClick={() => runAction("set_expected_date", { expectedDate })}>
                  <Calendar className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-2">
              <Label>{config.releasedLabel} <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input type="date" value={finalDate} onChange={e => setFinalDate(e.target.value)} />
            </div>
            <Button disabled={isBusy || !isReady} onClick={() => runAction("mark_released", { finalDate: finalDate || undefined })}>
              {isBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SendHorizonal className="w-4 h-4 mr-2" />}
              {config.submitLabel}
            </Button>
          </div>

          <div className="space-y-2">
            <Label>Delay reason / note</Label>
            <Textarea value={delayReason} onChange={e => setDelayReason(e.target.value)} placeholder="Record delay reason, terminal instruction, or shipping line update" />
            <Button variant="outline" disabled={isBusy || !delayReason.trim()} onClick={() => runAction("record_delay", { delayReason, finalDate: finalDate || undefined })}>
              Save Delay / Note
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export function DepartmentStageWorkspace({ config }: { config: StageConfig }) {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedSubmitted, setSelectedSubmitted] = useState<DepartmentContainer | null>(null);
  const { data, isLoading } = useGetPipeline({ query: { refetchInterval: 30_000 } });

  useEffect(() => {
    if (!config.canAccess) setLocation(config.redirectPath ?? "/");
  }, [config.canAccess, config.redirectPath, setLocation]);

  const containers = useMemo(() => {
    const seen = new Set<number>();
    return (data?.stages?.[config.stage] ?? [])
      .map(c => ({ ...c, stage: config.stage }))
      .filter(c => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return config.ready ? config.ready(c) || config.stage !== "pull_out" : true;
      });
  }, [data?.stages, config]);

  if (!config.canAccess) return null;

  const active = containers.filter(c => !c[config.releasedField]);
  const submitted = containers.filter(c => !!c[config.releasedField]);
  const searchTerm = search.trim().toLowerCase();
  const filteredActive = searchTerm
    ? active.filter(c =>
        c.containerNumber.toLowerCase().includes(searchTerm) ||
        (c.blNumber ?? "").toLowerCase().includes(searchTerm) ||
        (c.customerName ?? "").toLowerCase().includes(searchTerm) ||
        (c.stageOwnerName ?? "").toLowerCase().includes(searchTerm)
      )
    : active;
  const filteredSubmitted = searchTerm
    ? submitted.filter(c =>
        c.containerNumber.toLowerCase().includes(searchTerm) ||
        (c.blNumber ?? "").toLowerCase().includes(searchTerm) ||
        (c.customerName ?? "").toLowerCase().includes(searchTerm) ||
        (c.stageOwnerName ?? "").toLowerCase().includes(searchTerm)
      )
    : submitted;

  const Icon = config.icon;
  const stageLabel = WORKFLOW_STAGES.find(s => s.value === config.stage)?.label ?? config.title;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${config.accentClass}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{config.title}</h1>
            <p className="text-sm text-muted-foreground">{config.subtitle}</p>
          </div>
        </div>

        <Tabs defaultValue="active" className="w-full">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid">
              <TabsTrigger value="active" className="gap-1.5">
                <Inbox className="w-3.5 h-3.5" />
                {config.activeLabel} ({active.length})
              </TabsTrigger>
              <TabsTrigger value="submitted" className="gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {config.submittedLabel} ({submitted.length})
              </TabsTrigger>
            </TabsList>
            <Badge variant="outline" className="self-start sm:self-auto">{stageLabel}</Badge>
          </div>

          <div className="relative mt-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search by container number, BL, customer, or owner..."
              className="pl-12 h-12 text-base bg-card border-border/60 focus-visible:ring-primary/40"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <TabsContent value="active" className="space-y-4 mt-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading jobs...</p>
              </div>
            ) : filteredActive.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <Inbox className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">{searchTerm ? "No matching active jobs" : config.emptyActive}</p>
                <p className="text-xs text-muted-foreground max-w-md">This department stays focused on its own active and submitted work without redirecting to Operations.</p>
              </div>
            ) : (
              filteredActive.map(c => <StageJobCard key={c.id} c={c} config={config} />)
            )}
          </TabsContent>

          <TabsContent value="submitted" className="space-y-4 mt-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading jobs...</p>
              </div>
            ) : filteredSubmitted.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <CheckCircle2 className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-sm font-medium">{searchTerm ? "No matching submitted jobs" : config.emptySubmitted}</p>
              </div>
            ) : (
              filteredSubmitted.map(c => (
                <Card key={c.id} className="p-4 flex items-center gap-4 border-border/50">
                  <JobSummary c={c} config={config} />
                  <Button size="sm" variant="outline" onClick={() => setSelectedSubmitted(c)}>View Details</Button>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!selectedSubmitted} onOpenChange={open => { if (!open) setSelectedSubmitted(null); }}>
          <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{config.title} Submitted</DialogTitle>
            </DialogHeader>
            {selectedSubmitted && (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/20 p-4">
                  <JobSummary c={selectedSubmitted} config={config} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Submitted Date</p>
                    <p className="font-medium">{fmtDisplay(selectedSubmitted[config.releasedField] as string | null | undefined)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Expected Date</p>
                    <p className="font-medium">{fmtDisplay(selectedSubmitted[config.expectedField] as string | null | undefined)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stage Owner</p>
                    <p className="font-medium">{selectedSubmitted.stageOwnerName || "Unassigned"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Current Downstream Status</p>
                    <p className="font-medium">{selectedSubmitted.status}</p>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Delay reason / note</p>
                  <p className="text-sm font-medium">{(selectedSubmitted[config.delayField] as string | null | undefined) || "No delay note recorded."}</p>
                </div>
                <p className="text-xs text-muted-foreground">Read only. To manage downstream Operations work, use the Operations page.</p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
