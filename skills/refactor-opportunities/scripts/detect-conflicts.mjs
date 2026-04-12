#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.argv[2];
const outputPath = process.argv[3];

if (!inputPath || !outputPath) {
  console.error("Usage: node detect-conflicts.mjs <issues.json> <output-path>");
  process.exit(1);
}

const { issues } = JSON.parse(readFileSync(inputPath, "utf-8"));

// Common words that appear in almost every code-review finding and carry no
// signal for conflict detection.  Kept short and domain-targeted so we don't
// need a full NLP stopword list.
const STOPWORDS = new Set([
  "file", "files", "type", "types", "code", "used", "uses", "using",
  "that", "this", "with", "from", "into", "only", "also", "same",
  "line", "name", "each", "make", "added", "adds", "does", "have",
  "been", "more", "than", "when", "will", "would", "could", "should",
  "method", "function", "class", "struct", "protocol", "enum",
  "property", "parameter", "variable", "value", "string", "error",
  "single", "existing", "current", "without", "defined", "found",
  "pattern", "implementation", "conformer", "because", "already",
]);

function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((value) => value.length > 3 && !STOPWORDS.has(value))
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

    // Strong structural signals always pass.  Text-overlap alone must clear
    // a higher bar to avoid flooding the reconciler with noise.
    const hasStructuralSignal = sameFile || sameSymbol || opposite;
    if (!hasStructuralSignal && textOverlap < 6) continue;

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
