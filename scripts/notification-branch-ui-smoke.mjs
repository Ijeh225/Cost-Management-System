// Built-UI local fixtures only. The only allowed writes are notification read actions.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.PLAYWRIGHT_MODULE_PATH ?? process.argv[2];
const { chromium } = await import(modulePath ? pathToFileURL(modulePath).href : "playwright");
const root = resolve(import.meta.dirname, "../artifacts/cost-analysis/dist/public");
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = path.startsWith("/assets/") ? resolve(root, `.${path}`) : resolve(root, "index.html");
  if (!file.startsWith(`${root}${sep}`)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html" })[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
const names = { 1: "QA Head Office", 2: "QA Lagos", 3: "QA Empty", 4: "QA Failure" };
const classic = [1, 2, 2].map((branchId, i) => ({ branchId, alertKey: `qa-${i}`, type: "low_margin", severity: "warning",
  message: `${names[branchId]} system alert ${i}`, generatedAt: "2026-10-11T00:00:00Z", isRead: false, readAt: null }));
const workflow = [1, 1, 2, 2, 2, 2].map((branchId, i) => ({ branchId, id: i + 1, type: "stage_complete",
  message: `${names[branchId]} workflow ${i}`, createdAt: "2026-10-11T00:00:00Z", actionUrl: "/", isRead: false, readAt: null }));
const scoped = (rows, scope) => rows.filter(row => scope === "all" || row.branchId === Number(scope));
const delays = new Map();
const requested = [];
const errors = [];
let browser;
let page;
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && message.text().includes("[PageErrorBoundary]")) errors.push(message.text());
  });
  await page.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    const scope = req.headers()["x-branch-id"] ?? "all";
    requested.push({ path: url.pathname, scope, method: req.method() });
    if (req.method() !== "GET") {
      assert.equal(req.method(), "POST");
      assert.match(url.pathname, /^\/api\/(?:notifications\/(?:mark-viewed|read-all|[^/]+\/read)|workflow-notifications\/(?:read-all|\d+\/read))$/);
      // Keep page-open/viewed separate from explicit read tests in this fixture.
      const rows = url.pathname.startsWith("/api/workflow") ? workflow : classic;
      if (url.pathname.endsWith("/read-all")) scoped(rows, scope).forEach(row => { row.isRead = true; });
      else if (url.pathname.endsWith("/read")) {
        const id = decodeURIComponent(url.pathname.split("/").at(-2));
        const row = scoped(rows, scope).find(row => String(row.id ?? row.alertKey) === id);
        assert.ok(row, "Read action must stay within its requested branch");
        row.isRead = true;
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ success: true }) });
      return;
    }
    let data = [];
    switch (url.pathname) {
      case "/api/auth/csrf": data = { token: "local-notification-test" }; break;
      case "/api/auth/setup-required": data = { required: false }; break;
      case "/api/auth/me": data = { id: 1, name: "QA Owner", role: "super_admin", branchId: 1,
        accessProfile: { source: "modern", authorityLevel: "super_admin", jobFunction: "general_staff", workspaces: [], errors: [] } }; break;
      case "/api/branches": data = [1, 2, 3, 4].map(id => ({ id, name: names[id], isActive: true })); break;
      case "/api/settings": data = {}; break;
      case "/api/notifications": { const rows = scoped(classic, scope); data = { notifications: rows, unreadCount: rows.filter(row => !row.isRead).length }; break; }
      case "/api/workflow-notifications": { const rows = scoped(workflow, scope); data = { notifications: rows, unreadCount: rows.filter(row => !row.isRead).length }; break; }
      case "/api/notifications/history": { const rows = scoped(classic, scope); data = { alerts: rows.map((row, i) => ({ ...row, id: i + 1, firstSeenAt: row.generatedAt, lastSeenAt: row.generatedAt, isResolved: false })), total: rows.length }; break; }
      case "/api/intelligence/alerts": data = { alerts: [] }; break;
      case "/api/analytics/berthing": data = { awaiting: [], berthed: [], upcoming: [] }; break;
      case "/api/containers": data = { containers: [], total: 0, page: 1, limit: 5 }; break;
      case "/api/invoices/accounts-receivable": data = { aging: { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }, clients: [], totals: {} }; break;
      case "/api/reports/vat-liability": data = { currentQuarter: { label: "Q4", vatCollected: 0, taxableAmount: 0, invoiceCount: 0, months: [] }, quarters: [], currentYearTotal: { vatCollected: 0 } }; break;
      case "/api/dashboard/stats": data = { totalContainers: 0, inProgress: 0, completed: 0, totalCost: 0,
        totalClearingCharges: 0, grossProfit: 0, monthlyTrend: [], containersByStatus: [], profitByCustomer: [] }; break;
    }
    if (/^\/api\/(notifications|workflow-notifications)/.test(url.pathname)) {
      const delay = delays.get(scope) ?? 0;
      await new Promise(done => setTimeout(done, delay + (delay && url.pathname === "/api/workflow-notifications" ? 700 : 0)));
    }
    try {
      await route.fulfill({ status: scope === "4" && /notifications/.test(url.pathname) ? 500 : 200,
        contentType: "application/json", body: JSON.stringify(data) });
    } catch (error) { if (!req.failure() && !page.isClosed()) throw error; }
  });
  const nav = () => page.getByRole("link", { name: /^Notifications/ });
  const bell = () => page.getByRole("button", { name: /^Notifications(?:,| loading| unavailable)/ });
  const waitNav = async count => {
    await page.getByRole("link", { name: count ? `Notifications ${count}` : "Notifications", exact: true }).waitFor();
  };
  const switchScope = async scope => {
    const mobile = page.viewportSize().width < 768;
    if (mobile) await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: scope === "all" ? "All branches" : names[scope], exact: true }).click();
    if (mobile) await page.keyboard.press("Escape");
  };
  await page.goto(origin);
  await waitNav(3);
  await page.getByRole("button", { name: "Notifications, 9 unread", exact: true }).waitFor();
  delays.set("2", 800);
  await switchScope("2");
  await page.getByRole("status", { name: "Loading branch notification count" }).waitFor();
  assert.equal((await nav().innerText()).trim(), "Notifications");
  await waitNav(2);
  assert.equal(await bell().getAttribute("aria-label"), "Notifications loading", "Do not show a partial combined badge");
  await page.getByRole("button", { name: "Notifications, 6 unread", exact: true }).waitFor();
  console.log("PASS slow All->Lagos: sidebar hides old count; bell waits for both scoped sources");

  await switchScope("all"); await waitNav(3);
  await page.getByRole("button", { name: "Notifications, 9 unread", exact: true }).waitFor();
  delays.set("1", 800); await switchScope("1");
  await page.getByRole("status", { name: "Loading branch notification count" }).waitFor();
  await waitNav(1); await page.getByRole("button", { name: "Notifications, 3 unread", exact: true }).waitFor();
  await switchScope("2"); await waitNav(2);
  await page.getByRole("button", { name: "Notifications, 6 unread", exact: true }).waitFor();
  console.log("PASS cached visits and separate branch counts");

  await bell().click(); await page.getByText("QA Lagos workflow 2", { exact: true }).click();
  await page.getByRole("button", { name: "Notifications, 5 unread", exact: true }).waitFor();
  assert.ok(requested.some(req => req.path === "/api/workflow-notifications/3/read" && req.scope === "2"));
  await bell().click(); await page.getByRole("menuitem", { name: "Mark all as read", exact: true }).click();
  await waitNav(0); await page.getByRole("button", { name: "Notifications, 0 unread", exact: true }).waitFor();
  await switchScope("all"); await waitNav(1);
  await page.getByRole("button", { name: "Notifications, 3 unread", exact: true }).waitFor();
  assert.equal(scoped(classic, "1").filter(row => !row.isRead).length, 1);
  assert.equal(scoped(workflow, "1").filter(row => !row.isRead).length, 2);
  console.log("PASS single/all read updates shared caches without reading another branch");

  await nav().click(); await page.getByRole("heading", { name: "Notifications", exact: true }).waitFor();
  await page.getByRole("button", { name: /^History/ }).click();
  await page.getByText("QA Lagos system alert 1", { exact: true }).waitFor();
  await switchScope("1");
  assert.equal(await page.getByText("QA Lagos system alert 1", { exact: true }).count(), 0);
  await page.getByText("QA Head Office system alert 0", { exact: true }).waitFor();
  await page.getByRole("button", { name: /^Workflow History/ }).click();
  await page.getByText("QA Head Office workflow 0", { exact: true }).waitFor();
  await switchScope("2");
  assert.equal(await page.getByText("QA Head Office workflow 0", { exact: true }).count(), 0);
  await page.getByText("QA Lagos workflow 2", { exact: true }).waitFor();
  console.log("PASS history/workflow page drops previous-scope rows, including cached animations");

  delays.set("all", 1200); await switchScope("all"); await switchScope("1");
  await page.waitForTimeout(2000);
  await waitNav(1); await page.getByRole("button", { name: "Notifications, 3 unread", exact: true }).waitFor();
  assert.equal(await page.getByText("QA Lagos workflow 2", { exact: true }).count(), 0);
  console.log("PASS rapid switches: late All response cannot replace final branch data");

  await switchScope("3"); await page.getByRole("button", { name: "Notifications, 0 unread", exact: true }).waitFor();
  await bell().click(); await page.getByText("No new notifications", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await switchScope("4"); await page.getByRole("button", { name: "Notifications unavailable", exact: true }).waitFor();
  await bell().click(); await page.getByRole("alert").getByText("Notifications could not be loaded.", { exact: true }).waitFor();
  assert.equal(await page.getByText("No new notifications", { exact: true }).count(), 0);
  await page.keyboard.press("Escape");
  console.log("PASS empty versus failed branch: no false previous count or empty success");

  await page.setViewportSize({ width: 390, height: 844 }); await switchScope("1");
  await page.getByRole("button", { name: "Notifications, 3 unread", exact: true }).waitFor();
  await switchScope("2"); await page.getByRole("button", { name: "Notifications, 0 unread", exact: true }).waitFor();
  console.log("PASS mobile switch: correct bell count");
  for (const path of ["/api/notifications", "/api/workflow-notifications", "/api/notifications/history"]) {
    for (const scope of ["all", "1", "2"]) assert.ok(requested.some(req => req.path === path && req.scope === scope));
  }
  assert.deepEqual(errors, []);
  console.log("PASS explicit three-source headers / permitted local read actions only / no page errors");
} catch (error) {
  console.error("Page errors:", errors);
  console.error("Page URL:", page?.url());
  if (page && !page.isClosed()) console.error("Page text:", await page.locator("body").innerText());
  throw error;
} finally { await browser?.close(); await new Promise(done => server.close(done)); }
