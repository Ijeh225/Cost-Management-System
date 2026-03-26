import app from "./app";
import { db, pool, containersTable, appMigrationsTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_migrations (
      name VARCHAR(255) PRIMARY KEY,
      ran_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
}

async function runMigration(name: string, fn: () => Promise<void>) {
  const result = await pool.query(
    `INSERT INTO app_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
    [name]
  );
  if ((result as { rowCount: number | null }).rowCount === 0) return;
  await fn();
  console.log(`[migration] Ran: ${name}`);
}

async function runStartupMigrations() {
  try {
    await ensureMigrationsTable();
    await runMigration("backfill_delivered_at_for_completed_containers", async () => {
      const rows = await db.select({ id: containersTable.id, updatedAt: containersTable.updatedAt })
        .from(containersTable)
        .where(and(
          inArray(containersTable.status, ["completed", "closed"]),
          isNull(containersTable.deliveredAt)
        ));
      for (const row of rows) {
        await db.update(containersTable)
          .set({ deliveredAt: row.updatedAt, deliveredAtEstimated: true })
          .where(eq(containersTable.id, row.id));
      }
      if (rows.length > 0) {
        console.log(`[migration] Backfilled deliveredAt for ${rows.length} completed/closed containers.`);
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
