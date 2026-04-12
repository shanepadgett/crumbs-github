#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const outputPath = process.argv[2];

if (!outputPath) {
  console.error("Usage: node record-results.mjs <output-path> --unit WU-001 --status completed --files 'a.swift,b.swift' [--note 'message']");
  process.exit(1);
}

function getFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

const unit = getFlag("unit");
const status = getFlag("status");
const files = getFlag("files");
const note = getFlag("note");

if (!unit || !status) {
  console.error("--unit and --status are required");
  process.exit(1);
}

const validStatuses = new Set(["completed", "partial", "failed", "skipped"]);
if (!validStatuses.has(status)) {
  console.error(`Invalid status '${status}'. Valid: ${[...validStatuses].join(", ")}`);
  process.exit(1);
}

const results = existsSync(outputPath)
  ? JSON.parse(readFileSync(outputPath, "utf-8"))
  : { results: [] };

// Remove existing entry for this unit if re-recording
results.results = results.results.filter((r) => r.unit !== unit);

results.results.push({
  unit,
  status,
  files: files ? files.split(",").map((f) => f.trim()) : [],
  note: note ?? "",
  timestamp: new Date().toISOString(),
});

results.results.sort((a, b) => a.unit.localeCompare(b.unit));

writeFileSync(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf-8");
console.log(`Recorded ${unit}: ${status}`);
