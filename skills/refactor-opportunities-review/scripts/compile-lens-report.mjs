#!/usr/bin/env node

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const findingsDir = process.argv[2];
const outputPath = process.argv[3];
const lensName = process.argv[4] ?? "lens";

if (!findingsDir || !outputPath) {
  console.error("Usage: node compile-lens-report.mjs <findings-dir> <output-path> [lens-name]");
  process.exit(1);
}

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

function extractField(lines, label) {
  const line = lines.find((value) => value.toLowerCase().startsWith(`- **${label.toLowerCase()}:**`));
  if (!line) return "";
  return line.replace(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*`, "i"), "").trim();
}

function parseFile(content, filename) {
  const title = content.match(/^# (.+)$/m)?.[1] ?? filename;
  const sectionName = title.includes(":") ? title.split(":").slice(1).join(":").trim() : title;
  const findings = [];

  for (const block of content.split(/^### /m).slice(1)) {
    const lines = block.trim().split("\n");
    const id = lines[0]?.trim();
    if (!id) continue;

    const severity = extractField(lines, "Severity").toLowerCase();
    if (!(severity in SEVERITY_ORDER)) continue;

    findings.push({
      id,
      severity,
      file: extractField(lines, "File"),
      symbol: extractField(lines, "Symbol"),
      pattern: extractField(lines, "Pattern"),
      finding: extractField(lines, "Finding"),
      evidence: extractField(lines, "Evidence"),
      suggestedDirection: extractField(lines, "Suggested Direction"),
      section: sectionName,
    });
  }

  return { title, sectionName, findings };
}

const files = readdirSync(findingsDir)
  .filter((name) => name.endsWith(".md"))
  .sort();

if (files.length === 0) {
  console.error(`No findings files found in ${findingsDir}`);
  process.exit(1);
}

const sections = files.map((name) => parseFile(readFileSync(join(findingsDir, name), "utf-8"), name));
const allFindings = sections.flatMap((section) => section.findings);
const counts = { high: 0, medium: 0, low: 0 };

for (const finding of allFindings) counts[finding.severity] += 1;

const lines = [];
lines.push(`# ${lensName} — Compiled Findings`);
lines.push("");
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Total findings: ${allFindings.length}`);
lines.push("");
lines.push("## Summary");
lines.push("");
lines.push(`- High: ${counts.high}`);
lines.push(`- Medium: ${counts.medium}`);
lines.push(`- Low: ${counts.low}`);
lines.push("");

for (const section of sections) {
  lines.push(`## ${section.sectionName}`);
  lines.push("");

  if (section.findings.length === 0) {
    lines.push("None.");
    lines.push("");
    continue;
  }

  for (const finding of section.findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id))) {
    lines.push(`### ${finding.id}`);
    lines.push(`- **Severity:** ${finding.severity}`);
    lines.push(`- **File:** ${finding.file}`);
    lines.push(`- **Symbol:** ${finding.symbol}`);
    lines.push(`- **Pattern:** ${finding.pattern}`);
    lines.push(`- **Finding:** ${finding.finding}`);
    lines.push(`- **Evidence:** ${finding.evidence}`);
    lines.push(`- **Suggested Direction:** ${finding.suggestedDirection}`);
    lines.push("");
  }
}

writeFileSync(outputPath, `${lines.join("\n")}\n`, "utf-8");
console.log(`Compiled ${allFindings.length} findings to ${outputPath}`);
