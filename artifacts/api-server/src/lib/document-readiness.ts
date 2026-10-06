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

type SourcePage = { page: number; text: string; confidence?: number | null };
type Candidate = { value: string; key: string; source: SourcePage; currency?: string };

function amountCandidate(value: string, source: SourcePage): Candidate | null {
  // Only repair spacing around separators, never replace OCR letters with digits.
  const compact = value.trim().replace(/\s*([.,])\s*/g, "$1");
  const currency = "(?:NGN|USD|GBP|EUR|RM|MYR|\\u20a6|\\$|\\u00a3|\\u20ac)";
  const match = compact.match(new RegExp(`^(${currency})?\\s*((?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{2})?)\\s*(${currency})?$`, "i"));
  if (!match || (match[1] && match[3])) return null;
  const number = match[2].replace(/,/g, "");
  const [whole, fraction = "00"] = number.split(".");
  const code = (match[1] ?? match[3] ?? "").toUpperCase();
  const aliases: Record<string, string> = { "\u20a6": "NGN", RM: "MYR", "\u00a3": "GBP", "\u20ac": "EUR" };
  return { value: compact, key: `${whole.replace(/^0+(?=\d)/, "")}.${fraction}`,
    currency: aliases[code] ?? code, source };
}

function suggestedAmount(pages: SourcePage[]): Candidate | null {
  const candidates: Candidate[] = [];
  for (const source of pages) {
    let taxSummary = false;
    for (const line of source.text.split(/\r?\n/)) {
      if (!line.trim()) taxSummary = false;
      if (/^\s*[|]?\s*(?:GST|VAT|tax)\s+(?:summary|breakdown)\b/i.test(line)) taxSummary = true;
      if (taxSummary) continue;
      // Anchor the whole label: TAX TOTAL, SUBTOTAL and table headings are not totals.
      const match = line.match(/^\s*[|]?\s*((?:(?:grand|net)\s+)?total(?:\s+(?:amount|payable|due|inclusive\s+(?:of\s+)?(?:GST|VAT)))?|amount(?:\s+(?:due|payable))?)\b\s*[:=]?\s*(.*?)\s*$/i);
      if (!match) continue;
      // A lone heading contains no amount. Quantity/tax detail labels are excluded.
      if (!match[2] || /^(?:quantity|items?\b|qty\b|GST\b|VAT\b|tax\b|supplies\b|\d+\s*%)/i.test(match[2])) continue;
      const candidate = amountCandidate(match[2], source);
      if (!candidate) return null;
      candidates.push(candidate);
    }
  }
  if (new Set(candidates.map(c => c.key)).size !== 1 ||
      new Set(candidates.map(c => c.currency).filter(Boolean)).size > 1) return null;
  return candidates.find(c => c.currency) ?? candidates[0] ?? null;
}

function suggestedDate(pages: SourcePage[]): Candidate | null {
  const candidates: Candidate[] = [];
  for (const source of pages) {
    for (const line of source.text.split(/\r?\n/)) {
      // Other business dates must not replace the document/issue date.
      const labels = [...line.matchAll(/\b(?:due\s+date|expir(?:y|ation)\s+date|delivery\s+date|date\s+of\s+birth|issued\s+on|(?:invoice\s+|receipt\s+|issue\s+)?date)\b/gi)];
      const sections = [line.slice(0, labels[0]?.index ?? line.length),
        ...labels.map((label, index) => line.slice(label.index, labels[index + 1]?.index))];
      for (const section of sections) {
        if (/^(?:due\s+date|expir(?:y|ation)\s+date|delivery\s+date|date\s+of\s+birth)\b/i.test(section.trim())) continue;
        const labelled = /^(?:issued\s+on|(?:invoice\s+|receipt\s+|issue\s+)?date)\b/i.test(section.trim());
        const dates = [...section.matchAll(/(?<![\w/.-])(?:\d{4}([/-])\d{1,2}\1\d{1,2}|\d{1,2}([/-])\d{1,2}\2(?:\d{4}|\d{2}))(?![\w/.-])/g)];
        if (labelled && dates.length === 0) return null;
        for (const date of dates) {
          const parts = date[0].split(/[/-]/).map(Number);
          const iso = /^\d{4}/.test(date[0]);
          const [year, month, day] = iso ? parts : [parts[2] < 100 ? 2000 + parts[2] : parts[2], parts[1], parts[0]];
          const checked = new Date(Date.UTC(year, month - 1, day));
          if (checked.getUTCFullYear() !== year || checked.getUTCMonth() !== month - 1 || checked.getUTCDate() !== day) return null;
          // Keep two-digit years as printed; do not claim a resolved century.
          const yearKey = !iso && parts[2] < 100 ? `short:${parts[2]}` : year;
          candidates.push({ value: date[0], key: `${yearKey}-${month}-${day}`, source });
        }
      }
    }
  }
  // Conflicting dates across a scan/page set are not resolved by taking the first.
  return new Set(candidates.map(c => c.key)).size === 1 ? candidates[0] : null;
}

export function suggestFields(pages: SourcePage[]) {
  const fields: { field: string; value: string; page: number; confidence: number | null; requiresReview: true }[] = [];
  for (const page of pages) {
    for (const [field, pattern] of [
      ["identifier", /(?:B\/?L|Bill of Lading|Assessment|Permit|Receipt)\s*(?:No\.?|Number|#)?\s*[:\-]\s*([^\n]{1,100})/i],
    ] as const) {
      const match = page.text.match(pattern);
      if (match && !fields.some(f => f.field === field)) fields.push({ field, value: match[1].trim(),
        page: page.page, confidence: page.confidence ?? null, requiresReview: true });
    }
  }
  for (const [field, candidate] of [["amount", suggestedAmount(pages)], ["date", suggestedDate(pages)]] as const) {
    if (candidate) fields.push({ field, value: candidate.value, page: candidate.source.page,
      confidence: candidate.source.confidence ?? null, requiresReview: true });
  }
  return fields;
}
