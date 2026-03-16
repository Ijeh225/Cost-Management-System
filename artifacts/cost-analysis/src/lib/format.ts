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

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    new_upload: "bg-slate-500 text-white",
    documentation_review: "bg-yellow-500/20 text-yellow-500 border-yellow-500/50",
    shipping_entry: "bg-blue-500/20 text-blue-500 border-blue-500/50",
    customs_entry: "bg-purple-500/20 text-purple-500 border-purple-500/50",
    terminal_entry: "bg-orange-500/20 text-orange-500 border-orange-500/50",
    delivery_entry: "bg-cyan-500/20 text-cyan-500 border-cyan-500/50",
    accounting_review: "bg-amber-500/20 text-amber-500 border-amber-500/50",
    management_approval: "bg-indigo-500/20 text-indigo-400 border-indigo-500/50",
    completed: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
    closed: "bg-slate-800 text-slate-400 border-slate-700",
  };
  return colors[status] || "bg-slate-800 text-slate-300";
}

export function getStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
