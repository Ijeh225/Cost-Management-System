function cleanLookupTerm(value: string) {
  return value.trim().replace(/[.?!;,:]+$/g, "").trim();
}

/**
 * Extract an exact vendor, beneficiary, or description only when the user
 * clearly requests one schedule. Broad plural requests remain broad queries.
 */
export function paymentScheduleLookupQuery(question: string): string | null {
  const quoted = question.match(/["']([^"']{2,160})["']/);
  if (quoted?.[1]) return cleanLookupTerm(quoted[1]) || null;

  const named = question.match(/\b(?:payment\s+schedule|schedule)\s+(?:for|named|called)\s+(.{2,160})$/i);
  if (named?.[1]) return cleanLookupTerm(named[1]) || null;

  // Singular "schedule" plus text is a named-record request, even where the
  // vendor name contains no schedule number.
  const direct = question.match(/\b(?:payment\s+schedule|schedule)\b\s+(.{2,160})$/i);
  if (!direct?.[1]) return null;
  const candidate = cleanLookupTerm(direct[1].replace(/^(?:for|named|called)\s+/i, ""));
  return candidate || null;
}
