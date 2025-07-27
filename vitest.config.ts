import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["packages/*"],
    coverage: {
      enabled: false, // We'll enable it via CLI flag
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "node_modules/**",
        "**/dist/**",
        "**/*.d.ts",
        "**/*.config.*",
        "**/__tests__/**",
        "**/test/**",
        "**/*.test.ts",
        "**/*.spec.ts",
      ],
    },
  },
});
