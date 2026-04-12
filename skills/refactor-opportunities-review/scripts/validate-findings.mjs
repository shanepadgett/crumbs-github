#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node validate-findings.mjs <file-or-dir>");
  process.exit(1);
}

const SEVERITIES = new Set(["high", "medium", "low"]);
const DISPOSITIONS = new Set(["merge", "keep-separate", "defer"]);
const LENSES = new Set(["hygiene", "over-engineering", "runtime", "mixed"]);

function listMarkdown(path) {
  const stat = statSync(path);
  if (stat.isFile()) return [path];

  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdown(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
  }
  return files.sort();
}

function extractField(lines, label) {
  const line = lines.find((value) => value.toLowerCase().startsWith(`- **${label.toLowerCase()}:**`));
  if (!line) return "";
  return line.replace(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*`, "i"), "").trim();
}

function parseSummary(content, labels) {
  const match = content.match(/## Summary\n([\s\S]*)$/m);
  if (!match) return null;

  const values = {};
  for (const label of labels) {
    const field = label.replace(/\s+/g, "\\s+");
    const found = match[1].match(new RegExp(`- ${field}:\\s*(\\d+)`, "i"));
    if (!found) return null;
    values[label] = Number(found[1]);
  }
  return values;
}

function validateSectionFile(path, content) {
  const issues = [];
  if (!content.match(/^# .+?: .+$/m)) issues.push("missing title '# <Lens>: <Section>'");
  if (!content.includes("## Findings")) issues.push("missing '## Findings'");
  if (!content.includes("## Summary")) issues.push("missing '## Summary'");

  const blocks = content.split(/^### /m).slice(1);
  const ids = new Set();
  const counts = { high: 0, medium: 0, low: 0 };

  if (blocks.length === 0 && !content.includes("None.")) issues.push("no findings and no 'None.' marker");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const id = lines[0]?.trim();
    if (!id) {
      issues.push("finding missing id");
      continue;
    }
    if (ids.has(id)) issues.push(`duplicate id '${id}'`);
    ids.add(id);

    const severity = extractField(lines, "Severity").toLowerCase();
    const file = extractField(lines, "File");
    const symbol = extractField(lines, "Symbol");
    const pattern = extractField(lines, "Pattern");
    const finding = extractField(lines, "Finding");
    const evidence = extractField(lines, "Evidence");
    const suggestedDirection = extractField(lines, "Suggested Direction");

    if (!SEVERITIES.has(severity)) issues.push(`${id}: invalid severity '${severity}'`);
    if (!file) issues.push(`${id}: missing file`);
    if (!symbol) issues.push(`${id}: missing symbol`);
    if (!pattern) issues.push(`${id}: missing pattern`);
    if (!finding) issues.push(`${id}: missing finding`);
    if (!evidence) issues.push(`${id}: missing evidence`);
    if (!suggestedDirection) issues.push(`${id}: missing suggested direction`);

    if (SEVERITIES.has(severity)) counts[severity] += 1;
  }

  const summary = parseSummary(content, ["High", "Medium", "Low"]);
  if (!summary) issues.push("invalid summary block");
  else {
    if (summary.High !== counts.high) issues.push(`summary high ${summary.High} != ${counts.high}`);
    if (summary.Medium !== counts.medium) issues.push(`summary medium ${summary.Medium} != ${counts.medium}`);
    if (summary.Low !== counts.low) issues.push(`summary low ${summary.Low} != ${counts.low}`);
  }

  return issues;
}

function validateReconciledFile(path, content) {
  const issues = [];
  if (!content.match(/^# Reconciled Findings$/m)) issues.push("missing title '# Reconciled Findings'");
  if (!content.includes("## Findings")) issues.push("missing '## Findings'");
  if (!content.includes("## Summary")) issues.push("missing '## Summary'");

  const blocks = content.split(/^### /m).slice(1);
  const counts = { merge: 0, "keep-separate": 0, defer: 0 };
  const ids = new Set();

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const id = lines[0]?.trim();
    if (!id) {
      issues.push("reconciled finding missing id");
      continue;
    }
    if (ids.has(id)) issues.push(`duplicate id '${id}'`);
    ids.add(id);

    const disposition = extractField(lines, "Disposition").toLowerCase();
    const primaryLens = extractField(lines, "Primary Lens").toLowerCase();
    const sourceFindings = extractField(lines, "Source Findings");
    const severity = extractField(lines, "Severity").toLowerCase();
    const files = extractField(lines, "Files");
    const symbols = extractField(lines, "Symbols");
    const problem = extractField(lines, "Problem");
    const recommendedAction = extractField(lines, "Recommended Action");
    const tradeoffs = extractField(lines, "Tradeoffs");
    const whyThisWins = extractField(lines, "Why This Wins");

    if (!DISPOSITIONS.has(disposition)) issues.push(`${id}: invalid disposition '${disposition}'`);
    if (!LENSES.has(primaryLens)) issues.push(`${id}: invalid primary lens '${primaryLens}'`);
    if (!sourceFindings) issues.push(`${id}: missing source findings`);
    if (!SEVERITIES.has(severity)) issues.push(`${id}: invalid severity '${severity}'`);
    if (!files) issues.push(`${id}: missing files`);
    if (!symbols) issues.push(`${id}: missing symbols`);
    if (!problem) issues.push(`${id}: missing problem`);
    if (!recommendedAction) issues.push(`${id}: missing recommended action`);
    if (!tradeoffs) issues.push(`${id}: missing tradeoffs`);
    if (!whyThisWins) issues.push(`${id}: missing why this wins`);

    if (DISPOSITIONS.has(disposition)) counts[disposition] += 1;
  }

  const summary = parseSummary(content, ["Merged", "Kept Separate", "Deferred"]);
  if (!summary) issues.push("invalid summary block");
  else {
    if (summary.Merged !== counts.merge) issues.push(`summary merged ${summary.Merged} != ${counts.merge}`);
    if (summary["Kept Separate"] !== counts["keep-separate"]) issues.push(`summary kept separate ${summary["Kept Separate"]} != ${counts["keep-separate"]}`);
    if (summary.Deferred !== counts.defer) issues.push(`summary deferred ${summary.Deferred} != ${counts.defer}`);
  }

  return issues;
}

let failed = false;

for (const path of listMarkdown(inputPath)) {
  const content = readFileSync(path, "utf-8");
  const issues = content.startsWith("# Reconciled Findings")
    ? validateReconciledFile(path, content)
    : validateSectionFile(path, content);

  if (issues.length > 0) {
    failed = true;
    console.error(`INVALID ${path}`);
    for (const issue of issues) console.error(`  - ${issue}`);
  }
}

if (failed) process.exit(1);
console.log("Validation passed");
