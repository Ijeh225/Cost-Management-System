// Synthetic source only: no business data or financial posting instruction.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const { createCanvas } = require("@napi-rs/canvas");
const canvas = createCanvas(1500, 700), context = canvas.getContext("2d");
context.fillStyle = "white"; context.fillRect(0, 0, 1500, 700);
context.fillStyle = "black"; context.font = "44px Arial";
["CAP-02 DUMMY DOCUMENT - NOT A REAL RELEASE", "B/L: CAP02-LIVE-20261005", "Amount: NGN500.00", "Date: 2026-10-05"]
  .forEach((text, index) => context.fillText(text, 55, 100 + index * 110));
const output = join(tmpdir(), "CAP02-LIVE-20261005.png");
await writeFile(output, canvas.toBuffer("image/png"));
console.log(output);
const PDFDocument = require("pdfkit");
const pdf = new PDFDocument({ size: [750, 350], margin: 0 });
const chunks = [];
const completed = new Promise(resolve => { pdf.on("data", data => chunks.push(data)); pdf.on("end", resolve); });
pdf.image(canvas.toBuffer("image/png"), 0, 0, { width: 750 }); pdf.end();
await completed;
const pdfOutput = join(tmpdir(), "CAP02-LIVE-20261005-scanned.pdf");
await writeFile(pdfOutput, Buffer.concat(chunks));
console.log(pdfOutput);
