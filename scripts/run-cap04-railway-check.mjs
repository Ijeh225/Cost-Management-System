// Explicit existing test environment only. Credentials remain in process memory.
import { spawn, spawnSync } from "node:child_process";
import { createConnection } from "node:net";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
const cli = process.env.RAILWAY_CLI_PATH;
if (!cli) throw new Error("Set RAILWAY_CLI_PATH to the authenticated Railway CLI binary");
const suite = process.env.RAILWAY_TEST_SUITE ?? "cap04";
if (!["cap04", "cap02", "accounting"].includes(suite)) throw new Error("Unknown isolated test suite");
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
    if (suite === "accounting") beforeFixtures = (await identity.query(fixtureCountsSql)).rows[0];
  } finally { await identity.end(); }
  const args = suite === "accounting" ? [resolve(root, "artifacts/api-server/node_modules/vitest/vitest.mjs"), "run", "--config", "vitest.integration.config.ts", "src/tests/accounting-cash.integration.test.ts", "--reporter=verbose"]
    : suite === "cap02" ? [resolve(root, "artifacts/api-server/node_modules/vitest/vitest.mjs"), "run", "src/tests/document-readiness-api.test.ts", "--reporter=verbose", "--testTimeout=60000"]
    : [resolve(root, "artifacts/api-server/node_modules/tsx/dist/cli.mjs"), resolve(root, "scripts/cap04-postgres-check.ts")];
  if (suite === "accounting" && process.env.ACCOUNTING_TEST_FILTER) args.push("-t", process.env.ACCOUNTING_TEST_FILTER);
  const run = spawnSync(process.execPath, args, {
    cwd: suite !== "cap04" ? resolve(root, "artifacts/api-server") : root,
    env: { ...process.env, TEST_DATABASE_URL: url.href, JWT_SECRET: randomBytes(32).toString("hex"), NODE_ENV: "test", CAP02_NETWORK_TEST: suite === "cap02" ? "1" : "0" },
    encoding: "utf8", timeout: suite === "accounting" ? 600000 : 180000, windowsHide: true,
  });
  // Print only known safe progress lines; errors may include a connection string.
  for (const line of (run.stdout ?? "").split(/\r?\n/)) if (/^(PASS:|Verified )/.test(line) || /Test Files|Tests |serializes simultaneous|prevents parallel replacement/.test(line)) console.log(line);
  if (suite === "accounting") console.log(((run.stdout ?? "") + (run.stderr ?? "")).replaceAll(url.href, "[isolated database]").replaceAll(vars.PGPASSWORD, "[redacted]"));
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
  console.log(`PASS: ${suite.toUpperCase()} isolated network PostgreSQL checks`);
} finally {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(tunnel.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else tunnel.kill("SIGTERM");
  await new Promise(resolve => setTimeout(resolve, 1000));
  if (await canConnect()) throw new Error("Test tunnel still listening: cleanup requires attention");
  console.log("Verified isolated test tunnel closed");
}
