import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@workspace/db", async () => ({ ...await import("../../../../lib/db/src/schema/index.js"), db: mocked }));
import { usersTable, branchesTable, containersTable, userClientAssignmentsTable } from "@workspace/db";
import { containersRouter } from "../routes/containers.js";
import { signToken } from "../lib/auth.js";

const staff = { id: 11, name: "Shipment QA", email: "shipment@example.test", isActive: true,
  sessionToken: "shipment-test-session", branchId: 2, authorityLevel: "staff", jobFunction: "documentation",
  workspaceAccess: '["documentation"]', accessProfileMigratedAt: new Date("2026-09-09"), canUpload: false };
let owner = false;
let visit: { id: number; branchId: number; clientId: number; shipmentId: number | null; blNumber: string } | undefined;
let assignments: { clientId: number }[];
let rows: { id: number; containerNumber: string; status: string; deliveredAt: Date | null }[];
const app = express(); app.use(express.json()); app.use(cookieParser()); app.use("/api", containersRouter);
const cookie = `cost_analysis_session=${signToken(staff.id, staff.sessionToken)}`;

beforeEach(() => {
  owner = false; assignments = [];
  visit = { id: 31, branchId: 2, clientId: 5, shipmentId: 7, blNumber: "BL-THREE" };
  rows = [{ id: 31, containerNumber: "BOX-A", status: "closed", deliveredAt: new Date("2026-09-09") },
    { id: 32, containerNumber: "BOX-B", status: "terminal", deliveredAt: null },
    { id: 33, containerNumber: "BOX-C", status: "shipping", deliveredAt: null }];
  mocked.select.mockImplementation(() => ({ from: (table: unknown) => ({ where: () => {
    if (table === usersTable) return { limit: async () => [{ ...staff, authorityLevel: owner ? "super_admin" : "staff" }] };
    if (table === branchesTable) return { limit: async () => [{ isActive: true }] };
    if (table === userClientAssignmentsTable) return Promise.resolve(assignments);
    if (table === containersTable) {
      const single = Promise.resolve(visit ? [visit] : []);
      return Object.assign(single, { orderBy: async () => rows });
    }
    throw new Error("Unexpected query");
  } }) }));
});

describe("shipment read API authentication and branch/client scope", () => {
  it("returns the three independent visits and partial delivery without financial fields", async () => {
    const response = await request(app).get("/api/containers/31/shipment").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ shipmentId: 7, total: 3, delivered: 1, completed: 1 });
    expect(response.body.containers.map((row: { id: number }) => row.id)).toEqual([31, 32, 33]);
    expect(response.body).not.toHaveProperty("totalCost");
  });
  it("rejects unauthenticated reads", async () => {
    expect((await request(app).get("/api/containers/31/shipment")).status).toBe(401);
  });
  it("does not allow staff to forge another branch", async () => {
    visit!.branchId = 3;
    expect((await request(app).get("/api/containers/31/shipment").set("Cookie", cookie).set("X-Branch-Id", "3")).status).toBe(404);
  });
  it("honours the owner's selected branch", async () => {
    owner = true;
    expect((await request(app).get("/api/containers/31/shipment").set("Cookie", cookie).set("X-Branch-Id", "3")).status).toBe(404);
  });
  it("honours staff client assignments", async () => {
    assignments = [{ clientId: 8 }];
    expect((await request(app).get("/api/containers/31/shipment").set("Cookie", cookie)).status).toBe(404);
    assignments = [{ clientId: 5 }];
    expect((await request(app).get("/api/containers/31/shipment").set("Cookie", cookie)).status).toBe(200);
  });
  it("handles missing visits and an incomplete migration explicitly", async () => {
    visit!.shipmentId = null;
    expect((await request(app).get("/api/containers/31/shipment").set("Cookie", cookie)).status).toBe(503);
    visit = undefined;
    expect((await request(app).get("/api/containers/31/shipment").set("Cookie", cookie)).status).toBe(404);
  });
});
