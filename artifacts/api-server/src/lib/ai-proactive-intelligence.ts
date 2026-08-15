import {
  aiAssistantBriefingsTable,
  branchesTable,
  containersTable,
  db,
  invoicePaymentsTable,
  invoicesTable,
  paymentSchedulesTable,
  usersTable,
  workflowNotificationsTable,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";

export type ProactiveBriefingFrequency = "daily" | "weekly" | "on_demand";
export type ProactiveInsight = {
  severity: "critical" | "warning" | "watch";
  category: string;
  title: string;
  detail: string;
  recommendedAction: string;
  href: string;
  source: { type: string; id: number; label: string };
};
export type ProactiveBriefingPayload = {
  generatedAt: string;
  branchId: number;
  period: ProactiveBriefingFrequency;
  counts: { critical: number; warning: number; watch: number };
  insights: ProactiveInsight[];
};
export type ProactiveBriefingPreferences = { enabled: boolean; daily: boolean; weekly: boolean };

export const DEFAULT_PROACTIVE_BRIEFING_PREFERENCES: ProactiveBriefingPreferences = {
  enabled: false,
  daily: true,
  weekly: true,
};

export function parseProactiveBriefingPreferences(value?: string): ProactiveBriefingPreferences {
  try {
    const parsed = JSON.parse(value ?? "") as Partial<ProactiveBriefingPreferences>;
    if (!parsed || typeof parsed !== "object" || typeof parsed.enabled !== "boolean" || typeof parsed.daily !== "boolean" || typeof parsed.weekly !== "boolean") {
      return DEFAULT_PROACTIVE_BRIEFING_PREFERENCES;
    }
    return { enabled: parsed.enabled, daily: parsed.daily, weekly: parsed.weekly };
  } catch {
    return DEFAULT_PROACTIVE_BRIEFING_PREFERENCES;
  }
}

function amount(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value);
}

function lagosDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function startOfLagosDay(now = new Date()): Date {
  return new Date(`${lagosDate(now)}T00:00:00+01:00`);
}

function dueDays(value: Date | null, today: Date): number | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  // Database dates are stored as timestamps. Compare their Lagos calendar
  // dates so a UTC boundary cannot make an item late a day too early/late.
  const due = startOfLagosDay(value);
  return Math.floor((today.getTime() - due.getTime()) / 86_400_000);
}

function lagosClock(now = new Date()): { minutes: number; isMonday: boolean } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return {
    minutes: Number(part("hour")) * 60 + Number(part("minute")),
    isMonday: part("weekday") === "Mon",
  };
}

function formatDate(value: Date | null | undefined): string {
  return value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(value) : "Not set";
}

async function buildBranchBriefing(branchId: number, period: ProactiveBriefingFrequency): Promise<{
  title: string;
  summary: string;
  payload: ProactiveBriefingPayload;
}> {
  const today = startOfLagosDay();
  const inSevenDays = new Date(today); inSevenDays.setDate(inSevenDays.getDate() + 7);
  const containers = await db.select().from(containersTable).where(eq(containersTable.branchId, branchId));
  const activeContainers = containers.filter((container) => container.status !== "closed");
  const insights: ProactiveInsight[] = [];
  const add = (insight: ProactiveInsight) => insights.push(insight);

  for (const container of activeContainers) {
    const identity = `${container.containerNumber} (${container.customerName})`;
    if (!container.berthed && container.eta) {
      const eta = new Date(container.eta);
      const days = dueDays(eta, today);
      if (days !== null && days > 0) add({
        severity: days >= 3 ? "critical" : "warning", category: "Berthing", title: `${identity} has an unconfirmed berthing`,
        detail: `Vessel ETA was ${formatDate(eta)}; it is ${days} day${days === 1 ? "" : "s"} overdue.`,
        recommendedAction: "Confirm berthing at the port or record the revised ETA.", href: `/containers/${container.id}?section=berthing`,
        source: { type: "container", id: container.id, label: container.containerNumber },
      });
      else if (days !== null && days <= 7) add({
        severity: "watch", category: "Berthing", title: `${identity} is approaching berthing ETA`,
        detail: `Vessel ETA is ${formatDate(eta)}.`, recommendedAction: "Confirm the vessel schedule and prepare the berthing workflow.",
        href: `/containers/${container.id}?section=berthing`, source: { type: "container", id: container.id, label: container.containerNumber },
      });
    }

    const stageDates: Array<{ label: string; expected: Date | null; completed: Date | null; href: string }> = [
      { label: "Transire release", expected: container.expectedTransireDate, completed: container.transireReleasedAt, href: "/transire" },
      { label: "Delivery Order release", expected: container.expectedDoDate, completed: container.doReleasedAt, href: "/shipping" },
      { label: "Terminal Delivery Order release", expected: container.expectedTdoDate, completed: container.tdoReleasedAt, href: "/terminal" },
      { label: "Pullout", expected: container.expectedPulloutDate, completed: container.pulloutReleasedAt, href: "/pullout" },
    ];
    for (const stage of stageDates) {
      const days = dueDays(stage.expected, today);
      if (days !== null && days > 0 && !stage.completed) add({
        severity: days >= 3 ? "critical" : "warning", category: "Operational delay", title: `${stage.label} is overdue for ${identity}`,
        detail: `Expected date was ${formatDate(stage.expected)}; overdue by ${days} day${days === 1 ? "" : "s"}${container.stageOwner ? `; owner: ${container.stageOwner}` : ""}.`,
        recommendedAction: "Confirm completion or update the expected date and delay reason.", href: `${stage.href}?container=${container.id}`,
        source: { type: "container", id: container.id, label: container.containerNumber },
      });
    }

    const ageDays = Math.floor((today.getTime() - new Date(container.createdAt).getTime()) / 86_400_000);
    if (!container.paarNumber && ageDays >= 7) add({
      severity: ageDays >= 14 ? "critical" : "warning", category: "Documentation", title: `PAAR number is still missing for ${identity}`,
      detail: `The job was created ${ageDays} day${ageDays === 1 ? "" : "s"} ago and has no PAAR number recorded.`,
      recommendedAction: "Update Documentation with the PAAR number or record the current delay reason.", href: `/documentation?container=${container.id}`,
      source: { type: "container", id: container.id, label: container.containerNumber },
    });
  }

  const invoices = await db.select().from(invoicesTable).where(eq(invoicesTable.branchId, branchId));
  const invoiceIds = invoices.map((invoice) => invoice.id);
  const payments = invoiceIds.length
    ? await db.select().from(invoicePaymentsTable).where(inArray(invoicePaymentsTable.invoiceId, invoiceIds))
    : [];
  const paidByInvoice = new Map<number, number>();
  for (const payment of payments) paidByInvoice.set(payment.invoiceId, (paidByInvoice.get(payment.invoiceId) ?? 0) + amount(payment.amount));
  for (const invoice of invoices) {
    const outstanding = Math.max(0, amount(invoice.total) - (paidByInvoice.get(invoice.id) ?? 0));
    const due = invoice.dueDate ? new Date(`${invoice.dueDate}T00:00:00+01:00`) : null;
    const days = dueDays(due, today);
    if (outstanding > 0 && days !== null && days > 0) add({
      severity: days >= 14 ? "critical" : "warning", category: "Receivable", title: `Invoice ${invoice.invoiceNumber} is overdue`,
      detail: `${money(outstanding)} remains outstanding; due date was ${invoice.dueDate}.`,
      recommendedAction: "Review collection status and send a payment reminder through the normal invoice workflow.", href: `/invoices/${invoice.id}`,
      source: { type: "invoice", id: invoice.id, label: invoice.invoiceNumber },
    });
  }

  const schedules = await db.select().from(paymentSchedulesTable).where(eq(paymentSchedulesTable.branchId, branchId));
  for (const schedule of schedules) {
    const balance = Math.max(0, amount(schedule.amountApproved) - amount(schedule.amountPaid));
    if (balance <= 0 || !["approved", "partially_approved"].includes(schedule.status)) continue;
    const days = dueDays(schedule.scheduleDate, today);
    add({
      severity: days !== null && days > 3 ? "critical" : "warning", category: "Payable", title: `Approved payment is awaiting settlement: ${schedule.vendorBeneficiary}`,
      detail: `${money(balance)} is approved but unpaid${days !== null && days > 0 ? `; schedule date was ${formatDate(schedule.scheduleDate)}` : ""}.`,
      recommendedAction: "Accounts should review the approved payment and pay through the normal schedule workflow.", href: `/payment-schedules?focus=${schedule.id}`,
      source: { type: "payment_schedule", id: schedule.id, label: schedule.vendorBeneficiary },
    });
  }

  const severityWeight = { critical: 0, warning: 1, watch: 2 } as const;
  insights.sort((a, b) => severityWeight[a.severity] - severityWeight[b.severity] || a.title.localeCompare(b.title));
  const prioritised = insights.slice(0, 50);
  const counts = prioritised.reduce((all, insight) => ({ ...all, [insight.severity]: all[insight.severity] + 1 }), { critical: 0, warning: 0, watch: 0 });
  const periodLabel = period === "weekly" ? "Weekly" : period === "daily" ? "Daily" : "Current";
  const summary = prioritised.length
    ? `${counts.critical} critical, ${counts.warning} warning, and ${counts.watch} watch item${prioritised.length === 1 ? "" : "s"} require review.`
    : "No current finance or operational risk items were found under the configured rules.";
  return {
    title: `${periodLabel} Finance & Control Briefing`,
    summary,
    payload: { generatedAt: new Date().toISOString(), branchId, period, counts, insights: prioritised },
  };
}

async function notifyBranchAdministrators(branchId: number, briefingId: number, summary: string, insightCount: number) {
  if (insightCount === 0) return;
  const users = await db.select({ id: usersTable.id, branchId: usersTable.branchId, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.isActive, true));
  const recipients = users.filter((user) => user.role === "super_admin" || (user.role === "admin" && user.branchId === branchId));
  if (!recipients.length) return;
  await db.insert(workflowNotificationsTable).values(recipients.map((user) => ({
    branchId,
    targetUserId: user.id,
    type: "ai_proactive_briefing",
    message: `Finance & control briefing: ${summary}`,
    actionUrl: `/ai-assistant?briefing=${briefingId}`,
  })));
}

export async function generateProactiveBriefing(branchId: number, period: ProactiveBriefingFrequency, force = false) {
  const briefingDate = lagosDate();
  if (!force && period !== "on_demand") {
    const [existing] = await db.select().from(aiAssistantBriefingsTable)
      .where(and(eq(aiAssistantBriefingsTable.branchId, branchId), eq(aiAssistantBriefingsTable.period, period), eq(aiAssistantBriefingsTable.briefingDate, briefingDate)))
      .orderBy(desc(aiAssistantBriefingsTable.generatedAt)).limit(1);
    if (existing) return existing;
  }
  const content = await buildBranchBriefing(branchId, period);
  const [briefing] = await db.insert(aiAssistantBriefingsTable).values({
    branchId, period, briefingDate, title: content.title, summary: content.summary,
    insightCount: content.payload.insights.length, payload: JSON.stringify(content.payload),
  }).returning();
  if (period !== "on_demand") await notifyBranchAdministrators(branchId, briefing.id, content.summary, briefing.insightCount);
  return briefing;
}

export async function runScheduledAiProactiveBriefings(settings: Record<string, string>) {
  const preferences = parseProactiveBriefingPreferences(settings.aiProactiveBriefingPreferences);
  if (!preferences.enabled) return;
  const [hours, minutes] = (settings.digestTime ?? "08:00").split(":").map((part) => Number.parseInt(part, 10));
  const now = lagosClock();
  if (now.minutes < (Number.isFinite(hours) ? hours : 8) * 60 + (Number.isFinite(minutes) ? minutes : 0)) return;
  const frequencies: ProactiveBriefingFrequency[] = [];
  if (preferences.daily) frequencies.push("daily");
  if (preferences.weekly && now.isMonday) frequencies.push("weekly");
  if (!frequencies.length) return;
  const branches = await db.select({ id: branchesTable.id }).from(branchesTable);
  for (const branch of branches) {
    for (const period of frequencies) {
      try { await generateProactiveBriefing(branch.id, period); }
      catch (error) { console.error(`[ai-proactive] Failed ${period} briefing for branch ${branch.id}`, error); }
    }
  }
}

export function formatProactiveBriefing(row: typeof aiAssistantBriefingsTable.$inferSelect) {
  let payload: ProactiveBriefingPayload = { generatedAt: row.generatedAt.toISOString(), branchId: row.branchId, period: row.period as ProactiveBriefingFrequency, counts: { critical: 0, warning: 0, watch: 0 }, insights: [] };
  try { payload = JSON.parse(row.payload) as ProactiveBriefingPayload; } catch {}
  return { ...payload, id: row.id, briefingDate: row.briefingDate, title: row.title, summary: row.summary, insightCount: row.insightCount };
}
