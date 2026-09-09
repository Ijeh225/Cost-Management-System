// Local production UI and intercepted dummy API only; external requests are blocked.
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
  if (!file.startsWith(`${root}${sep}`)) return res.writeHead(403).end();
  try { res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".html": "text/html" })[extname(file)] ?? "application/octet-stream"); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage(); const errors = []; let owner = true; let failQueue = false;
  page.on("pageerror", e => errors.push(e.message));
  const tasks = ["overdue", "today", "undated", "upcoming"].map((bucket, index) => ({ id: 7 + index, containerId: 32,
    branchId: 2, assignedStaffId: 11, assignedStaffName: "QA", title: `Follow-up ${bucket}`, notes: "Controlled fixture",
    status: "pending", priority: "high", dueDate: bucket === "undated" ? null : "2026-09-09T00:00:00Z", bucket,
    containerNumber: "QA-BOX-32", customerName: "QA Client", blNumber: "QA-BL", workflowStage: "Shipping / DO",
    blockers: [], missingFinalPrerequisites: ["Shipping / DO release"], href: `/containers/32?tab=tasks&taskId=${7 + index}` }));
  const c = { id: 32, branchId: 2, clientId: 6, shipmentId: 5, containerNumber: "QA-BOX-32", customerName: "QA Client",
    blNumber: "QA-BL", status: "shipping", size: "40FT", command: "PTML", vessel: "QA", createdAt: "2026-09-09", updatedAt: "2026-09-09",
    isLocked: false, lockedSections: [], clearingCharges: 100, totalCost: 0, grossProfit: 100 };
  const overview = () => ({ containerId: 32, ...c, workflowStage: "Shipping / DO", asOf: "2026-09-09T14:00:00Z", unassignedMilestones: 1,
    physical: { inTerminal: false, gateIn: null, gateOut: null, deliveredAt: null, emptyReturnedAt: null, closed: false },
    milestones: [{ key: "shipping", label: "Shipping / DO", owner: null, expected: null, actual: null, delay: "Awaiting release", href: "/workspace/shipping", state: "blocked" },
      { key: "transire", label: "Transire", owner: "Transire only", expected: null, actual: "2026-09-09", delay: null, href: "/workspace/transire", state: "recorded" }],
    nextAction: { text: "Confirm release", owner: null, dueAt: null }, blockers: ["Shipping / DO: Awaiting release"], missingFinalPrerequisites: ["Shipping / DO release"],
    tasks: tasks.filter(t => t.status !== "completed"), documents: [{ id: 4, name: "Release proof.pdf", section: "general" }], approvals: [],
    finance: owner ? { clearingBudget: 100, costBudget: 0, actualPaidCost: 0, note: "FULL invoice value, not per-visit allocation",
      invoices: [{ id: 14, number: "INV-MULTI", status: "sent", total: 300, paid: 0, outstanding: 300 }] } : null });
  await page.addInitScript(() => localStorage.setItem("cost_analysis_active_branch", "2"));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith("/api/")) return route.continue();
    let data = []; const method = route.request().method();
    if (url.pathname === "/api/auth/setup-required") data = { required: false };
    else if (url.pathname === "/api/auth/csrf") data = { token: "fixture" };
    else if (url.pathname === "/api/auth/me") data = { id: 11, name: "QA", isActive: true, email: "qa@example.test", branchId: 2, role: owner ? "super_admin" : "staff",
      accessProfile: { source: "modern", authorityLevel: owner ? "super_admin" : "staff", jobFunction: "operations", workspaces: owner ? [] : ["shipping"], errors: [] } };
    else if (url.pathname === "/api/branches") data = [{ id: 2, name: "QA Branch", isActive: true }];
    else if (url.pathname === "/api/my-tasks") {
      if (failQueue) return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Fixture failure"}' });
      data = { dailyQueue: tasks.filter(t => t.status !== "completed"), workDate: "2026-09-09", timeZone: "Africa/Lagos", asOf: "2026-09-09T14:00:00Z", mySections: ["shipping"] };
    }
    else if (url.pathname === "/api/containers/32/overview") data = overview();
    else if (url.pathname === "/api/containers/32/shipment") data = { shipmentId: 5, branchId: 2, blNumber: "QA-BL", total: 2, delivered: 0, completed: 0, containers: [c, { ...c, id: 33, containerNumber: "QA-BOX-33", status: "pending_verification" }] };
    else if (url.pathname === "/api/containers/32") data = { container: c, charges: { shipping: {}, customs: {}, terminal: {}, delivery: {}, operations: {}, extraCharges: [], totalCost: 0 }, sectionApprovals: [] };
    else if (url.pathname === "/api/containers/32/tasks") data = tasks;
    else if (url.pathname === "/api/containers/32/tasks/7" && method === "PATCH") { Object.assign(tasks[0], route.request().postDataJSON()); data = tasks[0]; }
    else if (url.pathname === "/api/users") data = [{ id: 11, name: "QA", branchId: 2, isActive: true, role: "super_admin" }];
    else if (url.pathname === "/api/settings") data = {};
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto(`${origin}/my-tasks`);
  await page.getByRole("link", { name: "Task #7: Follow-up overdue", exact: true }).waitFor();
  await page.getByRole("button", { name: "Today (1)", exact: true }).click();
  assert.equal(await page.getByRole("link", { name: /Task #\d+: Follow-up/ }).count(), 1);
  await page.getByRole("button", { name: "All open (4)", exact: true }).click();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Queue overflow ${width}`);
    if (width === 390) await page.screenshot({ path: resolve(process.env.TEMP, "cap01-queue-mobile.png") });
  }
  await page.getByRole("link", { name: "Task #7: Follow-up overdue", exact: true }).click();
  await page.getByRole("button", { name: "Complete task 7", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Job Overview", exact: true }).waitFor();
  await page.getByRole("link", { name: "INV-MULTI", exact: true }).waitFor();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.locator("#job-overview").evaluate(el => el.scrollWidth <= el.clientWidth), true, `Overview overflow ${width}`);
    if (width === 1440) await page.locator("#job-overview").screenshot({ path: resolve(process.env.TEMP, "cap01-overview-desktop.png") });
  }
  await page.getByRole("button", { name: "Complete task 7", exact: true }).click();
  await page.getByRole("button", { name: "Reopen task 7", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Assigned follow-ups (3 open)", exact: true }).waitFor();
  await page.goto(`${origin}/my-tasks`);
  await page.getByRole("button", { name: "All open (3)", exact: true }).waitFor();
  console.log("PASS: task identity, Today filtering, completion invalidation, shared overview and responsive widths");
  owner = false;
  await page.goto(`${origin}/containers/32?tab=tasks&taskId=8`);
  await page.getByRole("heading", { name: "Job Overview", exact: true }).waitFor();
  await page.getByRole("button", { name: "Complete task 8", exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Financial context", exact: true }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Transire", exact: true }).count(), 0);
  await page.goto(`${origin}/my-tasks`);
  await page.getByRole("button", { name: "All open (3)", exact: true }).waitFor();
  failQueue = true;
  await page.getByRole("button", { name: "Refresh tasks", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "previous snapshot" }).waitFor();
  assert.equal(await page.getByRole("link", { name: /Task #\d+: Follow-up/ }).count(), 3);
  assert.deepEqual(errors, []);
  console.log("PASS: department task link, finance/workspace restrictions, retained snapshot on refresh failure");
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
