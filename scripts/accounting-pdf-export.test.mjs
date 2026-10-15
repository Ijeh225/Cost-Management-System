import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const frontendRequire = createRequire(resolve(root, "artifacts/cost-analysis/package.json"));
const serverRequire = createRequire(resolve(root, "artifacts/api-server/package.json"));
const { buildSync } = serverRequire("esbuild");
function load(path, require = frontendRequire) {
  const code = buildSync({ entryPoints: [resolve(root, path)], bundle: true, platform: "node", format: "cjs", packages: "external", write: false }).outputFiles[0].text;
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(module, module.exports, require);
  return module.exports;
}
const { accountingPdfModel, createAccountingPdf } = load("artifacts/cost-analysis/src/lib/accountingPdf.ts");
const { downloadCurrentAccountingPdf } = load("artifacts/cost-analysis/src/lib/accountingPdfDownload.ts");
const { buildAccountingReport } = load("artifacts/api-server/src/lib/accounting-reports.ts", serverRequire);
const { buildAccountingStatements } = load("artifacts/api-server/src/lib/accounting-statements.ts", serverRequire);
const accounts = [
  ["1000", "Cash", "asset"], ["2100", "Client deposits", "liability"], ["4000", "Clearing revenue", "income"],
  ["6000", "Direct expense", "expense"], ["1100", "Receivables", "asset"], ["2000", "Payables", "liability"], ["3000", "Capital", "equity"],
].map(([code, name, category], i) => ({ id: i + 1, code, name, category, active: true }));
const filter = { from: "2026-10-14", to: "2026-10-14", includeZero: true, includeInactive: false };
const facts = [];
let journal = 0;
function add(kind, id, lines, extra = {}, mapping = {}) {
  journal++;
  const source = { kind, id, ...extra };
  for (const [accountId, debitMinor, creditMinor] of lines) facts.push({
    id: facts.length + 1, accountId, journalId: journal, branchId: 2, date: filter.from, status: "posted", kind: "standard",
    eventKey: `source:${kind}:${id}:v1`, narration: `Retained ${kind} #${id}`, memo: "Dummy PDF fixture only; no database or network",
    debitMinor, creditMinor, evidence: JSON.stringify({ source, mapping }),
  });
}
const mapping = { cashAccountId: 1, receivableAccountId: 5, depositLiabilityAccountId: 2 };
add("bank_funding", 1, [[1, "100000", "0"], [7, "0", "100000"]], {}, { ...mapping, effect: "equity_funding" });
add("invoice", 1, [[5, "10000", "0"], [3, "0", "10000"]], { clientId: 6, dueDate: "2026-10-20", items: [{ id: 1, containerId: 32 }, { id: 2, containerId: 33 }] },
  { ...mapping, items: [{ itemId: 1, splits: [{ treatment: "income", amount: "60.00" }] }, { itemId: 2, splits: [{ treatment: "income", amount: "40.00" }] }] });
add("invoice_payment", 20, [[1, "4000", "0"], [5, "0", "4000"]], { invoiceId: 1 }, mapping);
add("client_deposit", 5, [[1, "3000", "0"], [2, "0", "3000"]], {}, mapping);
add("invoice_payment", 21, [[2, "3000", "0"], [5, "0", "3000"]], { invoiceId: 1 }, mapping);
add("overhead", 1, [[4, "2000", "0"], [6, "0", "2000"]], { expenseId: 1 }, { effect: "overhead", controlAccountId: 6 });
for (let i = 0; i < 36; i++) add("client_deposit", 100 + i, [[1, "1", "0"], [2, "0", "1"]], {}, mapping);

function report(kind = "general-ledger") {
  const base = buildAccountingReport(accounts, facts, filter, kind);
  const statements = ["balance-sheet", "management-accounts"].includes(kind) ? buildAccountingStatements(accounts, facts, filter, "12-31", [
    { id: 32, branchId: 2, name: "Shared B/L A", revenue: "60.00", cost: null },
    { id: 33, branchId: 2, name: "Shared B/L B", revenue: "40.00", cost: "0.00" },
  ]) : undefined;
  return { ...base, statements, book: { id: 1, name: "PDF TEST ONLY - not official books", currency: "NGN", cutoverDate: filter.from, policyVersion: "pdf-dummy-v1" },
    branches: [{ id: 2, name: "Dummy Lagos" }], scope: "branch", asOf: filter.to, generatedAt: "2026-10-15T16:20:00.000Z", sourceCompletenessConfirmed: false, limit: 50000, truncated: false,
    warnings: ["Incomplete independent source controls", ...(statements?.warnings ?? [])], coverage: [{ branchId: 2, counts: { review_required: 1 }, exceptionCount: 1,
      exceptionsTruncated: false, independentControlsVerified: false, missingControlAccountIds: [1, 5], exceptions: [{ date: filter.from, eventKey: "source:schedule_payment:99:v1", kind: "schedule_payment", id: 99, status: "review_required", reason: "Historical classification is unknown; not guessed." }] }] };
}
const affairs = { id: 1, state: "approved", preparedBy: 1, reviewedBy: 2, createdAt: "2026-10-14T12:00:00Z", reviewedAt: "2026-10-14T13:00:00Z", replacesId: null, superseded: false,
  decisionReason: "Independent dummy valuation review", payload: { bookId: 1, branchId: 2, currency: "NGN", warnings: ["Unknown carrying amounts are not zero balances"],
    request: { requestId: "pdf_dummy_20261015", title: "PDF TEST ONLY valuation", asOf: filter.from, scopeEvidence: "Fictional equipment and supplier schedules", limitations: "Incomplete test records; no statutory certification", lines: [
      { key: "equipment", category: "asset", name: "Dummy equipment", value: "100.01", bookValue: null, basis: "estimate", basisExplanation: "Fictional survey estimate", evidence: "Retained fictional survey" },
      { key: "supplier", category: "liability", name: "Dummy supplier", value: "20.00", bookValue: "20.00", basis: "book", basisExplanation: "Declared carrying amount", evidence: "Retained fictional confirmation" },
    ] }, totals: { assets: "100.01", liabilities: "20.00", netAssets: "80.01", declaredBookAssets: "0.00", declaredBookLiabilities: "20.00", estimatedLines: 1, unknownBookValues: 1 } },
  audit: [{ actorId: 1, action: "affairs_prepared", reason: "Dummy equipment scope", createdAt: "2026-10-14T12:00:00Z" }, { actorId: 2, action: "affairs_approved", reason: "Independent evidence", createdAt: "2026-10-14T13:00:00Z" }] };
const allRows = model => model.sections.flatMap(s => s.rows);

test("All four reports preserve the exact authorised applied snapshot, warnings and source exceptions", () => {
  for (const kind of ["general-ledger", "trial-balance", "balance-sheet", "management-accounts"]) {
    const source = report(kind), before = JSON.stringify(source), model = accountingPdfModel(source);
    assert.ok(model.filename.includes(`${kind}_1_2026-10-14_2026-10-14`));
    assert.ok(model.context.some(row => row.includes(source.generatedAt)));
    assert.ok(model.context.some(row => row.join(" ").includes("Dummy Lagos (#2)")));
    assert.ok(model.warnings.includes(source.warnings[0]));
    assert.ok(JSON.stringify(allRows(model)).includes("source:schedule_payment:99:v1"));
    assert.ok(JSON.stringify(allRows(model)).includes("Historical classification is unknown; not guessed."));
    createAccountingPdf(source);
    assert.equal(JSON.stringify(source), before, "Export must never mutate source data");
  }
});

test("General Ledger contains each original transaction exactly once and no duplicate total per page", () => {
  const source = report(), model = accountingPdfModel(source);
  const tables = model.sections.filter(s => s.headers.includes("Running Dr (+) / Cr (-)"));
  assert.equal(tables.length, source.rows.length);
  for (let i = 0; i < tables.length; i++) {
    assert.equal(tables[i].rows.length, source.rows[i].entries.length + 1);
    assert.ok(tables[i].title.includes("Opening signed balance:"));
    assert.equal(tables[i].rows.filter(r => r[0] === "Period movements / closing").length, 1);
    for (const entry of source.rows[i].entries) assert.equal(tables[i].rows.filter(r => r[1].includes(`Journal #${entry.journalId}\n${entry.eventKey}\n`)).length, 1);
  }
});

test("Management uses existing posted totals and item allocations, without counting deposits or invoice totals twice", () => {
  const source = report("management-accounts"), model = accountingPdfModel(source);
  const performance = model.sections.find(s => s.title === "Accrual Performance");
  assert.deepEqual(performance.rows.slice(1), [["Income", "100.00"], ["Expenses", "20.00"], ["Net profit", "80.00"]]);
  const jobs = model.sections.find(s => s.title.startsWith("Job Performance"));
  assert.deepEqual(jobs.rows.map(r => r[1]), ["60.00", "40.00"]);
  assert.ok(jobs.rows.some(r => r.includes("Not available")), "Unknown budgets must remain unavailable");
  for (const heading of ["Cash Source Drilldown", "Profit Bridge Controls", "Receivables Aging Buckets", "Payables Source Balances"]) assert.ok(model.sections.some(s => s.title === heading));
});

test("Large and signed decimal strings retain cents; empty and truncated snapshots stay explicit", () => {
  const source = report("trial-balance");
  source.totals.debit = "9999999999999999.99";
  source.rows[0].closingSides.credit = "9999999999999999.99";
  source.totals.closingDifference = "-0.01";
  source.truncated = true;
  const model = accountingPdfModel(source);
  assert.ok(JSON.stringify(model).includes("9,999,999,999,999,999.99"));
  assert.ok(JSON.stringify(model).includes("-0.01"));
  assert.ok(model.warnings.some(w => w.startsWith("SOURCE SNAPSHOT TRUNCATED")));
  assert.ok(accountingPdfModel({ ...report(), rows: [] }).sections.some(s => s.title === "No Matching Accounts"));
  assert.throws(() => accountingPdfModel({ ...report("balance-sheet"), statements: undefined }), /unavailable/);
});

test("Affairs export preserves version, decision, unknown-versus-zero, historical state and original audit", () => {
  const model = accountingPdfModel(affairs), data = JSON.stringify(model);
  for (const expected of ["80.01", "Unknown (not zero)", "Independent dummy valuation review", "affairs_prepared", "affairs_approved", "Fictional equipment and supplier schedules"]) assert.ok(data.includes(expected));
  assert.ok(accountingPdfModel({ ...affairs, state: "pending", superseded: true, reviewedAt: null, reviewedBy: null }).identity.includes("PENDING - HISTORICAL / SUPERSEDED"));
});

test("Scope change, disable or unmount cancels a lazy export before building or saving", async () => {
  for (const state of ["changed scope", "disabled", "unmounted"]) {
    let current = true, resume, built = 0, saved = 0;
    const running = downloadCurrentAccountingPdf(report(), () => current, () => new Promise(done => { resume = done; }));
    current = false;
    resume({ createAccountingPdf: () => { built++; return { filename: state, document: { save: () => { saved++; } } }; } });
    assert.equal(await running, false);
    assert.equal(built, 0); assert.equal(saved, 0);
  }
});

test("Current snapshot saves once; download failures propagate rather than reporting success", async () => {
  const source = report(); let saved = 0;
  assert.equal(await downloadCurrentAccountingPdf(source, () => true, async () => ({ createAccountingPdf: value => {
    assert.equal(value, source); return { filename: "exact.pdf", document: { save: (filename, options) => { saved++; assert.equal(filename, "exact.pdf"); assert.deepEqual(options, { returnPromise: true }); } } };
  } })), true);
  assert.equal(saved, 1);
  await assert.rejects(downloadCurrentAccountingPdf(source, () => true, async () => { throw new Error("PDF library unavailable"); }), /library unavailable/);
  await assert.rejects(downloadCurrentAccountingPdf(source, () => true, async () => ({ createAccountingPdf: () => ({ filename: "fail.pdf", document: { save: () => { throw new Error("Save failed"); } } }) })), /Save failed/);
});

test("Actual exporter generates five inspectable PDFs with repeated table headers and full page numbering", async () => {
  const out = resolve(root, "tmp/pdfs/accounting-download-fixtures");
  await mkdir(out, { recursive: true });
  for (const source of [report(), report("trial-balance"), report("balance-sheet"), report("management-accounts"), affairs]) {
    const before = JSON.stringify(source), pdf = createAccountingPdf(source);
    const bytes = Buffer.from(pdf.document.output("arraybuffer"));
    assert.ok(bytes.subarray(0, 8).toString().startsWith("%PDF-"));
    assert.ok(pdf.document.getNumberOfPages() >= 1);
    if ("kind" in source && source.kind === "general-ledger") assert.ok(pdf.document.getNumberOfPages() > 2);
    await writeFile(resolve(out, pdf.filename), bytes);
    await writeFile(resolve(out, `${pdf.filename}.model.json`), JSON.stringify(accountingPdfModel(source), null, 2));
    assert.equal(JSON.stringify(source), before);
  }
  const button = await readFile(resolve(root, "artifacts/cost-analysis/src/pages/accounting/pdf-download.tsx"), "utf8");
  assert.match(button, /useLayoutEffect/); assert.match(button, /latest\.current\.source === selected/);
  assert.match(button, /disabled=\{disabled \|\| busy\}/); assert.match(button, /role="alert"/);
  const renderer = await readFile(resolve(root, "artifacts/cost-analysis/src/lib/accountingPdf.ts"), "utf8");
  assert.match(renderer, /pageBreak: "avoid", rowPageBreak: "avoid", showHead: "everyPage"/);
});
