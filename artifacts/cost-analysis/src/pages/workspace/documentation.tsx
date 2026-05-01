import { useState, useRef, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  useGetPipeline,
  useAdvanceContainerStatus,
  useUpdateDocumentationCard,
  useUpdateContainerCharges,
  type PipelineContainer,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { getStatusColor, WORKFLOW_STAGES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Loader2, Search, FileCheck2, Clock, SendHorizonal, Inbox,
  CheckCircle2, ChevronDown, ChevronRight, Download, AlertTriangle,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CompletedJobsView } from "@/components/workspace/completed-jobs-view";

const DEPT_STAGES = ["registered", "documentation", "duty_assessment"] as const;

const STAGE_FILTER_OPTIONS = [
  { value: "all",            label: "All" },
  { value: "documentation",  label: "Documentation" },
  { value: "duty_assessment", label: "Duty Assessment" },
];

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return "—"; }
}

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

type DocContainer = PipelineContainer & { stage: string };

function DocCard({ c, onSubmitSuccess }: { c: DocContainer; onSubmitSuccess: () => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded]         = useState(false);
  const [stageOwner,      setStageOwner]      = useState(c.stageOwnerName    ?? "");
  const [paarNumber,      setPaarNumber]      = useState(c.paarNumber         ?? "");
  const [paarEta,         setPaarEta]         = useState(
    c.nextActionDueAt ? c.nextActionDueAt.slice(0, 10) : ""
  );
  const [paarReleaseDate, setPaarReleaseDate] = useState(
    c.paarReleasedAt ? c.paarReleasedAt.slice(0, 10) : ""
  );
  const [paarDelayReason, setPaarDelayReason] = useState(c.paarDelayReason ?? "");
  const [delayReason,     setDelayReason]     = useState(c.delayReason      ?? "");
  const [assessmentAmt,   setAssessmentAmt]   = useState(
    c.duty && c.duty > 0 ? String(c.duty) : ""
  );
  const [busy, setBusy] = useState(false);

  const updateCard    = useUpdateDocumentationCard();
  const updateCharges = useUpdateContainerCharges();
  const advance       = useAdvanceContainerStatus();

  const isPaarOverdue = paarEta && new Date(paarEta) < new Date() && !paarReleaseDate;
  const assessmentInvalid = !assessmentAmt || parseFloat(assessmentAmt) <= 0;

  async function handleSaveAndSubmit() {
    if (assessmentInvalid) {
      toast({ variant: "destructive", title: "Assessment amount required", description: "Enter the NCS duty amount before submitting." });
      return;
    }
    setBusy(true);
    try {
      await updateCard.mutateAsync({
        id: c.id,
        stageOwner:        stageOwner      || null,
        nextAction:        null,
        nextActionDueDate: paarEta         || null,
        delayReason:       delayReason     || null,
        paarNumber:        paarNumber      || null,
        paarReleasedAt:    paarReleaseDate || null,
        paarDelayReason:   paarDelayReason || null,
      });

      await updateCharges.mutateAsync({
        id: c.id,
        data: { section: "customs", customs: { duty: parseFloat(assessmentAmt) } },
      });

      // Advance through ALL remaining doc-dept stages in sequence so one click
      // takes the job all the way to Duty Payment, regardless of current stage.
      const stageIdx = DEPT_STAGES.indexOf(c.stage as typeof DEPT_STAGES[number]);
      const stagesToAdvance = DEPT_STAGES.slice(stageIdx >= 0 ? stageIdx : 0);
      for (const stage of stagesToAdvance) {
        await advance.mutateAsync({ id: c.id, status: stage });
      }

      toast({ title: "Submitted", description: `${c.containerNumber} submitted — moved to Duty Payment.` });
      onSubmitSuccess();
    } catch (e) {
      toast({ variant: "destructive", title: "Submission failed", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const stageInfo = WORKFLOW_STAGES.find(s => s.value === c.stage);

  return (
    <Card className={`border transition-colors ${expanded ? "border-primary/30 bg-card" : "border-border/50 bg-card/60 hover:bg-accent/20"}`}>
      {/* Card header — always visible, click to toggle */}
      <div
        className="p-4 flex items-center gap-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="shrink-0 text-muted-foreground">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-primary" />
            : <ChevronRight className="w-4 h-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
            <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
            <DaysChip days={c.daysInStage} />
            {isPaarOverdue && (
              <span className="inline-flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
                <AlertTriangle className="w-2.5 h-2.5" /> PAAR overdue
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{c.customerName}</p>
        </div>

        <Badge variant="outline" className={`shrink-0 text-[10px] ${getStatusColor(c.stage)}`}>
          {stageInfo?.short ?? c.stage}
        </Badge>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="px-4 pb-5 space-y-4">
          <Separator />

          {/* Row 1: Stage Owner + PAAR Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Stage Owner</Label>
              <Input
                value={stageOwner}
                onChange={e => setStageOwner(e.target.value)}
                placeholder="Person responsible"
                className="h-8 text-sm bg-background border-border/60"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">PAAR Number</Label>
              <Input
                value={paarNumber}
                onChange={e => setPaarNumber(e.target.value)}
                placeholder="e.g. PAAR/2024/00123"
                className="h-8 text-sm bg-background border-border/60"
              />
            </div>
          </div>

          {/* Row 2: PAAR ETA + PAAR Release Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className={`text-xs ${isPaarOverdue ? "text-red-400" : "text-muted-foreground"}`}>
                PAAR ETA {isPaarOverdue && <span className="text-red-400">(overdue)</span>}
              </Label>
              <Input
                type="date"
                value={paarEta}
                onChange={e => setPaarEta(e.target.value)}
                className={`h-8 text-sm bg-background border-border/60 ${isPaarOverdue ? "border-red-500/50 text-red-400" : ""}`}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">PAAR Release Date</Label>
              <Input
                type="date"
                value={paarReleaseDate}
                onChange={e => setPaarReleaseDate(e.target.value)}
                className="h-8 text-sm bg-background border-border/60"
              />
            </div>
          </div>

          {/* Row 3: Assessment Amount (always required — full workflow submitted in one click) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-amber-400">
              Assessment Amount (₦)<span className="text-red-400 ml-1">*</span>
            </Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={assessmentAmt}
              onChange={e => setAssessmentAmt(e.target.value)}
              placeholder="Enter NCS-assessed duty amount"
              className="h-8 text-sm bg-background font-mono border-amber-500/40"
            />
            <p className="text-[10px] text-muted-foreground">
              Required — this amount will appear on the Duty Payments page.
            </p>
          </div>

          {/* Row 4: Delay reasons (optional, collapsible feel) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">PAAR Delay Reason <span className="opacity-50">(optional)</span></Label>
              <Textarea
                value={paarDelayReason}
                onChange={e => setPaarDelayReason(e.target.value)}
                placeholder="Why is PAAR delayed?"
                rows={2}
                className="text-sm bg-background border-border/60 resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">General Delay Reason <span className="opacity-50">(optional)</span></Label>
              <Textarea
                value={delayReason}
                onChange={e => setDelayReason(e.target.value)}
                placeholder="Any general blockers?"
                rows={2}
                className="text-sm bg-background border-border/60 resize-none"
              />
            </div>
          </div>

          <Separator />

          {/* Single action button */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground/60">
              Saves all fields and submits this job directly to Duty Payment.
            </p>
            <Button
              onClick={handleSaveAndSubmit}
              disabled={busy || assessmentInvalid}
              className="gap-2 shrink-0"
            >
              {busy
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <SendHorizonal className="w-4 h-4" />}
              Save &amp; Submit
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function DocumentationWorkspace() {
  const { toast } = useToast();
  const [search, setSearch]           = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const { data, isLoading, refetch }  = useGetPipeline({ query: { refetchInterval: 30_000 } });

  useEffect(() => { searchRef.current?.focus(); }, []);

  const allContainers: DocContainer[] = DEPT_STAGES.flatMap(s =>
    (data?.stages?.[s] ?? []).map(c => ({ ...c, stage: s }))
  );

  const q = search.trim().toLowerCase();
  const filtered = allContainers.filter(c => {
    const matchSearch = !q
      || c.containerNumber.toLowerCase().includes(q)
      || (c.blNumber ?? "").toLowerCase().includes(q)
      || c.customerName.toLowerCase().includes(q);
    const matchStage = stageFilter === "all" || c.stage === stageFilter;
    return matchSearch && matchStage;
  });

  function handleDownload() {
    if (filtered.length === 0) {
      toast({ variant: "destructive", title: "Nothing to export", description: "No containers match the current filters." });
      return;
    }
    const rows = filtered.map(c => ({
      "Container #":       c.containerNumber,
      "BL #":              c.blNumber ?? "",
      "Customer":          c.customerName,
      "Stage":             WORKFLOW_STAGES.find(s => s.value === (c as DocContainer).stage)?.label ?? (c as DocContainer).stage,
      "PAAR Number":       c.paarNumber ?? "",
      "PAAR ETA":          c.nextActionDueAt ? fmtDate(c.nextActionDueAt) : "",
      "PAAR Release Date": c.paarReleasedAt  ? fmtDate(c.paarReleasedAt)  : "",
      "Delay Reason":      c.delayReason ?? "",
      "Days in Stage":     c.daysInStage,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const headers = Object.keys(rows[0]);
    ws["!cols"] = headers.map(h => ({
      wch: Math.min(Math.max(h.length, ...rows.map(r => String((r as Record<string, unknown>)[h] ?? "").length)) + 2, 40),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Documentation");
    XLSX.writeFile(wb, `documentation-jobs-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast({ title: "Download ready", description: `${filtered.length} container${filtered.length !== 1 ? "s" : ""} exported.` });
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-6 h-6 text-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">My Jobs</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Documentation Department</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {!isLoading && (
            <div className="text-right">
              <p className="text-2xl font-bold">{allContainers.length}</p>
              <p className="text-xs text-muted-foreground">active jobs</p>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={handleDownload} className="gap-1.5 text-xs h-8">
            <Download className="w-3.5 h-3.5" /> Download
          </Button>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid grid-cols-2 w-full sm:w-auto sm:inline-grid">
          <TabsTrigger value="active" className="gap-1.5">
            <FileCheck2 className="w-3.5 h-3.5" /> Active
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" /> Submitted
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 mt-6">
          {/* Search + Filter row */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search by container #, BL #, or customer…"
                className="pl-11 h-10 text-sm"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STAGE_FILTER_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setStageFilter(opt.value)}
                  className={`text-[11px] px-3 py-1.5 rounded-full border transition-colors ${
                    stageFilter === opt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border/50 hover:border-border hover:text-foreground"
                  }`}
                >
                  {opt.label}
                  {opt.value !== "all" && (
                    <span className="ml-1.5 opacity-60">
                      {allContainers.filter(c => c.stage === opt.value).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Job list */}
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
                <Inbox className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                {allContainers.length === 0 ? "No active jobs" : "No jobs match your filters"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {allContainers.length === 0
                  ? "Jobs assigned to your stages will appear here."
                  : "Try clearing your search or changing the stage filter."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map(c => (
                <DocCard key={c.id} c={c} onSubmitSuccess={() => refetch()} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-6">
          <CompletedJobsView
            deptStages={[...DEPT_STAGES]}
            emptyTitle="No jobs submitted yet"
            emptySubtitle="Once you submit a job, it will show up here for review."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
