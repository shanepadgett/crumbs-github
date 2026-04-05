import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { MEMORY_DETAILS_VERSION, MEMORY_SYSTEM, STORED_STATE_LIMITS } from "../config.js";
import type {
  BuildMemoryResult,
  FileOperationSeed,
  MemoryDetails,
  MemoryFiles,
  MemorySnapshot,
  MemoryState,
  NormalizedBlock,
  ToolCallBlock,
} from "../types.js";
import { filterNoise } from "./filter-noise.js";
import { normalizeEntries } from "./normalize.js";
import {
  extractProbablePathsFromText,
  extractToolPaths,
  firstNonEmptyLine,
  nonEmptyLines,
  splitSentences,
  truncateText,
  uniqueRecentStrings,
  uniqueStrings,
} from "./text.js";

const ERROR_RE =
  /(error|failed|failure|exception|traceback|not found|cannot|blocked|invalid|ENOENT|EACCES|not assignable)/i;
const TEST_RE = /(FAIL|PASS|error:|warning:|failing|failed|passed|ok)/i;
const WARNING_RE = /\bwarning\b/i;
const TURN_DETAIL_RE =
  /\b(check|test|error|warning|fix|fixed|failed|pass|passed|wrote|write|created|edited|read|ran)\b/i;
const GENERIC_TURN_RE =
  /^(created(?: and fixed)?|fixed|done|updated|implemented|wrote|here you go|completed)[:.!]?$/i;
const SUCCESS_ONLY_RE = /^(ok|done|success|completed|successfully wrote|updated|applied)$/i;
const READ_LIKE_TOOLS = new Set(["read", "grep", "find", "ls"]);
const WRITE_LIKE_TOOLS = new Set(["edit", "write", "multiedit"]);
const LOW_SIGNAL_TOOLS = new Set(["ls", "find"]);
const PREFERENCE_RE =
  /\b(prefer|avoid|keep|plain|readable|concise|brief|simple|pragmatic|do not|don't|must|need to|supposed to|only|without|instead of|please\s+(?:use|avoid|keep|make|write)|style|format|after writing|before continuing|not run|just end)\b/i;
const CREATE_CUE_RE = /\b(create|new file|add file|new module|new helper)\b/i;
const OUTSTANDING_RE = /\b(still|blocked|failing|broken|todo|need to|remaining|follow up|next)\b/i;

export function createEmptyMemoryState(): MemoryState {
  return {
    goal: [],
    recentTurns: [],
    actions: [],
    evidence: [],
    files: {
      read: [],
      modified: [],
      created: [],
    },
    outstandingContext: [],
    preferences: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeFiles(files: Partial<MemoryFiles> | undefined): MemoryFiles {
  return {
    read: uniqueRecentStrings(files?.read ?? [], STORED_STATE_LIMITS.files),
    modified: uniqueRecentStrings(files?.modified ?? [], STORED_STATE_LIMITS.files),
    created: uniqueRecentStrings(files?.created ?? [], STORED_STATE_LIMITS.files),
  };
}

function normalizeState(state: Partial<MemoryState> | undefined): MemoryState {
  return {
    goal: uniqueRecentStrings(state?.goal ?? [], STORED_STATE_LIMITS.goal),
    recentTurns: uniqueRecentStrings(state?.recentTurns ?? [], STORED_STATE_LIMITS.recentTurns),
    actions: uniqueRecentStrings(state?.actions ?? [], STORED_STATE_LIMITS.actions),
    evidence: uniqueRecentStrings(state?.evidence ?? [], STORED_STATE_LIMITS.evidence),
    files: normalizeFiles(state?.files),
    outstandingContext: uniqueRecentStrings(
      state?.outstandingContext ?? [],
      STORED_STATE_LIMITS.outstandingContext,
    ),
    preferences: uniqueRecentStrings(state?.preferences ?? [], STORED_STATE_LIMITS.preferences),
  };
}

function hasMemoryContent(state: MemoryState): boolean {
  return (
    Object.values(state.files).some((items) => items.length > 0) ||
    state.goal.length > 0 ||
    state.recentTurns.length > 0 ||
    state.actions.length > 0 ||
    state.evidence.length > 0 ||
    state.outstandingContext.length > 0 ||
    state.preferences.length > 0
  );
}

function parseMemoryDetails(value: unknown): MemoryDetails | undefined {
  if (!isRecord(value)) return undefined;
  if (value.system !== MEMORY_SYSTEM) return undefined;
  if (value.version !== MEMORY_DETAILS_VERSION) return undefined;
  const state = normalizeState(value.state as Partial<MemoryState> | undefined);
  return {
    system: MEMORY_SYSTEM,
    version: MEMORY_DETAILS_VERSION,
    source: value.source === "branch_summary" ? "branch_summary" : "compaction",
    state,
    sourceEntryCount: typeof value.sourceEntryCount === "number" ? value.sourceEntryCount : 0,
    usedFallbackCut: value.usedFallbackCut === true ? true : undefined,
  };
}

function parseBulletLines(lines: string[]): string[] {
  return uniqueStrings(
    lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2).trim()),
  );
}

function parseFilesSection(lines: string[]): MemoryFiles {
  const files: MemoryFiles = { read: [], modified: [], created: [] };
  let bucket: keyof MemoryFiles | undefined;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.toLowerCase() === "read:") bucket = "read";
    else if (line.toLowerCase() === "modified:") bucket = "modified";
    else if (line.toLowerCase() === "created:") bucket = "created";
    else if (bucket && line.startsWith("- ")) files[bucket].push(line.slice(2).trim());
  }

  return normalizeFiles(files);
}

export function parseSummaryState(summary: string): MemoryState | undefined {
  const sections = new Map<string, string[]>();
  let currentSection: string | undefined;

  for (const rawLine of summary.split("\n")) {
    const headingMatch = rawLine.match(/^\[(.+)]$/);
    if (headingMatch) {
      currentSection = headingMatch[1]?.trim();
      if (currentSection) sections.set(currentSection, []);
      continue;
    }

    if (!currentSection) continue;
    sections.get(currentSection)?.push(rawLine);
  }

  const state = normalizeState({
    goal: parseBulletLines(sections.get("Goal") ?? []),
    recentTurns: parseBulletLines(sections.get("Recent Turns") ?? []),
    actions: parseBulletLines(sections.get("Actions Taken") ?? []),
    evidence: parseBulletLines(sections.get("Important Evidence") ?? []),
    files: parseFilesSection(sections.get("Files") ?? []),
    outstandingContext: parseBulletLines(sections.get("Outstanding Context") ?? []),
    preferences: parseBulletLines(sections.get("User Preferences") ?? []),
  });

  return hasMemoryContent(state) ? state : undefined;
}

export function readLatestMemorySnapshot(
  entries: SessionEntry[],
  beforeIndexExclusive = entries.length,
): MemorySnapshot | undefined {
  for (let index = Math.min(beforeIndexExclusive - 1, entries.length - 1); index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || (entry.type !== "compaction" && entry.type !== "branch_summary")) continue;

    const details = parseMemoryDetails(entry.details);
    if (details) {
      return {
        entry: entry as MemorySnapshot["entry"],
        index,
        state: details.state,
        fromDetails: true,
      };
    }

    const parsed = parseSummaryState(entry.summary);
    if (parsed) {
      return {
        entry: entry as MemorySnapshot["entry"],
        index,
        state: parsed,
        fromDetails: false,
      };
    }
  }

  return undefined;
}

function extractGoal(blocks: NormalizedBlock[]): string[] {
  for (const block of blocks) {
    if (block.kind !== "user") continue;
    const line = truncateText(firstNonEmptyLine(block.text), 220);
    if (line.length >= 16) return [line];
  }
  return [];
}

function stripListMarker(line: string): string {
  return line.replace(/^[-*]\s+/, "").trim();
}

function scoreTurnLine(line: string): number {
  let score = Math.min(line.length, 160);
  if (extractProbablePathsFromText(line).length > 0) score += 30;
  if (TURN_DETAIL_RE.test(line)) score += 25;
  if (ERROR_RE.test(line)) score += 20;
  if (GENERIC_TURN_RE.test(line)) score -= 40;
  if (line.length < 10) score -= 20;
  return score;
}

function pickFollowUpLine(lines: string[]): string | undefined {
  let bestLine: string | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const line of lines.slice(1).map(stripListMarker)) {
    if (!line) continue;
    const score = scoreTurnLine(line);
    if (score > bestScore) {
      bestLine = line;
      bestScore = score;
    }
  }

  return bestLine;
}

function summarizeTurnText(text: string): string {
  const lines = nonEmptyLines(text).map(stripListMarker).filter(Boolean);
  const firstLine = lines[0] ?? "";
  if (!firstLine) return "";

  const followUp = pickFollowUpLine(lines);
  if (
    (firstLine.endsWith(":") || GENERIC_TURN_RE.test(firstLine) || firstLine.length < 24) &&
    followUp
  ) {
    const prefix = firstLine.replace(/[:\s]+$/, "");
    return truncateText(prefix ? `${prefix}: ${followUp}` : followUp, 220);
  }

  return truncateText(firstLine, 220);
}

function extractRecentTurns(blocks: NormalizedBlock[]): string[] {
  const recentTurns = blocks
    .filter(
      (block): block is Extract<NormalizedBlock, { kind: "user" | "assistant" }> =>
        block.kind === "user" || block.kind === "assistant",
    )
    .map((block) => {
      const label = block.kind === "user" ? "User" : "Assistant";
      return `${label}: ${summarizeTurnText(block.text)}`;
    })
    .filter((line) => line.length > 12);

  return recentTurns.slice(-STORED_STATE_LIMITS.recentTurns);
}

function describeToolCall(block: ToolCallBlock): string {
  const name = block.name;
  const lowerName = name.toLowerCase();
  const toolPaths = extractToolPaths(block.args);

  if (lowerName === "bash" && typeof block.args.command === "string") {
    return `bash "${truncateText(block.args.command, 100)}"`;
  }

  if (toolPaths[0]) {
    return `${name} "${truncateText(toolPaths[0], 100)}"`;
  }

  if (lowerName === "webresearch") {
    const task = typeof block.args.task === "string" ? block.args.task : block.args.query;
    if (typeof task === "string" && task.trim()) {
      return `${name} "${truncateText(task, 100)}"`;
    }
  }

  if (typeof block.args.query === "string" && block.args.query.trim()) {
    return `${name} "${truncateText(block.args.query, 100)}"`;
  }

  return name;
}

function extractActions(blocks: NormalizedBlock[]): string[] {
  const counts = new Map<string, number>();
  const order: string[] = [];

  for (const block of blocks) {
    if (block.kind !== "tool_call") continue;
    const action = describeToolCall(block);
    if (!counts.has(action)) order.push(action);
    counts.set(action, (counts.get(action) ?? 0) + 1);
  }

  return order.map((action) => {
    const count = counts.get(action) ?? 1;
    return count > 1 ? `${action} x${count}` : action;
  });
}

function scoreEvidenceLine(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return Number.NEGATIVE_INFINITY;

  let score = 0;
  if (ERROR_RE.test(trimmed)) score += 140;
  if (/\bTS\d{4}\b/.test(trimmed) || /eslint/i.test(trimmed)) score += 80;
  if (/command exited with code \d+/i.test(trimmed)) score += 70;
  if (TEST_RE.test(trimmed)) score += 35;
  if (WARNING_RE.test(trimmed)) score += 10;
  if (/Found \d+ warning/.test(trimmed) && /0 errors/.test(trimmed)) score -= 40;
  if (/^\[(lint|format|typecheck)\]\s*\$/.test(trimmed)) score -= 40;
  if (/^\[?(lint|format|typecheck)\]?$/.test(trimmed)) score -= 30;
  if (/^Finished in \d/.test(trimmed)) score -= 30;
  score += Math.min(trimmed.length, 160) / 8;
  return score;
}

function selectImportantLine(text: string): string {
  const lines = nonEmptyLines(text);
  if (lines.length === 0) return "";

  let bestLine = lines[0] ?? "";
  let bestScore = scoreEvidenceLine(bestLine);

  for (const line of lines.slice(1)) {
    const score = scoreEvidenceLine(line);
    if (score > bestScore) {
      bestLine = line;
      bestScore = score;
    }
  }

  return truncateText(bestLine, 220);
}

function extractEvidence(
  blocks: NormalizedBlock[],
  toolCallsById: Map<string, ToolCallBlock>,
): string[] {
  const evidence: string[] = [];

  for (const block of blocks) {
    if (block.kind === "tool_result") {
      if (!block.text || block.text.length < 6) continue;
      if (!block.isError && SUCCESS_ONLY_RE.test(block.text.trim())) continue;
      if (!block.isError && LOW_SIGNAL_TOOLS.has(block.name.toLowerCase())) continue;

      const sourceCall = block.toolCallId ? toolCallsById.get(block.toolCallId) : undefined;
      const path = sourceCall ? extractToolPaths(sourceCall.args)[0] : undefined;
      const label = path ? `${block.name} ${path}` : block.name;
      const line = selectImportantLine(block.text);
      if (line) evidence.push(`${label}: ${line}`);
      continue;
    }

    if (block.kind === "bash") {
      const line = selectImportantLine(block.output || block.command);
      if (!line) continue;
      evidence.push(`bash "${truncateText(block.command, 80)}": ${line}`);
    }
  }

  return uniqueRecentStrings(evidence, STORED_STATE_LIMITS.evidence);
}

function hasCreateCue(blocks: NormalizedBlock[], index: number): boolean {
  const start = Math.max(0, index - 3);
  for (let cursor = start; cursor < index; cursor += 1) {
    const block = blocks[cursor];
    if (!block || (block.kind !== "user" && block.kind !== "assistant")) continue;
    if (CREATE_CUE_RE.test(block.text)) return true;
  }
  return false;
}

function extractFiles(
  blocks: NormalizedBlock[],
  previousState: MemoryState | undefined,
  fileOps: FileOperationSeed | undefined,
): MemoryFiles {
  const read = new Set<string>(fileOps ? Array.from(fileOps.read) : []);
  const modified = new Set<string>(fileOps ? [...fileOps.written, ...fileOps.edited] : []);
  const created = new Set<string>();
  const knownPaths = new Set<string>([
    ...(previousState?.files.read ?? []),
    ...(previousState?.files.modified ?? []),
    ...(previousState?.files.created ?? []),
  ]);

  blocks.forEach((block, index) => {
    if (block.kind !== "tool_call") return;

    const lowerName = block.name.toLowerCase();
    const toolPaths = extractToolPaths(block.args);
    if (toolPaths.length === 0) return;

    if (READ_LIKE_TOOLS.has(lowerName)) toolPaths.forEach((path) => read.add(path));
    if (WRITE_LIKE_TOOLS.has(lowerName)) toolPaths.forEach((path) => modified.add(path));

    if (lowerName === "write" && hasCreateCue(blocks, index)) {
      for (const path of toolPaths) {
        if (knownPaths.has(path)) continue;
        created.add(path);
      }
    }

    toolPaths.forEach((path) => knownPaths.add(path));
  });

  for (const path of [...modified, ...created]) read.delete(path);

  return {
    read: uniqueRecentStrings(read, STORED_STATE_LIMITS.files),
    modified: uniqueRecentStrings(modified, STORED_STATE_LIMITS.files),
    created: uniqueRecentStrings(created, STORED_STATE_LIMITS.files),
  };
}

function extractOutstandingContext(blocks: NormalizedBlock[]): string[] {
  const tail = blocks.slice(-20);
  const outstanding: string[] = [];

  let lastSuccessfulCheckIndex = -1;
  for (let index = tail.length - 1; index >= 0; index -= 1) {
    const block = tail[index];
    if (block?.kind === "bash" && block.exitCode === 0) {
      lastSuccessfulCheckIndex = index;
      break;
    }
  }

  const relevantTail =
    lastSuccessfulCheckIndex === -1 ? tail : tail.slice(lastSuccessfulCheckIndex + 1);

  for (const block of relevantTail) {
    if (block.kind === "tool_result" && block.isError) {
      const line = selectImportantLine(block.text);
      if (line) outstanding.push(`${block.name}: ${line}`);
      continue;
    }

    if (block.kind === "bash" && typeof block.exitCode === "number" && block.exitCode !== 0) {
      const line = selectImportantLine(block.output || block.command);
      if (line) outstanding.push(`bash "${truncateText(block.command, 80)}": ${line}`);
      continue;
    }

    if ((block.kind === "user" || block.kind === "assistant") && OUTSTANDING_RE.test(block.text)) {
      outstanding.push(truncateText(summarizeTurnText(block.text), 220));
    }
  }

  return uniqueRecentStrings(outstanding, STORED_STATE_LIMITS.outstandingContext);
}

function extractPreferences(blocks: NormalizedBlock[]): string[] {
  const preferences: string[] = [];

  for (const block of blocks) {
    if (block.kind !== "user") continue;
    const segments = uniqueStrings([...nonEmptyLines(block.text), ...splitSentences(block.text)]);

    for (const segment of segments) {
      if (segment.length < 8 || segment.length > 220) continue;
      if (!PREFERENCE_RE.test(segment)) continue;
      preferences.push(truncateText(segment, 220));
    }
  }

  return uniqueRecentStrings(preferences, STORED_STATE_LIMITS.preferences);
}

export function mergeMemory(
  previousState: MemoryState | undefined,
  freshState: MemoryState,
): MemoryState {
  const previous = previousState ? normalizeState(previousState) : createEmptyMemoryState();
  const fresh = normalizeState(freshState);

  const merged: MemoryState = {
    goal: fresh.goal.length > 0 ? fresh.goal : previous.goal,
    recentTurns: uniqueRecentStrings(fresh.recentTurns, STORED_STATE_LIMITS.recentTurns),
    actions: uniqueRecentStrings(
      [...previous.actions, ...fresh.actions],
      STORED_STATE_LIMITS.actions,
    ),
    evidence: uniqueRecentStrings(
      [...previous.evidence, ...fresh.evidence],
      STORED_STATE_LIMITS.evidence,
    ),
    files: {
      read: uniqueRecentStrings(
        [...previous.files.read, ...fresh.files.read],
        STORED_STATE_LIMITS.files,
      ),
      modified: uniqueRecentStrings(
        [...previous.files.modified, ...fresh.files.modified],
        STORED_STATE_LIMITS.files,
      ),
      created: uniqueRecentStrings(
        [...previous.files.created, ...fresh.files.created],
        STORED_STATE_LIMITS.files,
      ),
    },
    outstandingContext: uniqueRecentStrings(
      fresh.outstandingContext,
      STORED_STATE_LIMITS.outstandingContext,
    ),
    preferences: uniqueRecentStrings(
      [...previous.preferences, ...fresh.preferences],
      STORED_STATE_LIMITS.preferences,
    ),
  };

  for (const path of [...merged.files.modified, ...merged.files.created]) {
    merged.files.read = merged.files.read.filter((candidate) => candidate !== path);
  }

  return merged;
}

export function buildMemory(
  entries: SessionEntry[],
  options?: {
    previousState?: MemoryState;
    fileOps?: FileOperationSeed;
  },
): BuildMemoryResult {
  const normalized = normalizeEntries(entries);
  const blocks = filterNoise(normalized.blocks);

  const freshState: MemoryState = {
    goal: extractGoal(blocks),
    recentTurns: extractRecentTurns(blocks),
    actions: extractActions(blocks),
    evidence: extractEvidence(blocks, normalized.toolCallsById),
    files: extractFiles(blocks, options?.previousState, options?.fileOps),
    outstandingContext: extractOutstandingContext(blocks),
    preferences: extractPreferences(blocks),
  };

  return {
    state: mergeMemory(options?.previousState, freshState),
    blocks,
    toolCallsById: normalized.toolCallsById,
  };
}
