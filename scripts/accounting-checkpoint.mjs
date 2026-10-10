// Read-only production archive, never a migration or financial write.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const cli = process.env.RAILWAY_CLI_PATH;
const directory = process.env.ACCOUNTING_BACKUP_DIRECTORY;
assert(cli && directory, "Set the CLI and access-restricted backup directory");
const project = "30166120-54e6-4f58-86ed-18ab396913f1";
const environment = "ecfbfac8-ec44-4257-990f-8a348e126f63";
const service = "9d35262e-f16e-4c3b-b967-dfcce8dc43a8";
const app = "95352cd0-c586-4e39-a35e-fb3c23ad9e52";
const archive = join(directory, "production-before-accounting.dump");
const manifest = join(directory, "checkpoint-manifest.json");
const verifyExisting = process.argv.includes("--verify-existing");
const checkpoint = process.env.ACCOUNTING_CHECKPOINT_HASH ?? "cf29433d0f235aafa973ebd276bc5d2fea093f8c";
assert(/^[a-f0-9]{40}$/.test(checkpoint), "A verified full Git checkpoint hash is required");
if (verifyExisting) assert(existsSync(archive) && existsSync(manifest), "Existing checkpoint required for read-only verification");
else assert(!existsSync(archive) && !existsSync(manifest), "Refusing to overwrite a checkpoint");

function run(args, limit = 16 * 1024 * 1024) {
  const result = spawnSync(cli, args, { encoding: "utf8", windowsHide: true, timeout: 180000, maxBuffer: limit });
  assert.equal(result.status, 0, "Railway checkpoint operation failed; secrets/output withheld");
  return result.stdout;
}
function variables(id) {
  return JSON.parse(run(["variable", "list", "--project", project, "--environment", environment, "--service", id, "--json"]));
}
const appVars = variables(app);
const dbVars = variables(service);
const appUrl = new URL(appVars.DATABASE_URL);
assert.equal(appUrl.hostname, dbVars.PGHOST, "Application database does not match the selected production service");
assert.equal(decodeURIComponent(appUrl.pathname), "/railway");

function ssh(script) {
  const encoded = Buffer.from(script).toString("base64");
  return run(["ssh", "--project", project, "--environment", environment, "--service", service, "--", `sh -c 'echo ${encoded} | base64 -d | sh'`]);
}
const sql = `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT json_build_object('database',current_database(),'serverVersion',current_setting('server_version'),
 'tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
 'counts',(SELECT json_object_agg(t,n) FROM (
 SELECT 'invoices' t,count(*) n FROM invoices UNION ALL SELECT 'invoice_payments',count(*) FROM invoice_payments
 UNION ALL SELECT 'client_deposits',count(*) FROM client_deposits UNION ALL SELECT 'clients',count(*) FROM clients
 UNION ALL SELECT 'containers',count(*) FROM containers UNION ALL SELECT 'banks',count(*) FROM banks
 UNION ALL SELECT 'duty_payment_transactions',count(*) FROM duty_payment_transactions
 UNION ALL SELECT 'expense_payments',count(*) FROM expense_payments
 UNION ALL SELECT 'payment_schedule_payments',count(*) FROM payment_schedule_payments) q),
 'totals',json_build_object(
 'invoicePayments',(SELECT coalesce(sum(amount),0) FROM invoice_payments),
 'deposits',(SELECT coalesce(sum(amount),0) FROM client_deposits),
 'allocatedDeposits',(SELECT coalesce(sum(allocated_amount),0) FROM client_deposits),
 'dutyPayments',(SELECT coalesce(sum(amount),0) FROM duty_payment_transactions),
 'overheadPayments',(SELECT coalesce(sum(amount),0) FROM expense_payments),
 'containerPayments',(SELECT coalesce(sum(amount),0) FROM container_expense_payments),
 'standaloneSchedulePayments',(SELECT coalesce(sum(amount),0) FROM payment_schedule_payments),
 'funding',(SELECT coalesce(sum(amount),0) FROM bank_fund_additions),
 'internalTransfers',(SELECT coalesce(sum(amount),0) FROM bank_transfers)),
 'invoicePaymentMethods',(SELECT json_agg(q) FROM (SELECT payment_method,count(*) rows,sum(amount) amount FROM invoice_payments GROUP BY payment_method) q),
 'legacyAllocationCandidates',(SELECT count(*) FROM invoice_payments WHERE notes ~ '^Applied from deposit #[0-9]+'),
 'activeInvoiceSubtotal',(SELECT coalesce(sum(subtotal),0) FROM invoices WHERE status NOT IN ('draft','cancelled')))::jsonb;
COMMIT;`;
const encodedSql = Buffer.from(sql).toString("base64");
const snapshotOutput = ssh(`set -eu\nprintf '%s' '${encodedSql}' | base64 -d | psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$PGUSER" -d railway`);
const baseline = JSON.parse(snapshotOutput.split(/\r?\n/).find(line => line.trim().startsWith("{")));
assert.equal(baseline.database, "railway");
if (verifyExisting) {
  const saved = JSON.parse(readFileSync(manifest, "utf8"));
  assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"), saved.sha256, "Saved archive checksum changed");
  for (const key of ["tables", "counts", "totals", "invoicePaymentMethods", "legacyAllocationCandidates", "activeInvoiceSubtotal"]) {
    assert.deepEqual(baseline[key], saved.baseline[key], `Production baseline changed: ${key}`);
  }
  console.log("Verified saved archive checksum and unchanged production financial baseline; read-only, no checkpoint overwritten");
  process.exit(0);
}
const remote = `/tmp/codex-accounting-checkpoint-${checkpoint.slice(0, 7)}.dump`;
const result = ssh(`set -eu\numask 077\ntest ! -e ${remote}\npg_dump -h 127.0.0.1 -U "$PGUSER" -d railway --format=custom --no-owner --no-acl --file=${remote}\npg_restore --list ${remote} >/dev/null\npg_restore --exit-on-error --file=/dev/null ${remote}\nprintf 'ARCHIVE_SHA256 '\nsha256sum ${remote}\nprintf 'ARCHIVE_BASE64\\n'\nbase64 -w 0 ${remote}\nprintf '\\n'`);
const hash = result.match(/ARCHIVE_SHA256 ([a-f0-9]{64})/)[1];
const payload = result.split("ARCHIVE_BASE64\n")[1]?.trim();
assert(payload && /^[A-Za-z0-9+/=\r\n]+$/.test(payload), "Archive transport invalid");
const bytes = Buffer.from(payload, "base64");
assert.equal(bytes.subarray(0, 5).toString(), "PGDMP");
assert.equal(createHash("sha256").update(bytes).digest("hex"), hash, "Archive transport checksum mismatch");
writeFileSync(archive, bytes, { flag: "wx" });
assert.equal(createHash("sha256").update(readFileSync(archive)).digest("hex"), hash);
writeFileSync(manifest, JSON.stringify({ createdAt: new Date().toISOString(), project, environment, service,
  checkpoint, archive: "production-before-accounting.dump",
  bytes: bytes.length, sha256: hash, verification: "custom archive list and full SQL extraction passed; SHA256 verified remotely and locally; full restore rehearsal pending",
  coverage: "database schema/data, not external document bucket contents or service secrets", baseline }, null, 2) + "\n", { flag: "wx" });
ssh(`set -eu\ntest -f ${remote}\nrm -- ${remote}`);
console.log(JSON.stringify({ checkpoint: checkpoint.slice(0, 7), archiveBytes: bytes.length, sha256: hash, baseline }, null, 2));
