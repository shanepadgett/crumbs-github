import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { keyHint } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { DEFAULT_SEARCH_RESULT_LIMIT } from "../config.js";
import {
  renderExpandedRecall,
  renderRecentRecall,
  renderSearchResults,
} from "../core/render-recall.js";
import {
  buildRecallRecords,
  expandRecallRecords,
  loadRecallEntries,
  recentRecallRecords,
  searchRecallRecords,
} from "../core/search-history.js";

const MEMORY_RECALL_PARAMS = Type.Object({
  query: Type.Optional(
    Type.String({ description: "Search text for current-branch session history." }),
  ),
  expand: Type.Optional(
    Type.Array(Type.String(), {
      description: "Exact IDs from recall output, or raw branch entry IDs, to expand.",
    }),
  ),
  limit: Type.Optional(Type.Number({ description: "Maximum search results to return." })),
});

function firstNonEmptyLine(text: string): string {
  return (
    text
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) ?? ""
  );
}

function textContentFromResult(result: {
  content: Array<{ type: string; text?: string }>;
}): string {
  return result.content.find((item) => item.type === "text")?.text ?? "";
}

export function registerMemoryRecallTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "memory_recall",
    label: "Memory Recall",
    description:
      "Search session history on the current branch, including content that is no longer present in the compacted summary.",
    promptSnippet:
      "memory_recall: search current-branch session history and expand exact IDs returned by recall output.",
    promptGuidelines: [
      "Use memory_recall when you need exact prior errors, file paths, or tool output not present in the compacted summary.",
      "Use expand with IDs returned from a prior search to inspect full stored content.",
      "Raw branch entry IDs also work with expand.",
    ],
    parameters: MEMORY_RECALL_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionFile = ctx.sessionManager.getSessionFile();
      const entries = sessionFile
        ? loadRecallEntries(sessionFile, ctx.sessionManager.getLeafId())
        : ctx.sessionManager.getBranch();
      const records = buildRecallRecords(entries);

      if (params.expand && params.expand.length > 0) {
        const expanded = expandRecallRecords(records, params.expand);
        return {
          content: [{ type: "text", text: renderExpandedRecall(expanded) }],
          details: undefined,
        };
      }

      const query = params.query?.trim();
      if (!query) {
        const recent = recentRecallRecords(
          records,
          Math.max(1, Math.floor(params.limit ?? DEFAULT_SEARCH_RESULT_LIMIT)),
        );
        return {
          content: [{ type: "text", text: renderRecentRecall(recent) }],
          details: undefined,
        };
      }

      const limit = Math.max(
        1,
        Math.min(25, Math.floor(params.limit ?? DEFAULT_SEARCH_RESULT_LIMIT)),
      );
      const hits = searchRecallRecords(records, query, limit);
      return {
        content: [{ type: "text", text: renderSearchResults(query, hits) }],
        details: undefined,
      };
    },
    renderCall(args, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);

      let line = theme.fg("toolTitle", theme.bold("memory_recall "));
      if (Array.isArray(args.expand) && args.expand.length > 0) {
        line += theme.fg("accent", `expand ${args.expand.length}`);
        line += theme.fg("muted", args.expand.length === 1 ? " id" : " ids");
      } else if (typeof args.query === "string" && args.query.trim()) {
        line += theme.fg("muted", "query ");
        line += theme.fg("accent", `"${args.query.trim()}"`);
      } else {
        const limit = Math.max(1, Math.floor(args.limit ?? DEFAULT_SEARCH_RESULT_LIMIT));
        line += theme.fg("muted", `recent ${limit}`);
      }

      text.setText(line);
      return text;
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      const text = (context.lastComponent as Text | undefined) ?? new Text("", 0, 0);

      if (isPartial) {
        text.setText(theme.fg("warning", "Searching session history..."));
        return text;
      }

      const output = textContentFromResult(result);
      if (!output) {
        text.setText("");
        return text;
      }

      if (!expanded) {
        const summary = firstNonEmptyLine(output);
        const hasMore = output.includes("\n");
        const hint = hasMore
          ? ` ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`
          : "";
        text.setText(theme.fg(summary.startsWith("No ") ? "dim" : "muted", summary) + hint);
        return text;
      }

      const lines = output.split("\n");
      const rendered = lines
        .map((line, index) => {
          if (!line) return "";
          return theme.fg(index === 0 ? "muted" : "toolOutput", line);
        })
        .join("\n");
      text.setText(rendered);
      return text;
    },
  });
}
