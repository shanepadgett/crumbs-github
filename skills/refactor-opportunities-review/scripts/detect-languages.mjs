#!/usr/bin/env node

import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const targetDir = process.argv[2];
const outputPath = process.argv[3];

if (!targetDir || !outputPath) {
  console.error("Usage: node detect-languages.mjs <target-dir> <output-path>");
  process.exit(1);
}

const EXT_TO_STACK = new Map([
  [".swift", "swift-swiftui"],
  [".java", "java"],
  [".kt", "kotlin"],
  [".kts", "kotlin"],
  [".js", "javascript"],
  [".jsx", "javascript"],
  [".ts", "typescript"],
  [".tsx", "typescript"],
]);

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  ".build",
  "build",
  "dist",
  ".next",
  ".turbo",
  ".work",
  "DerivedData",
]);

const counts = {};

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.isFile()) continue;
    const stack = EXT_TO_STACK.get(extname(entry.name).toLowerCase());
    if (!stack) continue;
    counts[stack] = (counts[stack] ?? 0) + 1;
  }
}

walk(targetDir);

const detected = Object.entries(counts)
  .sort((a, b) => b[1] - a[1])
  .map(([stack, files]) => ({ stack, files }));

writeFileSync(outputPath, `${JSON.stringify({ detected }, null, 2)}\n`, "utf-8");
console.log(`Detected ${detected.length} language stacks`);
