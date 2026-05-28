import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/extension/src/**/*.test.ts"],
    exclude: ["packages/extension/src/**/__test__.ts"],
  },
});
