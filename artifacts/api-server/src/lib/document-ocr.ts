import { createWorker } from "tesseract.js";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import english from "@tesseract.js-data/eng";

export type OcrPage = { page: number; text: string; confidence: number | null };
let busy = false;

// One bounded local OCR job per process; source bytes never leave the server.
export async function extractScan(buffer: Buffer, pdf: boolean): Promise<OcrPage[]> {
  if (busy) throw new Error("OCR is busy. Retry indexing shortly.");
  busy = true;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let pdfDocument: import("pdfjs-dist").PDFDocumentProxy | undefined;
  let loadingTask: import("pdfjs-dist").PDFDocumentLoadingTask | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancelled = false;
  try {
    const work = async () => {
      worker = await createWorker("eng", 1, { langPath: english.langPath, gzip: true, cacheMethod: "none" });
      if (cancelled) { await worker.terminate(); throw new Error("OCR timed out"); }
      const pages: OcrPage[] = [];
      const recognize = async (bytes: Buffer, page: number) => {
        if (cancelled) throw new Error("OCR timed out");
        const { data } = await worker!.recognize(bytes);
        pages.push({ page, text: data.text.slice(0, 100_000), confidence: data.confidence });
      };
      if (pdf) {
        const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
        loadingTask = getDocument({ data: new Uint8Array(buffer),
          useSystemFonts: true, maxImageSize: 12_000_000 });
        pdfDocument = await loadingTask.promise;
        if (pdfDocument.numPages > 6) throw new Error("Scanned PDFs are limited to 6 pages per version. Split the document before upload.");
        for (let number = 1; number <= pdfDocument.numPages; number++) {
          const page = await pdfDocument.getPage(number);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.sqrt(8_000_000 / (base.width * base.height)));
          const viewport = page.getViewport({ scale });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext("2d"), viewport, canvas } as unknown as Parameters<typeof page.render>[0]).promise;
          await recognize(canvas.toBuffer("image/png"), number);
          page.cleanup();
        }
      } else {
        const image = await loadImage(buffer);
        if (image.width * image.height > 12_000_000) throw new Error("OCR images are limited to 12 megapixels. Resize before upload.");
        await recognize(buffer, 1);
      }
      return pages;
    };
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { cancelled = true; reject(new Error("OCR exceeded 60 seconds. Use a smaller, clearer document and retry.")); }, 60_000);
    })]);
  } finally {
    cancelled = true;
    if (timer) clearTimeout(timer);
    await worker?.terminate();
    await loadingTask?.destroy();
    busy = false;
  }
}
