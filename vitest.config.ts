import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/extension/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Map package-relative imports (e.g., "../dsl/types") correctly
      "@": resolve(__dirname, "packages/extension/src"),
    },
  },
});
