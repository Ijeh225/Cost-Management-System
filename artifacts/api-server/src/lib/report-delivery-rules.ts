export const SCHEDULED_REPORT_KINDS = new Set(["duty_payment_ledger", "workflow_stage_summary"]);
export const SCHEDULED_REPORT_FREQUENCIES = new Set(["daily", "weekly"]);
export const REPORT_TIMEZONE = "Africa/Lagos";

const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeReportRecipients(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const recipients = [...new Set(value.map(item => String(item).trim().toLowerCase()).filter(Boolean))];
  return recipients.length > 0 && recipients.length <= 20 && recipients.every(item => emailAddress.test(item)) ? recipients : null;
}

export function normalizeReportSendAt(value: unknown): string | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return value;
}

export function normalizeReportSendDayOfWeek(value: unknown): number | null {
  const day = Number(value);
  return Number.isInteger(day) && day >= 0 && day <= 6 ? day : null;
}

function zonedParts(date: Date, timezone: string) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((parts, part) => {
    if (part.type !== "literal") parts[part.type] = part.value;
    return parts;
  }, {});
  const year = Number(values.year);
  const month = Number(values.month);
  const day = Number(values.day);
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    dayNumber: Math.floor(Date.UTC(year, month - 1, day) / 86_400_000),
  };
}

/** A schedule runs at its configured Africa/Lagos wall-clock time, not merely every 24 hours. */
export function isReportDeliveryDue(
  frequency: string,
  lastSentAt: Date | null,
  now: Date,
  sendAt = "08:00",
  sendDayOfWeek = 1,
  timezone = REPORT_TIMEZONE,
): boolean {
  const normalizedTime = normalizeReportSendAt(sendAt) ?? "08:00";
  const normalizedDay = normalizeReportSendDayOfWeek(sendDayOfWeek) ?? 1;
  const [hours, minutes] = normalizedTime.split(":").map(Number);
  const current = zonedParts(now, timezone);
  if (current.minutes < hours * 60 + minutes) return false;
  if (frequency === "weekly" && current.weekday !== normalizedDay) return false;
  if (!lastSentAt) return true;
  const previous = zonedParts(lastSentAt, timezone);
  if (frequency === "weekly") return current.dayNumber - previous.dayNumber >= 7;
  return current.dateKey !== previous.dateKey;
}
