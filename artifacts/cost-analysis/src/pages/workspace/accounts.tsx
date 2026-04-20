import { useState } from "react";
import { Link } from "wouter";
import { useGetPipeline, useAdvanceContainerStatus } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search, BookOpen, ChevronRight, Clock, SendHorizonal } from "lucide-react";

const DEPT_STAGES = ["duty_payment"];

function DaysChip({ days }: { days: number }) {
  const color = days >= 7 ? "text-red-400 bg-red-500/10 border-red-500/30" : days >= 3 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-2 py-0.5 ${color}`}>
      <Clock className="w-2.5 h-2.5" />{days}d
    </span>
  );
}

export default function AccountsWorkspace() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const { data, isLoading } = useGetPipeline({ query: { refetchInterval: 30_000 } });
  const advance = useAdvanceContainerStatus();

  const containers = (data?.stages?.["duty_payment"] ?? []).filter(c =>
    !search.trim() ||
    c.containerNumber.toLowerCase().includes(search.toLowerCase()) ||
    c.blNumber?.toLowerCase().includes(search.toLowerCase()) ||
    c.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (id: number, containerNumber: string) => {
    advance.mutate({ id, status: "duty_payment" }, {
      onSuccess: () => toast({ title: `Job ${containerNumber} submitted to Operations.` }),
      onError: (e) => toast({ title: "Error", description: (e as Error).message, variant: "destructive" }),
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center shrink-0">
          <BookOpen className="w-6 h-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Accounts Department</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Confirm duty payments and submit jobs to Operations.
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by container number, BL number, or client…"
          className="pl-9"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Duty Payment</h2>
          <span className="text-xs bg-muted rounded-full px-2 py-0.5">{containers.length}</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : containers.length === 0 ? (
          <p className="text-sm text-muted-foreground/60 italic pl-1">No jobs awaiting duty payment.</p>
        ) : (
          <div className="space-y-2">
            {containers.map(c => (
              <Card key={c.id} className="p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{c.containerNumber}</span>
                    <span className="text-muted-foreground text-xs">BL: {c.blNumber}</span>
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
                    className="gap-1 text-xs bg-orange-600 hover:bg-orange-700"
                    onClick={() => handleSubmit(c.id, c.containerNumber)}
                    disabled={advance.isPending}
                  >
                    <SendHorizonal className="w-3 h-3" />
                    Confirm & Submit to Operations
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
