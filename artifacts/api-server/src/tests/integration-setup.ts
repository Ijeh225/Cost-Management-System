// Integration tests may create data. Require a deliberately named database
// variable so a developer cannot accidentally run them against production.
const databaseUrl = process.env.TEST_DATABASE_URL;

if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set before running integration tests.");
}

process.env.DATABASE_URL = databaseUrl;
process.env.NODE_ENV = "test";
