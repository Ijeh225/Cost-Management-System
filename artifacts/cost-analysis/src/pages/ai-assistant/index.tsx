import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Bot, CheckCircle2, Clock3, DatabaseZap, LockKeyhole, Settings2, ShieldCheck } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type AssistantStatus = {
  phase: "secure_foundation";
  available: boolean;
  modelConnected: boolean;
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

const formatDomain = (domain: string) => domain.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AiAssistantPage() {
  const [, setLocation] = useLocation();
  const { data, isLoading, isError } = useQuery<AssistantStatus>({
    queryKey: ["/api/ai-assistant/status"],
    queryFn: () => customFetch("/api/ai-assistant/status"),
    staleTime: 60_000,
  });

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
          <div className="flex items-start gap-3"><Clock3 className="mt-0.5 h-5 w-5 text-primary" /><div><p className="font-medium">Phase 1: Secure foundation ready</p><p className="mt-1 text-sm text-muted-foreground">The assistant is intentionally not connected to a model or live data yet. Phase 2 will add approved, permission-checked data tools.</p></div></div>
          <span className="w-fit rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium">Read-only planning mode</span>
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
