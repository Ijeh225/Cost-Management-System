import app from "./app";
import { db, pool, containersTable, appMigrationsTable, usersTable } from "@workspace/db";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { runScheduledDigest } from "./routes/notifications";

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name VARCHAR(255) PRIMARY KEY,
      ran_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function runMigration(name: string, fn: () => Promise<void>) {
  const check = await pool.query(
    `SELECT 1 FROM app_migrations WHERE name = $1`,
    [name]
  );
  if ((check as { rowCount: number | null }).rowCount !== 0) {
    return;
  }
  await fn();
  await pool.query(
    `INSERT INTO app_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [name]
  );
  console.log(`[migration] Ran: ${name}`);
}

async function runStartupMigrations() {
  try {
    await ensureMigrationsTable();
    // Legacy migration kept for environments that ran it before consolidation.
    // The 'consolidate_to_shipping_terminal_payment' migration that follows
    // supersedes the direction of this one. Because migration names are recorded
    // in the DB, this block is a no-op on any environment that already ran it.
    await runMigration("rename_shipping_terminal_payment_to_shipping_payment", async () => {
      const updated = await db.update(containersTable)
        .set({ status: "shipping_payment" })
        .where(eq(containersTable.status, "shipping_terminal_payment"))
        .returning({ id: containersTable.id });
      if (updated.length > 0) {
        console.log(`[migration] Renamed shipping_terminal_payment → shipping_payment for ${updated.length} container(s).`);
      }
    });

    await runMigration("migrate_old_statuses_to_13_stage_pipeline", async () => {
      const OLD_TO_NEW: Array<[string, string]> = [
        ["new_upload",           "registered"],
        ["documentation_review", "documentation"],
        ["terminal_entry",       "transire_processing"],
        ["shipping_entry",       "shipping_terminal_payment"],
        ["customs_entry",        "examination"],
        ["delivery_entry",       "delivery"],
        ["accounting_review",    "closed"],
        ["management_approval",  "closed"],
        ["completed",            "closed"],
      ];
      let total = 0;
      for (const [oldStatus, newStatus] of OLD_TO_NEW) {
        const updated = await db.update(containersTable)
          .set({ status: newStatus })
          .where(eq(containersTable.status, oldStatus))
          .returning({ id: containersTable.id });
        if (updated.length > 0) {
          console.log(`[migration] ${oldStatus} → ${newStatus}: ${updated.length} container(s)`);
          total += updated.length;
        }
      }
      if (total > 0) console.log(`[migration] Old-status migration: ${total} total container(s) updated.`);
    });

    await runMigration("consolidate_to_shipping_terminal_payment", async () => {
      let total = 0;
      for (const old of ["shipping_payment", "terminal_payment"]) {
        const updated = await db.update(containersTable)
          .set({ status: "shipping_terminal_payment" })
          .where(eq(containersTable.status, old))
          .returning({ id: containersTable.id });
        if (updated.length > 0) {
          console.log(`[migration] ${old} → shipping_terminal_payment: ${updated.length} container(s)`);
          total += updated.length;
        }
      }
      if (total > 0) console.log(`[migration] Shipping+terminal consolidation: ${total} total.`);
    });

    await runMigration("upgrade_admin_role_to_super_admin", async () => {
      const updated = await pool.query(
        `UPDATE users SET role = 'super_admin' WHERE role = 'admin'`
      );
      const count = (updated as { rowCount: number | null }).rowCount ?? 0;
      if (count > 0) {
        console.log(`[migration] Upgraded ${count} admin user(s) to super_admin.`);
      }
    });

    await runMigration("split_shipping_terminal_and_merge_delivery_empty_v2", async () => {
      const split = await db.update(containersTable)
        .set({ status: "shipping" })
        .where(eq(containersTable.status, "shipping_terminal_payment"))
        .returning({ id: containersTable.id });
      if (split.length > 0) {
        console.log(`[migration] shipping_terminal_payment → shipping: ${split.length} container(s)`);
      }
      const merged = await db.update(containersTable)
        .set({ status: "delivery" })
        .where(eq(containersTable.status, "empty_return"))
        .returning({ id: containersTable.id });
      if (merged.length > 0) {
        console.log(`[migration] empty_return → delivery: ${merged.length} container(s)`);
      }
    });

    await runMigration("backfill_delivered_at_for_completed_containers", async () => {
      const updated = await db.update(containersTable)
        .set({
          deliveredAt: sql`${containersTable.updatedAt}`,
          deliveredAtEstimated: true,
        })
        .where(and(
          inArray(containersTable.status, ["closed"]),
          isNull(containersTable.deliveredAt)
        ))
        .returning({ id: containersTable.id });
      if (updated.length > 0) {
        console.log(`[migration] Backfilled deliveredAt for ${updated.length} completed/closed containers.`);
      }
    });
    await runMigration("create_bank_fund_additions_table", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS bank_fund_additions (
          id SERIAL PRIMARY KEY,
          bank_id INTEGER NOT NULL REFERENCES banks(id) ON DELETE CASCADE,
          amount NUMERIC(15,2) NOT NULL,
          narration TEXT NOT NULL DEFAULT '',
          reference TEXT,
          added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
    });
  } catch (err) {
    console.error("[migration] startup migration failed:", err);
    process.exit(1);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

runStartupMigrations().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
  setInterval(() => { runScheduledDigest().catch(console.error); }, 60_000);
});
