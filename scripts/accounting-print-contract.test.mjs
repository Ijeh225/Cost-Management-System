import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

// Structural guards complement, but do not replace, actual native PDF review.
const source = readFileSync(new URL("../artifacts/cost-analysis/src/pages/accounting/index.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("accounting.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(ast);
const elements = nodes.filter(ts.isJsxElement);
const tag = node => node.openingElement.tagName.getText(ast);
const attribute = (node, name) => node.openingElement.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(ast) === name);
const contextRows = elements.filter(node => tag(node) === "tr" && attribute(node, "data-ledger-account"));
const frontendRequire = createRequire(new URL("../artifacts/cost-analysis/package.json", import.meta.url));
const viteRequire = createRequire(realpathSync(frontendRequire.resolve("vite/package.json")));
const postcss = viteRequire("postcss");
const React = frontendRequire("react");
const { renderToStaticMarkup } = frontendRequire("react-dom/server");
const printLiteral = nodes.find(node => ts.isNoSubstitutionTemplateLiteral(node) && node.text.startsWith("@media print"));
assert.ok(printLiteral, "Accounting report print styles must remain available");
const css = postcss.parse(printLiteral.text);
const declarations = (selector, property) => {
  const result = [];
  css.walkRules(selector, rule => rule.walkDecls(property, d => result.push(d.value)));
  return result;
};

test("Ledger account context is one row inside the actual repeating table header", () => {
  assert.equal(contextRows.length, 1);
  const row = contextRows[0];
  assert.equal(tag(row.parent), "thead");
  const cell = row.children.find(node => ts.isJsxElement(node) && tag(node) === "th");
  assert.equal(attribute(cell, "colSpan").initializer.expression.getText(ast), "6");
  assert.match(row.getText(ast), /<h3\b/);
  for (const value of ["a.code", "a.name", "a.category", "a.opening", "a.closing"]) {
    assert.ok(row.getText(ast).includes(value), `${value} must travel with the account header`);
  }
  assert.equal((source.match(/Opening signed balance:/g) || []).length, 1, "Do not duplicate account balances outside the table");
});

test("Print repeats and keeps the full account-and-column header together", () => {
  assert.deepEqual(declarations("#native-accounting-report thead", "display"), ["table-header-group"]);
  assert.deepEqual(declarations("#native-accounting-report thead", "break-inside"), ["avoid"]);
  assert.deepEqual(declarations("#native-accounting-report thead", "break-after"), ["avoid"]);
});

test("Ledger closing totals are the last normal body row, never a repeating footer", () => {
  const totals = elements.filter(node => tag(node) === "tr" && attribute(node, "data-ledger-total"));
  assert.equal(totals.length, 1);
  const row = totals[0], body = row.parent;
  assert.equal(tag(body), "tbody");
  assert.equal(body.children.filter(ts.isJsxElement).at(-1), row);
  assert.ok(body.getText(ast).includes("a.entries.map"), "Transactions and final total share one body, including empty accounts");
  assert.equal(tag(body.parent), "table");
  assert.equal(body.parent.children.filter(ts.isJsxElement).some(node => tag(node) === "tfoot"), false);
  for (const value of ["a.debit", "a.credit", "a.closing"]) assert.ok(row.getText(ast).includes(value));
});

test("Only empty ledger sections stay whole; real multi-page accounts can flow", () => {
  const section = elements.find(node => tag(node) === "section" && attribute(node, "data-ledger-empty"));
  assert.ok(section);
  assert.equal(attribute(section, "data-ledger-empty").initializer.expression.getText(ast), "a.entries.length===0");
  assert.deepEqual(declarations('#native-accounting-report [data-ledger-empty="true"]', "break-inside"), ["avoid"]);
  assert.deepEqual(declarations("#native-accounting-report [data-ledger-empty] tbody > tr:first-child", "break-before"), ["avoid"]);
  assert.deepEqual(declarations("#native-accounting-report [data-ledger-empty]", "break-inside"), []);
});

// Render the actual snapshot functions, not a second hand-written report template.
const declarationsForRender = ast.statements.filter(node =>
  ts.isFunctionDeclaration(node) && ["Value", "ReportSnapshot"].includes(node.name?.text) ||
  ts.isVariableStatement(node) && node.declarationList.declarations.some(d => ["money", "reportTitle"].includes(d.name.getText(ast)))
).map(node => node.getText(ast)).join("\n");
const compiled = ts.transpileModule(declarationsForRender, {
  compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const ActualSnapshot = new Function("React", "formatAccountingMoney", "Link", "AlertTriangle", "StatementSnapshot",
  `${compiled}; return ReportSnapshot;`)(React,
  value => Number(value).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  ({ children, ...props }) => React.createElement("a", props, children),
  () => React.createElement("svg"),
  () => { throw Error("Unexpected statement report in ledger fixture"); });

for (const count of [0, 1, 120]) {
  test(`Actual rendered ledger preserves ${count} entries and exactly one closing row per account`, () => {
    const rows = Array.from({ length: 28 }, (_, i) => ({
      id: i + 1, code: String(1000 + i), name: `Retained test account ${i} & branch`, category: "asset", active: i !== 27,
      opening: "0.00", debit: "0.00", credit: "0.00", closing: "0.00",
      entries: i === 1 ? Array.from({ length: count }, (_, n) => ({
        id: n + 1, date: "2026-10-14", journalId: n + 1, eventKey: `source:retained:${n + 1}:v1`,
        branchId: 2, narration: `Transaction ${n + 1} / long wrapping narration`, memo: "Original memo, not a new payment",
        debit: "0.01", credit: "0.00", balance: "0.01",
      })) : [],
    }));
    const report = { kind: "general-ledger", book: { name: "TEST ONLY", currency: "NGN", policyVersion: "test-v1", cutoverDate: "2026-10-14" },
      filter: { from: "2026-10-14", includeZero: true, includeInactive: false }, asOf: "2026-10-14", generatedAt: "retained-snapshot",
      scope: "whole_book", branches: [{ name: "Lagos" }], warnings: ["Independent source controls not supplied"], balanced: true,
      totals: { debit: "0.00", credit: "0.00", closingDifference: "0.00" }, coverage: [], rows };
    const before = JSON.stringify(report);
    const html = renderToStaticMarkup(React.createElement(ActualSnapshot, { report, onJournal: () => { throw Error("Read-only render"); } }));
    assert.equal((html.match(/data-ledger-total=/g) ?? []).length, 28);
    assert.equal((html.match(/Period movements \/ closing/g) ?? []).length, 28);
    assert.equal((html.match(/<tfoot\b/g) ?? []).length, 0);
    assert.equal((html.match(/>Journal #/g) ?? []).length, count);
    assert.equal((html.match(/data-ledger-empty="true"/g) ?? []).length, count ? 27 : 28);
    assert.ok(html.includes("Independent source controls not supplied"));
    for (let n = 1; n <= count; n++) assert.equal(html.split(`source:retained:${n}:v1`).length - 1, 1);
    assert.equal(JSON.stringify(report), before, "Layout must not mutate the accounting snapshot");
  });
}

test("Print still prevents split transaction rows and wide-table clipping", () => {
  assert.deepEqual(declarations("#native-accounting-report tr", "break-inside"), ["avoid"]);
  assert.deepEqual(declarations("#native-accounting-report .report-table", "overflow"), ["visible"]);
  assert.deepEqual(declarations("#native-accounting-report table", "min-width"), ["0"]);
});
