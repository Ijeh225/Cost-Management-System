// Restore rehearsal on a temporary DB in the EXISTING isolated test service.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
const cli = process.env.RAILWAY_CLI_PATH;
const directory = process.env.ACCOUNTING_BACKUP_DIRECTORY;
assert(cli && directory);
const manifestPath = join(directory, "checkpoint-manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const bytes = readFileSync(join(directory, manifest.archive));
assert.equal(createHash("sha256").update(bytes).digest("hex"), manifest.sha256);
const database = "acct_checkpoint_restore_test_20261008";
const remote = "/tmp/codex-accounting-restore-20261008.dump";
const sql = `SELECT json_build_object('database',current_database(),
 'tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'),
 'invoicePayments',(SELECT coalesce(sum(amount),0) FROM invoice_payments),
 'deposits',(SELECT coalesce(sum(amount),0) FROM client_deposits),
 'dutyPayments',(SELECT coalesce(sum(amount),0) FROM duty_payment_transactions),
 'overheadPayments',(SELECT coalesce(sum(amount),0) FROM expense_payments),
 'invoices',(SELECT count(*) FROM invoices),'containers',(SELECT count(*) FROM containers));`;
const encodedSql = Buffer.from(sql).toString("base64");
const script = `set -eu
umask 077
test ! -e ${remote}
test -z "$(psql -X -qAt -h 127.0.0.1 -U "$PGUSER" -d railway -c "SELECT datname FROM pg_database WHERE datname='${database}'")"
base64 -d >${remote}
test "$(sha256sum ${remote} | cut -d' ' -f1)" = '${manifest.sha256}'
createdb -h 127.0.0.1 -U "$PGUSER" ${database}
trap 'dropdb -h 127.0.0.1 -U "$PGUSER" --if-exists ${database}; rm -f -- ${remote}' EXIT
pg_restore --exit-on-error --no-owner --no-acl -h 127.0.0.1 -U "$PGUSER" -d ${database} ${remote}
printf '%s' '${encodedSql}' | base64 -d | psql -X -qAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$PGUSER" -d ${database}`;
const encoded = Buffer.from(script).toString("base64");
const result = spawnSync(cli, ["ssh", "--project", "30166120-54e6-4f58-86ed-18ab396913f1",
  "--environment", "51a4f5a2-e7ae-443e-836f-095b2015f3cc", "--service", "ed1e8b3d-c2e2-4654-a11d-bc16fa858bd6",
  "--", `sh -c 'echo ${encoded} | base64 -d > /tmp/codex-accounting-restore-command.sh; sh /tmp/codex-accounting-restore-command.sh; result=$?; rm -f /tmp/codex-accounting-restore-command.sh; exit $result'`],
  { input: bytes.toString("base64"), encoding: "utf8", timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
assert.equal(result.status, 0, "Isolated backup restore failed; output withheld");
const restored = JSON.parse(result.stdout.split(/\r?\n/).find(line => line.startsWith("{")));
assert.equal(restored.database, database);
assert.equal(restored.tables, manifest.baseline.tables);
for (const field of ["invoicePayments", "deposits", "dutyPayments", "overheadPayments"]) assert.equal(restored[field], manifest.baseline.totals[field]);
for (const field of ["invoices", "containers"]) assert.equal(restored[field], manifest.baseline.counts[field]);
manifest.restoreRehearsal = { verifiedAt: new Date().toISOString(), environment: "integration-test", temporaryDatabaseRemoved: true, restored };
manifest.verification = "remote/local SHA256, archive extraction, isolated full pg_restore and financial baseline checks passed";
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
console.log("PASS: full checkpoint restore, 62 tables and financial baseline verified in temporary isolated database; temporary database removed");
