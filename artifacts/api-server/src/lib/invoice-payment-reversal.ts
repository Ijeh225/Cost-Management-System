const money = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** The portion of one payment that created client credit when it was recorded. */
export function getReversibleOverpaymentCredit(invoiceTotal: number | string | null | undefined, otherPaymentTotal: number | string | null | undefined, originalAmount: number | string | null | undefined) {
  const total = Math.max(0, money(invoiceTotal));
  const other = money(otherPaymentTotal);
  const original = Math.max(0, money(originalAmount));
  return Math.max(0, other + original - total) - Math.max(0, other - total);
}
