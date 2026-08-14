import {
  containerDocumentsTable,
  db,
  documentIntelligenceIndexTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

const MAX_EXTRACTED_CHARACTERS = 1_000_000;

type TextPage = { page: number; text: string };
type ExtractionStatus = "indexed" | "unsupported" | "failed";
type ExtractionResult = {
  status: ExtractionStatus;
  text: string;
  pages: TextPage[];
  pageCount: number | null;
  errorMessage: string | null;
};

type IndexableDocument = {
  id: number;
  containerId: number;
  branchId: number;
  section: string | null;
  uploadedById: number | null;
  originalName: string;
  mimeType: string;
};

function normaliseText(value: string): string {
  return value.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_EXTRACTED_CHARACTERS);
}

function extensionFor(document: Pick<IndexableDocument, "originalName">): string {
  const index = document.originalName.lastIndexOf(".");
  return index >= 0 ? document.originalName.slice(index).toLowerCase() : "";
}

function indexed(text: string, pages: TextPage[], pageCount: number | null = pages.length || null): ExtractionResult {
  const cleanText = normaliseText(text);
  if (!cleanText) {
    return { status: "failed", text: "", pages: [], pageCount, errorMessage: "No readable text was found in this document." };
  }
  return { status: "indexed", text: cleanText, pages: pages.map((page) => ({ page: page.page, text: normaliseText(page.text) })).filter((page) => page.text), pageCount, errorMessage: null };
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  const pdfParse = (await import("pdf-parse")).default;
  const pages: TextPage[] = [];
  let pageNumber = 0;
  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData: { getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }) => {
      pageNumber += 1;
      const content = await pageData.getTextContent();
      const text = content.items.map((item) => item.str ?? "").join(" ");
      pages.push({ page: pageNumber, text });
      return text;
    },
  });
  return indexed(pages.map((page) => page.text).join("\n"), pages, parsed.numpages || pages.length || null);
}

async function extractDocument(document: IndexableDocument, buffer: Buffer): Promise<ExtractionResult> {
  const extension = extensionFor(document);
  const mimeType = document.mimeType.toLowerCase();
  try {
    if ([".txt", ".csv", ".json", ".xml", ".md"].includes(extension) || mimeType.startsWith("text/")) {
      const text = buffer.toString("utf8");
      return indexed(text, [{ page: 1, text }], 1);
    }
    if (extension === ".pdf" || mimeType === "application/pdf") return extractPdf(buffer);
    if (extension === ".docx" || mimeType.includes("wordprocessingml")) {
      const extracted = await mammoth.extractRawText({ buffer });
      return indexed(extracted.value, [{ page: 1, text: extracted.value }], 1);
    }
    if ([".xlsx", ".xls", ".xlsm", ".csv"].includes(extension) || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const pages = workbook.SheetNames.map((name, index) => ({
        page: index + 1,
        text: `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name])}`,
      }));
      return indexed(pages.map((page) => page.text).join("\n\n"), pages, pages.length || null);
    }
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(extension) || mimeType.startsWith("image/")) {
      return { status: "unsupported", text: "", pages: [], pageCount: null, errorMessage: "OCR is not enabled for image documents yet. The file is stored safely but cannot be searched." };
    }
    return { status: "unsupported", text: "", pages: [], pageCount: null, errorMessage: "This file type is stored safely but is not supported for document search yet." };
  } catch (error) {
    console.error("[document-intelligence] extraction failed", { documentId: document.id, error });
    return { status: "failed", text: "", pages: [], pageCount: null, errorMessage: "Text extraction failed. Retry indexing, or upload a readable PDF, Word, spreadsheet, CSV, or text file." };
  }
}

export async function indexContainerDocument(document: IndexableDocument, buffer: Buffer) {
  const extraction = await extractDocument(document, buffer);
  const now = new Date();
  const values = {
    containerId: document.containerId,
    branchId: document.branchId,
    section: document.section,
    uploadedById: document.uploadedById,
    status: extraction.status,
    extractorVersion: "v1",
    contentText: extraction.text || null,
    pageText: JSON.stringify(extraction.pages),
    pageCount: extraction.pageCount,
    errorMessage: extraction.errorMessage,
    indexedAt: extraction.status === "indexed" ? now : null,
    updatedAt: now,
  };
  const [row] = await db.insert(documentIntelligenceIndexTable).values({ documentId: document.id, ...values })
    .onConflictDoUpdate({ target: documentIntelligenceIndexTable.documentId, set: values })
    .returning();
  return row;
}

export async function getDocumentIndex(documentId: number) {
  const [row] = await db.select().from(documentIntelligenceIndexTable)
    .where(eq(documentIntelligenceIndexTable.documentId, documentId)).limit(1);
  return row ?? null;
}

export async function getIndexableDocument(documentId: number) {
  const [document] = await db.select({
    id: containerDocumentsTable.id,
    containerId: containerDocumentsTable.containerId,
    branchId: containerDocumentsTable.branchId,
    section: containerDocumentsTable.section,
    uploadedById: containerDocumentsTable.uploadedById,
    originalName: containerDocumentsTable.originalName,
    mimeType: containerDocumentsTable.mimeType,
    filename: containerDocumentsTable.filename,
  }).from(containerDocumentsTable).where(eq(containerDocumentsTable.id, documentId)).limit(1);
  return document ?? null;
}
