import { useJobOverview } from "@workspace/api-client-react";
import { Link } from "wouter";
import type { ReactNode } from "react";
import { ChevronDown, LayoutDashboard, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { useAuth, type WorkspaceKey } from "@/components/layout/auth-provider";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" }) : "Not recorded";
export function JobOverviewPanel({ containerId, children }: { containerId: number; children?: ReactNode }) {
  const { isAdminOrAbove, accessProfile } = useAuth();
  const { data, isPending, isError, isFetching, refetch } = useJobOverview(containerId);
  return <Card id="job-overview" className="overflow-hidden border-border/60 shadow-sm">
    <details key={containerId} className="group/overview">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 sm:p-6 hover:bg-muted/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2 [&::-webkit-details-marker]:hidden">
        <span className="rounded-xl bg-primary/10 p-3 text-primary"><LayoutDashboard className="h-5 w-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">Job Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">Progress, next steps and linked records</p>
        </div>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open/overview:rotate-180" aria-hidden="true" />
      </summary>
    <CardContent className="space-y-6 min-w-0 break-words border-t border-border/60 bg-muted/10 p-4 sm:p-6 sm:space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">A shared snapshot. Manage changes in the existing workspace controls.</p>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />{isFetching ? "Refreshing..." : "Refresh overview"}</Button>
      </div>
      {isPending && <p role="status">Loading job overview...</p>}
      {isError && <p role="alert">Unable to refresh overview. {data ? "The previous snapshot remains below; it may be outdated." : "Use Refresh overview to retry."}</p>}
      {data && <>
        <div className="space-y-1"><p className="text-base font-semibold">{data.customerName}</p><p className="text-sm text-muted-foreground">Visit #{containerId} | B/L <span className="font-mono">{data.blNumber}</span></p><p className="text-xs text-muted-foreground">Snapshot {new Date(data.asOf).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} WAT</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl bg-primary/10 p-4 space-y-2"><h3 className="text-sm font-medium text-muted-foreground">Workflow stage</h3><p className="text-lg font-semibold text-primary">{data.workflowStage}</p><p className="text-xs text-muted-foreground">A workflow stage is not a physical location.</p></div>
          <div className="rounded-xl bg-muted/60 p-4 space-y-2"><h3 className="text-sm font-medium text-muted-foreground">Physical movement</h3><p className="font-semibold">{data.physical.inTerminal ? "In bonded terminal" : "Not counted as physically in terminal"}</p><p className="text-sm text-muted-foreground">Gate-in: {date(data.physical.gateIn)}<br />Gate-out: {date(data.physical.gateOut)}</p></div>
          <div className="rounded-xl bg-muted/60 p-4 space-y-2"><h3 className="text-sm font-medium text-muted-foreground">Delivery and closure</h3><p className="text-sm">Delivered: {date(data.physical.deliveredAt)}</p><p className="text-sm">Empty returned: {date(data.physical.emptyReturnedAt)}</p><Badge variant="outline">Job {data.physical.closed ? "closed" : "not closed"}</Badge></div>
        </div>
        <div className="rounded-xl border-l-4 border-primary bg-primary/5 p-4 sm:p-5 space-y-3">
          <h3 className="text-sm font-semibold text-primary">Next recorded action</h3>
          <p className="text-base font-medium">{data.nextAction.text || "No next action recorded. Open the existing Stage Control to set it."}</p>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm"><p>Current stage owner: <strong>{data.nextAction.owner || "Unassigned"}</strong></p><p>Due: <strong>{date(data.nextAction.dueAt)}</strong></p></div>
          <p className="text-xs text-muted-foreground">{data.unassignedMilestones} unfinished department milestone(s) have no recorded owner. Owner names are not task assignments.</p>
        </div>
        {data.blockers.length > 0 && <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2"><h3 className="font-semibold">Recorded blockers / exceptions</h3><ul className="list-disc pl-5 text-sm space-y-1">{data.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
        <details className="rounded-xl bg-muted/50 p-4"><summary className="cursor-pointer text-sm font-medium focus-visible:outline focus-visible:outline-primary">Final-workflow prerequisites ({data.missingFinalPrerequisites.length} missing)</summary>
          <p className="text-xs text-muted-foreground mt-2">These govern final progression, not permission to perform every parallel department task. Existing workspace controls remain authoritative.</p>
          <ul className="list-disc pl-5 text-sm">{data.missingFinalPrerequisites.map(s => <li key={s}>{s}</li>)}</ul>
        </details>
        <section><h3 className="text-base font-semibold mb-1">Independent department milestones</h3><p className="text-sm text-muted-foreground mb-4">Each department keeps its own owner and release dates.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{data.milestones.map(m => <div className="rounded-xl border border-border/60 bg-card p-4 min-w-0 shadow-sm" key={m.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
            {isAdminOrAbove || accessProfile?.workspaces.includes((m.key === "release" ? "terminal_manager" : m.key) as WorkspaceKey)
              ? <Link href={m.href} className="font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-primary">{m.label}</Link>
              : <span className="font-semibold">{m.label}</span>} <Badge variant="outline" className={m.state === "blocked" ? "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300" : m.state === "recorded" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"}>{m.state}</Badge>
            </div>
            <p className="text-sm mt-4 mb-3 text-muted-foreground">Owner: <span className="font-medium text-foreground">{m.owner || "Not recorded"}</span></p>
            <dl className="grid grid-cols-2 gap-3 border-t border-border/50 pt-3 text-sm"><div><dt className="text-xs text-muted-foreground">{m.key === "documentation" ? "ETA" : "Expected"}</dt><dd className="mt-1">{date(m.expected)}</dd></div><div><dt className="text-xs text-muted-foreground">Actual</dt><dd className="mt-1">{date(m.actual)}</dd></div></dl>
            {m.delay && <p className="text-sm text-amber-600">Delay: {m.delay}</p>}
          </div>)}</div>
        </section>
        <div className="grid gap-4 lg:grid-cols-2 items-start">
        <section className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-3"><h3 className="font-semibold">Assigned follow-ups ({data.tasks.length} open)</h3>
          {data.tasks.length === 0 && <p className="text-sm text-muted-foreground">No open task records. This does not mean the job is complete.</p>}
          <ul className="space-y-2 mt-2">{data.tasks.map(t => <li key={t.id} className="rounded border p-3 text-sm">
            <Link className="text-primary underline" href={t.href}>Task #{t.id}: {t.title}</Link>
            <p>{t.assignedStaffName || "Unassigned"} | {t.bucket} | {t.priority} | Due {date(t.dueDate)}</p>
          </li>)}</ul>
          <Link className="text-sm text-primary underline" href="/my-tasks">Open my daily queue</Link>
        </section>
        <section className="rounded-xl border border-border/60 bg-card p-4 sm:p-5 space-y-3"><h3 className="font-semibold">Documents ({data.documents.length}) and approvals</h3>
          <p className="text-xs text-muted-foreground">Uploaded files are not a reviewed document-readiness checklist.</p>
          <ul className="space-y-1">{data.documents.map(d => <li key={d.id}><Link className="text-sm underline text-primary" href={`/containers/${containerId}?tab=documents&previewDocument=${d.id}`}>{d.name}</Link></li>)}</ul>
          {!data.documents.length && <p className="text-sm">No uploaded documents on this visit.</p>}
          {data.approvals.map(a => <p key={a.id} className="text-sm">{a.section.replaceAll("_", " ")}: {a.status}{a.rejectionReason ? ` - ${a.rejectionReason}` : ""}</p>)}
        </section>
        </div>
        {data.finance && <section className="space-y-4 border-t border-border/60 pt-6"><h3 className="font-semibold">Financial context</h3>
          <div className="grid gap-3 md:grid-cols-3">{[["Budgeted clearing", data.finance.clearingBudget], ["Budgeted cost", data.finance.costBudget], ["Actual paid cost", data.finance.actualPaidCost]].map(([label, amount]) => <div key={label} className="rounded-xl bg-muted/60 p-4 min-w-0"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tracking-tight tabular-nums break-all">{formatCurrency(Number(amount))}</p></div>)}</div>
          <p className="text-sm text-muted-foreground">Linked invoices show their full value, which may cover multiple containers. Do not add these values across visits.</p>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer py-1 font-medium">How these figures are calculated</summary><p className="mt-2 leading-relaxed">{data.finance.note}</p></details>
          {data.finance.invoices.length === 0 && <p className="text-sm">No linked invoice.</p>}
          {data.finance.invoices.map(i => <div key={i.id} className="rounded border p-3 text-sm"><Link className="text-primary underline" href={`/invoices/${i.id}`}>{i.number}</Link> ({i.status})<p>Full invoice: {formatCurrency(i.total)} | Net collections: {formatCurrency(i.paid)} | Outstanding: {formatCurrency(i.outstanding)}</p></div>)}
        </section>}
      </>}
      {children}
    </CardContent>
    </details>
  </Card>;
}
