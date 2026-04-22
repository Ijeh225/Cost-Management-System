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

    await runMigration("add_internal_note_column_to_containers", async () => {
      await pool.query(
        `ALTER TABLE containers ADD COLUMN IF NOT EXISTS internal_note text`
      );
      console.log("[migration] Added internal_note column to containers (if not exists).");
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
