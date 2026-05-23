// Build each extension entry point as a standalone IIFE bundle.
// MV3 requires each script to be self-contained — no shared chunks.
//
// Usage: node scripts/build.js          # production build
//        node scripts/build.js --watch   # development (watch mode)

const { build: viteBuild } = require("vite");
const react = require("@vitejs/plugin-react");
const { resolve } = require("path");
const { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, watch } = require("fs");

const root = resolve(__dirname, "..");
const pkg = resolve(root, "packages/extension");
const src = resolve(pkg, "src");
const out = resolve(pkg, "dist");

const watchMode = process.argv.includes("--watch");

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

/** Build options for a single Vite entry */
function makeBuildOptions(name, input, plugins, emptyOutDir) {
  return {
    configFile: false,
    plugins,
    build: {
      outDir: out,
      emptyOutDir,
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
      watch: watchMode ? {} : undefined,
    },
  };
}

/** Build CSS with Tailwind (returns the output file path) */
async function buildCSS() {
  const postcss = require("postcss");
  const tailwindcss = require("tailwindcss");
  const autoprefixer = require("autoprefixer");
  const cssInput = resolve(src, "sidepanel/styles/index.css");
  const cssOutput = resolve(out, "sidepanel.css");
  if (!existsSync(cssInput)) return null;

  const css = readFileSync(cssInput, "utf-8");
  const result = await postcss([
    tailwindcss(resolve(root, "tailwind.config.js")),
    autoprefixer,
  ]).process(css, { from: cssInput, to: cssOutput });
  writeFileSync(cssOutput, result.css);
  return cssOutput;
}

/** Copy static files (manifest, html, assets) */
function copyStatic() {
  console.log("Copying static files...");
  for (const { from, to } of staticFiles) {
    if (existsSync(from)) {
      copyFileSync(from, to);
      console.log(`  ${from} -> ${to}`);
    }
  }

  const assetsSrc = resolve(pkg, "assets");
  const assetsDest = resolve(out, "assets");
  if (existsSync(assetsSrc)) {
    copyDirSync(assetsSrc, assetsDest);
    console.log(`  ${assetsSrc} -> ${assetsDest}`);
  }
}

// ============================================================
// Command: build (single run)
// ============================================================

async function runBuild() {
  for (let i = 0; i < entries.length; i++) {
    const { name, input, plugins } = entries[i];
    console.log(`[${i + 1}/${entries.length}] Building ${name}...`);
    await viteBuild(makeBuildOptions(name, input, plugins, i === 0));
  }

  console.log("\nBuilding CSS...");
  await buildCSS();

  copyStatic();
  console.log("\nExtension build complete. Load dist/ as unpacked extension.");
}

// ============================================================
// Command: watch (development — rebuilds on file changes)
// ============================================================

async function runWatch() {
  console.log("\n🔍 Watch mode enabled. Rebuilding on changes...\n");

  // ── Initial build ──
  for (let i = 0; i < entries.length; i++) {
    const { name, input, plugins } = entries[i];
    console.log(`[${i + 1}/${entries.length}] Building ${name}...`);
    await viteBuild(makeBuildOptions(name, input, plugins, i === 0));
  }

  console.log("Building CSS...");
  await buildCSS();
  copyStatic();
  console.log("\nInitial build complete. Watching for changes...\n");

  // ── Watch CSS changes (with debounce) ──
  const cssDir = resolve(src, "sidepanel/styles");
  if (existsSync(cssDir)) {
    let cssTimer = null;
    watch(cssDir, { recursive: true }, (eventType, filename) => {
      if (cssTimer) clearTimeout(cssTimer);
      cssTimer = setTimeout(async () => {
        console.log(`[CSS change] ${filename} — rebuilding...`);
        try {
          const outFile = await buildCSS();
          if (outFile) console.log(`  → ${outFile}`);
        } catch (err) {
          console.error(`  CSS build failed: ${err.message}`);
        }
      }, 100);
    });
    console.log(`Watching CSS: ${cssDir}`);
  }

  // Keep the process alive — Vite watchers and fs.watch keep the event loop busy
}

// ============================================================
// Entry
// ============================================================

async function run() {
  if (watchMode) {
    await runWatch();
  } else {
    await runBuild();
  }
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
