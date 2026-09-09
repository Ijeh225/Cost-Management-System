import { useState } from "react";
import { Link } from "wouter";
import { useDailyQueue, type WorkBucket } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { BranchChip } from "@/components/layout/branch-chip";

const buckets: Array<{ key: "all" | WorkBucket; label: string }> = [
  { key: "all", label: "All open" }, { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" }, { key: "undated", label: "No due date" }, { key: "upcoming", label: "Upcoming" },
];

export default function MyTasksPage() {
  const { data, isPending, isError, isFetching, refetch } = useDailyQueue();
  const { isAdminOrAbove, workspaceHome } = useAuth();
  const [bucket, setBucket] = useState<"all" | WorkBucket>("all");
  const [search, setSearch] = useState("");
  const [unblockedOnly, setUnblockedOnly] = useState(false);
  const tasks = data?.dailyQueue ?? [];
  const term = search.trim().toLowerCase();
  const matches = tasks.filter(t => (!unblockedOnly || t.blockers.length === 0)
    && [t.title, t.containerNumber, t.blNumber, t.customerName, String(t.id)].some(v => v.toLowerCase().includes(term)));
  const visible = matches.filter(t => bucket === "all" || t.bucket === bucket);
  return <div className="space-y-5 min-w-0">
    <div className="flex justify-between gap-3 flex-wrap">
      <div><h1 className="text-2xl font-bold">My Tasks: Daily Queue</h1>
        <p className="text-sm text-muted-foreground">Your assigned task records, ordered by overdue work, today, undated work and upcoming work, then priority.</p></div>
      <Button variant="outline" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "Refreshing..." : "Refresh tasks"}</Button>
    </div>
    <p className="text-sm">Dates use Africa/Lagos (WAT). Today: {data?.workDate ?? "Loading..."}. Department owner names do not automatically assign tasks.</p>
    <div className="flex gap-3 flex-wrap text-sm">
      <Link className="text-primary underline" href={workspaceHome ?? "/operations"}>My department workspace</Link>
      {isAdminOrAbove && <Link className="text-primary underline" href="/approvals">Approval Queue</Link>}
    </div>
    <Input aria-label="Search my tasks" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search task, container, B/L or client" />
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unblockedOnly} onChange={e => setUnblockedOnly(e.target.checked)} />No recorded blockers only (verify readiness in the workspace)</label>
    <div className="flex gap-2 flex-wrap" aria-label="Task date filters">{buckets.map(b => <Button key={b.key} variant={bucket === b.key ? "default" : "outline"} aria-pressed={bucket === b.key} onClick={() => setBucket(b.key)}>
      {b.label} ({matches.filter(t => b.key === "all" || t.bucket === b.key).length})
    </Button>)}</div>
    {isPending && <p role="status">Loading your assigned work...</p>}
    {isError && <p role="alert">Unable to refresh tasks. {data ? "The previous snapshot below may be outdated." : "Use Refresh tasks to retry."}</p>}
    {!isPending && !isError && visible.length === 0 && <Card><CardContent className="p-6">{tasks.length ? "No tasks match this filter." : "No open tasks assigned to you in this branch scope. This does not mean all jobs are complete."}</CardContent></Card>}
    <ul className="space-y-3">{visible.map(t => <li key={t.id}><Card><CardContent className="p-4 sm:p-5 space-y-2 break-words">
      <div className="flex gap-2 flex-wrap"><Badge variant={t.bucket === "overdue" ? "destructive" : "outline"}>{t.bucket}</Badge><Badge variant="outline">{t.priority}</Badge><span className="text-sm">{t.status.replaceAll("_", " ")}</span></div>
      <Link className="font-semibold text-primary underline" href={t.href}>Task #{t.id}: {t.title}</Link>
      <p className="text-sm">{t.containerNumber} | B/L {t.blNumber} | {t.customerName}<BranchChip branchId={t.branchId} /></p>
      <p className="text-sm">Workflow: {t.workflowStage} | Due: {t.dueDate ? new Date(t.dueDate).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" }) : "Not set"}</p>
      {t.notes && <p className="text-sm whitespace-pre-wrap">{t.notes}</p>}
      {t.blockers.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Recorded job blockers ({t.blockers.length})</summary><ul className="list-disc pl-5 text-sm">{t.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></details>}
      <p className="text-xs text-muted-foreground">{t.missingFinalPrerequisites.length} final-workflow prerequisites missing. Task assignment is not release approval; follow the workspace controls.</p>
      <Link className="text-sm text-primary underline" href={`/containers/${t.containerId}`}>Open job overview</Link>
    </CardContent></Card></li>)}</ul>
    {data && <p className="text-xs text-muted-foreground">Snapshot {new Date(data.asOf).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} WAT. Updates automatically every minute; task changes keep the same task ID.</p>}
  </div>;
}
