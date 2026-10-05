import { z } from "zod";

export const documentTypes = ["bill_of_lading", "assessment", "release", "permit", "receipt", "other"] as const;
export const documentTypeSchema = z.enum(documentTypes);
export const expirySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, "Enter a valid date").nullable();
export const profileSchema = z.object({
  name: z.string().trim().min(1).max(100), jobType: z.string().trim().min(1).max(100),
  cargoType: z.string().trim().min(1).max(100),
  requiredTypes: z.array(documentTypeSchema).min(1).max(6).refine(v => new Set(v).size === v.length),
}).strict();
export const reviewSchema = z.object({
  expectedReviewId: z.number().int().positive().nullable(),
  status: z.enum(["reviewed", "rejected"]), documentType: documentTypeSchema,
  issuer: z.string().trim().max(200), expiresOn: expirySchema,
  acceptedFields: z.object({ identifier: z.string().max(200), amount: z.string().max(100),
    date: z.string().max(100), text: z.string().max(100_000) }).strict(),
  notes: z.string().trim().max(2000), sourceChecked: z.literal(true),
}).strict().refine(v => v.status !== "rejected" || v.notes.length > 0, "Rejection needs a reason");

export function watDate(now = new Date()) {
  return new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);
}

type ReadinessDocument = { id: number; previousVersionId: number | null; documentType: string;
  expiresOn: string | null; review?: { status: string; documentType: string; expiresOn: string | null } | null };
export function buildReadiness(required: string[] | null, documents: ReadinessDocument[], today = watDate()) {
  const superseded = new Set(documents.flatMap(d => d.previousVersionId === null ? [] : [d.previousVersionId]));
  const current = documents.filter(d => !superseded.has(d.id)).map(d => ({ ...d,
    effectiveType: d.review?.documentType ?? d.documentType,
    state: (d.review ? d.review.expiresOn : d.expiresOn) && (d.review ? d.review.expiresOn : d.expiresOn)! < today
      ? "expired" : d.review?.status ?? "received",
  }));
  const items = (required ?? []).map(type => {
    const matches = current.filter(d => d.effectiveType === type);
    const status = ["reviewed", "received", "rejected", "expired"].find(s => matches.some(d => d.state === s)) ?? "required";
    return { documentType: type, status, documentIds: matches.map(d => d.id) };
  });
  return { configured: required !== null, ready: !!required?.length && items.every(i => i.status === "reviewed"), items, current };
}

export function suggestFields(pages: { page: number; text: string; confidence?: number | null }[]) {
  const fields: { field: string; value: string; page: number; confidence: number | null; requiresReview: true }[] = [];
  for (const page of pages) {
    for (const [field, pattern] of [
      ["identifier", /(?:B\/?L|Bill of Lading|Assessment|Permit|Receipt)\s*(?:No\.?|Number|#)?\s*[:\-]\s*([^\n]{1,100})/i],
      ["amount", /(?:Total|Amount)\s*[:\-]\s*([^\n]{1,70})/i],
      ["date", /(?:Date|Issued on)\s*[:\-]\s*([^\n]{1,70})/i],
    ] as const) {
      const match = page.text.match(pattern);
      if (match && !fields.some(f => f.field === field)) fields.push({ field, value: match[1].trim(),
        page: page.page, confidence: page.confidence ?? null, requiresReview: true });
    }
  }
  return fields;
}
