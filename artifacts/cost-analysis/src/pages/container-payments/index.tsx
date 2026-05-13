import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  useGetContainer,
  useUpdateContainerCharges,
  useGetContainerExpensePaymentsBySection,
  useBatchCreateContainerExpensePayment,
  useGetContainerExtraCharges,
  useGetRecentContainerExpensePayments,
  useActiveBanks,
  useContainerSearch,
  useGetSettings,
  useGetContainerReconciliation,
  BUILT_IN_SECTION_DEFAULTS,
  getBuiltInFieldLabel,
  isBuiltInFieldHidden,
  type UpdateContainerChargesRequestSection,
  type ContainerSectionSummary,
  type BankOption,
  type PaymentSection,
  PAYMENT_SECTION_LABELS,
  ALL_PAYMENT_SECTIONS,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { BranchChip } from "@/components/layout/branch-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import {
  CreditCard, Search, X, Loader2, Banknote, Building2, Save,
  Anchor, Package, Truck, Settings, DollarSign, CheckCircle2,
  ArrowRight, Receipt, Scale, TrendingUp, TrendingDown,
} from "lucide-react";

// ── Schemas (identical to Breakdown of Charges section) ──────────────────────

const createNumberSchema = (keys: string[]) => {
  const shape: Record<string, z.ZodTypeAny> = {};
  keys.forEach(k => { shape[k] = z.coerce.number().optional().default(0); });
  return z.object(shape);
};

const shippingSchema   = createNumberSchema(['shippingCompany','shippingPaymentVat','consignee','finalInvoiceShippingCompany','telexCharge','shippingRunnings','shippingDetentionToBePaidByCustomer']);
const customsSchema    = createNumberSchema(['duty','dutyPaid','dutyNotPaid','valuation','ciu','upCountryCustom','dciu','mdReleasingPackage','ocSettlement','ocReleaseLocal','dcEnforcementForTransire','complianceTeam','cacSettlement','crffn','soncap','alerts','examinationBonus']);
const terminalSchema   = createNumberSchema(['terminalCharges','terminalAdditions1','ikorouduTerminalAdditions2','terminalDemurrageToBePaidByCustomer','terminalPaymentVat','wharfageFeeForNpa','sifaxGmtSigning','tsDcAdmin','tincanBond','bond','manifest']);
const deliverySchema   = createNumberSchema(['passingOfTruck','passingOfTruckForEmptyReturn','parkingForPullout','pullout','delivery','emptyReturn','unchainingTruck','emptyCallUp','pulloutExpenses','transferToIkorodu','transportAllowance']);
const operationsSchema = createNumberSchema(['fouBooking','fou','scanningToPhysical','security','additionalDeliveryExpenses','miscellaneous','abandoned','agenciesBlocks','callUp','transireRunnings','officePtml','freshPayment']);

const SECTION_SCHEMA: Record<PaymentSection, z.ZodObject<any>> = {
  shipping: shippingSchema, customs: customsSchema, terminal: terminalSchema,
  delivery: deliverySchema, operations: operationsSchema,
};

const SECTION_STYLE: Record<PaymentSection, { icon: React.ReactNode; bg: string; border: string; text: string; pill: string }> = {
  shipping:   { icon: <Anchor className="w-4 h-4" />,   bg: "bg-blue-500/10",   border: "border-blue-500/30",   text: "text-blue-400",   pill: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  customs:    { icon: <Package className="w-4 h-4" />,   bg: "bg-purple-500/10", border: "border-purple-500/30", text: "text-purple-400", pill: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  terminal:   { icon: <Building2 className="w-4 h-4" />, bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-400", pill: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  delivery:   { icon: <Truck className="w-4 h-4" />,     bg: "bg-green-500/10",  border: "border-green-500/30",  text: "text-green-400",  pill: "bg-green-500/15 text-green-300 border-green-500/30" },
  operations: { icon: <Settings className="w-4 h-4" />,  bg: "bg-pink-500/10",   border: "border-pink-500/30",   text: "text-pink-400",   pill: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
};

// ── SectionPanel ─────────────────────────────────────────────────────────────

function SectionPanel({
  containerId, sectionKey, title, initialData, sectionSettings, sectionPayment, banks,
}: {
  containerId: number;
  sectionKey: PaymentSection;
  title: string;
  initialData: Record<string, any>;
  sectionSettings: Record<string, string>;
  sectionPayment?: ContainerSectionSummary;
  banks: BankOption[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const style = SECTION_STYLE[sectionKey];
  const schema = SECTION_SCHEMA[sectionKey];

  // ── Charge fields form ──────────────────────────────────────────────────
  const updateMutation = useUpdateContainerCharges();
  const form = useForm({ resolver: zodResolver(schema), defaultValues: initialData ?? {} });
  const isDirty = form.formState.isDirty;
  useEffect(() => { form.reset(initialData ?? {}); }, [JSON.stringify(initialData)]);

  const { data: extraCharges = [] } = useGetContainerExtraCharges(containerId);
  const sectionExtras = extraCharges.filter(r => r.section === sectionKey);
  const extraTotal = sectionExtras.reduce((s, r) => s + r.amount, 0);

  const fields = Object.keys(schema.shape).filter(f => !isBuiltInFieldHidden(sectionSettings, sectionKey, f));
  const baseTotal = fields.reduce((sum, f) => sum + Number(initialData?.[f] || 0), 0);
  const chargedTotal = baseTotal + extraTotal;

  const paid = sectionPayment?.paid ?? 0;
  const outstanding = sectionPayment?.outstanding ?? (chargedTotal - paid);

  const onSaveCharges = (data: any) => {
    updateMutation.mutate(
      { id: containerId, data: { section: sectionKey as UpdateContainerChargesRequestSection, [sectionKey]: data, reason: "Updated via Container Payments" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/containers/${containerId}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/containers", containerId, "expense-payments", "by-section"] });
          form.reset(data);
          toast({ title: "Breakdown updated", description: `${title} charges saved and synced.` });
        },
        onError: (err: any) => toast({ variant: "destructive", title: "Save failed", description: err?.message }),
      }
    );
  };

  // ── Payment form ────────────────────────────────────────────────────────
  const batchPay = useBatchCreateContainerExpensePayment();
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<"cash" | "bank">("bank");
  const [payBankId, setPayBankId] = useState("");
  const [payRef, setPayRef] = useState("");
  const [payNarration, setPayNarration] = useState("");
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payPending, setPayPending] = useState(false);

  const handleRecordPayment = async () => {
    const amt = parseFloat(payAmount);
    if (!payAmount || isNaN(amt) || amt <= 0) {
      toast({ title: "Enter a valid amount", variant: "destructive" }); return;
    }
    if (payMethod === "bank" && !payBankId) {
      toast({ title: "Select a bank account", variant: "destructive" }); return;
    }
    setPayPending(true);
    try {
      await batchPay.mutateAsync({
        items: [{ containerId, amount: amt }],
        section: sectionKey,
        bankId: payMethod === "bank" ? Number(payBankId) : null,
        paymentMethod: payMethod,
        reference: payRef.trim() || undefined,
        narration: payNarration.trim() || undefined,
        paidAt: new Date(payDate).toISOString(),
      });
      toast({ title: "Payment recorded", description: `${formatCurrency(amt)} recorded for ${title}.` });
      setPayAmount("");
      setPayRef("");
      setPayNarration("");
    } catch (err: any) {
      toast({ title: "Payment failed", description: err?.message ?? "Server error", variant: "destructive" });
    } finally {
      setPayPending(false);
    }
  };

  return (
    <AccordionItem
      value={sectionKey}
      className="border border-border/40 bg-card/30 rounded-xl overflow-hidden shadow-sm"
    >
      <AccordionTrigger className="hover:no-underline px-5 py-4 hover:bg-muted/5 [&[data-state=open]]:bg-muted/10">
        <div className="flex items-center justify-between w-full pr-2 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-9 h-9 rounded-lg ${style.bg} border ${style.border} flex items-center justify-center shrink-0`}>
              <span className={style.text}>{style.icon}</span>
            </div>
            <div className="text-left min-w-0">
              <p className="font-semibold text-sm">{title}</p>
              <p className={`text-[11px] font-mono font-medium ${chargedTotal > 0 ? style.text : "text-muted-foreground"}`}>
                {formatCurrency(chargedTotal)} charged
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
            {paid > 0 && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${style.pill}`}>
                Paid {formatCurrency(paid)}
              </span>
            )}
            {outstanding > 0 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-300 border-amber-500/30 font-semibold">
                Due {formatCurrency(outstanding)}
              </span>
            ) : paid > 0 && chargedTotal > 0 ? (
              <span className="text-[10px] px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-300 border-emerald-500/30 font-semibold">
                Settled
              </span>
            ) : null}
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent className="px-5 pt-4 pb-6 border-t border-border/30">

        {/* ── Breakdown of Charges ─────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign className={`w-3.5 h-3.5 ${style.text}`} />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Breakdown of Charges
            </p>
            <span className="text-xs text-muted-foreground">(changes sync to container record)</span>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSaveCharges)}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-3">
                {fields.map(field => (
                  <FormField
                    key={field}
                    control={form.control}
                    name={field}
                    render={({ field: ff }) => (
                      <FormItem>
                        <FormLabel className="text-[11px] text-muted-foreground leading-tight">
                          {getBuiltInFieldLabel(sectionSettings, sectionKey, field)}
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-2.5 top-2 text-muted-foreground text-xs font-mono pointer-events-none">₦</span>
                            <Input
                              type="number"
                              disabled={updateMutation.isPending}
                              {...ff}
                              className="pl-6 font-mono text-sm h-9 bg-background/40 border-border/50"
                              onFocus={e => e.target.select()}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>

              {sectionExtras.length > 0 && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground border-t border-border/20 pt-3">
                  <Receipt className="w-3.5 h-3.5" />
                  <span>{sectionExtras.length} custom line item{sectionExtras.length !== 1 ? "s" : ""}:</span>
                  <span className="font-mono font-semibold text-foreground">{formatCurrency(extraTotal)}</span>
                  <span className="text-muted-foreground/50">· edit in Breakdown of Charges</span>
                </div>
              )}

              {isDirty && (
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-border/30">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs"
                    onClick={() => form.reset(initialData)} disabled={updateMutation.isPending}>
                    Discard
                  </Button>
                  <Button type="submit" size="sm" className="h-8 text-xs gap-1.5" disabled={updateMutation.isPending}>
                    {updateMutation.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Save className="w-3.5 h-3.5" />}
                    Save to Breakdown
                  </Button>
                  <span className="text-[11px] text-amber-400">Unsaved changes</span>
                </div>
              )}
            </form>
          </Form>
        </div>

        {/* ── Log Disbursement ─────────────────────────────────────────── */}
        <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
          <div className="flex items-center gap-2 mb-1">
            <CreditCard className={`w-3.5 h-3.5 ${style.text}`} />
            <p className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
              Log Disbursement
            </p>
          </div>
          <p className="text-[10px] text-muted-foreground mb-3">
            Record money paid <span className="font-semibold">out</span> to vendors/agencies for this section — not the client's payment to you.
          </p>
          <div className="space-y-3">

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Amount *</Label>
                <div className="relative">
                  <span className="absolute left-2.5 top-2 text-muted-foreground text-xs font-mono pointer-events-none">₦</span>
                  <Input
                    type="number" min="0" step="0.01" placeholder="0.00"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="pl-6 font-mono text-sm h-9 bg-background/60"
                  />
                </div>
                {outstanding > 0 && (
                  <button type="button" onClick={() => setPayAmount(String(outstanding))}
                    className={`text-[10px] ${style.text} hover:underline`}>
                    Fill outstanding ({formatCurrency(outstanding)})
                  </button>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Payment Date *</Label>
                <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-9 text-sm bg-background/60" />
              </div>
            </div>

            {/* Method toggle */}
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Payment Method</Label>
              <div className="flex gap-2">
                {(["bank", "cash"] as const).map(m => (
                  <button key={m} type="button" onClick={() => setPayMethod(m)}
                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg border text-xs font-medium transition-all ${
                      payMethod === m
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 bg-background/40 text-muted-foreground hover:bg-muted/30"
                    }`}>
                    {m === "bank" ? <><Building2 className="w-3.5 h-3.5" /> Bank</> : <><Banknote className="w-3.5 h-3.5" /> Cash</>}
                  </button>
                ))}
              </div>
            </div>

            {/* Bank */}
            {payMethod === "bank" && (
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Bank Account *</Label>
                <Select value={payBankId} onValueChange={setPayBankId}>
                  <SelectTrigger className="h-9 text-sm bg-background/60">
                    <SelectValue placeholder="Select bank account…" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.filter((b: BankOption) => b.isActive).map((b: BankOption) => (
                      <SelectItem key={b.id} value={String(b.id)}>
                        {b.name}{b.accountNumber ? ` — ${b.accountNumber}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Ref + Narration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Reference</Label>
                <Input placeholder="e.g. TRF/2024/001" value={payRef} onChange={e => setPayRef(e.target.value)} className="h-9 text-sm bg-background/60" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Narration</Label>
                <Input placeholder="Notes…" value={payNarration} onChange={e => setPayNarration(e.target.value)} className="h-9 text-sm bg-background/60" />
              </div>
            </div>

            <Button
              type="button"
              onClick={handleRecordPayment}
              disabled={payPending || !payAmount}
              className="w-full h-9 text-sm font-semibold gap-2"
            >
              {payPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle2 className="w-4 h-4" />}
              Log {title} Disbursement
            </Button>
          </div>
        </div>

      </AccordionContent>
    </AccordionItem>
  );
}

// ── ContainerView (mounts only when a real containerId is known) ──────────────

function ContainerView({
  containerId, sn, banks, onDeselect,
}: {
  containerId: number;
  sn: Record<string, string>;
  banks: BankOption[];
  onDeselect: () => void;
}) {
  const { data: containerData, isLoading } = useGetContainer(containerId);
  const { data: sectionPayments = [] } = useGetContainerExpensePaymentsBySection(containerId);
  const sectionPaymentsMap = Object.fromEntries(
    sectionPayments.map((s: ContainerSectionSummary) => [s.section, s])
  );

  const charges = (containerData as any)?.charges ?? {};
  const container = (containerData as any)?.container;

  const SECTION_LIST: Array<{ key: PaymentSection; title: string }> = [
    { key: "shipping",   title: sn.shipping   ?? BUILT_IN_SECTION_DEFAULTS.shipping },
    { key: "customs",    title: sn.customs    ?? BUILT_IN_SECTION_DEFAULTS.customs },
    { key: "terminal",   title: sn.terminal   ?? BUILT_IN_SECTION_DEFAULTS.terminal },
    { key: "delivery",   title: sn.delivery   ?? BUILT_IN_SECTION_DEFAULTS.delivery },
    { key: "operations", title: sn.operations ?? BUILT_IN_SECTION_DEFAULTS.operations },
  ];

  const { data: recon } = useGetContainerReconciliation(containerId);

  const SECTION_ICONS: Record<PaymentSection, React.ReactNode> = {
    shipping:   <Anchor className="w-3.5 h-3.5" />,
    customs:    <Package className="w-3.5 h-3.5" />,
    terminal:   <Building2 className="w-3.5 h-3.5" />,
    delivery:   <Truck className="w-3.5 h-3.5" />,
    operations: <Settings className="w-3.5 h-3.5" />,
  };

  return (
    <div className="space-y-5">
      {/* Container banner */}
      {container && (
        <div className="flex items-center gap-3 bg-muted/20 border border-border/30 rounded-lg px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold font-mono">{container.containerNumber}</p>
            <p className="text-xs text-muted-foreground">{container.customerName}</p>
            {container.blNumber && (
              <p className="text-[10px] text-muted-foreground/60 font-mono">BL: {container.blNumber}</p>
            )}
          </div>
          <Badge className="text-[10px] capitalize shrink-0">{container.status?.replace(/_/g, " ")}</Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0" onClick={onDeselect}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Sections label */}
      <div className="flex items-center gap-2 px-1">
        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/30 shrink-0">2</span>
        <p className="text-sm font-semibold">Breakdown Sections</p>
        <span className="text-xs text-muted-foreground">— edit charges (syncs to container record) and log money paid out</span>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading container charges…</span>
        </div>
      ) : (
        <Accordion type="single" collapsible className="space-y-2">
          {SECTION_LIST.map(({ key, title }) => (
            <SectionPanel
              key={key}
              containerId={containerId}
              sectionKey={key}
              title={title}
              initialData={charges[key] ?? {}}
              sectionSettings={sn}
              sectionPayment={sectionPaymentsMap[key]}
              banks={banks}
            />
          ))}
        </Accordion>
      )}

      {/* Reconciliation Panel */}
      {recon && (
        <Card className="border-border/40 bg-card/40">
          <CardHeader className="pb-3 border-b border-border/30">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" />
              Budget vs Disbursements Reconciliation
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Budgeted charges vs actual money disbursed per section</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border/30 bg-muted/10">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-muted-foreground font-medium uppercase tracking-wide">Section</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground font-medium uppercase tracking-wide">Budgeted</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground font-medium uppercase tracking-wide">Disbursed</th>
                    <th className="px-4 py-2.5 text-right text-muted-foreground font-medium uppercase tracking-wide">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {recon.sections.map(sec => {
                    const style = SECTION_STYLE[sec.section as PaymentSection];
                    const label = sn[sec.section] ?? PAYMENT_SECTION_LABELS[sec.section as PaymentSection] ?? sec.section;
                    const over = sec.variance > 0;
                    const under = sec.variance < 0;
                    return (
                      <tr key={sec.section} className="hover:bg-muted/5 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={style?.text ?? "text-muted-foreground"}>{SECTION_ICONS[sec.section as PaymentSection]}</span>
                            <span className="font-medium capitalize">{label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{formatCurrency(sec.budgeted)}</td>
                        <td className="px-4 py-2.5 text-right font-mono">{formatCurrency(sec.disbursed)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold">
                          {sec.variance === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className={`flex items-center justify-end gap-1 ${over ? "text-red-400" : "text-emerald-400"}`}>
                              {over ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {over ? "+" : ""}{formatCurrency(sec.variance)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t border-border/40 bg-muted/10">
                  <tr>
                    <td className="px-4 py-2.5 font-semibold">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-muted-foreground">{formatCurrency(recon.totals.budgeted)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{formatCurrency(recon.totals.disbursed)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold">
                      {recon.totals.variance === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={recon.totals.variance > 0 ? "text-red-400" : "text-emerald-400"}>
                          {recon.totals.variance > 0 ? "+" : ""}{formatCurrency(recon.totals.variance)}
                        </span>
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-border/20 flex gap-4 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><TrendingDown className="w-3 h-3 text-emerald-400" /> Under budget (good)</span>
              <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-red-400" /> Over budget</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", { year: "numeric", month: "short", day: "numeric" });
}

export default function ContainerPaymentsPage() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: searchResults = [], isLoading: searchLoading } = useContainerSearch(searchQuery);
  const { data: banks = [] } = useActiveBanks();
  const { data: sectionSettings } = useGetSettings();
  const { data: recentPayments = [] } = useGetRecentContainerExpensePayments(15);

  const sn = (sectionSettings ?? {}) as Record<string, string>;

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Container Payments</h1>
          <p className="text-sm text-muted-foreground">
            Log disbursements per section · charges sync live with Breakdown of Charges
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* ── Left: Container + Sections ──────────────────────────────── */}
        <div className="lg:col-span-2 space-y-5">

          {/* Step 1: Container selector */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">1</span>
                Select Container
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {selectedId ? (
                <p className="text-xs text-muted-foreground italic">Container loaded below ↓</p>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      ref={searchRef}
                      placeholder="Search by container number, BL, or customer…"
                      className="pl-9 h-9"
                      value={searchQuery}
                      onChange={e => { setSearchQuery(e.target.value); setShowSearch(true); }}
                      onFocus={() => setShowSearch(true)}
                      onBlur={() => setTimeout(() => setShowSearch(false), 150)}
                    />
                  </div>
                  {showSearch && searchQuery.trim().length >= 2 && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border/40 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                      {searchLoading ? (
                        <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                        </div>
                      ) : searchResults.length === 0 ? (
                        <div className="py-4 text-center text-sm text-muted-foreground">No containers found</div>
                      ) : (
                        searchResults.map((c: any) => (
                          <button
                            key={c.id}
                            onMouseDown={() => {
                              setSelectedId(c.id);
                              setSearchQuery("");
                              setShowSearch(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/20 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold font-mono">{c.containerNumber}</p>
                                <p className="text-xs text-muted-foreground">{c.customerName}</p>
                                {c.blNumber && <p className="text-[10px] text-muted-foreground/60">BL: {c.blNumber}</p>}
                              </div>
                              {c.status && <Badge className="text-[10px] capitalize shrink-0">{c.status.replace(/_/g, " ")}</Badge>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Container sections (only mounts when a real ID is available) */}
          {selectedId ? (
            <ContainerView
              containerId={selectedId}
              sn={sn}
              banks={banks}
              onDeselect={() => setSelectedId(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted/20 border border-border/30 flex items-center justify-center">
                <ArrowRight className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <p className="text-sm text-muted-foreground">Search and select a container above to begin</p>
              <p className="text-xs text-muted-foreground/60">You'll see all 5 breakdown sections with charge fields and payment forms</p>
            </div>
          )}
        </div>

        {/* ── Right: Recent Payments ──────────────────────────────────── */}
        <div className="space-y-4">
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                Recent Payments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              {recentPayments.length === 0 ? (
                <div className="flex flex-col items-center py-8 gap-2">
                  <CreditCard className="w-8 h-8 text-muted-foreground/20" />
                  <p className="text-xs text-muted-foreground text-center">No payments recorded yet</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                  {recentPayments.map((p: any) => {
                    const sec = p.section as PaymentSection | null;
                    const style = sec ? SECTION_STYLE[sec] : null;
                    return (
                      <div key={p.id} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/10 border border-border/20 hover:bg-muted/20 transition-colors">
                        <div className={`w-7 h-7 rounded-md ${style?.bg ?? "bg-muted/20"} border ${style?.border ?? "border-border/20"} flex items-center justify-center shrink-0 mt-0.5`}>
                          <span className={style?.text ?? "text-muted-foreground"}>
                            {sec && style ? style.icon : <CreditCard className="w-3.5 h-3.5" />}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold font-mono truncate">{p.containerNumber ?? "—"}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{p.customerName ?? "—"}</p>
                              {sec && (
                                <span className={`text-[9px] font-semibold uppercase tracking-wide ${style?.text ?? ""}`}>
                                  {PAYMENT_SECTION_LABELS[sec]}
                                </span>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[11px] font-mono font-bold text-red-400">-{formatCurrency(p.amount)}</p>
                              <p className="text-[9px] text-muted-foreground">{formatDate(p.paidAt)}</p>
                            </div>
                          </div>
                          {p.reference && (
                            <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5 truncate">Ref: {p.reference}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
