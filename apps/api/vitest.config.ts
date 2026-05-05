import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
      include: ["src/modules/**/*.ts", "src/lib/**/*.ts"],
      exclude: ["**/*.types.ts", "**/index.ts"],
    },
    setupFiles: ["./tests/setup.ts"],
    // Use a single thread because we're sharing one Postgres test DB
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
