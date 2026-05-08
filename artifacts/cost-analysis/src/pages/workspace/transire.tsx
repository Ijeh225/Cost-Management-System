import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { WORKFLOW_STAGES } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, Clock, ChevronRight, FileCheck2, CheckCircle2, Zap } from "lucide-react";
import { CompletedJobsView } from "@/components/workspace/completed-jobs-view";

const TRANSIRE_STAGES = ["transire_processing"];

const STAGE_COLOR = "bg-violet-500/10 text-violet-400 border-violet-500/30";

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

export default function TransireWorkspace() {
  const { isAdmin, isTransireUser, isOperationsUser } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const { data, isLoading } = useGetPipeline({ query: { refetchInterval: 30_000 } });

  const canAccess = isAdmin || isTransireUser || isOperationsUser;
  useEffect(() => {
    if (!canAccess) setLocation("/");
  }, [canAccess]);

  if (!canAccess) return null;

  const allContainers = TRANSIRE_STAGES.flatMap(s =>
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
  const stageLabel = WORKFLOW_STAGES.find(s => s.value === "transire_processing")?.label ?? "Transire Processing";

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 space-y-8">

        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
              <FileCheck2 className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Transire Jobs</h1>
              <p className="text-sm text-muted-foreground">
                {totalJobs} active job{totalJobs !== 1 ? "s" : ""} in Transire Processing
              </p>
            </div>
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
                <p className="text-xs text-muted-foreground/60">Try searching by container number or BL number</p>
              </div>
            ) : totalJobs === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <FileCheck2 className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active Transire jobs at this time.</p>
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
                        {c.isEarlyStart && c.earlyStartReason && (
                          <p className="text-[10px] text-orange-300/70 mt-1 italic">"{c.earlyStartReason}"</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link href={`/operations/${c.id}?dept=transire`}>
                          <Button size="sm" variant="outline" className="gap-1 text-xs h-8">
                            View Job <ChevronRight className="w-3 h-3" />
                          </Button>
                        </Link>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            <CompletedJobsView
              deptStages={TRANSIRE_STAGES}
              dept="transire"
              emptyTitle="No jobs submitted yet"
              emptySubtitle="Once Transire processing is done, jobs will appear here for reference."
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
