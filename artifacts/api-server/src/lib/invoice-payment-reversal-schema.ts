type SqlExecutor = {
  query(query: string): Promise<unknown>;
};

export async function ensureInvoicePaymentReversalSchema(pool: SqlExecutor) {
  await pool.query(`ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'payment'`);
  await pool.query(`ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS reversal_of_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE RESTRICT`);
  await pool.query(`ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS reversal_reason TEXT`);
  await pool.query(`ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_amount_nonzero_check`);
  await pool.query(`ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_amount_nonzero_check CHECK (amount <> 0)`);
  await pool.query(`ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_entry_type_check`);
  await pool.query(`ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_entry_type_check CHECK (entry_type IN ('payment', 'reversal'))`);
  await pool.query(`ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_reversal_link_check`);
  await pool.query(`ALTER TABLE invoice_payments ADD CONSTRAINT invoice_payments_reversal_link_check CHECK ((entry_type = 'payment' AND reversal_of_payment_id IS NULL) OR (entry_type = 'reversal' AND reversal_of_payment_id IS NOT NULL))`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS invoice_payments_one_reversal_idx ON invoice_payments(reversal_of_payment_id) WHERE entry_type = 'reversal'`);
}
