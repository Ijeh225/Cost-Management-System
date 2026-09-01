export type ContainerCostBasis = "budgeted" | "actual_paid";

export const FINANCIAL_BASIS = {
  accrual: {
    id: "accrual",
    label: "Accrual",
    description: "Issued invoice revenue, excluding VAT and draft invoices.",
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
    summary: `Revenue is ${FINANCIAL_BASIS.accrual.label}; container costs are ${FINANCIAL_BASIS[costBasis].label}; overhead is ${FINANCIAL_BASIS.actual_paid.label}.`,
  };
}
