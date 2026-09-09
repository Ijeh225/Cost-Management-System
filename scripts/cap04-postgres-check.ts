import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { ensureShipmentSchema } from "../artifacts/api-server/src/lib/shipment-schema.js";

const requireDb = createRequire(new URL("../lib/db/package.json", import.meta.url));
const { Pool } = requireDb("pg");
const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString || new URL(connectionString).pathname !== "/cost_management_integration_test") {
  throw new Error("Requires the explicitly isolated cost_management_integration_test database");
}
const schema = `cap04_regression_${randomBytes(6).toString("hex")}`;
const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 15000 });
const scoped = { connect: async () => {
  const client = await pool.connect();
  await client.query(`SET search_path TO "${schema}"`);
  return client;
} };
async function query(sql: string, params: unknown[] = []) {
  const client = await scoped.connect();
  try { return await client.query(sql, params); } finally { client.release(); }
}
const insert = (box: string, bl: string, client = 1) => query(
  "INSERT INTO containers(container_number,bl_number,branch_id,client_id,customer_name) VALUES($1,$2,1,$3,'QA') RETURNING *", [box, bl, client]);
try {
  const identity = (await pool.query("SELECT current_database() AS name")).rows[0];
  assert.equal(identity.name, "cost_management_integration_test");
  await pool.query(`CREATE SCHEMA "${schema}"`);
  await query(`CREATE TABLE branches(id INTEGER PRIMARY KEY);
    CREATE TABLE clients(id INTEGER PRIMARY KEY, branch_id INTEGER);
    INSERT INTO branches VALUES(1); INSERT INTO clients VALUES(1,1),(2,1);
    CREATE TABLE containers(id SERIAL PRIMARY KEY, branch_id INTEGER NOT NULL,
      client_id INTEGER,customer_name TEXT NOT NULL,container_number TEXT UNIQUE NOT NULL,
      bl_number TEXT UNIQUE NOT NULL, status TEXT DEFAULT 'documentation', cost NUMERIC DEFAULT 0);
    CREATE TABLE financial_facts(id SERIAL PRIMARY KEY,container_id INTEGER REFERENCES containers(id),amount NUMERIC);`);
  await insert("OLD-BOX", "OLD-BL");
  await query("INSERT INTO financial_facts(container_id,amount) VALUES(1,500)");
  await ensureShipmentSchema(scoped);
  await ensureShipmentSchema(scoped);
  assert.deepEqual((await query("SELECT container_id,amount::int FROM financial_facts")).rows, [{ container_id: 1, amount: 500 }]);
  console.log("PASS: real PostgreSQL migration, rerun and existing financial link preserved");

  const visits = await Promise.all(["ONE", "TWO", "THREE"].map(box => insert(box, "SHARED-BL")));
  assert.equal(new Set(visits.map(result => result.rows[0].shipment_id)).size, 1);
  assert.equal((await query("SELECT count(*)::int AS n FROM shipments WHERE bl_key='SHARED-BL'")).rows[0].n, 1);
  console.log("PASS: three concurrent different containers create exactly one B/L parent");

  const duplicate = await Promise.allSettled([insert("RACE", "RACE-BL"), insert(" race ", "race-bl")]);
  assert.equal(duplicate.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(duplicate.filter(result => result.status === "rejected").length, 1);
  console.log("PASS: concurrent same-visit retry creates exactly one container");

  const conflict = await Promise.allSettled([insert("CLIENT-A", "CLIENT-RACE", 1), insert("CLIENT-B", "CLIENT-RACE", 2)]);
  assert.equal(conflict.filter(result => result.status === "fulfilled").length, 1);
  console.log("PASS: concurrent conflicting clients cannot share one B/L");

  const later = (await insert("OLD-BOX", "LATER-BL")).rows[0];
  const old = (await query("SELECT * FROM containers WHERE id=1")).rows[0];
  assert.equal(later.equipment_id, old.equipment_id);
  assert.notEqual(later.id, old.id);
  assert.notEqual(later.shipment_id, old.shipment_id);
  assert.equal((await query("SELECT count(*)::int AS n FROM financial_facts WHERE container_id=$1", [later.id])).rows[0].n, 0);
  await query("UPDATE containers SET status='closed',cost=90 WHERE id=$1", [visits[0].rows[0].id]);
  assert.deepEqual((await query("SELECT count(*) FILTER(WHERE status='closed')::int AS closed,sum(cost)::int AS cost FROM containers WHERE shipment_id=$1", [visits[0].rows[0].shipment_id])).rows, [{ closed: 1, cost: 90 }]);
  console.log("PASS: repeat equipment, partial completion and independent costs");
} finally {
  // Only this randomly named, explicitly created fixture namespace is disposable.
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_namespace WHERE nspname=$1", [schema])).rows[0].n, 0);
  await pool.end();
  console.log("Verified temporary test schema removed; public schema and existing records untouched");
}
