import { useState } from "react";
import { useGetApprovalQueue, useApproveSection, useRejectSection } from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ClipboardCheck, CheckCircle2, XCircle, ArrowRight, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { getApprovalStatusColor, getApprovalStatusLabel, SECTION_LABELS } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { BranchChip } from "@/components/layout/branch-chip";

function RejectDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle className="text-destructive">Reject Section</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Reason for Rejection <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder="Explain what needs to be corrected…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!reason.trim() || isPending}
              onClick={() => onConfirm(reason.trim())}
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

export default function ApprovalsPage() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const { data: queue, isLoading, isError } = useGetApprovalQueue();
  const approveSection = useApproveSection();
  const rejectSection = useRejectSection();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [rejectTarget, setRejectTarget] = useState<{ containerId: number; section: string } | null>(null);

  if (!isAdmin) { setLocation("/"); return null; }

  const submitted = queue?.filter(q => q.status === "submitted") ?? [];
  const reviewed = queue?.filter(q => q.status !== "submitted") ?? [];

  const handleApprove = (containerId: number, section: string) => {
    approveSection.mutate({ id: containerId, section }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        queryClient.invalidateQueries({ queryKey: ["/api/containers"] });
        toast({ title: `${SECTION_LABELS[section] ?? section} section approved and locked.` });
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const handleReject = (reason: string) => {
    if (!rejectTarget) return;
    rejectSection.mutate({ id: rejectTarget.containerId, section: rejectTarget.section, data: { reason } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
        toast({ title: "Section rejected.", description: "Staff will be able to edit and resubmit." });
        setRejectTarget(null);
      },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" /> Approval Queue
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Review and approve submitted container sections.</p>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
          <AlertTriangle className="w-10 h-10 text-destructive/50" />
          <p>Failed to load approval queue.</p>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          {/* Pending Review */}
          <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Pending Review
                {submitted.length > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/50 text-xs ml-1">
                    {submitted.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {submitted.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground text-sm">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500/50" />
                  No sections pending review.
                </div>
              ) : (
                <div className="divide-y divide-border/40">
                  {submitted.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-6 py-4 hover:bg-accent/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Link href={`/containers/${item.containerId}`} className="font-mono font-medium text-primary hover:underline text-sm flex items-center">
                            {item.containerNumber}<BranchChip branchId={(item as { branchId?: number }).branchId} />
                          </Link>
                          <span className="text-muted-foreground text-sm">{item.customerName}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getApprovalStatusColor(item.section)}`}>
                            {SECTION_LABELS[item.section] ?? item.section}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Submitted by <span className="text-foreground">{item.submittedByName ?? "Unknown"}</span>
                          {item.submittedAt && <> · {new Date(item.submittedAt).toLocaleString()}</>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4 shrink-0">
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={approveSection.isPending}
                          onClick={() => handleApprove(item.containerId, item.section)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs"
                          disabled={rejectSection.isPending}
                          onClick={() => setRejectTarget({ containerId: item.containerId, section: item.section })}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                        <Link href={`/containers/${item.containerId}`}>
                          <Button size="sm" variant="ghost" className="h-8 text-xs">
                            View <ArrowRight className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recently Reviewed */}
          {reviewed.length > 0 && (
            <Card className="border-border/40 bg-card/40 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">Recently Reviewed</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/40">
                  {reviewed.slice(0, 20).map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-6 py-3 text-sm">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link href={`/containers/${item.containerId}`} className="font-mono text-primary hover:underline text-xs">
                          {item.containerNumber}
                        </Link>
                        <span className="text-muted-foreground text-xs">{item.customerName}</span>
                        <span className="text-xs text-foreground/70 capitalize">{SECTION_LABELS[item.section] ?? item.section}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getApprovalStatusColor(item.status)}`}>
                          {getApprovalStatusLabel(item.status)}
                        </span>
                        {item.rejectionReason && (
                          <span className="text-xs text-destructive/80 italic">"{item.rejectionReason}"</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono ml-4 shrink-0">
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <RejectDialog
        open={!!rejectTarget}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleReject}
        isPending={rejectSection.isPending}
      />
    </motion.div>
  );
}
