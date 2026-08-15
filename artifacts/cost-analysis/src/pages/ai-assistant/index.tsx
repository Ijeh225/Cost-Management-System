import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AlertTriangle, Bell, Bot, CheckCircle2, ClipboardCheck, ExternalLink, FilePlus2, FileSearch, Loader2, LockKeyhole, RefreshCw, Send, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type AssistantStatus = {
  phase: "controlled_assisted_actions";
  available: true;
  modelConnected: false;
  copilotMode: "guided_read_only_with_confirmed_actions";
  approvedToolCount: number;
  governance: { accessRoles: string[]; mode: "read_only"; auditRetentionDays: number; actionPolicy: "human_confirmation_required" };
  safeguards: string[];
};

type CopilotAnswer = {
  sessionId: number;
  question: string;
  answer: string;
  status: "answered" | "unsupported" | "no_data";
  facts: Array<{ label: string; value: string | number; detail?: string }>;
  calculations: string[];
  assumptions: string[];
  citations: Array<{ type: string; id?: number; label: string; href: string }>;
  records: Array<{ title: string; detail: string; href: string; badges?: string[] }>;
};

type AssistantDraftType = "payment_schedule" | "workflow_notification" | "management_summary";
type AssistantActionDraft = {
  id: number;
  type: AssistantDraftType;
  status: "draft" | "executing" | "confirmed" | "cancelled" | "expired" | "failed";
  payload: Record<string, unknown>;
  preview: {
    title: string;
    description: string;
    confirmationText: string;
    fields: Array<{ label: string; value: string }>;
    sourceRecords: Array<{ type: string; label: string; href: string }>;
  };
  confirmationNote: string | null;
  executionResult: { href?: string; action?: string; recipientCount?: number } | null;
  expiresAt: string;
};

type ProactiveBriefing = {
  id: number;
  branchId: number;
  period: "daily" | "weekly" | "on_demand";
  briefingDate: string;
  title: string;
  summary: string;
  insightCount: number;
  generatedAt: string;
  counts: { critical: number; warning: number; watch: number };
  insights: Array<{
    severity: "critical" | "warning" | "watch";
    category: string;
    title: string;
    detail: string;
    recommendedAction: string;
    href: string;
    source: { type: string; id: number; label: string };
  }>;
};

const ACTION_DRAFT_TYPES: Array<{ value: AssistantDraftType; label: string; description: string; icon: typeof FilePlus2 }> = [
  { value: "payment_schedule", label: "Payment schedule", description: "Create a normal Pending Approval request. It cannot approve or pay money.", icon: FilePlus2 },
  { value: "workflow_notification", label: "Internal notification", description: "Send an in-app notification to the selected branch administrators.", icon: Bell },
  { value: "management_summary", label: "Management summary", description: "Finalise a read-only summary for management review.", icon: ClipboardCheck },
];

function BriefingView({ briefing, onOpen }: { briefing: ProactiveBriefing; onOpen: (href: string) => void }) {
  const severityClass = { critical: "border-destructive/30 bg-destructive/[0.06] text-destructive", warning: "border-amber-500/30 bg-amber-500/[0.07] text-amber-700 dark:text-amber-400", watch: "border-primary/20 bg-primary/[0.05] text-primary" } as const;
  const periodLabel = briefing.period === "on_demand" ? "Current" : briefing.period[0].toUpperCase() + briefing.period.slice(1);
  return <div className="space-y-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-medium">{briefing.title}</p><p className="mt-1 text-sm text-muted-foreground">{briefing.summary}</p></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-border/70 bg-muted/30 px-2.5 py-1">{periodLabel} · {briefing.briefingDate}</span><span className="rounded-full border border-destructive/20 bg-destructive/[0.04] px-2.5 py-1 text-destructive">{briefing.counts.critical} critical</span><span className="rounded-full border border-amber-500/20 bg-amber-500/[0.05] px-2.5 py-1 text-amber-700 dark:text-amber-400">{briefing.counts.warning} warning</span><span className="rounded-full border border-primary/20 bg-primary/[0.04] px-2.5 py-1 text-primary">{briefing.counts.watch} watch</span></div></div><div className="grid gap-3 lg:grid-cols-2">{briefing.insights.slice(0, 8).map((insight, index) => <button key={`${insight.source.type}-${insight.source.id}-${index}`} type="button" onClick={() => onOpen(insight.href)} className="rounded-xl border border-border/60 bg-background/55 p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary/[0.03]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{insight.category}</p><p className="mt-1 font-medium leading-5">{insight.title}</p></div><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${severityClass[insight.severity]}`}>{insight.severity}</span></div><p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{insight.detail}</p><p className="mt-3 text-xs font-medium text-primary">{insight.recommendedAction}</p></button>)}</div>{briefing.insights.length > 8 && <p className="text-sm text-muted-foreground">Showing the first 8 of {briefing.insights.length} prioritised items. Generate or review a briefing regularly to keep the list current.</p>}{briefing.insights.length === 0 && <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.05] p-4 text-sm text-muted-foreground">No current exceptions matched the configured rules for this branch. This is a status check, not a guarantee that every record is complete.</div>}</div>;
}

export default function AiAssistantPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [conversation, setConversation] = useState<CopilotAnswer[]>([]);
  const [draftType, setDraftType] = useState<AssistantDraftType>("payment_schedule");
  const [draftPayload, setDraftPayload] = useState({
    vendorBeneficiary: "", description: "", scheduleDate: new Date().toISOString().slice(0, 10), amountRequested: "", priority: "normal",
    message: "", actionUrl: "/notifications", title: "", content: "",
  });
  const [activeDraft, setActiveDraft] = useState<AssistantActionDraft | null>(null);
  const { data: status, isLoading, isError } = useQuery<AssistantStatus>({
    queryKey: ["/api/ai-assistant/status"],
    queryFn: () => customFetch("/api/ai-assistant/status"),
    staleTime: 60_000,
  });
  const { data: suggestions = [] } = useQuery<string[]>({
    queryKey: ["/api/ai-assistant/suggestions"],
    queryFn: () => customFetch("/api/ai-assistant/suggestions"),
    staleTime: 60_000,
  });
  const { data: actionDrafts = [] } = useQuery<AssistantActionDraft[]>({
    queryKey: ["/api/ai-assistant/actions/drafts"],
    queryFn: () => customFetch("/api/ai-assistant/actions/drafts"),
    staleTime: 15_000,
  });
  const { data: briefings = [], isLoading: briefingsLoading } = useQuery<ProactiveBriefing[]>({
    queryKey: ["/api/ai-assistant/briefings"],
    queryFn: () => customFetch("/api/ai-assistant/briefings"),
    staleTime: 30_000,
  });
  const askMutation = useMutation({
    mutationFn: (submittedQuestion: string) => customFetch<CopilotAnswer>("/api/ai-assistant/ask", {
      method: "POST",
      body: JSON.stringify({ question: submittedQuestion, sessionId }),
    }),
    onSuccess: (answer) => {
      setSessionId(answer.sessionId);
      setConversation((messages) => [...messages, answer]);
      setQuestion("");
    },
  });
  const createDraftMutation = useMutation({
    mutationFn: () => customFetch<AssistantActionDraft>("/api/ai-assistant/actions/drafts", {
      method: "POST",
      body: JSON.stringify({ type: draftType, payload: draftPayload }),
    }),
    onSuccess: (draft) => {
      setActiveDraft(draft);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/actions/drafts"] });
    },
  });
  const confirmDraftMutation = useMutation({
    mutationFn: (draft: AssistantActionDraft) => customFetch<{ draft: AssistantActionDraft; executionResult: AssistantActionDraft["executionResult"] }>(`/api/ai-assistant/actions/drafts/${draft.id}/confirm`, {
      method: "POST",
      body: JSON.stringify({ confirmationNote: "Confirmed by an authorised administrator from AI Assistant." }),
    }),
    onSuccess: (response) => {
      setActiveDraft(response.draft);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/actions/drafts"] });
    },
  });
  const cancelDraftMutation = useMutation({
    mutationFn: (draft: AssistantActionDraft) => customFetch<unknown>(`/api/ai-assistant/actions/drafts/${draft.id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      setActiveDraft(null);
      queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/actions/drafts"] });
    },
  });
  const generateBriefingMutation = useMutation({
    mutationFn: () => customFetch<ProactiveBriefing>("/api/ai-assistant/briefings/generate", { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ai-assistant/briefings"] }),
  });

  function submitQuestion(event: FormEvent) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion || askMutation.isPending) return;
    askMutation.mutate(submittedQuestion);
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (isError || !status) return <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-muted-foreground">Unable to load the Finance Copilot. Refresh the page and try again.</div>;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4"><div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div><div><h1 className="text-2xl font-semibold tracking-tight">Financial Intelligence Assistant</h1><p className="mt-1 text-sm text-muted-foreground">A secure, read-only copilot for authorised financial and operational questions.</p></div></div>
        <Button variant="outline" className="gap-2" onClick={() => setLocation("/settings")}><Settings2 className="h-4 w-4" />Review Governance</Button>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03] shadow-sm"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Phase 7: Proactive finance &amp; control intelligence</p><p className="mt-1 text-sm text-muted-foreground">Ask supported questions about live records, readable documents, financial summaries, receivables ageing, bank ledger entries, and review prompts. The copilot uses only {status.approvedToolCount} approved tools, cites each source record, and can surface evidence-based risks before they become larger issues.</p></div></div><span className="w-fit rounded-full border border-primary/20 bg-background px-3 py-1.5 text-xs font-medium">Draft + confirmation required</span></CardContent></Card>

      <Card className="border-border/60 bg-card shadow-sm">
        <CardHeader className="flex flex-col gap-3 border-b border-border/60 p-6 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-primary" />Proactive finance & control briefing</CardTitle><p className="mt-1 text-sm text-muted-foreground">Defined risk rules scan your authorised branch for berthing, operational, documentation, receivable, and payable issues. This is evidence, not speculation.</p></div><Button type="button" variant="outline" className="gap-2" onClick={() => generateBriefingMutation.mutate()} disabled={generateBriefingMutation.isPending}><RefreshCw className={`h-4 w-4 ${generateBriefingMutation.isPending ? "animate-spin" : ""}`} />{generateBriefingMutation.isPending ? "Generating..." : "Generate current briefing"}</Button></CardHeader>
        <CardContent className="p-6">{briefingsLoading ? <div className="flex min-h-28 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : briefings[0] ? <BriefingView briefing={briefings[0]} onOpen={setLocation} /> : <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/[0.12] p-5 text-center"><p className="font-medium">No proactive briefing has been generated yet</p><p className="mt-1 text-sm text-muted-foreground">Generate a current briefing now, or enable daily and weekly briefings in AI Governance settings.</p></div>}{generateBriefingMutation.isError && <p className="mt-3 text-sm text-destructive">{generateBriefingMutation.error instanceof Error ? generateBriefingMutation.error.message : "Unable to generate the briefing."}</p>}</CardContent>
      </Card>

      <Card className="border-border/60 bg-card shadow-sm">
        <CardHeader className="border-b border-border/60 p-6"><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" />Controlled action drafts</CardTitle><p className="text-sm text-muted-foreground">Prepare the action first, review the exact effect, then explicitly confirm it. Every draft and result is retained in the AI audit history.</p></CardHeader>
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="space-y-2">{ACTION_DRAFT_TYPES.map((action) => { const Icon = action.icon; const selected = draftType === action.value; return <button key={action.value} type="button" onClick={() => { setDraftType(action.value); setActiveDraft(null); }} className={`w-full rounded-lg border p-3 text-left transition-colors ${selected ? "border-primary/40 bg-primary/[0.06]" : "border-border/60 bg-background/40 hover:bg-accent/40"}`}><div className="flex items-center gap-2"><Icon className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{action.label}</span></div><p className="mt-1.5 text-xs leading-5 text-muted-foreground">{action.description}</p></button>; })}</div>
          <div className="min-w-0">
            {!activeDraft || activeDraft.status !== "draft" ? <>
              {draftType === "payment_schedule" && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="ai-vendor">Vendor / beneficiary</Label><Input id="ai-vendor" value={draftPayload.vendorBeneficiary} onChange={(event) => setDraftPayload((payload) => ({ ...payload, vendorBeneficiary: event.target.value }))} placeholder="Vendor or beneficiary" /></div><div className="space-y-2"><Label htmlFor="ai-amount">Requested amount</Label><Input id="ai-amount" type="number" min="1" value={draftPayload.amountRequested} onChange={(event) => setDraftPayload((payload) => ({ ...payload, amountRequested: event.target.value }))} placeholder="0.00" /></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="ai-description">Description</Label><Textarea id="ai-description" value={draftPayload.description} onChange={(event) => setDraftPayload((payload) => ({ ...payload, description: event.target.value }))} placeholder="What is this payment request for?" className="min-h-[82px] resize-none" /></div><div className="space-y-2"><Label htmlFor="ai-date">Schedule date</Label><Input id="ai-date" type="date" value={draftPayload.scheduleDate} onChange={(event) => setDraftPayload((payload) => ({ ...payload, scheduleDate: event.target.value }))} /></div><div className="space-y-2"><Label>Priority</Label><Select value={draftPayload.priority} onValueChange={(priority) => setDraftPayload((payload) => ({ ...payload, priority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="urgent">Urgent</SelectItem></SelectContent></Select></div></div>}
              {draftType === "workflow_notification" && <div className="space-y-4"><div className="space-y-2"><Label htmlFor="ai-notification-message">Notification message</Label><Textarea id="ai-notification-message" value={draftPayload.message} onChange={(event) => setDraftPayload((payload) => ({ ...payload, message: event.target.value }))} placeholder="State the operational issue and recommended action..." className="min-h-[112px] resize-none" /></div><div className="space-y-2"><Label htmlFor="ai-notification-link">In-app destination</Label><Input id="ai-notification-link" value={draftPayload.actionUrl} onChange={(event) => setDraftPayload((payload) => ({ ...payload, actionUrl: event.target.value }))} placeholder="/notifications" /></div></div>}
              {draftType === "management_summary" && <div className="space-y-4"><div className="space-y-2"><Label htmlFor="ai-summary-title">Summary title</Label><Input id="ai-summary-title" value={draftPayload.title} onChange={(event) => setDraftPayload((payload) => ({ ...payload, title: event.target.value }))} placeholder="Monthly management summary" /></div><div className="space-y-2"><Label htmlFor="ai-summary-content">Summary content</Label><Textarea id="ai-summary-content" value={draftPayload.content} onChange={(event) => setDraftPayload((payload) => ({ ...payload, content: event.target.value }))} placeholder="Write the reviewed facts, findings, and recommended next actions..." className="min-h-[132px] resize-none" /></div></div>}
              <div className="mt-5 flex flex-wrap items-center gap-3"><Button type="button" onClick={() => createDraftMutation.mutate()} disabled={createDraftMutation.isPending} className="gap-2"><ClipboardCheck className="h-4 w-4" />{createDraftMutation.isPending ? "Preparing preview..." : "Prepare preview"}</Button><span className="text-xs text-muted-foreground">Nothing is created or sent at this step.</span></div>
              {createDraftMutation.isError && <p className="mt-3 text-sm text-destructive">{createDraftMutation.error instanceof Error ? createDraftMutation.error.message : "Unable to prepare this action draft."}</p>}
            </> : <div className="rounded-xl border border-primary/25 bg-primary/[0.035] p-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{activeDraft.preview.title}</h3><p className="mt-1 text-sm text-muted-foreground">{activeDraft.preview.description}</p></div><span className="w-fit rounded-full border border-primary/25 bg-background px-2.5 py-1 text-xs font-medium">Preview only</span></div><dl className="mt-5 grid gap-3 sm:grid-cols-2">{activeDraft.preview.fields.map((field) => <div key={field.label} className="rounded-lg border border-border/60 bg-background/75 p-3"><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 break-words text-sm font-medium">{field.value}</dd></div>)}</dl><div className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-3 text-sm"><p className="font-medium">Confirmation required</p><p className="mt-1 text-muted-foreground">{activeDraft.preview.confirmationText}</p></div><div className="mt-5 flex flex-wrap gap-3"><Button type="button" onClick={() => confirmDraftMutation.mutate(activeDraft)} disabled={confirmDraftMutation.isPending} className="gap-2"><CheckCircle2 className="h-4 w-4" />{confirmDraftMutation.isPending ? "Confirming..." : "Confirm and execute"}</Button><Button type="button" variant="outline" onClick={() => cancelDraftMutation.mutate(activeDraft)} disabled={cancelDraftMutation.isPending}>Cancel draft</Button></div>{confirmDraftMutation.isError && <p className="mt-3 text-sm text-destructive">{confirmDraftMutation.error instanceof Error ? confirmDraftMutation.error.message : "Unable to confirm this action."}</p>}{activeDraft.executionResult?.href && <Button variant="link" type="button" className="mt-3 h-auto px-0" onClick={() => setLocation(activeDraft.executionResult!.href!)}>Open resulting record <ExternalLink className="ml-1 h-3.5 w-3.5" /></Button>}</div>}
            {actionDrafts.filter((draft) => draft.status === "draft").length > 0 && <p className="mt-5 text-xs text-muted-foreground">{actionDrafts.filter((draft) => draft.status === "draft").length} other active draft{actionDrafts.filter((draft) => draft.status === "draft").length === 1 ? "" : "s"} saved for your current branch.</p>}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="min-h-[680px] border-border/60 bg-card shadow-sm">
          <CardHeader className="border-b border-border/60 p-6"><CardTitle className="flex items-center gap-2 text-lg"><Bot className="h-5 w-5 text-primary" />Ask the copilot</CardTitle><p className="text-sm text-muted-foreground">It reports facts, calculations, assumptions, and the exact records used. It will say when it cannot answer safely.</p></CardHeader>
          <CardContent className="flex min-h-[570px] flex-col p-0">
            <div className="flex-1 space-y-5 p-6">
              {conversation.length === 0 && <div className="flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/[0.12] p-8 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><FileSearch className="h-5 w-5" /></div><h2 className="mt-4 text-lg font-semibold">What would you like to review?</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">Try a suggested management question, or ask about an exact container number such as <span className="font-medium">MSCU1234567</span>.</p></div>}
              {conversation.map((message, index) => <div key={`${message.sessionId}-${index}`} className="space-y-3">
                <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">{message.question}</div>
                <div className="max-w-[95%] rounded-2xl rounded-tl-sm border border-border/70 bg-muted/[0.14] p-4"><p className="text-sm leading-6">{message.answer}</p>
                  {message.facts.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{message.facts.map((fact) => <div key={fact.label} className="rounded-lg border border-border/60 bg-background/80 p-3"><p className="text-xs text-muted-foreground">{fact.label}</p><p className="mt-1 font-semibold">{fact.value}</p>{fact.detail && <p className="mt-1 text-xs text-muted-foreground">{fact.detail}</p>}</div>)}</div>}
                  {message.calculations.length > 0 && <div className="mt-4 rounded-lg border border-border/60 bg-background/60 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Calculations</p>{message.calculations.map((calculation) => <p key={calculation} className="mt-1 text-sm">{calculation}</p>)}</div>}
                  {message.records.length > 0 && <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cited records</p>{message.records.map((record) => <button key={`${record.href}-${record.title}`} type="button" onClick={() => setLocation(record.href)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/80 p-3 text-left hover:bg-accent/40"><div className="min-w-0"><p className="font-medium">{record.title}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{record.detail}</p></div><ExternalLink className="h-4 w-4 shrink-0 text-primary" /></button>)}</div>}
                  <div className="mt-4 border-t border-border/50 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assumptions and limits</p>{message.assumptions.map((assumption) => <p key={assumption} className="mt-1 text-xs text-muted-foreground">{assumption}</p>)}</div>
                </div>
              </div>)}
              {askMutation.isPending && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Checking authorised records...</div>}
            </div>
            <form onSubmit={submitQuestion} className="border-t border-border/60 bg-background/70 p-4"><div className="flex gap-3"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about reports, receivables ageing, bank ledger, control reviews, documents, containers, or an exact container..." className="min-h-[74px] resize-none" maxLength={1000} /><Button type="submit" className="h-auto shrink-0 gap-2" disabled={!question.trim() || askMutation.isPending}><Send className="h-4 w-4" />Send</Button></div>{askMutation.isError && <p className="mt-2 text-sm text-destructive">{askMutation.error instanceof Error ? askMutation.error.message : "The copilot could not answer this question."}</p>}</form>
          </CardContent>
        </Card>

        <div className="space-y-5"><Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="text-base">Suggested questions</CardTitle></CardHeader><CardContent className="space-y-2 p-5">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="w-full rounded-lg border border-border/60 bg-background/50 p-3 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">{suggestion}</button>)}</CardContent></Card>
          <Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Safety boundary</CardTitle></CardHeader><CardContent className="space-y-3 p-5 text-sm text-muted-foreground"><div className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Only Admin and Super Admin users can use this copilot.</p></div><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Every answer and action draft is restricted to your current branch access and saved in the AI audit history.</p></div><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>It cannot approve, pay, verify, delete, or send external messages. A second confirmation is required for every allowed action.</p></div></CardContent></Card></div>
      </div>
    </div>
  );
}
