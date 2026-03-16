import { useGetMyTasks } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ListTodo, Box, AlertTriangle } from "lucide-react";
import { getStatusColor, getStatusLabel, getApprovalStatusColor, getApprovalStatusLabel, SECTION_LABELS, formatCurrency } from "@/lib/format";

export default function MyTasksPage() {
  const { user } = useAuth();
  const { data, isLoading, isError } = useGetMyTasks();

  const mySections = data?.mySections ?? [];
  const assignedContainers = data?.assignedContainers ?? [];
  const sectionApprovals = data?.sectionApprovals ?? [];

  const pendingDraft = sectionApprovals.filter(a => a.status === "draft");
  const pendingSubmitted = sectionApprovals.filter(a => a.status === "submitted");
  const rejected = sectionApprovals.filter(a => a.status === "rejected");

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ListTodo className="w-6 h-6 text-primary" /> My Tasks
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Your assigned containers and section status.
          {mySections.length > 0 && (
            <span className="ml-2">
              Your sections:
              {mySections.map(s => (
                <Badge key={s} variant="outline" className="ml-1 text-[10px] py-0">{SECTION_LABELS[s] ?? s}</Badge>
              ))}
            </span>
          )}
        </p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <AlertTriangle className="w-10 h-10 text-destructive/50" />
          <p>Failed to load tasks.</p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Action required — rejected */}
          {rejected.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-destructive text-sm">Action Required</h4>
                <p className="text-xs text-destructive/80 mt-1">
                  {rejected.length} section{rejected.length !== 1 ? "s" : ""} {rejected.length !== 1 ? "were" : "was"} rejected and need correction.
                </p>
                <ul className="mt-2 space-y-1">
                  {rejected.map(r => (
                    <li key={r.id} className="text-xs text-destructive/90">
                      Container #{r.containerId} — {SECTION_LABELS[r.section] ?? r.section}
                      {r.rejectionReason && <span className="italic ml-1">: "{r.rejectionReason}"</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Sections Overview */}
          {sectionApprovals.length > 0 && (
            <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base">Section Status</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {sectionApprovals.map(a => {
                    const container = assignedContainers.find(c => c.id === a.containerId);
                    return (
                      <div key={a.id} className="flex items-center justify-between px-6 py-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          {container && (
                            <Link href={`/containers/${a.containerId}`} className="font-mono text-primary hover:underline text-sm font-medium">
                              {container.containerNumber}
                            </Link>
                          )}
                          {!container && (
                            <span className="font-mono text-sm text-muted-foreground">Container #{a.containerId}</span>
                          )}
                          <span className="text-xs text-muted-foreground">{container?.customerName}</span>
                          <span className="text-xs text-foreground/70 capitalize font-medium">{SECTION_LABELS[a.section] ?? a.section}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getApprovalStatusColor(a.status)}`}>
                          {getApprovalStatusLabel(a.status)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assigned Containers */}
          <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Box className="w-4 h-4" />
                Assigned Containers
                <Badge variant="outline" className="ml-1 text-xs">{assignedContainers.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {assignedContainers.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground text-sm">
                  No containers assigned to you.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-y border-border/50 bg-secondary/20">
                      <tr className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
                        <th className="px-6 py-3 text-left font-medium">Container</th>
                        <th className="px-6 py-3 text-left font-medium">Customer</th>
                        <th className="px-6 py-3 text-left font-medium">Status</th>
                        <th className="px-6 py-3 text-right font-medium">Clearing Charges</th>
                        <th className="px-6 py-3 text-left font-medium">Sections</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {assignedContainers.map(c => {
                        const mySectionApprovals = sectionApprovals.filter(a => a.containerId === c.id);
                        return (
                          <Link key={c.id} href={`/containers/${c.id}`} asChild>
                            <tr className="hover:bg-accent/40 cursor-pointer transition-colors group">
                              <td className="px-6 py-4">
                                <div className="font-mono font-medium group-hover:text-primary transition-colors">{c.containerNumber}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">BL: {c.blNumber}</div>
                              </td>
                              <td className="px-6 py-4 font-medium">{c.customerName}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border uppercase tracking-wider ${getStatusColor(c.status)}`}>
                                  {getStatusLabel(c.status)}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-sm">
                                {formatCurrency(c.clearingCharges)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {mySectionApprovals.map(a => (
                                    <span
                                      key={a.section}
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${getApprovalStatusColor(a.status)}`}
                                    >
                                      {SECTION_LABELS[a.section] ?? a.section}
                                    </span>
                                  ))}
                                  {mySectionApprovals.length === 0 && (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          </Link>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </motion.div>
  );
}
