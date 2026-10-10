export async function ensurePaymentClassificationSchema(pool: { query(sql: string): Promise<unknown> }) {
  await pool.query(`ALTER TABLE payment_schedule_payments
    ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'unclassified',
    ADD COLUMN IF NOT EXISTS expense_head TEXT,
    ADD COLUMN IF NOT EXISTS classification_reason TEXT,
    ADD COLUMN IF NOT EXISTS classified_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS classified_at TIMESTAMP,
    ADD COLUMN IF NOT EXISTS classification_version INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='payment_schedule_payments'::regclass AND conname='schedule_payment_classification_check') THEN
      ALTER TABLE payment_schedule_payments ADD CONSTRAINT schedule_payment_classification_check CHECK (
        classification IN ('unclassified','operating_expense','asset','advance','loan_repayment','other_non_expense')
        AND (classification='unclassified' OR (coalesce(length(trim(classification_reason)),0)>0 AND classified_at IS NOT NULL))
        AND (classification<>'operating_expense' OR coalesce(length(trim(expense_head)),0)>0));
    END IF;
  END $$`);
}
