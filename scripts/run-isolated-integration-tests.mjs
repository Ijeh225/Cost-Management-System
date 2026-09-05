import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultDatabaseUrl = "postgresql://cost_management_test:cost_management_test_only@127.0.0.1:54329/cost_management_integration_test";
const databaseUrl = process.env.TEST_DATABASE_URL ?? defaultDatabaseUrl;
const url = new URL(databaseUrl);
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const databaseName = decodeURIComponent(url.pathname).replace(/^\//, "");

if (!/test|integration/i.test(databaseName)) {
  throw new Error("TEST_DATABASE_URL must name a database containing 'test' or 'integration'.");
}
if (!localHosts.has(url.hostname) && process.env.ALLOW_REMOTE_TEST_DATABASE !== "1") {
  throw new Error("Refusing a non-local TEST_DATABASE_URL. Set ALLOW_REMOTE_TEST_DATABASE=1 only for a separately provisioned test database.");
}
if (process.env.DATABASE_URL === databaseUrl) {
  throw new Error("TEST_DATABASE_URL must not be the same value as DATABASE_URL.");
}

const env = { ...process.env, TEST_DATABASE_URL: databaseUrl, DATABASE_URL: databaseUrl, NODE_ENV: "test" };
const shell = process.platform === "win32";
const requireDbPackage = createRequire(path.join(root, "lib", "db", "package.json"));
const { Client } = requireDbPackage("pg");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, shell, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (databaseUrl === defaultDatabaseUrl) {
  run("docker", ["compose", "-f", "docker-compose.integration.yml", "up", "-d", "--wait"]);
}

// Reset is opt-in and restricted to the disposable database created for this suite.
if (process.env.RESET_TEST_DATABASE === "1") {
  if (databaseName !== "cost_management_integration_test") {
    throw new Error("Reset requires the disposable cost_management_integration_test database.");
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await client.end();
  }
}

run("pnpm", ["--filter", "@workspace/db", "run", "push-force"]);
run("pnpm", ["--filter", "@workspace/api-server", "run", "test:integration"]);
