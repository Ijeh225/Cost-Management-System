import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@workspace/db", async () => ({ ...await import("../../../../lib/db/src/schema/index.js"), db: mock }));
import { assignShipmentClient } from "../lib/shipment-client.js";
import { ensureShipmentSchema } from "../lib/shipment-schema.js";

let pg: PGlite;
beforeEach(async () => {
  pg = new PGlite();
  await pg.exec(`CREATE TABLE branches(id INTEGER PRIMARY KEY);
    CREATE TABLE clients(id INTEGER PRIMARY KEY,branch_id INTEGER);
    INSERT INTO branches VALUES(1),(2); INSERT INTO clients VALUES(1,1),(2,1),(3,2);
    CREATE TABLE containers(id SERIAL PRIMARY KEY, branch_id INTEGER NOT NULL,
      client_id INTEGER,customer_name TEXT NOT NULL,container_number TEXT NOT NULL,
      bl_number TEXT NOT NULL,updated_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE audit_log(id SERIAL PRIMARY KEY,branch_id INTEGER,container_id INTEGER,user_id INTEGER,
      action TEXT,section TEXT,field_changed TEXT,old_value TEXT,new_value TEXT,reason TEXT,created_at TIMESTAMP DEFAULT NOW());
    CREATE TABLE financial_facts(container_id INTEGER,client_id INTEGER,amount NUMERIC);
  `);
  await ensureShipmentSchema({ connect: async () => ({ query: sql => pg.exec(sql), release() {} }) });
  await pg.exec(`INSERT INTO containers(branch_id,client_id,customer_name,container_number,bl_number)
    VALUES(1,1,'QA','ONE','BL-A'),(1,1,'QA','TWO','BL-A'),(1,1,'QA','THREE','BL-A');
    INSERT INTO financial_facts VALUES(1,1,99);`);
  const db = drizzle(pg);
  mock.transaction.mockImplementation(db.transaction.bind(db));
}, 20000);
afterEach(async () => { await pg.close(); });

describe("atomic shipment client correction", () => {
  it("requires confirmation for a multi-container B/L without partial changes", async () => {
    await expect(assignShipmentClient(1,1,7,2,"New QA",false)).rejects.toThrow("Confirm changing");
    expect((await pg.query("SELECT DISTINCT client_id FROM containers")).rows).toEqual([{ client_id: 1 }]);
    expect((await pg.query("SELECT count(*)::int AS n FROM audit_log")).rows).toEqual([{ n: 0 }]);
  });
  it("updates the whole B/L once, with per-visit audit and unchanged financial history", async () => {
    expect(await assignShipmentClient(1,1,7,2,"New QA",true)).toBe(3);
    expect((await pg.query("SELECT DISTINCT client_id,customer_name FROM containers")).rows).toEqual([{ client_id: 2, customer_name: "New QA" }]);
    expect((await pg.query("SELECT count(*)::int AS n FROM audit_log WHERE user_id=7")).rows).toEqual([{ n: 3 }]);
    expect((await pg.query("SELECT * FROM financial_facts")).rows).toEqual([{ container_id: 1, client_id: 1, amount: "99" }]);
    expect((await pg.query("SELECT client_id FROM shipments")).rows).toEqual([{ client_id: 2 }]);
    await assignShipmentClient(1,1,7,2,"New QA",true);
    expect((await pg.query("SELECT count(*)::int AS n FROM audit_log")).rows).toEqual([{ n: 3 }]);
  });
  it("unlinks all siblings consistently", async () => {
    await assignShipmentClient(1,1,7,null,null,true);
    expect((await pg.query("SELECT DISTINCT client_id FROM containers")).rows).toEqual([{ client_id: null }]);
    expect((await pg.query("SELECT client_id FROM shipments")).rows).toEqual([{ client_id: null }]);
  });
  it("rolls back parent and children on a cross-branch client or unauthorized branch", async () => {
    await expect(assignShipmentClient(1,2,7,2,"Wrong branch",true)).rejects.toThrow("Shipment not found");
    await expect(assignShipmentClient(1,1,7,3,"Other branch",true)).rejects.toThrow();
    expect((await pg.query("SELECT client_id FROM shipments")).rows).toEqual([{ client_id: 1 }]);
    expect((await pg.query("SELECT DISTINCT client_id FROM containers")).rows).toEqual([{ client_id: 1 }]);
  });
});
