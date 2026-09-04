export type PaymentScheduleBucket = "overdue" | "today" | "tomorrow" | "upcoming" | "completed" | "cancelled";

export function startOfLocalDay(date: Date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

/** A schedule due before today is overdue, not part of today's work queue. */
export function getPaymentScheduleBucket(
  scheduleDate: Date,
  status: string,
  today = startOfLocalDay(new Date()),
): PaymentScheduleBucket {
  const day = startOfLocalDay(scheduleDate);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (status === "completed" || status === "paid") return "completed";
  if (status === "cancelled" || status === "rejected") return "cancelled";
  if (day < today) return "overdue";
  if (day.getTime() === today.getTime()) return "today";
  if (day.getTime() === tomorrow.getTime()) return "tomorrow";
  return "upcoming";
}
