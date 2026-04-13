#!/usr/bin/env node

import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

const targetDir = process.argv[2];
const outputPath = process.argv[3];

if (!targetDir || !outputPath) {
  console.error("Usage: node root-topology-scan.mjs <target-dir> <output-path>");
  process.exit(1);
}

const IGNORE_DIRS = new Set([
  ".git",
  "node_modules",
  "docs",
  "design",
  "designs",
  "coverage",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
]);

const ROOT_SIGNALS = new Set([
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "bunfig.toml",
  "tsconfig.json",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "Package.swift",
]);

const rootDirs = [];
const rootFiles = [];
const rootSignals = [];

for (const entry of readdirSync(targetDir, { withFileTypes: true })) {
  if (entry.name.startsWith(".")) continue;
  if (entry.isDirectory()) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    rootDirs.push(entry.name);
    continue;
  }
  if (!entry.isFile()) continue;
  rootFiles.push(entry.name);
  if (ROOT_SIGNALS.has(entry.name) || entry.name.endsWith(".xcodeproj") || entry.name.endsWith(".xcworkspace")) {
    rootSignals.push(entry.name);
  }
}

rootDirs.sort();
rootFiles.sort();
rootSignals.sort();

const sections = [
  ["top_level_directories", rootDirs],
  ["top_level_files", rootFiles],
  ["root_signals", rootSignals],
];

const lines = [];
for (const [name, values] of sections) {
  lines.push(`[${name}]`);
  lines.push(...values.map((value) => basename(join(targetDir, value))));
  lines.push("");
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf-8");
console.log(`Wrote root topology scan: ${outputPath}`);
