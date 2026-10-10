// Explicit existing test environment only. Credentials remain in process memory.
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
const cli = process.env.RAILWAY_CLI_PATH;
if (!cli) throw new Error("Set RAILWAY_CLI_PATH to the authenticated Railway CLI binary");
const suite = process.env.RAILWAY_TEST_SUITE ?? "cap04";
const cleanupRun = process.env.ACCOUNTING_CLEANUP_RUN;
if (cleanupRun && (suite !== "accounting" || !/^\d{13}-[a-z0-9]+$/.test(cleanupRun))) throw new Error("Exact accounting run suffix required for isolated recovery");
if (!["cap04", "cap02", "accounting", "foundation"].includes(suite)) throw new Error("Unknown isolated test suite");
const project = "30166120-54e6-4f58-86ed-18ab396913f1";
const environment = "51a4f5a2-e7ae-443e-836f-095b2015f3cc";
const service = "ed1e8b3d-c2e2-4654-a11d-bc16fa858bd6";
const port = 54339;
const varsResult = spawnSync(cli, ["variable", "list", "--project", project, "--environment", environment, "--service", service, "--json"], { encoding: "utf8", windowsHide: true, timeout: 30000 });
if (varsResult.status !== 0) throw new Error("Unable to read isolated-service credentials; check Railway authentication/connectivity");
const vars = JSON.parse(varsResult.stdout);
if (!vars.PGUSER || !vars.PGPASSWORD) throw new Error("Isolated service credentials unavailable");
const canConnect = () => new Promise(resolve => {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(500);
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => { socket.destroy(); resolve(false); });
});
if (await canConnect()) throw new Error("Refusing to reuse an unidentified listener on test tunnel port");
const tunnel = spawn(cli, ["connect", "Postgres-2Wsy", "--project", project, "--environment", environment, "--tunnel-only", "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
// Tunnel output may include connection secrets. Drain it without persisting/logging.
tunnel.stdout.resume(); tunnel.stderr.resume();
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (tunnel.exitCode !== null) throw new Error("Isolated database tunnel exited before becoming ready");
    if (await canConnect()) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (!ready) throw new Error("Timed out waiting for isolated test tunnel");
  console.log(`Existing isolated Railway SSH tunnel ready; running ${suite.toUpperCase()} namespace-only regressions`);
  const url = new URL("postgresql://127.0.0.1/cost_management_integration_test");
  url.port = String(port); url.username = vars.PGUSER; url.password = vars.PGPASSWORD;
  const root = resolve(import.meta.dirname, "..");
  const { Client } = createRequire(resolve(root, "lib/db/package.json"))("pg");
  const fixtureCountsSql = `SELECT
    (SELECT count(*)::int FROM branches WHERE name LIKE 'ACCT %') AS branches,
    (SELECT count(*)::int FROM users WHERE email LIKE 'acct-%@example.test') AS users`;
  let beforeFixtures;
  const identity = new Client({ connectionString: url.href });
  await identity.connect();
  try {
    if ((await identity.query("SELECT current_database() AS name")).rows[0].name !== "cost_management_integration_test") throw new Error("Wrong test database identity");
    if (cleanupRun) {
      const ids = (await identity.query("SELECT id FROM branches WHERE name=$1 OR name LIKE $2", [`ACCT root ${cleanupRun}`, `ACCT case ${cleanupRun}-%`])).rows.map(row => row.id);
      if (!ids.length) throw new Error("Specified interrupted run has no fixtures; refusing an ambiguous cleanup");
      await identity.query("BEGIN");
      try {
        await identity.query("DELETE FROM invoice_payments WHERE branch_id=ANY($1) AND entry_type='reversal'", [ids]);
        for (const table of ["invoice_payments", "invoice_audit_log", "credit_notes", "workflow_notifications", "ai_assistant_audit_logs", "expense_payments", "payment_schedule_events", "payment_schedules", "overhead_expenses", "client_deposits", "invoices", "clients", "banks", "users"]) {
          await identity.query(`DELETE FROM ${table} WHERE branch_id=ANY($1)`, [ids]);
        }
        await identity.query("DELETE FROM branches WHERE id=ANY($1)", [ids]);
        await identity.query("COMMIT");
        console.log(`Verified interrupted accounting run ${cleanupRun} cleanup: ${ids.length} run-owned branches, no other namespaces touched`);
      } catch (err) { await identity.query("ROLLBACK"); throw err; }
    }
    if (suite === "accounting") beforeFixtures = (await identity.query(fixtureCountsSql)).rows[0];
  } finally { await identity.end(); }
  const args = ["accounting", "foundation"].includes(suite) ? [resolve(root, "artifacts/api-server/node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.integration.config.ts", suite === "foundation" ? "src/tests/accounting-foundation.integration.test.ts" : "src/tests/accounting-cash.integration.test.ts", "--reporter=verbose"]
    : suite === "cap02" ? [resolve(root, "artifacts/api-server/node_modules/vitest/vitest.mjs"), "run", "src/tests/document-readiness-api.test.ts", "--reporter=verbose", "--testTimeout=60000"]
    : [resolve(root, "artifacts/api-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "scripts/cap04-postgres-check.ts")];
  if (suite === "accounting" && process.env.ACCOUNTING_TEST_FILTER) args.push("-t", process.env.ACCOUNTING_TEST_FILTER);
  if (suite === "foundation" && process.env.ACCOUNTING_FOUNDATION_TEST_FILTER) args.push("-t", process.env.ACCOUNTING_FOUNDATION_TEST_FILTER);
  const run = cleanupRun ? { status: 0, stdout: "", stderr: "" } : spawnSync(process.execPath, args, {
    cwd: suite !== "cap04" ? resolve(root, "artifacts/api-server") : root,
    env: { ...process.env, TEST_DATABASE_URL: url.href, JWT_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test", CAP02_NETWORK_TEST: suite === "cap02" ? "1" : "0" },
    encoding: "utf8", timeout: ["accounting", "foundation"].includes(suite) ? 1200000 : 180000, windowsHide: true,
  });
  // Print only known safe progress lines; errors may include a connection string.
  for (const line of (run.stdout ?? "").split(/\r?\n/)) if (/^(PASS:|Verified )/.test(line) || /Test Files|Tests |serializes simultaneous|prevents parallel replacement/.test(line)) console.log(line);
  if (["accounting", "foundation"].includes(suite)) console.log(((run.stdout ?? "") + (run.stderr ?? "")).replaceAll(url.href, "[isolated database]").replaceAll(vars.PGPASSWORD, "[redacted]"));
  if (suite === "accounting") {
    const cleanup = new Client({ connectionString: url.href });
    await cleanup.connect();
    try {
      const after = (await cleanup.query(fixtureCountsSql)).rows[0];
      if (JSON.stringify(after) !== JSON.stringify(beforeFixtures)) throw new Error("Accounting fixture cleanup did not restore pre-run namespace counts");
      console.log("Verified accounting fixture namespace counts restored");
    } finally { await cleanup.end(); }
  }
  if (run.status !== 0) throw new Error(`${suite.toUpperCase()} isolated PostgreSQL checks failed; no credentials logged`);
  console.log(cleanupRun ? "PASS: isolated accounting run recovery; no regression tests executed" : `PASS: ${suite.toUpperCase()} isolated network PostgreSQL checks`);
} finally {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(tunnel.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else tunnel.kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (await canConnect()) throw new Error("Test tunnel still listening: cleanup requires attention");
  console.log("Verified isolated test tunnel closed");
}
