// Match invoice creation: a configured client rate applies to every container,
// including an explicit zero rate. Only an unset rate falls back to the job.
export function invoiceItemAmount(clearingCharges: string | number | null | undefined, agreedRate: number | null | undefined): number {
  return agreedRate != null ? agreedRate : Number(clearingCharges ?? 0);
}

export function invoicePreview(amounts: number[], vatRate: number) {
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  const vatAmount = subtotal * vatRate / 100;
  return { subtotal, vatAmount, total: subtotal + vatAmount };
}
