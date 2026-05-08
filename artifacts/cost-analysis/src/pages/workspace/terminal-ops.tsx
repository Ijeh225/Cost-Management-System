import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_STAGES } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, Clock, ChevronRight, Building2, CheckCircle2, Zap, PackageCheck } from "lucide-react";
import { CompletedJobsView } from "@/components/workspace/completed-jobs-view";
import { useLocation } from "wouter";

const TERMINAL_STAGES = ["terminal"];
const STAGE_COLOR = "bg-amber-500/10 text-amber-400 border-amber-500/30";

function DaysChip({ days }: { days: number }) {
  const color =
    days >= 7
      ? "text-red-400 bg-red-500/10 border-red-500/30"
      : days >= 3
      ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
      : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${color}`}>
      <Clock className="w-2.5 h-2.5" />
      {days}d
    </span>
  );
}

export default function TerminalOpsWorkspace() {
  const { isAdmin, isTerminalUser, isShippingTerminalUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [advancing, setAdvancing] = useState<number | null>(null);

  const { data, isLoading, refetch } = useGetPipeline({ query: { refetchInterval: 30_000 } });
  const advanceMutation = useAdvanceContainerStatus();

  const canAccess = isAdmin || isTerminalUser || isShippingTerminalUser;
  useEffect(() => {
    if (!canAccess) setLocation("/");
  }, [canAccess]);

  if (!canAccess) return null;

  const allContainers = TERMINAL_STAGES.flatMap(s =>
    (data?.stages?.[s] ?? []).filter(c => c.status === s).map(c => ({ ...c, stage: s }))
  );

  const filtered = search.trim()
    ? allContainers.filter(c =>
        c.containerNumber.toLowerCase().includes(search.toLowerCase()) ||
        (c.blNumber ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : allContainers;

  const totalJobs = allContainers.length;
  const searching = search.trim().length > 0;
  const stageLabel = WORKFLOW_STAGES.find(s => s.value === "terminal")?.label ?? "Terminal";

  const handleSubmitToPullOut = async (containerId: number) => {
    setAdvancing(containerId);
    try {
      await advanceMutation.mutateAsync({ id: containerId, status: "pull_out" });
      toast({ title: "Submitted to Pull-Out", description: "Container moved to the Pull-Out queue." });
      refetch();
    } catch (err) {
      toast({ variant: "destructive", title: "Error", description: err instanceof Error ? err.message : "Failed" });
    } finally {
      setAdvancing(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Terminal Jobs</h1>
              <p className="text-sm text-muted-foreground">
                {totalJobs} active job{totalJobs !== 1 ? "s" : ""} in Terminal processing
              </p>
            </div>
          </div>
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

          <TabsContent value="active" className="space-y-8 mt-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                placeholder="Search by container number or Bill of Lading…"
                className="pl-12 h-12 text-base bg-card border-border/60 focus-visible:ring-primary/40"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading your jobs…</p>
              </div>
            ) : filtered.length === 0 && searching ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Search className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No jobs found for <span className="font-medium text-foreground">"{search}"</span>
                </p>
              </div>
            ) : totalJobs === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <Building2 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active Terminal jobs at this time.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${STAGE_COLOR}`}>
                    {stageLabel}
                  </Badge>
                  <span className="text-xs text-muted-foreground/60">
                    {filtered.length} job{filtered.length !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-2">
                  {filtered.map(c => (
                    <Card
                      key={c.id}
                      className={`p-4 flex items-center gap-4 transition-colors border-border/50 ${
                        c.isEarlyStart
                          ? "bg-orange-500/5 border-orange-500/20 hover:bg-orange-500/10"
                          : "hover:bg-accent/20"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
                          {c.blNumber && (
                            <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
                          )}
                          <DaysChip days={c.daysInStage} />
                          {c.isEarlyStart && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold border rounded-full px-2 py-0.5 text-orange-400 bg-orange-500/10 border-orange-500/30">
                              <Zap className="w-2.5 h-2.5" /> Early Start
                            </span>
                          )}
                        </div>
                        {c.customerName && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.customerName}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/operations/${c.id}?dept=terminal`}>
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-8">
                            View <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          className="gap-1 text-xs h-8 bg-amber-600 hover:bg-amber-500 text-white"
                          disabled={advancing === c.id}
                          onClick={() => handleSubmitToPullOut(c.id)}
                        >
                          {advancing === c.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <PackageCheck className="w-3 h-3" />
                          )}
                          Submit to Pull-Out
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            <CompletedJobsView
              deptStages={TERMINAL_STAGES}
              emptyTitle="No jobs submitted yet"
              emptySubtitle="Once Terminal processing is done, jobs will appear here for reference."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
