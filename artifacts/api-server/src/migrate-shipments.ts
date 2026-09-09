import { pool } from "@workspace/db";
import { ensureShipmentSchema } from "./lib/shipment-schema";

async function main() {
  try {
    const { rows } = await pool.query("SELECT to_regclass('containers') AS containers");
    if (rows[0].containers) {
      await ensureShipmentSchema(pool);
      console.log("CAP-04 shipment identity migration verified before schema synchronization");
    } else {
      console.log("Fresh database: shipment backfill will run after initial schema creation");
    }
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("Shipment pre-deploy migration failed; existing history was not merged or deleted.", error);
  process.exitCode = 1;
});
