export function formatCurrency(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "₦0.00";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return "0";
  return new Intl.NumberFormat("en-US").format(amount);
}

const IN_PROGRESS_STAGES = new Set([
  "documentation_review",
  "shipping_entry",
  "customs_entry",
  "terminal_entry",
  "delivery_entry",
  "accounting_review",
  "management_approval",
  "in_progress",
]);

export function normalizeStatus(status: string): string {
  if (IN_PROGRESS_STAGES.has(status)) return "in_progress";
  return status;
}

export function getStatusColor(status: string): string {
  const normalized = normalizeStatus(status);
  const colors: Record<string, string> = {
    new_upload:  "bg-slate-500/20 text-slate-300 border-slate-500/50",
    in_progress: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    completed:   "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
    closed:      "bg-slate-800 text-slate-400 border-slate-700",
  };
  return colors[normalized] || "bg-slate-800 text-slate-300";
}

export function getStatusLabel(status: string): string {
  const normalized = normalizeStatus(status);
  const labels: Record<string, string> = {
    new_upload:  "New Upload",
    in_progress: "In Progress",
    completed:   "Completed",
    closed:      "Closed",
  };
  return labels[normalized] || status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export const PHASE1_STATUSES = [
  { value: "new_upload",  label: "New Upload" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed",   label: "Completed" },
  { value: "closed",      label: "Closed" },
];
