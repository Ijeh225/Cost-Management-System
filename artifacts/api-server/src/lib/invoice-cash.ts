import { sql, type SQLWrapper } from "drizzle-orm";

// Settlement rows reduce receivables but do not receive or refund cash.
export function invoiceCashCondition(columns: { paymentMethod: SQLWrapper; sourceDepositId: SQLWrapper }) {
  return sql`${columns.sourceDepositId} IS NULL AND lower(btrim(${columns.paymentMethod})) NOT IN ('credit', 'credit_note', 'deposit')`;
}

export function settlementAmount(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value);
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && cents > 0 && Number.isSafeInteger(cents)
    && cents <= 999_999_999_999_999 && Math.abs(amount * 100 - cents) < 0.00001 ? cents / 100 : null;
}

export function settlementRequestKey(value: unknown): string | null | false {
  if (value == null) return null;
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : false;
}
