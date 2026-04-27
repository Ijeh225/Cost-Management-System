import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { db, containersTable, customsChargesTable, auditLogTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

let ADMIN_COOKIE = "";

beforeAll(async () => {
  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "ijehifeany@gmail.com", password: "TestPass123!" });
  if (res.status !== 200) {
    throw new Error(`Test login failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  const raw = res.headers["set-cookie"];
  ADMIN_COOKIE = Array.isArray(raw) ? raw[0] : raw;
});

async function seedContainerWithDuty(opts: {
  containerNumber: string;
  blNumber: string;
  duty: number;
  paid?: number;
}): Promise<number> {
  const [c] = await db
    .insert(containersTable)
    .values({
      containerNumber: opts.containerNumber,
      blNumber:        opts.blNumber,
      customerName:    "Duty Test Client",
      status:          "duty_payment",
    })
    .returning({ id: containersTable.id });

  const paid = opts.paid ?? 0;
  await db.insert(customsChargesTable).values({
    containerId: c.id,
    duty:         String(opts.duty),
    dutyPaid:     String(paid),
    dutyNotPaid:  String(opts.duty - paid),
  });

  return c.id;
}

async function cleanup(containerId: number) {
  await db.delete(auditLogTable).where(eq(auditLogTable.containerId, containerId));
  await db.delete(customsChargesTable).where(eq(customsChargesTable.containerId, containerId));
  await db.delete(containersTable).where(eq(containersTable.id, containerId));
}

describe("GET /api/duty-payments — auth & validation", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/duty-payments");
    expect(res.status).toBe(401);
  });

  it("rejects invalid status with 400", async () => {
    const res = await request(app)
      .get("/api/duty-payments?status=bogus")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid status");
  });

  it("rejects invalid dateFrom with 400", async () => {
    const res = await request(app)
      .get("/api/duty-payments?dateFrom=not-a-date")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid dateFrom");
  });

  it("rejects inverted date range with 400", async () => {
    const res = await request(app)
      .get("/api/duty-payments?dateFrom=2026-12-31&dateTo=2026-01-01")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/dateFrom must be on or before dateTo/);
  });

  it("returns the expected response shape for admin", async () => {
    const res = await request(app)
      .get("/api/duty-payments?limit=1")
      .set("Cookie", ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("rows");
    expect(res.body).toHaveProperty("summary");
    expect(res.body).toHaveProperty("total");
    expect(res.body.summary).toHaveProperty("totalAssessed");
    expect(res.body.summary).toHaveProperty("totalPaid");
    expect(res.body.summary).toHaveProperty("totalOutstanding");
  });
});

describe("PATCH /api/duty-payments/:containerId — happy path + audit", () => {
  let containerId = 0;

  beforeAll(async () => {
    containerId = await seedContainerWithDuty({
      containerNumber: "TEST-DUTY-OK-001",
      blNumber:        "BL-TEST-DUTY-001",
      duty:            100_000,
    });
  });

  afterAll(async () => {
    await cleanup(containerId);
  });

  it("records a partial payment and writes an audit log row", async () => {
    const res = await request(app)
      .patch(`/api/duty-payments/${containerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .send({ amount: 30_000, paymentDate: "2026-04-27", notes: "first slice" });
    expect(res.status).toBe(200);
    expect(res.body.dutyPaid).toBe(30_000);
    expect(res.body.dutyNotPaid).toBe(70_000);
    expect(res.body.dutyStatus).toBe("partial");

    const audits = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.containerId, containerId),
        eq(auditLogTable.action, "duty_payment_recorded"),
      ));
    expect(audits.length).toBeGreaterThan(0);
    const last = audits[audits.length - 1];
    expect(last.section).toBe("customs");
    expect(last.fieldChanged).toBe("dutyPaid");
    expect(last.oldValue).toBe("0");
    expect(last.newValue).toBe("30000");
    expect(last.reason ?? "").toContain("date=2026-04-27");
    expect(last.reason ?? "").toContain("first slice");
  });

  it("rejects an overpayment that exceeds outstanding", async () => {
    const res = await request(app)
      .patch(`/api/duty-payments/${containerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .send({ amount: 999_999_999 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exceeds outstanding/i);
  });

  it("rejects a zero or negative amount", async () => {
    const res = await request(app)
      .patch(`/api/duty-payments/${containerId}`)
      .set("Cookie", ADMIN_COOKIE)
      .send({ amount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/greater than zero/i);
  });

  it("returns 404 for a non-existent container", async () => {
    const res = await request(app)
      .patch("/api/duty-payments/999999999")
      .set("Cookie", ADMIN_COOKIE)
      .send({ amount: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/Container not found/);
  });
});

describe("PATCH /api/duty-payments/:containerId — concurrency / no lost update", () => {
  let containerId = 0;
  const DUTY = 100_000;

  beforeAll(async () => {
    containerId = await seedContainerWithDuty({
      containerNumber: "TEST-DUTY-LOCK-001",
      blNumber:        "BL-TEST-DUTY-LOCK-001",
      duty:            DUTY,
    });
  });

  afterAll(async () => {
    await cleanup(containerId);
  });

  it("serialises concurrent PATCH requests via SELECT FOR UPDATE", async () => {
    // Fire 5 simultaneous payments of 10,000 each — total 50,000.
    const slices = [10_000, 10_000, 10_000, 10_000, 10_000];
    const responses = await Promise.all(
      slices.map(amount =>
        request(app)
          .patch(`/api/duty-payments/${containerId}`)
          .set("Cookie", ADMIN_COOKIE)
          .send({ amount }),
      ),
    );

    // All five should succeed because the cumulative total (50k) does not
    // exceed the assessed duty (100k). With proper row locking, paid = 50k.
    // Without locking, lost updates would leave paid < 50k.
    for (const r of responses) {
      expect(r.status).toBe(200);
    }

    const [row] = await db
      .select()
      .from(customsChargesTable)
      .where(eq(customsChargesTable.containerId, containerId));
    expect(Number(row.dutyPaid)).toBe(50_000);
    expect(Number(row.dutyNotPaid)).toBe(50_000);

    // Audit log should contain exactly 5 rows for this container.
    const audits = await db
      .select()
      .from(auditLogTable)
      .where(and(
        eq(auditLogTable.containerId, containerId),
        eq(auditLogTable.action, "duty_payment_recorded"),
      ));
    expect(audits.length).toBe(5);
  });

  it("rejects the PATCH that would push past outstanding even under concurrency", async () => {
    // Outstanding is now 50,000. Three concurrent 30k attempts: at most one
    // should succeed (paid -> 80k); the others must be rejected with 400.
    const responses = await Promise.all(
      [30_000, 30_000, 30_000].map(amount =>
        request(app)
          .patch(`/api/duty-payments/${containerId}`)
          .set("Cookie", ADMIN_COOKIE)
          .send({ amount }),
      ),
    );

    const successes = responses.filter(r => r.status === 200);
    const rejections = responses.filter(r => r.status === 400);
    expect(successes.length).toBeGreaterThanOrEqual(1);
    expect(rejections.length).toBeGreaterThanOrEqual(2);
    for (const r of rejections) {
      expect(r.body.error).toMatch(/exceeds outstanding/i);
    }

    const [row] = await db
      .select()
      .from(customsChargesTable)
      .where(eq(customsChargesTable.containerId, containerId));
    // paid is either 50k (if all rejected somehow) or 80k (if one succeeded);
    // crucially, paid never exceeds duty.
    expect(Number(row.dutyPaid)).toBeLessThanOrEqual(DUTY);
    expect(Number(row.dutyNotPaid)).toBeGreaterThanOrEqual(0);
  });
});
