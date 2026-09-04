import { describe, expect, it } from "vitest";
import { describeDocumentSearchMatch } from "../lib/ai-document-search-match.js";

describe("AI document-search evidence labels", () => {
  it("labels an exact filename match honestly when the filename is not in the document text", () => {
    expect(describeDocumentSearchMatch({
      originalName: "E2E-DOCUMENT-RETRIEVAL-20260904.txt",
      contentText: "Controlled document retrieval evidence.",
      pageText: JSON.stringify([{ page: 1, text: "Controlled document retrieval evidence." }]),
      query: "E2E-DOCUMENT-RETRIEVAL-20260904.txt",
    })).toEqual({
      label: "Filename match",
      sourceText: "Controlled document retrieval evidence.",
    });
  });

  it("keeps a real page number for a paginated extracted-text match", () => {
    expect(describeDocumentSearchMatch({
      originalName: "report.pdf",
      contentText: "First page\nThe customs reference is on page two.",
      pageText: JSON.stringify([
        { page: 1, text: "First page" },
        { page: 2, text: "The customs reference is on page two." },
      ]),
      query: "customs reference",
    })).toEqual({
      label: "Page 2",
      sourceText: "The customs reference is on page two.",
    });
  });
});
