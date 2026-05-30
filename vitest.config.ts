import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["packages/extension/src/**/*.test.ts", "packages/extension/src/**/*.test.tsx"],
  },
});
