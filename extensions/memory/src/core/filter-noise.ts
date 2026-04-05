import type { NormalizedBlock } from "../types.js";
import { collapseWhitespace } from "./text.js";

const NOISE_TOOLS = new Set(["todoread", "todowrite", "askuser", "exitspecmode"]);
const XML_WRAPPER_RE =
  /<(system-reminder|ide_opened_file|command-message|context-window-usage)[^>]*>[\s\S]*?<\/\1>/g;

function cleanText(text: string): string {
  return collapseWhitespace(text.replace(XML_WRAPPER_RE, " "));
}

export function filterNoise(blocks: NormalizedBlock[]): NormalizedBlock[] {
  const filtered: NormalizedBlock[] = [];

  for (const block of blocks) {
    if (block.kind === "user" || block.kind === "assistant") {
      const text = cleanText(block.text);
      if (!text) continue;
      filtered.push({ ...block, text });
      continue;
    }

    if (block.kind === "tool_call" || block.kind === "tool_result") {
      if (NOISE_TOOLS.has(block.name.toLowerCase()) && !("isError" in block && block.isError)) {
        continue;
      }
      filtered.push(block);
      continue;
    }

    filtered.push(block);
  }

  return filtered;
}
