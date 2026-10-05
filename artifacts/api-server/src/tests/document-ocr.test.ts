import { createCanvas } from "@napi-rs/canvas";
import PDFDocument from "pdfkit";
import { describe, expect, it } from "vitest";
import { extractScan } from "../lib/document-ocr.js";
import { suggestFields } from "../lib/document-readiness.js";

function sampleScan() {
  const canvas = createCanvas(1500, 700), ctx = canvas.getContext("2d");
  ctx.fillStyle = "white"; ctx.fillRect(0, 0, 1500, 700);
  ctx.fillStyle = "black"; ctx.font = "48px Arial";
  ["DOCUMENT TEST", "B/L: CAP02-001", "Amount: NGN500.00", "Date: 2026-10-05"].forEach((t, i) => ctx.fillText(t, 80, 100 + i * 100));
  return canvas.toBuffer("image/png");
}
describe("local OCR quality and PDF rendering", () => {
  it("extracts the printed identifier, amount and date with page confidence", async () => {
    const pages = await extractScan(sampleScan(), false);
    expect(pages).toHaveLength(1);
    expect(pages[0].confidence).toBeGreaterThan(70);
    expect(suggestFields(pages).map(f => f.value)).toEqual(["CAP02-001", "NGN500.00", "2026-10-05"]);
  }, 90000);
  it("reads a scanned PDF without sending source bytes to a provider", async () => {
    const doc = new PDFDocument({ size: [750, 350], margin: 0 });
    const chunks: Buffer[] = [];
    const buffer = new Promise<Buffer>(resolve => { doc.on("data", b => chunks.push(b)); doc.on("end", () => resolve(Buffer.concat(chunks))); });
    doc.image(sampleScan(), 0, 0, { width: 750 }); doc.end();
    const pages = await extractScan(await buffer, true);
    expect(pages).toHaveLength(1);
    expect(pages[0].text).toContain("CAP02-001");
    expect(pages[0].text).toContain("NGN500.00");
  }, 90000);
  it("fails visibly on an unreadable image instead of returning a reviewed result", async () => {
    await expect(extractScan(Buffer.from("not an image"), false)).rejects.toThrow();
  }, 90000);
});
