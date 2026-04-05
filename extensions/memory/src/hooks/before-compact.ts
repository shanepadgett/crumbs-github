import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MEMORY_DETAILS_VERSION, MEMORY_SYSTEM } from "../config.js";
import { selectCompactionEntries } from "../core/cut-policy.js";
import { buildMemory, readLatestMemorySnapshot } from "../core/memory-state.js";
import { renderSummary } from "../core/render-summary.js";
import type { MemoryDetails } from "../types.js";

export function registerBeforeCompactHook(pi: ExtensionAPI): void {
  pi.on("session_before_compact", async (event) => {
    const selection = selectCompactionEntries(event.preparation, event.branchEntries);
    if (!selection) return undefined;

    const previousSnapshot = readLatestMemorySnapshot(event.branchEntries, selection.cutIndex);
    const memory = buildMemory(selection.entries, {
      previousState: previousSnapshot?.state,
      fileOps: {
        read: event.preparation.fileOps.read,
        written: event.preparation.fileOps.written,
        edited: event.preparation.fileOps.edited,
      },
    });

    const summary = renderSummary(memory.state, { mode: "compaction" });
    const details: MemoryDetails = {
      system: MEMORY_SYSTEM,
      version: MEMORY_DETAILS_VERSION,
      source: "compaction",
      state: memory.state,
      sourceEntryCount: selection.entries.length,
      usedFallbackCut: selection.usedFallbackCut || undefined,
    };

    return {
      compaction: {
        summary,
        details,
        firstKeptEntryId: selection.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
      },
    };
  });
}
