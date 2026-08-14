import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import { Bot, CheckCircle2, DatabaseZap, ExternalLink, LockKeyhole, Play, Search, Settings2, ShieldCheck, Wrench } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

type AssistantStatus = {
  phase: "approved_data_tools";
  available: true;
  modelConnected: boolean;
  approvedToolCount: number;
  governance: {
    accessRoles: string[];
    mode: "read_only";
    dataDomains: string[];
    monthlyBudgetNgn: number;
    auditRetentionDays: number;
    actionPolicy: "human_confirmation_required";
  };
  safeguards: string[];
};

type Tool = { id: string; title: string; description: string; domain: string; requiresContainer?: boolean };
type ToolResult = {
  toolId: string;
  title: string;
  generatedAt: string;
  scope: { branchId: number | null; label: string };
  facts: Array<{ label: string; value: string | number; detail?: string }>;
  records: Array<{ title: string; detail: string; href: string; badges?: string[] }>;
  sources: Array<{ type: string; id?: number; label: string; href: string }>;
  notes: string[];
};

const formatDomain = (domain: string) => domain.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AiAssistantPage() {
  const [, setLocation] = useLocation();
  const [selectedToolId, setSelectedToolId] = useState("operations_overview");
  const [containerReference, setContainerReference] = useState("");
  const { data, isLoading, isError } = useQuery<AssistantStatus>({
    queryKey: ["/api/ai-assistant/status"],
    queryFn: () => customFetch("/api/ai-assistant/status"),
    staleTime: 60_000,
  });
  const { data: tools = [] } = useQuery<Tool[]>({
    queryKey: ["/api/ai-assistant/tools"],
    queryFn: () => customFetch("/api/ai-assistant/tools"),
    staleTime: 60_000,
  });
  const toolMutation = useMutation({
    mutationFn: (toolId: string) => customFetch<ToolResult>(`/api/ai-assistant/tools/${toolId}`, {
      method: "POST",
      body: JSON.stringify(toolId === "container_lookup" ? { containerNumber: containerReference } : {}),
    }),
  });
  const selectedTool = tools.find((tool) => tool.id === selectedToolId);

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;
  if (isError || !data) return <div className="mx-auto max-w-xl rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-muted-foreground">Unable to load the AI Assistant foundation status. Refresh the page and try again.</div>;

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><Bot className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Financial Intelligence Assistant</h1>
            <p className="mt-1 text-sm text-muted-foreground">Secure foundation status for the future Admin finance copilot.</p>
          </div>
        </div>
        <Button variant="outline" className="gap-2" onClick={() => setLocation("/settings")}><Settings2 className="h-4 w-4" />Review Governance</Button>
      </div>

      <Card className="border-primary/20 bg-primary/[0.03] shadow-sm">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><Wrench className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Phase 2: Approved live-data tools ready</p><p className="mt-1 text-sm text-muted-foreground">Use controlled tools to inspect authorised operational and financial data. A model, free-text chat, document intelligence, and write actions are still deliberately unavailable.</p></div></div>
          <span className="w-fit rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium">{data.approvedToolCount} read-only tools</span>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0"><CardTitle className="flex items-center gap-2 text-lg"><Search className="h-5 w-5 text-primary" />Approved Data Tools</CardTitle><p className="text-sm text-muted-foreground">Every result uses the logged-in user&apos;s branch scope, returns source links, and is written to the AI audit history.</p></CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{tools.map((tool) => <button key={tool.id} type="button" onClick={() => setSelectedToolId(tool.id)} className={`rounded-xl border p-4 text-left transition-colors ${selectedToolId === tool.id ? "border-primary/40 bg-primary/[0.06]" : "border-border/60 bg-background/40 hover:bg-muted/40"}`}><p className="font-medium">{tool.title}</p><p className="mt-1 text-sm text-muted-foreground">{tool.description}</p></button>)}</div>
          {selectedTool?.requiresContainer && <div className="max-w-md space-y-2"><label htmlFor="assistant-container-reference" className="text-sm font-medium">Container number or ID</label><Input id="assistant-container-reference" value={containerReference} onChange={(event) => setContainerReference(event.target.value)} placeholder="For example: MSCU1234567" /></div>}
          <div className="flex flex-wrap items-center gap-3"><Button onClick={() => toolMutation.mutate(selectedToolId)} disabled={toolMutation.isPending || (selectedTool?.requiresContainer && !containerReference.trim())} className="gap-2"><Play className="h-4 w-4" />{toolMutation.isPending ? "Running tool..." : `Run ${selectedTool?.title ?? "tool"}`}</Button>{toolMutation.isError && <p className="text-sm text-destructive">{toolMutation.error instanceof Error ? toolMutation.error.message : "The tool could not run."}</p>}</div>
          {toolMutation.data && <div className="space-y-5 rounded-xl border border-border/70 bg-muted/[0.18] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{toolMutation.data.title}</p><p className="mt-1 text-sm text-muted-foreground">Generated from {toolMutation.data.scope.label} at {new Date(toolMutation.data.generatedAt).toLocaleString()}.</p></div><span className="rounded-full border border-border/60 bg-background px-3 py-1 text-xs">Read-only result</span></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{toolMutation.data.facts.map((fact) => <div key={fact.label} className="rounded-lg border border-border/60 bg-background/80 p-3"><p className="text-xs text-muted-foreground">{fact.label}</p><p className="mt-1 text-lg font-semibold">{fact.value}</p>{fact.detail && <p className="mt-1 text-xs text-muted-foreground">{fact.detail}</p>}</div>)}</div>
            {toolMutation.data.records.length > 0 && <div className="space-y-2"><p className="text-sm font-medium">Source records</p>{toolMutation.data.records.map((record) => <button key={`${record.href}-${record.title}`} type="button" onClick={() => setLocation(record.href)} className="flex w-full items-center justify-between gap-4 rounded-lg border border-border/60 bg-background/80 p-3 text-left hover:bg-muted/40"><div className="min-w-0"><p className="font-medium">{record.title}</p><p className="mt-0.5 truncate text-sm text-muted-foreground">{record.detail}</p>{record.badges?.length ? <div className="mt-2 flex flex-wrap gap-1">{record.badges.map((badge) => <span key={badge} className="rounded-full border border-border/60 px-2 py-0.5 text-xs">{badge}</span>)}</div> : null}</div><ExternalLink className="h-4 w-4 shrink-0 text-primary" /></button>)}</div>}
            {toolMutation.data.notes.map((note) => <p key={note} className="text-xs text-muted-foreground">{note}</p>)}
          </div>}
        </CardContent>
      </Card>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Access boundary</CardTitle></CardHeader><CardContent className="space-y-2 p-5"><p className="text-2xl font-semibold">Admin only</p><p className="text-sm text-muted-foreground">{data.governance.accessRoles.map(formatDomain).join(" and ")} users are the only future users allowed through the server-side foundation.</p></CardContent></Card>
        <Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="flex items-center gap-2 text-base"><LockKeyhole className="h-4 w-4 text-primary" />Action boundary</CardTitle></CardHeader><CardContent className="space-y-2 p-5"><p className="text-2xl font-semibold">Read-only</p><p className="text-sm text-muted-foreground">The assistant cannot change records. Any future draft action requires human confirmation and existing permission checks.</p></CardContent></Card>
        <Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="flex items-center gap-2 text-base"><DatabaseZap className="h-4 w-4 text-primary" />Audit policy</CardTitle></CardHeader><CardContent className="space-y-2 p-5"><p className="text-2xl font-semibold">{data.governance.auditRetentionDays} days</p><p className="text-sm text-muted-foreground">Future sessions, tool usage, sources, responses, drafts, and confirmed actions have protected audit storage.</p></CardContent></Card>
      </div>

      <Card className="border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0"><CardTitle className="text-lg">Approved Future Data Scope</CardTitle><p className="text-sm text-muted-foreground">These boundaries are stored now. A future model may access only approved backend tools within these areas, never raw database credentials.</p></CardHeader>
        <CardContent className="p-6"><div className="flex flex-wrap gap-2">{data.governance.dataDomains.map((domain) => <span key={domain} className="rounded-full border border-border/70 bg-muted/40 px-3 py-1.5 text-sm">{formatDomain(domain)}</span>)}</div></CardContent>
      </Card>

      <Card className="border-border/60 bg-card shadow-sm">
        <CardHeader className="p-6 pb-0"><CardTitle className="text-lg">Foundation Safeguards</CardTitle></CardHeader>
        <CardContent className="grid gap-3 p-6 md:grid-cols-2">{data.safeguards.map((safeguard) => <div key={safeguard} className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/50 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{safeguard}</div>)}</CardContent>
      </Card>
    </div>
  );
}
