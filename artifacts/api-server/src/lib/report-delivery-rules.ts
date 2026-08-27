export const SCHEDULED_REPORT_KINDS = new Set(["duty_payment_ledger", "workflow_stage_summary"]);
export const SCHEDULED_REPORT_FREQUENCIES = new Set(["daily", "weekly"]);

const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeReportRecipients(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const recipients = [...new Set(value.map(item => String(item).trim().toLowerCase()).filter(Boolean))];
  return recipients.length > 0 && recipients.length <= 20 && recipients.every(item => emailAddress.test(item)) ? recipients : null;
}

export function isReportDeliveryDue(frequency: string, lastSentAt: Date | null, now: Date): boolean {
  if (!lastSentAt) return true;
  const elapsed = now.getTime() - lastSentAt.getTime();
  return frequency === "weekly" ? elapsed >= 7 * 24 * 60 * 60 * 1000 : elapsed >= 24 * 60 * 60 * 1000;
}
