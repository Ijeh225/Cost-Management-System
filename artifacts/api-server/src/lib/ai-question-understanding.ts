import { AiOperationalStage, resolveAiOperationalStage } from "./ai-business-definitions.js";

export type AiQuestionIntent = "count" | "list" | "investigate" | "compare" | "report" | "search" | "status" | "unknown";

export type AiQuestionTimeframe = {
  label: string;
  from: string;
  to: string;
};

export type AiQuestionUnderstanding = {
  intent: AiQuestionIntent;
  stage: AiOperationalStage | null;
  stageStatus: "active" | "released" | "all";
  containerNumber: string | null;
  invoiceNumber: string | null;
  timeframe: AiQuestionTimeframe | null;
  asksForDocuments: boolean;
  asksForPayments: boolean;
  asksForDelays: boolean;
};

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function startOfUtcWeek(date: Date): Date {
  const result = startOfUtcDay(date);
  const day = result.getUTCDay() || 7;
  result.setUTCDate(result.getUTCDate() - day + 1);
  return result;
}

function resolveTimeframe(question: string, now: Date): AiQuestionTimeframe | null {
  const normalised = question.toLowerCase().replace(/\s+/g, " ");
  const today = startOfUtcDay(now);
  if (/\btoday\b/.test(normalised)) return { label: "today", from: dateKey(today), to: dateKey(today) };
  if (/\btomorrow\b/.test(normalised)) {
    const tomorrow = addUtcDays(today, 1);
    return { label: "tomorrow", from: dateKey(tomorrow), to: dateKey(tomorrow) };
  }
  if (/\bthis week\b/.test(normalised)) {
    const from = startOfUtcWeek(today);
    return { label: "this week", from: dateKey(from), to: dateKey(addUtcDays(from, 6)) };
  }
  if (/\blast week\b/.test(normalised)) {
    const to = addUtcDays(startOfUtcWeek(today), -1);
    return { label: "last week", from: dateKey(addUtcDays(to, -6)), to: dateKey(to) };
  }
  if (/\bthis month\b/.test(normalised)) {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return { label: "this month", from: dateKey(from), to: dateKey(to) };
  }
  if (/\blast month\b/.test(normalised)) {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { label: "last month", from: dateKey(from), to: dateKey(to) };
  }
  const relativeDays = normalised.match(/\b(?:next|last|past)\s+(\d{1,3})\s+days?\b/);
  if (relativeDays) {
    const days = Number(relativeDays[1]);
    if (days > 0 && days <= 365) {
      const isPast = /\b(?:last|past)\b/.test(relativeDays[0]);
      const from = isPast ? addUtcDays(today, -(days - 1)) : today;
      const to = isPast ? today : addUtcDays(today, days - 1);
      return { label: relativeDays[0], from: dateKey(from), to: dateKey(to) };
    }
  }
  return null;
}

function resolveIntent(question: string): AiQuestionIntent {
  const normalised = question.toLowerCase();
  if (/\b(how many|count|number of)\b/.test(normalised)) return "count";
  if (/\b(compare|comparison|versus|vs\.?|best performing|worst performing)\b/.test(normalised)) return "compare";
  if (/\b(report|statement|summary|prepare)\b/.test(normalised)) return "report";
  if (/\b(search|find|locate)\b/.test(normalised)) return "search";
  if (/\b(why|investigate|explain|reason)\b/.test(normalised)) return "investigate";
  if (/\b(status|where is|track|check)\b/.test(normalised)) return "status";
  if (/\b(show|list|which|display|give me)\b/.test(normalised)) return "list";
  return "unknown";
}

/** Extracts only safe, deterministic signals. It never queries data or grants access. */
export function understandAiQuestion(question: string, now = new Date()): AiQuestionUnderstanding {
  const normalised = question.trim().toLowerCase();
  const containerMatch = question.toUpperCase().match(/\b[A-Z]{4}\d{7}\b/);
  const invoiceMatch = question.toUpperCase().match(/\bINV[-\s]?\d{4,}(?:[-\s]?\d+)?\b/);
  const asksForDocuments = /\b(documents?|docs?|files?|attachments?)\b/.test(normalised);
  const asksForPayments = /\b(payment|payments|paid|disbursement|disbursements|expense)\b/.test(normalised);
  const asksForDelays = /\b(delay|delayed|late|stalled|overdue)\b/.test(normalised);
  const stageStatus = /\b(released|completed)\b/.test(normalised)
    ? "released"
    : /\b(active|pending)\b/.test(normalised)
      ? "active"
      : "all";

  return {
    intent: resolveIntent(question),
    stage: resolveAiOperationalStage(question),
    stageStatus,
    containerNumber: containerMatch?.[0] ?? null,
    invoiceNumber: invoiceMatch?.[0] ?? null,
    timeframe: resolveTimeframe(question, now),
    asksForDocuments,
    asksForPayments,
    asksForDelays,
  };
}

/** A compact, untrusted-model-safe description of signals recognised locally. */
export function questionUnderstandingForRouting(understanding: AiQuestionUnderstanding): Record<string, unknown> {
  return {
    intent: understanding.intent,
    stage: understanding.stage,
    stageStatus: understanding.stageStatus,
    containerNumber: understanding.containerNumber,
    invoiceNumber: understanding.invoiceNumber,
    timeframe: understanding.timeframe,
    asksForDocuments: understanding.asksForDocuments,
    asksForPayments: understanding.asksForPayments,
    asksForDelays: understanding.asksForDelays,
  };
}
