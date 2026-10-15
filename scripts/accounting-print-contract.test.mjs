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
});

test("Print still prevents split transaction rows and wide-table clipping", () => {
  assert.deepEqual(declarations("#native-accounting-report tr", "break-inside"), ["avoid"]);
  assert.deepEqual(declarations("#native-accounting-report .report-table", "overflow"), ["visible"]);
  assert.deepEqual(declarations("#native-accounting-report table", "min-width"), ["0"]);
});
