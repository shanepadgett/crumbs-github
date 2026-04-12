#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const planPath = process.argv[2];
const outputDir = process.argv[3];

if (!planPath || !outputDir) {
  console.error("Usage: node split-work-units.mjs <remediation-plan.md> <output-dir>");
  process.exit(1);
}

const content = readFileSync(planPath, "utf-8");
const headingPattern = /^### (WU-\d+)$/gm;
const workUnits = [];
let match;

while ((match = headingPattern.exec(content)) !== null) {
  const id = match[1];
  const start = match.index + match[0].length;
  const rest = content.slice(start);
  const next = rest.match(/^### WU-\d+$/m);
  const body = next ? rest.slice(0, next.index).trim() : rest.trim();
  workUnits.push({ id, body });
}

if (workUnits.length === 0) {
  console.error("No work units found. Expected '### WU-<NNN>' headings.");
  process.exit(1);
}

function extractField(body, label) {
  const match = body.match(new RegExp(`- \\*\\*${label}:\\*\\*\\s*(.+)$`, "im"));
  return match ? match[1].trim() : "";
}

mkdirSync(outputDir, { recursive: true });

for (const workUnit of workUnits) {
  const title = extractField(workUnit.body, "Title");
  const priority = extractField(workUnit.body, "Priority");
  const dependsOn = extractField(workUnit.body, "Depends On");
  const sourceFindings = extractField(workUnit.body, "Source Findings");
  const primaryLens = extractField(workUnit.body, "Primary Lens");
  const files = extractField(workUnit.body, "Files");
  const goal = extractField(workUnit.body, "Goal");
  const nonGoals = extractField(workUnit.body, "Non-Goals");
  const risks = extractField(workUnit.body, "Risks");
  const whyNotConflicting = extractField(workUnit.body, "Why Not Conflicting");
  const steps = workUnit.body.match(/#### Steps\n([\s\S]*?)(\n#### Validation|$)/m)?.[1]?.trim() ?? "";
  const validation = workUnit.body.match(/#### Validation\n([\s\S]*)$/m)?.[1]?.trim() ?? "";

  const output = `---
work-unit: ${workUnit.id}
title: "${title.replaceAll('"', '\\"')}"
priority: ${priority}
primary-lens: ${primaryLens}
depends-on: [${dependsOn.toLowerCase() === "none" ? "" : dependsOn}]
source-findings: [${sourceFindings}]
files: [${files}]
---

# ${workUnit.id}: ${title}

## Goal

${goal}

## Non-Goals

${nonGoals}

## Risks

${risks}

## Why Not Conflicting

${whyNotConflicting}

## Steps

${steps}

## Validation

${validation}
`;

  writeFileSync(join(outputDir, `${workUnit.id}.md`), output, "utf-8");
}

console.log(`Created ${workUnits.length} plan files in ${outputDir}`);
