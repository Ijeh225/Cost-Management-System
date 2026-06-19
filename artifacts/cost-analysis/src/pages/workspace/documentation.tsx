import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import * as XLSX from "xlsx";
import {
  useGetPipeline,
  useAdvanceContainerStatus,
  useUpdateDocumentationCard,
  useUpdateContainerCharges,
  type PipelineContainer,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, getStatusColor, getStatusLabel, WORKFLOW_STAGES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Loader2, Search, FileCheck2, Clock, SendHorizonal, Inbox,
  CheckCircle2, ChevronDown, ChevronRight, Download, AlertTriangle, Eye,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

  function handleSetPaarReleaseDate() {
    const today = new Date().toISOString().slice(0, 10);
    setPaarReleaseDate(today);
  }

  async function handleSaveOnly() {
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
      if (assessmentAmt && parseFloat(assessmentAmt) > 0) {
        await updateCharges.mutateAsync({
          id: c.id,
          data: { section: "customs", customs: { duty: parseFloat(assessmentAmt) } },
        });
      }
      toast({ title: "Saved", description: `${c.containerNumber} updated. Submit when PAAR is ready.` });
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAndSubmit() {
    setBusy(true);
    try {
      const normalizedPaarNumber = paarNumber.trim();
      const releaseDateForSave = normalizedPaarNumber
        ? (paarReleaseDate || new Date().toISOString().slice(0, 10))
        : (paarReleaseDate || null);

      // Always save whatever data is present
      await updateCard.mutateAsync({
        id: c.id,
        stageOwner:        stageOwner      || null,
        nextAction:        null,
        nextActionDueDate: paarEta         || null,
        delayReason:       delayReason     || null,
        paarNumber:        normalizedPaarNumber || null,
        paarReleasedAt:    releaseDateForSave,
        paarDelayReason:   paarDelayReason || null,
      });

      if (assessmentAmt && parseFloat(assessmentAmt) > 0) {
        await updateCharges.mutateAsync({
          id: c.id,
          data: { section: "customs", customs: { duty: parseFloat(assessmentAmt) } },
        });
      }

      // Only advance to Submitted when PAAR Number is entered. Release date defaults to today.
      if (normalizedPaarNumber) {
        if (!paarReleaseDate) setPaarReleaseDate(releaseDateForSave ?? "");
        const stageIdx = DEPT_STAGES.indexOf(c.stage as typeof DEPT_STAGES[number]);
        const stagesToAdvance = DEPT_STAGES.slice(stageIdx >= 0 ? stageIdx : 0);
        for (const stage of stagesToAdvance) {
          await advance.mutateAsync({ id: c.id, status: stage });
        }
        toast({ title: "Documentation submitted", description: `${c.containerNumber} moved to Submitted. Operations can continue from the Operations page.` });
        onSubmitSuccess();
      } else {
        toast({ title: "Saved", description: "This job remains Active until PAAR Number is entered." });
      }
    } catch (e) {
      toast({ variant: "destructive", title: "Save failed", description: (e as Error).message });
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
              <Label className="text-xs text-muted-foreground">
                PAAR Number
                {paarNumber.trim() && !paarReleaseDate && (
                  <span className="ml-1.5 text-amber-400">— click Set to confirm release date</span>
                )}
                {paarNumber.trim() && paarReleaseDate && (
                  <span className="ml-1.5 text-emerald-400">✓ Release date confirmed</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  value={paarNumber}
                  onChange={e => setPaarNumber(e.target.value)}
                  placeholder="e.g. PAAR/2024/00123"
                  className="h-8 text-sm bg-background border-border/60 flex-1"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={paarReleaseDate ? "outline" : "default"}
                  onClick={handleSetPaarReleaseDate}
                  disabled={!paarNumber.trim()}
                  className="h-8 px-3 text-xs shrink-0"
                  title="Set today as PAAR Release Date"
                >
                  Set
                </Button>
              </div>
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

          {/* Row 3: Assessment Amount (optional — can be filled at any time) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-amber-400">
              Assessment Amount (₦) <span className="text-muted-foreground font-normal">(optional)</span>
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
              Optional — enter when known. Will appear on the Duty Payments page.
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

          {/* Action — single smart button */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground/60">
              {paarNumber.trim()
                ? "Ready to submit. If release date is blank, today will be used."
                : "Job stays Active until PAAR Number is entered."}
            </p>
            <Button
              onClick={handleSaveAndSubmit}
              disabled={busy}
              className={`gap-2 shrink-0 ${paarNumber.trim() ? "" : "opacity-80"}`}
              variant={paarNumber.trim() ? "default" : "outline"}
            >
              {busy
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : paarNumber.trim()
                  ? <SendHorizonal className="w-4 h-4" />
                  : <CheckCircle2 className="w-4 h-4" />}
              {paarNumber.trim() ? "Save & Submit" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium text-foreground">{value || "—"}</div>
    </div>
  );
}

function SubmittedDocumentationView({ containers }: { containers: DocContainer[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DocContainer | null>(null);
  const q = search.trim().toLowerCase();
  const filtered = containers.filter(c =>
    !q
    || c.containerNumber.toLowerCase().includes(q)
    || (c.blNumber ?? "").toLowerCase().includes(q)
    || c.customerName.toLowerCase().includes(q)
    || (c.paarNumber ?? "").toLowerCase().includes(q)
  );

  return (
    <>
      <div className="space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search submitted documentation by container #, BL #, customer, or PAAR..."
            className="pl-11 h-11 text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
              <Inbox className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {search.trim() ? "No matching submitted documentation." : "No jobs submitted yet"}
            </p>
            <p className="text-xs text-muted-foreground/60">
              Jobs submitted by Documentation appear here for reference.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{filtered.length} submitted documentation record{filtered.length === 1 ? "" : "s"}</span>
              <span>Read-only</span>
            </div>
            <div className="space-y-2">
              {filtered.map(c => (
                <Card key={c.id} className="p-4 flex items-center gap-4 border-border/50 bg-card/60">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
                      {c.blNumber && <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>}
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                        Documentation Submitted
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusColor(c.stage)}`}>
                        {getStatusLabel(c.stage)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground truncate">
                      <span className="truncate">{c.customerName}</span>
                      {c.paarNumber && <span className="font-mono shrink-0">PAAR: {c.paarNumber}</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1 text-xs h-8 shrink-0" onClick={() => setSelected(c)}>
                    <Eye className="w-3 h-3" />
                    View Details
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}>
        <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-yellow-400" />
              Documentation Submitted
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-5">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-semibold font-mono">{selected.containerNumber}</span>
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Read only</Badge>
                  <Badge variant="outline" className={getStatusColor(selected.stage)}>{getStatusLabel(selected.stage)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{selected.customerName}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailItem label="BL Number" value={selected.blNumber} />
                <DetailItem label="PAAR Number" value={selected.paarNumber} />
                <DetailItem label="PAAR Release Date" value={fmtDate(selected.paarReleasedAt)} />
                <DetailItem label="PAAR ETA" value={fmtDate(selected.nextActionDueAt)} />
                <DetailItem label="Documentation Officer" value={selected.stageOwnerName} />
                <DetailItem label="Assessment Amount" value={formatCurrency(selected.duty ?? 0)} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DetailItem label="PAAR Delay Reason" value={selected.paarDelayReason} />
                <DetailItem label="General Delay Reason" value={selected.delayReason} />
              </div>

              <p className="text-xs text-muted-foreground">
                Documentation workflow ends here. Use the Operations page for any downstream duty payment or operations action.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
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
  const submittedContainers: DocContainer[] = useMemo(() => {
    const lastDeptIdx = Math.max(...DEPT_STAGES.map(stage => WORKFLOW_STAGES.findIndex(s => s.value === stage)));
    const downstreamStages = WORKFLOW_STAGES.slice(lastDeptIdx + 1).map(s => s.value);
    const seen = new Set<number>();
    return downstreamStages.flatMap(stage =>
      (data?.stages?.[stage] ?? []).map(c => ({ ...c, stage }))
    ).filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  }, [data]);

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
          <p className="text-xs text-muted-foreground">
            Jobs stay Active until PAAR Number is entered. You can save progress while PAAR is still pending.
          </p>
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
          <SubmittedDocumentationView containers={submittedContainers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
