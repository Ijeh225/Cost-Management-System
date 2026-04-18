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

export const WORKFLOW_STAGES = [
  { value: "pending_verification",      label: "Pending Verification",      short: "Pending" },
  { value: "registered",               label: "Registered",                short: "Registered" },
  { value: "documentation",            label: "Documentation",             short: "Docs" },
  { value: "duty_assessment",          label: "Duty Assessment",           short: "Assessment" },
  { value: "duty_payment",             label: "Duty Payment",              short: "Duty Pmt" },
  { value: "transire_processing",      label: "Transire Processing",       short: "Transire" },
  { value: "shipping_terminal_payment",label: "Shipping/Terminal Payment", short: "Shpg/Term" },
  { value: "pull_out",                 label: "Pull-Out",                  short: "Pull-Out" },
  { value: "gate_in",                  label: "Gate-In (Bonded Terminal)", short: "Gate-In" },
  { value: "examination",              label: "Examination",               short: "Exam" },
  { value: "final_release",            label: "Final Release",             short: "Release" },
  { value: "delivery",                 label: "Delivery",                  short: "Delivery" },
  { value: "empty_return",             label: "Empty Return",              short: "Empty Ret." },
  { value: "closed",                   label: "Closed",                    short: "Closed" },
];

export function getNextStage(current: string): string | null {
  const idx = WORKFLOW_STAGES.findIndex(s => s.value === current);
  if (idx === -1 || idx === WORKFLOW_STAGES.length - 1) return null;
  return WORKFLOW_STAGES[idx + 1].value;
}

export function getStageIndex(status: string): number {
  return WORKFLOW_STAGES.findIndex(s => s.value === status);
}

export const STAGE_SECTION: Record<string, string> = {
  shipping_terminal_payment: "shipping",
  examination:               "customs",
  gate_in:                   "terminal",
  delivery:                  "delivery",
};

export function canEditSection(
  sectionKey: string,
  containerStatus: string,
  isAdmin: boolean,
  userSectionPermission: string | null | undefined
): boolean {
  if (isAdmin) return true;
  if (!userSectionPermission) return false;
  const activeSection = STAGE_SECTION[containerStatus];
  if (activeSection !== userSectionPermission) return false;
  if (sectionKey === userSectionPermission) return true;
  if (sectionKey === "operations" && userSectionPermission === "delivery") return true;
  return false;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending_verification:      "bg-slate-500/20 text-slate-300 border-slate-500/50",
    registered:                "bg-slate-400/20 text-slate-300 border-slate-400/50",
    documentation:             "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
    duty_assessment:           "bg-amber-500/20 text-amber-400 border-amber-500/50",
    duty_payment:              "bg-orange-500/20 text-orange-400 border-orange-500/50",
    transire_processing:       "bg-rose-500/20 text-rose-400 border-rose-500/50",
    shipping_terminal_payment: "bg-blue-500/20 text-blue-400 border-blue-500/50",
    pull_out:                  "bg-sky-500/20 text-sky-400 border-sky-500/50",
    gate_in:                   "bg-cyan-500/20 text-cyan-400 border-cyan-500/50",
    examination:               "bg-purple-500/20 text-purple-400 border-purple-500/50",
    final_release:             "bg-violet-500/20 text-violet-400 border-violet-500/50",
    delivery:                  "bg-teal-500/20 text-teal-400 border-teal-500/50",
    empty_return:              "bg-indigo-500/20 text-indigo-400 border-indigo-500/50",
    closed:                    "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
    in_progress:               "bg-blue-500/20 text-blue-400 border-blue-500/50",
  };
  return colors[status] || "bg-slate-800 text-slate-300";
}

export function getStatusLabel(status: string): string {
  const stage = WORKFLOW_STAGES.find(s => s.value === status);
  if (stage) return stage.label;
  return status.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export const PHASE1_STATUSES = WORKFLOW_STAGES;

export const SECTION_LABELS: Record<string, string> = {
  shipping:         "Shipping",
  customs:          "Customs",
  terminal:         "Terminal",
  delivery:         "Delivery",
  operations:       "Operations",
  accounting:       "Accounting",
  management:       "Management",
  container_review: "Full Container Review",
};

export const CHARGE_SECTIONS = ["shipping", "customs", "terminal", "delivery", "operations"] as const;
export type ChargeSection = (typeof CHARGE_SECTIONS)[number];

export type SectionPermLevel = "no_access" | "view" | "edit";

export function parseSectionPermissions(raw: string | null | undefined): Record<string, SectionPermLevel> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function getUserSectionPerm(
  sectionKey: string,
  sectionPermissions: string | null | undefined,
  legacySectionPermission: string | null | undefined
): SectionPermLevel {
  const perms = parseSectionPermissions(sectionPermissions);
  if (Object.keys(perms).length > 0) return (perms[sectionKey] as SectionPermLevel) ?? "no_access";
  if (legacySectionPermission === sectionKey) return "edit";
  return "no_access";
}

export function canEditSectionGranular(
  _sectionKey: string,
  _isAdmin: boolean,
  _sectionPermissions: string | null | undefined,
  _legacySectionPermission: string | null | undefined
): boolean {
  return true;
}

export function getApprovalStatusColor(status: string): string {
  switch (status) {
    case "draft":     return "bg-slate-500/20 text-slate-400 border-slate-500/50";
    case "submitted": return "bg-amber-500/20 text-amber-400 border-amber-500/50";
    case "approved":  return "bg-emerald-500/20 text-emerald-400 border-emerald-500/50";
    case "rejected":  return "bg-red-500/20 text-red-400 border-red-500/50";
    default:          return "bg-slate-500/20 text-slate-400 border-slate-500/50";
  }
}

export function getApprovalStatusLabel(status: string): string {
  switch (status) {
    case "draft":     return "Draft";
    case "submitted": return "Pending Review";
    case "approved":  return "Approved";
    case "rejected":  return "Rejected";
    default:          return status;
  }
}
