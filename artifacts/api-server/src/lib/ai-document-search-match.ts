export type DocumentSearchMatch = {
  label: string;
  sourceText: string;
};

type IndexedPage = {
  page?: unknown;
  text?: unknown;
};

/**
 * Produces an evidence label without claiming that an indexed text file has
 * an unavailable page. File-name matches and extracted-text matches are both
 * valid evidence, even when the file is not meaningfully paginated.
 */
export function describeDocumentSearchMatch(input: {
  pageText: string | null | undefined;
  contentText: string | null | undefined;
  originalName: string | null | undefined;
  query: string;
}): DocumentSearchMatch {
  const query = input.query.trim().toLowerCase();
  const contentText = input.contentText ?? "";
  const contentMatches = Boolean(query) && contentText.toLowerCase().includes(query);
  const filenameMatches = Boolean(query) && (input.originalName ?? "").toLowerCase().includes(query);
  let sourceText = contentText;
  let label = contentMatches ? "Text match" : filenameMatches ? "Filename match" : "Indexed match";

  if (!contentMatches) return { label, sourceText };

  try {
    const parsed: unknown = JSON.parse(input.pageText ?? "[]");
    if (!Array.isArray(parsed)) return { label, sourceText };
    const matchedPage = (parsed as IndexedPage[]).find((page) => (
      typeof page.text === "string" && page.text.toLowerCase().includes(query)
    ));
    if (!matchedPage || typeof matchedPage.text !== "string") return { label, sourceText };

    sourceText = matchedPage.text;
    const pageNumber = typeof matchedPage.page === "number" ? matchedPage.page : Number(matchedPage.page);
    if (Number.isInteger(pageNumber) && pageNumber > 0) {
      label = `Page ${pageNumber}`;
    }
  } catch {
    // Older indexed records may not have page metadata. Their text remains valid evidence.
  }

  return { label, sourceText };
}
