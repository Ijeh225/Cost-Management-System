// Public receipt evaluation only: no application login, database or live uploads.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { extractScan } from "../artifacts/api-server/src/lib/document-ocr.js";
import { suggestFields } from "../artifacts/api-server/src/lib/document-readiness.js";

const output = process.argv[2];
if (!output) throw new Error("Provide a local output directory for public samples and measured results");
const directory = resolve(output);
await mkdir(directory, { recursive: true });
const dataset = "jsdnrs/ICDAR2019-SROIE";
const source = `https://huggingface.co/datasets/${dataset}`;
const offsets = Array.from({ length: 12 }, (_, index) => index * 30);
type Row = { row_idx: number; row: { key: string; image: { src: string }; entities: { company: string; date: string; total: string } } };
async function fetchOk(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (response.ok) return response;
    if (![429, 502, 503, 504].includes(response.status) || attempt === 2) throw new Error(`Public dataset request failed: HTTP ${response.status}`);
    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error("Public dataset request exhausted retries");
}
const metadata = await (await fetchOk(`https://huggingface.co/api/datasets/${dataset}`)).json() as { sha: string };
type Result = { offset: number; key: string; imageFile: string; sha256: string; company: string;
  confidence: number | null | undefined; fields: { field: string; expected: string; suggested: string | null; exactSuggestion: boolean; rawContainsValue: boolean }[];
  suggestions: ReturnType<typeof suggestFields>; text: string; rejection?: string; allSuggestionsRequireReview: boolean };
const results: Result[] = [];
const engineHash = createHash("sha256").update(await readFile(new URL("../artifacts/api-server/src/lib/document-ocr.ts", import.meta.url)))
  .update(await readFile(new URL("../artifacts/api-server/src/lib/document-readiness.ts", import.meta.url))).digest("hex");
try {
  const saved = JSON.parse(await readFile(resolve(directory, "results.json"), "utf8"));
  if (saved.dataset !== dataset || saved.revision !== metadata.sha || saved.engineHash !== engineHash) throw new Error("Existing results belong to a different source or engine");
  results.push(...saved.results);
  console.log(`Resuming ${results.length} completed samples; no OCR rerun for these rows`);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const normalized = (value: string) => value.toUpperCase().replace(/\s+/g, " ").trim();
for (const offset of offsets) {
  if (results.some(result => result.offset === offset)) continue;
  const query = new URLSearchParams({ dataset, config: "default", split: "test", offset: String(offset), length: "1" });
  const payload = await (await fetchOk(`https://datasets-server.huggingface.co/rows?${query}`)).json() as { rows: Row[] };
  const sample = payload.rows[0];
  if (sample?.row_idx !== offset) throw new Error("Unexpected dataset row; do not silently substitute samples");
  const imageUrl = new URL(sample.row.image.src);
  if (imageUrl.protocol !== "https:" || !imageUrl.hostname.endsWith(".huggingface.co")) throw new Error("Unexpected public image host");
  const bytes = Buffer.from(await (await fetchOk(imageUrl.href)).arrayBuffer());
  const imageFile = `receipt-${offset}.jpg`;
  await writeFile(resolve(directory, imageFile), bytes);
  let pages: Awaited<ReturnType<typeof extractScan>> = [];
  let rejection: string | undefined;
  try { pages = await extractScan(bytes, false); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes("12 megapixels")) throw error;
    rejection = error.message;
  }
  const suggestions = suggestFields(pages);
  const values = Object.fromEntries(suggestions.map(s => [s.field, s.value]));
  const expected = { date: sample.row.entities.date, amount: sample.row.entities.total };
  const raw = normalized(pages.map(p => p.text).join("\n"));
  const fields = Object.entries(expected).map(([field, value]) => ({ field, expected: value,
    suggested: values[field] ?? null,
    exactSuggestion: normalized(values[field] ?? "") === normalized(value),
    rawContainsValue: raw.includes(normalized(value)),
  }));
  const result = { offset, key: sample.row.key, imageFile, sha256: createHash("sha256").update(bytes).digest("hex"),
    company: sample.row.entities.company, confidence: pages[0]?.confidence,
    fields, suggestions, rejection, text: pages.map(p => p.text).join("\n"),
    allSuggestionsRequireReview: suggestions.every(s => s.requiresReview === true) };
  results.push(result);
  console.log(JSON.stringify({ offset, key: result.key, confidence: result.confidence, rejection, fields }));
  await writeFile(resolve(directory, "results.json"), JSON.stringify({
    measuredAt: new Date().toISOString(), dataset, revision: metadata.sha, engineHash, source,
    attribution: "Huang et al., ICDAR2019 SROIE; Hugging Face distribution by jsdnrs, CC-BY-4.0",
    license: "https://creativecommons.org/licenses/by/4.0/", split: "test", plannedOffsets: offsets,
    completed: results.length, results,
    limits: "Convenience sample of public printed Malaysian receipts, not Nigerian clearing documents or handwriting. Raw value occurrence is not semantic field extraction. No universal accuracy claim.",
  }, null, 2));
}
console.log(JSON.stringify({ completed: results.length, rejected: results.filter(r => r.rejection).length,
  evaluatedFields: results.filter(r => !r.rejection).length * 2,
  rawValueMatches: results.flatMap(r => r.fields).filter(f => f.rawContainsValue).length,
  exactSuggestions: results.flatMap(r => r.fields).filter(f => f.exactSuggestion).length,
  allSuggestionsRequireReview: results.every(r => r.allSuggestionsRequireReview) }));
