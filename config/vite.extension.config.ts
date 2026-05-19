import { defineConfig } from "vite";
import { resolve } from "path";

const src = resolve(__dirname, "../packages/extension/src");
const out = resolve(__dirname, "../packages/extension/dist");

const entries = {
  sw: resolve(src, "service-worker/sw.ts"),
  cs: resolve(src, "content-script/index.ts"),
  bridge: resolve(src, "bridge/index.ts"),
  sidepanel: resolve(src, "sidepanel/index.ts"),
};

export default defineConfig({
  build: {
    outDir: out,
    emptyDirOnBuild: true,
    target: "es2022",
    modulePreload: false,
    rollupOptions: {
      input: entries,
      output: {
        entryFileNames: "[name].js",
        format: "es",
      },
    },
    minify: false,
  },
});
