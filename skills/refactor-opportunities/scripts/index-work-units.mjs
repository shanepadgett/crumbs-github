#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const plansDir = process.argv[2];
const outputPath = process.argv[3];

if (!plansDir || !outputPath) {
  console.error("Usage: node index-work-units.mjs <plans-dir> <output-path>");
  process.exit(1);
}

const entries = [];

for (const name of readdirSync(plansDir).filter((value) => value.endsWith(".md")).sort()) {
  const content = readFileSync(join(plansDir, name), "utf-8");
  const workUnit = content.match(/^work-unit:\s*(.+)$/m)?.[1]?.trim() ?? name.replace(/\.md$/, "");
  const title = content.match(/^title:\s*"(.+)"$/m)?.[1]?.trim() ?? "";
  const priority = content.match(/^priority:\s*(.+)$/m)?.[1]?.trim() ?? "";
  const primaryLens = content.match(/^primary-lens:\s*(.+)$/m)?.[1]?.trim() ?? "";
  entries.push({ workUnit, title, priority, primaryLens, path: join(plansDir, name) });
}

writeFileSync(outputPath, `${JSON.stringify({ workUnits: entries }, null, 2)}\n`, "utf-8");
console.log(`Indexed ${entries.length} work units`);
