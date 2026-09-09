// This compatibility boundary keeps imports and existing container writers on one
// atomic identity path while retaining every container ID and downstream FK.
export const shipmentSchemaSql = `
CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id),
  bl_number TEXT NOT NULL,
  bl_key TEXT NOT NULL,
  client_id INTEGER REFERENCES clients(id),
  customer_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT shipments_branch_bl_key_unique UNIQUE(branch_id, bl_key)
);
CREATE TABLE IF NOT EXISTS container_equipment (
  id SERIAL PRIMARY KEY,
  number_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
ALTER TABLE containers ADD COLUMN IF NOT EXISTS shipment_id INTEGER REFERENCES shipments(id);
ALTER TABLE containers ADD COLUMN IF NOT EXISTS equipment_id INTEGER REFERENCES container_equipment(id);

CREATE OR REPLACE FUNCTION assign_container_shipment() RETURNS TRIGGER AS $$
DECLARE
  parent shipments%ROWTYPE;
  box_id INTEGER;
  normalized_bl TEXT := upper(btrim(NEW.bl_number));
  normalized_box TEXT := upper(btrim(NEW.container_number));
BEGIN
  IF normalized_bl = '' OR normalized_box = '' THEN
    RAISE EXCEPTION 'B/L and container number must not be blank' USING ERRCODE = '23514';
  END IF;
  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM clients WHERE id = NEW.client_id AND branch_id = NEW.branch_id
  ) THEN
    RAISE EXCEPTION 'Shipment client must belong to the selected branch' USING ERRCODE = '23514';
  END IF;

  INSERT INTO shipments(branch_id, bl_number, bl_key, client_id, customer_name)
  VALUES (NEW.branch_id, btrim(NEW.bl_number), normalized_bl, NEW.client_id, NEW.customer_name)
  ON CONFLICT (branch_id, bl_key) DO NOTHING;
  SELECT * INTO parent FROM shipments
    WHERE branch_id = NEW.branch_id AND bl_key = normalized_bl FOR UPDATE;

  IF parent.client_id IS DISTINCT FROM NEW.client_id OR
     (parent.client_id IS NULL AND upper(btrim(parent.customer_name)) <> upper(btrim(NEW.customer_name))) THEN
    -- A single existing visit can still be corrected; never relabel siblings.
    IF TG_OP = 'UPDATE' AND OLD.shipment_id = parent.id AND NOT EXISTS (
      SELECT 1 FROM containers WHERE shipment_id = parent.id AND id <> OLD.id
    ) THEN
      UPDATE shipments SET client_id = NEW.client_id, customer_name = NEW.customer_name WHERE id = parent.id;
    ELSE
      RAISE EXCEPTION 'This B/L already belongs to another client in this branch. Use the same client for all containers.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF parent.client_id IS NOT NULL AND parent.customer_name IS DISTINCT FROM NEW.customer_name THEN
    UPDATE shipments SET customer_name = NEW.customer_name WHERE id = parent.id;
  END IF;
  INSERT INTO container_equipment(number_key) VALUES(normalized_box) ON CONFLICT DO NOTHING;
  SELECT id INTO box_id FROM container_equipment WHERE number_key = normalized_box;
  NEW.shipment_id := parent.id;
  NEW.equipment_id := box_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS containers_assign_shipment ON containers;
CREATE TRIGGER containers_assign_shipment
BEFORE INSERT OR UPDATE OF bl_number, container_number, branch_id, client_id, customer_name, shipment_id, equipment_id
ON containers FOR EACH ROW EXECUTE FUNCTION assign_container_shipment();

-- The transaction rolls back if historic identities conflict. Never merge or
-- delete financial history to make a migration succeed.
UPDATE containers SET bl_number = bl_number WHERE shipment_id IS NULL OR equipment_id IS NULL;
ALTER TABLE containers ALTER COLUMN shipment_id SET NOT NULL;
ALTER TABLE containers ALTER COLUMN equipment_id SET NOT NULL;
DO $$ DECLARE item RECORD; BEGIN
  FOR item IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'containers'::regclass AND contype = 'u'
      AND pg_get_constraintdef(oid) IN ('UNIQUE (bl_number)', 'UNIQUE (container_number)')
  LOOP EXECUTE format('ALTER TABLE containers DROP CONSTRAINT %I', item.conname); END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'containers'::regclass
    AND conname = 'containers_shipment_equipment_unique') THEN
    ALTER TABLE containers ADD CONSTRAINT containers_shipment_equipment_unique UNIQUE(shipment_id, equipment_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS containers_shipment_idx ON containers(shipment_id);
CREATE INDEX IF NOT EXISTS containers_equipment_idx ON containers(equipment_id);
`;

type MigrationPool = { connect(): Promise<{ query(sql: string): Promise<unknown>; release(): void }> };

export async function ensureShipmentSchema(pool: MigrationPool) {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(704202609)");
    await connection.query("LOCK TABLE containers IN ACCESS EXCLUSIVE MODE");
    await connection.query(shipmentSchemaSql);
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK");
    throw error;
  } finally {
    connection.release();
  }
}

export function shipmentWriteError(error: unknown): string | null {
  const nested = error as { code?: string; message?: string; cause?: unknown };
  if (nested?.code === "23505") return "This container already exists under this B/L. Open the existing visit instead.";
  if (nested?.code === "23514") return nested.message ?? "Invalid shipment identity.";
  return nested?.cause ? shipmentWriteError(nested.cause) : null;
}
