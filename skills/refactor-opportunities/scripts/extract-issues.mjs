#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const outputPath = process.argv[2];
const reportPaths = process.argv.slice(3);

if (!outputPath || reportPaths.length === 0) {
  console.error("Usage: node extract-issues.mjs <output-path> <compiled-report>...");
  process.exit(1);
}

function extractField(lines, label) {
  const line = lines.find((value) => value.toLowerCase().startsWith(`- **${label.toLowerCase()}:**`));
  if (!line) return "";
  return line.replace(new RegExp(`^- \\*\\*${label}:\\*\\*\\s*`, "i"), "").trim();
}

const issues = [];

for (const reportPath of reportPaths) {
  const content = readFileSync(reportPath, "utf-8");
  const lens = content.match(/^# (.+?) — Compiled Findings$/m)?.[1]?.trim().toLowerCase() ?? "unknown";
  const sections = content.split(/^## /m).slice(1);

  for (const sectionBlock of sections) {
    const lines = sectionBlock.split("\n");
    const section = lines[0].trim();
    if (section === "Summary") continue;

    for (const block of sectionBlock.split(/^### /m).slice(1)) {
      const blockLines = block.trim().split("\n");
      const id = blockLines[0]?.trim();
      if (!id) continue;

      const fileField = extractField(blockLines, "File");
      const fileMatch = fileField.match(/^(.*?)(?::(\d+))?$/);

      issues.push({
        id,
        lens,
        section,
        severity: extractField(blockLines, "Severity").toLowerCase(),
        file: fileMatch?.[1] ?? fileField,
        line: fileMatch?.[2] ? Number(fileMatch[2]) : null,
        symbol: extractField(blockLines, "Symbol"),
        pattern: extractField(blockLines, "Pattern"),
        finding: extractField(blockLines, "Finding"),
        evidence: extractField(blockLines, "Evidence"),
        suggestedDirection: extractField(blockLines, "Suggested Direction"),
      });
    }
  }
}

writeFileSync(outputPath, `${JSON.stringify({ issues }, null, 2)}\n`, "utf-8");
console.log(`Extracted ${issues.length} issues to ${outputPath}`);
