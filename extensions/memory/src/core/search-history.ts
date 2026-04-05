import { readFileSync } from "node:fs";
import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import { DEFAULT_RECENT_HISTORY_COUNT, DEFAULT_SEARCH_RESULT_LIMIT } from "../config.js";
import type { RecallRecord, SearchHit } from "../types.js";
import {
  extractProbablePathsFromText,
  extractToolPaths,
  extractTextFromContent,
  makeSnippet,
  truncateText,
  uniqueStrings,
} from "./text.js";

interface AssistantToolCallPart {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  arguments?: unknown;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isSessionEntry(value: unknown): value is SessionEntry {
  const record = asObject(value);
  return typeof record.id === "string" && typeof record.type === "string";
}

function entryParentId(entry: SessionEntry): string | null {
  const parentId = (entry as SessionEntry & { parentId?: unknown }).parentId;
  return typeof parentId === "string" && parentId ? parentId : null;
}

export function loadRecallEntries(sessionFile: string, leafId: string | null): SessionEntry[] {
  const parsedEntries: SessionEntry[] = [];

  for (const line of readFileSync(sessionFile, "utf8").split("\n")) {
    if (!line.trim()) continue;

    try {
      const parsed = JSON.parse(line) as unknown;
      if (isSessionEntry(parsed)) parsedEntries.push(parsed);
    } catch {
      continue;
    }
  }

  if (!leafId) return parsedEntries;

  const byId = new Map(parsedEntries.map((entry) => [entry.id, entry]));
  const branchIds = new Set<string>();
  let currentId: string | null = leafId;

  while (currentId && !branchIds.has(currentId)) {
    branchIds.add(currentId);
    const entry = byId.get(currentId);
    if (!entry) break;
    currentId = entryParentId(entry);
  }

  return parsedEntries.filter((entry) => branchIds.has(entry.id));
}

function buildToolCallIndex(
  entries: SessionEntry[],
): Map<string, { name: string; files: string[] }> {
  const index = new Map<string, { name: string; files: string[] }>();

  for (const entry of entries) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    if (!Array.isArray(entry.message.content)) continue;

    for (const part of entry.message.content) {
      if (!part || typeof part !== "object") continue;
      const value = part as AssistantToolCallPart;
      if (
        value.type !== "toolCall" ||
        typeof value.id !== "string" ||
        typeof value.name !== "string"
      ) {
        continue;
      }

      index.set(value.id, {
        name: value.name,
        files: extractToolPaths(asObject(value.arguments)),
      });
    }
  }

  return index;
}

function assistantMessageText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const value = part as { type?: unknown; text?: unknown; name?: unknown; arguments?: unknown };
    if (value.type === "text" && typeof value.text === "string") {
      parts.push(value.text.trim());
      continue;
    }
    if (value.type === "toolCall" && typeof value.name === "string") {
      const paths = extractToolPaths(asObject(value.arguments));
      const suffix = paths[0] ? ` ${paths[0]}` : "";
      parts.push(`[tool ${value.name}${suffix}]`);
    }
  }

  return parts.filter(Boolean).join("\n").trim();
}

function explicitOrExtractedFiles(fullText: string, explicitFiles?: string[]): string[] {
  if (explicitFiles && explicitFiles.length > 0) {
    return uniqueStrings(explicitFiles);
  }

  return extractProbablePathsFromText(fullText);
}

function legacyRecordId(record: Pick<RecallRecord, "entryId" | "role">): string {
  if (record.role === "summary") return `branch-summary:${record.entryId}`;
  if (record.role === "tool_result") return `tool-result:${record.entryId}`;
  if (record.role === "bash") return `bash:${record.entryId}`;
  return `message:${record.entryId}`;
}

export function buildRecallRecords(entries: SessionEntry[]): RecallRecord[] {
  const toolCallsById = buildToolCallIndex(entries);
  const records: RecallRecord[] = [];

  entries.forEach((entry, order) => {
    if (entry.type === "branch_summary") {
      const files = extractProbablePathsFromText(entry.summary);
      records.push({
        id: entry.id,
        entryId: entry.id,
        role: "summary",
        files,
        summary: truncateText(entry.summary.replace(/\s+/g, " "), 180),
        fullText: entry.summary,
        order,
      });
      return;
    }

    if (entry.type !== "message") return;

    if (entry.message.role === "user") {
      const fullText = extractTextFromContent(entry.message.content);
      if (!fullText) return;
      records.push({
        id: entry.id,
        entryId: entry.id,
        role: "user",
        files: extractProbablePathsFromText(fullText),
        summary: truncateText(fullText.replace(/\s+/g, " "), 180),
        fullText,
        order,
      });
      return;
    }

    if (entry.message.role === "assistant") {
      const fullText = assistantMessageText(entry.message.content);
      if (!fullText) return;
      records.push({
        id: entry.id,
        entryId: entry.id,
        role: "assistant",
        files: extractProbablePathsFromText(fullText),
        summary: truncateText(fullText.replace(/\s+/g, " "), 180),
        fullText,
        order,
      });
      return;
    }

    if (entry.message.role === "toolResult") {
      if (entry.message.toolName === "memory_recall") return;

      const fullText = extractTextFromContent(entry.message.content);
      if (!fullText) return;
      const toolCall =
        typeof entry.message.toolCallId === "string"
          ? toolCallsById.get(entry.message.toolCallId)
          : undefined;
      records.push({
        id: entry.id,
        entryId: entry.id,
        role: "tool_result",
        toolName: entry.message.toolName,
        files: explicitOrExtractedFiles(fullText, toolCall?.files),
        summary: truncateText(fullText.replace(/\s+/g, " "), 180),
        fullText,
        order,
      });
      return;
    }

    if (entry.message.role === "bashExecution") {
      const command = entry.message.command.trim();
      const output = entry.message.output.trim();
      const fullText = output ? `$ ${command}\n${output}` : `$ ${command}`;
      records.push({
        id: entry.id,
        entryId: entry.id,
        role: "bash",
        files: extractProbablePathsFromText(`${command}\n${output}`),
        summary: truncateText(fullText.replace(/\s+/g, " "), 180),
        fullText,
        order,
      });
    }
  });

  return records;
}

const TOKEN_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "so",
  "that",
  "the",
  "their",
  "there",
  "this",
  "to",
  "was",
  "we",
  "were",
  "with",
  "you",
]);

function queryTokens(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token && !TOKEN_STOPWORDS.has(token));
}

function isPathLikeQuery(query: string): boolean {
  return query.includes("/") || /\.[A-Za-z0-9_-]+$/.test(query.trim());
}

function isErrorLikeQuery(query: string): boolean {
  return /\b(error|failed|failure|warning|exception|traceback|exit\s+code|not assignable|unused)\b/i.test(
    query,
  );
}

function recordLooksLikeError(record: RecallRecord): boolean {
  return /\b(error|failed|failure|warning|exception|traceback|not assignable|unused|command exited with code|exited with code)\b/i.test(
    record.fullText,
  );
}

function scoreRecord(record: RecallRecord, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;

  const haystack = `${record.summary}\n${record.fullText}\n${record.files.join(" ")}`.toLowerCase();
  const tokens = queryTokens(query);
  const pathLike = isPathLikeQuery(query);
  const errorLike = isErrorLikeQuery(query);
  let score = 0;

  if (record.files.some((file) => file.toLowerCase() === normalizedQuery)) score += 120;
  else if (pathLike && record.files.some((file) => file.toLowerCase().includes(normalizedQuery)))
    score += 100;

  if (haystack.includes(normalizedQuery)) score += 80;

  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(query)) {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(record.fullText)) score += 60;
  }

  if (tokens.length > 0 && tokens.every((token) => haystack.includes(token))) {
    score += 40 + tokens.length;
  }

  if (score <= 0) return 0;

  if (!pathLike && record.files.length > 10) {
    score -= Math.min(60, (record.files.length - 10) * 2);
  }

  if (!pathLike && record.role === "assistant") score -= 20;
  if (!pathLike && record.role === "assistant" && record.files.length > 3) score -= 20;
  if (!pathLike && record.role === "tool_result" && record.toolName === "read") score -= 80;

  if (errorLike && recordLooksLikeError(record)) score += 50;
  if (errorLike && record.role === "assistant") score -= 80;
  if (errorLike && record.role === "bash") score += 60;
  if (errorLike && record.role === "tool_result" && record.toolName === "read") score -= 40;

  if (record.role === "user") score += 20;
  if (record.role === "bash") score += 15;
  if (record.role === "tool_result" && record.toolName !== "read") score += 15;
  if (record.role === "summary") score -= 15;
  return score > 0 ? score : 0;
}

export function searchRecallRecords(
  records: RecallRecord[],
  query: string,
  limit = DEFAULT_SEARCH_RESULT_LIMIT,
): SearchHit[] {
  return records
    .map((record) => ({
      record,
      score: scoreRecord(record, query),
      snippet: makeSnippet(record.fullText, query),
    }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || right.record.order - left.record.order)
    .slice(0, limit);
}

export function recentRecallRecords(
  records: RecallRecord[],
  limit = DEFAULT_RECENT_HISTORY_COUNT,
): RecallRecord[] {
  return records.slice(-limit);
}

export function expandRecallRecords(records: RecallRecord[], ids: string[]): RecallRecord[] {
  const byId = new Map<string, RecallRecord>();

  for (const record of records) {
    byId.set(record.id, record);
    byId.set(record.entryId, record);
    byId.set(legacyRecordId(record), record);
  }

  const expanded: RecallRecord[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    const record = byId.get(id);
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id);
    expanded.push(record);
  }

  return expanded;
}
