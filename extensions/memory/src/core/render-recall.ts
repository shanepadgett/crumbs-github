import type { RecallRecord, SearchHit } from "../types.js";

function formatFileHints(files: string[]): string {
  if (files.length === 0) return "";

  const visible = files.slice(0, 3);
  const remainder = files.length - visible.length;
  const remainderSuffix = remainder > 0 ? `, +${remainder} more` : "";
  return ` files: ${visible.join(", ")}${remainderSuffix}`;
}

function recordHeader(record: RecallRecord): string {
  const fileSuffix = formatFileHints(record.files);
  const toolSuffix = record.toolName ? ` tool: ${record.toolName}` : "";
  return `${record.id} [${record.role}]${toolSuffix}${fileSuffix}`;
}

export function renderRecentRecall(records: RecallRecord[]): string {
  if (records.length === 0) return "No history on the current branch.";

  const lines = records.map((record) => `- ${recordHeader(record)}\n  ${record.summary}`);
  return `Recent history (${records.length} entries)\nUse expand with the IDs shown below to inspect exact stored content.\n\n${lines.join("\n\n")}`;
}

export function renderSearchResults(query: string, hits: SearchHit[]): string {
  if (hits.length === 0) return `No matches for "${query}" on the current branch.`;

  const lines = hits.map((hit) => `- ${recordHeader(hit.record)}\n  ${hit.snippet}`);
  return `Found ${hits.length} match${hits.length === 1 ? "" : "es"} for "${query}"\nUse expand with the IDs shown below to inspect exact stored content.\n\n${lines.join("\n\n")}`;
}

export function renderExpandedRecall(records: RecallRecord[]): string {
  if (records.length === 0) return "No matching entry IDs were found on the current branch.";

  const blocks = records.map((record) => `## ${recordHeader(record)}\n\n${record.fullText}`.trim());
  return `Expanded history (${records.length} entries)\n\n${blocks.join("\n\n")}`;
}
