import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", async () => ({ ...await import("../../../../lib/db/src/schema/index.js"), db: mocked }));
import * as tables from "@workspace/db";
import { jobOverviewRouter } from "../routes/job-overview.js";
import { myTasksRouter } from "../routes/my-tasks.js";
import { signToken } from "../lib/auth.js";

const staff = { id: 11, name: "Queue QA", email: "queue@example.test", isActive: true,
  sessionToken: "queue-test-session", branchId: 2, authorityLevel: "staff", jobFunction: "documentation",
  workspaceAccess: '["documentation"]', accessProfileMigratedAt: new Date("2026-09-09") };
let owner = false;
let visit: Record<string, unknown>;
let assignments: Array<{ clientId: number }>;
let tasks: Array<Record<string, unknown>>;
const queried: unknown[] = [];
const app = express(); app.use(express.json()); app.use(cookieParser()); app.use("/api", jobOverviewRouter, myTasksRouter);
const cookie = `cost_analysis_session=${signToken(staff.id, staff.sessionToken)}`;

beforeEach(() => {
  owner = false; assignments = []; queried.length = 0;
  visit = { id: 32, branchId: 2, clientId: 6, containerNumber: "BOX-A", blNumber: "BL-MULTI", shipmentId: 1,
    status: "shipping", clearingCharges: "100", createdAt: new Date(), updatedAt: new Date(), verifiedAt: new Date(), shippingStageOwner: null };
  tasks = [{ id: 7, containerId: 32, branchId: 2, assignedStaffId: 11, title: "Normal follow-up", notes: "Keep same task ID",
    priority: "high", status: "pending", dueDate: new Date("2026-09-09"), createdAt: new Date() }];
  mocked.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => {
    queried.push(table);
    let rows: unknown[] = [];
    if (table === tables.usersTable) rows = [{ ...staff, authorityLevel: owner ? "super_admin" : "staff" }];
    if (table === tables.branchesTable) rows = [{ isActive: true }];
    if (table === tables.containersTable) rows = [visit];
    if (table === tables.userClientAssignmentsTable) rows = assignments;
    if (table === tables.containerTasksTable) rows = tasks;
    if (table === tables.containerDocumentsTable) rows = [{ id: 2, name: "Release.pdf", section: "general" }];
    if (table === tables.invoiceItemsTable) rows = [{ invoiceId: 14 }, { invoiceId: 14 }];
    if (table === tables.invoicesTable) rows = [{ id: 14, invoiceNumber: "INV-MULTI", status: "sent", total: "300" },
      { id: 15, invoiceNumber: "INV-CANCELLED", status: "cancelled", total: "900" }];
    if (table === tables.invoicePaymentsTable) rows = [{ invoiceId: 14, amount: "50" }, { invoiceId: 14, amount: "-10" }];
    if (table === tables.containerExpensePaymentsTable) rows = [{ amount: "20" }];
    if (table === tables.dutyPaymentTransactionsTable) rows = [{ amount: "100" }, { amount: "-30" }];
    return Object.assign(Promise.resolve(rows), { limit: async () => rows });
  } }) }));
});

describe("CAP-01 authenticated read model", () => {
  it("requires login and validates visit IDs", async () => {
    expect((await request(app).get("/api/containers/32/overview")).status).toBe(401);
    expect((await request(app).get("/api/containers/nope/overview").set("Cookie", cookie)).status).toBe(400);
  });
  it("returns operational facts without fetching finance for non-finance staff", async () => {
    const result = await request(app).get("/api/containers/32/overview").set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.body.finance).toBeNull();
    expect(result.body.tasks[0]).toMatchObject({ id: 7, assignedStaffName: "Queue QA" });
    expect(queried).not.toContain(tables.invoicesTable);
    expect(queried).not.toContain(tables.containerExpensePaymentsTable);
  });
  it("rejects forged and selected cross-branch access before reading child facts", async () => {
    visit.branchId = 3;
    expect((await request(app).get("/api/containers/32/overview").set("Cookie", cookie).set("X-Branch-Id", "3")).status).toBe(404);
    owner = true; visit.branchId = 2;
    expect((await request(app).get("/api/containers/32/overview").set("Cookie", cookie).set("X-Branch-Id", "3")).status).toBe(404);
    expect(queried).not.toContain(tables.containerDocumentsTable);
  });
  it("honours staff client restriction in overview and personal queue", async () => {
    assignments = [{ clientId: 9 }];
    expect((await request(app).get("/api/containers/32/overview").set("Cookie", cookie)).status).toBe(404);
    const result = await request(app).get("/api/my-tasks").set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.body.dailyQueue).toEqual([]);
    expect(result.body.assignedContainers).toEqual([]);
  });
  it("shows ordinary tasks as individual stable IDs and excludes terminal task states", async () => {
    tasks.push({ ...tasks[0], id: 8, status: "completed" }, { ...tasks[0], id: 9, status: "cancelled" });
    const result = await request(app).get("/api/my-tasks").set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.body.dailyQueue.map((t: { id: number }) => t.id)).toEqual([7]);
    expect(result.body.dailyQueue[0].href).toContain("taskId=7");
    expect(result.body.timeZone).toBe("Africa/Lagos");
    expect(result.body.assignedContainers[0].clearingCharges).toBe(0);
    expect(queried).not.toContain(tables.shippingChargesTable);
  });
  it("separates visit paid costs and full invoice amounts without duplicate invoice joins", async () => {
    owner = true;
    const result = await request(app).get("/api/containers/32/overview").set("Cookie", cookie);
    expect(result.status).toBe(200);
    expect(result.body.finance).toMatchObject({ clearingBudget: 100, actualPaidCost: 90 });
    expect(result.body.finance.invoices).toHaveLength(2);
    expect(result.body.finance.invoices[0]).toMatchObject({ id: 14, total: 300, paid: 40, outstanding: 260 });
    expect(result.body.finance.invoices[1]).toMatchObject({ total: 0, paid: 0, outstanding: 0 });
    expect(result.body.finance.note).toContain("FULL invoice value");
    expect(mocked).not.toHaveProperty("insert");
  });
});
