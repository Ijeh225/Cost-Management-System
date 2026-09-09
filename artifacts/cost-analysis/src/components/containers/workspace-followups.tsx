import { useSearch, Link } from "wouter";
import { TasksTab } from "./TasksTab";
import { DocumentsTab } from "./DocumentsTab";

// Department-only detail layouts reuse the same task/document editors and IDs.
export function WorkspaceFollowups({ containerId, branchId }: { containerId: number; branchId: number }) {
  const tab = new URLSearchParams(useSearch()).get("tab");
  return <section className="space-y-3">
    <nav className="flex gap-4 text-sm" aria-label="Job follow-ups">
      <Link className="text-primary underline" href={`/containers/${containerId}?tab=tasks`}>Tasks</Link>
      <Link className="text-primary underline" href={`/containers/${containerId}?tab=documents`}>Documents</Link>
    </nav>
    {tab === "tasks" && <TasksTab containerId={containerId} branchId={branchId} />}
    {tab === "documents" && <DocumentsTab containerId={containerId} />}
  </section>;
}
