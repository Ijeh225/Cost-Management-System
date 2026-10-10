import type { PaymentClassificationSummary } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/format";

export function PaymentClassificationNote({ data }: { data?: PaymentClassificationSummary }) {
  if (!data) return null;
  return <div className="space-y-1 text-xs">
    <p>{data.policy}</p>
    {data.unclassifiedCount > 0 && <p className="text-destructive font-medium">Review required: {data.unclassifiedCount} standalone payments ({formatCurrency(data.totals.unclassified)}) are in cash records but excluded from P&amp;L expenses until evidence supports classification. Review in Payment Schedule.</p>}
    {!!data.missingOverheadSourceCount && <p className="text-destructive font-medium">Review required: {data.missingOverheadSourceCount} historical overhead payments have a missing source/category. Cash costs remain included, explicitly unclassified; their original expense head cannot be inferred.</p>}
  </div>;
}
