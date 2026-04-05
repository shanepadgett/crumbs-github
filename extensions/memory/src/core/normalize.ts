import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import type { NormalizedTranscript, ToolCallBlock } from "../types.js";
import { sanitizeText } from "./sanitize.js";
import { collapseWhitespace, extractAssistantTextParts, extractTextFromContent } from "./text.js";

interface UserMessageLike {
  role: "user";
  content: unknown;
}

interface AssistantMessageLike {
  role: "assistant";
  content?: unknown;
}

interface ToolResultMessageLike {
  role: "toolResult";
  content: unknown;
  toolCallId?: string;
  toolName: string;
  isError?: boolean;
}

interface BashMessageLike {
  role: "bashExecution";
  command: string;
  output: string;
  exitCode?: number;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeUserEntry(entryId: string, message: UserMessageLike): NormalizedTranscript {
  const text = sanitizeText(extractTextFromContent(message.content));
  return {
    blocks: text ? [{ kind: "user", entryId, text }] : [],
    toolCallsById: new Map(),
  };
}

function normalizeAssistantEntry(
  entryId: string,
  message: AssistantMessageLike,
): NormalizedTranscript {
  const blocks: NormalizedTranscript["blocks"] = [];
  const toolCallsById = new Map<string, ToolCallBlock>();

  if (typeof message.content === "string") {
    const text = sanitizeText(message.content);
    if (text) blocks.push({ kind: "assistant", entryId, text });
    return { blocks, toolCallsById };
  }

  for (const text of extractAssistantTextParts(message.content)) {
    const cleaned = sanitizeText(text);
    if (cleaned) blocks.push({ kind: "assistant", entryId, text: cleaned });
  }

  if (!Array.isArray(message.content)) {
    return { blocks, toolCallsById };
  }

  for (const part of message.content) {
    if (!part || typeof part !== "object") continue;
    const value = part as {
      type?: unknown;
      id?: unknown;
      name?: unknown;
      arguments?: unknown;
    };
    if (value.type !== "toolCall" || typeof value.name !== "string") continue;

    const toolCallId = typeof value.id === "string" ? value.id : undefined;
    const block: ToolCallBlock = {
      kind: "tool_call",
      entryId,
      toolCallId,
      name: value.name,
      args: asObject(value.arguments),
    };
    blocks.push(block);
    if (toolCallId) toolCallsById.set(toolCallId, block);
  }

  return { blocks, toolCallsById };
}

function normalizeToolResultEntry(
  entryId: string,
  message: ToolResultMessageLike,
): NormalizedTranscript {
  const text = sanitizeText(extractTextFromContent(message.content));
  return {
    blocks: text
      ? [
          {
            kind: "tool_result",
            entryId,
            toolCallId: typeof message.toolCallId === "string" ? message.toolCallId : undefined,
            name: message.toolName,
            text,
            isError: Boolean(message.isError),
          },
        ]
      : [],
    toolCallsById: new Map(),
  };
}

function normalizeBashEntry(entryId: string, message: BashMessageLike): NormalizedTranscript {
  const command = collapseWhitespace(sanitizeText(message.command ?? ""));
  const output = sanitizeText(message.output ?? "");
  if (!command && !output) {
    return { blocks: [], toolCallsById: new Map() };
  }

  return {
    blocks: [
      {
        kind: "bash",
        entryId,
        command,
        output,
        exitCode: typeof message.exitCode === "number" ? message.exitCode : undefined,
      },
    ],
    toolCallsById: new Map(),
  };
}

export function normalizeEntries(entries: SessionEntry[]): NormalizedTranscript {
  const blocks: NormalizedTranscript["blocks"] = [];
  const toolCallsById = new Map<string, ToolCallBlock>();

  for (const entry of entries) {
    if (entry.type !== "message") continue;

    let normalized: NormalizedTranscript | undefined;
    if (entry.message.role === "user") {
      normalized = normalizeUserEntry(entry.id, entry.message as UserMessageLike);
    } else if (entry.message.role === "assistant") {
      normalized = normalizeAssistantEntry(entry.id, entry.message as AssistantMessageLike);
    } else if (entry.message.role === "toolResult") {
      normalized = normalizeToolResultEntry(entry.id, entry.message as ToolResultMessageLike);
    } else if (entry.message.role === "bashExecution") {
      normalized = normalizeBashEntry(entry.id, entry.message as BashMessageLike);
    }

    if (!normalized) continue;
    blocks.push(...normalized.blocks);
    for (const [toolCallId, block] of normalized.toolCallsById.entries()) {
      toolCallsById.set(toolCallId, block);
    }
  }

  return { blocks, toolCallsById };
}
