import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { extractScan } from "../lib/document-ocr.js";
import { suggestFields } from "../lib/document-readiness.js";

const cases = [
  { name: "printed assessment", font: "Arial", rotation: 0, width: 1600, contrast: "#111111", identifier: "ASSESS-20261005", label: "Assessment" },
  { name: "skewed serif receipt", font: "Georgia", rotation: 2, width: 1400, contrast: "#333333", identifier: "RECEIPT-20261005", label: "Receipt" },
  { name: "low resolution faded permit", font: "Arial", rotation: -3, width: 600, contrast: "#aaaaaa", identifier: "PERMIT-20261005", label: "Permit" },
  { name: "blurred scan simulation", font: "Arial", rotation: 0, width: 800, contrast: "#111111", identifier: "BLUR-20261005", label: "B/L" },
  { name: "script-font simulation, not human handwriting", font: "Segoe Script", rotation: 1, width: 1300, contrast: "#223366", identifier: "HAND-20261005", label: "B/L" },
];

describe("CAP-02 bounded synthetic OCR quality probes", () => {
  for (const sample of cases) it(sample.name, async () => {
    const canvas = createCanvas(1600, 800), ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 1600, 800);
    if (sample.name === "blurred scan simulation") ctx.filter = "blur(4px)";
    ctx.translate(800, 400); ctx.rotate(sample.rotation * Math.PI / 180); ctx.translate(-800, -400);
    ctx.fillStyle = sample.contrast; ctx.font = `42px "${sample.font}"`;
    ["DUMMY DOCUMENT - OCR QUALITY TEST ONLY", `${sample.label}: ${sample.identifier}`, "Amount: NGN12500.50", "Date: 2026-10-05"]
      .forEach((line, i) => ctx.fillText(line, 60, 130 + i * 130));
    const scaled = createCanvas(sample.width, sample.width / 2);
    scaled.getContext("2d").drawImage(canvas, 0, 0, sample.width, sample.width / 2);
    const pages = await extractScan(scaled.toBuffer("image/png"), false);
    const suggestions = suggestFields(pages);
    const actual = Object.fromEntries(suggestions.map(s => [s.field, s.value]));
    const expected = { identifier: sample.identifier, amount: "NGN12500.50", date: "2026-10-05" };
    const matches = Object.entries(expected).filter(([key, value]) => actual[key] === value).length;
    console.log("OCR_QUALITY", JSON.stringify({ sample: sample.name, exactFields: matches, totalFields: 3,
      confidence: pages[0].confidence, expected, actual, evidence: "synthetic, not representative real-world accuracy" }));
    expect(pages).toHaveLength(1);
    expect(suggestions.every(s => s.requiresReview === true)).toBe(true);
    if (sample.name === "printed assessment") expect(matches).toBe(3);
    // Degraded samples measure quality, not a guarantee of recognition or approval.
  }, 90000);
});
