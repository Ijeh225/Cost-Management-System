import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ensureShipmentSchema, shipmentWriteError } from "../lib/shipment-schema.js";
import { findContainerVisit } from "../lib/container-visit-lookup.js";

let pg: PGlite;
const migrate = () => ensureShipmentSchema({ connect: async () => ({ query: sql => pg.exec(sql), release() {} }) });
const insert = (box: string, bl = "BL-ONE", branch = 1, client: number | null = 1) => pg.query<{ id: number; shipment_id: number; equipment_id: number }>(
  `INSERT INTO containers(container_number,bl_number,branch_id,client_id,customer_name) VALUES($1,$2,$3,$4,'Client A') RETURNING *`, [box, bl, branch, client]);

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE TABLE branches(id INTEGER PRIMARY KEY);
    CREATE TABLE clients(id INTEGER PRIMARY KEY, branch_id INTEGER NOT NULL REFERENCES branches(id));
    INSERT INTO branches VALUES(1),(2);
    INSERT INTO clients VALUES(1,1),(2,2),(3,1);
    CREATE TABLE containers(id SERIAL PRIMARY KEY, branch_id INTEGER NOT NULL DEFAULT 1,
      client_id INTEGER REFERENCES clients(id), customer_name TEXT NOT NULL,
      container_number TEXT NOT NULL UNIQUE, bl_number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'documentation', transire_stage_owner TEXT,
      shipping_stage_owner TEXT, delivered_at TIMESTAMP, clearing_charges NUMERIC NOT NULL DEFAULT 0);
    CREATE TABLE facts(id SERIAL PRIMARY KEY, container_id INTEGER REFERENCES containers(id), amount NUMERIC);
  `);
}, 20000);
afterEach(async () => { await pg.close(); });

describe("CAP-04 migration on isolated PostgreSQL (PGlite)", () => {
  it("backfills without changing visit IDs, owners, cost or financial links; reruns safely", async () => {
    await insert("BOX-A");
    await pg.exec("UPDATE containers SET transire_stage_owner='Transire A', shipping_stage_owner='Shipping B', clearing_charges=123; INSERT INTO facts(container_id,amount) VALUES(1,99)");
    const before = (await pg.query("SELECT c.id,c.transire_stage_owner,c.shipping_stage_owner,c.clearing_charges,f.amount FROM containers c JOIN facts f ON f.container_id=c.id")).rows;
    await migrate();
    await migrate();
    expect((await pg.query("SELECT c.id,c.transire_stage_owner,c.shipping_stage_owner,c.clearing_charges,f.amount FROM containers c JOIN facts f ON f.container_id=c.id")).rows).toEqual(before);
    expect((await pg.query("SELECT count(*)::int AS n FROM shipments")).rows).toEqual([{ n: 1 }]);
  });
  it("creates one shipment for three boxes, including case/space-normalized B/L", async () => {
    await migrate();
    const a = (await insert("BOX-A")).rows[0];
    const b = (await insert("BOX-B", " bl-one ")).rows[0];
    const c = (await insert("BOX-C")).rows[0];
    expect([b.shipment_id, c.shipment_id]).toEqual([a.shipment_id, a.shipment_id]);
    expect(new Set([a.equipment_id, b.equipment_id, c.equipment_id]).size).toBe(3);
  });
  it("keeps owners, costs and partial delivery independent without duplicating facts", async () => {
    await migrate(); await insert("BOX-A"); await insert("BOX-B"); await insert("BOX-C");
    await pg.exec("UPDATE containers SET delivered_at=NOW(),status='closed',transire_stage_owner='A',clearing_charges=100 WHERE id=1; INSERT INTO facts(container_id,amount) VALUES(1,50)");
    expect((await pg.query("SELECT count(*) FILTER(WHERE delivered_at IS NOT NULL)::int AS delivered, count(*)::int AS total, sum(clearing_charges)::int AS charges FROM containers")).rows).toEqual([{ delivered: 1, total: 3, charges: 100 }]);
    expect((await pg.query("SELECT transire_stage_owner FROM containers WHERE id=2")).rows).toEqual([{ transire_stage_owner: null }]);
    expect((await pg.query("SELECT sum(amount)::int AS amount FROM facts")).rows).toEqual([{ amount: 50 }]);
  });
  it("rejects duplicate equipment on the same shipment including case and whitespace", async () => {
    await migrate(); await insert("BOX-A");
    await expect(insert(" box-a ", " bl-one ")).rejects.toMatchObject({ code: "23505" });
  });
  it("allows a later visit for the same equipment without reusing visit ID or old facts", async () => {
    await migrate(); const a = (await insert("BOX-A")).rows[0];
    await pg.exec("INSERT INTO facts(container_id,amount) VALUES(1,50)");
    const b = (await insert("box-a", "BL-TWO")).rows[0];
    expect(b.equipment_id).toBe(a.equipment_id); expect(b.id).not.toBe(a.id); expect(b.shipment_id).not.toBe(a.shipment_id);
    expect((await pg.query("SELECT count(*)::int AS n FROM facts WHERE container_id=$1", [b.id])).rows).toEqual([{ n: 0 }]);
  });
  it("keeps identical B/Ls in separate branches separate", async () => {
    await migrate(); const a = (await insert("BOX-A")).rows[0]; const b = (await insert("BOX-B", "BL-ONE", 2, 2)).rows[0];
    expect(b.shipment_id).not.toBe(a.shipment_id);
  });
  it("rejects cross-branch client and conflicting shipment client", async () => {
    await migrate(); await insert("BOX-A");
    await expect(insert("BOX-B", "BL-ONE", 1, 3)).rejects.toMatchObject({ code: "23514" });
    await expect(insert("BOX-C", "BL-OTHER", 1, 2)).rejects.toMatchObject({ code: "23514" });
    expect((await pg.query("SELECT count(*)::int AS n FROM containers")).rows).toEqual([{ n: 1 }]);
  });
  it("rejects blank identifiers", async () => {
    await migrate(); await expect(insert("   ")).rejects.toMatchObject({ code: "23514" });
  });
  it("ignores forged parent/equipment IDs and derives identity from branch and B/L", async () => {
    await migrate(); const a = (await insert("BOX-A")).rows[0]; const b = (await insert("BOX-B", "BL-TWO")).rows[0];
    await pg.query("UPDATE containers SET shipment_id=$1,equipment_id=$2 WHERE id=$3", [a.shipment_id, a.equipment_id, b.id]);
    expect((await pg.query("SELECT shipment_id,equipment_id FROM containers WHERE id=$1", [b.id])).rows).toEqual([{ shipment_id: b.shipment_id, equipment_id: b.equipment_id }]);
  });
  it("allows single-visit client correction but blocks silent reassignment of siblings", async () => {
    await migrate(); await insert("BOX-A");
    await pg.exec("UPDATE containers SET client_id=3 WHERE id=1");
    await insert("BOX-B", "BL-ONE", 1, 3);
    await expect(pg.exec("UPDATE containers SET client_id=1 WHERE id=1")).rejects.toMatchObject({ code: "23514" });
  });
  it("moves only the selected visit when a B/L is corrected", async () => {
    await migrate(); await insert("BOX-A"); await insert("BOX-B");
    await pg.exec("UPDATE containers SET bl_number='BL-TWO' WHERE id=2");
    expect((await pg.query("SELECT count(DISTINCT shipment_id)::int AS n FROM containers")).rows).toEqual([{ n: 2 }]);
  });
  it("rolls back the entire migration on conflicting historic B/L clients", async () => {
    await insert("BOX-A", "BL-ONE", 1, 1); await insert("BOX-B", "bl-one", 1, 3);
    await expect(migrate()).rejects.toMatchObject({ code: "23514" });
    expect((await pg.query("SELECT to_regclass('shipments') AS name")).rows).toEqual([{ name: null }]);
    expect((await pg.query("SELECT count(*)::int AS n FROM containers")).rows).toEqual([{ n: 2 }]);
  });
});

describe("visit lookup and write errors", () => {
  it("requires explicit visit ID on ambiguous equipment and never falls back from a wrong ID", () => {
    const rows = [{ id: 1, containerNumber: "BOX-A" }, { id: 2, containerNumber: "BOX-A" }];
    expect(() => findContainerVisit(rows, NaN, "box-a")).toThrow("multiple shipment visits");
    expect(findContainerVisit(rows, 2, "BOX-A")).toEqual(rows[1]);
    expect(findContainerVisit(rows, 99, "BOX-A")).toBeUndefined();
  });
  it("unwraps database errors without leaking SQL", () => {
    expect(shipmentWriteError({ cause: { code: "23505" } })).toContain("already exists under this B/L");
    expect(shipmentWriteError(new Error("SQL secret"))).toBeNull();
  });
});
