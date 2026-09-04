export function normaliseBankReference(reference: unknown): string | null {
  if (typeof reference !== "string") return null;
  const value = reference.trim();
  return value || null;
}

export function hasExistingBankReference(
  transfers: readonly unknown[],
  fundAdditions: readonly unknown[],
): boolean {
  return transfers.length > 0 || fundAdditions.length > 0;
}
