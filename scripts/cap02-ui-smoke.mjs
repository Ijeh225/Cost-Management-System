// Local production frontend, intercepted API fixtures, no external requests.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const root = resolve(import.meta.dirname, "../artifacts/cost-analysis/dist/public");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = pathname.startsWith("/assets/") ? resolve(root, `.${pathname}`) : resolve(root, "index.html");
  if (!file.startsWith(`${root}${sep}`)) { res.writeHead(403).end(); return; }
  try { res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html" })[extname(file)] ?? "application/octet-stream"); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], writes = []; let reviewer = true;
  page.on("pageerror", e => { errors.push(e.message); console.error(e.message); });
  const c = { id: 32, branchId: 1, shipmentId: null, containerNumber: "CAP02-QA", blNumber: "CAP02-BL", customerName: "QA",
    status: "registered", isLocked: false, lockedSections: [], clearingCharges: 0, totalCost: 0, grossProfit: 0 };
  const doc = { id: 1, containerId: 32, documentType: "release", issuer: "QA", expiresOn: null, previousVersionId: null,
    versionNumber: 1, retained: 1, originalName: "scan.txt", mimeType: "text/plain", size: 99, uploadedById: 1,
    uploaderName: "QA", createdAt: "2026-10-05T12:00:00Z", review: null, intelligence: { status: "indexed" } };
  const data = { configured: false, ready: false, items: [], profiles: [], applications: [], documents: [doc], history: [] };
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let result = []; const method = route.request().method();
    if (method !== "GET") writes.push(url.pathname);
    if (url.pathname === "/api/auth/setup-required") result = { required: false };
    else if (url.pathname === "/api/auth/csrf") result = { token: "fixture" };
    else if (url.pathname === "/api/auth/me") result = { id: 1, name: "QA", isActive: true, email: "qa@example.test", branchId: 1, role: "super_admin",
      accessProfile: { source: "modern", authorityLevel: "super_admin", jobFunction: "general_staff", workspaces: [], errors: [] } };
    else if (url.pathname === "/api/branches") result = [{ id: 1, name: "QA", isActive: true }];
    else if (url.pathname === "/api/containers/32") result = { container: c, charges: { shipping: {},customs: {},terminal: {},delivery: {},operations: {},extraCharges: [],totalCost: 0 }, sectionApprovals: [] };
    else if (url.pathname === "/api/containers/32/documents") result = [doc];
    else if (url.pathname === "/api/containers/32/shipment") result = { shipmentId: null, branchId: 1, blNumber: c.blNumber, total: 1, delivered: 0, completed: 0, containers: [c] };
    else if (url.pathname.endsWith("/document-readiness/profiles")) {
      data.profiles.push({ ...route.request().postDataJSON(), id: 1 }); result = data.profiles[0];
    } else if (url.pathname.endsWith("/document-readiness/apply")) {
      data.configured = true; data.items = [{ documentType: "release", status: "received", documentIds: [1] }];
      data.applications = [{ application: { id: 1, createdAt: doc.createdAt }, profile: data.profiles[0], appliedByName: "QA" }]; result = { id: 1 };
    } else if (url.pathname.endsWith("/document-readiness/1/review")) {
      const body = route.request().postDataJSON();
      assert.equal(body.sourceChecked, true); assert.equal(body.acceptedFields.amount, "NGN500.00");
      doc.review = { ...body, id: 1, documentId: 1, acceptedFields: JSON.stringify(body.acceptedFields), createdAt: doc.createdAt };
      data.history = [{ review: doc.review, reviewerName: "QA" }];
      data.ready = true; data.items[0].status = "reviewed"; result = doc.review;
    } else if (url.pathname.endsWith("/document-readiness")) result = { ...data, canReview: reviewer, canConfigure: reviewer };
    else if (url.pathname.endsWith("/extraction")) result = { status: "indexed", pages: [{ page: 1, text: "Amount: NGN5O0.O0", confidence: 45 }],
      suggestions: [{ field: "amount", value: "NGN5O0.O0", page: 1, confidence: 45 }] };
    else if (url.pathname.endsWith("/overview")) { await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Fixture scope"}' }); return; }
    else if (url.pathname === "/api/settings") result = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });
  await page.goto(`${origin}/containers/32?tab=documents`);
  try { await page.getByText("Document readiness", { exact: true }).waitFor({ timeout: 10000 }); }
  catch (error) { console.error(await page.locator("body").innerText()); throw error; }
  const download = page.getByRole("button", { name: "Download scan.txt (version 1)", exact: true });
  assert.equal(await download.getAttribute("type"), "button");
  assert.match(await download.getAttribute("title"), /new tab/);
  for (const key of ["Enter", "Space"]) {
    await download.focus();
    const popupPromise = page.waitForEvent("popup");
    await download.press(key);
    const popup = await popupPromise;
    await popup.waitForURL(`${origin}/api/documents/1`);
    await popup.close();
  }
  assert.deepEqual(writes, [], "Download keyboard actions do not submit a form or write data");
  await page.getByText("Configure requirements", { exact: true }).click();
  await page.getByLabel("Profile name", { exact: true }).fill("General import");
  await page.getByLabel("Job type", { exact: true }).fill("Import");
  await page.getByLabel("Cargo type", { exact: true }).fill("General");
  await page.getByRole("checkbox", { name: "Release", exact: true }).check();
  await page.getByRole("button", { name: "Save new profile", exact: true }).click();
  await page.getByLabel("Job/cargo profile", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Apply to this visit", exact: true }).click();
  await page.getByText("received", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Use amount suggestion", exact: true }).waitFor();
  assert.equal(await dialog.getByLabel("Verified amount", { exact: true }).inputValue(), "", "OCR is not silently accepted");
  assert.equal(await dialog.getByRole("button", { name: "Mark reviewed" }).isEnabled(), false);
  await dialog.getByRole("button", { name: "Use amount suggestion" }).click();
  await dialog.getByLabel("Verified amount", { exact: true }).fill("NGN500.00");
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await dialog.evaluate(async el => { await Promise.all(el.getAnimations().map(a => a.finished)); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    const box = await dialog.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `Dialog outside viewport ${width}: ${JSON.stringify(box)}`);
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true, `Dialog content overflow ${width}`);
    if (width === 390 || width === 1440) await page.screenshot({ path: resolve(tmpdir(), `cap02-review-${width}.png`) });
  }
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByText("Required documents reviewed and current", { exact: true }).waitFor();
  assert.equal(data.history.length, 1);
  reviewer = false;
  await page.reload();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  assert.equal(await page.getByRole("button", { name: "Mark reviewed" }).isEnabled(), false);
  assert.equal(await page.getByText("Configure requirements", { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, ["/api/containers/32/document-readiness/profiles", "/api/containers/32/document-readiness/apply", "/api/containers/32/document-readiness/1/review"]);
  console.log("PASS: named download button and Enter/Space navigation; profile application, low-confidence manual correction, required confirmation, ready refresh, read-only review, mobile/desktop dialog; no financial writes");
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
