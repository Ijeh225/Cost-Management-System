import { useState } from "react";
import { useGetMyTasks, useApproveSection, useRejectSection } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, ListTodo, Box, AlertTriangle, ClipboardCheck, CheckCircle2, XCircle, ArrowRight } from "lucide-react";
import { getStatusColor, getStatusLabel, getApprovalStatusColor, getApprovalStatusLabel, SECTION_LABELS, formatCurrency } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

function RejectDialog({
  open, onClose, onConfirm, isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setReason(""); } }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle className="text-destructive">Reject Submission</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Reason for Rejection <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Explain what needs to be corrected…"
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { onClose(); setReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || isPending}
              onClick={() => { onConfirm(reason.trim()); setReason(""); }}
            >
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MyTasksPage() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading, isError } = useGetMyTasks();
  const approveSection = useApproveSection();
  const rejectSection = useRejectSection();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [rejectTarget, setRejectTarget] = useState<{ containerId: number; section: string } | null>(null);

  const mySections = data?.mySections ?? [];
  const assignedContainers = data?.assignedContainers ?? [];
  const sectionApprovals = data?.sectionApprovals ?? [];
  const correctionTasks = (data as any)?.correctionTasks ?? [];

  const containerReviews = sectionApprovals.filter(a => a.section === "container_review");
  const regularApprovals = sectionApprovals.filter(a => a.section !== "container_review");

  const pendingReviews = containerReviews.filter(a => a.status === "submitted");
  const rejected = regularApprovals.filter(a => a.status === "rejected");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/my-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
  };

  const handleApprove = (containerId: number, section: string) => {
    approveSection.mutate({ id: containerId, section }, {
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
        toast({ title: section === "container_review" ? "Container Approved" : "Section Approved", description: section === "container_review" ? "Container marked as completed." : "Section approved and locked." });
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
    });
  };

  const handleReject = (containerId: number, section: string, reason: string) => {
    rejectSection.mutate({ id: containerId, section, data: { reason } }, {
      onSuccess: () => {
        invalidate();
        toast({ title: "Rejected", description: "Staff has been notified to make corrections." });
        setRejectTarget(null);
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ListTodo className="w-6 h-6 text-primary" /> My Tasks
          {pendingReviews.length > 0 && (
            <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/50 text-xs ml-1">
              {pendingReviews.length} pending review{pendingReviews.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          {isAdmin ? "Container review requests and workflow management." : "Your assigned containers and section status."}
          {!isAdmin && mySections.length > 0 && (
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
          {/* Admin: Pending Container Reviews */}
          {isAdmin && containerReviews.length > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardCheck className="w-4 h-4 text-amber-400" />
                  Container Reviews
                  <Badge className="ml-1 bg-amber-500/20 text-amber-400 border-amber-500/50 text-xs">
                    {pendingReviews.length} pending
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {containerReviews.map(a => {
                    const container = assignedContainers.find(c => c.id === a.containerId);
                    return (
                      <div key={a.id} className="flex items-center justify-between px-6 py-4 gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap">
                            <Link href={`/containers/${a.containerId}`} className="font-mono text-primary hover:underline text-sm font-semibold">
                              {container?.containerNumber ?? `#${a.containerId}`}
                            </Link>
                            <span className="text-sm text-foreground/80 font-medium">{container?.customerName}</span>
                            {container && (
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-wider ${getStatusColor(container.status)}`}>
                                {getStatusLabel(container.status)}
                              </span>
                            )}
                          </div>
                          {a.submittedAt && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Submitted {new Date(a.submittedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </p>
                          )}
                          {a.status === "rejected" && a.rejectionReason && (
                            <p className="text-xs text-destructive/80 mt-1 italic">Rejection: "{a.rejectionReason}"</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getApprovalStatusColor(a.status)}`}>
                            {getApprovalStatusLabel(a.status)}
                          </span>
                          {a.status === "submitted" && (
                            <>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                                onClick={() => handleApprove(a.containerId, "container_review")}
                                disabled={approveSection.isPending}
                              >
                                {approveSection.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs gap-1"
                                onClick={() => setRejectTarget({ containerId: a.containerId, section: "container_review" })}
                              >
                                <XCircle className="w-3 h-3" /> Reject
                              </Button>
                            </>
                          )}
                          {a.status !== "submitted" && (
                            <Link href={`/containers/${a.containerId}`}>
                              <Button size="sm" variant="outline" className="h-7 text-xs">View</Button>
                            </Link>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Action required — rejected section approvals */}
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

          {/* Correction Tasks — auto-created on rejection */}
          {correctionTasks.filter((t: any) => t.isRejectionTask).length > 0 && (
            <Card className="border-destructive/30 bg-destructive/5 backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-destructive" />
                  Correction Required
                  <Badge className="ml-1 bg-destructive/20 text-destructive border-destructive/40 text-xs">
                    {correctionTasks.filter((t: any) => t.isRejectionTask).length} task{correctionTasks.filter((t: any) => t.isRejectionTask).length !== 1 ? "s" : ""}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {correctionTasks.filter((t: any) => t.isRejectionTask).map((task: any) => {
                    const container = assignedContainers.find((c: any) => c.id === task.containerId);
                    return (
                      <div key={task.id} className="flex items-start justify-between px-6 py-4 gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-destructive/40 text-destructive bg-destructive/10">
                              Rejected
                            </Badge>
                            <span className="text-sm font-semibold text-foreground">{task.title}</span>
                          </div>
                          {task.notes && (
                            <p className="text-xs text-muted-foreground mt-1 italic leading-relaxed">
                              Admin feedback: "{task.notes}"
                            </p>
                          )}
                          {task.dueDate && (
                            <p className="text-xs text-muted-foreground/60 mt-1">
                              Due {new Date(task.dueDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                          )}
                        </div>
                        {task.containerId && (
                          <Link href={`/containers/${task.containerId}`}>
                            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0 border-primary/30 text-primary hover:bg-primary/10">
                              {container?.containerNumber ?? `#${task.containerId}`}
                              <ArrowRight className="w-3 h-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section approvals (non-container-review) */}
          {regularApprovals.length > 0 && (
            <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base">Section Status</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {regularApprovals.map(a => {
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
                        <div className="flex items-center gap-2">
                          {isAdmin && a.status === "submitted" && (
                            <>
                              <Button size="sm" className="h-6 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-2 gap-0.5"
                                onClick={() => handleApprove(a.containerId, a.section)}
                                disabled={approveSection.isPending}>
                                <CheckCircle2 className="w-3 h-3" /> Approve
                              </Button>
                              <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2 gap-0.5"
                                onClick={() => setRejectTarget({ containerId: a.containerId, section: a.section })}>
                                <XCircle className="w-3 h-3" /> Reject
                              </Button>
                            </>
                          )}
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getApprovalStatusColor(a.status)}`}>
                            {getApprovalStatusLabel(a.status)}
                          </span>
                        </div>
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
                {isAdmin ? "All Containers" : "Assigned Containers"}
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
                        <th className="px-6 py-3 text-left font-medium">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {assignedContainers.map(c => {
                        const review = sectionApprovals.find(a => a.containerId === c.id && a.section === "container_review");
                        const regularSecs = sectionApprovals.filter(a => a.containerId === c.id && a.section !== "container_review");
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
                                <div className="flex flex-wrap gap-1 items-center">
                                  {review && (
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${getApprovalStatusColor(review.status)}`}>
                                      Full Review: {getApprovalStatusLabel(review.status)}
                                    </span>
                                  )}
                                  {regularSecs.map(a => (
                                    <span
                                      key={a.section}
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase border ${getApprovalStatusColor(a.status)}`}
                                    >
                                      {SECTION_LABELS[a.section] ?? a.section}
                                    </span>
                                  ))}
                                  {!review && regularSecs.length === 0 && (
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

          {/* Empty state for admin with no pending reviews */}
          {isAdmin && containerReviews.length === 0 && regularApprovals.length === 0 && assignedContainers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
              <ClipboardCheck className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">No pending reviews</p>
              <p className="text-xs">Container review requests from staff will appear here.</p>
            </div>
          )}
        </>
      )}

      <RejectDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => { if (rejectTarget) handleReject(rejectTarget.containerId, rejectTarget.section, reason); }}
        isPending={rejectSection.isPending}
      />
    </motion.div>
  );
}
