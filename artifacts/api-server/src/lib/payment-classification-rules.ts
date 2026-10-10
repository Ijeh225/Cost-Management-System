export const PAYMENT_CLASSIFICATIONS = ["unclassified", "operating_expense", "asset", "advance", "loan_repayment", "other_non_expense"] as const;

export function parsePaymentClassification(body: Record<string, unknown>) {
  const classification = body.classification ?? "unclassified";
  if (!PAYMENT_CLASSIFICATIONS.includes(classification as typeof PAYMENT_CLASSIFICATIONS[number])) throw new Error("Invalid payment classification");
  const classificationReason = typeof body.classificationReason === "string" ? body.classificationReason.trim() : "";
  const expenseHead = typeof body.expenseHead === "string" ? body.expenseHead.trim() : "";
  if (classification !== "unclassified" && !classificationReason) throw new Error("Supporting evidence/reason is required for classification");
  if (classification === "operating_expense" && !expenseHead) throw new Error("Expense head is required for an operating expense");
  if (classificationReason.length > 2000 || expenseHead.length > 120) throw new Error("Classification text is too long");
  return { classification: classification as typeof PAYMENT_CLASSIFICATIONS[number],
    classificationReason: classificationReason || null,
    expenseHead: classification === "operating_expense" ? expenseHead : null };
}
