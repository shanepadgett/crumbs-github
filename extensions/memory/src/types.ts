import type { SessionEntry } from "@mariozechner/pi-coding-agent";

export interface MemoryFiles {
  read: string[];
  modified: string[];
  created: string[];
}

export interface MemoryState {
  goal: string[];
  recentTurns: string[];
  actions: string[];
  evidence: string[];
  files: MemoryFiles;
  outstandingContext: string[];
  preferences: string[];
}

export interface MemoryDetails {
  system: "crumbs-memory";
  version: number;
  source: "compaction" | "branch_summary";
  state: MemoryState;
  sourceEntryCount: number;
  usedFallbackCut?: boolean;
}

export type MemoryCarrierEntry = Extract<SessionEntry, { type: "compaction" | "branch_summary" }>;

export interface MemorySnapshot {
  entry: MemoryCarrierEntry;
  index: number;
  state: MemoryState;
  fromDetails: boolean;
}

interface BlockBase {
  entryId: string;
}

export interface UserBlock extends BlockBase {
  kind: "user";
  text: string;
}

export interface AssistantBlock extends BlockBase {
  kind: "assistant";
  text: string;
}

export interface ToolCallBlock extends BlockBase {
  kind: "tool_call";
  toolCallId?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultBlock extends BlockBase {
  kind: "tool_result";
  toolCallId?: string;
  name: string;
  text: string;
  isError: boolean;
}

export interface BashBlock extends BlockBase {
  kind: "bash";
  command: string;
  output: string;
  exitCode?: number;
}

export type NormalizedBlock =
  | UserBlock
  | AssistantBlock
  | ToolCallBlock
  | ToolResultBlock
  | BashBlock;

export interface NormalizedTranscript {
  blocks: NormalizedBlock[];
  toolCallsById: Map<string, ToolCallBlock>;
}

export interface FileOperationSeed {
  read: Iterable<string>;
  written: Iterable<string>;
  edited: Iterable<string>;
}

export interface BuildMemoryResult {
  state: MemoryState;
  blocks: NormalizedBlock[];
  toolCallsById: Map<string, ToolCallBlock>;
}

export interface SearchHit {
  record: RecallRecord;
  score: number;
  snippet: string;
}

export interface RecallRecord {
  id: string;
  entryId: string;
  role: "user" | "assistant" | "tool_result" | "bash" | "summary";
  toolName?: string;
  files: string[];
  summary: string;
  fullText: string;
  order: number;
}

export interface CompactionSelection {
  entries: SessionEntry[];
  cutIndex: number;
  firstKeptEntryId: string;
  usedFallbackCut: boolean;
}
