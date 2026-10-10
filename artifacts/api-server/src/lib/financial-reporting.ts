export type ContainerCostBasis = "budgeted" | "actual_paid";

export const roundMoney = (amount: number) => Math.round(amount * 100) / 100;

export const financialDateKey = (date: Date) => new Date(date.getTime() + 3600000).toISOString().slice(0, 10);

export type AgingBucket = "current" | "days1to30" | "days31to60" | "days61to90" | "days90plus";

/** Due dates are calendar days, not elapsed 24-hour timestamps. Day 90 stays in 61-90. */
export function invoiceAging(dueDate: string | null, now = new Date()): { daysOverdue: number; bucket: AgingBucket } {
  const daysOverdue = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    ? Math.max(0, Math.round((Date.parse(financialDateKey(now)) - Date.parse(dueDate)) / 86400000)) : 0;
  const bucket = daysOverdue > 90 ? "days90plus" : daysOverdue > 60 ? "days61to90"
    : daysOverdue > 30 ? "days31to60" : daysOverdue > 0 ? "days1to30" : "current";
  return { daysOverdue, bucket };
}

/** Reports use Nigeria's business calendar, independently of server timezone. */
export function financialDateBoundary(value: string, end = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(NaN);
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}+01:00`);
  return !Number.isNaN(date.getTime()) && financialDateKey(date) === value ? date : new Date(NaN);
}

export function creditNoteSplit(amount: number, invoiceTotal: number, invoiceVat: number, priorAmount = 0) {
  const cents = (value: number) => BigInt(Math.round(value * 100));
  const total = cents(invoiceTotal);
  const vat = cents(invoiceVat);
  const proportionalVat = (gross: number) => total > 0n
    ? (cents(gross) * vat + total / 2n) / total : 0n;
  // Cumulative rounding makes several notes equal one full-invoice adjustment.
  const vatAmount = Number(proportionalVat(priorAmount + amount) - proportionalVat(priorAmount)) / 100;
  return { amount, vatAmount, netAmount: roundMoney(amount - vatAmount) };
}

export const FINANCIAL_BASIS = {
  accrual: {
    id: "accrual",
    label: "Accrual",
    description: "Issued invoice revenue excluding VAT, drafts and cancellations, less credit-note net reductions on note date.",
  },
  budgeted: {
    id: "budgeted",
    label: "Budgeted",
    description: "Configured charge amounts. These are planned costs, not proof of payment.",
  },
  actual_paid: {
    id: "actual_paid",
    label: "Actual Paid",
    description: "Immutable dated payment records actually posted through the system.",
  },
} as const;

/** Accept the legacy URL value while exposing one clear public vocabulary. */
export function normalizeContainerCostBasis(value: string | undefined): ContainerCostBasis {
  return value === "disbursements" || value === "actual_paid" ? "actual_paid" : "budgeted";
}

export function profitLossBasis(costBasis: ContainerCostBasis) {
  return {
    revenue: FINANCIAL_BASIS.accrual,
    containerCosts: FINANCIAL_BASIS[costBasis],
    overheads: FINANCIAL_BASIS.actual_paid,
    summary: `Revenue is ${FINANCIAL_BASIS.accrual.label}, net of dated credit notes; container costs are ${FINANCIAL_BASIS[costBasis].label}; overhead is ${FINANCIAL_BASIS.actual_paid.label}. Audited bad debts are separate non-cash losses on write-off date, not bank payments.`,
  };
}
