import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { MEMORY_DETAILS_VERSION, MEMORY_SYSTEM } from "../config.js";
import { selectTreeEntries } from "../core/cut-policy.js";
import { buildMemory, readLatestMemorySnapshot } from "../core/memory-state.js";
import { renderSummary } from "../core/render-summary.js";
import type { MemoryDetails } from "../types.js";

export function registerBeforeTreeHook(pi: ExtensionAPI): void {
  pi.on("session_before_tree", async (event) => {
    if (!event.preparation.userWantsSummary) return undefined;

    const selectedEntries = selectTreeEntries(event.preparation.entriesToSummarize);
    if (selectedEntries.length === 0) return undefined;

    const previousSnapshot = readLatestMemorySnapshot(selectedEntries);
    const memory = buildMemory(selectedEntries, {
      previousState: previousSnapshot?.state,
    });

    const summary = renderSummary(memory.state, { mode: "branch" });
    const details: MemoryDetails = {
      system: MEMORY_SYSTEM,
      version: MEMORY_DETAILS_VERSION,
      source: "branch_summary",
      state: memory.state,
      sourceEntryCount: selectedEntries.length,
    };

    return {
      summary: {
        summary,
        details,
      },
    };
  });
}
