export type InvoiceLifecycleStatus =
  | "draft"
  | "sent"
  | "partial"
  | "paid"
  | "overdue"
  | "cancelled"
  | "written_off";

type InvoiceStatusInput = {
  status: string;
  total: number;
  totalPaid: number;
  dueDate?: string | Date | null;
  now?: Date;
};

const TERMINAL_STATUSES = new Set(["cancelled", "written_off"]);

function isPastDue(dueDate: string | Date | null | undefined, now: Date) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  due.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return due < today;
}

/**
 * Keeps the public status tied to facts. Paid and partial come from recorded
 * payments; overdue comes from a remaining balance after the due date.
 */
export function getEffectiveInvoiceStatus({
  status,
  total,
  totalPaid,
  dueDate,
  now = new Date(),
}: InvoiceStatusInput): InvoiceLifecycleStatus {
  if (TERMINAL_STATUSES.has(status)) return status as InvoiceLifecycleStatus;
  if (status === "draft") return "draft";

  const safeTotal = Math.max(0, total || 0);
  const safePaid = Math.max(0, totalPaid || 0);
  if (safePaid >= safeTotal) return "paid";
  if (isPastDue(dueDate, now)) return "overdue";
  if (safePaid > 0) return "partial";
  return "sent";
}

export function isInvoiceEditable(status: string) {
  return status === "draft";
}

export function isInvoiceCollectable(status: string) {
  return !["draft", "cancelled", "written_off"].includes(status);
}

/** Financial summaries exclude audit-only invoice lifecycle states. */
export function isInvoiceFinanciallyActive(status: string) {
  return isInvoiceCollectable(status);
}
