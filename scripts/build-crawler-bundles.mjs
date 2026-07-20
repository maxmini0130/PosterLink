import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "apps", "web", ".generated", "crawler");

const sharedOptions = {
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: false,
  logLevel: "info",
  banner: {
    js: "// Generated at build time. Do not edit directly.",
  },
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

await Promise.all([
  build({
    ...sharedOptions,
    entryPoints: [path.join(repoRoot, "scripts", "crawler", "src", "index.js")],
    outfile: path.join(outDir, "index.cjs"),
  }),
  build({
    ...sharedOptions,
    entryPoints: [path.join(repoRoot, "scripts", "crawler", "src", "upload-to-supabase.js")],
    outfile: path.join(outDir, "upload-to-supabase.cjs"),
  }),
]);

console.log(`Crawler bundles written to ${path.relative(repoRoot, outDir)}`);
