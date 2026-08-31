import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "src/**/*.integration.test.ts",
      "src/tests/delivery.test.ts",
      "src/tests/duty-payments.test.ts",
    ],
    setupFiles: ["./src/tests/integration-setup.ts"],
    testTimeout: 30000,
    fileParallelism: false,
  },
});
