import app from "./app";
import { db, containersTable } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

async function runStartupMigrations() {
  try {
    const rows = await db.select({ id: containersTable.id, updatedAt: containersTable.updatedAt })
      .from(containersTable)
      .where(and(
        inArray(containersTable.status, ["completed", "closed"]),
        isNull(containersTable.deliveredAt)
      ));
    if (rows.length > 0) {
      for (const row of rows) {
        await db.update(containersTable)
          .set({ deliveredAt: row.updatedAt, deliveredAtEstimated: true })
          .where(eq(containersTable.id, row.id));
      }
      console.log(`[startup] Backfilled deliveredAt for ${rows.length} completed/closed containers.`);
    }
  } catch (err) {
    console.error("[startup] deliveredAt backfill failed:", err);
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
