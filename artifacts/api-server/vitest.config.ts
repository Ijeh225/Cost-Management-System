import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: [],
    include: ["src/**/*.test.ts"],
    testTimeout: 15000,
    // Integration suites use a shared Postgres database and authenticated test users.
    fileParallelism: false,
  },
});
