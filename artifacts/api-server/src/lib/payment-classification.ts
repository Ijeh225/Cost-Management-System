import { db, paymentSchedulePaymentsTable, paymentSchedulesTable } from "@workspace/db";
import { and, eq, gte, lte, type SQL } from "drizzle-orm";
import { roundMoney } from "./financial-reporting.js";
import { PAYMENT_CLASSIFICATIONS } from "./payment-classification-rules.js";
export { parsePaymentClassification } from "./payment-classification-rules.js";
export const PAYMENT_CLASSIFICATION_POLICY = "Standalone cash payments remain in Bank, Financial Ledger and Cash Flow exactly once. Only reviewed operating expenses reduce management P&L on payment date. Assets, advances, loan principal and other non-expenses are not expenses. Unclassified payments require evidence review; these categories do not create a general ledger or balance sheet.";

export async function loadStandalonePayments(scope: { branchId?: number | null; from?: Date | null; to?: Date | null } = {}) {
  const conditions: SQL[] = [];
  if (scope.branchId != null) conditions.push(eq(paymentSchedulePaymentsTable.branchId, scope.branchId));
  if (scope.from) conditions.push(gte(paymentSchedulePaymentsTable.paidAt, scope.from));
  if (scope.to) conditions.push(lte(paymentSchedulePaymentsTable.paidAt, scope.to));
  return db.select({ payment: paymentSchedulePaymentsTable, vendor: paymentSchedulesTable.vendorBeneficiary,
    description: paymentSchedulesTable.description }).from(paymentSchedulePaymentsTable)
    .innerJoin(paymentSchedulesTable, eq(paymentSchedulePaymentsTable.scheduleId, paymentSchedulesTable.id))
    .where(conditions.length ? and(...conditions) : undefined).orderBy(paymentSchedulePaymentsTable.paidAt, paymentSchedulePaymentsTable.id);
}

export function summarizeStandalonePayments(rows: Awaited<ReturnType<typeof loadStandalonePayments>>) {
  const totals = Object.fromEntries(PAYMENT_CLASSIFICATIONS.map(key => [key, 0])) as Record<typeof PAYMENT_CLASSIFICATIONS[number], number>;
  for (const { payment } of rows) totals[payment.classification as keyof typeof totals] = roundMoney((totals[payment.classification as keyof typeof totals] ?? 0) + Number(payment.amount));
  return { policy: PAYMENT_CLASSIFICATION_POLICY, totals, unclassifiedCount: rows.filter(row => row.payment.classification === "unclassified").length };
}
