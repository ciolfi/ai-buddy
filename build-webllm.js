/**
 * build-webllm.js
 * Run with: node build-webllm.js
 *
 * Installs @mlc-ai/web-llm and copies its browser ESM bundle
 * into your project folder as web-llm-bundle.js
 */

const { execSync } = require("child_process");
const fs   = require("fs");
const path = require("path");

console.log("Step 1: Installing @mlc-ai/web-llm@0.2.81 ...");
execSync("npm install @mlc-ai/web-llm@0.2.81", { stdio: "inherit" });

const pkg  = path.join("node_modules", "@mlc-ai", "web-llm");
const dest = "web-llm-bundle.js";

// WebLLM ships several builds — we need the browser ESM one.
// Check each candidate path in order of preference.
const candidates = [
  path.join(pkg, "lib",  "index.js"),
  path.join(pkg, "dist", "web-llm.js"),
  path.join(pkg, "dist", "index.js"),
];

console.log("Step 2: Locating browser bundle...");

let found = null;
for (const c of candidates) {
  if (fs.existsSync(c)) {
    found = c;
    console.log("  Found:", c);
    break;
  }
}

if (!found) {
  console.error("\nCould not find bundle. Package contents:");
  const walk = (dir, depth = 0) => {
    if (depth > 2) return;
    for (const f of fs.readdirSync(dir)) {
      console.log("  ".repeat(depth + 1) + f);
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) walk(full, depth + 1);
    }
  };
  walk(pkg);
  process.exit(1);
}

console.log("Step 3: Copying to", dest, "...");
fs.copyFileSync(found, dest);

const size = (fs.statSync(dest).size / 1024 / 1024).toFixed(1);
console.log(`\nDone! ${dest} created (${size} MB).`);
console.log("Now add web-llm-bundle.js to your Vercel project and redeploy.");
