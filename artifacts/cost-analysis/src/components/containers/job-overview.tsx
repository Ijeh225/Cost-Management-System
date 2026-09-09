import { useJobOverview } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { useAuth, type WorkspaceKey } from "@/components/layout/auth-provider";

const date = (value: string | null) => value ? new Date(value).toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" }) : "Not recorded";
export function JobOverviewPanel({ containerId }: { containerId: number }) {
  const { isAdminOrAbove, accessProfile } = useAuth();
  const { data, isPending, isError, isFetching, refetch } = useJobOverview(containerId);
  return <Card id="job-overview">
    <CardHeader className="flex flex-row items-start justify-between gap-3 flex-wrap">
      <h2 className="text-lg font-semibold">Job Overview</h2>
      <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "Refreshing..." : "Refresh overview"}</Button>
    </CardHeader>
    <CardContent className="space-y-5 min-w-0 break-words">
      {isPending && <p role="status">Loading job overview...</p>}
      {isError && <p role="alert">Unable to refresh overview. {data ? "The previous snapshot remains below; it may be outdated." : "Use Refresh overview to retry."}</p>}
      {data && <>
        <p className="text-xs text-muted-foreground">Visit #{containerId} | {data.customerName} | B/L {data.blNumber}. Snapshot {new Date(data.asOf).toLocaleString("en-NG", { timeZone: "Africa/Lagos" })} WAT.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded border p-3"><h3 className="font-semibold">Workflow stage</h3><p>{data.workflowStage}</p><p className="text-xs text-muted-foreground">A workflow stage is not a physical location.</p></div>
          <div className="rounded border p-3"><h3 className="font-semibold">Physical movement</h3><p>{data.physical.inTerminal ? "In bonded terminal" : "Not counted as physically in terminal"}</p><p className="text-xs">Gate-in: {date(data.physical.gateIn)}<br />Gate-out: {date(data.physical.gateOut)}</p></div>
          <div className="rounded border p-3"><h3 className="font-semibold">Delivery and closure</h3><p>Delivered: {date(data.physical.deliveredAt)}</p><p>Empty returned: {date(data.physical.emptyReturnedAt)}</p><p>Job {data.physical.closed ? "closed" : "not closed"}</p></div>
        </div>
        <div className="rounded border p-3 space-y-1">
          <h3 className="font-semibold">Next recorded action</h3>
          <p>{data.nextAction.text || "No next action recorded. Open the existing Stage Control to set it."}</p>
          <p className="text-sm">Current stage owner: {data.nextAction.owner || "Unassigned"} | Due: {date(data.nextAction.dueAt)}</p>
          <p className="text-xs text-muted-foreground">{data.unassignedMilestones} unfinished department milestone(s) have no recorded owner. Owner names are not task assignments.</p>
        </div>
        {data.blockers.length > 0 && <div className="rounded border border-amber-500 p-3"><h3 className="font-semibold">Recorded blockers / exceptions</h3><ul className="list-disc pl-5 text-sm">{data.blockers.map((b, i) => <li key={i}>{b}</li>)}</ul></div>}
        <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Final-workflow prerequisites ({data.missingFinalPrerequisites.length} missing)</summary>
          <p className="text-xs text-muted-foreground mt-2">These govern final progression, not permission to perform every parallel department task. Existing workspace controls remain authoritative.</p>
          <ul className="list-disc pl-5 text-sm">{data.missingFinalPrerequisites.map(s => <li key={s}>{s}</li>)}</ul>
        </details>
        <section><h3 className="font-semibold mb-2">Independent department milestones</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.milestones.map(m => <div className="rounded border p-3 min-w-0" key={m.key}>
            {isAdminOrAbove || accessProfile?.workspaces.includes((m.key === "release" ? "terminal_manager" : m.key) as WorkspaceKey)
              ? <Link href={m.href} className="font-semibold text-primary underline">{m.label}</Link>
              : <span className="font-semibold">{m.label}</span>} <Badge variant="outline">{m.state}</Badge>
            <p className="text-sm mt-2">Owner: {m.owner || "Not recorded"}</p>
            <p className="text-sm">{m.key === "documentation" ? "ETA" : "Expected"}: {date(m.expected)}<br />Actual: {date(m.actual)}</p>
            {m.delay && <p className="text-sm text-amber-600">Delay: {m.delay}</p>}
          </div>)}</div>
        </section>
        <section><h3 className="font-semibold">Assigned follow-ups ({data.tasks.length} open)</h3>
          {data.tasks.length === 0 && <p className="text-sm text-muted-foreground">No open task records. This does not mean the job is complete.</p>}
          <ul className="space-y-2 mt-2">{data.tasks.map(t => <li key={t.id} className="rounded border p-3 text-sm">
            <Link className="text-primary underline" href={t.href}>Task #{t.id}: {t.title}</Link>
            <p>{t.assignedStaffName || "Unassigned"} | {t.bucket} | {t.priority} | Due {date(t.dueDate)}</p>
          </li>)}</ul>
          <Link className="text-sm text-primary underline" href="/my-tasks">Open my daily queue</Link>
        </section>
        <section><h3 className="font-semibold">Documents ({data.documents.length}) and approvals</h3>
          <p className="text-xs text-muted-foreground">Uploaded files are not a reviewed document-readiness checklist.</p>
          <ul className="space-y-1">{data.documents.map(d => <li key={d.id}><Link className="text-sm underline text-primary" href={`/containers/${containerId}?tab=documents&previewDocument=${d.id}`}>{d.name}</Link></li>)}</ul>
          {!data.documents.length && <p className="text-sm">No uploaded documents on this visit.</p>}
          {data.approvals.map(a => <p key={a.id} className="text-sm">{a.section.replaceAll("_", " ")}: {a.status}{a.rejectionReason ? ` - ${a.rejectionReason}` : ""}</p>)}
        </section>
        {data.finance && <section className="space-y-3"><h3 className="font-semibold">Financial context</h3>
          <div className="grid gap-3 sm:grid-cols-3">{[["Budgeted clearing", data.finance.clearingBudget], ["Budgeted cost", data.finance.costBudget], ["Actual paid cost", data.finance.actualPaidCost]].map(([label, amount]) => <div key={label} className="rounded border p-3 min-w-0"><p className="text-sm">{label}</p><p className="font-semibold break-all">{formatCurrency(Number(amount))}</p></div>)}</div>
          <p className="text-xs text-muted-foreground">{data.finance.note}</p>
          {data.finance.invoices.length === 0 && <p className="text-sm">No linked invoice.</p>}
          {data.finance.invoices.map(i => <div key={i.id} className="rounded border p-3 text-sm"><Link className="text-primary underline" href={`/invoices/${i.id}`}>{i.number}</Link> ({i.status})<p>Full invoice: {formatCurrency(i.total)} | Net collections: {formatCurrency(i.paid)} | Outstanding: {formatCurrency(i.outstanding)}</p></div>)}
        </section>}
      </>}
    </CardContent>
  </Card>;
}
