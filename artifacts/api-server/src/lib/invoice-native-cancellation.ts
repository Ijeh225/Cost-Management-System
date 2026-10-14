import { sql, type SQL } from "drizzle-orm";

type Executor = { execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }> };

// Call while holding the invoice row lock; native preparation locks that same source.
export async function hasRetainedInvoiceJournal(tx: Executor, invoiceId: number): Promise<boolean> {
  const schema = await tx.execute(sql`SELECT to_regclass('accounting_journals') AS relation`);
  if (!schema.rows[0]?.relation) return false;
  const result = await tx.execute(sql`SELECT EXISTS (
    SELECT 1 FROM accounting_journals
    WHERE event_key LIKE ${`source:invoice:${invoiceId}:%`} AND status IN ('draft','posted')
  ) AS retained`);
  return result.rows[0]?.retained === true;
}
