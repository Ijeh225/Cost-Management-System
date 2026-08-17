export type AccountantControlFinding = {
  code: "schedule_overapproved" | "schedule_overpaid" | "duty_overpaid" | "duplicate_bank_transfer" | "duplicate_overhead_payment" | "self_bank_transfer";
  ids: number[];
};

const amount = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calendarDay = (value: Date | string | null | undefined): string => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

function duplicateGroups<T extends { id: number }>(rows: T[], keyFor: (row: T) => string | null): number[][] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyFor(row);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row.id]);
  }
  return [...groups.values()].filter((ids) => ids.length > 1);
}

/**
 * Deterministic accounting-control prompts. Findings need human review; they
 * are never automatic corrections or allegations of wrongdoing.
 */
export function analyseAccountantControls(input: {
  schedules: Array<{ id: number; amountRequested: number | string | null; amountApproved: number | string | null; amountPaid: number | string | null }>;
  duties: Array<{ containerId: number; duty: number | string | null; dutyPaid: number | string | null }>;
  bankTransfers: Array<{ id: number; branchId: number; fromBankId: number | null; toBankId: number | null; amount: number | string | null; reference: string | null }>;
  overheadPayments: Array<{ id: number; branchId: number; expenseId: number; amount: number | string | null; paymentMethod: string | null; bankId: number | null; paidAt: Date | string | null }>;
}): AccountantControlFinding[] {
  const findings: AccountantControlFinding[] = [];
  for (const schedule of input.schedules) {
    if (amount(schedule.amountApproved) > amount(schedule.amountRequested) + 0.01) findings.push({ code: "schedule_overapproved", ids: [schedule.id] });
    if (amount(schedule.amountPaid) > amount(schedule.amountApproved) + 0.01) findings.push({ code: "schedule_overpaid", ids: [schedule.id] });
  }
  for (const duty of input.duties) {
    if (amount(duty.dutyPaid) > amount(duty.duty) + 0.01) findings.push({ code: "duty_overpaid", ids: [duty.containerId] });
  }
  for (const ids of duplicateGroups(input.bankTransfers, (transfer) => {
    const reference = transfer.reference?.trim().toLowerCase();
    return reference ? `${transfer.branchId}|${reference}|${amount(transfer.amount).toFixed(2)}` : null;
  })) findings.push({ code: "duplicate_bank_transfer", ids });
  for (const ids of duplicateGroups(input.overheadPayments, (payment) => {
    const day = calendarDay(payment.paidAt);
    return day ? `${payment.branchId}|${payment.expenseId}|${amount(payment.amount).toFixed(2)}|${payment.paymentMethod ?? ""}|${payment.bankId ?? ""}|${day}` : null;
  })) findings.push({ code: "duplicate_overhead_payment", ids });
  for (const transfer of input.bankTransfers) {
    if (transfer.fromBankId != null && transfer.fromBankId === transfer.toBankId) findings.push({ code: "self_bank_transfer", ids: [transfer.id] });
  }
  return findings;
}
