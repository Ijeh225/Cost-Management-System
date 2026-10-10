import { useState } from "react";
import { useClassifySchedulePayment, useGetPaymentAccountingReview, type PaymentClassificationBody, type PaymentClassification, type StandalonePayment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/format";
import { BranchChip } from "@/components/layout/branch-chip";

export const CLASSIFICATION_LABELS: Record<PaymentClassification, string> = {
  unclassified: "Unclassified - review required", operating_expense: "Operating expense", asset: "Asset purchase",
  advance: "Advance / prepayment", loan_repayment: "Loan principal repayment", other_non_expense: "Other non-expense",
};

export function ClassificationFields({ value, onChange, prefix, requireReason = false }: { value: PaymentClassificationBody; onChange: (value: PaymentClassificationBody) => void; prefix: string; requireReason?: boolean }) {
  return <div className="space-y-3 rounded-lg border p-3">
    <Label htmlFor={`${prefix}-class`}>Accounting classification</Label>
    <select id={`${prefix}-class`} className="w-full rounded-md border bg-background p-2 text-sm" value={value.classification}
      onChange={event => onChange({ ...value, classification: event.target.value as PaymentClassification })}>
      {Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    {value.classification === "operating_expense" && <><Label htmlFor={`${prefix}-head`}>Expense head</Label>
      <Input id={`${prefix}-head`} maxLength={120} required value={value.expenseHead ?? ""} onChange={event => onChange({ ...value, expenseHead: event.target.value })} /></>}
    <Label htmlFor={`${prefix}-reason`}>Supporting evidence / review reason</Label>
    <Textarea id={`${prefix}-reason`} maxLength={2000} required={requireReason || value.classification !== "unclassified"} value={value.classificationReason ?? ""}
      onChange={event => onChange({ ...value, classificationReason: event.target.value })} placeholder="State the receipt, agreement or other evidence. Do not infer a category from the vendor name alone." />
    <p className="text-xs text-muted-foreground">Cash is recorded once in every category. Only reviewed operating expenses reduce P&amp;L. Unknown payments stay unclassified, not automatically expenses.</p>
  </div>;
}

export function AccountingReview({ canReview, onOpenSchedule }: { canReview: boolean; onOpenSchedule: (id: number) => void }) {
  const { data, isLoading, isFetching, error, refetch } = useGetPaymentAccountingReview();
  const classify = useClassifySchedulePayment();
  const { toast } = useToast();
  const [filter, setFilter] = useState("unclassified");
  const [selected, setSelected] = useState<StandalonePayment | null>(null);
  const [value, setValue] = useState<PaymentClassificationBody>({ classification: "unclassified" });
  const rows = data?.payments.filter(payment => filter === "all" || payment.classification === filter) ?? [];
  return <Card><CardHeader><CardTitle className="text-base">Standalone Payment Accounting Review</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{data?.policy ?? "Review payment evidence without creating a second payment or ledger entry."}</p>
      {data && <p className="text-sm">Awaiting classification: <b>{data.unclassifiedCount}</b> payments, <b>{formatCurrency(data.totals.unclassified)}</b>. These payments are in cash reports but not P&amp;L expenses.</p>}
      <div className="flex flex-wrap items-center gap-3"><Label htmlFor="payment-review-filter">Category</Label>
        <select id="payment-review-filter" className="rounded-md border bg-background p-2 text-sm" value={filter} onChange={event => setFilter(event.target.value)}>
          <option value="all">All classifications</option>{Object.entries(CLASSIFICATION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select><Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>{isFetching ? "Refreshing..." : "Refresh review"}</Button></div>
      {error ? <p role="alert" className="text-destructive">{error.message}</p> : isLoading ? <p role="status">Loading payment evidence...</p> : <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Payment / date</th><th className="p-2">Source evidence</th><th className="p-2">Amount</th><th className="p-2">Classification / review</th><th className="p-2">Action</th></tr></thead>
          <tbody>{rows.map(payment => <tr key={payment.id} className="border-b align-top"><td className="p-2">#{payment.id}<p className="text-xs">{new Date(payment.paidAt).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" })}</p><BranchChip branchId={payment.branchId} /></td>
            <td className="p-2 max-w-xs break-words"><b>{payment.vendor}</b><p>{payment.description}</p><p className="text-xs text-muted-foreground">{payment.paymentMethod} / bank #{payment.bankId ?? "none"} / {payment.reference ?? "no reference"}</p><p className="text-xs">{payment.notes}</p></td>
            <td className="p-2 whitespace-nowrap">{formatCurrency(payment.amount)}</td><td className="p-2 max-w-xs break-words">{CLASSIFICATION_LABELS[payment.classification]}<p>{payment.expenseHead}</p><p className="text-xs">{payment.classificationReason ?? "No documented classification evidence"}</p>
              {payment.classifiedAt && <p className="text-xs text-muted-foreground">Reviewed by user #{payment.classifiedBy ?? "removed"}, {new Date(payment.classifiedAt).toLocaleString()} (v{payment.classificationVersion})</p>}</td>
            <td className="p-2 space-y-2"><Button size="sm" variant="outline" onClick={() => onOpenSchedule(payment.scheduleId)}>Source / timeline</Button>{canReview && <Button size="sm" onClick={() => { setSelected(payment); setValue({ classification: payment.classification, expenseHead: payment.expenseHead, classificationReason: payment.classificationReason }); }}>Review</Button>}</td></tr>)}</tbody></table>
        {!rows.length && <p className="py-4 text-muted-foreground">No payments in this classification.</p>}</div>}
    </CardContent>
    <Dialog open={selected !== null} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent><DialogHeader><DialogTitle>Review Payment #{selected?.id}</DialogTitle><DialogDescription>Classify existing evidence. Cash amount, date, bank and payment history cannot be changed here.</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!selected) return; classify.mutate({ payment: selected, data: value }, {
        onSuccess: () => { setSelected(null); toast({ title: "Classification saved with audit history" }); },
        onError: err => { toast({ title: "Review not saved", description: err.message, variant: "destructive" }); if (err.message.includes("Reload")) { refetch(); setSelected(null); } },
      }); }}><ClassificationFields prefix="review" requireReason value={value} onChange={setValue} /><Button disabled={classify.isPending} type="submit">{classify.isPending ? "Saving..." : "Save review"}</Button></form>
    </DialogContent></Dialog>
  </Card>;
}
