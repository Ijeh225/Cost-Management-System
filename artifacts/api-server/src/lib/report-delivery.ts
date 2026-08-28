import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { containersTable, db, dutyPaymentTransactionsTable, reportDeliveryLogsTable, reportSubscriptionsTable } from "@workspace/db";
import { isReportDeliveryDue } from "./report-delivery-rules.js";

function recipients(value: string): string[] {
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []; } catch { return []; }
}

function storedDate(value: unknown, endOfDay = false): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function filters(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { from: null, to: null };
    const from = storedDate(parsed.from);
    const to = storedDate(parsed.to, true);
    return from && to && from > to ? { from: null, to: null } : { from, to };
  } catch {
    return { from: null, to: null };
  }
}

function html(title: string, subtitle: string, rows: Array<[string, string]>) {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#182230"><main style="max-width:720px;margin:auto;background:#fff;border:1px solid #dbe3ef;border-radius:12px;padding:28px"><h1 style="margin:0 0 6px;font-size:20px">${title}</h1><p style="margin:0 0 22px;color:#5b6b82">${subtitle}</p><table style="width:100%;border-collapse:collapse">${rows.map(([a,b]) => `<tr><td style="padding:11px 0;border-top:1px solid #e7edf5;color:#5b6b82">${a}</td><td style="padding:11px 0;border-top:1px solid #e7edf5;text-align:right;font-weight:600">${b}</td></tr>`).join("")}</table><p style="margin:24px 0 0;font-size:12px;color:#748399">This is a read-only scheduled report. Review the source records in Cost Management before taking action.</p></main></body></html>`;
}

async function prepareReport(kind: string, branchId: number | null, now: Date, filterValue: string) {
  const savedFilters = filters(filterValue);
  const start = savedFilters.from ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = savedFilters.to ?? now;
  const scope = branchId === null ? [] : [eq(dutyPaymentTransactionsTable.branchId, branchId)];
  if (kind === "duty_payment_ledger") {
    const rows = await db.select({ amount: dutyPaymentTransactionsTable.amount, paymentMethod: dutyPaymentTransactionsTable.paymentMethod })
      .from(dutyPaymentTransactionsTable)
      .where(and(gte(dutyPaymentTransactionsTable.paidAt, start), lte(dutyPaymentTransactionsTable.paidAt, end), ...scope));
    const total = rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const bank = rows.filter(row => row.paymentMethod === "bank").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const period = savedFilters.from || savedFilters.to
      ? `Actual payment entries from ${start.toLocaleDateString("en-NG")} to ${end.toLocaleDateString("en-NG")}.`
      : "Actual payment entries recorded in the last 24 hours.";
    return { title: "Duty Payment Ledger", itemCount: rows.length, html: html("Duty Payment Ledger", period, [["Transactions", String(rows.length)], ["Actual duty paid", `NGN ${total.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`], ["Bank paid", `NGN ${bank.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`], ["Cash paid", `NGN ${(total-bank).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`]]) };
  }
  const containerScope = branchId === null ? undefined : eq(containersTable.branchId, branchId);
  const rows = await db.select({ expectedTransireDate: containersTable.expectedTransireDate, transireReleasedAt: containersTable.transireReleasedAt, expectedDoDate: containersTable.expectedDoDate, doReleasedAt: containersTable.doReleasedAt, expectedTdoDate: containersTable.expectedTdoDate, tdoReleasedAt: containersTable.tdoReleasedAt, expectedPulloutDate: containersTable.expectedPulloutDate, pulloutReleasedAt: containersTable.pulloutReleasedAt })
    .from(containersTable).where(containerScope);
  const stage = (expected: Date | null, actual: Date | null) => ({ active: !actual && !!expected, released: !!actual, overdue: !actual && !!expected && expected < now });
  const all = rows.flatMap(row => [stage(row.expectedTransireDate, row.transireReleasedAt), stage(row.expectedDoDate, row.doReleasedAt), stage(row.expectedTdoDate, row.tdoReleasedAt), stage(row.expectedPulloutDate, row.pulloutReleasedAt)]);
  return { title: "Workflow Stage Summary", itemCount: all.filter(item => item.active || item.released).length, html: html("Workflow Stage Summary", "Independent department status at the time this report was generated.", [["Tracked stage records", String(all.filter(item => item.active || item.released).length)], ["Active", String(all.filter(item => item.active).length)], ["Released", String(all.filter(item => item.released).length)], ["Overdue", String(all.filter(item => item.overdue).length)]]) };
}

/** Runs on the existing minute scheduler. No report is marked sent unless Resend accepts it. */
export async function deliverReportSubscription(
  subscription: typeof reportSubscriptionsTable.$inferSelect,
  now = new Date(),
  options: { test?: boolean } = {},
): Promise<{ status: "sent" | "failed"; itemCount: number; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = recipients(subscription.recipients);
  let itemCount = 0;
  try {
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
    if (!to.length) throw new Error("No valid recipients are configured.");
    const report = await prepareReport(subscription.reportKind, subscription.branchId, now, subscription.filters);
    itemCount = report.itemCount;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.RESEND_DEFAULT_FROM || "Cost Management <onboarding@resend.dev>", to, subject: `[Cost Management] ${report.title}`, html: report.html }) });
    if (!response.ok) throw new Error(`Resend rejected the report delivery (${response.status}).`);
    await db.transaction(async (tx) => {
      if (!options.test) {
        await tx.update(reportSubscriptionsTable).set({ lastSentAt: now, updatedAt: now }).where(eq(reportSubscriptionsTable.id, subscription.id));
      }
      await tx.insert(reportDeliveryLogsTable).values({ subscriptionId: subscription.id, branchId: subscription.branchId, reportKind: subscription.reportKind, recipients: JSON.stringify(to), status: options.test ? "test_sent" : "sent", itemCount, deliveredAt: now });
    });
    return { status: "sent", itemCount };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Unknown delivery error";
    await db.insert(reportDeliveryLogsTable).values({ subscriptionId: subscription.id, branchId: subscription.branchId, reportKind: subscription.reportKind, recipients: JSON.stringify(to), status: options.test ? "test_failed" : "failed", itemCount, error: message, deliveredAt: now });
    console.error("[scheduled-report] delivery failed", subscription.id, error);
    return { status: "failed", itemCount, error: message };
  }
}

/** Runs on the existing minute scheduler. */
export async function runScheduledReportDelivery(): Promise<void> {
  const subscriptions = await db.select().from(reportSubscriptionsTable).where(and(eq(reportSubscriptionsTable.isActive, true), isNull(reportSubscriptionsTable.archivedAt)));
  const now = new Date();
  for (const subscription of subscriptions) {
    if (isReportDeliveryDue(subscription.frequency, subscription.lastSentAt, now, subscription.sendAt, subscription.sendDayOfWeek, subscription.timezone)) await deliverReportSubscription(subscription, now);
  }
}
