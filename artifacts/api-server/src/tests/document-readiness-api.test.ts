import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { getTableConfig } from "drizzle-orm/pg-core";
import express from "express";
import request from "supertest";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() } }));
vi.mock("@workspace/db", async () => ({ ...await import("../../../../lib/db/src/schema/index.js"), db: mock.db }));
vi.mock("../lib/auth.js", async importOriginal => ({ ...await importOriginal<object>(), requireAuth: (_req: unknown, _res: unknown, next: () => void) => next() }));
vi.mock("../lib/document-storage.js", () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn(), getDocumentBuffer: vi.fn(), documentExists: vi.fn(), getDocument: vi.fn() }));
vi.mock("../lib/document-intelligence.js", () => ({ getDocumentIndex: async () => null, indexContainerDocument: async () => null, getIndexableDocument: vi.fn() }));
import { containersTable, usersTable, userClientAssignmentsTable, workflowNotificationsTable, settingsTable } from "@workspace/db";
import { documentReadinessMigration } from "../lib/document-readiness-migration.js";
import { documentReadinessRouter } from "../routes/document-readiness.js";
import { documentsRouter } from "../routes/documents.js";
let pg: { exec: (sql: string) => Promise<unknown>; close: () => Promise<void> };
const networkTest = process.env.CAP02_NETWORK_TEST === "1";
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  const owner = req.header("x-test-role") !== "staff";
  Object.assign(req, { user: { id: owner ? 1 : 2, branchId: 1, role: owner ? "super_admin" : "operations_staff",
    accessProfile: { source: "modern", authorityLevel: owner ? "super_admin" : "staff", jobFunction: owner ? "general_staff" : "operations", workspaces: owner ? [] : ["shipping"], errors: [] } } });
  next();
});
app.use(documentsRouter); app.use(documentReadinessRouter);
beforeAll(async () => {
  let db;
  if (networkTest) {
    const url = new URL(process.env.TEST_DATABASE_URL ?? "");
    if (url.pathname !== "/cost_management_integration_test" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new Error("CAP-02 network checks require the explicit isolated database through a local private tunnel");
    }
    const schema = `cap02_regression_${randomBytes(6).toString("hex")}`;
    const requireDb = createRequire(new URL("../../../../lib/db/package.json", import.meta.url));
    const { Pool } = requireDb("pg");
    const control = new Pool({ connectionString: url.href, max: 1, connectionTimeoutMillis: 15000 });
    if ((await control.query("SELECT current_database() AS name")).rows[0].name !== "cost_management_integration_test") {
      await control.end(); throw new Error("Wrong database identity");
    }
    await control.query(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = new Pool({ connectionString: url.href, max: 6, connectionTimeoutMillis: 15000 });
    pg = { exec: sql => pool.query(sql), close: async () => {
      await pool.end();
      await control.query(`DROP SCHEMA "${schema}" CASCADE`);
      const result = await control.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1", [schema]);
      expect(result.rows[0].n).toBe(0);
      await control.end();
      console.log("Verified CAP-02 temporary test schema removed; existing records untouched");
    } };
    const { drizzle: networkDrizzle } = await import("drizzle-orm/node-postgres");
    db = networkDrizzle(pool);
    console.log("Verified explicit isolated PostgreSQL database identity over private tunnel");
  } else {
    const local = new PGlite(); pg = local; db = drizzle(local);
  }
  await pg.exec("CREATE TABLE branches(id INTEGER PRIMARY KEY); INSERT INTO branches VALUES(1),(2);");
  for (const table of [containersTable, usersTable, userClientAssignmentsTable, workflowNotificationsTable, settingsTable]) {
    const config = getTableConfig(table);
    await pg.exec(`CREATE TABLE "${config.name}" (${config.columns.map(c => `"${c.name}" ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}${c.name === "created_at" ? " DEFAULT now()" : ""}`).join(",")})`);
  }
  await pg.exec(`CREATE TABLE container_documents(id SERIAL PRIMARY KEY, branch_id INTEGER NOT NULL, container_id INTEGER NOT NULL,
    section TEXT, filename TEXT NOT NULL, original_name TEXT NOT NULL, mime_type TEXT NOT NULL, size INTEGER NOT NULL,
    uploaded_by_id INTEGER, created_at TIMESTAMP NOT NULL DEFAULT now());
    INSERT INTO users(id,name) VALUES(1,'Owner'),(2,'Restricted staff');
    INSERT INTO containers(id,branch_id,client_id,container_number) VALUES(1,1,1,'ONE'),(2,2,2,'TWO'),(3,1,3,'THREE');
    INSERT INTO user_client_assignments(user_id,client_id) VALUES(2,1);
    INSERT INTO container_documents(branch_id,container_id,filename,original_name,mime_type,size,uploaded_by_id)
    VALUES(1,1,'legacy','legacy.pdf','application/pdf',1,1);`);
  await pg.exec(documentReadinessMigration);
  await pg.exec(documentReadinessMigration);
  for (const key of Object.keys(mock.db) as (keyof typeof mock.db)[]) mock.db[key].mockImplementation(db[key].bind(db));
}, 30000);
afterAll(async () => { await pg?.close(); });
describe("CAP-02 isolated database/API", () => {
  it("preserves legacy files and denies forged branch/client access", async () => {
    const res = await request(app).get("/containers/1/document-readiness");
    expect(res.status).toBe(200); expect(res.body.ready).toBe(false);
    expect(res.body.documents[0].review).toBeNull();
    for (const path of ["/containers/2/document-readiness", "/containers/3/document-readiness", "/containers/3/documents"]) {
      expect((await request(app).get(path).set("x-test-role", "staff").set("x-branch-id", "all")).status).toBe(404);
    }
  });
  it("creates and applies an immutable branch profile, rejects stale application", async () => {
    const profile = { name: "Import", jobType: "Import", cargoType: "General", requiredTypes: ["release"] };
    expect((await request(app).post("/containers/1/document-readiness/profiles").set("x-test-role", "staff").send(profile)).status).toBe(403);
    const p = await request(app).post("/containers/1/document-readiness/profiles").send(profile);
    expect(p.status).toBe(201);
    const body = { profileId: p.body.id, expectedChecklistId: null };
    expect((await request(app).post("/containers/2/document-readiness/apply").send(body)).status).toBe(409);
    expect((await request(app).post("/containers/1/document-readiness/apply").send(body)).status).toBe(201);
    expect((await request(app).post("/containers/1/document-readiness/apply").send(body)).status).toBe(409);
  });
  it("retains reviewed versions and needs a new review after replacement", async () => {
    const review = { expectedReviewId: null, status: "reviewed", documentType: "release", issuer: "QA",
      expiresOn: null, acceptedFields: { identifier: "REL-001", amount: "", date: "", text: "Human checked" }, notes: "Checked", sourceChecked: true };
    expect((await request(app).post("/containers/1/document-readiness/1/review").set("x-test-role", "staff").send(review)).status).toBe(403);
    expect((await request(app).post("/containers/1/document-readiness/1/review").send({ ...review, sourceChecked: false })).status).toBe(400);
    expect((await request(app).post("/containers/1/document-readiness/1/review").send(review)).status).toBe(201);
    expect((await request(app).get("/containers/1/document-readiness")).body.ready).toBe(true);
    expect((await request(app).delete("/containers/1/documents/1")).status).toBe(409);
    expect((await request(app).post("/containers/1/document-readiness/1/review").send(review)).status).toBe(409);
    const upload = () => request(app).post("/containers/1/documents").field("documentType", "release").field("previousVersionId", "1")
      .attach("file", Buffer.from("replacement"), { filename: "replacement.txt", contentType: "text/plain" });
    const result = await upload(); expect(result.status).toBe(201); expect(result.body.versionNumber).toBe(2);
    expect((await upload()).status).toBe(409);
    const after = await request(app).get("/containers/1/document-readiness");
    expect(after.body.ready).toBe(false); expect(after.body.items[0].status).toBe("received");
    expect(after.body.history).toHaveLength(1); expect(after.body.documents).toHaveLength(2);
    expect((await request(app).delete(`/containers/1/documents/${result.body.id}`)).status).toBe(409);
    await expect(pg.exec(`DELETE FROM container_documents WHERE id=${result.body.id}`)).rejects.toThrow("Retained document history cannot be deleted");
  });
  it.skipIf(!networkTest)("serializes simultaneous human reviews on network PostgreSQL", async () => {
    const state = (await request(app).get("/containers/1/document-readiness")).body;
    const doc = state.documents.find((d: { previousVersionId: number | null }) => d.previousVersionId === 1);
    const review = { expectedReviewId: null, status: "reviewed", documentType: "release", issuer: "Concurrency QA",
      expiresOn: null, acceptedFields: { identifier: "", amount: "", date: "", text: "" }, notes: "One simultaneous review only", sourceChecked: true };
    const responses = await Promise.all([1, 2].map(() => request(app).post(`/containers/1/document-readiness/${doc.id}/review`).send(review)));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const after = (await request(app).get("/containers/1/document-readiness")).body;
    expect(after.history.filter((h: { review: { documentId: number } }) => h.review.documentId === doc.id)).toHaveLength(1);
  });
  it.skipIf(!networkTest)("serializes simultaneous requirement applications on network PostgreSQL", async () => {
    const before = (await request(app).get("/containers/1/document-readiness")).body;
    const body = { profileId: before.profiles[0].id, expectedChecklistId: before.applications[0].application.id };
    const responses = await Promise.all([1, 2].map(() => request(app).post("/containers/1/document-readiness/apply").send(body)));
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const after = (await request(app).get("/containers/1/document-readiness")).body;
    expect(after.applications).toHaveLength(before.applications.length + 1);
  });
  it.skipIf(!networkTest)("prevents parallel replacement forks on network PostgreSQL", async () => {
    const before = (await request(app).get("/containers/1/document-readiness")).body;
    const doc = before.documents.find((d: { previousVersionId: number | null }) => d.previousVersionId === 1);
    const upload = () => request(app).post("/containers/1/documents").field("documentType", "release").field("previousVersionId", String(doc.id))
      .attach("file", Buffer.from("parallel replacement"), { filename: "parallel.txt", contentType: "text/plain" });
    const responses = await Promise.all([upload(), upload()]);
    expect(responses.map(r => r.status).sort()).toEqual([201, 409]);
    const after = (await request(app).get("/containers/1/document-readiness")).body;
    expect(after.documents.filter((d: { previousVersionId: number | null }) => d.previousVersionId === doc.id)).toHaveLength(1);
    expect(after.ready).toBe(false);
  });
});
