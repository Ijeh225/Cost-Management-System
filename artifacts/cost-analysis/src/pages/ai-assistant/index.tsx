import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bot, CheckCircle2, ExternalLink, FileSearch, Loader2, LockKeyhole, Send, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AssistantStatus = {
  phase: "read_only_copilot";
  available: true;
  modelConnected: false;
  copilotMode: "guided_read_only";
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

export default function AiAssistantPage() {
  const [, setLocation] = useLocation();
  const [question, setQuestion] = useState("");
  const [sessionId, setSessionId] = useState<number | undefined>();
  const [conversation, setConversation] = useState<CopilotAnswer[]>([]);
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

      <Card className="border-primary/20 bg-primary/[0.03] shadow-sm"><CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><Sparkles className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Phase 3: Guided read-only copilot</p><p className="mt-1 text-sm text-muted-foreground">Ask a supported question in plain language. The copilot uses only {status.approvedToolCount} approved tools and gives source links for every meaningful result.</p></div></div><span className="w-fit rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium">No write actions</span></CardContent></Card>

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
            <form onSubmit={submitQuestion} className="border-t border-border/60 bg-background/70 p-4"><div className="flex gap-3"><Textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about overdue containers, receivables, delays, overhead, schedules, branches, or an exact container..." className="min-h-[74px] resize-none" maxLength={1000} /><Button type="submit" className="h-auto shrink-0 gap-2" disabled={!question.trim() || askMutation.isPending}><Send className="h-4 w-4" />Send</Button></div>{askMutation.isError && <p className="mt-2 text-sm text-destructive">{askMutation.error instanceof Error ? askMutation.error.message : "The copilot could not answer this question."}</p>}</form>
          </CardContent>
        </Card>

        <div className="space-y-5"><Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="text-base">Suggested questions</CardTitle></CardHeader><CardContent className="space-y-2 p-5">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)} className="w-full rounded-lg border border-border/60 bg-background/50 p-3 text-left text-sm transition-colors hover:border-primary/30 hover:bg-primary/[0.04]">{suggestion}</button>)}</CardContent></Card>
          <Card className="border-border/60 bg-card shadow-sm"><CardHeader className="p-5 pb-0"><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" />Safety boundary</CardTitle></CardHeader><CardContent className="space-y-3 p-5 text-sm text-muted-foreground"><div className="flex gap-2"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Only Admin and Super Admin users can use this copilot.</p></div><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>Every answer is restricted to your current branch access and saved in the AI audit history.</p></div><div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p>It cannot approve, pay, edit, notify, or delete anything.</p></div></CardContent></Card></div>
      </div>
    </div>
  );
}
