#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: node scaffold-remediation.mjs <output-path>");
  process.exit(1);
}

const timestamp = new Date().toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `# Refactor Opportunities — Remediation Plan\n\nGenerated: ${timestamp}\n\n## Work Units\n`,
  "utf-8"
);

console.log(`Scaffolded remediation plan: ${outputPath}`);
