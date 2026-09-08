// Run after railway:build. All API responses are local fixtures; no live writes.
// Set PLAYWRIGHT_MODULE_PATH to a bundled playwright index.mjs if not installed.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";

const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH ?? process.argv[2];
const { chromium } = await import(playwrightPath ? pathToFileURL(playwrightPath).href : "playwright");
const root = resolve(import.meta.dirname, "../artifacts/cost-analysis/dist/public");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = pathname.startsWith("/assets/") ? resolve(root, `.${pathname}`) : resolve(root, "index.html");
  if (!file.startsWith(`${root}${sep}`)) { res.writeHead(403).end(); return; }
  try {
    const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2" };
    res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
const requested = new Set();
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const jobs = [31, 32].map(id => ({
    id, containerNumber: `QA-DOC-${id}`, blNumber: `QA-BL-${id}`, customerName: "Documentation QA",
    daysInStage: 0, stageOwnerName: "", paarNumber: "", duty: 0,
  }));
  const invoices = [
    { id: 1, status: "draft", total: 180, totalPaid: 0, outstanding: 180 },
    { id: 2, status: "sent", total: 1000, totalPaid: 0, outstanding: 1000 },
    { id: 3, status: "cancelled", total: 500, totalPaid: 0, outstanding: 500 },
  ].map(invoice => ({ ...invoice, invoiceNumber: `QA-INV-${invoice.id}`, clientName: "Invoice QA", items: [] }));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    requested.add(url.pathname);
    assert.equal(route.request().method(), "GET", "Smoke test must not write data");
    let data = [];
    switch (url.pathname) {
      case "/api/auth/setup-required": data = { required: false }; break;
      case "/api/auth/me": data = {
        id: 1, name: "Local QA", email: "qa@example.test", role: "super_admin", branchId: 1,
        accessProfile: { source: "modern", authorityLevel: "super_admin", jobFunction: "general_staff", workspaces: [], errors: [] },
      }; break;
      case "/api/branches": data = [{ id: 1, name: "QA Branch", isActive: true }]; break;
      case "/api/containers/pipeline": data = { stages: { documentation: jobs } }; break;
      case "/api/invoices": data = invoices; break;
      case "/api/settings": data = {}; break;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });

  await page.goto(`${origin}/documentation`);
  const first = page.getByRole("button", { name: /QA-DOC-31/ });
  await first.waitFor();
  await first.focus();
  await page.keyboard.press("Enter");
  assert.equal(await first.getAttribute("aria-expanded"), "true");
  for (const label of ["Stage Owner", "PAAR Number", "PAAR ETA", "PAAR Release Date", "Assessment Amount", "PAAR Delay Reason", "General Delay Reason"]) {
    const input = page.getByLabel(new RegExp(`^${label}`)).first();
    assert.equal(await input.count(), 1, `Missing accessible field: ${label}`);
    const id = await input.getAttribute("id");
    assert.ok(id);
    await page.locator("label").filter({ hasText: new RegExp(`^${label}`) }).first().click();
    assert.equal(await input.evaluate(el => el === document.activeElement), true, `Label does not focus ${label}`);
  }
  await first.focus();
  await page.keyboard.press("Space");
  assert.equal(await first.getAttribute("aria-expanded"), "false");
  await page.keyboard.press("Tab");
  const second = page.getByRole("button", { name: /QA-DOC-32/ });
  assert.equal(await second.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Enter");
  await first.click();
  const ids = await page.locator("input[id], textarea[id]").evaluateAll(inputs => inputs.map(input => input.id));
  assert.equal(new Set(ids).size, ids.length, "Repeated cards must have unique field IDs");
  console.log("PASS Documentation: Enter/Space, Tab, seven linked labels, unique card IDs");

  await page.goto(`${origin}/invoices`);
  for (const [label, value] of [["Issued Outstanding", "1,000.00"], ["Draft Value", "180.00"]]) {
    const heading = page.getByText(label, { exact: true });
    await heading.waitFor();
    assert.ok((await heading.locator("..").innerText()).includes(value), `${label} must show ${value}`);
  }
  assert.equal(await page.getByText("QA-INV-1", { exact: true }).count(), 1, "Draft remains manageable in list");
  console.log("PASS Invoice summary: 1000 issued, 180 draft, cancelled excluded, draft retained");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Invoice page overflow at ${width}px`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS Invoice responsive widths 390/768/1440; no uncaught page errors");
  console.log("Fixture API routes:", [...requested].join(", "));
} catch (error) {
  console.error("Fixture API routes:", [...requested].join(", "));
  if (page) console.error("Page:", page.url(), (await page.locator("body").innerText()).slice(0, 4000));
  throw error;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
