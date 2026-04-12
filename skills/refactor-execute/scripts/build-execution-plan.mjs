#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const indexPath = process.argv[2];
const outputPath = process.argv[3];
const unitsFlag = process.argv.find((a) => a.startsWith("--units="));
const requestedUnits = unitsFlag
  ? new Set(unitsFlag.slice(8).split(",").map((u) => u.trim()))
  : null;

if (!indexPath || !outputPath) {
  console.error("Usage: node build-execution-plan.mjs <index.json> <output-path> [--units=WU-001,WU-003]");
  process.exit(1);
}

const { workUnits } = JSON.parse(readFileSync(indexPath, "utf-8"));
const plansDir = dirname(indexPath);

// Parse each work unit plan for depends-on and files
const units = new Map();

for (const entry of workUnits) {
  const content = readFileSync(join(plansDir, `${entry.workUnit}.md`), "utf-8");
  const depsMatch = content.match(/^depends-on:\s*\[([^\]]*)\]/m);
  const filesMatch = content.match(/^files:\s*\[([^\]]*)\]/m);

  const deps = depsMatch?.[1]
    ? depsMatch[1].split(",").map((d) => d.trim()).filter(Boolean)
    : [];
  const files = filesMatch?.[1]
    ? filesMatch[1].split(",").map((f) => f.trim()).filter(Boolean)
    : [];

  units.set(entry.workUnit, {
    id: entry.workUnit,
    priority: entry.priority,
    deps,
    files,
  });
}

// If subset requested, include only those + transitive deps
let activeIds;
if (requestedUnits) {
  activeIds = new Set();
  const queue = [...requestedUnits];
  while (queue.length > 0) {
    const id = queue.pop();
    if (activeIds.has(id)) continue;
    if (!units.has(id)) continue;
    activeIds.add(id);
    for (const dep of units.get(id).deps) queue.push(dep);
  }
} else {
  activeIds = new Set(units.keys());
}

const active = [...activeIds].map((id) => units.get(id)).filter(Boolean);
const skipped = [...units.keys()].filter((id) => !activeIds.has(id));

// Build batches: respect deps and file overlap
const completed = new Set();
const batches = [];
const remaining = new Set(active.map((u) => u.id));

while (remaining.size > 0) {
  // Find units whose deps are all completed
  const ready = [];
  for (const id of remaining) {
    const unit = units.get(id);
    if (unit.deps.every((d) => completed.has(d) || !remaining.has(d))) {
      ready.push(unit);
    }
  }

  if (ready.length === 0) {
    // Circular dependency — break by taking highest priority remaining
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const sorted = [...remaining]
      .map((id) => units.get(id))
      .sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));
    ready.push(sorted[0]);
  }

  // Split ready units into non-overlapping file groups for parallelism
  const batch = [];
  const batchFiles = new Set();

  for (const unit of ready) {
    const overlaps = unit.files.some((f) => batchFiles.has(f));
    if (overlaps) continue; // defer to next batch
    batch.push(unit.id);
    for (const f of unit.files) batchFiles.add(f);
  }

  // If nothing was added (all overlap), take the first ready unit solo
  if (batch.length === 0) {
    batch.push(ready[0].id);
  }

  for (const id of batch) {
    remaining.delete(id);
    completed.add(id);
  }

  batches.push({ batch: batches.length + 1, units: batch });
}

const plan = { batches, skipped };
writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf-8");
console.log(`Execution plan: ${batches.length} batch(es), ${active.length} unit(s), ${skipped.length} skipped`);
