// Production frontend against local API fixtures only. No external network/data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(process.argv[2]).href);
const root = resolve(import.meta.dirname, "../artifacts/cost-analysis/dist/public");
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const file = pathname.startsWith("/assets/") ? resolve(root, `.${pathname}`) : resolve(root, "index.html");
  if (!file.startsWith(`${root}${sep}`)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html" })[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = []; const writes = []; let owner = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem("cost_analysis_active_branch", "1"));
  const rows = [31,32,33].map((id,index) => ({ id, branchId: 1, shipmentId: 5, containerNumber: `QA-BOX-${id}`, blNumber: "QA-SHARED-BL",
    customerName: "QA", status: index === 0 ? "closed" : "shipping", size: "40FT", vessel: "QA vessel", command: "PTML", isLocked: false,
    deliveredAt: index === 0 ? "2026-09-09T10:00:00Z" : null, createdAt: "2026-09-09T09:00:00Z", updatedAt: "2026-09-09T09:00:00Z",
    verificationOfficerIds: [1], verificationOfficerName: "QA", transireStageOwner: `Transire ${id}`, shippingStageOwner: `Shipping ${id}`, lockedSections: [], clearingCharges: 0, totalCost: 0, grossProfit: 0 }));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    let data = []; const method = route.request().method();
    if (method !== "GET") writes.push({ path: url.pathname, body: route.request().postDataJSON() });
    if (url.pathname === "/api/auth/setup-required") data = { required: false };
    else if (url.pathname === "/api/auth/csrf") data = { token: "local-fixture" };
    else if (url.pathname === "/api/auth/me") data = { id: 1, name: "QA", email: "qa@example.test", branchId: 1, canUpload: true,
      role: owner ? "super_admin" : "shipping_user",
      accessProfile: { source: "modern", authorityLevel: owner ? "super_admin" : "staff", jobFunction: owner ? "general_staff" : "operations", workspaces: owner ? [] : ["shipping"], errors: [] } };
    else if (url.pathname === "/api/branches") data = [{ id: 1, name: "QA Branch", isActive: true }];
    else if (/^\/api\/containers\/\d+\/overview$/.test(url.pathname)) {
      // CAP-04 smoke isolates shipment behavior; the shared CAP-01 panel has its own fixture suite.
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Overview outside CAP-04 fixture scope"}' }); return;
    }
    else if (/^\/api\/containers\/\d+\/shipment$/.test(url.pathname)) data = { shipmentId: 5, branchId: 1, blNumber: "QA-SHARED-BL", total: 3, delivered: rows.filter(row => row.deliveredAt).length, completed: rows.filter(row => row.status === "closed").length, containers: rows };
    else if (/^\/api\/containers\/\d+\/verify$/.test(url.pathname)) {
      const row = rows.find(row => row.id === Number(url.pathname.split("/").at(-2)));
      row.status = "registered"; data = row;
    }
    else if (/^\/api\/containers\/\d+$/.test(url.pathname)) {
      const row = rows.find(row => row.id === Number(url.pathname.split("/").at(-1)));
      if (method === "PATCH") { Object.assign(row, route.request().postDataJSON()); data = row; }
      else data = { container: row, charges: { shipping: {},customs: {},terminal: {},delivery: {},operations: {},extraCharges: [],totalCost: 0 }, sectionApprovals: [] };
    }
    else if (url.pathname === "/api/containers") data = { containers: rows, total: 3, page: 1, limit: 20 };
    else if (url.pathname === "/api/containers/check-duplicates") data = { existingContainerNumbers: ["QA-BOX-31"], existingBlNumbers: ["QA-SHARED-BL"], existingVisits: [{ containerNumber: "QA-BOX-31", blNumber: "QA-SHARED-BL", branchId: 1 }] };
    else if (url.pathname === "/api/containers/upload") data = { created: 2, duplicates: [], errors: [] };
    else if (url.pathname === "/api/settings") data = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(`${origin}/containers/31`);
  await page.getByText("Containers on this B/L", { exact: true }).waitFor();
  await page.getByText(/1 of 3 delivered/).waitFor();
  for (const width of [390,768,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
  }
  await page.getByRole("link", { name: /QA-BOX-32.*Visit #32/ }).click();
  await page.waitForURL("**/containers/32");
  await page.getByRole("heading", { name: "QA-BOX-32", exact: true }).waitFor();
  console.log("PASS: sibling links, independent visit navigation, partial delivery, 390/768/1440 layouts");
  owner = true;
  rows[1].status = "pending_verification";
  await page.goto(`${origin}/containers/32`);
  await page.getByRole("button", { name: "Verify Container", exact: true }).click();
  await page.getByRole("link", { name: /QA-BOX-32.*Registered.*Visit #32/ }).waitFor();
  await page.getByRole("button", { name: "Set Delivery Date", exact: true }).click();
  await page.locator('input[type="date"]').fill("2026-09-09");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/2 of 3 delivered/).waitFor();
  assert.equal(rows[2].deliveredAt, null);
  assert.equal(rows[2].status, "shipping");
  await page.getByRole("button", { name: "Edit Date", exact: true }).click();
  await page.locator('input[type="date"]').fill("");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText(/1 of 3 delivered/).waitFor();
  console.log("PASS: verification and delivery set/clear refresh shipment immediately without reload; sibling unchanged");
  await page.goto(`${origin}/containers/upload`);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({ name: "multi.csv", mimeType: "text/csv", buffer: Buffer.from(
    "CUSTOMER NAME,CON,B/LADING,COMMAND\nQA,NEW-BOX-A,QA-SHARED-BL,PTML\nQA,NEW-BOX-B,QA-SHARED-BL,PTML\nQA,QA-BOX-31,QA-SHARED-BL,PTML\n") });
  const importButton = page.getByRole("button", { name: "Import 2 Records", exact: true });
  await importButton.waitFor();
  assert.equal(await importButton.isEnabled(), true);
  assert.equal(await page.getByText("Duplicate in file", { exact: true }).count(), 0);
  await importButton.click();
  await page.getByText("Upload Complete", { exact: true }).first().waitFor();
  const upload = writes.find(write => write.path === "/api/containers/upload");
  assert.equal(upload.body.rows.length, 2);
  assert.equal(new Set(upload.body.rows.map(row => row.blNumber)).size, 1);
  assert.ok(writes.every(write => ["/api/containers/check-duplicates", "/api/containers/upload", "/api/containers/32", "/api/containers/32/verify"].includes(write.path)));
  assert.deepEqual(errors, []);
  console.log("PASS: upload accepts two different containers under an existing B/L; no browser exceptions");
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
