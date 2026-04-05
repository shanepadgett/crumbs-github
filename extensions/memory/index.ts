/**
 * Memory Extension
 *
 * What it does:
 * - Replaces Pi compaction with deterministic local session memory.
 * - Adds `memory_recall` for exact history search on the current branch.
 * - Adds branch handoff summaries for `/tree` navigation.
 *
 * How to use it:
 * - Install this package with `pi install .` and keep the extension enabled.
 * - Let Pi compact normally, or run `/memory-compact`.
 * - Use `/memory-show` to inspect the latest stored memory summary.
 *
 * Example:
 * - Work through a long coding session, compact it, then ask Pi to use
 *   `memory_recall` when you need an exact old error, file path, or tool output.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerMemoryCommands } from "./src/commands.js";
import { registerBeforeCompactHook } from "./src/hooks/before-compact.js";
import { registerBeforeTreeHook } from "./src/hooks/before-tree.js";
import { registerMemoryRecallTool } from "./src/tools/memory-recall.js";

export default function memoryExtension(pi: ExtensionAPI) {
  registerBeforeCompactHook(pi);
  registerBeforeTreeHook(pi);
  registerMemoryRecallTool(pi);
  registerMemoryCommands(pi);
}
