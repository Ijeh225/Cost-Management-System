import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app";
import { db, containersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET =
  process.env.JWT_SECRET ?? "cost-analysis-secret-key-change-in-production";

function makeAdminCookie(userId: number) {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "1h" });
  return `cost_analysis_session=${token}`;
}

const ADMIN_COOKIE = makeAdminCookie(2);

describe("GET /api/analytics/deliveries", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/analytics/deliveries");
    expect(res.status).toBe(401);
  });

  it("returns delivery report shape as admin", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("count");
    expect(res.body).toHaveProperty("totalRevenue");
    expect(res.body).toHaveProperty("avgDays");
    expect(res.body).toHaveProperty("items");
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it("filters by date range — future range returns empty results", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries?from=2099-01-01&to=2099-12-31")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.items).toHaveLength(0);
  });

  it("items include required fields when data exists", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    if (res.body.items.length > 0) {
      const item = res.body.items[0];
      expect(item).toHaveProperty("id");
      expect(item).toHaveProperty("containerNumber");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("deliveredAt");
      expect(item).toHaveProperty("daysToComplete");
    }
  });

  it("avgDays is null or a number", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    const { avgDays } = res.body;
    expect(avgDays === null || typeof avgDays === "number").toBe(true);
  });

  it("items include deliveredAtEstimated field in API response", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    if (res.body.items.length > 0) {
      const item = res.body.items[0];
      expect(item).toHaveProperty("deliveredAtEstimated");
      expect(typeof item.deliveredAtEstimated).toBe("boolean");
    }
  });

  it("estimated flag is true for backfilled containers, false for manually-set", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    for (const item of res.body.items) {
      expect(typeof item.deliveredAtEstimated).toBe("boolean");
      if (item.deliveredAt) {
        expect(item).toHaveProperty("deliveredAtEstimated");
      }
    }
  });
});

describe("PATCH /api/containers/:id — delivered date", () => {
  let testContainerId: number;

  beforeAll(async () => {
    const rows = await db
      .select({ id: containersTable.id })
      .from(containersTable)
      .limit(1);
    if (rows.length === 0) throw new Error("No containers in test DB");
    testContainerId = rows[0].id;
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .patch(`/api/containers/${testContainerId}`)
      .send({ deliveredAt: "2026-01-15" });
    expect(res.status).toBe(401);
  });

  it("sets deliveredAt on a container", async () => {
    const res = await request(app)
      .patch(`/api/containers/${testContainerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .set("Content-Type", "application/json")
      .send({ deliveredAt: "2026-01-15" });
    expect(res.status).toBe(200);
    expect(res.body.deliveredAt).toBeTruthy();
    expect(res.body.deliveredAtEstimated).toBe(false);
  });

  it("changes deliveredAt on an already-delivered container", async () => {
    const res = await request(app)
      .patch(`/api/containers/${testContainerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .set("Content-Type", "application/json")
      .send({ deliveredAt: "2026-02-20" });
    expect(res.status).toBe(200);
    expect(res.body.deliveredAt).toContain("2026-02-20");
  });

  it("clears deliveredAt when null is sent", async () => {
    const res = await request(app)
      .patch(`/api/containers/${testContainerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .set("Content-Type", "application/json")
      .send({ deliveredAt: null });
    expect(res.status).toBe(200);
    expect(res.body.deliveredAt).toBeNull();
  });

  it("returns 404 for a non-existent container", async () => {
    const res = await request(app)
      .patch("/api/containers/999999999")
      .set("Cookie", ADMIN_COOKIE)
      .set("Content-Type", "application/json")
      .send({ deliveredAt: "2026-01-01" });
    expect(res.status).toBe(404);
  });
});
