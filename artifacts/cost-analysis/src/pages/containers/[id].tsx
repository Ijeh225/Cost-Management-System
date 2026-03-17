import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetContainer, useUpdateContainerCharges,
  useLockContainer, useUpdateContainer, useGetContainerAuditLog,
  useSubmitSection, useApproveSection, useRejectSection, useLockSection, useUnlockSection,
  type AuditEntry, type SectionApproval, type UpdateContainerChargesRequestSection,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import {
  formatCurrency, getStatusColor, getStatusLabel,
  WORKFLOW_STAGES, getNextStage, getStageIndex, STAGE_SECTION,
  getApprovalStatusColor, getApprovalStatusLabel, canEditSectionGranular,
} from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Lock, Unlock, Anchor, User as UserIcon, FileText,
  Save, AlertCircle, Loader2, DollarSign, Calculator, ChevronRight,
  History, BarChart3, Send, CheckCircle2, XCircle, ShieldCheck, Pencil,
  Clock, CheckSquare, Printer, ExternalLink, Layers, Users, LinkIcon, Unlink, X,
} from "lucide-react";
import { TimelineTab } from "@/components/containers/TimelineTab";
import { TasksTab } from "@/components/containers/TasksTab";
import { DocumentsTab } from "@/components/containers/DocumentsTab";
import { EditSectionsTab } from "@/components/containers/EditSectionsTab";
import { useListClients, useLinkContainerToClient, CLIENTS_QUERY_KEY } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const createNumberSchema = (keys: string[]) => {
  const shape: Record<string, z.ZodTypeAny> = {};
  keys.forEach(k => { shape[k] = z.coerce.number().optional().default(0); });
  return z.object(shape);
};

const shippingSchema = createNumberSchema(['shippingCompany', 'shippingPaymentVat', 'consignee', 'finalInvoiceShippingCompany', 'telexCharge', 'shippingRunnings', 'shippingDetentionToBePaidByCustomer']);
const customsSchema = createNumberSchema(['duty', 'dutyPaid', 'dutyNotPaid', 'valuation', 'ciu', 'upCountryCustom', 'dciu', 'mdReleasingPackage', 'ocSettlement', 'ocReleaseLocal', 'dcEnforcementForTransire', 'complianceTeam', 'cacSettlement', 'crffn', 'soncap', 'alerts', 'examinationBonus']);
const terminalSchema = createNumberSchema(['terminalCharges', 'terminalAdditions1', 'ikorouduTerminalAdditions2', 'terminalDemurrageToBePaidByCustomer', 'terminalPaymentVat', 'wharfageFeeForNpa', 'sifaxGmtSigning', 'tsDcAdmin', 'tincanBond', 'bond', 'manifest']);
const deliverySchema = createNumberSchema(['passingOfTruck', 'passingOfTruckForEmptyReturn', 'parkingForPullout', 'pullout', 'delivery', 'emptyReturn', 'unchainingTruck', 'emptyCallUp', 'pulloutExpenses', 'transferToIkorodu', 'transportAllowance']);
const operationsSchema = createNumberSchema(['fouBooking', 'fou', 'scanningToPhysical', 'security', 'additionalDeliveryExpenses', 'miscellaneous', 'abandoned', 'agenciesBlocks', 'callUp', 'transireRunnings', 'officePtml', 'freshPayment']);

function RejectSectionDialog({
  open, onClose, onConfirm, isPending,
}: {
  open: boolean; onClose: () => void; onConfirm: (r: string) => void; isPending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); setReason(""); } }}>
      <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-md">
        <DialogHeader><DialogTitle className="text-destructive">Reject Section</DialogTitle></DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Reason for Rejection <span className="text-destructive">*</span></Label>
            <Textarea placeholder="Explain what needs to be corrected…" value={reason} onChange={e => setReason(e.target.value)} rows={4} className="resize-none" />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { onClose(); setReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={!reason.trim() || isPending} onClick={() => onConfirm(reason.trim())}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChargeSectionForm({
  containerId, sectionKey, title, schema, initialData, isRecordLocked, isSectionLocked, isEditable, isAdmin,
  approval, onSubmitSection, onApproveSection, onRejectSection, onToggleSectionLock,
}: {
  containerId: number;
  sectionKey: string;
  title: string;
  schema: z.ZodObject<any>;
  initialData: any;
  isRecordLocked: boolean;
  isSectionLocked: boolean;
  isEditable: boolean;
  isAdmin: boolean;
  approval: SectionApproval | undefined;
  onSubmitSection: (section: string) => void;
  onApproveSection: (section: string) => void;
  onRejectSection: (section: string) => void;
  onToggleSectionLock: (section: string, lock: boolean) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateMutation = useUpdateContainerCharges();
  const [isEditing, setIsEditing] = useState(false);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: initialData || {},
  });

  const fields = Object.keys(schema.shape);
  const total = fields.reduce((sum, field) => sum + Number(initialData?.[field] || 0), 0);

  const approvalStatus = approval?.status ?? "draft";
  const effectivelyLocked = isRecordLocked || isSectionLocked;
  const canEdit = isEditable && !effectivelyLocked && approvalStatus !== "approved";
  const canSubmit = isEditable && !effectivelyLocked && (approvalStatus === "draft" || approvalStatus === "rejected");

  const onSubmit = (data: any) => {
    updateMutation.mutate(
      { id: containerId, data: { section: sectionKey as UpdateContainerChargesRequestSection, [sectionKey]: data, reason: "Manual UI update" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}/audit`] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          toast({ title: "Charges Updated", description: `${title} section saved.` });
          setIsEditing(false);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Update Failed", description: err?.message ?? "Something went wrong" }),
      }
    );
  };

  return (
    <>
      <AccordionItem value={sectionKey} className="border-border/50 bg-card/20 px-4 rounded-lg mb-4 shadow-sm">
        <AccordionTrigger className="hover:no-underline py-4">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-base">{title}</span>
              {(isSectionLocked || approvalStatus === "approved") && (
                <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] py-0 px-1.5">
                  <ShieldCheck className="w-3 h-3 mr-1" /> Locked
                </Badge>
              )}
              {approval && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${getApprovalStatusColor(approvalStatus)}`}>
                  {getApprovalStatusLabel(approvalStatus)}
                </span>
              )}
            </div>
            <span className="font-mono text-primary font-medium">{formatCurrency(total)}</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="pt-2 pb-6">
          {/* Rejection reason banner */}
          {approvalStatus === "rejected" && approval?.rejectionReason && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-destructive">Rejected: </span>
                <span className="text-destructive/90">{approval.rejectionReason}</span>
              </div>
            </div>
          )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                {fields.map((field) => (
                  <FormField key={field} control={form.control} name={field} render={({ field: ff }) => (
                    <FormItem>
                      <FormLabel className="text-xs text-muted-foreground capitalize">
                        {field.replace(/([A-Z])/g, ' $1').trim()}
                      </FormLabel>
                      <FormControl>
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm font-mono">₦</span>
                          <Input
                            type="number"
                            disabled={!isEditing || !canEdit || updateMutation.isPending}
                            {...ff}
                            className="pl-7 font-mono text-sm bg-background/50 border-border/60 disabled:opacity-70 h-10"
                            onFocus={(e) => e.target.select()}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border/40 mt-6">
                <div className="flex items-center gap-2">
                  {/* Admin: approve/reject when submitted */}
                  {isAdmin && approvalStatus === "submitted" && (
                    <>
                      <Button type="button" size="sm" className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => onApproveSection(sectionKey)}>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                      </Button>
                      <Button type="button" size="sm" variant="destructive" className="h-8 text-xs"
                        onClick={() => onRejectSection(sectionKey)}>
                        <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                      </Button>
                    </>
                  )}
                  {/* Admin: section lock toggle */}
                  {isAdmin && approvalStatus !== "submitted" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className={`h-8 text-xs ${isSectionLocked || approvalStatus === "approved" ? "border-amber-500/40 text-amber-400 hover:bg-amber-500/10" : ""}`}
                      onClick={() => onToggleSectionLock(sectionKey, !(isSectionLocked || approvalStatus === "approved"))}
                    >
                      {isSectionLocked || approvalStatus === "approved"
                        ? <><Unlock className="w-3 h-3 mr-1" /> Unlock Section</>
                        : <><Lock className="w-3 h-3 mr-1" /> Lock Section</>}
                    </Button>
                  )}
                  {/* Staff: submit for review */}
                  {!isAdmin && canSubmit && (
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => onSubmitSection(sectionKey)}>
                      <Send className="w-3.5 h-3.5 mr-1" /> Submit for Review
                    </Button>
                  )}
                </div>
                {/* Edit / Save buttons */}
                {canEdit && (
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => { form.reset(initialData); setIsEditing(false); }} disabled={updateMutation.isPending}>
                          Cancel
                        </Button>
                        <Button type="submit" size="sm" className="h-8 text-xs active:scale-95 transition-transform shadow-md" disabled={updateMutation.isPending}>
                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                          Save
                        </Button>
                      </>
                    ) : (
                      <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={() => setIsEditing(true)}>
                        Edit {title.split(" ")[0]}
                      </Button>
                    )}
                  </div>
                )}
                {!canEdit && approvalStatus !== "submitted" && (
                  <span className="text-xs text-muted-foreground italic">
                    {approvalStatus === "approved" ? "Approved — section locked" : effectivelyLocked ? "Section locked" : "Read-only"}
                  </span>
                )}
              </div>
            </form>
          </Form>
        </AccordionContent>
      </AccordionItem>
    </>
  );
}

function WorkflowProgress({ currentStatus }: { currentStatus: string }) {
  const currentIdx = getStageIndex(currentStatus);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground font-mono uppercase tracking-wider">Workflow Progress</span>
        <span className="text-xs font-semibold text-foreground">{currentIdx + 1} / {WORKFLOW_STAGES.length}</span>
      </div>
      <div className="flex gap-1">
        {WORKFLOW_STAGES.map((stage, idx) => (
          <div key={stage.value} title={stage.label}
            className={`h-2 flex-1 rounded-full transition-all duration-300 ${idx < currentIdx ? "bg-primary/60" : idx === currentIdx ? "bg-primary" : "bg-border/40"}`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>{WORKFLOW_STAGES[0].short}</span>
        <span className="font-medium text-primary">{getStatusLabel(currentStatus)}</span>
        <span>{WORKFLOW_STAGES[WORKFLOW_STAGES.length - 1].short}</span>
      </div>
    </div>
  );
}

function AuditTrail({ containerId }: { containerId: number }) {
  const { data: entries, isLoading } = useGetContainerAuditLog(containerId);
  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!entries?.length) return (
    <div className="text-center py-16 text-muted-foreground">
      <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="text-sm">No activity recorded yet.</p>
    </div>
  );
  const ACTION_LABELS: Record<string, string> = {
    update_charges: "Charges Updated",
    update_container: "Container Updated",
    locked: "Container Locked",
    unlocked: "Container Unlocked",
    section_submitted: "Section Submitted",
    section_approved: "Section Approved",
    section_rejected: "Section Rejected",
    section_locked: "Section Locked",
    section_unlocked: "Section Unlocked",
  };
  return (
    <div className="space-y-3">
      {entries.map((entry: AuditEntry, i: number) => (
        <div key={i} className="flex gap-4 p-4 bg-card/30 rounded-lg border border-border/40 hover:border-border/60 transition-colors">
          <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
            <History className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {ACTION_LABELS[(entry as any).action] ?? (entry as any).action?.replace(/_/g, " ") ?? "Update"}
                  {(entry as any).section && <span className="text-muted-foreground text-xs ml-2 capitalize">({(entry as any).section})</span>}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  by <span className="font-medium text-foreground/80">{(entry as any).userName ?? "System"}</span>
                  {(entry as any).reason && <> — <span className="italic">{(entry as any).reason}</span></>}
                </p>
              </div>
              <span className="text-xs font-mono text-muted-foreground/60 shrink-0">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ContainerDetail() {
  const { id } = useParams();
  const containerId = Number(id);
  const { isAdmin, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("charges");
  const [rejectTargetSection, setRejectTargetSection] = useState<string | null>(null);
  const [editingClearing, setEditingClearing] = useState(false);
  const [clearingInput, setClearingInput] = useState("");
  const [linkClientDialog, setLinkClientDialog] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [linkingClient, setLinkingClient] = useState(false);
  const [editSectionsOpen, setEditSectionsOpen] = useState(false);

  const { data, isLoading, isError } = useGetContainer(containerId);
  const lockMutation = useLockContainer();
  const updateMutation = useUpdateContainer();
  const submitSectionMutation = useSubmitSection();
  const approveSectionMutation = useApproveSection();
  const rejectSectionMutation = useRejectSection();
  const lockSectionMutation = useLockSection();
  const unlockSectionMutation = useUnlockSection();
  const { data: clientsList } = useListClients();
  const linkContainerMutation = useLinkContainerToClient();

  const handleLinkClient = () => {
    if (!selectedClientId) return;
    setLinkingClient(true);
    linkContainerMutation.mutate(
      { clientId: Number(selectedClientId), containerId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          setLinkClientDialog(false);
          setSelectedClientId("");
          toast({ title: "Client linked", description: "Container is now linked to the selected client." });
          setLinkingClient(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to link client" });
          setLinkingClient(false);
        },
      }
    );
  };

  const handleUnlinkClient = async () => {
    setLinkingClient(true);
    try {
      const res = await fetch(`/api/containers/${containerId}/unlink-client`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Unlink failed");
      queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
      queryClient.invalidateQueries({ queryKey: CLIENTS_QUERY_KEY });
      toast({ title: "Client unlinked", description: "Container is no longer linked to a client." });
    } catch {
      toast({ variant: "destructive", title: "Failed to unlink client" });
    } finally {
      setLinkingClient(false);
    }
  };

  if (isLoading) return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (isError || !data) return <div className="p-12 text-center text-destructive">Failed to load container details.</div>;

  const { container, charges, sectionApprovals = [] } = data as any;
  const nextStage = getNextStage(container.status);
  const userSectionPermission: string | null = (user as any)?.sectionPermission ?? null;
  const userSectionPermissions: string | null = (user as any)?.sectionPermissions ?? null;
  const activeSection = STAGE_SECTION[container.status] ?? null;
  const lockedSections: string[] = container.lockedSections ?? [];

  const canAdvance = !container.isLocked && nextStage !== null && isAdmin;

  const handleAdvance = () => {
    if (!nextStage) return;
    updateMutation.mutate(
      { id: containerId, data: { status: nextStage } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}/audit`] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          toast({ title: "Stage Advanced", description: `Container moved to "${getStatusLabel(nextStage)}".` });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
      }
    );
  };

  const handleLockToggle = () => {
    lockMutation.mutate(
      { id: containerId, data: { locked: !container.isLocked } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          toast({ title: container.isLocked ? "Container Unlocked" : "Container Locked" });
        },
      }
    );
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
    queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}/audit`] });
    queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
  };

  const handleSubmitSection = (section: string) => {
    submitSectionMutation.mutate({ id: containerId, section }, {
      onSuccess: () => { invalidate(); toast({ title: `${section} submitted for review.` }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const handleApproveSection = (section: string) => {
    approveSectionMutation.mutate({ id: containerId, section }, {
      onSuccess: () => { invalidate(); toast({ title: `${section} approved and locked.` }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const handleRejectSection = (section: string, reason: string) => {
    rejectSectionMutation.mutate({ id: containerId, section, data: { reason } }, {
      onSuccess: () => { invalidate(); toast({ title: `${section} rejected.` }); setRejectTargetSection(null); },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const handleSaveClearingCharges = () => {
    const value = parseFloat(clearingInput);
    if (isNaN(value) || value < 0) {
      toast({ variant: "destructive", title: "Invalid amount", description: "Please enter a valid number." });
      return;
    }
    updateMutation.mutate(
      { id: containerId, data: { clearingCharges: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
          toast({ title: "Clearing charges updated." });
          setEditingClearing(false);
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err?.message }),
      }
    );
  };

  const handleToggleSectionLock = (section: string, lock: boolean) => {
    const mutation = lock ? lockSectionMutation : unlockSectionMutation;
    mutation.mutate({ id: containerId, section }, {
      onSuccess: () => { invalidate(); toast({ title: `${section} section ${lock ? "locked" : "unlocked"}.` }); },
      onError: (err: any) => toast({ variant: "destructive", title: "Error", description: err.message }),
    });
  };

  const getSectionApproval = (sectionKey: string): SectionApproval | undefined =>
    sectionApprovals.find((a: SectionApproval) => a.section === sectionKey);

  const isSectionEditable = (sectionKey: string) =>
    canEditSectionGranular(sectionKey, isAdmin, userSectionPermissions, userSectionPermission);

  const CHARGE_SECTIONS = [
    { key: "shipping",   title: "Shipping Charges",      schema: shippingSchema,   data: charges.shipping },
    { key: "customs",    title: "Customs Duty & Taxes",  schema: customsSchema,    data: charges.customs },
    { key: "terminal",   title: "Terminal Charges",       schema: terminalSchema,   data: charges.terminal },
    { key: "delivery",   title: "Delivery & Transport",  schema: deliverySchema,   data: charges.delivery },
    { key: "operations", title: "Operations & Misc.",     schema: operationsSchema, data: charges.operations },
  ];

  const pendingApprovals = sectionApprovals.filter((a: SectionApproval) => a.status === "submitted").length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/containers">
          <Button variant="ghost" size="icon" className="hover:bg-accent rounded-full"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {container.containerNumber}
            {container.isLocked && (
              <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 px-2 py-0.5">
                <Lock className="w-3 h-3 mr-1" /> Locked
              </Badge>
            )}
            {pendingApprovals > 0 && isAdmin && (
              <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/50 text-xs">
                {pendingApprovals} pending
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm flex items-center gap-2 mt-1">
            <FileText className="w-3.5 h-3.5" /> BL: {container.blNumber}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          <span className={`px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider border ${getStatusColor(container.status)}`}>
            {getStatusLabel(container.status)}
          </span>
          {canAdvance && (
            <Button
              size="sm"
              onClick={handleAdvance}
              disabled={updateMutation.isPending}
              className="active:scale-95 transition-transform shadow-md shadow-primary/20 gap-1.5"
            >
              {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
              Advance to {getStatusLabel(nextStage!)}
            </Button>
          )}
          {isAdmin && (
            <Button
              variant={container.isLocked ? "outline" : "secondary"}
              size="sm"
              onClick={handleLockToggle}
              disabled={lockMutation.isPending}
              className={container.isLocked ? "border-destructive/50 text-destructive hover:bg-destructive/10" : ""}
            >
              {container.isLocked ? <><Unlock className="w-4 h-4 mr-2" />Unlock</> : <><Lock className="w-4 h-4 mr-2" />Lock</>}
            </Button>
          )}
        </div>
      </div>

      {container.isLocked && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
          <div>
            <h4 className="font-semibold text-destructive text-sm">Record Locked</h4>
            <p className="text-xs text-destructive/80 mt-1">This container's data is locked and cannot be edited.</p>
          </div>
        </div>
      )}

      {/* Hero Summary */}
      <Card className="border-border/50 bg-card/40 backdrop-blur shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Anchor className="w-48 h-48" />
        </div>
        <CardContent className="p-6 relative z-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Customer</p>
              <p className="font-semibold text-foreground text-lg">{container.customerName}</p>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Vessel</p>
              <p className="font-medium text-foreground">{container.vessel || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Size / Type</p>
              <p className="font-medium text-foreground">{container.size || 'N/A'}</p>
            </div>
            <div>
              <p className="text-xs font-mono text-muted-foreground uppercase mb-1">Assigned To</p>
              <p className="font-medium text-foreground flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-primary" />
                {container.assignedStaffName || 'Unassigned'}
              </p>
            </div>
          </div>
          <div className="border-t border-border/30 pt-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-muted-foreground shrink-0" />
              <div>
                <p className="text-xs font-mono text-muted-foreground uppercase mb-0.5">Linked Client</p>
                {container.clientId ? (
                  <Link href={`/clients/${container.clientId}`}>
                    <span className="font-semibold text-primary hover:underline cursor-pointer">{container.clientName || "Unknown Client"}</span>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">No client linked</p>
                )}
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                {container.clientId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs border-destructive/30 text-destructive hover:bg-destructive/10"
                    onClick={handleUnlinkClient}
                    disabled={linkingClient}
                  >
                    {linkingClient ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unlink className="w-3 h-3" />} Unlink Client
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs"
                    onClick={() => setLinkClientDialog(true)}
                  >
                    <LinkIcon className="w-3 h-3" /> Link to Client
                  </Button>
                )}
              </div>
            )}
          </div>
          <WorkflowProgress currentStatus={container.status} />
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList className="bg-card/40 border border-border/50 flex-wrap h-auto">
            <TabsTrigger value="charges" className="gap-2">
              <Calculator className="w-4 h-4" /> Charges
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-2">
              <Clock className="w-4 h-4" /> Timeline
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-2">
              <CheckSquare className="w-4 h-4" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="documents" className="gap-2">
              <FileText className="w-4 h-4" /> Documents
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2">
              <History className="w-4 h-4" /> Audit Trail
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" className="gap-2 text-muted-foreground" onClick={() => setEditSectionsOpen(true)}>
                <Layers className="w-3.5 h-3.5" /> Edit Sections
              </Button>
            )}
            <a href={`/containers/${containerId}/print`} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-2 text-muted-foreground">
                <Printer className="w-3.5 h-3.5" /> Print Summary
              </Button>
            </a>
          </div>
        </div>

        <TabsContent value="charges" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2 space-y-2">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-primary" /> Breakdown of Charges
              </h3>
              {!isAdmin && (userSectionPermission || userSectionPermissions) && (
                <div className="mb-4 px-4 py-3 rounded-lg bg-primary/5 border border-primary/20 text-sm flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary shrink-0" />
                  <span className="text-muted-foreground">
                    Submit sections for admin review when your entries are complete.
                    {activeSection && <> Current workflow stage: <span className="font-semibold text-foreground capitalize">{activeSection}</span>.</>}
                  </span>
                </div>
              )}
              <Accordion type="single" collapsible className="w-full">
                {CHARGE_SECTIONS.map(s => (
                  <ChargeSectionForm
                    key={s.key}
                    containerId={containerId}
                    sectionKey={s.key}
                    title={s.title}
                    schema={s.schema}
                    initialData={s.data}
                    isRecordLocked={container.isLocked}
                    isSectionLocked={lockedSections.includes(s.key)}
                    isEditable={isSectionEditable(s.key)}
                    isAdmin={isAdmin}
                    approval={getSectionApproval(s.key)}
                    onSubmitSection={handleSubmitSection}
                    onApproveSection={handleApproveSection}
                    onRejectSection={(section) => setRejectTargetSection(section)}
                    onToggleSectionLock={handleToggleSectionLock}
                  />
                ))}
              </Accordion>
            </div>

            <div className="lg:sticky top-24">
              <Card className="border-primary/20 bg-card/60 backdrop-blur shadow-xl overflow-hidden relative">
                <div className="absolute h-1 w-full bg-gradient-to-r from-primary via-indigo-500 to-purple-500 top-0 left-0" />
                <CardHeader className="pb-4 border-b border-border/40">
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" /> Accounting Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Total Actual Cost</p>
                    <p className="text-2xl font-mono font-bold text-foreground">{formatCurrency(charges.totalCost)}</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-muted-foreground">Agreed Clearing Charges</p>
                      {isAdmin && !container.isLocked && !editingClearing && (
                        <button
                          onClick={() => { setClearingInput(String(charges.clearingCharges ?? 0)); setEditingClearing(true); }}
                          className="text-xs text-primary/60 hover:text-primary flex items-center gap-1 transition-colors"
                        >
                          <Pencil className="w-3 h-3" /> Edit
                        </button>
                      )}
                    </div>
                    {editingClearing ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground text-sm font-mono">₦</span>
                          <Input
                            type="number"
                            value={clearingInput}
                            onChange={e => setClearingInput(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleSaveClearingCharges(); if (e.key === "Escape") setEditingClearing(false); }}
                            className="pl-7 font-mono text-sm"
                            autoFocus
                            onFocus={e => e.target.select()}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs flex-1" onClick={handleSaveClearingCharges} disabled={updateMutation.isPending}>
                            {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingClearing(false)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-2xl font-mono font-bold text-primary">{formatCurrency(charges.clearingCharges)}</p>
                    )}
                  </div>
                  <div className="pt-6 border-t border-border/40">
                    <p className="text-sm font-medium text-muted-foreground flex justify-between mb-2">
                      <span>Gross Profit/Loss</span>
                      {charges.grossProfit >= 0 ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-0">PROFIT</Badge>
                      ) : (
                        <Badge className="bg-destructive/10 text-destructive hover:bg-destructive/20 border-0">LOSS</Badge>
                      )}
                    </p>
                    <p className={`text-4xl font-mono font-black tracking-tighter ${charges.grossProfit >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      {formatCurrency(charges.grossProfit)}
                    </p>
                  </div>
                  {charges.customs?.dutyNotPaid !== undefined && charges.customs.dutyNotPaid > 0 && (
                    <div className="p-3 bg-amber-500/10 rounded border border-amber-500/20 flex justify-between items-center">
                      <span className="text-xs font-semibold text-amber-500">Unpaid Duty:</span>
                      <span className="font-mono text-sm font-bold text-amber-500">{formatCurrency(charges.customs.dutyNotPaid)}</span>
                    </div>
                  )}
                  {/* Section Approval Status */}
                  {sectionApprovals.length > 0 && (
                    <div className="pt-4 border-t border-border/40 space-y-2">
                      <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-2">Section Status</p>
                      {sectionApprovals.map((a: SectionApproval) => (
                        <div key={a.section} className="flex items-center justify-between">
                          <span className="text-xs capitalize text-foreground/70">{a.section}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase border ${getApprovalStatusColor(a.status)}`}>
                            {getApprovalStatusLabel(a.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <Card className="border-border/50 bg-card/40 backdrop-blur shadow-lg">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary" /> Operations Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TimelineTab containerId={containerId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-6">
          <Card className="border-border/50 bg-card/40 backdrop-blur shadow-lg">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-primary" /> Task Manager
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <TasksTab containerId={containerId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6">
          <Card className="border-border/50 bg-card/40 backdrop-blur shadow-lg">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Document Attachments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <DocumentsTab containerId={containerId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-6">
          <Card className="border-border/50 bg-card/40 backdrop-blur shadow-lg">
            <CardHeader className="border-b border-border/40">
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-primary" /> Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <AuditTrail containerId={containerId} />
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>

      {/* Edit Sections Modal */}
      <Dialog open={editSectionsOpen} onOpenChange={setEditSectionsOpen}>
        <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col border-border/50 bg-card/95 backdrop-blur p-0">
          <DialogHeader className="px-6 py-4 border-b border-border/40 flex-shrink-0">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" /> Edit Cost Sections
              </DialogTitle>
              <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={() => setEditSectionsOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 p-6">
            <EditSectionsTab />
          </div>
        </DialogContent>
      </Dialog>

      {/* Global reject dialog */}
      <RejectSectionDialog
        open={!!rejectTargetSection}
        onClose={() => setRejectTargetSection(null)}
        onConfirm={(reason) => { if (rejectTargetSection) handleRejectSection(rejectTargetSection, reason); }}
        isPending={rejectSectionMutation.isPending}
      />

      {/* Link Client dialog */}
      <Dialog open={linkClientDialog} onOpenChange={v => { if (!v) { setLinkClientDialog(false); setSelectedClientId(""); } }}>
        <DialogContent className="border-border/50 bg-card/95 backdrop-blur max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><LinkIcon className="w-4 h-4 text-primary" /> Link to Client</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Select Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choose a client…" /></SelectTrigger>
                <SelectContent>
                  {(clientsList ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => { setLinkClientDialog(false); setSelectedClientId(""); }}>Cancel</Button>
              <Button disabled={!selectedClientId || linkingClient} onClick={handleLinkClient} className="gap-2">
                {linkingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />} Link Client
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
