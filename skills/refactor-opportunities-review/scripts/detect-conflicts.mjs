#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node detect-conflicts.mjs <issues.json> <output-path>");
  process.exit(1);
}

const { issues } = JSON.parse(readFileSync(inputPath, "utf-8"));

function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((value) => value.length > 3)
  );
}

function overlapScore(a, b) {
  const aTokens = tokenize(`${a.pattern} ${a.finding} ${a.suggestedDirection}`);
  const bTokens = tokenize(`${b.pattern} ${b.finding} ${b.suggestedDirection}`);
  let score = 0;
  for (const token of aTokens) if (bTokens.has(token)) score += 1;
  return score;
}

function oppositeDirection(a, b) {
  const left = `${a.suggestedDirection} ${a.finding}`.toLowerCase();
  const right = `${b.suggestedDirection} ${b.finding}`.toLowerCase();
  const oppositePairs = [
    ["remove", "rename"],
    ["inline", "extract"],
    ["delete", "introduce"],
    ["collapse", "split"],
  ];
  return oppositePairs.some(([x, y]) => (left.includes(x) && right.includes(y)) || (left.includes(y) && right.includes(x)));
}

const candidates = [];

for (let index = 0; index < issues.length; index += 1) {
  for (let inner = index + 1; inner < issues.length; inner += 1) {
    const a = issues[index];
    const b = issues[inner];
    const sameFile = a.file && b.file && a.file === b.file;
    const sameSymbol = a.symbol !== "none" && a.symbol === b.symbol;
    const textOverlap = overlapScore(a, b);
    const opposite = oppositeDirection(a, b);

    if (!sameFile && !sameSymbol && textOverlap < 3) continue;

    candidates.push({
      ids: [a.id, b.id],
      files: [...new Set([a.file, b.file])],
      symbols: [...new Set([a.symbol, b.symbol])],
      sameFile,
      sameSymbol,
      textOverlap,
      oppositeDirection: opposite,
      reason: opposite
        ? "possible opposite remedies"
        : sameSymbol
          ? "same file and symbol"
          : sameFile
            ? "same file"
            : "similar language",
    });
  }
}

writeFileSync(outputPath, `${JSON.stringify({ candidates }, null, 2)}\n`, "utf-8");
console.log(`Detected ${candidates.length} conflict candidates`);
