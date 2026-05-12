import { useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  useBatchCreateContainerExpensePayment,
  useGetRecentContainerExpensePayments,
  useGetContainerExpensePaymentsBySection,
  useContainerSearch,
  useActiveBanks,
  type BatchContainerExpensePaymentItem,
  type ContainerSearchResult,
  type BankOption,
  type PaymentSection,
  PAYMENT_SECTION_LABELS,
  ALL_PAYMENT_SECTIONS,
} from "@workspace/api-client-react";
import { useAuth } from "@/components/layout/auth-provider";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, Search, X, Loader2, CheckCircle2, Banknote,
  Building2, Receipt, ChevronDown, ChevronUp, ArrowRight,
  Anchor, Package, Truck, Activity, Settings,
} from "lucide-react";

type SelectedContainer = ContainerSearchResult & { amount: string };

const SECTION_ICONS: Record<PaymentSection, React.ReactNode> = {
  shipping:   <Anchor className="w-5 h-5" />,
  customs:    <Package className="w-5 h-5" />,
  terminal:   <Building2 className="w-5 h-5" />,
  delivery:   <Truck className="w-5 h-5" />,
  operations: <Settings className="w-5 h-5" />,
};

const SECTION_COLORS: Record<PaymentSection, { bg: string; border: string; text: string; badge: string }> = {
  shipping:   { bg: "bg-blue-500/10",   border: "border-blue-500/40",   text: "text-blue-400",   badge: "bg-blue-500/20 text-blue-300" },
  customs:    { bg: "bg-purple-500/10", border: "border-purple-500/40", text: "text-purple-400", badge: "bg-purple-500/20 text-purple-300" },
  terminal:   { bg: "bg-orange-500/10", border: "border-orange-500/40", text: "text-orange-400", badge: "bg-orange-500/20 text-orange-300" },
  delivery:   { bg: "bg-green-500/10",  border: "border-green-500/40",  text: "text-green-400",  badge: "bg-green-500/20 text-green-300" },
  operations: { bg: "bg-pink-500/10",   border: "border-pink-500/40",   text: "text-pink-400",   badge: "bg-pink-500/20 text-pink-300" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NG", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function ContainerPaymentsPage() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAuth();
  const { toast } = useToast();

  const { data: banks = [] } = useActiveBanks();
  const { data: recentPayments = [], refetch: refetchRecent } = useGetRecentContainerExpensePayments(20);

  const batchPay = useBatchCreateContainerExpensePayment();

  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [selected, setSelected] = useState<SelectedContainer[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: searchResults = [], isLoading: searchLoading } = useContainerSearch(searchQuery);

  const singleContainerId = selected.length === 1 ? selected[0].id : null;
  const { data: sectionData = [], isLoading: sectionLoading } = useGetContainerExpensePaymentsBySection(singleContainerId);
  const sectionMap = Object.fromEntries(sectionData.map(s => [s.section, s]));

  const [selectedSection, setSelectedSection] = useState<PaymentSection | null>(null);
  const [bankId, setBankId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("bank");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [showRecent, setShowRecent] = useState(true);

  const totalAmount = useMemo(
    () => selected.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0),
    [selected]
  );

  if (!isAdmin) {
    setLocation("/");
    return null;
  }

  function addContainer(c: ContainerSearchResult) {
    if (selected.find(s => s.id === c.id)) return;
    setSelected(prev => [...prev, { ...c, amount: "" }]);
    setSearchQuery("");
    setShowSearch(false);
    setSelectedSection(null);
  }

  function removeContainer(id: number) {
    setSelected(prev => prev.filter(s => s.id !== id));
    setSelectedSection(null);
  }

  function updateAmount(id: number, val: string) {
    setSelected(prev => prev.map(s => s.id === id ? { ...s, amount: val } : s));
  }

  function resetForm() {
    setSelected([]);
    setSelectedSection(null);
    setBankId("");
    setPaymentMethod("bank");
    setReference("");
    setNarration("");
    setPaidAt(new Date().toISOString().slice(0, 10));
  }

  function handleSelectSection(sec: PaymentSection) {
    setSelectedSection(sec);
    if (singleContainerId && sectionMap[sec]) {
      const outstanding = sectionMap[sec].outstanding;
      if (outstanding > 0) {
        setSelected(prev => prev.map(s => s.id === singleContainerId
          ? { ...s, amount: String(outstanding) }
          : s
        ));
      }
    }
  }

  async function handleSubmit() {
    if (selected.length === 0) { toast({ title: "No containers selected", variant: "destructive" }); return; }
    if (!selectedSection) { toast({ title: "Select a breakdown section", variant: "destructive" }); return; }
    if (paymentMethod === "bank" && !bankId) { toast({ title: "Select a bank account", variant: "destructive" }); return; }

    const items: BatchContainerExpensePaymentItem[] = [];
    for (const c of selected) {
      const amt = parseFloat(c.amount);
      if (!c.amount || isNaN(amt) || amt <= 0) {
        toast({ title: `Enter a valid amount for container ${c.containerNumber}`, variant: "destructive" }); return;
      }
      items.push({ containerId: c.id, amount: amt });
    }

    try {
      await batchPay.mutateAsync({
        items,
        section: selectedSection,
        bankId: paymentMethod === "bank" ? Number(bankId) : null,
        paymentMethod,
        reference: reference.trim() || undefined,
        narration: narration.trim() || undefined,
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
      });
      toast({
        title: "Payment recorded successfully",
        description: `${items.length} container(s) — ${PAYMENT_SECTION_LABELS[selectedSection]} section`,
      });
      resetForm();
      refetchRecent();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Server error";
      toast({ title: "Payment failed", description: msg, variant: "destructive" });
    }
  }

  const filteredResults = searchResults.filter(r => !selected.find(s => s.id === r.id));

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Container Payments</h1>
          <p className="text-sm text-muted-foreground">Record payments against breakdown sections — automatically synchronized with charges</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        {/* Left: Payment Form */}
        <div className="lg:col-span-3 space-y-5">

          {/* Step 1: Container Selection */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">1</span>
                Select Container(s)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
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
                  <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-card border border-border/40 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {searchLoading ? (
                      <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                      </div>
                    ) : filteredResults.length === 0 ? (
                      <div className="py-4 text-center text-sm text-muted-foreground">No containers found</div>
                    ) : (
                      filteredResults.map(c => (
                        <button
                          key={c.id}
                          onMouseDown={() => addContainer(c)}
                          className="w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border/20 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold font-mono">{c.containerNumber}</p>
                              <p className="text-xs text-muted-foreground">{c.customerName}</p>
                              {c.blNumber && <p className="text-[10px] text-muted-foreground">BL: {c.blNumber}</p>}
                            </div>
                            {c.status && (
                              <Badge className="text-[10px] shrink-0 capitalize">{c.status.replace(/_/g, " ")}</Badge>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {selected.length > 0 && (
                <div className="space-y-2 mt-2">
                  {selected.map(c => (
                    <div key={c.id} className="flex items-center gap-3 bg-muted/20 border border-border/30 rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold font-mono">{c.containerNumber}</p>
                        <p className="text-xs text-muted-foreground truncate">{c.customerName}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-bold">₦</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={c.amount}
                            onChange={e => updateAmount(c.id, e.target.value)}
                            className="w-36 h-8 text-sm pl-7 font-mono"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => removeContainer(c.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {selected.length > 0 && (
                    <div className="flex justify-end items-center gap-2 pt-1 pr-2">
                      <span className="text-xs text-muted-foreground">Total debit:</span>
                      <span className="font-mono font-bold text-sm">{formatCurrency(totalAmount)}</span>
                    </div>
                  )}
                </div>
              )}

              {selected.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Search and select one or more containers above
                </p>
              )}
            </CardContent>
          </Card>

          {/* Step 2: Breakdown Section */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">2</span>
                Select Breakdown Section
                {selected.length === 0 && (
                  <span className="text-xs text-muted-foreground font-normal ml-1">— select a container first</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {selected.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                  <ArrowRight className="w-6 h-6 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Container selection required</p>
                </div>
              ) : sectionLoading && singleContainerId ? (
                <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading breakdown…
                </div>
              ) : (
                <div className="space-y-2">
                  {singleContainerId && sectionData.length > 0 && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Showing live charged / paid / outstanding for <span className="font-semibold text-foreground">{selected[0].containerNumber}</span>
                    </p>
                  )}
                  {ALL_PAYMENT_SECTIONS.map(sec => {
                    const colors = SECTION_COLORS[sec];
                    const summary = sectionMap[sec];
                    const isSelected = selectedSection === sec;

                    return (
                      <button
                        key={sec}
                        onClick={() => handleSelectSection(sec)}
                        className={`w-full text-left rounded-lg border p-3 transition-all ${
                          isSelected
                            ? `${colors.bg} ${colors.border} ring-1 ${colors.border}`
                            : "border-border/30 bg-muted/10 hover:bg-muted/20"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg ${isSelected ? colors.bg : "bg-muted/20"} ${isSelected ? colors.border : "border-border/20"} border flex items-center justify-center shrink-0 transition-colors`}>
                            <span className={isSelected ? colors.text : "text-muted-foreground"}>
                              {SECTION_ICONS[sec]}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold ${isSelected ? colors.text : "text-foreground"}`}>
                                {PAYMENT_SECTION_LABELS[sec]}
                              </p>
                              {isSelected && (
                                <CheckCircle2 className={`w-3.5 h-3.5 ${colors.text}`} />
                              )}
                            </div>
                            {summary && singleContainerId ? (
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground">
                                  Charged: <span className="font-mono font-semibold text-foreground">{formatCurrency(summary.charged)}</span>
                                </span>
                                {summary.paid > 0 && (
                                  <span className="text-[10px] text-muted-foreground">
                                    Paid: <span className="font-mono font-semibold text-green-400">{formatCurrency(summary.paid)}</span>
                                  </span>
                                )}
                                {summary.outstanding > 0 ? (
                                  <span className="text-[10px] text-muted-foreground">
                                    Outstanding: <span className="font-mono font-semibold text-amber-400">{formatCurrency(summary.outstanding)}</span>
                                  </span>
                                ) : summary.charged > 0 ? (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${colors.badge}`}>Fully Paid</span>
                                ) : null}
                              </div>
                            ) : (
                              <p className="text-[10px] text-muted-foreground mt-0.5">Click to pay against {PAYMENT_SECTION_LABELS[sec]}</p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step 3: Payment Details */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3 border-b border-border/30">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center border border-primary/30">3</span>
                Payment Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {/* Payment Method */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Payment Method *</Label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaymentMethod("bank")}
                    className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border text-sm font-medium transition-all ${
                      paymentMethod === "bank"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Building2 className="w-4 h-4" /> Bank Transfer
                  </button>
                  <button
                    onClick={() => setPaymentMethod("cash")}
                    className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-lg border text-sm font-medium transition-all ${
                      paymentMethod === "cash"
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    <Banknote className="w-4 h-4" /> Cash
                  </button>
                </div>
              </div>

              {/* Bank Account */}
              {paymentMethod === "bank" && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Bank Account *</Label>
                  <Select value={bankId} onValueChange={setBankId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select bank account…" />
                    </SelectTrigger>
                    <SelectContent>
                      {banks.filter((b: BankOption) => b.isActive).map((b: BankOption) => (
                        <SelectItem key={b.id} value={String(b.id)}>
                          <div className="flex flex-col">
                            <span>{b.name}</span>
                            {b.accountNumber && (
                              <span className="text-xs text-muted-foreground font-mono">{b.accountNumber}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Reference + Date */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Payment Reference</Label>
                  <Input
                    placeholder="e.g. TRF/2024/001"
                    value={reference}
                    onChange={e => setReference(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Payment Date *</Label>
                  <Input
                    type="date"
                    value={paidAt}
                    onChange={e => setPaidAt(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>

              {/* Narration */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Narration / Description</Label>
                <Textarea
                  placeholder="Additional notes about this payment…"
                  value={narration}
                  onChange={e => setNarration(e.target.value)}
                  className="resize-none text-sm"
                  rows={2}
                />
              </div>

              {/* Summary */}
              {selected.length > 0 && selectedSection && (
                <div className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-1.5">
                  <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">Payment Summary</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Containers</span>
                    <span className="font-semibold">{selected.length}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Section</span>
                    <span className={`font-semibold ${SECTION_COLORS[selectedSection].text}`}>
                      {PAYMENT_SECTION_LABELS[selectedSection]}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Debit</span>
                    <span className="font-mono font-bold text-base">{formatCurrency(totalAmount)}</span>
                  </div>
                  {paymentMethod === "bank" && bankId && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">From</span>
                      <span className="font-semibold">{banks.find((b: BankOption) => String(b.id) === bankId)?.name ?? "—"}</span>
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full h-10 gap-2 font-semibold"
                onClick={handleSubmit}
                disabled={batchPay.isPending || selected.length === 0 || !selectedSection}
              >
                {batchPay.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : <><CheckCircle2 className="w-4 h-4" /> Record Payment</>
                }
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Stats + Recent */}
        <div className="lg:col-span-2 space-y-5">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Payments</p>
                <p className="text-2xl font-bold font-mono mt-1">{recentPayments.length}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Last 20 records</p>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-card/40">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Total Value</p>
                <p className="text-lg font-bold font-mono mt-1 leading-tight">
                  {formatCurrency(recentPayments.reduce((s, p) => s + p.amount, 0))}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Last 20 records</p>
              </CardContent>
            </Card>
          </div>

          {/* Recent Payments */}
          <Card className="border-border/40 bg-card/40">
            <CardHeader className="pb-3 border-b border-border/30">
              <button
                className="flex items-center justify-between w-full"
                onClick={() => setShowRecent(v => !v)}
              >
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" /> Recent Payments
                </CardTitle>
                {showRecent ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            {showRecent && (
              <CardContent className="p-0">
                {recentPayments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <CreditCard className="w-8 h-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">No payments recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/20 max-h-[500px] overflow-y-auto">
                    {recentPayments.map(p => {
                      const sec = p.section as PaymentSection | null;
                      const secColors = sec ? SECTION_COLORS[sec] : null;
                      return (
                        <div key={p.id} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-semibold text-foreground">
                                  {p.containerNumber}
                                </span>
                                {sec && secColors ? (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${secColors.badge}`}>
                                    {PAYMENT_SECTION_LABELS[sec]}
                                  </span>
                                ) : (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30">
                                    {p.categoryName}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">{p.customerName}</p>
                              {p.narration && (
                                <p className="text-[10px] text-muted-foreground italic truncate">{p.narration}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-bold text-sm text-red-400">-{formatCurrency(p.amount)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {p.paymentMethod === "bank" ? (p.bankName ?? "Bank") : "Cash"}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            {p.reference && (
                              <span className="text-[10px] font-mono text-muted-foreground">Ref: {p.reference}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">{formatDate(p.paidAt)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
