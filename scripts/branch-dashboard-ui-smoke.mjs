// Local built-UI regression only: GET fixtures, delayed responses, no live data.
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
const names = { all: "All Branches", 1: "QA Head Office", 2: "QA Lagos", 3: "QA Empty" };
const amounts = { all: 333, 1: 111, 2: 222, 3: 0 };
const counts = { all: 33, 1: 11, 2: 22, 3: 0 };
const delays = new Map();
const requested = [];
let failFinanceScope;
let browser;
let page;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.origin !== origin) { await route.abort(); return; }
    if (!url.pathname.startsWith("/api/")) { await route.continue(); return; }
    assert.equal(req.method(), "GET", "Regression must never write financial data");
    const scope = req.headers()["x-branch-id"] ?? "all";
    requested.push({ path: url.pathname, scope });
    const amount = amounts[scope];
    const count = counts[scope];
    let data = [];
    const financial = url.pathname === "/api/reports/pl";
    switch (url.pathname) {
      case "/api/auth/setup-required": data = { required: false }; break;
      case "/api/auth/me": data = { id: 1, name: "QA Owner", role: "super_admin", branchId: 1,
        accessProfile: { source: "modern", authorityLevel: "super_admin", jobFunction: "general_staff", workspaces: [], errors: [] } }; break;
      case "/api/branches": data = [1, 2, 3].map(id => ({ id, name: names[id], isActive: true })); break;
      case "/api/settings": data = {}; break;
      case "/api/notifications": data = { notifications: [], unreadCount: 0 }; break;
      case "/api/intelligence/alerts": data = { alerts: [] }; break;
      case "/api/analytics/berthing": data = { awaiting: [], berthed: [], upcoming: [], branchScope: { id: scope === "all" ? null : Number(scope), name: names[scope] } }; break;
      case "/api/banks": data = [{ id: Number(scope) || 99, name: `${names[scope]} Bank`, currentBalance: amount, isActive: true }]; break;
      case "/api/containers": data = { containers: [], total: 0, page: 1, limit: 5 }; break;
      case "/api/dashboard/stats": data = {
        totalContainers: count, inProgress: count, completed: 0, totalCost: 0, totalClearingCharges: amount,
        grossProfit: amount, netProfitAfterOverhead: amount, totalInvoiced: amount, totalCollected: 0,
        outstandingReceivables: amount, containersInTerminal: 0, containersInTerminalList: [],
        monthlyTrend: [], containersByStatus: [], topCustomers: [], recentContainers: [],
      }; break;
      case "/api/invoices/accounts-receivable": data = { aging: { current: amount, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 }, clients: [], totals: {} }; break;
      case "/api/reports/vat-liability": data = { currentQuarter: { label: "Q4", totalVat: 0, totalTaxable: 0, invoiceCount: 0, months: [] }, quarters: [], currentYearTotal: 0 }; break;
      case "/api/reports/pl": data = {
        revenue: { totalRevenue: amount, invoiceCount: count }, costOfSales: { total: 0 },
        grossProfit: amount, overheads: { total: 0 }, netProfit: amount, netMarginPct: 100,
        containerCount: count, monthly: [], clients: [],
      }; break;
    }
    if (!["/api/auth/setup-required", "/api/auth/me", "/api/branches"].includes(url.pathname)) {
      await new Promise(done => setTimeout(done, delays.get(scope) ?? 0));
    }
    try {
      await route.fulfill({ status: financial && scope === failFinanceScope ? 500 : 200,
        contentType: "application/json", body: JSON.stringify(data) });
    } catch (error) {
      if (!req.failure() && !page.isClosed()) throw error;
    }
  });

  await page.goto(origin);
  await page.getByText("Total Containers", { exact: true }).waitFor();
  const metric = title => page.getByText(title, { exact: true }).locator("../..");
  const assertMetric = async (title, value, label) => {
    const card = metric(title);
    await card.getByText(value, { exact: true }).waitFor();
    assert.ok((await card.innerText()).includes(label));
  };
  const switchScope = async scope => {
    const mobile = page.viewportSize().width < 768;
    if (mobile) await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
    await page.getByRole("combobox").first().click();
    await page.getByRole("option", { name: scope === "all" ? "All branches" : names[scope], exact: true }).click();
    if (mobile) await page.keyboard.press("Escape");
  };
  const assertNoPriorFinance = async previous => {
    const section = page.getByRole("region", { name: "Financial dashboard" });
    assert.equal(await section.getByText(`\u20a6${previous}.00`, { exact: true }).count(), 0,
      "Previous scope's amounts must not appear while new scope loads");
  };

  await assertMetric("Total Containers", "33", "All Branches");
  delays.set("2", 900);
  await switchScope("2");
  await page.getByRole("status", { name: "Loading branch dashboard" }).waitFor();
  assert.equal(await page.getByText("Total Containers", { exact: true }).count(), 0);
  await assertMetric("Total Containers", "22", "QA Lagos");
  assert.equal(await page.getByText("All Branches Bank", { exact: true }).count(), 0);
  console.log("PASS All->Lagos Operations: loading instead of old totals/banks");

  await page.getByRole("tab", { name: "Financial View" }).click();
  await assertMetric("Accrual Revenue", "\u20a6222.00", "QA Lagos");
  delays.set("all", 900);
  await switchScope("all");
  await page.getByRole("status", { name: "Loading branch financial figures" }).waitFor();
  await assertNoPriorFinance(222);
  await assertMetric("Accrual Revenue", "\u20a6333.00", "All Branches");
  console.log("PASS Lagos->All Finance: new label never pairs with Lagos totals");

  delays.set("1", 900);
  await switchScope("1");
  await page.getByRole("status", { name: "Loading branch financial figures" }).waitFor();
  await assertNoPriorFinance(333);
  await assertMetric("Accrual Revenue", "\u20a6111.00", "QA Head Office");
  await switchScope("2");
  await assertMetric("Accrual Revenue", "\u20a6222.00", "QA Lagos");
  await assertNoPriorFinance(111);
  console.log("PASS cached revisit: correct branch snapshot during background refresh");

  failFinanceScope = "3";
  delays.set("3", 100);
  await switchScope("3");
  await page.getByText(/Financial figures could not be loaded/).waitFor();
  await assertNoPriorFinance(222);
  console.log("PASS failed new-branch request: error without previous branch's figures");
  failFinanceScope = undefined;
  await switchScope("1");
  await assertMetric("Accrual Revenue", "\u20a6111.00", "QA Head Office");
  await switchScope("3");
  await assertMetric("Accrual Revenue", "\u20a60.00", "QA Empty");
  console.log("PASS empty branch: loaded zero is distinct from loading/error");

  delays.set("all", 1200);
  await switchScope("all");
  await switchScope("1");
  await page.waitForTimeout(1400);
  await assertMetric("Accrual Revenue", "\u20a6111.00", "QA Head Office");
  await assertNoPriorFinance(333);
  console.log("PASS rapid switches / late response: final branch retains its own values");

  await page.setViewportSize({ width: 390, height: 844 });
  await switchScope("all");
  await assertMetric("Accrual Revenue", "\u20a6333.00", "All Branches");
  await switchScope("2");
  await assertMetric("Accrual Revenue", "\u20a6222.00", "QA Lagos");
  await assertNoPriorFinance(333);
  console.log("PASS mobile branch switch: correct cached finance and branch label");

  for (const path of ["/api/dashboard/stats", "/api/reports/pl", "/api/banks", "/api/containers",
    "/api/invoices/accounts-receivable", "/api/reports/vat-liability", "/api/intelligence/alerts",
    "/api/analytics/berthing"]) {
    assert.ok(requested.some(req => req.path === path && req.scope === "all"), `${path}: missing All scope`);
    assert.ok(requested.some(req => req.path === path && req.scope === "2"), `${path}: missing Lagos scope`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS all requested dashboard data sources have explicit scope; no page errors or writes");
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}
