import { and, eq, gte, lte } from "drizzle-orm";
import { containersTable, db, dutyPaymentTransactionsTable, reportDeliveryLogsTable, reportSubscriptionsTable } from "@workspace/db";

function due(subscription: { frequency: string; lastSentAt: Date | null }, now: Date) {
  if (!subscription.lastSentAt) return true;
  const elapsed = now.getTime() - subscription.lastSentAt.getTime();
  return subscription.frequency === "weekly" ? elapsed >= 7 * 24 * 60 * 60 * 1000 : elapsed >= 24 * 60 * 60 * 1000;
}

function recipients(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []; } catch { return []; }
}

function html(title: string, subtitle: string, rows: Array<[string, string]>) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#182230"><main style="max-width:720px;margin:auto;background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:28px"><h1 style="margin:0 0 6px;font-size:20px">${title}</h1><p style="margin:0 0 22px;color:#5b6b82">${subtitle}</p><table style="width:100%;border-collapse:collapse">${rows.map(([a,b]) => `<tr><td style="padding:11px 0;border-top:1px solid #e7edf5;color:#5b6b82">${a}</td><td style="padding:11px 0;border-top:1px solid #e7edf5;text-align:right;font-weight:600">${b}</td></tr>`).join("")}</table><p style="margin:24px 0 0;font-size:12px;color:#748399">This is a read-only scheduled report. Review the source records in Cost Management before taking action.</p></main></body></html>`;
}

async function prepareReport(kind: string, branchId: number | null, now: Date) {
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  const scope = branchId === null ? [] : [eq(dutyPaymentTransactionsTable.branchId, branchId)];
  if (kind === "duty_payment_ledger") {
    const rows = await db.select({ amount: dutyPaymentTransactionsTable.amount, paymentMethod: dutyPaymentTransactionsTable.paymentMethod })
      .from(dutyPaymentTransactionsTable)
      .where(and(gte(dutyPaymentTransactionsTable.paidAt, start), lte(dutyPaymentTransactionsTable.paidAt, now), ...scope));
    const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const bank = rows.filter(row => row.paymentMethod === "bank").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    return { title: "Duty Payment Ledger", itemCount: rows.length, html: html("Duty Payment Ledger", "Actual payment entries recorded in the last 24 hours.", [["Transactions", String(rows.length)], ["Actual duty paid", `NGN ${total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`], ["Bank paid", `NGN ${bank.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`], ["Cash paid", `NGN ${(total-bank).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`]]) };
  }
  const containerScope = branchId === null ? undefined : eq(containersTable.branchId, branchId);
  const rows = await db.select({ expectedTransireDate: containersTable.expectedTransireDate, transireReleasedAt: containersTable.transireReleasedAt, expectedDoDate: containersTable.expectedDoDate, doReleasedAt: containersTable.doReleasedAt, expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt, expectedPulloutDate: containersTable.expectedPulloutDate, pulloutReleasedAt: containersTable.pulloutReleasedAt })
    .from(containersTable).where(containerScope);
  const stage = (expected: Date | null, actual: Date | null) => ({ active: !actual && !!expected, released: !!actual, overdue: !actual && !!expected && expected < now });
  const all = rows.flatMap(row => [stage(row.expectedTransireDate, row.transireReleasedAt), stage(row.expectedDoDate, row.doReleasedAt), stage(row.expectedTdoDate, row.tdoReleasedAt), stage(row.expectedPulloutDate, row.pulloutReleasedAt)]);
  return { title: "Workflow Stage Summary", itemCount: all.filter(item => item.active || item.released).length, html: html("Workflow Stage Summary", "Independent department status at the time this report was generated.", [["Tracked stage records", String(all.filter(item => item.active || item.released).length)], ["Active", String(all.filter(item => item.active).length)], ["Released", String(all.filter(item => item.released).length)], ["Overdue", String(all.filter(item => item.overdue).length)]]) };
}

/** Runs on the existing minute scheduler. No report is marked sent unless Resend accepts it. */
export async function runScheduledReportDelivery(): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const now = new Date();
  const subscriptions = await db.select().from(reportSubscriptionsTable).where(eq(reportSubscriptionsTable.isActive, true));
  for (const subscription of subscriptions) {
    if (!due(subscription, now)) continue;
    const to = recipients(subscription.recipients);
    if (!to.length) continue;
    try {
      const report = await prepareReport(subscription.reportKind, subscription.branchId, now);
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_DEFAULT_FROM || "Cost Management <onboarding@resend.dev>", to, subject: `[Cost Management] ${report.title}`, html: report.html }) });
      if (!response.ok) throw new Error(`Resend rejected the report delivery (${response.status}).`);
      await db.transaction(async (tx) => {
        await tx.update(reportSubscriptionsTable).set({ lastSentAt: now, updatedAt: now }).where(eq(reportSubscriptionsTable.id, subscription.id));
        await tx.insert(reportDeliveryLogsTable).values({ subscriptionId: subscription.id, branchId: subscription.branchId, reportKind: subscription.reportKind, recipients: JSON.stringify(to), status: "sent", itemCount: report.itemCount, deliveredAt: now });
      });
    } catch (error) {
      await db.insert(reportDeliveryLogsTable).values({ subscriptionId: subscription.id, branchId: subscription.branchId, reportKind: subscription.reportKind, recipients: JSON.stringify(to), status: "failed", itemCount: 0, error: error instanceof Error ? error.message.slice(0, 1000) : "Unknown delivery error", deliveredAt: now });
      console.error("[scheduled-report] delivery failed", subscription.id, error);
    }
  }
}
