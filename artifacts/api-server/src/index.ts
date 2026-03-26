import app from "./app";
import { db, containersTable, appMigrationsTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function runMigration(name: string, fn: () => Promise<void>) {
  const existing = await db.select().from(appMigrationsTable).where(eq(appMigrationsTable.name, name));
  if (existing.length > 0) return;
  await fn();
  await db.insert(appMigrationsTable).values({ name });
  console.log(`[migration] Ran: ${name}`);
}

async function runStartupMigrations() {
  try {
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
