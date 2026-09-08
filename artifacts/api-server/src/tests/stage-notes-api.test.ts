import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock("@workspace/db", async () => ({
  ...await import("../../../../lib/db/src/schema/index.js"),
  db: mocked,
}));

import { usersTable, branchesTable, containersTable, containerStageNotesTable, containerTimelineTable } from "@workspace/db";
import { containersRouter } from "../routes/containers.js";
import { createCsrfToken, signToken } from "../lib/auth.js";

const user = {
  id: 11, email: "notes@example.test", name: "Notes QA", isActive: true,
  sessionToken: "notes-test-session", branchId: 2, authorityLevel: "staff",
  jobFunction: "documentation", workspaceAccess: '["documentation"]',
  accessProfileMigratedAt: new Date("2026-09-08T00:00:00Z"), canUpload: false,
};
const note = {
  id: 1, containerId: 31, stage: "documentation", note: "QA note",
  authorId: 11, authorName: user.name, branchId: 2,
  createdAt: new Date("2026-09-08T12:00:00Z"),
};
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use("/api", containersRouter);
const cookie = `cost_analysis_session=${signToken(user.id, user.sessionToken)}`;
const csrf = createCsrfToken(user.sessionToken);
let container: { branchId: number } | undefined;
let notes: typeof note[];
let writes: { table: unknown; value: Record<string, unknown> }[];

beforeEach(() => {
  container = { branchId: 2 };
  notes = [note];
  writes = [];
  vi.clearAllMocks();
  mocked.select.mockImplementation(() => ({
    from: (table: unknown) => ({
      where: () => {
        if (table === usersTable) return { limit: async () => [user] };
        if (table === branchesTable) return { limit: async () => [{ isActive: true }] };
        if (table === containersTable) return Promise.resolve(container ? [container] : []);
        if (table === containerStageNotesTable) return { orderBy: async () => notes };
        throw new Error("Unexpected table read");
      },
    }),
  }));
  mocked.insert.mockImplementation(table => ({
    values: (value: Record<string, unknown>) => {
      writes.push({ table, value });
      return { returning: async () => [{ ...note, ...value }] };
    },
  }));
});

describe("canonical container stage-notes API with real authentication and branch guard", () => {
  it("returns JSON notes at the URL used by the client", async () => {
    const response = await request(app).get("/api/containers/31/stage-notes").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.body).toEqual([{ ...note, createdAt: note.createdAt.toISOString() }]);
  });

  it("returns a genuine empty array when there are no notes", async () => {
    notes = [];
    const response = await request(app).get("/api/containers/31/stage-notes").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("adds a note and timeline entry with server-owned author and container branch", async () => {
    const response = await request(app).post("/api/containers/31/stage-notes").set("Cookie", cookie).set("X-CSRF-Token", csrf)
      .send({ stage: "documentation", note: "  Added note  ", branchId: 99, authorId: 99 });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ note: "Added note", branchId: 2, authorId: 11 });
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ table: containerStageNotesTable, value: { containerId: 31, branchId: 2, authorId: 11 } });
    expect(writes[1]).toMatchObject({ table: containerTimelineTable, value: { containerId: 31, branchId: 2, eventType: "note" } });
  });

  it.each(["get", "post"] as const)("rejects unauthenticated %s requests", async method => {
    const response = await request(app)[method]("/api/containers/31/stage-notes").send({ stage: "documentation", note: "Blocked" });
    expect(response.status).toBe(401);
    expect(writes).toEqual([]);
  });

  it("preserves CSRF protection on note creation", async () => {
    const response = await request(app).post("/api/containers/31/stage-notes").set("Cookie", cookie)
      .send({ stage: "documentation", note: "Blocked" });
    expect(response.status).toBe(403);
    expect(writes).toEqual([]);
  });

  it.each(["get", "post"] as const)("denies cross-branch %s even with a forged branch header", async method => {
    container = { branchId: 3 };
    const response = await request(app)[method]("/api/containers/31/stage-notes")
      .set("Cookie", cookie).set("X-CSRF-Token", csrf).set("X-Branch-Id", "3").send({ stage: "documentation", note: "Blocked" });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Container not found" });
    expect(writes).toEqual([]);
  });

  it("returns 404 for a missing container and 400 for blank notes", async () => {
    const blank = await request(app).post("/api/containers/31/stage-notes").set("Cookie", cookie).set("X-CSRF-Token", csrf)
      .send({ stage: "documentation", note: " " });
    expect(blank.status).toBe(400);
    container = undefined;
    const missing = await request(app).get("/api/containers/31/stage-notes").set("Cookie", cookie);
    expect(missing.status).toBe(404);
    expect(writes).toEqual([]);
  });
});
