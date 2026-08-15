// Lightweight publish preflight: verifies the single-package structure that
// the DSH loader and the npm tarball depend on. No build step is needed for
// this plain-ESM plugin, so this script doubles as the `pnpm build` gate.
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

const required = [
  "package.json",
  "lib/index.js",
  "cordis.patch.yml",
  "dsh-archive-manager-workspace/lib/index.js",
  "dsh-archive-manager-projcache/lib/index.js",
  "dsh-archive-manager-client/lib/index.js",
  "dsh-archive-manager-client/lib/client.js",
  "LICENSE",
  "README.md",
  "README.zh-CN.md"
];

let failed = false;
for (const rel of required) {
  try {
    await access(resolve(root, rel));
    console.log(`ok: ${rel}`);
  } catch {
    console.error(`missing: ${rel}`);
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("package structure OK");
