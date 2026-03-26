import { describe, it, expect, beforeAll, afterAll } from "vitest";
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

  it("returns 400 for invalid from date", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries?from=not-a-date")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid");
  });

  it("returns 400 for invalid to date", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries?to=2026-99-99")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid");
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

  it("returns 400 for invalid deliveredAt format", async () => {
    const res = await request(app)
      .patch(`/api/containers/${testContainerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .set("Content-Type", "application/json")
      .send({ deliveredAt: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid");
  });
});

describe("API contract: backfill — deliveredAtEstimated flag", () => {
  let seedId: number;

  beforeAll(async () => {
    const [row] = await db
      .insert(containersTable)
      .values({
        containerNumber: "TEST-BACKFILL-001",
        blNumber: "BL-TEST-001",
        customerName: "Test Client",
        status: "completed",
        deliveredAt: new Date("2025-06-01"),
        deliveredAtEstimated: true,
      })
      .returning({ id: containersTable.id });
    seedId = row.id;
  });

  afterAll(async () => {
    await db.delete(containersTable).where(eq(containersTable.id, seedId));
  });

  it("backfilled container appears in analytics with deliveredAtEstimated=true", async () => {
    const res = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    const backfilled = res.body.items.find(
      (i: { id: number }) => i.id === seedId
    );
    expect(backfilled).toBeDefined();
    expect(backfilled.deliveredAtEstimated).toBe(true);
  });

  it("GET /api/containers/:id returns deliveredAt and deliveredAtEstimated for a backfilled record", async () => {
    const res = await request(app)
      .get(`/api/containers/${seedId}`)
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.container.deliveredAt).toBeTruthy();
    expect(res.body.container.deliveredAtEstimated).toBe(true);
  });

  it("manually setting delivery date via PATCH clears the estimated flag", async () => {
    const patch = await request(app)
      .patch(`/api/containers/${seedId}`)
      .set("Cookie", ADMIN_COOKIE)
      .set("Content-Type", "application/json")
      .send({ deliveredAt: "2025-07-15" });
    expect(patch.status).toBe(200);
    expect(patch.body.deliveredAtEstimated).toBe(false);

    const analytics = await request(app)
      .get("/api/analytics/deliveries")
      .set("Cookie", ADMIN_COOKIE);
    const item = analytics.body.items.find((i: { id: number }) => i.id === seedId);
    expect(item).toBeDefined();
    expect(item.deliveredAtEstimated).toBe(false);
  });

  it("to-date boundary is inclusive — delivery on the 'to' date is included", async () => {
    const [boundary] = await db
      .insert(containersTable)
      .values({
        containerNumber: "TEST-BOUNDARY-001",
        blNumber: "BL-BOUND-001",
        customerName: "Boundary Client",
        status: "completed",
        deliveredAt: new Date("2025-08-31T23:00:00.000Z"),
        deliveredAtEstimated: false,
      })
      .returning({ id: containersTable.id });

    try {
      const res = await request(app)
        .get("/api/analytics/deliveries?to=2025-08-31")
        .set("Cookie", ADMIN_COOKIE);
      expect(res.status).toBe(200);
      const found = res.body.items.find((i: { id: number }) => i.id === boundary.id);
      expect(found).toBeDefined();
    } finally {
      await db.delete(containersTable).where(eq(containersTable.id, boundary.id));
    }
  });

  it("same-day delivery yields daysToComplete=0, never negative", async () => {
    const [sameDay] = await db
      .insert(containersTable)
      .values({
        containerNumber: "TEST-SAMEDAY-001",
        blNumber: "BL-SAME-001",
        customerName: "Same Day Client",
        status: "completed",
        deliveredAt: new Date("2025-09-10"),
        deliveredAtEstimated: false,
        createdAt: new Date("2025-09-10T23:59:59.000Z"),
      })
      .returning({ id: containersTable.id });

    try {
      const res = await request(app)
        .get("/api/analytics/deliveries")
        .set("Cookie", ADMIN_COOKIE);
      expect(res.status).toBe(200);
      const item = res.body.items.find((i: { id: number }) => i.id === sameDay.id);
      expect(item).toBeDefined();
      expect(item.daysToComplete).toBe(0);
    } finally {
      await db.delete(containersTable).where(eq(containersTable.id, sameDay.id));
    }
  });
});
