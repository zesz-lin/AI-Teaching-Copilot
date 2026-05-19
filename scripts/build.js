// Build each extension entry point as a standalone IIFE bundle.
// MV3 requires each script to be self-contained — no shared chunks.
//
// Usage: node scripts/build.js

const { build: viteBuild } = require("vite");
const react = require("@vitejs/plugin-react");
const { resolve } = require("path");
const { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } = require("fs");

const root = resolve(__dirname, "..");
const pkg = resolve(root, "packages/extension");
const src = resolve(pkg, "src");
const out = resolve(pkg, "dist");

const entries = [
  { name: "sw",       input: resolve(src, "service-worker/sw.ts"),       plugins: [] },
  { name: "cs",       input: resolve(src, "content-script/index.ts"),    plugins: [] },
  { name: "bridge",   input: resolve(src, "bridge/index.ts"),            plugins: [] },
  { name: "sidepanel", input: resolve(src, "sidepanel/index.tsx"),       plugins: [react()] },
];

const staticFiles = [
  { from: resolve(pkg, "manifest.json"), to: resolve(out, "manifest.json") },
  { from: resolve(src, "sidepanel/index.html"), to: resolve(out, "sidepanel.html") },
];

async function run() {
  for (let i = 0; i < entries.length; i++) {
    const { name, input, plugins } = entries[i];
    console.log(`[${i + 1}/${entries.length}] Building ${name}...`);

    await viteBuild({
      configFile: false,
      plugins,
      build: {
        outDir: out,
        emptyOutDir: i === 0,
        target: "es2022",
        modulePreload: false,
        rollupOptions: {
          input,
          output: {
            entryFileNames: `${name}.js`,
            format: "iife",
          },
        },
        minify: false,
      },
    });
  }

  // Build CSS with Tailwind
  console.log("\nBuilding CSS...");
  const postcss = require("postcss");
  const tailwindcss = require("tailwindcss");
  const autoprefixer = require("autoprefixer");
  const cssInput = resolve(src, "sidepanel/styles/index.css");
  const cssOutput = resolve(out, "sidepanel.css");
  if (existsSync(cssInput)) {
    const css = readFileSync(cssInput, "utf-8");
    const result = await postcss([
      tailwindcss(resolve(root, "tailwind.config.js")),
      autoprefixer,
    ]).process(css, { from: cssInput, to: cssOutput });
    writeFileSync(cssOutput, result.css);
    console.log(`  ${cssInput} -> ${cssOutput}`);
  }

  // Copy static files
  console.log("\nCopying static files...");
  for (const { from, to } of staticFiles) {
    if (existsSync(from)) {
      copyFileSync(from, to);
      console.log(`  ${from} -> ${to}`);
    }
  }

  // Copy assets if present
  const assetsSrc = resolve(pkg, "assets");
  const assetsDest = resolve(out, "assets");
  if (existsSync(assetsSrc)) {
    copyDirSync(assetsSrc, assetsDest);
    console.log(`  ${assetsSrc} -> ${assetsDest}`);
  }

  console.log("\nExtension build complete. Load dist/ as unpacked extension.");
}

function copyDirSync(from, to) {
  const { readdirSync, statSync, copyFileSync } = require("fs");
  if (!existsSync(to)) mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const srcPath = resolve(from, entry.name);
    const destPath = resolve(to, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
