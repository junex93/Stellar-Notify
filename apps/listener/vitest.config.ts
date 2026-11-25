import { defineConfig } from "vitest/config";

export default defineConfig({
  // The Postgres suites truncate shared tables, so test files must not run side by side.
  test: { fileParallelism: false },
});
