import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListContainers } from "@workspace/api-client-react";
import { WORKFLOW_STAGES, getStatusColor, getStatusLabel, formatCurrency } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, ChevronRight, CheckCircle2, Inbox, Pencil } from "lucide-react";

interface CompletedJobsViewProps {
  /** The dept stages this workspace is responsible for. Completed = anything PAST the last of these. */
  deptStages: string[];
  /** Path prefix for the View / Edit link, defaults to "/operations" (which is the container detail route). */
  viewBasePath?: string;
  /** Show an "Edit Expenses" CTA in addition to View. Defaults to true. */
  showEditExpenses?: boolean;
  /** Empty-state messaging. */
  emptyTitle?: string;
  emptySubtitle?: string;
}

const PAGE_LIMIT = 100;

export function CompletedJobsView({
  deptStages,
  viewBasePath = "/operations",
  showEditExpenses = true,
  emptyTitle = "No submitted jobs yet",
  emptySubtitle = "Once you submit a job onward, it will appear here for reference.",
}: CompletedJobsViewProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Compute which statuses count as "submitted/completed" from this dept's perspective:
  // any stage AFTER the highest stage owned by this dept.
  const downstreamStatuses = useMemo(() => {
    const indexOf = (s: string) => WORKFLOW_STAGES.findIndex(w => w.value === s);
    const lastDeptIdx = Math.max(...deptStages.map(indexOf));
    if (lastDeptIdx < 0) return [];
    return WORKFLOW_STAGES.slice(lastDeptIdx + 1).map(s => s.value);
  }, [deptStages]);

  const statusParam = downstreamStatuses.length > 0 ? downstreamStatuses.join(",") : undefined;

  const { data, isLoading } = useListContainers(
    {
      page,
      limit: PAGE_LIMIT,
      ...(statusParam ? { status: statusParam } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    },
    { query: { enabled: downstreamStatuses.length > 0 } },
  );

  const containers = data?.containers ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  if (downstreamStatuses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <CheckCircle2 className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">This is the final stage — submitted jobs won't appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search submitted jobs by container # or BL #…"
          className="pl-11 h-11 text-sm"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : containers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center">
            <Inbox className="w-7 h-7 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            {search.trim() ? "No matching submitted jobs." : emptyTitle}
          </p>
          {!search.trim() && (
            <p className="text-xs text-muted-foreground/60">{emptySubtitle}</p>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {total} submitted job{total === 1 ? "" : "s"}
            </span>
            {totalPages > 1 && (
              <span>Page {page} of {totalPages}</span>
            )}
          </div>

          <div className="space-y-2">
            {containers.map((c: any) => (
              <Card key={c.id} className="p-4 flex items-center gap-4 hover:bg-accent/30 transition-colors border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm font-mono">{c.containerNumber}</span>
                    {c.blNumber && (
                      <span className="text-muted-foreground text-xs font-mono">BL: {c.blNumber}</span>
                    )}
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusColor(c.status)}`}>
                      {getStatusLabel(c.status)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground truncate">
                    {c.customerName && <span className="truncate">{c.customerName}</span>}
                    {typeof c.totalCost === "number" && c.totalCost > 0 && (
                      <span className="font-mono shrink-0">Total: {formatCurrency(c.totalCost)}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {showEditExpenses && (
                    <Link href={`${viewBasePath}/${c.id}`}>
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-8" title="Open job to edit expenses">
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                    </Link>
                  )}
                  <Link href={`${viewBasePath}/${c.id}`}>
                    <Button size="sm" variant="ghost" className="gap-1 text-xs h-8">
                      View <ChevronRight className="w-3 h-3" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
