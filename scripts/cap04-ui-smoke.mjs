// Production frontend against local API fixtures only. No external network/data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
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
    else if (url.pathname === "/api/containers/pipeline") data = { total: 3, stages: {
      documentation: rows.map(row => ({ ...row, status: "documentation", daysInStage: 9, assignedStaffName: "QA staff", stageOwnerName: "QA owner" })),
      shipping: [{ ...rows[2], daysInStage: 16, assignedStaffName: "QA shipping" }],
    } };
    else if (url.pathname === "/api/containers") data = { containers: rows, total: 3, page: 1, limit: 20 };
    else if (url.pathname === "/api/containers/check-duplicates") data = { existingContainerNumbers: ["QA-BOX-31"], existingBlNumbers: ["QA-SHARED-BL"], existingVisits: [{ containerNumber: "QA-BOX-31", blNumber: "QA-SHARED-BL", branchId: 1 }] };
    else if (url.pathname === "/api/containers/upload") data = { created: 2, duplicates: [], errors: [] };
    else if (url.pathname === "/api/settings") data = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(`${origin}/containers/31`);
  await page.locator("#job-overview > details > summary").click();
  await page.getByText("Containers on this B/L", { exact: true }).waitFor();
  await page.getByText(/1 of 3 delivered/).waitFor();
  for (const width of [390,768,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Overflow at ${width}`);
  }
  await page.getByRole("link", { name: /QA-BOX-32.*Visit #32/ }).click();
  await page.waitForURL("**/containers/32");
  await page.getByRole("heading", { name: "QA-BOX-32", exact: true }).waitFor();
  assert.equal(await page.locator("#job-overview > details").getAttribute("open"), null, "New sibling starts collapsed");
  console.log("PASS: sibling links, independent visit navigation, partial delivery, 390/768/1440 layouts");
  owner = true;
  rows[1].status = "pending_verification";
  await page.goto(`${origin}/containers/32`);
  await page.getByRole("button", { name: "Verify Container", exact: true }).click();
  await page.locator("#job-overview > details > summary").click();
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
  // Check actual controls, not just document width: the shell hides horizontal overflow.
  rows[1].containerNumber = "CAPU2609091";
  rows[1].blNumber = "QA-LONG-UNBROKEN-BILL-OF-LADING-20260910";
  await page.goto(`${origin}/containers/32`);
  await page.getByRole("heading", { name: "CAPU2609091", exact: true }).waitFor();
  for (const width of [320,390,495,768,1440]) {
    await page.setViewportSize({ width, height: 850 });
    const header = page.getByTestId("container-header");
    await header.scrollIntoViewIfNeeded();
    for (const control of await header.locator("button").all()) {
      const box = await control.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width, `Header control clipped at ${width}`);
    }
    for (const name of ["Edit Details", "Lock", "Early Start", "Create Invoice"]) {
      await header.getByRole("button", { name, exact: true }).waitFor();
    }
    assert.equal(await header.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    if (width === 390) {
      await page.screenshot({ path: resolve(tmpdir(), "mobile-container-header.png") });
      await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); });
      await page.screenshot({ path: resolve(tmpdir(), "mobile-container-header-light.png") });
      await page.evaluate(() => { document.documentElement.classList.remove("light"); document.documentElement.classList.add("dark"); });
    }
  }
  console.log("PASS: owner header actions and long B/L fit at 320/390/495/768/1440");
  const writesBeforeOperations = writes.length;
  await page.goto(`${origin}/operations`);
  await page.getByRole("heading", { name: "Operations", exact: true }).waitFor();
  const search = page.getByRole("textbox", { name: "Search operations" });
  await search.waitFor();
  const board = page.getByTestId("operations-board");
  for (const width of [320,390,495,768,1440]) {
    await page.setViewportSize({ width, height: 850 });
    const searchBox = await search.boundingBox();
    assert.ok(searchBox.width >= 200 && searchBox.x + searchBox.width <= width, `Search squeezed at ${width}`);
    if (width === 390) {
      await page.getByRole("heading", { name: "Operations", exact: true }).scrollIntoViewIfNeeded();
      await page.evaluate(() => { document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); });
      await page.screenshot({ path: resolve(tmpdir(), "operations-mobile-filters-light.png") });
      await page.evaluate(() => { document.documentElement.classList.remove("light"); document.documentElement.classList.add("dark"); });
    }
    await board.scrollIntoViewIfNeeded();
    const first = board.locator("[data-stage]").first();
    const second = board.locator("[data-stage]").nth(1);
    const a = await first.boundingBox(), b = await second.boundingBox();
    if (width < 1024) {
      assert.ok(b.y >= a.y + a.height, "Mobile stages stack vertically");
      const boardBox = await board.boundingBox();
      assert.ok(a.width >= boardBox.width - 50, `Mobile cards use board width at ${width}: ${a.width}/${boardBox.width}`);
      assert.equal(await board.evaluate(el => el.scrollWidth <= el.clientWidth), true);
      assert.equal(await first.locator(":scope > div").last().evaluate(el => el.scrollHeight <= el.clientHeight), true, "No tiny internal mobile scroller");
    } else assert.ok(b.x > a.x && Math.abs(b.y - a.y) < 2, "Desktop keeps horizontal Kanban");
    if (width === 390 || width === 1440) {
      await first.scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(tmpdir(), `operations-${width}.png`) });
    }
  }
  await page.setViewportSize({ width: 390, height: 850 });
  await search.fill("QA-BOX-31");
  assert.equal(await board.getByRole("link").count(), 1);
  await page.getByRole("button", { name: "Clear operations search" }).click();
  assert.equal(await board.getByRole("link").count(), 4);
  await page.getByRole("button", { name: "Shipping", exact: true }).click();
  assert.equal(await board.locator("[data-stage]").count(), 1);
  await page.getByRole("button", { name: /Documentation 3/ }).click();
  await board.locator('[data-stage="documentation"]').waitFor();
  assert.equal(await board.getByRole("link").count(), 3);
  await page.getByRole("button", { name: "All Stages", exact: true }).click();
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  assert.equal(await board.getByRole("link").count(), 4);
  assert.equal(writes.length, writesBeforeOperations, "Layout/filter tests must not advance live or fixture stages");
  console.log("PASS: populated mobile Operations, desktop Kanban, search/clear, stage filters, active jump and refresh");
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
