/**
 * build-webllm.js  —  Run with: node build-webllm.js
 *
 * Uses Vite to bundle WebLLM's browser ESM build into a single
 * self-hosted file (web-llm-bundle.js) for Vercel deployment.
 *
 * Requirements: Node.js 18+  (no other installs needed upfront)
 *
 * What it does:
 *   1. Installs vite + @mlc-ai/web-llm locally (into ./node_modules)
 *   2. Creates a tiny entry point that re-exports CreateMLCEngine
 *   3. Runs vite build in library mode → produces web-llm-bundle.js
 *   4. Cleans up temp files
 */

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

const run = (cmd) => execSync(cmd, { stdio: "inherit" });

// Step 1: Install dependencies
console.log("\n[1/4] Installing vite + @mlc-ai/web-llm ...");
run("npm install --save-dev vite@5 @mlc-ai/web-llm@0.2.81");

// Step 2: Write temp entry + vite config
console.log("\n[2/4] Writing build config...");

fs.writeFileSync("_webllm_entry.js", `
export { CreateMLCEngine } from "@mlc-ai/web-llm";
`);

fs.writeFileSync("_vite_webllm.config.js", `
import { defineConfig } from "vite";
export default defineConfig({
  build: {
    lib: {
      entry:    "./_webllm_entry.js",
      name:     "webllm",
      fileName: () => "web-llm-bundle.js",
      formats:  ["es"],
    },
    outDir:      ".",
    emptyOutDir: false,
    minify:      true,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
`);

// Step 3: Run Vite build
console.log("\n[3/4] Building browser bundle (this may take ~30s)...");
run("npx vite build --config _vite_webllm.config.js");

// Step 4: Clean up
console.log("\n[4/4] Cleaning up...");
["_webllm_entry.js", "_vite_webllm.config.js"].forEach(f => {
  if (fs.existsSync(f)) fs.unlinkSync(f);
});
if (fs.existsSync("assets") && fs.readdirSync("assets").length === 0) {
  fs.rmdirSync("assets");
}

if (fs.existsSync("web-llm-bundle.js")) {
  const mb = (fs.statSync("web-llm-bundle.js").size / 1024 / 1024).toFixed(1);
  console.log(`\nDone! web-llm-bundle.js created (${mb} MB)`);
  console.log("Add this file to your Vercel project folder and redeploy.\n");
} else {
  console.error("\nBuild failed — web-llm-bundle.js not found.");
  process.exit(1);
}
