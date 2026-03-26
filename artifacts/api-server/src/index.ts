import app from "./app";
import { db, pool, containersTable, appMigrationsTable } from "@workspace/db";
import { and, inArray, isNull, sql } from "drizzle-orm";

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
    await runMigration("backfill_delivered_at_for_completed_containers", async () => {
      const updated = await db.update(containersTable)
        .set({
          deliveredAt: sql`${containersTable.updatedAt}`,
          deliveredAtEstimated: true,
        })
        .where(and(
          inArray(containersTable.status, ["completed", "closed"]),
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
});
