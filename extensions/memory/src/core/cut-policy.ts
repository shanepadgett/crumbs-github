import type { SessionEntry } from "@mariozechner/pi-coding-agent";
import type { CompactionSelection } from "../types.js";

function findEntryIndex(entries: SessionEntry[], entryId: string): number {
  return entries.findIndex((entry) => entry.id === entryId);
}

function isSummarizableEntry(entry: SessionEntry): boolean {
  if (entry.type !== "message") return false;
  return (
    entry.message.role === "user" ||
    entry.message.role === "assistant" ||
    entry.message.role === "toolResult" ||
    entry.message.role === "bashExecution"
  );
}

function hasSummarizableEntries(entries: SessionEntry[]): boolean {
  return entries.some(isSummarizableEntry);
}

function countSummarizableEntries(entries: SessionEntry[]): number {
  return entries.filter(isSummarizableEntry).length;
}

function findCompactionStartIndex(entries: SessionEntry[], endIndexExclusive: number): number {
  for (let index = endIndexExclusive - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (!entry || entry.type !== "compaction") continue;

    const keptIndex = findEntryIndex(entries, entry.firstKeptEntryId);
    if (keptIndex !== -1 && keptIndex < endIndexExclusive) return keptIndex;
    return index + 1;
  }

  return 0;
}

function buildSelection(
  entries: SessionEntry[],
  cutIndex: number,
  usedFallbackCut: boolean,
): CompactionSelection | undefined {
  if (cutIndex <= 0 || cutIndex >= entries.length) return undefined;

  const startIndex = findCompactionStartIndex(entries, cutIndex);
  if (startIndex >= cutIndex) return undefined;

  const selectedEntries = entries.slice(startIndex, cutIndex);
  if (!hasSummarizableEntries(selectedEntries)) return undefined;

  return {
    entries: selectedEntries,
    cutIndex,
    firstKeptEntryId: entries[cutIndex]?.id ?? "",
    usedFallbackCut,
  };
}

function buildFallbackSelection(entries: SessionEntry[]): CompactionSelection | undefined {
  const startIndex = findCompactionStartIndex(entries, entries.length);
  const candidateEntries = entries.slice(startIndex);
  if (countSummarizableEntries(candidateEntries) < 3) return undefined;

  let lastUserIndex = -1;
  for (let index = entries.length - 1; index >= startIndex; index -= 1) {
    const entry = entries[index];
    if (entry?.type === "message" && entry.message.role === "user") {
      lastUserIndex = index;
      break;
    }
  }

  if (lastUserIndex <= startIndex) return undefined;
  return buildSelection(entries, lastUserIndex, true);
}

export function selectCompactionEntries(
  preparation: { firstKeptEntryId: string; messagesToSummarize?: unknown[] },
  branchEntries: SessionEntry[],
): CompactionSelection | undefined {
  const hasPreparedMessages =
    !Array.isArray(preparation.messagesToSummarize) || preparation.messagesToSummarize.length > 0;
  const preparedCutIndex = hasPreparedMessages
    ? findEntryIndex(branchEntries, preparation.firstKeptEntryId)
    : -1;
  const preparedSelection =
    preparedCutIndex !== -1 ? buildSelection(branchEntries, preparedCutIndex, false) : undefined;

  if (preparedSelection) return preparedSelection;
  return buildFallbackSelection(branchEntries);
}

export function selectTreeEntries(entriesToSummarize: SessionEntry[]): SessionEntry[] {
  const startIndex = findCompactionStartIndex(entriesToSummarize, entriesToSummarize.length);
  return entriesToSummarize.slice(startIndex);
}
