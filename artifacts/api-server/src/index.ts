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

    await runMigration("create_expense_categories_table", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS expense_categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO expense_categories (name, is_default) VALUES
          ('Salaries', TRUE),
          ('Office Rent', TRUE),
          ('Fuel', TRUE),
          ('Bank Charges', TRUE),
          ('Utilities', TRUE),
          ('Maintenance', TRUE),
          ('Other', TRUE)
        ON CONFLICT DO NOTHING
      `);
    });

    await runMigration("create_expense_payments_table", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS expense_payments (
          id SERIAL PRIMARY KEY,
          expense_id INTEGER NOT NULL REFERENCES overhead_expenses(id) ON DELETE CASCADE,
          amount NUMERIC(15,2) NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          bank_id INTEGER REFERENCES banks(id) ON DELETE SET NULL,
          paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
          notes TEXT,
          recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
    });

    await runMigration("create_overhead_expense_topups_table", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS overhead_expense_topups (
          id SERIAL PRIMARY KEY,
          expense_id INTEGER NOT NULL REFERENCES overhead_expenses(id) ON DELETE CASCADE,
          amount NUMERIC(18,2) NOT NULL,
          description TEXT NOT NULL,
          recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          branch_id INTEGER NOT NULL DEFAULT 1 REFERENCES branches(id),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS overhead_expense_topups_expense_id_idx ON overhead_expense_topups(expense_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS overhead_expense_topups_branch_id_idx ON overhead_expense_topups(branch_id)`);
    });

    await runMigration("migrate_existing_expenses_to_payments", async () => {
      await pool.query(`
        INSERT INTO expense_payments (expense_id, amount, payment_method, bank_id, paid_at, recorded_by, created_at)
        SELECT
          id,
          CAST(amount AS NUMERIC(15,2)),
          CASE WHEN bank_id IS NOT NULL THEN 'bank' ELSE 'cash' END,
          bank_id,
          COALESCE(paid_at, created_at),
          recorded_by,
          created_at
        FROM overhead_expenses
        WHERE amount IS NOT NULL AND CAST(amount AS NUMERIC) > 0
        ON CONFLICT DO NOTHING
      `);
    });

    await runMigration("create_container_expense_categories_table", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS container_expense_categories (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        INSERT INTO container_expense_categories (name, is_default) VALUES
          ('Shipping Charges', TRUE),
          ('Customs Duty', TRUE),
          ('Terminal Charges', TRUE),
          ('Delivery / Trucking', TRUE),
          ('Demurrage', TRUE),
          ('Storage', TRUE),
          ('NAFDAC / SON Fees', TRUE),
          ('Port Charges (NPA / Wharfage)', TRUE),
          ('SIFAX / GMT Signing', TRUE),
          ('Bond / Manifest', TRUE),
          ('CIU', TRUE),
          ('Agency Fees', TRUE),
          ('FOU Booking', TRUE),
          ('Miscellaneous', TRUE)
        ON CONFLICT DO NOTHING
      `);
    });

    await runMigration("create_container_expense_payments_table", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS container_expense_payments (
          id SERIAL PRIMARY KEY,
          container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
          category_id INTEGER NOT NULL REFERENCES container_expense_categories(id) ON DELETE RESTRICT,
          amount NUMERIC(15,2) NOT NULL,
          payment_method TEXT NOT NULL DEFAULT 'cash',
          bank_id INTEGER REFERENCES banks(id) ON DELETE SET NULL,
          reference TEXT,
          narration TEXT,
          paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
          recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
    });

    await runMigration("overhead_paid_at_drop_not_null", async () => {
      await pool.query(`
        ALTER TABLE overhead_expenses ALTER COLUMN paid_at DROP NOT NULL
      `);
    });

    await runMigration("overhead_paid_at_drop_default", async () => {
      await pool.query(`
        ALTER TABLE overhead_expenses ALTER COLUMN paid_at DROP DEFAULT
      `);
    });

    await runMigration("add_section_to_container_expense_payments_v2", async () => {
      await pool.query(`
        ALTER TABLE container_expense_payments
        ADD COLUMN IF NOT EXISTS section TEXT
      `);
      await pool.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'container_expense_payments'
              AND column_name = 'category_id'
              AND is_nullable = 'NO'
          ) THEN
            ALTER TABLE container_expense_payments ALTER COLUMN category_id DROP NOT NULL;
          END IF;
        END $$;
      `);
    });

    await runMigration("add_fx_fields_to_charges_tables", async () => {
      for (const tbl of ["shipping_charges", "customs_charges", "terminal_charges", "delivery_charges", "operations_charges"]) {
        await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS usd_amount NUMERIC(15,2)`);
        await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(15,6)`);
      }
    });

    // Multi-Branch Foundation (Task #73): create branches table, seed default
    // "Head Office" branch, and add a branch_id FK to every business table so
    // each branch's data can be cleanly isolated downstream (Task #74).
    await runMigration("multi_branch_foundation_v1", async () => {
      // 1. Create branches table.
      await pool.query(`
        CREATE TABLE IF NOT EXISTS branches (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          short_code TEXT NOT NULL DEFAULT '',
          location TEXT NOT NULL DEFAULT '',
          contact_email TEXT NOT NULL DEFAULT '',
          contact_phone TEXT NOT NULL DEFAULT '',
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);

      // 2. Seed the default "Head Office" branch.
      await pool.query(`
        INSERT INTO branches (name, short_code, location)
        VALUES ('Head Office', 'HQ', '')
        ON CONFLICT (name) DO NOTHING
      `);
      const { rows: branchRows } = await pool.query<{ id: number }>(
        `SELECT id FROM branches ORDER BY id ASC LIMIT 1`
      );
      const defaultBranchId = branchRows[0]?.id;
      if (!defaultBranchId) {
        throw new Error("Failed to create or locate default branch");
      }

      // 3. Add branch_id (nullable), backfill, then lock down with NOT NULL + FK + index.
      const BRANCHED_TABLES = [
        "users",
        "containers",
        "clients",
        "invoices",
        "container_tasks",
        "section_approvals",
        "container_documents",
        "container_timeline",
        "container_extra_charges",
        "container_expense_payments",
        "container_expense_categories",
        "custom_sections",
        "custom_fields",
        "custom_field_values",
        "notifications_read",
        "system_alerts_history",
        "audit_log",
        "user_client_assignments",
        "whatsapp_messages",
        "workflow_notifications",
        "banks",
        "bank_fund_additions",
        "bank_transfers",
        "client_deposits",
        "credit_notes",
        "expense_categories",
        "expense_payments",
        "invoice_audit_log",
        "overhead_expenses",
      ];

      for (const tbl of BRANCHED_TABLES) {
        // Skip silently if the table doesn't exist yet (e.g. fresh deploy where
        // drizzle-kit push hasn't created it). On the next push the column
        // will already be in the schema definition and get added correctly.
        const { rows: tableExists } = await pool.query<{ exists: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          ) AS "exists"`,
          [tbl]
        );
        if (!tableExists[0]?.exists) {
          console.log(`[migration] Skipping ${tbl} (table does not exist yet)`);
          continue;
        }

        await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
        await pool.query(
          `UPDATE ${tbl} SET branch_id = $1 WHERE branch_id IS NULL`,
          [defaultBranchId]
        );
        // Set DEFAULT so legacy insert sites that don't pass branch_id still work.
        // Task #74 will remove these defaults once every insert site stamps the
        // active branch explicitly.
        await pool.query(
          `ALTER TABLE ${tbl} ALTER COLUMN branch_id SET DEFAULT ${defaultBranchId}`
        );
        await pool.query(`ALTER TABLE ${tbl} ALTER COLUMN branch_id SET NOT NULL`);
        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = '${tbl}_branch_id_fk'
            ) THEN
              ALTER TABLE ${tbl}
                ADD CONSTRAINT ${tbl}_branch_id_fk
                FOREIGN KEY (branch_id) REFERENCES branches(id);
            END IF;
          END $$;
        `);
        await pool.query(
          `CREATE INDEX IF NOT EXISTS ${tbl}_branch_id_idx ON ${tbl}(branch_id)`
        );
      }
      console.log(`[migration] Multi-branch foundation: assigned all existing data to branch id=${defaultBranchId}`);
    });

    // v2: extend the foundation to additional finance/banking business tables.
    // Same column shape (branch_id INTEGER NOT NULL DEFAULT <head office> + FK + index)
    // and backfill semantics — applied only to tables added after v1 ran.
    await runMigration("multi_branch_foundation_v2_finance_tables", async () => {
      const { rows: branchRows } = await pool.query<{ id: number }>(
        `SELECT id FROM branches ORDER BY id ASC LIMIT 1`
      );
      const defaultBranchId = branchRows[0]?.id;
      if (!defaultBranchId) {
        throw new Error("Failed to locate default branch for v2 migration");
      }

      const V2_TABLES = [
        "banks",
        "bank_fund_additions",
        "bank_transfers",
        "client_deposits",
        "credit_notes",
        "expense_categories",
        "expense_payments",
        "invoice_audit_log",
        "overhead_expenses",
      ];

      for (const tbl of V2_TABLES) {
        const { rows: tableExists } = await pool.query<{ exists: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          ) AS "exists"`,
          [tbl]
        );
        if (!tableExists[0]?.exists) {
          console.log(`[migration] v2: Skipping ${tbl} (table does not exist yet)`);
          continue;
        }

        await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
        await pool.query(
          `UPDATE ${tbl} SET branch_id = $1 WHERE branch_id IS NULL`,
          [defaultBranchId]
        );
        await pool.query(
          `ALTER TABLE ${tbl} ALTER COLUMN branch_id SET DEFAULT ${defaultBranchId}`
        );
        await pool.query(`ALTER TABLE ${tbl} ALTER COLUMN branch_id SET NOT NULL`);
        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = '${tbl}_branch_id_fk'
            ) THEN
              ALTER TABLE ${tbl}
                ADD CONSTRAINT ${tbl}_branch_id_fk
                FOREIGN KEY (branch_id) REFERENCES branches(id);
            END IF;
          END $$;
        `);
        await pool.query(
          `CREATE INDEX IF NOT EXISTS ${tbl}_branch_id_idx ON ${tbl}(branch_id)`
        );
      }
      console.log(`[migration] Multi-branch foundation v2: branched ${V2_TABLES.length} finance tables to branch id=${defaultBranchId}`);
    });

    // v3: extend the foundation to remaining business tables — section charge
    // tables (each container has one row per section) and invoice line/payment
    // tables. Same column shape and backfill semantics as v1/v2.
    await runMigration("multi_branch_foundation_v3_charges_and_invoice_lines", async () => {
      const { rows: branchRows } = await pool.query<{ id: number }>(
        `SELECT id FROM branches ORDER BY id ASC LIMIT 1`
      );
      const defaultBranchId = branchRows[0]?.id;
      if (!defaultBranchId) {
        throw new Error("Failed to locate default branch for v3 migration");
      }

      const V3_TABLES = [
        "shipping_charges",
        "customs_charges",
        "terminal_charges",
        "delivery_charges",
        "operations_charges",
        "invoice_items",
        "invoice_payments",
      ];

      for (const tbl of V3_TABLES) {
        const { rows: tableExists } = await pool.query<{ exists: boolean }>(
          `SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
          ) AS "exists"`,
          [tbl]
        );
        if (!tableExists[0]?.exists) {
          console.log(`[migration] v3: Skipping ${tbl} (table does not exist yet)`);
          continue;
        }

        await pool.query(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS branch_id INTEGER`);
        // Backfill from parent: charges and invoice_items derive via container,
        // invoice_payments derives via invoice. Falls back to default branch
        // for orphaned rows.
        if (tbl === "invoice_payments") {
          await pool.query(`
            UPDATE invoice_payments p SET branch_id = i.branch_id
            FROM invoices i WHERE p.invoice_id = i.id AND p.branch_id IS NULL
          `);
        } else if (tbl === "invoice_items") {
          await pool.query(`
            UPDATE invoice_items it SET branch_id = i.branch_id
            FROM invoices i WHERE it.invoice_id = i.id AND it.branch_id IS NULL
          `);
        } else {
          // section charge tables — derive from containers via container_id
          await pool.query(`
            UPDATE ${tbl} t SET branch_id = c.branch_id
            FROM containers c WHERE t.container_id = c.id AND t.branch_id IS NULL
          `);
        }
        await pool.query(
          `UPDATE ${tbl} SET branch_id = $1 WHERE branch_id IS NULL`,
          [defaultBranchId]
        );
        await pool.query(
          `ALTER TABLE ${tbl} ALTER COLUMN branch_id SET DEFAULT ${defaultBranchId}`
        );
        await pool.query(`ALTER TABLE ${tbl} ALTER COLUMN branch_id SET NOT NULL`);
        await pool.query(`
          DO $$
          BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_constraint WHERE conname = '${tbl}_branch_id_fk'
            ) THEN
              ALTER TABLE ${tbl}
                ADD CONSTRAINT ${tbl}_branch_id_fk
                FOREIGN KEY (branch_id) REFERENCES branches(id);
            END IF;
          END $$;
        `);
        await pool.query(
          `CREATE INDEX IF NOT EXISTS ${tbl}_branch_id_idx ON ${tbl}(branch_id)`
        );
      }
      console.log(`[migration] Multi-branch foundation v3: branched ${V3_TABLES.length} charge/invoice-line tables`);
    });

    // v4: per-branch communications config columns and branch-scoped uniqueness.
    await runMigration("multi_branch_foundation_v4_comms_and_uniqueness", async () => {
      // Comm config columns on branches.
      await pool.query(`
        ALTER TABLE branches
          ADD COLUMN IF NOT EXISTS whatsapp_mode TEXT NOT NULL DEFAULT 'head_office',
          ADD COLUMN IF NOT EXISTS whatsapp_number TEXT,
          ADD COLUMN IF NOT EXISTS email_mode TEXT NOT NULL DEFAULT 'head_office',
          ADD COLUMN IF NOT EXISTS email_from_address TEXT,
          ADD COLUMN IF NOT EXISTS email_reply_to TEXT
      `);
      // Drop legacy global-uniques on category/section names so each branch
      // can have its own copy. Composite (branch_id, name|slug) unique replaces it.
      const dropAndRecreate = async (table: string, col: string) => {
        const { rows } = await pool.query<{ conname: string }>(`
          SELECT conname FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          WHERE t.relname = $1 AND c.contype = 'u'
            AND pg_get_constraintdef(c.oid) ~ ('\\(' || $2 || '\\)$')
        `, [table, col]);
        for (const r of rows) {
          await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS "${r.conname}"`);
        }
        await pool.query(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${table}_${col}_branch_uniq')
              AND NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = '${table}_${col}_branch_uniq') THEN
              ALTER TABLE ${table} ADD CONSTRAINT ${table}_${col}_branch_uniq UNIQUE (branch_id, ${col});
            END IF;
          END $$;
        `);
      };
      await dropAndRecreate("expense_categories", "name");
      await dropAndRecreate("container_expense_categories", "name");
      console.log(`[migration] Multi-branch foundation v4: comms config + per-branch uniqueness applied`);
    });
    await runMigration("workflow_notifications_target_user_id_v1", async () => {
      await pool.query(`
        ALTER TABLE workflow_notifications
          ADD COLUMN IF NOT EXISTS target_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS workflow_notifications_target_user_idx ON workflow_notifications(target_user_id)`);
    });
    await runMigration("workflow_notifications_action_url_v1", async () => {
      await pool.query(`
        ALTER TABLE workflow_notifications
          ADD COLUMN IF NOT EXISTS action_url TEXT
      `);
    });
    await runMigration("container_verification_officer_v1", async () => {
      await pool.query(`
        ALTER TABLE containers
          ADD COLUMN IF NOT EXISTS verification_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS containers_verification_officer_idx ON containers(verification_officer_id)`);
    });
    await runMigration("container_berthing_officer_v1", async () => {
      await pool.query(`
        ALTER TABLE containers
          ADD COLUMN IF NOT EXISTS berthing_officer_id INTEGER REFERENCES users(id) ON DELETE SET NULL
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS containers_berthing_officer_idx ON containers(berthing_officer_id)`);
    });
    await runMigration("container_multi_officers_v1", async () => {
      await pool.query(`
        ALTER TABLE containers
          ADD COLUMN IF NOT EXISTS verification_officer_ids TEXT NOT NULL DEFAULT '[]',
          ADD COLUMN IF NOT EXISTS berthing_officer_ids TEXT NOT NULL DEFAULT '[]'
      `);
    });
    await runMigration("whatsapp_messages_meta_provider_v1", async () => {
      await pool.query(`
        ALTER TABLE whatsapp_messages
          ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'meta',
          ADD COLUMN IF NOT EXISTS provider_message_id TEXT
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS whatsapp_messages_provider_message_id_idx ON whatsapp_messages(provider_message_id)`);
    });
    await runMigration("payment_schedules_module_v1", async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payment_schedules (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER NOT NULL REFERENCES branches(id),
          schedule_date TIMESTAMP NOT NULL,
          original_request_date TIMESTAMP NOT NULL DEFAULT NOW(),
          requested_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          vendor_beneficiary TEXT NOT NULL,
          client_name TEXT,
          description TEXT NOT NULL,
          amount_requested NUMERIC(18,2) NOT NULL,
          amount_approved NUMERIC(18,2) NOT NULL DEFAULT 0,
          amount_paid NUMERIC(18,2) NOT NULL DEFAULT 0,
          priority TEXT NOT NULL DEFAULT 'normal',
          status TEXT NOT NULL DEFAULT 'pending_approval',
          completed_at TIMESTAMP,
          cancelled_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payment_schedule_events (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER NOT NULL REFERENCES branches(id),
          schedule_id INTEGER NOT NULL REFERENCES payment_schedules(id) ON DELETE CASCADE,
          type TEXT NOT NULL,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          comment TEXT,
          amount NUMERIC(18,2),
          old_status TEXT,
          new_status TEXT,
          old_schedule_date TIMESTAMP,
          new_schedule_date TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS payment_schedule_documents (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER NOT NULL REFERENCES branches(id),
          schedule_id INTEGER NOT NULL REFERENCES payment_schedules(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
          size INTEGER NOT NULL DEFAULT 0,
          uploaded_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedules_branch_id_idx ON payment_schedules(branch_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedules_requested_by_idx ON payment_schedules(requested_by_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedules_status_idx ON payment_schedules(status)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedules_schedule_date_idx ON payment_schedules(schedule_date)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedule_events_schedule_id_idx ON payment_schedule_events(schedule_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedule_documents_schedule_id_idx ON payment_schedule_documents(schedule_id)`);
    });
    await runMigration("payment_schedules_overhead_link_v1", async () => {
      await pool.query(`
        ALTER TABLE payment_schedules
          ADD COLUMN IF NOT EXISTS overhead_expense_id INTEGER REFERENCES overhead_expenses(id) ON DELETE SET NULL
      `);
      await pool.query(`
        ALTER TABLE expense_payments
          ADD COLUMN IF NOT EXISTS payment_schedule_id INTEGER REFERENCES payment_schedules(id) ON DELETE SET NULL
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS payment_schedules_overhead_expense_id_idx ON payment_schedules(overhead_expense_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS expense_payments_payment_schedule_id_idx ON expense_payments(payment_schedule_id)`);
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
